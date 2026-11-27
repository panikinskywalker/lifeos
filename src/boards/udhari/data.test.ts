import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '@modules/crm';
import { financeModule, makeBill } from '@modules/finance';
import type { DebtData } from '@modules/finance/split';
import { udhariActivity, udhariGroups, udhariPeople } from './data';

/** Udhari's home (NR-Udhari-Home): who owes whom from shares and Bills, each group's net, what moved. */

let os: LifeOSContext;
let kalpak: string, yash: string, group: string;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule], registry: new Registry() });
  kalpak = os.records.create({ object: 'person', title: 'Kalpak Rao', data: {} }, 'user').id;
  yash = os.records.create({ object: 'person', title: 'Yash', data: {} }, 'user').id;
  group = os.records.create({ object: 'group', title: 'Japan trip', data: { name: 'Japan trip', kind: 'trip', memberIds: [kalpak] } }, 'user').id;
});
afterEach(() => os.db.close());
const debt = (personId: string, amount: number, date: string, direction: DebtData['direction'] = 'they_owe', reason = 'Turf at Wings') =>
  os.records.create<DebtData>({ object: 'debt', status: 'open', data: { personId, direction, amount, reason, date, kind: 'split' } });

describe('Udhari', () => {
  it('lists who owes you and whom you owe, with what for (the most money first) and how long the oldest share has been open', () => {
    debt(kalpak, 200, '2026-10-01');
    makeBill(os, 'Ramen', { amount: 1000, date: '2026-11-20', split: { payers: { me: 1000 }, method: 'equal', shares: { me: 1, [kalpak]: 1 } }, groupId: group });
    debt(yash, 450, '2026-11-14', 'i_owe');
    const p = udhariPeople(os, Date.parse('2026-11-27T12:00:00'));
    expect(p.owe).toMatchObject([{ personId: kalpak, amount: 700, tags: ['Ramen', 'Turf'], oldestDays: 57 }]);
    expect(p.owed).toMatchObject([{ personId: yash, amount: -450, oldestDays: null }]);
    expect(udhariGroups(os)).toMatchObject([{ id: group, title: 'Japan trip', net: 500 }]);
  });

  it('shows a game’s many shares as one line and a settle-up as a payment, newest first', () => {
    debt(kalpak, 200, '2026-11-14');
    debt(yash, 200, '2026-11-14');
    os.records.create<DebtData>({ object: 'debt', status: 'settled', data: { personId: kalpak, direction: 'i_owe', amount: 600, reason: 'Settled up', date: '2026-11-27', kind: 'payment' } });
    const a = udhariActivity(os);
    expect(a.map((r) => [r.title, Math.round(r.amount)])).toEqual([['Kalpak paid you', 600], ['Turf at Wings', 400]]);
    expect(a[1]!.sub).toBe('2 shares · 2 open');
  });
});
