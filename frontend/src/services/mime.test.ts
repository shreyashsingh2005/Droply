import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MIME,
  extensionOf,
  fileKind,
  formatBytes,
  formatDuration,
  resolveMimeType,
  sanitizeFilename,
} from './mime';

describe('extensionOf', () => {
  it('reads the last extension', () => {
    expect(extensionOf('photo.JPG')).toBe('jpg');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
  });

  it('returns nothing when there is no usable extension', () => {
    expect(extensionOf('README')).toBe('');
    expect(extensionOf('.gitignore')).toBe(''); // dotfile, not an extension
    expect(extensionOf('trailing.')).toBe('');
  });
});

describe('resolveMimeType', () => {
  it('trusts a declared type', () => {
    expect(resolveMimeType('thing.bin', 'image/png')).toBe('image/png');
  });

  it('infers from the extension when the browser reported nothing', () => {
    // This is the fix for "the file downloads but will not open": an empty
    // File.type used to become application/octet-stream.
    expect(resolveMimeType('holiday.jpg', '')).toBe('image/jpeg');
    expect(resolveMimeType('holiday.HEIC', null)).toBe('image/heic');
    expect(resolveMimeType('report.pdf', undefined)).toBe('application/pdf');
    expect(resolveMimeType('bundle.zip', '')).toBe('application/zip');
    expect(resolveMimeType('sheet.xlsx', '')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(resolveMimeType('clip.mp4', '')).toBe('video/mp4');
  });

  it('prefers the extension over a useless generic type', () => {
    expect(resolveMimeType('holiday.png', DEFAULT_MIME)).toBe('image/png');
  });

  it('falls back to a generic binary type for unknown extensions', () => {
    expect(resolveMimeType('firmware.xyzzy', '')).toBe(DEFAULT_MIME);
    expect(resolveMimeType('noextension', '')).toBe(DEFAULT_MIME);
  });
});

describe('sanitizeFilename', () => {
  it('strips directory traversal from a peer-supplied name', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('..\\..\\windows\\system32\\drivers')).toBe('drivers');
    expect(sanitizeFilename('/absolute/path/report.pdf')).toBe('report.pdf');
  });

  it('removes control characters', () => {
    expect(sanitizeFilename('bad\u0000name\u001f.txt')).toBe('badname.txt');
    expect(sanitizeFilename('line\nbreak.txt')).toBe('linebreak.txt');
  });

  it('keeps Unicode, emoji and spaces intact', () => {
    expect(sanitizeFilename('résumé final (v2).pdf')).toBe('résumé final (v2).pdf');
    expect(sanitizeFilename('休暇写真.jpg')).toBe('休暇写真.jpg');
    expect(sanitizeFilename('party 🎉.png')).toBe('party 🎉.png');
  });

  it('replaces characters that are illegal on common filesystems', () => {
    expect(sanitizeFilename('a<b>c:d"e|f?g*h.txt')).toBe('a_b_c_d_e_f_g_h.txt');
  });

  it('falls back when nothing usable is left', () => {
    expect(sanitizeFilename('')).toBe('download');
    expect(sanitizeFilename('...', 'file-1')).toBe('file-1');
    expect(sanitizeFilename('/', 'file-2')).toBe('file-2');
  });

  it('caps the length', () => {
    expect(sanitizeFilename('a'.repeat(400)).length).toBe(255);
  });
});

describe('fileKind', () => {
  it('categorises by type and extension', () => {
    expect(fileKind('a.jpg', '')).toBe('image');
    expect(fileKind('a.mp4', '')).toBe('video');
    expect(fileKind('a.mp3', '')).toBe('audio');
    expect(fileKind('a.pdf', '')).toBe('pdf');
    expect(fileKind('a.zip', '')).toBe('archive');
    expect(fileKind('a.docx', '')).toBe('document');
    expect(fileKind('a.xlsx', '')).toBe('spreadsheet');
    expect(fileKind('a.pptx', '')).toBe('presentation');
    expect(fileKind('a.ts', '')).toBe('code');
    expect(fileKind('a.txt', '')).toBe('text');
    expect(fileKind('a.unknownext', '')).toBe('file');
  });
});

describe('formatBytes', () => {
  it('formats using binary units', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('does not invent a value for nonsense input', () => {
    expect(formatBytes(Number.NaN)).toBe('—');
    expect(formatBytes(-1)).toBe('—');
  });
});

describe('formatDuration', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatDuration(0.4)).toBe('less than a second');
    expect(formatDuration(9)).toBe('9s');
    expect(formatDuration(95)).toBe('1m 35s');
    expect(formatDuration(3700)).toBe('1h 1m');
  });

  it('returns null rather than guessing when there is no measurement', () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBeNull();
    expect(formatDuration(Number.NaN)).toBeNull();
  });
});
