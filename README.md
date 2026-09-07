Cloud-Zen — upgraded core
Cloud-Zen is a private cloud web application whose durable file payload is stored through a Telegram MTProto account. The browser talks to the Node/Express server; Telegram credentials never belong in public/index.html.
Included
server.js — authenticated API, Telegram storage engine, chunked upload/download, range streaming, persistent file metadata, trash/restore, rename, move, star, copy, bulk operations, sharing, activity and health endpoints.
public/index.html — responsive Cloud-Zen application UI with dashboard, files, search, folders, previews, upload progress, file actions, bulk selection, settings, notifications and mobile navigation.
telegram-session.js — local-only MTProto session generator.
package.json — Node 24 runtime and dependencies.
.env.example — environment-variable template; contains no secrets.
render.yaml — Render deployment template.
Required environment
Set the variables from .env.example. Never paste a Telegram session string, API hash, application password, delete password or session secret into frontend code.
Run
npm install
npm start
Open the service root and sign in with APP_PASSWORD.
Telegram session
Run npm run telegram:session locally with TELEGRAM_API_ID and TELEGRAM_API_HASH, complete Telegram authentication, and place the printed session string into the Render TELEGRAM_SESSION secret. Do not run the session generator on the public server.
Important architecture limits
This release makes the implemented core operations real against the existing Telegram-backed architecture. It does not pretend that browser-only HTML can provide native NFC, Wi-Fi Direct, OS biometric APIs, Google/Apple OAuth, true end-to-end encryption, collaborative Office editors, malware scanning, billing, enterprise SSO, or a durable multi-user database. Those require additional backend services and/or native clients.
The current Telegram-backed design rebuilds file metadata from Telegram captions after a cold start. Render's local filesystem is temporary; file payloads are therefore not intentionally kept there as the source of truth.
