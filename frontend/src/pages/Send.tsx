import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Link2,
  RotateCcw,
  ShieldAlert,
  Upload,
  UserCheck,
  Users,
  XCircle,
  FolderOpen,
  UploadCloud,
  X,
  Trash2,
} from "lucide-react";
import {
  Alert,
  Badge,
  Button,
  
  Panel,
  PanelHeader,
  ProgressBar,
  Spinner,
  StatusAnnouncer,
  FileTypeIcon,
  IconButton,
} from '../components/ui';
import { cn } from '../lib/cn';
import { FileRow, RoomCard, StatLine, type FileRowStatus } from '../components/transfer';
import { TransferSession, type TransferProgress } from '../services/transfer';
import type { PeerFailure, PeerState } from '../services/webrtc';
import { generateRoomCode } from '../services/room';
import { peekStagedFiles } from '../services/fileHandoff';
import { formatBytes, formatDuration, resolveMimeType } from '../services/mime';
import { recordTransfer } from '../services/db';
import { log } from '../lib/logger';

/**
 * Sender flow.
 *
 * Phases, and the only transitions between them:
 *
 *   no-files
 *   opening ──► waiting ──► negotiating ──► ready ──► transferring ──► completed
 *                  ▲            │             │            │
 *                  └── peer-left/reconnecting ┘            │
 *                                                          ▼
 *                           failed ◄── cancelled ◄─────────┘
 *
 * `waiting` has no deadline: the sender may sit on the QR screen for as long
 * as it takes somebody to walk over with a phone.
 */
type Phase =
  | 'no-files'
  | 'opening'
  | 'waiting'
  | 'negotiating'
  | 'ready'
  | 'transferring'
  | 'completed'
  | 'cancelled'
  | 'failed';

const ROOM_STORAGE_KEY = 'droply:send:room';

const MAX_FILES = 200;

/**
 * The room code must survive a re-render and a remount, and must *not* change
 * underneath a receiver who is already looking at it. It is regenerated only
 * when a new selection arrives or the user explicitly starts over.
 */
function useRoomCode(hasFiles: boolean): [string, () => string] {
  const [roomId, setRoomId] = useState<string>(() => {
    try {
      const stored = sessionStorage.getItem(ROOM_STORAGE_KEY);
      // Reuse the stored code only when this visit actually has files to send;
      // otherwise the next real session would inherit a stale room.
      if (stored && hasFiles) return stored;
    } catch {
      /* storage blocked */
    }
    const fresh = generateRoomCode();
    try {
      sessionStorage.setItem(ROOM_STORAGE_KEY, fresh);
    } catch {
      /* storage blocked: the code still works for this page */
    }
    return fresh;
  });

  const regenerate = useCallback(() => {
    const fresh = generateRoomCode();
    try {
      sessionStorage.setItem(ROOM_STORAGE_KEY, fresh);
    } catch {
      /* ignore */
    }
    setRoomId(fresh);
    return fresh;
  }, []);

  return [roomId, regenerate];
}

