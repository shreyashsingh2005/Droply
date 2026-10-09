/**
 * File transfer protocol (v2) over an RTCDataChannel.
 *
 * Frames are JSON strings; file payloads are raw binary messages. The channel
 * is reliable and ordered, so chunk sequencing is guaranteed by SCTP -- but we
 * verify it anyway rather than trust it: every file is accounted for by byte
 * count, chunk count *and* SHA-256, and the receiver explicitly acknowledges
 * each file before the sender moves on. A transfer is reported as complete
 * only once that acknowledgement arrives.
 *
 * Memory behaviour (this is the part that used to crash tabs):
 *  - the sender hashes incrementally while slicing, so it never holds more
 *    than one chunk;
 *  - the receiver hashes incrementally as chunks arrive and batches them into
 *    ~4 MB Blobs, letting the browser spill them to disk, so peak memory is a
 *    batch rather than the whole file. There is no second full-file read for
 *    verification.
 */

import { log } from '../lib/logger';
import { PeerConnection, type PeerFailure, type PeerHandlers, type PeerState } from './webrtc';
import type { Role } from './signaling';
import { Sha256 } from './sha256';
import { resolveMimeType, sanitizeFilename } from './mime';

export const TRANSFER_PROTOCOL_VERSION = 2;

/** Interop-safe ceiling; the real value is clamped to SCTP's maxMessageSize. */
const MAX_CHUNK_BYTES = 64 * 1024;
/** Pause reading once this much is sitting in the send buffer. */
const SEND_HIGH_WATER = 1024 * 1024;
/** Resume once it drains to here. */
const SEND_LOW_WATER = 256 * 1024;
/** Flush received chunks into a Blob every time we accumulate this much. */
const RECEIVE_BATCH_BYTES = 4 * 1024 * 1024;
/** How long to wait for the receiver to confirm a file before failing. */
const ACK_TIMEOUT_MS = 60_000;

/** Defensive limits on what a peer may declare. */
export const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
export const MAX_FILES = 100;
export const MAX_FILENAME_LENGTH = 255;

export interface FileMetadata {
  index: number;
  name: string;
  size: number;
  type: string;
}

export interface ReceivedFile {
  index: number;
  name: string;
  size: number;
  type: string;
  blob: Blob;
  hash: string;
  hashVerified: boolean;
}

export interface TransferProgress {
  index: number;
  /** Bytes of the current file. */
  fileBytes: number;
  fileTotal: number;
  /** Bytes across the whole transfer. */
  totalBytes: number;
  grandTotal: number;
  /** Measured throughput. `null` until we have a reliable measurement. */
  bytesPerSecond: number | null;
  /** Derived from the measurement above. `null` when unknown. */
  etaSeconds: number | null;
}

export type TransferErrorCode =
  | 'size-mismatch'
  | 'chunk-mismatch'
  | 'hash-mismatch'
  | 'overflow'
  | 'protocol'
  | 'rejected'
  | 'cancelled'
  | 'channel-closed'
  | 'ack-timeout'
  | 'too-large'
  | 'read-failed';

export interface TransferError {
  code: TransferErrorCode;
  message: string;
  index?: number;
}

type Frame =
  | { v: number; type: 'manifest'; transferId: string; files: FileMetadata[] }
  | { v: number; type: 'accept'; transferId: string }
  | { v: number; type: 'reject'; transferId: string }
  | { v: number; type: 'file-begin'; transferId: string; index: number }
  | {
      v: number;
      type: 'file-end';
      transferId: string;
      index: number;
      bytes: number;
      chunks: number;
      hash: string;
    }
  | {
      v: number;
      type: 'file-ack';
      transferId: string;
      index: number;
      ok: boolean;
      bytes: number;
      code?: TransferErrorCode;
    }
  | { v: number; type: 'all-done'; transferId: string }
  | { v: number; type: 'cancel'; transferId: string; reason?: string }
  | {
      v: number;
      type: 'error';
      transferId: string;
      index?: number;
      code: TransferErrorCode;
      message: string;
    };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/** Validate a control frame before acting on it. Peer input is never trusted. */
