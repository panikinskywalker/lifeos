import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { FileContext, FileOutcome, RawMessage } from '@core/filing/contract';
import type { SubscriptionData, TransactionData } from '../types';
import type { UpcomingCharge } from './bankSms';
import { toInr } from './fx';

/**
 * Money on its own (docs/MODEL.md, phase D, 2 to 4): heads-ups before a charge
 * set a Subscription's next charge; a new price is noted and asked about; three
 * payments a month apart to one payee offer to become a Subscription.
 */

export const SPOTTED_SUB = 'spotted-sub';
/** Payees you said are not subscriptions (normalised names). */
export const NOT_SUB_KEY = 'finance.notSubscriptions';

const DAY = 86_400_000;
export const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const iso = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const addMonths = (day: string, n = 1) => {
  const d = new Date(`${day}T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return iso(d.getTime());
};
export const perYear = (rrule = '') => (/YEARLY/.test(rrule) ? 1 : /WEEKLY/.test(rrule) ? 52 : 12 / Number(/MONTHLY;INTERVAL=(\d+)/.exec(rrule)?.[1] ?? 1));

/** The Subscription a payee's name belongs to (not a cancelled one): the same name, or one is the start of the other. */
export function findSubscription(os: LifeOSContext, name: string): ObjectRecord<SubscriptionData> | null {
  if (!os.registry.objects.has('subscription')) return null;
  const key = normName(name);
  if (!key) return null;
  return os.records.query<SubscriptionData>('subscription', {}, { limit: 1000 }).find((s) => s.status !== 'cancelled' && !s.data.bill && (normName(s.data.name) === key || normName(s.data.name).startsWith(`${key} `) || key.startsWith(`${normName(s.data.name)} `))) ?? null;
}

/**
 * A charge or heads-up at a price: the Subscription takes it, and a change of 2%
 * or more (in its own currency when it is foreign) joins its price history; the
 * brain says so in To check and the morning brief (financeBrain). Returns the
 * patch to apply.
 */
export function notePrice(sub: ObjectRecord<SubscriptionData>, amount: number, foreign: { amount: number; currency: string } | undefined, date: string): Partial<SubscriptionData> {
  const d = sub.data;
  const [was, now] = foreign && d.foreign?.currency === foreign.currency ? [d.foreign.amount, foreign.amount] : foreign || d.foreign ? [0, 0] : [d.amount, amount];
  const patch: Partial<SubscriptionData> = {};
  if (Math.abs(d.amount - amount) >= 0.01) patch.amount = amount;
  if (foreign && (d.foreign?.amount !== foreign.amount || d.foreign.currency !== foreign.currency)) patch.foreign = foreign;
  if (was > 0 && Math.abs(now - was) / was >= 0.02) {
    const history = d.priceHistory?.length ? d.priceHistory : [{ amount: d.amount, from: iso(sub.createdAt) }];
    patch.priceHistory = [...history, { amount, from: date }];
  }
  return patch;
}

/** A heads-up before a charge: that Subscription's next charge and amount (made if new, auto-post off: the charge text follows). */
export function fileHeadsUp(os: LifeOSContext, m: RawMessage, u: UpcomingCharge, ctx: FileContext): FileOutcome {
  if (!os.registry.objects.has('subscription') || !u.dueOn) return { status: 'dismissed', note: 'a heads-up with no day' };
  const inr = u.currency === 'INR' ? u.amount : toInr(os, u.amount, u.currency)?.inr;
  const foreign = u.currency === 'INR' ? undefined : { amount: u.amount, currency: u.currency };
  const due = new Date(`${u.dueOn}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const sub = findSubscription(os, u.merchant);
  if (!sub) {
    if (inr == null) return { status: 'dismissed', note: `no ${u.currency} rate yet` };
    const s = os.records.create<SubscriptionData>({ object: 'subscription', data: { name: u.merchant, amount: inr, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: u.dueOn, category: 'subscriptions', autoPost: false, foreign } }, 'assistant');
    os.filings.add({ source: m.source, sourceRef: ctx.id, kind: 'subscription', action: 'created', entityId: s.id, label: `Subscription: ${u.merchant} · ${os.format.currency(inr)} on ${due}` });
    return { status: 'confirmed', entityId: s.id };
  }
  const before = { amount: sub.data.amount, nextBillingAt: sub.data.nextBillingAt, foreign: sub.data.foreign, priceHistory: sub.data.priceHistory };
  const patch = inr == null ? {} : notePrice(sub, inr, foreign, u.dueOn);
  os.records.update(sub.id, { data: { ...patch, nextBillingAt: u.dueOn } }, 'assistant');
  os.filings.add({ source: m.source, sourceRef: ctx.id, kind: 'subscription', action: 'updated', entityId: sub.id, label: `${sub.data.name} · ${os.format.currency(inr ?? sub.data.amount)} on ${due}`, before });
  return { status: 'confirmed', entityId: sub.id };
}

/**
 * Three payments to one payee, within 5% of the same amount, 25 to 35 days
 * apart, with no Subscription for it: asked once in To check. Looks at the
 * payments to this one's payee.
 */
export function spotSubscription(os: LifeOSContext, txId: string): boolean {
  const tx = os.records.get<TransactionData>(txId);
  if (!tx || tx.data.kind !== 'expense' || !tx.data.merchant || !os.registry.objects.has('subscription')) return false;
  const key = normName(tx.data.merchant);
  if (!key || os.settings.get<string[]>(NOT_SUB_KEY, []).includes(key) || findSubscription(os, tx.data.merchant)) return false;
  if (os.filings.ofKind(SPOTTED_SUB, { limit: 500 }).some((f) => f.sourceRef === key && !f.undone)) return false;
  const since = iso(new Date(`${tx.data.date}T12:00:00`).getTime() - 120 * DAY);
  const same = os.records
    .query<TransactionData>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: since }, { field: 'data.date', op: 'lte', value: tx.data.date }] }, sort: [{ field: 'data.date', dir: 'asc' }] }, { limit: 5000 })
    .filter((x) => x.data.merchant && normName(x.data.merchant) === key && Math.abs(x.data.amount - tx.data.amount) / tx.data.amount <= 0.05);
  // The run ending with this payment, each a month after the one before.
  const run = [same[same.length - 1]!];
  for (let i = same.length - 2; i >= 0 && run.length < 3; i--) {
    const gap = (new Date(`${run[0]!.data.date}T12:00:00`).getTime() - new Date(`${same[i]!.data.date}T12:00:00`).getTime()) / DAY;
    if (gap >= 25 && gap <= 35) run.unshift(same[i]!);
  }
  if (run.length < 3 || run[run.length - 1]!.id !== tx.id) return false;
  os.filings.add({ source: 'finance', sourceRef: key, kind: SPOTTED_SUB, entityId: tx.id, label: `${tx.data.merchant}, ${os.format.currency(tx.data.amount)} every month: track it?`, before: { txIds: run.map((x) => x.id) } });
  return true;
}

