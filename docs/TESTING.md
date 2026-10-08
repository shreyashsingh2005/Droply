# Testing Droply

Droply contains automated tests for both the frontend protocol logic and backend room validation.

## Running Frontend Tests
1. Navigate to frontend: `cd frontend`
2. Run tests: `npm run test`

The test suite relies on `vitest` and `jsdom` to mock the browser environment where necessary.

## End-to-End Tests
Due to the nature of WebRTC, true End-to-End testing requires opening real browser instances and circumventing media/permissions prompts. 
Presently, manual integration testing across two separate browser sessions (or two devices on the same network) is required to fully validate `RTCDataChannel` connectivity.

1. Start `frontend` and `worker` dev servers.
2. Open `localhost:5173` in Browser A.
3. Start a send session and copy the room code.
4. Open `localhost:5173` in Browser B.
5. Enter the room code and accept the transfer.
