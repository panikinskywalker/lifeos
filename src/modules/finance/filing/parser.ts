import type { LifeOSContext } from '@core/registry/context';
import type { FileContext, FileOutcome, MessageParser, ParserRead, RawMessage } from '@core/filing/contract';
import { setDedupeKey, sourceLabel } from '@core/filing/queue';
import { mailKind } from '@core/filing/mail';
import { BANK_NAMES, PAYMENT_APPS, bankOf, looksLikeBankSender, parseBankSms, parsePaymentNotification, type ParsedTxn, type SmsKind } from './bankSms';
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

type MoneyRead = ParserRead & ({ kind: 'txn'; txn: ParsedTxn } | { kind: 'skip'; reason: string });

function read(_os: LifeOSContext, m: RawMessage): MoneyRead | null {
  if (m.source === 'sms') return parseBankSms(m.body, m.from) as MoneyRead;
  if (m.source === 'notification') return parsePaymentNotification(m.from, m.title ?? '', m.body) as MoneyRead;
  // Mail: only receipts, invoices and bank alerts are money; tickets and bookings carry their payment too.
  const k = mailKind({ from: m.from, fromName: String(m.meta?.fromName ?? ''), subject: m.title ?? '' });
  if (!k || k === 'shipping') return null;
  const mail = { from: m.from, fromName: String(m.meta?.fromName ?? ''), subject: m.title ?? '', text: m.body, date: m.receivedAt, uid: Number(m.meta?.uid ?? 0) };
  if (k === 'bank') {
    const r = parseBankSms(`${m.title ?? ''}\n${m.body}`.slice(0, 2000), mail.fromName || m.from) as SmsKind;
    return r.kind === 'txn' ? { kind: 'txn', txn: { ...r.txn, date: r.txn.date ?? iso(m.receivedAt) } } : { kind: 'skip', reason: r.reason };
  }
  const txn = receiptTxn(mail);
  if (txn) return { kind: 'txn', txn };
  // A ticket or booking with no amount in it is travel's alone.
  return k === 'flight' || k === 'stay' ? null : { kind: 'skip', reason: 'no amount found' };
}

function file(os: LifeOSContext, m: RawMessage, r: ParserRead, ctx: FileContext): FileOutcome {
  const t = (r as MoneyRead & { kind: 'txn' }).txn;
  if (!os.registry.objects.has('transaction')) return { status: 'failed', note: 'finance module not installed' };
  setDedupeKey(os, ctx.id, dedupeKey(t));
  if (m.source === 'email') {
    // The bank SMS (or you) may have filed this payment already: confirm it instead of counting it twice.
    const same = sameMoneyFor(os, t.amount, t.direction === 'credit' ? 'income' : 'expense', t.date ?? iso(m.receivedAt));
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
  const dup = findDuplicateFor(os, ctx.id, t, m.receivedAt);
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
    return bank || looksLikeBankSender(from, body) ? { name: bank ? BANK_NAMES[bank] : null, trusted: looksLikeBankSender(from, body) } : null;
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
