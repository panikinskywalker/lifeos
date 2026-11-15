import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '@modules/crm';
import { financeModule } from '@modules/finance';
import { financeAiTools } from '@modules/finance/aiTools';
import { maskPeople, personToken, roundMoney, unmask } from './privacy';

/** The privacy gate (docs/MODEL.md, 15 Nov). */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('the privacy gate', () => {
  it('rounds money and gives each person one placeholder, put back on the phone', () => {
    expect([roundMoney(147), roundMoney(4_309.37), roundMoney(86_149)]).toEqual([150, 4_300, 86_100]);
    const a = personToken(os, 'Priya Sharma');
    expect(personToken(os, 'priya sharma')).toBe(a);
    expect(personToken(os, 'Arjun')).not.toBe(a);
    expect(maskPeople(os, 'How much did I send Priya in October?', ['Priya Sharma', 'Arjun'])).toBe(`How much did I send ${a} in October?`);
    expect(unmask(os, `You sent ${a} ₹2,600.`)).toBe('You sent Priya Sharma ₹2,600.');
  });

  it("Ask Money's figures leave the phone rounded, with people as placeholders and shops by name", async () => {
    const priya = os.records.create({ object: 'person', title: 'Priya Sharma', data: {} });
    for (const [title, amount] of [['Priya Sharma', 2_613.5], ['Swiggy', 449]] as const) {
      const t = os.records.create({ object: 'transaction', title, data: { amount, kind: 'expense', category: 'food', date: new Date().toISOString().slice(0, 10), merchant: title } });
      if (title === 'Priya Sharma') os.links.link(t.id, priya.id, 'person', {}, 'assistant');
    }
    const tool = financeAiTools.find((x) => x.name === 'money_query')!;
    const out = (await tool.run({ measure: 'spent', period: 'month' }, os)) as { total: number; payments: Array<{ payee: string; amount: number }> };
    expect(out.total).toBe(3_100);
    expect(out.payments.map((p) => [p.payee, p.amount]).sort()).toEqual([['Person 1', 2_600], ['Swiggy', 450]]);
    const filtered = (await tool.run({ measure: 'spent', period: 'month', payee: 'Person 1' }, os)) as { total: number };
    expect(filtered.total).toBe(2_600);
  });
});
