import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '../crm';
import { financeModule, makeBill, type BillData } from '.';
import { lifeosBalance, linkGroup, olderBills, sendOlderBills, sendSplitwise, SplitwiseClient, SPLITWISE_SOURCE, syncSplitwise, type SwExpense, type SwUser } from './splitwise';

/**
 * Splitwise kept in step (MODEL.md *Splitwise*), against a made-up Splitwise:
 * expenses come in as Bills with the same balances, the first link matches
 * what both already have, Bills made here go out, deletes go both ways, and a
 * Bill with someone who is not in Splitwise is refused.
 */

const ME: SwUser = { id: 1, first_name: 'Sam', last_name: 'Lee', email: 'sam@example.com' };
const ANA: SwUser = { id: 2, first_name: 'Ana', last_name: 'Ray', email: 'ana@example.com' };
const BEN: SwUser = { id: 3, first_name: 'Ben', last_name: null, email: null };

class FakeSplitwise {
  expenses: SwExpense[] = [];
  next = 100;
  clock = 1;
  stamp() {
    return `2026-11-18T10:00:${String(this.clock++).padStart(2, '0')}Z`;
  }
  add(e: Partial<SwExpense> & Pick<SwExpense, 'description' | 'cost' | 'users'>): SwExpense {
    const x: SwExpense = { id: this.next++, group_id: 50, payment: false, currency_code: 'INR', date: '2026-11-10T12:00:00Z', updated_at: this.stamp(), deleted_at: null, ...e };
    this.expenses.push(x);
    return x;
  }
  balance(userId: number) {
    let n = 0;
    for (const e of this.expenses) if (!e.deleted_at) for (const u of e.users) if (u.user_id === userId) n += Number(u.paid_share) - Number(u.owed_share);
    return Math.round(n * 100) / 100;
  }
  fetch = (async (url: string, init?: { method?: string; body?: string }) => {
    const u = new URL(url);
    const path = u.pathname.replace('/api/v3.0', '');
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    if (path === '/get_current_user') return ok({ user: ME });
    if (path === '/get_groups') return ok({ groups: [{ id: 50, name: 'Lisbon', members: [ME, ANA, BEN].map((m) => ({ ...m, balance: [{ currency_code: 'INR', amount: String(this.balance(m.id)) }] })) }] });
    if (path === '/get_expenses') {
      const after = u.searchParams.get('updated_after');
      return ok({ expenses: this.expenses.filter((e) => !after || e.updated_at > after) });
    }
    const body = init?.body ? (JSON.parse(init.body) as Record<string, string>) : {};
    const users = () => {
      const out: SwExpense['users'] = [];
      for (let i = 0; body[`users__${i}__user_id`] != null; i++) out.push({ user_id: Number(body[`users__${i}__user_id`]), paid_share: body[`users__${i}__paid_share`]!, owed_share: body[`users__${i}__owed_share`]! });
      return out;
    };
    if (path === '/create_expense') {
      const e = this.add({ description: body.description!, cost: body.cost!, currency_code: body.currency_code, date: body.date, payment: !!body.payment, users: users() });
      return ok({ expenses: [e], errors: {} });
    }
    const m = /\/(update|delete)_expense\/(\d+)/.exec(path);
    const e = m ? this.expenses.find((x) => x.id === Number(m[2])) : undefined;
    if (m?.[1] === 'update' && e) {
      Object.assign(e, { description: body.description, cost: body.cost, users: users(), updated_at: this.stamp() });
      return ok({ expenses: [e], errors: {} });
    }
    if (m?.[1] === 'delete' && e) {
      e.deleted_at = this.stamp();
      e.updated_at = e.deleted_at;
      return ok({ success: true });
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' };
  }) as unknown as typeof fetch;
}

const share = (user: SwUser, paid: number, owed: number) => ({ user_id: user.id, user, paid_share: paid.toFixed(2), owed_share: owed.toFixed(2) });

let os: LifeOSContext;
let sw: FakeSplitwise;
let client: SplitwiseClient;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule], registry: new Registry() });
  sw = new FakeSplitwise();
  client = new SplitwiseClient('test', sw.fetch);
});
afterEach(() => os.db.close());

const send = () => sendSplitwise(os, os.outbox.waiting(SPLITWISE_SOURCE), client).then((answers) => {
  for (const a of answers) {
    if (a.state === 'sent') os.outbox.sent(a.id, a.result ?? null);
    else if (a.state === 'refused') os.outbox.refuse(a.id, a.error ?? '');
  }
  return answers;
});

