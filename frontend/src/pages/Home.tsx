import { useState, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Send, Download, CloudOff, Shield, File as FileIcon, 
  UploadCloud, Link as LinkIcon, ArrowRight, Check, X, QrCode, Zap
} from 'lucide-react';

export function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const handleFile = (selectedFiles: FileList) => {
    const validFiles = Array.from(selectedFiles).filter(f => {
      if (f.size > 2 * 1024 * 1024 * 1024) {
        alert(`File ${f.name} exceeds the 2GB limit.`);
        return false;
      }
      return true;
    });
    setFiles(prev => [...prev, ...validFiles]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const totalSize = files.reduce((acc, file) => acc + file.size, 0);
  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const createSession = () => {
    if (files.length === 0) return;
    // Note: To pass Files via router we'd need a global store or just build the UI here.
    // For simplicity, we navigate to /send and user will pick files there if we can't pass them.
    // But we can actually use history state in React Router to pass File objects!
    navigate('/send', { state: { initialFiles: files } });
  };

  return (
    <div className="flex flex-col items-center w-full pb-20">
      
      {/* Hero Section */}
      <section className="w-full flex flex-col lg:flex-row items-center justify-between mt-12 lg:mt-24 gap-12 lg:gap-8 max-w-[1320px]">
        {/* Left Column */}
        <div className="flex-1 flex flex-col items-center lg:items-start text-center lg:text-left max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass-panel border-accent-primary/20 bg-accent-primary/10 text-accent-cyan text-xs font-semibold tracking-widest mb-6">
            <span className="w-2 h-2 rounded-full bg-accent-cyan animate-pulse"></span>
            PRIVATE PEER-TO-PEER FILE SHARING
          </div>
          
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6 text-text-primary">
            Your files.<br />
            Your devices.<br />
            <span className="text-gradient">No cloud.</span>
          </h1>
          
          <p className="text-lg sm:text-xl text-text-secondary mb-10 max-w-lg leading-relaxed">
            Send files directly between devices. No accounts, no cloud storage, just a private connection.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mb-10">
            <a 
              href="#send-panel"
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-accent-primary to-[#438FFF] hover:from-[#1960D6] hover:to-accent-primary text-white py-4 px-8 rounded-xl font-bold transition-all shadow-lg shadow-accent-primary/25"
            >
              <Send size={20} className="-ml-1" />
              Send Files
              <ArrowRight size={18} className="ml-1 opacity-80" />
            </a>
            <Link 
              to="/receive" 
              className="flex items-center justify-center gap-2 glass-panel bg-bg-elevated hover:bg-bg-secondary text-text-primary py-4 px-8 rounded-xl font-bold transition-all"
            >
              <Download size={20} />
              Receive Files
            </Link>
          </div>

          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-6 text-sm font-medium text-text-secondary">
            <span className="flex items-center gap-2"><Check size={16} className="text-status-success"/> No account required</span>
            <span className="flex items-center gap-2"><Check size={16} className="text-status-success"/> Encrypted transport</span>
            <span className="flex items-center gap-2"><Check size={16} className="text-status-success"/> Works across supported devices</span>
          </div>
        </div>

        {/* Right Column - Illustration */}
        <div className="flex-1 w-full max-w-2xl relative flex flex-col items-center justify-center mt-12 lg:mt-0">
          <div className="absolute inset-0 bg-accent-primary/20 blur-[100px] rounded-full w-3/4 h-3/4 m-auto -z-10"></div>
          
          <div className="relative w-full h-[350px] flex items-center justify-between px-8">
            {/* Connection Path */}
            <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
              <path 
                d="M 120 175 Q 300 50 480 175" 
                fill="none" 
                stroke="var(--accent-cyan)" 
                strokeWidth="2" 
                strokeDasharray="6 6" 
                className="opacity-50"
              />
              <circle cx="300" cy="112" r="24" fill="var(--bg-elevated)" stroke="var(--accent-cyan)" strokeWidth="2" className="drop-shadow-[0_0_10px_var(--accent-cyan)]" />
            </svg>

            {/* Laptop */}
            <div className="relative z-10 w-48 h-32 bg-bg-elevated rounded-t-xl border-2 border-border-subtle shadow-[var(--shadow-glass)] flex flex-col items-center justify-end overflow-hidden transform -rotate-3">
              <div className="absolute inset-0 bg-gradient-to-br from-accent-primary/20 to-transparent"></div>
              <div className="w-3/4 h-20 bg-bg-secondary rounded-lg mb-4 flex items-center justify-center border border-border-subtle/50 shadow-inner">
                <FileIcon size={32} className="text-accent-primary" />
              </div>
              <div className="w-[120%] h-4 bg-border-subtle rounded-b-xl -ml-[10%]"></div>
            </div>

            {/* Floating File */}
            <div className="absolute left-1/2 top-[88px] -translate-x-1/2 z-20 flex flex-col items-center animate-[float_4s_ease-in-out_infinite]">
              <FileIcon size={24} className="text-accent-cyan drop-shadow-[0_0_8px_var(--accent-cyan)]" />
              <div className="absolute -top-8 bg-bg-elevated px-2 py-1 rounded text-[9px] font-bold text-accent-cyan border border-border-subtle tracking-wider uppercase whitespace-nowrap shadow-lg">
                Direct Connection
              </div>
            </div>

            {/* Phone */}
            <div className="relative z-10 w-24 h-48 bg-bg-elevated rounded-3xl border-2 border-border-subtle shadow-[var(--shadow-glass)] flex flex-col items-center justify-center overflow-hidden transform rotate-3">
              <div className="absolute inset-0 bg-gradient-to-b from-accent-cyan/10 to-transparent"></div>
              <div className="w-16 h-24 bg-bg-secondary rounded-lg flex flex-col items-center justify-center border border-border-subtle/50">
                 <Download size={24} className="text-accent-cyan mb-2" />
                 <div className="w-8 h-1 bg-border-subtle rounded-full"></div>
              </div>
              <div className="w-6 h-1 bg-border-subtle rounded-full mt-4"></div>
            </div>
          </div>

          <div className="flex gap-4 mt-8 z-10 relative">
            <div className="px-4 py-1.5 rounded-full glass-panel text-xs font-semibold text-text-secondary flex items-center gap-2"><Zap size={14} className="text-accent-primary"/> Fast Transfer</div>
            <div className="px-4 py-1.5 rounded-full glass-panel text-xs font-semibold text-text-secondary flex items-center gap-2"><Shield size={14} className="text-accent-primary"/> Your Data Stays Yours</div>
            <div className="px-4 py-1.5 rounded-full glass-panel text-xs font-semibold text-text-secondary flex items-center gap-2"><CloudOff size={14} className="text-accent-primary"/> No Cloud Storage</div>
          </div>
        </div>
      </section>

      {/* File Drop and Transfer Panel */}
      <section id="send-panel" className="w-full max-w-[1320px] mt-24 mb-12">
        <div className="glass-panel bg-bg-elevated/40 rounded-[2rem] p-6 lg:p-8 flex flex-col lg:flex-row gap-8 items-center justify-between border border-border-subtle shadow-2xl relative overflow-hidden">
          {/* Subtle bg glow */}
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-accent-primary/20 rounded-full blur-[80px]"></div>

          {/* LEFT: Drop zone */}
          <div 
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`flex-1 w-full lg:w-auto border-2 border-dashed rounded-3xl p-8 flex flex-col items-center justify-center text-center transition-all duration-300 relative z-10 ${
              isDragging ? 'border-accent-primary bg-accent-primary/10 scale-[1.02]' : 'border-border-subtle hover:border-text-secondary bg-bg-secondary/30 hover:bg-bg-secondary/50'
            }`}
          >
            <UploadCloud size={48} className="text-accent-primary mb-4" />
            <h3 className="text-xl font-bold text-text-primary mb-1">Drop files here</h3>
            <p className="text-text-secondary mb-4">or click to browse</p>
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="bg-accent-primary hover:bg-accent-hover text-white py-2.5 px-6 rounded-lg font-bold transition-colors shadow-lg"
            >
              Choose Files
            </button>
            <p className="text-xs text-text-secondary mt-4">Supports multiple files • Up to 2GB per file • No upload to server</p>
            <input 
              type="file" 
              multiple 
              ref={fileInputRef}
              onChange={(e) => e.target.files && handleFile(e.target.files)}
              className="hidden" 
            />
          </div>

          {/* MIDDLE: File List */}
          <div className="flex-1 w-full h-[250px] bg-bg-secondary/30 rounded-3xl border border-border-subtle p-4 overflow-y-auto flex flex-col gap-2 relative z-10">
            {files.length === 0 ? (
              <div className="w-full h-full flex items-center justify-center text-text-secondary text-sm">
                No files selected.
              </div>
            ) : (
              files.map((f, i) => (
                <div key={i} className="flex items-center justify-between bg-bg-elevated p-3 rounded-xl border border-border-subtle shrink-0 group">
                  <div className="flex items-center gap-4 overflow-hidden">
                    <div className="w-10 h-10 bg-accent-cyan/10 text-accent-cyan rounded-lg flex items-center justify-center shrink-0">
                      <FileIcon size={20} />
                    </div>
                    <div className="truncate">
                      <p className="text-sm font-bold text-text-primary truncate">{f.name}</p>
                      <p className="text-xs text-text-secondary">{formatSize(f.size)} • {f.type || 'unknown'}</p>
                    </div>
                  </div>
                  <button onClick={() => removeFile(i)} className="text-text-secondary hover:text-status-error opacity-0 group-hover:opacity-100 transition-opacity p-2">
                    <X size={16} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* RIGHT: Action Panel */}
          <div className="w-full lg:w-[300px] flex flex-col justify-center bg-bg-secondary/20 p-8 rounded-3xl border border-border-subtle relative z-10 h-[250px]">
            <p className="text-sm text-text-secondary mb-1">Total Size</p>
            <p className="text-4xl font-extrabold text-text-primary tracking-tight mb-2">{formatSize(totalSize)}</p>
            <p className="text-sm text-text-secondary mb-8">{files.length} {files.length === 1 ? 'file' : 'files'} selected</p>
            
            <button 
              onClick={createSession}
              disabled={files.length === 0}
              className="w-full bg-accent-primary hover:bg-accent-hover disabled:opacity-50 disabled:hover:bg-accent-primary text-white py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-accent-primary/20"
            >
              <LinkIcon size={18} />
              Create Sharing Link
              <ArrowRight size={18} className="ml-1" />
            </button>
          </div>
        </div>
      </section>

      {/* Trust & Privacy */}
      <section className="w-full max-w-[1320px] mt-12">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="glass-panel p-8 rounded-3xl flex flex-col gap-6 group hover:border-accent-primary/30 transition-colors">
            <div className="w-14 h-14 rounded-full bg-accent-primary/10 flex items-center justify-center text-accent-primary">
              <Send size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-text-primary mb-2">Direct Transfer</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Files travel through WebRTC between connected peers when a direct connection is possible.
              </p>
            </div>
          </div>
          
          <div className="glass-panel p-8 rounded-3xl flex flex-col gap-6 group hover:border-accent-primary/30 transition-colors">
            <div className="w-14 h-14 rounded-full bg-accent-cyan/10 flex items-center justify-center text-accent-cyan">
              <CloudOff size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-text-primary mb-2">No Cloud Storage</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Droply does not upload files to a central file-storage service.
              </p>
            </div>
          </div>
          
          <div className="glass-panel p-8 rounded-3xl flex flex-col gap-6 group hover:border-accent-primary/30 transition-colors">
            <div className="w-14 h-14 rounded-full bg-status-success/10 flex items-center justify-center text-status-success">
              <Shield size={24} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-text-primary mb-2">Secure Connection</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                WebRTC encrypts transport. Signaling coordinates connections and may process connection metadata.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="w-full max-w-[1320px] mt-32 border-t border-border-subtle pt-24 pb-12">
        <div className="flex justify-between items-end mb-16">
          <div>
            <h2 className="text-4xl font-extrabold text-text-primary mb-4">How It Works</h2>
            <p className="text-lg text-text-secondary">Share files in three simple steps. Fast, secure, and effortless.</p>
          </div>
          <button className="hidden sm:flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors text-sm font-semibold">
            Learn More <ArrowRight size={16} />
          </button>
        </div>

        <div className="grid md:grid-cols-3 gap-12 relative">
          <div className="flex flex-col items-start gap-4">
            <span className="text-sm font-bold text-accent-primary">01</span>
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-primary/20 to-accent-cyan/20 flex items-center justify-center border border-accent-primary/30 text-accent-primary shadow-lg shadow-accent-primary/10">
              <FileIcon size={28} />
            </div>
            <h3 className="text-2xl font-bold text-text-primary mt-4">Select Files</h3>
            <p className="text-text-secondary leading-relaxed">Choose the files you want to share from your device.</p>
          </div>
          
          <div className="flex flex-col items-start gap-4 relative">
            <div className="hidden md:block absolute top-12 -left-12 w-24 h-0.5 bg-gradient-to-r from-accent-primary/50 to-transparent"></div>
            <span className="text-sm font-bold text-accent-cyan">02</span>
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-cyan/20 to-accent-primary/20 flex items-center justify-center border border-accent-cyan/30 text-accent-cyan shadow-lg shadow-accent-cyan/10">
              <QrCode size={28} />
            </div>
            <h3 className="text-2xl font-bold text-text-primary mt-4">Connect Devices</h3>
            <p className="text-text-secondary leading-relaxed">Share a QR code, link, or room code with the other device.</p>
          </div>
          
          <div className="flex flex-col items-start gap-4 relative">
            <div className="hidden md:block absolute top-12 -left-12 w-24 h-0.5 bg-gradient-to-r from-accent-cyan/50 to-transparent"></div>
            <span className="text-sm font-bold text-status-success">03</span>
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-status-success/20 to-status-success/10 flex items-center justify-center border border-status-success/30 text-status-success shadow-lg shadow-status-success/10">
              <Zap size={28} />
            </div>
            <h3 className="text-2xl font-bold text-text-primary mt-4">Transfer Instantly</h3>
            <p className="text-text-secondary leading-relaxed">Accept the transfer and send files over a peer connection.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
