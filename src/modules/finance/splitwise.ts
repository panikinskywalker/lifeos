import type { LifeOSContext } from '@core/registry/context';
import type { DebtData } from './split';
import { settleOldest } from './settleUpi';

/**
 * Splitwise, kept in step (docs/MODEL.md, Splitwise and settling up). You sign
 * in on Splitwise's own page inside LifeOS; the session lives in the phone's
 * cookie store, which `fetch` shares, so calls go to Splitwise's API as the
 * website makes them (a CSRF token read from the page for writes). Only
 * linked people sync: a new Debt for one becomes a Splitwise expense, a Debt
 * deleted here is deleted there, a settle-up here is a payment there, and a
 * payment recorded there settles their Debts here.
 */

export const SPLITWISE = 'https://secure.splitwise.com/';
const KEY = 'finance.splitwise';

export interface SwFriend {
  id: number;
  first_name: string;
  last_name?: string | null;
  email?: string | null;
  balance?: Array<{ currency_code: string; amount: string }>;
}
export interface SwGroup {
  id: number;
  name: string;
}
interface SwShare {
  user_id: number;
  paid_share: string;
  owed_share: string;
}
export interface SwExpense {
  id: number;
  payment: boolean;
  cost: string;
  currency_code: string;
  description: string;
  date: string;
  deleted_at?: string | null;
  users: SwShare[];
}

export interface SwConfig {
  /** Who you are on Splitwise, once signed in. */
  me?: { id: number; name: string };
  /** Splitwise said the session is gone: shares wait until you sign in again. */
  signedOut?: boolean;
  /** Person → their Splitwise friend, and when you linked them (only Debts made after go there). */
  people: Record<string, { sw: number; name: string; at: number }>;
  /** A LifeOS group (Turf Saturdays, a trip) → the Splitwise group its shares go to. */
  groups: Record<string, number>;
  /** New shares for linked people go to Splitwise on their own. */
  auto: boolean;
  /** Your Splitwise friends and groups, as of the last sync, for the link list. */
  friends: Array<{ id: number; name: string; email?: string }>;
  swGroups: SwGroup[];
  /** Person → what Splitwise says they owe you in rupees (minus: you owe them). */
  balances: Record<string, number>;
  /** Debt → the Splitwise expense made for it. */
  pushed: Record<string, number>;
  /** Settled Debts whose payment is on Splitwise (or came from it). */
  sent: string[];
  /** Expenses LifeOS made, so a sync never reads its own payments back. */
  ours: number[];
  lastSync?: number;
}

const EMPTY: SwConfig = { people: {}, groups: {}, auto: true, friends: [], swGroups: [], balances: {}, pushed: {}, sent: [], ours: [] };

export function swConfig(os: LifeOSContext): SwConfig {
  return { ...EMPTY, ...os.settings.get<Partial<SwConfig>>(KEY, {}) };
}
export function setSwConfig(os: LifeOSContext, patch: Partial<SwConfig>): SwConfig {
  const next = { ...swConfig(os), ...patch };
  os.settings.set(KEY, next);
  return next;
}
/** Sign out: what LifeOS knows of Splitwise goes; the links to people stay, for next time. */
export function forgetSplitwise(os: LifeOSContext): void {
  const c = swConfig(os);
  os.settings.set(KEY, { ...EMPTY, people: c.people, groups: c.groups, auto: c.auto, pushed: c.pushed, sent: c.sent, ours: c.ours });
}

export class SplitwiseError extends Error {
  constructor(message: string, readonly signedOut = false) {
    super(message);
  }
}

const enc = (o: Record<string, string | number | boolean | undefined>) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');

