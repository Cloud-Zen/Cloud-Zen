require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT || 10000);
const jwtSecret = process.env.JWT_SECRET || "CHANGE_ME_IN_PRODUCTION";
const pairingTtl = Number(process.env.PAIRING_TTL_SECONDS || 120);
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || `http://localhost:${port}`).replace(/\/+$/, "");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : undefined
});

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json({ limit: "2mb" }));

const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex");

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

async function ensureSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      model TEXT,
      platform TEXT,
      os_version TEXT,
      total_storage_bytes BIGINT,
      free_storage_bytes BIGINT,
      backup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS pairing_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      master_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      pairing_token_hash TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending','paired','expired','cancelled')),
      expires_at TIMESTAMPTZ NOT NULL,
      paired_device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS backup_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      backup_job_id UUID NOT NULL REFERENCES backup_jobs(id) ON DELETE CASCADE,
      relative_path TEXT NOT NULL,
      size_bytes BIGINT NOT NULL DEFAULT 0,
      modified_at TIMESTAMPTZ,
      content_hash TEXT,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','uploading','uploaded','skipped','failed')),
      object_key TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(backup_job_id, relative_path)
    );

    CREATE INDEX IF NOT EXISTS idx_devices_owner ON devices(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_pairing_master ON pairing_sessions(master_user_id);
    CREATE INDEX IF NOT EXISTS idx_backup_owner ON backup_jobs(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_manifest_job ON backup_manifest(backup_job_id);
  `);

  // Backward-compatible column for an existing Phase 1 database.
  await pool.query(`
    ALTER TABLE devices
    ADD COLUMN IF NOT EXISTS backup_enabled BOOLEAN NOT NULL DEFAULT FALSE
  `);
}

async function ensureDemoUser() {
  await pool.query(
    `INSERT INTO users(email,password_hash) VALUES($1,$2)
     ON CONFLICT(email) DO NOTHING`,
    ["demo@example.com", sha256("ChangeMe123!")]
  );
}

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "cloud-zen-backend", version: "1.1.0" });
  } catch {
    res.status(503).json({ ok: false, error: "database_unavailable" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

  const { rows } = await pool.query(
    "SELECT id,email,password_hash FROM users WHERE email=$1",
    [email]
  );
  const user = rows[0];
  if (!user || user.password_hash !== sha256(password)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  res.json({ token: signUser(user), user: { id: user.id, email: user.email } });
});

app.post("/api/pairing/session", auth, async (req, res) => {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + pairingTtl * 1000);

  const { rows } = await pool.query(
    `INSERT INTO pairing_sessions(master_user_id,pairing_token_hash,status,expires_at)
     VALUES($1,$2,'pending',$3) RETURNING id,expires_at`,
    [req.user.sub, sha256(rawToken), expiresAt]
  );

  res.json({
    sessionId: rows[0].id,
    expiresAt: rows[0].expires_at,
    qrPayload: {
      version: 1,
      type: "cloud-zen-pair",
      server: publicBaseUrl,
      token: rawToken
    }
  });
});

app.get("/api/pairing/session/:id", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id,status,expires_at,paired_device_id
     FROM pairing_sessions
     WHERE id=$1 AND master_user_id=$2`,
    [req.params.id, req.user.sub]
  );
  const session = rows[0];
  if (!session) return res.status(404).json({ error: "Session not found" });

  if (session.status === "pending" && new Date(session.expires_at) <= new Date()) {
    await pool.query(
      "UPDATE pairing_sessions SET status='expired' WHERE id=$1 AND status='pending'",
      [session.id]
    );
    session.status = "expired";
  }
  res.json(session);
});

app.post("/api/pairing/approve", async (req, res) => {
  const token = String(req.body?.token || "");
  if (!token) return res.status(400).json({ error: "Pairing token required" });

  const { rows } = await pool.query(
    `SELECT id,master_user_id,status,expires_at
     FROM pairing_sessions WHERE pairing_token_hash=$1`,
    [sha256(token)]
  );
  const session = rows[0];
  if (!session) return res.status(404).json({ error: "Invalid pairing token" });
  if (session.status !== "pending") return res.status(409).json({ error: "Pairing session is no longer pending" });
  if (new Date(session.expires_at) <= new Date()) {
    await pool.query("UPDATE pairing_sessions SET status='expired' WHERE id=$1", [session.id]);
    return res.status(410).json({ error: "Pairing token expired" });
  }
  if (req.body?.consent !== true) {
    return res.status(400).json({ error: "Explicit consent is required" });
  }

  const meta = req.body?.device || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const device = await client.query(
      `INSERT INTO devices
       (owner_user_id,name,model,platform,os_version,total_storage_bytes,free_storage_bytes)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       RETURNING id,name,model,platform,os_version,total_storage_bytes,free_storage_bytes,backup_enabled,last_seen_at`,
      [
        session.master_user_id,
        String(meta.name || "Android Device").slice(0,120),
        String(meta.model || "").slice(0,120),
        String(meta.platform || "android").slice(0,40),
        String(meta.osVersion || "").slice(0,80),
        Number.isFinite(meta.totalStorageBytes) ? meta.totalStorageBytes : null,
        Number.isFinite(meta.freeStorageBytes) ? meta.freeStorageBytes : null
      ]
    );

    await client.query(
      "UPDATE pairing_sessions SET status='paired',paired_device_id=$1 WHERE id=$2",
      [device.rows[0].id, session.id]
    );

    await client.query("COMMIT");
    res.json({ ok: true, device: device.rows[0] });
  } catch {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Could not pair device" });
  } finally {
    client.release();
  }
});

