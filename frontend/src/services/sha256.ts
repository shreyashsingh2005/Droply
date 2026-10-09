/**
 * Incremental SHA-256.
 *
 * `crypto.subtle.digest` is one-shot: it needs the entire payload in memory at
 * once, which is exactly what we must avoid for multi-gigabyte transfers (it
 * was the source of out-of-memory tab crashes). This implementation consumes
 * the file one chunk at a time, so peak memory is one chunk regardless of file
 * size.
 *
 * Verified against `crypto.subtle.digest` and the FIPS 180-4 test vectors in
 * `sha256.test.ts`.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const HEX = '0123456789abcdef';

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

export class Sha256 {
  private h: Uint32Array;
  private block = new Uint8Array(64);
  private blockLen = 0;
  private totalBytes = 0;
  private w = new Uint32Array(64);
  private finished = false;

  constructor() {
    this.h = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
  }

  update(data: Uint8Array): this {
    if (this.finished) throw new Error('Sha256: update() after digest()');
    this.totalBytes += data.length;

    let offset = 0;

    // Top up a partial block first.
    if (this.blockLen > 0) {
      const need = 64 - this.blockLen;
      const take = Math.min(need, data.length);
      this.block.set(data.subarray(0, take), this.blockLen);
      this.blockLen += take;
      offset = take;
      if (this.blockLen === 64) {
        this.compress(this.block, 0);
        this.blockLen = 0;
      }
    }

    // Consume whole blocks straight out of the caller's buffer.
    while (offset + 64 <= data.length) {
      this.compress(data, offset);
      offset += 64;
    }

    // Stash the remainder.
    if (offset < data.length) {
      this.block.set(data.subarray(offset), 0);
      this.blockLen = data.length - offset;
    }

    return this;
  }

  digest(): Uint8Array {
    if (this.finished) throw new Error('Sha256: digest() called twice');
    this.finished = true;

    const bitLen = this.totalBytes * 8;
    // 0x80 terminator, then zero padding, then a 64-bit big-endian bit count.
    const padLen = this.blockLen < 56 ? 56 - this.blockLen : 120 - this.blockLen;
    const tail = new Uint8Array(padLen + 8);
    tail[0] = 0x80;

    // bitLen can exceed 32 bits (>512 MB). Split it without losing precision:
    // Number.MAX_SAFE_INTEGER covers file sizes up to 1 PiB.
    const hi = Math.floor(bitLen / 0x100000000);
    const lo = bitLen >>> 0;
    const t = tail.length;
    tail[t - 8] = (hi >>> 24) & 0xff;
    tail[t - 7] = (hi >>> 16) & 0xff;
    tail[t - 6] = (hi >>> 8) & 0xff;
    tail[t - 5] = hi & 0xff;
    tail[t - 4] = (lo >>> 24) & 0xff;
    tail[t - 3] = (lo >>> 16) & 0xff;
    tail[t - 2] = (lo >>> 8) & 0xff;
    tail[t - 1] = lo & 0xff;

    // Feed the padding through the normal path (totalBytes is already frozen).
    this.finished = false;
    this.update(tail);
    this.finished = true;

    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
      const v = this.h[i];
      out[i * 4] = (v >>> 24) & 0xff;
      out[i * 4 + 1] = (v >>> 16) & 0xff;
      out[i * 4 + 2] = (v >>> 8) & 0xff;
      out[i * 4 + 3] = v & 0xff;
    }
    return out;
  }

  hex(): string {
    return bytesToHex(this.digest());
  }

  private compress(buf: Uint8Array, offset: number): void {
    const w = this.w;

    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      w[i] = ((buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3]) >>> 0;
    }
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
      const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = this.h[0];
    let b = this.h[1];
    let c = this.h[2];
    let d = this.h[3];
    let e = this.h[4];
    let f = this.h[5];
    let g = this.h[6];
    let hh = this.h[7];

    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }

    this.h[0] = (this.h[0] + a) >>> 0;
    this.h[1] = (this.h[1] + b) >>> 0;
    this.h[2] = (this.h[2] + c) >>> 0;
    this.h[3] = (this.h[3] + d) >>> 0;
    this.h[4] = (this.h[4] + e) >>> 0;
    this.h[5] = (this.h[5] + f) >>> 0;
    this.h[6] = (this.h[6] + g) >>> 0;
    this.h[7] = (this.h[7] + hh) >>> 0;
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += HEX[bytes[i] >>> 4] + HEX[bytes[i] & 0x0f];
  }
  return out;
}

/** One-shot helper, for small payloads and for tests. */
export function sha256Hex(data: Uint8Array): string {
  return new Sha256().update(data).hex();
}

/**
 * Hash a Blob/File without ever holding more than `chunkSize` bytes.
 * Used only where a whole-object hash is needed outside the transfer path.
 */
export async function sha256Blob(blob: Blob, chunkSize = 4 * 1024 * 1024): Promise<string> {
  const hasher = new Sha256();
  for (let offset = 0; offset < blob.size; offset += chunkSize) {
    const slice = blob.slice(offset, Math.min(offset + chunkSize, blob.size));
    hasher.update(new Uint8Array(await slice.arrayBuffer()));
  }
  return hasher.hex();
}
