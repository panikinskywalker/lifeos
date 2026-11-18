import { z } from 'zod';
import type { ObjectDef, ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { balancesOf, owedOf, type Balances, type LedgerEntry, type Party, type SplitSpec } from '@core/money/split';

/**
 * Bill (MODEL.md layer 2, *Bill*, proposed 15 Nov): one spend shared in a
 * Group, or one person paying another back, exactly as Splitwise does it.
 * A Transaction stays your money as your bank tells it; a Bill is who paid and
 * who owes, whoever paid. Balances are derived from Bills, never stored.
 */

export interface BillData {
  kind: 'spend' | 'payment';
  /** link → Group, word `group`. */
  groupId?: string;
  /** link → Trip, word `trip`. */
  tripId?: string;
  amount: number;
  currency: string;
  /** The ₹ value, fixed when saved at that day's rate. */
  inr?: number;
  /** The rate used, ₹ for one of the currency. */
  rate?: number;
  date: string;
  category?: string;
  /** Who paid how much and how it splits. */
  split: SplitSpec;
  /** link → Event, word `paid_for`: a part payment toward a booking. */
  eventId?: string;
  /** link → Transaction, word `same_as`: the bank's record of what you paid. */
  transactionId?: string;
  receipt?: { uri: string; name?: string; mime?: string };
  notes?: string;
  sourceKey?: string;
  /** Hidden: the Splitwise expense this Bill is kept in step with, and its updated_at when last in step. */
  splitwiseId?: number;
  splitwiseAt?: string;
}

export const BILL_CATEGORIES = [
  { value: 'food', label: 'Food' },
  { value: 'transport', label: 'Transport' },
  { value: 'stays', label: 'Stay' },
  { value: 'fun', label: 'Fun' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'flights', label: 'Flights' },
  { value: 'other', label: 'Other' },
];

const party = z.string();
export const billType: ObjectDef<BillData> = {
  id: 'bill',
  module: 'finance',
  label: 'Bill',
  labelPlural: 'Bills',
  icon: 'receipt',
  schema: z.object({
    kind: z.enum(['spend', 'payment']).default('spend'),
    groupId: z.string().optional(),
    tripId: z.string().optional(),
    amount: z.coerce.number().nonnegative(),
    currency: z.string().default('INR'),
    inr: z.coerce.number().optional(),
    rate: z.coerce.number().optional(),
    date: z.string(),
    category: z.string().optional(),
    split: z.object({ payers: z.record(party, z.number()), method: z.enum(['equal', 'exact', 'percent', 'shares', 'adjust']), shares: z.record(party, z.number()) }),
    eventId: z.string().optional(),
    transactionId: z.string().optional(),
    receipt: z.object({ uri: z.string(), name: z.string().optional(), mime: z.string().optional() }).optional(),
    notes: z.string().optional(),
    sourceKey: z.string().optional(),
    splitwiseId: z.coerce.number().optional(),
    splitwiseAt: z.string().optional(),
  }),
  fields: [
    { key: 'kind', label: 'Kind', type: 'select', required: true, default: 'spend', options: [{ value: 'spend', label: 'A spend' }, { value: 'payment', label: 'A payback' }] },
    { key: 'amount', label: 'Amount', type: 'money', required: true, summary: true },
    { key: 'currency', label: 'Currency', type: 'select', options: ['INR', 'JPY', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'THB'].map((c) => ({ value: c, label: c })) },
    { key: 'inr', label: '₹ value', type: 'money', description: 'Fixed when saved; change it to what the card charged' },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'category', label: 'Category', type: 'select', options: BILL_CATEGORIES },
    { key: 'groupId', label: 'Group', type: 'link', linkTo: 'group', linkWord: 'group' },
    { key: 'tripId', label: 'Trip', type: 'link', linkTo: 'trip', linkWord: 'trip' },
    { key: 'eventId', label: 'Booking', type: 'link', linkTo: 'event', linkWord: 'paid_for' },
    { key: 'transactionId', label: 'Your payment', type: 'link', linkTo: 'transaction', linkWord: 'same_as' },
    { key: 'receipt', label: 'Receipt', type: 'file' },
    { key: 'notes', label: 'Notes', type: 'longtext' },
  ],
  hidden: true,
  occurredAtField: 'date',
  computeSubtitle: (d) => `${d.currency === 'INR' ? '₹' : `${d.currency} `}${d.amount.toLocaleString('en-IN')}${d.kind === 'payment' ? ' · payback' : ''}`,
  searchText: (d) => [d.notes, d.category].filter(Boolean).join(' '),
};

