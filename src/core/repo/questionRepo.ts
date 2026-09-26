import type { DatabaseAdapter, Row } from '../db/adapter';
import { newId } from '../domain/ids';
import { bus } from '../events/bus';

export interface QueuedQuestion {
  id: string;
  text: string;
  createdAt: number;
  status: 'waiting' | 'answered' | 'failed';
  answer: string | null;
  answeredAt: number | null;
  retryAt: number | null;
  attempts: number;
}

const toQ = (r: Row): QueuedQuestion => ({
  id: r.id as string,
  text: r.text as string,
  createdAt: r.created_at as number,
  status: r.status as QueuedQuestion['status'],
  answer: (r.answer as string | null) ?? null,
  answeredAt: (r.answered_at as number | null) ?? null,
  retryAt: (r.retry_at as number | null) ?? null,
  attempts: r.attempts as number,
});

/** Questions asked while no model was free (M4.1c): answered by the queue when one is. */
export class QuestionRepo {
  constructor(private db: DatabaseAdapter) {}

  add(text: string, retryAt?: number | null): QueuedQuestion {
    const id = newId();
    this.db.run(`INSERT INTO queued_questions(id,text,created_at,retry_at) VALUES (?,?,?,?)`, [id, text, Date.now(), retryAt ?? null]);
    bus.emit('data.changed', { table: 'queued_questions', id });
    return this.get(id)!;
  }
  get(id: string): QueuedQuestion | null {
    const r = this.db.get<Row>(`SELECT * FROM queued_questions WHERE id=?`, [id]);
    return r ? toQ(r) : null;
  }
  /** Newest first. */
  list(limit = 30): QueuedQuestion[] {
    return this.db.all<Row>(`SELECT * FROM queued_questions ORDER BY created_at DESC LIMIT ?`, [limit]).map(toQ);
  }
  due(now = Date.now()): QueuedQuestion[] {
    return this.db.all<Row>(`SELECT * FROM queued_questions WHERE status='waiting' AND (retry_at IS NULL OR retry_at <= ?) ORDER BY created_at`, [now]).map(toQ);
  }
  nextWake(): number | null {
    return this.db.get<{ t: number | null }>(`SELECT MIN(retry_at) AS t FROM queued_questions WHERE status='waiting' AND retry_at IS NOT NULL`)?.t ?? null;
  }
  answer(id: string, answer: string) {
    this.db.run(`UPDATE queued_questions SET status='answered', answer=?, answered_at=?, retry_at=NULL WHERE id=?`, [answer, Date.now(), id]);
    bus.emit('data.changed', { table: 'queued_questions', id });
  }
  wait(id: string, until: number) {
    this.db.run(`UPDATE queued_questions SET retry_at=? WHERE id=?`, [until, id]);
    bus.emit('data.changed', { table: 'queued_questions', id });
  }
  fail(id: string, maxAttempts = 3) {
    this.db.run(`UPDATE queued_questions SET attempts=attempts+1, status=CASE WHEN attempts+1 >= ? THEN 'failed' ELSE status END, retry_at=? WHERE id=?`, [maxAttempts, Date.now() + 5 * 60_000, id]);
    bus.emit('data.changed', { table: 'queued_questions', id });
  }
}
