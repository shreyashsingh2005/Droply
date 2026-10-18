import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronRight,
  Download,
  FileBox,
  Lock,
  MonitorSmartphone,
  Shield,
  ShieldCheck,
  Upload,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';
import { HeroVisual } from '../components/HeroVisual';

/* The four items in the translucent strip under the hero. */
const BENEFITS = [
  {
    Icon: Users,
    title: '100% Private',
    detail: 'Files never touch a server',
    tone: 'text-brand',
    detailAccent: false,
  },
  {
    Icon: Zap,
    title: 'Blazing Fast',
    detail: 'Direct device-to-device',
    tone: 'text-brand',
    detailAccent: false,
  },
  {
    Icon: MonitorSmartphone,
    title: 'Works Everywhere',
    detail: 'Phone, tablet, laptop, desktop',
    tone: 'text-brand',
    detailAccent: false,
  },
  {
    Icon: Shield,
    title: 'Open Source Ready',
    detail: 'Transparent and trustworthy',
    tone: 'text-violet',
    detailAccent: true,
  },
] as const;

/* The four feature cards. `tile` selects one of the gradient icon tiles
   defined in index.css. */
const FEATURES = [
  {
    Icon: Zap,
    tile: 'icon-tile-violet',
    title: 'Direct Transfer',
    body: 'Your files move directly between devices using WebRTC. No cloud storage, no intermediaries.',
  },
  {
    Icon: Lock,
    tile: 'icon-tile-green',
    title: 'No Account Required',
    body: 'Start sharing instantly. No sign up, no personal data, no unnecessary friction.',
  },
  {
    Icon: FileBox,
    tile: 'icon-tile-blue',
    title: 'Share Anything',
    body: 'Send photos, videos, documents, folders and more — of any size, across any device.',
  },
  {
    Icon: Shield,
    tile: 'icon-tile-orange',
    title: 'Built for Privacy',
    body: 'Encrypted direct connections keep your files safe and in your control at all times.',
  },
] as const;

const TRUST = [
  { Icon: Zap, label: 'No account required' },
  { Icon: ShieldCheck, label: 'Encrypted transport' },
  { Icon: Wifi, label: 'Works on all devices' },
] as const;

