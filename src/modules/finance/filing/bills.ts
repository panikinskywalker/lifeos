import type { LifeOSContext } from '@core/registry/context';
import type { FileContext, FileOutcome, RawMessage } from '@core/filing/contract';
import type { SubscriptionData, TransactionData } from '../types';
import { addMonths, normName } from './recurring';

/**
 * Bills from due texts (docs/MODEL.md, phase D, 5): a bill is a Subscription
 * with `bill` set and auto-post off. A due text with an amount sets its amount
 * and due day (made if new); a payment to that payee for about the amount marks
 * it paid and moves it a month on.
 */

export interface BillDue {
  name: string;
  /** The biller's word, from the sender ("AD-MSEDCL-S" → MSEDCL). */
  payee: string;
  amount: number;
  dueOn: string;
  category: string;
  /** The text gave no due day: 15 days after it. */
  guessed: boolean;
}

const KINDS: Array<[RegExp, string, string]> = [
  [/\b(?:energy|electricity|power) bill\b|\bmsedcl\b|\bmahadiscom\b|\bbescom\b|\btata power\b|\badani electricity\b|\bbses\b/i, 'Electricity', 'utilities'],
  [/\bwater bill\b/i, 'Water', 'utilities'],
  [/\bgas bill\b|\bpiped gas\b|\bmahanagar gas\b|\bindraprastha gas\b/i, 'Gas', 'utilities'],
  [/\b(?:broadband|fib(?:er|re)|internet) bill\b|\bjiofiber\b|\bairtel xstream\b/i, 'Internet', 'utilities'],
  [/\b(?:postpaid|mobile) bill\b/i, 'Phone', 'utilities'],
  [/\bemi\b/i, 'EMI', 'other'],
  [/\bpremium\b/i, 'Insurance', 'other'],
];

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (at: number) => {
  const d = new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function dateIn(t: string): string | null {
  const m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(t);
  if (!m || Number(m[2]) > 12) return null;
  return `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
}

/** Read a bill's due text, or null (a payment receipt, a reminder with no amount, a card bill). */
export function parseBillDue(text: string, sender: string, receivedAt: number): BillDue | null {
  const t = text.replace(/\s+/g, ' ');
  if (/\bcredit card\b|\bthanks? (?:you )?for (?:the |your )?(?:online )?payment\b|\bpayment (?:of [^.]{0,30})?(?:received|successful)\b/i.test(t)) return null;
  if (!/\bbill\b|\bdue\b|\bpremium\b/i.test(t)) return null;
  const kind = KINDS.find(([re]) => re.test(t));
  const amount = /(?:Rs\.?|INR|₹)\s?([\d,]+(?:\.\d{1,2})?)/i.exec(t);
  if (!kind || !amount) return null;
  const after = t.search(/\bdue\b/i);
  const due = after >= 0 ? dateIn(t.slice(after)) : null;
  const payee = sender.replace(/^[A-Z]{2}-/, '').replace(/-[A-Z]$/, '').toUpperCase();
  return { name: kind[1], payee, amount: Number(amount[1]!.replace(/,/g, '')), dueOn: due ?? iso(receivedAt + 15 * 86_400_000), category: kind[2], guessed: !due };
}

/** The bill from this payee (or of this name, when it has none). */
function billFor(os: LifeOSContext, b: { name: string; payee: string }) {
  const all = os.records.query<SubscriptionData>('subscription', {}, { limit: 1000 }).filter((s) => s.data.bill && s.status !== 'cancelled');
  return all.find((s) => s.data.payee === b.payee) ?? all.find((s) => !s.data.payee && s.data.name === b.name) ?? null;
}

export function fileBillDue(os: LifeOSContext, m: RawMessage, b: BillDue, ctx: FileContext): FileOutcome {
  if (!os.registry.objects.has('subscription')) return { status: 'dismissed', note: 'finance module not installed' };
  const due = new Date(`${b.dueOn}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const label = `${b.name} bill · ${os.format.currency(b.amount)} due ${due}${b.guessed ? ' (15 days on; the text gave no day)' : ''}`;
  const bill = billFor(os, b);
  if (!bill) {
    const s = os.records.create<SubscriptionData>({ object: 'subscription', data: { name: b.name, amount: b.amount, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: b.dueOn, category: b.category, autoPost: false, bill: true, payee: b.payee } }, 'assistant');
    os.filings.add({ source: m.source, sourceRef: ctx.id, kind: 'bill', action: 'created', entityId: s.id, label });
    return { status: 'confirmed', entityId: s.id };
  }
  // An older reminder for a bill already moved on (paid) changes nothing.
  if (b.dueOn < bill.data.nextBillingAt && b.amount === bill.data.amount) return { status: 'duplicate', entityId: bill.id, note: 'an older reminder for this bill' };
  os.records.update(bill.id, { data: { amount: b.amount, nextBillingAt: b.dueOn } }, 'assistant');
  os.filings.add({ source: m.source, sourceRef: ctx.id, kind: 'bill', action: 'updated', entityId: bill.id, label, before: { amount: bill.data.amount, nextBillingAt: bill.data.nextBillingAt } });
  return { status: 'confirmed', entityId: bill.id };
}

/** A payment to a bill's payee for about its amount (within 5%) pays it: linked, and the next one is a month on. */
export function payBill(os: LifeOSContext, txId: string): string | null {
  const tx = os.records.get<TransactionData>(txId);
  if (!tx || tx.data.kind !== 'expense' || !tx.data.merchant || !os.registry.objects.has('subscription')) return null;
  const who = normName(tx.data.merchant).replace(/ /g, '');
  const bill = os.records
    .query<SubscriptionData>('subscription', {}, { limit: 1000 })
    .find((s) => s.data.bill && s.status !== 'cancelled' && !!s.data.payee && who.includes(s.data.payee.toLowerCase().slice(0, 4)) && Math.abs(tx.data.amount - s.data.amount) <= s.data.amount * 0.05);
  if (!bill) return null;
  const at = new Date(`${tx.data.date}T12:00:00`).getTime();
  // You tapped Paid already (Upkeep, To check): that expense was this payment, and the bill has moved on.
  for (const r of os.links.forEntity(bill.id, 'subscription')) {
    const o = r.direction === 'in' && r.other.id !== txId ? os.records.get<TransactionData>(r.other.id) : undefined;
    if (o && o.data.kind === 'expense' && !o.data.source && Math.abs(new Date(`${o.data.date}T12:00:00`).getTime() - at) <= 5 * DAY && Math.abs(o.data.amount - tx.data.amount) <= tx.data.amount * 0.05) os.records.delete(o.id, 'assistant');
  }
  os.links.link(txId, bill.id, 'subscription', {}, 'assistant');
  const patch: Partial<TransactionData> = tx.data.category === 'other' ? { category: bill.data.category } : {};
  if (Object.keys(patch).length) os.records.update(txId, { data: patch }, 'assistant');
  if (bill.data.nextBillingAt <= iso(at + 20 * DAY)) os.records.update(bill.id, { data: { nextBillingAt: addMonths(bill.data.nextBillingAt) } }, 'assistant');
  os.filings.add({ source: 'finance', sourceRef: txId, kind: 'bill', action: 'updated', entityId: bill.id, label: `${bill.data.name} bill paid · ${os.format.currency(tx.data.amount)}`, before: { nextBillingAt: bill.data.nextBillingAt } });
  return bill.id;
}
