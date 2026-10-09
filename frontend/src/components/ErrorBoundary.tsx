import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon, Home, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from './ui';
import { log, recentDiagnostics } from '../lib/logger';

interface Props {
  children?: ReactNode;
  /**
   * Changing this clears the error. Pass the route path so navigating away
   * from a broken screen recovers without a reload.
   */
  resetKey?: string;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

/** At most one automatic reload per window, so a broken build cannot loop. */
const RELOAD_STAMP_KEY = 'droply:auto-reload-at';
const RELOAD_COOLDOWN_MS = 30_000;

function isChunkLoadError(error: Error): boolean {
  const text = `${error.name} ${error.message}`;
  return (
    /ChunkLoadError/i.test(text) ||
    /dynamically imported module/i.test(text) ||
    /Importing a module script failed/i.test(text) ||
    /Failed to fetch dynamically imported/i.test(text)
  );
}

function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_STAMP_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_STAMP_KEY, String(Date.now()));
  } catch {
    // Storage blocked: do not reload at all rather than risk a loop.
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * Catches render-time errors and shows a branded recovery screen instead of a
 * blank page.
 *
 * Deliberate choices:
 *  - the real error is always written to the console, in every environment.
 *    Hiding it to keep production logs clean is how the original blank-screen
 *    bug stayed undiagnosed;
 *  - the error text is shown to the user (collapsed) rather than claiming
 *    "our team has been notified" -- there is no error-reporting backend, so
 *    that would be false;
 *  - a stale-deployment chunk error reloads at most once per 30 seconds.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Always surface it. Never swallow.
    log.app.error('render error', error);
    console.error('[Droply] Uncaught render error:', error, info.componentStack);

    if (isChunkLoadError(error) && reloadOnce()) return;

    this.setState({ componentStack: info.componentStack ?? null });
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, componentStack: null });
    }
  }

  private resetAppData = (): void => {
    try {
      sessionStorage.clear();
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem('droply:theme');
    } catch {
      /* ignore */
    }
    window.location.assign('/');
  };

  render(): ReactNode {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkLoadError(error);

    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-5 py-16 text-center">
        <span className="grid size-16 place-items-center rounded-2xl bg-danger-soft text-danger">
          <AlertOctagon className="size-8" aria-hidden="true" />
        </span>

        <h1 className="mt-6 text-2xl font-bold text-ink sm:text-3xl">
          {stale ? 'Droply was updated' : 'Something went wrong'}
        </h1>
        <p className="mt-3 max-w-md text-ink-muted">
          {stale
            ? 'A newer version of Droply is available and this page is running the old one. Reload to continue.'
            : 'This screen hit an unexpected error. Your files were never uploaded anywhere, and nothing was saved.'}
        </p>

        <div className="mt-8 flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
          <Button onClick={() => window.location.reload()} size="lg">
            <RefreshCw className="size-4" aria-hidden="true" />
            Reload page
          </Button>
          <Button variant="secondary" size="lg" onClick={() => window.location.assign('/')}>
            <Home className="size-4" aria-hidden="true" />
            Go to home
          </Button>
        </div>

        <details className="mt-10 w-full text-left">
          <summary className="cursor-pointer select-none rounded-lg px-3 py-2 text-sm font-semibold text-ink-muted hover:bg-surface-hover hover:text-ink">
            Technical details
          </summary>
          <div className="mt-3 space-y-3 rounded-card border border-line bg-surface-sunken p-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Error</p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs text-danger">
                {error.name}: {error.message}
              </pre>
            </div>
            {componentStack && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">
                  Component stack
                </p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-ink-muted">
                  {componentStack.trim()}
                </pre>
              </div>
            )}
            {import.meta.env.DEV && error.stack && (
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">Stack</p>
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-ink-muted">
                  {error.stack}
                </pre>
              </div>
            )}
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-ink-subtle">
                Recent activity
              </p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] text-ink-muted">
                {recentDiagnostics()}
              </pre>
            </div>
            <Button variant="ghost" size="sm" onClick={this.resetAppData}>
              <Trash2 className="size-4" aria-hidden="true" />
              Reset app state and go home
            </Button>
          </div>
        </details>
      </div>
    );
  }
}
