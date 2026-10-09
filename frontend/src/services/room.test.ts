import { describe, expect, it } from 'vitest';
import { ROOM_CODE_LENGTH, generateRoomCode, isValidRoomCode, normalizeRoomCode } from './room';

describe('generateRoomCode', () => {
  it('produces codes the Worker will accept', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      // The Worker validates /^[A-Z0-9]{6}$/, so the generator must stay
      // inside that set.
      expect(code).toMatch(/^[A-Z0-9]{6}$/);
    }
  });

  it('never uses visually ambiguous characters', () => {
    // O/0, I/1, S/5 and B/8 get misread when a code is typed from a screen or
    // read aloud over a phone.
    const banned = /[OIS B01 58]/;
    for (let i = 0; i < 500; i++) {
      expect(generateRoomCode()).not.toMatch(banned);
    }
  });

  it('does not repeat itself in practice', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(generateRoomCode());
    // 29^6 ≈ 594M possibilities; a collision in 2000 draws would mean the
    // generator is not actually random.
    expect(seen.size).toBe(2000);
  });
});

describe('normalizeRoomCode', () => {
  it('upper-cases and strips separators', () => {
    expect(normalizeRoomCode('abc123')).toBe('ABC123');
    expect(normalizeRoomCode('abc-123')).toBe('ABC123');
    expect(normalizeRoomCode(' a b c 1 2 3 ')).toBe('ABC123');
  });

  it('truncates overlong input', () => {
    expect(normalizeRoomCode('ABC123XYZ')).toBe('ABC123');
  });

  it('drops characters that can never be part of a code', () => {
    expect(normalizeRoomCode('a!b@c#1$2%3')).toBe('ABC123');
  });
});

describe('isValidRoomCode', () => {
  it('accepts well-formed codes', () => {
    expect(isValidRoomCode('ABC123')).toBe(true);
    expect(isValidRoomCode('ZZZZZZ')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(isValidRoomCode('abc123')).toBe(false); // must be normalised first
    expect(isValidRoomCode('ABC12')).toBe(false);
    expect(isValidRoomCode('ABC1234')).toBe(false);
    expect(isValidRoomCode('ABC-12')).toBe(false);
    expect(isValidRoomCode('')).toBe(false);
  });
});
