import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { log } from './lib/logger';

console.log('Droply v2.0 Premium UI deployed successfully');

/**
 * A new deployment replaces every hashed asset. A tab that was already open
 * then asks for a chunk that no longer exists, and the dynamic `import()`
 * behind a lazy route rejects -- which is what turned a routine deploy into a
 * blank page. Vite emits `vite:preloadError` for exactly this; reload once
 * (guarded, so a genuinely broken build cannot loop) and the tab comes back on
 * the new version.
 */
const PRELOAD_RELOAD_KEY = 'droply:preload-reload-at';

window.addEventListener('vite:preloadError', (event) => {
  log.app.error('asset preload failed', (event as Event & { payload?: unknown }).payload);
  try {
    const last = Number(sessionStorage.getItem(PRELOAD_RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem(PRELOAD_RELOAD_KEY, String(Date.now()));
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

/**
 * Nothing here suppresses errors: both handlers log and move on. They exist so
 * a rejection from a detached callback (a WebSocket handler, a timer) is
 * visible in the diagnostics ring buffer that the crash screen shows, instead
 * of vanishing.
 */
window.addEventListener('error', (event) => {
  log.app.error('uncaught error', event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  log.app.error('unhandled promise rejection', event.reason);
});

const container = document.getElementById('root');
if (!container) {
  // Without this the app fails silently with an unhelpful null dereference.
  throw new Error('Droply: #root element is missing from the document');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
