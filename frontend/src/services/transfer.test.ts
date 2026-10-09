import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * End-to-end tests for the transfer protocol.
 *
 * These drive two real `TransferSession` instances against each other over a
 * fake data channel that preserves the one property the protocol relies on --
 * reliable, ordered delivery -- and lets a test tamper with the stream. The
 * hashing, chunking, accounting and verification code under test is the real
 * code; only the transport is substituted.
 *
 * This is not a substitute for testing against two real browsers (see the
 * manual checklist in docs/TESTING.md), but it does cover the failure modes
 * that are impractical to produce by hand: a flipped byte, a dropped chunk, an
 * over-long sender.
 */

type Payload = ArrayBuffer | string;
type Transform = (data: Payload, binaryIndex: number) => Payload | null;

interface FakePeerShape {
  role: string;
  peer: FakePeerShape | null;
  closed: boolean;
  channel: {
    readyState: string;
    bufferedAmount: number;
    bufferedAmountLowThreshold: number;
    addEventListener: () => void;
    removeEventListener: () => void;
  };
  maxMessageSize: number;
  currentState: string;
  transform: Transform | null;
  binaryCount: number;
  handlers: Record<string, ((...args: never[]) => void) | undefined>;
  start: () => Promise<void>;
  send: (data: Payload) => boolean;
  sendBye: () => void;
  close: () => void;
}

vi.mock('./webrtc', () => {
  const registry: FakePeerShape[] = [];
  // One shared chain, so messages are delivered asynchronously but strictly
  // in order -- exactly what an ordered SCTP data channel guarantees.
  let chain: Promise<void> = Promise.resolve();

  class FakePeerConnection implements FakePeerShape {
    role: string;
    peer: FakePeerShape | null = null;
    closed = false;
    channel = {
      readyState: 'open',
      bufferedAmount: 0,
      _bufferedAmountLowThreshold: 0,
      get bufferedAmountLowThreshold() { return this._bufferedAmountLowThreshold; },
      set bufferedAmountLowThreshold(v) { this._bufferedAmountLowThreshold = v; },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    maxMessageSize = 16 * 1024;
    currentState = 'idle';
    transform: Transform | null = null;
    binaryCount = 0;
    handlers: Record<string, ((...args: never[]) => void) | undefined>;

    constructor(_roomId: string, role: string, handlers: Record<string, never>) {
      this.role = role;
      this.handlers = handlers;
      registry.push(this);
    }

    async start(): Promise<void> {
      this.currentState = 'connected';
      (this.handlers.onChannelOpen as (() => void) | undefined)?.();
    }

    send(data: Payload): boolean {
      if (this.closed) return false;
      const isBinary = typeof data !== 'string';
      const index = isBinary ? this.binaryCount++ : -1;
      const payload = this.transform ? this.transform(data, index) : data;
      if (payload === null) return true; // silently dropped, like a lost frame
      const target = this.peer;
      if (!target) return false;
      chain = chain.then(() => {
        if (target.closed) return;
        (target.handlers.onMessage as ((d: Payload) => void) | undefined)?.(payload);
      });
      return true;
    }

    sendBye(): void {
      /* no signalling in these tests */
    }

    close(): void {
      this.closed = true;
      this.currentState = 'closed';
    }
  }

  return {
    PeerConnection: FakePeerConnection,
    fetchIceConfig: async () => ({ iceServers: [], turn: false }),
    __registry: registry,
    __settle: () => chain,
  };
});

import * as webrtcModule from './webrtc';
import {
  MAX_FILES,
  MAX_FILENAME_LENGTH,
  TRANSFER_PROTOCOL_VERSION,
  TransferSession,
  parseFrame,
  type FileMetadata,
  type ReceivedFile,
  type TransferError,
} from './transfer';

const registry = (webrtcModule as unknown as { __registry: FakePeerShape[] }).__registry;
const settle = (webrtcModule as unknown as { __settle: () => Promise<void> }).__settle;

/** Run queued deliveries until nothing more is pending. */
async function drain(): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    await settle();
    // Yield to the microtask queue so handlers (which call send() synchronously)
    // have a chance to queue the next chain step before we resolve it.
    await new Promise<void>((resolve) => queueMicrotask(resolve as () => void));
  }
}

