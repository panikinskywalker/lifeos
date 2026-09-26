import type { LifeOSContext } from '../registry/context';
import type { Row } from '../db/adapter';
import { bus } from '../events/bus';

/**
 * Device data (M4.2): screen time and Health Connect, stored so Today can
 * chart them. Pure — the platform reads the phone and hands the days here.
 * Re-syncing a day replaces it (a day's totals grow until it ends).
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
/* Health Connect                                                        */
/* ------------------------------------------------------------------ */

export interface HealthDayIn {
  day: string;
  steps?: number;
  sleepMin?: number;
  heartRateAvg?: number;
  restingHr?: number;
  weightKg?: number;
  workouts?: Array<{ id: string; type: number; title?: string | null; start: number; minutes: number }>;
}

/** Health Connect exercise types → our workout kinds. */
const EXERCISE: Record<number, string> = { 79: 'walk', 56: 'run', 57: 'run', 8: 'cycle', 9: 'cycle', 70: 'strength', 80: 'strength', 81: 'yoga', 74: 'swim', 73: 'swim', 5: 'sport', 10: 'sport', 14: 'sport', 26: 'sport', 64: 'sport' };

const METRICS: Array<[keyof HealthDayIn, string, string, (v: number) => number]> = [
  ['steps', 'steps', 'steps', (v) => Math.round(v)],
  ['sleepMin', 'sleep', 'h', (v) => Math.round((v / 60) * 10) / 10],
  ['restingHr', 'resting_hr', 'bpm', (v) => Math.round(v)],
  ['heartRateAvg', 'heart_rate', 'bpm', (v) => Math.round(v)],
  ['weightKg', 'weight', 'kg', (v) => Math.round(v * 10) / 10],
];

function upsertBySourceKey(os: LifeOSContext, type: string, key: string, data: Record<string, unknown>): 'created' | 'updated' | 'same' {
  const [hit] = os.entities.query<Record<string, unknown>>(type, { filter: { and: [{ field: 'data.sourceKey', op: 'eq', value: key }] } }, { limit: 1 });
  if (!hit) {
    os.entities.create({ type, data: { ...data, sourceKey: key } }, 'system');
    return 'created';
  }
  const changed = Object.entries(data).some(([k, v]) => hit.data[k] !== v);
  if (changed) os.entities.update(hit.id, { data }, 'system');
  return changed ? 'updated' : 'same';
}

/** Health Connect days → one measurement per metric per day, one workout per session. Returns records created. */
export function saveHealthDays(os: LifeOSContext, days: HealthDayIn[]): number {
  let created = 0;
  const has = (t: string) => os.registry.entityTypes.has(t);
  os.db.transaction(() => {
    for (const d of days) {
      if (has('measurement')) {
        for (const [k, metric, unit, fmt] of METRICS) {
          const v = d[k] as number | undefined;
          if (v == null || !Number.isFinite(v) || v <= 0) continue;
          if (upsertBySourceKey(os, 'measurement', `hc:${metric}:${d.day}`, { metric, value: fmt(v), unit, date: d.day, source: 'health_connect' }) === 'created') created++;
        }
      }
      if (has('workout')) {
        for (const w of d.workouts ?? []) {
          if (!(w.minutes > 0)) continue;
          if (upsertBySourceKey(os, 'workout', `hc:${w.id}`, { kind: EXERCISE[w.type] ?? 'other', durationMin: Math.round(w.minutes), date: d.day, notes: w.title ?? undefined, source: 'health_connect' }) === 'created') created++;
        }
      }
    }
  });
  return created;
}

/** A metric per day in [from, to] (for Today's charts). */
export function metricDays(os: LifeOSContext, metric: string, from: string, to: string): Array<{ day: string; value: number }> {
  return os.entities
    .query<{ metric: string; value: number; date: string }>('measurement', { filter: { and: [{ field: 'data.metric', op: 'eq', value: metric }, { field: 'data.date', op: 'gte', value: from }, { field: 'data.date', op: 'lte', value: to }] }, sort: [{ field: 'data.date', dir: 'asc' }] }, { limit: 1000 })
    .map((e) => ({ day: e.data.date, value: e.data.value }));
}
