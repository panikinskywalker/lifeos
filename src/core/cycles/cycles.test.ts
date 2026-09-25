import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { LifeOSContext } from '../registry/context';
import type { ModuleManifest } from '../registry/types';
import { bus } from '../events/bus';
import { addPeriod, cycleStatus, describeCycle, nextAfterDone, nextAfterSkip } from './schedule';

const d = (s: string) => new Date(`${s}T10:00:00`).getTime();
const day = (at: number | null) => (at == null ? null : new Date(at).toISOString().slice(0, 10));

describe('schedule (pure)', () => {
  it('adds calendar periods, clamping month ends', () => {
    expect(day(addPeriod(d('2026-01-31'), 1, 'month'))).toBe('2026-02-28');
    expect(day(addPeriod(d('2026-01-10'), 4, 'day'))).toBe('2026-01-14');
    expect(day(addPeriod(d('2026-01-10'), 2, 'week'))).toBe('2026-01-24');
    expect(day(addPeriod(d('2024-02-29'), 1, 'year'))).toBe('2025-02-28');
  });

  it('interval rolls from the done date; fixed keeps its calendar', () => {
    expect(day(nextAfterDone({ kind: 'interval', everyN: 4, everyUnit: 'day' }, d('2026-03-10'), null, d('2026-03-08')).nextDueAt)).toBe('2026-03-14');
    // Jio every 84 days, due 1 Mar, paid 3 Mar → still renews 84 days after 1 Mar.
    expect(day(nextAfterDone({ kind: 'fixed', everyN: 84, everyUnit: 'day' }, d('2026-03-03'), null, d('2026-03-01')).nextDueAt)).toBe('2026-05-24');
    // One-off fixed date (passport): done means finished.
    expect(nextAfterDone({ kind: 'fixed' }, d('2026-03-03'), null, d('2026-03-01')).nextDueAt).toBeNull();
  });

  it('meter and whichever-first', () => {
    const r = { kind: 'either' as const, everyN: 6, everyUnit: 'month' as const, meterEvery: 10000 };
    const due = nextAfterDone(r, d('2026-01-15'), 29000, null);
    expect(day(due.nextDueAt)).toBe('2026-07-15');
    expect(due.nextDueMeter).toBe(39000);
    // Meter hits first: overdue although the date is months away.
    const s = cycleStatus({ ...r, ...due, lastDoneAt: d('2026-01-15'), lastMeter: 29000 }, d('2026-03-01'), 39100);
    expect(s.state).toBe('overdue');
    expect(s.bucket).toBe('overdue');
    expect(s.meterLeft).toBe(-100);
    expect(describeCycle(r)).toBe('every 6 months or 10,000 km');
  });

  it('status buckets and states', () => {
    const base = { kind: 'interval' as const, everyN: 30, everyUnit: 'day' as const, lastDoneAt: d('2026-03-01') };
    const at = (due: string, now: string, extra = {}) => cycleStatus({ ...base, nextDueAt: d(due), nextDueMeter: null, ...extra }, d(now), null);
    expect(at('2026-03-31', '2026-04-02')).toMatchObject({ state: 'overdue', bucket: 'overdue', daysLeft: -2 });
    expect(at('2026-03-31', '2026-03-31')).toMatchObject({ state: 'today', bucket: 'week', daysLeft: 0 });
    expect(at('2026-03-31', '2026-03-29')).toMatchObject({ state: 'soon', bucket: 'week' });
    expect(at('2026-03-31', '2026-03-15')).toMatchObject({ state: 'ok', bucket: 'month' });
    expect(at('2026-05-31', '2026-03-15')).toMatchObject({ state: 'ok', bucket: 'later' });
    expect(at('2026-03-31', '2026-04-02', { snoozedUntil: d('2026-04-05') })).toMatchObject({ state: 'snoozed', bucket: 'week' });
    expect(at('2026-03-31', '2026-03-16').progress).toBeCloseTo(0.5, 1);
  });

  it('skip moves both targets on by a period', () => {
    const r = { kind: 'either' as const, everyN: 1, everyUnit: 'year' as const, meterEvery: 5000 };
    const s = nextAfterSkip(r, { nextDueAt: d('2026-06-01'), nextDueMeter: 20000 }, d('2026-05-01'));
    expect(day(s.nextDueAt)).toBe('2027-06-01');
    expect(s.nextDueMeter).toBe(25000);
  });
});

