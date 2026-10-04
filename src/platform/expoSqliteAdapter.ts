import type { SQLiteDatabase } from 'expo-sqlite';
import type { DatabaseAdapter, Row, SqlParam } from '@core/db/adapter';

/** Device adapter backed by expo-sqlite's synchronous API. */
function wrap<T>(sql: string, fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : typeof e === 'object' ? JSON.stringify(e) : String(e);
    throw new Error(`SQL failed: ${msg}\n${sql.slice(0, 200)}`);
  }
}

export function createExpoAdapter(db: SQLiteDatabase): DatabaseAdapter {
  let depth = 0;
  return {
    run(sql, params = []) {
      const r = wrap(sql, () => db.runSync(sql, params as never[]));
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all<T extends Row>(sql: string, params: SqlParam[] = []) {
      return wrap(sql, () => db.getAllSync<T>(sql, params as never[]));
    },
    get<T extends Row>(sql: string, params: SqlParam[] = []) {
      return wrap(sql, () => db.getFirstSync<T>(sql, params as never[])) ?? undefined;
    },
    exec(sql) {
      wrap(sql, () => db.execSync(sql));
    },
    // Nested calls become savepoints, so repos can always wrap their own
    // writes and callers can still batch many of them atomically.
    transaction<T>(fn: () => T): T {
      const nested = depth > 0;
      const sp = `sp_${depth}`;
      wrap('BEGIN', () => db.execSync(nested ? `SAVEPOINT ${sp}` : 'BEGIN'));
      depth++;
      try {
        const out = fn();
        depth--;
        wrap('COMMIT', () => db.execSync(nested ? `RELEASE ${sp}` : 'COMMIT'));
        return out;
      } catch (e) {
        depth--;
        try {
          db.execSync(nested ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
        } catch {
          /* already rolled back */
        }
        throw e;
      }
    },
    close() {
      db.closeSync();
    },
  };
}