export function parseFrame(raw: string): Frame | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || typeof data.type !== 'string' || typeof data.transferId !== 'string') {
    return null;
  }
  const v = typeof data.v === 'number' ? data.v : 1;
  const transferId = data.transferId;

  switch (data.type) {
    case 'manifest': {
      if (!Array.isArray(data.files) || data.files.length === 0) return null;
      if (data.files.length > MAX_FILES) return null;
      const files: FileMetadata[] = [];
      for (let i = 0; i < data.files.length; i++) {
        const f: unknown = data.files[i];
        if (!isRecord(f)) return null;
        if (typeof f.name !== 'string' || f.name.length === 0) return null;
        if (f.name.length > MAX_FILENAME_LENGTH) return null;
        if (typeof f.size !== 'number' || !Number.isInteger(f.size) || f.size < 0) return null;
        if (f.size > MAX_FILE_BYTES) return null;
        files.push({
          index: i,
          name: sanitizeFilename(f.name, `file-${i + 1}`),
          size: f.size,
          type: typeof f.type === 'string' ? f.type.slice(0, 128) : '',
        });
      }
      return { v, type: 'manifest', transferId, files };
    }
    case 'accept':
    case 'reject':
    case 'all-done':
      return { v, type: data.type, transferId };
    case 'file-begin':
      if (typeof data.index !== 'number' || !Number.isInteger(data.index) || data.index < 0) {
        return null;
      }
      return { v, type: 'file-begin', transferId, index: data.index };
    case 'file-end':
      if (
        typeof data.index !== 'number' ||
        typeof data.bytes !== 'number' ||
        typeof data.chunks !== 'number' ||
        typeof data.hash !== 'string'
      ) {
        return null;
      }
      return {
        v,
        type: 'file-end',
        transferId,
        index: data.index,
        bytes: data.bytes,
        chunks: data.chunks,
        hash: data.hash,
      };
    case 'file-ack':
      if (typeof data.index !== 'number' || typeof data.ok !== 'boolean') return null;
      return {
        v,
        type: 'file-ack',
        transferId,
        index: data.index,
        ok: data.ok,
        bytes: typeof data.bytes === 'number' ? data.bytes : 0,
        code: typeof data.code === 'string' ? (data.code as TransferErrorCode) : undefined,
      };
    case 'cancel':
      return {
        v,
        type: 'cancel',
        transferId,
        reason: typeof data.reason === 'string' ? data.reason.slice(0, 200) : undefined,
      };
    case 'error':
      return {
        v,
        type: 'error',
        transferId,
        index: typeof data.index === 'number' ? data.index : undefined,
        code: typeof data.code === 'string' ? (data.code as TransferErrorCode) : 'protocol',
        message: typeof data.message === 'string' ? data.message.slice(0, 300) : 'unknown error',
      };
    default:
      return null;
  }
}

/** Tracks throughput over a short sliding window. Never guesses. */
class RateMeter {
  private samples: { t: number; bytes: number }[] = [];
  private readonly windowMs = 3_000;

  add(bytes: number): void {
    const now = Date.now();
    this.samples.push({ t: now, bytes });
    while (this.samples.length > 2 && now - this.samples[0].t > this.windowMs) {
      this.samples.shift();
    }
  }

  reset(): void {
    this.samples = [];
  }

  /** `null` until there is enough data for an honest number. */
  bytesPerSecond(): number | null {
    if (this.samples.length < 2) return null;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const elapsed = last.t - first.t;
    if (elapsed < 500) return null;
    const delta = last.bytes - first.bytes;
    if (delta <= 0) return null;
    return (delta * 1000) / elapsed;
  }
}

export interface TransferHandlers {
  onState?: (state: PeerState, detail?: PeerFailure) => void;
  /** The data channel is open; the session can now exchange frames. */
  onChannelOpen?: () => void;
  onPeerLeft?: (wasConnected: boolean) => void;
  /** Receiver: the sender has described what it wants to send. */
  onManifest?: (files: FileMetadata[], grandTotal: number) => void;
  /** Sender: the receiver accepted; transfer is starting. */
  onAccepted?: () => void;
  /** Sender: the receiver declined. */
  onRejected?: () => void;
  onProgress?: (progress: TransferProgress) => void;
  /** Receiver: a file is fully received, reassembled and verified. */
  onFileReady?: (file: ReceivedFile) => void;
  /** Sender: the receiver confirmed this file arrived intact. */
  onFileAcknowledged?: (index: number) => void;
  /** Every file done and confirmed. */
  onComplete?: () => void;
  onError?: (error: TransferError) => void;
  /** The other side cancelled. */
  onCancelled?: (reason?: string) => void;
}

/**
 * Owns a PeerConnection and implements the transfer protocol on top of it.
 * One instance per session; call `close()` exactly once when done.
 */
