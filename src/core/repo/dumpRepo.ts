import type { DatabaseAdapter, Row } from '../db/adapter';
import { newId } from '../domain/ids';
import { bus } from '../events/bus';
import type { ChangeLog } from '../sync/changeLog';

export type DumpSource = 'typed' | 'voice' | 'share';

/** The Dump list shows this many days; filed dumps older than this are deleted unless they hold a Fact or a Note (docs/MODEL.md layer 6, R15). */
export const DUMP_DAYS = 15;
const FINISHED = `('done','skipped')`;
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
  /** Said on a record's page: files into this record. */
  subjectId: string | null;
  /** Waiting on a provider until then (rate limit, daily quota, offline); `error` says why. */
  retryAt: number | null;
  /** How far filing got, so a cut-off dump resumes instead of restarting. */
  progress: DumpProgress;
}

export interface DumpProgress {
  /** The parser has filed the everyday sentences; `rest` is what's left for the model. */
  parsed?: boolean;
  rest?: string;
  /** Model chunks of `rest` already filed. */
  chunksDone?: number;
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
  subjectId: (r.subject_id as string | null) ?? null,
  retryAt: (r.retry_at as number | null) ?? null,
  progress: r.progress ? (JSON.parse(r.progress as string) as DumpProgress) : {},
});


/**
 * Brain dumps (PRODUCT v4 §1.3). The body is stored verbatim and can never be
 * edited; only the extraction status moves. The database refuses deleting a
 * dump until it is filed and 15 days old (v17); retention deletes it then,
 * unless it holds a Fact or a Note.
 * Dumps sit in the search index as type 'dump' next to records and facts.
 */
export class DumpRepo {
  constructor(private db: DatabaseAdapter, private changes: ChangeLog) {}

  add(d: { body: string; source?: DumpSource; createdAt?: number; subjectId?: string | null }): Dump {
    if (!d.body.trim()) throw new Error('A dump needs some text');
    const now = d.createdAt ?? Date.now();
    const id = newId(now);
    this.db.transaction(() => {
      this.db.run(`INSERT INTO dumps(id,body,source,created_at,subject_id) VALUES (?,?,?,?,?)`, [id, d.body, d.source ?? 'typed', now, d.subjectId ?? null]);
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

  /** Dumps due for filing now (oldest first): pending ones whose wait is over, and failed ones not given up on. */
  pending(maxAttempts = 5, now = Date.now()): Dump[] {
    return this.db
      .all<Row>(`SELECT * FROM dumps WHERE (status='pending' AND (retry_at IS NULL OR retry_at <= ?)) OR (status='failed' AND attempts < ?) ORDER BY created_at`, [now, maxAttempts])
      .map(toDump);
  }

  /** Dumps waiting on a provider (not due yet). */
  waiting(now = Date.now()): Dump[] {
    return this.db.all<Row>(`SELECT * FROM dumps WHERE status='pending' AND retry_at > ? ORDER BY created_at`, [now]).map(toDump);
  }

  /** When the earliest waiting dump is due (to schedule a wake-up), or null. */
  nextWake(): number | null {
    return this.db.get<{ t: number | null }>(`SELECT MIN(retry_at) AS t FROM dumps WHERE status='pending' AND retry_at IS NOT NULL`)?.t ?? null;
  }

  /** Can't file right now for a reason that will pass: wait, without counting it as an attempt. */
  setWaiting(id: string, reason: string, until: number) {
    this.db.run(`UPDATE dumps SET status='pending', error=?, retry_at=?, version=version+1 WHERE id=?`, [reason, until, id]);
    this.changes.record('dumps', id, 'update', 1);
    bus.emit('data.changed', { table: 'dumps', id });
  }

  setProgress(id: string, progress: DumpProgress) {
    this.db.run(`UPDATE dumps SET progress=? WHERE id=?`, [JSON.stringify(progress), id]);
  }

  setStatus(id: string, status: DumpStatus, error?: string | null) {
    const done = status === 'done' || status === 'skipped';
    this.db.run(`UPDATE dumps SET status=?, error=?, retry_at=NULL, attempts=attempts+?, extracted_at=CASE WHEN ? THEN ? ELSE extracted_at END, version=version+1 WHERE id=?`, [
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








  /**
   * The Dump list (docs/MODEL.md layer 5): the last `days` days, plus any
   * older dump not filed yet. Newest first.
   */
  recent(opts: { days?: number; now?: number; limit?: number } = {}): Dump[] {
    const from = (opts.now ?? Date.now()) - (opts.days ?? DUMP_DAYS) * 86_400_000;
    return this.db
      .all<Row>(`SELECT * FROM dumps WHERE created_at >= ? OR status NOT IN ${FINISHED} ORDER BY created_at DESC LIMIT ?`, [from, opts.limit ?? 50])
      .map(toDump);
  }

  /**
   * Retention (docs/MODEL.md layer 6, R15): a dump filed (or with nothing to
   * file) more than `days` days ago is deleted, unless it holds Second Brain:
   * a Fact or a Note filed from it and not undone. What it filed stays; its
   * filings keep their label and lose the link to it. Returns how many went.
   */
  deleteOld(days = DUMP_DAYS, now = Date.now()): number {
    const ids = this.db
      .all<{ id: string }>(
        `SELECT d.id FROM dumps d WHERE d.status IN ${FINISHED} AND d.created_at < ?
           AND NOT EXISTS (SELECT 1 FROM filings f WHERE f.dump_id = d.id AND f.undone = 0 AND (f.fact_id IS NOT NULL OR f.kind IN ('fact', 'note')))
           AND NOT EXISTS (SELECT 1 FROM facts x WHERE x.source = 'dump' AND x.source_ref = d.id AND x.active = 1 AND x.deleted_at IS NULL)`,
        [now - days * 86_400_000],
      )
      .map((r) => r.id);
    if (!ids.length) return 0;
    this.db.transaction(() => {
      for (const id of ids) {
        this.db.run(`UPDATE filings SET dump_id = NULL WHERE dump_id = ?`, [id]);
        this.db.run(`DELETE FROM records_fts WHERE id = ?`, [id]);
        this.db.run(`DELETE FROM dumps WHERE id = ?`, [id]);
        this.changes.record('dumps', id, 'delete', 1);
      }
    });
    bus.emit('data.changed', { table: 'dumps', id: 'retention' });
    return ids.length;
  }

  /** Dumps that produced or touched a record (for "Dumps that mention it" on its page). */
  forEntity(entityId: string): Dump[] {
    return this.db
      .all<Row>(`SELECT d.* FROM dumps d WHERE d.id IN (SELECT dump_id FROM filings WHERE record_id=? AND undone=0) ORDER BY d.created_at DESC`, [entityId])
      .map(toDump);
  }


  /** Put every dump back in the search index (after a full rebuild). */
  reindex(): void {
    for (const r of this.db.all<{ id: string; body: string }>(`SELECT id, body FROM dumps`)) this.index(r.id, r.body);
  }

  private index(id: string, body: string) {
    const firstLine = body.trim().split('\n')[0]!.slice(0, 120);
    this.db.run(`DELETE FROM records_fts WHERE id=?`, [id]);
    this.db.run(`INSERT INTO records_fts(id,object,title,subtitle,body) VALUES (?,?,?,?,?)`, [id, 'dump', firstLine, 'Dump', body]);
  }
}
