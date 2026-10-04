import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { LifeOSContext } from '../registry/context';
import type { ModuleManifest } from '../registry/types';
import { bus } from '../events/bus';
import { logDone, undoLoggedDone, upkeep } from './upkeep';

const d = (s: string) => new Date(`${s}T10:00:00`).getTime();
const mod: ModuleManifest = {
  id: 'm', name: 'M', version: '1', description: '', icon: 'x', color: '#000',
  objects: [
    { type: 'transaction', module: 'm', label: 'Txn', labelPlural: 'Txns', icon: 'x', schema: z.object({ amount: z.number(), kind: z.string(), category: z.string(), merchant: z.string().optional(), date: z.string(), note: z.string().optional(), currency: z.string().optional() }), fields: [], computeTitle: (x) => String(x.merchant ?? 'Txn') },
    { type: 'subscription', module: 'm', label: 'Sub', labelPlural: 'Subs', icon: 'x', schema: z.object({ name: z.string() }), fields: [], computeTitle: (x) => String(x.name) },
    { type: 'routine', module: 'm', label: 'Routine', labelPlural: 'Routines', icon: 'x', schema: z.object({ name: z.string() }), fields: [], computeTitle: (x) => String(x.name) },
  ],
};

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('upkeep', () => {
  it('groups by bucket, filters by chip, totals this month', () => {
    const now = d('2026-09-10');
    const jio = os.records.create({ object: 'subscription', data: { name: 'Jio' } });
    const gym = os.records.create({ object: 'subscription', data: { name: 'Gym' } });
    const laundry = os.records.create({ object: 'routine', data: { name: 'Laundry' } });
    os.cycles.create({ entityId: jio.id, name: 'Renewal', kind: 'fixed', everyN: 84, everyUnit: 'day', nextDueAt: d('2026-09-13'), costEstimate: 399 });
    os.cycles.create({ entityId: gym.id, name: 'Renewal', kind: 'fixed', everyN: 3, everyUnit: 'month', nextDueAt: d('2026-11-20'), costEstimate: 4500 });
    os.cycles.create({ entityId: laundry.id, name: 'Laundry', kind: 'interval', everyN: 4, everyUnit: 'day', nextDueAt: d('2026-09-08') });

    const all = upkeep(os, 'All', now);
    expect(all.items.map((i) => i.entity.title)).toEqual(['Laundry', 'Jio', 'Gym']);
    expect(all.sections.overdue.map((i) => i.entity.title)).toEqual(['Laundry']);
    expect(all.sections.week.map((i) => i.entity.title)).toEqual(['Jio']);
    expect(all.sections.later.map((i) => i.entity.title)).toEqual(['Gym']);
    expect(all).toMatchObject({ overdue: 1, monthCost: 399, monthCostCount: 1 });
    expect(upkeep(os, 'Chores', now).items.map((i) => i.entity.title)).toEqual(['Laundry']);
    expect(upkeep(os, 'Vehicles', now).items).toEqual([]);
  });

  it('done with cost files a linked expense; undo removes both', () => {
    const jio = os.records.create({ object: 'subscription', data: { name: 'Jio' } });
    const c = os.cycles.create({ entityId: jio.id, name: 'Renewal', kind: 'fixed', everyN: 84, everyUnit: 'day', nextDueAt: d('2026-09-13') });
    const done = logDone(os, c.id, { cost: 399, asExpense: true, at: d('2026-09-13') });
    const tx = os.records.get(done.transactionId!)!;
    expect(tx.data).toMatchObject({ amount: 399, kind: 'expense', category: 'subscriptions', date: '2026-09-13', merchant: 'Jio · Renewal' });
    expect(os.links.targets(tx.id, 'subscription')).toEqual([jio.id]);
    expect(os.cycles.stats(c.id).totalCost).toBe(399);

    undoLoggedDone(os, done);
    expect(os.records.query('transaction').map((t) => t.id)).not.toContain(tx.id);
    expect(os.cycles.stats(c.id).count).toBe(0);
    expect(logDone(os, c.id, { cost: 399 }).transactionId).toBeNull();
  });
});

describe('week plan', () => {
  it('puts overdue on today and repeats short cycles inside the week', async () => {
    const { weekPlan, weekStartOf } = await import('./upkeep');
    const now = d('2026-09-23'); // Wednesday
    const monday = weekStartOf(now);
    expect(new Date(monday).getDay()).toBe(1);
    const laundry = os.records.create({ object: 'routine', data: { name: 'Laundry' } });
    const jio = os.records.create({ object: 'subscription', data: { name: 'Jio' } });
    os.cycles.create({ entityId: laundry.id, name: 'Laundry', kind: 'interval', everyN: 4, everyUnit: 'day', nextDueAt: d('2026-09-21') }); // 2 d late
    os.cycles.create({ entityId: jio.id, name: 'Renewal', kind: 'fixed', everyN: 84, everyUnit: 'day', nextDueAt: d('2026-09-26') });
    const days = weekPlan(os, monday, 'All', now);
    const names = days.map((es) => es.map((e) => `${e.entity.title}${e.projected ? '*' : ''}`));
    expect(names).toEqual([[], [], ['Laundry'], [], [], ['Jio'], ['Laundry*']]);
    expect(weekPlan(os, monday, 'Chores', now).flat()).toHaveLength(2);
  });
});
