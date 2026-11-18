import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { SendAnswer, SourceDef } from '@core/registry/types';
import type { OutboxItem } from '@core/repo/outboxRepo';
import { bus } from '@core/events/bus';
import { balancesOf, owedOf, type Party, type SplitSpec } from '@core/money/split';
import { billInr, entryOf, type BillData } from './bills';

/**
 * Splitwise as a Source of finance (docs/MODEL.md layer 2, *Splitwise: a
 * Group's Bills, kept in step*): a `readings` source that also writes, the
 * Notion pattern. Your API key lives in the phone's secure store. Each linked
 * Splitwise group keeps a LifeOS Group's Bills in step both ways: expenses come
 * in as Bills (who paid how much, each share, exact), Bills added, changed or
 * deleted here go out through the outbox. People are matched once by a hidden
 * `splitwiseId`. Splitwise's version wins when both changed.
 */

export const SPLITWISE_SOURCE = 'splitwise';
export const SPLITWISE_TOKEN = 'finance.splitwise.token';
export const SPLITWISE_BASE = 'https://secure.splitwise.com/api/v3.0';
const SET_ME = 'finance.splitwise.me';
const SET_CURSORS = 'finance.splitwise.cursors';
const SET_LAST = 'finance.splitwise.last';
const SET_BALANCES = 'finance.splitwise.balances';

/* ------------------------------------------------------------------ */
/* The API                                                             */
/* ------------------------------------------------------------------ */

export interface SwUser {
  id: number;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}
export interface SwShare {
  user_id: number;
  user?: SwUser | null;
  paid_share: string;
  owed_share: string;
}
export interface SwExpense {
  id: number;
  group_id: number | null;
  description: string;
  payment: boolean;
  cost: string;
  currency_code: string;
  date: string;
  updated_at: string;
  deleted_at: string | null;
  users: SwShare[];
  category?: { id?: number; name?: string } | null;
}
export interface SwGroup {
  id: number;
  name: string;
  members: Array<SwUser & { balance?: Array<{ currency_code: string; amount: string }> }>;
}

export class SplitwiseError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'SplitwiseError';
  }
}

export class SplitwiseClient {
  constructor(private token: string, private fetchImpl: typeof fetch = fetch, private base = SPLITWISE_BASE) {}

  private async call<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: { authorization: `Bearer ${this.token}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new SplitwiseError(0, `Splitwise isn’t reachable (${(e as Error).message})`);
    }
    if (res.status === 401) throw new SplitwiseError(401, 'Splitwise refused the API key');
    if (!res.ok) throw new SplitwiseError(res.status, `Splitwise ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return (await res.json()) as T;
  }

  async me(): Promise<SwUser> {
    return (await this.call<{ user: SwUser }>('GET', '/get_current_user')).user;
  }
  async groups(): Promise<SwGroup[]> {
    return ((await this.call<{ groups: SwGroup[] }>('GET', '/get_groups')).groups ?? []).filter((g) => g.id !== 0);
  }
  async expenses(groupId: number, updatedAfter?: string): Promise<SwExpense[]> {
    const q = new URLSearchParams({ group_id: String(groupId), limit: '0' });
    if (updatedAfter) q.set('updated_after', updatedAfter);
    return (await this.call<{ expenses: SwExpense[] }>('GET', `/get_expenses?${q}`)).expenses ?? [];
  }
  private static checked(r: { expenses?: SwExpense[]; errors?: Record<string, unknown> | unknown[] }): SwExpense {
    const errs = r.errors && (Array.isArray(r.errors) ? r.errors : Object.values(r.errors)).flat();
    if (errs && errs.length) throw new SplitwiseError(422, `Splitwise said: ${errs.map(String).join('; ').slice(0, 200)}`);
    const e = r.expenses?.[0];
    if (!e) throw new SplitwiseError(422, 'Splitwise sent no expense back');
    return e;
  }
  async create(params: Record<string, unknown>): Promise<SwExpense> {
    return SplitwiseClient.checked(await this.call('POST', '/create_expense', params));
  }
  async update(id: number, params: Record<string, unknown>): Promise<SwExpense> {
    return SplitwiseClient.checked(await this.call('POST', `/update_expense/${id}`, params));
  }
  async remove(id: number): Promise<void> {
    const r = await this.call<{ success?: boolean; errors?: unknown }>('POST', `/delete_expense/${id}`);
    if (r.success === false) throw new SplitwiseError(422, 'Splitwise would not delete it');
  }
}

