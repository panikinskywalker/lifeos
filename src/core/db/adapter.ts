/**
 * DatabaseAdapter — the only thing core storage talks to.
 *
 * Keeping this interface tiny (run/all/get/transaction) means the whole core
 * runs unchanged on expo-sqlite (device), better-sqlite3 (tests / desktop) and
 * any future sync-capable driver. No ORM in the hot path; SQL is explicit.
 */
export type SqlParam = string | number | null | Uint8Array;
export type Row = Record<string, unknown>;

export interface DatabaseAdapter {
  run(sql: string, params?: SqlParam[]): { changes: number; lastInsertRowId: number };
  all<T extends Row = Row>(sql: string, params?: SqlParam[]): T[];
  get<T extends Row = Row>(sql: string, params?: SqlParam[]): T | undefined;
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
  close(): void;
}
