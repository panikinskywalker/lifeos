import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { LifeOSContext } from '../registry/context';
import type { ModuleManifest } from '../registry/types';
import { bus } from '../events/bus';
import { addPeriod, cycleStatus, dateField, describeCycle, nextAfterDone, nextAfterSkip, nextAnnual, periodFromRRule } from './schedule';

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
  objects: [
    { type: 'car', module: 'test-things', label: 'Car', labelPlural: 'Cars', icon: 'x', schema: z.object({ name: z.string() }), fields: [{ key: 'name', label: 'Name', type: 'text' }], computeTitle: (x) => String(x.name) },
    {
      type: 'van', module: 'test-things', label: 'Van', labelPlural: 'Vans', icon: 'x',
      schema: z.object({ name: z.string(), odometerKm: z.number().optional() }),
      fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'odometerKm', label: 'Odometer (km)', type: 'number' }],
      computeTitle: (x) => String(x.name),
      meters: [{ meter: 'odometer', field: 'odometerKm', label: 'Odometer', unit: 'km' }],
    },
    {
      type: 'chore', module: 'test-things', label: 'Chore', labelPlural: 'Chores', icon: 'x',
      schema: z.object({ name: z.string(), last: z.string().optional() }),
      fields: [],
      computeTitle: (x) => String(x.name),
      cycleFields: { 'chore.cycle': { lastDoneAt: 'last' } },
      cycleTemplates: (x) => [{ template: 'chore.cycle', name: String(x.name), kind: 'interval', everyN: 4, everyUnit: 'day', lastDoneAt: dateField(x.last) }],
    },
    {
      type: 'sub', module: 'test-things', label: 'Sub', labelPlural: 'Subs', icon: 'x',
      schema: z.object({ name: z.string(), rrule: z.string(), next: z.string().optional() }),
      fields: [{ key: 'name', label: 'Name', type: 'text' }],
      computeTitle: (x) => String(x.name),
      cycleTemplates: (x) => [{ template: 'sub.renewal', name: 'Renewal', kind: 'fixed', ...periodFromRRule(x.rrule), nextDueAt: dateField(x.next) }],
    },
  ],
};

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [things], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('CycleRepo', () => {
  it('markDone rolls the cycle, logs history, records the meter; undo restores', () => {
    const car = os.records.create({ type: 'car', data: { name: 'Creta' } });
    const c = os.cycles.create({ entityId: car.id, name: 'Service', kind: 'either', everyN: 6, everyUnit: 'month', meterEvery: 10000, lastDoneAt: d('2026-01-15'), lastMeter: 29000 });
    expect(day(c.nextDueAt)).toBe('2026-07-15');
    expect(c.nextDueMeter).toBe(39000);

    const ev = os.cycles.markDone(c.id, { at: d('2026-06-20'), meter: 37500, cost: 6400, note: 'Hyundai Indiranagar' });
    const after = os.cycles.get(c.id)!;
    expect(day(after.nextDueAt)).toBe('2026-12-20');
    expect(after.nextDueMeter).toBe(47500);
    expect(os.cycles.latestMeter(car.id)).toBe(37500);
    expect(os.records.timeline.forEntity(car.id).some((e) => e.kind === 'cycle.done' && e.meta.cost === 6400)).toBe(true);

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
    const car = os.records.create({ type: 'car', data: { name: 'City' } });
    os.db.run(`INSERT INTO meter_readings(id,entity_id,meter,value,read_at,created_at,updated_at) VALUES ('r1',?,'odometer',12000,1,1,1)`, [car.id]);
    const c = os.cycles.create({ entityId: car.id, name: 'Tyre rotation', kind: 'meter', meterEvery: 8000 });
    expect(c.nextDueMeter).toBe(20000);
    expect(os.cycles.status(c).meterLeft).toBe(8000);
  });

  it('stats: average interval, late share; snooze, setNextDue, skip, remove', () => {
    const car = os.records.create({ type: 'car', data: { name: 'Laundry' } });
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
    const car = os.records.create({ type: 'car', data: { name: 'Old' } });
    os.cycles.create({ entityId: car.id, name: 'Wash', kind: 'interval', everyN: 2, everyUnit: 'week' });
    expect(os.cycles.all()).toHaveLength(1);
    os.records.delete(car.id);
    expect(os.cycles.all()).toHaveLength(0);
  });

  it('new records get their type\'s default cycles once; a deleted default is not re-added', () => {
    const jio = os.records.create({ type: 'sub', data: { name: 'Jio', rrule: 'FREQ=DAILY;INTERVAL=84', next: '2026-10-01' } });
    const [c] = os.cycles.forEntity(jio.id);
    expect(c).toMatchObject({ name: 'Renewal', kind: 'fixed', everyN: 84, everyUnit: 'day', template: 'sub.renewal' });
    expect(day(c!.nextDueAt)).toBe('2026-10-01');
    os.cycles.remove(c!.id);
    os.cycles.applyTemplates(jio, os.registry.objects.get('sub'));
    expect(os.cycles.forEntity(jio.id)).toHaveLength(0);
  });
});

describe('template helpers', () => {
  it('parses rrules, date fields and the next birthday', () => {
    expect(periodFromRRule('FREQ=MONTHLY;INTERVAL=3')).toEqual({ everyN: 3, everyUnit: 'month' });
    expect(periodFromRRule('FREQ=YEARLY')).toEqual({ everyN: 1, everyUnit: 'year' });
    expect(periodFromRRule('nope')).toBeNull();
    expect(dateField('')).toBeNull();
    expect(day(nextAnnual('1990-03-20', d('2026-05-01')))).toBe('2027-03-20');
    expect(day(nextAnnual('1990-06-20', d('2026-05-01')))).toBe('2026-06-20');
  });
});