export class TransferSession {
  readonly peer: PeerConnection;
  private readonly role: Role;
  private readonly handlers: TransferHandlers;

  private transferId = '';
  private closed = false;
  private cancelled = false;

  // --- sender state
  private outgoing: File[] = [];
  private sending = false;
  private grandTotalOut = 0;
  private sentTotal = 0;
  private pendingAck: {
    index: number;
    resolve: (ok: boolean, code?: TransferErrorCode) => void;
    timer: number;
  } | null = null;

  // --- receiver state
  private manifest: FileMetadata[] = [];
  private grandTotalIn = 0;
  private receivedTotal = 0;
  private assembling: {
    meta: FileMetadata;
    hasher: Sha256;
    parts: Blob[];
    pendingChunks: Uint8Array[];
    pendingBytes: number;
    bytes: number;
    chunks: number;
  } | null = null;

  private meter = new RateMeter();

  constructor(roomId: string, role: Role, handlers: TransferHandlers = {}) {
    this.role = role;
    this.handlers = handlers;

    const peerHandlers: PeerHandlers = {
      onState: (state, detail) => {
        if (state === 'failed' || state === 'timed-out') this.abortInFlight('channel-closed');
        this.handlers.onState?.(state, detail);
      },
      onChannelOpen: () => this.handlers.onChannelOpen?.(),
      onMessage: (data) => this.onMessage(data),
      onPeerLeft: (wasConnected) => {
        if (wasConnected) this.abortInFlight('channel-closed');
        this.handlers.onPeerLeft?.(wasConnected);
      },
      onPeerBye: () => this.abortInFlight('channel-closed'),
    };

    this.peer = new PeerConnection(roomId, role, peerHandlers);
  }

  start(): Promise<void> {
    return this.peer.start();
  }

  get isCancelled(): boolean {
    return this.cancelled;
  }

  // --- message dispatch ----------------------------------------------------

  private onMessage(data: ArrayBuffer | string): void {
    if (this.closed) return;

    if (typeof data === 'string') {
      const frame = parseFrame(data);
      if (!frame) {
        log.transfer.warn('dropped malformed control frame');
        return;
      }
      if (frame.v !== TRANSFER_PROTOCOL_VERSION) {
        this.fail({
          code: 'protocol',
          message: `The other device is running an incompatible version of Droply (protocol ${frame.v}, expected ${TRANSFER_PROTOCOL_VERSION}). Both sides should reload the page.`,
        });
        return;
      }
      this.handleFrame(frame);
      return;
    }

    this.handleChunk(new Uint8Array(data));
  }

  private handleFrame(frame: Frame): void {
    // Everything except the opening manifest must belong to the live transfer.
    if (frame.type !== 'manifest' && this.transferId && frame.transferId !== this.transferId) {
      log.transfer.warn('ignoring frame from a stale transfer');
      return;
    }

    switch (frame.type) {
      case 'manifest': {
        if (this.role !== 'receiver') return;
        this.transferId = frame.transferId;
        this.manifest = frame.files;
        this.grandTotalIn = frame.files.reduce((sum, f) => sum + f.size, 0);
        this.receivedTotal = 0;
        this.meter.reset();
        log.transfer.debug('manifest received', {
          files: frame.files.length,
          totalBytes: this.grandTotalIn,
        });
        this.handlers.onManifest?.(frame.files, this.grandTotalIn);
        break;
      }

      case 'accept':
        if (this.role !== 'sender') return;
        this.handlers.onAccepted?.();
        void this.runSendLoop();
        break;

      case 'reject':
        if (this.role !== 'sender') return;
        this.handlers.onRejected?.();
        break;

      case 'file-begin': {
        if (this.role !== 'receiver') return;
        const meta = this.manifest[frame.index];
        if (!meta) {
          this.fail({ code: 'protocol', message: 'The sender referenced a file we do not know about.' });
          return;
        }
        this.assembling = {
          meta,
          hasher: new Sha256(),
          parts: [],
          pendingChunks: [],
          pendingBytes: 0,
          bytes: 0,
          chunks: 0,
        };
        log.transfer.debug('file-begin', { index: frame.index, size: meta.size });
        break;
      }

      case 'file-end':
        if (this.role !== 'receiver') return;
        this.finishIncomingFile(frame.index, frame.bytes, frame.chunks, frame.hash);
        break;

      case 'file-ack': {
        if (this.role !== 'sender') return;
        const waiting = this.pendingAck;
        if (waiting && waiting.index === frame.index) {
          clearTimeout(waiting.timer);
          this.pendingAck = null;
          waiting.resolve(frame.ok, frame.code);
        }
        break;
      }

      case 'all-done':
        if (this.role !== 'receiver') return;
        this.handlers.onComplete?.();
        break;

      case 'cancel':
        this.cancelled = true;
        this.assembling = null;
        this.abortInFlight('cancelled');
        this.handlers.onCancelled?.(frame.reason);
        break;

      case 'error':
        this.handlers.onError?.({ code: frame.code, message: frame.message, index: frame.index });
        break;
    }
  }

