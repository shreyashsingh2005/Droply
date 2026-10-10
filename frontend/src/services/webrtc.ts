/**
 * Peer connection management.
 *
 * Negotiation is deliberately asymmetric and fixed by role, which removes SDP
 * glare as a class of bug: the **sender** always creates the data channel and
 * the offer, the **receiver** only ever answers. A sender ignores inbound
 * offers; a receiver ignores inbound answers. There is exactly one trigger to
 * begin negotiating -- learning that the peer is present -- and it is
 * idempotent.
 *
 * Connection state machine (valid transitions only):
 *
 *   idle ──► signaling ──► waiting-for-peer ──► negotiating ──► connected
 *                 │               ▲                  │              │
 *                 │               └──────────────────┤              │
 *                 │                  (peer left)     │              │
 *                 ▼                                  ▼              ▼
 *              failed ◄──────────────────────── timed-out       reconnecting
 *                 ▲                                                 │
 *                 └─────────────────────────────────────────────────┘
 *
 *   any state ──► closed   (local teardown)
 *
 * `waiting-for-peer` has **no timeout**: a sender may legitimately sit on the
 * QR screen for minutes. The timeout starts only once negotiation does, which
 * is what previously produced a "Connection Error" 30 seconds after creating
 * a room even though nothing had gone wrong.
 */

import { log } from '../lib/logger';
import {
  SignalingService,
  signalingHttpOrigin,
  type InboundFrame,
  type Role,
  type SignalingCloseReason,
} from './signaling';

export type PeerState =
  | 'idle'
  | 'signaling'
  | 'waiting-for-peer'
  | 'negotiating'
  | 'connected'
  | 'reconnecting'
  | 'timed-out'
  | 'failed'
  | 'closed';

export interface PeerFailure {
  state: 'failed' | 'timed-out';
  code:
    | 'signaling-unreachable'
    | 'signaling-replaced'
    | 'room-expired'
    | 'negotiation-timeout'
    | 'ice-failed'
    | 'peer-gone'
    | 'internal';
  /** Shown to the user. Plain language, actionable, never a raw stack. */
  message: string;
  /** Whether retrying in place has any chance of helping. */
  retryable: boolean;
}

export interface PeerHandlers {
  onState?: (state: PeerState, detail?: PeerFailure) => void;
  onChannelOpen?: () => void;
  onMessage?: (data: ArrayBuffer | string) => void;
  /** The peer's socket went away. `wasConnected` says whether we had a channel. */
  onPeerLeft?: (wasConnected: boolean) => void;
  /** Peer asked us to stop (clean shutdown). */
  onPeerBye?: (reason?: string) => void;
}

/** Negotiation (SDP + ICE) must complete inside this window. */
const NEGOTIATION_TIMEOUT_MS = 45_000;
/**
 * ICE briefly reports `disconnected` on ordinary network blips -- a Wi-Fi
 * roam, a phone switching radios. Reporting that straight to the UI as a
 * failure was wrong; we give it a grace period and an ICE restart first.
 */
const ICE_DISCONNECT_GRACE_MS = 10_000;
const ICE_CONFIG_FETCH_TIMEOUT_MS = 3_000;

/** Used when the signaling service cannot tell us its ICE configuration. */
const FALLBACK_ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
];

let cachedIceConfig: { iceServers: RTCIceServer[]; turn: boolean } | null = null;

/**
 * The DTLS fingerprint in an SDP identifies a peer's connection *generation*.
 *
 * It is how we tell an ICE-restart re-offer (same peer connection, same
 * fingerprint -- apply it in place) from an offer by a peer that rebuilt its
 * RTCPeerConnection (new fingerprint -- our existing connection can never
 * complete a DTLS handshake against it, so it has to be thrown away).
 */
export function dtlsFingerprint(sdp: string | undefined | null): string | null {
  if (!sdp) return null;
  const match = /^a=fingerprint:\s*\S+\s+(\S+)/im.exec(sdp);
  return match ? match[1].trim().toLowerCase() : null;
}

/**
 * ICE servers come from the signaling Worker at runtime, so TURN credentials
 * never sit in the client bundle. STUN-only is enough for most networks but
 * *cannot* traverse symmetric NAT / CGNAT (common on mobile carriers): those
 * peers need a TURN relay configured on the Worker. See docs/DEPLOYMENT.md.
 */
