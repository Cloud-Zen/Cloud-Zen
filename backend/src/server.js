"use strict";

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { Pool } = require("pg");

const {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  DeleteObjectCommand
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const app = express();

const PORT = Number(process.env.PORT || 10000);
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!DATABASE_URL) {
  console.error("DATABASE_URL is missing");
}

if (!JWT_SECRET) {
  console.error("JWT_SECRET is missing");
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL && !DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : undefined
});

const storageConfigured =
  Boolean(process.env.S3_ENDPOINT) &&
  Boolean(process.env.S3_BUCKET) &&
  Boolean(process.env.S3_ACCESS_KEY_ID) &&
  Boolean(process.env.S3_SECRET_ACCESS_KEY);

const s3 = storageConfigured
  ? new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY
      }
    })
  : null;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

async function query(sql, params = []) {
  return pool.query(sql, params);
}

async function initDatabase() {
  await query(`
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS cz_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cz_devices (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES cz_users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'android',
      device_key TEXT NOT NULL,
      backup_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, device_key)
    );

    CREATE TABLE IF NOT EXISTS cz_pairing (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES cz_users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      device_id UUID REFERENCES cz_devices(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cz_files (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES cz_users(id) ON DELETE CASCADE,
      device_id UUID REFERENCES cz_devices(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      size BIGINT NOT NULL,
      mime_type TEXT,
      object_key TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'uploading',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentication required."
    });
  }

  try {
    const token = header.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    req.userId = decoded.sub;
    next();
  } catch {
    return res.status(401).json({
      error: "Invalid or expired session."
    });
  }
}

function createToken(userId) {
  return jwt.sign(
    { sub: userId },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

function hash(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function cleanName(value) {
  return String(value || "file")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .slice(0, 240) || "file";
}

/* HEALTH */

app.get("/health", async (req, res) => {
  try {
    await query("SELECT 1");

    res.json({
      ok: true,
      service: "cloud-zen-backend",
      version: "2.0.0",
      database: true,
      storage: storageConfigured
    });
  } catch {
    res.status(503).json({
      ok: false,
      database: false
    });
  }
});

/* REGISTER */

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    if (!email || password.length < 8) {
      return res.status(400).json({
        error: "Enter a valid email and password of at least 8 characters."
      });
    }

    const existing = await query(
      "SELECT id FROM cz_users WHERE email=$1",
      [email]
    );

    if (existing.rowCount) {
      return res.status(409).json({
        error: "Account already exists."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      `
      INSERT INTO cz_users(email,password_hash)
      VALUES($1,$2)
      RETURNING id,email
      `,
      [email, passwordHash]
    );

    res.json({
      token: createToken(result.rows[0].id),
      user: result.rows[0]
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Registration failed."
    });
  }
});

/* LOGIN */

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();

    const password = String(req.body.password || "");

    const result = await query(
      `
      SELECT id,email,password_hash
      FROM cz_users
      WHERE email=$1
      `,
      [email]
    );

    if (!result.rowCount) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    const valid = await bcrypt.compare(
      password,
      result.rows[0].password_hash
    );

    if (!valid) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    res.json({
      token: createToken(result.rows[0].id),
      user: {
        id: result.rows[0].id,
        email: result.rows[0].email
      }
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Login failed."
    });
  }
});

/* ME */

app.get("/api/me", authenticate, async (req, res) => {
  const result = await query(
    `
    SELECT id,email,created_at
    FROM cz_users
    WHERE id=$1
    `,
    [req.userId]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      error: "User not found."
    });
  }

  res.json(result.rows[0]);
});

/* DEVICES */

app.get("/api/devices", authenticate, async (req, res) => {
  const result = await query(
    `
    SELECT
      id,
      name,
      platform,
      backup_enabled,
      revoked,
      last_seen,
      created_at
    FROM cz_devices
    WHERE user_id=$1
    ORDER BY created_at DESC
    `,
    [req.userId]
  );

  res.json(result.rows);
});

/* CREATE PAIRING QR */

app.post("/api/pairing/create", authenticate, async (req, res) => {
  try {
    const rawToken = crypto
      .randomBytes(32)
      .toString("base64url");

    const result = await query(
      `
      INSERT INTO cz_pairing(
        user_id,
        token_hash,
        expires_at
      )
      VALUES(
        $1,
        $2,
        NOW() + INTERVAL '10 minutes'
      )
      RETURNING id
      `,
      [
        req.userId,
        hash(rawToken)
      ]
    );

    res.json({
      sessionId: result.rows[0].id,
      qrPayload: `CZ1:${rawToken}`,
      expiresInSeconds: 600
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Could not create pairing QR."
    });
  }
});

/* CLIENT CLAIMS QR */

app.post("/api/pairing/claim", authenticate, async (req, res) => {
  try {
    const qrPayload = String(req.body.qrPayload || "");

    if (!qrPayload.startsWith("CZ1:")) {
      return res.status(400).json({
        error: "Invalid Cloud-Zen QR."
      });
    }

    const rawToken = qrPayload.substring(4);

    const pairing = await query(
      `
      SELECT id,user_id
      FROM cz_pairing
      WHERE token_hash=$1
        AND expires_at>NOW()
        AND device_id IS NULL
      `,
      [hash(rawToken)]
    );

    if (!pairing.rowCount) {
      return res.status(410).json({
        error: "QR expired or already used."
      });
    }

    const deviceName =
      String(req.body.deviceName || "Android Device")
        .slice(0, 120);

    const deviceKey =
      String(req.body.deviceKey || "").trim();

    if (!deviceKey) {
      return res.status(400).json({
        error: "Device identity missing."
      });
    }

    const device = await query(
      `
      INSERT INTO cz_devices(
        user_id,
        name,
        platform,
        device_key
      )
      VALUES(
        $1,
        $2,
        'android',
        $3
      )
      ON CONFLICT(user_id,device_key)
      DO UPDATE SET
        name=EXCLUDED.name,
        revoked=false,
        last_seen=NOW()
      RETURNING
        id,
        name,
        backup_enabled,
        revoked
      `,
      [
        pairing.rows[0].user_id,
        deviceName,
        deviceKey
      ]
    );

    await query(
      `
      UPDATE cz_pairing
      SET device_id=$1
      WHERE id=$2
      `,
      [
        device.rows[0].id,
        pairing.rows[0].id
      ]
    );

    res.json({
      ok: true,
      paired: true,
      device: device.rows[0]
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Pairing failed."
    });
  }
});

/* PAIRING STATUS */

app.get(
  "/api/pairing/:sessionId",
  authenticate,
  async (req, res) => {
    const result = await query(
      `
      SELECT
        p.expires_at,
        p.device_id,
        d.name,
        d.backup_enabled
      FROM cz_pairing p
      LEFT JOIN cz_devices d
        ON d.id=p.device_id
      WHERE p.id=$1
        AND p.user_id=$2
      `,
      [
        req.params.sessionId,
        req.userId
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Pairing session not found."
      });
    }

    const row = result.rows[0];

    let status = "waiting";

    if (row.device_id) {
      status = "approved";
    } else if (
      new Date(row.expires_at) < new Date()
    ) {
      status = "expired";
    }

    res.json({
      status,
      device: row.device_id
        ? {
            id: row.device_id,
            name: row.name,
            backupEnabled: row.backup_enabled
          }
        : null
    });
  }
);

/* BACKUP PERMISSION */

app.post(
  "/api/devices/:id/backup-permission",
  authenticate,
  async (req, res) => {
    const enabled = req.body.enabled === true;

    const result = await query(
      `
      UPDATE cz_devices
      SET backup_enabled=$1,
          last_seen=NOW()
      WHERE id=$2
        AND user_id=$3
        AND revoked=false
      RETURNING id,backup_enabled
      `,
      [
        enabled,
        req.params.id,
        req.userId
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Device not found."
      });
    }

    res.json(result.rows[0]);
  }
);

/* REVOKE DEVICE */

app.post(
  "/api/devices/:id/revoke",
  authenticate,
  async (req, res) => {
    const result = await query(
      `
      UPDATE cz_devices
      SET revoked=true,
          backup_enabled=false
      WHERE id=$1
        AND user_id=$2
      RETURNING id
      `,
      [
        req.params.id,
        req.userId
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Device not found."
      });
    }

    res.json({
      ok: true
    });
  }
);

/* CLIENT DEVICE REGISTRATION */

app.post(
  "/api/devices/register",
  authenticate,
  async (req, res) => {
    const name =
      String(req.body.name || "Android Device")
        .slice(0, 120);

    const deviceKey =
      String(req.body.deviceKey || "").trim();

    if (!deviceKey) {
      return res.status(400).json({
        error: "deviceKey is required."
      });
    }

    const result = await query(
      `
      INSERT INTO cz_devices(
        user_id,
        name,
        platform,
        device_key
      )
      VALUES($1,$2,'android',$3)
      ON CONFLICT(user_id,device_key)
      DO UPDATE SET
        name=EXCLUDED.name,
        revoked=false,
        last_seen=NOW()
      RETURNING
        id,
        name,
        backup_enabled,
        revoked
      `,
      [
        req.userId,
        name,
        deviceKey
      ]
    );

    res.json(result.rows[0]);
  }
);

/* CLIENT ME */

app.get(
  "/api/client/device/:id",
  authenticate,
  async (req, res) => {
    const result = await query(
      `
      SELECT
        id,
        name,
        platform,
        backup_enabled,
        revoked
      FROM cz_devices
      WHERE id=$1
        AND user_id=$2
      `,
      [
        req.params.id,
        req.userId
      ]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        error: "Device not found."
      });
    }

    res.json(result.rows[0]);
  }
);

/*
 * MULTIPART UPLOAD
 *
 * Client receives signed URLs from here and uploads
 * each chunk directly to S3-compatible storage.
 */

app.post(
  "/api/uploads/initiate",
  authenticate,
  async (req, res) => {
    try {
      if (!storageConfigured) {
        return res.status(503).json({
          error: "Cloud storage is not configured on Render."
        });
      }

      const deviceId =
        String(req.body.deviceId || "");

      const deviceResult = await query(
        `
        SELECT *
        FROM cz_devices
        WHERE id=$1
          AND user_id=$2
        `,
        [
          deviceId,
          req.userId
        ]
      );

      if (!deviceResult.rowCount) {
        return res.status(404).json({
          error: "Device not found."
        });
      }

      const device = deviceResult.rows[0];

      if (device.revoked) {
        return res.status(403).json({
          error: "This device has been revoked."
        });
      }

      if (!device.backup_enabled) {
        return res.status(403).json({
          error: "Backup permission is disabled."
        });
      }

      const name = cleanName(req.body.name);
      const size = Number(req.body.size);
      const mimeType =
        String(
          req.body.mimeType ||
          "application/octet-stream"
        );

      if (
        !Number.isSafeInteger(size) ||
        size <= 0
      ) {
        return res.status(400).json({
          error: "Invalid file size."
        });
      }

      const fileId = crypto.randomUUID();

      const objectKey =
        `cloud-zen/${req.userId}/${fileId}/${name}`;

      const multipart =
        await s3.send(
          new CreateMultipartUploadCommand({
            Bucket: process.env.S3_BUCKET,
            Key: objectKey,
            ContentType: mimeType
          })
        );

      const chunkSize = Math.max(
        5 * 1024 * 1024,
        Number(
          process.env.CHUNK_SIZE ||
          8 * 1024 * 1024
        )
      );

      const partCount =
        Math.ceil(size / chunkSize);

      const urls = [];

      for (
        let partNumber = 1;
        partNumber <= partCount;
        partNumber++
      ) {
        const url =
          await getSignedUrl(
            s3,
            new UploadPartCommand({
              Bucket: process.env.S3_BUCKET,
              Key: objectKey,
              UploadId: multipart.UploadId,
              PartNumber: partNumber
            }),
            {
              expiresIn: 3600
            }
          );

        urls.push({
          partNumber,
          url
        });
      }

      await query(
        `
        INSERT INTO cz_files(
          id,
          user_id,
          device_id,
          name,
          size,
          mime_type,
          object_key,
          status
        )
        VALUES(
          $1,$2,$3,$4,$5,$6,$7,'uploading'
        )
        `,
        [
          fileId,
          req.userId,
          deviceId,
          name,
          size,
          mimeType,
          objectKey
        ]
      );

      res.json({
        fileId,
        uploadId: multipart.UploadId,
        objectKey,
        chunkSize,
        partCount,
        urls
      });
    } catch (error) {
      console.error("UPLOAD INIT:", error);

      res.status(500).json({
        error: "Could not start upload."
      });
    }
  }
);

/* COMPLETE */

app.post(
  "/api/uploads/complete",
  authenticate,
  async (req, res) => {
    try {
      if (!storageConfigured) {
        return res.status(503).json({
          error: "Cloud storage is not configured."
        });
      }

      const fileId =
        String(req.body.fileId || "");

      const uploadId =
        String(req.body.uploadId || "");

      const objectKey =
        String(req.body.objectKey || "");

      const parts =
        Array.isArray(req.body.parts)
          ? req.body.parts
          : [];

      const fileResult = await query(
        `
        SELECT *
        FROM cz_files
        WHERE id=$1
          AND user_id=$2
        `,
        [
          fileId,
          req.userId
        ]
      );

      if (!fileResult.rowCount) {
        return res.status(404).json({
          error: "File record not found."
        });
      }

      await s3.send(
        new CompleteMultipartUploadCommand({
          Bucket: process.env.S3_BUCKET,
          Key: objectKey,
          UploadId: uploadId,
          MultipartUpload: {
            Parts: parts
              .map(part => ({
                PartNumber: Number(part.partNumber),
                ETag: String(part.etag)
              }))
              .sort(
                (a,b) =>
                  a.PartNumber -
                  b.PartNumber
              )
          }
        })
      );

      await query(
        `
        UPDATE cz_files
        SET status='complete'
        WHERE id=$1
          AND user_id=$2
        `,
        [
          fileId,
          req.userId
        ]
      );

      res.json({
        ok: true,
        fileId,
        status: "complete"
      });
    } catch (error) {
      console.error(
        "UPLOAD COMPLETE:",
        error
      );

      res.status(500).json({
        error: "Could not complete upload."
      });
    }
  }
);

/* ABORT */

app.post(
  "/api/uploads/abort",
  authenticate,
  async (req, res) => {
    try {
      if (storageConfigured) {
        await s3.send(
          new AbortMultipartUploadCommand({
            Bucket: process.env.S3_BUCKET,
            Key: req.body.objectKey,
            UploadId: req.body.uploadId
          })
        );
      }

      if (req.body.fileId) {
        await query(
          `
          UPDATE cz_files
          SET status='aborted'
          WHERE id=$1
            AND user_id=$2
          `,
          [
            req.body.fileId,
            req.userId
          ]
        );
      }

      res.json({ ok: true });
    } catch {
      res.status(500).json({
        error: "Could not abort upload."
      });
    }
  }
);

/* FILE LIST */

app.get(
  "/api/files",
  authenticate,
  async (req, res) => {
    const result = await query(
      `
      SELECT
        id,
        name,
        size,
        mime_type,
        status,
        device_id,
        created_at
      FROM cz_files
      WHERE user_id=$1
        AND status='complete'
      ORDER BY created_at DESC
      `,
      [req.userId]
    );

    res.json(result.rows);
  }
);

/* DELETE */

app.delete(
  "/api/files/:id",
  authenticate,
  async (req, res) => {
    try {
      const result = await query(
        `
        SELECT object_key
        FROM cz_files
        WHERE id=$1
          AND user_id=$2
        `,
        [
          req.params.id,
          req.userId
        ]
      );

      if (!result.rowCount) {
        return res.status(404).json({
          error: "File not found."
        });
      }

      if (storageConfigured) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: process.env.S3_BUCKET,
            Key: result.rows[0].object_key
          })
        );
      }

      await query(
        `
        DELETE FROM cz_files
        WHERE id=$1
          AND user_id=$2
        `,
        [
          req.params.id,
          req.userId
        ]
      );

      res.json({
        ok: true
      });
    } catch (error) {
      console.error(error);

      res.status(500).json({
        error: "Delete failed."
      });
    }
  }
);

/* STORAGE */

app.get(
  "/api/storage",
  authenticate,
  async (req, res) => {
    const result = await query(
      `
      SELECT
        COALESCE(SUM(size),0)::bigint AS used_bytes,
        COUNT(*)::int AS file_count
      FROM cz_files
      WHERE user_id=$1
        AND status='complete'
      `,
      [req.userId]
    );

    res.json({
      usedBytes: Number(
        result.rows[0].used_bytes
      ),
      fileCount:
        result.rows[0].file_count,
      storageConfigured
    });
  }
);

app.use((error, req, res, next) => {
  console.error(error);

  if (!res.headersSent) {
    res.status(500).json({
      error: "Internal server error."
    });
  }
});

async function start() {
  await initDatabase();

  app.listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `Cloud-Zen backend running on ${PORT}`
      );

      console.log(
        `Storage configured: ${storageConfigured}`
      );
    }
  );
}

start().catch(error => {
  console.error(
    "Cloud-Zen startup failed:",
    error
  );

  process.exit(1);
});