export async function splitwiseClient(os: LifeOSContext, fetchImpl?: typeof fetch): Promise<SplitwiseClient | null> {
  const token = await os.device?.secrets?.get(SPLITWISE_TOKEN);
  return token ? new SplitwiseClient(token, fetchImpl) : null;
}

/* ------------------------------------------------------------------ */
/* Links: groups, people, you                                          */
/* ------------------------------------------------------------------ */

interface GroupLike {
  name: string;
  kind?: string;
  memberIds: string[];
  splitwiseId?: number;
  splitwiseLinkedAt?: number;
}
interface PersonLike {
  email?: string;
  splitwiseId?: number;
}

export interface SplitwiseLast {
  at: number;
  created: number;
  updated: number;
  deleted: number;
  matched: number;
  error?: string | null;
}

export const splitwiseMe = (os: LifeOSContext) => os.settings.get<{ id: number; name: string } | null>(SET_ME, null);
export const splitwiseLast = (os: LifeOSContext) => os.settings.get<SplitwiseLast | null>(SET_LAST, null);
/** Splitwise's own balances for you in each linked group, as it last said them: group record id → currency → amount (+ owed to you). */
export const splitwiseBalances = (os: LifeOSContext) => os.settings.get<Record<string, Record<string, number>>>(SET_BALANCES, {});

export function linkedGroups(os: LifeOSContext): ObjectRecord<GroupLike>[] {
  if (!os.registry.objects.has('group')) return [];
  return os.records.query<GroupLike>('group', {}, { limit: 2000 }).filter((g) => !g.archived && g.data.splitwiseId);
}
const groupFor = (os: LifeOSContext, swGroupId: number | null | undefined) => (swGroupId ? linkedGroups(os).find((g) => g.data.splitwiseId === swGroupId) ?? null : null);

/** Link a Splitwise group to a LifeOS Group (a new one when `groupId` is null); returns the Group's id. */
export function linkGroup(os: LifeOSContext, sw: Pick<SwGroup, 'id' | 'name'>, groupId: string | null): string {
  for (const g of linkedGroups(os)) if (g.data.splitwiseId === sw.id && g.id !== groupId) os.records.update(g.id, { data: { splitwiseId: undefined, splitwiseLinkedAt: undefined } }, 'user');
  const id = groupId ?? os.records.create({ object: 'group', title: sw.name, data: { name: sw.name, memberIds: [] } }, 'user').id;
  os.records.update(id, { data: { splitwiseId: sw.id, splitwiseLinkedAt: Date.now() } }, 'user');
  const cursors = { ...os.settings.get<Record<string, string>>(SET_CURSORS, {}) };
  delete cursors[String(sw.id)];
  os.settings.set(SET_CURSORS, cursors);
  return id;
}
export function unlinkGroup(os: LifeOSContext, groupId: string) {
  const g = os.records.get<GroupLike>(groupId);
  if (!g?.data.splitwiseId) return;
  const cursors = { ...os.settings.get<Record<string, string>>(SET_CURSORS, {}) };
  delete cursors[String(g.data.splitwiseId)];
  os.settings.set(SET_CURSORS, cursors);
  os.records.update(groupId, { data: { splitwiseId: undefined, splitwiseLinkedAt: undefined } }, 'user');
}

