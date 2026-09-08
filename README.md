Cloud-Zen
Consent-based personal cloud backup system.
Phase 1
Node/Express backend
PostgreSQL
JWT authentication
QR pairing with short-lived token
Explicit client approval
Device metadata
Device revocation
Health endpoint
Phase 2 foundation
Backup job model
Explicit backup permission state
Backup job creation/status endpoints
File manifest model
Resumable/chunked upload API design
No hidden monitoring, stealth mode, secret codes, or arbitrary remote deletion.
Render
Root Directory: backend Build: npm install Start: npm start
Environment: DATABASE_URL= JWT_SECRET= CORS_ORIGIN=* PAIRING_TTL_SECONDS=120 PUBLIC_BASE_URL=https://YOUR-RENDER-SERVICE.onrender.com
Demo account
demo@example.com ChangeMe123!
Replace the demo password/auth hashing before production.
Production build
Use the GitHub Actions workflow and enter:
api_base_url: https://cloud-zen-backend.onrender.com
client_apk_url: your HTTPS Client APK release URL
The Client APK is manually downloaded/installed by the second phone owner. Android permissions remain enforced.
