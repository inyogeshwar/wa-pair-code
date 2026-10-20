# WA Pair Code

A tiny self-hosted web service that links a WhatsApp device and hands the
session back to you.

- **Pair code** — type a number, get an 8-character code, enter it in WhatsApp.
- **QR code** — or scan a QR instead.
- **Session download** — once linked, download a zip of the auth files and drop
  them into your bot's `auth/` folder.

Built on [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) v7.
No database, no API keys, no external services.

> ## ⚠️ Read this first
>
> The files this service gives you are **full access to that WhatsApp account**.
> Anyone who has them can read and send messages as that number.
>
> - Only ever generate a code for **your own** number.
> - Never enter a pairing code that someone else sent you.
> - Never upload the downloaded zip anywhere, never commit it, never share it.
> - The server keeps your session in memory/temp only until it expires, but the
>   operator of the server *can* read it while it is there. Self-host it (or use
>   a host you trust) if that matters to you.

---

## Run locally

```bash
cd pairing-web
npm install
cp .env.example .env      # optional — every value has a default
npm start
```

Open <http://localhost:3000>.

Requirements: Node 20+ (Node 22 recommended).

---

## Deploy free

### Option A — Render (recommended, same as most pair-code sites)

Render's free web service supports WebSockets, which Baileys needs.

1. Push this folder to a GitHub repo:

   ```bash
   cd pairing-web
   git init
   git add .
   git commit -m "wa pair code"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. Render dashboard → **New** → **Blueprint** → select the repo → **Apply**.
   `render.yaml` already declares the free plan, the health check and the
   environment variables.

   Or manually: **New** → **Web Service** → Node → Build `npm install` →
   Start `npm start` → Plan **Free**.

3. First request after idle can take ~50 seconds (the free instance sleeps).

**Free-plan limits:** 512 MB RAM, sleeps after ~15 min of no traffic.
`MAX_SESSIONS=2` is the practical ceiling.

### Option B — Koyeb / any Docker host

The repo includes a `Dockerfile`:

```bash
docker build -t wa-pair-code .
docker run -p 3000:3000 -e MAX_SESSIONS=2 wa-pair-code
```

On Koyeb: create a Web Service from the repo, expose port 3000, choose the
free instance, health check `/healthz`.

### Option C — Hugging Face Spaces (Docker)

Create a Space with the **Docker** SDK, upload this folder, set the app port to
`3000`. Works, but the free CPU tier is slow and sleeps.

### Not suitable

Vercel, Netlify, Cloudflare Workers — serverless functions cannot hold the
long-lived WebSocket Baileys needs.

---

## API

All responses are JSON. Errors look like `{ "error": "...", "code": "..." }`.

### `POST /api/pair`

```json
{ "number": "919876543210" }
```

`201` →

```json
{
  "id": "0f2c…",
  "mode": "pair",
  "status": "awaiting",
  "code": "ABCD-EFGH",
  "qr": null,
  "error": null,
  "expiresAt": 1760000000000,
  "secondsLeft": 300
}
```

### `POST /api/qr`

No body. Same shape, with `qr` set to a `data:image/png;base64,…` URL.

### `GET /api/session/:id`

Current status. Poll this every ~2 s: it also returns refreshed QR images.

`status` is one of `requesting`, `awaiting`, `paired`, `failed`.

### `GET /api/session/:id/download`

Zip of the auth files. Only works when `status` is `paired`. Downloading also
closes the server's socket so your bot can take over the credentials.

### `POST /api/session/:id/release`

Closes the socket and deletes the temp auth files immediately.

### `GET /healthz`

`{ "ok": true, "uptime": 42, "sessions": 0 }`

---

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `BOT_NAME` | `WA Pair Code` | Page title |
| `ALLOW_PAIRING` | `true` | Enable the pair-code tab |
| `ALLOW_QR` | `true` | Enable the QR tab |
| `MAX_SESSIONS` | `2` | Concurrent sockets (memory guard) |
| `SESSION_TTL_MS` | `300000` | Wait time for the user to link |
| `PAIRED_KEEP_MS` | `600000` | How long a linked session stays downloadable |
| `READY_TIMEOUT_MS` | `30000` | WhatsApp handshake timeout |
| `RATE_LIMIT` | `5` | Requests per IP per window |
| `RATE_WINDOW_MS` | `600000` | IP window |
| `NUMBER_LIMIT` | `2` | Requests per number per window |
| `NUMBER_WINDOW_MS` | `600000` | Number window |
| `TRUST_PROXY` | `true` | Read client IP from `X-Forwarded-For` |
| `LOG_LEVEL` | `info` | Server log level |

---

## Using the downloaded session

1. Unzip the download.
2. Create an `auth/` folder next to your bot.
3. Copy every `.json` file into it.
4. Start your bot — it should connect without asking for a QR.

Keep the zip and the files private. If you lose them, link the device again and
remove the old entry in WhatsApp → Linked Devices.

---

## How it works

- `POST /api/pair` opens one temporary Baileys socket. It waits for the first
  `connection.update` that carries a `qr` payload — Baileys' "socket is ready"
  signal — and only then calls `requestPairingCode()`. Calling it earlier throws
  `Connection Closed`.
- The socket stays open until the user finishes linking or the session expires.
- On `connection === 'open'` the session is marked `paired`; the download
  endpoint zips the auth directory and closes the socket (without logging out,
  which would invalidate the credentials).
- A sweeper every 15 s deletes expired sessions and their temp directories.

---

## License

MIT. Use it on your own number.
