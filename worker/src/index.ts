/**
 * Droply signaling Worker.
 *
 * Responsibilities, and nothing else:
 *  - hand a room's two peers a WebSocket each and relay WebRTC negotiation
 *    frames (offer / answer / candidate / bye) between them;
 *  - tell each peer whether its counterpart is present;
 *  - hand out ICE server configuration, so TURN credentials never have to be
 *    baked into the client bundle.
 *
 * File bytes never touch this Worker. There is no storage fallback.
 */

/**
 * Protocol version.
 *
 * Deliberately *not* exported: the Workers runtime treats every named export of
 * the entry module as a handler and refuses to start -- "Incorrect type for map
 * entry 'PROTOCOL_VERSION': the provided value is not of type 'function or
 * ExportedHandler'" -- which took the whole signaling service down. The value
 * is mirrored in `frontend/src/services/signaling.ts`.
 */
const PROTOCOL_VERSION = 2;

/** Room codes are exactly what the client generates: 6 chars, A-Z0-9. */
const ROOM_ID_RE = /^[A-Z0-9]{6}$/;

/** Largest signaling frame we will relay. SDP for a data channel is ~2-4 KB. */
const MAX_FRAME_BYTES = 64 * 1024;

/** Per-socket flood protection. */
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_FRAMES = 300;

/** A room with no sockets is discarded after this long. */
const ROOM_TTL_MS = 30 * 60 * 1000;

/** Close codes we originate (4000-4999 is the application-private range). */
const CLOSE_REPLACED = 4001;
const CLOSE_ROOM_EXPIRED = 4002;
const CLOSE_PROTOCOL_ERROR = 4003;

export interface Env {
  ROOM_STATE: DurableObjectNamespace;
  /** Comma-separated origin allow-list. Unset => any origin (open deployment). */
  ALLOWED_ORIGINS?: string;
  /** Optional TURN relay, set with `wrangler secret put`. Never in the bundle. */
  TURN_URLS?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
}

type Role = 'sender' | 'receiver';

/** Frames a client may ask us to relay to its peer. Anything else is dropped. */
const RELAYABLE = new Set(['offer', 'answer', 'candidate', 'bye']);

interface SocketMeta {
  role: Role;
  /** Start of the current rate-limit window. */
  windowStart: number;
  framesInWindow: number;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handleRequest(request, env);
    } catch {
      // Never leak internals to the client.
      return json({ error: 'internal_error' }, 500, corsFor(request, env));
    }
  },
};

function originAllowed(request: Request, env: Env): boolean {
  const list = (env.ALLOWED_ORIGINS ?? '').trim();
  if (!list) return true; // open deployment (default)
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser client; nothing to protect
  return list
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .includes(origin);
}

function corsFor(request: Request, env: Env): Record<string, string> {
  const list = (env.ALLOWED_ORIGINS ?? '').trim();
  const origin = request.headers.get('Origin');
  const allowOrigin = !list ? '*' : origin && originAllowed(request, env) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
  });
}

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const cors = corsFor(request, env);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  // Health / version probe. Lets the client verify protocol compatibility.
  if (url.pathname === '/health') {
    return json(
      { ok: true, protocol: PROTOCOL_VERSION, turn: Boolean(env.TURN_URLS) },
      200,
      cors,
    );
  }

  // ICE configuration. STUN is public; TURN credentials live in Worker secrets
  // and are only ever handed out over this endpoint.
  if (url.pathname === '/ice-servers') {
    if (!originAllowed(request, env)) {
      return json({ error: 'origin_not_allowed' }, 403, cors);
    }
    const iceServers: RTCIceServerConfig[] = [
      { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
    ];
    if (env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
      iceServers.push({
        urls: env.TURN_URLS.split(',').map((u) => u.trim()).filter(Boolean),
        username: env.TURN_USERNAME,
        credential: env.TURN_CREDENTIAL,
      });
    }
    return json({ iceServers, turn: Boolean(env.TURN_URLS) }, 200, {
      ...cors,
      'Cache-Control': 'no-store',
    });
  }

  // /room/:roomId  -> WebSocket upgrade, routed to that room's Durable Object.
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length !== 2 || parts[0] !== 'room') {
    return json({ error: 'not_found' }, 404, cors);
  }

  const roomId = parts[1].toUpperCase();
  if (!ROOM_ID_RE.test(roomId)) {
    return json({ error: 'invalid_room_id' }, 400, cors);
  }

  if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
    return json({ error: 'expected_websocket_upgrade' }, 426, cors);
  }

  if (!originAllowed(request, env)) {
    return json({ error: 'origin_not_allowed' }, 403, cors);
  }

  const role = url.searchParams.get('role');
  if (role !== 'sender' && role !== 'receiver') {
    return json({ error: 'invalid_role' }, 400, cors);
  }

  const id = env.ROOM_STATE.idFromName(roomId);
  return env.ROOM_STATE.get(id).fetch(request);
}

interface RTCIceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * One instance per room code. Uses the WebSocket Hibernation API so an idle
 * room costs nothing and survives eviction: roles are carried as socket tags
 * and per-socket counters as attachments, so no in-memory map can go stale.
 */
