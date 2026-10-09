import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  DownloadCloud,
  Hourglass,
  RotateCcw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Panel,
  PanelHeader,
  ProgressBar,
  Spinner,
  StatusAnnouncer,
} from '../components/ui';
import { FileRow, StatLine, type FileRowStatus } from '../components/transfer';
import {
  TransferSession,
  type FileMetadata,
  type TransferProgress,
} from '../services/transfer';
import type { PeerFailure, PeerState } from '../services/webrtc';
import { ROOM_CODE_LENGTH, isValidRoomCode, normalizeRoomCode } from '../services/room';
import { ObjectUrlRegistry, canShareFile, isAppleMobile, saveFile, shareFile } from '../services/download';
import { formatBytes, formatDuration } from '../services/mime';
import { recordTransfer } from '../services/db';
import { log } from '../lib/logger';

/**
 * Receiver flow.
 *
 *   entry ──► connecting ──► waiting-for-sender ──► negotiating
 *                                   ▲                   │
 *                                   └───────────────────┘
 *                                                       ▼
 *            completed ◄── transferring ◄── confirm ◄── connected
 *                │                              │
 *                └──────► failed ◄──────────────┘
 *
 * Two things the previous version conflated and this one does not:
 *  - "the sender is not here yet" is a different state from "we are
 *    negotiating", and neither is an endless, unexplained spinner;
 *  - a *completed* transfer is terminal. The sender closing their tab
 *    afterwards no longer replaces the download buttons with an error.
 */
type Phase =
  | 'entry'
  | 'connecting'
  | 'waiting-for-sender'
  | 'negotiating'
  | 'connected'
  | 'confirm'
  | 'transferring'
  | 'completed'
  | 'rejected'
  | 'failed';

interface ReadyFile {
  index: number;
  name: string;
  size: number;
  type: string;
  blob: Blob;
  url: string;
  hashVerified: boolean;
}

