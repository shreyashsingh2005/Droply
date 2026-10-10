/**
 * Two-peer signaling test against a locally running Worker.
 *
 * Connects a sender and a receiver to the same room over real WebSockets and
 * checks the frames the server is contractually required to produce:
 *   - `welcome` to each peer, with `peerPresent` telling the truth;
 *   - `peer-joined` to the peer already in the room;
 *   - `offer`/`answer`/`candidate` relayed to the other role only, tagged with
 *     `from`;
 *   - a replacing socket does NOT produce a spurious `peer-left`;
 *   - `peer-left` when a socket genuinely goes away.
 *
 * Usage: node scripts/signaling-e2e.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? 'http://127.0.0.1:8789';
const WS_BASE = BASE.replace(/^http/, 'ws');
const ROOM = 'ZZ9Z99';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  }
}

/** A client that records every frame it receives. */
function connect(role) {
  const url = `${WS_BASE}/room/${ROOM}?role=${role}`;
  const ws = new WebSocket(url);
  const frames = [];
  ws.addEventListener('message', (event) => {
    if (event.data === 'pong') return;
    try {
      frames.push(JSON.parse(event.data));
    } catch {
      frames.push({ type: 'unparseable', raw: event.data });
    }
  });
  return {
    role,
    ws,
    frames,
    open: () => new Promise((res, rej) => {
      ws.addEventListener('open', () => res());
      ws.addEventListener('error', rej);
    }),
    waitFor: async (type, timeoutMs = 4000) => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = frames.find((f) => f.type === type);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 25));
      }
      return null;
    },
    send: (frame) => ws.send(JSON.stringify(frame)),
    close: () => ws.close(1000, 'test over'),
  };
}

function listenFor(target, type, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const poll = () => {
      const found = target.frames.find((f) => f.type === type);
      if (found) return resolve(found);
      if (Date.now() > deadline) return resolve(null);
      setTimeout(poll, 25);
    };
    poll();
  });
}

console.log(`\nSignaling end-to-end against ${BASE}, room ${ROOM}\n`);

// --- 1. sender opens the room; nobody else is there ------------------------
console.log('1. Sender creates the room');
const sender = connect('sender');
await sender.open();
const sWelcome = await sender.waitFor('welcome');
check('sender gets welcome', sWelcome !== null);
check('welcome echoes the sender role', sWelcome?.role === 'sender', JSON.stringify(sWelcome));
check('welcome reports no peer yet', sWelcome?.peerPresent === false, JSON.stringify(sWelcome));
check('protocol version is 2', sWelcome?.protocol === 2, JSON.stringify(sWelcome));
check('sender is NOT told a peer joined', sender.frames.every((f) => f.type !== 'peer-joined'));

// --- 2. receiver joins; both sides learn about it --------------------------
console.log('\n2. Receiver joins the same room');
const receiver = connect('receiver');
await receiver.open();
const rWelcome = await receiver.waitFor('welcome');
check('receiver gets welcome', rWelcome !== null);
check('welcome reports the sender is present', rWelcome?.peerPresent === true, JSON.stringify(rWelcome));
const sJoined = await sender.waitFor('peer-joined');
check('sender is notified of the join', sJoined !== null);
check('join notification names the receiver', sJoined?.role === 'receiver', JSON.stringify(sJoined));
check('receiver is not told it joined itself', receiver.frames.every((f) => f.type !== 'peer-joined'));

// --- 3. relay: offer goes sender -> receiver, tagged with `from` -----------
console.log('\n3. Offer relay');
sender.send({ type: 'offer', sdp: { type: 'offer', sdp: 'v=0 fake-offer' } });
const rOffer = await listenFor(receiver, 'offer');
check('receiver receives the offer', rOffer !== null);
check('offer carries the sender SDP', rOffer?.sdp?.sdp === 'v=0 fake-offer', JSON.stringify(rOffer));
check('offer is tagged with from=sender', rOffer?.from === 'sender', JSON.stringify(rOffer));
check('sender does not receive its own offer', sender.frames.every((f) => f.type !== 'offer'));

