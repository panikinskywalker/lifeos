import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { metricSeries, peopleToCall, spendPace, upcoming } from '@core/dashboard/metrics';
import { saveHealthDays, saveUsageDays } from '@core/sources/deviceData';
import { measurementType, workoutType } from './health/types';
import { accountType, transactionType } from './finance/types';
import { personType } from './crm/types';
import { eventType } from './projects/types';

let os: LifeOSContext;
const NOW = Date.parse('2026-09-26T18:00:00');
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [{ id: 'm', name: 'm', version: '1', description: '', icon: 'x', color: '#000', objects: [measurementType, workoutType, accountType, transactionType, personType, eventType] }], registry: new Registry() });
});
afterEach(() => os.db.close());

const day = (n: number) => { const d = new Date(NOW); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

describe('Today metrics', () => {
  it('steps: week total vs the week before, one bar per day, gaps stay gaps', () => {
    saveHealthDays(os, [0, -1, -2, -8, -9].map((n, i) => ({ day: day(n), steps: [8000, 6000, 4000, 5000, 5000][i] })));
    const w = metricSeries(os, 'steps', 'week', NOW);
    expect(w.value).toBe(18000);
    expect(w.prev).toBe(10000);
    expect(w.change).toBeCloseTo(0.8);
    expect(w.buckets).toHaveLength(7);
    expect(w.buckets.map((b) => b.value)).toEqual([null, null, null, null, 4000, 6000, 8000]);
    expect(w.buckets.at(-1)!.label).toBe('S');
    const d = metricSeries(os, 'steps', 'day', NOW);
    expect([d.value, d.prev]).toEqual([8000, 6000]);
    expect(metricSeries(os, 'steps', 'year', NOW).buckets).toHaveLength(12);
  });

  it('sleep and screen time are per-day averages; nothing → null, not zero', () => {
    saveHealthDays(os, [{ day: day(0), sleepMin: 420 }, { day: day(-1), sleepMin: 360 }]);
    expect(metricSeries(os, 'sleep', 'week', NOW).value).toBeCloseTo(6.5);
    saveUsageDays(os, [{ day: day(0), totalMs: 4 * 3_600_000, apps: [] }, { day: day(-1), totalMs: 2 * 3_600_000, apps: [] }]);
    expect(metricSeries(os, 'screen', 'week', NOW).value).toBe(3);
    expect(metricSeries(os, 'weight', 'month', NOW)).toMatchObject({ value: null, change: null, daysWithData: 0 });
  });

  it('spend pace: this month so far vs your usual month by the same day', () => {
    const tx = (date: string, amount: number) => os.records.create({ object: 'transaction', data: { amount, kind: 'expense', category: 'food', date } });
    tx('2026-09-02', 1000);
    tx('2026-09-20', 500);
    tx('2026-08-10', 3000);
    tx('2026-07-05', 1000);
    tx('2026-06-28', 2000);
    const p = spendPace(os, NOW);
    expect(p.spent).toBe(1500);
    expect(p.thisMonth).toHaveLength(26);
    expect(p.usualByToday).toBeCloseTo((3000 + 1000 + 0) / 3);
    expect(p.usualMonth).toBeCloseTo(2000);
    expect(metricSeries(os, 'spend', 'month', NOW).value).toBe(1500);
  });

  it('upcoming: overdue first, then dues and events by time; people to call', () => {
    const k = os.records.create({ object: 'person', title: 'Kendal', data: { contactEvery: 14, lastContactAt: day(-20) } });
    os.records.create({ object: 'event', title: 'Dinner', data: { startAt: NOW + 86_400_000 } });
    const up = upcoming(os, 5, NOW);
    expect(up[0]).toMatchObject({ title: 'Kendal · Keep in touch', overdue: true });
    expect(up.map((u) => u.title)).toContain('Dinner');
    expect(peopleToCall(os, 4, NOW)).toEqual([{ entityId: k.id, title: 'Kendal', why: '6 d overdue', late: true }]);
  });
});
