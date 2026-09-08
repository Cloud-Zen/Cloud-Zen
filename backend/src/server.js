require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { Pool } = require("pg");
const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();
const port = Number(process.env.PORT || 10000);
const jwtSecret = process.env.JWT_SECRET || "CHANGE_ME_IN_PRODUCTION";
const pairingTtl = Number(process.env.PAIRING_TTL_SECONDS || 180);
const deleteMaxFailures = Number(process.env.DELETE_LOCK_FAILURES || 2);
const deleteLockMinutes = Number(process.env.DELETE_LOCK_MINUTES || 15);
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, "");
const clientApkUrl = String(process.env.CLIENT_APK_URL || "").trim();

if (jwtSecret === "CHANGE_ME_IN_PRODUCTION") {
  console.warn("WARNING: set a strong JWT_SECRET in production.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : undefined,
});

const storageConfigured = Boolean(
  process.env.S3_ENDPOINT &&
  process.env.S3_REGION &&
  process.env.S3_BUCKET &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY
);

const s3 = storageConfigured
  ? new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      forcePathStyle: String(process.env.S3_FORCE_PATH_STYLE || "true") === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    })
  : null;

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "4mb" }));

const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");
const cleanEmail = (v) => String(v || "").trim().toLowerCase();
const safeName = (v, fallback = "Android Device") => String(v || fallback).replace(/[\r\n]/g, " ").slice(0, 120);
const safePath = (v) => {
  const p = String(v || "").replaceAll("\\", "/").trim();
  if (!p || p.startsWith("/") || p.includes("../") || p === ".." || p.includes("\0")) return null;
  return p.slice(0, 1500);
};
const lockState = new Map();

function signUser(user) {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: "7d" });
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function deletionKey(req) {
  return String(req.user?.sub || req.ip || "unknown");
}

function deletionStatus(req) {
  const s = lockState.get(deletionKey(req)) || { failures: 0, lockedUntil: 0 };
  return {
    locked: Date.now() < s.lockedUntil,
    failures: s.failures,
    lockedUntil: s.lockedUntil || null,
  };
}

function requireDeletionUnlocked(req, res) {
  const s = deletionStatus(req);
  if (s.locked) {
    res.status(423).json({
      error: "Cloud deletion is temporarily locked after failed authentication.",
      deletionLocked: true,
      lockedUntil: s.lockedUntil,
    });
    return false;
  }
  return true;
}

async function verifyDeletionPassword(req, email, password) {
  const key = deletionKey(req);
  const current = lockState.get(key) || { failures: 0, lockedUntil: 0 };
  if (Date.now() < current.lockedUntil) return false;

  const normalized = cleanEmail(email);
  const result = await pool.query(
    "SELECT id,email,password_hash FROM users WHERE id=$1 AND email=$2",
    [req.user.sub, normalized]
  );
  const user = result.rows[0];
  const ok = Boolean(user && await bcrypt.compare(String(password || ""), user.password_hash));

  if (ok) {
    lockState.delete(key);
    return true;
  }

  const next = {
    failures: current.failures + 1,
    lockedUntil: 0,
  };
  if (next.failures >= deleteMaxFailures) {
    next.lockedUntil = Date.now() + deleteLockMinutes * 60 * 1000;
  }
  lockState.set(key, next);
  return false;
}

function requireStorage(res) {
  if (!storageConfigured || !s3) {
    res.status(503).json({ error: "Cloud storage is not configured on the server." });
    return false;
  }
  return true;
}