app.get("/api/devices", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id,name,model,platform,os_version,total_storage_bytes,
            free_storage_bytes,backup_enabled,last_seen_at,created_at
     FROM devices WHERE owner_user_id=$1 ORDER BY created_at DESC`,
    [req.user.sub]
  );
  res.json({ devices: rows });
});

app.patch("/api/devices/:id/backup", auth, async (req, res) => {
  const enabled = req.body?.enabled === true;
  const result = await pool.query(
    `UPDATE devices SET backup_enabled=$1 WHERE id=$2 AND owner_user_id=$3
     RETURNING id,backup_enabled`,
    [enabled, req.params.id, req.user.sub]
  );
  if (!result.rows[0]) return res.status(404).json({ error: "Device not found" });
  res.json({ ok: true, device: result.rows[0] });
});

app.delete("/api/devices/:id", auth, async (req, res) => {
  const result = await pool.query(
    "DELETE FROM devices WHERE id=$1 AND owner_user_id=$2",
    [req.params.id, req.user.sub]
  );
  res.json({ ok: true, revoked: result.rowCount > 0 });
});

// ---------------- Backup foundation ----------------

app.get("/api/backups", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT b.id,b.device_id,b.status,b.bytes_total,b.bytes_uploaded,
            b.files_total,b.files_uploaded,b.created_at,b.updated_at,
            d.name AS device_name
     FROM backup_jobs b
     JOIN devices d ON d.id=b.device_id
     WHERE b.owner_user_id=$1
     ORDER BY b.created_at DESC`,
    [req.user.sub]
  );
  res.json({ backups: rows });
});

app.post("/api/backups/jobs", auth, async (req, res) => {
  const deviceId = String(req.body?.deviceId || "");
  const { rows } = await pool.query(
    `SELECT id,backup_enabled FROM devices
     WHERE id=$1 AND owner_user_id=$2`,
    [deviceId, req.user.sub]
  );
  const device = rows[0];
  if (!device) return res.status(404).json({ error: "Device not found" });
  if (!device.backup_enabled) {
    return res.status(403).json({ error: "Backup permission is disabled for this device" });
  }

  const job = await pool.query(
    `INSERT INTO backup_jobs(device_id,owner_user_id,status)
     VALUES($1,$2,'queued')
     RETURNING *`,
    [deviceId, req.user.sub]
  );
  res.status(201).json({ job: job.rows[0] });
});

app.get("/api/backups/jobs/:id", auth, async (req, res) => {
  const job = await pool.query(
    `SELECT * FROM backup_jobs WHERE id=$1 AND owner_user_id=$2`,
    [req.params.id, req.user.sub]
  );
  if (!job.rows[0]) return res.status(404).json({ error: "Backup job not found" });

  const manifest = await pool.query(
    `SELECT id,relative_path,size_bytes,modified_at,content_hash,status,object_key
     FROM backup_manifest WHERE backup_job_id=$1 ORDER BY relative_path`,
    [req.params.id]
  );
  res.json({ job: job.rows[0], manifest: manifest.rows });
});

app.post("/api/backups/manifest", auth, async (req, res) => {
  const jobId = String(req.body?.jobId || "");
  const entries = Array.isArray(req.body?.files) ? req.body.files : [];

  const jobResult = await pool.query(
    `SELECT id FROM backup_jobs WHERE id=$1 AND owner_user_id=$2`,
    [jobId, req.user.sub]
  );
  if (!jobResult.rows[0]) return res.status(404).json({ error: "Backup job not found" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const file of entries.slice(0, 5000)) {
      const path = String(file.relativePath || "").trim();
      if (!path || path.startsWith("/") || path.includes("..")) continue;

      await client.query(
        `INSERT INTO backup_manifest
         (backup_job_id,relative_path,size_bytes,modified_at,content_hash,status)
         VALUES($1,$2,$3,$4,$5,'pending')
         ON CONFLICT(backup_job_id,relative_path)
         DO UPDATE SET size_bytes=EXCLUDED.size_bytes,
                       modified_at=EXCLUDED.modified_at,
                       content_hash=EXCLUDED.content_hash`,
        [
          jobId,
          path.slice(0,1000),
          Number.isFinite(file.sizeBytes) ? file.sizeBytes : 0,
          file.modifiedAt ? new Date(file.modifiedAt) : null,
          file.contentHash ? String(file.contentHash).slice(0,128) : null
        ]
      );
    }

    await client.query(
      `UPDATE backup_jobs SET
         files_total=(SELECT COUNT(*) FROM backup_manifest WHERE backup_job_id=$1),
         bytes_total=(SELECT COALESCE(SUM(size_bytes),0) FROM backup_manifest WHERE backup_job_id=$1),
         updated_at=NOW()
       WHERE id=$1`,
      [jobId]
    );
    await client.query("COMMIT");
    res.json({ ok: true });
  } catch {
    await client.query("ROLLBACK");
    res.status(500).json({ error: "Manifest update failed" });
  } finally {
    client.release();
  }
});

// Upload bytes should be implemented against an S3-compatible provider next.
// Keeping storage credentials server-side prevents exposing them in APKs.

async function start() {
  await ensureSchema();
  await ensureDemoUser();
  app.listen(port, () => console.log(`Cloud-Zen backend listening on ${port}`));
}

start().catch((e) => {
  console.error("Startup failed:", e);
  process.exit(1);
});