/** Splitwise's API with the signed-in session, as its website calls it. */
export class SplitwiseClient {
  private csrf: string | null = null;
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  /** The page's CSRF token, which Splitwise wants on every write made with a session. */
  private async token(): Promise<string> {
    if (this.csrf) return this.csrf;
    const r = await this.fetchImpl(SPLITWISE, { headers: { Accept: 'text/html' } });
    const html = await r.text();
    const m = /name=["']csrf-token["'][^>]*content=["']([^"']+)["']/.exec(html) ?? /content=["']([^"']+)["'][^>]*name=["']csrf-token["']/.exec(html);
    if (!m) throw new SplitwiseError('Splitwise signed you out', true);
    this.csrf = m[1]!.replace(/&#x2F;/g, '/').replace(/&amp;/g, '&');
    return this.csrf;
  }

  async api<T>(path: string, params: Record<string, string | number | boolean | undefined> = {}, post = false, retried = false): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest', Referer: SPLITWISE };
    let url = `${SPLITWISE}api/v3.0/${path}`;
    let body: string | undefined;
    if (post) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['X-CSRF-Token'] = await this.token();
      headers.Origin = 'https://secure.splitwise.com';
      body = enc(params);
    } else if (Object.keys(params).length) url += `?${enc(params)}`;
    const r = await this.fetchImpl(url, { method: post ? 'POST' : 'GET', headers, body });
    // A stale token: read it again once.
    if (post && !retried && (r.status === 403 || r.status === 422)) {
      this.csrf = null;
      return this.api<T>(path, params, post, true);
    }
    if (r.status === 401 || r.status === 403) throw new SplitwiseError('Splitwise signed you out', true);
    const text = await r.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      // A sign-in page instead of JSON: the session is gone.
      throw new SplitwiseError('Splitwise signed you out', true);
    }
    const errors = (json as { errors?: Record<string, unknown> | unknown[] }).errors;
    const list = Array.isArray(errors) ? errors : errors ? Object.values(errors).flat() : [];
    if (list.length) throw new SplitwiseError(`Splitwise: ${list.join(', ').slice(0, 200)}`);
    return json as T;
  }

  me() {
    return this.api<{ user: { id: number; first_name: string; last_name?: string | null } }>('get_current_user').then((r) => r.user);
  }
  friends() {
    return this.api<{ friends: SwFriend[] }>('get_friends').then((r) => r.friends ?? []);
  }
  groups() {
    return this.api<{ groups: SwGroup[] }>('get_groups').then((r) => (r.groups ?? []).filter((g) => g.id));
  }
  expenses(updatedAfter?: number) {
    return this.api<{ expenses: SwExpense[] }>('get_expenses', { limit: 200, updated_after: updatedAfter ? new Date(updatedAfter).toISOString() : undefined }).then((r) => r.expenses ?? []);
  }
  async createExpense(p: Record<string, string | number | boolean | undefined>): Promise<number> {
    const r = await this.api<{ expenses: Array<{ id: number }> }>('create_expense', p, true);
    const id = r.expenses?.[0]?.id;
    if (!id) throw new SplitwiseError('Splitwise did not make the expense');
    return id;
  }
  deleteExpense(id: number) {
    return this.api(`delete_expense/${id}`, {}, true);
  }
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
export const friendName = (f: { first_name: string; last_name?: string | null }) => [f.first_name, f.last_name].filter(Boolean).join(' ').trim();

/** The Person a Splitwise friend most likely is: the same full name, else the only one with that first name. */
export function suggestPerson(people: Array<{ id: string; title: string }>, name: string): string | null {
  const full = norm(name);
  const exact = people.filter((p) => norm(p.title) === full);
  if (exact.length === 1) return exact[0]!.id;
  const first = full.split(' ')[0];
  if (!first) return null;
  const firsts = people.filter((p) => norm(p.title).split(' ')[0] === first);
  return firsts.length === 1 ? firsts[0]!.id : null;
}

export function linkPerson(os: LifeOSContext, personId: string, friend: { id: number; name: string }, now = Date.now()): void {
  const c = swConfig(os);
  setSwConfig(os, { people: { ...c.people, [personId]: { sw: friend.id, name: friend.name, at: now } } });
}
export function unlinkPerson(os: LifeOSContext, personId: string): void {
  const people = { ...swConfig(os).people };
  delete people[personId];
  setSwConfig(os, { people });
}
export function personFor(os: LifeOSContext, swId: number): string | null {
  return Object.entries(swConfig(os).people).find(([, v]) => v.sw === swId)?.[0] ?? null;
}

const money = (n: number) => n.toFixed(2);
const inr = (b?: SwFriend['balance']) => (b ?? []).filter((x) => x.currency_code === 'INR').reduce((n, x) => n + Number(x.amount), 0);
const signed = (d: DebtData) => (d.direction === 'they_owe' ? d.amount : -d.amount);

/** One share in Splitwise's shape: who paid the whole of it, who owes it. */
function shareParams(me: number, friend: number, amount: number, theyOwe: boolean): Record<string, string> {
  const [payer, ower] = theyOwe ? [me, friend] : [friend, me];
  return { users__0__user_id: String(payer), users__0__paid_share: money(amount), users__0__owed_share: '0.00', users__1__user_id: String(ower), users__1__paid_share: '0.00', users__1__owed_share: money(amount) };
}

export interface SyncResult {
  pushed: number;
  removed: number;
  paidThere: number;
  settledHere: number;
}

/**
 * One sync: who you are and your friends' balances; then new shares out,
 * deleted ones removed, settle-ups here sent as payments, and payments
 * recorded there settled here.
 */
export async function syncSplitwise(os: LifeOSContext, sw: SplitwiseClient, now = Date.now()): Promise<SyncResult> {
  const result: SyncResult = { pushed: 0, removed: 0, paidThere: 0, settledHere: 0 };
  let c = swConfig(os);
  try {
    const user = await sw.me();
    const me = { id: user.id, name: friendName(user) };
    const [friends, groups] = await Promise.all([sw.friends(), sw.groups()]);
    const balances: Record<string, number> = {};
    for (const [personId, link] of Object.entries(c.people)) {
      const f = friends.find((x) => x.id === link.sw);
      if (f) balances[personId] = Math.round(inr(f.balance) * 100) / 100;
    }
    c = setSwConfig(os, { me, signedOut: false, balances, friends: friends.map((f) => ({ id: f.id, name: friendName(f), email: f.email ?? undefined })), swGroups: groups });
    const pushed = { ...c.pushed };
    const sent = new Set(c.sent);
    const ours = new Set(c.ours);

    // 1. New shares for linked people, made after you linked them.
    if (c.auto) {
      const open = os.records.query<DebtData>('debt', { filter: { and: [{ field: 'status', op: 'eq', value: 'open' }] } }, { limit: 2000 });
      for (const d of open) {
        const link = c.people[d.data.personId];
        if (!link || pushed[d.id] || d.data.kind === 'payment' || d.createdAt < link.at || (d.data.currency && d.data.currency !== 'INR')) continue;
        const id = await sw.createExpense({ cost: money(d.data.amount), description: (d.data.reason || 'Shared expense').slice(0, 100), currency_code: 'INR', date: new Date(`${d.data.date}T12:00:00`).toISOString(), group_id: (d.data.groupId && c.groups[d.data.groupId]) || 0, ...shareParams(me.id, link.sw, d.data.amount, d.data.direction === 'they_owe') });
        pushed[d.id] = id;
        ours.add(id);
        result.pushed++;
      }
    }

    // 2. A share deleted here (or undone) goes there too.
    for (const [debtId, expenseId] of Object.entries(pushed)) {
      if (os.records.get(debtId)) continue;
      await sw.deleteExpense(expenseId).catch(() => {});
      delete pushed[debtId];
      result.removed++;
    }

    // 3. Settled here: one payment there per person, for what was on Splitwise.
    const byPerson = new Map<string, number>();
    for (const debtId of Object.keys(pushed)) {
      if (sent.has(debtId)) continue;
      const d = os.records.get<DebtData>(debtId);
      if (!d || d.status !== 'settled' || !c.people[d.data.personId]) continue;
      byPerson.set(d.data.personId, (byPerson.get(d.data.personId) ?? 0) + signed(d.data));
      sent.add(debtId);
    }
    for (const [personId, amount] of byPerson) {
      if (Math.abs(amount) < 0.01) continue;
      // They owed you and paid: they paid the payment to you.
      const id = await sw.createExpense({ payment: true, creation_method: 'payment', description: 'Payment', cost: money(Math.abs(amount)), currency_code: 'INR', date: new Date(now).toISOString(), group_id: 0, ...shareParams(c.people[personId]!.sw, me.id, Math.abs(amount), amount > 0) });
      ours.add(id);
      result.paidThere++;
    }

    // 4. Payments recorded on Splitwise settle their Debts here.
    const since = c.lastSync ? c.lastSync - 60_000 : now - 7 * 86_400_000;
    for (const e of await sw.expenses(since)) {
      if (!e.payment || e.deleted_at || ours.has(e.id) || e.currency_code !== 'INR') continue;
      ours.add(e.id);
      const payer = e.users.find((u) => Number(u.paid_share) > 0);
      const payee = e.users.find((u) => Number(u.owed_share) > 0);
      if (!payer || !payee) continue;
      const theyPaidMe = payee.user_id === me.id ? personFor(os, payer.user_id) : null;
      const iPaidThem = payer.user_id === me.id ? personFor(os, payee.user_id) : null;
      const personId = theyPaidMe ?? iPaidThem;
      if (!personId) continue;
      const done = settleOldest(os, personId, theyPaidMe ? 'they_owe' : 'i_owe', Number(e.cost));
      for (const id of done) sent.add(id);
      result.settledHere += done.length;
    }

    setSwConfig(os, { pushed, sent: [...sent], ours: [...ours].slice(-2000), lastSync: now });
    return result;
  } catch (e) {
    if (e instanceof SplitwiseError && e.signedOut) setSwConfig(os, { signedOut: true });
    throw e;
  }
}
