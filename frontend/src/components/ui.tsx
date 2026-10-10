import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileType2,
  FileVideo,
  File as FileIcon,
  Image as ImageIcon,
  Info,
  Loader2,
  Monitor,
  Moon,
  Presentation,
  Sun,
  X,
  XCircle,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { fileKind } from '../services/mime';
import type { ThemePreference } from '../hooks/useTheme';

/* -------------------------------------------------------------------------- */
/* Brand                                                                      */
/* -------------------------------------------------------------------------- */

export function Logo({ size = 32, withWordmark = true }: { size?: number; withWordmark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="grid shrink-0 place-items-center rounded-[30%] bg-gradient-to-br from-brand to-cyan shadow-brand-glow"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {/* Same mark as favicon.svg and the PWA icons, so the brand is
            consistent across the tab, the home screen and the page. */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          style={{ width: size * 0.6, height: size * 0.6 }}
          stroke="white"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" />
          <path d="m21.854 2.147-10.94 10.939" />
        </svg>
      </span>
      {withWordmark && (
        <span className="text-[1.35rem] font-bold tracking-tight text-ink">Droply</span>
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Button                                                                     */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-r from-brand to-brand-hover text-white shadow-brand-glow hover:shadow-[0_0_20px_rgba(43,92,255,0.5)] hover:-translate-y-0.5 active:translate-y-px disabled:shadow-none transition-all duration-300',
  secondary:
    'bg-surface-raised text-ink border border-line hover:bg-surface-hover hover:border-line-strong active:translate-y-px',
  ghost: 'text-ink-muted hover:text-ink hover:bg-surface-hover',
  danger:
    'bg-danger text-white hover:brightness-110 active:translate-y-px disabled:brightness-100',
  subtle: 'bg-brand-soft text-brand hover:brightness-[0.97] active:translate-y-px',
};

const SIZES: Record<ButtonSize, string> = {
  // min-h keeps every control at or above a 44px touch target on mobile.
  sm: 'min-h-9 px-3 text-sm gap-1.5 rounded-lg',
  md: 'min-h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'min-h-12 px-6 text-base gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: ButtonVariant;
}

/** Icon-only control. `label` is required: it becomes the accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, variant = 'ghost', className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid size-10 shrink-0 place-items-center rounded-xl transition-all duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/* Surfaces                                                                   */
/* -------------------------------------------------------------------------- */

export function Panel({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('panel overflow-hidden rounded-panel', className)} {...rest}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  description,
  icon,
  actions,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line bg-surface-sunken/60 px-5 py-4 sm:px-7 sm:py-5">
      <div className="flex min-w-0 items-start gap-3.5">
        {icon && (
          <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-surface-raised text-brand">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-ink sm:text-xl">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Status                                                                     */
/* -------------------------------------------------------------------------- */

export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted border-line',
  brand: 'bg-brand-soft text-brand border-brand/25',
  success: 'bg-success-soft text-success border-success/25',
  warning: 'bg-warning-soft text-warning border-warning/25',
  danger: 'bg-danger-soft text-danger border-danger/25',
  info: 'bg-cyan-soft text-cyan border-cyan/25',
};

export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <>
      <Loader2 className={cn('size-5 animate-spin text-brand', className)} aria-hidden="true" />
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}

/** Live-updating status line. `tone` drives colour, never colour alone. */
export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const Icon =
    tone === 'danger'
      ? XCircle
      : tone === 'warning'
        ? AlertTriangle
        : tone === 'success'
          ? CheckCircle2
          : Info;
  return (
    <div
      className={cn('flex gap-3 rounded-card border px-4 py-3 text-sm', TONES[tone], className)}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

export function ProgressBar({
  value,
  label,
  indeterminate = false,
  tone = 'brand',
  className,
}: {
  /** 0-100. Ignored when `indeterminate`. */
  value: number;
  /** Accessible name; required for a meaningful announcement. */
  label: string;
  indeterminate?: boolean;
  tone?: 'brand' | 'success' | 'danger';
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const fill =
    tone === 'success'
      ? 'bg-success'
      : tone === 'danger'
        ? 'bg-danger'
        : 'bg-gradient-to-r from-brand to-cyan';

  return (
    <div
      className={cn(
        'relative h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken ring-1 ring-inset ring-line',
        className,
      )}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(clamped)}
      aria-valuetext={indeterminate ? 'Working' : `${Math.round(clamped)}%`}
    >
      {indeterminate ? (
        <div
          className={cn('absolute inset-y-0 w-1/3 rounded-full', fill)}
          style={{ animation: 'indeterminate 1.4s ease-in-out infinite' }}
        />
      ) : (
        <div
          className={cn('h-full rounded-full transition-[width] duration-300 ease-out', fill)}
          style={{ width: `${clamped}%` }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* File type icon                                                             */
/* -------------------------------------------------------------------------- */

const KIND_ICON = {
  image: ImageIcon,
  video: FileVideo,
  audio: FileAudio,
  pdf: FileType2,
  archive: Archive,
  document: FileText,
  spreadsheet: FileSpreadsheet,
  presentation: Presentation,
  code: Code2,
  text: FileText,
  file: FileIcon,
} as const;

const KIND_TONE: Record<keyof typeof KIND_ICON, string> = {
  image: 'bg-cyan-soft text-cyan',
  video: 'bg-brand-soft text-brand',
  audio: 'bg-brand-soft text-brand',
  pdf: 'bg-danger-soft text-danger',
  archive: 'bg-warning-soft text-warning',
  document: 'bg-brand-soft text-brand',
  spreadsheet: 'bg-success-soft text-success',
  presentation: 'bg-warning-soft text-warning',
  code: 'bg-cyan-soft text-cyan',
  text: 'bg-surface-sunken text-ink-muted',
  file: 'bg-surface-sunken text-ink-muted',
};

export function FileTypeIcon({
  filename,
  mimeType,
  previewUrl,
  size = 'md',
  className,
}: {
  filename: string;
  mimeType?: string | null;
  /** When present and the file is an image, show a real thumbnail. */
  previewUrl?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const kind = fileKind(filename, mimeType);
  const Icon = KIND_ICON[kind];
  const box =
    size === 'sm' ? 'size-9 rounded-lg' : size === 'lg' ? 'size-14 rounded-2xl' : 'size-11 rounded-xl';
  const glyph = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-7' : 'size-5';

  if (previewUrl && kind === 'image') {
    return (
      <span className={cn('block shrink-0 overflow-hidden border border-line', box, className)}>
        <img src={previewUrl} alt="" className="size-full object-cover" loading="lazy" />
      </span>
    );
  }

  return (
    <span
      className={cn('grid shrink-0 place-items-center', box, KIND_TONE[kind], className)}
      aria-hidden="true"
    >
      <Icon className={glyph} />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty state                                                                */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="grid size-16 place-items-center rounded-2xl border border-line bg-surface-sunken text-ink-subtle">
        {icon}
      </span>
      <h3 className="mt-5 text-lg font-bold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-muted">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Copy field                                                                 */
/* -------------------------------------------------------------------------- */

export function CopyButton({
  value,
  label,
  size = 'md',
  variant = 'secondary',
  children,
}: {
  value: string;
  label: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  children?: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async () => {
    const flash = (ok: boolean) => {
      setCopied(ok);
      setFailed(!ok);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setCopied(false);
        setFailed(false);
      }, 2200);
    };

    // `navigator.clipboard` rejects on insecure origins and when permission is
    // denied; the textarea path keeps the button working instead of throwing
    // an unhandled rejection.
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        flash(true);
        return;
      }
      throw new Error('clipboard unavailable');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        flash(ok);
      } catch {
        flash(false);
      }
    }
  }, [value]);

  return (
    <Button variant={variant} size={size} onClick={() => void copy()} aria-label={label}>
      {copied ? (
        <Check className="size-4 text-success" aria-hidden="true" />
      ) : (
        <Copy className="size-4" aria-hidden="true" />
      )}
      {children ?? (copied ? 'Copied' : failed ? 'Copy failed' : 'Copy')}
    </Button>
  );
}

/* -------------------------------------------------------------------------- */
/* Confirm dialog                                                             */
/* -------------------------------------------------------------------------- */

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'brand';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  const descId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement;
    confirmRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
        return;
      }
      // Keep focus inside the dialog while it is modal.
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (restoreTo.current instanceof HTMLElement) restoreTo.current.focus();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="relative w-full max-w-md rounded-panel border border-line bg-surface-overlay p-6 shadow-float animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-200 sm:slide-in-from-bottom-0"
      >
        <div className="flex items-start gap-3.5">
          <span
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-xl',
              tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand',
            )}
          >
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descId} className="mt-1.5 text-sm text-ink-muted">
                {description}
              </p>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button ref={confirmRef} variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Theme control                                                              */
/* -------------------------------------------------------------------------- */

const THEME_OPTIONS: { value: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

export function ThemeSwitch({
  preference,
  onChange,
}: {
  preference: ThemePreference;
  onChange: (next: ThemePreference) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="inline-flex items-center gap-0.5 rounded-xl border border-line bg-surface-sunken p-0.5"
    >
      {THEME_OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label} theme`}
            title={`${label} theme`}
            onClick={() => onChange(value)}
            className={cn(
              'grid size-8 place-items-center rounded-[0.6rem] transition-colors',
              active
                ? 'bg-surface-raised text-brand shadow-soft'
                : 'text-ink-subtle hover:text-ink',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Screen-reader announcer                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Polite live region for transfer state. Visual status changes (a spinner
 * becoming a tick) are invisible to a screen reader otherwise.
 */
export function StatusAnnouncer({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

export function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <IconButton label={label} onClick={onClick} className="size-8 rounded-lg">
      <X className="size-4" aria-hidden="true" />
    </IconButton>
  );
}
