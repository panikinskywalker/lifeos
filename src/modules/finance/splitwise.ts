import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { owedOf } from '@core/money/split';
import { billInr, billsOf, type BillData } from './bills';
import { applyPayment, type DebtData } from './split';

/**
 * Splitwise, kept in step (docs/MODEL.md, Splitwise and settling up). You sign
 * in on Splitwise's own page inside LifeOS; the session lives in the phone's
 * cookie store, which `fetch` shares, so calls go to Splitwise's API as the
 * website makes them (a CSRF token read from the page for writes). Only
 * linked people sync: a new Debt or Bill with them becomes a Splitwise expense
 * (in the mapped Splitwise group, else between you), one deleted here is
 * deleted there, a settle-up or a payment from them here is a payment there,
 * and a payment recorded there settles what is open here.
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
  group_id?: number | null;
  updated_at?: string;
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
  /** Debt → the amount that went to Splitwise, so its payment is that amount (a Turf share's amount drops as part payments come). */
  amounts?: Record<string, number>;
  /** Settled Debts whose payment is on Splitwise (or came from it). */
  sent: string[];
  /** Expenses LifeOS made, so a sync never reads its own payments back. */
  ours: number[];
  /** Bill → the Splitwise expense it is kept in step with, and what it looked like when sent (a trip's or a group's Bills, in a group mapped to a Splitwise group). */
  bills?: Record<string, { id: number; sig: string }>;
  /** Mapped groups whose Splitwise expenses were already matched once (so the first sync never doubles what both have). */
  billGroupsSeen?: string[];
  /** When a mapped group's Splitwise expenses were last read. */
  billsReadAt?: number;
  /** Payments noted here for what is owed only on Splitwise (+ they paid you), sent at the next sync. */
  toSend?: Array<{ debtId: string; personId: string; amount: number }>;
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
  os.settings.set(KEY, { ...EMPTY, people: c.people, groups: c.groups, auto: c.auto, pushed: c.pushed, sent: c.sent, ours: c.ours, bills: c.bills, billGroupsSeen: c.billGroupsSeen, toSend: c.toSend });
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
  groupExpenses(groupId: number, updatedAfter?: number) {
    return this.api<{ expenses: SwExpense[] }>('get_expenses', { group_id: groupId, limit: 0, updated_after: updatedAfter ? new Date(updatedAfter).toISOString() : undefined }).then((r) => r.expenses ?? []);
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

/* ------------------------------------------------------------------ */
/* A trip's (or any group's) Bills, in a group mapped to Splitwise     */
/* ------------------------------------------------------------------ */

const r2 = (n: number) => Math.round(n * 100) / 100;
/** What a Bill looks like to Splitwise: when it changes, the expense is made again. */
export const billSig = (b: ObjectRecord<BillData>) => JSON.stringify([b.title, b.data.kind, r2(b.data.amount), b.data.currency, b.data.date, b.data.split]);

/** A Bill's people in Splitwise's shape (each one's paid and owed share, to the paisa), or null when someone in it is not linked. */
export function billUsers(b: ObjectRecord<BillData>, meId: number, people: SwConfig['people']): Record<string, string> | null {
  const amount = r2(b.data.amount);
  const owed = owedOf(amount, b.data.split);
  const paid = b.data.split.payers;
  const parties = [...new Set([...Object.keys(paid), ...Object.keys(owed)])];
  const rows: Array<{ id: number; paid: number; owed: number }> = [];
  for (const p of parties) {
    const id = p === 'me' ? meId : people[p]?.sw;
    if (!id) return null;
    rows.push({ id, paid: r2(paid[p] ?? 0), owed: r2(owed[p] ?? 0) });
  }
  for (const k of ['paid', 'owed'] as const) {
    const diff = r2(amount - rows.reduce((n, r) => n + r[k], 0));
    const at = rows.findIndex((r) => r[k] > 0);
    if (diff && at >= 0) rows[at]![k] = r2(rows[at]![k] + diff);
  }
  const out: Record<string, string> = {};
  rows.forEach((r, i) => {
    out[`users__${i}__user_id`] = String(r.id);
    out[`users__${i}__paid_share`] = money(r.paid);
    out[`users__${i}__owed_share`] = money(r.owed);
  });
  return out;
}

/** The first sync of a mapped group: a Bill and a Splitwise expense with the same kind, currency, amount (within 0.50) and a date within three days are the same. */
export function sameExpense(b: ObjectRecord<BillData>, e: SwExpense): boolean {
  if ((b.data.kind === 'payment') !== !!e.payment) return false;
  if ((b.data.currency || 'INR').toUpperCase() !== (e.currency_code || 'INR').toUpperCase()) return false;
  if (Math.abs(b.data.amount - Number(e.cost)) > 0.5) return false;
  return Math.abs(Date.parse(`${b.data.date}T12:00:00Z`) - Date.parse(`${(e.date ?? '').slice(0, 10)}T12:00:00Z`)) <= 3 * 86_400_000;
}

/** A Splitwise expense as a Bill's data, when everyone in it is you or linked; else null. */
export function billFromExpense(e: SwExpense, meId: number, people: SwConfig['people'], groupId: string, trip?: { id: string; localCurrency?: string; fxRate?: number } | null): Pick<BillData, 'kind' | 'amount' | 'currency' | 'date' | 'split' | 'groupId'> & Partial<BillData> | null {
  const byId = new Map(Object.entries(people).map(([pid, v]) => [v.sw, pid]));
  const payers: Record<string, number> = {};
  const shares: Record<string, number> = {};
  for (const u of e.users ?? []) {
    const party = u.user_id === meId ? 'me' : byId.get(u.user_id);
    if (!party) return null;
    const pd = Number(u.paid_share) || 0;
    const ow = Number(u.owed_share) || 0;
    if (pd > 0) payers[party] = r2((payers[party] ?? 0) + pd);
    if (ow > 0) shares[party] = r2((shares[party] ?? 0) + ow);
  }
  const amount = Number(e.cost) || 0;
  const currency = (e.currency_code || 'INR').toUpperCase();
  const rate = currency !== 'INR' && trip?.localCurrency === currency ? trip.fxRate : undefined;
  return { kind: e.payment ? 'payment' : 'spend', amount, currency, date: (e.date ?? '').slice(0, 10), split: { payers, method: 'exact', shares }, groupId, ...(trip ? { tripId: trip.id } : {}), ...(rate ? { rate } : {}), inr: billInr({ amount, currency, rate }) };
}

/**
 * A group mapped to a Splitwise group keeps its Bills in step (a trip's
 * expenses and paybacks): each Bill goes there with who paid and each share;
 * a changed one is made again, a deleted one deleted; the first time, what
 * both already have is matched, never doubled; expenses added on Splitwise
 * come in as Bills. A Bill with someone not linked waits until they are.
 */
async function syncBills(os: LifeOSContext, sw: SplitwiseClient, c: SwConfig, me: { id: number }, ours: Set<number>, result: SyncResult, now: number) {
  const bills = { ...(c.bills ?? {}) };
  const seen = new Set(c.billGroupsSeen ?? []);
  const tracked = new Set(Object.values(bills).map((v) => v.id));
  result.billsSent = 0;
  result.billsMatched = 0;
  result.billsIn = 0;
  result.billsHeld = 0;
  const send = async (b: ObjectRecord<BillData>, swGroup: number) => {
    const users = billUsers(b, me.id, c.people);
    if (!users) {
      result.billsHeld!++;
      return;
    }
    const prev = bills[b.id];
    if (prev) await sw.deleteExpense(prev.id).catch(() => {});
    const id = await sw.createExpense({ cost: money(r2(b.data.amount)), description: b.title.slice(0, 100), currency_code: (b.data.currency || 'INR').toUpperCase(), date: new Date(`${b.data.date}T12:00:00`).toISOString(), group_id: swGroup, payment: b.data.kind === 'payment', ...users });
    bills[b.id] = { id, sig: billSig(b) };
    tracked.add(id);
    ours.add(id);
    result.billsSent!++;
  };
  for (const [groupId, swGroup] of Object.entries(c.groups)) {
    if (!swGroup) continue;
    const local = billsOf(os, { groupId });
    const first = !seen.has(groupId);
    const theirs = await sw.groupExpenses(swGroup, first ? undefined : c.billsReadAt ? c.billsReadAt - 60_000 : undefined);
    const used = new Set<number>();
    // Out: new and changed Bills.
    for (const b of local) {
      const sig = billSig(b);
      const prev = bills[b.id];
      if (prev && prev.sig === sig) continue;
      if (!prev && first) {
        const twin = theirs.find((e) => !e.deleted_at && !used.has(e.id) && !tracked.has(e.id) && sameExpense(b, e));
        if (twin) {
          used.add(twin.id);
          bills[b.id] = { id: twin.id, sig };
          tracked.add(twin.id);
          ours.add(twin.id);
          result.billsMatched!++;
          continue;
        }
      }
      await send(b, swGroup);
    }
    // In: expenses added (or deleted) on Splitwise.
    const trip = os.registry.objects.has('trip') ? os.records.query<{ localCurrency?: string; fxRate?: number }>('trip', { filter: { and: [{ field: 'data.groupId', op: 'eq', value: groupId }] } }, { limit: 1 })[0] : undefined;
    for (const e of theirs) {
      const mine = Object.entries(bills).find(([, v]) => v.id === e.id)?.[0];
      if (e.deleted_at) {
        if (mine) {
          os.records.delete(mine, 'system');
          delete bills[mine];
        }
        continue;
      }
      if (mine || ours.has(e.id) || used.has(e.id)) continue;
      const data = billFromExpense(e, me.id, c.people, groupId, trip ? { id: trip.id, localCurrency: trip.data.localCurrency, fxRate: trip.data.fxRate } : null);
      if (!data) continue;
      const b = os.records.create<BillData>({ object: 'bill', title: e.description || 'A Splitwise expense', data: data as BillData }, 'system');
      bills[b.id] = { id: e.id, sig: billSig(b) };
      ours.add(e.id);
      result.billsIn!++;
    }
    seen.add(groupId);
  }
  // Any other Bill (a trip or a group not mapped, a payback) with only linked people, made after the last of them was linked: an expense between you.
  if (c.auto) {
    for (const b of billsOf(os)) {
      if ((b.data.groupId && c.groups[b.data.groupId]) || bills[b.id]?.sig === billSig(b)) continue;
      const others = [...new Set([...Object.keys(b.data.split.payers), ...Object.keys(owedOf(b.data.amount, b.data.split))])].filter((p) => p !== 'me');
      if (others.length && others.every((p) => c.people[p] && b.createdAt >= c.people[p]!.at)) await send(b, 0);
    }
  }
  // A Bill deleted here goes there too.
  for (const [billId, v] of Object.entries(bills)) {
    const b = os.records.get(billId);
    if (b && !b.archived) continue;
    await sw.deleteExpense(v.id).catch(() => {});
    delete bills[billId];
    result.removed++;
  }
  return { bills, billGroupsSeen: [...seen], billsReadAt: now };
}

export interface SyncResult {
  pushed: number;
  removed: number;
  paidThere: number;
  settledHere: number;
  /** Bills (a mapped group's, or between you): sent, matched with what Splitwise had, brought in, and held back (someone in them not linked). */
  billsSent?: number;
  billsMatched?: number;
  billsIn?: number;
  billsHeld?: number;
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
    const amounts = { ...(c.amounts ?? {}) };
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
        amounts[d.id] = d.data.amount;
        ours.add(id);
        result.pushed++;
      }
    }

    // 2. A share deleted here (or undone) goes there too.
    for (const [debtId, expenseId] of Object.entries(pushed)) {
      if (os.records.get(debtId)) continue;
      await sw.deleteExpense(expenseId).catch(() => {});
      delete pushed[debtId];
      delete amounts[debtId];
      result.removed++;
    }

    // 3. Settled here: one payment there per person, for what was on Splitwise.
    const byPerson = new Map<string, number>();
    for (const debtId of Object.keys(pushed)) {
      if (sent.has(debtId)) continue;
      const d = os.records.get<DebtData>(debtId);
      if (!d || d.status !== 'settled' || !c.people[d.data.personId]) continue;
      const sentAmount = amounts[debtId] ?? d.data.amount;
      byPerson.set(d.data.personId, (byPerson.get(d.data.personId) ?? 0) + (d.data.direction === 'they_owe' ? sentAmount : -sentAmount));
      sent.add(debtId);
    }
    for (const [personId, amount] of byPerson) {
      if (Math.abs(amount) < 0.01) continue;
      // They owed you and paid: they paid the payment to you.
      const id = await sw.createExpense({ payment: true, creation_method: 'payment', description: 'Payment', cost: money(Math.abs(amount)), currency_code: 'INR', date: new Date(now).toISOString(), group_id: 0, ...shareParams(c.people[personId]!.sw, me.id, Math.abs(amount), amount > 0) });
      ours.add(id);
      result.paidThere++;
    }
    // Payments noted here for what was owed only on Splitwise (undone ones are dropped).
    const queued = c.toSend ?? [];
    for (const q of queued) {
      const link = c.people[q.personId];
      if (!link || !os.records.get(q.debtId)) continue;
      const id = await sw.createExpense({ payment: true, creation_method: 'payment', description: 'Payment', cost: money(Math.abs(q.amount)), currency_code: 'INR', date: new Date(now).toISOString(), group_id: 0, ...shareParams(link.sw, me.id, Math.abs(q.amount), q.amount > 0) });
      ours.add(id);
      result.paidThere++;
    }

    // 3b. A trip's or a group's Bills, in a group mapped to a Splitwise group.
    const billState = await syncBills(os, sw, c, me, ours, result, now);

    // 4. Payments recorded on Splitwise settle what is open here, Debts then Bills (a mapped group's payments are its Bills, above).
    const mapped = new Set(Object.values(c.groups));
    const since = c.lastSync ? c.lastSync - 60_000 : now - 7 * 86_400_000;
    for (const e of await sw.expenses(since)) {
      if (!e.payment || e.deleted_at || ours.has(e.id) || e.currency_code !== 'INR' || (e.group_id && mapped.has(e.group_id))) continue;
      ours.add(e.id);
      const payer = e.users.find((u) => Number(u.paid_share) > 0);
      const payee = e.users.find((u) => Number(u.owed_share) > 0);
      if (!payer || !payee) continue;
      const theyPaidMe = payee.user_id === me.id ? personFor(os, payer.user_id) : null;
      const iPaidThem = payer.user_id === me.id ? personFor(os, payee.user_id) : null;
      const personId = theyPaidMe ?? iPaidThem;
      if (!personId) continue;
      const done = applyPayment(os, personId, theyPaidMe ? 'they_owe' : 'i_owe', Number(e.cost), (e.date ?? '').slice(0, 10) || new Date(now).toISOString().slice(0, 10));
      for (const id of done.settled) sent.add(id);
      // A payback Bill made for it is this payment, so it is never sent back.
      const bill = done.billId ? os.records.get<BillData>(done.billId) : null;
      if (bill) billState.bills[bill.id] = { id: e.id, sig: billSig(bill) };
      result.settledHere += done.settled.length + (bill ? 1 : 0);
    }

    const sentQueue = new Set(queued.map((q) => q.debtId));
    setSwConfig(os, { pushed, amounts, sent: [...sent], ours: [...ours].slice(-2000), lastSync: now, ...billState, toSend: (swConfig(os).toSend ?? []).filter((q) => !sentQueue.has(q.debtId)) });
    return result;
  } catch (e) {
    if (e instanceof SplitwiseError && e.signedOut) setSwConfig(os, { signedOut: true });
    throw e;
  }
}
