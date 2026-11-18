import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '@modules/crm';
import { financeModule } from '@modules/finance';
import type { DebtData } from './split';
import { linkPerson, suggestPerson, swConfig, syncSplitwise, SplitwiseClient, SplitwiseError } from './splitwise';

/** Splitwise kept in step (docs/MODEL.md, Splitwise and settling up), against a pretend Splitwise. */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const ME = 101;
const KALPAK = 202;

/** A pretend secure.splitwise.com: the page with its CSRF token, and the API calls LifeOS makes. */
function fakeSplitwise(opts: { signedOut?: boolean; payments?: unknown[] } = {}) {
  const posts: Array<{ path: string; body: Record<string, string>; csrf?: string }> = [];
  let next = 9000;
  const fetchImpl = (async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const reply = (status: number, text: string) => ({ ok: status < 400, status, text: async () => text });
    if (opts.signedOut) return reply(200, '<html><form action="/login"></form></html>');
    if (url === 'https://secure.splitwise.com/') return reply(200, '<meta name="csrf-token" content="tok&#x2F;en">');
    const path = url.replace('https://secure.splitwise.com/api/v3.0/', '').split('?')[0]!;
    if (init.method === 'POST') {
      const body = Object.fromEntries(new URLSearchParams(init.body ?? ''));
      posts.push({ path, body, csrf: init.headers?.['X-CSRF-Token'] });
      if (path === 'create_expense') return reply(200, JSON.stringify({ expenses: [{ id: next++ }], errors: {} }));
      return reply(200, JSON.stringify({ success: true, errors: [] }));
    }
    if (path === 'get_current_user') return reply(200, JSON.stringify({ user: { id: ME, first_name: 'Rutvij', last_name: 'M' } }));
    if (path === 'get_friends') return reply(200, JSON.stringify({ friends: [{ id: KALPAK, first_name: 'Kalpak', last_name: 'Rao', balance: [{ currency_code: 'INR', amount: '200.0' }] }] }));
    if (path === 'get_groups') return reply(200, JSON.stringify({ groups: [{ id: 0, name: 'Non-group' }, { id: 77, name: 'Football' }] }));
    if (path === 'get_expenses') return reply(200, JSON.stringify({ expenses: opts.payments ?? [] }));
    return reply(404, '{}');
  }) as unknown as typeof fetch;
  return { posts, client: new SplitwiseClient(fetchImpl) };
}

const kalpak = () => os.records.create({ object: 'person', title: 'Kalpak', data: {} });
const debt = (personId: string, amount: number, direction: DebtData['direction'] = 'they_owe', reason = 'Turf at Wings') =>
  os.records.create<DebtData>({ object: 'debt', status: 'open', data: { personId, direction, amount, reason, date: '2026-11-14', kind: 'split' } });

