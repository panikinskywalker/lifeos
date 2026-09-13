import type { DatabaseAdapter, Row, SqlParam } from './adapter';

/**
 * Node adapter (tests, CLI tooling, future desktop). Loaded lazily so the
 * module is safe to import from React Native bundles that never call it.
 */
export function createBetterSqliteAdapter(filename = ':memory:'): DatabaseAdapter {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return {
    run(sql, params: SqlParam[] = []) {
      const r = db.prepare(sql).run(...params);
      return { changes: r.changes, lastInsertRowId: Number(r.lastInsertRowid) };
    },
    all<T extends Row>(sql: string, params: SqlParam[] = []) {
      return db.prepare(sql).all(...params) as T[];
    },
    get<T extends Row>(sql: string, params: SqlParam[] = []) {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    exec(sql) {
      db.exec(sql);
    },
    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },
    close() {
      db.close();
    },
  };
}
