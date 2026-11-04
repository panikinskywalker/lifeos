import type { DatabaseAdapter, Row, SqlParam } from './adapter';

/**
 * Web adapter: sql.js (SQLite compiled to WASM) running synchronously on the
 * main thread, so it needs no SharedArrayBuffer / cross-origin isolation.
 * The whole database is persisted to IndexedDB (debounced) after writes.
 * Fine for a preview / desktop-browser use; native uses expo-sqlite.
 */
type SqlJsDatabase = {
  run(sql: string, params?: SqlParam[]): unknown;
  exec(sql: string): unknown;
  prepare(sql: string): { bind(params?: SqlParam[]): boolean; step(): boolean; getAsObject(): Row; free(): boolean };
  getRowsModified(): number;
  export(): Uint8Array;
  close(): void;
};

const IDB_NAME = 'lifeos';
const IDB_STORE = 'sqlite';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key: string): Promise<Uint8Array | undefined> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as Uint8Array | undefined);
    req.onerror = () => reject(req.error);
  });
}
async function idbPut(key: string, value: Uint8Array): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Forget a saved database (the demo's, when it starts over). */
export async function deleteSqlJsDatabase(name: string): Promise<void> {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function createSqlJsAdapter(opts: { name?: string; wasmUrl: string }): Promise<DatabaseAdapter> {
  const name = opts.name ?? 'lifeos.db';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const initSqlJs = require('sql.js') as (cfg: { locateFile: (f: string) => string }) => Promise<{ Database: new (data?: Uint8Array) => SqlJsDatabase }>;
  const SQL = await initSqlJs({ locateFile: () => opts.wasmUrl });
  let saved: Uint8Array | undefined;
  try {
    saved = await idbGet(name);
  } catch (e) {
    console.warn('[sqljs] IndexedDB unavailable, running in-memory only', e);
  }
  const db = new SQL.Database(saved);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let depth = 0;
  const persist = () => {
    if (depth > 0) return; // wait for the outermost transaction to finish
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      try {
        void idbPut(name, db.export());
      } catch (e) {
        console.warn('[sqljs] persist failed', e);
      }
    }, 400);
  };
  const isWrite = (sql: string) => /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER|COMMIT|RELEASE)/i.test(sql);

  return {
    run(sql, params = []) {
      db.run(sql, params);
      const changes = db.getRowsModified();
      const r = db.prepare('SELECT last_insert_rowid() AS id');
      r.step();
      const lastInsertRowId = Number(r.getAsObject().id ?? 0);
      r.free();
      if (isWrite(sql)) persist();
      return { changes, lastInsertRowId };
    },
    all<T extends Row>(sql: string, params: SqlParam[] = []) {
      const st = db.prepare(sql);
      try {
        st.bind(params);
        const out: T[] = [];
        while (st.step()) out.push(st.getAsObject() as T);
        return out;
      } finally {
        st.free();
      }
    },
    get<T extends Row>(sql: string, params: SqlParam[] = []) {
      const st = db.prepare(sql);
      try {
        st.bind(params);
        return st.step() ? (st.getAsObject() as T) : undefined;
      } finally {
        st.free();
      }
    },
    exec(sql) {
      db.exec(sql);
      if (isWrite(sql)) persist();
    },
    transaction<T>(fn: () => T): T {
      const nested = depth > 0;
      const sp = `sp_${depth}`;
      db.exec(nested ? `SAVEPOINT ${sp}` : 'BEGIN');
      depth++;
      try {
        const out = fn();
        depth--;
        db.exec(nested ? `RELEASE ${sp}` : 'COMMIT');
        persist();
        return out;
      } catch (e) {
        depth--;
        try {
          db.exec(nested ? `ROLLBACK TO ${sp}; RELEASE ${sp}` : 'ROLLBACK');
        } catch {
          /* ignore */
        }
        throw e;
      }
    },
    close() {
      if (timer) clearTimeout(timer);
      void idbPut(name, db.export()).finally(() => db.close());
    },
  };
}
