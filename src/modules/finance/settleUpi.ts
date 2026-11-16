import type { LifeOSContext } from '@core/registry/context';
import { payeeOf } from './filing/rules';
import { balanceWith, type DebtData } from './split';

/**
 * Settling up and paying by UPI (docs/MODEL.md, Splitwise and settling up).
 * Money from someone you have an open balance with, or to someone you owe,
 * settles it on its own: their shares oldest first, up to what moved (Turf's
 * shares are left to Turf). Splitwise gets the payment at its next sync.
 */

export interface AutoSettled {
  personId: string;
  amount: number;
  settled: string[];
}

export function settleFromPayment(os: LifeOSContext, txId: string): AutoSettled | null {
  const tx = os.records.get<{ amount: number; kind: string; date: string; currency?: string }>(txId);
  if (!tx || (tx.data.kind !== 'income' && tx.data.kind !== 'expense') || (tx.data.currency && tx.data.currency !== 'INR')) return null;
  if (os.links.forEntity(txId, 'settles').length) return null;
  const payee = payeeOf(os, txId);
  if (!payee || payee.type !== 'person') return null;
  const bal = balanceWith(os, payee.id);
  // Their money in for what they owe you, or yours out for what you owe them.
  if (!((tx.data.kind === 'income' && bal > 0) || (tx.data.kind === 'expense' && bal < 0))) return null;
  const amount = tx.data.amount;
  const direction: DebtData['direction'] = bal > 0 ? 'they_owe' : 'i_owe';
  // Turf's shares are Turf's to settle (its ledger sets their status): only the rest, oldest first, up to what moved.
  const open = os.records
    .query<DebtData>('debt', { filter: { and: [{ field: 'data.personId', op: 'eq', value: payee.id }, { field: 'status', op: 'eq', value: 'open' }] } }, { limit: 500 })
    .filter((d) => d.data.direction === direction && !os.links.forEntity(d.id).some((l) => l.other.object === 'appearance'))
    .sort((a, b) => a.data.date.localeCompare(b.data.date) || a.createdAt - b.createdAt);
  const settled: string[] = [];
  let left = amount + 0.5;
  for (const d of open) {
    if (d.data.amount > left) break;
    left -= d.data.amount;
    os.records.setStatus(d.id, 'settled', 'system');
    settled.push(d.id);
  }
  if (!settled.length) return null;
  os.links.link(txId, settled[0]!, 'settles', {}, 'system');
  if (tx.data.kind === 'income') os.records.update(txId, { data: { share: 0 } }, 'system');
  return { personId: payee.id, amount, settled };
}

/** A UPI ID as banks write it: name@bank. */
export const isUpiId = (v: string) => /^[\w.\-]{2,}@[a-zA-Z][\w]{1,}$/.test(v.trim());

/** A person's UPI ID, from their record's UPI field (the first one). */
export function upiOf(os: LifeOSContext, personId: string): string | null {
  const raw = os.records.get<{ upi?: string }>(personId)?.data.upi ?? '';
  return raw.split(/[,\s]+/).find(isUpiId) ?? null;
}

/** The link your UPI app opens with the payee, amount and note filled in. */
export function upiLink(p: { upi: string; name: string; amount: number; note: string }): string {
  return `upi://pay?pa=${encodeURIComponent(p.upi.trim())}&pn=${encodeURIComponent(p.name)}&am=${p.amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(p.note.slice(0, 50))}`;
}

/** What a reminder says when no model writes it. */
export function plainReminder(first: string, amount: string, what: string): string {
  return `Hey ${first}! Quick nudge: ${amount}${what ? ` for ${what}` : ''}. Pay me on UPI whenever you get a sec 🙂`;
}
