# Fframe Server

🌐 [Português](README.md) · **[English](README.en.md)**

Self-hosted server that **receives videos** and organizes them into projects, with a web panel
(PWA) to watch, download, and delete. The main way to send is the **Fframe Uploader** (the app in
this repository), via `POST /_ingest` authenticated by a *device key*.

> Study/interoperability project. Use it with apps and accounts you have the right to use.

## Run it

You need Docker + Docker Compose.

```bash
cp .env.example .env      # adjust PUBLIC_BASE, DATA_DIR, PORT...
docker compose up -d --build
```

Panel: `http://localhost:3260/` (or whatever `PUBLIC_BASE` you set).
On first access you create a **username and password** (stored as a hash, only on the server).

### Variables (.env)

| Variable | Description |
|----------|-----------|
| `PORT` | port published on the host (default 3260) |
| `PUBLIC_BASE` | the server's public address |
| `DATA_DIR` | where videos are stored on the host |
| `CONTAINER_NAME` | container name |
| `CHUNK_SIZE` | size of each upload chunk (bytes) |

## Connecting the Fframe Uploader app

In the panel, go to **Devices → Add device**, give it a name (e.g. "John's phone"), and scan the
generated QR code straight from the app — server address and key are filled in automatically.
Each device has its own key and can be **individually revoked** at any time, without affecting
the others.

## Timestamp comments

In the panel's player, every video has a **time-anchored comments** panel: pause at the point you
want, type, and the comment sticks to that moment. Comments show up as **markers on the timeline**
(click to jump to that point), can be marked **resolved** and deleted. The video card shows a 💬
badge with the count. Only logged-in panel users can comment. They're stored in
`data/comments.json`.

Routes (all require login): `GET/POST /_api/assets/:id/comments`, `PATCH` (resolve), and
`DELETE /_api/assets/:id/comments/:cid`.

## Panel languages

The panel ships in **Portuguese** and **English**, with a dropdown on the login screen and in the
sidebar (your choice is saved in the browser; on first visit it follows your browser's language).
The Android app remains **Portuguese-only**.

To add a language, copy a block in `public/i18n.js`, translate the values, and that's it — the
dropdown lists it automatically. Missing keys fall back to Portuguese.

## Structure

- `server.js` — routes (`/_ingest` for the app, `/_api/*` and panel media)
- `lib/store.js` — state (config, projects, assets, auth, devices, comments)
- `public/` — web panel (PWA): `dashboard.html`, `app.css`, `app.js`, `i18n.js` (translations)
- `data/` — runtime data (config, videos, logs, devices, `comments.json`) — **not versioned**
- `test-client.js` — simulates a full upload to test the server without a phone

## Security

- Panel protected by login (bcrypt + httpOnly/secure/sameSite session).
- **Multiple devices, each with its own key** (`data/devices.json`), generated with
  `crypto.randomBytes(24)`. Revoking a device doesn't affect the others.
- Data endpoints require a session **or** an active device key. **Managing devices
  (create/list/revoke) requires an admin session** — a device key alone cannot create or revoke
  other keys. Camera-protocol endpoints (`/oauth2`, `/v2`, `/_upload`) are left open out of
  protocol necessity.
- The device key should never go in a query string on new flows (only the `X-Device-Key`
  header) — avoids leaking into proxy/CDN logs.
- No private address/secret in the code — everything goes through `.env` and `data/`.

## License

MIT