export function Send() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>(() => peekStagedFiles());
  const hasFiles = files.length > 0;
  const [roomId, regenerateRoomCode] = useRoomCode(hasFiles);

  const [phase, setPhase] = useState<Phase>(hasFiles ? 'opening' : 'no-files');
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const inputId = 'file-upload-input';
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((added: FileList | File[]) => {
    setFiles((prev) => {
      const all = [...prev, ...Array.from(added)];
      const deduped = new Map<string, File>();
      for (const f of all) {
        deduped.set(f.name + f.size + f.lastModified, f);
      }
      return Array.from(deduped.values()).slice(0, MAX_FILES);
    });
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      dragDepth.current = 0;
      if (event.dataTransfer.files?.length) {
        addFiles(event.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const removeAt = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);
  const [failure, setFailure] = useState<{ message: string; retryable: boolean } | null>(null);
  const [peerStatus, setPeerStatus] = useState<PeerState>('idle');
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [fileStates, setFileStates] = useState<FileRowStatus[]>(() => files.map(() => 'pending'));
  const [peerDropped, setPeerDropped] = useState(false);

  const sessionRef = useRef<TransferSession | null>(null);
  /** Incremented per attempt; callbacks from older attempts are discarded. */
  const attemptRef = useRef(0);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  const grandTotal = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);
  const shareUrl = useMemo(
    () => `${window.location.origin}/receive/${roomId}`,
    [roomId],
  );

  const startSession = useCallback(
    (room: string) => {
      const attempt = ++attemptRef.current;
      const live = () => attemptRef.current === attempt && sessionRef.current !== null;

      // Tear the previous attempt down first, so an old session's cleanup can
      // never interfere with this one.
      sessionRef.current?.close();
      sessionRef.current = null;

      setFailure(null);
      setPeerDropped(false);
      setProgress(null);
      setFileStates(files.map(() => 'pending'));
      setPhase('opening');

      const session = new TransferSession(room, 'sender', {
        onState: (state: PeerState, detail?: PeerFailure) => {
          if (!live()) return;
          setPeerStatus(state);

          if (state === 'failed' || state === 'timed-out') {
            // A completed transfer stays completed: the peer closing their tab
            // afterwards is not a failure of this transfer.
            if (phaseRef.current === 'completed') return;
            setFailure({
              message: detail?.message ?? 'The connection failed.',
              retryable: detail?.retryable ?? true,
            });
            setPhase('failed');
            return;
          }
          if (state === 'waiting-for-peer' && phaseRef.current === 'opening') setPhase('waiting');
          if (state === 'negotiating' && phaseRef.current !== 'transferring') setPhase('negotiating');
        },

        onChannelOpen: () => {
          if (!live()) return;
          // Describe the transfer as soon as there is a channel to describe it
          // over. Sending the manifest here (rather than on a timer) means the
          // receiver sees the file list the moment the connection is up.
          setPhase((current) => (current === 'transferring' ? current : 'ready'));
          session.sendManifest(files);
        },

        onPeerLeft: (wasConnected) => {
          if (!live()) return;
          if (phaseRef.current === 'completed') return;
          if (wasConnected) {
            setPeerDropped(true);
            setFailure({
              message:
                'The receiving device disconnected before the transfer finished. Nothing partial was saved there.',
              retryable: true,
            });
            setPhase('failed');
          } else {
            // They left before anything was established -- go back to waiting
            // so they can rejoin with the same code.
            setPhase('waiting');
          }
        },

        onAccepted: () => {
          if (!live()) return;
          setPhase('transferring');
        },

        onRejected: () => {
          if (!live()) return;
          setFailure({
            message: 'The receiver declined the transfer.',
            retryable: true,
          });
          setPhase('cancelled');
        },

        onProgress: (p) => {
          if (!live()) return;
          setProgress(p);
          setFileStates((prev) => {
            if (prev[p.index] === 'active' || prev[p.index] === undefined) return prev;
            const next = [...prev];
            next[p.index] = 'active';
            return next;
          });
        },

        onFileAcknowledged: (index) => {
          if (!live()) return;
          setFileStates((prev) => {
            const next = [...prev];
            next[index] = 'done';
            return next;
          });
          const file = files[index];
          if (file) {
            void recordTransfer({
              filename: file.name,
              mimeType: resolveMimeType(file.name, file.type),
              size: file.size,
              timestamp: Date.now(),
              direction: 'sent',
              outcome: 'completed',
              hashVerified: true,
            });
          }
        },

        onComplete: () => {
          if (!live()) return;
          setPhase('completed');
        },

        onCancelled: () => {
          if (!live()) return;
          if (phaseRef.current === 'completed') return;
          setFailure({ message: 'The receiver cancelled the transfer.', retryable: true });
          setPhase('cancelled');
        },

        onError: (error) => {
          if (!live()) return;
          if (phaseRef.current === 'completed') return;
          setFileStates((prev) => {
            if (error.index === undefined) return prev;
            const next = [...prev];
            next[error.index] = 'failed';
            return next;
          });
          setFailure({ message: error.message, retryable: error.code !== 'too-large' });
          setPhase(error.code === 'cancelled' ? 'cancelled' : 'failed');
        },
      });

      sessionRef.current = session;

      session.start().catch((err: unknown) => {
        if (!live()) return;
        log.app.error('could not start sender session', err);
        setFailure({
          message: 'Droply could not start a connection in this browser.',
          retryable: false,
        });
        setPhase('failed');
      });
    },
    [files],
  );

  // Open the room exactly once per mount when there is something to send.
  useEffect(() => {
    if (!hasFiles) return;
    startSession(roomId);
    return () => {
      attemptRef.current += 1;
      sessionRef.current?.close();
      sessionRef.current = null;
    };
    // `roomId` only changes through an explicit restart, which calls
    // startSession itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFiles, startSession]);

  const retrySameRoom = useCallback(() => {
    startSession(roomId);
  }, [roomId, startSession]);

  const restartWithNewRoom = useCallback(() => {
    const fresh = regenerateRoomCode();
    startSession(fresh);
  }, [regenerateRoomCode, startSession]);

  const cancel = useCallback(() => {
    sessionRef.current?.cancel();
    setPhase('cancelled');
    setFailure({ message: 'You cancelled the transfer.', retryable: true });
  }, []);

  const announcement = useMemo(() => {
    switch (phase) {
      case 'opening':
        return 'Opening a transfer room.';
      case 'waiting':
        return `Room ${roomId.split('').join(' ')} is open. Waiting for the other device to join.`;
      case 'negotiating':
        return 'The other device joined. Establishing a direct connection.';
      case 'ready':
        return 'Connected. Waiting for the receiver to accept the transfer.';
      case 'transferring':
        return progress
          ? `Sending. ${Math.round((progress.totalBytes / Math.max(1, progress.grandTotal)) * 100)} percent complete.`
          : 'Sending files.';
      case 'completed':
        return 'Transfer complete. All files were received and verified.';
      case 'cancelled':
        return 'Transfer cancelled.';
      case 'failed':
        return `Transfer failed. ${failure?.message ?? ''}`;
      default:
        return '';
    }
  }, [phase, roomId, progress, failure]);

  const overallPercent = progress
    ? Math.min(100, (progress.totalBytes / Math.max(1, progress.grandTotal)) * 100)
    : 0;

  /* ----------------------------------------------------------------------- */
  if (phase === 'no-files') {
    return (
      <div className="mx-auto w-full max-w-2xl 2xl:max-w-3xl 2xl:max-w-4xl px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-3xl 2xl:text-4xl font-extrabold text-ink mb-8">Send files</h1>
        <Panel className="bg-surface-raised/80 backdrop-blur-xl border-line dark:border-white/10 shadow-lg p-4 sm:p-6 shadow-float">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <div
              onDrop={onDrop}
              onDragOver={(event) => event.preventDefault()}
              onDragEnter={(event) => {
                event.preventDefault();
                dragDepth.current += 1;
                setDragging(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (dragDepth.current === 0) setDragging(false);
              }}
              className={cn(
                'flex flex-col items-center justify-center rounded-card border-2 border-dashed border-line-strong dark:border-white/20 px-6 py-10 text-center transition-all duration-200',
                dragging
                  ? 'border-brand bg-brand-soft/50 scale-[1.02]'
                  : 'border-line/50 bg-surface-sunken/50 dark:bg-black/20 hover:border-brand/50 hover:bg-surface-hover/30',
              )}
            >
              <span
                className={cn(
                  'grid size-14 place-items-center rounded-2xl transition-all duration-200 shadow-md',
                  dragging ? 'bg-brand text-white shadow-brand-glow scale-110' : 'bg-surface-raised text-brand',
                )}
              >
                <UploadCloud className="size-7" aria-hidden="true" />
              </span>

              <h2 className="mt-4 text-lg font-bold text-ink">
                {dragging ? 'Drop to add' : 'Drop files here'}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">or browse your device</p>

              <label
                htmlFor={inputId}
                className="mt-6 inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-white shadow-brand-glow transition-all hover:bg-brand-hover active:scale-95"
              >
                <FolderOpen className="size-4" aria-hidden="true" />
                Choose files
              </label>
              <input
                id={inputId}
                ref={inputRef}
                type="file"
                multiple
                className="sr-only"
                onChange={(event) => {
                  if (event.target.files?.length) addFiles(event.target.files);
                  event.target.value = '';
                }}
              />
            </div>

            <div className="flex flex-col rounded-card border border-line bg-surface-sunken/50 dark:bg-black/20">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 bg-surface-raised/50 rounded-t-card">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">
                    {files.length === 0
                      ? 'Nothing selected'
                      : files.length + ' files'}
                  </p>
                  <p className="text-xs text-ink-muted tabular">{formatBytes(grandTotal)} total</p>
                </div>
                {files.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Clear
                  </Button>
                )}
              </div>

              <div className="min-h-[12rem] flex-1 overflow-y-auto p-2 sm:max-h-64">
                {files.length === 0 ? (
                  <p className="flex h-full min-h-[10rem] items-center justify-center px-6 text-center text-sm text-ink-subtle">
                    Files you choose appear here before anything is shared.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {files.map((file, index) => (
                      <li
                        key={file.name + file.size + index}
                        className="flex items-center gap-3 rounded-xl border border-line bg-surface-raised px-3 py-2 shadow-sm"
                      >
                        <FileTypeIcon filename={file.name} mimeType={file.type} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-xs text-ink-muted tabular">{formatBytes(file.size)}</p>
                        </div>
                        <IconButton
                          label={"Remove"}
                          onClick={() => removeAt(index)}
                          className="size-8 rounded-lg hover:bg-danger-soft hover:text-danger"
                        >
                          <X className="size-4" aria-hidden="true" />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-line p-3 bg-surface-raised/50 rounded-b-card">
                <Button size="lg" fullWidth disabled={files.length === 0} onClick={() => setPhase('opening')} className="rounded-full shadow-brand-glow bg-brand text-white hover:bg-brand-hover">
                  <Link2 className="size-4" aria-hidden="true" />
                  Create transfer room
                </Button>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    );
  }


  return (
    <div className="mx-auto w-full max-w-2xl 2xl:max-w-3xl 2xl:max-w-4xl px-4 sm:px-6 py-8 sm:py-10">
      <StatusAnnouncer message={announcement} />

      <Panel className="bg-surface-raised/80 backdrop-blur-xl border-line dark:border-white/10 shadow-lg ">
        <PanelHeader
          title="Send files"
          description={`${files.length} ${files.length === 1 ? 'file' : 'files'} · ${formatBytes(grandTotal)}`}
          icon={<Upload className="size-5" aria-hidden="true" />}
          actions={
            phase === 'waiting' ? (
              <Badge tone="brand">
                <Spinner className="size-3.5" />
                Waiting
              </Badge>
            ) : phase === 'transferring' ? (
              <Badge tone="brand">Sending</Badge>
            ) : phase === 'completed' ? (
              <Badge tone="success">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Complete
              </Badge>
            ) : phase === 'failed' || phase === 'cancelled' ? (
              <Badge tone="danger">Stopped</Badge>
            ) : null
          }
        />

        <div className="p-5 sm:p-7">
          {/* --- opening / waiting for the receiver ------------------------ */}
          {(phase === 'opening' || phase === 'waiting') && (
            <div className="flex flex-col gap-7">
              {phase === 'opening' ? (
                <div className="flex flex-col items-center gap-3 py-10">
                  <Spinner className="size-7" />
                  <p className="text-sm font-medium text-ink-muted">Opening a room…</p>
                </div>
              ) : (
                <>
                  <RoomCard roomId={roomId} shareUrl={shareUrl} />
                  <div className="flex items-center justify-center gap-2.5 rounded-card border border-line bg-surface-sunken/50 dark:bg-black/20 px-4 py-3">
                    <Spinner className="size-4" />
                    <p className="text-sm font-semibold text-ink-muted">
                      Waiting for the other device to join
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* --- negotiating ---------------------------------------------- */}
          {phase === 'negotiating' && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <span className="relative grid size-16 place-items-center rounded-2xl bg-brand-soft text-brand">
                <Users className="size-7" aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-bold text-ink">The other device joined</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Setting up a direct connection between the two devices…
                </p>
              </div>
              <ProgressBar value={0} indeterminate label="Establishing connection" className="max-w-xs" />
            </div>
          )}

          {/* --- connected, awaiting acceptance --------------------------- */}
          {phase === 'ready' && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <span className="grid size-16 place-items-center rounded-2xl bg-success-soft text-success">
                <UserCheck className="size-7" aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-bold text-ink">Connected</p>
                <p className="mt-1 text-sm text-ink-muted">
                  The receiver can see what you are sending. Waiting for them to accept.
                </p>
              </div>
            </div>
          )}

          {/* --- transferring --------------------------------------------- */}
          {phase === 'transferring' && (
            <div className="flex flex-col gap-6">
              <StatLine
                items={[
                  { label: 'Progress', value: `${Math.round(overallPercent)}%` },
                  {
                    label: 'Sent',
                    value: `${formatBytes(progress?.totalBytes ?? 0)} / ${formatBytes(grandTotal)}`,
                  },
                  {
                    label: 'Speed',
                    value: progress?.bytesPerSecond
                      ? `${formatBytes(progress.bytesPerSecond)}/s`
                      : 'measuring…',
                  },
                  {
                    label: 'Remaining',
                    value: formatDuration(progress?.etaSeconds ?? null) ?? 'estimating…',
                  },
                ]}
              />
              <ProgressBar value={overallPercent} label="Overall transfer progress" />
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                {files.map((file, index) => (
                  <FileRow
                    key={`${file.name}-${index}`}
                    name={file.name}
                    size={file.size}
                    mimeType={file.type}
                    status={fileStates[index] ?? 'pending'}
                    transferred={progress?.index === index ? progress.fileBytes : undefined}
                    bytesPerSecond={progress?.index === index ? progress.bytesPerSecond : null}
                    etaSeconds={progress?.index === index ? progress.etaSeconds : null}
                  />
                ))}
              </ul>
              <Button variant="secondary" onClick={cancel} fullWidth>
                <XCircle className="size-4" aria-hidden="true" />
                Cancel transfer
              </Button>
            </div>
          )}

          {/* --- completed ------------------------------------------------ */}
          {phase === 'completed' && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-4 pt-4 text-center">
                <span className="grid size-16 place-items-center rounded-2xl bg-success-soft text-success">
                  <CheckCircle2 className="size-8" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xl font-bold text-ink">Transfer complete</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    All {files.length === 1 ? 'files' : files.length + ' files'} arrived and passed a
                    SHA-256 integrity check on the other device.
                  </p>
                </div>
              </div>
              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                {files.map((file, index) => (
                  <FileRow
                    key={`${file.name}-${index}`}
                    name={file.name}
                    size={file.size}
                    mimeType={file.type}
                    status={fileStates[index] ?? 'done'}
                  />
                ))}
              </ul>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button onClick={() => navigate('/')} fullWidth>
                  Send more files
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
                <Button variant="secondary" fullWidth onClick={() => navigate('/history')}>
                  View history
                </Button>
              </div>
            </div>
          )}

          {/* --- failed / cancelled --------------------------------------- */}
          {(phase === 'failed' || phase === 'cancelled') && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-4 pt-4 text-center">
                <span
                  className={
                    phase === 'cancelled'
                      ? 'grid size-16 place-items-center rounded-2xl bg-surface-sunken/50 dark:bg-black/20 text-ink-muted'
                      : 'grid size-16 place-items-center rounded-2xl bg-danger-soft text-danger'
                  }
                >
                  {phase === 'cancelled' ? (
                    <XCircle className="size-8" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="size-8" aria-hidden="true" />
                  )}
                </span>
                <div>
                  <p className="text-xl font-bold text-ink">
                    {phase === 'cancelled' ? 'Transfer stopped' : 'Transfer failed'}
                  </p>
                  <p className="mt-1.5 text-sm text-ink-muted">
                    {failure?.message ?? 'The transfer did not finish.'}
                  </p>
                </div>
              </div>

              {peerDropped && (
                <Alert tone="info" title="What the receiver sees">
                  Nothing incomplete is saved on the other device — Droply only writes a file after
                  every byte has arrived and the hash matches.
                </Alert>
              )}

              <div className="flex flex-col gap-2.5 sm:flex-row">
                {failure?.retryable !== false && (
                  <Button onClick={retrySameRoom} fullWidth>
                    <RotateCcw className="size-4" aria-hidden="true" />
                    Try again
                  </Button>
                )}
                <Button variant="secondary" fullWidth onClick={restartWithNewRoom}>
                  <Link2 className="size-4" aria-hidden="true" />
                  New room code
                </Button>
                <Button variant="ghost" fullWidth onClick={() => navigate('/')}>
                  Start over
                </Button>
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* Selection summary, shown while the transfer has not started. */}
      {(phase === 'opening' || phase === 'waiting' || phase === 'negotiating' || phase === 'ready') && (
        <Panel className="bg-surface-raised/80 backdrop-blur-xl border-line dark:border-white/10 shadow-lg mt-5">
          <PanelHeader title="Selected files" description={formatBytes(grandTotal)} />
          <ul className="divide-y divide-line">
            {files.map((file, index) => (
              <FileRow
                key={`${file.name}-${index}`}
                name={file.name}
                size={file.size}
                mimeType={file.type}
                status="pending"
              />
            ))}
          </ul>
        </Panel>
      )}

      {import.meta.env.DEV && (
        <p className="mt-4 text-center text-xs text-ink-subtle">
          connection: {peerStatus} · room {roomId}
        </p>
      )}

      <p className="mt-6 text-center text-sm text-ink-muted">
        Having trouble connecting?{' '}
        <Link to="/help" className="font-semibold text-brand hover:underline">
          Read the troubleshooting notes
        </Link>
      </p>
    </div>
  );
}
