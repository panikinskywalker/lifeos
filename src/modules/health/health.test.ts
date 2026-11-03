import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { HealthDay, LifeOSContext, UsageDay } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { runSource } from '@core/filing/sources';
import { compareMetric, daily, isoDay } from '@core/dashboard/metrics';
import { sourceState, usageDays } from '@core/sources/deviceData';
import { HISTORY, healthBrain, healthModule, healthToday, logMeasurement, readFrom, saveHealthDays, sleepNights, workoutsIn, type MeasurementData } from '.';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 2, 18, 0).getTime(); // Mon 2 Nov 2026, 6 pm
const dayAgo = (n: number) => isoDay(NOW - n * DAY);

let os: LifeOSContext;
beforeEach(async () => {
  // The data is laid out around NOW; the code reads the clock, so pin it there.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [healthModule], registry: new Registry() });
});
afterEach(() => {
  os.db.close();
  vi.useRealTimers();
});

const tool = (name: string) => healthModule.aiTools!.find((t) => t.name === name)!;
/** One reading a day for the last `n` days (today = 0), `value(i)` for day i ago; null skips a day. */
function readings(metric: string, n: number, value: (i: number) => number | null) {
  for (let i = 0; i < n; i++) {
    const v = value(i);
    if (v != null) os.records.create<MeasurementData>({ object: 'measurement', data: { metric, value: v, date: dayAgo(i), source: 'health_connect', sourceKey: `hc:${metric}:${dayAgo(i)}` } });
  }
}

describe('Health Connect and Usage access are health’s sources (R6)', () => {
  it('Health Connect files through the bridge: 90 days back the first time, then from the day before the last sync; a re-sync adds nothing', async () => {
    const asked: Array<[number, number]> = [];
    const days: HealthDay[] = [
      { day: '2026-11-01', steps: 8120.4, sleepMin: 450, sleepStart: new Date(2026, 9, 31, 23, 40).getTime(), sleepEnd: new Date(2026, 10, 1, 7, 10).getTime(), restingHr: 61.2, heartRateAvg: 74.8, weightKg: 72.44, workouts: [{ id: 'ex1', type: 56, title: 'Morning run', start: new Date(2026, 10, 1, 6, 30).getTime(), minutes: 31.6 }] },
    ];
    os.device = { health: { access: async () => 'granted', read: async (from, to) => (asked.push([from, to]), days) } };
    const src = os.registry.sources.get('health')!;
    expect(src.modules).toEqual(['health']);
    expect(await runSource(os, src)).toBe(6);
    const first = asked[0]!;
    expect(Math.round((first[1] - first[0]) / DAY)).toBeGreaterThanOrEqual(HISTORY.healthDays);
    const sleep = os.records.query<MeasurementData>('measurement', { filter: { and: [{ field: 'data.metric', op: 'eq', value: 'sleep' }] } })[0]!;
    expect(sleep.data).toMatchObject({ value: 7.5, unit: 'h', date: '2026-11-01', startAt: days[0]!.sleepStart, endAt: days[0]!.sleepEnd, source: 'health_connect' });
    const run = os.records.query('workout')[0]!;
    expect(run).toMatchObject({ title: 'Run', data: { kind: 'run', durationMin: 32, startAt: days[0]!.workouts![0]!.start, notes: 'Morning run' } });

    expect(await runSource(os, src)).toBe(0);
    const second = asked[1]!;
    expect(second[1] - second[0]).toBeLessThan(3 * DAY);
    expect(sourceState(os, 'health')).toMatchObject({ total: 6, error: null });
  });

  it('a source without access is not read', async () => {
    os.device = { health: { access: async () => 'needed', read: async () => { throw new Error('should not read'); } }, usage: { access: async () => 'needed', read: async () => { throw new Error('should not read'); } } };
    expect(await runSource(os, os.registry.sources.get('health')!)).toBe(0);
    expect(await runSource(os, os.registry.sources.get('usage')!)).toBe(0);
  });

  it('Usage access keeps screen time in core’s usage tables; only new days count as brought in', async () => {
    const today = isoDay(Date.now());
    const yesterday = isoDay(Date.now() - DAY);
    let days: UsageDay[] = [
      { day: yesterday, totalMs: 4 * 3_600_000, pickups: 80, apps: [{ package: 'com.whatsapp', label: 'WhatsApp', ms: 3_600_000 }] },
      { day: today, totalMs: 3_600_000, apps: [] },
    ];
    os.device = { usage: { access: async () => 'granted', read: async () => days } };
    const src = os.registry.sources.get('usage')!;
    expect(await runSource(os, src)).toBe(2);
    days = [{ day: today, totalMs: 2 * 3_600_000, apps: [] }];
    expect(await runSource(os, src)).toBe(0);
    expect(usageDays(os, yesterday, today).map((d) => d.totalMs / 3_600_000)).toEqual([4, 2]);
  });

  it('readFrom: the first sync reaches back; later ones start the day before the last sync', () => {
    const first = readFrom(null, NOW, 30);
    expect(new Date(first).getHours()).toBe(0);
    expect(Math.round((NOW - first) / DAY)).toBe(31);
    expect(isoDay(readFrom(NOW - 3_600_000, NOW, 30))).toBe(dayAgo(2));
  });
});