/** The Bill's amount in ₹: its fixed value, else at the rate it carries, else as it is when it is ₹. */
export const billInr = (b: Pick<BillData, 'amount' | 'currency' | 'inr' | 'rate'>): number => b.inr ?? (b.currency === 'INR' ? b.amount : b.rate ? Math.round(b.amount * b.rate * 100) / 100 : 0);

export const entryOf = (b: ObjectRecord<BillData>): LedgerEntry => ({ amount: b.data.amount, inr: billInr(b.data), spec: b.data.split, payment: b.data.kind === 'payment' });

/** Each party's share of a Bill, in its currency. */
export const sharesOf = (b: Pick<BillData, 'amount' | 'split'>) => owedOf(b.amount, b.split);

export function billsOf(os: LifeOSContext, where: { tripId?: string; groupId?: string } = {}): ObjectRecord<BillData>[] {
  if (!os.registry.objects.has('bill')) return [];
  const and = [where.tripId ? { field: 'data.tripId', op: 'eq' as const, value: where.tripId } : null, where.groupId ? { field: 'data.groupId', op: 'eq' as const, value: where.groupId } : null].filter((x): x is NonNullable<typeof x> => !!x);
  return os.records.query<BillData>('bill', and.length ? { filter: { and }, sort: [{ field: 'data.date', dir: 'desc' }] } : { sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 5000 }).filter((b) => !b.archived);
}

/** Everyone's balances over these Bills (a Group's, or a trip's), with the Group's Simplify debts. */
export function billBalances(bills: ObjectRecord<BillData>[], opts: { simplify?: boolean; parties?: Party[] } = {}): Balances {
  return balancesOf(bills.map(entryOf), opts);
}

/** + they owe you, - you owe them, from every Bill you are both in (optionally one Group's). */
export function billBalanceWith(os: LifeOSContext, personId: string, groupId?: string): number {
  const debts = billBalances(billsOf(os, groupId ? { groupId } : {})).debts;
  return Math.round(debts.reduce((a, d) => a + (d.from === personId && d.to === 'me' ? d.amount : d.to === personId && d.from === 'me' ? -d.amount : 0), 0) * 100) / 100;
}

export interface BillInput {
  kind?: BillData['kind'];
  amount: number;
  currency?: string;
  rate?: number;
  inr?: number;
  date: string;
  category?: string;
  split: SplitSpec;
  tripId?: string;
  groupId?: string;
  eventId?: string;
  notes?: string;
  receipt?: BillData['receipt'];
}

/** A new Bill; its ₹ value is fixed now. */
export function makeBill(os: LifeOSContext, title: string, input: BillInput, actor: 'user' | 'assistant' = 'user'): ObjectRecord<BillData> {
  const currency = input.currency ?? 'INR';
  const data: BillData = { kind: input.kind ?? 'spend', amount: input.amount, currency, date: input.date, split: input.split, ...(input.rate ? { rate: input.rate } : {}), inr: input.inr ?? billInr({ amount: input.amount, currency, rate: input.rate }), ...(input.category ? { category: input.category } : {}), ...(input.tripId ? { tripId: input.tripId } : {}), ...(input.groupId ? { groupId: input.groupId } : {}), ...(input.eventId ? { eventId: input.eventId } : {}), ...(input.notes ? { notes: input.notes } : {}), ...(input.receipt ? { receipt: input.receipt } : {}) };
  return os.records.create<BillData>({ object: 'bill', title: title.trim(), data }, actor);
}

