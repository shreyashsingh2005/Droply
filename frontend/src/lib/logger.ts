/**
 * Diagnostics.
 *
 * Verbose connection logging is genuinely useful when a transfer will not
 * establish, but it must not be on by default in production: it is noise, and
 * it is where filenames and other user data leak into a console or a crash
 * report. So:
 *
 *  - `log.*` is active in development, or in production when the user opts in
 *    with `?debug=1` (persisted for the tab);
 *  - `log.error` is always active -- swallowing real failures to keep the
 *    console tidy is how bugs stay invisible;
 *  - nothing here is ever handed a filename or file content. Call sites pass
 *    sizes, states and counts.
 */

const DEBUG_KEY = 'droply:debug';

function debugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      sessionStorage.setItem(DEBUG_KEY, '1');
      return true;
    }
    return sessionStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

let enabled: boolean | null = null;
function on(): boolean {
  if (enabled === null) enabled = debugEnabled();
  return enabled;
}

/** Ring buffer of recent events, surfaced by the error screen. */
const RING_MAX = 120;
const ring: { t: number; scope: string; message: string }[] = [];

function record(scope: string, args: unknown[]): void {
  ring.push({
    t: Date.now(),
    scope,
    message: args
      .map((a) => {
        if (typeof a === 'string') return a;
        if (a instanceof Error) return `${a.name}: ${a.message}`;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(' '),
  });
  if (ring.length > RING_MAX) ring.shift();
}

function make(scope: string) {
  return {
    debug(...args: unknown[]): void {
      record(scope, args);
      if (on()) console.log(`[${scope}]`, ...args);
    },
    warn(...args: unknown[]): void {
      record(scope, args);
      if (on()) console.warn(`[${scope}]`, ...args);
    },
    error(...args: unknown[]): void {
      record(scope, args);
      console.error(`[${scope}]`, ...args);
    },
  };
}

export type Logger = ReturnType<typeof make>;

export const log = {
  scope: make,
  signaling: make('signaling'),
  webrtc: make('webrtc'),
  transfer: make('transfer'),
  app: make('app'),
  db: make('db'),
};

/** Recent diagnostics, newest last. Shown on the crash screen. */
export function recentDiagnostics(): string {
  if (ring.length === 0) return '(no events recorded)';
  const t0 = ring[0].t;
  return ring
    .map((e) => `+${String(e.t - t0).padStart(6)}ms [${e.scope}] ${e.message}`)
    .join('\n');
}

export function isDebugEnabled(): boolean {
  return on();
}
