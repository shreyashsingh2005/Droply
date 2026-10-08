# Security & Privacy Model

## Threat Model
- **Unauthorized Room Joining**: Room codes are random 6-character strings. While brute-forcable, rooms are ephemeral. A room only accepts one sender and one receiver.
- **Payload Interception**: WebRTC encrypts all transport traffic (DTLS/SRTP). The signaling server only sees encrypted signaling metadata, not the files.
- **Malicious Files**: Files are never executed by the browser. They are downloaded directly to the local disk.

## Privacy Guarantees
- No files are ever uploaded to centralized storage.
- No personal information is collected.
- IP addresses may be visible to STUN/TURN servers or the peer during ICE negotiation (inherent to WebRTC).

## Limitations
- TURN servers may be required on strict NAT/Firewall networks.
- Extremely large files may hit browser memory limits during chunk buffering.