  private send(frame: Frame): boolean {
    return this.peer.send(JSON.stringify(frame));
  }

  // --- sender --------------------------------------------------------------

  /** Describe the files we want to send. Idempotent per session. */
  sendManifest(files: File[]): void {
    if (this.role !== 'sender' || this.closed) return;
    if (files.length === 0) return;
    if (files.length > MAX_FILES) {
      this.fail({ code: 'too-large', message: `Droply sends at most ${MAX_FILES} files at a time.` });
      return;
    }
    const oversized = files.find((f) => f.size > MAX_FILE_BYTES);
    if (oversized) {
      this.fail({ code: 'too-large', message: 'One of the selected files is larger than the 2 GB limit.' });
      return;
    }

    this.outgoing = files;
    this.transferId = crypto.randomUUID();
    this.grandTotalOut = files.reduce((sum, f) => sum + f.size, 0);
    this.sentTotal = 0;
    this.meter.reset();

    this.send({
      v: TRANSFER_PROTOCOL_VERSION,
      type: 'manifest',
      transferId: this.transferId,
      files: files.map((f, index) => ({
        index,
        name: sanitizeFilename(f.name, `file-${index + 1}`),
        size: f.size,
        type: resolveMimeType(f.name, f.type),
      })),
    });
    log.transfer.debug('manifest sent', { files: files.length, totalBytes: this.grandTotalOut });
  }

  private async runSendLoop(): Promise<void> {
    if (this.sending || this.closed) return;
    this.sending = true;

    try {
      for (let index = 0; index < this.outgoing.length; index++) {
        if (this.closed || this.cancelled) return;
        const ok = await this.sendOneFile(index);
        if (!ok) return;
      }
      if (this.closed || this.cancelled) return;
      this.send({ v: TRANSFER_PROTOCOL_VERSION, type: 'all-done', transferId: this.transferId });
      log.transfer.debug('all files acknowledged');
      this.handlers.onComplete?.();
    } catch (err) {
      // Nothing in this loop may escape as an unhandled rejection.
      log.transfer.error('send loop failed', err);
      this.fail({
        code: 'read-failed',
        message:
          'Could not read one of the selected files. It may have been moved, renamed, or deleted since you chose it.',
      });
    } finally {
      this.sending = false;
    }
  }

  private async sendOneFile(index: number): Promise<boolean> {
    const file = this.outgoing[index];
    const chunkSize = Math.min(MAX_CHUNK_BYTES, Math.max(1024, this.peer.maxMessageSize));
    const hasher = new Sha256();
    let offset = 0;
    let chunks = 0;

    this.send({ v: TRANSFER_PROTOCOL_VERSION, type: 'file-begin', transferId: this.transferId, index });
    this.emitProgress(index, 0, file.size, this.sentTotal, this.grandTotalOut);

    // A zero-byte file is a real file: it sends no chunks at all, and is
    // completed by file-end alone. (Sending an empty binary frame instead used
    // to upset some engines.)
    while (offset < file.size) {
      if (this.closed || this.cancelled) return false;
      if (!this.channelReady()) {
        this.fail({
          code: 'channel-closed',
          message: 'The connection to the other device dropped during the transfer.',
          index,
        });
        return false;
      }

      await this.waitForDrain();
      if (this.closed || this.cancelled) return false;

      const end = Math.min(offset + chunkSize, file.size);
      const buffer = await file.slice(offset, end).arrayBuffer();
      const bytes = new Uint8Array(buffer);

      // Hash while we have the chunk in hand: one pass, one chunk of memory.
      hasher.update(bytes);

      if (!this.peer.send(buffer)) {
        this.fail({
          code: 'channel-closed',
          message: 'The connection to the other device dropped during the transfer.',
          index,
        });
        return false;
      }

      offset = end;
      chunks += 1;
      this.sentTotal += bytes.length;
      this.meter.add(this.sentTotal);
      this.emitProgress(index, offset, file.size, this.sentTotal, this.grandTotalOut);
    }

    const hash = hasher.hex();
    this.send({
      v: TRANSFER_PROTOCOL_VERSION,
      type: 'file-end',
      transferId: this.transferId,
      index,
      bytes: file.size,
      chunks,
      hash,
    });

    // Only the receiver can tell us the file arrived intact. Until it does,
    // this file is not done.
    const ack = await this.awaitAck(index);
    if (!ack.ok) {
      if (ack.timedOut) {
        this.fail({
          code: 'ack-timeout',
          message: 'The other device stopped responding before confirming the file.',
          index,
        });
      } else {
        this.fail({
          code: ack.code ?? 'hash-mismatch',
          message:
            'The other device reported that the file did not arrive intact. Nothing was saved there; please try again.',
          index,
        });
      }
      return false;
    }

    this.handlers.onFileAcknowledged?.(index);
    return true;
  }

