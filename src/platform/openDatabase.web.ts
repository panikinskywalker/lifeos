import { createSqlJsAdapter } from '@core/db/sqljsAdapter';
import type { DatabaseAdapter } from '@core/db/adapter';

/**
 * Web: sql.js on the main thread (no SharedArrayBuffer / COOP-COEP needed).
 * Kept in a .web file so sql.js — which requires node:fs — never enters the native bundle.
 */
export async function openDatabase(): Promise<DatabaseAdapter> {
  return createSqlJsAdapter({ wasmUrl: '/sql-wasm.wasm' });
}
