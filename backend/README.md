Cloud-Zen Backend
Render settings
Root Directory: backend
Build Command: npm install
Start Command: npm start
The server creates its PostgreSQL tables automatically at startup.
Main endpoints
GET /health POST /api/auth/login POST /api/pairing/session GET /api/pairing/session/:id POST /api/pairing/approve GET /api/devices DELETE /api/devices/:id
Backup foundation: GET /api/backups POST /api/backups/jobs GET /api/backups/jobs/:id POST /api/backups/manifest
The backup APIs are intentionally permission-based. Actual file upload should be connected to an S3-compatible provider in the next storage phase.