describe('backfill', () => {
  it('records created before templates existed get them on the next boot, once', async () => {
    const db = createBetterSqliteAdapter(':memory:');
    const plain: ModuleManifest = { ...things, objects: things.objects!.map((t) => ({ ...t, cycleTemplates: undefined })) };
    bus.clear();
    const first = await createLifeOS({ db, modules: [plain], registry: new Registry() });
    first.settings.set('cycles.templatesBackfilled', false);
    const s = first.records.create({ type: 'sub', data: { name: 'Netflix', rrule: 'FREQ=MONTHLY;INTERVAL=1', next: '2026-10-05' } });
    expect(first.cycles.forEntity(s.id)).toHaveLength(0);
    bus.clear();
    const second = await createLifeOS({ db, modules: [things], registry: new Registry() });
    expect(second.cycles.forEntity(s.id)).toHaveLength(1);
    bus.clear();
    const third = await createLifeOS({ db, modules: [things], registry: new Registry() });
    expect(third.cycles.forEntity(s.id)).toHaveLength(1);
    db.close();
  });

  it('an odometer typed before readings existed becomes the first reading', async () => {
    const db = createBetterSqliteAdapter(':memory:');
    const plain: ModuleManifest = { ...things, objects: things.objects!.map((t) => ({ ...t, meters: undefined })) };
    bus.clear();
    const first = await createLifeOS({ db, modules: [plain], registry: new Registry() });
    first.settings.set('meters.backfilled', false);
    const van = first.records.create({ type: 'van', data: { name: 'Creta', odometerKm: 28500 } });
    expect(first.cycles.latestMeter(van.id)).toBeNull();
    bus.clear();
    const second = await createLifeOS({ db, modules: [things], registry: new Registry() });
    expect(second.cycles.latestMeter(van.id)).toBe(28500);
    db.close();
  });
});

describe('meter readings', () => {
  it('the odometer field and readings stay in step; cycles use the latest; undo reverts', () => {
    const van = os.records.create({ type: 'van', data: { name: 'Creta', odometerKm: 30000 } });
    expect(os.cycles.latestMeter(van.id)).toBe(30000);
    const svc = os.cycles.create({ entityId: van.id, name: 'Service', kind: 'either', everyN: 6, everyUnit: 'month', meterEvery: 10000, nextDueMeter: 34000 });

    const r = os.cycles.logMeter(van.id, 34200, { unit: 'km' });
    expect(os.records.get(van.id)!.data).toMatchObject({ odometerKm: 34200 });
    expect(os.cycles.status(svc).state).toBe('overdue');
    expect(os.records.timeline.forEntity(van.id).some((e) => e.kind === 'meter.reading' && e.title === 'Odometer 34,200 km')).toBe(true);
    expect(os.cycles.readings(van.id).map((x) => x.value)).toEqual([34200, 30000]);

    os.cycles.removeReading(r);
    expect(os.cycles.latestMeter(van.id)).toBe(30000);
    expect(os.records.get(van.id)!.data).toMatchObject({ odometerKm: 30000 });
    expect(os.records.timeline.forEntity(van.id).some((e) => e.title === 'Odometer 34,200 km')).toBe(false);

    // Typing a new value in the form records a reading, once.
    os.records.update(van.id, { data: { odometerKm: 31000 } });
    expect(os.cycles.readings(van.id).map((x) => x.value)).toEqual([31000, 30000]);
    // Timeline says the field's label, not its key.
    expect(os.records.timeline.forEntity(van.id).some((e) => e.title === 'Updated Odometer (km)')).toBe(true);
  });
});

describe('template sync', () => {
  it('edits follow into the cycle; a rolled due date survives unrelated edits', () => {
    const sub = os.records.create({ type: 'sub', data: { name: 'Jio', rrule: 'FREQ=DAILY;INTERVAL=84', next: '2026-10-01' } });
    const id = os.cycles.forEntity(sub.id)[0]!.id;
    os.records.update(sub.id, { data: { rrule: 'FREQ=DAILY;INTERVAL=28' } });
    expect(os.cycles.get(id)).toMatchObject({ everyN: 28, everyUnit: 'day' });
    expect(day(os.cycles.get(id)!.nextDueAt)).toBe('2026-10-01');

    os.records.update(sub.id, { data: { next: '2026-10-09' } });
    expect(day(os.cycles.get(id)!.nextDueAt)).toBe('2026-10-09');

    os.cycles.markDone(id, { at: d('2026-10-09') });
    expect(day(os.cycles.get(id)!.nextDueAt)).toBe('2026-11-06');
    os.records.update(sub.id, { data: { name: 'Jio Fiber' } });
    expect(day(os.cycles.get(id)!.nextDueAt)).toBe('2026-11-06');
  });
});

describe('last done on the record', () => {
  it('moving the record’s last-done date forward logs a done; done in Upkeep writes the date back', () => {
    const c = os.records.create({ type: 'chore', data: { name: 'Laundry', last: '2026-09-01' } });
    const cyc = os.cycles.forEntity(c.id)[0]!;
    expect(day(cyc.nextDueAt)).toBe('2026-09-05');
    os.records.update(c.id, { data: { last: '2026-09-10' } });
    expect(os.cycles.stats(cyc.id).count).toBe(1);
    expect(day(os.cycles.get(cyc.id)!.nextDueAt)).toBe('2026-09-14');
    os.cycles.markDone(cyc.id, { at: d('2026-09-15') });
    expect(os.records.get<{ last: string }>(c.id)!.data.last).toBe('2026-09-15');
    expect(os.cycles.stats(cyc.id).count).toBe(2);
  });
});
