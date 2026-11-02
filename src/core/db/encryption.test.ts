import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DatabaseAdapter } from './adapter';
import { createBetterSqliteAdapter } from './betterSqliteAdapter';
import { migrate } from './migrate';
import { DB_FILES, isDbKey, keyToHex, openDatabaseFiles, tableCounts, trialMove, type DbStore } from './encryption';

const KEY = keyToHex(new Uint8Array(32).fill(7));
const OTHER = keyToHex(new Uint8Array(32).fill(9));

/**
 * Real SQLite files in a temp folder. better-sqlite3 has no SQLCipher, so a
 * file's key is kept beside it and checked on open the way SQLCipher would
 * refuse a wrong or missing key; the export is VACUUM INTO.
 */
function fileStore(dir: string, opts: { spoilCopy?: boolean } = {}): DbStore & { path: (n: string) => string } {
  const path = (n: string) => join(dir, n);
  const keyOf = (n: string) => (existsSync(path(n) + '.key') ? readFileSync(path(n) + '.key', 'utf8') : null);
  return {
    path,
    exists: (n) => existsSync(path(n)),
    remove: (n) => ['', '-wal', '-shm', '.key'].forEach((s) => rmSync(path(n) + s, { force: true })),
    rename: (a, b) => ['', '-wal', '-shm', '.key'].forEach((s) => existsSync(path(a) + s) && renameSync(path(a) + s, path(b) + s)),
    open(n, key) {
      if (existsSync(path(n)) && keyOf(n) !== key) throw new Error('file is not a database');
      if (!existsSync(path(n)) && key) writeFileSync(path(n) + '.key', key);
      return createBetterSqliteAdapter(path(n));
    },
    exportEncrypted(from, n, key) {
      from.exec(`VACUUM INTO '${path(n)}'`);
      writeFileSync(path(n) + '.key', key);
      if (opts.spoilCopy) {
        const c = createBetterSqliteAdapter(path(n));
        c.run(`DELETE FROM settings WHERE key='b'`);
        c.close();
      }
    },
  };
}

function seed(db: DatabaseAdapter) {
  migrate(db);
  db.run(`INSERT INTO settings(key,value,updated_at) VALUES ('a','1',1),('b','2',1)`);
  db.run(`INSERT INTO records_fts(id,object,title,subtitle,body) VALUES ('d1','dump','Paid Karan','Dump','Paid Karan 500')`);
}

const settingsIn = (db: DatabaseAdapter) => db.all<{ key: string }>(`SELECT key FROM settings ORDER BY key`).map((r) => r.key);

