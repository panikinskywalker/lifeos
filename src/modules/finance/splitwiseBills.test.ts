import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '../crm';
import { financeModule, makeBill, makePayment, type BillData } from '.';
import { linkPerson, setSwConfig, swConfig, syncSplitwise, type SplitwiseClient, type SwExpense } from './splitwise';

/**
 * A trip's Bills in a group mapped to a Splitwise group (MODEL.md, *Splitwise
 * and settling up*): they go there with who paid and each share, the first
 * sync matches what Splitwise already has, a change is made again, a delete
 * goes both ways, Splitwise's own expenses come in, and a Bill with someone not
 * linked waits. A made-up Splitwise stands in for the real one.
 */

const ME = 1, ANA = 2, BEN = 3, GROUP = 77;

class FakeSw {
  list: Array<SwExpense & { group_id: number | null }> = [];
  next = 500;
  made: Array<Record<string, string | number | boolean | undefined>> = [];
  async me() { return { id: ME, first_name: 'Sam' }; }
  async friends() { return [{ id: ANA, first_name: 'Ana', balance: [] }, { id: BEN, first_name: 'Ben', balance: [] }]; }
  async groups() { return [{ id: GROUP, name: 'Lisbon' }]; }
  async expenses() { return this.list.filter((e) => e.payment); }
  async groupExpenses(g: number) { return this.list.filter((e) => e.group_id === g); }
  async createExpense(p: Record<string, string | number | boolean | undefined>) {
    this.made.push(p);
    const users: SwExpense['users'] = [];
    for (let i = 0; p[`users__${i}__user_id`] != null; i++) users.push({ user_id: Number(p[`users__${i}__user_id`]), paid_share: String(p[`users__${i}__paid_share`]), owed_share: String(p[`users__${i}__owed_share`]) });
    const id = this.next++;
    this.list.push({ id, group_id: Number(p.group_id) || null, payment: !!p.payment, cost: String(p.cost), currency_code: String(p.currency_code), description: String(p.description), date: String(p.date), users });
    return id;
  }
  async deleteExpense(id: number) {
    const e = this.list.find((x) => x.id === id);
    if (e) e.deleted_at = '2026-11-18T12:00:00Z';
    return {};
  }
}

let os: LifeOSContext;
let sw: FakeSw;
let ana: string, ben: string, group: string;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule], registry: new Registry() });
  sw = new FakeSw();
  ana = os.records.create({ object: 'person', title: 'Ana', data: {} }, 'user').id;
  ben = os.records.create({ object: 'person', title: 'Ben', data: {} }, 'user').id;
  group = os.records.create({ object: 'group', title: 'Lisbon trip', data: { name: 'Lisbon trip', kind: 'trip', memberIds: [ana, ben] } }, 'user').id;
  linkPerson(os, ana, { id: ANA, name: 'Ana' }, 0);
  linkPerson(os, ben, { id: BEN, name: 'Ben' }, 0);
  setSwConfig(os, { groups: { [group]: GROUP } });
});
afterEach(() => os.db.close());
const run = () => syncSplitwise(os, sw as unknown as SplitwiseClient);

