/**
 * Almanac (M4.4, PRODUCT v4 §5 flow 9): sections with counts, the Time view
 * over a day / month / year, and "On this day".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { almanacSections, onThisDay, periodOf, periodSummary } from '@core/almanac/almanac';
import { saveHealthDays, saveUsageDays } from '@core/sources/deviceData';
import { measurementType, workoutType } from './health/types';
import { accountType, transactionType } from './finance/types';
import { personType } from './crm/types';
import { eventType } from './projects/types';
import { tripType } from './travel/types';

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [{ id: 'm', name: 'm', version: '1', description: '', icon: 'x', color: '#000', objects: [measurementType, workoutType, accountType, transactionType, personType, eventType, tripType] }], registry: new Registry() });
});
afterEach(() => os.db.close());

const at = (d: string, h = 12) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime();
const spend = (date: string, amount: number, category: string, kind = 'expense') => os.records.create({ type: 'transaction', data: { amount, kind, category, date } });

describe('Almanac', () => {
  it('sections list the installed types with counts; Mind counts dumps and facts', () => {
    os.records.create({ type: 'person', data: { name: 'Kendal' } });
    spend('2026-09-02', 100, 'food');
    os.dumps.add({ body: 'met Kendal' });
    os.facts.add({ text: 'Kendal likes pink', source: 'dump' });
    const s = almanacSections(os);
    expect(s.map((x) => x.id)).toEqual(['people', 'things', 'money', 'body', 'mind', 'places', 'time']);
    expect(s.find((x) => x.id === 'people')!.rows).toEqual([{ type: 'person', label: 'People', icon: expect.any(String), count: 1 }]);
    expect(s.find((x) => x.id === 'money')!.rows.map((r) => [r.type, r.count])).toEqual([['transaction', 1], ['account', 0]]);
    expect(s.find((x) => x.id === 'things')!.rows).toEqual([]);
    expect(s.find((x) => x.id === 'mind')!.total).toBe(2);
  });

  it('periods: a day, a month, a year, with neighbours', () => {
    expect(periodOf('month', '2026-03-17', '2026-09-26')).toMatchObject({ from: '2026-03-01', to: '2026-03-31', label: 'March 2026', prev: '2026-02-01', next: '2026-04-01', current: false });
    expect(periodOf('month', '2026-09-03', '2026-09-26').current).toBe(true);
    expect(periodOf('day', '2026-03-01', '2026-09-26')).toMatchObject({ from: '2026-03-01', to: '2026-03-01', label: 'Sunday, 1 March 2026', prev: '2026-02-28' });
    expect(periodOf('year', '2025-06-01', '2026-09-26')).toMatchObject({ from: '2025-01-01', to: '2025-12-31', label: '2025', current: false });
  });

  it('Time › March: spend by category, health averages, screen time, events, trips, dumps, new people', () => {
    spend('2026-03-02', 400, 'food');
    spend('2026-03-09', 600, 'food');
    spend('2026-03-10', 2000, 'travel');
    spend('2026-03-11', 50000, 'salary', 'income');
    spend('2026-04-01', 999, 'food'); // next month
    saveHealthDays(os, [{ day: '2026-03-01', steps: 8000, sleepMin: 420 }, { day: '2026-03-02', steps: 6000, sleepMin: 360, weightKg: 71.2 }, { day: '2026-03-20', weightKg: 70.4 }]);
    saveUsageDays(os, [{ day: '2026-03-05', totalMs: 3 * 3_600_000, apps: [] }]);
    os.records.create({ type: 'workout', data: { kind: 'run', durationMin: 30, date: '2026-03-04' } });
    os.records.create({ type: 'event', title: 'Dinner with Kendal', data: { startAt: at('2026-03-09', 20) } });
    os.records.create({ type: 'trip', data: { destination: 'Goa', startDate: '2026-02-27', endDate: '2026-03-02' } });
    os.dumps.add({ body: 'great week', createdAt: at('2026-03-09') });
    os.dumps.add({ body: 'april thing', createdAt: at('2026-04-02') });
    const s = periodSummary(os, periodOf('month', '2026-03-15', '2026-09-26'));
    expect(s.spend).toMatchObject({ total: 3000, income: 50000, count: 3 });
    expect(s.spend.byCategory).toEqual([{ category: 'travel', total: 2000, count: 1 }, { category: 'food', total: 1000, count: 2 }]);
    expect(s.health).toMatchObject({ steps: 7000, sleep: 6.5, weight: 70.4, screen: 3 });
    expect(s.workouts).toEqual({ count: 1, minutes: 30 });
    expect(s.happened.map((e) => e.title).sort()).toEqual(['Dinner with Kendal', 'Goa']);
    expect(s.dumps.map((d) => d.body)).toEqual(['great week']);
    expect(s.days.find((d) => d.day === '2026-03-09')).toEqual({ day: '2026-03-09', spend: 600, dumps: 1, events: 1 });
    expect(s.empty).toBe(false);
    expect(periodSummary(os, periodOf('month', '2025-01-01')).empty).toBe(true);
  });

  it('On this day: a year ago and a month ago, only dates with something', () => {
    os.dumps.add({ body: 'first day at the new job\nlong story', createdAt: at('2025-09-26') });
    os.records.create({ type: 'event', title: 'Concert', data: { startAt: at('2026-08-26', 21) } });
    os.dumps.add({ body: 'unrelated', createdAt: at('2026-08-25') });
    const r = onThisDay(os, '2026-09-26');
    expect(r.map((x) => [x.ago, x.day])).toEqual([['1 month ago', '2026-08-26'], ['1 year ago', '2025-09-26']]);
    expect(r[1]!.items).toEqual([{ kind: 'dump', id: expect.any(String), title: 'first day at the new job' }]);
    expect(r[0]!.items[0]).toMatchObject({ kind: 'event', title: 'Concert' });
    // The 31st has no "a month ago" in a 30-day month.
    expect(onThisDay(os, '2026-10-31').some((x) => x.ago === '1 month ago')).toBe(false);
  });
});
