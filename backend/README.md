Cloud-Zen Backend 2.3
Render settings
Root Directory: backend
Build Command: npm install
Start Command: npm start
Node: 20+
The server creates/migrates its PostgreSQL tables automatically at startup. The 2.3 migration adds the device-token column when upgrading an older database.
Required environment variables
Set DATABASE_URL and a strong JWT_SECRET. For actual cloud file backup also set the Filebase/S3-compatible variables in .env.example. Set PUBLIC_BASE_URL to the exact HTTPS Render URL of this backend. Optionally set CLIENT_APK_URL to the HTTPS location of the Client APK so the Master can display an APK QR.
Core endpoints
GET /health
GET /api/status
POST /api/auth/register
POST /api/auth/login
POST /api/pairing/session
GET /api/pairing/session/:id
POST /api/pairing/approve
GET /api/devices
PATCH /api/devices/:id/backup
GET /api/storage/summary
GET /api/backups
POST /api/backups/client-job
POST /api/backups/client-manifest
POST /api/backups/upload-ticket
POST /api/backups/upload-complete
GET /api/files
GET /api/files/:id/download
DELETE /api/files/:id
POST /api/files/delete-all
Backup model
Cloud-Zen is consent-based. The Master creates a short-lived QR pairing request. The second phone explicitly scans and approves it. The Client receives a device-scoped credential and can upload only when Master backup permission is enabled. The app does not read other apps' private data.
Deletion model
Deleting a backup removes the cloud copy only; the original phone file is untouched. After repeated failed deletion authentication, deletion controls are temporarily locked. The app does not hide or uninstall itself.