export function Receive() {
  const params = useParams<{ roomId?: string }>();
  const navigate = useNavigate();

  const linkedRoom = useMemo(
    () => (params.roomId ? normalizeRoomCode(params.roomId) : ''),
    [params.roomId],
  );

  const [codeInput, setCodeInput] = useState(linkedRoom);
  const [room, setRoom] = useState(''); // the room we are actually joined to
  const [phase, setPhase] = useState<Phase>('entry');
  const [entryError, setEntryError] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ message: string; retryable: boolean } | null>(null);
  const [peerStatus, setPeerStatus] = useState<PeerState>('idle');

  const [manifest, setManifest] = useState<FileMetadata[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [progress, setProgress] = useState<TransferProgress | null>(null);
  const [fileStates, setFileStates] = useState<FileRowStatus[]>([]);
  const [readyFiles, setReadyFiles] = useState<ReadyFile[]>([]);
  const [saveHint, setSaveHint] = useState<string | null>(null);

  const sessionRef = useRef<TransferSession | null>(null);
  const attemptRef = useRef(0);
  const urlsRef = useRef(new ObjectUrlRegistry());
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  const applePlatform = useMemo(() => isAppleMobile(), []);

  /** Release every object URL we created. Called on reset and on unmount. */
  const releaseUrls = useCallback(() => {
    urlsRef.current.releaseAll();
  }, []);

  useEffect(
    () => () => {
      attemptRef.current += 1;
      sessionRef.current?.close();
      sessionRef.current = null;
      // Object URLs pin their Blob in memory until revoked; leaking them is
      // what made several large transfers in a row exhaust the tab.
      urlsRef.current.releaseAll();
    },
    [],
  );

  const join = useCallback(
    (code: string) => {
      const normalized = normalizeRoomCode(code);
      if (!isValidRoomCode(normalized)) {
        setEntryError(`Room codes are ${ROOM_CODE_LENGTH} letters and numbers. Check the code and try again.`);
        return;
      }

      const attempt = ++attemptRef.current;
      const live = () => attemptRef.current === attempt && sessionRef.current !== null;

      sessionRef.current?.close();
      sessionRef.current = null;
      releaseUrls();

      setEntryError(null);
      setFailure(null);
      setSaveHint(null);
      setReadyFiles([]);
      setManifest([]);
      setFileStates([]);
      setProgress(null);
      setRoom(normalized);
      setPhase('connecting');

      const session = new TransferSession(normalized, 'receiver', {
        onState: (state: PeerState, detail?: PeerFailure) => {
          if (!live()) return;
          setPeerStatus(state);

          if (state === 'failed' || state === 'timed-out') {
            // A finished transfer is terminal: the download buttons must stay.
            if (phaseRef.current === 'completed') return;
            setFailure({
              message: detail?.message ?? 'The connection failed.',
              retryable: detail?.retryable ?? true,
            });
            setPhase('failed');
            return;
          }
          if (state === 'waiting-for-peer') {
            if (phaseRef.current === 'connecting' || phaseRef.current === 'negotiating') {
              setPhase('waiting-for-sender');
            }
            return;
          }
          if (state === 'negotiating' && phaseRef.current !== 'transferring') {
            setPhase('negotiating');
          }
        },

        onChannelOpen: () => {
          if (!live()) return;
          setPhase((current) => (current === 'confirm' || current === 'transferring' ? current : 'connected'));
        },

        onPeerLeft: (wasConnected) => {
          if (!live()) return;
          if (phaseRef.current === 'completed') return;
          if (wasConnected) {
            setFailure({
              message:
                'The sending device disconnected before the transfer finished. Nothing incomplete was saved.',
              retryable: true,
            });
            setPhase('failed');
          } else {
            setPhase('waiting-for-sender');
          }
        },

        onManifest: (files, total) => {
          if (!live()) return;
          setManifest(files);
          setGrandTotal(total);
          setFileStates(files.map(() => 'pending'));
          setPhase('confirm');
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

        onFileReady: (file) => {
          if (!live()) return;
          const url = urlsRef.current.create(file.blob);
          setReadyFiles((prev) => [
            ...prev.filter((f) => f.index !== file.index),
            {
              index: file.index,
              name: file.name,
              size: file.size,
              type: file.type,
              blob: file.blob,
              url,
              hashVerified: file.hashVerified,
            },
          ]);
          setFileStates((prev) => {
            const next = [...prev];
            next[file.index] = 'done';
            return next;
          });
          void recordTransfer({
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            timestamp: Date.now(),
            direction: 'received',
            outcome: 'completed',
            hashVerified: file.hashVerified,
          });
        },

        onComplete: () => {
          if (!live()) return;
          setPhase('completed');
        },

        onCancelled: () => {
          if (!live()) return;
          if (phaseRef.current === 'completed') return;
          setFailure({ message: 'The sender cancelled the transfer.', retryable: true });
          setPhase('failed');
        },

        onError: (error) => {
          if (!live()) return;
          if (phaseRef.current === 'completed') return;
          if (error.index !== undefined) {
            setFileStates((prev) => {
              const next = [...prev];
              next[error.index as number] = 'failed';
              return next;
            });
            const meta = manifest[error.index];
            if (meta) {
              void recordTransfer({
                filename: meta.name,
                mimeType: meta.type,
                size: meta.size,
                timestamp: Date.now(),
                direction: 'received',
                outcome: 'failed',
                hashVerified: false,
              });
            }
          }
          setFailure({ message: error.message, retryable: true });
          setPhase('failed');
        },
      });

      sessionRef.current = session;
      session.start().catch((err: unknown) => {
        if (!live()) return;
        log.app.error('could not start receiver session', err);
        setFailure({
          message: 'Droply could not start a connection in this browser.',
          retryable: false,
        });
        setPhase('failed');
      });
    },
    // `manifest` is only read inside onError for a label; capturing a slightly
    // stale value there is harmless and keeps join() stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [releaseUrls],
  );

  // Joining from a shared link / QR code: do it once per room, and never
  // silently create a different room than the one in the URL.
  useEffect(() => {
    if (!linkedRoom) return;
    if (!isValidRoomCode(linkedRoom)) {
      setEntryError('That share link does not contain a valid room code.');
      setPhase('entry');
      return;
    }
    setCodeInput(linkedRoom);
    join(linkedRoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedRoom]);

  const reset = useCallback(() => {
    attemptRef.current += 1;
    sessionRef.current?.close();
    sessionRef.current = null;
    releaseUrls();
    setPhase('entry');
    setRoom('');
    setCodeInput('');
    setManifest([]);
    setReadyFiles([]);
    setFileStates([]);
    setProgress(null);
    setFailure(null);
    setSaveHint(null);
    if (linkedRoom) navigate('/receive', { replace: true });
  }, [linkedRoom, navigate, releaseUrls]);

  const accept = useCallback(() => {
    setPhase('transferring');
    sessionRef.current?.accept();
  }, []);

  const decline = useCallback(() => {
    sessionRef.current?.reject();
    setPhase('rejected');
  }, []);

  const cancel = useCallback(() => {
    sessionRef.current?.cancel();
    setFailure({ message: 'You cancelled the transfer.', retryable: true });
    setPhase('failed');
  }, []);

  const onSave = useCallback(async (file: ReadyFile) => {
    const outcome = await saveFile(file.blob, file.name, file.url);
    if (outcome === 'failed') {
      setSaveHint('This browser blocked the download. Try the Share button, or long-press the file name.');
    } else if (outcome === 'opened-in-tab') {
      setSaveHint('The file opened in a new tab — use your browser’s save option from there.');
    } else {
      setSaveHint(null);
    }
  }, []);

  const onShare = useCallback(async (file: ReadyFile) => {
    const outcome = await shareFile(file.blob, file.name);
    if (outcome === 'failed') {
      setSaveHint('Sharing was not available. Use Save instead.');
    } else if (outcome === 'shared') {
      setSaveHint(null);
    }
  }, []);

  const overallPercent = progress
    ? Math.min(100, (progress.totalBytes / Math.max(1, progress.grandTotal)) * 100)
    : 0;

  const announcement = useMemo(() => {
    switch (phase) {
      case 'connecting':
        return 'Joining the room.';
      case 'waiting-for-sender':
        return 'Joined. Waiting for the sending device.';
      case 'negotiating':
        return 'Establishing a direct connection to the sender.';
      case 'connected':
        return 'Connected. Waiting for the sender to choose files.';
      case 'confirm':
        return `Incoming transfer: ${manifest.length} ${manifest.length === 1 ? 'file' : 'files'}, ${formatBytes(grandTotal)}. Accept or decline.`;
      case 'transferring':
        return `Receiving. ${Math.round(overallPercent)} percent complete.`;
      case 'completed':
        return `Transfer complete. ${readyFiles.length} ${readyFiles.length === 1 ? 'file is' : 'files are'} ready to save.`;
      case 'failed':
        return `Transfer failed. ${failure?.message ?? ''}`;
      default:
        return '';
    }
  }, [phase, manifest.length, grandTotal, overallPercent, readyFiles.length, failure]);

  const sortedReady = useMemo(
    () => [...readyFiles].sort((a, b) => a.index - b.index),
    [readyFiles],
  );

  /* ----------------------------------------------------------------------- */

  return (
    <div className="mx-auto w-full max-w-2xl py-8 sm:py-10">
      <StatusAnnouncer message={announcement} />

      <Panel>
        <PanelHeader
          title="Receive files"
          description={
            room ? `Room ${room}` : 'Enter the code shown on the sending device'
          }
          icon={<DownloadCloud className="size-5" aria-hidden="true" />}
          actions={
            phase === 'completed' ? (
              <Badge tone="success">
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Complete
              </Badge>
            ) : phase === 'transferring' ? (
              <Badge tone="brand">Receiving</Badge>
            ) : phase === 'failed' ? (
              <Badge tone="danger">Stopped</Badge>
            ) : null
          }
        />

        <div className="p-5 sm:p-7">
          {/* --- code entry ----------------------------------------------- */}
          {phase === 'entry' && (
            <form
              className="flex flex-col gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                join(codeInput);
              }}
            >
              <div>
                <label htmlFor="room-code" className="text-sm font-semibold text-ink">
                  Room code
                </label>
                <p id="room-code-hint" className="mt-1 text-sm text-ink-muted">
                  Six letters and numbers, shown on the sending device.
                </p>
                <input
                  id="room-code"
                  name="room-code"
                  value={codeInput}
                  onChange={(event) => {
                    setCodeInput(normalizeRoomCode(event.target.value));
                    setEntryError(null);
                  }}
                  // `characters` gives the right on-screen keyboard on mobile
                  // without autocorrect mangling the code.
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="off"
                  inputMode="text"
                  enterKeyHint="go"
                  maxLength={ROOM_CODE_LENGTH}
                  aria-describedby={entryError ? 'room-code-error' : 'room-code-hint'}
                  aria-invalid={entryError ? true : undefined}
                  placeholder="ABC123"
                  className="mt-3 w-full rounded-xl border border-line bg-surface-sunken px-4 py-4 text-center font-mono text-2xl font-bold uppercase tracking-[0.3em] text-ink placeholder:text-ink-subtle/50 placeholder:tracking-[0.2em] focus:border-brand focus:bg-surface-raised sm:text-3xl"
                />
                {entryError && (
                  <p id="room-code-error" role="alert" className="mt-2 text-sm font-medium text-danger">
                    {entryError}
                  </p>
                )}
              </div>

              <Button type="submit" size="lg" fullWidth disabled={codeInput.length !== ROOM_CODE_LENGTH}>
                Join room
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>

              <p className="text-center text-sm text-ink-muted">
                Or scan the QR code on the sending device with your camera.
              </p>
            </form>
          )}

          {/* --- connecting / waiting / negotiating ----------------------- */}
          {(phase === 'connecting' || phase === 'negotiating') && (
            <div className="flex flex-col items-center gap-4 py-14 text-center">
              <Spinner className="size-8" />
              <div>
                <p className="text-lg font-bold text-ink">
                  {phase === 'connecting' ? 'Joining the room…' : 'Connecting to the sender…'}
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  {phase === 'connecting'
                    ? 'Checking that the room exists.'
                    : 'Negotiating a direct connection between the two devices.'}
                </p>
              </div>
              <ProgressBar value={0} indeterminate label="Connecting" className="max-w-xs" />
            </div>
          )}

          {phase === 'waiting-for-sender' && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <span className="grid size-16 place-items-center rounded-2xl bg-warning-soft text-warning">
                <Hourglass className="size-7" aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-bold text-ink">Waiting for the sender</p>
                <p className="mt-1.5 max-w-sm text-sm text-ink-muted">
                  You are in room <span className="font-mono font-bold text-ink">{room}</span>, but
                  the sending device is not connected. Make sure its Droply tab is still open on the
                  Send screen.
                </p>
              </div>
              <Button variant="secondary" onClick={reset}>
                Use a different code
              </Button>
            </div>
          )}

          {phase === 'connected' && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <span className="grid size-16 place-items-center rounded-2xl bg-success-soft text-success">
                <CheckCircle2 className="size-7" aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-bold text-ink">Connected</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Waiting for the sender to choose what to send.
                </p>
              </div>
            </div>
          )}

          {/* --- confirm -------------------------------------------------- */}
          {phase === 'confirm' && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <p className="text-lg font-bold text-ink">Incoming transfer</p>
                <p className="mt-1 text-sm text-ink-muted">
                  {manifest.length} {manifest.length === 1 ? 'file' : 'files'} ·{' '}
                  {formatBytes(grandTotal)}. Review before accepting.
                </p>
              </div>

              <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-card border border-line">
                {manifest.map((file) => (
                  <FileRow
                    key={file.index}
                    name={file.name}
                    size={file.size}
                    mimeType={file.type}
                    status="pending"
                  />
                ))}
              </ul>

              <Alert tone="neutral">
                Files arrive directly from the other device. Droply checks every byte with SHA-256
                before offering it to you, and nothing is written until that check passes.
              </Alert>

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button onClick={accept} size="lg" fullWidth>
                  <Download className="size-4" aria-hidden="true" />
                  Accept transfer
                </Button>
                <Button variant="secondary" size="lg" fullWidth onClick={decline}>
                  Decline
                </Button>
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
                    label: 'Received',
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
                {manifest.map((file) => (
                  <FileRow
                    key={file.index}
                    name={file.name}
                    size={file.size}
                    mimeType={file.type}
                    status={fileStates[file.index] ?? 'pending'}
                    transferred={progress?.index === file.index ? progress.fileBytes : undefined}
                    bytesPerSecond={progress?.index === file.index ? progress.bytesPerSecond : null}
                    etaSeconds={progress?.index === file.index ? progress.etaSeconds : null}
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
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center gap-3.5 pt-2 text-center">
                <span className="grid size-16 place-items-center rounded-2xl bg-success-soft text-success">
                  <ShieldCheck className="size-8" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xl font-bold text-ink">
                    {readyFiles.length === 1 ? 'File received' : 'Files received'}
                  </p>
                  <p className="mt-1.5 max-w-md text-sm text-ink-muted">
                    Every file passed its SHA-256 integrity check. Save them below — Droply never
                    downloads anything without you asking.
                  </p>
                </div>
              </div>

              {saveHint && <Alert tone="warning">{saveHint}</Alert>}

              <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                {sortedReady.map((file) => (
                  <FileRow
                    key={file.index}
                    name={file.name}
                    size={file.size}
                    mimeType={file.type}
                    status="done"
                    previewUrl={file.url}
                    actions={
                      <div className="flex gap-1.5">
                        {applePlatform && canShareFile(file.blob, file.name) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void onShare(file)}
                            aria-label={`Share ${file.name}`}
                          >
                            <Share2 className="size-4" aria-hidden="true" />
                            Share
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={() => void onSave(file)}
                          aria-label={`Save ${file.name}`}
                        >
                          <Download className="size-4" aria-hidden="true" />
                          Save
                        </Button>
                      </div>
                    }
                  />
                ))}
              </ul>

              {applePlatform && (
                <Alert tone="info" title="On iPhone and iPad">
                  Safari saves to the Files app rather than asking where to put things. For photos,
                  use <strong>Share</strong> and pick <em>Save Image</em> to get them into your
                  camera roll.
                </Alert>
              )}

              <Alert tone="neutral">
                These files live only in this tab. Closing or reloading it discards them, and the
                History page keeps a record without keeping a copy.
              </Alert>

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button variant="secondary" fullWidth onClick={reset}>
                  Receive more files
                </Button>
                <Button variant="ghost" fullWidth onClick={() => navigate('/history')}>
                  View history
                </Button>
              </div>
            </div>
          )}

          {/* --- declined ------------------------------------------------- */}
          {phase === 'rejected' && (
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <span className="grid size-16 place-items-center rounded-2xl bg-surface-sunken text-ink-muted">
                <XCircle className="size-7" aria-hidden="true" />
              </span>
              <div>
                <p className="text-lg font-bold text-ink">Transfer declined</p>
                <p className="mt-1 text-sm text-ink-muted">
                  Nothing was received. The sender has been told.
                </p>
              </div>
              <Button variant="secondary" onClick={reset}>
                Receive something else
              </Button>
            </div>
          )}

          {/* --- failed --------------------------------------------------- */}
          {phase === 'failed' && (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center gap-3.5 pt-2 text-center">
                <span className="grid size-16 place-items-center rounded-2xl bg-danger-soft text-danger">
                  <ShieldAlert className="size-8" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xl font-bold text-ink">Transfer stopped</p>
                  <p className="mt-1.5 max-w-md text-sm text-ink-muted">
                    {failure?.message ?? 'The transfer did not finish.'}
                  </p>
                </div>
              </div>

              {sortedReady.length > 0 && (
                <>
                  <Alert tone="success" title="Some files did arrive intact">
                    These passed their integrity check before the connection stopped, so they are
                    safe to save.
                  </Alert>
                  <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                    {sortedReady.map((file) => (
                      <FileRow
                        key={file.index}
                        name={file.name}
                        size={file.size}
                        mimeType={file.type}
                        status="done"
                        previewUrl={file.url}
                        actions={
                          <Button
                            size="sm"
                            onClick={() => void onSave(file)}
                            aria-label={`Save ${file.name}`}
                          >
                            <Download className="size-4" aria-hidden="true" />
                            Save
                          </Button>
                        }
                      />
                    ))}
                  </ul>
                </>
              )}

              <div className="flex flex-col gap-2.5 sm:flex-row">
                {failure?.retryable !== false && room && (
                  <Button fullWidth onClick={() => join(room)}>
                    <RotateCcw className="size-4" aria-hidden="true" />
                    Try again
                  </Button>
                )}
                <Button variant="secondary" fullWidth onClick={reset}>
                  Use a different code
                </Button>
              </div>
            </div>
          )}
        </div>
      </Panel>

      {import.meta.env.DEV && room && (
        <p className="mt-4 text-center text-xs text-ink-subtle">connection: {peerStatus}</p>
      )}

      <p className="mt-6 text-center text-sm text-ink-muted">
        Stuck connecting?{' '}
        <Link to="/help" className="font-semibold text-brand hover:underline">
          See what can block a direct connection
        </Link>
      </p>
    </div>
  );
}
