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
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { App as CapApp } from '@capacitor/app';
import { SplashScreen } from '@capacitor/splash-screen';

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


function BrowserSupportBanner() {
  const hasWebRTC = typeof window !== 'undefined' && 'RTCPeerConnection' in window && 'RTCDataChannel' in window;
  if (hasWebRTC) return null;
  return (
    <div className="bg-danger/20 border-b border-danger/30 p-3 text-center text-sm font-medium text-danger sm:px-6 backdrop-blur-md">
      Your browser does not fully support WebRTC data channels. Droply requires a modern browser (like Chrome, Safari, Edge, or Firefox) to transfer files.
    </div>
  );
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
    <header className="sticky top-0 z-40 border-b border-[color:var(--glass-line)] bg-[color:var(--nav-bg)] pt-safe backdrop-blur-xl backdrop-saturate-150">
      <div className="shell relative flex h-[4.5rem] items-center justify-between gap-4 lg:h-20">
        <NavLink
          to="/"
          className="shrink-0 rounded-lg transition-opacity hover:opacity-90"
          aria-label="Droply home"
        >
          <Logo size={34} />
        </NavLink>

        {/* Centre pill. Each item is a rounded tab; the current one is a
            filled, glowing blue pill. Laid out as a normal flex child rather
            than absolutely centred, so it can never collide with the logo or
            the actions on a narrow desktop window. */}
        <nav
          aria-label="Main"
          className="mx-auto hidden items-center gap-1 rounded-full border border-[color:var(--glass-line)] bg-[color:var(--nav-shell)] p-1.5 shadow-card backdrop-blur-xl lg:flex"
        >
          {[...PRIMARY_NAV, ...SECONDARY_NAV].map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold transition-all duration-200 xl:px-4',
                  isActive
                    ? 'btn-glow'
                    : 'text-ink-muted hover:bg-[color:var(--surface-hover)] hover:text-ink',
                )
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
          <ThemeSwitch preference={preference} onChange={onThemeChange} />
          <NavLink
            to="/send"
            className="btn-glow hidden h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold tracking-tight sm:inline-flex"
          >
            Get Started
            <ArrowRight className="size-4" aria-hidden="true" />
          </NavLink>
        </div>
      </div>

      {/* Tablet row: the pill does not fit beside the logo and the CTA, so it
          moves to its own scrollable line instead of disappearing. */}
      <nav
        aria-label="Main"
        className="shell hidden overflow-x-auto pb-3 md:block lg:hidden"
      >
        <div className="flex w-max items-center gap-1 rounded-full border border-[color:var(--glass-line)] bg-[color:var(--nav-shell)] p-1.5">
          {[...PRIMARY_NAV, ...SECONDARY_NAV].map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all',
                  isActive ? 'btn-glow' : 'text-ink-muted hover:text-ink',
                )
              }
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[color:var(--glass-line)] bg-[color:var(--nav-bg)] pb-safe backdrop-blur-xl md:hidden"
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
    <footer className="relative z-10 mt-16 border-t border-[color:var(--glass-line)]">
      <div className="shell flex flex-col items-center gap-5 py-9 md:flex-row md:justify-between">
        <div className="flex items-center gap-2.5">
          <Logo size={26} />
          <span className="rounded-full border border-[color:var(--glass-line)] bg-[color:var(--surface-raised)]/60 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-ink-muted">
            v2.0
          </span>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          {[...PRIMARY_NAV, ...SECONDARY_NAV].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className="font-medium text-ink-muted transition-colors hover:text-ink"
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <p className="text-center text-xs text-ink-subtle">
          &copy; {new Date().getFullYear()} Droply. Files travel between devices, not through us.
        </p>
      </div>
    </footer>
  );
}

/**
 * Page atmosphere: the drifting aurora, the perspective floor grid and the
 * corner vignette that together give the deep, layered background. Fixed
 * behind everything, decorative, and never interactive.
 */
function Atmosphere() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="app-aurora" />
      <div className="app-floor" />
      <div className="app-vignette" />
    </div>
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

  // Native Android/iOS system bars and hardware back button
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      SplashScreen.hide().catch(() => {});

      const backSub = CapApp.addListener('backButton', () => {
        if (window.location.pathname !== '/') {
          window.history.back();
        } else {
          CapApp.exitApp();
        }
      });

      return () => {
        backSub.then((s) => s.remove()).catch(() => {});
      };
    }
  }, []);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const isDark = document.documentElement.classList.contains('dark');
      StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }).catch(() => {});
      StatusBar.setBackgroundColor({ color: isDark ? '#03081A' : '#F8FAFC' }).catch(() => {});
    }
  }, [preference]);

  return (
    <BrowserRouter>
      <ScrollManager />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      {/* No background on this wrapper: `body` paints the base colour, and
          the Atmosphere layers sit at a negative z-index above it. An opaque
          background here would paint over them. */}
      <div className="relative flex min-h-screen min-h-dvh flex-col text-ink">
        <Atmosphere />
        <OfflineBanner />
        <BrowserSupportBanner />
        <Header preference={preference} onThemeChange={setPreference} />

        <main id="main" className="relative z-10 flex w-full flex-1 flex-col">
          <RoutedContent />
        </main>

        <Footer />
        <div className="mb-safe-nav md:hidden" aria-hidden="true" />
        <MobileNav />
      </div>
    </BrowserRouter>
  );
}