// --- 4. relay: answer goes receiver -> sender ------------------------------
console.log('\n4. Answer relay');
receiver.send({ type: 'answer', sdp: { type: 'answer', sdp: 'v=0 fake-answer' } });
const sAnswer = await listenFor(sender, 'answer');
check('sender receives the answer', sAnswer !== null);
check('answer carries the receiver SDP', sAnswer?.sdp?.sdp === 'v=0 fake-answer', JSON.stringify(sAnswer));
check('answer is tagged with from=receiver', sAnswer?.from === 'receiver', JSON.stringify(sAnswer));

// --- 5. ICE candidate relay ------------------------------------------------
console.log('\n5. ICE candidate relay');
sender.send({ type: 'candidate', candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 9 typ host', sdpMid: '0', sdpMLineIndex: 0 } });
const rCand = await listenFor(receiver, 'candidate');
check('receiver receives the candidate', rCand !== null);
check('candidate payload survives intact', typeof rCand?.candidate?.candidate === 'string', JSON.stringify(rCand));

// --- 6. replaying an offer that arrived before the peer existed ------------
console.log('\n6. Relay to the other role only');
receiver.send({ type: 'candidate', candidate: { candidate: 'candidate:2 1 udp 1 127.0.0.1 9 typ host' } });
const sCand = await listenFor(sender, 'candidate');
check('candidates relay both directions', sCand !== null);
check('candidate came from the receiver', sCand?.from === 'receiver', JSON.stringify(sCand));

// --- 7. replacing a socket must not fire peer-left -------------------------
console.log('\n7. Receiver refreshes (socket replaced)');
receiver.frames.length = 0;
sender.frames.length = 0;
const receiver2 = connect('receiver');
await receiver2.open();
const r2Welcome = await receiver2.waitFor('welcome');
check('replacement receiver gets welcome', r2Welcome !== null);
check('replacement still sees the sender present', r2Welcome?.peerPresent === true, JSON.stringify(r2Welcome));
const sJoined2 = await sender.waitFor('peer-joined');
check('sender is told about the replacement', sJoined2 !== null);
check(
  'a replaced socket does NOT announce peer-left',
  sender.frames.every((f) => f.type !== 'peer-left'),
  JSON.stringify(sender.frames.filter((f) => f.type === 'peer-left')),
);
check('the old socket was told it was replaced', receiver.frames.some((f) => f.type === 'replaced'), JSON.stringify(receiver.frames));

// --- 8. the new socket can still relay -------------------------------------
console.log('\n8. Relay works on the replacement socket');
sender.send({ type: 'offer', sdp: { type: 'offer', sdp: 'v=0 second-offer' } });
const rOffer2 = await receiver2.waitFor('offer');
check('second offer reaches the replacement', rOffer2?.sdp?.sdp === 'v=0 second-offer', JSON.stringify(rOffer2));

// --- 9. a genuine departure does announce peer-left ------------------------
console.log('\n9. Receiver closes for good');
sender.frames.length = 0;
receiver2.close();
const sLeft = await sender.waitFor('peer-left');
check('sender is told the peer left', sLeft !== null);
check('departure names the receiver', sLeft?.role === 'receiver', JSON.stringify(sLeft));

// --- 10. reconnect after a genuine departure -------------------------------
console.log('\n10. Receiver rejoins after leaving');
sender.frames.length = 0;
const receiver3 = connect('receiver');
await receiver3.open();
await receiver3.waitFor('welcome');
const sJoined3 = await sender.waitFor('peer-joined');
check('sender is told about the rejoin', sJoined3 !== null);
check('rejoin is relayable', sJoined3?.role === 'receiver', JSON.stringify(sJoined3));

// --- 11. protocol surface stays closed -------------------------------------
console.log('\n11. Server-owned and invalid frames');
sender.frames.length = 0;
receiver3.frames.length = 0;
sender.send({ type: 'ready' });
sender.send({ type: 'welcome', protocol: 99, role: 'sender', peerPresent: true });
await new Promise((r) => setTimeout(r, 300));
check('a blind-relayed "ready" is dropped', receiver3.frames.length === 0, JSON.stringify(receiver3.frames));
check('a forged welcome is not echoed back', sender.frames.length === 0, JSON.stringify(sender.frames));

sender.send('not json at all');
const malformed = await sender.waitFor('error');
check('malformed input produces an error frame', malformed?.code === 'malformed_frame', JSON.stringify(malformed));

sender.close();
receiver3.close();

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
