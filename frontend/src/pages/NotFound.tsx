import { Link, useLocation } from 'react-router-dom';
import { Compass, Download, Home as HomeIcon, Upload } from 'lucide-react';
import { Panel } from '../components/ui';

/**
 * Catch-all route.
 *
 * Previously there was no `*` route at all, so an unmatched URL rendered
 * nothing — and because Vercel rewrites every path to `index.html`, a typo or
 * a stale link produced a blank page rather than anything explanatory.
 */

const DESTINATIONS = [
  { to: '/', label: 'Home', description: 'Pick files to send', Icon: HomeIcon },
  { to: '/send', label: 'Send', description: 'Open a transfer room', Icon: Upload },
  { to: '/receive', label: 'Receive', description: 'Enter a room code', Icon: Download },
] as const;

export function NotFound() {
  const { pathname } = useLocation();

  return (
    <div className="mx-auto w-full max-w-xl py-14 sm:py-20">
      <Panel className="p-7 text-center sm:p-10">
        <span className="mx-auto grid size-16 place-items-center rounded-2xl bg-surface-sunken text-ink-subtle">
          <Compass className="size-8" aria-hidden="true" />
        </span>

        <h1 className="mt-6 text-2xl font-bold text-ink sm:text-3xl">Page not found</h1>
        <p className="mt-3 text-ink-muted">
          There is nothing at{' '}
          <code className="break-all rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-sm text-ink">
            {pathname}
          </code>
          .
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          If you followed a share link, the room code may have been mistyped — room codes are six
          letters and numbers.
        </p>

        <ul className="mt-8 grid gap-2.5 sm:grid-cols-3">
          {DESTINATIONS.map(({ to, label, description, Icon }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex h-full flex-col items-center gap-1.5 rounded-card border border-line bg-surface-sunken px-4 py-4 transition-colors hover:border-line-strong hover:bg-surface-hover"
              >
                <Icon className="size-5 text-brand" aria-hidden="true" />
                <span className="text-sm font-bold text-ink">{label}</span>
                <span className="text-xs text-ink-muted">{description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