  private awaitAck(
    index: number,
  ): Promise<{ ok: boolean; timedOut: boolean; code?: TransferErrorCode }> {
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok: boolean, timedOut: boolean, code?: TransferErrorCode) => {
        if (settled) return;
        settled = true;
        resolve({ ok, timedOut, code });
      };
      const timer = window.setTimeout(() => {
        this.pendingAck = null;
        done(false, true);
      }, ACK_TIMEOUT_MS);
      this.pendingAck = {
        index,
        timer,
        resolve: (ok, code) => done(ok, false, code),
      };
    });
  }

  /** Honour SCTP backpressure using the buffer-low event, not a poll loop. */
  private waitForDrain(): Promise<void> {
    const dc = this.peer.channel;
    if (!dc || dc.bufferedAmount <= SEND_HIGH_WATER) return Promise.resolve();

    return new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(safety);
        dc.removeEventListener('bufferedamountlow', finish);
        resolve();
      };
      // Safety net: if an engine fails to fire the event we must not stall the
      // transfer forever.
      const safety = window.setTimeout(finish, 1_000);
      dc.bufferedAmountLowThreshold = SEND_LOW_WATER;
      dc.addEventListener('bufferedamountlow', finish);
    });
  }

  private channelReady(): boolean {
    return this.peer.channel?.readyState === 'open';
  }

  // --- receiver ------------------------------------------------------------

  /** Accept the described transfer. */
  accept(): void {
    if (this.role !== 'receiver' || this.closed || !this.transferId) return;
    this.send({ v: TRANSFER_PROTOCOL_VERSION, type: 'accept', transferId: this.transferId });
  }

  reject(): void {
    if (this.role !== 'receiver' || this.closed || !this.transferId) return;
    this.send({ v: TRANSFER_PROTOCOL_VERSION, type: 'reject', transferId: this.transferId });
  }

  private handleChunk(bytes: Uint8Array): void {
    const target = this.assembling;
    if (!target) {
      // Bytes with no file-begin: either a stale frame from a cancelled
      // transfer or a confused peer. Dropping is the safe response.
      log.transfer.warn('dropped chunk with no active file');
      return;
    }

    // Never let a peer push more than it declared -- that is how a buggy or
    // hostile sender would exhaust memory.
    if (target.bytes + bytes.length > target.meta.size) {
      this.failAndTell(
        {
          code: 'overflow',
          message: 'The sender sent more data than it declared, so the transfer was stopped.',
          index: target.meta.index,
        },
        target.meta.index,
      );
      this.assembling = null;
      return;
    }

    target.hasher.update(bytes);
    target.bytes += bytes.length;
    target.chunks += 1;
    target.pendingChunks.push(bytes);
    target.pendingBytes += bytes.length;

    // Roll completed batches into a Blob so the browser can move them out of
    // the JS heap (and onto disk for large files).
    if (target.pendingBytes >= RECEIVE_BATCH_BYTES) {
      target.parts.push(new Blob(target.pendingChunks as unknown as BlobPart[]));
      target.pendingChunks = [];
      target.pendingBytes = 0;
    }

    this.receivedTotal += bytes.length;
    this.meter.add(this.receivedTotal);
    this.emitProgress(
      target.meta.index,
      target.bytes,
      target.meta.size,
      this.receivedTotal,
      this.grandTotalIn,
    );
  }

  /**
   * Synchronous on purpose: it must run to completion in the same task as the
   * `file-end` frame, so no other message can interleave with the final
   * accounting.
   */
  private finishIncomingFile(
    index: number,
    declaredBytes: number,
    declaredChunks: number,
    declaredHash: string,
  ): void {
    const target = this.assembling;
    this.assembling = null;

    if (!target || target.meta.index !== index) {
      this.failAndTell(
        { code: 'protocol', message: 'The transfer went out of sequence and was stopped.', index },
        index,
      );
      return;
    }

    // Three independent checks. All must pass before the file is offered.
    if (target.bytes !== declaredBytes || target.bytes !== target.meta.size) {
      this.failAndTell(
        {
          code: 'size-mismatch',
          message: `"${target.meta.name}" arrived incomplete (${target.bytes} of ${target.meta.size} bytes). It was not saved.`,
          index,
        },
        index,
        'size-mismatch',
      );
      return;
    }
    if (target.chunks !== declaredChunks) {
      this.failAndTell(
        {
          code: 'chunk-mismatch',
          message: `"${target.meta.name}" is missing part of its data. It was not saved.`,
          index,
        },
        index,
        'chunk-mismatch',
      );
      return;
    }

    const actualHash = target.hasher.hex();
    if (actualHash !== declaredHash) {
      this.failAndTell(
        {
          code: 'hash-mismatch',
          message: `"${target.meta.name}" failed its integrity check — the received bytes do not match the original. It was not saved.`,
          index,
        },
        index,
        'hash-mismatch',
      );
      return;
    }

    if (target.pendingChunks.length > 0) {
      target.parts.push(new Blob(target.pendingChunks as unknown as BlobPart[]));
      target.pendingChunks = [];
      target.pendingBytes = 0;
    }

    // Carry an accurate MIME type so the file opens in the right app. An empty
    // `File.type` from the sender is filled in from the extension.
    const type = resolveMimeType(target.meta.name, target.meta.type);
    const blob = new Blob(target.parts, { type });

    if (blob.size !== target.meta.size) {
      this.failAndTell(
        {
          code: 'size-mismatch',
          message: `"${target.meta.name}" could not be reassembled correctly. It was not saved.`,
          index,
        },
        index,
        'size-mismatch',
      );
      return;
    }

    log.transfer.debug('file verified', { index, bytes: blob.size });

    this.handlers.onFileReady?.({
      index,
      name: target.meta.name,
      size: target.meta.size,
      type,
      blob,
      hash: actualHash,
      hashVerified: true,
    });

    // Tell the sender only after reassembly and verification succeeded.
    this.send({
      v: TRANSFER_PROTOCOL_VERSION,
      type: 'file-ack',
      transferId: this.transferId,
      index,
      ok: true,
      bytes: blob.size,
    });
  }

  // --- shared --------------------------------------------------------------

  private emitProgress(
    index: number,
    fileBytes: number,
    fileTotal: number,
    totalBytes: number,
    grandTotal: number,
  ): void {
    const bps = this.meter.bytesPerSecond();
    const remaining = grandTotal - totalBytes;
    this.handlers.onProgress?.({
      index,
      fileBytes,
      fileTotal,
      totalBytes,
      grandTotal,
      bytesPerSecond: bps,
      etaSeconds: bps !== null && bps > 0 && remaining > 0 ? remaining / bps : null,
    });
  }

  /** Cancel from this side and tell the peer. */
  cancel(reason = 'cancelled by user'): void {
    if (this.closed || this.cancelled) return;
    this.cancelled = true;
    this.assembling = null;
    this.send({ v: TRANSFER_PROTOCOL_VERSION, type: 'cancel', transferId: this.transferId, reason });
    this.abortInFlight('cancelled');
  }

  private fail(error: TransferError): void {
    log.transfer.error('transfer failed', error.code);
    this.handlers.onError?.(error);
  }

  /** Report locally *and* tell the peer, so neither side is left guessing. */
  private failAndTell(error: TransferError, index: number, ackCode?: TransferErrorCode): void {
    this.send({
      v: TRANSFER_PROTOCOL_VERSION,
      type: 'file-ack',
      transferId: this.transferId,
      index,
      ok: false,
      bytes: 0,
      code: ackCode ?? error.code,
    });
    this.fail(error);
  }

  /** Unblock anything awaiting an acknowledgement when the session dies. */
  private abortInFlight(code: TransferErrorCode): void {
    const waiting = this.pendingAck;
    if (waiting) {
      clearTimeout(waiting.timer);
      this.pendingAck = null;
      waiting.resolve(false, code);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.abortInFlight('channel-closed');
    this.assembling = null;
    this.outgoing = [];
    this.peer.close();
  }
}
