/**
 * Signaling transport.
 *
 * Protocol v2. The previous version had two problems that together made
 * connections unreliable:
 *
 *  1. the client sent a `ready` frame which the server blind-relayed, *and*
 *     the server broadcast `start` to both peers -- so the sender created two
 *     offers and the receiver answered twice (SDP glare, then a dead channel);
 *  2. a reconnecting peer was rejected with HTTP 403, so a refresh or a React
 *     StrictMode remount left the receiver spinning forever.
 *
 * v2 fixes both at the protocol level: the server owns presence
 * (`welcome` / `peer-joined` / `peer-left`), the *sender* is the only offerer,
 * and a reconnect replaces the stale socket instead of being refused.
 */

import { log } from '../lib/logger';

export const PROTOCOL_VERSION = 2;

export type Role = 'sender' | 'receiver';

/** Frames we send to the server for relay to the peer. */
export type OutboundFrame =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }
  | { type: 'bye'; reason?: string };

/** Frames the server sends us: relayed peer frames plus presence/control. */
export type InboundFrame =
  | { type: 'welcome'; protocol: number; role: Role; peerPresent: boolean }
  | { type: 'peer-joined'; role: Role }
  | { type: 'peer-left'; role: Role }
  | { type: 'replaced' }
  | { type: 'error'; code: string; message?: string }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; from?: Role }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; from?: Role }
  | { type: 'candidate'; candidate: RTCIceCandidateInit; from?: Role }
  | { type: 'bye'; reason?: string; from?: Role };

export type SignalingCloseReason =
  | 'local' // we closed it
  | 'replaced' // another tab/connection took our place
  | 'room-expired'
  | 'network'; // transport dropped

/** Close codes mirrored from the Worker. */
const CLOSE_REPLACED = 4001;
const CLOSE_ROOM_EXPIRED = 4002;
const CLOSE_LOCAL = 4100;

const KEEPALIVE_MS = 25_000;
const RECONNECT_BASE_MS = 600;
const RECONNECT_MAX_MS = 8_000;
const MAX_RECONNECT_ATTEMPTS = 6;

/**
 * Where the signaling Worker lives.
 *
 * In development everything is proxied through the Vite dev server (see
 * `vite.config.ts`), so we use the *current origin*. That matters for testing
 * on a phone: hardcoding `127.0.0.1` made the dev build unusable from any
 * other device on the network.
 */
export function resolveSignalingUrl(
  roomId: string,
  role: Role,
  opts?: { dev?: boolean; configured?: string; location?: { protocol: string; host: string } },
): string {
  const dev = opts?.dev ?? import.meta.env.DEV;
  const configured = (opts?.configured ?? import.meta.env.VITE_SIGNALING_URL ?? '').trim();
  const loc = opts?.location ?? { protocol: window.location.protocol, host: window.location.host };

  const sameOrigin = (): string => {
    const scheme = loc.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${scheme}//${loc.host}`;
  };

  let base: string;
  if (dev && !configured) {
    base = sameOrigin();
  } else if (configured) {
    // Accept `example.workers.dev`, `https://example.workers.dev`, or
    // `wss://example.workers.dev` -- and always end up on a WebSocket scheme.
    const withScheme = /^[a-z]+:\/\//i.test(configured) ? configured : `https://${configured}`;
    try {
      const u = new URL(withScheme);
      u.protocol = u.protocol === 'http:' ? 'ws:' : u.protocol === 'https:' ? 'wss:' : u.protocol;
      // A page served over HTTPS cannot open a plaintext ws:// socket.
      if (loc.protocol === 'https:' && u.protocol === 'ws:') u.protocol = 'wss:';
      u.pathname = '';
      u.search = '';
      u.hash = '';
      base = u.toString().replace(/\/$/, '');
    } catch {
      base = sameOrigin();
    }
  } else {
    // No VITE_SIGNALING_URL in a production build: the only honest fallback is
    // the current origin, which works when the Worker is routed on the same
    // domain. If it is not, the connection fails loudly with a clear message
    // instead of silently targeting somebody else's deployment.
    base = sameOrigin();
  }

  const url = new URL(`${base}/room/${encodeURIComponent(roomId)}`);
  url.searchParams.set('role', role);
  return url.toString();
}

/** HTTPS origin of the signaling service, for /health and /ice-servers. */
export function signalingHttpOrigin(): string {
  const wsUrl = resolveSignalingUrl('AAAAAA', 'sender');
  const u = new URL(wsUrl);
  u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:';
  u.pathname = '';
  u.search = '';
  return u.toString().replace(/\/$/, '');
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Reject anything that is not a frame shape we understand. */
export function parseInboundFrame(raw: unknown): InboundFrame | null {
  if (typeof raw !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data) || typeof data.type !== 'string') return null;

  switch (data.type) {
    case 'welcome':
      if (typeof data.protocol !== 'number') return null;
      if (data.role !== 'sender' && data.role !== 'receiver') return null;
      if (typeof data.peerPresent !== 'boolean') return null;
      return { type: 'welcome', protocol: data.protocol, role: data.role, peerPresent: data.peerPresent };
    case 'peer-joined':
    case 'peer-left':
      if (data.role !== 'sender' && data.role !== 'receiver') return null;
      return { type: data.type, role: data.role };
    case 'replaced':
      return { type: 'replaced' };
    case 'error':
      return {
        type: 'error',
        code: typeof data.code === 'string' ? data.code : 'unknown',
        message: typeof data.message === 'string' ? data.message : undefined,
      };
    case 'offer':
    case 'answer': {
      if (!isObject(data.sdp) || typeof data.sdp.sdp !== 'string') return null;
      if (data.sdp.type !== 'offer' && data.sdp.type !== 'answer') return null;
      return {
        type: data.type,
        sdp: { type: data.sdp.type, sdp: data.sdp.sdp },
      };
    }
    case 'candidate': {
      if (!isObject(data.candidate)) return null;
      const c = data.candidate;
      if (typeof c.candidate !== 'string') return null;
      return {
        type: 'candidate',
        candidate: {
          candidate: c.candidate,
          sdpMid: typeof c.sdpMid === 'string' ? c.sdpMid : undefined,
          sdpMLineIndex: typeof c.sdpMLineIndex === 'number' ? c.sdpMLineIndex : undefined,
          usernameFragment:
            typeof c.usernameFragment === 'string' ? c.usernameFragment : undefined,
        },
      };
    }
    case 'bye':
      return { type: 'bye', reason: typeof data.reason === 'string' ? data.reason : undefined };
    default:
      return null;
  }
}

