"use strict";

/*
  CLOUD-ZEN — private personal cloud
  Storage: Telegram MTProto user account (hidden from the UI)

  Important operational note:
  - The browser uploads chunks to this server. If the browser/tab is fully
    closed before all chunks reach the server, the browser can cancel the
    remaining requests. No web app can guarantee continued transfer of bytes
    that the browser has stopped sending.
  - Render Free services have an ephemeral filesystem and may spin down after
    15 minutes without inbound traffic. We therefore keep only one temporary
    chunk on disk and persist the actual file data in Telegram. The service
    can cold-start again and rebuild its index from Telegram.
*/

const express = require("express");
const path = require("path");
const crypto = require("crypto");
const fs = require("fs");
const fsp = fs.promises;
const os = require("os");
const { once } = require("events");
const { Readable } = require("stream");
const archiver = require("archiver");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT || 10000);
const HOST = "0.0.0.0";
const PUBLIC_DIR = path.join(__dirname, "public");
const TMP_DIR = path.join(os.tmpdir(), "cloud-zen");

/* =========================
   ENVIRONMENT / SECRETS
========================= */
const APP_PASSWORD = String(process.env.APP_PASSWORD ?? "").trim();
const UPLOAD_PASSWORD = String(process.env.UPLOAD_PASSWORD ?? "").trim();
const DOWNLOAD_PASSWORD = String(process.env.DOWNLOAD_PASSWORD ?? "").trim();
const SESSION_SECRET = String(process.env.SESSION_SECRET ?? "").trim();
const TELEGRAM_API_ID = Number(process.env.TELEGRAM_API_ID || 0);
const TELEGRAM_API_HASH = String(process.env.TELEGRAM_API_HASH || "").trim();
const TELEGRAM_SESSION = String(process.env.TELEGRAM_SESSION || "").trim();
const TELEGRAM_STORAGE_CHAT = String(process.env.TELEGRAM_STORAGE_CHAT || "me").trim();

const CHUNK_SIZE = Math.max(
  4 * 1024 * 1024,
  Math.min(Number(process.env.CHUNK_SIZE || 64 * 1024 * 1024), 512 * 1024 * 1024)
);
const MAX_FILE_SIZE = Number(process.env.MAX_FILE_SIZE || 20 * 1024 * 1024 * 1024 * 1024);
const MAX_CHUNKS = 100000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEVICE_LOCK_MS = 24 * 60 * 60 * 1000;
const MAX_LOGIN_FAILURES = 3;

if (!APP_PASSWORD || !UPLOAD_PASSWORD || !DOWNLOAD_PASSWORD || !SESSION_SECRET) {
  console.warn("[Cloud-Zen] APP_PASSWORD, UPLOAD_PASSWORD, DOWNLOAD_PASSWORD and SESSION_SECRET must be set in Render.");
}
if (!TELEGRAM_API_ID || !TELEGRAM_API_HASH || !TELEGRAM_SESSION) {
  console.warn("[Cloud-Zen] Telegram MTProto credentials are not fully configured.");
}

/* =========================
   BODY / STATIC
========================= */
app.use(express.json({ limit: "1mb" }));
app.use(express.static(PUBLIC_DIR, {
  extensions: ["html"],
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
  }
}));

/* =========================
   TELEGRAM CLIENT
========================= */
let telegramClient = null;
let telegramReady = false;
let telegramInitPromise = null;
let telegramLastError = null;

