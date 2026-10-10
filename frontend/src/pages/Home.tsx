import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  DownloadCloud,
  FolderOpen,
  Link2,
  ShieldAlert,
  ShieldCheck,
  Upload,
  UserCheck,
  Users,
} from 'lucide-react';
import { Logo } from '../components/ui';

export function Home() {
  return (
    <div className="flex flex-col">
      <section className="relative isolate pt-12 sm:pt-20 lg:pt-32 pb-16 lg:pb-24">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[500px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(99,102,241,0.15),transparent)]" aria-hidden="true" />
        <div className="pointer-events-none absolute right-0 top-20 -z-10 size-[600px] bg-brand/10 blur-[120px] rounded-full" aria-hidden="true" />

        <div className="mx-auto grid max-w-7xl gap-16 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:gap-8 lg:items-center">
          
          <div className="flex flex-col items-start text-left">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised/50 px-4 py-1.5 text-xs font-semibold text-ink shadow-soft backdrop-blur-sm">
              <span className="size-2 rounded-full bg-success animate-pulse" aria-hidden="true" />
              Direct P2P Transfer <span className="text-ink-muted ml-1">Your files stay on your devices &gt;</span>
            </span>

            <h1 className="mt-8 text-5xl font-extrabold leading-[1.05] tracking-tight text-ink sm:text-6xl lg:text-7xl">
              Move files.<br/>
              <span className="text-gradient drop-shadow-sm">Not through the cloud.</span>
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-muted">
              Droply lets you share files instantly between devices with a secure, direct connection. No accounts. No uploads. Just you and the people you trust.
            </p>

            <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-start">
              <Link
                to="/send"
                className="inline-flex h-14 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-hover shadow-brand-glow hover:scale-[1.02] transition-transform px-8 text-base font-semibold text-white"
              >
                <Upload className="size-5" aria-hidden="true" />
                Send files <ArrowRight className="size-4 ml-1" aria-hidden="true" />
              </Link>
              <Link
                to="/receive"
                className="inline-flex h-14 w-full sm:w-auto items-center justify-center gap-2 rounded-full border border-line bg-transparent px-8 text-base font-semibold text-ink transition-colors hover:bg-surface-hover active:scale-95"
              >
                <Download className="size-5" aria-hidden="true" />
                Receive files <ArrowRight className="size-4 ml-1" aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm font-medium text-ink-subtle">
              <span className="flex items-center gap-2"><UserCheck className="size-4 text-brand" /> No account required</span>
              <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand" /> End-to-end encrypted</span>
              <span className="flex items-center gap-2"><Link2 className="size-4 text-brand" /> Works on all devices</span>
            </div>
          </div>

          <div className="relative w-full max-w-lg mx-auto lg:max-w-none">
            <div className="relative w-full aspect-[4/3] flex items-center justify-center">
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 500 400" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M 120 280 C 200 350, 350 200, 420 180" stroke="url(#gradientSwoosh)" strokeWidth="6" strokeLinecap="round" className="opacity-80" />
                <path d="M 120 280 C 200 350, 350 200, 420 180" stroke="#6366f1" strokeWidth="2" strokeDasharray="8 8" className="opacity-40" style={{ animation: 'dash-flow 1.5s linear infinite' }} />
                
                <defs>
                  <linearGradient id="gradientSwoosh" x1="120" y1="280" x2="420" y2="180" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.2"/>
                    <stop offset="50%" stopColor="#22d3ee" stopOpacity="1"/>
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.2"/>
                  </linearGradient>
                </defs>
              </svg>

              <div className="absolute left-[10%] bottom-[15%] flex flex-col items-center transform -rotate-6">
                <div className="relative flex flex-col items-center justify-center w-56 h-40 bg-surface-raised rounded-xl border border-line shadow-float backdrop-blur-md z-10">
                  <div className="w-full h-8 bg-surface-sunken border-b border-line flex items-center px-3 rounded-t-xl">
                    <Logo size={16} withWordmark={false} /> <span className="ml-2 text-xs font-bold text-ink">Droply</span>
                  </div>
                  <div className="flex-1 flex flex-col items-center justify-center w-full relative">
                    <div className="size-16 rounded-full bg-brand-soft flex items-center justify-center mb-2 shadow-brand-glow">
                      <Upload className="size-8 text-brand" />
                    </div>
                    <span className="text-xs font-semibold text-ink">Sending files...</span>
                    <div className="w-3/4 h-1.5 bg-line rounded-full mt-3 overflow-hidden">
                      <div className="h-full bg-brand w-[78%] rounded-full" />
                    </div>
                  </div>
                </div>
                <div className="w-64 h-3 bg-line-strong rounded-b-xl -mt-1 z-0 shadow-lg" />
              </div>

              <div className="absolute left-[45%] top-[40%] bg-surface-raised border border-line rounded-lg p-2 shadow-float z-20 animate-[float-y_3s_ease-in-out_infinite]">
                <FolderOpen className="size-6 text-brand" />
              </div>
              <div className="absolute left-[60%] top-[30%] bg-surface-raised border border-line rounded-lg p-2 shadow-float z-20 animate-[float-y_4s_ease-in-out_infinite_0.5s]">
                <DownloadCloud className="size-6 text-cyan" />
              </div>

              <div className="absolute right-[5%] top-[10%] transform rotate-6">
                <div className="relative flex flex-col w-32 h-64 bg-surface-raised rounded-[2rem] border-4 border-line-strong shadow-float backdrop-blur-md z-10 overflow-hidden">
                  <div className="w-12 h-1 bg-line absolute top-2 left-1/2 -translate-x-1/2 rounded-full" />
                  <div className="mt-8 flex flex-col items-center justify-center px-2">
                    <div className="size-12 rounded-full bg-cyan-soft flex items-center justify-center mb-3 shadow-brand-glow">
                      <Download className="size-6 text-cyan" />
                    </div>
                    <span className="text-[10px] font-semibold text-ink">Receiving...</span>
                    <div className="w-full h-1 bg-line rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-cyan w-[78%] rounded-full" />
                    </div>
                    <div className="w-full mt-4 space-y-2">
                      <div className="w-full h-6 bg-surface-sunken rounded flex items-center px-2"><div className="size-3 rounded bg-brand/50 mr-2"/><div className="h-1.5 w-10 bg-line rounded"/></div>
                      <div className="w-full h-6 bg-surface-sunken rounded flex items-center px-2"><div className="size-3 rounded bg-cyan/50 mr-2"/><div className="h-1.5 w-12 bg-line rounded"/></div>
                      <div className="w-full h-6 bg-surface-sunken rounded flex items-center px-2"><div className="size-3 rounded bg-brand/50 mr-2"/><div className="h-1.5 w-8 bg-line rounded"/></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 sm:mt-12 mb-20 px-4 sm:px-6 mx-auto max-w-7xl">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="bg-surface-raised rounded-2xl p-5 flex items-center gap-4 border border-line shadow-sm">
            <Users className="size-8 text-brand shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-ink">100% Private</h4>
              <p className="text-xs text-ink-muted">Files never touch a server</p>
            </div>
          </div>
          <div className="bg-surface-raised rounded-2xl p-5 flex items-center gap-4 border border-line shadow-sm">
            <ArrowRight className="size-8 text-cyan shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-ink">Blazing Fast</h4>
              <p className="text-xs text-ink-muted">Direct device-to-device</p>
            </div>
          </div>
          <div className="bg-surface-raised rounded-2xl p-5 flex items-center gap-4 border border-line shadow-sm">
            <CheckCircle2 className="size-8 text-brand shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-ink">Works Everywhere</h4>
              <p className="text-xs text-ink-muted">Phone, tablet, laptop</p>
            </div>
          </div>
          <div className="bg-surface-raised rounded-2xl p-5 flex items-center gap-4 border border-line shadow-sm">
            <ShieldCheck className="size-8 text-cyan shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-ink">Open Source Ready</h4>
              <p className="text-xs text-ink-muted">Transparent</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-surface-raised border border-line shadow-sm rounded-[2rem] p-6 flex flex-col">
            <div className="size-12 rounded-2xl bg-brand-soft text-brand flex items-center justify-center mb-4">
              <ArrowRight className="size-6" />
            </div>
            <h3 className="text-lg font-bold text-ink mb-2">Direct Transfer</h3>
            <p className="text-sm text-ink-muted leading-relaxed">Your files move directly between devices using WebRTC. No cloud storage, no intermediaries.</p>
          </div>
          <div className="bg-surface-raised border border-cyan/20 shadow-sm rounded-[2rem] p-6 flex flex-col bg-gradient-to-b from-surface-raised to-cyan-soft/10">
            <div className="size-12 rounded-2xl bg-success-soft text-success flex items-center justify-center mb-4">
              <ShieldAlert className="size-6" />
            </div>
            <h3 className="text-lg font-bold text-ink mb-2">No Account Required</h3>
            <p className="text-sm text-ink-muted leading-relaxed">Start sharing instantly. No sign up, no personal data, no unnecessary friction.</p>
          </div>
          <div className="bg-surface-raised border border-line shadow-sm rounded-[2rem] p-6 flex flex-col">
            <div className="size-12 rounded-2xl bg-brand-soft text-brand flex items-center justify-center mb-4">
              <Upload className="size-6" />
            </div>
            <h3 className="text-lg font-bold text-ink mb-2">Share Anything</h3>
            <p className="text-sm text-ink-muted leading-relaxed">Send photos, videos, documents, folders and more of any size, across any device.</p>
          </div>
          <div className="bg-surface-raised border border-line shadow-sm rounded-[2rem] p-6 flex flex-col">
            <div className="size-12 rounded-2xl bg-warning-soft text-warning flex items-center justify-center mb-4">
              <ShieldCheck className="size-6" />
            </div>
            <h3 className="text-lg font-bold text-ink mb-2">Built for Privacy</h3>
            <p className="text-sm text-ink-muted leading-relaxed">End-to-end encrypted connections keep your files safe and in your control at all times.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
