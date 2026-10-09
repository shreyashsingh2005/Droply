import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, parseInboundFrame, resolveSignalingUrl } from './signaling';

const httpsPage = { protocol: 'https:', host: 'droply.example.com' };
const httpPage = { protocol: 'http:', host: 'localhost:5173' };

describe('resolveSignalingUrl', () => {
  it('uses the current origin in development so LAN devices can connect', () => {
    // Hardcoding 127.0.0.1 made the dev build unusable from a phone on the
    // same network; the Vite proxy forwards /room to the Worker instead.
    expect(resolveSignalingUrl('ABC123', 'sender', { dev: true, location: httpPage })).toBe(
      'ws://localhost:5173/room/ABC123?role=sender',
    );
  });

  it('accepts a bare hostname and upgrades it to wss', () => {
    expect(
      resolveSignalingUrl('ABC123', 'receiver', {
        dev: false,
        configured: 'droply-signaling.workers.dev',
        location: httpsPage,
      }),
    ).toBe('wss://droply-signaling.workers.dev/room/ABC123?role=receiver');
  });

  it('accepts an https URL', () => {
    expect(
      resolveSignalingUrl('ABC123', 'sender', {
        dev: false,
        configured: 'https://droply-signaling.workers.dev',
        location: httpsPage,
      }),
    ).toBe('wss://droply-signaling.workers.dev/room/ABC123?role=sender');
  });

  it('accepts an explicit wss URL unchanged', () => {
    expect(
      resolveSignalingUrl('ABC123', 'sender', {
        dev: false,
        configured: 'wss://signal.example.com',
        location: httpsPage,
      }),
    ).toBe('wss://signal.example.com/room/ABC123?role=sender');
  });

  it('never opens a plaintext socket from a secure page', () => {
    // A ws:// socket from an https:// page is blocked as mixed content, which
    // surfaced as an unexplained "WebSocket failed".
    expect(
      resolveSignalingUrl('ABC123', 'sender', {
        dev: false,
        configured: 'ws://signal.example.com',
        location: httpsPage,
      }),
    ).toBe('wss://signal.example.com/room/ABC123?role=sender');
  });

  it('discards any path, query or fragment on the configured value', () => {
    // Guards against the double-/room/room/ bug.
    expect(
      resolveSignalingUrl('ABC123', 'sender', {
        dev: false,
        configured: 'https://signal.example.com/room/?x=1#y',
        location: httpsPage,
      }),
    ).toBe('wss://signal.example.com/room/ABC123?role=sender');
  });

  it('falls back to the current origin when nothing is configured', () => {
    expect(
      resolveSignalingUrl('ABC123', 'sender', { dev: false, configured: '', location: httpsPage }),
    ).toBe('wss://droply.example.com/room/ABC123?role=sender');
  });

  it('falls back to the current origin when the configured value is unparseable', () => {
    expect(
      resolveSignalingUrl('ABC123', 'sender', {
        dev: false,
        configured: 'http://[not a url',
        location: httpsPage,
      }),
    ).toBe('wss://droply.example.com/room/ABC123?role=sender');
  });
});

describe('parseInboundFrame', () => {
  const ok = (value: unknown) => parseInboundFrame(JSON.stringify(value));

  it('accepts a welcome frame', () => {
    expect(ok({ type: 'welcome', protocol: PROTOCOL_VERSION, role: 'sender', peerPresent: true })).toEqual({
      type: 'welcome',
      protocol: PROTOCOL_VERSION,
      role: 'sender',
      peerPresent: true,
    });
  });

  it('accepts presence frames', () => {
    expect(ok({ type: 'peer-joined', role: 'receiver' })).toEqual({
      type: 'peer-joined',
      role: 'receiver',
    });
    expect(ok({ type: 'peer-left', role: 'sender' })).toEqual({
      type: 'peer-left',
      role: 'sender',
    });
  });

  it('accepts and normalises an offer', () => {
    expect(ok({ type: 'offer', sdp: { type: 'offer', sdp: 'v=0...' }, from: 'sender' })).toEqual({
      type: 'offer',
      sdp: { type: 'offer', sdp: 'v=0...' },
    });
  });

  it('accepts a candidate and keeps only known fields', () => {
    const frame = ok({
      type: 'candidate',
      candidate: {
        candidate: 'candidate:1 1 udp 1 10.0.0.1 1 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
        evil: 'payload',
      },
    });
    expect(frame).toEqual({
      type: 'candidate',
      candidate: {
        candidate: 'candidate:1 1 udp 1 10.0.0.1 1 typ host',
        sdpMid: '0',
        sdpMLineIndex: 0,
        usernameFragment: undefined,
      },
    });
    expect(frame && 'evil' in (frame as Record<string, unknown>)).toBe(false);
  });

  it('rejects malformed and unknown frames rather than passing them on', () => {
    expect(parseInboundFrame('not json')).toBeNull();
    expect(parseInboundFrame(123 as unknown)).toBeNull();
    expect(ok(null)).toBeNull();
    expect(ok([])).toBeNull();
    expect(ok({})).toBeNull();
    expect(ok({ type: 42 })).toBeNull();
    expect(ok({ type: 'something-else' })).toBeNull();
    expect(ok({ type: 'welcome', protocol: 'two', role: 'sender', peerPresent: true })).toBeNull();
    expect(ok({ type: 'peer-joined', role: 'imposter' })).toBeNull();
    expect(ok({ type: 'offer' })).toBeNull();
    expect(ok({ type: 'offer', sdp: { type: 'offer' } })).toBeNull();
    expect(ok({ type: 'offer', sdp: { type: 'nonsense', sdp: 'x' } })).toBeNull();
    expect(ok({ type: 'candidate', candidate: {} })).toBeNull();
  });

  it('reports an error frame with a safe default code', () => {
    expect(ok({ type: 'error' })).toEqual({ type: 'error', code: 'unknown', message: undefined });
    expect(ok({ type: 'error', code: 'rate_limited' })).toEqual({
      type: 'error',
      code: 'rate_limited',
      message: undefined,
    });
  });
});
