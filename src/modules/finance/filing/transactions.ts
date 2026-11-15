import type { LifeOSContext } from '@core/registry/context';
import { findTwin, sourceLabel, type RawMessage } from '@core/filing/queue';
import type { FileContext, FileOutcome } from '@core/filing/contract';
import { toInr } from './fx';
import { askWhoIs, isMyName, linkPayee, payeeFor } from './payee';
import { categoryFor, learnedCategory, payeeOf, rangeRule, ruleCategory } from './rules';
import { accountFor } from './accounts';
import { askSip, isNamelessNach, sipFor } from './sip';
import { findSubscription, notePrice, spotSubscription } from './recurring';
import { payBill } from './bills';
import type { ParsedTxn } from './bankSms';

/**
 * Money from messages (finance filing, R1): a parsed bank SMS, payment-app
 * notification or receipt mail becomes a Transaction on the right account —
 * deduplicated against other messages and what you said — with its payee,
 * category, subscription and (for SIPs) its Investment.
 */

const DAY = 86_400_000;
const WINDOW = 10 * 60_000;
const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The same money already seen: another message within 10 minutes, or a transaction you already filed that day. */
export const dedupeKey = (t: ParsedTxn) => `${t.direction}:${t.amount.toFixed(2)}`;

export function findDuplicateFor(os: LifeOSContext, itemId: string, t: ParsedTxn, at: number): { ingestId?: string; entityId?: string } | null {
  const twin = findTwin(os, itemId, dedupeKey(t), at, WINDOW);
  if (twin) return { ingestId: twin.id, entityId: twin.recordId ?? undefined };
  if (!os.registry.objects.has('transaction')) return null;
  // Said it before the SMS came ("spent 450 on lunch"): same amount, same kind, same or previous day, not from a message.
  const day = iso(at);
  const prev = iso(at - DAY);
  const kind = t.direction === 'credit' ? 'income' : 'expense';
  // Straight to the few candidates (date and kind are indexed), not a scan of recent transactions.
  const tx = os.db.get<{ id: string }>(
    `SELECT e.id FROM records e WHERE e.object='transaction' AND e.deleted_at IS NULL
       AND json_extract(e.data,'$.date') IN (?, ?) AND json_extract(e.data,'$.kind')=? AND json_extract(e.data,'$.amount')=?
       AND NOT EXISTS (SELECT 1 FROM ingest_queue q WHERE q.record_id = e.id AND q.source <> 'email') LIMIT 1`,
    [day, prev, kind, t.amount],
  );
  return tx ? { entityId: tx.id } : null;
}

/** Add what a later message knows to a transaction (account, reference), never overwriting. */
export function enrichFrom(os: LifeOSContext, entityId: string, t: ParsedTxn, m: RawMessage) {
  const e = os.records.get<Record<string, unknown>>(entityId);
  if (!e) return;
  const patch: Record<string, unknown> = {};
  if (!e.data.accountId) {
    const acc = accountFor(os, t, m.from);
    if (acc) patch.accountId = acc;
  }
  if (!e.data.merchant && t.counterparty) patch.merchant = t.counterparty;
  if (Object.keys(patch).length) os.records.update(entityId, { data: patch }, 'assistant');
  os.records.timeline.add({ entityId, kind: m.source, title: `Seen in ${sourceLabel(os, m)}`, body: m.body.slice(0, 300), actor: 'system', occurredAt: m.receivedAt, meta: { ingest: true } });
}

