import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { accountType, subscriptionType, transactionType } from './types';
import { postDueSubscriptions } from './lib';

const mod: ModuleManifest = { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [accountType, transactionType, subscriptionType] };
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('subscriptions × cycles', () => {
  it('auto-post files the expense, logs the renewal as done and rolls both dates', () => {
    const s = os.entities.create({ type: 'subscription', data: { name: 'Jio', amount: 399, rrule: 'FREQ=DAILY;INTERVAL=28', nextBillingAt: '2026-09-01' }, status: 'active' });
    const renewal = os.cycles.forEntity(s.id)[0]!;
    expect(postDueSubscriptions(os, '2026-09-20')).toBe(1);
    expect(os.entities.get<{ nextBillingAt: string }>(s.id)!.data.nextBillingAt).toBe('2026-09-29');
    const c = os.cycles.get(renewal.id)!;
    expect(new Date(c.nextDueAt!).getDate()).toBe(29);
    expect(os.cycles.stats(renewal.id)).toMatchObject({ count: 1, totalCost: 399 });
    expect(os.entities.query('transaction')).toHaveLength(1);
    expect(postDueSubscriptions(os, '2026-09-20')).toBe(0);
  });

  it('paid by hand in Upkeep: the billing date moves, so auto-post does not charge twice', () => {
    const s = os.entities.create({ type: 'subscription', data: { name: 'Gym', amount: 1500, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-09-10' }, status: 'active' });
    const renewal = os.cycles.forEntity(s.id)[0]!;
    os.cycles.markDone(renewal.id, { at: new Date('2026-09-09T12:00:00').getTime() });
    expect(os.entities.get<{ nextBillingAt: string }>(s.id)!.data.nextBillingAt).toBe('2026-10-10');
    expect(postDueSubscriptions(os, '2026-09-20')).toBe(0);
  });

  it('auto-post off leaves it due; cancelling takes it out of Upkeep', () => {
    const s = os.entities.create({ type: 'subscription', data: { name: 'Netflix', amount: 649, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-09-05', autoPost: false }, status: 'active' });
    expect(postDueSubscriptions(os, '2026-09-20')).toBe(0);
    expect(os.cycles.all()).toHaveLength(1);
    os.entities.setStatus(s.id, 'cancelled');
    expect(os.cycles.all()).toHaveLength(0);
    os.entities.setStatus(s.id, 'active');
    expect(os.cycles.all()).toHaveLength(1);
  });
});
