import type { DatabaseAdapter } from '../db/adapter';

/**
 * Append-only change log. Nothing reads it yet — it exists so that when a
 * sync backend is added, every mutation since install can be replayed
 * without a data migration. Rows are (table, row id, op, version, time).
 */
export class ChangeLog {
  constructor(private db: DatabaseAdapter) {}
  record(tbl: string, rowId: string, op: 'insert' | 'update' | 'delete', version: number) {
    this.db.run(`INSERT INTO changes(tbl,row_id,op,version,at) VALUES (?,?,?,?,?)`, [tbl, rowId, op, version, Date.now()]);
  }
  pending(limit = 500) {
    return this.db.all<{ seq: number; tbl: string; row_id: string; op: string; version: number; at: number }>(
      `SELECT seq,tbl,row_id,op,version,at FROM changes WHERE synced_at IS NULL ORDER BY seq LIMIT ?`,
      [limit],
    );
  }
  markSynced(upToSeq: number) {
    this.db.run(`UPDATE changes SET synced_at=? WHERE synced_at IS NULL AND seq <= ?`, [Date.now(), upToSeq]);
  }
  pendingCount(): number {
    return Number(this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM changes WHERE synced_at IS NULL`)?.n ?? 0);
  }
}
