import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '../crm';
import { billBalanceWith, financeModule, makeBill, makePayment, type BillData } from '.';
import { billSig, linkPerson, setSwConfig, swConfig, syncSplitwise, type SplitwiseClient, type SwExpense } from './splitwise';

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
  /** Descriptions Splitwise will refuse, as the real one does a bad expense. */
  refuse = new Set<string>();
  async me() { return { id: ME, first_name: 'Sam' }; }
  async friends() { return [{ id: ANA, first_name: 'Ana', balance: [] }, { id: BEN, first_name: 'Ben', balance: [] }]; }
  async groups() { return [{ id: GROUP, name: 'Lisbon' }]; }
  async expenses() { return this.list.filter((e) => e.payment); }
  async groupExpenses(g: number) { return this.list.filter((e) => e.group_id === g); }
  async looseExpenses() { return this.list.filter((e) => !e.group_id && !e.deleted_at); }
  async createExpense(p: Record<string, string | number | boolean | undefined>) {
    if (this.refuse.has(String(p.description))) throw new Error('Splitwise: Cost must be a positive number');
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

describe('Bills in no mapped group, and payments, on their own', () => {
  it('a trip Bill whose group is not mapped goes to Splitwise between you, once everyone in it is linked', async () => {
    const trip = os.records.create({ object: 'group', title: 'Japan trip', data: { name: 'Japan trip', kind: 'trip', memberIds: [ana] } }, 'user').id;
    const zoe = os.records.create({ object: 'person', title: 'Zoe', data: {} }, 'user').id;
    makeBill(os, 'Ramen', { amount: 2000, currency: 'JPY', date: '2026-11-14', split: { payers: { me: 2000 }, method: 'equal', shares: { me: 1, [ana]: 1 } }, groupId: trip });
    makeBill(os, 'Taxi', { amount: 900, date: '2026-11-14', split: { payers: { me: 900 }, method: 'equal', shares: { me: 1, [zoe]: 1 } }, groupId: trip });
    makeBill(os, 'Just mine', { amount: 100, date: '2026-11-14', split: { payers: { me: 100 }, method: 'equal', shares: { me: 1 } } });
    expect(await run()).toMatchObject({ billsSent: 1 });
    expect(sw.made).toHaveLength(1);
    expect(sw.made[0]).toMatchObject({ description: 'Ramen', group_id: 0, currency_code: 'JPY', users__0__paid_share: '2000.00', users__1__user_id: String(ANA), users__1__owed_share: '1000.00' });
    expect((await run()).billsSent).toBe(0);
  });

  it('a payment noted for what is owed only on Splitwise is sent there as a payment, once', async () => {
    setSwConfig(os, { toSend: [{ debtId: os.records.create({ object: 'debt', status: 'settled', data: { personId: ana, direction: 'i_owe', amount: 300, reason: 'Paid, on Splitwise', date: '2026-11-18', kind: 'payment' } }, 'system').id, personId: ana, amount: 300 }] });
    expect((await run()).paidThere).toBe(1);
    expect(sw.made.at(-1)).toMatchObject({ payment: true, cost: '300.00', users__0__user_id: String(ANA), users__0__paid_share: '300.00', users__1__user_id: String(ME), users__1__owed_share: '300.00' });
    expect(swConfig(os).toSend).toEqual([]);
    expect((await run()).paidThere).toBe(0);
  });

  it('a payment Ana records on Splitwise pays back what Bills say she owes, and is not sent back', async () => {
    makeBill(os, 'Brunch', { amount: 1000, date: '2026-11-10', split: { payers: { me: 1000 }, method: 'equal', shares: { me: 1, [ana]: 1 } } });
    await run();
    const sent = sw.made.length;
    sw.list.push({ id: 900, group_id: null, payment: true, cost: '500.00', currency_code: 'INR', description: 'Payment', date: '2026-11-17T10:00:00Z', users: [{ user_id: ANA, paid_share: '500.00', owed_share: '0.00' }, { user_id: ME, paid_share: '0.00', owed_share: '500.00' }] });
    expect((await run()).settledHere).toBe(1);
    expect(billBalanceWith(os, ana)).toBe(0);
    await run();
    expect(sw.made.length).toBe(sent);
  });
});

describe('when Splitwise refuses one', () => {
  it('the rest still sync; the refused one is kept with its reason and waits for a change or Try again', async () => {
    makeBill(os, 'Odd one', { amount: 500, date: '2026-11-10', split: { payers: { me: 500 }, method: 'equal', shares: { me: 1, [ana]: 1 } }, groupId: group });
    makeBill(os, 'Lunch', { amount: 600, date: '2026-11-11', split: { payers: { me: 600 }, method: 'equal', shares: { me: 1, [ana]: 1 } }, groupId: group });
    sw.refuse.add('Odd one');
    const r = await run();
    expect(r).toMatchObject({ billsSent: 1, billsFailed: 1 });
    expect(sw.made.map((p) => p.description)).toEqual(['Lunch']);
    const failed = Object.values(swConfig(os).failed ?? {});
    expect(failed).toEqual([expect.objectContaining({ what: 'Odd one', error: 'Cost must be a positive number' })]);
    // Not changed: not tried again.
    expect(await run()).toMatchObject({ billsSent: 0 });
    expect(sw.made).toHaveLength(1);
    // Try again, once Splitwise takes it: sent, and no longer waiting.
    sw.refuse.clear();
    setSwConfig(os, { failed: {} });
    expect(await run()).toMatchObject({ billsSent: 1 });
    expect(swConfig(os).failed).toEqual({});
  });

  it('a sign-out still stops the sync', async () => {
    const { SplitwiseError } = await import('./splitwise');
    makeBill(os, 'Lunch', { amount: 600, date: '2026-11-11', split: { payers: { me: 600 }, method: 'equal', shares: { me: 1, [ana]: 1 } }, groupId: group });
    sw.createExpense = async () => { throw new SplitwiseError('signed out', true); };
    await expect(run()).rejects.toThrow();
    expect(swConfig(os).signedOut).toBe(true);
  });
});

describe('mapping a group after its Bills went between you', () => {
  it('moves them into the Splitwise group: the loose copy goes, the group’s own copy is matched', async () => {
    setSwConfig(os, { groups: {} });
    const b = makeBill(os, 'Flight', { amount: 5000, date: '2026-11-08', split: { payers: { me: 5000 }, method: 'exact', shares: { [ana]: 5000 } }, groupId: group });
    await run();
    const loose = swConfig(os).bills![b.id]!.id;
    expect(sw.list.find((e) => e.id === loose)!.group_id).toBeNull();
    sw.list.push({ id: 61, group_id: GROUP, payment: false, cost: '5000.00', currency_code: 'INR', description: 'Flight (Ana)', date: '2026-11-08T12:00:00Z', users: [{ user_id: ME, paid_share: '5000.00', owed_share: '0.00' }, { user_id: ANA, paid_share: '0.00', owed_share: '5000.00' }] });
    setSwConfig(os, { groups: { [group]: GROUP } });
    expect(await run()).toMatchObject({ billsMatched: 1, billsSent: 0 });
    expect(sw.list.find((e) => e.id === loose)!.deleted_at).toBeTruthy();
    expect(swConfig(os).bills![b.id]!.id).toBe(61);
  });
});

describe('copies LifeOS made twice', () => {
  it('two syncs at once send a Bill once; a copy made twice before is deleted, once', async () => {
    setSwConfig(os, { groups: {} });
    makeBill(os, 'Parth’s flight', { amount: 52129, date: '2026-11-08', split: { payers: { me: 52129 }, method: 'exact', shares: { [ana]: 52129 } } });
    await Promise.all([run(), run()]);
    expect(sw.made.filter((p) => p.description === 'Parth’s flight')).toHaveLength(1);
    // A copy from before the lock: same name, amount and day, not the one LifeOS tracks.
    setSwConfig(os, { dupesCleaned: false });
    sw.list.push({ ...sw.list[0]!, id: 999 });
    await run();
    expect(sw.list.find((e) => e.id === 999)!.deleted_at).toBeTruthy();
    expect(sw.list.filter((e) => !e.deleted_at && e.description === 'Parth’s flight')).toHaveLength(1);
    expect(swConfig(os).dupesCleaned).toBe(true);
  });
});

describe('linking a group both sides already have', () => {
  it('pairs what both have (several here can be one there), and adds what is missing on each side', async () => {
    for (const who of [ana, ben, 'me']) makeBill(os, `Visa fee (${who})`, { amount: 4000, date: '2026-11-16', split: { payers: { me: 4000 }, method: 'exact', shares: { [who]: 4000 } }, groupId: group });
    makeBill(os, 'Flight', { amount: 5000, date: '2026-11-08', split: { payers: { me: 5000 }, method: 'exact', shares: { [ana]: 5000 } }, groupId: group });
    makeBill(os, 'Hostel', { amount: 900, date: '2026-11-09', split: { payers: { me: 900 }, method: 'equal', shares: { me: 1, [ana]: 1, [ben]: 1 } }, groupId: group });
    const u = (id: number, paid: string, owed: string) => ({ user_id: id, paid_share: paid, owed_share: owed });
    sw.list.push({ id: 71, group_id: GROUP, payment: false, cost: '12000.00', currency_code: 'INR', description: 'Visa', date: '2026-11-17T12:00:00Z', users: [u(ME, '12000.00', '4000.00'), u(ANA, '0.00', '4000.00'), u(BEN, '0.00', '4000.00')] });
    sw.list.push({ id: 72, group_id: GROUP, payment: false, cost: '5000.00', currency_code: 'INR', description: 'Flight (Ana)', date: '2026-11-08T12:00:00Z', users: [u(ME, '5000.00', '0.00'), u(ANA, '0.00', '5000.00')] });
    sw.list.push({ id: 73, group_id: GROUP, payment: false, cost: '600.00', currency_code: 'INR', description: 'Taxi', date: '2026-11-10T12:00:00Z', users: [u(BEN, '600.00', '200.00'), u(ME, '0.00', '200.00'), u(ANA, '0.00', '200.00')] });
    expect(await run()).toMatchObject({ billsMatched: 4, billsSent: 1, billsIn: 1 });
    expect(sw.made.map((p) => p.description)).toEqual(['Hostel']);
    expect(os.records.query<BillData>('bill', {}, { limit: 20 }).some((b) => b.title === 'Taxi')).toBe(true);
    expect(await run()).toMatchObject({ billsMatched: 0, billsSent: 0, billsIn: 0 });
    expect(sw.list.filter((e) => e.deleted_at)).toHaveLength(0);
  });
});

describe('pairing by the people in it, not only the date', () => {
  const u = (id: number, paid: string, owed: string) => ({ user_id: id, paid_share: paid, owed_share: owed });
  const flight = () => os.records.create<BillData>({ object: 'bill', title: 'Ana’s flight', data: { kind: 'spend', amount: 52129, currency: 'INR', date: '2026-11-08', split: { payers: { me: 52129 }, method: 'exact', shares: { [ana]: 52129 } }, groupId: group, sourceKey: 'trip:expense:1' } }, 'user');
  const theirs = () => sw.list.push({ id: 81, group_id: GROUP, payment: false, cost: '52129.00', currency_code: 'INR', description: 'Ana Flight ticket Vietnam Airlines', date: '2026-08-23T12:00:00Z', users: [u(ME, '52129.00', '0.00'), u(ANA, '0.00', '52129.00')] });

  it('the first link pairs a Bill with its twin weeks apart (same price, same people, a word in common), and not with someone else’s of the same price', async () => {
    const b = flight();
    sw.list.push({ id: 80, group_id: GROUP, payment: false, cost: '52129.00', currency_code: 'INR', description: 'Ben’s flight', date: '2026-11-08T12:00:00Z', users: [u(ME, '52129.00', '0.00'), u(BEN, '0.00', '52129.00')] });
    theirs();
    expect(await run()).toMatchObject({ billsMatched: 1, billsSent: 0 });
    expect(swConfig(os).bills![b.id]!.id).toBe(81);
  });

  it('once, mends a link made before: the copy LifeOS sent there and the copy that came in here go, the two are paired', async () => {
    const b = flight();
    theirs();
    // As v0.0.141 left it: LifeOS's Bill sent into the group, Splitwise's brought in.
    sw.list.push({ id: 82, group_id: GROUP, payment: false, cost: '52129.00', currency_code: 'INR', description: 'Ana’s flight', date: '2026-11-08T12:00:00Z', users: [u(ME, '52129.00', '0.00'), u(ANA, '0.00', '52129.00')] });
    const came = os.records.create<BillData>({ object: 'bill', title: 'Ana Flight ticket Vietnam Airlines', data: { kind: 'spend', amount: 52129, currency: 'INR', date: '2026-08-23', split: { payers: { me: 52129 }, method: 'exact', shares: { [ana]: 52129 } }, groupId: group } }, 'system');
    setSwConfig(os, { billGroupsSeen: [group], billsReadAt: Date.now(), bills: { [b.id]: { id: 82, sig: billSig(b) }, [came.id]: { id: 81, sig: billSig(came) } } });
    await run();
    expect(sw.list.find((e) => e.id === 82)!.deleted_at).toBeTruthy();
    expect(sw.list.find((e) => e.id === 81)!.deleted_at).toBeFalsy();
    expect(os.records.get(came.id)).toBeUndefined();
    expect(swConfig(os).bills![b.id]!.id).toBe(81);
    expect(swConfig(os).pairedV1).toContain(group);
  });
});
