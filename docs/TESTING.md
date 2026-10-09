# Testing Guide

This document covers both automated tests and manual browser testing.

---

## Automated Tests

All automated tests run with Node.js ≥ 20.

### Run everything

```bash
# Frontend (root of this repo)
cd frontend
npm run verify

# Worker
cd worker
npm run typecheck
```

`npm run verify` runs four steps in sequence: lint → typecheck → unit tests → production build. It exits on the first failure.

### Run individual steps

```bash
cd frontend

npm run lint        # oxlint + tsr
npm run typecheck   # tsc --noEmit
npm run test        # vitest (headless, watch mode available)
npm run build       # vite build
```

### Watch mode (TDD)

```bash
cd frontend
npm run test:watch
```

---

## Unit Tests

Frontend unit tests cover the core services:

| File | What it tests |
|------|--------------|
| `services/sha256.test.ts` | FIPS 180-4 compliance, chunk-size independence, integrity detection |
| `services/mime.test.ts` | Extension inference, filename sanitization, formatting helpers |
| `services/room.test.ts` | Code generation, normalization, validation |
| `services/signaling.test.ts` | URL resolution, frame parsing, reconnect logic |
| `services/transfer.test.ts` | Binary protocol, multi-file, integrity enforcement, error recovery |

The `transfer.test.ts` suite uses a `FakePeerConnection` that drives both sides of a connection through shared promises — no WebRTC APIs are required.

---

## Manual Browser Testing

### Prerequisites

- Two browsers (or one browser + one device on the same network)
- Optional: [ngrok](https://ngrok.com) or Cloudflare Tunnel for public URL testing
- Enable DevTools console and Network tabs during testing

### Connection Flow

1. **Sender — Send tab**
   - Select 1–3 files (mixed sizes: a text file, a 5 MB image, a 50 MB ZIP)
   - Verify: room code appears with QR, file list shows correct names/sizes
   - Copy the room code

2. **Receiver — Receive tab**
   - Enter the room code
   - Verify: "Waiting for sender…" appears immediately
   - Sender should see "Peer joined" state transition

3. **Receiver — Manifest review**
   - Verify: all file names and sizes are shown correctly
   - Verify: MIME type icons are correct (test with `.txt`, `.jpg`, `.pdf`)
   - Decline one file, accept the rest
   - Verify: declined file does not transfer

4. **Transfer**
   - Verify: progress bars update smoothly, throughput meter shows MB/s
   - Verify: completed files appear with SHA-256 verification badge
   - On receiver: click Save / Share for each file, verify file opens correctly

5. **Completion**
   - Verify: both sides show the completed state
   - Verify: History page lists the transfer with correct direction and "Verified" badge

### Cross-Device Testing

For testing between a phone and a computer on the same LAN:

```bash
cd frontend
npm run dev
```

The Vite dev server binds to `0.0.0.0` and is reachable from other devices on the network at `http://<your-ip>:5173`.

For devices on different networks, use a tunnel:

```bash
ngrok http 5173
# Use the https:// URL on the receiving device
```

### Error / Edge Cases

| Scenario | Expected behaviour |
|---------|-------------------|
| Receiver closes tab mid-transfer | Sender shows "Peer left", stops sending, shows retry state |
| Network cable unplugged mid-transfer | 10-second ICE grace period → connection marked failed → retry offered |
| Transfer a 0-byte file | Transfers instantly, shows 0 B, verified immediately |
| Filename with unicode (e.g. `日本語.txt`) | Preserved correctly end-to-end |
| Filename with path traversal (`../etc/passwd`) | Sanitized on receiver, no path escape |
| Large file (≥ 100 MB) | Memory usage stays flat; tab does not freeze |
| Room code entered with lowercase | Normalized to uppercase automatically |
| Room code entered with spaces | Stripped automatically |
| Invalid room code (7 chars) | Error message shown, no connection attempt |
| Refresh sender page mid-transfer | Stale socket replaced; receiver shows reconnecting state, then continues |

### Privacy / Security

| Check | How to verify |
|-------|--------------|
| Files never hit a server | Network tab: no file data in any request |
| WebRTC uses DTLS | Chrome: `chrome://webrtc-internals` — check `dtlsEncryption` state |
| History contains no file contents | DevTools → Application → IndexedDB — `droply-transfers` store has metadata only |
| Theme preference persists | Close tab, reopen, theme is preserved |
| Offline banner shows when offline | DevTools → Network → Offline, reload page |

### Browser Compatibility

| Browser | Version | Notes |
|---------|---------|-------|
| Chrome | ≥ 120 | Full support |
| Edge | ≥ 120 | Full support |
| Firefox | ≥ 120 | Full support |
| Safari | ≥ 17 | Full support |
| iOS Safari | ≥ 17 | Save/Share buttons required (no auto-download) |
| Android Chrome | ≥ 120 | Full support |
| WebView (Android) | — | Not supported — no WebRTC |

---

## Deployment Smoke Test

After deploying to production:

```bash
# Verify the worker is running
curl https://your-worker.your-subdomain.workers.dev/health

# Expected response:
# {"status":"ok","protocol":2}

# Verify TURN credentials endpoint exists
curl https://your-worker.your-subdomain.workers.dev/ice-servers

# Expected: JSON array of RTCIceServer objects
```

Then complete a full connection cycle in the deployed app from two different networks (e.g., home Wi-Fi and mobile hotspot) to confirm TURN relay works when direct connectivity fails.