describe('database encryption: opening and the one-time move', () => {
  let dir: string;
  let made: number;
  const makeKey = () => (made++, KEY);
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'lifeos-enc-'));
    made = 0;
  });

  const plainWithData = (store: DbStore) => {
    const db = store.open(DB_FILES.plain, null);
    seed(db);
    db.close();
  };

  it('keys are 32 bytes as hex', () => {
    expect(isDbKey(KEY)).toBe(true);
    expect(isDbKey('abc')).toBe(false);
    expect(isDbKey(null)).toBe(false);
  });

  it('a new install starts encrypted with a new saved key', () => {
    const store = fileStore(dir);
    const r = openDatabaseFiles(store, { key: null, cipher: true, makeKey });
    expect(r.encrypted).toBe(true);
    expect(made).toBe(1);
    expect(store.exists(DB_FILES.secure)).toBe(true);
    expect(store.exists(DB_FILES.plain)).toBe(false);
    r.db.close();
  });

  it('a build without SQLCipher keeps the plain database', () => {
    const store = fileStore(dir);
    const r = openDatabaseFiles(store, { key: null, cipher: false, makeKey });
    expect(r.encrypted).toBe(false);
    expect(store.exists(DB_FILES.plain)).toBe(true);
    r.db.close();
  });

  it('a plain database stays as it is until a key is saved for it', () => {
    const store = fileStore(dir);
    plainWithData(store);
    const r = openDatabaseFiles(store, { key: null, cipher: true, makeKey });
    expect(r.encrypted).toBe(false);
    expect(r.moved).toBeUndefined();
    expect(made).toBe(0);
    expect(settingsIn(r.db)).toEqual(['a', 'b']);
    r.db.close();
  });

  it('moves the plain database into the encrypted one, every row kept, and deletes the plain file on the next start', () => {
    const store = fileStore(dir);
    plainWithData(store);
    const plainCounts = (() => {
      const db = store.open(DB_FILES.plain, null);
      const c = tableCounts(db);
      db.close();
      return c;
    })();

    const r = openDatabaseFiles(store, { key: KEY, cipher: true, makeKey });
    expect(r.encrypted).toBe(true);
    expect(r.moveError).toBeUndefined();
    expect(r.moved?.tables).toBe(Object.keys(plainCounts).length);
    expect(r.moved?.rows).toBe(Object.values(plainCounts).reduce((a, b) => a + b, 0));
    expect(tableCounts(r.db)).toEqual(plainCounts);
    expect(settingsIn(r.db)).toEqual(['a', 'b']);
    // Works on as before: migrations are already applied, triggers came along.
    expect(migrate(r.db).from).toBe(migrate(r.db).to);
    expect(() => r.db.run(`DELETE FROM dumps`)).not.toThrow(); // empty table: nothing to refuse
    r.db.run(`INSERT INTO settings(key,value,updated_at) VALUES ('c','3',2)`);
    // The plain file is kept until the encrypted one has opened again.
    expect(store.exists(DB_FILES.plain)).toBe(true);
    expect(store.exists(DB_FILES.moving)).toBe(false);
    r.db.close();

    const again = openDatabaseFiles(store, { key: KEY, cipher: true, makeKey });
    expect(again.encrypted).toBe(true);
    expect(again.moved).toBeUndefined();
    expect(settingsIn(again.db)).toEqual(['a', 'b', 'c']);
    expect(store.exists(DB_FILES.plain)).toBe(false);
    expect(made).toBe(0);
    again.db.close();
  });

  it('a copy that does not match is deleted and the plain database stays in use, whole', () => {
    const store = fileStore(dir, { spoilCopy: true });
    plainWithData(store);
    const r = openDatabaseFiles(store, { key: KEY, cipher: true, makeKey });
    expect(r.encrypted).toBe(false);
    expect(r.moveError).toMatch(/doesn't match: settings 2≠1/);
    expect(settingsIn(r.db)).toEqual(['a', 'b']);
    r.db.run(`INSERT INTO settings(key,value,updated_at) VALUES ('c','3',2)`);
    expect(store.exists(DB_FILES.moving)).toBe(false);
    expect(store.exists(DB_FILES.secure)).toBe(false);
    r.db.close();
  });

  it('a move cut off before its check is started again', () => {
    const store = fileStore(dir);
    plainWithData(store);
    writeFileSync(store.path(DB_FILES.moving), 'half a copy');
    const r = openDatabaseFiles(store, { key: KEY, cipher: true, makeKey });
    expect(r.encrypted).toBe(true);
    expect(settingsIn(r.db)).toEqual(['a', 'b']);
    r.db.close();
  });

  it('an encrypted file with its key missing is set aside, never deleted; a plain file still there is opened', () => {
    const store = fileStore(dir);
    plainWithData(store);
    openDatabaseFiles(store, { key: KEY, cipher: true, makeKey }).db.close();
    const r = openDatabaseFiles(store, { key: null, cipher: true, makeKey, now: 42 });
    expect(r.setAside).toBe('lifeos-secure-unreadable-42.db');
    expect(store.exists('lifeos-secure-unreadable-42.db')).toBe(true);
    expect(r.encrypted).toBe(false);
    expect(settingsIn(r.db)).toEqual(['a', 'b']);
    r.db.close();
  });

  it('an encrypted file with its key missing and nothing else starts a new encrypted database', () => {
    const store = fileStore(dir);
    openDatabaseFiles(store, { key: KEY, cipher: true, makeKey }).db.close();
    const r = openDatabaseFiles(store, { key: null, cipher: true, makeKey: () => OTHER, now: 7 });
    expect(r.encrypted).toBe(true);
    expect(store.exists('lifeos-secure-unreadable-7.db')).toBe(true);
    r.db.close();
  });

  it('a wrong key fails the start and leaves every file alone', () => {
    const store = fileStore(dir);
    plainWithData(store);
    openDatabaseFiles(store, { key: KEY, cipher: true, makeKey }).db.close();
    expect(() => openDatabaseFiles(store, { key: OTHER, cipher: true, makeKey })).toThrow(/not a database/);
    expect(store.exists(DB_FILES.secure)).toBe(true);
    expect(store.exists(DB_FILES.plain)).toBe(true);
  });

  it('an encrypted file on a build without SQLCipher fails the start instead of opening a new one', () => {
    const store = fileStore(dir);
    openDatabaseFiles(store, { key: KEY, cipher: true, makeKey }).db.close();
    expect(() => openDatabaseFiles(store, { key: KEY, cipher: false, makeKey })).toThrow(/cannot open encrypted/);
  });

  it('try on a copy: checks an encrypted copy of the open database and deletes it', () => {
    const store = fileStore(dir);
    plainWithData(store);
    const live = store.open(DB_FILES.plain, null);
    const report = trialMove(store, live, OTHER);
    expect(report.rows).toBeGreaterThan(0);
    expect(store.exists(DB_FILES.trial)).toBe(false);
    expect(settingsIn(live)).toEqual(['a', 'b']);
    live.close();
    const spoilt = fileStore(dir, { spoilCopy: true });
    const live2 = spoilt.open(DB_FILES.plain, null);
    expect(() => trialMove(spoilt, live2, OTHER)).toThrow(/doesn't match/);
    expect(spoilt.exists(DB_FILES.trial)).toBe(false);
    live2.close();
  });
});
