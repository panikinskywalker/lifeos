import type { DatabaseAdapter, Row } from '../db/adapter';
import { newId } from '../domain/ids';
import { bus } from '../events/bus';

/**
 * Changes made in LifeOS for a Source that also writes (docs/MODEL.md layer 4,
 * *Turf web*): each waits here, in order, with its own id, until the source
 * answers. The id goes with the change, so sending it twice is harmless.
 * - waiting: not answered yet (offline, or the source was down); shown as *sending*;
 * - sent: the source took it (kept a week, then pruned);
 * - refused: the source said no (a 4xx), with its words; you dismiss it.
 * What a change means is the source's business: core keeps the payload as it is.
 */

export type OutboxState = 'waiting' | 'sent' | 'refused';

export interface OutboxItem<P = unknown> {
  id: string;
  source: string;
  seq: number;
  payload: P;
  /** In your words: "Priya paid ₹147 · Sat 17 Oct". */
  label: string;
  /** The record the change is about, when there is one. */
  recordId: string | null;
  state: OutboxState;
  error: string | null;
  result: unknown;
  attempts: number;
  createdAt: number;
  updatedAt: number;
}

const WEEK = 7 * 86_400_000;

const json = (v: unknown) => {
  if (typeof v !== 'string') return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};

const toItem = (r: Row): OutboxItem => ({
  id: r.id as string,
  source: r.source as string,
  seq: r.seq as number,
  payload: json(r.payload),
  label: r.label as string,
  recordId: (r.record_id as string | null) ?? null,
  state: r.state as OutboxState,
  error: (r.error as string | null) ?? null,
  result: json(r.result),
  attempts: r.attempts as number,
  createdAt: r.created_at as number,
  updatedAt: r.updated_at as number,
});

export class OutboxRepo {
  constructor(private db: DatabaseAdapter) {}

  private changed(id: string) {
    bus.emit('data.changed', { table: 'outbox', id });
  }

  add<P>(item: { source: string; payload: P; label: string; recordId?: string | null; id?: string }): OutboxItem<P> {
    const id = item.id ?? newId();
    const now = Date.now();
    const seq = (this.db.get<{ s: number | null }>(`SELECT MAX(seq) AS s FROM outbox`)?.s ?? 0) + 1;
    this.db.run(`INSERT INTO outbox(id,source,seq,payload,label,record_id,state,attempts,created_at,updated_at) VALUES (?,?,?,?,?,?,'waiting',0,?,?)`, [id, item.source, seq, JSON.stringify(item.payload), item.label, item.recordId ?? null, now, now]);
    this.changed(id);
    return this.get<P>(id)!;
  }

  get<P = unknown>(id: string): OutboxItem<P> | null {
    const r = this.db.get<Row>(`SELECT * FROM outbox WHERE id=?`, [id]);
    return r ? (toItem(r) as OutboxItem<P>) : null;
  }

  /** What still waits for a source, oldest first: the order it must be sent in. */
  waiting<P = unknown>(source: string): OutboxItem<P>[] {
    return this.db.all<Row>(`SELECT * FROM outbox WHERE source=? AND state='waiting' ORDER BY seq`, [source]).map(toItem) as OutboxItem<P>[];
  }

  refused<P = unknown>(source: string): OutboxItem<P>[] {
    return this.db.all<Row>(`SELECT * FROM outbox WHERE source=? AND state='refused' ORDER BY seq DESC`, [source]).map(toItem) as OutboxItem<P>[];
  }

  forRecord<P = unknown>(recordId: string): OutboxItem<P>[] {
    return this.db.all<Row>(`SELECT * FROM outbox WHERE record_id=? AND state!='sent' ORDER BY seq`, [recordId]).map(toItem) as OutboxItem<P>[];
  }

  sent(id: string, result: unknown) {
    const now = Date.now();
    this.db.run(`UPDATE outbox SET state='sent', result=?, error=NULL, attempts=attempts+1, updated_at=? WHERE id=?`, [JSON.stringify(result ?? null), now, id]);
    this.db.run(`DELETE FROM outbox WHERE state='sent' AND updated_at < ?`, [now - WEEK]);
    this.changed(id);
  }

  refuse(id: string, error: string, result?: unknown) {
    this.db.run(`UPDATE outbox SET state='refused', error=?, result=?, attempts=attempts+1, updated_at=? WHERE id=?`, [error.slice(0, 300), JSON.stringify(result ?? null), Date.now(), id]);
    this.changed(id);
  }

  /** Not answered (offline, a server error): it keeps waiting, in its place. */
  retry(id: string, error: string) {
    this.db.run(`UPDATE outbox SET error=?, attempts=attempts+1, updated_at=? WHERE id=?`, [error.slice(0, 300), Date.now(), id]);
    this.changed(id);
  }

  /** You've seen a refusal; it goes. */
  dismiss(id: string) {
    this.db.run(`DELETE FROM outbox WHERE id=? AND state='refused'`, [id]);
    this.changed(id);
  }
}