const things: ModuleManifest = {
  id: 'test-things', name: 'Things', version: '1.0.0', description: 't', icon: 'x', color: '#000',
  entityTypes: [{ type: 'car', module: 'test-things', label: 'Car', labelPlural: 'Cars', icon: 'x', schema: z.object({ name: z.string() }), fields: [{ key: 'name', label: 'Name', type: 'text' }], computeTitle: (x) => String(x.name) }],
};

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [things], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('CycleRepo', () => {
  it('markDone rolls the cycle, logs history, records the meter; undo restores', () => {
    const car = os.entities.create({ type: 'car', data: { name: 'Creta' } });
    const c = os.cycles.create({ entityId: car.id, name: 'Service', kind: 'either', everyN: 6, everyUnit: 'month', meterEvery: 10000, lastDoneAt: d('2026-01-15'), lastMeter: 29000 });
    expect(day(c.nextDueAt)).toBe('2026-07-15');
    expect(c.nextDueMeter).toBe(39000);

    const ev = os.cycles.markDone(c.id, { at: d('2026-06-20'), meter: 37500, cost: 6400, note: 'Hyundai Indiranagar' });
    const after = os.cycles.get(c.id)!;
    expect(day(after.nextDueAt)).toBe('2026-12-20');
    expect(after.nextDueMeter).toBe(47500);
    expect(os.cycles.latestMeter(car.id)).toBe(37500);
    expect(os.entities.timeline.forEntity(car.id).some((e) => e.kind === 'cycle.done' && e.meta.cost === 6400)).toBe(true);

    const st = os.cycles.stats(c.id);
    expect(st).toMatchObject({ count: 1, totalCost: 6400, onTimeRate: 1 });

    os.cycles.undoDone(ev);
    const undone = os.cycles.get(c.id)!;
    expect(day(undone.nextDueAt)).toBe('2026-07-15');
    expect(undone.lastMeter).toBe(29000);
    expect(os.cycles.latestMeter(car.id)).toBeNull();
    expect(os.cycles.stats(c.id).count).toBe(0);
  });

  it('meter-only cycles start from the latest reading', () => {
    const car = os.entities.create({ type: 'car', data: { name: 'City' } });
    os.db.run(`INSERT INTO meter_readings(id,entity_id,meter,value,read_at,created_at,updated_at) VALUES ('r1',?,'odometer',12000,1,1,1)`, [car.id]);
    const c = os.cycles.create({ entityId: car.id, name: 'Tyre rotation', kind: 'meter', meterEvery: 8000 });
    expect(c.nextDueMeter).toBe(20000);
    expect(os.cycles.status(c).meterLeft).toBe(8000);
  });

  it('stats: average interval, late share; snooze, setNextDue, skip, remove', () => {
    const car = os.entities.create({ type: 'car', data: { name: 'Laundry' } });
    const c = os.cycles.create({ entityId: car.id, name: 'Laundry', kind: 'interval', everyN: 4, everyUnit: 'day', nextDueAt: d('2026-03-04') });
    os.cycles.markDone(c.id, { at: d('2026-03-04') });
    os.cycles.markDone(c.id, { at: d('2026-03-10') }); // due 8th → late
    os.cycles.markDone(c.id, { at: d('2026-03-14') });
    const st = os.cycles.stats(c.id);
    expect(st.count).toBe(3);
    expect(st.avgIntervalDays).toBe(5);
    expect(st.onTimeRate).toBeCloseTo(2 / 3);

    os.cycles.snooze(c.id, d('2026-03-20'));
    expect(os.cycles.get(c.id)!.snoozedUntil).toBe(d('2026-03-20'));
    os.cycles.setNextDue(c.id, { nextDueAt: d('2026-03-30') });
    expect(os.cycles.get(c.id)!).toMatchObject({ nextDueAt: d('2026-03-30'), snoozedUntil: null });
    os.cycles.skip(c.id);
    expect(day(os.cycles.get(c.id)!.nextDueAt)).toBe('2026-04-03');
    expect(os.cycles.all().map((x) => x.id)).toEqual([c.id]);
    os.cycles.remove(c.id);
    expect(os.cycles.all()).toEqual([]);
    os.cycles.restore(c.id);
    expect(os.cycles.forEntity(car.id)).toHaveLength(1);
  });

  it('cycles on deleted records drop out of Upkeep', () => {
    const car = os.entities.create({ type: 'car', data: { name: 'Old' } });
    os.cycles.create({ entityId: car.id, name: 'Wash', kind: 'interval', everyN: 2, everyUnit: 'week' });
    expect(os.cycles.all()).toHaveLength(1);
    os.entities.delete(car.id);
    expect(os.cycles.all()).toHaveLength(0);
  });
});
