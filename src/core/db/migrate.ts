import type { DatabaseAdapter } from './adapter';
import { migrations } from './migrations';

export function migrate(db: DatabaseAdapter): { from: number; to: number } {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL)`);
  const row = db.get<{ v: number | null }>(`SELECT MAX(version) AS v FROM _migrations`);
  const current = row?.v ?? 0;
  const pending = migrations.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  for (const m of pending) {
    const apply = (stmts: string[]) =>
      db.transaction(() => {
        for (const sql of stmts) db.exec(sql);
        db.run(`INSERT INTO _migrations(version, name, applied_at) VALUES (?, ?, ?)`, [m.version, m.name, Date.now()]);
      });
    try {
      apply(m.up);
    } catch (e) {
      if (!m.fallback) throw e;
      apply(m.fallback);
    }
  }
  return { from: current, to: pending.length ? pending[pending.length - 1].version : current };
}
