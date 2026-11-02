import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { METRICS, compareMetric, formatMetric, isoDay, metricSeries, type MetricId } from '@core/dashboard/metrics';
import { usageDays } from '@core/sources/deviceData';
import { unitFor, type MeasurementData, type WorkoutData } from './types';

/** Body's numbers, as the board, the AI tools and the brain read them (R6). Pure, no React Native. */

const DAY = 86_400_000;

/** The metrics Health has a page for, in order, and which MetricIds each page draws. */
export const HEALTH_METRICS = ['steps', 'sleep', 'resting_hr', 'heart_rate', 'weight', 'screen'] as const satisfies readonly MetricId[];
export type HealthMetric = (typeof HEALTH_METRICS)[number];
export const isHealthMetric = (x: string): x is HealthMetric => (HEALTH_METRICS as readonly string[]).includes(x);

/** The latest Measurement of a metric, on or before `day`. */
export function latestMeasurement(os: LifeOSContext, metric: string, day = isoDay(Date.now())): ObjectRecord<MeasurementData> | null {
  if (!os.registry.objects.has('measurement')) return null;
  const [m] = os.records.query<MeasurementData>('measurement', { filter: { and: [{ field: 'data.metric', op: 'eq', value: metric }, { field: 'data.date', op: 'lte', value: day }] }, sort: [{ field: 'data.date', dir: 'desc' }, { field: 'createdAt', dir: 'desc' }] }, { limit: 1 });
  return m ?? null;
}

/** Today at a glance: today's steps and screen time, last night's sleep, the day's resting heart rate, the latest weight. */
export function healthToday(os: LifeOSContext, now = Date.now()) {
  const today = isoDay(now);
  const on = (metric: string) => {
    const m = latestMeasurement(os, metric, today);
    return m && m.data.date === today ? m.data.value : null;
  };
  const weight = latestMeasurement(os, 'weight', today);
  const screen = usageDays(os, today, today)[0];
  return {
    day: today,
    steps: on('steps'),
    sleep: on('sleep'),
    restingHr: on('resting_hr'),
    heartRate: on('heart_rate'),
    weight: weight ? { kg: weight.data.value, on: weight.data.date } : null,
    screenHours: screen ? screen.totalMs / 3_600_000 : null,
  };
}

/** Nights of sleep in [from, to], newest first, with when they began and ended. */
export function sleepNights(os: LifeOSContext, from: string, to: string) {
  if (!os.registry.objects.has('measurement')) return [];
  return os.records
    .query<MeasurementData>('measurement', { filter: { and: [{ field: 'data.metric', op: 'eq', value: 'sleep' }, { field: 'data.date', op: 'gte', value: from }, { field: 'data.date', op: 'lte', value: to }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 400 })
    .map((m) => ({ id: m.id, day: m.data.date, hours: m.data.value, asleep: m.data.startAt ?? null, awake: m.data.endAt ?? null }));
}

export interface WorkoutSummary {
  workouts: Array<{ id: string; title: string; kind: string; date: string; minutes: number; km: number | null }>;
  count: number;
  minutes: number;
  km: number;
  /** Minutes by kind, most first. */
  byKind: Array<{ kind: string; count: number; minutes: number }>;
}

/** Workouts in the last `days` days, newest first, with totals. */
export function workoutsIn(os: LifeOSContext, days = 30, now = Date.now()): WorkoutSummary {
  const empty: WorkoutSummary = { workouts: [], count: 0, minutes: 0, km: 0, byKind: [] };
  if (!os.registry.objects.has('workout')) return empty;
  const from = isoDay(now - (days - 1) * DAY);
  const rows = os.records.query<WorkoutData>('workout', { filter: { and: [{ field: 'data.date', op: 'gte', value: from }, { field: 'data.date', op: 'lte', value: isoDay(now) }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 500 });
  const kinds = new Map<string, { kind: string; count: number; minutes: number }>();
  for (const w of rows) {
    const k = kinds.get(w.data.kind) ?? { kind: w.data.kind, count: 0, minutes: 0 };
    k.count++;
    k.minutes += w.data.durationMin;
    kinds.set(w.data.kind, k);
  }
  return {
    workouts: rows.map((w) => ({ id: w.id, title: w.title, kind: w.data.kind, date: w.data.date, minutes: w.data.durationMin, km: w.data.distanceKm ?? null })),
    count: rows.length,
    minutes: rows.reduce((a, w) => a + w.data.durationMin, 0),
    km: Math.round(rows.reduce((a, w) => a + (w.data.distanceKm ?? 0), 0) * 10) / 10,
    byKind: [...kinds.values()].sort((a, b) => b.minutes - a.minutes),
  };
}

/** A metric's comparisons in words ("8,900 a day · +12% vs last week · usual 8,100"), for the tools. */
export function compareInWords(os: LifeOSContext, id: MetricId, now = Date.now()) {
  const c = compareMetric(os, id, now);
  const f = (v: number | null) => (v == null ? null : formatMetric(id, v, os.format.currency));
  const pct = (v: number | null) => (v == null ? null : `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`);
  const s = metricSeries(os, id, 'day', now);
  return {
    metric: METRICS[id].label,
    per: METRICS[id].agg === 'last' ? 'latest reading' : 'average per day with data',
    today: f(s.value),
    thisWeek: f(c.thisWeek),
    lastWeek: f(c.lastWeek),
    usual: f(c.usual),
    vsLastWeek: pct(c.vsLast),
    vsUsual: pct(c.vsUsual),
    better: METRICS[id].better === 'up' ? 'higher' : METRICS[id].better === 'down' ? 'lower' : 'neither',
  };
}

/** Log a reading you typed or said ("weighed 72.4"); the unit comes from the metric when not given. */
export function logMeasurement(os: LifeOSContext, input: { metric: string; value: number; date?: string; unit?: string; notes?: string }) {
  const data: MeasurementData = { metric: input.metric, value: input.value, date: input.date ?? isoDay(Date.now()), unit: input.unit ?? unitFor(input.metric), ...(input.notes ? { notes: input.notes } : {}) };
  return os.records.create({ object: 'measurement', data: data as unknown as Record<string, unknown> }, 'assistant');
}
