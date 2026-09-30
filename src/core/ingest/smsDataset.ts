/**
 * A parser dataset: the phone's texts from banks, shops and services, each
 * with what the parser reads in it and what the app filed, exported so the
 * parser can be rebuilt against real messages. One-time codes and texts
 * from personal phone numbers are left out. Pure apart from the lookup of
 * what the app did (the ingest queue), so it runs in tests.
 */

import type { LifeOSContext } from '../registry/context';
import { bankOf, parseBankSms, parsePaymentNotification } from './bankSms';
import { parseDeliverySms } from './delivery';
import { ingestOutcome } from './ingest';

export interface DatasetSms {
  from: string;
  body: string;
  at: number;
}

/** "Never share your OTP" at the end of a payment text doesn't make it an OTP. */
const NOT_SHARING = /\b(?:never|do not|don'?t|pls do not|please do not)\s+(?:share|disclose)\b[^.\n]*/gi;
const OTP_WORDS = /\b(otp|one[- ]time (?:password|pin|code)|verification code|security code|login code|passcode|auth(?:entication)? code)\b/i;

export function isOtpText(body: string): boolean {
  return OTP_WORDS.test(body.replace(NOT_SHARING, ''));
}

/** A person's phone number (a friend's text), not a bank / shop header or a service short code. */
export function isPersonalSender(from: string): boolean {
  return /^\+?\d{10,}$/.test(from.replace(/[\s-]/g, ''));
}

function localIso(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** What the parser reads in one text, trimmed to the fields that matter for checking it. */
function parserView(body: string, from: string, at: number) {
  const p = parseBankSms(body, from);
  const parser =
    p.kind === 'txn'
      ? {
          kind: 'txn' as const,
          direction: p.txn.direction,
          amount: p.txn.amount,
          currency: p.txn.currency,
          channel: p.txn.channel,
          last4: p.txn.last4,
          isCard: p.txn.isCard,
          counterparty: p.txn.counterparty,
          vpa: p.txn.vpa,
          ref: p.txn.ref,
          balance: p.txn.balance,
          date: p.txn.date,
          transfer: p.txn.transfer || undefined,
          investment: p.txn.investment || undefined,
          fund: p.txn.fund ?? undefined,
          recurring: p.txn.recurring || undefined,
          inrAmount: p.txn.inrAmount ?? undefined,
        }
      : { kind: 'skip' as const, reason: p.reason };
  const d = parseDeliverySms(body, from, at);
  const delivery = d ? { status: d.status, shop: d.shop, carrier: d.carrier, item: d.item, tracking: d.tracking, orderId: d.orderId, expected: d.expected } : null;
  return { parser, delivery };
}

export interface SmsDataset {
  format: 'lifeos-parser-dataset';
  version: 1;
  exportedAt: string;
  since: string;
  counts: Record<string, number>;
  /** Texts from banks, shops and services, newest first. */
  sms: Array<Record<string, unknown>>;
  /** Payment-app notifications the app kept (GPay, PhonePe, bank apps), newest first. */
  notifications: Array<Record<string, unknown>>;
}

export function buildSmsDataset(os: LifeOSContext, inbox: DatasetSms[], opts: { since: number; now?: number }): SmsDataset {
  let otp = 0;
  let personal = 0;
  const sms: Array<Record<string, unknown>> = [];
  const byParser: Record<string, number> = {};
  for (const m of [...inbox].sort((a, b) => b.at - a.at)) {
    if (isPersonalSender(m.from)) {
      personal++;
      continue;
    }
    if (isOtpText(m.body)) {
      otp++;
      continue;
    }
    const { parser, delivery } = parserView(m.body, m.from, m.at);
    const key = parser.kind === 'txn' ? `txn:${parser.direction}` : `skip:${parser.reason}`;
    byParser[key] = (byParser[key] ?? 0) + 1;
    sms.push({
      i: sms.length + 1,
      from: m.from,
      bank: bankOf(m.from, m.body),
      at: localIso(m.at),
      text: m.body,
      parser,
      delivery,
      app: ingestOutcome(os, { source: 'sms', from: m.from, body: m.body, receivedAt: m.at }),
    });
  }

  const notifications = os.db
    .all<{ package: string; raw_title: string | null; raw_text: string | null; received_at: number; status: string; error: string | null }>(
      `SELECT package, raw_title, raw_text, received_at, status, error FROM ingest_queue WHERE source='notification' AND raw_text IS NOT NULL AND received_at >= ? ORDER BY received_at DESC`,
      [opts.since],
    )
    .filter((n) => !isOtpText(`${n.raw_title ?? ''} ${n.raw_text ?? ''}`))
    .map((n, i) => {
      const p = parsePaymentNotification(n.package, n.raw_title ?? '', n.raw_text ?? '');
      return {
        i: i + 1,
        app: n.package,
        at: localIso(n.received_at),
        title: n.raw_title,
        text: n.raw_text,
        parser: p.kind === 'txn' ? { kind: 'txn', direction: p.txn.direction, amount: p.txn.amount, counterparty: p.txn.counterparty, vpa: p.txn.vpa, last4: p.txn.last4 } : { kind: 'skip', reason: p.reason },
        filed: { status: n.status, note: n.error },
      };
    });

  return {
    format: 'lifeos-parser-dataset',
    version: 1,
    exportedAt: localIso(opts.now ?? Date.now()),
    since: localIso(opts.since),
    counts: { read: inbox.length, included: sms.length, leftOutOtp: otp, leftOutPersonal: personal, notifications: notifications.length, ...Object.fromEntries(Object.entries(byParser).map(([k, v]) => [`parser ${k}`, v])) },
    sms,
    notifications,
  };
}