const fullName = (u: SwUser) => [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || 'Someone';

/** The party a Splitwise user is: you, or a Person matched by Splitwise id, email, whole name or a first name only one has; else a new Person. */
export function partyFor(os: LifeOSContext, u: SwUser, meId: number): Party {
  if (u.id === meId) return 'me';
  const people = os.registry.objects.has('person') ? os.records.query<PersonLike>('person', {}, { limit: 5000 }).filter((p) => !p.archived) : [];
  const byId = people.find((p) => Number(p.data.splitwiseId) === u.id);
  if (byId) return byId.id;
  const name = fullName(u).toLowerCase();
  const first = (u.first_name ?? '').trim().toLowerCase();
  const byEmail = u.email ? people.find((p) => p.data.email?.toLowerCase() === u.email!.toLowerCase()) : undefined;
  const byName = people.find((p) => p.title.toLowerCase() === name);
  const firsts = first ? people.filter((p) => p.title.toLowerCase().split(/\s+/)[0] === first && !p.data.splitwiseId) : [];
  const hit = byEmail ?? byName ?? (firsts.length === 1 ? firsts[0] : undefined);
  if (hit) {
    os.records.update(hit.id, { data: { splitwiseId: u.id } }, 'system');
    return hit.id;
  }
  if (!os.registry.objects.has('person')) return `splitwise:${u.id}`;
  return os.records.create({ object: 'person', title: fullName(u), data: { splitwiseId: u.id, ...(u.email ? { email: u.email } : {}) } }, 'system').id;
}

/* ------------------------------------------------------------------ */
/* Coming in                                                           */
/* ------------------------------------------------------------------ */

const CATEGORY: Array<[RegExp, string]> = [
  [/plane|flight/i, 'flights'],
  [/hotel|lodging|accommodation/i, 'stays'],
  [/taxi|bus|train|car|parking|gas|fuel|transport/i, 'transport'],
  [/dining|food|groceries|restaurant|liquor|drink/i, 'food'],
  [/entertainment|games|movies|music|sports|fun/i, 'fun'],
  [/clothing|electronics|gifts|household|shopping|furniture/i, 'shopping'],
];
const categoryOf = (e: SwExpense) => (e.payment ? undefined : CATEGORY.find(([re]) => re.test(e.category?.name ?? ''))?.[1] ?? 'other');
const r2 = (n: number) => Math.round(n * 100) / 100;

/** A Splitwise expense as a Bill's data (the parties already resolved). */
export function billFromExpense(e: SwExpense, party: (u: SwUser) => Party, ctx: { groupId: string; tripId?: string; rateFor?: (cur: string) => number | null }): Partial<BillData> & Pick<BillData, 'kind' | 'amount' | 'currency' | 'date' | 'split'> {
  const payers: Record<Party, number> = {};
  const shares: Record<Party, number> = {};
  for (const s of e.users ?? []) {
    const p = party(s.user ?? { id: s.user_id });
    const paid = Number(s.paid_share) || 0;
    const owed = Number(s.owed_share) || 0;
    if (paid > 0) payers[p] = r2((payers[p] ?? 0) + paid);
    if (owed > 0) shares[p] = r2((shares[p] ?? 0) + owed);
  }
  const amount = Number(e.cost) || 0;
  const currency = (e.currency_code || 'INR').toUpperCase();
  const rate = currency === 'INR' ? undefined : ctx.rateFor?.(currency) ?? undefined;
  const data = {
    kind: e.payment ? ('payment' as const) : ('spend' as const),
    amount,
    currency,
    date: (e.date ?? '').slice(0, 10),
    split: { payers, method: 'exact' as const, shares },
    groupId: ctx.groupId,
    ...(ctx.tripId ? { tripId: ctx.tripId } : {}),
    ...(rate ? { rate } : {}),
    ...(categoryOf(e) ? { category: categoryOf(e) } : {}),
    splitwiseId: e.id,
    splitwiseAt: e.updated_at,
  };
  return { ...data, inr: billInr({ amount, currency, rate }) };
}

let pulling = false;

const tripOfGroup = (os: LifeOSContext, groupId: string) =>
  os.registry.objects.has('trip') ? os.records.query<{ groupId?: string; localCurrency?: string; fxRate?: number }>('trip', { filter: { and: [{ field: 'data.groupId', op: 'eq', value: groupId }] } }, { limit: 1 })[0] ?? null : null;

const billsIn = (os: LifeOSContext, groupId: string) => os.records.query<BillData>('bill', { filter: { and: [{ field: 'data.groupId', op: 'eq', value: groupId }] } }, { limit: 5000 }).filter((b) => !b.archived);

/** The first link: a Bill here and an expense there with the same kind, currency, amount (within ₹0.50) and a date within three days are the same. */
export function sameBill(b: Pick<ObjectRecord<BillData>, 'data'>, e: SwExpense): boolean {
  if (b.data.splitwiseId) return false;
  if ((b.data.kind === 'payment') !== !!e.payment) return false;
  if ((b.data.currency || 'INR').toUpperCase() !== (e.currency_code || 'INR').toUpperCase()) return false;
  if (Math.abs(b.data.amount - Number(e.cost)) > 0.5) return false;
  const d = Math.abs(Date.parse(`${b.data.date}T12:00:00Z`) - Date.parse(`${(e.date ?? '').slice(0, 10)}T12:00:00Z`));
  return d <= 3 * 86_400_000;
}

export async function syncSplitwise(os: LifeOSContext, client?: SplitwiseClient | null): Promise<SplitwiseLast> {
  const c = client ?? (await splitwiseClient(os));
  const last: SplitwiseLast = { at: Date.now(), created: 0, updated: 0, deleted: 0, matched: 0, error: null };
  if (!c) return last;
  try {
    let me = splitwiseMe(os);
    if (!me) {
      const u = await c.me();
      me = { id: u.id, name: fullName(u) };
      os.settings.set(SET_ME, me);
    }
    const groups = linkedGroups(os);
    const cursors = { ...os.settings.get<Record<string, string>>(SET_CURSORS, {}) };
    const swGroups = groups.length ? await c.groups() : [];
    const balances: Record<string, Record<string, number>> = {};
    pulling = true;
    for (const g of groups) {
      const swId = g.data.splitwiseId!;
      const sw = swGroups.find((x) => x.id === swId);
      const mine = sw?.members.find((m) => m.id === me!.id);
      if (mine) balances[g.id] = Object.fromEntries((mine.balance ?? []).map((b) => [b.currency_code, Number(b.amount) || 0]));
      const trip = tripOfGroup(os, g.id);
      const rateFor = (cur: string) => (trip && trip.data.localCurrency === cur && trip.data.fxRate ? trip.data.fxRate : null);
      const first = !cursors[String(swId)];
      const list = await c.expenses(swId, cursors[String(swId)]);
      const local = billsIn(os, g.id);
      const members = new Set(g.data.memberIds ?? []);
      for (const e of list) {
        const mineBill = local.find((b) => b.data.splitwiseId === e.id);
        if (e.deleted_at) {
          if (mineBill) {
            os.records.delete(mineBill.id, 'system');
            last.deleted += 1;
          }
          continue;
        }
        const data = billFromExpense(e, (u) => {
          const p = partyFor(os, u, me!.id);
          if (p !== 'me') members.add(p);
          return p;
        }, { groupId: g.id, tripId: trip?.id, rateFor });
        const twin = mineBill ?? (first ? local.find((b) => sameBill(b, e)) : undefined);
        if (twin) {
          if (twin.data.splitwiseAt === e.updated_at) continue;
          os.records.update<BillData>(twin.id, { title: e.description || twin.title, data }, 'system');
          if (mineBill) last.updated += 1;
          else last.matched += 1;
        } else {
          os.records.create<BillData>({ object: 'bill', title: e.description || 'A Splitwise expense', data: data as BillData, occurredAt: Date.parse(`${data.date}T12:00:00`) || Date.now() }, 'system');
          last.created += 1;
        }
      }
      if ([...members].some((m) => !(g.data.memberIds ?? []).includes(m))) os.records.update(g.id, { data: { memberIds: [...members] } }, 'system');
      const newest = list.reduce((a, e) => (e.updated_at > a ? e.updated_at : a), cursors[String(swId)] ?? '');
      if (newest) cursors[String(swId)] = newest;
    }
    os.settings.set(SET_CURSORS, cursors);
    os.settings.set(SET_BALANCES, balances);
  } catch (e) {
    last.error = (e as Error).message;
    throw e;
  } finally {
    pulling = false;
    os.settings.set(SET_LAST, last);
  }
  return last;
}

/* ------------------------------------------------------------------ */
/* Going out                                                           */
/* ------------------------------------------------------------------ */

export interface SplitwisePayload {
  op: 'create' | 'update' | 'delete';
  billId: string;
  splitwiseId?: number;
}

/** A Bill as Splitwise's create / update parameters, or why it cannot go. */
export function expenseParams(os: LifeOSContext, b: ObjectRecord<BillData>, swGroupId: number, meId: number): { ok: true; params: Record<string, unknown> } | { ok: false; why: string } {
  const amount = r2(b.data.amount);
  const owed = owedOf(amount, b.data.split);
  const paid = b.data.split.payers;
  const parties = [...new Set([...Object.keys(paid), ...Object.keys(owed)])];
  const users: Array<{ id: number; paid: number; owed: number }> = [];
  for (const p of parties) {
    const id = p === 'me' ? meId : Number(os.records.get<PersonLike>(p)?.data.splitwiseId);
    if (!id) return { ok: false, why: `${os.records.get(p)?.title ?? 'Someone'} isn’t a Splitwise friend in this group` };
    users.push({ id, paid: r2(paid[p] ?? 0), owed: r2(owed[p] ?? 0) });
  }
  // Splitwise wants the shares to add up to the cost to the paisa.
  const fix = (k: 'paid' | 'owed') => {
    const diff = r2(amount - users.reduce((a, u) => a + u[k], 0));
    const at = users.findIndex((u) => u[k] > 0);
    if (diff && at >= 0) users[at]![k] = r2(users[at]![k] + diff);
  };
  fix('paid');
  fix('owed');
  const params: Record<string, unknown> = { cost: amount.toFixed(2), description: b.title, currency_code: b.data.currency || 'INR', date: `${b.data.date}T12:00:00Z`, group_id: swGroupId, payment: b.data.kind === 'payment' };
  users.forEach((u, i) => {
    params[`users__${i}__user_id`] = u.id;
    params[`users__${i}__paid_share`] = u.paid.toFixed(2);
    params[`users__${i}__owed_share`] = u.owed.toFixed(2);
  });
  return { ok: true, params };
}

function queue(os: LifeOSContext, payload: SplitwisePayload, label: string) {
  const waiting = os.outbox.forRecord(payload.billId).filter((i) => i.source === SPLITWISE_SOURCE && i.state === 'waiting');
  if (waiting.some((i) => (i.payload as SplitwisePayload).op === payload.op || ((i.payload as SplitwisePayload).op === 'create' && payload.op === 'update'))) return null;
  return os.outbox.add({ source: SPLITWISE_SOURCE, payload, label, recordId: payload.billId });
}

/** Queue the Bills that were in a Group before it was linked and are not in Splitwise yet. */
export function sendOlderBills(os: LifeOSContext, groupId: string): number {
  const g = os.records.get<GroupLike>(groupId);
  if (!g?.data.splitwiseId) return 0;
  let n = 0;
  for (const b of billsIn(os, groupId)) if (!b.data.splitwiseId && queue(os, { op: 'create', billId: b.id }, `${b.title} · to Splitwise`)) n += 1;
  return n;
}
/** Bills in a linked Group that Splitwise does not have (made before the link). */
export const olderBills = (os: LifeOSContext, groupId: string) => billsIn(os, groupId).filter((b) => !b.data.splitwiseId && !os.outbox.forRecord(b.id).some((i) => i.source === SPLITWISE_SOURCE));

export async function sendSplitwise(os: LifeOSContext, items: OutboxItem[], client?: SplitwiseClient | null): Promise<SendAnswer[]> {
  const c = client ?? (await splitwiseClient(os));
  if (!c) return items.map((i) => ({ id: i.id, state: 'waiting' as const }));
  let me = splitwiseMe(os);
  const out: SendAnswer[] = [];
  for (const item of items) {
    const p = item.payload as SplitwisePayload;
    try {
      if (!me) {
        const u = await c.me();
        me = { id: u.id, name: fullName(u) };
        os.settings.set(SET_ME, me);
      }
      if (p.op === 'delete') {
        if (p.splitwiseId) await c.remove(p.splitwiseId);
        out.push({ id: item.id, state: 'sent' });
        continue;
      }
      const b = os.records.get<BillData>(p.billId);
      if (!b || b.archived) {
        out.push({ id: item.id, state: 'sent' });
        continue;
      }
      const g = b.data.groupId ? os.records.get<GroupLike>(b.data.groupId) : null;
      if (!g?.data.splitwiseId) {
        out.push({ id: item.id, state: 'refused', error: 'Its group is not linked to Splitwise' });
        continue;
      }
      const ex = expenseParams(os, b, g.data.splitwiseId, me.id);
      if (!ex.ok) {
        out.push({ id: item.id, state: 'refused', error: ex.why });
        continue;
      }
      const e = b.data.splitwiseId ? await c.update(b.data.splitwiseId, ex.params) : await c.create(ex.params);
      pulling = true;
      try {
        os.records.update<BillData>(b.id, { data: { splitwiseId: e.id, splitwiseAt: e.updated_at } }, 'system');
      } finally {
        pulling = false;
      }
      out.push({ id: item.id, state: 'sent', result: { splitwiseId: e.id } });
    } catch (e) {
      const err = e as SplitwiseError;
      out.push({ id: item.id, state: err.status === 422 || err.status === 400 || err.status === 403 || err.status === 404 ? 'refused' : 'waiting', error: err.message });
    }
  }
  return out;
}

/** Bills added, changed or deleted here in a linked Group go to Splitwise (not what the sync itself wrote). */
export function listenForSplitwise(os: LifeOSContext): () => void {
  const linked = (b: ObjectRecord<BillData>) => !pulling && b.object === 'bill' && !!b.data.groupId && !!os.records.get<GroupLike>(b.data.groupId)?.data.splitwiseId;
  const offs = [
    bus.on('entity.created', ({ entity }) => {
      const b = entity as unknown as ObjectRecord<BillData>;
      if (linked(b) && !b.data.splitwiseId) queue(os, { op: 'create', billId: b.id }, `${b.title} · to Splitwise`);
    }),
    bus.on('entity.updated', ({ entity, changed }) => {
      const b = entity as unknown as ObjectRecord<BillData>;
      if (!linked(b) || !b.data.splitwiseId) return;
      if ((changed ?? []).every((k: string) => /splitwise/i.test(k))) return;
      queue(os, { op: 'update', billId: b.id, splitwiseId: b.data.splitwiseId }, `${b.title} · to Splitwise`);
    }),
    bus.on('entity.deleted', ({ entity }) => {
      const b = entity as unknown as ObjectRecord<BillData>;
      if (linked(b) && b.data.splitwiseId) queue(os, { op: 'delete', billId: b.id, splitwiseId: b.data.splitwiseId }, `${b.title} · deleted · to Splitwise`);
    }),
  ];
  return () => offs.forEach((f) => f());
}

/** LifeOS's own balance for you in a Group, from its Bills, in ₹ (+ owed to you). */
export function lifeosBalance(os: LifeOSContext, groupId: string): number {
  return balancesOf(billsIn(os, groupId).map(entryOf)).net.me ?? 0;
}

export const splitwiseSource: SourceDef = {
  id: SPLITWISE_SOURCE,
  label: 'Splitwise',
  modules: ['finance'],
  permission: 'Splitwise API key',
  kind: 'readings',
  available: async (os) => !!(await os.device?.secrets?.get(SPLITWISE_TOKEN)) && linkedGroups(os).length > 0,
  sync: async (os) => {
    const r = await syncSplitwise(os);
    return { filed: r.created + r.updated + r.deleted + r.matched, cursor: String(Date.now()) };
  },
  send: (os, items) => sendSplitwise(os, items),
};

export type { SplitSpec };
