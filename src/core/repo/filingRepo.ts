import type { DatabaseAdapter, Row } from '../db/adapter';
import { newId } from '../domain/ids';
import { bus } from '../events/bus';

/**
 * Filings (docs/MODEL.md §4, step 4 — write with provenance): every record,
 * fact, link or cycle change that filing made, from which dump or message, how
 * sure it was, and what it replaced. Undo reverses exactly one. The ones not
 * yet ticked are the To check list; untouched ones are approved after 15 days.
 */
export interface Filing {
  id: string;
  /** The dump it came from, or null for other sources (see `source`). */
  dumpId: string | null;
  /** dump | sms | notification | health | calendar | gmail … */
  source: string;
  /** The source item (an ingest_queue id for SMS / notifications / mail). */
  sourceRef: string | null;
  /** person | task | fact | event | transaction | cycle | asset | … (a record type, 'fact' or 'cycle'). */
  kind: string;
  action: 'created' | 'updated' | 'logged';
  entityId: string | null;
  factId: string | null;
  label: string;
  undone: boolean;
  createdAt: number;
  relationId: string | null;
  /** What this write replaced ({ field: old value } / { notes: old text }) — cancel restores it. */
  before: Record<string, unknown> | null;
  confidence: number;
  /** Why it needs a look ("guessed which Kendal", "possible duplicate"). */
  flag: string | null;
  checked: boolean;
}

const toFiling = (r: Row): Filing => ({
  id: r.id as string,
  dumpId: (r.dump_id as string | null) ?? null,
  source: (r.source as string | undefined) ?? 'dump',
  sourceRef: (r.source_ref as string | null) ?? null,
  kind: r.kind as string,
  action: r.action as Filing['action'],
  entityId: (r.record_id as string | null) ?? null,
  factId: (r.fact_id as string | null) ?? null,
  label: r.label as string,
  undone: r.undone === 1,
  createdAt: r.created_at as number,
  relationId: (r.relation_id as string | null) ?? null,
  before: r.before ? (JSON.parse(r.before as string) as Record<string, unknown>) : null,
  confidence: (r.confidence as number | undefined) ?? 1,
  flag: (r.flag as string | null) ?? null,
  checked: r.checked === 1,
});

export class FilingRepo {
  constructor(private db: DatabaseAdapter) {}

  /** Record what filing wrote: one row per record, fact, link or cycle change, with where it came from and what it replaced. */
  add(x: { dumpId?: string | null; source?: string; sourceRef?: string | null; kind: string; action?: Filing['action']; entityId?: string | null; factId?: string | null; relationId?: string | null; label: string; before?: Record<string, unknown> | null; confidence?: number; flag?: string | null }): Filing {
    const id = newId();
    this.db.run(`INSERT INTO filings(id,dump_id,source,source_ref,kind,action,record_id,fact_id,relation_id,label,before,confidence,flag,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      id,
      x.dumpId ?? null,
      x.source ?? 'dump',
      x.sourceRef ?? null,
      x.kind,
      x.action ?? 'created',
      x.entityId ?? null,
      x.factId ?? null,
      x.relationId ?? null,
      x.label,
      x.before ? JSON.stringify(x.before) : null,
      x.confidence ?? 1,
      x.flag ?? null,
      Date.now(),
    ]);
    bus.emit('data.changed', { table: 'dumps', id: x.dumpId ?? id });
    return this.get(id)!;
  }


  toCheck(limit = 200): Filing[] {
    return this.db
      .all<Row>(`SELECT * FROM filings WHERE checked=0 AND undone=0 ORDER BY (flag IS NULL), created_at DESC, rowid DESC LIMIT ?`, [limit])
      .map(toFiling);
  }


  autoApprove(days = 15, now = Date.now()): number {
    const cutoff = now - days * 86_400_000;
    const n = this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM filings WHERE checked=0 AND undone=0 AND created_at < ?`, [cutoff])?.n ?? 0;
    if (n) {
      this.db.run(`UPDATE filings SET checked=1 WHERE checked=0 AND undone=0 AND created_at < ?`, [cutoff]);
      bus.emit('data.changed', { table: 'dumps', id: 'auto-approve' });
    }
    return n;
  }


  toCheckCount(): number {
    return this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM filings WHERE checked=0 AND undone=0`)?.n ?? 0;
  }


  setChecked(ids: string | string[], checked = true) {
    const list = Array.isArray(ids) ? ids : [ids];
    if (!list.length) return;
    this.db.run(`UPDATE filings SET checked=? WHERE id IN (${list.map(() => '?').join(',')})`, [checked ? 1 : 0, ...list]);
    bus.emit('data.changed', { table: 'dumps', id: list[0]! });
  }


  get(id: string): Filing | null {
    const r = this.db.get<Row>(`SELECT * FROM filings WHERE id=?`, [id]);
    return r ? toFiling(r) : null;
  }


  forDump(dumpId: string): Filing[] {
    return this.db.all<Row>(`SELECT * FROM filings WHERE dump_id=? ORDER BY created_at, rowid`, [dumpId]).map(toFiling);
  }


  /** Filings of one kind, newest first (a board's own cards: Home's Blinkit order). */
  ofKind(kind: string, opts: { since?: number; open?: boolean; limit?: number } = {}): Filing[] {
    return this.db
      .all<Row>(`SELECT * FROM filings WHERE kind=? AND created_at >= ?${opts.open ? ' AND checked=0 AND undone=0' : ''} ORDER BY created_at DESC, rowid DESC LIMIT ?`, [kind, opts.since ?? 0, opts.limit ?? 50])
      .map(toFiling);
  }

  /** What was filed from one message (its ingest_queue id), oldest first: a later parser finds the Transaction an earlier one made. */
  forSource(sourceRef: string): Filing[] {
    return this.db.all<Row>(`SELECT * FROM filings WHERE source_ref=? ORDER BY created_at, rowid`, [sourceRef]).map(toFiling);
  }

  /** Change a card's words, record or what it keeps (a second message about the same order adds the amount). */
  update(id: string, patch: { label?: string; flag?: string | null; entityId?: string | null; before?: Record<string, unknown> | null }) {
    const x = this.get(id);
    if (!x) return;
    this.db.run(`UPDATE filings SET label=?, flag=?, record_id=?, before=? WHERE id=?`, [
      patch.label ?? x.label,
      patch.flag !== undefined ? patch.flag : x.flag,
      patch.entityId !== undefined ? patch.entityId : x.entityId,
      patch.before !== undefined ? (patch.before ? JSON.stringify(patch.before) : null) : x.before ? JSON.stringify(x.before) : null,
      id,
    ]);
    bus.emit('data.changed', { table: 'dumps', id: x.dumpId ?? x.id });
  }

  markUndone(filingId: string, undone = true) {
    const x = this.get(filingId);
    this.db.run(`UPDATE filings SET undone=? WHERE id=?`, [undone ? 1 : 0, filingId]);
    if (x) bus.emit('data.changed', { table: 'dumps', id: x.dumpId ?? x.id });
  }

}
