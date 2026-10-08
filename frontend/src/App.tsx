import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Home } from './pages/Home';
import { useState, useEffect, useLayoutEffect, Suspense, lazy } from 'react';
import { Sun, Moon, Navigation } from 'lucide-react';

const Send = lazy(() => import('./pages/Send').then(module => ({ default: module.Send })));
const Receive = lazy(() => import('./pages/Receive').then(module => ({ default: module.Receive })));
const History = lazy(() => import('./pages/History').then(module => ({ default: module.History })));

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('droply-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
    return 'dark'; // Default to dark as requested
  });

  useLayoutEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('droply-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col font-sans selection:bg-accent-primary selection:text-white bg-bg-primary text-text-primary">
        {!isOnline && (
          <div className="w-full bg-status-error text-white text-center py-2 text-sm font-bold z-50">
            You are offline. Peer-to-peer transfers require an active internet connection for signaling.
          </div>
        )}
        <header className="sticky top-0 z-40 w-full bg-bg-primary/90 backdrop-blur-md border-b border-border-subtle">
          <div className="max-w-[1320px] mx-auto px-6 h-20 flex justify-between items-center">
            
            {/* Left Nav */}
            <div className="flex items-center gap-6">
              <Link to="/" className="flex items-center gap-3 group">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-primary to-accent-cyan flex items-center justify-center text-white shadow-lg shadow-accent-primary/20 group-hover:shadow-accent-primary/40 transition-all">
                  <Navigation size={18} className="rotate-45 -ml-0.5 mt-0.5 fill-white" />
                </div>
                <span className="font-extrabold text-2xl tracking-tight text-text-primary">Droply</span>
              </Link>
              
              <div className="hidden md:flex items-center border border-border-subtle rounded-full px-3 py-1 bg-bg-secondary/50">
                <span className="text-[11px] font-semibold text-text-secondary tracking-widest uppercase">
                  <span className="text-accent-primary">Private.</span> <span className="text-accent-cyan">Direct.</span> Effortless.
                </span>
              </div>
            </div>
            
            {/* Right Nav */}
            <nav className="flex items-center gap-8 text-sm font-semibold text-text-secondary">
              <Link to="/" className="hover:text-text-primary transition-colors hidden lg:block border-b-2 border-accent-primary text-text-primary py-2">Home</Link>
              <Link to="/history" className="hover:text-text-primary transition-colors hidden lg:block py-2">History</Link>
              <a href="/#how-it-works" className="hover:text-text-primary transition-colors hidden lg:block py-2">How it works</a>
              <a href="/#privacy" className="hover:text-text-primary transition-colors hidden lg:block py-2">Privacy</a>
              <a href="/#help" className="hover:text-text-primary transition-colors hidden lg:block py-2">Help</a>
              
              <button 
                onClick={toggleTheme}
                className="p-2 rounded-full border border-border-subtle hover:bg-bg-secondary transition-colors text-text-secondary hover:text-text-primary ml-2"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              
              <Link 
                to="/send"
                className="hidden sm:flex bg-accent-primary hover:bg-accent-hover text-white px-6 py-2.5 rounded-full font-bold transition-all shadow-lg shadow-accent-primary/20 hover:shadow-accent-primary/40"
              >
                Get Started
              </Link>
            </nav>
          </div>
        </header>
        
        <main className="flex-1 w-full max-w-[1440px] mx-auto flex flex-col px-6 sm:px-12">
          <Suspense fallback={<div className="flex-1 flex items-center justify-center p-12"><div className="w-8 h-8 rounded-full border-2 border-accent-primary border-t-transparent animate-spin"></div></div>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/send" element={<Send />} />
              <Route path="/receive" element={<Receive />} />
              <Route path="/receive/:roomId" element={<Receive />} />
              <Route path="/history" element={<History />} />
            </Routes>
          </Suspense>
        </main>

        <footer className="w-full border-t border-border-subtle mt-24 py-12">
          <div className="max-w-[1320px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 rounded bg-gradient-to-br from-accent-primary to-accent-cyan flex items-center justify-center text-white">
                <Navigation size={12} className="rotate-45 -ml-px mt-px fill-white" />
              </div>
              <span className="font-bold text-lg text-text-primary">Droply</span>
            </div>
            
            <div className="flex gap-6 text-sm font-medium text-text-secondary">
              <a href="/#how-it-works" className="hover:text-text-primary">How it works</a>
              <a href="/#privacy" className="hover:text-text-primary">Privacy</a>
              <a href="/#help" className="hover:text-text-primary">Help</a>
            </div>

            <div className="text-xs text-text-secondary">
              &copy; {new Date().getFullYear()} Droply. All rights reserved.
            </div>
          </div>
        </footer>
      </div>
    </BrowserRouter>
  );
}

export default App;