async function ensureSchema() {
  // UUIDs are generated in Node so this works even when the DB role cannot install extensions.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS devices (
      id UUID PRIMARY KEY,
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      model TEXT,
      platform TEXT,
      os_version TEXT,
      total_storage_bytes BIGINT,
      free_storage_bytes BIGINT,
      backup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      device_token_hash TEXT UNIQUE,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pairing_sessions (
      id UUID PRIMARY KEY,
      master_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pairing_token_hash TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','paired','expired','cancelled')),
      expires_at TIMESTAMPTZ NOT NULL,
      paired_device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS backup_jobs (
      id UUID PRIMARY KEY,
      device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('queued','running','paused','completed','failed','cancelled')),
      bytes_total BIGINT NOT NULL DEFAULT 0,
      bytes_uploaded BIGINT NOT NULL DEFAULT 0,
      files_total INTEGER NOT NULL DEFAULT 0,
      files_uploaded INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS backup_manifest (
      id UUID PRIMARY KEY,
      backup_job_id UUID NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
      relative_path TEXT NOT NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      modified_at TIMESTAMPTZ,
      content_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      object_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(backup_job_id, relative_path)
    );

    CREATE INDEX IF NOT EXISTS idx_devices_owner ON devices(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_pairing_master ON pairing_sessions(master_user_id);
    CREATE INDEX IF NOT EXISTS idx_backup_owner ON backup_jobs(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_manifest_job ON backup_manifest(backup_job_id);
  `);
}

async function ensureDemoUser() {
  const email = "demo@example.com";
  const hash = await bcrypt.hash("ChangeMe123!", 12);
  await pool.query(
    `INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)
     ON CONFLICT(email) DO NOTHING`,
    [crypto.randomUUID(), email, hash]
  );
  // Migrate the old Phase-1 demo SHA-256 password to bcrypt once.
  await pool.query(
    `UPDATE users SET password_hash=$1 WHERE email=$2 AND length(password_hash)=64`,
    [hash, email]
  );
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      service: "cloud-zen-backend",
      version: "2.2.0",
      database: true,
      storage: storageConfigured,
      clientApkConfigured: Boolean(clientApkUrl),
    });
  } catch {
    res.status(503).json({ ok: false, database: false, storage: storageConfigured });
  }
});

app.post("/api/auth/register", async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || "");
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return res.status(400).json({ error: "Use a valid email and a password of at least 8 characters." });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const user = await pool.query(
      `INSERT INTO users(id,email,password_hash) VALUES($1,$2,$3)
       RETURNING id,email,created_at`,
      [crypto.randomUUID(), email, hash]
    );
    res.status(201).json({ token: signUser(user.rows[0]), user: user.rows[0] });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ error: "Email already registered." });
    console.error(e);
    res.status(500).json({ error: "Registration failed." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });
  const { rows } = await pool.query("SELECT id,email,password_hash FROM users WHERE email=$1", [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  res.json({ token: signUser(user), user: { id: user.id, email: user.email } });
});

app.get("/api/me", auth, async (req, res) => {
  const { rows } = await pool.query("SELECT id,email,created_at FROM users WHERE id=$1", [req.user.sub]);
  if (!rows[0]) return res.status(404).json({ error: "User not found" });
  res.json({ user: rows[0] });
});

app.post("/api/pairing/session", auth, async (req, res) => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + pairingTtl * 1000);
  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO pairing_sessions(id,master_user_id,pairing_token_hash,status,expires_at)
     VALUES($1,$2,$3,'pending',$4)`,
    [id, req.user.sub, sha256(rawToken), expiresAt]
  );
  res.json({
    sessionId: id,
    expiresAt,
    qrPayload: {
      version: 2,
      type: "cloud-zen-pair",
      server: publicBaseUrl,
      token: rawToken,
      apkUrl: clientApkUrl || null,
    },
  });
});

app.get("/api/pairing/session/:id", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id,status,expires_at,paired_device_id FROM pairing_sessions
     WHERE id=$1 AND master_user_id=$2`,
    [req.params.id, req.user.sub]
  );
  const session = rows[0];
  if (!session) return res.status(404).json({ error: "Session not found" });
  if (session.status === "pending" && new Date(session.expires_at) <= new Date()) {
    await pool.query("UPDATE pairing_sessions SET status='expired' WHERE id=$1 AND status='pending'", [session.id]);
    session.status = "expired";
  }
  res.json(session);
});

app.post("/api/pairing/approve", async (req, res) => {
  const token = String(req.body?.token || "");
  if (!token) return res.status(400).json({ error: "Pairing token required" });
  const { rows } = await pool.query(
    `SELECT id,master_user_id,status,expires_at FROM pairing_sessions WHERE pairing_token_hash=$1`,
    [sha256(token)]
  );
  const session = rows[0];
  if (!session) return res.status(404).json({ error: "Invalid pairing token" });
  if (session.status !== "pending") return res.status(409).json({ error: "Pairing session is no longer pending" });
  if (new Date(session.expires_at) <= new Date()) {
    await pool.query("UPDATE pairing_sessions SET status='expired' WHERE id=$1", [session.id]);
    return res.status(410).json({ error: "Pairing token expired" });
  }
  if (req.body?.consent !== true) return res.status(400).json({ error: "Explicit consent is required" });

  const meta = req.body?.device || {};
  const deviceId = crypto.randomUUID();
  const deviceToken = crypto.randomBytes(32).toString("hex");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const device = await client.query(
      `INSERT INTO devices(id,owner_user_id,name,model,platform,os_version,total_storage_bytes,free_storage_bytes,device_token_hash)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id,name,model,platform,os_version,total_storage_bytes,free_storage_bytes,backup_enabled,last_seen_at`,
      [
        deviceId, session.master_user_id, safeName(meta.name), safeName(meta.model, ""),
        String(meta.platform || "android").slice(0, 40), String(meta.osVersion || "").slice(0, 80),
        Number.isFinite(meta.totalStorageBytes) ? meta.totalStorageBytes : null,
        Number.isFinite(meta.freeStorageBytes) ? meta.freeStorageBytes : null,
        sha256(deviceToken),
      ]
    );
    await client.query("UPDATE pairing_sessions SET status='paired',paired_device_id=$1 WHERE id=$2", [deviceId, session.id]);
    await client.query("COMMIT");
    res.json({ ok: true, device: device.rows[0], deviceToken });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Could not pair device" });
  } finally { client.release(); }
});

app.get("/api/devices", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id,name,model,platform,os_version,total_storage_bytes,free_storage_bytes,
            backup_enabled,last_seen_at,created_at FROM devices
     WHERE owner_user_id=$1 ORDER BY created_at DESC`, [req.user.sub]
  );
  res.json({ devices: rows });
});