async function getTelegramClient() {
  if (telegramClient && telegramReady) return telegramClient;
  if (telegramInitPromise) return telegramInitPromise;

  telegramInitPromise = (async () => {
    if (!TELEGRAM_API_ID || !TELEGRAM_API_HASH || !TELEGRAM_SESSION) {
      throw new Error("Telegram storage is not configured. Set TELEGRAM_API_ID, TELEGRAM_API_HASH and TELEGRAM_SESSION.");
    }

    const { TelegramClient } = await import("teleproto");
    const { StringSession } = await import("teleproto/sessions/index.js");

    const session = new StringSession(TELEGRAM_SESSION);
    const client = new TelegramClient(session, TELEGRAM_API_ID, TELEGRAM_API_HASH, {
      connectionRetries: 5,
      retryDelay: 1000,
      autoReconnect: true,
      requestRetries: 5,
      downloadPool: {
        poolSize: 4,
        workers: 8,
        requestDeadlineMs: 30000
      }
    });

    await client.connect();
    const me = await client.getMe();
    if (!me) throw new Error("Telegram account session could not be verified.");

    telegramClient = client;
    telegramReady = true;
    telegramLastError = null;
    console.log("[Cloud-Zen] Storage connection: READY");
    return client;
  })();

  try {
    return await telegramInitPromise;
  } catch (error) {
    telegramReady = false;
    telegramLastError = error?.message || String(error);
    console.error("[Cloud-Zen] Telegram connection error:", telegramLastError);
    throw error;
  } finally {
    telegramInitPromise = null;
  }
}

/* =========================
   AUTH / DEVICE LOCK
========================= */
const authFailures = new Map();
const deviceLocks = new Map();

function b64url(value) {
  return Buffer.from(String(value)).toString("base64url");
}

function signPayload(payload) {
  if (!SESSION_SECRET) throw new Error("SESSION_SECRET is not configured.");
  const body = b64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyPayload(token) {
  if (!SESSION_SECRET || !token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;
  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch (_) {
    return null;
  }
  if (!payload || !Number.isFinite(Number(payload.exp)) || Number(payload.exp) <= Date.now()) return null;
  return payload;
}

function createActionToken(kind) {
  return signPayload({
    type: "action",
    kind,
    exp: Date.now() + 15 * 60 * 1000
  });
}

function validActionToken(token, kind) {
  const record = verifyPayload(token);
  return Boolean(
    record &&
    record.type === "action" &&
    record.kind === kind
  );
}

function actionCookie(req, kind) {
  const cookie = String(req.headers.cookie || "");
  const name = kind === "upload" ? "cloud_zen_upload_access" : "cloud_zen_download_access";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function hashSecret(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function deviceKey(req) {
  const existing = req.headers["x-cloud-device"];
  const ua = String(req.headers["user-agent"] || "unknown");
  return hashSecret(`${clientIp(req)}|${ua}|${existing || ""}`).slice(0, 64);
}

function lockKey(req, area) {
  return `${area}:${deviceKey(req)}`;
}

function isLocked(req, area) {
  const key = lockKey(req, area);
  const until = deviceLocks.get(key) || 0;
  if (until > Date.now()) return true;
  deviceLocks.delete(key);
  return false;
}

function registerFailure(req, area) {
  const key = lockKey(req, area);
  const current = authFailures.get(key) || { count: 0, at: Date.now() };
  current.count += 1;
  current.at = Date.now();
  authFailures.set(key, current);
  if (current.count >= MAX_LOGIN_FAILURES) {
    deviceLocks.set(key, Date.now() + DEVICE_LOCK_MS);
    authFailures.delete(key);
    return true;
  }
  return false;
}

function clearFailures(req, area) {
  authFailures.delete(lockKey(req, area));
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function createSession() {
  return signPayload({
    type: "session",
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS
  });
}

function getSession(req) {
  const cookie = String(req.headers.cookie || "");
  const match = cookie.match(/(?:^|;\s*)cloud_zen_session=([^;]+)/);
  if (!match) return null;
  const session = verifyPayload(decodeURIComponent(match[1]));
  if (!session || session.type !== "session") return null;
  return session;
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: "Authentication required" });
  req.cloudSession = session;
  next();
}

function requireUploadPassword(req, res, next) {
  if (isLocked(req, "upload")) return res.status(423).json({ error: "Upload access is locked for 24 hours on this device." });
  if (!validActionToken(actionCookie(req, "upload"), "upload")) {
    return res.status(403).json({ error: "Upload access is locked until you enter the upload password." });
  }
  req.cloudSession.uploadOk = true;
  next();
}

function requireDownloadPassword(req, res, next) {
  if (isLocked(req, "download")) return res.status(423).json({ error: "Download access is locked for 24 hours on this device." });
  if (!validActionToken(actionCookie(req, "download"), "download")) {
    return res.status(403).json({ error: "Download access is locked until you enter the download password." });
  }
  req.cloudSession.downloadOk = true;
  next();
}

async function grantActionAccess(req, res, kind) {
  if (isLocked(req, kind)) return res.status(423).json({ error: `${kind[0].toUpperCase() + kind.slice(1)} access is locked for 24 hours on this device.` });
  const expected = kind === "upload" ? UPLOAD_PASSWORD : DOWNLOAD_PASSWORD;
  const password = String(req.body?.password ?? "").trim();
  // Compatibility: APP_PASSWORD can also unlock upload/download. This prevents
  // an accidental mismatch when the owner uses one security password for the
  // whole private cloud. Dedicated UPLOAD_PASSWORD/DOWNLOAD_PASSWORD still
  // work and remain preferred when configured.
  const accepted = [expected, APP_PASSWORD].filter(Boolean);
  if (!accepted.some(candidate => safeEqual(password, candidate))) {
    const locked = registerFailure(req, kind);
    return res.status(locked ? 423 : 403).json({ error: locked ? `${kind[0].toUpperCase() + kind.slice(1)} access locked for 24 hours.` : "Incorrect security password." });
  }
  clearFailures(req, kind);
  const token = createActionToken(kind);
  const cookieName = kind === "upload" ? "cloud_zen_upload_access" : "cloud_zen_download_access";
  const secure = process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", [
    `${cookieName}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=900",
    secure ? "Secure" : ""
  ].filter(Boolean).join("; "));
  return res.json({ ok: true, expiresIn: 900 });
}

app.post("/api/access/upload", requireAuth, (req, res) => grantActionAccess(req, res, "upload"));
app.post("/api/access/download", requireAuth, (req, res) => grantActionAccess(req, res, "download"));

app.post("/api/auth/login", (req, res) => {
  if (isLocked(req, "login")) return res.status(423).json({ error: "Access locked for 24 hours on this device." });
  const password = String(req.body?.password ?? "").trim();
  if (!safeEqual(password, APP_PASSWORD)) {
    const locked = registerFailure(req, "login");
    return res.status(locked ? 423 : 401).json({ error: locked ? "Access locked for 24 hours." : "Incorrect password" });
  }
  clearFailures(req, "login");
  const token = createSession();
  const secure = process.env.NODE_ENV === "production";
  res.setHeader("Set-Cookie", [
    `cloud_zen_session=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : ""
  ].filter(Boolean).join("; "));
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ authenticated: Boolean(getSession(req)) });
});

