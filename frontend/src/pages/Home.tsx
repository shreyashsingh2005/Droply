import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Download,
  FolderOpen,
  ShieldCheck,
  Upload,
  Users,
  Zap,
  Lock,
  Smartphone,
  Shield,
  FileBox,
  Image as ImageIcon,
  FileText,
  Video
} from 'lucide-react';

export function Home() {
  return (
    <div className="flex flex-col relative w-full overflow-x-hidden">
      {/* Cinematic Background */}
      <div className="pointer-events-none absolute inset-0 -z-20 bg-grid opacity-30" aria-hidden="true" />
      <div className="pointer-events-none absolute top-[-20%] left-[-10%] -z-10 h-[800px] w-[800px] bg-[radial-gradient(circle_at_center,rgba(43,92,255,0.15)_0%,transparent_60%)] blur-3xl rounded-full" aria-hidden="true" />
      <div className="pointer-events-none absolute top-[10%] right-[-10%] -z-10 h-[600px] w-[600px] bg-[radial-gradient(circle_at_center,rgba(0,240,255,0.1)_0%,transparent_60%)] blur-3xl rounded-full" aria-hidden="true" />
      
      {/* Hero Section */}
      <section className="relative isolate pt-8 sm:pt-12 lg:pt-20 pb-8 lg:pb-12">
        <div className="mx-auto grid max-w-7xl gap-16 px-4 sm:px-6 lg:grid-cols-[1fr_1fr] lg:gap-8 lg:items-center">
          
          <div className="flex flex-col items-start text-left z-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-ink shadow-lg backdrop-blur-md mb-8">
              <span className="size-2 rounded-full bg-success animate-pulse" aria-hidden="true" />
              Direct P2P Transfer <span className="text-ink-muted ml-1 font-medium">Your files stay on your devices &gt;</span>
            </span>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-ink mb-6 leading-[1.1]">
              Your files.<br />
              Your devices.<br />
              <span className="text-gradient-cyan block mt-1 pb-2">Directly.</span>
            </h1>

            <p className="text-lg sm:text-xl text-ink-muted max-w-lg mb-10 leading-relaxed font-medium">
              Droply lets you share files instantly between devices with a secure, direct connection. No accounts. No uploads. Just you and the people you trust.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mb-10">
              <Link
                to="/send"
                className="group flex h-14 items-center justify-center gap-2 rounded-full bg-brand px-8 text-base font-bold text-white shadow-brand-glow transition-all hover:bg-brand-hover hover:scale-[1.02] active:scale-95"
              >
                <Upload className="size-5 transition-transform group-hover:-translate-y-1" />
                Send files <ArrowRight className="size-4 ml-1 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </Link>
              
              <Link
                to="/receive"
                className="group flex h-14 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-8 text-base font-bold text-ink backdrop-blur-md transition-all hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] active:scale-95 shadow-lg"
              >
                <Download className="size-5 transition-transform group-hover:translate-y-1" />
                Receive files <ArrowRight className="size-4 ml-1 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-sm font-medium text-ink-subtle">
              <span className="flex items-center gap-1.5"><Lock className="size-4 text-cyan" /> No account required</span>
              <span className="flex items-center gap-1.5"><ShieldCheck className="size-4 text-cyan" /> End-to-end encrypted</span>
              <span className="flex items-center gap-1.5"><Smartphone className="size-4 text-cyan" /> Works on all devices</span>
            </div>
          </div>

          {/* Spectacular Right Side Visual */}
          <div className="relative w-full h-[400px] lg:h-[500px] flex items-center justify-center perspective-1000">
            {/* Ambient glows behind devices */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(43,92,255,0.2)_0%,transparent_70%)] blur-2xl" />
            
            {/* Glowing Connection Stream */}
            <svg className="absolute inset-0 w-full h-full z-0 overflow-visible" aria-hidden="true">
              <path 
                d="M 150 350 Q 350 150 450 300" 
                fill="none" 
                stroke="url(#streamGradient)" 
                strokeWidth="4" 
                strokeLinecap="round" 
                className="opacity-60"
                style={{ filter: 'drop-shadow(0 0 12px rgba(0, 240, 255, 0.8))' }}
              />
              <path 
                d="M 150 350 Q 350 150 450 300" 
                fill="none" 
                stroke="url(#streamGradient)" 
                strokeWidth="1" 
                strokeLinecap="round" 
                strokeDasharray="4 8"
                className="opacity-100 animate-[dash-flow_20s_linear_infinite]"
              />
              <defs>
                <linearGradient id="streamGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--brand)" />
                  <stop offset="50%" stopColor="var(--cyan)" />
                  <stop offset="100%" stopColor="var(--violet)" />
                </linearGradient>
              </defs>
            </svg>

            {/* Laptop Representation */}
            <div className="absolute left-[5%] sm:left-[10%] bottom-[20%] w-[240px] sm:w-[320px] h-[180px] sm:h-[240px] z-10 transform -rotate-6 sm:-rotate-12 translate-y-8 glass-panel rounded-2xl flex flex-col overflow-hidden border-t-white/20 border-l-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5),_inset_0_1px_0_rgba(255,255,255,0.2)]">
              <div className="h-6 sm:h-8 w-full bg-surface-overlay/80 border-b border-white/10 flex items-center px-3 gap-1.5">
                <div className="size-2 sm:size-2.5 rounded-full bg-danger/80" />
                <div className="size-2 sm:size-2.5 rounded-full bg-warning/80" />
                <div className="size-2 sm:size-2.5 rounded-full bg-success/80" />
                <div className="ml-2 flex-1 h-3 sm:h-4 bg-white/5 rounded-full max-w-[120px]" />
              </div>
              <div className="flex-1 w-full bg-[#0a1122] flex flex-col items-center justify-center relative p-6">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(43,92,255,0.15)_0%,transparent_80%)]" />
                <div className="size-16 sm:size-20 rounded-full bg-brand flex items-center justify-center shadow-brand-glow mb-4 z-10 animate-[float-y_4s_ease-in-out_infinite]">
                  <Upload className="size-8 sm:size-10 text-white" />
                </div>
                <div className="text-white font-semibold text-sm sm:text-base z-10">Sending files...</div>
                <div className="w-full max-w-[200px] h-2 bg-surface mt-4 rounded-full overflow-hidden z-10 border border-white/10">
                  <div className="h-full bg-cyan w-[65%] rounded-full shadow-[0_0_10px_rgba(0,240,255,0.8)]" />
                </div>
              </div>
            </div>

            {/* Smartphone Representation */}
            <div className="absolute right-[5%] sm:right-[15%] top-[10%] w-[120px] sm:w-[160px] h-[240px] sm:h-[320px] z-20 transform rotate-12 sm:rotate-6 glass-panel rounded-[2rem] sm:rounded-[2.5rem] flex flex-col overflow-hidden border-[4px] sm:border-[6px] border-[#1a233a] shadow-[0_30px_60px_rgba(0,0,0,0.6),_inset_0_2px_4px_rgba(255,255,255,0.3)]">
              <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-30">
                <div className="w-[40%] h-4 sm:h-5 bg-[#1a233a] rounded-b-xl" />
              </div>
              <div className="flex-1 w-full bg-[#060b19] flex flex-col relative px-3 sm:px-4 pt-10 sm:pt-12 pb-4">
                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(0,240,255,0.1)_0%,transparent_100%)]" />
                 
                 <div className="size-12 sm:size-16 rounded-full bg-transparent border-2 border-cyan text-cyan flex items-center justify-center mx-auto shadow-[0_0_15px_rgba(0,240,255,0.3)] mb-4 sm:mb-6 animate-[float-y_5s_ease-in-out_infinite_0.5s]">
                  <Download className="size-6 sm:size-8" />
                 </div>
                 
                 <div className="flex flex-col gap-2 sm:gap-3 flex-1 overflow-hidden z-10">
                   <div className="w-full bg-white/5 border border-white/10 rounded-lg p-2 sm:p-2.5 flex items-center gap-2 sm:gap-3 backdrop-blur-sm">
                     <div className="size-6 sm:size-8 rounded bg-brand/20 flex items-center justify-center"><ImageIcon className="size-3 sm:size-4 text-brand" /></div>
                     <div className="flex-1 h-2 bg-white/20 rounded-full" />
                   </div>
                   <div className="w-full bg-white/5 border border-white/10 rounded-lg p-2 sm:p-2.5 flex items-center gap-2 sm:gap-3 backdrop-blur-sm">
                     <div className="size-6 sm:size-8 rounded bg-violet/20 flex items-center justify-center"><Video className="size-3 sm:size-4 text-violet" /></div>
                     <div className="flex-1 h-2 bg-white/20 rounded-full w-2/3" />
                   </div>
                   <div className="w-full bg-white/5 border border-white/10 rounded-lg p-2 sm:p-2.5 flex items-center gap-2 sm:gap-3 backdrop-blur-sm">
                     <div className="size-6 sm:size-8 rounded bg-warning/20 flex items-center justify-center"><FileText className="size-3 sm:size-4 text-warning" /></div>
                     <div className="flex-1 h-2 bg-white/20 rounded-full w-1/2" />
                   </div>
                 </div>
                 
                 <div className="w-full h-8 sm:h-10 mt-auto bg-cyan rounded-full flex items-center justify-center text-xs font-bold text-[#060b19] shadow-[0_0_15px_rgba(0,240,255,0.4)] z-10">
                   Receiving...
                 </div>
              </div>
            </div>

            {/* Floating File Icons along the stream */}
            <div className="absolute top-[35%] left-[45%] z-30 size-10 sm:size-12 bg-[#0f172a] border border-brand/50 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(43,92,255,0.3)] animate-[float-y_3s_ease-in-out_infinite]">
              <FileText className="size-5 sm:size-6 text-brand" />
            </div>
            <div className="absolute top-[25%] left-[55%] z-30 size-12 sm:size-14 bg-[#0f172a] border border-cyan/50 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(0,240,255,0.3)] animate-[float-y_4s_ease-in-out_infinite_0.3s]">
              <ImageIcon className="size-6 sm:size-7 text-cyan" />
            </div>
            <div className="absolute top-[30%] left-[70%] z-30 size-8 sm:size-10 bg-[#0f172a] border border-violet/50 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(157,78,221,0.3)] animate-[float-y_3.5s_ease-in-out_infinite_0.6s]">
              <Video className="size-4 sm:size-5 text-violet" />
            </div>
            <div className="absolute top-[45%] left-[65%] z-30 size-9 sm:size-11 bg-[#0f172a] border border-warning/50 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.3)] animate-[float-y_4.5s_ease-in-out_infinite_0.9s]">
              <FolderOpen className="size-4 sm:size-5 text-warning" />
            </div>

          </div>
        </div>
      </section>

      {/* Trust Strip */}
      <section className="w-full border-y border-white/5 bg-white/[0.02] py-6 backdrop-blur-sm z-10">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-center sm:justify-between items-center gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-brand/10 flex items-center justify-center"><Users className="size-5 text-brand" /></div>
            <div>
              <div className="font-bold text-ink">100% Private</div>
              <div className="text-xs text-ink-muted">Files never touch a server</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-cyan/10 flex items-center justify-center"><Zap className="size-5 text-cyan" /></div>
            <div>
              <div className="font-bold text-ink">Blazing Fast</div>
              <div className="text-xs text-ink-muted">Direct device-to-device</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-violet/10 flex items-center justify-center"><Smartphone className="size-5 text-violet" /></div>
            <div>
              <div className="font-bold text-ink">Works Everywhere</div>
              <div className="text-xs text-ink-muted">Phone, tablet, laptop, desktop</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-white/10 flex items-center justify-center"><ShieldCheck className="size-5 text-white" /></div>
            <div>
              <div className="font-bold text-ink">Open Source Ready</div>
              <div className="text-xs text-ink-muted">Transparent and trustworthy</div>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Cards Grid */}
      <section className="py-12 sm:py-16 z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            
            <div className="bg-surface-overlay/60 backdrop-blur-md border border-white/10 hover:bg-surface-overlay/80 transition-all shadow-lg hover:shadow-brand-glow hover:-translate-y-1 rounded-2xl p-6 sm:p-8 flex flex-col items-start text-left">
              <div className="size-12 rounded-xl bg-brand/15 text-brand flex items-center justify-center mb-6 shadow-[0_0_15px_rgba(43,92,255,0.2)]">
                <Zap className="size-6" />
              </div>
              <h3 className="text-lg font-bold text-ink mb-3">Direct Transfer</h3>
              <p className="text-sm text-ink-muted leading-relaxed">
                Your files move directly between devices using WebRTC. No cloud storage, no intermediaries, no arbitrary speed limits.
              </p>
            </div>

            <div className="bg-surface-overlay/60 backdrop-blur-md border border-white/10 hover:bg-surface-overlay/80 transition-all shadow-lg hover:shadow-brand-glow hover:-translate-y-1 rounded-2xl p-6 sm:p-8 flex flex-col items-start text-left">
              <div className="size-12 rounded-xl bg-success/15 text-success flex items-center justify-center mb-6 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                <Lock className="size-6" />
              </div>
              <h3 className="text-lg font-bold text-ink mb-3">No Account Required</h3>
              <p className="text-sm text-ink-muted leading-relaxed">
                Start sharing instantly. No sign up, no personal data collection, no passwords, and no unnecessary friction.
              </p>
            </div>

            <div className="bg-surface-overlay/60 backdrop-blur-md border border-white/10 hover:bg-surface-overlay/80 transition-all shadow-lg hover:shadow-brand-glow hover:-translate-y-1 rounded-2xl p-6 sm:p-8 flex flex-col items-start text-left">
              <div className="size-12 rounded-xl bg-cyan/15 text-cyan flex items-center justify-center mb-6 shadow-[0_0_15px_rgba(0,240,255,0.2)]">
                <FileBox className="size-6" />
              </div>
              <h3 className="text-lg font-bold text-ink mb-3">Share Anything</h3>
              <p className="text-sm text-ink-muted leading-relaxed">
                Send photos, videos, documents, and folders of any size. If your device can read it, Droply can send it.
              </p>
            </div>

            <div className="bg-surface-overlay/60 backdrop-blur-md border border-white/10 hover:bg-surface-overlay/80 transition-all shadow-lg hover:shadow-brand-glow hover:-translate-y-1 rounded-2xl p-6 sm:p-8 flex flex-col items-start text-left">
              <div className="size-12 rounded-xl bg-warning/15 text-warning flex items-center justify-center mb-6 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
                <Shield className="size-6" />
              </div>
              <h3 className="text-lg font-bold text-ink mb-3">Built for Privacy</h3>
              <p className="text-sm text-ink-muted leading-relaxed">
                End-to-end encrypted connections keep your files safe and strictly in your control at all times.
              </p>
            </div>

          </div>
        </div>
      </section>
      
    </div>
  );
}
