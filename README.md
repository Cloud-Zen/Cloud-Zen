Cloud-Zen
Private personal cloud UI backed by a Telegram account through Telegram's MTProto API.
Render
Runtime: Node
Build command: npm install
Start command: npm start
The app listens on 0.0.0.0:$PORT.
Add all variables from .env.example in Render Environment Variables.
Never commit TELEGRAM_SESSION, API hashes, or passwords to GitHub.
Telegram setup
The app intentionally uses MTProto rather than the normal Bot API because the Bot API has much smaller file-transfer limits. Create an API application at my.telegram.org, then generate a saved session string once using a trusted local environment. Put that session string in Render as TELEGRAM_SESSION. There is no safe random value that can replace this session. After the one-time setup, the normal Cloud-Zen UI does not require you to open Telegram for upload, download, or delete operations.
TELEGRAM_STORAGE_CHAT=me stores the chunks in the account's Saved Messages. You can instead configure another private chat/channel identifier that the account can write to.
Security layers
APP_PASSWORD unlocks Cloud-Zen.
DOWNLOAD_PASSWORD protects open/stream/download operations for 15 minutes.
Uploads require only the main Cloud-Zen login. There is no separate upload password. Three consecutive failed attempts for the protected login/download actions lock that device fingerprint for 24 hours. This is deliberately device/IP based; a website cannot reliably identify a physical phone without additional identity infrastructure.
Important Render/browser limitation
Cloud-Zen does not pretend a browser can continue sending bytes after the browser has completely terminated the upload request. The UI uploads in resumable chunks, and each successful chunk is immediately committed to Telegram. Minimizing/backgrounding the browser may allow the transfer to continue, but fully closing the browser can cancel remaining chunks. Render Free web services also spin down after 15 minutes without inbound traffic, so a server-side background job cannot be promised on the Free plan.
The actual file bytes are not kept on Render permanently. Only a temporary chunk is written to the ephemeral filesystem while it is being transferred to Telegram. The durable copy is in Telegram. Files are split into 64 MiB chunks by default, so a logical file can be larger than Telegram's per-file limit as long as each individual stored chunk stays within Telegram's limits.
Password reliability in this upgraded build
APP_PASSWORD and DOWNLOAD_PASSWORD are normalized for accidental leading/trailing spaces.
Login and upload/download access cookies are signed with SESSION_SECRET and are no longer tied to a changing client IP address.
The main login session is stateless, so a normal Render restart does not invalidate the signed session format (the same SESSION_SECRET must be kept).
Upload/download access is valid for 15 minutes server-side; the browser refreshes its local unlock state before that expires.
The browser talks only to Cloud-Zen. Telegram remains a hidden storage backend; users do not need to open Telegram to upload, download, stream, or delete files. Deleting a file from Cloud-Zen deletes all of its stored Telegram chunks with revoke enabled.
Keep the same password values in Render, but after replacing the code choose Save, rebuild, and deploy so Render uses the updated environment configuration. Render documents that environment variables are runtime values and that this save/deploy option triggers a new deployment.
Security password compatibility
The download access endpoint uses DOWNLOAD_PASSWORD, with APP_PASSWORD accepted as a compatibility fallback. Uploads require only the main website login (APP_PASSWORD); there is no separate upload password. 
