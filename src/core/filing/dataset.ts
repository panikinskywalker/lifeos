import type { LifeOSContext } from '../registry/context';
import type { RawMessage } from './contract';
import { messageOutcome } from './queue';

/**
 * The parser dataset (docs/MODEL.md §4 — training the message parsers; R1:
 * every inbox). Your texts, payment notifications and the mail the app
 * fetched, each with what every parser read in it, what the app filed, and
 * what you corrected afterwards — exported as one JSON file so the parsers
 * (and later your own model) are rebuilt against real messages. One-time
 * codes, promotions and personal senders are left out. It leaves the phone
 * only through the share sheet.
 */

export interface DatasetMessage {
  source: 'sms' | 'notification' | 'email';
  from: string;
  title?: string | null;
  body: string;
  at: number;
  account?: string | null;
}

/** "Never share your OTP" at the end of a payment text doesn't make it an OTP. */
const NOT_SHARING = /\b(?:never|do not|don'?t|pls do not|please do not)\s+(?:share|disclose)\b[^.\n]*/gi;
const OTP_WORDS = /\b(otp|one[- ]time (?:password|pin|code)|verification code|security code|login code|passcode|auth(?:entication)? code|confirmation code)\b/i;

export function isOtpText(body: string): boolean {
  return OTP_WORDS.test(body.replace(NOT_SHARING, ''));
}

/** A person's phone number (a friend's text), not a bank / shop header or a service short code. */
export function isPersonalSender(from: string): boolean {
  return /^\+?\d{10,}$/.test(from.replace(/[\s-]/g, ''));
}

/** Mail from a person rather than a service: no-reply and brand mailers are services. */
export function isPersonalMail(from: string, fromName = ''): boolean {
  const a = from.toLowerCase();
  if (/no-?reply|donotreply|noreply|alerts?@|notifications?@|billing@|receipts?@|orders?@|support@|info@|hello@|team@|news@|updates?@|care@|service@|booking|tickets?@/.test(a)) return false;
  if (/gmail\.com|yahoo\.|outlook\.|hotmail\.|icloud\.com|proton/.test(a)) return true;
  return /^[a-z]+(?:\.[a-z]+)?@/.test(a) && !/\d/.test(fromName) && fromName.split(' ').length <= 3 && !/bank|card|pay|shop|store|air|travel|hotel/i.test(fromName);
}

function localIso(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** What every parser read in one message (null = not its business). */
function parserViews(os: LifeOSContext, m: RawMessage): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of os.registry.parsers.values()) {
    try {
      const r = p.read(os, m);
      if (r) out[p.id] = r;
    } catch (e) {
      out[p.id] = { kind: 'error', reason: (e as Error).message };
    }
  }
  return out;
}

/**
 * Your corrections to what was filed from this message: the record as it is
 * now against what filing wrote (category changed, payee rejected, amount
 * fixed), from the filings' `before` snapshots and the record's current data.
 */
function corrections(os: LifeOSContext, recordId: string | null | undefined): Record<string, unknown> | null {
  if (!recordId) return null;
  const e = os.records.get(recordId);
  if (!e) return { deleted: true };
  const edits = os.records.timeline.forEntity(recordId, 50).filter((t) => t.actor === 'user' && (t.kind === 'updated' || t.kind === 'edited'));
  if (!edits.length) return null;
  const d = e.data as Record<string, unknown>;
  return {
    edits: edits.length,
    now: Object.fromEntries(['amount', 'kind', 'category', 'merchant', 'payeeId', 'date', 'accountId', 'investmentId', 'status', 'shop', 'carrier'].filter((k) => d[k] !== undefined).map((k) => [k, d[k]])),
    changed: edits.flatMap((t) => (Array.isArray((t.meta as { changed?: string[] }).changed) ? (t.meta as { changed: string[] }).changed : [])),
  };
}

export interface Dataset {
  format: 'lifeos-parser-dataset';
  version: 2;
  exportedAt: string;
  since: string;
  parsers: string[];
  counts: Record<string, number>;
  /** Every kept message, newest first: raw text, what each parser read, what the app filed, your corrections. */
  messages: Array<Record<string, unknown>>;
}

export function buildDataset(os: LifeOSContext, inbox: DatasetMessage[], opts: { since: number; now?: number }): Dataset {
  const counts: Record<string, number> = { sms: 0, notification: 0, email: 0, otp: 0, personal: 0 };
  const messages: Array<Record<string, unknown>> = [];
  for (const m of [...inbox].filter((x) => x.at >= opts.since).sort((a, b) => b.at - a.at)) {
    if ((m.source === 'sms' && isPersonalSender(m.from)) || (m.source === 'email' && isPersonalMail(m.from, m.title ?? ''))) {
      counts.personal!++;
      continue;
    }
    if (isOtpText(`${m.title ?? ''} ${m.body}`)) {
      counts.otp!++;
      continue;
    }
    counts[m.source] = (counts[m.source] ?? 0) + 1;
    const raw: RawMessage = { source: m.source, from: m.from, title: m.title ?? null, body: m.body, receivedAt: m.at, account: m.account ?? null };
    const app = messageOutcome(os, raw);
    const recordId = os.db.get<{ record_id: string | null }>(`SELECT record_id FROM ingest_queue WHERE source=? AND package=? AND received_at=? LIMIT 1`, [m.source, m.from, m.at])?.record_id ?? null;
    messages.push({
      i: messages.length + 1,
      source: m.source,
      from: m.from,
      account: m.account ?? undefined,
      at: localIso(m.at),
      title: m.title ?? undefined,
      text: m.body,
      read: parserViews(os, raw),
      app,
      corrections: corrections(os, recordId),
    });
  }
  return {
    format: 'lifeos-parser-dataset',
    version: 2,
    exportedAt: localIso(opts.now ?? Date.now()),
    since: localIso(opts.since),
    parsers: [...os.registry.parsers.keys()],
    counts,
    messages,
  };
}

/** The notifications and mail the app kept in its queue (SMS come from the phone's inbox). */
export function queuedMessages(os: LifeOSContext, since: number): DatasetMessage[] {
  return os.db
    .all<{ source: string; package: string; raw_title: string | null; raw_text: string | null; received_at: number; raw_extra: string | null }>(
      `SELECT source, package, raw_title, raw_text, received_at, raw_extra FROM ingest_queue WHERE source IN ('notification','email') AND raw_text IS NOT NULL AND received_at >= ? ORDER BY received_at DESC`,
      [since],
    )
    .map((n) => ({ source: n.source as DatasetMessage['source'], from: n.package, title: n.raw_title, body: n.raw_text ?? '', at: n.received_at, account: n.raw_extra ? ((JSON.parse(n.raw_extra) as { account?: string }).account ?? null) : null }));
}
