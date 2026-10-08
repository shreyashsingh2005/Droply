import { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { TransferProtocol } from '../services/transfer';
import type { FileMetadata } from '../services/webrtc';
import { DownloadCloud, File as FileIcon, CheckCircle, Loader2, AlertCircle, ArrowRight } from 'lucide-react';

export function Receive() {
  const params = useParams<{ roomId?: string }>();
  const [roomId, setRoomId] = useState<string>(params.roomId || '');
  const [status, setStatus] = useState<'idle'|'connecting'|'waiting-metadata'|'confirm'|'transferring'|'completed'|'error'>('idle');
  const [filesMeta, setFilesMeta] = useState<FileMetadata[]>([]);
  const [downloadableFiles, setDownloadableFiles] = useState<{url: string, name: string, type: string}[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [bytesReceived, setBytesReceived] = useState(0);
  const [errorMsg] = useState('');
  const protocolRef = useRef<TransferProtocol | null>(null);

  useEffect(() => {
    return () => {
      protocolRef.current?.webRTC.disconnect();
      setStatus('idle');
    };
  }, []);

  const joinRoom = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!roomId || roomId.length !== 6) return;
    setStatus('connecting');

    const protocol = new TransferProtocol(roomId.toUpperCase(), 'receiver');
    protocolRef.current = protocol;

    protocol.webRTC.onDataChannelOpen = () => {
      setStatus('waiting-metadata');
    };

    protocol.onMetadataReceived = (files) => {
      setFilesMeta(files);
      setStatus('confirm');
    };

    protocol.onCancel = () => {
      setStatus('error');
    };

    protocol.onFileProgress = (index, bytes, total) => {
      setCurrentFileIndex(index);
      setBytesReceived(bytes);
      setProgress((bytes / total) * 100);
    };

    protocol.onFileComplete = async (index, blob, expectedHash, meta) => {
      const isValid = await protocol.verifyHash(blob, expectedHash);
      if (!isValid) {
        console.error('File hash mismatch');
        setStatus('error');
        return;
      }
      
      const fileName = meta?.name || `download-${index}`;
      const url = URL.createObjectURL(blob);
      const mimeType = meta?.type || '';
      
      setDownloadableFiles(prev => [...prev, { url, name: fileName, type: mimeType }]);
      
      // Auto-download attempt for desktop
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Removed revokeObjectURL timeout so manual iOS buttons keep working
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

  useEffect(() => {
    if (params.roomId && status === 'idle') {
      joinRoom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.roomId]);

  const reset = () => {
    protocolRef.current?.webRTC.disconnect();
    
    // Clean up memory
    downloadableFiles.forEach(file => URL.revokeObjectURL(file.url));
    setDownloadableFiles([]);
    
    setStatus('idle');
    setFilesMeta([]);
    setCurrentFileIndex(0);
    setProgress(0);
    setBytesReceived(0);
    setRoomId('');
  };

  const totalSize = filesMeta.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="w-full max-w-xl mx-auto mt-16 pb-32">
      <div className="glass-panel rounded-3xl overflow-hidden transition-all duration-300">
        
        {/* Header */}
        <div className="p-8 border-b border-border-subtle bg-bg-elevated/80 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-text-primary">Receive Files</h2>
            <p className="text-text-secondary text-sm mt-1">Enter a room code to join a session.</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-bg-secondary flex items-center justify-center border border-border-subtle shadow-inner">
            <DownloadCloud className="text-accent-cyan" size={24} />
          </div>
        </div>

        {/* Dynamic Content */}
        <div className="p-8">
          {status === 'idle' && (
            <form onSubmit={joinRoom} className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-bold text-text-primary">Room Code</label>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="Enter 6-digit code" 
                    value={roomId}
                    onChange={e => setRoomId(e.target.value.toUpperCase())}
                    className="w-full bg-bg-secondary border border-border-subtle rounded-xl px-4 py-4 text-text-primary uppercase font-mono tracking-[0.3em] font-bold focus:outline-none focus:border-accent-cyan focus:ring-1 focus:ring-accent-cyan transition-all text-center text-xl shadow-inner"
                    maxLength={6}
                  />
                </div>
              </div>
              
              <button 
                type="submit"
                disabled={roomId.length !== 6}
                className="w-full bg-text-primary hover:bg-text-secondary disabled:opacity-50 disabled:hover:bg-text-primary text-bg-primary py-4 rounded-xl font-bold transition-all shadow-lg flex justify-center items-center gap-2 group"
              >
                Join Room 
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </form>
          )}

          {status === 'connecting' && (
            <div className="flex flex-col items-center justify-center py-12 gap-6 text-center animate-in zoom-in-95 duration-500">
              <Loader2 size={48} className="animate-spin text-accent-cyan" />
              <div>
                <p className="text-xl font-bold text-text-primary mb-2">Connecting to peer...</p>
                <p className="text-sm text-text-secondary">Establishing WebRTC connection.</p>
              </div>
            </div>
          )}

          {status === 'waiting-metadata' && (
            <div className="flex flex-col items-center justify-center py-12 gap-6 text-center animate-in fade-in duration-500">
              <div className="w-20 h-20 rounded-full bg-accent-primary/10 flex items-center justify-center text-accent-primary mb-2 border border-accent-primary/20">
                <CheckCircle size={40} />
              </div>
              <div>
                <p className="text-xl font-bold text-text-primary mb-2">Connected!</p>
                <p className="text-sm text-text-secondary">Waiting for sender to select files.</p>
              </div>
            </div>
          )}

          {status === 'confirm' && filesMeta.length > 0 && (
            <div className="flex flex-col gap-8 py-4 animate-in slide-in-from-right-4 duration-500">
              <div className="text-center">
                <h3 className="text-2xl font-bold text-text-primary mb-2">Incoming Transfer</h3>
                <p className="text-text-secondary text-sm">Review the files before accepting.</p>
              </div>

              <div className="border border-border-subtle rounded-2xl p-6 flex flex-col items-center gap-4 bg-bg-secondary/50 shadow-inner">
                <div className="w-16 h-16 rounded-2xl bg-accent-cyan/10 flex items-center justify-center text-accent-cyan border border-accent-cyan/20">
                  <FileIcon size={32} />
                </div>
                <div className="text-center">
                  <p className="text-lg font-bold text-text-primary">{filesMeta.length} {filesMeta.length === 1 ? 'file' : 'files'}</p>
                  <p className="text-sm text-text-secondary font-medium mt-1">{(totalSize / 1024 / 1024).toFixed(2)} MB Total</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => {
                    setStatus('transferring');
                    protocolRef.current?.acceptTransfer();
                  }}
                  className="flex-1 bg-accent-primary hover:bg-accent-hover text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-accent-primary/20 text-lg"
                >
                  Accept
                </button>
                <button 
                  onClick={() => {
                    protocolRef.current?.rejectTransfer();
                    reset();
                  }}
                  className="flex-1 bg-bg-secondary hover:bg-border-subtle text-text-primary py-4 rounded-xl font-bold transition-colors border border-border-subtle text-lg"
                >
                  Reject
                </button>
              </div>
            </div>
          )}

          {status === 'transferring' && (
            <div className="flex flex-col gap-8 py-8 animate-in slide-in-from-right-4 duration-500">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-accent-cyan/10 flex items-center justify-center text-accent-cyan shrink-0 border border-accent-cyan/20">
                  <DownloadCloud size={32} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-text-primary truncate mb-1">
                    Receiving file {currentFileIndex + 1} of {filesMeta.length}
                  </p>
                  <div className="flex justify-between text-sm text-text-secondary font-medium">
                    <span>{filesMeta[currentFileIndex]?.name}</span>
                    <span className="font-bold text-accent-cyan">{Math.round(progress)}%</span>
                  </div>
                </div>
              </div>

              <div className="w-full bg-bg-secondary rounded-full h-4 border border-border-subtle overflow-hidden relative shadow-inner">
                <div 
                  className="absolute left-0 top-0 h-full bg-gradient-to-r from-accent-cyan to-accent-primary transition-all duration-300 ease-out" 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
              
              <div className="text-center text-sm text-text-secondary font-bold mb-4">
                {(bytesReceived / 1024 / 1024).toFixed(2)} MB of {((filesMeta[currentFileIndex]?.size || 0) / 1024 / 1024).toFixed(2)} MB
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
                <p className="text-text-secondary">Files have been successfully received. If the auto-download was blocked, you can download them manually below.</p>
              </div>

              <div className="w-full space-y-3 mt-4 text-left">
                {downloadableFiles.map((file, i) => (
                  <div key={i} className="flex items-center justify-between p-4 bg-bg-primary rounded-xl border border-border-subtle">
                    <div className="flex items-center gap-3 overflow-hidden">
                      {file.type.startsWith('image/') ? (
                        <div className="w-10 h-10 rounded bg-bg-secondary flex-shrink-0 overflow-hidden">
                          <img src={file.url} alt="Preview" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 rounded bg-bg-secondary flex items-center justify-center text-text-secondary flex-shrink-0">
                          <FileIcon size={20} />
                        </div>
                      )}
                      <span className="font-medium text-text-primary truncate">{file.name}</span>
                    </div>
                    <a
                      href={file.url}
                      download={file.name}
                      className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-lg font-medium text-sm transition-colors flex-shrink-0"
                    >
                      Save
                    </a>
                  </div>
                ))}
              </div>

              <button 
                onClick={reset}
                className="mt-6 w-full bg-bg-secondary hover:bg-border-subtle text-text-primary py-4 rounded-xl font-bold transition-colors border border-border-subtle"
              >
                Receive More Files
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center text-center py-12 gap-6 animate-in zoom-in-95 duration-500">
              <div className="w-24 h-24 rounded-full bg-status-error/10 text-status-error flex items-center justify-center border border-status-error/20">
                <AlertCircle size={48} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-text-primary mb-2">Connection Error</h3>
                <p className="text-text-secondary">{errorMsg || "An unexpected error occurred during transfer."}</p>
              </div>
              <button 
                onClick={reset}
                className="mt-6 w-full bg-bg-secondary hover:bg-border-subtle text-text-primary py-4 rounded-xl font-bold transition-colors border border-border-subtle"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