describe('Splitwise kept in step', () => {
  it('a Splitwise friend is matched to the Person with their name', () => {
    const people = [{ id: 'a', title: 'Kalpak' }, { id: 'b', title: 'Priya Sharma' }, { id: 'c', title: 'Priya Nair' }];
    expect(suggestPerson(people, 'Kalpak Rao')).toBe('a');
    expect(suggestPerson(people, 'Priya Sharma')).toBe('b');
    expect(suggestPerson(people, 'Priya S')).toBeNull();
  });

  it('a share for a linked person made after linking goes to Splitwise as an expense, with the CSRF token; older ones stay', async () => {
    const k = kalpak();
    const old = debt(k.id, 125, 'they_owe', 'Turf at Jogger’s Park');
    await new Promise((r) => setTimeout(r, 5));
    linkPerson(os, k.id, { id: KALPAK, name: 'Kalpak Rao' });
    await new Promise((r) => setTimeout(r, 5));
    const d = debt(k.id, 200);
    const sw = fakeSplitwise();
    const r = await syncSplitwise(os, sw.client);
    expect(r.pushed).toBe(1);
    const post = sw.posts.find((p) => p.path === 'create_expense')!;
    expect(post.csrf).toBe('tok/en');
    expect(post.body).toMatchObject({ cost: '200.00', description: 'Turf at Wings', currency_code: 'INR', users__0__user_id: String(ME), users__0__paid_share: '200.00', users__1__user_id: String(KALPAK), users__1__owed_share: '200.00' });
    expect(swConfig(os).pushed[d.id]).toBeTruthy();
    expect(swConfig(os).pushed[old.id]).toBeUndefined();
    // What Splitwise says he owes shows on his page.
    expect(swConfig(os).balances[k.id]).toBe(200);
    // A second sync sends nothing again.
    expect((await syncSplitwise(os, sw.client)).pushed).toBe(0);
  });

  it('a share deleted here is deleted there; settled here is one payment there', async () => {
    const k = kalpak();
    linkPerson(os, k.id, { id: KALPAK, name: 'Kalpak Rao' }, 0);
    const a = debt(k.id, 200);
    const b = debt(k.id, 300, 'they_owe', 'Goa stay');
    const sw = fakeSplitwise();
    await syncSplitwise(os, sw.client);
    const goneId = swConfig(os).pushed[a.id]!;
    os.records.delete(a.id);
    os.records.setStatus(b.id, 'settled');
    const r = await syncSplitwise(os, sw.client);
    expect(r.removed).toBe(1);
    expect(sw.posts.some((p) => p.path === `delete_expense/${goneId}`)).toBe(true);
    expect(r.paidThere).toBe(1);
    const pay = sw.posts.filter((p) => p.path === 'create_expense').at(-1)!;
    // He paid you the ₹300.
    expect(pay.body).toMatchObject({ payment: 'true', cost: '300.00', users__0__user_id: String(KALPAK), users__0__paid_share: '300.00', users__1__user_id: String(ME), users__1__owed_share: '300.00' });
    expect((await syncSplitwise(os, sw.client)).paidThere).toBe(0);
  });

  it('a Turf share part-paid after it went to Splitwise is paid back there for what was sent', async () => {
    const k = kalpak();
    linkPerson(os, k.id, { id: KALPAK, name: 'Kalpak Rao' }, 0);
    const d = debt(k.id, 200);
    const sw = fakeSplitwise();
    await syncSplitwise(os, sw.client);
    // A ₹50 part payment lowers what is open; then the rest settles it.
    os.records.update(d.id, { data: { amount: 150 } });
    os.records.setStatus(d.id, 'settled');
    await syncSplitwise(os, sw.client);
    expect(sw.posts.filter((p) => p.path === 'create_expense').at(-1)!.body).toMatchObject({ payment: 'true', cost: '200.00' });
  });

  it('a payment he records on Splitwise settles his shares here, oldest first, up to what he paid', async () => {
    const k = kalpak();
    linkPerson(os, k.id, { id: KALPAK, name: 'Kalpak Rao' }, Date.now() + 60_000);
    const first = os.records.create<DebtData>({ object: 'debt', status: 'open', data: { personId: k.id, direction: 'they_owe', amount: 125, reason: 'Turf', date: '2026-11-03', kind: 'split' } });
    const second = debt(k.id, 200);
    const later = os.records.create<DebtData>({ object: 'debt', status: 'open', data: { personId: k.id, direction: 'they_owe', amount: 500, reason: 'Goa', date: '2026-11-20', kind: 'split' } });
    const payment = { id: 5555, payment: true, cost: '325.0', currency_code: 'INR', description: 'Payment', date: '2026-11-16T10:00:00Z', users: [{ user_id: KALPAK, paid_share: '325.0', owed_share: '0.0' }, { user_id: ME, paid_share: '0.0', owed_share: '325.0' }] };
    const sw = fakeSplitwise({ payments: [payment] });
    const r = await syncSplitwise(os, sw.client);
    expect(r.settledHere).toBe(2);
    expect(os.records.get(first.id)!.status).toBe('settled');
    expect(os.records.get(second.id)!.status).toBe('settled');
    expect(os.records.get(later.id)!.status).toBe('open');
    // Not read back as a settle-up to send there.
    expect(r.paidThere).toBe(0);
    expect((await syncSplitwise(os, sw.client)).settledHere).toBe(0);
  });

  it('when Splitwise has signed you out, it says so and sends nothing', async () => {
    const k = kalpak();
    linkPerson(os, k.id, { id: KALPAK, name: 'Kalpak Rao' }, 0);
    debt(k.id, 200);
    const sw = fakeSplitwise({ signedOut: true });
    await expect(syncSplitwise(os, sw.client)).rejects.toBeInstanceOf(SplitwiseError);
    expect(swConfig(os).signedOut).toBe(true);
    expect(sw.posts).toHaveLength(0);
  });
});
