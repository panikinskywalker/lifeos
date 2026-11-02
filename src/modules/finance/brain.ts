import { cycleAct, cycleCandidates } from '@core/brain/upkeep';
import { dueWords, pastDay } from '@core/brain/words';
import type { BrainDef, Candidate, Nudge } from '@core/brain/contract';
import type { LifeOSContext } from '@core/registry/context';
import { categoryOf, type InvestmentData, type SubscriptionData, type TransactionData } from './types';

/**
 * What Money brings the brain (docs/MODEL.md layer 8, *Slices 4 and 6*): its
 * own Cycles, in its words (a subscription renewing: is this right?; a bill to
 * pay, a subscription with auto-post off: shall I? Paid files the expense; a
 * SIP or a deposit maturing), and one spend far above your usual for its
 * category. What leaves: names as filed, amounts, days; never a message, a raw
 * text or a note. Money is never moved.
 */

const DAY = 86_400_000;
const iso = (at: number) => new Date(at - new Date(at).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
/** One spend counts as unusual at this many times the category's median... */
export const UNUSUAL_TIMES = 3;
/** ...and at least this much, with this many spends in the category over 90 days. */
export const UNUSUAL_MIN = 1000;
const UNUSUAL_HISTORY = 5;

const EVERY: Record<string, string> = { 'FREQ=WEEKLY;INTERVAL=1': 'week', 'FREQ=MONTHLY;INTERVAL=1': 'month', 'FREQ=MONTHLY;INTERVAL=3': 'quarter', 'FREQ=YEARLY;INTERVAL=1': 'year' };

function cycles(os: LifeOSContext, now: number): Candidate[] {
  const money = (n: number | undefined, cur?: string) => (n != null ? os.format.currency(n, cur) : null);
  return cycleCandidates(os, now, 'finance').flatMap((c): Candidate[] => {
    const { template } = (c.payload ?? {}) as { template?: string | null };
    const rec = c.subjectId ? os.records.get(c.subjectId) : undefined;
    const days = typeof c.record.days_left === 'number' ? c.record.days_left : null;
    if (!rec || days == null) return [c];
    if (template === 'subscription.renewal') {
      const s = rec.data as unknown as SubscriptionData;
      const amount = money(s.amount, s.currency);
      const record = { name: rec.title, amount: s.amount, currency: s.currency ?? null, due: c.record.due, every: EVERY[s.rrule] ?? null, days_left: days };
      if (s.autoPost !== false) {
        // It bills itself on the day (postDueSubscriptions); a heads-up, while you can still cancel.
        if (days < 0) return [];
        return [{ ...c, shape: 'check', line: `${rec.title}: ${amount} renews ${dueWords(days, now)}`, record: { ...record, bills_itself: true }, urgent: false, yes: 'Keep it' }];
      }
      return [{ ...c, line: days < 0 ? `${rec.title}: ${amount}, ${dueWords(days, now)}` : `${rec.title}: ${amount} due ${dueWords(days, now)}`, record, urgent: days <= 0, yes: 'Paid', payload: { ...(c.payload as object), bill: { amount: s.amount } } }];
    }
    if (template === 'investment.sip' || template === 'investment.maturity') {
      const i = rec.data as unknown as InvestmentData;
      const sip = template === 'investment.sip';
      const line = sip ? `${rec.title}: SIP ${money(i.sip, i.currency)} ${dueWords(days, now)}` : days < 0 ? `${rec.title}: matured, ${dueWords(days, now)}` : `${rec.title}: matures ${dueWords(days, now)}`;
      return [{ ...c, shape: 'check', line, record: { name: rec.title, what: sip ? 'SIP' : 'matures', amount: sip ? (i.sip ?? null) : (i.currentValue ?? i.invested ?? null), due: c.record.due, days_left: days }, urgent: false, yes: 'Right' }];
    }
    return [c];
  });
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** A spend in the last two days at least three times the usual for its category (with five or more before it in 90 days). */
export function unusualSpends(os: LifeOSContext, now = Date.now()): Candidate[] {
  const since = iso(now - DAY);
  const from = iso(now - 92 * DAY);
  const all = os.records
    .query<TransactionData>('transaction', { filter: { and: [{ field: 'data.date', op: 'gte', value: from }, { field: 'data.kind', op: 'eq', value: 'expense' }] } }, { limit: 20000 })
    .filter((t) => t.data.kind === 'expense' && t.data.amount > 0);
  const out: Candidate[] = [];
  for (const t of all) {
    if (t.data.date.slice(0, 10) < since || t.data.amount < UNUSUAL_MIN) continue;
    const day = t.data.date.slice(0, 10);
    const before = iso(new Date(`${day}T12:00:00`).getTime() - 90 * DAY);
    const usual = all.filter((x) => x.id !== t.id && x.data.category === t.data.category && x.data.date.slice(0, 10) < day && x.data.date.slice(0, 10) >= before).map((x) => x.data.amount);
    if (usual.length < UNUSUAL_HISTORY) continue;
    const m = median(usual);
    if (!m || t.data.amount < UNUSUAL_TIMES * m) continue;
    const payee = (t.data.payeeId ? os.records.get(t.data.payeeId)?.title : null) ?? t.data.merchant ?? t.title;
    const cat = categoryOf(t.data.category).label;
    const times = Math.round(t.data.amount / m);
    out.push({
      key: `finance:unusual:${t.id}`,
      kind: 'due',
      shape: 'check',
      subjectId: t.id,
      title: payee,
      line: `${payee}: ${os.format.currency(t.data.amount, t.data.currency)} ${pastDay(day, now)}, about ${times}x your usual ${cat}`,
      record: { payee, category: cat, amount: t.data.amount, currency: t.data.currency ?? null, day, usual: Math.round(m), times },
      rank: 20 - times,
      yes: 'Right',
    });
  }
  return out;
}

export const financeBrain: BrainDef = {
  candidates: (os, now) => [...cycles(os, now), ...unusualSpends(os, now)],
  act(os, verb, nudge: Nudge) {
    const p = (nudge.payload ?? {}) as { cycleId?: string; template?: string | null; bill?: { amount: number } };
    if (!p.cycleId) return null;
    // A heads-up (a renewal that bills itself, a SIP, a maturity) needs nothing; a bill marked Paid is logged with its expense.
    if (nudge.shape === 'check') return null;
    return cycleAct(os, verb, nudge, p.bill ? { cost: p.bill.amount, asExpense: true } : {});
  },
  skills: [{ name: 'Money', body: 'Say the amount and the day, nothing else. A renewal is a heads-up while it can still be cancelled; a bill is something to pay. An unusual spend is a question, never a judgement. Never suggest moving money.' }],
};
