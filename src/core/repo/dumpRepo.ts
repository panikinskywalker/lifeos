import type { DatabaseAdapter, Row } from '../db/adapter';
import { newId } from '../domain/ids';
import { bus } from '../events/bus';
import type { ChangeLog } from '../sync/changeLog';

export type DumpSource = 'typed' | 'voice' | 'share';
export type DumpStatus = 'pending' | 'done' | 'failed' | 'skipped';

export interface Dump {
  id: string;
  body: string;
  source: DumpSource;
  createdAt: number;
  status: DumpStatus;
  attempts: number;
  extractedAt: number | null;
  error: string | null;
}

export interface Extraction {
  id: string;
  dumpId: string;
  /** person | task | fact | event | transaction | cycle | asset | … (a record type, 'fact' or 'cycle'). */
  kind: string;
  action: 'created' | 'updated' | 'logged';
  entityId: string | null;
  factId: string | null;
  label: string;
  undone: boolean;
  createdAt: number;
}

const toDump = (r: Row): Dump => ({
  id: r.id as string,
  body: r.body as string,
  source: r.source as DumpSource,
  createdAt: r.created_at as number,
  status: r.status as DumpStatus,
  attempts: r.attempts as number,
  extractedAt: (r.extracted_at as number | null) ?? null,
  error: (r.error as string | null) ?? null,
});

const toExtraction = (r: Row): Extraction => ({
  id: r.id as string,
  dumpId: r.dump_id as string,
  kind: r.kind as string,
  action: r.action as Extraction['action'],
  entityId: (r.entity_id as string | null) ?? null,
  factId: (r.fact_id as string | null) ?? null,
  label: r.label as string,
  undone: r.undone === 1,
  createdAt: r.created_at as number,
});

/**
 * Brain dumps (PRODUCT v4 §1.3). The body is stored verbatim and can never be
 * edited or deleted (the database refuses); only the extraction status moves.
 * Dumps sit in the search index as type 'dump' next to records and facts.
 */
export class DumpRepo {
  constructor(private db: DatabaseAdapter, private changes: ChangeLog) {}

  add(d: { body: string; source?: DumpSource; createdAt?: number }): Dump {
    if (!d.body.trim()) throw new Error('A dump needs some text');
    const now = d.createdAt ?? Date.now();
    const id = newId(now);
    this.db.transaction(() => {
      this.db.run(`INSERT INTO dumps(id,body,source,created_at) VALUES (?,?,?,?)`, [id, d.body, d.source ?? 'typed', now]);
      this.changes.record('dumps', id, 'insert', 1);
      this.index(id, d.body);
    });
    bus.emit('data.changed', { table: 'dumps', id });
    return this.get(id)!;
  }

  get(id: string): Dump | null {
    const r = this.db.get<Row>(`SELECT * FROM dumps WHERE id=?`, [id]);
    return r ? toDump(r) : null;
  }

  /** Newest first. */
  list(opts: { limit?: number; before?: number; from?: number; to?: number } = {}): Dump[] {
    const where: string[] = [];
    const params: number[] = [];
    if (opts.before != null) (where.push('created_at < ?'), params.push(opts.before));
    if (opts.from != null) (where.push('created_at >= ?'), params.push(opts.from));
    if (opts.to != null) (where.push('created_at < ?'), params.push(opts.to));
    return this.db
      .all<Row>(`SELECT * FROM dumps ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ?`, [...params, opts.limit ?? 50])
      .map(toDump);
  }

  /** Dumps still waiting for extraction (oldest first), skipping ones that failed too often. */
  pending(maxAttempts = 5): Dump[] {
    return this.db.all<Row>(`SELECT * FROM dumps WHERE status IN ('pending','failed') AND attempts < ? ORDER BY created_at`, [maxAttempts]).map(toDump);
  }

  setStatus(id: string, status: DumpStatus, error?: string | null) {
    const done = status === 'done' || status === 'skipped';
    this.db.run(`UPDATE dumps SET status=?, error=?, attempts=attempts+?, extracted_at=CASE WHEN ? THEN ? ELSE extracted_at END, version=version+1 WHERE id=?`, [
      status,
      error ?? null,
      status === 'pending' ? 0 : 1,
      done ? 1 : 0,
      Date.now(),
      id,
    ]);
    this.changes.record('dumps', id, 'update', 1);
    bus.emit('data.changed', { table: 'dumps', id });
  }

  addExtraction(x: { dumpId: string; kind: string; action?: Extraction['action']; entityId?: string | null; factId?: string | null; label: string }): Extraction {
    const id = newId();
    this.db.run(`INSERT INTO dump_extractions(id,dump_id,kind,action,entity_id,fact_id,label,created_at) VALUES (?,?,?,?,?,?,?,?)`, [
      id,
      x.dumpId,
      x.kind,
      x.action ?? 'created',
      x.entityId ?? null,
      x.factId ?? null,
      x.label,
      Date.now(),
    ]);
    bus.emit('data.changed', { table: 'dumps', id: x.dumpId });
    return this.extraction(id)!;
  }

  extraction(id: string): Extraction | null {
    const r = this.db.get<Row>(`SELECT * FROM dump_extractions WHERE id=?`, [id]);
    return r ? toExtraction(r) : null;
  }

  extractions(dumpId: string): Extraction[] {
    return this.db.all<Row>(`SELECT * FROM dump_extractions WHERE dump_id=? ORDER BY created_at, rowid`, [dumpId]).map(toExtraction);
  }

  /** Dumps that produced or touched a record (for "Dumps that mention it" on its page). */
  forEntity(entityId: string): Dump[] {
    return this.db
      .all<Row>(`SELECT d.* FROM dumps d WHERE d.id IN (SELECT dump_id FROM dump_extractions WHERE entity_id=? AND undone=0) ORDER BY d.created_at DESC`, [entityId])
      .map(toDump);
  }

  markUndone(extractionId: string, undone = true) {
    const x = this.extraction(extractionId);
    this.db.run(`UPDATE dump_extractions SET undone=? WHERE id=?`, [undone ? 1 : 0, extractionId]);
    if (x) bus.emit('data.changed', { table: 'dumps', id: x.dumpId });
  }

  /** Put every dump back in the search index (after a full rebuild). */
  reindex(): void {
    for (const r of this.db.all<{ id: string; body: string }>(`SELECT id, body FROM dumps`)) this.index(r.id, r.body);
  }

  private index(id: string, body: string) {
    const firstLine = body.trim().split('\n')[0]!.slice(0, 120);
    this.db.run(`DELETE FROM entities_fts WHERE id=?`, [id]);
    this.db.run(`INSERT INTO entities_fts(id,type,title,subtitle,body) VALUES (?,?,?,?,?)`, [id, 'dump', firstLine, 'Dump', body]);
  }
}
