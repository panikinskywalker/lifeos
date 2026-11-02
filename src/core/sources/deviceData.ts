import type { LifeOSContext } from '../registry/context';
import type { Row } from '../db/adapter';
import { bus } from '../events/bus';

/**
 * Device data (M4.2): source state, screen time's per-day tables, and a
 * metric's days read from Measurements. The health module's sources (R6)
 * read the phone and hand the days here; re-syncing a day replaces it (a
 * day's totals grow until it ends). Health Connect's filing is the module's.
 */

/* ------------------------------------------------------------------ */
/* Source state                                                          */
/* ------------------------------------------------------------------ */

export interface SourceState {
  id: string;
  enabled: boolean;
  lastSync: number | null;
  cursor: string | null;
  total: number;
  error: string | null;
}

export function sourceState(os: LifeOSContext, id: string): SourceState {
  const r = os.db.get<Row>(`SELECT * FROM source_state WHERE id=?`, [id]);
  return r
    ? { id, enabled: r.enabled === 1, lastSync: (r.last_sync as number | null) ?? null, cursor: (r.cursor as string | null) ?? null, total: r.total as number, error: (r.error as string | null) ?? null }
    : { id, enabled: false, lastSync: null, cursor: null, total: 0, error: null };
}

export function setSourceState(os: LifeOSContext, id: string, patch: Partial<Omit<SourceState, 'id'>> & { addTotal?: number }) {
  const cur = sourceState(os, id);
  const next = { ...cur, ...patch, total: cur.total + (patch.addTotal ?? 0) + (patch.total != null ? patch.total - cur.total : 0) };
  os.db.run(
    `INSERT INTO source_state(id,enabled,last_sync,cursor,total,error,updated_at) VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled, last_sync=excluded.last_sync, cursor=excluded.cursor, total=excluded.total, error=excluded.error, updated_at=excluded.updated_at`,
    [id, next.enabled ? 1 : 0, next.lastSync, next.cursor, next.total, next.error, Date.now()],
  );
  bus.emit('data.changed', { table: 'source_state', id });
}

/* ------------------------------------------------------------------ */
/* Screen time                                                           */
/* ------------------------------------------------------------------ */

export interface UsageDayIn {
  day: string;
  totalMs: number;
  pickups?: number | null;
  firstUse?: number | null;
  lastUse?: number | null;
  apps: Array<{ package: string; label?: string | null; ms: number; launches?: number | null }>;
}

export function saveUsageDays(os: LifeOSContext, days: UsageDayIn[]): number {
  os.db.transaction(() => {
    for (const d of days) {
      os.db.run(
        `INSERT INTO usage_daily(day,total_ms,pickups,first_use,last_use,updated_at) VALUES (?,?,?,?,?,?)
         ON CONFLICT(day) DO UPDATE SET total_ms=excluded.total_ms, pickups=excluded.pickups, first_use=excluded.first_use, last_use=excluded.last_use, updated_at=excluded.updated_at`,
        [d.day, Math.round(d.totalMs), d.pickups ?? null, d.firstUse ?? null, d.lastUse ?? null, Date.now()],
      );
      os.db.run(`DELETE FROM usage_app_daily WHERE day=?`, [d.day]);
      for (const a of d.apps) os.db.run(`INSERT INTO usage_app_daily(day,package,label,ms,launches) VALUES (?,?,?,?,?)`, [d.day, a.package, a.label ?? null, Math.round(a.ms), a.launches ?? null]);
    }
  });
  if (days.length) bus.emit('data.changed', { table: 'usage_daily', id: days[days.length - 1]!.day });
  return days.length;
}

export interface UsageDay {
  day: string;
  totalMs: number;
  pickups: number | null;
  firstUse: number | null;
  lastUse: number | null;
}

/** Days in [from, to] (ISO days), oldest first. */
export function usageDays(os: LifeOSContext, from: string, to: string): UsageDay[] {
  return os.db
    .all<Row>(`SELECT * FROM usage_daily WHERE day BETWEEN ? AND ? ORDER BY day`, [from, to])
    .map((r) => ({ day: r.day as string, totalMs: r.total_ms as number, pickups: (r.pickups as number | null) ?? null, firstUse: (r.first_use as number | null) ?? null, lastUse: (r.last_use as number | null) ?? null }));
}

/** Top apps over a range, by time. */
export function topApps(os: LifeOSContext, from: string, to: string, limit = 5): Array<{ package: string; label: string; ms: number }> {
  return os.db
    .all<{ package: string; label: string | null; ms: number }>(`SELECT package, MAX(label) AS label, SUM(ms) AS ms FROM usage_app_daily WHERE day BETWEEN ? AND ? GROUP BY package ORDER BY ms DESC LIMIT ?`, [from, to, limit])
    .map((r) => ({ package: r.package, label: r.label ?? r.package, ms: r.ms }));
}

/* ------------------------------------------------------------------ */
/* Measurements (filed by the health module; R6)                         */
/* ------------------------------------------------------------------ */

/** A metric per day in [from, to] (for Today's charts); with several readings on a day, the latest. */
export function metricDays(os: LifeOSContext, metric: string, from: string, to: string): Array<{ day: string; value: number }> {
  return os.records
    .query<{ metric: string; value: number; date: string }>('measurement', { filter: { and: [{ field: 'data.metric', op: 'eq', value: metric }, { field: 'data.date', op: 'gte', value: from }, { field: 'data.date', op: 'lte', value: to }] }, sort: [{ field: 'data.date', dir: 'asc' }, { field: 'createdAt', dir: 'asc' }] }, { limit: 1000 })
    .map((e) => ({ day: e.data.date, value: e.data.value }));
}