/** A payback from one party to another, in ₹ unless said. */
export function makePayment(os: LifeOSContext, from: Party, to: Party, amount: number, opts: { date: string; tripId?: string; groupId?: string; name?: (p: Party) => string; currency?: string; rate?: number; notes?: string }): ObjectRecord<BillData> {
  const name = opts.name ?? ((p: Party) => (p === 'me' ? 'You' : os.records.get(p)?.title ?? 'Someone'));
  return makeBill(os, `${name(from)} paid ${name(to)}`, { kind: 'payment', amount, currency: opts.currency ?? 'INR', rate: opts.rate, date: opts.date, split: { payers: { [from]: amount }, method: 'exact', shares: { [to]: amount } }, tripId: opts.tripId, groupId: opts.groupId, notes: opts.notes });
}

/* ------------------------------------------------------------------ */
/* A receipt photo (the trip template, R7g slice 4)                     */
/* ------------------------------------------------------------------ */

export interface ReceiptItem {
  /** As printed (often Japanese). */
  name: string;
  /** In English, when it was not. */
  en?: string;
  price: number;
  qty: number;
}
export interface ReceiptRead {
  shop?: string;
  currency: string;
  total: number;
  items: ReceiptItem[];
}

/** What Claude is asked about a receipt you photographed on purpose: its lines, each with a price. */
export function receiptQuestion(people: string[]): { module: string; moduleName: string; why: string; what: string; system: string; prompt: string; record: Record<string, string[]>; schema: Record<string, unknown>; maxTokens: number } {
  return {
    module: 'finance',
    moduleName: 'Money',
    why: 'you pressed Split a receipt photo',
    what: 'a photo of a receipt',
    system:
      'You read receipts for LifeOS, a personal app. Return every line item with its price as printed (the line total, a number), its quantity (1 when not printed), the name as printed, and an English name when it is not English (else ""); the shop name ("" when unreadable); the currency as an ISO code (JPY for yen); the total as printed. Leave out tax lines already included in the prices, and subtotal, change and payment lines. Plain British English, no em dashes.',
    prompt: 'Read this receipt into its items.',
    record: { people },
    schema: RECEIPT_SCHEMA,
    maxTokens: 4000,
  };
}

/** The receipt's answer, as Claude's structured output takes it: every object closed, every field required. */
export const RECEIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['shop', 'currency', 'total', 'items'],
  properties: {
    shop: { type: 'string' },
    currency: { type: 'string' },
    total: { type: 'number' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'en', 'price', 'qty'],
        properties: { name: { type: 'string' }, en: { type: 'string' }, price: { type: 'number' }, qty: { type: 'number' } },
      },
    },
  },
} as const;

/** Claude's answer as a receipt, or null when it is not one. */
export function parseReceipt(answer: unknown): ReceiptRead | null {
  const a = answer as Partial<ReceiptRead> | null;
  if (!a || !Array.isArray(a.items)) return null;
  const items = a.items.filter((i) => i && typeof i.name === 'string' && Number(i.price) > 0).map((i) => ({ name: i.name, en: typeof i.en === 'string' && i.en.trim() && i.en !== i.name ? i.en : undefined, price: Number(i.price), qty: Number(i.qty) > 0 ? Number(i.qty) : 1 }));
  if (!items.length) return null;
  return { shop: typeof a.shop === 'string' && a.shop.trim() ? a.shop : undefined, currency: typeof a.currency === 'string' ? a.currency.toUpperCase() : 'JPY', total: Number(a.total) > 0 ? Number(a.total) : items.reduce((s, i) => s + i.price, 0), items };
}

/** Each party's exact share from who had each line (a line nobody tapped is shared by all). */
export function receiptShares(items: ReceiptItem[], who: string[][], everyone: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  items.forEach((it, i) => {
    const ps = who[i]?.length ? who[i]! : everyone;
    const base = Math.floor((it.price / ps.length) * 100) / 100;
    ps.forEach((p, k) => {
      const part = k === ps.length - 1 ? it.price - base * (ps.length - 1) : base;
      out[p] = Math.round(((out[p] ?? 0) + part) * 100) / 100;
    });
  });
  return out;
}
