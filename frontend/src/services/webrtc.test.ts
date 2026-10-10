import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Negotiation tests for `PeerConnection`.
 *
 * These drive the real negotiation state machine against a fake signaling
 * transport and a fake `RTCPeerConnection`, so the thing under test is the
 * offer/answer/ICE sequencing logic itself.
 *
 * The case that matters most here is a peer *rejoining*: the server announces
 * `peer-joined` without a preceding `peer-left` whenever a socket is replaced
 * (a refresh, a StrictMode remount, a reconnect, a "Try again"). The rejoining
 * peer has a brand-new RTCPeerConnection with new ICE credentials and a new
 * DTLS fingerprint, so the other side must throw its old peer away and offer
 * again. Failing to do that is what left the receiver on "Connecting to the
 * sender..." forever.
 */

interface SentFrame {
  type: string;
  [key: string]: unknown;
}

interface FakeSignalingShape {
  roomId: string;
  role: string;
  handlers: Record<string, ((...args: never[]) => void) | undefined>;
  sent: SentFrame[];
  closed: boolean;
  connect: () => void;
  send: (frame: SentFrame) => void;
  close: () => void;
}

// Defined inside the factory: `vi.mock` is hoisted above every top-level
// binding in this file, so the class cannot live outside it.
vi.mock('./signaling', () => {
  const registry: FakeSignalingShape[] = [];

  class FakeSignaling implements FakeSignalingShape {
    roomId: string;
    role: string;
    handlers: Record<string, ((...args: never[]) => void) | undefined>;
    sent: SentFrame[] = [];
    closed = false;

    constructor(roomId: string, role: string, handlers: Record<string, never>) {
      this.roomId = roomId;
      this.role = role;
      this.handlers = handlers;
      registry.push(this);
    }

    connect(): void {
      (this.handlers.onOpen as ((r: boolean) => void) | undefined)?.(false);
    }

    send(frame: SentFrame): void {
      this.sent.push(frame);
    }

    close(): void {
      this.closed = true;
    }

    get isOpen(): boolean {
      return !this.closed;
    }
  }

  return {
    PROTOCOL_VERSION: 2,
    SignalingService: FakeSignaling,
    signalingHttpOrigin: () => 'https://signal.test',
    __transports: registry,
  };
});

// --- fake WebRTC globals ---------------------------------------------------

let peers: FakePeerConnection[] = [];

class FakeDataChannel {
  label: string;
  readyState = 'connecting';
  binaryType = 'blob';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(label: string) {
    this.label = label;
  }

  /** Simulate the channel coming up. */
  open(): void {
    this.readyState = 'open';
    this.onopen?.();
  }

  send(): void {
    /* not exercised here */
  }

  close(): void {
    this.closed = true;
    this.readyState = 'closed';
  }

  addEventListener(): void {
    /* not exercised here */
  }

  removeEventListener(): void {
    /* not exercised here */
  }
}

/** Minimal SDP carrying a DTLS fingerprint, which is what negotiation keys on. */
function offerSdp(fingerprint: string): string {
  return `v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\na=fingerprint:sha-256 ${fingerprint}\r\n`;
}

class FakePeerConnection {  signalingState = 'stable';
  connectionState = 'new';
  iceConnectionState = 'new';
  iceGatheringState = 'new';
  localDescription: { type: string; sdp: string; toJSON: () => unknown } | null = null;
  remoteDescription: { type: string; sdp: string } | null = null;
  sctp: { maxMessageSize: number } | null = { maxMessageSize: 65536 };

