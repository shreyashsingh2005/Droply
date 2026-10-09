import { describe, expect, it } from 'vitest';
import { Sha256, bytesToHex, sha256Blob, sha256Hex } from './sha256';

const enc = new TextEncoder();

async function subtleHex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as unknown as ArrayBuffer);
  return bytesToHex(new Uint8Array(digest));
}

describe('Sha256', () => {
  it('matches the FIPS 180-4 vector for the empty input', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('matches the FIPS 180-4 vector for "abc"', () => {
    expect(sha256Hex(enc.encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches the 448-bit vector (two-block padding path)', () => {
    expect(sha256Hex(enc.encode('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'))).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('matches the vector for a million "a" characters', () => {
    // Exercises the multi-megabyte streaming path, including a buffer that
    // never aligns to the 64-byte block size.
    const hasher = new Sha256();
    const block = enc.encode('a'.repeat(1000));
    for (let i = 0; i < 1000; i++) hasher.update(block);
    expect(hasher.hex()).toBe(
      'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0',
    );
  });

  it('agrees with crypto.subtle across a range of lengths', async () => {
    // Lengths chosen around the block boundary and the two padding branches.
    for (const length of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 121, 1000, 4096]) {
      const data = new Uint8Array(length);
      for (let i = 0; i < length; i++) data[i] = (i * 37 + 11) & 0xff;
      expect(sha256Hex(data), `length ${length}`).toBe(await subtleHex(data));
    }
  });

  it('produces the same digest regardless of how the input is chunked', async () => {
    const data = new Uint8Array(5000);
    for (let i = 0; i < data.length; i++) data[i] = (i * 97) & 0xff;
    const expected = await subtleHex(data);

    for (const chunk of [1, 7, 64, 100, 512, 4096]) {
      const hasher = new Sha256();
      for (let offset = 0; offset < data.length; offset += chunk) {
        hasher.update(data.subarray(offset, Math.min(offset + chunk, data.length)));
      }
      expect(hasher.hex(), `chunk size ${chunk}`).toBe(expected);
    }
  });

  it('detects a single flipped bit', () => {
    const a = new Uint8Array(1024).fill(7);
    const b = new Uint8Array(1024).fill(7);
    b[512] ^= 0x01;
    expect(sha256Hex(a)).not.toBe(sha256Hex(b));
  });

  it('refuses to be reused after digest()', () => {
    const hasher = new Sha256();
    hasher.update(enc.encode('x'));
    hasher.digest();
    expect(() => hasher.digest()).toThrow(/twice/);
    expect(() => hasher.update(enc.encode('y'))).toThrow(/after digest/);
  });

  it('hashes a Blob in slices without reading it whole', async () => {
    const data = new Uint8Array(9000);
    for (let i = 0; i < data.length; i++) data[i] = (i * 13) & 0xff;
    const blob = new Blob([data]);
    // A deliberately small slice size, so the loop runs many times.
    expect(await sha256Blob(blob, 1024)).toBe(await subtleHex(data));
  });
});