describe('comparisons: this week vs last, vs your usual', () => {
  it('a week is its average per day with data, so a day without the watch is not a zero', () => {
    readings('steps', 7, (i) => (i === 3 ? null : 9000)); // this week: six days of 9,000
    readings('steps', 14, (i) => (i < 7 ? null : 6000)); // last week: 6,000 a day
    const c = compareMetric(os, 'steps', NOW);
    expect(c.thisWeek).toBe(9000);
    expect(c.lastWeek).toBe(6000);
    expect(c.vsLast).toBeCloseTo(0.5);
  });

  it('your usual is the median of the 8 weeks before this one that have data', () => {
    const perWeek = [8000, 7000, 7500, 20000, 7200]; // weeks 1..5 ago; week 4 a hiking holiday
    readings('steps', 6 * 7, (i) => (i < 7 ? 7500 : perWeek[Math.floor(i / 7) - 1]!));
    const c = compareMetric(os, 'steps', NOW);
    expect(c.usualWeeks).toBe(5);
    expect(c.usual).toBe(7500);
    expect(c.vsUsual).toBe(0);
  });

  it('needs two weeks for a usual; weight compares its latest readings', () => {
    readings('weight', 14, (i) => (i === 1 ? 72.4 : i === 9 ? 73.1 : null));
    const c = compareMetric(os, 'weight', NOW);
    expect(c).toMatchObject({ thisWeek: 72.4, lastWeek: 73.1, usual: null, usualWeeks: 1 });
  });

  it('with two readings on a day, the day’s value is the latest', () => {
    logMeasurement(os, { metric: 'weight', value: 73, date: dayAgo(0) });
    logMeasurement(os, { metric: 'weight', value: 72.6, date: dayAgo(0) });
    expect(daily(os, 'weight', dayAgo(0), dayAgo(0)).get(dayAgo(0))).toBe(72.6);
  });
});

describe('Body’s numbers and AI tools', () => {
  it('health_today, sleep nights and workouts', async () => {
    saveHealthDays(os, [{ day: isoDay(Date.now()), steps: 4200, sleepMin: 400, restingHr: 60, workouts: [{ id: 'w1', type: 79, start: Date.now() - 3_600_000, minutes: 40 }, { id: 'w2', type: 70, start: Date.now() - 7_200_000, minutes: 50 }] }]);
    const h = healthToday(os);
    expect(h).toMatchObject({ steps: 4200, sleep: 6.7, restingHr: 60, weight: null, screenHours: null });
    expect(await tool('health_today').run({}, os)).toMatchObject({ steps: '4,200', sleep: '6h 42m', restingHeartRate: '60 bpm' });
    expect(sleepNights(os, isoDay(Date.now() - DAY), isoDay(Date.now()))).toHaveLength(1);
    const w = workoutsIn(os, 7);
    expect(w).toMatchObject({ count: 2, minutes: 90 });
    expect(w.byKind.map((k) => k.kind)).toEqual(['strength', 'walk']);
    expect(await tool('workouts').run({ days: 7 }, os)).toMatchObject({ count: 2, byKind: [{ kind: 'Strength' }, { kind: 'Walk' }] });
  });

  it('metric_compare in words, and log_measurement fills the unit from the metric', async () => {
    readings('sleep', 14, (i) => (i < 7 ? 7 : 6));
    expect(await tool('metric_compare').run({ metric: 'sleep' }, os)).toMatchObject({ metric: 'Sleep', vsLastWeek: '+17%' });
    const r = (await tool('log_measurement').run({ metric: 'weight', value: 72.4 }, os)) as { id: string };
    expect(os.records.get<MeasurementData>(r.id)).toMatchObject({ title: 'Weight', subtitle: '72.4 kg', data: { unit: 'kg', date: isoDay(Date.now()) } });
  });
});

describe('the brain: a weigh-in is due', () => {
  const weigh = (daysAgo: number, source?: string) => os.records.create<MeasurementData>({ object: 'measurement', data: { metric: 'weight', value: 72, date: dayAgo(daysAgo), ...(source ? { source } : {}) } });

  it('offers one when you weigh yourself by hand and it has been twice your usual gap', () => {
    for (const d of [30, 23, 16]) weigh(d); // every week, last 16 days ago
    const [c] = healthBrain.candidates(os, NOW);
    expect(c).toMatchObject({ key: `health:weigh:${dayAgo(16)}`, kind: 'due', shape: 'ask', yes: 'Log weight', record: { days_since_weigh_in: 16, usual_gap_days: 7 } });
    expect(Object.values(c!.record)).not.toContain(72);
    expect(healthBrain.act!(os, 'yes', {} as never)).toEqual({ open: '/entity/measurement/new?metric=weight' });
  });

  it('not when it is recent, nor for Health Connect’s readings alone', () => {
    for (const d of [20, 13, 6]) weigh(d);
    expect(healthBrain.candidates(os, NOW)).toEqual([]);
    os.db.run(`DELETE FROM records`);
    for (const d of [40, 30, 20]) weigh(d, 'health_connect');
    expect(healthBrain.candidates(os, NOW)).toEqual([]);
  });
});
