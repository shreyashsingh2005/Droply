# Architecture

Droply relies on a minimal-infrastructure architecture.

## 1. Frontend
A React application served statically.
- **UI Components**: Built with TailwindCSS for responsive design.
- **WebRTC Service**: Manages ICE candidates, Offer/Answer exchange, and `RTCDataChannel`.
- **Transfer Protocol**: Handles file chunking (16KB chunks), backpressure management using `bufferedAmount`, and file reconstruction/hash verification.

## 2. Signaling Server (Cloudflare Workers)
- Ephemeral WebSocket server using Cloudflare Durable Objects.
- **Responsibilities**: Room creation, role enforcement (1 sender, 1 receiver), relaying WebRTC SDP and ICE candidates.
- **Data Privacy**: The signaling server NEVER touches the file payloads. It only routes signaling messages.

## 3. Data Transfer Flow
1. Sender creates room -> joins Signaling Server.
2. Receiver scans QR / joins room -> joins Signaling Server.
3. Sender and Receiver exchange SDP Offers/Answers.
4. ICE Candidates are exchanged to find a direct route.
5. Sender fragments file and sends binary chunks via `RTCDataChannel`.
6. Receiver buffers chunks, reconstructs Blob, verifies SHA-256 hash, and triggers download.