/** File one parsed (or proposed) message as a transaction; logged in To check. */
/** File one parsed message as a Transaction (the money parser's write step); logged in To check. */
export function fileTxn(os: LifeOSContext, m: RawMessage, t: ParsedTxn, ctx: FileContext): FileOutcome {
  const id = ctx.id;
  const item = { source: m.source, from: m.from, text: m.body, title: m.title ?? null, account: m.account ?? null, receivedAt: m.receivedAt };
  const created: string[] = [];
  const date = t.date ?? iso(item.receivedAt);
  // To or from your own name: money moving between your accounts.
  if (!t.investment && !t.transfer && isMyName(os, t.counterparty)) t = { ...t, transfer: true };
  // A nameless debit by NACH for one of your SIPs is that SIP; any other is asked about once it is filed.
  const nach = !t.investment && !t.transfer && t.direction === 'debit' && t.currency === 'INR' && isNamelessNach(item.text, t.counterparty);
  const sipId = nach ? sipFor(os, t.amount, date) : null;
  if (sipId) t = { ...t, investment: true, fund: os.records.get(sipId)?.title ?? null };

  // Spent abroad: rupees from the message when it says, else the day's rate (converted later if none yet).
  let amount = t.amount;
  let fx: Record<string, unknown> = {};
  if (t.currency !== 'INR') {
    const conv = t.inrAmount ? { inr: t.inrAmount, rate: Math.round((t.inrAmount / t.amount) * 10000) / 10000 } : toInr(os, t.amount, t.currency);
    amount = conv?.inr ?? t.amount;
    fx = { originalAmount: t.amount, originalCurrency: t.currency, fxRate: conv?.rate, currency: 'INR' };
  }

  let data: Record<string, unknown>;
  let label: string;
  let flag: string | null = null;
  if (t.investment) {
    // A mutual fund SIP / redemption (R1): an investment transaction on its Investment record, out of spend; invested moves with it.
    const bank = t.last4 ? accountFor(os, { ...t, investment: false }, item.from, created) : null;
    const inv = sipId ?? investmentFor(os, t.fund, created);
    const out = t.direction === 'debit';
    data = { amount, kind: 'investment', category: 'investment', merchant: t.fund ?? 'Mutual fund', date, accountId: bank ?? undefined, investmentId: inv ?? undefined, note: t.ref ? `Ref ${t.ref}` : undefined };
    if (inv) {
      const cur = os.records.get<{ invested?: number }>(inv);
      os.records.update(inv, { data: { invested: Math.max(0, (cur?.data.invested ?? 0) + (out ? amount : -amount)) } }, 'assistant');
    }
    label = `${out ? 'Invested' : 'Redeemed'} ${os.format.currency(amount)} · ${t.fund ?? 'mutual fund'}`;
  } else {
    const accountId = accountFor(os, t, item.from, created);
    const paired = accountId ? pairTransfer(os, t, accountId, amount, date) : null;
    if (paired) {
      for (const a of created) os.filings.add({ source: item.source, sourceRef: id, kind: 'account', entityId: a, label: `Account: ${os.records.get(a)?.title ?? 'new account'}` });
      os.filings.add({ source: item.source, sourceRef: id, kind: 'transaction', action: 'updated', entityId: paired, label: `Transfer · ${os.format.currency(amount)} · both halves joined, not spending or income` });
      return { status: 'duplicate', entityId: paired, note: 'the other half of a transfer between your accounts' };
    }
    const kind = t.transfer || t.channel === 'atm' ? 'transfer' : t.direction === 'credit' ? 'income' : 'expense';
    // The bank says what is left ("Avl Bal"): the account starts from that, so its balance follows the bank (not a card: its figure is the limit).
    if (accountId && t.balance != null && t.currency === 'INR') noteBalance(os, accountId, t.balance, date, item.receivedAt);
    // Cash out of an ATM lands in your Cash account.
    const cashId = t.channel === 'atm' && t.direction === 'debit' ? cashAccount(os, created) : null;
    const merchant = t.counterparty ?? (t.channel === 'atm' ? 'ATM withdrawal' : undefined);
    // A refund comes back in the category of what it refunds (Adidas → Shopping), so it can come off that spending.
    let category = t.channel === 'atm' || t.transfer ? 'transfer' : categoryFor(os, merchant, item.text, amount, t.refund ? 'debit' : t.direction);
    // An autopay / e-mandate / SI charge from somewhere we don't know is still a subscription.
    if (category === 'other' && kind === 'expense' && t.recurring && t.counterparty) category = 'subscriptions';
    const note = [item.source === 'email' ? `From ${item.account ?? 'email'}` : null, t.ref ? `Ref ${t.ref}` : null].filter(Boolean).join(' · ');
    // Money coming in by transfer arrives at this account; going out leaves it.
    const arrives = kind === 'transfer' && t.direction === 'credit';
    data = { amount, kind, category, merchant, date, accountId: arrives ? undefined : (accountId ?? undefined), toAccountId: arrives ? (accountId ?? undefined) : (cashId ?? undefined), note: note || undefined, ...(t.refund && kind === 'income' ? { refund: true } : {}), ...fx };
    const shown = t.currency !== 'INR' ? `${t.currency} ${t.amount.toLocaleString('en-IN')}${fx.fxRate ? ` (${os.format.currency(amount)})` : ''}` : os.format.currency(amount);
    label = `${kind === 'income' ? (t.refund ? 'Refund' : 'Received') : kind === 'transfer' ? (t.channel === 'atm' ? 'Cash' : 'Transfer') : 'Spent'} ${shown}${merchant ? ` · ${merchant}` : ''}${t.last4 ? ` · ••${t.last4}` : ''}`;
    if (category === 'other' && kind === 'expense') flag = 'Category unknown — set it once and it’s learned (or add a keyword rule)';
    if (t.currency !== 'INR' && !fx.fxRate) flag = `No ${t.currency} rate yet — converted to rupees when the app is next online`;
    if (item.source === 'email') label += ` · from ${item.account ?? 'email'}`;
  }
  data.source = item.source === 'email' ? 'mail' : item.source;
  data.sourceRef = id;
  data.rawText = (item.source === 'email' ? `${item.title ?? ''}\n${item.text}` : item.text).slice(0, 2000);
  const e = os.records.create({ object: 'transaction', data }, 'assistant');
  if (data.kind === 'transfer' && typeof data.toAccountId === 'string') payStatement(os, data.toAccountId, amount);
  // Everyone you pay or get paid by is one record; this payment joins theirs.
  if (!t.investment && !t.transfer && t.channel !== 'atm' && (t.counterparty || t.vpa)) {
    const pm = payeeFor(os, t.counterparty, t.vpa, { business: data.category !== 'other' && data.category !== 'transfer' ? true : undefined });
    if (pm) {
      linkPayee(os, e.id, pm, t.counterparty, t.vpa, item.source);
      if (pm.guess) flag = pm.guess;
      // One name per payee: "PLAYO" and "Playo" both read Playo (the bank's spelling stays in the merchant Field).
      const name = pm.guess ? null : os.records.get(pm.id)?.title;
      if (name && name !== e.title) os.records.update(e.id, { title: name }, 'assistant');
      // A UPI ID no one has, under a person's name: To check asks who it is (in place of "Payee: …").
      const asked = askWhoIs(os, e.id, pm, t.counterparty, t.vpa, item.source, id);
      if (pm.created && !asked) created.push(pm.id);
    }
  }
  // What you taught it for this payee (any name the bank uses for them) beats the name match and the built-in list.
  const byPayee = !t.investment && !t.transfer && t.channel !== 'atm' && !ruleCategory(os, data.merchant as string | undefined, item.text, amount, t.direction) ? learnedCategory(os, null, payeeOf(os, e.id)?.id) : null;
  if (byPayee && byPayee !== data.category) {
    os.records.update(e.id, { data: { category: byPayee } }, 'assistant');
    data.category = byPayee;
    if (flag?.startsWith('Category unknown')) flag = null;
  }
  // A range rule ("₹100–200 received → Football") needs the payer, so it's checked once they're linked.
  if (!byPayee && !t.investment && !t.transfer && t.channel !== 'atm' && !ruleCategory(os, data.merchant as string | undefined, item.text, amount, t.direction)) {
    const payerId = os.links.forEntity(e.id).find((r) => r.relation.kind === 'person' && r.direction === 'out')?.other.id ?? null;
    const rr = rangeRule(os, { amount, direction: t.direction, payerId, merchant: data.merchant as string | undefined, at: item.receivedAt });
    if (rr && rr.category !== data.category) {
      os.records.update(e.id, { data: { category: rr.category } }, 'assistant');
      data.category = rr.category;
      const name = os.registry.objects.get('transaction')?.fields.find((f) => f.key === 'category')?.options?.find((o) => o.value === rr.category)?.label ?? rr.category;
      label += ` · ${name}`;
      if (!rr.sure) flag = `Guessed ${name}: ${rr.why}. Change the category if not — it won’t guess for this payer again`;
    }
  }
  if (!t.investment && !t.transfer && t.direction === 'debit' && data.category === 'subscriptions' && typeof data.merchant === 'string') {
    linkSubscription(os, e.id, data.merchant, amount, date, (data.accountId as string | undefined) ?? undefined, created, item.source as 'sms' | 'notification' | 'email', fx.originalCurrency ? { amount: fx.originalAmount as number, currency: fx.originalCurrency as string } : undefined);
  }
  os.records.timeline.add({ entityId: e.id, kind: item.source, title: `From ${sourceLabel(os, m)}`, body: (item.source === 'email' ? `${item.title ?? ''}\n${item.text}` : item.text).slice(0, 300), actor: 'system', occurredAt: item.receivedAt, meta: { ingestId: id } });
  for (const a of created) {
    const ce = os.records.get(a);
    const kind = ce?.object === 'org' || ce?.object === 'subscription' || ce?.object === 'investment' ? ce.object : 'account';
    const label = kind === 'org' ? `Payee: ${ce!.title}` : kind === 'subscription' ? `Subscription: ${ce!.title} (monthly — change if yearly)` : kind === 'investment' ? `Investment: ${ce!.title}` : `Account: ${ce?.title ?? 'new account'}`;
    os.filings.add({ source: item.source, sourceRef: id, kind, entityId: a, label });
  }
  os.filings.add({ source: item.source, sourceRef: id, kind: 'transaction', entityId: e.id, label, flag });
  if (nach && !sipId) askSip(os, e.id, amount, date, item.source, id);
  // Paid a month apart, three times: perhaps a subscription.
  if (data.kind === 'expense' && !payBill(os, e.id)) spotSubscription(os, e.id);
  // A ticket or booking filed from the same mail: this payment paid for it.
  for (const r of ctx.related) os.links.link(e.id, r.id, r.word, {}, 'assistant', { source: item.source, sourceId: id });
  return { status: 'confirmed', entityId: e.id };
}

