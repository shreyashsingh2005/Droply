/**
 * Filename/extension <-> MIME helpers.
 *
 * `File.type` is frequently an empty string -- the browser guesses from the OS
 * and gives up on plenty of formats (HEIC on Windows, .zip from some pickers,
 * anything unusual). An empty type became `application/octet-stream` on the
 * receiving side, which is why some downloads "arrived but would not open":
 * the bytes were right but the Blob carried no type, so the OS had nothing to
 * go on beyond the extension.
 *
 * We therefore (a) send the sender's declared type, and (b) fall back to a
 * lookup on the extension so the reconstructed Blob gets a usable type.
 */

const BY_EXTENSION: Record<string, string> = {
  // images
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jpe: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  heic: 'image/heic',
  heif: 'image/heif',
  dng: 'image/x-adobe-dng',
  // documents
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  rtf: 'application/rtf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  epub: 'application/epub+zip',
  // archives
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  tgz: 'application/gzip',
  bz2: 'application/x-bzip2',
  xz: 'application/x-xz',
  // audio / video
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  m4a: 'audio/mp4',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
  '3gp': 'video/3gpp',
  // code / data
  json: 'application/json',
  xml: 'application/xml',
  yml: 'application/yaml',
  yaml: 'application/yaml',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  ts: 'text/plain',
  tsx: 'text/plain',
  jsx: 'text/plain',
  py: 'text/x-python',
  sql: 'application/sql',
  // other
  apk: 'application/vnd.android.package-archive',
  exe: 'application/vnd.microsoft.portable-executable',
  dmg: 'application/x-apple-diskimage',
  iso: 'application/x-iso9660-image',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
};

export const DEFAULT_MIME = 'application/octet-stream';

export function extensionOf(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) return '';
  return base.slice(dot + 1).toLowerCase();
}

/**
 * Best available MIME type for a file: trust the declared type when there is
 * one, otherwise infer from the extension, otherwise fall back to a generic
 * binary type.
 */
export function resolveMimeType(filename: string, declaredType?: string | null): string {
  const declared = (declaredType ?? '').trim();
  if (declared && declared !== DEFAULT_MIME) return declared;
  const fromExt = BY_EXTENSION[extensionOf(filename)];
  if (fromExt) return fromExt;
  return declared || DEFAULT_MIME;
}

/**
 * Strip path separators and control characters from a peer-supplied filename
 * before it is used as a download name. A remote peer must not be able to
 * suggest `../../something` or a name containing a newline.
 */
export function sanitizeFilename(name: string, fallback = 'download'): string {
  const base = (name ?? '').split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').replace(/^\.+$/, '').trim();
  if (!cleaned) return fallback;
  // Keep it filesystem-friendly without mangling Unicode (emoji, CJK, accents
  // all survive) -- only characters that are illegal on common filesystems go.
  return cleaned.replace(/[<>:"|?*]/g, '_').slice(0, 255);
}

export type FileKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'pdf'
  | 'archive'
  | 'document'
  | 'spreadsheet'
  | 'presentation'
  | 'code'
  | 'text'
  | 'file';

/** Coarse category, used to pick an icon. */
export function fileKind(filename: string, mimeType?: string | null): FileKind {
  const type = resolveMimeType(filename, mimeType);
  const ext = extensionOf(filename);

  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  if (type === 'application/pdf') return 'pdf';
  if (/zip|rar|7z|tar|gzip|bzip2|xz|compressed/.test(type)) return 'archive';
  if (/wordprocessing|msword|opendocument\.text|rtf|epub/.test(type)) return 'document';
  if (/spreadsheet|ms-excel/.test(type)) return 'spreadsheet';
  if (/presentation|powerpoint/.test(type)) return 'presentation';
  if (['js', 'mjs', 'ts', 'tsx', 'jsx', 'py', 'sql', 'json', 'xml', 'html', 'htm', 'css', 'yml', 'yaml'].includes(ext)) {
    return 'code';
  }
  if (type.startsWith('text/')) return 'text';
  return 'file';
}

/** 1536 -> "1.5 KB". Uses binary units, labelled the way users expect. */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  const d = i === 0 ? 0 : decimals;
  return `${value.toFixed(d).replace(/\.0+$/, '')} ${units[i]}`;
}

/** 95 -> "1m 35s". Returns null when we have no reliable measurement. */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 1) return 'less than a second';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
