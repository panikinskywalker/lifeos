import type { LifeOSContext } from '@core/registry/context';
import type { FileContext, FileOutcome, MessageParser, ParserRead, RawMessage } from '@core/filing/contract';
import { setDedupeKey, sourceLabel } from '@core/filing/queue';
import { mailKind } from '@core/filing/mail';
import { BANK_NAMES, PAYMENT_APPS, bankOf, looksLikeBankSender, parseBankSms, parsePaymentNotification, parseCardBill, parseUpcomingCharge, type CardBill, type ParsedTxn, type SmsKind, type UpcomingCharge } from './bankSms';
import { fileHeadsUp } from './recurring';
import { fileBillDue, parseBillDue, type BillDue } from './bills';
import { accountFor } from './accounts';
import { receiptTxn } from './mail';
import { dedupeKey, enrichFrom, fileTxn, findDuplicateFor, sameMoneyFor } from './transactions';

/**
 * The money parser (finance filing, R1): bank SMS, payment-app notifications
 * and receipt / bank-alert mails → a Transaction. It is the first-run history
 * parser too (`proposes`), and it names bank senders so they are trusted by
 * default.
 */

const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type MoneyRead = ParserRead & ({ kind: 'txn'; txn: ParsedTxn } | { kind: 'card-bill'; reason: 'bill'; bill: CardBill } | { kind: 'heads-up'; reason: 'mandate'; charge: UpcomingCharge } | { kind: 'bill-due'; reason: 'bill'; due: BillDue } | { kind: 'skip'; reason: string });

/** A text the bank parser sets aside as a bill may be a card's statement or reminder: then it is filed on the card. */
function orCardBill(r: SmsKind, text: string, from: string, at = 0): MoneyRead {
  // The heads-up before a standing-instruction charge sets that Subscription's next charge.
  if (r.kind === 'skip' && r.reason === 'mandate') {
    const charge = parseUpcomingCharge(text, at);
    return charge ? { kind: 'heads-up', reason: 'mandate', charge } : (r as MoneyRead);
  }
  if (r.kind !== 'skip' || r.reason !== 'bill') return r as MoneyRead;
  const bill = parseCardBill(text, from);
  if (bill) return { kind: 'card-bill', reason: 'bill', bill };
  // Any other bill with an amount (electricity, water, an EMI) is filed as a bill to pay.
  const due = parseBillDue(text, from, at);
  return due ? { kind: 'bill-due', reason: 'bill', due } : (r as MoneyRead);
}

function read(_os: LifeOSContext, m: RawMessage): MoneyRead | null {
  if (m.source === 'sms') return orCardBill(parseBankSms(m.body, m.from), m.body, m.from, m.receivedAt);
  if (m.source === 'notification') return orCardBill(parsePaymentNotification(m.from, m.title ?? '', m.body), `${m.title ?? ''}\n${m.body}`, m.from, m.receivedAt);
  // Mail: only receipts, invoices and bank alerts are money; tickets and bookings carry their payment too.
  const k = mailKind({ from: m.from, fromName: String(m.meta?.fromName ?? ''), subject: m.title ?? '' });
  if (!k || k === 'shipping') return null;
  const mail = { from: m.from, fromName: String(m.meta?.fromName ?? ''), subject: m.title ?? '', text: m.body, date: m.receivedAt, uid: Number(m.meta?.uid ?? 0) };
  if (k === 'bank') {
    const r = parseBankSms(`${m.title ?? ''}\n${m.body}`.slice(0, 2000), mail.fromName || m.from) as SmsKind;
    return r.kind === 'txn' ? { kind: 'txn', txn: { ...r.txn, date: r.txn.date ?? iso(m.receivedAt) } } : orCardBill(r, `${m.title ?? ''}\n${m.body}`, mail.fromName || m.from, m.receivedAt);
  }
  const txn = receiptTxn(mail);
  if (txn) return { kind: 'txn', txn };
  // A ticket or booking with no amount in it is travel's alone.
  return k === 'flight' || k === 'stay' ? null : { kind: 'skip', reason: 'no amount found' };
}

