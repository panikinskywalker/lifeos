import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '../crm';
import { travelModule } from '../travel';
import { financeModule, makeBill } from '.';
import { matchFriend, setSwConfig, swConfig, syncSplitwise, type SplitwiseClient, type SwExpense } from './splitwise';

/**
 * A trip with people goes to Splitwise on its own (MODEL.md, *Splitwise and
 * settling up*): its people already on Splitwise are linked, a Splitwise group
 * of the trip's name is used or made, everyone is added (by email when not a
 * friend), and its expenses follow. A made-up Splitwise stands in.
 */

const ME = 1, ANA = 2, BEN = 3;

class FakeSw {
  list: Array<SwExpense & { group_id: number | null }> = [];
  next = 500;
  nextUser = 900;
  groupList: Array<{ id: number; name: string; members: Array<{ id: number; balance: [] }> }> = [];
  made: string[] = [];
  invited: Array<Record<string, unknown>> = [];
  async me() { return { id: ME, first_name: 'Sam' }; }
  async friends() { return [{ id: ANA, first_name: 'Ana', last_name: 'Silva', balance: [] }, { id: BEN, first_name: 'Ben', email: 'ben@example.com', balance: [] }]; }
  async groups() { return this.groupList.map((g) => ({ ...g, members: [...g.members] })); }
  async expenses() { return []; }
  async groupExpenses(g: number) { return this.list.filter((e) => e.group_id === g); }
  async createExpense(p: Record<string, string | number | boolean | undefined>) {
    const users: SwExpense['users'] = [];
    for (let i = 0; p[`users__${i}__user_id`] != null; i++) users.push({ user_id: Number(p[`users__${i}__user_id`]), paid_share: String(p[`users__${i}__paid_share`]), owed_share: String(p[`users__${i}__owed_share`]) });
    const id = this.next++;
    this.list.push({ id, group_id: Number(p.group_id) || null, payment: !!p.payment, cost: String(p.cost), currency_code: String(p.currency_code), description: String(p.description), date: String(p.date), users });
    return id;
  }
  async deleteExpense() { return {}; }
  async createGroup(name: string, ids: number[]) {
    this.made.push(name);
    const id = 70 + this.groupList.length;
    this.groupList.push({ id, name, members: [ME, ...ids].map((x) => ({ id: x, balance: [] as [] })) });
    return id;
  }
  async addToGroup(groupId: number, who: Record<string, unknown>) {
    const g = this.groupList.find((x) => x.id === groupId)!;
    const id = typeof who.user_id === 'number' ? who.user_id : this.nextUser++;
    if (!('user_id' in who)) this.invited.push(who);
    g.members.push({ id, balance: [] });
    return id;
  }
}

let os: LifeOSContext;
let sw: FakeSw;
const person = (title: string, data: Record<string, unknown> = {}) => os.records.create({ object: 'person', title, data }, 'user').id;
const trip = (groupId: string, endDate = '2027-01-07') => os.records.create({ object: 'trip', title: 'Japan', data: { destination: 'Japan', startDate: '2026-12-17', endDate, groupId } }, 'user');
const group = (title: string, memberIds: string[]) => os.records.create({ object: 'group', title, data: { name: title, kind: 'trip', memberIds } }, 'user').id;
const run = () => syncSplitwise(os, sw as unknown as SplitwiseClient, Date.parse('2026-11-28T10:00:00'));

beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule, travelModule], registry: new Registry() });
  sw = new FakeSw();
  setSwConfig(os, { me: { id: ME, name: 'Sam' } });
});
afterEach(() => os.db.close());

