# Deployment

Droply is designed to be deployed entirely on the Cloudflare network, using Cloudflare Pages for the static frontend and Cloudflare Workers for the signaling service.

## Prerequisites
- A Cloudflare account
- Node.js and NPM
- `wrangler` CLI installed

## Deploying the Signaling Server
1. Navigate to the worker directory: `cd worker`
2. Authenticate with Cloudflare: `npx wrangler login`
3. Deploy the worker: `npm run deploy`
4. Note the deployed Worker URL (e.g., `https://droply-worker.your-username.workers.dev`).

## Deploying the Frontend
1. Navigate to the frontend directory: `cd frontend`
2. Update the `target` in `vite.config.ts` or use environment variables to point to your deployed Worker URL instead of localhost.
3. Build the frontend: `npm run build`
4. Deploy to Cloudflare Pages: `npx wrangler pages deploy dist --project-name droply`

## TURN Server Configuration
For production, you should add your own STUN/TURN servers to the `iceServers` array in `frontend/src/services/webrtc.ts` to ensure connectivity across strict firewalls. Services like Twilio, Xirsys, or a self-hosted Coturn instance are recommended.
