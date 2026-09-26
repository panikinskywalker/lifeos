import type { DatabaseAdapter, Row } from '../db/adapter';
import type { Entity, EntityTypeDef } from '../domain/types';

export interface SearchHit {
  id: string;
  type: string;
  title: string;
  subtitle?: string | null;
  snippet: string;
  rank: number;
}

/** FTS5-backed global search over every entity. */
export class SearchIndex {
  /** True when the FTS5 virtual table exists; false → LIKE fallback (web). */
  readonly fts: boolean;
  constructor(private db: DatabaseAdapter) {
    const row = db.get<{ sql: string }>(`SELECT sql FROM sqlite_master WHERE name = 'entities_fts'`);
    this.fts = !!row?.sql && /fts5/i.test(row.sql);
  }

  index(e: Entity, def: EntityTypeDef) {
    const body = [
      def.searchText?.(e.data as never) ?? '',
      ...def.fields.filter((f) => ['text', 'longtext', 'select'].includes(f.type)).map((f) => String((e.data as Record<string, unknown>)[f.key] ?? '')),
      // What's hung on the record: notes (comments), tags, attachment names.
      ...this.db.all<{ t: string }>(
        `SELECT body AS t FROM comments WHERE entity_id=? AND deleted_at IS NULL
         UNION ALL SELECT tg.name FROM entity_tags et JOIN tags tg ON tg.id = et.tag_id WHERE et.entity_id=?
         UNION ALL SELECT name FROM attachments WHERE entity_id=? AND deleted_at IS NULL`,
        [e.id, e.id, e.id],
      ).map((r) => r.t),
    ]
      .filter(Boolean)
      .join(' ');
    this.db.run(`DELETE FROM entities_fts WHERE id = ?`, [e.id]);
    this.db.run(`INSERT INTO entities_fts(id,type,title,subtitle,body) VALUES (?,?,?,?,?)`, [e.id, e.type, e.title, e.subtitle ?? '', body]);
  }

  remove(id: string) {
    this.db.run(`DELETE FROM entities_fts WHERE id = ?`, [id]);
  }

  search(q: string, opts: { types?: string[]; limit?: number } = {}): SearchHit[] {
    const term = q.trim();
    if (!term) return [];
    if (!this.fts) return this.searchLike(term, opts);
    // Prefix-match every token so typing feels instant.
    const match = term
      .split(/\s+/)
      .map((t) => `"${t.replace(/"/g, '""')}"*`)
      .join(' ');
    const params: (string | number)[] = [match];
    let typeSql = '';
    if (opts.types?.length) {
      typeSql = ` AND f.type IN (${opts.types.map(() => '?').join(',')})`;
      params.push(...opts.types);
    }
    params.push(opts.limit ?? 30);
    const rows = this.db.all<{ id: string; type: string; title: string; subtitle: string | null; snippet: string; rank: number }>(
      `SELECT f.id, f.type, f.title, f.subtitle, snippet(entities_fts, 4, '[', ']', '…', 12) AS snippet, bm25(entities_fts, 0, 0, 10, 4, 1) AS rank
       FROM entities_fts f LEFT JOIN entities e ON e.id = f.id LEFT JOIN facts fa ON fa.id = f.id LEFT JOIN dumps du ON du.id = f.id
       WHERE entities_fts MATCH ? AND ((e.id IS NOT NULL AND e.deleted_at IS NULL) OR (fa.id IS NOT NULL AND fa.active = 1 AND fa.deleted_at IS NULL) OR du.id IS NOT NULL)${typeSql}
       ORDER BY rank LIMIT ?`,
      params,
    );
    return rows;
  }

  private searchLike(term: string, opts: { types?: string[]; limit?: number }): SearchHit[] {
    const tokens = term.split(/\s+/).filter(Boolean);
    const params: (string | number)[] = [];
    const where = tokens.map(() => {
      params.push(`%${tokens[params.length]}%`);
      return `(f.title LIKE ? COLLATE NOCASE OR f.subtitle LIKE ? COLLATE NOCASE OR f.body LIKE ? COLLATE NOCASE)`;
    });
    // each token binds three times
    const bound: (string | number)[] = [];
    for (const t of tokens) bound.push(`%${t}%`, `%${t}%`, `%${t}%`);
    let typeSql = '';
    if (opts.types?.length) {
      typeSql = ` AND f.type IN (${opts.types.map(() => '?').join(',')})`;
      bound.push(...opts.types);
    }
    bound.push(`${tokens[0]}%`, opts.limit ?? 30);
    return this.db.all<SearchHit & Row>(
      `SELECT f.id, f.type, f.title, f.subtitle, substr(f.body, 1, 80) AS snippet, 0 AS rank
       FROM entities_fts f LEFT JOIN entities e ON e.id = f.id LEFT JOIN facts fa ON fa.id = f.id LEFT JOIN dumps du ON du.id = f.id
       WHERE ${where.join(' AND ')} AND ((e.id IS NOT NULL AND e.deleted_at IS NULL) OR (fa.id IS NOT NULL AND fa.active = 1 AND fa.deleted_at IS NULL) OR du.id IS NOT NULL)${typeSql}
       ORDER BY CASE WHEN f.title LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END, COALESCE(e.updated_at, fa.updated_at, du.created_at) DESC LIMIT ?`,
      bound,
    );
  }

  /** Full rebuild (after import / restore). */
  rebuild(entities: Entity[], defFor: (type: string) => EntityTypeDef | undefined) {
    this.db.transaction(() => {
      // Facts and dumps live in the same index but aren't entities: keep their rows.
      this.db.run(`DELETE FROM entities_fts WHERE type NOT IN ('fact', 'dump')`);
      for (const e of entities) {
        const d = defFor(e.type);
        if (d) this.index(e, d);
      }
    });
  }
}