describe('a trip’s Bills, kept in step with a Splitwise group', () => {
  it('sends each Bill with who paid and each share; paybacks as payments; Splitwise’s own come in', async () => {
    makeBill(os, 'Dinner', { amount: 900, date: '2026-11-10', split: { payers: { me: 900 }, method: 'equal', shares: { me: 1, [ana]: 1, [ben]: 1 } }, groupId: group });
    makeBill(os, 'Tram', { amount: 1000, currency: 'JPY', date: '2026-11-11', split: { payers: { [ana]: 1000 }, method: 'equal', shares: { me: 1, [ana]: 1 } }, groupId: group });
    makePayment(os, ben, 'me', 300, { date: '2026-11-12', groupId: group });
    sw.list.push({ id: 9, group_id: GROUP, payment: false, cost: '600.00', currency_code: 'INR', description: 'Taxi (added on Splitwise)', date: '2026-11-13T12:00:00Z', users: [{ user_id: BEN, paid_share: '600.00', owed_share: '200.00' }, { user_id: ME, paid_share: '0.00', owed_share: '200.00' }, { user_id: ANA, paid_share: '0.00', owed_share: '200.00' }] });
    const r = await run();
    expect(r).toMatchObject({ billsSent: 3, billsMatched: 0, billsIn: 1, billsHeld: 0 });
    const dinner = sw.made.find((p) => p.description === 'Dinner')!;
    expect(dinner).toMatchObject({ cost: '900.00', group_id: GROUP, currency_code: 'INR', payment: false, users__0__user_id: '1', users__0__paid_share: '900.00', users__0__owed_share: '300.00' });
    expect(sw.made.find((p) => p.description === 'Tram')).toMatchObject({ currency_code: 'JPY', cost: '1000.00' });
    expect(sw.made.find((p) => p.description === 'Ben paid You')).toMatchObject({ payment: true, cost: '300.00' });
    const taxi = os.records.query<BillData>('bill', {}, { limit: 10 }).find((b) => b.title === 'Taxi (added on Splitwise)')!;
    expect(taxi.data).toMatchObject({ amount: 600, groupId: group, split: { payers: { [ben]: 600 }, method: 'exact' } });
    // A second sync: nothing new either way.
    expect(await run()).toMatchObject({ billsSent: 0, billsIn: 0 });
    expect(sw.made).toHaveLength(3);
  });

  it('the first sync matches what Splitwise already has instead of doubling it', async () => {
    const b = makeBill(os, 'Hostel', { amount: 4200, date: '2026-11-08', split: { payers: { me: 4200 }, method: 'equal', shares: { me: 1, [ana]: 1, [ben]: 1 } }, groupId: group });
    sw.list.push({ id: 41, group_id: GROUP, payment: false, cost: '4200.00', currency_code: 'INR', description: 'Hostel advance', date: '2026-11-09T12:00:00Z', users: [{ user_id: ME, paid_share: '4200.00', owed_share: '1400.00' }, { user_id: ANA, paid_share: '0.00', owed_share: '1400.00' }, { user_id: BEN, paid_share: '0.00', owed_share: '1400.00' }] });
    const r = await run();
    expect(r).toMatchObject({ billsSent: 0, billsMatched: 1, billsIn: 0 });
    expect(swConfig(os).bills?.[b.id]?.id).toBe(41);
  });

  it('a change is made again there; a delete goes both ways', async () => {
    const b = makeBill(os, 'Museum', { amount: 400, date: '2026-11-12', split: { payers: { me: 400 }, method: 'equal', shares: { me: 1, [ana]: 1 } }, groupId: group });
    await run();
    const first = swConfig(os).bills![b.id]!.id;
    os.records.update<BillData>(b.id, { title: 'Museum and café', data: { amount: 520 } }, 'user');
    await run();
    const second = swConfig(os).bills![b.id]!.id;
    expect(second).not.toBe(first);
    expect(sw.list.find((e) => e.id === first)!.deleted_at).toBeTruthy();
    expect(sw.list.find((e) => e.id === second)).toMatchObject({ description: 'Museum and café', cost: '520.00' });
    os.records.delete(b.id, 'user');
    await run();
    expect(sw.list.find((e) => e.id === second)!.deleted_at).toBeTruthy();
    // Deleted on Splitwise: deleted here.
    const c = makeBill(os, 'Lunch', { amount: 200, date: '2026-11-13', split: { payers: { me: 200 }, method: 'equal', shares: { me: 1, [ben]: 1 } }, groupId: group });
    await run();
    const lunch = sw.list.find((e) => e.id === swConfig(os).bills![c.id]!.id)!;
    lunch.deleted_at = '2026-11-18T13:00:00Z';
    await run();
    expect(os.records.get(c.id)).toBeUndefined();
  });

  it('a Bill with someone who is not linked waits', async () => {
    const zoe = os.records.create({ object: 'person', title: 'Zoe', data: {} }, 'user').id;
    makeBill(os, 'Boat', { amount: 300, date: '2026-11-12', split: { payers: { me: 300 }, method: 'equal', shares: { me: 1, [zoe]: 1 } }, groupId: group });
    expect(await run()).toMatchObject({ billsSent: 0, billsHeld: 1 });
    linkPerson(os, zoe, { id: 4, name: 'Zoe' });
    expect(await run()).toMatchObject({ billsSent: 1, billsHeld: 0 });
  });
});
