import type { LifeOSContext } from '@core/registry/context';
import { payeeOf } from './filing/rules';
import { applyPayment, balanceWith, type DebtData } from './split';
import { setSwConfig, swConfig } from './splitwise';

/**
 * Settling up and paying by UPI (docs/MODEL.md, Splitwise and settling up).
 * Money from someone you have an open balance with, or to someone you owe,
 * settles it on its own: their shares oldest first, then what Bills say, as a
 * payback, up to what moved (Turf's shares are left to Turf). A linked person
 * who owes only on Splitwise gets the payment noted here and sent there.
 * Splitwise hears within seconds (boot.ts).
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
  const inMoney = tx.data.kind === 'income';
  const sign = inMoney ? 1 : -1;
  const amount = tx.data.amount;
  let settled: string[] = [];
  let anchor: string | null = null;
  // Their money in for what they owe you, or yours out for what you owe them.
  if (balanceWith(os, payee.id) * sign > 0) {
    const r = applyPayment(os, payee.id, inMoney ? 'they_owe' : 'i_owe', amount, tx.data.date);
    settled = r.settled;
    anchor = settled[0] ?? r.billId;
  } else {
    // Owed only on Splitwise (added there, or before you linked them): the payment is noted here and sent there.
    const c = swConfig(os);
    const owed = (c.balances[payee.id] ?? 0) * sign;
    if (c.people[payee.id] && owed > 0) {
      const paid = Math.round(Math.min(amount, owed) * 100) / 100;
      anchor = os.records.create<DebtData>({ object: 'debt', status: 'settled', data: { personId: payee.id, direction: inMoney ? 'i_owe' : 'they_owe', amount: paid, reason: 'Paid, on Splitwise', date: tx.data.date, kind: 'payment', transactionId: txId } }, 'system').id;
      setSwConfig(os, { toSend: [...(c.toSend ?? []), { debtId: anchor, personId: payee.id, amount: paid * sign }], balances: { ...c.balances, [payee.id]: Math.round((c.balances[payee.id]! - paid * sign) * 100) / 100 } });
    }
  }
  if (!anchor) return null;
  os.links.link(txId, anchor, 'settles', {}, 'system');
  if (inMoney) os.records.update(txId, { data: { share: 0 } }, 'system');
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
