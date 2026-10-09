# Deployment

Two deployable units: the signaling Worker (Cloudflare) and the static frontend
(Vercel, or any static host). Deploy the Worker first — the frontend needs its
URL.

## 1. Signaling Worker → Cloudflare

```bash
cd worker
npm install
npx wrangler login
npm run deploy
```

Note the deployed URL, e.g. `https://droply-signaling.<your-subdomain>.workers.dev`.

Verify it:

```bash
curl https://droply-signaling.<your-subdomain>.workers.dev/health
```

Expected: `{"ok":true,"protocol":2,"turn":false}`. The `protocol` value must
match `PROTOCOL_VERSION` in `frontend/src/services/signaling.ts` — currently
**2**. A mismatch means one side was deployed without the other.

The Durable Object binding (`ROOM_STATE` → `RoomState`) and the `v1` SQLite
migration are declared in `worker/wrangler.toml` and applied automatically on
first deploy.

### Optional: lock signaling to your own origins

By default any origin may connect, which is appropriate for an open
deployment. To restrict it, add to `worker/wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://droply.example.com,https://www.droply.example.com"
```

Then redeploy. Requests from other browser origins get `403`.

### Optional but important: a TURN relay

Without TURN, Droply works on most home and office Wi-Fi but **cannot** connect
two peers when either network blocks direct peer-to-peer paths. That includes
most mobile carriers (carrier-grade NAT) and many corporate and guest networks.
There is no fallback — those transfers fail with a message saying so.

Credentials are read from Worker secrets and handed to the browser at runtime
via `GET /ice-servers`, so they never appear in the client bundle:

```bash
cd worker
npx wrangler secret put TURN_URLS         # e.g. turn:turn.example.com:3478
npx wrangler secret put TURN_USERNAME
npx wrangler secret put TURN_CREDENTIAL
```

`/health` will then report `"turn":true`. Use Cloudflare Calls, Twilio, Xirsys,
Metered, or a self-hosted coturn. Prefer short-lived credentials where the
provider supports them.

## 2. Frontend → Vercel

Set the signaling URL as a build-time environment variable. The hostname alone
is enough — the client derives `wss://` itself.

In the Vercel dashboard → *Settings → Environment Variables*:

| Name | Value | Environments |
| --- | --- | --- |
| `VITE_SIGNALING_URL` | `droply-signaling.<your-subdomain>.workers.dev` | Production, Preview |

Or with the CLI:

```bash
cd frontend
npx vercel env add VITE_SIGNALING_URL production
```

Then deploy:

```bash
cd frontend
npm install
npm run verify        # lint + typecheck + tests + production build
npx vercel --prod
```

Project settings, which `vercel.json` already declares:

* **Root directory**: `frontend`
* **Build command**: `npm run build`
* **Output directory**: `dist`

`vercel.json` also handles SPA routing (every non-asset path serves
`index.html`, so `/send`, `/receive/ABC123` and `/history` work on direct
navigation and refresh) and sets cache headers — immutable for
`/assets/*`, must-revalidate for `index.html` and `sw.js`.

> `VITE_*` variables are compiled into the bundle and are public. Only put the
> signaling hostname there. **Never** put TURN credentials or any secret in a
> `VITE_*` variable.

### If `VITE_SIGNALING_URL` is unset

The client falls back to the page's own origin (`wss://<your-site>/room/...`),
which works only if you route the Worker on the same domain. Otherwise
connections fail with a clear error. It does not silently target somebody
else's deployment.

## 3. Local development

Two terminals:

```bash
cd worker && npm install && npm run dev      # http://127.0.0.1:8787
```

```bash
cd frontend && npm install && npm run dev    # http://localhost:5173
```

The Vite dev server proxies `/room`, `/ice-servers` and `/health` to the local
Worker, and `server.host` is enabled, so you can open
`http://<your-machine-ip>:5173` on a phone on the same network and test a real
two-device transfer. Leave `VITE_SIGNALING_URL` unset locally.

> Browsers restrict WebRTC on insecure origins. `localhost` is treated as
> secure; a bare LAN IP is not always. If a phone cannot connect over
> `http://192.168.x.x:5173`, put an HTTPS tunnel in front of the dev server
> (`cloudflared tunnel`, `ngrok`) and open that URL on both devices.

## 4. Post-deployment checks

```bash
# Worker reachable, protocol version matches the frontend
curl https://<worker-host>/health

# ICE configuration served, TURN presence as expected
curl https://<worker-host>/ice-servers

# SPA routes resolve on direct navigation (expect 200, not 404)
for p in / /send /receive /receive/ABC123 /history /privacy /help; do
  printf '%s -> ' "$p"
  curl -s -o /dev/null -w '%{http_code}\n' "https://<your-site>$p"
done

# Branding assets exist (expect 200 for each)
for a in /favicon.svg /pwa-192x192.png /pwa-512x512.png /manifest.webmanifest; do
  printf '%s -> ' "$a"
  curl -s -o /dev/null -w '%{http_code}\n' "https://<your-site>$a"
done
```

Then work through the manual checklist in [TESTING.md](TESTING.md) — the
automated suite cannot prove real browser-to-browser interoperability.

## 5. Rollback

* **Frontend**: promote the previous deployment in the Vercel dashboard.
* **Worker**: `npx wrangler rollback` (or `wrangler deployments list` then
  `wrangler rollback <id>`).

If you roll back only one side across a protocol change, `/health` will report a
`protocol` value that no longer matches the frontend and connections will log a
mismatch warning. Roll back both.
