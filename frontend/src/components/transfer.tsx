import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Loader2, XCircle, type LucideIcon } from 'lucide-react';
import { Badge, CopyButton, FileTypeIcon, ProgressBar } from './ui';
import { cn } from '../lib/cn';
import { formatBytes, formatDuration } from '../services/mime';

export type FileRowStatus =
  | 'pending'
  | 'active'
  | 'done'
  | 'failed'
  | 'cancelled';

const STATUS_BADGE: Record<FileRowStatus, { label: string; tone: 'neutral' | 'brand' | 'success' | 'danger'; Icon?: LucideIcon }> = {
  pending: { label: 'Queued', tone: 'neutral' },
  active: { label: 'In progress', tone: 'brand', Icon: Loader2 },
  done: { label: 'Verified', tone: 'success', Icon: CheckCircle2 },
  failed: { label: 'Failed', tone: 'danger', Icon: XCircle },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

/**
 * One file in a transfer list.
 *
 * Progress, throughput and remaining time are only rendered when the caller
 * actually has them. `bytesPerSecond` is `null` until the rate meter has a
 * real measurement, so nothing here is ever an invented number.
 */
export function FileRow({
  name,
  size,
  mimeType,
  status,
  transferred,
  bytesPerSecond,
  etaSeconds,
  previewUrl,
  note,
  actions,
}: {
  name: string;
  size: number;
  mimeType?: string | null;
  status: FileRowStatus;
  transferred?: number;
  bytesPerSecond?: number | null;
  etaSeconds?: number | null;
  previewUrl?: string | null;
  note?: string;
  actions?: React.ReactNode;
}) {
  const badge = STATUS_BADGE[status];
  const showProgress = status === 'active' && typeof transferred === 'number' && size > 0;
  const percent = showProgress ? Math.min(100, (transferred / size) * 100) : 0;
  const eta = formatDuration(etaSeconds ?? null);

  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:px-5">
      <div className="flex items-center gap-3.5">
        <FileTypeIcon filename={name} mimeType={mimeType} previewUrl={previewUrl} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink" title={name}>
            {name}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted tabular">
            <span>{formatBytes(size)}</span>
            {showProgress && (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatBytes(transferred)} transferred</span>
              </>
            )}
            {status === 'active' && bytesPerSecond ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{formatBytes(bytesPerSecond)}/s</span>
              </>
            ) : null}
            {status === 'active' && eta ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{eta} left</span>
              </>
            ) : null}
          </p>
          {note && <p className="mt-1 text-xs text-ink-subtle">{note}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={badge.tone} className="hidden sm:inline-flex">
            {badge.Icon && (
              <badge.Icon
                className={cn('size-3.5', status === 'active' && 'animate-spin')}
                aria-hidden="true"
              />
            )}
            {badge.label}
          </Badge>
          {actions}
        </div>
      </div>

      {showProgress && (
        <div className="flex items-center gap-3">
          <ProgressBar value={percent} label={`Transfer progress for ${name}`} className="h-1.5" />
          <span className="w-10 shrink-0 text-right text-xs font-semibold text-ink-muted tabular">
            {Math.round(percent)}%
          </span>
        </div>
      )}
    </li>
  );
}

/**
 * The room code and its QR code.
 *
 * The QR plate stays light in both themes: a dark-on-dark code is unreliable
 * to scan, and error correction level M with a quiet zone is what cheap phone
 * cameras need.
 */
export function RoomCard({ roomId, shareUrl }: { roomId: string; shareUrl: string }) {
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="w-full">
        <p className="mb-2 text-center text-xs font-bold uppercase tracking-widest text-ink-subtle">
          Room code
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <output
            className="rounded-xl border border-line bg-surface-sunken px-5 py-3 font-mono text-3xl font-bold tracking-[0.3em] text-ink sm:text-4xl"
            aria-label={`Room code ${roomId.split('').join(' ')}`}
          >
            {roomId}
          </output>
          <div className="flex gap-2">
            <CopyButton value={roomId} label="Copy room code">
              Code
            </CopyButton>
            <CopyButton value={shareUrl} label="Copy share link">
              Link
            </CopyButton>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-card ring-1 ring-black/5">
        <QRCodeSVG
          value={shareUrl}
          size={176}
          level="M"
          marginSize={2}
          bgColor="#ffffff"
          fgColor="#0f1729"
          title={`QR code linking to Droply room ${roomId}`}
        />
      </div>

      <p className="max-w-xs text-center text-sm text-ink-muted">
        Scan the code with the other device&rsquo;s camera, or enter the room code on
        Droply&rsquo;s Receive screen.
      </p>
    </div>
  );
}

/** Headline figure plus a sub-label, used above transfer lists. */
export function StatLine({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(({ label, value }) => (
        <div key={label} className="rounded-card border border-line bg-surface-sunken px-3.5 py-3">
          <dt className="text-[11px] font-bold uppercase tracking-wide text-ink-subtle">{label}</dt>
          <dd className="mt-1 truncate text-sm font-bold text-ink tabular">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