/** The Investment a fund confirmation belongs to: by name or scheme code, else a new mutual-fund holding. */
export function investmentFor(os: LifeOSContext, fund: string | null, created: string[]): string | null {
  if (!os.registry.objects.has('investment')) return null;
  const title = (fund ? fund.replace(/\s+(?:SIP|Direct|Growth|Plan)\b.*$/i, '').trim() : '') || 'Mutual fund';
  const all = os.records.query<{ code?: string }>('investment', {}, { limit: 500 });
  const hit = all.find((i) => norm(i.title) === norm(title) || (i.data.code && fund && norm(fund).includes(norm(i.data.code))));
  if (hit) return hit.id;
  const inv = os.records.create({ object: 'investment', title, data: { instrument: 'mutual_fund', invested: 0 }, status: 'active' }, 'assistant');
  created.push(inv.id);
  return inv.id;
}

const DAY_MS = 86_400_000;
const addMonths = (day: string, n = 1) => {
  const d = new Date(`${day}T12:00:00`);
  d.setMonth(d.getMonth() + n);
  return iso(d.getTime());
};
/** Months between renewals for a subscription's billing cycle. */
const cycleMonths = (rrule = '') => (/YEARLY/.test(rrule) ? 12 : /MONTHLY/.test(rrule) ? Number(/INTERVAL=(\d+)/.exec(rrule)?.[1] ?? 1) : 1);

