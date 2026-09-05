Cloud-Zen Ultimate 3.1 — Mobile-First Final
This package combines the production Telegram MTProto backend with the validated premium Cloud-Zen dashboard and a mobile-first shell.
Real backend-connected operations
Master-password login/session
64 MiB chunked uploads to Telegram MTProto
Large-file streaming preview
Image/video/audio/PDF preview
Browser video/audio seeking via HTTP Range support
Secondary-password protected downloads
Signed share links and protected shared downloads
Rename and permanent delete
Download-all ZIP
Search, sorting, file-type tabs, grid/list view
Local starred/recent state
Multi-select and upload progress
Mobile-first upgrades
Fixed bottom navigation
Floating upload/create speed-dial
Native file picker and folder picker where supported
Camera capture input for document images
Pull-to-refresh gesture
Touch long-press selection hook
Responsive cards, bottom-sheet style modals, safe-area spacing
PWA manifest + shell service worker
Dark/light premium visual system and animated space/cloud background
Important honesty boundary
Persistent folders, a true Trash/Restore lifecycle, multi-user ACL/editor permissions, server-side audit database, provider federation, and durable background uploads after the browser is closed are not implemented by this backend. They are not represented as fake server functionality.
Render environment
Keep the existing secrets in Render only: APP_PASSWORD, DELETE_PASSWORD, SESSION_SECRET, TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION, TELEGRAM_STORAGE_CHAT, CHUNK_SIZE, MAX_FILE_SIZE, TELEGRAM_WORKERS. Never commit Telegram session/API secrets.
Password model
Enter password: APP_PASSWORD — the only main access password.
Delete password: DELETE_PASSWORD — required only for permanent deletion.
There is intentionally no separate download/upload password.
