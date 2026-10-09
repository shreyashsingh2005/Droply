/**
 * Test environment shims.
 *
 * jsdom does not provide the Web Crypto API, and Droply's integrity checking
 * is built on it. Rather than mock the hashing (which would make the integrity
 * tests meaningless) we hand the tests Node's real implementation.
 */
/// <reference types="node" />
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto || !('subtle' in globalThis.crypto)) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
    writable: true,
  });
}

if (typeof globalThis.crypto.randomUUID !== 'function') {
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () => webcrypto.randomUUID(),
    configurable: true,
    writable: true,
  });
}