/** A card's bill (statement or reminder) lands on the card's account: total, minimum, due date. The newest wins. */
function fileCardBill(os: LifeOSContext, m: RawMessage, bill: CardBill, ctx: FileContext): FileOutcome {
  if (!bill.last4 || !os.registry.objects.has('account')) return { status: 'dismissed', note: 'a card bill with no card named' };
  const created: string[] = [];
  const card = accountFor(os, { isCard: true, last4: bill.last4, bank: bill.bank } as ParsedTxn, m.from, created);
  if (!card) return { status: 'dismissed', note: 'no card' };
  const prev = os.records.get<{ statement?: { at: number } }>(card)?.data.statement;
  if (!prev || prev.at <= m.receivedAt) os.records.update(card, { data: { statement: { total: bill.total, min: bill.min ?? undefined, dueOn: bill.dueOn, at: m.receivedAt } } }, 'assistant');
  const due = new Date(`${bill.dueOn}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  os.filings.add({ source: m.source, sourceRef: ctx.id, kind: 'card-bill', action: 'updated', entityId: card, label: `Card bill · ${os.format.currency(bill.total)} due ${due} · ••${bill.last4}` });
  return { status: 'confirmed', entityId: card };
}

function file(os: LifeOSContext, m: RawMessage, r: ParserRead, ctx: FileContext): FileOutcome {
  if ((r as MoneyRead).kind === 'card-bill') return fileCardBill(os, m, (r as MoneyRead & { kind: 'card-bill' }).bill, ctx);
  if ((r as MoneyRead).kind === 'bill-due') return fileBillDue(os, m, (r as MoneyRead & { kind: 'bill-due' }).due, ctx);
  if ((r as MoneyRead).kind === 'heads-up') return fileHeadsUp(os, m, (r as MoneyRead & { kind: 'heads-up' }).charge, ctx);
  const t = (r as MoneyRead & { kind: 'txn' }).txn;
  if (!os.registry.objects.has('transaction')) return { status: 'failed', note: 'finance module not installed' };
  setDedupeKey(os, ctx.id, dedupeKey(t));
  if (m.source === 'email') {
    // The bank SMS (or you) may have filed this payment already: confirm it instead of counting it twice.
    const same = sameMoneyFor(os, t.amount, t.direction === 'credit' ? 'income' : 'expense', t.date ?? iso(m.receivedAt), t.counterparty);
    if (same) {
      enrichFrom(os, same, t, m);
      const e = os.records.get<{ merchant?: string }>(same)!;
      // The mail knows who it was ("Adobe"), where the bank only had a code.
      if (t.counterparty && (!e.data.merchant || /\d{4,}|\*/.test(e.data.merchant))) os.records.update(same, { data: { merchant: t.counterparty } }, 'assistant');
      os.filings.add({ source: 'email', sourceRef: ctx.id, kind: 'transaction', action: 'updated', entityId: same, label: `Matched ${os.records.get(same)?.title ?? 'a payment'} · ${os.format.currency(t.amount)} to an email from ${m.account ?? 'Gmail'}` });
      for (const rel of ctx.related) os.links.link(same, rel.id, rel.word, {}, 'assistant', { source: 'email', sourceId: ctx.id });
      return { status: 'duplicate', entityId: same, note: 'same payment as a filed transaction' };
    }
    return fileTxn(os, m, t, ctx);
  }
  const dup = findDuplicateFor(os, ctx.id, t, m);
  if (dup?.ingestId) {
    // The second sighting may know more (the SMS has the account, the app has the name).
    if (dup.entityId) enrichFrom(os, dup.entityId, t, m);
    return { status: 'duplicate', entityId: dup.entityId ?? null, note: `same payment as ${dup.ingestId}` };
  }
  if (dup?.entityId) {
    // You already said it: this message confirms it and fills in the account.
    enrichFrom(os, dup.entityId, t, m);
    const e = os.records.get(dup.entityId)!;
    os.filings.add({ source: m.source, sourceRef: ctx.id, kind: 'transaction', action: 'updated', entityId: e.id, label: `Matched ${e.title} · ${os.format.currency(t.amount)} to ${sourceLabel(os, m)}` });
    return { status: 'confirmed', entityId: dup.entityId, note: 'matched a transaction you filed' };
  }
  return fileTxn(os, m, t, ctx);
}

export const moneyParser: MessageParser = {
  id: 'finance.money',
  module: 'finance',
  priority: 30,
  proposes: true,
  sender: (from, body) => {
    const bank = bankOf(from, body);
    if (bank || looksLikeBankSender(from, body)) return { name: bank ? BANK_NAMES[bank] : null, trusted: looksLikeBankSender(from, body) };
    // A biller (MSEDCL, a water board) is read once it sends a bill with an amount.
    return parseBillDue(body, from, 0) ? { name: null, trusted: true } : null;
  },
  label: (m) => {
    if (m.source === 'notification') return PAYMENT_APPS[m.from] ?? null;
    if (m.source === 'sms') {
      const b = bankOf(m.from);
      return b ? `${BANK_NAMES[b]} SMS` : null;
    }
    return null;
  },
  read,
  file,
};

export const financeParsers: MessageParser[] = [moneyParser];
