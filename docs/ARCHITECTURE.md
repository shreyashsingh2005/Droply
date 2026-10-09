# Architecture

Droply has three moving parts: a static React app, a Cloudflare Worker that
introduces two browsers to each other, and the WebRTC data channel that carries
the files. File bytes only ever touch the third.

```
┌──────────────┐                                   ┌──────────────┐
│   Sender     │                                   │   Receiver   │
│   browser    │                                   │   browser    │
└──────┬───────┘                                   └───────┬──────┘
       │          WebSocket (SDP + ICE only)               │
       └──────────────┐                       ┌─────────────┘
                      ▼                       ▼
              ┌──────────────────────────────────────┐
              │  Cloudflare Worker + Durable Object  │
              │  one object per room code            │
              │  no file data, no persistence        │
              └──────────────────────────────────────┘

       ┌───────────────────────────────────────────────────┐
       │  RTCDataChannel (DTLS encrypted) — the file bytes │
       └───────────────────────────────────────────────────┘
```

## 1. Frontend (`frontend/`)

React 19 + TypeScript, built by Vite, deployed as static files.

| Module | Responsibility |
| --- | --- |
| `services/signaling.ts` | WebSocket transport, protocol v2 frame validation, reconnect with backoff, URL resolution |
| `services/webrtc.ts` | `RTCPeerConnection` lifecycle, the connection state machine, ICE candidate queueing, ICE restart |
| `services/transfer.ts` | Chunking, backpressure, streaming hash, byte/chunk accounting, acknowledgement |
| `services/sha256.ts` | Incremental SHA-256 (see *Memory* below) |
| `services/mime.ts` | MIME resolution from extension, filename sanitisation, formatting |
| `services/download.ts` | Gesture-bound save/share, object-URL ownership |
| `services/db.ts` | IndexedDB transfer history (metadata only) |
| `services/room.ts` | Room code generation and validation |
| `components/`, `pages/` | UI; all colour goes through the semantic tokens in `index.css` |

### Connection state machine

`webrtc.ts` exposes exactly one state at a time:

```
idle → signaling → waiting-for-peer → negotiating → connected
                          ▲                 │           │
                          └── peer-left ────┘           ▼
                                                  reconnecting
  any → failed | timed-out | closed
```

`waiting-for-peer` is deliberately untimed — a sender may sit on the QR screen
for minutes. The 45-second negotiation timeout starts only when a peer is
actually present. Terminal states cannot be left except by `close()`.

### Negotiation is asymmetric by role

The sender is the only offerer and the only creator of the data channel. A
sender ignores inbound offers; a receiver ignores inbound answers. Combined
with a single, idempotent trigger (learning the peer is present), this makes
SDP glare structurally impossible rather than something to recover from.

### Memory

Both sides are O(chunk), not O(file):

* **Sender** — `file.slice(offset, offset + n).arrayBuffer()` one chunk at a
  time, hashing each chunk into a running `Sha256` as it goes. The whole file
  is never in memory, and never read twice.
* **Receiver** — chunks are hashed on arrival and batched into ~4 MB `Blob`
  parts, which the browser can spill to disk. The final `Blob` is composed from
  those parts. There is no second full-file read for verification.

`crypto.subtle.digest` is one-shot and would require the entire file in memory,
which is why `sha256.ts` exists.

### Chunk size

Clamped to `RTCPeerConnection.sctp.maxMessageSize`, capped at 64 KiB. Engines
advertise very different limits, so the value is negotiated rather than assumed.

## 2. Signaling Worker (`worker/`)

One Durable Object per room code, using the WebSocket Hibernation API: roles
are carried as socket tags and per-socket counters as attachments, so an idle
room costs nothing and no in-memory map can go stale across eviction.

Responsibilities:

* accept one `sender` and one `receiver` per room;
* **replace** a stale socket for a role rather than rejecting the newcomer — a
  refresh, a StrictMode remount or a flaky network must not lock a peer out;
* report presence (`welcome` / `peer-joined` / `peer-left`);
* relay only `offer`, `answer`, `candidate`, `bye` — everything else is dropped;
* hand out ICE configuration at `GET /ice-servers`, so TURN credentials stay in
  Worker secrets and never reach the client bundle;
* enforce a 64 KiB frame cap, 300 frames per 10 s per socket, and a 30-minute
  idle room TTL via an alarm.

### Signaling protocol v2

| Direction | Frame |
| --- | --- |
| server → client | `welcome {protocol, role, peerPresent}` |
| server → client | `peer-joined {role}` · `peer-left {role}` · `replaced` · `error {code}` |
| client → server → peer | `offer {sdp}` · `answer {sdp}` · `candidate {candidate}` · `bye {reason?}` |

Version 1 broadcast a `start` frame to both peers *and* relayed a
client-generated `ready` frame, so the sender had two independent reasons to
create an offer. v2 gives presence a single owner — the server — and one
offerer.

## 3. Transfer protocol v2

Control frames are JSON strings; payloads are binary messages. The channel is
reliable and ordered, so SCTP guarantees sequencing — the protocol verifies it
anyway.

```
sender                                  receiver
  │  manifest {transferId, files[]}  →    │
  │    ← accept | reject                  │
  │  file-begin {index}              →    │
  │  «binary chunk» × n              →    │   hash + count on arrival
  │  file-end {index, bytes, chunks, hash} → │
  │    ← file-ack {index, ok}             │   after reassembly + verification
  │  … next file …                        │
  │  all-done                        →    │
```

A file is only offered to the user when **all three** checks pass: byte count
equals the declared size, chunk count matches, and the SHA-256 digest matches.
The sender does not advance to the next file until the receiver acknowledges the
current one, so "complete" on the sending screen means the bytes genuinely
arrived intact.

Either side may send `cancel`; a failed verification is reported in both
directions (`file-ack {ok: false}` plus a local error) so neither peer is left
guessing.

## 4. What is persisted

| Where | What | Lifetime |
| --- | --- | --- |
| IndexedDB (`DroplyDB` v2) | Transfer metadata: name, type, size, direction, outcome, timestamp | Until cleared. Capped at 500 records. **Never file contents.** |
| `localStorage` | Theme preference | Until cleared |
| `sessionStorage` | Current room code, reload guards, debug flag | Tab lifetime |
| Durable Object | Per-socket role and rate counters | Room lifetime, 30 min idle TTL |
| Anywhere else | — | Nothing. There is no file storage. |

Received files exist only as `Blob`s in the receiving tab. Closing or reloading
that tab discards them, which is why History records metadata and says so
rather than offering a re-download it cannot honour.