/** Every recent expense's payee, once on start (payments filed before this rule). */
export function spotSubscriptions(os: LifeOSContext, days = 120): number {
  if (!os.registry.objects.has('transaction')) return 0;
  const since = iso(Date.now() - days * DAY);
  const latest = new Map<string, string>();
  for (const t of os.records.query<TransactionData>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: since }] }, sort: [{ field: 'data.date', dir: 'asc' }] }, { limit: 20000 })) {
    if (t.data.merchant) latest.set(normName(t.data.merchant), t.id);
  }
  return [...latest.values()].filter((id) => spotSubscription(os, id)).length;
}

/** Track it: the Subscription (auto-post off), its payments linked. Returns its id for Undo. */
export function trackSpotted(os: LifeOSContext, filingId: string): string | null {
  const f = os.filings.get(filingId);
  const tx = f?.entityId ? os.records.get<TransactionData>(f.entityId) : undefined;
  if (!f || !tx) return null;
  const ids = ((f.before as { txIds?: string[] } | null)?.txIds ?? [tx.id]).filter((id) => os.records.get(id));
  let subId = '';
  os.db.transaction(() => {
    subId = os.records.create<SubscriptionData>({ object: 'subscription', data: { name: tx.data.merchant!, amount: tx.data.amount, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: addMonths(tx.data.date), category: tx.data.category && tx.data.category !== 'other' ? tx.data.category : 'subscriptions', accountId: tx.data.accountId, autoPost: false } }, 'user').id;
    for (const id of ids) os.links.link(id, subId, 'subscription', {}, 'user');
    os.filings.setChecked(filingId);
  });
  return subId;
}

/** Not a subscription: never asked about this payee again. */
export function notSpotted(os: LifeOSContext, filingId: string): void {
  const f = os.filings.get(filingId);
  if (!f?.sourceRef) return;
  os.settings.set(NOT_SUB_KEY, [...new Set([...os.settings.get<string[]>(NOT_SUB_KEY, []), f.sourceRef])]);
  os.filings.setChecked(filingId);
}

export function undoSpotted(os: LifeOSContext, filingId: string, subId: string | null): void {
  const f = os.filings.get(filingId);
  if (subId && os.records.get(subId)) os.records.delete(subId, 'user');
  if (!subId && f?.sourceRef) os.settings.set(NOT_SUB_KEY, os.settings.get<string[]>(NOT_SUB_KEY, []).filter((k) => k !== f.sourceRef));
  os.filings.setChecked(filingId, false);
}
