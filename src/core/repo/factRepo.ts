import type { DatabaseAdapter, Row } from '../db/adapter';
import { newId } from '../domain/ids';
import { bus } from '../events/bus';
import type { ChangeLog } from '../sync/changeLog';
import { normAlias } from './aliasRepo';

/** 'notion': read from your Notion People CRM (crm's notion source, R2b; migration v15). */
export type FactSource = 'talk' | 'notification' | 'note' | 'correction' | 'user' | 'dump' | 'automation' | 'notion';

export interface Fact {
  id: string;
  text: string;
  subjectId: string | null;
  subjectKey: string | null;
  source: FactSource;
  sourceRef: string | null;
  statedAt: number;
  confidence: number;
  active: boolean;
  supersededBy: string | null;
  createdAt: number;
}

const toFact = (r: Row): Fact => ({
  id: r.id as string,
  text: r.text as string,
  subjectId: (r.subject_id as string | null) ?? null,
  subjectKey: (r.subject_key as string | null) ?? null,
  source: r.source as FactSource,
  sourceRef: (r.source_ref as string | null) ?? null,
  statedAt: r.stated_at as number,
  confidence: r.confidence as number,
  active: r.active === 1,
  supersededBy: (r.superseded_by as string | null) ?? null,
  createdAt: r.created_at as number,
});

/**
 * The second brain: one-line things said in passing ("Dad hates surprises",
 * "the landlord is Suresh, rent due on the 5th"). Each fact is indexed in
 * records_fts (type 'fact') so search and the agent's retrieval find it next
 * to records. Newer facts can supersede older ones; forgetting is soft.
 */
export class FactRepo {
  /** `events`: a fact about a record also lands on that record's timeline (kind 'fact'). */
  constructor(private db: DatabaseAdapter, private changes: ChangeLog, private events?: { add(e: { entityId: string; kind: string; title: string; body?: string | null; actor: 'user' | 'automation' | 'assistant' | 'system'; occurredAt: number; meta: Record<string, unknown> }): unknown }) {}

  /** Set by the core: resolves a [[title]] in a fact to a record (links.ts). */
  resolveLink?: (title: string) => string | null;