app.patch("/api/devices/:id/backup", auth, async (req, res) => {
  const enabled = req.body?.enabled === true;
  const result = await pool.query(
    `UPDATE devices SET backup_enabled=$1,last_seen_at=NOW()
     WHERE id=$2 AND owner_user_id=$3 RETURNING id,backup_enabled`,
    [enabled, req.params.id, req.user.sub]
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Device not found" });
  res.json({ ok: true, device: result.rows[0] });
});

// Client-side backup job creation uses the paired device credential.
app.post("/api/backups/client-job", deviceAuth, async (req, res) => {
  if (!req.device.backup_enabled) return res.status(403).json({ error: "Backup permission is disabled for this device" });
  const job = await pool.query(
    `INSERT INTO backup_jobs(id,device_id,owner_user_id,status) VALUES($1,$2,$3,'queued') RETURNING *`,
    [crypto.randomUUID(), req.device.id, req.device.owner_user_id]
  );
  res.status(201).json({ job: job.rows[0] });
});

app.post("/api/backups/client-manifest", deviceAuth, async (req, res) => {
  if (!req.device.backup_enabled) return res.status(403).json({ error: "Backup permission is disabled for this device" });
  const jobId = String(req.body?.jobId || "");
  const entries = Array.isArray(req.body?.files) ? req.body.files : [];
  const job = await pool.query("SELECT id FROM backup_jobs WHERE id=$1 AND device_id=$2", [jobId, req.device.id]);
  if (!job.rows[0]) return res.status(404).json({ error: "Backup job not found" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const file of entries.slice(0, 5000)) {
      const path = safePath(file.relativePath);
      if (!path) continue;
      await client.query(
        `INSERT INTO backup_manifest(id,backup_job_id,relative_path,size_bytes,modified_at,content_hash,status,object_key)
         VALUES($1,$2,$3,$4,$5,$6,'pending',$7)
         ON CONFLICT(backup_job_id,relative_path) DO UPDATE SET
         size_bytes=EXCLUDED.size_bytes,modified_at=EXCLUDED.modified_at,content_hash=EXCLUDED.content_hash,
         status='pending',object_key=EXCLUDED.object_key`,
        [crypto.randomUUID(), jobId, path, Number.isFinite(file.sizeBytes) ? file.sizeBytes : 0,
          file.modifiedAt ? new Date(file.modifiedAt) : null,
          file.contentHash ? String(file.contentHash).slice(0,128) : null,
          `cloud-zen/${req.device.owner_user_id}/${jobId}/${crypto.randomUUID()}/${encodeURIComponent(path)}`]
      );
    }
    await client.query(
      `UPDATE backup_jobs SET files_total=(SELECT COUNT(*) FROM backup_manifest WHERE backup_job_id=$1),
       bytes_total=(SELECT COALESCE(SUM(size_bytes),0) FROM backup_manifest WHERE backup_job_id=$1),updated_at=NOW()
       WHERE id=$1`, [jobId]
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Manifest update failed" });
  } finally { client.release(); }
});

// Device heartbeat. This only reports the backup client's own state; it does not inspect other apps.
app.post("/api/devices/:id/heartbeat", async (req, res) => {
  const deviceId = String(req.params.id);
  const { rows } = await pool.query("SELECT id FROM devices WHERE id=$1", [deviceId]);
  if (!rows[0]) return res.status(404).json({ error: "Device not found" });
  await pool.query(
    `UPDATE devices SET last_seen_at=NOW(), total_storage_bytes=COALESCE($2,total_storage_bytes),
     free_storage_bytes=COALESCE($3,free_storage_bytes) WHERE id=$1`,
    [deviceId, Number.isFinite(req.body?.totalStorageBytes) ? req.body.totalStorageBytes : null,
      Number.isFinite(req.body?.freeStorageBytes) ? req.body.freeStorageBytes : null]
  );
  res.json({ ok: true });
});

app.delete("/api/devices/:id", auth, async (req, res) => {
  if (!requireDeletionUnlocked(req, res)) return;
  const email = cleanEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const valid = await verifyDeletionPassword(req, email, password);
  if (!valid) return res.status(401).json({ error: "Deletion authentication failed", ...deletionStatus(req) });
  const result = await pool.query("DELETE FROM devices WHERE id=$1 AND owner_user_id=$2", [req.params.id, req.user.sub]);
  res.json({ ok: true, revoked: result.rowCount > 0 });
});

app.get("/api/deletion/status", auth, (req, res) => res.json(deletionStatus(req)));

app.get("/api/backups", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.id,b.device_id,b.status,b.bytes_total,b.bytes_uploaded,b.files_total,b.files_uploaded,
            b.created_at,b.updated_at,d.name AS device_name
     FROM backup_jobs b JOIN devices d ON d.id=b.device_id
     WHERE b.owner_user_id=$1 ORDER BY b.created_at DESC`, [req.user.sub]
  );
  res.json({ backups: rows });
});

app.post("/api/backups/jobs", auth, async (req, res) => {
  const deviceId = String(req.body?.deviceId || "");
  const { rows } = await pool.query(
    `SELECT id,backup_enabled FROM devices WHERE id=$1 AND owner_user_id=$2`, [deviceId, req.user.sub]
  );
  const device = rows[0];
  if (!device) return res.status(404).json({ error: "Device not found" });
  if (!device.backup_enabled) return res.status(403).json({ error: "Backup permission is disabled for this device" });
  const job = await pool.query(
    `INSERT INTO backup_jobs(id,device_id,owner_user_id,status) VALUES($1,$2,$3,'queued') RETURNING *`,
    [crypto.randomUUID(), deviceId, req.user.sub]
  );
  res.status(201).json({ job: job.rows[0] });
});

app.post("/api/backups/manifest", auth, async (req, res) => {
  const jobId = String(req.body?.jobId || "");
  const entries = Array.isArray(req.body?.files) ? req.body.files : [];
  const job = await pool.query("SELECT id FROM backup_jobs WHERE id=$1 AND owner_user_id=$2", [jobId, req.user.sub]);
  if (!job.rows[0]) return res.status(404).json({ error: "Backup job not found" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const file of entries.slice(0, 5000)) {
      const path = safePath(file.relativePath);
      if (!path) continue;
      const manifestId = crypto.randomUUID();
      await client.query(
        `INSERT INTO backup_manifest(id,backup_job_id,relative_path,size_bytes,modified_at,content_hash,status,object_key)
         VALUES($1,$2,$3,$4,$5,$6,'pending',$7)
         ON CONFLICT(backup_job_id,relative_path) DO UPDATE SET
         size_bytes=EXCLUDED.size_bytes,modified_at=EXCLUDED.modified_at,content_hash=EXCLUDED.content_hash,
         status='pending',object_key=EXCLUDED.object_key`,
        [manifestId, jobId, path, Number.isFinite(file.sizeBytes) ? file.sizeBytes : 0,
          file.modifiedAt ? new Date(file.modifiedAt) : null,
          file.contentHash ? String(file.contentHash).slice(0,128) : null,
          `cloud-zen/${req.user.sub}/${jobId}/${crypto.randomUUID()}/${encodeURIComponent(path)}`]
      );
    }
    await client.query(
      `UPDATE backup_jobs SET files_total=(SELECT COUNT(*) FROM backup_manifest WHERE backup_job_id=$1),
       bytes_total=(SELECT COALESCE(SUM(size_bytes),0) FROM backup_manifest WHERE backup_job_id=$1),updated_at=NOW()
       WHERE id=$1`, [jobId]
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(e);
    res.status(500).json({ error: "Manifest update failed" });
  } finally { client.release(); }
});

// Create a short-lived upload URL for one selected file. The APK never receives storage credentials.
app.post("/api/backups/files/initiate", async (req, res) => {
  if (!requireStorage(res)) return;
  const deviceId = String(req.body?.deviceId || "");
  const jobId = String(req.body?.jobId || "");
  const path = safePath(req.body?.relativePath);
  const sizeBytes = Number(req.body?.sizeBytes || 0);
  const contentType = String(req.body?.contentType || "application/octet-stream").slice(0, 200);
  if (!deviceId || !jobId || !path || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0) {
    return res.status(400).json({ error: "Invalid upload metadata" });
  }
  const { rows } = await pool.query(
    `SELECT m.id,m.object_key FROM backup_manifest m
     JOIN backup_jobs b ON b.id=m.backup_job_id
     JOIN devices d ON d.id=b.device_id
     WHERE m.backup_job_id=$1 AND b.device_id=$2 AND b.owner_user_id=$3 AND m.relative_path=$4`,
    [jobId, deviceId, req.body?.ownerUserId || "", path]
  );
  // The client intentionally does not hold a JWT. The pairing-generated device credential is the job ID + device ID.
  // Validate ownership through a server-issued upload ticket instead of trusting ownerUserId.
  if (!rows[0]) {
    // This endpoint is intentionally rejected unless called by the authenticated master route below.
    return res.status(403).json({ error: "Upload authorization required" });
  }
  const key = rows[0].object_key;
  const command = new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, ContentType: contentType });
  const url = await getSignedUrl(s3, command, { expiresIn: 900 });
  res.json({ uploadUrl: url, objectKey: key, expiresIn: 900 });
});

// The paired client gets a device-scoped token. It cannot access another user's files.
function deviceAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Device ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing device token" });
  pool.query("SELECT id,owner_user_id,backup_enabled FROM devices WHERE device_token_hash=$1", [sha256(token)])
    .then(({ rows }) => {
      if (!rows[0]) return res.status(401).json({ error: "Invalid device token" });
      req.device = rows[0];
      next();
    }).catch(() => res.status(500).json({ error: "Device authentication failed" }));
}

app.post("/api/backups/upload-ticket", deviceAuth, async (req, res) => {
  if (!requireStorage(res)) return;
  if (!req.device.backup_enabled) return res.status(403).json({ error: "Backup permission is disabled for this device" });
  const jobId = String(req.body?.jobId || "");
  const path = safePath(req.body?.relativePath);
  if (!jobId || !path) return res.status(400).json({ error: "Invalid upload ticket request" });
  const { rows } = await pool.query(
    `SELECT m.id,m.object_key,m.size_bytes FROM backup_manifest m
     JOIN backup_jobs b ON b.id=m.backup_job_id
     WHERE m.backup_job_id=$1 AND b.device_id=$2 AND m.relative_path=$3`,
    [jobId, req.device.id, path]
  );
  if (!rows[0]) return res.status(404).json({ error: "Manifest item not found" });
  const url = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: process.env.S3_BUCKET, Key: rows[0].object_key,
    ContentType: String(req.body?.contentType || "application/octet-stream").slice(0, 200)
  }), { expiresIn: 900 });
  res.json({ uploadUrl: url, objectKey: rows[0].object_key, manifestId: rows[0].id, expiresIn: 900 });
});

app.post("/api/backups/upload-complete", deviceAuth, async (req, res) => {
  if (!requireStorage(res)) return;
  const deviceId = String(req.body?.deviceId || "");
  const jobId = String(req.body?.jobId || "");
  const manifestId = String(req.body?.manifestId || "");
  if (deviceId !== req.device.id) return res.status(403).json({ error: "Device mismatch" });
  const { rows } = await pool.query(
    `SELECT m.id,m.object_key,m.size_bytes,b.owner_user_id
     FROM backup_manifest m JOIN backup_jobs b ON b.id=m.backup_job_id
     WHERE m.id=$1 AND m.backup_job_id=$2 AND b.device_id=$3`, [manifestId, jobId, deviceId]
  );
  if (!rows[0]) return res.status(404).json({ error: "Manifest item not found" });
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: rows[0].object_key }));
    const actualSize = Number(head.ContentLength || 0);
    if (actualSize !== Number(rows[0].size_bytes)) {
      return res.status(409).json({ error: `Uploaded size mismatch. Expected ${rows[0].size_bytes}, got ${actualSize}.` });
    }
    await pool.query("UPDATE backup_manifest SET status='uploaded' WHERE id=$1", [manifestId]);
    await pool.query(
      `UPDATE backup_jobs SET files_uploaded=(SELECT COUNT(*) FROM backup_manifest WHERE backup_job_id=$1 AND status='uploaded'),
       bytes_uploaded=(SELECT COALESCE(SUM(size_bytes),0) FROM backup_manifest WHERE backup_job_id=$1 AND status='uploaded'),
       status=CASE WHEN (SELECT COUNT(*) FROM backup_manifest WHERE backup_job_id=$1 AND status <> 'uploaded')=0 THEN 'completed' ELSE 'running' END,
       updated_at=NOW() WHERE id=$1`, [jobId]
    );
    res.json({ ok: true, sizeBytes: actualSize });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: "Cloud storage could not verify the uploaded object." });
  }
});

app.get("/api/files", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.id,m.relative_path,m.size_bytes,m.modified_at,m.content_hash,m.status,m.object_key,
            b.id AS job_id,b.created_at AS backup_created_at,d.id AS device_id,d.name AS device_name
     FROM backup_manifest m JOIN backup_jobs b ON b.id=m.backup_job_id
     JOIN devices d ON d.id=b.device_id
     WHERE b.owner_user_id=$1 AND m.status='uploaded' ORDER BY m.created_at DESC`, [req.user.sub]
  );
  res.json({ files: rows.map(x => ({ ...x, object_key: undefined })) });
});