export interface SignalingHandlers {
  onFrame?: (frame: InboundFrame) => void;
  /** Transport is up (fired again after a successful reconnect). */
  onOpen?: (reconnected: boolean) => void;
  /** Transport is down for good. */
  onClosed?: (reason: SignalingCloseReason) => void;
  /** Transport dropped and we are retrying. */
  onReconnecting?: (attempt: number, delayMs: number) => void;
}

export class SignalingService {
  private ws: WebSocket | null = null;
  private roomId: string;
  private role: Role;
  private handlers: SignalingHandlers;

  private destroyed = false;
  private everOpened = false;
  private attempt = 0;
  private reconnectTimer: number | null = null;
  private keepaliveTimer: number | null = null;
  /** Frames queued while the socket is not open yet. */
  private outbox: OutboundFrame[] = [];

  constructor(roomId: string, role: Role, handlers: SignalingHandlers = {}) {
    this.roomId = roomId;
    this.role = role;
    this.handlers = handlers;
  }

  connect(): void {
    if (this.destroyed) return;
    this.open();
  }

  private open(): void {
    const url = resolveSignalingUrl(this.roomId, this.role);
    log.signaling.debug('connecting', { role: this.role, attempt: this.attempt });

    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch (err) {
      log.signaling.error('could not construct WebSocket', err);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.destroyed || this.ws !== ws) return;
      const reconnected = this.everOpened;
      this.everOpened = true;
      this.attempt = 0;
      log.signaling.debug('open', { reconnected });
      this.startKeepalive();
      // Flush anything queued before the socket came up.
      const queued = this.outbox;
      this.outbox = [];
      for (const frame of queued) this.send(frame);
      this.handlers.onOpen?.(reconnected);
    };

    ws.onmessage = (event: MessageEvent) => {
      if (this.destroyed || this.ws !== ws) return;
      // The runtime answers our keepalive with a bare "pong".
      if (event.data === 'pong') return;
      const frame = parseInboundFrame(event.data);
      if (!frame) {
        log.signaling.warn('dropped unrecognised frame');
        return;
      }
      if (frame.type === 'welcome' && frame.protocol !== PROTOCOL_VERSION) {
        log.signaling.warn('protocol mismatch', {
          server: frame.protocol,
          client: PROTOCOL_VERSION,
        });
      }
      try {
        this.handlers.onFrame?.(frame);
      } catch (err) {
        // A throw here used to escape into a WebSocket event handler, where
        // React cannot see it -- the page just died.
        log.signaling.error('frame handler threw', err);
      }
    };

    ws.onerror = () => {
      if (this.destroyed || this.ws !== ws) return;
      // `error` carries no detail by design; `close` follows and has the code.
      log.signaling.warn('transport error');
    };

    ws.onclose = (event: CloseEvent) => {
      if (this.ws !== ws) return; // superseded socket
      this.stopKeepalive();
      this.ws = null;
      log.signaling.debug('closed', { code: event.code });

      if (this.destroyed) return;

      if (event.code === CLOSE_REPLACED) {
        // Another connection for this role took over (a second tab, or our
        // own reconnect racing). Do not fight it.
        this.destroyed = true;
        this.handlers.onClosed?.('replaced');
        return;
      }
      if (event.code === CLOSE_ROOM_EXPIRED) {
        this.destroyed = true;
        this.handlers.onClosed?.('room-expired');
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    if (this.attempt >= MAX_RECONNECT_ATTEMPTS) {
      log.signaling.warn('giving up after max reconnect attempts');
      this.destroyed = true;
      this.handlers.onClosed?.('network');
      return;
    }
    this.attempt += 1;
    // Exponential backoff with jitter, so two peers retrying in lockstep do
    // not keep colliding.
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (this.attempt - 1), RECONNECT_MAX_MS);
    const jittered = Math.round(delay * (0.7 + Math.random() * 0.6));
    this.handlers.onReconnecting?.(this.attempt, jittered);
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.destroyed) this.open();
    }, jittered);
  }

  private startKeepalive(): void {
    this.stopKeepalive();
    this.keepaliveTimer = window.setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send('ping');
        } catch {
          /* close handler will deal with it */
        }
      }
    }, KEEPALIVE_MS);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer !== null) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(frame: OutboundFrame): void {
    if (this.destroyed) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(frame));
        return;
      } catch (err) {
        log.signaling.warn('send failed, queueing', err);
      }
    }
    // Candidates are worth queueing across a brief reconnect; there is no
    // point queueing an unbounded number of them.
    if (this.outbox.length < 200) this.outbox.push(frame);
  }

  /** Permanent teardown. Safe to call repeatedly. */
  close(): void {
    if (this.destroyed && !this.ws) return;
    this.destroyed = true;
    this.stopKeepalive();
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.outbox = [];
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(CLOSE_LOCAL, 'client closed');
        }
      } catch {
        /* ignore */
      }
    }
    this.handlers.onClosed?.('local');
  }
}