export function Home() {
  return (
    <div className="relative flex w-full flex-col overflow-x-hidden">
      {/* ================================================================
          Hero
          ================================================================ */}
      <section className="relative isolate w-full max-w-full min-w-0 overflow-hidden pb-10 pt-6 sm:pt-10 lg:overflow-visible lg:pb-16 lg:pt-14">
        <div className="shell grid grid-cols-1 min-w-0 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-6 xl:gap-10">
          {/* ---- copy column ---- */}
          <div className="relative z-10 flex w-full max-w-full min-w-0 flex-col items-start text-left">
            {/* Status pill */}
            <Link
              to="/privacy"
              className="animate-rise group glass mb-7 inline-flex max-w-full min-w-0 items-center gap-2 rounded-full py-1.5 pl-3 pr-2 text-xs shadow-card transition-colors hover:border-[color:var(--glass-line-lit)] sm:mb-9 sm:gap-2.5 sm:pl-3.5 sm:text-[0.8125rem]"
              style={{ '--rise-delay': '0ms' } as CSSProperties}
            >
              <span className="relative flex size-2 shrink-0" aria-hidden="true">
                <span
                  className="absolute inset-0 rounded-full bg-success opacity-70"
                  style={{
                    animation: 'pulse-ring 2.6s ease-out infinite',
                  }}
                />
                <span className="relative size-2 rounded-full bg-success" />
              </span>
              <span className="shrink-0 font-semibold text-ink">Direct P2P Transfer</span>
              <span className="hidden h-3.5 w-px shrink-0 bg-[color:var(--glass-line)] sm:inline-block" aria-hidden="true" />
              <span className="hidden min-w-0 flex-1 truncate font-medium text-ink-muted sm:inline">
                Your files stay on your devices
              </span>
              <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[color:var(--surface-hover)] text-ink-muted transition-transform group-hover:translate-x-0.5">
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </span>
            </Link>

            <h1
              className="animate-rise mb-6 w-full max-w-full min-w-0 break-words text-[clamp(2.125rem,7.5vw,5.25rem)] font-extrabold leading-[1.04] tracking-[-0.035em] text-ink 2xl:text-[5.75rem]"
              style={{ '--rise-delay': '60ms' } as CSSProperties}
            >
              Your files.
              <br />
              Your devices.
              <br />
              {/* The accent line: cyan into electric blue into violet. `w-fit`
                  keeps the gradient box the width of the word, so the full
                  sweep lands on the letters instead of trailing off into the
                  empty rest of the line. The extra bottom padding (cancelled
                  by the negative margin) gives background-clip:text enough
                  box to paint the descender. */}
              <span className="text-gradient-hero -mb-[0.14em] block w-fit max-w-full pb-[0.14em]">
                Directly.
              </span>
            </h1>

            <p
              className="animate-rise mb-8 w-full max-w-[34rem] min-w-0 text-[clamp(1rem,3.4vw,1.3125rem)] font-normal leading-[1.6] text-ink-muted sm:mb-10"
              style={{ '--rise-delay': '120ms' } as CSSProperties}
            >
              Droply lets you share files instantly between devices with a secure, direct
              connection. No accounts. No uploads. Just you and the people you trust.
            </p>

            {/* ---- calls to action ---- */}
            <div
              className="animate-rise mb-8 flex w-full max-w-md flex-col gap-3.5 sm:max-w-none sm:w-auto sm:flex-row sm:gap-4"
              style={{ '--rise-delay': '180ms' } as CSSProperties}
            >
              <Link
                to="/send"
                className="btn-glow group flex h-[3.5rem] w-full items-center justify-center gap-3 rounded-full px-6 text-base font-bold tracking-tight sm:w-auto sm:px-8 2xl:h-16 2xl:text-lg"
              >
                <Upload className="size-5 shrink-0 transition-transform group-hover:-translate-y-0.5" aria-hidden="true" />
                <span>Send files</span>
                <ArrowRight
                  className="size-[1.125rem] shrink-0 opacity-80 transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>

              <Link
                to="/receive"
                className="btn-outline group flex h-[3.5rem] w-full items-center justify-center gap-3 rounded-full px-6 text-base font-bold tracking-tight sm:w-auto sm:px-8 2xl:h-16 2xl:text-lg"
              >
                <Download className="size-5 shrink-0 transition-transform group-hover:translate-y-0.5" aria-hidden="true" />
                <span>Receive files</span>
                <ArrowRight
                  className="size-[1.125rem] shrink-0 opacity-70 transition-transform group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </Link>
            </div>

            {/* ---- trust indicators ---- */}
            <ul
              className="animate-rise flex w-full max-w-full flex-wrap items-center gap-x-4 gap-y-2.5 text-[0.75rem] font-medium text-ink-subtle sm:gap-x-7 sm:text-sm"
              style={{ '--rise-delay': '240ms' } as CSSProperties}
            >
              {TRUST.map(({ Icon, label }) => (
                <li key={label} className="flex shrink-0 items-center gap-2">
                  <Icon className="size-4 shrink-0 text-cyan" aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ---- illustration column ---- */}
          <div
            className="animate-rise relative w-full max-w-full min-w-0 overflow-hidden sm:overflow-visible lg:-mr-6 xl:-mr-10"
            style={{ '--rise-delay': '140ms' } as CSSProperties}
          >
            {/* Glow pooled behind the devices, so the illustration sits in
                light rather than on top of a flat panel. */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[88%] w-[108%] -translate-x-1/2 -translate-y-1/2 rounded-[50%] opacity-80 blur-3xl"
              style={{
                background:
                  'radial-gradient(ellipse at 42% 46%, var(--aurora-1) 0%, transparent 62%), radial-gradient(ellipse at 76% 58%, var(--aurora-2) 0%, transparent 58%)',
              }}
              aria-hidden="true"
            />
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* ================================================================
          Benefits strip
          ================================================================ */}
      <section className="relative z-10 pb-10 sm:pb-14">
        <div className="shell">
          <div className="glass grid grid-cols-1 gap-x-4 gap-y-5 rounded-2xl px-5 py-5 shadow-float sm:grid-cols-2 sm:rounded-[1.75rem] sm:px-8 sm:py-6 lg:grid-cols-4 lg:gap-y-0 lg:px-10 lg:py-7">
            {BENEFITS.map(({ Icon, title, detail, tone, detailAccent }, index) => (
              <div
                key={title}
                className={[
                  'flex min-w-0 items-center gap-3.5 sm:gap-4',
                  // Hairline dividers between the items, matching the
                  // reference. Only between, never leading, and only once the
                  // four items sit on one row.
                  index > 0 ? 'lg:border-l lg:border-[color:var(--glass-line)] lg:pl-8' : '',
                ].join(' ')}
              >
                <Icon className={`size-7 shrink-0 ${tone}`} aria-hidden="true" strokeWidth={1.9} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.9375rem] font-bold leading-tight text-ink">{title}</p>
                  <p
                    className={`mt-1 text-[0.8125rem] leading-tight ${
                      detailAccent ? 'text-brand' : 'text-ink-muted'
                    }`}
                  >
                    {detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================
          Feature cards
          ================================================================ */}
      <section className="relative z-10 pb-16 sm:pb-20">
        <h2 className="sr-only">Why Droply</h2>
        <div className="shell">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4 lg:gap-6 2xl:gap-7">
            {FEATURES.map(({ Icon, tile, title, body }, index) => (
              <article
                key={title}
                className="feature-card animate-rise flex w-full min-w-0 flex-col items-start rounded-2xl p-5 text-left sm:rounded-[1.5rem] sm:p-7"
                style={{ '--rise-delay': `${index * 70}ms` } as CSSProperties}
              >
                <span className={`icon-tile ${tile} mb-6 size-12 2xl:size-14`} aria-hidden="true">
                  <Icon className="size-6 2xl:size-7" strokeWidth={2.1} />
                </span>
                <h3 className="mb-2.5 text-[1.0625rem] font-bold tracking-tight text-ink 2xl:text-lg">
                  {title}
                </h3>
                <p className="text-sm leading-relaxed text-ink-muted 2xl:text-[0.9375rem]">
                  {body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