function bytes(length: number, seed = 1): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = (i * 31 + seed * 17) & 0xff;
  return out;
}

function makeFile(name: string, data: Uint8Array, type = ''): File {
  return new File([data as unknown as BlobPart], name, { type, lastModified: 1700000000000 });
}

async function readBlob(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

interface Harness {
  sender: TransferSession;
  receiver: TransferSession;
  senderPeer: FakePeerShape;
  receiverPeer: FakePeerShape;
  received: ReceivedFile[];
  manifest: FileMetadata[];
  senderErrors: TransferError[];
  receiverErrors: TransferError[];
  senderComplete: boolean;
  receiverComplete: boolean;
  rejected: boolean;
  cancelled: string[];
  acknowledged: number[];
}

/**
 * Build a linked sender/receiver pair. `autoAccept` mirrors a user tapping
 * Accept as soon as the manifest arrives.
 */
async function harness(
  files: File[],
  options: { autoAccept?: boolean; maxMessageSize?: number } = {},
): Promise<Harness> {
  const state = {
    received: [] as ReceivedFile[],
    manifest: [] as FileMetadata[],
    senderErrors: [] as TransferError[],
    receiverErrors: [] as TransferError[],
    senderComplete: false,
    receiverComplete: false,
    rejected: false,
    cancelled: [] as string[],
    acknowledged: [] as number[],
  };

  const receiver = new TransferSession('ABC123', 'receiver', {
    onManifest: (manifest) => {
      state.manifest = manifest;
      if (options.autoAccept !== false) receiver.accept();
    },
    onFileReady: (file) => state.received.push(file),
    onComplete: () => {
      state.receiverComplete = true;
    },
    onError: (error) => state.receiverErrors.push(error),
    onCancelled: (reason) => state.cancelled.push(reason ?? ''),
  });

  const sender = new TransferSession('ABC123', 'sender', {
    onChannelOpen: () => sender.sendManifest(files),
    onRejected: () => {
      state.rejected = true;
    },
    onFileAcknowledged: (index) => state.acknowledged.push(index),
    onComplete: () => {
      state.senderComplete = true;
    },
    onError: (error) => state.senderErrors.push(error),
    onCancelled: (reason) => state.cancelled.push(reason ?? ''),
  });

  const receiverPeer = registry.find((p) => p.role === 'receiver')!;
  const senderPeer = registry.find((p) => p.role === 'sender')!;
  senderPeer.peer = receiverPeer;
  receiverPeer.peer = senderPeer;

  if (options.maxMessageSize) {
    senderPeer.maxMessageSize = options.maxMessageSize;
    receiverPeer.maxMessageSize = options.maxMessageSize;
  }

  await receiver.start();
  await sender.start();

  return {
    sender,
    receiver,
    senderPeer,
    receiverPeer,
    get received() {
      return state.received;
    },
    get manifest() {
      return state.manifest;
    },
    get senderErrors() {
      return state.senderErrors;
    },
    get receiverErrors() {
      return state.receiverErrors;
    },
    get senderComplete() {
      return state.senderComplete;
    },
    get receiverComplete() {
      return state.receiverComplete;
    },
    get rejected() {
      return state.rejected;
    },
    get cancelled() {
      return state.cancelled;
    },
    get acknowledged() {
      return state.acknowledged;
    },
  } as Harness;
}

beforeEach(() => {
  registry.length = 0;
});

afterEach(() => {
  for (const peer of registry) peer.close();
  registry.length = 0;
});

describe('transfer round trip', () => {
  it('delivers a binary file byte-for-byte with a verified hash', async () => {
    const data = bytes(50_000);
    const h = await harness([makeFile('payload.bin', data, 'application/octet-stream')]);
    await drain();

    expect(h.received).toHaveLength(1);
    const file = h.received[0];
    expect(file.name).toBe('payload.bin');
    expect(file.size).toBe(data.length);
    expect(file.hashVerified).toBe(true);
    expect(await readBlob(file.blob)).toEqual(data);

    expect(h.acknowledged).toEqual([0]);
    expect(h.senderComplete).toBe(true);
    expect(h.receiverComplete).toBe(true);
    expect(h.senderErrors).toEqual([]);
    expect(h.receiverErrors).toEqual([]);
  });

  it('handles a zero-byte file', async () => {
    // A zero-byte file sends no chunks at all; completion comes from file-end
    // alone. Sending an empty binary frame instead used to be mishandled.
    const h = await harness([makeFile('empty.txt', new Uint8Array(0), 'text/plain')]);
    await drain();

    expect(h.received).toHaveLength(1);
    expect(h.received[0].size).toBe(0);
    expect(h.received[0].blob.size).toBe(0);
    expect(h.received[0].hashVerified).toBe(true);
    expect(h.senderComplete).toBe(true);
  });

  it('handles a file that is an exact multiple of the chunk size', async () => {
    const h = await harness([makeFile('aligned.bin', bytes(4096))], { maxMessageSize: 1024 });
    await drain();
    expect(h.received[0].size).toBe(4096);
    expect(h.senderComplete).toBe(true);
  });

  it('handles a file one byte over a chunk boundary', async () => {
    const h = await harness([makeFile('offbyone.bin', bytes(1025))], { maxMessageSize: 1024 });
    await drain();
    expect(h.received[0].size).toBe(1025);
    expect(h.senderComplete).toBe(true);
  });

  it('transfers a multi-megabyte file across many chunks', async () => {
    const data = bytes(1024 * 1024, 9);
    const h = await harness([makeFile('big.bin', data)], { maxMessageSize: 16 * 1024 });
    await drain();

    expect(h.received).toHaveLength(1);
    expect(h.received[0].size).toBe(data.length);
    expect(await readBlob(h.received[0].blob)).toEqual(data);
    expect(h.senderComplete).toBe(true);
  });

  it('transfers several files, including duplicate and Unicode names', async () => {
    const a = bytes(1000, 1);
    const b = bytes(2000, 2);
    const c = bytes(3000, 3);
    const h = await harness([
      makeFile('report.pdf', a, 'application/pdf'),
      makeFile('report.pdf', b, 'application/pdf'),
      makeFile('休暇 🎉.png', c, ''),
    ]);
    await drain();

    expect(h.received).toHaveLength(3);
    // Files are addressed by index, so duplicate names stay distinct.
    expect(h.received.map((f) => f.index)).toEqual([0, 1, 2]);
    expect(await readBlob(h.received[0].blob)).toEqual(a);
    expect(await readBlob(h.received[1].blob)).toEqual(b);
    expect(await readBlob(h.received[2].blob)).toEqual(c);
    expect(h.received[2].name).toBe('休暇 🎉.png');
    expect(h.acknowledged).toEqual([0, 1, 2]);
    expect(h.senderComplete).toBe(true);
  });

  it('carries the MIME type through, inferring it when the sender had none', async () => {
    // The receiving Blob must have a usable type or the saved file will not
    // open in the right application.
    const h = await harness([
      makeFile('photo.jpg', bytes(500)),
      makeFile('archive.zip', bytes(500)),
      makeFile('doc.pdf', bytes(500), 'application/pdf'),
    ]);
    await drain();

    expect(h.received[0].type).toBe('image/jpeg');
    expect(h.received[0].blob.type).toBe('image/jpeg');
    expect(h.received[1].type).toBe('application/zip');
    expect(h.received[2].type).toBe('application/pdf');
  });
});

describe('integrity enforcement', () => {
  it('rejects a file with a single flipped byte and never offers it', async () => {
    const h = await harness([makeFile('tampered.bin', bytes(40_000))], { maxMessageSize: 4096 });
    // Corrupt one chunk in flight, keeping the length identical so only the
    // hash can catch it.
    h.senderPeer.transform = (data, index) => {
      if (index !== 3 || typeof data === 'string') return data;
      const view = new Uint8Array(data.slice(0));
      view[10] ^= 0xff;
      return view.buffer;
    };
    await drain();

    expect(h.received).toHaveLength(0); // the critical guarantee
    expect(h.receiverErrors.map((e) => e.code)).toContain('hash-mismatch');
    expect(h.senderErrors.map((e) => e.code)).toContain('hash-mismatch');
    expect(h.senderComplete).toBe(false);
    expect(h.receiverComplete).toBe(false);
  });

  it('detects a dropped chunk as a size mismatch', async () => {
    const h = await harness([makeFile('truncated.bin', bytes(40_000))], { maxMessageSize: 4096 });
    h.senderPeer.transform = (data, index) => (index === 2 ? null : data);
    await drain();

    expect(h.received).toHaveLength(0);
    expect(h.receiverErrors.map((e) => e.code)).toContain('size-mismatch');
    expect(h.senderComplete).toBe(false);
  });

  it('refuses a sender that pushes more data than it declared', async () => {
    const h = await harness([makeFile('overflow.bin', bytes(8192))], { maxMessageSize: 4096 });
    h.senderPeer.transform = (data, index) => {
      if (index !== 0 || typeof data === 'string') return data;
      // Double the chunk, so the running total exceeds the declared size.
      const grown = new Uint8Array(data.byteLength * 2);
      grown.set(new Uint8Array(data), 0);
      return grown.buffer;
    };
    await drain();

    expect(h.received).toHaveLength(0);
    expect(h.receiverErrors.map((e) => e.code)).toContain('overflow');
  });

  it('stops the whole transfer when one file of several fails', async () => {
    const good = bytes(2000, 4);
    const h = await harness([makeFile('first.bin', good), makeFile('second.bin', bytes(8000, 5))], {
      maxMessageSize: 2048,
    });
    // Corrupt a chunk belonging to the second file. The first file is 1 chunk
    // (2000 bytes), so binary index 1 is the second file's first chunk.
    h.senderPeer.transform = (data, index) => {
      if (index !== 1 || typeof data === 'string') return data;
      const view = new Uint8Array(data.slice(0));
      view[0] ^= 0xff;
      return view.buffer;
    };
    await drain();

    // The first file completed and was verified before the failure, so it is
    // still legitimately available.
    expect(h.received.map((f) => f.name)).toEqual(['first.bin']);
    expect(await readBlob(h.received[0].blob)).toEqual(good);
    expect(h.senderComplete).toBe(false);
    expect(h.receiverErrors.map((e) => e.code)).toContain('hash-mismatch');
  });
});

describe('control flow', () => {
  it('sends nothing when the receiver declines', async () => {
    const h = await harness([makeFile('private.bin', bytes(5000))], { autoAccept: false });
    await drain();
    expect(h.manifest).toHaveLength(1);

    const binaryBefore = h.senderPeer.binaryCount;
    h.receiver.reject();
    await drain();

    expect(h.rejected).toBe(true);
    expect(h.senderPeer.binaryCount).toBe(binaryBefore); // no bytes left
    expect(h.received).toHaveLength(0);
  });

  it('propagates a cancel and stops the transfer', async () => {
    const h = await harness([makeFile('big.bin', bytes(400_000))], { maxMessageSize: 4096 });
    // Cancel after the first few chunks have gone out.
    h.senderPeer.transform = (data, index) => {
      if (index === 2) h.receiver.cancel('changed my mind');
      return data;
    };
    await drain();

    expect(h.received).toHaveLength(0);
    expect(h.senderComplete).toBe(false);
    expect(h.sender.isCancelled || h.senderErrors.length > 0).toBe(true);
  });

  it('describes the manifest before any bytes move', async () => {
    const h = await harness([makeFile('a.txt', bytes(10), 'text/plain')], { autoAccept: false });
    await drain();

    expect(h.manifest).toEqual([
      { index: 0, name: 'a.txt', size: 10, type: 'text/plain' },
    ]);
    expect(h.senderPeer.binaryCount).toBe(0);
  });

  it('ignores a frame from a stale transfer', async () => {
    const h = await harness([makeFile('a.txt', bytes(10))]);
    await drain();
    expect(h.senderComplete).toBe(true);

    const errorsBefore = h.receiverErrors.length;
    // A late frame bearing a different transfer id must not disturb anything.
    h.senderPeer.send(
      JSON.stringify({
        v: TRANSFER_PROTOCOL_VERSION,
        type: 'file-begin',
        transferId: 'not-the-live-transfer',
        index: 0,
      }),
    );
    await drain();
    expect(h.receiverErrors).toHaveLength(errorsBefore);
  });

  it('reports a protocol version mismatch in plain language', async () => {
    const h = await harness([makeFile('a.txt', bytes(10))], { autoAccept: false });
    await drain();

    h.senderPeer.send(
      JSON.stringify({ v: 99, type: 'file-begin', transferId: 'x', index: 0 }),
    );
    await drain();

    const error = h.receiverErrors.find((e) => e.code === 'protocol');
    expect(error).toBeDefined();
    expect(error?.message).toMatch(/incompatible version/i);
    expect(error?.message).toMatch(/reload/i);
  });

  it('drops malformed control frames without failing the session', async () => {
    const h = await harness([makeFile('a.txt', bytes(10))], { autoAccept: false });
    await drain();

    h.senderPeer.send('this is not json');
    h.senderPeer.send(JSON.stringify({ nope: true }));
    h.senderPeer.send(JSON.stringify({ type: 'unknown-frame', transferId: 'x', v: 2 }));
    await drain();

    expect(h.receiverErrors).toEqual([]);
    // The session is still usable afterwards.
    h.receiver.accept();
    await drain();
    expect(h.received).toHaveLength(1);
  });

  it('drops binary data that arrives with no file in progress', async () => {
    const h = await harness([makeFile('a.txt', bytes(10))], { autoAccept: false });
    await drain();

    h.senderPeer.send(bytes(100).buffer as ArrayBuffer);
    await drain();
    expect(h.receiverErrors).toEqual([]);
    expect(h.received).toHaveLength(0);
  });
});

describe('parseFrame validation', () => {
  const frame = (value: unknown) => parseFrame(JSON.stringify(value));

  it('rejects structurally invalid frames', () => {
    expect(parseFrame('nope')).toBeNull();
    expect(frame(null)).toBeNull();
    expect(frame({})).toBeNull();
    expect(frame({ type: 'manifest' })).toBeNull(); // no transferId
    expect(frame({ type: 'manifest', transferId: 'x' })).toBeNull(); // no files
    expect(frame({ type: 'manifest', transferId: 'x', files: [] })).toBeNull();
  });

  it('rejects a manifest with too many files', () => {
    const files = Array.from({ length: MAX_FILES + 1 }, (_, i) => ({
      name: `f${i}`,
      size: 1,
      type: '',
    }));
    expect(frame({ type: 'manifest', transferId: 'x', files })).toBeNull();
  });

  it('rejects implausible file entries', () => {
    const bad = (file: unknown) => frame({ type: 'manifest', transferId: 'x', files: [file] });
    expect(bad({ name: '', size: 1, type: '' })).toBeNull();
    expect(bad({ name: 'a', size: -1, type: '' })).toBeNull();
    expect(bad({ name: 'a', size: 1.5, type: '' })).toBeNull();
    expect(bad({ name: 'a', size: 3 * 1024 * 1024 * 1024, type: '' })).toBeNull();
    expect(bad({ name: 'a'.repeat(MAX_FILENAME_LENGTH + 1), size: 1, type: '' })).toBeNull();
    expect(bad({ name: 'a' })).toBeNull();
  });

  it('sanitises peer-supplied file names in the manifest', () => {
    const parsed = frame({
      type: 'manifest',
      transferId: 'x',
      files: [{ name: '../../../etc/passwd', size: 1, type: 'text/plain' }],
    });
    expect(parsed).not.toBeNull();
    expect(parsed && 'files' in parsed && parsed.files[0].name).toBe('passwd');
  });

  it('assigns indices from position, ignoring any the peer supplied', () => {
    const parsed = frame({
      type: 'manifest',
      transferId: 'x',
      files: [
        { name: 'a', size: 1, type: '', index: 99 },
        { name: 'b', size: 2, type: '', index: 99 },
      ],
    });
    expect(parsed && 'files' in parsed && parsed.files.map((f) => f.index)).toEqual([0, 1]);
  });

  it('clamps an over-long cancel reason', () => {
    const parsed = frame({ type: 'cancel', transferId: 'x', reason: 'r'.repeat(5000) });
    expect(parsed && 'reason' in parsed && parsed.reason?.length).toBe(200);
  });
});
