import type { LifeOSContext } from '@core/registry/context';
import type { TransactionData } from '../types';
import { payeeOf } from './rules';

/**
 * What money in is (docs/MODEL.md, Counting money, 15 Nov). Came in is income
 * you earned. Money from a person is money back (share 0), unless you count
 * theirs as income ("Count as income" on the payment, remembered for that
 * person). Money from a business you paid in the 90 days before, for no more
 * than you paid, is a refund in that payment's category, so it comes off
 * spending. Salary is always income.
 */

export const INCOME_FROM_KEY = 'finance.incomeFrom';
const DAY = 86_400_000;
const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Sort one money-in payment. Leaves alone what is already decided (a refund, a share, salary, your own edits). */
export function sortMoneyIn(os: LifeOSContext, txId: string): 'back' | 'refund' | null {
  const tx = os.records.get<TransactionData>(txId);
  if (!tx || tx.object !== 'transaction') return null;
  const d = tx.data;
  if (d.kind !== 'income' || d.refund || typeof d.share === 'number' || d.category === 'salary') return null;
  const payee = payeeOf(os, txId);
  if (!payee) return null;
  const at = Date.parse(`${d.date}T12:00:00`);
  const since = isoDay(at - 90 * DAY);
  const paid = os.links
    .forEntity(payee.id)
    .filter((l) => l.other.object === 'transaction' && l.other.id !== txId)
    .map((l) => os.records.get<TransactionData>(l.other.id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.data.kind === 'expense' && p.data.date >= since && p.data.date <= d.date && p.data.amount >= d.amount - 0.5)
    .sort((a, b) => b.data.date.localeCompare(a.data.date))[0];
  if (paid) {
    os.records.update(txId, { data: { refund: true, category: paid.data.category } }, 'assistant');
    return 'refund';
  }
  // A person, or a name not known to be a business (a friend without a contact): money back, unless you count theirs.
  if (!isSomeone(os, payee) || os.settings.get<string[]>(INCOME_FROM_KEY, []).includes(payee.id)) return null;
  os.records.update(txId, { data: { share: 0 } }, 'assistant');
  return 'back';
}

/** A person, or a payee the app is not sure is a business (an org of kind 'payee'). */
const isSomeone = (os: LifeOSContext, p: { id: string; type: string }) => p.type === 'person' || (p.type === 'org' && os.records.get<{ kind?: string }>(p.id)?.data.kind === 'payee');

/** You said it is income: it counts, and so does everything from them after (and before, unless you changed it). */
export function countAsIncome(os: LifeOSContext, txId: string): { personId: string | null; changed: Array<{ id: string; share?: number; refund?: boolean }> } {
  const tx = os.records.get<TransactionData>(txId);
  const payee = payeeOf(os, txId);
  const personId = payee && isSomeone(os, payee) ? payee.id : null;
  const changed: Array<{ id: string; share?: number; refund?: boolean }> = [];
  os.db.transaction(() => {
    if (tx) {
      changed.push({ id: txId, share: tx.data.share, refund: tx.data.refund });
      os.records.update(txId, { data: { share: undefined, refund: undefined } }, 'user');
    }
    if (personId) {
      os.settings.set(INCOME_FROM_KEY, [...new Set([...os.settings.get<string[]>(INCOME_FROM_KEY, []), personId])]);
      for (const l of os.links.forEntity(personId)) {
        const p = l.other.object === 'transaction' && l.other.id !== txId ? os.records.get<TransactionData>(l.other.id) : undefined;
        if (!p || p.data.kind !== 'income' || p.data.share !== 0 || os.links.forEntity(p.id, 'pays').length) continue;
        changed.push({ id: p.id, share: 0 });
        os.records.update(p.id, { data: { share: undefined } }, 'assistant');
      }
    }
  });
  return { personId, changed };
}

export function undoCountAsIncome(os: LifeOSContext, u: ReturnType<typeof countAsIncome>): void {
  os.db.transaction(() => {
    for (const c of u.changed) if (os.records.get(c.id)) os.records.update(c.id, { data: { share: c.share, refund: c.refund } }, 'user');
    if (u.personId) os.settings.set(INCOME_FROM_KEY, os.settings.get<string[]>(INCOME_FROM_KEY, []).filter((id) => id !== u.personId));
  });
}

/** Once, on payments filed before this rule: sort money in you have not changed yourself. */
export function sortOldMoneyIn(os: LifeOSContext): number {
  let n = 0;
  for (const t of os.records.query<TransactionData>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'income' }] } }, { limit: 100_000 })) {
    if (os.db.get(`SELECT 1 AS x FROM events WHERE record_id=? AND actor='user' LIMIT 1`, [t.id])) continue;
    if (sortMoneyIn(os, t.id)) n++;
  }
  return n;
}