  add(f: { text: string; subjectId?: string | null; subjectKey?: string | null; source: FactSource; sourceRef?: string | null; statedAt?: number; confidence?: number }): Fact {
    const now = Date.now();
    const id = newId(now);
    const text = f.text.trim();
    // "[[Dad]] hates surprises": the first link says who it's about.
    if (!f.subjectId && this.resolveLink) {
      const first = text.match(/\[\[([^[\]\n]{1,80})\]\]/)?.[1];
      const id = first ? this.resolveLink(first.trim()) : null;
      if (id) f = { ...f, subjectId: id };
    }
    this.db.transaction(() => {
      this.db.run(`INSERT INTO facts(id,text,subject_id,subject_key,source,source_ref,stated_at,confidence,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, [id, text, f.subjectId ?? null, f.subjectKey ?? null, f.source, f.sourceRef ?? null, f.statedAt ?? now, f.confidence ?? 1, now, now]);
      this.changes.record('facts', id, 'insert', 1);
      this.indexFact(id, text, f.subjectId ?? null);
    });
    if (f.subjectId && this.events) {
      const actor = f.source === 'talk' || f.source === 'dump' ? 'assistant' : f.source === 'automation' ? 'automation' : f.source === 'notification' ? 'system' : 'user';
      this.events.add({ entityId: f.subjectId, kind: 'fact', title: 'Fact', body: text, actor, occurredAt: f.statedAt ?? now, meta: { factId: id } });
    }
    bus.emit('data.changed', { table: 'facts', id });
    return this.get(id)!;
  }

  get(id: string): Fact | null {
    const r = this.db.get<Row>(`SELECT * FROM facts WHERE id=? AND deleted_at IS NULL`, [id]);
    return r ? toFact(r) : null;
  }

  /** Active facts, newest first; optionally about one record. */
  list(opts: { subjectId?: string; limit?: number; includeInactive?: boolean } = {}): Fact[] {
    const where = ['deleted_at IS NULL'];
    const params: (string | number)[] = [];
    if (!opts.includeInactive) where.push('active = 1');
    if (opts.subjectId) {
      where.push('subject_id = ?');
      params.push(opts.subjectId);
    }
    params.push(opts.limit ?? 200);
    return this.db.all<Row>(`SELECT * FROM facts WHERE ${where.join(' AND ')} ORDER BY stated_at DESC, rowid DESC LIMIT ?`, params).map(toFact);
  }

  /** An active fact saying the same thing (ignoring case and punctuation), if any. */
  findSame(text: string, subjectId?: string | null): Fact | null {
    const n = normAlias(text);
    return this.list({ subjectId: subjectId ?? undefined, limit: 500 }).find((f) => normAlias(f.text) === n) ?? null;
  }

  /** Full-text over active facts (LIKE on web where FTS5 is missing). */
  search(q: string, limit = 10): Fact[] {
    const term = q.trim();
    if (!term) return [];
    const fts = /fts5/i.test(this.db.get<{ sql: string }>(`SELECT sql FROM sqlite_master WHERE name='records_fts'`)?.sql ?? '');
    const ids = fts
      ? this.db.all<{ id: string }>(`SELECT id FROM records_fts WHERE records_fts MATCH ? AND object='fact' ORDER BY rank LIMIT ?`, [term.split(/\s+/).map((t) => `"${t.replace(/"/g, '""')}"*`).join(' OR '), limit * 2]).map((r) => r.id)
      : this.db.all<{ id: string }>(`SELECT id FROM records_fts WHERE object='fact' AND (${term.split(/\s+/).map(() => 'body LIKE ? COLLATE NOCASE').join(' OR ')}) LIMIT ?`, [...term.split(/\s+/).map((t) => `%${t}%`), limit * 2]).map((r) => r.id);
    return ids.map((id) => this.get(id)).filter((f): f is Fact => !!f && f.active).slice(0, limit);
  }

  /** A newer fact replaces an older one ("rent is now 34k"). */
  supersede(oldId: string, text: string, extra: { source: FactSource; sourceRef?: string | null; subjectId?: string | null } ): Fact {
    const old = this.get(oldId);
    const next = this.add({ text, subjectId: extra.subjectId ?? old?.subjectId ?? null, subjectKey: old?.subjectKey ?? null, source: extra.source, sourceRef: extra.sourceRef });
    this.db.run(`UPDATE facts SET active=0, superseded_by=?, updated_at=?, version=version+1 WHERE id=?`, [next.id, Date.now(), oldId]);
    this.changes.record('facts', oldId, 'update', 1);
    this.db.run(`DELETE FROM records_fts WHERE id=?`, [oldId]);
    bus.emit('data.changed', { table: 'facts', id: oldId });
    return next;
  }

  /** What a fact is about: a record, or a name that is not a record yet (R7f). Lands on the record's timeline. */
  setSubject(id: string, about: { subjectId: string | null; subjectKey?: string | null }): void {
    const f = this.get(id);
    if (!f) return;
    this.db.run(`UPDATE facts SET subject_id=?, subject_key=?, updated_at=?, version=version+1 WHERE id=?`, [about.subjectId, about.subjectKey ?? null, Date.now(), id]);
    this.changes.record('facts', id, 'update', 1);
    if (f.active) this.indexFact(id, f.text, about.subjectId);
    if (about.subjectId && about.subjectId !== f.subjectId && this.events) this.events.add({ entityId: about.subjectId, kind: 'fact', title: 'Fact', body: f.text, actor: 'user', occurredAt: f.statedAt, meta: { factId: id } });
    bus.emit('data.changed', { table: 'facts', id });
  }

  /** Soft-forget (Undo with restore). */
  forget(id: string): void {
    this.db.run(`UPDATE facts SET deleted_at=?, active=0, version=version+1 WHERE id=?`, [Date.now(), id]);
    this.changes.record('facts', id, 'delete', 1);
    this.db.run(`DELETE FROM records_fts WHERE id=?`, [id]);
    bus.emit('data.changed', { table: 'facts', id });
  }

  restore(id: string): void {
    const r = this.db.get<Row>(`SELECT * FROM facts WHERE id=?`, [id]);
    if (!r) return;
    this.db.run(`UPDATE facts SET deleted_at=NULL, active=1, version=version+1 WHERE id=?`, [id]);
    this.changes.record('facts', id, 'update', 1);
    this.indexFact(id, r.text as string, (r.subject_id as string | null) ?? null);
    bus.emit('data.changed', { table: 'facts', id });
  }

  /** Put every active fact back in the search index (after a full rebuild). */
  reindex(): void {
    for (const f of this.list({ limit: 100000 })) this.indexFact(f.id, f.text, f.subjectId);
  }

  private indexFact(id: string, text: string, subjectId: string | null) {
    const subject = subjectId ? (this.db.get<{ title: string }>(`SELECT title FROM records WHERE id=?`, [subjectId])?.title ?? '') : '';
    this.db.run(`DELETE FROM records_fts WHERE id=?`, [id]);
    this.db.run(`INSERT INTO records_fts(id,object,title,subtitle,body) VALUES (?,?,?,?,?)`, [id, 'fact', text.slice(0, 120), subject, `${text} ${subject}`]);
  }
}