/**
 * A subscription charge (Adobe, Netflix, an e-mandate) joins its Subscription
 * record — made on the first charge seen (not auto-posted: the bank texts
 * bring each renewal), kept current after. When an auto-posted bill for the
 * same renewal already exists, the real charge replaces it.
 */
function linkSubscription(os: LifeOSContext, txId: string, name: string, amount: number, date: string, accountId: string | undefined, created: string[], via: 'sms' | 'notification' | 'email' = 'sms', foreign?: { amount: number; currency: string }) {
  if (!os.registry.objects.has('subscription')) return;
  const sub = findSubscription(os, name);
  if (!sub) {
    const s = os.records.create({ object: 'subscription', data: { name, amount, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: addMonths(date), category: 'subscriptions', accountId, autoPost: false, foreign } }, 'assistant');
    os.links.link(txId, s.id, 'subscription', {}, 'assistant', { source: via });
    created.push(s.id);
    return;
  }
  os.links.link(txId, sub.id, 'subscription', {}, 'assistant', { source: via });
  const at = new Date(`${date}T12:00:00`).getTime();
  // An auto-posted bill for this renewal (within five days) was a placeholder for this charge.
  for (const r of os.links.forEntity(sub.id, 'subscription')) {
    if (r.direction !== 'in' || r.other.id === txId) continue;
    const tx = os.records.get<{ note?: string; date?: string }>(r.other.id);
    if (tx?.data.note === 'Auto-posted subscription' && tx.data.date && Math.abs(new Date(`${tx.data.date}T12:00:00`).getTime() - at) <= 5 * DAY_MS) os.records.delete(tx.id, 'assistant');
  }
  const patch: Record<string, unknown> = { ...notePrice(sub, amount, foreign, date) };
  if (!sub.data.accountId && accountId) patch.accountId = accountId;
  // Billed now: the next renewal is a cycle on (only when this charge is the one that was due).
  if (sub.data.nextBillingAt <= iso(at + 5 * DAY_MS)) patch.nextBillingAt = addMonths(date, cycleMonths(sub.data.rrule));
  if (Object.keys(patch).length) os.records.update(sub.id, { data: patch }, 'assistant');
}