describe('Splitwise, kept in step', () => {
  it('brings a group’s expenses in as Bills with the same balances, matching people once', async () => {
    const ana = os.records.create({ object: 'person', title: 'Ana Ray', data: { email: 'ana@example.com' } }, 'user');
    sw.add({ description: 'Dinner', cost: '900.00', users: [share(ME, 900, 300), share(ANA, 0, 300), share(BEN, 0, 300)], category: { name: 'Dining out' } });
    sw.add({ description: 'Ben paid Sam', cost: '300.00', payment: true, users: [share(BEN, 300, 0), share(ME, 0, 300)] });
    const gid = linkGroup(os, { id: 50, name: 'Lisbon' }, null);
    const r = await syncSplitwise(os, client);
    expect(r).toMatchObject({ created: 2, updated: 0, deleted: 0, error: null });
    const bills = os.records.query<BillData>('bill', {}, { limit: 10 });
    expect(bills.map((b) => b.title).sort()).toEqual(['Ben paid Sam', 'Dinner']);
    const dinner = bills.find((b) => b.title === 'Dinner')!;
    expect(dinner.data).toMatchObject({ kind: 'spend', amount: 900, category: 'food', groupId: gid, split: { method: 'exact', payers: { me: 900 } } });
    expect(dinner.data.split.shares[ana.id]).toBe(300);
    expect(os.records.get(ana.id)!.data).toMatchObject({ splitwiseId: 2 });
    const ben = os.records.query('person', {}, { limit: 10 }).find((p) => p.title === 'Ben')!;
    expect(ben.data).toMatchObject({ splitwiseId: 3 });
    expect((os.records.get(gid)!.data as { memberIds: string[] }).memberIds.sort()).toEqual([ana.id, ben.id].sort());
    expect(lifeosBalance(os, gid)).toBe(sw.balance(1));
    // Nothing new: nothing changes, nothing goes out.
    expect(await syncSplitwise(os, client)).toMatchObject({ created: 0, updated: 0 });
    expect(os.outbox.waiting(SPLITWISE_SOURCE)).toHaveLength(0);
  });

  it('the first link matches what both already have; older Bills wait for Send', async () => {
    const g = os.records.create({ object: 'group', title: 'Lisbon', data: { name: 'Lisbon', memberIds: [] } }, 'user');
    const ana = os.records.create({ object: 'person', title: 'Ana', data: { splitwiseId: 2 } }, 'user');
    const twin = makeBill(os, 'Taxi', { amount: 600, date: '2026-11-11', split: { payers: { me: 600 }, method: 'equal', shares: { me: 1, [ana.id]: 1 } }, groupId: g.id });
    const extra = makeBill(os, 'Museum', { amount: 400, date: '2026-11-12', split: { payers: { me: 400 }, method: 'equal', shares: { me: 1, [ana.id]: 1 } }, groupId: g.id });
    sw.add({ description: 'Taxi to the coast', cost: '600.00', date: '2026-11-10T12:00:00Z', users: [share(ME, 600, 300), share(ANA, 0, 300)] });
    linkGroup(os, { id: 50, name: 'Lisbon' }, g.id);
    expect(os.outbox.waiting(SPLITWISE_SOURCE)).toHaveLength(0);
    const r = await syncSplitwise(os, client);
    expect(r).toMatchObject({ created: 0, matched: 1 });
    expect(os.records.get<BillData>(twin.id)!).toMatchObject({ title: 'Taxi to the coast', data: { splitwiseId: 100 } });
    expect(olderBills(os, g.id).map((b) => b.id)).toEqual([extra.id]);
    expect(sendOlderBills(os, g.id)).toBe(1);
    await send();
    expect(sw.expenses.map((e) => e.description)).toEqual(['Taxi to the coast', 'Museum']);
    expect(os.records.get<BillData>(extra.id)!.data.splitwiseId).toBe(101);
  });

  it('sends Bills made, changed and deleted here; a Splitwise delete deletes here', async () => {
    const gid = linkGroup(os, { id: 50, name: 'Lisbon' }, null);
    sw.add({ description: 'Groceries', cost: '300.00', users: [share(ANA, 300, 150), share(ME, 0, 150)] });
    await syncSplitwise(os, client);
    const ana = os.records.query('person', {}, { limit: 5 }).find((p) => p.title === 'Ana Ray')!;
    const b = makeBill(os, 'Tram', { amount: 100, date: '2026-11-12', split: { payers: { me: 100 }, method: 'equal', shares: { me: 1, [ana.id]: 1 } }, groupId: gid });
    expect(os.outbox.waiting(SPLITWISE_SOURCE)).toHaveLength(1);
    await send();
    const made = sw.expenses.find((e) => e.description === 'Tram')!;
    expect(made.users).toEqual([{ user_id: 1, paid_share: '100.00', owed_share: '50.00' }, { user_id: 2, paid_share: '0.00', owed_share: '50.00' }]);
    expect(os.records.get<BillData>(b.id)!.data.splitwiseId).toBe(made.id);
    os.records.update<BillData>(b.id, { title: 'Tram 28' }, 'user');
    await send();
    expect(made.description).toBe('Tram 28');
    os.records.delete(b.id, 'user');
    await send();
    expect(made.deleted_at).not.toBeNull();
    // Splitwise deletes the groceries: the Bill goes here too.
    const groceries = sw.expenses.find((e) => e.description === 'Groceries')!;
    groceries.deleted_at = sw.stamp();
    groceries.updated_at = groceries.deleted_at;
    const r = await syncSplitwise(os, client);
    expect(r.deleted).toBeGreaterThanOrEqual(1);
    expect(os.records.query<BillData>('bill', {}, { limit: 10 }).filter((x) => !x.archived).map((x) => x.title)).not.toContain('Groceries');
  });

  it('refuses a Bill with someone who is not a Splitwise friend in the group', async () => {
    const gid = linkGroup(os, { id: 50, name: 'Lisbon' }, null);
    const zoe = os.records.create({ object: 'person', title: 'Zoe', data: {} }, 'user');
    makeBill(os, 'Lunch', { amount: 200, date: '2026-11-12', split: { payers: { me: 200 }, method: 'equal', shares: { me: 1, [zoe.id]: 1 } }, groupId: gid });
    const [a] = await send();
    expect(a).toMatchObject({ state: 'refused', error: 'Zoe isn’t a Splitwise friend in this group' });
    expect(sw.expenses).toHaveLength(0);
  });
});
