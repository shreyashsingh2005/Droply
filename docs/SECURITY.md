# Security & Privacy Model

## Threat Model

| Threat | Mitigation |
| --- | --- |
| Brute-force of room codes | Codes are 6 chars from a 29-character alphabet (29⁶ ≈ 594 M); rooms are ephemeral and held 30 min max |
| A third party joining the room | One sender + one receiver per room; the Worker replaces a stale socket rather than rejecting a newcomer |
| File payload interception | WebRTC DTLS encrypts the data channel; only the two browsers hold the session keys |
| Sender-receiver identity confusion | Role is enforced server-side and by asymmetric negotiation (sender always offers) |
| Malicious file contents | Files are downloaded as Blobs and handled by the OS; the browser never executes them |
| WebRTC metadata leakage | ICE candidates reveal IP addresses — use a TURN relay if this is unacceptable for the deployment's threat model |

## Privacy Guarantees

- **No files on any server.** There is no upload endpoint, no file storage service, and no server-side fallback that accepts file bytes when a direct connection fails.
- **No personal data collected.** No accounts, no analytics, no trackers, no third-party scripts.
- **IP visibility.** STUN servers and ICE candidates necessarily expose IPs during connection setup. TURN relays see connection metadata. This is inherent to WebRTC and unavoidable without a relay that is fully oblivious to content.

## Signaling Server

The Worker handles:
- room codes (ephemeral, in Durable Object memory)
- WebRTC session descriptions and ICE candidates (relayed, never stored)
- presence: `welcome`, `peer-joined`, `peer-left`

The Worker **never** receives or stores:
- file names, sizes, or types
- file contents or chunks
- transfer metadata

Connection metadata (IP addresses in ICE candidates) is unavoidable with STUN/TURN. A TURN relay additionally sees connection timing and volume. It cannot read file bytes (DTLS).

## Encryption

WebRTC data channels are encrypted with **DTLS** (Datagram Transport Layer Security). This encrypts the bytes between the two browsers.

Droply does **not** implement application-layer end-to-end encryption with its own key exchange. Describing it as "end-to-end encrypted" would overstate the guarantee. Correct description: "files transfer over an encrypted direct connection."

## Limitations

- Transfers on symmetric-NAT / CGNAT networks (most mobile data) fail without a TURN relay. Droply's default deployment has no TURN server, so those transfers fail explicitly rather than routing through an undeclared relay.
- Extremely large files may be constrained by browser memory during chunk buffering on the receiving side. The chunked, streaming architecture limits peak memory to one chunk (sender) or one batch (~4 MB, receiver).
- Clearing site data removes all local state: transfer history, theme preference, and any in-progress session.