/**
 * One movement between two of your accounts often comes as two texts: a card
 * bill (the debit, and the card's "payment received"), a card's credit balance
 * sent to savings, money into your loan account. Whichever comes second joins
 * the first as one transfer, from → to, so it is never counted as spending or
 * income. A plain spend only joins a transfer in, and plain income only a
 * transfer out, so a friend's ₹200 never cancels your ₹200 lunch. Returns the
 * transaction it joined.
 */
function pairTransfer(os: LifeOSContext, t: ParsedTxn, accountId: string, amount: number, date: string): string | null {
  if (t.investment || t.currency !== 'INR') return null;
  const d = new Date(`${date}T12:00:00`).getTime();
  const legs = os.db.all<{ id: string; kind: string; acc: string | null; to: string | null }>(
    `SELECT id, json_extract(data,'$.kind') AS kind, json_extract(data,'$.accountId') AS acc, json_extract(data,'$.toAccountId') AS "to" FROM records
       WHERE object='transaction' AND deleted_at IS NULL AND ABS(json_extract(data,'$.amount') - ?) < 0.01 AND json_extract(data,'$.date') BETWEEN ? AND ?`,
    [amount, iso(d - DAY_MS), iso(d + DAY_MS)],
  );
  const out = (r: (typeof legs)[number]) => !!r.acc && r.acc !== accountId && ((r.kind === 'transfer' && !r.to) || (t.transfer && r.kind === 'expense'));
  const into = (r: (typeof legs)[number]) => (r.kind === 'transfer' ? !!r.to && !r.acc && r.to !== accountId : t.transfer && r.kind === 'income' && !!r.acc && r.acc !== accountId);
  if (t.direction === 'credit') {
    const leg = legs.find(out);
    if (!leg) return null;
    os.records.update(leg.id, { data: { kind: 'transfer', category: 'transfer', toAccountId: accountId } }, 'assistant');
    payStatement(os, accountId, amount);
    return leg.id;
  }
  const leg = legs.find(into);
  if (!leg) return null;
  os.records.update(leg.id, { data: { kind: 'transfer', category: 'transfer', accountId, toAccountId: leg.to ?? leg.acc } }, 'assistant');
  if (leg.to ?? leg.acc) payStatement(os, (leg.to ?? leg.acc)!, amount);
  return leg.id;
}

/** A payment into a card that covers its bill clears the bill. */
function payStatement(os: LifeOSContext, cardId: string, amount: number) {
  const st = os.records.get<{ kind?: string; statement?: { total: number } }>(cardId)?.data;
  if (st?.kind === 'credit' && st.statement && amount >= st.statement.total - 0.5) os.records.update(cardId, { data: { statement: undefined } }, 'assistant');
}

/** Keep the balance a bank text stated on its account, when it is the newest one heard. */
function noteBalance(os: LifeOSContext, accountId: string, balance: number, day: string, at: number) {
  const a = os.records.get<{ kind?: string; knownAt?: number }>(accountId);
  if (!a || a.data.kind === 'credit' || (a.data.knownAt ?? 0) > at) return;
  os.records.update(accountId, { data: { knownBalance: balance, knownOn: day, knownAt: at } }, 'assistant');
}

/** Your Cash account: the one you have, else one made (kind cash). */
function cashAccount(os: LifeOSContext, created: string[]): string | null {
  if (!os.registry.objects.has('account')) return null;
  const have = os.records.query<{ kind?: string }>('account', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'cash' }] } }, { limit: 5 })[0];
  if (have) return have.id;
  const a = os.records.create({ object: 'account', title: 'Cash', data: { kind: 'cash', openingBalance: 0, currency: 'INR' } }, 'assistant');
  created.push(a.id);
  return a.id;
}

/** A transaction for this amount within a day either side (from any source). */
export function sameMoneyFor(os: LifeOSContext, amount: number, kind: string, day: string): string | null {
  if (!os.registry.objects.has('transaction')) return null;
  const d = new Date(`${day}T12:00:00`).getTime();
  return (
    os.db.get<{ id: string }>(
      `SELECT id FROM records WHERE object='transaction' AND deleted_at IS NULL AND json_extract(data,'$.kind')=? AND ABS(json_extract(data,'$.amount') - ?) < 0.5
         AND json_extract(data,'$.date') BETWEEN ? AND ? ORDER BY ABS(julianday(json_extract(data,'$.date')) - julianday(?)) LIMIT 1`,
      [kind, amount, iso(d - DAY), iso(d + DAY), day],
    )?.id ?? null
  );
}