export class RoomState {
  private state: DurableObjectState;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    // Keepalive handled entirely in the runtime: a hibernating room answers
    // "ping" with "pong" without waking up.
    try {
      this.state.setWebSocketAutoResponse(
        new WebSocketRequestResponsePair('ping', 'pong'),
      );
    } catch {
      // Older runtimes without auto-response: client keepalive still works,
      // it just wakes the object. Not fatal.
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const role = url.searchParams.get('role') as Role;

    // A peer reconnecting (refresh, StrictMode remount, flaky network) must not
    // be rejected just because the previous socket's close event is still in
    // flight. Evict the stale socket instead of failing the new one -- this is
    // what used to surface as "Room already has a sender" / an endless
    // "Connecting to peer..." spinner.
    for (const stale of this.state.getWebSockets(role)) {
      try {
        stale.send(JSON.stringify({ type: 'replaced' }));
      } catch {
        /* already gone */
      }
      try {
        stale.close(CLOSE_REPLACED, 'replaced by a newer connection');
      } catch {
        /* already gone */
      }
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.state.acceptWebSocket(server, [role]);
    this.setMeta(server, { role, windowStart: Date.now(), framesInWindow: 0 });

    const peerRole: Role = role === 'sender' ? 'receiver' : 'sender';
    const peerPresent = this.liveSockets(peerRole).length > 0;

    this.sendTo(server, {
      type: 'welcome',
      protocol: PROTOCOL_VERSION,
      role,
      peerPresent,
    });

    // Tell the peer we arrived. The *sender* uses this (or welcome.peerPresent)
    // as the single, unambiguous trigger to create an offer -- there is no
    // longer a "start" broadcast that both sides could react to.
    for (const peer of this.liveSockets(peerRole)) {
      this.sendTo(peer, { type: 'peer-joined', role });
    }

    await this.state.storage.setAlarm(Date.now() + ROOM_TTL_MS);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Signaling is JSON-only. Binary never belongs here (file bytes go over
    // the peer-to-peer data channel), so reject it outright.
    if (typeof message !== 'string') {
      this.sendTo(ws, { type: 'error', code: 'binary_not_allowed' });
      return;
    }

    if (message.length > MAX_FRAME_BYTES) {
      this.sendTo(ws, { type: 'error', code: 'frame_too_large' });
      return;
    }

    const meta = this.getMeta(ws);
    if (!meta) {
      try {
        ws.close(CLOSE_PROTOCOL_ERROR, 'unknown session');
      } catch {
        /* ignore */
      }
      return;
    }

    const now = Date.now();
    if (now - meta.windowStart > RATE_WINDOW_MS) {
      meta.windowStart = now;
      meta.framesInWindow = 0;
    }
    meta.framesInWindow += 1;
    this.setMeta(ws, meta);
    if (meta.framesInWindow > RATE_MAX_FRAMES) {
      this.sendTo(ws, { type: 'error', code: 'rate_limited' });
      try {
        ws.close(CLOSE_PROTOCOL_ERROR, 'rate limited');
      } catch {
        /* ignore */
      }
      return;
    }

    let frame: unknown;
    try {
      frame = JSON.parse(message);
    } catch {
      this.sendTo(ws, { type: 'error', code: 'malformed_frame' });
      return;
    }

    if (
      typeof frame !== 'object' ||
      frame === null ||
      typeof (frame as { type?: unknown }).type !== 'string'
    ) {
      this.sendTo(ws, { type: 'error', code: 'malformed_frame' });
      return;
    }

    const type = (frame as { type: string }).type;
    if (!RELAYABLE.has(type)) {
      // Silently drop unknown/server-owned frame types rather than echoing
      // them around the room.
      return;
    }

    // Relay only to the *other* role. A peer can never address itself, and a
    // frame can never reach another room: the room is the Durable Object.
    const peerRole: Role = meta.role === 'sender' ? 'receiver' : 'sender';
    const peers = this.liveSockets(peerRole);
    if (peers.length === 0) {
      this.sendTo(ws, { type: 'error', code: 'peer_absent' });
      return;
    }
    for (const peer of peers) {
      this.sendTo(peer, { ...(frame as Record<string, unknown>), from: meta.role });
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    const meta = this.getMeta(ws);
    if (!meta) return;

    // A socket we deliberately replaced is not a peer leaving: the peer is
    // still there under a newer connection. Announcing "peer-left" here would
    // tear down a session that just reconnected.
    if (code === CLOSE_REPLACED) return;

    const peerRole: Role = meta.role === 'sender' ? 'receiver' : 'sender';
    for (const peer of this.liveSockets(peerRole)) {
      this.sendTo(peer, { type: 'peer-left', role: meta.role });
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws, 1006);
  }

  /** Room TTL: close anything still attached and drop all state. */
  async alarm(): Promise<void> {
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(JSON.stringify({ type: 'error', code: 'room_expired' }));
        ws.close(CLOSE_ROOM_EXPIRED, 'room expired');
      } catch {
        /* ignore */
      }
    }
    await this.state.storage.deleteAll();
  }

  // --- helpers -------------------------------------------------------------

  private liveSockets(role?: Role): WebSocket[] {
    const all = role ? this.state.getWebSockets(role) : this.state.getWebSockets();
    return all.filter((ws) => ws.readyState === WebSocket.READY_STATE_OPEN);
  }

  private sendTo(ws: WebSocket, payload: unknown): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Socket went away between the readyState check and the send.
    }
  }

  private getMeta(ws: WebSocket): SocketMeta | null {
    try {
      const raw = ws.deserializeAttachment();
      if (raw && typeof raw === 'object' && 'role' in raw) return raw as SocketMeta;
    } catch {
      /* fall through */
    }
    // Attachment lost (very old runtime); recover the role from the socket tag.
    try {
      const tags = this.state.getTags(ws);
      const role = tags.find((t): t is Role => t === 'sender' || t === 'receiver');
      if (role) return { role, windowStart: Date.now(), framesInWindow: 0 };
    } catch {
      /* ignore */
    }
    return null;
  }

  private setMeta(ws: WebSocket, meta: SocketMeta): void {
    try {
      ws.serializeAttachment(meta);
    } catch {
      /* ignore */
    }
  }
}