describe('a trip with people, on Splitwise on its own', () => {
  it('links who is there, makes the group, invites the rest by email, and its expenses follow', async () => {
    const ana = person('Ana'), ben = person('Ben Kumar', { email: 'BEN@example.com' }), cleo = person('Cleo Ray', { email: 'cleo@example.com' });
    const g = group('Japan trip', [ana, ben, cleo]);
    trip(g);
    makeBill(os, 'Ramen', { amount: 3000, currency: 'JPY', date: '2026-12-18', split: { payers: { me: 3000 }, method: 'equal', shares: { me: 1, [ana]: 1, [ben]: 1, [cleo]: 1 } }, groupId: g });
    const r = await run();
    const c = swConfig(os);
    expect(c.people[ana]?.sw).toBe(ANA); // "Ana" here, "Ana Silva" there
    expect(c.people[ben]?.sw).toBe(BEN); // by email
    expect(sw.made).toEqual(['Japan trip']);
    expect(sw.invited).toEqual([expect.objectContaining({ first_name: 'Cleo', last_name: 'Ray', email: 'cleo@example.com' })]);
    expect(c.people[cleo]?.sw).toBe(900);
    expect(c.groups[g]).toBe(70);
    expect(r).toMatchObject({ groupsMade: 1, billsSent: 1 });
    expect(sw.list[0]).toMatchObject({ group_id: 70, description: 'Ramen', currency_code: 'JPY' });
    // Someone added to the trip later is added there at the next sync.
    const dev = person('Dev', { email: 'dev@example.com' });
    os.records.update(g, { data: { name: 'Japan trip', kind: 'trip', memberIds: [ana, ben, cleo, dev] } }, 'user');
    expect(await run()).toMatchObject({ groupsMade: 0, addedToGroups: 1 });
    expect(sw.groupList[0]!.members.map((m) => m.id)).toContain(swConfig(os).people[dev]!.sw);
  });

  it('uses a Splitwise group of the same name instead of making another, and adds who is missing', async () => {
    sw.groupList.push({ id: 55, name: 'JAPAN', members: [{ id: ME, balance: [] }, { id: ANA, balance: [] }] });
    const ana = person('Ana Silva'), ben = person('Ben');
    const g = group('Japan trip', [ana, ben]);
    trip(g);
    await run();
    expect(sw.made).toEqual([]);
    expect(swConfig(os).groups[g]).toBe(55);
    expect(sw.groupList[0]!.members.map((m) => m.id)).toEqual([ME, ANA, BEN]);
  });

  it('someone with no email and not a friend waits; a group kept between you, an ended trip, or auto off make nothing', async () => {
    const zed = person('Zed');
    const g = group('Japan trip', [zed]);
    trip(g);
    await run();
    expect(swConfig(os).waiting).toEqual({ [g]: [zed] });

    const old = group('Goa', [person('Ana')]);
    trip(old, '2025-03-17');
    const off = group('Flat', [person('Ben')]);
    trip(off);
    setSwConfig(os, { noGroup: [off] });
    sw.made = [];
    await run();
    expect(sw.made).toEqual([]);
    expect(swConfig(os).groups[old]).toBeUndefined();
    expect(swConfig(os).groups[off]).toBeUndefined();

    setSwConfig(os, { auto: false, noGroup: [] });
    await run();
    expect(sw.made).toEqual([]);
  });
});

describe('matching a Person to a Splitwise friend', () => {
  const friends = [{ id: 1, name: 'Parth Shah' }, { id: 2, name: 'Rushikesh', email: 'r@example.com' }, { id: 3, name: 'Asha Rao' }, { id: 4, name: 'Asha Iyer' }];
  it('email, then full name, then a first name only when no surnames disagree', () => {
    expect(matchFriend({ title: 'Someone', data: { email: 'R@example.com' } }, friends, new Set())?.id).toBe(2);
    expect(matchFriend({ title: 'Parth', data: {} }, friends, new Set())?.id).toBe(1);
    expect(matchFriend({ title: 'Parth Mehta', data: {} }, friends, new Set())).toBeNull();
    expect(matchFriend({ title: 'Rushikesh Patil', data: {} }, friends, new Set())?.id).toBe(2);
    expect(matchFriend({ title: 'Asha', data: {} }, friends, new Set())).toBeNull();
    expect(matchFriend({ title: 'Asha Rao', data: {} }, friends, new Set())?.id).toBe(3);
    expect(matchFriend({ title: 'Parth', data: {} }, friends, new Set([1]))).toBeNull();
  });
});
