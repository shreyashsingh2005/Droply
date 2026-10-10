import { lazy, Suspense, useEffect, useState } from 'react';
import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  useLocation,
  
} from 'react-router-dom';
import {
  ArrowRight,
  Download,
  History as HistoryIcon,
  HelpCircle,
  Home as HomeIcon,
  ShieldCheck,
  Upload,
  WifiOff,
} from 'lucide-react';
import { Home } from './pages/Home';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Logo, Spinner, ThemeSwitch } from './components/ui';
import { useTheme, type ThemePreference } from './hooks/useTheme';
import { cn } from './lib/cn';

const Send = lazy(() => import('./pages/Send').then((m) => ({ default: m.Send })));
const Receive = lazy(() => import('./pages/Receive').then((m) => ({ default: m.Receive })));
const History = lazy(() => import('./pages/History').then((m) => ({ default: m.History })));
const Privacy = lazy(() => import('./pages/Privacy').then((m) => ({ default: m.Privacy })));
const Help = lazy(() => import('./pages/Help').then((m) => ({ default: m.Help })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));

const PRIMARY_NAV = [
  { to: '/', label: 'Home', Icon: HomeIcon, end: true },
  { to: '/send', label: 'Send', Icon: Upload, end: false },
  { to: '/receive', label: 'Receive', Icon: Download, end: false },
  { to: '/history', label: 'History', Icon: HistoryIcon, end: false },
] as const;

const SECONDARY_NAV = [
  { to: '/help', label: 'Help', Icon: HelpCircle, end: true },
  { to: '/privacy', label: 'Privacy', Icon: ShieldCheck, end: true },
] as const;

/**
 * Scroll handling for a single-page app: jump to a `#hash` target when one is
 * present, otherwise go to the top on navigation. Without this, moving from a
 * long page to a short one leaves the user halfway down the new screen.
 */
function ScrollManager() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);

  return null;
}

function OfflineBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-2 text-center text-sm font-semibold text-warning"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden="true" />
      You are offline. Droply needs a connection to introduce the two devices.
    </div>
  );
}

function Header({
  preference,
  onThemeChange,
}: {
  preference: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-surface/85 pt-safe backdrop-blur-xl">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <NavLink to="/" className="shrink-0 rounded-lg flex items-center gap-2" aria-label="Droply home">
          <Logo size={32} />
                  </NavLink>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex rounded-full border border-line/50 bg-surface-raised/40 p-1.5 backdrop-blur-md shadow-sm">
          {[...PRIMARY_NAV, ...SECONDARY_NAV].map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cn(
              'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200',
              isActive ? 'bg-brand text-white shadow-brand-glow' : 'text-ink-muted hover:text-ink hover:bg-surface-hover/50'
            )}>
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <ThemeSwitch preference={preference} onChange={onThemeChange} />
          <NavLink
            to="/send"
            className="hidden sm:inline-flex h-10 items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white shadow-brand-glow transition-all hover:bg-brand-hover active:scale-95"
          >
            Get Started
            <ArrowRight className="size-4" aria-hidden="true" />
          </NavLink>
        </div>
      </div>
    </header>
  );
}

/**
 * Bottom navigation on small screens. The previous build only exposed History
 * through a desktop-only link, so on a phone it was unreachable.
 */
function MobileNav() {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-safe backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch">
        {PRIMARY_NAV.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold transition-colors',
                  isActive ? 'text-brand' : 'text-ink-subtle',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('size-5', isActive && 'stroke-[2.4]')} aria-hidden="true" />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-4 py-10 sm:px-6 md:flex-row md:justify-between">
        <Logo size={24} />
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          {[...PRIMARY_NAV, ...SECONDARY_NAV].map(({ to, label }) => (
            <NavLink key={to} to={to} className="font-medium text-ink-muted hover:text-ink">
              {label}
            </NavLink>
          ))}
        </nav>
        <p className="text-xs text-ink-subtle">
          &copy; {new Date().getFullYear()} Droply. Files travel between devices, not through us.
        </p>
      </div>
    </footer>
  );
}

function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Spinner className="size-7" label="Loading" />
    </div>
  );
}

/**
 * The error boundary is keyed on the pathname so navigating away from a
 * screen that threw clears the error -- previously the only way out of a
 * crashed route was a full reload.
 */
function RoutedContent() {
  const { pathname } = useLocation();

  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/send" element={<Send />} />
          <Route path="/receive" element={<Receive />} />
          <Route path="/receive/:roomId" element={<Receive />} />
          <Route path="/history" element={<History />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/help" element={<Help />} />
          {/* Anything unmatched gets a real page. An unmatched route used to
              render nothing at all, which is what produced the blank screens
              behind Vercel's SPA rewrite. */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  // Single source of truth for the theme: applies the class to <html> and
  // keeps following the OS while the preference is "system".
  const { preference, setPreference } = useTheme();

  return (
    <BrowserRouter>
      <ScrollManager />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <div className="flex min-h-dvh flex-col bg-surface text-ink">
        <OfflineBanner />
        <Header preference={preference} onThemeChange={setPreference} />

        <main id="main" className="w-full flex-1 flex flex-col pb-10 mb-safe-nav md:mb-0">
          <RoutedContent />
        </main>

        <Footer />
        <MobileNav />
      </div>
    </BrowserRouter>
  );
}
