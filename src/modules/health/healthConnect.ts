import type { HealthDay, LifeOSContext } from '@core/registry/context';

/**
 * Health Connect days → records (docs/MODEL.md layer 2, *Body*; R6). Moved
 * from core (`src/core/sources/deviceData.ts`) with the source: one
 * Measurement per metric per day, one Workout per session, each with its
 * source key so a re-sync updates in place. A day's steps grow until it
 * ends, so a re-synced day replaces its values.
 */

/** Health Connect exercise types → workout kinds. */
const EXERCISE: Record<number, string> = { 79: 'walk', 56: 'run', 57: 'run', 8: 'cycle', 9: 'cycle', 70: 'strength', 80: 'strength', 81: 'yoga', 74: 'swim', 73: 'swim', 5: 'sport', 10: 'sport', 14: 'sport', 26: 'sport', 64: 'sport' };

const METRICS: Array<[keyof HealthDay, string, string, (v: number) => number]> = [
  ['steps', 'steps', 'steps', (v) => Math.round(v)],
  ['sleepMin', 'sleep', 'h', (v) => Math.round((v / 60) * 10) / 10],
  ['restingHr', 'resting_hr', 'bpm', (v) => Math.round(v)],
  ['heartRateAvg', 'heart_rate', 'bpm', (v) => Math.round(v)],
  ['weightKg', 'weight', 'kg', (v) => Math.round(v * 10) / 10],
];

function upsertBySourceKey(os: LifeOSContext, object: string, key: string, data: Record<string, unknown>): 'created' | 'updated' | 'same' {
  const [hit] = os.records.query<Record<string, unknown>>(object, { filter: { and: [{ field: 'data.sourceKey', op: 'eq', value: key }] } }, { limit: 1 });
  if (!hit) {
    os.records.create({ object, data: { ...data, sourceKey: key } }, 'system');
    return 'created';
  }
  const changed = Object.entries(data).some(([k, v]) => hit.data[k] !== v);
  if (changed) os.records.update(hit.id, { data }, 'system');
  return changed ? 'updated' : 'same';
}

/** Health Connect days → one measurement per metric per day, one workout per session. Returns records created. */
export function saveHealthDays(os: LifeOSContext, days: HealthDay[]): number {
  let created = 0;
  const has = (t: string) => os.registry.objects.has(t);
  os.db.transaction(() => {
    for (const d of days) {
      if (has('measurement')) {
        for (const [k, metric, unit, fmt] of METRICS) {
          const v = d[k] as number | undefined;
          if (v == null || !Number.isFinite(v) || v <= 0) continue;
          const span = metric === 'sleep' && d.sleepStart && d.sleepEnd ? { startAt: d.sleepStart, endAt: d.sleepEnd } : {};
          if (upsertBySourceKey(os, 'measurement', `hc:${metric}:${d.day}`, { metric, value: fmt(v), unit, date: d.day, ...span, source: 'health_connect' }) === 'created') created++;
        }
      }
      if (has('workout')) {
        for (const w of d.workouts ?? []) {
          if (!(w.minutes > 0)) continue;
          const startAt = w.start > 0 ? { startAt: w.start } : {};
          if (upsertBySourceKey(os, 'workout', `hc:${w.id}`, { kind: EXERCISE[w.type] ?? 'other', durationMin: Math.round(w.minutes), date: d.day, ...startAt, notes: w.title ?? undefined, source: 'health_connect' }) === 'created') created++;
        }
      }
    }
  });
  return created;
}
