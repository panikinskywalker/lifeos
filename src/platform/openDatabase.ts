import { defaultDatabaseDirectory, openDatabaseSync } from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { createExpoAdapter } from './expoSqliteAdapter';
import type { DatabaseAdapter } from '@core/db/adapter';
import { isDbKey, keyToHex, openDatabaseFiles, trialMove, type CopyReport, type DbStore, type OpenedDatabase } from '@core/db/encryption';

/**
 * Native (Android/iOS): on-device SQLite, encrypted with SQLCipher where the
 * build has it (docs/MODEL.md layer 6, R15). The key is in the secure store;
 * which file opens and the one-time move are core's (`@core/db/encryption`).
 * The web build uses openDatabase.web.ts instead.
 */

const KEY_NAME = 'lifeos.db.key';
const PRAGMAS = ['PRAGMA journal_mode = WAL', 'PRAGMA foreign_keys = ON', 'PRAGMA busy_timeout = 3000'];

const dir = String(defaultDatabaseDirectory).replace(/\/+$/, '');
const fileOf = (name: string) => new File(`file://${dir}/${name}`);
const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;

const store: DbStore = {
  exists: (name) => fileOf(name).exists,
  remove(name) {
    for (const suffix of ['', '-wal', '-shm', '-journal']) {
      const f = fileOf(name + suffix);
      if (f.exists) f.delete();
    }
  },
  rename(from, to) {
    for (const suffix of ['', '-wal', '-shm']) {
      const f = fileOf(from + suffix);
      if (f.exists) f.rename(to + suffix);
    }
  },
  open(name, key) {
    const sqlite = openDatabaseSync(name);
    try {
      // SQLCipher: the key comes before anything else; a wrong key fails the read below.
      if (key) sqlite.execSync(`PRAGMA key = "x'${key}'"`);
      sqlite.getFirstSync(`SELECT COUNT(*) AS n FROM sqlite_master`);
    } catch (e) {
      sqlite.closeSync();
      throw e;
    }
    for (const pragma of PRAGMAS) {
      try {
        sqlite.execSync(pragma);
      } catch {
        /* unsupported on this platform */
      }
    }
    return createExpoAdapter(sqlite);
  },
  exportEncrypted(from, name, key) {
    from.exec(`ATTACH DATABASE ${sqlString(`${dir}/${name}`)} AS lifeos_copy KEY "x'${key}'"`);
    try {
      from.get(`SELECT sqlcipher_export('lifeos_copy')`);
    } finally {
      from.exec(`DETACH DATABASE lifeos_copy`);
    }
  },
};

/** Does this build have SQLCipher? (Plain SQLite answers nothing to cipher_version.) */
function hasCipher(): boolean {
  try {
    const probe = openDatabaseSync(':memory:');
    const v = probe.getFirstSync<{ cipher_version?: string }>(`PRAGMA cipher_version`);
    probe.closeSync();
    return !!v?.cipher_version;
  } catch {
    return false;
  }
}

const newKey = () => keyToHex(Crypto.getRandomBytes(32));

/** Save a key and read it back: a key that didn't stick must never encrypt anything. */
function saveKey(key: string): string {
  SecureStore.setItem(KEY_NAME, key);
  if (SecureStore.getItem(KEY_NAME) !== key) throw new Error('Couldn’t keep the database key in the secure store');
  return key;
}

export type DatabaseState = Omit<OpenedDatabase, 'db'> & { cipher: boolean; keySaved: boolean };
let state: DatabaseState = { encrypted: false, cipher: false, keySaved: false };

/** How the database was opened at this start (for You › Lock & backup). */
export const databaseState = (): DatabaseState => state;

export async function openDatabase(): Promise<DatabaseAdapter> {
  const cipher = hasCipher();
  const key = SecureStore.getItem(KEY_NAME);
  const { db, ...rest } = openDatabaseFiles(store, { key, cipher, makeKey: () => saveKey(newKey()) });
  if (rest.moveError) console.warn('[db] the move to the encrypted database failed; still plain:', rest.moveError);
  if (rest.moved) console.log('[db] moved to the encrypted database', JSON.stringify(rest.moved));
  if (rest.setAside) console.warn('[db] an encrypted database without its key was set aside as', rest.setAside);
  state = { ...rest, cipher, keySaved: isDbKey(SecureStore.getItem(KEY_NAME)) };
  return db;
}

/** "Try on a copy": an encrypted copy of the open database, checked, then deleted. Changes nothing. */
export function tryEncryptedCopy(live: DatabaseAdapter): CopyReport {
  if (!state.cipher) throw new Error('This build can’t encrypt the database yet; it needs the new APK');
  return trialMove(store, live, newKey());
}

/**
 * "Encrypt the database": the copy is tried first with the key that will be
 * used; only if it matches is the key saved, and the next start moves the
 * database (copied and checked again before it switches).
 */
export function encryptOnNextStart(live: DatabaseAdapter): CopyReport {
  if (!state.cipher) throw new Error('This build can’t encrypt the database yet; it needs the new APK');
  if (state.encrypted) throw new Error('The database is already encrypted');
  const key = isDbKey(SecureStore.getItem(KEY_NAME)) ? SecureStore.getItem(KEY_NAME)! : newKey();
  const report = trialMove(store, live, key);
  saveKey(key);
  state = { ...state, keySaved: true };
  return report;
}
