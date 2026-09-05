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
The app intentionally uses MTProto rather than the normal Bot API because the Bot API has much smaller file-transfer limits. Create an API application at my.telegram.org, then generate a saved session string once using a trusted local environment. Put that session string in Render as TELEGRAM_SESSION.
TELEGRAM_STORAGE_CHAT=me stores the chunks in the account's Saved Messages. You can instead configure another private chat/channel identifier that the account can write to.
Three security layers
APP_PASSWORD unlocks Cloud-Zen.
UPLOAD_PASSWORD unlocks upload/delete operations for 15 minutes.
DOWNLOAD_PASSWORD unlocks open/stream/download operations for 15 minutes.
Three consecutive failed attempts for the same action lock that device fingerprint for 24 hours. This is deliberately device/IP based; a website cannot reliably identify a physical phone without additional identity infrastructure.
Important Render/browser limitation
Cloud-Zen does not pretend a browser can continue sending bytes after the browser has completely terminated the upload request. The UI uploads in resumable chunks, and each successful chunk is immediately committed to Telegram. Minimizing/backgrounding the browser may allow the transfer to continue, but fully closing the browser can cancel remaining chunks. Render Free web services also spin down after 15 minutes without inbound traffic, so a server-side background job cannot be promised on the Free plan.
The actual file bytes are not kept on Render permanently. Only a temporary chunk is written to the ephemeral filesystem while it is being transferred to Telegram. The durable copy is in Telegram.
