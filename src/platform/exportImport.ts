import type { LifeOSContext } from '@core/registry/context';
import { BACKUP_TABLES as TABLES } from '@core/db/backupTables';

export function exportAll(os: LifeOSContext) {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) out[t] = os.db.all(`SELECT * FROM ${t}`);
  return { app: 'lifeos', version: 1, exportedAt: new Date().toISOString(), tables: out };
}

/** Import a backup produced by exportAll (merge by primary key, newest wins). */
export function importAll(os: LifeOSContext, backup: { tables: Record<string, Record<string, unknown>[]> }) {
  os.db.transaction(() => {
    for (const t of TABLES) {
      const rows = backup.tables[t] ?? [];
      for (const r of rows) {
        const cols = Object.keys(r);
        os.db.run(`INSERT OR ${t === 'dumps' ? 'IGNORE' : 'REPLACE'} INTO ${t}(${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => r[c] as never));
      }
    }
  });
  const all = os.records.query(null, { includeArchived: true }, { limit: 100000 });
  os.records.search.rebuild(all, (ty) => os.registry.objects.get(ty));
  os.facts.reindex();
  os.dumps.reindex();
}
