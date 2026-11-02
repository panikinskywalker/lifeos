import type { DatabaseAdapter } from './adapter';

/**
 * Database encryption (docs/MODEL.md layer 6, R15): which file to open, and
 * the one-time move of a plain database into an encrypted one. Pure: the
 * platform hands in the files and the SQLCipher calls (`DbStore`), so the
 * order of steps, the checks and the never-lose-data rules are tested here.
 */

export const DB_FILES = {
  plain: 'lifeos.db',
  secure: 'lifeos-secure.db',
  /** The real move's copy, until it has been checked. */
  moving: 'lifeos-moving.db',
  /** "Try on a copy": made, checked, deleted. */
  trial: 'lifeos-trial.db',
} as const;

export interface DbStore {
  exists(name: string): boolean;
  /** Delete the file and its -wal / -shm. */
  remove(name: string): void;
  rename(from: string, to: string): void;
  /** Open (creating if missing); `key` null = plain. Throws when the key doesn't open it. */
  open(name: string, key: string | null): DatabaseAdapter;
  /** Write an encrypted copy of the open database `from` to `name` (SQLCipher's sqlcipher_export). */
  exportEncrypted(from: DatabaseAdapter, name: string, key: string): void;
}

export interface CopyReport {
  tables: number;
  rows: number;
}

export interface OpenedDatabase {
  db: DatabaseAdapter;
  encrypted: boolean;
  /** Set when this start moved the plain database into the encrypted one. */
  moved?: CopyReport;
  /** Set when the move was tried and failed; the plain database is still in use. */
  moveError?: string;
  /** An encrypted file whose key was missing, set aside under this name. */
  setAside?: string;
}

/** A key is 32 bytes as 64 hex digits, used raw (no passphrase stretching). */
export const isDbKey = (k: string | null | undefined): k is string => !!k && /^[0-9a-f]{64}$/.test(k);

export const keyToHex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Rows in every table (FTS tables included), by name. */
export function tableCounts(db: DatabaseAdapter): Record<string, number> {
  const out: Record<string, number> = {};
  for (const { name } of db.all<{ name: string }>(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)) {
    out[name] = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`)?.n ?? 0;
  }
  return out;
}

/** Tables whose row count differs between the two, as "name a≠b". */
export function countDifferences(a: Record<string, number>, b: Record<string, number>): string[] {
  const names = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return names.filter((n) => a[n] !== b[n]).map((n) => `${n} ${a[n] ?? 'missing'}≠${b[n] ?? 'missing'}`);
}

/**
 * Copy `from` into `name` encrypted with `key`, open the copy with the key and
 * check it: SQLite's quick check, and every table's row count against `from`.
 * A copy that fails is deleted and the error thrown; `from` is never touched.
 */
export function copyEncrypted(store: DbStore, from: DatabaseAdapter, name: string, key: string): CopyReport {
  if (!isDbKey(key)) throw new Error('Not a database key');
  const before = tableCounts(from);
  if (store.exists(name)) store.remove(name);
  try {
    store.exportEncrypted(from, name, key);
    const copy = store.open(name, key);
    try {
      const check = copy.get<{ quick_check: string }>(`PRAGMA quick_check`)?.quick_check;
      if (check !== 'ok') throw new Error(`The encrypted copy failed SQLite's check: ${check ?? 'no answer'}`);
      const diff = countDifferences(before, tableCounts(copy));
      if (diff.length) throw new Error(`The encrypted copy doesn't match: ${diff.slice(0, 5).join(', ')}`);
    } finally {
      copy.close();
    }
  } catch (e) {
    if (store.exists(name)) store.remove(name);
    throw e;
  }
  const counts = Object.values(before);
  return { tables: counts.length, rows: counts.reduce((a, b) => a + b, 0) };
}

/** "Try on a copy": the move's copy and checks against the open database, then the copy is deleted. */
export function trialMove(store: DbStore, live: DatabaseAdapter, key: string): CopyReport {
  try {
    return copyEncrypted(store, live, DB_FILES.trial, key);
  } finally {
    if (store.exists(DB_FILES.trial)) store.remove(DB_FILES.trial);
  }
}

/**
 * Which database to open at start, moving the plain one first when a key is
 * saved for it. In order:
 *  - encrypted file and its key: open it; a plain file left from a finished
 *    move is deleted now (it was checked on the start before).
 *  - encrypted file, key missing: set the file aside (kept), then go on as
 *    below: a plain file still there is opened, else a new database.
 *  - plain file and a key: the move (copy, check, switch); if it fails, the
 *    plain database stays in use and the error is reported.
 *  - plain file, no key: open it as it is (encrypting is your choice).
 *  - nothing yet: a new database, encrypted when this build can.
 */
export function openDatabaseFiles(
  store: DbStore,
  /** `makeKey` makes a new key and saves it, before anything is written with it. */
  opts: { key: string | null; cipher: boolean; makeKey: () => string; now?: number },
): OpenedDatabase {
  const { secure, plain, moving } = DB_FILES;
  const key = isDbKey(opts.key) ? opts.key : null;
  let setAside: string | undefined;
  if (store.exists(moving)) store.remove(moving); // a move cut off before its check: start it again

  if (store.exists(secure)) {
    if (!opts.cipher) throw new Error('The database is encrypted, but this app build cannot open encrypted databases. Install the latest build.');
    if (key) {
      const db = store.open(secure, key);
      if (store.exists(plain)) store.remove(plain);
      return { db, encrypted: true };
    }
    setAside = `lifeos-secure-unreadable-${opts.now ?? Date.now()}.db`;
    store.rename(secure, setAside);
  }

  if (store.exists(plain)) {
    if (!key || !opts.cipher) return { db: store.open(plain, null), encrypted: false, setAside };
    const db = store.open(plain, null);
    let moved: CopyReport;
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      moved = copyEncrypted(store, db, moving, key);
    } catch (e) {
      return { db, encrypted: false, moveError: (e as Error).message };
    }
    db.close();
    store.rename(moving, secure);
    return { db: store.open(secure, key), encrypted: true, moved };
  }

  if (!opts.cipher) return { db: store.open(plain, null), encrypted: false, setAside };
  return { db: store.open(secure, key ?? opts.makeKey()), encrypted: true, setAside };
}