export async function fetchIceConfig(): Promise<{ iceServers: RTCIceServer[]; turn: boolean }> {
  if (cachedIceConfig) return cachedIceConfig;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ICE_CONFIG_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${signalingHttpOrigin()}/ice-servers`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      Array.isArray((body as { iceServers?: unknown }).iceServers)
    ) {
      const parsed = body as { iceServers: RTCIceServer[]; turn?: boolean };
      cachedIceConfig = { iceServers: parsed.iceServers, turn: Boolean(parsed.turn) };
      log.webrtc.debug('ice config loaded', {
        servers: parsed.iceServers.length,
        turn: cachedIceConfig.turn,
      });
      return cachedIceConfig;
    }
    throw new Error('malformed ice config');
  } catch (err) {
    log.webrtc.warn('ice config unavailable, using public STUN only', err);
    return { iceServers: FALLBACK_ICE_SERVERS, turn: false };
  } finally {
    clearTimeout(timer);
  }
}

export class PeerConnection {
  private readonly roomId: string;
  private readonly role: Role;
  private readonly handlers: PeerHandlers;

  private signaling: SignalingService | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;

  private state: PeerState = 'idle';
  private destroyed = false;
  
  private negotiating = false;
  private hadChannel = false;
  private iceServers: RTCIceServer[] = FALLBACK_ICE_SERVERS;
  private turnAvailable = false;

  private pendingCandidates: RTCIceCandidateInit[] = [];
  private negotiationTimer: number | null = null;
  private iceGraceTimer: number | null = null;
  private iceRestartAttempted = false;
  /**
   * DTLS fingerprint of the peer connection we last negotiated with. A change
   * means the far side rebuilt its peer (refresh, retry, reconnect), so every
   * artifact of the old connection is dead: we must start over.
   */
  private remoteFingerprint: string | null = null;

  constructor(roomId: string, role: Role, handlers: PeerHandlers = {}) {
    this.roomId = roomId;
    this.role = role;
    this.handlers = handlers;
  }

  get currentState(): PeerState {
    return this.state;
  }

  get hasTurn(): boolean {
    return this.turnAvailable;
  }

  /**
   * Largest message the negotiated SCTP association accepts. We clamp our
   * chunk size to it rather than assuming a value -- Firefox has historically
   * advertised much smaller limits than Chrome.
   */
  get maxMessageSize(): number {
    const advertised = this.pc?.sctp?.maxMessageSize;
    if (typeof advertised === 'number' && advertised > 0) return advertised;
    return 16 * 1024;
  }

  get channel(): RTCDataChannel | null {
    return this.dc;
  }

  async start(): Promise<void> {
    if (this.destroyed || this.state !== 'idle') return;
    this.setState('signaling');

    const config = await fetchIceConfig();
    if (this.destroyed) return;
    this.iceServers = config.iceServers;
    this.turnAvailable = config.turn;

    this.signaling = new SignalingService(this.roomId, this.role, {
      onFrame: (frame) => this.onFrame(frame),
      onOpen: (reconnected) => {
        if (this.destroyed) return;
        log.webrtc.debug('signaling open', { reconnected });
        if (this.state === 'signaling') this.setState('waiting-for-peer');
      },
      onReconnecting: (attempt) => {
        if (this.destroyed) return;
        log.webrtc.debug('signaling reconnecting', { attempt });
        // Losing signaling after the data channel is up does not interrupt an
        // in-flight transfer -- the bytes do not travel over it.
        if (this.state !== 'connected') this.setState('reconnecting');
      },
      onClosed: (reason) => this.onSignalingClosed(reason),
    });
    this.signaling.connect();
  }

  // --- signaling -----------------------------------------------------------

  private onSignalingClosed(reason: SignalingCloseReason): void {
    if (this.destroyed || reason === 'local') return;
    if (this.state === 'connected') {
      // Already peer-to-peer; signaling is no longer needed.
      log.webrtc.debug('signaling closed after connect; transfer unaffected', { reason });
      return;
    }
    if (reason === 'replaced') {
      this.fail({
        state: 'failed',
        code: 'signaling-replaced',
        message:
          'This room was opened in another tab or window, which took over the connection. Close the other one and try again.',
        retryable: true,
      });
      return;
    }
    if (reason === 'room-expired') {
      this.fail({
        state: 'failed',
        code: 'room-expired',
        message: 'This room has expired. Ask the sender to create a new one.',
        retryable: false,
      });
      return;
    }
    this.fail({
      state: 'failed',
      code: 'signaling-unreachable',
      message:
        'Could not reach the Droply signaling service. Check your internet connection and try again.',
      retryable: true,
    });
  }

  private onFrame(frame: InboundFrame): void {
    if (this.destroyed) return;

    switch (frame.type) {
      case 'welcome':
        log.webrtc.debug('welcome', { role: frame.role, peerPresent: frame.peerPresent });
        if (frame.peerPresent) {
          // `restart: false` -- this frame also arrives when our own socket
          // reconnects and the counterpart may be untouched, so it must never
          // discard a negotiation that is already under way.
          this.beginNegotiation({ restart: false });
        } else if (this.state === 'signaling' || this.state === 'reconnecting') {
          this.setState('waiting-for-peer');
        }
        break;

      case 'peer-joined':
        log.webrtc.debug('peer joined', { role: frame.role });
        // `restart: true` -- see beginNegotiation. The counterpart has a new
        // socket and therefore a new RTCPeerConnection; anything we negotiated
        // before can no longer complete.
        this.beginNegotiation({ restart: true });
        break;

      case 'peer-left': {
        log.webrtc.debug('peer left', { wasConnected: this.state === 'connected' });

        const wasConnected = this.state === 'connected';
        this.handlers.onPeerLeft?.(wasConnected);
        // Whoever left is gone whatever we had established; the next trigger
        // for this role is a fresh join rather than a duplicate.
        this.negotiating = false;
        this.teardownPeer();
        this.clearNegotiationTimeout();
        if (!wasConnected) {
          // Nothing was established: go back to waiting so the peer can
          // reconnect (a refresh on their side lands here).
          this.setState('waiting-for-peer');
        }
        break;
      }

      case 'bye':
        this.handlers.onPeerBye?.(frame.reason);
        break;

      case 'offer':
        // Only a receiver answers. A sender receiving an offer means something
        // is confused -- ignoring it is what keeps glare impossible.
        if (this.role === 'receiver') void this.handleOffer(frame.sdp);
        break;

      case 'answer':
        if (this.role === 'sender') void this.handleAnswer(frame.sdp);
        break;

      case 'candidate':
        void this.handleCandidate(frame.candidate);
        break;

      case 'replaced':
        // The close handler reports this; nothing to do here.
        break;

      case 'error':
        log.webrtc.warn('signaling error frame', { code: frame.code });
        if (frame.code === 'room_expired') {
          this.fail({
            state: 'failed',
            code: 'room-expired',
            message: 'This room has expired. Ask the sender to create a new one.',
            retryable: false,
          });
        }
        break;
    }
  }

  // --- negotiation ---------------------------------------------------------

  /**
   * Begin a negotiation round, or throw the current one away and begin again.
   *
   * Two triggers reach here, and they mean different things:
   *
   *  - `welcome` with `peerPresent` -- the counterpart was already in the room.
   *    This also arrives when *our own* socket reconnects and the counterpart
   *    never went anywhere, so it must be idempotent: if a round is already
   *    under way, do nothing.
   *
   *  - `peer-joined` -- the counterpart just opened a *new* signaling socket.
   *    The Worker sends this whether or not it first sent `peer-left`, so a
   *    rejoin (refresh, StrictMode remount, reconnect, "Try again") looks
   *    exactly like a first join. A peer with a new socket has a new
   *    `RTCPeerConnection` with new ICE credentials and a new DTLS fingerprint,
   *    which means the round we are in can never complete: the offer the sender
   *    already sent is unanswerable.
   *
   * That second case must always restart, even from `connected`. A receiver
   * that rebuilt sits waiting for an offer; if the sender stays "connected" to
   * a connection the receiver has already torn down, the receiver simply times
   * out. Restarting instead converges from either side, so it is the only
   * choice that cannot deadlock.
   */
  private beginNegotiation(opts: { restart: boolean }): void {
    if (this.destroyed) return;
    // A `welcome` for a round already in progress is the same join twice.
    if (!opts.restart && this.negotiating) return;

    const restarting = this.negotiating;
    this.negotiating = true;
    this.iceRestartAttempted = false;
    this.remoteFingerprint = null;
    if (restarting) log.webrtc.debug('peer rejoined; restarting negotiation');
    this.clearNegotiationTimeout();
    this.setState('negotiating');
    this.armNegotiationTimeout();
    this.buildPeer();

    if (this.role === 'sender') {
      void this.createAndSendOffer();
    }
    // The receiver has nothing to do but wait for the offer.
  }

  private buildPeer(preserveCandidates = false): void {
    this.teardownPeer();
    if (!preserveCandidates) { this.pendingCandidates = []; }

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      // Trickle ICE with a modest pool so the first candidates are ready fast.
      iceCandidatePoolSize: 2,
      bundlePolicy: 'max-bundle',
    });
    this.pc = pc;

    pc.onicecandidate = (event) => {
      if (this.destroyed || this.pc !== pc) return;
      if (event.candidate) {
        this.signaling?.send({ type: 'candidate', candidate: event.candidate.toJSON() });
      }
    };

    pc.onicecandidateerror = (event) => {
      // Routine for unreachable STUN/TURN servers; only worth a debug line.
      const e = event as RTCPeerConnectionIceErrorEvent;
      log.webrtc.debug('ice candidate error', { errorCode: e.errorCode });
    };

    pc.onconnectionstatechange = () => {
      if (this.destroyed || this.pc !== pc) return;
      log.webrtc.debug('connection state', pc.connectionState);
      switch (pc.connectionState) {
        case 'connected':
          this.clearIceGrace();
          break;
        case 'disconnected':
          this.startIceGrace();
          break;
        case 'failed':
          this.clearIceGrace();
          this.fail({
            state: 'failed',
            code: 'ice-failed',
            message: this.turnAvailable
              ? 'Could not establish a direct connection between the two devices. Try again, or move both devices onto the same network.'
              : 'Could not establish a direct connection. One of these networks blocks peer-to-peer traffic (common on mobile data and corporate Wi-Fi), and this deployment has no TURN relay configured.',
            retryable: true,
          });
          break;
        default:
          break;
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (this.destroyed || this.pc !== pc) return;
      log.webrtc.debug('ice connection state', pc.iceConnectionState);
      // Safari lagged behind on `connectionState`; keep ICE state as a backstop.
      if (pc.iceConnectionState === 'failed' && pc.connectionState !== 'failed') {
        this.startIceGrace();
      }
    };

    if (this.role === 'sender') {
      // Reliable + ordered (the defaults). Chunk reassembly depends on both.
      const dc = pc.createDataChannel('droply/file-transfer', { ordered: true });
      this.attachChannel(dc);
    } else {
      pc.ondatachannel = (event) => {
        if (this.destroyed || this.pc !== pc) return;
        this.attachChannel(event.channel);
      };
    }
  }

  private attachChannel(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.binaryType = 'arraybuffer';

    dc.onopen = () => {
      if (this.destroyed || this.dc !== dc) return;
      log.webrtc.debug('data channel open', { maxMessageSize: this.maxMessageSize });
      this.clearNegotiationTimeout();
      this.clearIceGrace();
      this.hadChannel = true;
      this.setState('connected');
      this.handlers.onChannelOpen?.();
    };

    dc.onmessage = (event) => {
      if (this.destroyed || this.dc !== dc) return;
      try {
        this.handlers.onMessage?.(event.data);
      } catch (err) {
        // Must not escape: a throw inside a data channel handler is invisible
        // to React and used to leave the page blank.
        log.webrtc.error('message handler threw', err);
      }
    };

    dc.onerror = (event) => {
      if (this.destroyed || this.dc !== dc) return;
      const err = (event as RTCErrorEvent).error;
      // A channel closed during teardown reports an error; that is not a
      // failure worth surfacing.
      if (this.state === 'closed' || this.destroyed) return;
      log.webrtc.error('data channel error', err?.message ?? 'unknown');
    };

    dc.onclose = () => {
      if (this.destroyed || this.dc !== dc) return;
      log.webrtc.debug('data channel closed');
    };
  }

  private async createAndSendOffer(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    try {
      const offer = await pc.createOffer();
      if (this.destroyed || this.pc !== pc) return;
      await pc.setLocalDescription(offer);
      if (this.destroyed || this.pc !== pc || !pc.localDescription) return;
      this.signaling?.send({ type: 'offer', sdp: pc.localDescription.toJSON() });
      log.webrtc.debug('offer sent');
    } catch (err) {
      log.webrtc.error('failed to create offer', err);
      this.fail({
        state: 'failed',
        code: 'internal',
        message: 'This browser could not start a peer-to-peer connection.',
        retryable: false,
      });
    }
  }

  private async handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    // An offer from a peer whose DTLS fingerprint we have not seen before is
    // not a re-offer: it is a brand-new connection. Our existing RTPeerConnection
    // carries the old connection's identity, so answering onto it would produce
    // an answer the sender can never complete against.
    const incoming = dtlsFingerprint(sdp.sdp);
    const rebuilt = incoming !== null && this.remoteFingerprint !== null && incoming !== this.remoteFingerprint;

    if (!this.negotiating || rebuilt) {
      const isFirstNegotiation = !this.negotiating && !rebuilt;
      if (!this.negotiating) {
        // Offer arrived before our presence notification; treat it as the
        // trigger so we never deadlock on message ordering.
        log.webrtc.debug('offer arrived before presence; negotiating on it');
      } else {
        log.webrtc.debug('peer rebuilt its connection; answering on a fresh one');
      }
      this.negotiating = true;
      this.clearNegotiationTimeout();
      this.setState('negotiating');
      this.armNegotiationTimeout();
      this.buildPeer(isFirstNegotiation);
    }
    const pc = this.pc;
    if (!pc) return;
    if (incoming) this.remoteFingerprint = incoming;

    try {
      if (pc.signalingState !== 'stable') {
        // A re-offer on the *same* connection (an ICE restart): roll our half
        // back and take the new one.
        log.webrtc.debug('rolling back to accept re-offer', pc.signalingState);
        try {
          await pc.setLocalDescription({ type: 'rollback' });
        } catch {
          // Not supported here: rebuild instead of wedging.
          this.buildPeer();
        }
      }
      const target = this.pc;
      if (!target) return;
      await target.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.flushCandidates();
      const answer = await target.createAnswer();
      if (this.destroyed || this.pc !== target) return;
      await target.setLocalDescription(answer);
      if (this.destroyed || this.pc !== target || !target.localDescription) return;
      this.signaling?.send({ type: 'answer', sdp: target.localDescription.toJSON() });
      log.webrtc.debug('answer sent');
    } catch (err) {
      log.webrtc.error('failed to handle offer', err);
      this.fail({
        state: 'failed',
        code: 'internal',
        message: 'Could not agree on connection settings with the other device.',
        retryable: true,
      });
    }
  }

  private async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    if (pc.signalingState !== 'have-local-offer') {
      // Duplicate or late answer. Applying it would break a working
      // connection, so drop it.
      log.webrtc.debug('ignoring answer in state', pc.signalingState);
      return;
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      await this.flushCandidates();
      log.webrtc.debug('answer applied');
    } catch (err) {
      log.webrtc.error('failed to apply answer', err);
    }
  }

  private async handleCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.pc;
    if (!pc) {
      this.pendingCandidates.push(candidate);
      return;
    }
    if (!pc.remoteDescription) {
      // Candidates routinely arrive before the description they belong to.
      this.pendingCandidates.push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      // Benign once a pair is selected, or for a candidate from a rolled-back
      // description. Never fatal.
      log.webrtc.debug('addIceCandidate rejected', err instanceof Error ? err.message : err);
    }
  }

  private async flushCandidates(): Promise<void> {
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      await this.handleCandidate(candidate);
    }
  }

  // --- timers --------------------------------------------------------------

  private armNegotiationTimeout(): void {
    this.clearNegotiationTimeout();
    this.negotiationTimer = window.setTimeout(() => {
      this.negotiationTimer = null;
      if (this.destroyed || this.state === 'connected') return;
      this.fail({
        state: 'timed-out',
        code: 'negotiation-timeout',
        message: this.turnAvailable
          ? 'The two devices could not connect in time. Try again.'
          : 'The two devices could not connect in time. This usually means one network blocks direct peer-to-peer traffic — try putting both devices on the same Wi-Fi.',
        retryable: true,
      });
    }, NEGOTIATION_TIMEOUT_MS);
  }

  private clearNegotiationTimeout(): void {
    if (this.negotiationTimer !== null) {
      clearTimeout(this.negotiationTimer);
      this.negotiationTimer = null;
    }
  }

  private startIceGrace(): void {
    if (this.iceGraceTimer !== null || this.destroyed) return;
    if (this.state === 'connected') this.setState('reconnecting');
    log.webrtc.debug('ice disconnected; starting grace period');

    // One ICE restart attempt before giving up -- recovers a Wi-Fi/LTE switch.
    if (!this.iceRestartAttempted && this.role === 'sender' && this.pc) {
      this.iceRestartAttempted = true;
      try {
        this.pc.restartIce();
        void this.createAndSendOffer();
      } catch (err) {
        log.webrtc.debug('restartIce unavailable', err);
      }
    }

    this.iceGraceTimer = window.setTimeout(() => {
      this.iceGraceTimer = null;
      if (this.destroyed) return;
      const cs = this.pc?.connectionState;
      if (cs === 'connected') {
        this.setState('connected');
        return;
      }
      this.fail({
        state: 'failed',
        code: 'ice-failed',
        message: 'The connection to the other device dropped and could not be restored.',
        retryable: true,
      });
    }, ICE_DISCONNECT_GRACE_MS);
  }

  private clearIceGrace(): void {
    if (this.iceGraceTimer !== null) {
      clearTimeout(this.iceGraceTimer);
      this.iceGraceTimer = null;
    }
    if (this.state === 'reconnecting' && this.pc?.connectionState === 'connected') {
      this.setState('connected');
    }
  }

  // --- sending -------------------------------------------------------------

  send(data: ArrayBuffer | ArrayBufferView | string): boolean {
    const dc = this.dc;
    if (!dc || dc.readyState !== 'open') return false;
    try {
      if (typeof data === 'string') dc.send(data);
      else if (data instanceof ArrayBuffer) dc.send(data);
      else dc.send(data as any);
      return true;
    } catch (err) {
      log.webrtc.error('data channel send failed', err);
      return false;
    }
  }

  get bufferedAmount(): number {
    return this.dc?.bufferedAmount ?? 0;
  }

  /** Tell the peer we are shutting down cleanly, if we still can. */
  sendBye(reason?: string): void {
    this.signaling?.send({ type: 'bye', reason });
  }

  // --- teardown ------------------------------------------------------------

  private setState(next: PeerState, detail?: PeerFailure): void {
    if (this.state === next) return;
    // `closed` and a terminal failure are final; nothing may move us off them.
    if (this.state === 'closed') return;
    if ((this.state === 'failed' || this.state === 'timed-out') && next !== 'closed') return;
    this.state = next;
    log.webrtc.debug('state', next);
    try {
      this.handlers.onState?.(next, detail);
    } catch (err) {
      log.webrtc.error('state handler threw', err);
    }
  }

  private fail(failure: PeerFailure): void {
    if (this.destroyed) return;
    this.clearNegotiationTimeout();
    this.clearIceGrace();
    this.setState(failure.state, failure);
  }

  private teardownPeer(): void {
    const dc = this.dc;
    this.dc = null;
    if (dc) {
      dc.onopen = null;
      dc.onmessage = null;
      dc.onerror = null;
      dc.onclose = null;
      try {
        dc.close();
      } catch {
        /* ignore */
      }
    }

    const pc = this.pc;
    this.pc = null;
    if (pc) {
      pc.onicecandidate = null;
      pc.onicecandidateerror = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.ondatachannel = null;
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Permanent teardown. Everything after this is a no-op, so a cleanup from an
   * old session can never disturb a newer one.
   */
  close(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    log.webrtc.debug('closing', { hadChannel: this.hadChannel });
    this.clearNegotiationTimeout();
    this.clearIceGrace();
    this.teardownPeer();
    this.signaling?.close();
    this.signaling = null;
    this.state = 'closed';
    try {
      this.handlers.onState?.('closed');
    } catch {
      /* ignore */
    }
  }
}
