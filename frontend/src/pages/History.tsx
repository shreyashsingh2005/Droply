import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  HardDrive,
  History as HistoryIcon,
  Info,
  Search,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  FileTypeIcon,
  IconButton,
  Panel,
  PanelHeader,
  Spinner,
} from '../components/ui';
import {
  StorageUnavailableError,
  clearHistory,
  deleteHistoryRecord,
  getHistory,
  type TransferRecord,
} from '../services/db';
import { formatBytes } from '../services/mime';
import { cn } from '../lib/cn';

type Filter = 'all' | 'received' | 'sent';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'received', label: 'Received' },
  { value: 'sent', label: 'Sent' },
];

function formatWhen(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' })}, ${time}`;
}

/**
 * Transfer history.
 *
 * This page records *that* a transfer happened, not the file itself. The
 * previous version labelled every row "File Saved Locally" and told the user
 * their files were "saved securely on this device" -- neither was true after
 * blob persistence was removed, so there was no way to save a file from here
 * and no indication of that. The copy and the badges below say what is
 * actually stored.
 */
export function History() {
  const [records, setRecords] = useState<TransferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRecords(await getHistory());
      setError(null);
    } catch (err) {
      setError(
        err instanceof StorageUnavailableError
          ? err.message
          : 'Could not read the local history database.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = useCallback(async (id: string) => {
    // Optimistic: the row disappears immediately, and is restored if the
    // delete fails, so the list never disagrees with storage.
    const snapshot = records;
    setRecords((prev) => prev.filter((r) => r.id !== id));
    try {
      await deleteHistoryRecord(id);
    } catch {
      setRecords(snapshot);
      setError('That entry could not be deleted.');
    }
  }, [records]);

  const clearAll = useCallback(async () => {
    setConfirmClear(false);
    const snapshot = records;
    setRecords([]);
    try {
      await clearHistory();
    } catch {
      setRecords(snapshot);
      setError('History could not be cleared.');
    }
  }, [records]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return records.filter((record) => {
      if (filter !== 'all' && record.direction !== filter) return false;
      if (!needle) return true;
      return record.filename.toLowerCase().includes(needle);
    });
  }, [records, search, filter]);

  const counts = useMemo(
    () => ({
      received: records.filter((r) => r.direction === 'received').length,
      sent: records.filter((r) => r.direction === 'sent').length,
    }),
    [records],
  );

  return (
    <div className="mx-auto w-full max-w-3xl 2xl:max-w-4xl px-4 sm:px-6 py-8 sm:py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl 2xl:text-3xl font-bold text-ink sm:text-3xl">
            <HistoryIcon className="size-7 text-brand" aria-hidden="true" />
            Transfer history
          </h1>
          <p className="mt-2 max-w-xl text-sm text-ink-muted">
            A record of what you have sent and received on this device. Kept locally, in this
            browser only.
          </p>
        </div>
        {records.length > 0 && (
          <Button variant="secondary" onClick={() => setConfirmClear(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            Clear history
          </Button>
        )}
      </div>

      <Alert tone="neutral" className="mb-5" title="Metadata only — not the files">
        Droply records file names, sizes and times, never the file contents. That keeps your device
        storage free, and it means an entry here cannot re-open or re-download a file. To get a file
        again, ask the sender to share it again.
      </Alert>

      <Panel className="bg-surface-raised/80 backdrop-blur-xl border-line dark:border-white/10 shadow-lg ">
        <PanelHeader
          title="Records"
          description={`${counts.received} received · ${counts.sent} sent`}
        />

        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:p-5">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by file name"
              aria-label="Search history by file name"
              className="w-full rounded-xl border border-line bg-surface-sunken/50 dark:bg-black/20 py-2.5 pl-10 pr-3 text-sm text-ink placeholder:text-ink-subtle focus:border-brand focus:bg-surface-raised"
            />
          </div>

          <div
            role="radiogroup"
            aria-label="Filter by direction"
            className="flex items-center gap-0.5 rounded-xl border border-line bg-surface-sunken/50 dark:bg-black/20 p-0.5"
          >
            {FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  'min-h-9 flex-1 rounded-[0.6rem] px-3 text-sm font-semibold transition-colors sm:flex-none',
                  filter === value
                    ? 'bg-surface-raised text-brand shadow-soft'
                    : 'text-ink-subtle hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <Spinner className="size-6" label="Loading history" />
            <p className="text-sm text-ink-muted">Loading history…</p>
          </div>
        ) : error ? (
          <div className="p-5 sm:p-7">
            <Alert tone="warning" title="History is unavailable">
              {error} Transfers still work normally — only this record keeping is affected.
            </Alert>
            <Button variant="secondary" className="mt-4" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<HardDrive className="size-7" aria-hidden="true" />}
            title={records.length === 0 ? 'No transfers yet' : 'Nothing matches'}
            description={
              records.length === 0
                ? 'Once you send or receive a file, it will show up here.'
                : 'Try a different search term or filter.'
            }
            action={
              records.length === 0 ? (
                <div className="flex gap-2.5">
                  <Link
                    to="/"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-brand-glow hover:bg-brand-hover"
                  >
                    Send a file
                  </Link>
                  <Link
                    to="/receive"
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line bg-surface-raised px-4 text-sm font-semibold text-ink hover:bg-surface-hover"
                  >
                    Receive a file
                  </Link>
                </div>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch('');
                    setFilter('all');
                  }}
                >
                  Clear filters
                </Button>
              )
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {visible.map((record) => (
              <li
                key={record.id}
                className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-hover/50 sm:px-5"
              >
                <FileTypeIcon filename={record.filename} mimeType={record.mimeType} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink" title={record.filename}>
                    {record.filename}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted tabular">
                    <span className="inline-flex items-center gap-1 font-semibold">
                      {record.direction === 'received' ? (
                        <ArrowDownToLine className="size-3" aria-hidden="true" />
                      ) : (
                        <ArrowUpFromLine className="size-3" aria-hidden="true" />
                      )}
                      {record.direction === 'received' ? 'Received' : 'Sent'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatBytes(record.size)}</span>
                    <span aria-hidden="true">·</span>
                    <time dateTime={new Date(record.timestamp).toISOString()}>
                      {formatWhen(record.timestamp)}
                    </time>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {record.outcome === 'completed' ? (
                    record.hashVerified ? (
                      <Badge tone="success" className="hidden sm:inline-flex">
                        <ShieldCheck className="size-3.5" aria-hidden="true" />
                        Verified
                      </Badge>
                    ) : (
                      <Badge tone="neutral" className="hidden sm:inline-flex">
                        Completed
                      </Badge>
                    )
                  ) : record.outcome === 'failed' ? (
                    <Badge tone="danger" className="hidden sm:inline-flex">
                      Failed
                    </Badge>
                  ) : (
                    <Badge tone="neutral" className="hidden sm:inline-flex">
                      Cancelled
                    </Badge>
                  )}

                  <IconButton
                    label={`Delete history entry for ${record.filename}`}
                    onClick={() => void remove(record.id)}
                    className="size-9 hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </IconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="mt-5 flex items-start gap-2 text-xs text-ink-subtle">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
        History lives in this browser&rsquo;s local database. Clearing site data, or using private
        browsing, removes it.
      </p>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all history?"
        description={`This permanently removes all ${records.length} ${records.length === 1 ? 'record' : 'records'} from this browser. No files are affected — Droply never stored any.`}
        confirmLabel="Clear history"
        onConfirm={() => void clearAll()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