  onicecandidate: ((e: { candidate: unknown }) => void) | null = null;
  onicecandidateerror: ((e: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  ondatachannel: ((e: { channel: FakeDataChannel }) => void) | null = null;

  channels: FakeDataChannel[] = [];
  addedCandidates: unknown[] = [];
  closed = false;
  restartIceCalls = 0;
  /** Unique per instance, so a test can tell two generations apart. */
  readonly fingerprint: string;

  constructor(_config?: unknown) {
    this.fingerprint = `fp-${peers.length}`;
    peers.push(this);
  }

  createDataChannel(label: string): FakeDataChannel {
    const dc = new FakeDataChannel(label);
    this.channels.push(dc);
    return dc;
  }

  async createOffer(): Promise<{ type: string; sdp: string }> {
    return { type: 'offer', sdp: offerSdp(this.fingerprint) };
  }

  async createAnswer(): Promise<{ type: string; sdp: string }> {
    return { type: 'answer', sdp: `v=0\r\na=fingerprint:sha-256 ${this.fingerprint}\r\nanswer` };
  }

  async setLocalDescription(desc: { type: string; sdp?: string }): Promise<void> {
    if (desc.type === 'rollback') {
      this.signalingState = 'stable';
      this.localDescription = null;
      return;
    }
    const sdp = desc.sdp ?? '';
    this.localDescription = { type: desc.type, sdp, toJSON: () => ({ type: desc.type, sdp }) };
    this.signalingState = desc.type === 'offer' ? 'have-local-offer' : 'stable';
  }

  async setRemoteDescription(desc: { type: string; sdp: string }): Promise<void> {
    this.remoteDescription = { type: desc.type, sdp: desc.sdp };
    this.signalingState = desc.type === 'offer' ? 'have-remote-offer' : 'stable';
  }

  async addIceCandidate(candidate: unknown): Promise<void> {
    if (!this.remoteDescription) throw new Error('no remote description');
    this.addedCandidates.push(candidate);
  }

  restartIce(): void {
    this.restartIceCalls += 1;
  }

  close(): void {
    this.closed = true;
    this.connectionState = 'closed';
  }

  /** Drive a connection-state transition the way the browser would. */
  setConnectionState(state: string): void {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }
}

class FakeSessionDescription {
  type: string;
  sdp: string;
  constructor(init: { type: string; sdp: string }) {
    this.type = init.type;
    this.sdp = init.sdp;
  }
}

class FakeIceCandidate {
  candidate: string;
  constructor(init: { candidate: string }) {
    this.candidate = init.candidate;
  }
}

const g = globalThis as Record<string, unknown>;

beforeEach(() => {
  transports.length = 0;
  peers = [];
  g.RTCPeerConnection = FakePeerConnection;
  g.RTCSessionDescription = FakeSessionDescription;
  g.RTCIceCandidate = FakeIceCandidate;
  // fetchIceConfig() memoises on success, so serve a stable config.
  g.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ iceServers: [{ urls: ['stun:stun.test:3478'] }], turn: false }),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

import * as signalingModule from './signaling';
import { PeerConnection, type PeerFailure, type PeerState } from './webrtc';
// We need to reset cached config manually by casting as we didn't export a reset method
import * as webrtcModule from './webrtc';

const transports = (signalingModule as unknown as { __transports: FakeSignalingShape[] })
  .__transports;

/** Push a frame from the server into the peer under test. */
function deliver(t: FakeSignalingShape, frame: Record<string, unknown>): void {
  (t.handlers.onFrame as ((f: unknown) => void) | undefined)?.(frame);
}

function framesOfType(t: FakeSignalingShape, type: string): SentFrame[] {
  return t.sent.filter((f) => f.type === type);
}

interface Harness {
  peer: PeerConnection;
  transport: FakeSignalingShape;
  states: PeerState[];
  failures: PeerFailure[];
  /** Mutable counter of onChannelOpen calls. */
  opens: { count: number };
}

async function startPeer(role: 'sender' | 'receiver'): Promise<Harness> {
  const states: PeerState[] = [];
  const failures: PeerFailure[] = [];
  const opens = { count: 0 };

  const peer = new PeerConnection('ABC234', role, {
    onState: (state, detail) => {
      states.push(state);
      if (detail) failures.push(detail);
    },
    onChannelOpen: () => {
      opens.count += 1;
    },
  });

  await peer.start();
  return { peer, transport: transports[transports.length - 1], states, failures, opens };
}

/** Let queued microtasks (the async negotiation steps) run to completion. */
async function flush(): Promise<void> {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

describe('sender negotiation', () => {
  it('offers when the receiver joins', async () => {
    const h = await startPeer('sender');
    deliver(h.transport, { type: 'welcome', protocol: 2, role: 'sender', peerPresent: false });
    deliver(h.transport, { type: 'peer-joined', role: 'receiver' });
    await flush();

    expect(framesOfType(h.transport, 'offer')).toHaveLength(1);
    expect(peers).toHaveLength(1);
  });

  it('re-offers with a fresh peer connection when the receiver rejoins', async () => {
    // The server sends `peer-joined` with no `peer-left` when it replaces a
    // socket. The rejoining receiver has a new RTCPeerConnection, so reusing
    // our old one means its offer can never be answered: the receiver sat on
    // "Connecting to the sender..." until it timed out.
    const h = await startPeer('sender');
    deliver(h.transport, { type: 'welcome', protocol: 2, role: 'sender', peerPresent: false });
    deliver(h.transport, { type: 'peer-joined', role: 'receiver' });
    await flush();
    expect(framesOfType(h.transport, 'offer')).toHaveLength(1);

    // The receiver refreshes / retries / reconnects.
    deliver(h.transport, { type: 'peer-joined', role: 'receiver' });
    await flush();

    const offers = framesOfType(h.transport, 'offer');
    expect(offers).toHaveLength(2);
    // And it must be a genuinely new peer connection, not the stale one.
    expect(peers).toHaveLength(2);
    expect(peers[0].closed).toBe(true);
    expect(offers[1]).not.toEqual(offers[0]);
  });

  it('re-offers after the data channel is already connected and the peer rejoins', async () => {
    // Once connected, a `peer-joined` means the far side threw its connection
    // away. Staying "connected" to a dead channel is the worst outcome: both
    // sides look fine and nothing transfers.
    const h = await startPeer('sender');
    deliver(h.transport, { type: 'welcome', protocol: 2, role: 'sender', peerPresent: false });
    deliver(h.transport, { type: 'peer-joined', role: 'receiver' });
    await flush();

    peers[0].channels[0].open();
    peers[0].setConnectionState('connected');
    expect(h.peer.currentState).toBe('connected');

    deliver(h.transport, { type: 'peer-joined', role: 'receiver' });
    await flush();

    expect(framesOfType(h.transport, 'offer')).toHaveLength(2);
    expect(peers).toHaveLength(2);
  });

  it('offers when welcome already reports the receiver present', async () => {
    const h = await startPeer('sender');
    deliver(h.transport, { type: 'welcome', protocol: 2, role: 'sender', peerPresent: true });
    await flush();
    expect(framesOfType(h.transport, 'offer')).toHaveLength(1);
  });

  it('ignores an inbound offer so glare is impossible', async () => {
    const h = await startPeer('sender');
    deliver(h.transport, { type: 'welcome', protocol: 2, role: 'sender', peerPresent: true });
    await flush();
    deliver(h.transport, { type: 'offer', sdp: { type: 'offer', sdp: 'rogue' } });
    await flush();
    expect(framesOfType(h.transport, 'answer')).toHaveLength(0);
  });
});

describe('receiver negotiation', () => {
  it('answers an offer and reports connected when the channel opens', async () => {
    const h = await startPeer('receiver');
    deliver(h.transport, { type: 'welcome', protocol: 2, role: 'receiver', peerPresent: true });
    await flush();

    deliver(h.transport, { type: 'offer', sdp: { type: 'offer', sdp: 'offer-sdp a' } });
    await flush();

    expect(framesOfType(h.transport, 'answer')).toHaveLength(1);

    const dc = new FakeDataChannel('droply/file-transfer');
    peers[0].ondatachannel?.({ channel: dc });
    dc.open();
    expect(h.peer.currentState).toBe('connected');
  });

  it('rebuilds and answers again when the sender re-offers after rejoining', async () => {
    // A re-offer carries a different DTLS fingerprint, so it cannot be applied
    // to the existing connection -- it has to be answered on a fresh one.
    const h = await startPeer('receiver');
    deliver(h.transport, { type: 'welcome', protocol: 2, role: 'receiver', peerPresent: true });
    await flush();
    deliver(h.transport, { type: 'offer', sdp: { type: 'offer', sdp: 'offer-sdp gen1' } });
    await flush();
    expect(framesOfType(h.transport, 'answer')).toHaveLength(1);

    deliver(h.transport, { type: 'peer-joined', role: 'sender' });
    deliver(h.transport, { type: 'offer', sdp: { type: 'offer', sdp: 'offer-sdp gen2' } });
    await flush();

    const answers = framesOfType(h.transport, 'answer');
    expect(answers).toHaveLength(2);
    expect(peers.length).toBeGreaterThanOrEqual(2);
    const live = peers[peers.length - 1];
    expect(live.remoteDescription?.sdp).toBe('offer-sdp gen2');
  });

  it('answers an offer that arrives before any presence notification', async () => {
    // Message ordering is not guaranteed; an offer must be able to bootstrap
    // negotiation on its own rather than deadlocking.
    const h = await startPeer('receiver');
    deliver(h.transport, { type: 'offer', sdp: { type: 'offer', sdp: 'early' } });
    await flush();
    expect(framesOfType(h.transport, 'answer')).toHaveLength(1);
  });

  it('buffers ICE candidates that arrive before the remote description', async () => {
    const h = await startPeer('receiver');
    deliver(h.transport, { type: 'welcome', protocol: 2, role: 'receiver', peerPresent: true });
    await flush();

    deliver(h.transport, { type: 'candidate', candidate: { candidate: 'cand-1' } });
    deliver(h.transport, { type: 'candidate', candidate: { candidate: 'cand-2' } });
    await flush();
    // Nothing applied yet: there is no remote description to attach them to.
    expect(peers[0].addedCandidates).toHaveLength(0);

    deliver(h.transport, { type: 'offer', sdp: { type: 'offer', sdp: 'offer-sdp a' } });
    await flush();

    const live = peers[peers.length - 1];
    expect(live.addedCandidates).toHaveLength(2);
  });

  it('does not report connected merely because the peer joined the room', async () => {
    // Room presence is not a WebRTC connection. Conflating the two is what
    // produced a false "Connected" with no working channel.
    const h = await startPeer('receiver');
    deliver(h.transport, { type: 'welcome', protocol: 2, role: 'receiver', peerPresent: true });
    await flush();
    expect(h.peer.currentState).not.toBe('connected');
    expect(h.peer.currentState).toBe('negotiating');
  });
});

describe('failure reporting', () => {
  it('reports a plain-language failure when ICE fails', async () => {
    const h = await startPeer('sender');
    deliver(h.transport, { type: 'welcome', protocol: 2, role: 'sender', peerPresent: true });
    await flush();

    peers[0].setConnectionState('failed');
    await flush();

    expect(h.peer.currentState).toBe('failed');
    expect(h.failures.at(-1)?.code).toBe('ice-failed');
    expect(h.failures.at(-1)?.message).toMatch(/connection/i);
  });

  it('reports an expired room as not retryable', async () => {
    const h = await startPeer('receiver');
    deliver(h.transport, { type: 'error', code: 'room_expired' });
    await flush();
    expect(h.peer.currentState).toBe('failed');
    expect(h.failures.at(-1)?.retryable).toBe(false);
  });

  it('goes back to waiting when the peer leaves before connecting', async () => {
    const h = await startPeer('sender');
    deliver(h.transport, { type: 'welcome', protocol: 2, role: 'sender', peerPresent: true });
    await flush();
    expect(h.peer.currentState).toBe('negotiating');

    deliver(h.transport, { type: 'peer-left', role: 'receiver' });
    await flush();
    expect(h.peer.currentState).toBe('waiting-for-peer');

    // And a later rejoin must still produce an offer.
    deliver(h.transport, { type: 'peer-joined', role: 'receiver' });
    await flush();
    expect(framesOfType(h.transport, 'offer')).toHaveLength(2);
  });

  it('is inert after close', async () => {
    const h = await startPeer('sender');
    h.peer.close();
    deliver(h.transport, { type: 'peer-joined', role: 'receiver' });
    await flush();
    expect(framesOfType(h.transport, 'offer')).toHaveLength(0);
    expect(h.peer.currentState).toBe('closed');
  });
});
