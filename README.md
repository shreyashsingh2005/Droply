# Droply

**Private. Direct. Effortless.**

Droply is a peer-to-peer file sharing application that lets you transfer files directly between devices through your browser, without requiring user accounts or uploading files to centralized file storage.

## Features
- **Privacy-first**: Files are transferred directly between peers using WebRTC DataChannels.
- **No registration**: Instantly create a share room and send a link or QR code.
- **Cross-platform**: Works on any modern browser (Windows, macOS, Linux, iOS, Android).
- **Fast**: Direct connection means files don't bounce through a cloud server.

## Tech Stack
- **Frontend**: React, TypeScript, Vite, Tailwind CSS
- **Signaling**: Cloudflare Workers, Durable Objects
- **Networking**: WebRTC (RTCPeerConnection, RTCDataChannel)

## Local Development
1. **Frontend**: `cd frontend && npm install && npm run dev`
2. **Signaling**: `cd worker && npm install && npm run dev`

## Deployment
See [DEPLOYMENT.md](docs/DEPLOYMENT.md) for instructions on deploying to Cloudflare Pages and Workers.