app.post("/api/auth/logout", (req, res) => {
  const cookie = String(req.headers.cookie || "");
  res.setHeader("Set-Cookie", [
    "cloud_zen_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    "cloud_zen_upload_access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    "cloud_zen_download_access=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  ]);
  res.json({ ok: true });
});

/* =========================
   UTILS
========================= */
function cleanName(value) {
  return path.basename(String(value || "file")).replace(/[\\u0000]/g, "").trim().slice(0, 240) || "file";
}

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let value = n;
  let i = -1;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[i]}`;
}

function mimeFor(name) {
  const ext = path.extname(name).toLowerCase();
  const map = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".wav": "audio/wav",
    ".pdf": "application/pdf", ".zip": "application/zip", ".json": "application/json", ".txt": "text/plain",
    ".html": "text/html", ".css": "text/css", ".js": "text/javascript"
  };
  return map[ext] || "application/octet-stream";
}

function newId() {
  return crypto.randomUUID();
}

function captionFor(meta, index, sha256) {
  return [
    "CZ1",
    "CHUNK",
    meta.id,
    String(index),
    String(meta.total),
    String(meta.size),
    Buffer.from(meta.name, "utf8").toString("base64url"),
    sha256
  ].join("|");
}

function parseChunkCaption(text) {
  const parts = String(text || "").split("|");
  if (parts.length < 8 || parts[0] !== "CZ1" || parts[1] !== "CHUNK") return null;
  const [_, __, id, index, total, size, encodedName, sha256] = parts;
  try {
    return {
      kind: "chunk",
      id,
      index: Number(index),
      total: Number(total),
      size: Number(size),
      name: Buffer.from(encodedName, "base64url").toString("utf8"),
      sha256
    };
  } catch (_) { return null; }
}

/* =========================
   INDEX / FILE DISCOVERY
========================= */
let fileIndex = new Map();
let indexLoaded = false;
let indexPromise = null;

async function rebuildIndex(force = false) {
  if (indexPromise && !force) return indexPromise;
  if (indexLoaded && !force) return fileIndex;

  indexPromise = (async () => {
    const client = await getTelegramClient();
    const grouped = new Map();

    // Telegram history is the durable index. Only messages with our CZ1
    // marker are considered storage records.
    for await (const message of client.iterMessages(TELEGRAM_STORAGE_CHAT, { limit: 0 })) {
      const parsed = parseChunkCaption(message?.message || message?.text || "");
      if (!parsed || !Number.isInteger(parsed.index) || parsed.index < 0) continue;
      if (!message.id) continue;
      if (!grouped.has(parsed.id)) grouped.set(parsed.id, { ...parsed, chunks: new Map(), complete: false });
      const entry = grouped.get(parsed.id);
      entry.chunks.set(parsed.index, {
        messageId: Number(message.id),
        index: parsed.index,
        size: parsed.size,
        sha256: parsed.sha256
      });
      entry.name = parsed.name;
      entry.total = parsed.total;
      entry.size = parsed.size;
    }

    const next = new Map();
    for (const [id, entry] of grouped) {
      const complete = entry.total > 0 && entry.chunks.size === entry.total;
      if (complete) {
        let totalBytes = 0;
        for (const chunk of entry.chunks.values()) totalBytes += Number(chunk.size || 0);
        if (totalBytes === entry.size) {
          next.set(entry.name, {
            id,
            name: entry.name,
            size: entry.size,
            total: entry.total,
            chunks: entry.chunks,
            modified: null
          });
        }
      }
    }

    fileIndex = next;
    indexLoaded = true;
    return fileIndex;
  })();

  try { return await indexPromise; }
  finally { indexPromise = null; }
}

function publicFile(meta) {
  return {
    name: meta.name,
    size: meta.size,
    sizeText: formatBytes(meta.size),
    modified: meta.modified || null,
    type: mimeFor(meta.name),
    storage: "CLOUD",
    storageLabel: "Cloud Storage",
    chunks: meta.total
  };
}

/* =========================
   STORAGE STATUS
========================= */
app.get("/api/health", async (req, res) => {
  try {
    await getTelegramClient();
    res.json({
      success: true,
      status: "online",
      storage: "Cloud Storage",
      persistent: true,
      multipart: true,
      telegram: { configured: true, connected: telegramReady }
    });
  } catch (error) {
    res.status(503).json({ success: false, status: "degraded", storage: "Cloud Storage", error: error.message });
  }
});

app.get("/api/storage", requireAuth, async (req, res) => {
  try {
    const index = await rebuildIndex();
    let used = 0;
    for (const file of index.values()) used += Number(file.size || 0);
    // Telegram's overall cloud storage is not exposed as a numeric quota by
    // the API, so the UI intentionally reports logical usage, not a fake quota.
    res.json({
      usedBytes: used,
      usedText: formatBytes(used),
      remainingBytes: null,
      remainingText: "Telegram cloud",
      usedPercent: 0,
      limitText: "Cloud",
      provider: { configured: telegramReady, connected: telegramReady, usedText: formatBytes(used), remainingText: "Cloud" }
    });
  } catch (error) {
    res.status(503).json({ error: error.message });
  }
});

/* =========================
   FILE LIST
========================= */
app.get("/api/files", requireAuth, async (req, res) => {
  try {
    const index = await rebuildIndex();
    res.json([...index.values()].map(publicFile).sort((a, b) => a.name.localeCompare(b.name)));
  } catch (error) {
    console.error("FILE LIST ERROR:", error);
    res.status(503).json({ error: "Storage index unavailable" });
  }
});

/* =========================
   UPLOAD CHUNK
========================= */
const activeUploads = new Map();

app.post("/api/upload-chunk", requireAuth, requireUploadPassword, async (req, res) => {
  const id = String(req.query.id || "");
  const index = Number(req.query.index);
  const total = Number(req.query.total);
  const size = Number(req.query.size);
  const name = cleanName(req.query.name);

  if (!/^[a-f0-9-]{20,80}$/i.test(id)) return res.status(400).json({ error: "Invalid upload ID" });
  if (!Number.isInteger(index) || index < 0 || !Number.isInteger(total) || total < 1 || total > MAX_CHUNKS || index >= total) return res.status(400).json({ error: "Invalid chunk information" });
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE_SIZE) return res.status(400).json({ error: "Invalid file size" });

  const expectedStart = index * CHUNK_SIZE;
  const expectedEnd = Math.min(size, expectedStart + CHUNK_SIZE);
  const expectedSize = expectedEnd - expectedStart;
  if (expectedSize <= 0) return res.status(400).json({ error: "Invalid chunk range" });

  const received = Number(req.headers["content-length"] || 0);
  if (received && received !== expectedSize) return res.status(400).json({ error: `Expected ${expectedSize} bytes, received ${received}` });

  const uploadKey = id;
  if (!activeUploads.has(uploadKey)) activeUploads.set(uploadKey, new Map());
  const state = activeUploads.get(uploadKey);
  if (state.has(index)) return res.json({ ok: true, done: state.size === total, part: index + 1, total, duplicate: true });

  const tmp = path.join(TMP_DIR, `${id}-${index}-${crypto.randomBytes(6).toString("hex")}.part`);
  await fsp.mkdir(TMP_DIR, { recursive: true });

  try {
    const out = fs.createWriteStream(tmp, { flags: "wx" });
    let bytes = 0;
    const hash = crypto.createHash("sha256");
    req.on("data", chunk => {
      bytes += chunk.length;
      hash.update(chunk);
    });
    req.pipe(out);
    await once(out, "close");

    if (bytes !== expectedSize) throw new Error(`Chunk size mismatch: expected ${expectedSize}, got ${bytes}`);
    const sha256 = hash.digest("hex");

    const client = await getTelegramClient();
    const meta = {
      id,
      name,
      size,
      total
    };

    let message;
    try {
      message = await client.sendFile(TELEGRAM_STORAGE_CHAT, {
        file: tmp,
        caption: captionFor(meta, index, sha256),
        forceDocument: true,
        workers: Math.max(1, Math.min(Number(process.env.TELEGRAM_WORKERS || 8), 16)),
        progressCallback: () => {}
      });
    } catch (error) {
      // If Telegram rate-limits the request, leave no local data behind.
      throw error;
    }

    state.set(index, {
      messageId: Number(message?.id),
      index,
      size: expectedSize,
      sha256
    });

    // Keep only metadata in memory; the durable copy is Telegram itself.
    try { await fsp.unlink(tmp); } catch (_) {}

    const done = state.size === total;
    if (done) {
      fileIndex.set(name, {
        id,
        name,
        size,
        total,
        chunks: new Map(state),
        modified: new Date().toISOString()
      });
      indexLoaded = true;
      activeUploads.delete(uploadKey);
    }

    return res.json({
      ok: true,
      done,
      part: index + 1,
      total,
      name,
      size,
      sha256
    });
  } catch (error) {
    try { await fsp.unlink(tmp); } catch (_) {}
    console.error("UPLOAD CHUNK ERROR:", error);
    return res.status(error?.statusCode || 500).json({ error: error.message || "Upload failed" });
  }
});

/* =========================
   CANCEL UPLOAD
========================= */
app.delete("/api/upload/:id", requireAuth, requireUploadPassword, async (req, res) => {
  const id = String(req.params.id || "");
  const state = activeUploads.get(id);
  try {
    if (state) {
      const client = await getTelegramClient();
      const ids = [...state.values()].map(v => Number(v.messageId)).filter(Boolean);
      if (ids.length) await deleteTelegramMessages(ids);
    }
  } catch (error) {
    console.warn("CANCEL UPLOAD CLEANUP WARNING:", error.message);
  }
  activeUploads.delete(id);
  res.json({ ok: true });
});

/* =========================
   FILE RESOLUTION
========================= */
async function findFile(name) {
  const clean = cleanName(name);
  const index = await rebuildIndex();
  return index.get(clean) || null;
}

async function deleteTelegramMessages(ids) {
  const client = await getTelegramClient();
  const cleanIds = ids.map(Number).filter(Boolean);
  for (let i = 0; i < cleanIds.length; i += 100) {
    await client.deleteMessages(TELEGRAM_STORAGE_CHAT, cleanIds.slice(i, i + 100), { revoke: true });
  }
}

async function downloadChunkToFile(messageId, target) {
  const client = await getTelegramClient();
  const messages = await client.getMessages(TELEGRAM_STORAGE_CHAT, { ids: [Number(messageId)] });
  const message = Array.isArray(messages) ? messages[0] : messages;
  if (!message) throw new Error("Stored chunk not found");
  await client.downloadMedia(message, { outputFile: target });
  return target;
}

async function streamFileToResponse(req, res, meta, inline) {
  const rangeHeader = String(req.headers.range || "");
  const totalSize = Number(meta.size);

  let start = 0;
  let end = totalSize - 1;
  let partial = false;

  const rangeMatch = rangeHeader.match(/^bytes=(\\d*)-(\\d*)$/);
  if (rangeMatch) {
    if (rangeMatch[1] !== "") start = Number(rangeMatch[1]);
    if (rangeMatch[2] !== "") end = Number(rangeMatch[2]);
    if (rangeMatch[1] === "" && rangeMatch[2] !== "") {
      const suffix = Number(rangeMatch[2]);
      start = Math.max(0, totalSize - suffix);
      end = totalSize - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= totalSize) {
      res.status(416).setHeader("Content-Range", `bytes */${totalSize}`).end();
      return;
    }
    end = Math.min(end, totalSize - 1);
    partial = true;
  }

  const firstChunk = Math.floor(start / CHUNK_SIZE);
  const lastChunk = Math.floor(end / CHUNK_SIZE);

  res.status(partial ? 206 : 200);
  res.setHeader("Content-Type", mimeFor(meta.name));
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(meta.name)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Length", String(end - start + 1));
  if (partial) res.setHeader("Content-Range", `bytes ${start}-${end}/${totalSize}`);

  const tempFiles = [];
  try {
    for (let i = firstChunk; i <= lastChunk; i += 1) {
      if (res.destroyed) return;
      const chunk = meta.chunks.get(i);
      if (!chunk) throw new Error(`Stored chunk ${i + 1} is missing`);
      const target = path.join(TMP_DIR, `dl-${meta.id}-${i}-${crypto.randomBytes(4).toString("hex")}.part`);
      tempFiles.push(target);
      await downloadChunkToFile(chunk.messageId, target);

      const stat = await fsp.stat(target);
      const expected = i === meta.total - 1 ? totalSize - i * CHUNK_SIZE : CHUNK_SIZE;
      if (stat.size !== expected) throw new Error(`Stored chunk ${i + 1} size mismatch`);

      const chunkStart = i * CHUNK_SIZE;
      const localStart = Math.max(0, start - chunkStart);
      const localEnd = Math.min(stat.size - 1, end - chunkStart);
      const input = fs.createReadStream(target, { start: localStart, end: localEnd });
      input.pipe(res, { end: false });
      await once(input, "end");
      input.destroy();
    }
    if (!res.writableEnded) res.end();
  } catch (error) {
    console.error("DOWNLOAD STREAM ERROR:", error);
    if (!res.headersSent) res.status(500).send("Download failed");
    else res.destroy(error);
  } finally {
    for (const f of tempFiles) { try { await fsp.unlink(f); } catch (_) {} }
  }
}

/* =========================
   STREAM / DOWNLOAD
========================= */
app.get(/^\/api\/stream\/(.+)$/, requireAuth, requireDownloadPassword, async (req, res) => {
  try {
    const name = decodeURIComponent(req.params[0]);
    const file = await findFile(name);
    if (!file) return res.status(404).send("File not found");
    await streamFileToResponse(req, res, file, true);
  } catch (error) {
    if (!res.headersSent) res.status(500).send(error.message || "File not found");
    else res.destroy(error);
  }
});

app.get(/^\/api\/download\/(.+)$/, requireAuth, requireDownloadPassword, async (req, res) => {
  try {
    const name = decodeURIComponent(req.params[0]);
    const file = await findFile(name);
    if (!file) return res.status(404).send("File not found");
    await streamFileToResponse(req, res, file, false);
  } catch (error) {
    if (!res.headersSent) res.status(500).send(error.message || "Download failed");
    else res.destroy(error);
  }
});

/* =========================
   DELETE
========================= */
app.delete("/api/files", requireAuth, requireUploadPassword, async (req, res) => {
  try {
    const name = cleanName(req.body?.name);
    const file = await findFile(name);
    if (!file) return res.status(404).json({ error: "File not found" });

    const client = await getTelegramClient();
    const ids = [...file.chunks.values()].map(c => Number(c.messageId)).filter(Boolean);
    if (ids.length) await deleteTelegramMessages(ids);

    fileIndex.delete(name);
    res.json({ ok: true, name, message: "File permanently deleted" });
  } catch (error) {
    console.error("DELETE ERROR:", error);
    res.status(500).json({ error: error.message || "Delete failed" });
  }
});

/* =========================
   DOWNLOAD ALL
========================= */
async function archiveFileStream(meta) {
  return Readable.from((async function* () {
    await fsp.mkdir(TMP_DIR, { recursive: true });
    for (let i = 0; i < meta.total; i += 1) {
      const chunk = meta.chunks.get(i);
      if (!chunk) throw new Error(`Missing chunk ${i + 1}`);
      const temp = path.join(TMP_DIR, `zip-${meta.id}-${i}-${crypto.randomBytes(4).toString("hex")}.part`);
      try {
        await downloadChunkToFile(chunk.messageId, temp);
        const input = fs.createReadStream(temp);
        for await (const piece of input) yield piece;
      } finally {
        try { await fsp.unlink(temp); } catch (_) {}
      }
    }
  })());
}

app.get("/api/download-all", requireAuth, requireDownloadPassword, async (req, res) => {
  let archive = null;
  try {
    const index = await rebuildIndex();
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''Cloud-Zen-All-Files.zip");
    res.setHeader("Cache-Control", "private, no-store");

    archive = archiver("zip", { zlib: { level: 0 } });
    archive.on("error", error => { if (!res.destroyed) res.destroy(error); });
    archive.pipe(res);

    for (const file of index.values()) {
      if (res.destroyed) break;
      const stream = await archiveFileStream(file);
      archive.append(stream, { name: file.name });
    }
    await archive.finalize();
  } catch (error) {
    if (archive) { try { archive.abort(); } catch (_) {} }
    if (!res.headersSent) res.status(500).json({ error: error.message || "Could not create archive" });
    else res.destroy(error);
  }
});

/* =========================
   ROOT / 404
========================= */
app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

app.use((err, req, res, next) => {
  console.error("UNHANDLED ERROR:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal server error" });
});

/* =========================
   GRACEFUL SHUTDOWN
========================= */
async function shutdown(signal) {
  console.log(`[Cloud-Zen] ${signal} received.`);
  try { if (telegramClient) await telegramClient.disconnect(); } catch (_) {}
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

app.listen(PORT, HOST, () => {
  console.log(`[Cloud-Zen] Server running on ${HOST}:${PORT}`);
  console.log(`[Cloud-Zen] Chunk size: ${formatBytes(CHUNK_SIZE)}`);
});
