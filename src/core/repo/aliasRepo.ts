import type { DatabaseAdapter } from '../db/adapter';
import { newId } from '../domain/ids';
import { bus } from '../events/bus';
import type { ChangeLog } from '../sync/changeLog';

export interface Alias {
  id: string;
  alias: string;
  entityId: string;
  uses: number;
}

/** "The car!" → "the car": what an alias is matched on. */
export const normAlias = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Learned names for records ("the car" → Creta, "Dad" → a person), written
 * when the user picks one of several matches in Talk. Lookup matches an
 * alias said anywhere in a phrase, on word boundaries.
 */
export class AliasRepo {
  constructor(private db: DatabaseAdapter, private changes: ChangeLog) {}

  learn(alias: string, entityId: string): Alias {
    const norm = normAlias(alias);
    const now = Date.now();
    const row = this.db.get<{ id: string; uses: number }>(`SELECT id, uses FROM aliases WHERE alias_norm=? AND entity_id=?`, [norm, entityId]);
    if (row) {
      this.db.run(`UPDATE aliases SET deleted_at=NULL, alias=?, uses=uses+1, updated_at=?, version=version+1 WHERE id=?`, [alias.trim(), now, row.id]);
      this.changes.record('aliases', row.id, 'update', 1);
      bus.emit('data.changed', { table: 'aliases', id: row.id });
      return { id: row.id, alias: alias.trim(), entityId, uses: row.uses + 1 };
    }
    const id = newId(now);
    this.db.run(`INSERT INTO aliases(id,alias,alias_norm,entity_id,uses,created_at,updated_at) VALUES (?,?,?,?,1,?,?)`, [id, alias.trim(), norm, entityId, now, now]);
    this.changes.record('aliases', id, 'insert', 1);
    bus.emit('data.changed', { table: 'aliases', id });
    return { id, alias: alias.trim(), entityId, uses: 1 };
  }

  forget(id: string): void {
    this.db.run(`UPDATE aliases SET deleted_at=?, version=version+1 WHERE id=?`, [Date.now(), id]);
    this.changes.record('aliases', id, 'delete', 1);
    bus.emit('data.changed', { table: 'aliases', id });
  }

  /** Aliases whose words appear in `text` (longest first), on live records. */
  lookup(text: string): Alias[] {
    const t = ` ${normAlias(text)} `;
    if (t.trim() === '') return [];
    return this.db
      .all<{ id: string; alias: string; alias_norm: string; entity_id: string; uses: number }>(`SELECT a.id, a.alias, a.alias_norm, a.entity_id, a.uses FROM aliases a JOIN entities e ON e.id=a.entity_id WHERE a.deleted_at IS NULL AND e.deleted_at IS NULL`)
      .filter((r) => t.includes(` ${r.alias_norm} `))
      .sort((a, b) => b.alias_norm.length - a.alias_norm.length || b.uses - a.uses)
      .map((r) => ({ id: r.id, alias: r.alias, entityId: r.entity_id, uses: r.uses }));
  }

  forEntity(entityId: string): Alias[] {
    return this.db.all<{ id: string; alias: string; entity_id: string; uses: number }>(`SELECT id, alias, entity_id, uses FROM aliases WHERE entity_id=? AND deleted_at IS NULL ORDER BY uses DESC`, [entityId]).map((r) => ({ id: r.id, alias: r.alias, entityId: r.entity_id, uses: r.uses }));
  }
}
