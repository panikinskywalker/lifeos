import { createSqlJsAdapter } from '@core/db/sqljsAdapter';
import type { DatabaseAdapter } from '@core/db/adapter';
import type { CopyReport } from '@core/db/encryption';

/**
 * Web: sql.js on the main thread (no SharedArrayBuffer / COOP-COEP needed).
 * Kept in a .web file so sql.js — which requires node:fs — never enters the native bundle.
 */
export async function openDatabase(): Promise<DatabaseAdapter> {
  return createSqlJsAdapter({ wasmUrl: '/sql-wasm.wasm' });
}

/** The web build stays plain (docs/MODEL.md layer 6, R15): no SQLCipher in the browser. */
export type DatabaseState = { encrypted: boolean; cipher: boolean; keySaved: boolean; moved?: CopyReport; moveError?: string; setAside?: string };
export const databaseState = (): DatabaseState => ({ encrypted: false, cipher: false, keySaved: false });
const notHere = (): never => {
  throw new Error('The web build’s database isn’t encrypted');
};
export const tryEncryptedCopy = (_live: DatabaseAdapter): CopyReport => notHere();
export const encryptOnNextStart = (_live: DatabaseAdapter): CopyReport => notHere();
