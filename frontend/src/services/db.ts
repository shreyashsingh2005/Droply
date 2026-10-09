/**
 * Transfer history (IndexedDB).
 *
 * What is stored: metadata only -- name, type, size, direction, outcome,
 * timestamp. **File contents are never persisted.** That is a deliberate
 * product decision (it would silently consume the device's storage), and it
 * means a history entry cannot re-open or re-download the file. The UI says so
 * rather than implying otherwise.
 *
 * Storage can be unavailable or full: Safari private browsing throws on
 * `indexedDB.open`, Firefox private mode refuses writes, and any browser can
 * hit a quota. Every entry point here degrades to "history unavailable"
 * instead of breaking the page.
 */

import { log } from '../lib/logger';

export type TransferDirection = 'sent' | 'received';

export type TransferOutcome =
  | 'completed' // transferred and verified end to end
  | 'failed' // integrity check or connection failed
  | 'cancelled';

export interface TransferRecord {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  timestamp: number;
  direction: TransferDirection;
  outcome: TransferOutcome;
  /** Whether the SHA-256 check passed. Only meaningful for `completed`. */
  hashVerified: boolean;
  /**
   * Always false in the current design: we keep metadata, not bytes. Kept
   * explicit so the UI never has to guess, and so a future opt-in local-save
   * feature has somewhere truthful to record itself.
   */
  storedLocally: boolean;
}

const DB_NAME = 'DroplyDB';
const DB_VERSION = 2;
const STORE = 'transfers';
const LEGACY_STORE = 'receivedFiles';

/** Keep the list useful without letting it grow forever. */
const MAX_RECORDS = 500;

export class StorageUnavailableError extends Error {
  readonly reason: 'unsupported' | 'blocked' | 'quota';
  constructor(reason: 'unsupported' | 'blocked' | 'quota', message: string) {
    super(message);
    this.name = 'StorageUnavailableError';
    this.reason = reason;
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new StorageUnavailableError('unsupported', 'This browser does not provide local storage for history.'),
    );
  }

  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (err) {
      // Safari in private browsing throws synchronously here.
      reject(
        new StorageUnavailableError(
          'blocked',
          'Local storage is blocked in this browser mode, so history cannot be saved.',
        ),
      );
      log.db.warn('indexedDB.open threw', err);
      return;
    }

    request.onerror = () => {
      reject(
        new StorageUnavailableError(
          'blocked',
          'Local storage is unavailable, so history cannot be saved. Private browsing usually causes this.',
        ),
      );
    };

    request.onblocked = () => {
      reject(
        new StorageUnavailableError(
          'blocked',
          'Another Droply tab is upgrading the local database. Close other Droply tabs and reload.',
        ),
      );
    };

    request.onsuccess = () => {
      const db = request.result;
      // If another tab upgrades the schema, drop our handle rather than
      // operating on a stale connection.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;

      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('direction', 'direction');
      }

      // v1 -> v2. The v1 store briefly persisted file Blobs; carry the
      // metadata forward and drop the store so that storage is reclaimed.
      if (event.oldVersion < 2 && db.objectStoreNames.contains(LEGACY_STORE) && tx) {
        try {
          const legacy = tx.objectStore(LEGACY_STORE);
          const target = tx.objectStore(STORE);
          const all = legacy.getAll();
          all.onsuccess = () => {
            for (const row of (all.result ?? []) as Record<string, unknown>[]) {
              if (typeof row.id !== 'string') continue;
              target.put({
                id: row.id,
                filename: typeof row.filename === 'string' ? row.filename : 'unknown',
                mimeType: typeof row.mimeType === 'string' ? row.mimeType : '',
                size: typeof row.size === 'number' ? row.size : 0,
                timestamp: typeof row.timestamp === 'number' ? row.timestamp : Date.now(),
                direction: 'received',
                outcome: 'completed',
                hashVerified: true,
                storedLocally: false,
              } satisfies TransferRecord);
            }
            db.deleteObjectStore(LEGACY_STORE);
          };
        } catch (err) {
          log.db.warn('legacy history migration skipped', err);
        }
      }
    };
  });
}

function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabase().catch((err) => {
      dbPromise = null; // allow a later retry
      throw err;
    });
  }
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return getDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
          tx = db.transaction(STORE, mode);
        } catch (err) {
          reject(err);
          return;
        }
        const request = work(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          const err = request.error;
          if (err?.name === 'QuotaExceededError') {
            reject(new StorageUnavailableError('quota', 'This device has run out of storage for history.'));
          } else {
            reject(err ?? new Error('IndexedDB request failed'));
          }
        };
        tx.onabort = () => {
          const err = tx.error;
          if (err?.name === 'QuotaExceededError') {
            reject(new StorageUnavailableError('quota', 'This device has run out of storage for history.'));
          }
        };
      }),
  );
}

/** True when history can be read and written at all. */
export async function isHistoryAvailable(): Promise<boolean> {
  try {
    await getDB();
    return true;
  } catch {
    return false;
  }
}

/**
 * Record one transfer. Never throws: history is a convenience, and failing to
 * write it must not disturb a transfer that actually succeeded.
 */
export async function recordTransfer(
  record: Omit<TransferRecord, 'id' | 'storedLocally'> & { id?: string },
): Promise<void> {
  const row: TransferRecord = {
    id: record.id ?? crypto.randomUUID(),
    filename: record.filename,
    mimeType: record.mimeType,
    size: record.size,
    timestamp: record.timestamp,
    direction: record.direction,
    outcome: record.outcome,
    hashVerified: record.hashVerified,
    storedLocally: false,
  };
  try {
    await run('readwrite', (store) => store.put(row));
    await pruneOldest();
  } catch (err) {
    log.db.warn('could not write history entry', err instanceof Error ? err.message : err);
  }
}

/** Newest first. Throws `StorageUnavailableError` so the UI can explain why. */
export async function getHistory(): Promise<TransferRecord[]> {
  const rows = await run<TransferRecord[]>('readonly', (store) => store.getAll());
  return rows
    .filter((r): r is TransferRecord => Boolean(r) && typeof r.id === 'string')
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function deleteHistoryRecord(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
}

export async function clearHistory(): Promise<void> {
  await run('readwrite', (store) => store.clear());
}

/** Keep only the newest MAX_RECORDS entries. */
async function pruneOldest(): Promise<void> {
  try {
    const count = await run<number>('readonly', (store) => store.count());
    if (count <= MAX_RECORDS) return;
    const rows = await getHistory();
    const doomed = rows.slice(MAX_RECORDS);
    for (const row of doomed) {
      await run('readwrite', (store) => store.delete(row.id));
    }
    log.db.debug('pruned history', { removed: doomed.length });
  } catch {
    /* best effort */
  }
}
