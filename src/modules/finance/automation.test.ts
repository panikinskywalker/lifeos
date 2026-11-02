import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { accountType, subscriptionType, transactionType } from './types';
import { postDueSubscriptions } from './lib';
import { financeModule } from '.';

/** Finance's automation templates (R10): Big spend flag and Subscription auto-post, saved and run as rules. */

const mod: ModuleManifest = { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', objects: [accountType, transactionType, subscriptionType], actions: financeModule.actions, templates: financeModule.templates };
let os: LifeOSContext;
let sent: string[];
beforeEach(async () => {
  bus.clear();
  sent = [];
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry(), notify: async (n) => (sent.push(`${n.title} · ${n.body ?? ''}`), null) });
});
afterEach(() => os.db.close());

const use = (id: string) => {
  const t = os.automation.templates().find((x) => x.id === id)!;
  return os.automation.rules.save({ name: t.name, enabled: true, trigger: t.trigger, conditions: t.conditions, steps: t.steps });
};
const settle = () => new Promise((r) => setTimeout(r, 20));

describe('finance templates', () => {
  it('Big spend flag: an expense over ₹10,000 is tagged and gets a reminder; Undo takes both back', async () => {
    const rule = use('finance.bigSpend');
    const small = os.records.create({ object: 'transaction', data: { amount: 450, kind: 'expense', merchant: 'Swiggy', date: '2026-11-02' } });
    const big = os.records.create({ object: 'transaction', data: { amount: 42000, kind: 'expense', merchant: 'Croma', date: '2026-11-02' } });
    await settle();
    expect(os.tags.forEntity(small.id)).toHaveLength(0);
    expect(os.tags.forEntity(big.id).map((t) => t.name)).toEqual(['review']);
    expect(os.reminders.upcoming(10).map((r) => r.title)).toContain('Review: Croma (₹42000)');
    const run = os.automation.rules.runs(rule.id).find((r) => r.status === 'ok')!;
    expect((await os.automation.undoRun(run.id)).undone).toBe(2);
    expect(os.tags.forEntity(big.id)).toHaveLength(0);
  });

  it('Subscription auto-post: a posted bill is tagged and you are told', async () => {
    use('finance.subscriptionPosted');
    os.records.create({ object: 'subscription', data: { name: 'Netflix', amount: 649, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: '2026-11-01' }, status: 'active' });
    os.records.create({ object: 'transaction', data: { amount: 300, kind: 'expense', merchant: 'Uber', date: '2026-11-02' } });
    expect(postDueSubscriptions(os, '2026-11-02')).toBe(1);
    await settle();
    expect(sent).toEqual(['Netflix renewed · ₹649 posted for 2026-11-01']);
    const posted = os.records.query<{ merchant: string }>('transaction').find((t) => t.data.merchant === 'Netflix')!;
    expect(os.tags.forEntity(posted.id).map((t) => t.name)).toEqual(['subscription']);
  });

  it('Create transaction hands its id on and can be undone', async () => {
    const rule = os.automation.rules.save({ name: 'Log', enabled: true, trigger: { id: 'core.manual', config: {} }, conditions: [], steps: [{ action: 'finance.createTransaction', config: { amount: 120, merchant: 'Chai' } }, { action: 'core.addTag', config: { tag: 'auto' } }] });
    const run = await os.automation.runManual(rule);
    expect(run.steps[0]!.output).toMatchObject({ amount: 120 });
    const id = run.steps[0]!.output.id as string;
    expect(os.records.get(id)).toBeTruthy();
    await os.automation.undoRun(run.id);
    expect(os.records.get(id)).toBeFalsy();
  });
});