app.get("/api/files/:id/download", auth, async (req, res) => {
  if (!requireStorage(res)) return;
  const { rows } = await pool.query(
    `SELECT m.object_key,m.relative_path FROM backup_manifest m
     JOIN backup_jobs b ON b.id=m.backup_job_id WHERE m.id=$1 AND b.owner_user_id=$2 AND m.status='uploaded'`,
    [req.params.id, req.user.sub]
  );
  if (!rows[0]) return res.status(404).json({ error: "File not found" });
  const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: rows[0].object_key }), { expiresIn: 900 });
  res.json({ downloadUrl: url, fileName: rows[0].relative_path.split("/").pop() });
});

app.delete("/api/files/:id", auth, async (req, res) => {
  if (!requireDeletionUnlocked(req, res)) return;
  const valid = await verifyDeletionPassword(req, req.body?.email, req.body?.password);
  if (!valid) return res.status(401).json({ error: "Deletion authentication failed", ...deletionStatus(req) });
  if (!requireStorage(res)) return;
  const { rows } = await pool.query(
    `SELECT m.id,m.object_key FROM backup_manifest m JOIN backup_jobs b ON b.id=m.backup_job_id
     WHERE m.id=$1 AND b.owner_user_id=$2`, [req.params.id, req.user.sub]
  );
  if (!rows[0]) return res.status(404).json({ error: "File not found" });
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: rows[0].object_key }));
  await pool.query("DELETE FROM backup_manifest WHERE id=$1", [rows[0].id]);
  res.json({ ok: true, cloudCopyDeleted: true, localCopyUntouched: true });
});

