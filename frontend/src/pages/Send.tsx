import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { TransferProtocol } from '../services/transfer';
import { File as FileIcon, CheckCircle, Loader2, Copy, Link as LinkIcon, ArrowRight, X } from 'lucide-react';

export function Send() {
  const location = useLocation();
  const [files] = useState<File[]>(location.state?.initialFiles || []);
  
  const [roomId] = useState<string>(() => {
    const isNewSession = location.state?.newSession;
    if (isNewSession) {
      const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
      sessionStorage.setItem('droply-sender-roomId', newId);
      return newId;
    }
    const saved = sessionStorage.getItem('droply-sender-roomId');
    if (saved) return saved;
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    sessionStorage.setItem('droply-sender-roomId', newId);
    return newId;
  });

  const [status, setStatus] = useState<'idle'|'waiting'|'connected'|'transferring'|'completed'|'error'|'interrupted'>(() => {
    const isNewSession = location.state?.newSession;
    if (isNewSession) return 'idle';
    const savedStatus = sessionStorage.getItem('droply-sender-status');
    if (savedStatus === 'completed') return 'completed';
    if (!location.state?.initialFiles || location.state.initialFiles.length === 0) {
      if (savedStatus && savedStatus !== 'idle') return 'interrupted';
      return 'idle';
    }
    return 'idle';
  });

  useEffect(() => {
    sessionStorage.setItem('droply-sender-status', status);
  }, [status]);

  const [progress, setProgress] = useState(0);
  const [bytesSent, setBytesSent] = useState(0);
  const [copied, setCopied] = useState(false);
  const protocolRef = useRef<TransferProtocol | null>(null);

  useEffect(() => {
    if (files.length > 0 && status === 'idle') {
      startSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, status]);

  useEffect(() => {
    return () => {
      protocolRef.current?.webRTC.disconnect();
      setStatus('idle');
    };
  }, []);

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startSession = () => {
    if (files.length === 0) return;
    
    if (protocolRef.current) {
      protocolRef.current.webRTC.disconnect();
      protocolRef.current = null;
    }
    
    setStatus('waiting');
    
    const protocol = new TransferProtocol(roomId, 'sender');
    protocolRef.current = protocol;
    
    protocol.webRTC.onDataChannelOpen = () => {
      setStatus('connected');
      protocol.sendFilesMetadata(files);
    };

    protocol.onTransferAccepted = () => {
      setStatus('transferring');
    };

    protocol.onTransferRejected = () => {
      setStatus('error');
    };

    protocol.onCancel = () => {
      setStatus('error');
    };

    protocol.onFileProgress = (_index, bytes, total) => {
      setBytesSent(bytes);
      setProgress((bytes / total) * 100);
    };

    protocol.onAllComplete = () => {
      setStatus('completed');
    };
    
    protocol.onConnectionStateChange = (state) => {
      if (state === 'failed' || state === 'closed') {
        setStatus('error');
      }
    };

    protocol.webRTC.connect();
  };

  return (
    <div className="w-full max-w-xl mx-auto mt-16 pb-32">
      <div className="glass-panel rounded-3xl overflow-hidden transition-all duration-300">
        
        {/* Header */}
        <div className="p-8 border-b border-border-subtle bg-bg-elevated/80 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-text-primary">Send Files</h2>
            <p className="text-text-secondary text-sm mt-1">Sharing {files.length} {files.length === 1 ? 'file' : 'files'}.</p>
          </div>
          <div className="w-12 h-12 bg-accent-primary/10 flex items-center justify-center text-accent-primary rounded-xl">
            <LinkIcon size={24} />
          </div>
        </div>

        {/* Dynamic Content */}
        <div className="p-8">
          {status === 'idle' && files.length === 0 && (
            <div className="text-center py-12">
              <p className="text-text-secondary mb-4">No files selected.</p>
              <button onClick={() => window.history.back()} className="bg-bg-secondary px-6 py-2 rounded-lg text-text-primary">Go Back</button>
            </div>
          )}

          {status === 'waiting' && (
            <div className="flex flex-col items-center gap-8 py-4 animate-in zoom-in-95 duration-500">
              <div className="text-center">
                <h3 className="text-lg font-semibold text-text-primary mb-1">Room Created</h3>
                <p className="text-sm text-text-secondary">Ask the receiver to join using this code or QR.</p>
              </div>
              
              <div className="flex flex-col items-center gap-8 w-full">
                <div 
                  onClick={copyRoomCode}
                  className="flex items-center gap-4 bg-bg-secondary border border-border-subtle p-2 pr-4 rounded-full cursor-pointer hover:border-accent-primary/50 transition-colors group shadow-lg"
                >
                  <div className="bg-bg-elevated px-8 py-3 rounded-full text-3xl font-mono tracking-widest font-bold text-accent-cyan shadow-sm border border-border-subtle">
                    {roomId}
                  </div>
                  <div className="flex items-center gap-2 text-sm font-bold text-text-secondary group-hover:text-text-primary transition-colors pr-2">
                    {copied ? <span className="text-status-success flex items-center gap-1"><CheckCircle size={18}/> Copied</span> : <><Copy size={18}/> Copy</>}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-3xl shadow-xl ring-4 ring-bg-secondary/50">
                  <QRCodeSVG value={`${window.location.origin}/receive/${roomId}`} size={180} level="Q" fgColor="#0F172A" />
                </div>
                
                <div className="flex items-center gap-3 text-sm font-semibold text-text-secondary bg-bg-secondary px-6 py-3 rounded-full border border-border-subtle shadow-inner">
                  <Loader2 size={18} className="animate-spin text-accent-primary" />
                  Waiting for receiver to join...
                </div>
              </div>
            </div>
          )}

          {status === 'connected' && (
            <div className="flex flex-col items-center text-center py-12 gap-6 animate-in fade-in duration-500">
              <div className="w-20 h-20 rounded-full bg-accent-cyan/10 flex items-center justify-center text-accent-cyan shadow-lg shadow-accent-cyan/10">
                <CheckCircle size={40} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-text-primary mb-2">Receiver Connected</h3>
                <p className="text-text-secondary">Waiting for them to accept the transfer...</p>
              </div>
            </div>
          )}

          {status === 'transferring' && (
            <div className="flex flex-col gap-8 py-8 animate-in slide-in-from-right-4 duration-500">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-accent-primary/10 flex items-center justify-center text-accent-primary shrink-0 border border-accent-primary/20">
                  <FileIcon size={32} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-text-primary truncate mb-1">Transferring files...</p>
                  <div className="flex justify-between text-sm text-text-secondary font-medium">
                    <span>Sending data</span>
                    <span className="text-accent-primary">{Math.round(progress)}%</span>
                  </div>
                </div>
              </div>

              <div className="w-full bg-bg-secondary rounded-full h-4 border border-border-subtle overflow-hidden relative shadow-inner">
                <div 
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-accent-primary to-accent-cyan transition-all duration-300 ease-out" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              
              <div className="text-center text-sm text-text-secondary font-bold mb-4">
                {(bytesSent / 1024 / 1024).toFixed(2)} MB Sent
              </div>
              <button 
                onClick={() => {
                  protocolRef.current?.cancelTransfer();
                  setStatus('error');
                }}
                className="w-full bg-bg-secondary hover:bg-status-error/10 text-status-error py-3 rounded-xl font-bold transition-colors border border-border-subtle"
              >
                Cancel Transfer
              </button>
            </div>
          )}

          {status === 'completed' && (
            <div className="flex flex-col items-center text-center py-12 gap-6 animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 rounded-full bg-status-success/10 text-status-success flex items-center justify-center shadow-lg shadow-status-success/20 border border-status-success/20">
                <CheckCircle size={48} />
              </div>
              <div>
                <h3 className="text-3xl font-extrabold text-text-primary mb-2">Transfer Complete</h3>
                <p className="text-text-secondary">All files have been successfully delivered.</p>
              </div>
              <button 
                onClick={() => window.location.href = '/'}
                className="mt-6 w-full bg-bg-secondary hover:bg-border-subtle text-text-primary py-4 px-8 rounded-xl font-bold transition-colors border border-border-subtle flex justify-center items-center gap-2"
              >
                Send More Files <ArrowRight size={18} />
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center text-center py-12 gap-6 animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 rounded-full bg-status-error/10 text-status-error flex items-center justify-center border border-status-error/20">
                <X size={48} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-text-primary mb-2">Connection Error</h3>
                <p className="text-text-secondary">The connection was lost or the transfer failed.</p>
              </div>
              <button 
                onClick={() => window.location.href = '/'}
                className="mt-6 w-full bg-bg-secondary hover:bg-border-subtle text-text-primary py-4 rounded-xl font-bold transition-colors border border-border-subtle"
              >
                Try Again
              </button>
            </div>
          )}

          {status === 'interrupted' && (
            <div className="flex flex-col items-center text-center py-12 gap-6 animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 rounded-full bg-status-error/10 text-status-error flex items-center justify-center border border-status-error/20">
                <X size={48} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-text-primary mb-2">Session Interrupted</h3>
                <p className="text-text-secondary">The page was refreshed, so the selected files were lost. Please create a new room to send files.</p>
              </div>
              <button 
                onClick={() => window.location.href = '/'}
                className="mt-6 w-full bg-bg-secondary hover:bg-border-subtle text-text-primary py-4 rounded-xl font-bold transition-colors border border-border-subtle"
              >
                Create New Room
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
