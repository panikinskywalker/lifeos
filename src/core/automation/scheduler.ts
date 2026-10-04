import type { DatabaseAdapter, Row } from '../db/adapter';
import { newId } from '../domain/ids';
import { bus } from '../events/bus';
import type { LifeOSContext } from '../registry/context';
import { nextOccurrence } from './recurrence';
import { safeJson } from '../repo/recordRepo';

export interface ScheduledJob {
  id: string;
  kind: string; // 'rule' | 'reminder-scan' | module-defined
  payload: Record<string, unknown>;
  rrule?: string | null;
  nextAt: number;
  lastAt?: number | null;
  enabled: boolean;
}

export type JobHandler = (job: ScheduledJob, os: LifeOSContext) => Promise<void> | void;

/**
 * Persistent scheduler. Jobs live in SQLite so they survive restarts; `tick()`
 * runs whatever is due. On device it is driven by app foreground + a
 * background task (expo-background-task); in tests by calling tick() directly.
 * Recurring jobs roll forward using the same recurrence engine as reminders.
 */
export class Scheduler {
  private handlers = new Map<string, JobHandler>();
  constructor(private db: DatabaseAdapter, private os: LifeOSContext) {}

  registerHandler(kind: string, h: JobHandler) {
    this.handlers.set(kind, h);
  }

  schedule(job: { kind: string; payload?: Record<string, unknown>; at: number; rrule?: string | null; id?: string }): ScheduledJob {
    const id = job.id ?? newId();
    this.db.run(`INSERT INTO scheduled_jobs(id,kind,payload,rrule,next_at,enabled,created_at) VALUES (?,?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, rrule=excluded.rrule, next_at=excluded.next_at, enabled=1`, [id, job.kind, JSON.stringify(job.payload ?? {}), job.rrule ?? null, job.at, Date.now()]);
    return this.get(id)!;
  }
  get(id: string): ScheduledJob | undefined {
    const r = this.db.get<Row>(`SELECT * FROM scheduled_jobs WHERE id=?`, [id]);
    return r ? toJob(r) : undefined;
  }
  all(): ScheduledJob[] {
    return this.db.all<Row>(`SELECT * FROM scheduled_jobs ORDER BY next_at`).map(toJob);
  }
  cancel(id: string) {
    this.db.run(`DELETE FROM scheduled_jobs WHERE id=?`, [id]);
  }

  /** Run everything due. Returns number of jobs executed. */
  async tick(now = Date.now()): Promise<number> {
    const due = this.db.all<Row>(`SELECT * FROM scheduled_jobs WHERE enabled=1 AND next_at <= ? ORDER BY next_at`, [now]).map(toJob);
    let n = 0;
    for (const job of due) {
      const h = this.handlers.get(job.kind);
      try {
        if (h) await h(job, this.os);
        n++;
      } catch (e) {
        console.warn('[scheduler] job failed', job.kind, e);
      }
      if (job.rrule) {
        const next = nextOccurrence(job.rrule, job.nextAt, now);
        this.db.run(`UPDATE scheduled_jobs SET last_at=?, next_at=? WHERE id=?`, [now, next, job.id]);
      } else {
        this.db.run(`UPDATE scheduled_jobs SET last_at=?, enabled=0 WHERE id=?`, [now, job.id]);
      }
    }
    bus.emit('schedule.tick', { at: now });
    return n;
  }
}

function toJob(r: Row): ScheduledJob {
  return { id: r.id as string, kind: r.kind as string, payload: safeJson(r.payload as string), rrule: (r.rrule as string | null) ?? null, nextAt: r.next_at as number, lastAt: (r.last_at as number | null) ?? null, enabled: !!r.enabled };
}