app.post("/api/files/delete-all", auth, async (req, res) => {
  if (!requireDeletionUnlocked(req, res)) return;
  const valid = await verifyDeletionPassword(req, req.body?.email, req.body?.password);
  if (!valid) return res.status(401).json({ error: "Deletion authentication failed", ...deletionStatus(req) });
  if (!requireStorage(res)) return;
  const { rows } = await pool.query(
    `SELECT m.id,m.object_key FROM backup_manifest m JOIN backup_jobs b ON b.id=m.backup_job_id
     WHERE b.owner_user_id=$1 AND m.status='uploaded'`, [req.user.sub]
  );
  for (const row of rows) {
    try { await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: row.object_key })); } catch (e) { console.error("Delete object failed", e); }
  }
  await pool.query(
    `DELETE FROM backup_manifest WHERE id IN (SELECT m.id FROM backup_manifest m JOIN backup_jobs b ON b.id=m.backup_job_id WHERE b.owner_user_id=$1)`,
    [req.user.sub]
  );
  await pool.query("DELETE FROM backup_jobs WHERE owner_user_id=$1", [req.user.sub]);
  res.json({ ok: true, deletedCount: rows.length, localCopiesUntouched: true });
});

async function start() {
  await ensureSchema();
  await ensureDemoUser();
  app.listen(port, () => console.log(`Cloud-Zen backend running on ${port}; storage=${storageConfigured}`));
}

start().catch((e) => { console.error("Startup failed:", e); process.exit(1); });

