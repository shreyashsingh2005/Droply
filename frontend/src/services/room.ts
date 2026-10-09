/**
 * Room codes.
 *
 * Six characters from an alphabet with the visually ambiguous glyphs removed
 * (no O/0, I/1, S/5, B/8), because these get read aloud and typed on phone
 * keyboards. `crypto.getRandomValues` rather than `Math.random`: a guessable
 * room code is a way into somebody else's session.
 *
 * The Worker validates `[A-Z0-9]{6}`, so this alphabet is a strict subset.
 */

const ALPHABET = 'ACDEFGHJKLMNPQRTUVWXYZ2346789';
export const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;

export function generateRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

/** Normalise user input: upper-cased, stripped of spaces and dashes. */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(input: string): boolean {
  return ROOM_CODE_RE.test(input);
}
