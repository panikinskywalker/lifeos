import { openDatabaseSync } from 'expo-sqlite';
import { createExpoAdapter } from './expoSqliteAdapter';
import type { DatabaseAdapter } from '@core/db/adapter';

/** Native (Android/iOS): on-device SQLite. The web build uses openDatabase.web.ts instead. */
export async function openDatabase(): Promise<DatabaseAdapter> {
  const sqlite = openDatabaseSync('lifeos.db');
  for (const pragma of ['PRAGMA journal_mode = WAL', 'PRAGMA foreign_keys = ON', 'PRAGMA busy_timeout = 3000']) {
    try {
      sqlite.execSync(pragma);
    } catch {
      /* unsupported on this platform */
    }
  }
  return createExpoAdapter(sqlite);
}
