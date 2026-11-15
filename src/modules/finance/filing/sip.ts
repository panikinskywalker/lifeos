import type { LifeOSContext } from '@core/registry/context';
import type { InvestmentData, TransactionData } from '../types';

/**
 * NACH to SIP (docs/MODEL.md, Money on its own, 1): a bank's nameless "debit by
 * NACH" is usually a SIP. One for an active holding's SIP amount, within 3 days
 * of its SIP day, is filed as that SIP; any other is asked about once in To
 * check. The answer teaches the holding its SIP, so the next one files itself.
 */

export const NACH_SIP = 'nach-sip';
/** Amounts you said are not SIPs. */
export const NOT_SIP_KEY = 'finance.nachNotSip';

const DAY = 86_400_000;
const noon = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** A debit by NACH that names nobody. */
export const isNamelessNach = (text: string, counterparty: string | null) => !counterparty && /\bnach\b/i.test(text);

/** The active holding whose SIP this is: same amount, its SIP day within 3 days. */
export function sipFor(os: LifeOSContext, amount: number, date: string): string | null {
  if (!os.registry.objects.has('investment')) return null;
  const d = noon(date);
  const near = (sipDay: number) => [-1, 0, 1].some((k) => Math.abs(new Date(d.getFullYear(), d.getMonth() + k, Math.min(sipDay, 28), 12).getTime() - d.getTime()) <= 3 * DAY);
  const hit = os.records
    .query<InvestmentData>('investment', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }, { limit: 500 })
    .find((i) => i.data.sip != null && Math.abs(i.data.sip - amount) < 0.5 && near(i.data.sipDay ?? d.getDate()));
  return hit?.id ?? null;
}

/** Ask in To check, unless you said this amount is not a SIP. */
export function askSip(os: LifeOSContext, txId: string, amount: number, date: string, source: string, sourceRef: string): void {
  if (os.settings.get<number[]>(NOT_SIP_KEY, []).some((a) => Math.abs(a - amount) < 0.5)) return;
  const day = noon(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  os.filings.add({ source, sourceRef, kind: NACH_SIP, entityId: txId, label: `${os.format.currency(amount)} by NACH on ${day}: a SIP?`, flag: 'A SIP?' });
}

export interface SipAnswer {
  filingId: string;
  txId: string;
  tx?: Partial<TransactionData>;
  investmentId?: string;
  investment?: Partial<InvestmentData>;
  created?: boolean;
  notSip?: number;
}

/** Answer the question: this holding (or a new one) is the SIP, or it is not a SIP. Returns what Undo needs. */
export function answerSip(os: LifeOSContext, filingId: string, pick: string | 'new' | 'no'): SipAnswer | null {
  const f = os.filings.get(filingId);
  const tx = f?.entityId ? os.records.get<TransactionData>(f.entityId) : undefined;
  if (!f) return null;
  // Its payment is gone (read again, deleted): nothing to answer, so the question closes.
  if (!tx) {
    os.filings.setChecked(filingId);
    return null;
  }
  const out: SipAnswer = { filingId, txId: tx.id };
  const d = tx.data;
  os.db.transaction(() => {
    if (pick === 'no') {
      out.notSip = d.amount;
      os.settings.set(NOT_SIP_KEY, [...os.settings.get<number[]>(NOT_SIP_KEY, []), d.amount]);
    } else {
      const day = noon(d.date).getDate();
      let id = pick;
      if (pick === 'new') {
        id = os.records.create<InvestmentData>({ object: 'investment', title: `SIP on the ${ordinal(day)}`, data: { instrument: 'mutual_fund', invested: 0, sip: d.amount, sipDay: day, accountId: d.accountId }, status: 'active' }, 'user').id;
        out.created = true;
      }
      const inv = os.records.get<InvestmentData>(id)!;
      out.investmentId = id;
      out.investment = { invested: inv.data.invested, sip: inv.data.sip, sipDay: inv.data.sipDay };
      out.tx = { kind: d.kind, category: d.category, merchant: d.merchant, investmentId: d.investmentId };
      os.records.update(id, { data: { invested: (inv.data.invested ?? 0) + d.amount, sip: d.amount, sipDay: day } }, 'user');
      os.records.update(tx.id, { data: { kind: 'investment', category: 'investment', merchant: inv.title, investmentId: id } }, 'user');
    }
    os.filings.setChecked(filingId);
  });
  return out;
}

export function undoSip(os: LifeOSContext, a: SipAnswer): void {
  os.db.transaction(() => {
    if (a.notSip != null) os.settings.set(NOT_SIP_KEY, os.settings.get<number[]>(NOT_SIP_KEY, []).filter((x) => Math.abs(x - a.notSip!) >= 0.5));
    if (a.tx && os.records.get(a.txId)) os.records.update(a.txId, { data: a.tx }, 'user');
    if (a.investmentId) {
      if (a.created) os.records.delete(a.investmentId, 'user');
      else if (a.investment) os.records.update(a.investmentId, { data: a.investment }, 'user');
    }
    os.filings.setChecked(a.filingId, false);
  });
}
