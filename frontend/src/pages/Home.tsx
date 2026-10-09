import { useCallback, useId, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CloudOff,
  Download,
  FolderOpen,
  Gauge,
  Link2,
  QrCode,
  ShieldCheck,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from 'lucide-react';
import { Alert, Button, FileTypeIcon, IconButton, Panel } from '../components/ui';
import { formatBytes } from '../services/mime';
import { MAX_FILES, MAX_FILE_BYTES } from '../services/transfer';
import { clearStagedFiles, stageFiles } from '../services/fileHandoff';
import { cn } from '../lib/cn';

const STEPS = [
  {
    Icon: FolderOpen,
    title: 'Choose your files',
    body: 'Drag them in or pick them from your device. They stay in this tab — nothing is uploaded.',
  },
  {
    Icon: QrCode,
    title: 'Share the code',
    body: 'Droply opens a room and shows a six-character code and a QR code for the other device.',
  },
  {
    Icon: Gauge,
    title: 'Transfer directly',
    body: 'Once both devices are in the room, the files move over a direct encrypted connection.',
  },
] as const;

const GUARANTEES = [
  {
    Icon: CloudOff,
    title: 'No file storage',
    body: 'Droply has no file storage of any kind. There is no upload step and no copy left behind on a server.',
  },
  {
    Icon: ShieldCheck,
    title: 'Encrypted in transit',
    body: 'WebRTC data channels are encrypted with DTLS, so the bytes are protected between the two devices.',
  },
  {
    Icon: Gauge,
    title: 'Verified on arrival',
    body: 'Every file is checked with SHA-256 against the original. A file that does not match is never offered.',
  },
] as const;

export function Home() {
  const navigate = useNavigate();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Nested dragenter/dragleave events fire constantly; count them. */
  const dragDepth = useRef(0);

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const rejected: string[] = [];

    setFiles((prev) => {
      const next = [...prev];
      for (const file of list) {
        if (file.size > MAX_FILE_BYTES) {
          rejected.push(`${file.name} is larger than ${formatBytes(MAX_FILE_BYTES)}`);
          continue;
        }
        if (next.length >= MAX_FILES) {
          rejected.push(`only ${MAX_FILES} files can be sent at once`);
          break;
        }
        // Same name *and* same size and modified time is the same file picked
        // twice; different sizes are genuinely different files and both are
        // kept (the transfer protocol addresses files by index, not name).
        const duplicate = next.some(
          (f) => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified,
        );
        if (duplicate) continue;
        next.push(file);
      }
      return next;
    });

    setNotice(rejected.length > 0 ? `Skipped: ${[...new Set(rejected)].join('; ')}.` : null);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
    },
    [addFiles],
  );

  const removeAt = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const start = useCallback(() => {
    if (files.length === 0) return;
    clearStagedFiles();
    stageFiles(files);
    navigate('/send');
  }, [files, navigate]);

  return (
    <div className="flex flex-col">
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative isolate pt-10 sm:pt-16">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-grid opacity-60" aria-hidden="true" />

        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink-muted shadow-soft">
            <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
            Peer-to-peer · no account · no upload
          </span>

          <h1 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
            Move files between your devices,
            <br className="hidden sm:block" /> <span className="text-gradient">straight across</span>
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
            Droply opens a direct, encrypted connection between two browsers. Pick your files, share
            a six-character code, and they transfer device to device — never through a file server.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              onClick={() => document.getElementById('send-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            >
              <Upload className="size-4" aria-hidden="true" />
              Send files
            </Button>
            <Link
              to="/receive"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface-raised px-6 text-base font-semibold text-ink shadow-soft transition-colors hover:bg-surface-hover"
            >
              <Download className="size-4" aria-hidden="true" />
              Receive files
            </Link>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- picker panel */}
      <section id="send-panel" className="mt-14 scroll-mt-24 sm:mt-20">
        <Panel className="p-4 sm:p-6">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            {/* Drop zone */}
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
                'flex flex-col items-center justify-center rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors duration-150',
                dragging
                  ? 'border-brand bg-brand-soft'
                  : 'border-line bg-surface-sunken hover:border-line-strong',
              )}
            >
              <span
                className={cn(
                  'grid size-14 place-items-center rounded-2xl transition-colors',
                  dragging ? 'bg-brand text-white' : 'bg-surface-raised text-brand shadow-soft',
                )}
              >
                <UploadCloud className="size-7" aria-hidden="true" />
              </span>

              <h2 className="mt-4 text-lg font-bold text-ink">
                {dragging ? 'Drop to add' : 'Drop files here'}
              </h2>
              <p className="mt-1 text-sm text-ink-muted">or browse your device</p>

              {/* A real label+input pair: works with the keyboard and with
                  assistive technology, unlike a button that clicks a hidden
                  input. */}
              <label
                htmlFor={inputId}
                className="mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white shadow-brand-glow transition-colors hover:bg-brand-hover"
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
                  // Reset so re-picking the same file fires `change` again.
                  event.target.value = '';
                }}
              />

              <p className="mt-4 text-xs text-ink-subtle">
                Up to {MAX_FILES} files · {formatBytes(MAX_FILE_BYTES)} each
              </p>
            </div>

            {/* Selection */}
            <div className="flex flex-col rounded-card border border-line bg-surface-sunken">
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">
                    {files.length === 0
                      ? 'Nothing selected'
                      : `${files.length} ${files.length === 1 ? 'file' : 'files'}`}
                  </p>
                  <p className="text-xs text-ink-muted tabular">{formatBytes(totalSize)} total</p>
                </div>
                {files.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                    <Trash2 className="size-3.5" aria-hidden="true" />
                    Clear
                  </Button>
                )}
              </div>

              <div className="min-h-[9rem] flex-1 overflow-y-auto p-2 sm:max-h-56">
                {files.length === 0 ? (
                  <p className="flex h-full min-h-[8rem] items-center justify-center px-6 text-center text-sm text-ink-subtle">
                    Files you choose appear here before anything is shared.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                        className="flex items-center gap-3 rounded-xl border border-line bg-surface-raised px-3 py-2"
                      >
                        <FileTypeIcon filename={file.name} mimeType={file.type} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink" title={file.name}>
                            {file.name}
                          </p>
                          <p className="text-xs text-ink-muted tabular">{formatBytes(file.size)}</p>
                        </div>
                        <IconButton
                          label={`Remove ${file.name}`}
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

              <div className="border-t border-line p-3">
                <Button size="lg" fullWidth disabled={files.length === 0} onClick={start}>
                  <Link2 className="size-4" aria-hidden="true" />
                  Create a transfer room
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>

          {notice && (
            <Alert tone="warning" className="mt-4">
              {notice}
            </Alert>
          )}
        </Panel>
      </section>

      {/* ---------------------------------------------------------- how it works */}
      <section id="how-it-works" className="mt-20 scroll-mt-24 sm:mt-24">
        <h2 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">How it works</h2>
        <p className="mt-2 max-w-xl text-ink-muted">
          Three steps, and no sign-up anywhere in them.
        </p>

        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ Icon, title, body }, index) => (
            <li key={title} className="panel rounded-card p-5">
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="font-mono text-sm font-bold text-ink-subtle">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------- privacy */}
      <section className="mt-16 sm:mt-20">
        <div className="grid gap-4 md:grid-cols-3">
          {GUARANTEES.map(({ Icon, title, body }) => (
            <div key={title} className="panel rounded-card p-5">
              <span className="grid size-11 place-items-center rounded-xl bg-success-soft text-success">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-bold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
            </div>
          ))}
        </div>

        <Alert tone="neutral" className="mt-4">
          Droply is honest about its limits: a small signalling service introduces the two browsers
          to each other, so it does see a room code and connection details. And on networks that
          block direct connections, a transfer needs a TURN relay to work at all.{' '}
          <Link to="/privacy" className="font-semibold text-brand hover:underline">
            Read the full privacy model
          </Link>
          .
        </Alert>
      </section>
    </div>
  );
}
