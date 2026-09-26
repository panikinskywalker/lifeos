import type { LifeOSContext } from '../registry/context';
import type { Row } from '../db/adapter';
import { bus } from '../events/bus';
import { parseBankSms, parsePaymentNotification, looksLikeBankSender, bankOf, BANK_NAMES, PAYMENT_APPS, type ParsedTxn, type SmsKind } from './bankSms';

/**
 * Messages → money (PRODUCT v4 §1.5, M4.2). Every bank SMS or payment-app
 * notification is kept raw in ingest_queue, parsed, deduplicated (the same
 * payment seen as an SMS and a GPay notification, or already said in a
 * dump), and filed as a transaction on the right account — live ones at
 * once (with To check + Undo), first-run history as proposals to review.
 */

export interface RawMessage {
  source: 'sms' | 'notification';
  /** SMS sender ("VM-HDFCBK") or the app's package name. */
  from: string;
  title?: string | null;
  body: string;
  receivedAt: number;
}

export interface IngestItem {
  id: string;
  source: string;
  from: string;
  receivedAt: number;
  title: string | null;
  text: string;
  parsed: SmsKind | null;
  status: 'pending' | 'proposed' | 'confirmed' | 'dismissed' | 'duplicate' | 'failed';
  entityId: string | null;
  note: string | null;
}

const toItem = (r: Row): IngestItem => ({
  id: r.id as string,
  source: r.source as string,
  from: (r.package as string | null) ?? '',
  receivedAt: r.received_at as number,
  title: (r.raw_title as string | null) ?? null,
  text: r.raw_text as string,
  parsed: r.parsed ? (JSON.parse(r.parsed as string) as SmsKind) : null,
  status: r.status as IngestItem['status'],
  entityId: (r.entity_id as string | null) ?? null,
  note: (r.error as string | null) ?? null,
});

/** Stable id: the same message imported twice (history re-scan) is one row. */
function messageId(m: RawMessage): string {
  let h = 5381;
  const s = `${m.source}|${m.from}|${m.receivedAt}|${m.body}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `ing_${m.source}_${m.receivedAt.toString(36)}_${(h >>> 0).toString(36)}`;
}

const DAY = 86_400_000;
const WINDOW = 10 * 60_000;
const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/* ------------------------------------------------------------------ */
/* Senders                                                              */
/* ------------------------------------------------------------------ */

export interface SmsSender {
  address: string;
  bank: string | null;
  trusted: boolean;
  /** You've ticked or unticked it (otherwise trust was guessed). */
  decided: boolean;
  count: number;
  lastSeen: number;
  sample: string | null;
}

export function senders(os: LifeOSContext): SmsSender[] {
  return os.db
    .all<Row>(`SELECT * FROM sms_senders ORDER BY trusted DESC, count DESC`)
    .map((r) => ({ address: r.address as string, bank: (r.bank as string | null) ?? null, trusted: r.trusted === 1, decided: r.decided === 1, count: r.count as number, lastSeen: r.last_seen as number, sample: (r.sample as string | null) ?? null }));
}

export function setSenderTrusted(os: LifeOSContext, address: string, trusted: boolean) {
  os.db.run(`UPDATE sms_senders SET trusted=?, decided=1 WHERE address=?`, [trusted ? 1 : 0, address]);
  bus.emit('data.changed', { table: 'sms_senders', id: address });
}

/** Note a sender; its trust is guessed (bank-looking = trusted) until you decide. */
function seeSender(os: LifeOSContext, m: RawMessage): SmsSender {
  const bank = bankOf(m.from, m.body);
  os.db.run(
    `INSERT INTO sms_senders(address,bank,trusted,count,first_seen,last_seen,sample) VALUES (?,?,?,1,?,?,?)
     ON CONFLICT(address) DO UPDATE SET count=count+1, last_seen=MAX(last_seen, excluded.last_seen), bank=COALESCE(bank, excluded.bank),
       trusted=CASE WHEN decided=1 THEN trusted ELSE MAX(trusted, excluded.trusted) END, sample=COALESCE(sample, excluded.sample)`,
    [m.from, bank, looksLikeBankSender(m.from, m.body) ? 1 : 0, m.receivedAt, m.receivedAt, m.body.slice(0, 200)],
  );
  return senders(os).find((s) => s.address === m.from)!;
}

/* ------------------------------------------------------------------ */
/* Categories, accounts                                                  */
/* ------------------------------------------------------------------ */

const KNOWN: Array<[RegExp, string]> = [
  [/swiggy|zomato|eatfit|domino|pizza|mcdonald|kfc|burger|starbucks|cafe|coffee|chai|restaurant|dining|canoe|toit|barbeque|biryani|haldiram/i, 'food'],
  [/bigbasket|blinkit|zepto|instamart|dmart|jiomart|grofers|more retail|nature.?s basket|milk|dairy/i, 'groceries'],
  [/uber|ola|rapido|metro|irctc|redbus|fuel|petrol|hpcl|bpcl|iocl|indian oil|shell|fastag|parking/i, 'transport'],
  [/amazon|flipkart|myntra|ajio|nykaa|meesho|tata cliq|croma|reliance digital|decathlon|ikea/i, 'shopping'],
  [/netflix|spotify|hotstar|prime video|youtube|bookmyshow|pvr|inox|steam|playstation/i, 'entertainment'],
  [/airtel|jio|vodafone|vi |bsnl|act fibernet|electricity|bescom|tata power|gas|water bill|broadband|recharge/i, 'utilities'],
  [/apollo|pharmeasy|1mg|netmeds|medplus|hospital|clinic|diagnostic|practo/i, 'health'],
  [/makemytrip|goibibo|cleartrip|yatra|indigo|air india|vistara|akasa|spicejet|airbnb|oyo|booking\.com|agoda|hotel/i, 'travel'],
  [/rent|nobroker|housing/i, 'housing'],
  [/salary|payroll/i, 'salary'],
];

/** What category a merchant is: what you set it to before, else a known merchant, else other. */
export function categoryFor(os: LifeOSContext, merchant: string | null | undefined): string {
  if (!merchant) return 'other';
  const learned = os.settings.get<Record<string, string>>('merchantCategories', {});
  const key = norm(merchant);
  if (learned[key]) return learned[key]!;
  return KNOWN.find(([re]) => re.test(merchant))?.[1] ?? 'other';
}

/** You changed a merchant's category on a transaction: remember it for next time. */
export function learnCategory(os: LifeOSContext, merchant: string, category: string) {
  const learned = os.settings.get<Record<string, string>>('merchantCategories', {});
  os.settings.set('merchantCategories', { ...learned, [norm(merchant)]: category });
}

/** The account a message moved money on: by last digits (+ bank), or a new one named for it. */
export function accountFor(os: LifeOSContext, t: ParsedTxn, from: string, created: string[] = []): string | null {
  if (!os.registry.entityTypes.has('account')) return null;
  const accounts = os.entities.query<{ last4?: string; institution?: string; kind?: string }>('account', {}, { limit: 500 });
  const bankName = t.bank ? BANK_NAMES[t.bank] : null;
  if (t.last4) {
    const hits = accounts.filter((a) => a.data.last4 && (a.data.last4.endsWith(t.last4!) || t.last4!.endsWith(a.data.last4)));
    const hit = hits.find((a) => !bankName || !a.data.institution || norm(a.data.institution).includes(norm(bankName).split(' ')[0]!)) ?? hits[0];
    if (hit) return hit.id;
  }
  if (!t.last4 && !bankName) return null;
  // Card alerts are nearly always credit cards (debit-card spends read as the bank account); edit if not.
  const kind = t.isCard && !/debit/i.test(from) ? 'credit' : 'bank';
  const title = `${bankName ?? 'Bank'}${t.isCard ? ' card' : ''}${t.last4 ? ` ••${t.last4}` : ''}`;
  const existing = accounts.find((a) => a.title === title);
  if (existing) return existing.id;
  const a = os.entities.create({ type: 'account', title, data: { kind, institution: bankName ?? undefined, last4: t.last4 ?? undefined, currency: 'INR', openingBalance: 0 } }, 'assistant');
  created.push(a.id);
  return a.id;
}

/* ------------------------------------------------------------------ */
/* Ingest                                                               */
/* ------------------------------------------------------------------ */

export function ingestItem(os: LifeOSContext, id: string): IngestItem | null {
  const r = os.db.get<Row>(`SELECT * FROM ingest_queue WHERE id=?`, [id]);
  return r ? toItem(r) : null;
}

export function ingestList(os: LifeOSContext, opts: { status?: IngestItem['status']; source?: string; limit?: number } = {}): IngestItem[] {
  const where: string[] = [];
  const p: (string | number)[] = [];
  if (opts.status) (where.push('status=?'), p.push(opts.status));
  if (opts.source) (where.push('source=?'), p.push(opts.source));
  return os.db.all<Row>(`SELECT * FROM ingest_queue ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY received_at DESC LIMIT ?`, [...p, opts.limit ?? 200]).map(toItem);
}

function setItem(os: LifeOSContext, id: string, patch: { status?: IngestItem['status']; entityId?: string | null; note?: string | null; parsed?: SmsKind | null }) {
  const sets: string[] = ['updated_at=?'];
  const p: unknown[] = [Date.now()];
  if (patch.status) (sets.push('status=?'), p.push(patch.status));
  if (patch.entityId !== undefined) (sets.push('entity_id=?'), p.push(patch.entityId));
  if (patch.note !== undefined) (sets.push('error=?'), p.push(patch.note));
  if (patch.parsed !== undefined) (sets.push('parsed=?'), p.push(patch.parsed ? JSON.stringify(patch.parsed) : null));
  os.db.run(`UPDATE ingest_queue SET ${sets.join(', ')} WHERE id=?`, [...(p as never[]), id]);
}

/** The same money already seen: another message within 10 minutes, or a transaction you already filed that day. */
function findDuplicate(os: LifeOSContext, itemId: string, t: ParsedTxn, at: number): { ingestId?: string; entityId?: string } | null {
  const key = `${t.direction}:${t.amount.toFixed(2)}`;
  const twin = os.db.get<{ id: string; entity_id: string | null }>(
    `SELECT id, entity_id FROM ingest_queue WHERE dedupe_key=? AND id<>? AND received_at BETWEEN ? AND ? AND status IN ('confirmed','proposed','duplicate') ORDER BY received_at LIMIT 1`,
    [key, itemId, at - WINDOW, at + WINDOW],
  );
  if (twin) return { ingestId: twin.id, entityId: twin.entity_id ?? undefined };
  if (!os.registry.entityTypes.has('transaction')) return null;
  // Said it before the SMS came ("spent 450 on lunch"): same amount, same kind, same or previous day, not from a message.
  const day = iso(at);
  const prev = iso(at - DAY);
  const kind = t.direction === 'credit' ? 'income' : 'expense';
  const tx = os.entities
    .query<{ amount: number; kind: string; date: string }>('transaction', {}, { limit: 400 })
    .find((e) => e.data.amount === t.amount && e.data.kind === kind && (e.data.date === day || e.data.date === prev) && !os.db.get(`SELECT 1 AS x FROM ingest_queue WHERE entity_id=?`, [e.id]));
  return tx ? { entityId: tx.id } : null;
}

export interface IngestResult {
  id: string;
  status: IngestItem['status'];
  entityId?: string | null;
  reason?: string;
}

/**
 * Take in one message. `mode: 'live'` files it now (To check + Undo);
 * `mode: 'import'` (first-run history) proposes it for the review screen.
 */
export function ingestMessage(os: LifeOSContext, m: RawMessage, opts: { mode?: 'live' | 'import' } = {}): IngestResult {
  const mode = opts.mode ?? 'live';
  const id = messageId(m);
  const existing = ingestItem(os, id);
  if (existing) return { id, status: existing.status, entityId: existing.entityId, reason: 'seen before' };
  const now = Date.now();
  os.db.run(`INSERT INTO ingest_queue(id,source,package,received_at,raw_title,raw_text,status,created_at,updated_at) VALUES (?,?,?,?,?,?,'pending',?,?)`, [id, m.source, m.from, m.receivedAt, m.title ?? null, m.body, now, now]);

  if (m.source === 'sms') {
    const s = seeSender(os, m);
    if (!s.trusted) {
      setItem(os, id, { status: 'dismissed', note: 'sender not trusted' });
      return { id, status: 'dismissed', reason: 'sender not trusted' };
    }
  }
  const parsed = m.source === 'sms' ? parseBankSms(m.body, m.from) : parsePaymentNotification(m.from, m.title ?? '', m.body);
  setItem(os, id, { parsed });
  if (parsed.kind === 'skip') {
    setItem(os, id, { status: 'dismissed', note: parsed.reason });
    return { id, status: 'dismissed', reason: parsed.reason };
  }
  const t = parsed.txn;
  os.db.run(`UPDATE ingest_queue SET dedupe_key=? WHERE id=?`, [`${t.direction}:${t.amount.toFixed(2)}`, id]);
  const dup = findDuplicate(os, id, t, m.receivedAt);
  if (dup?.ingestId) {
    setItem(os, id, { status: 'duplicate', entityId: dup.entityId ?? null, note: `same payment as ${dup.ingestId}` });
    // The second sighting may know more (the SMS has the account, the app has the name).
    if (dup.entityId) enrich(os, dup.entityId, t, m);
    return { id, status: 'duplicate', entityId: dup.entityId };
  }
  if (dup?.entityId) {
    // You already said it: this message confirms it and fills in the account.
    enrich(os, dup.entityId, t, m);
    setItem(os, id, { status: 'confirmed', entityId: dup.entityId, note: 'matched a transaction you filed' });
    const e = os.entities.get(dup.entityId)!;
    os.dumps.addExtraction({ source: m.source, sourceRef: id, kind: 'transaction', action: 'updated', entityId: e.id, label: `Matched ${e.title} · ${os.format.currency(t.amount)} to ${sourceLabel(m)}` });
    return { id, status: 'confirmed', entityId: dup.entityId };
  }
  if (mode === 'import') {
    setItem(os, id, { status: 'proposed' });
    return { id, status: 'proposed' };
  }
  return fileItem(os, id);
}

function sourceLabel(m: { source: string; from: string }): string {
  if (m.source === 'notification') return PAYMENT_APPS[m.from] ?? m.from;
  const b = bankOf(m.from);
  return b ? `${BANK_NAMES[b]} SMS` : `SMS from ${m.from}`;
}

/** Add what a later message knows to a transaction (account, reference), never overwriting. */
function enrich(os: LifeOSContext, entityId: string, t: ParsedTxn, m: RawMessage) {
  const e = os.entities.get<Record<string, unknown>>(entityId);
  if (!e) return;
  const patch: Record<string, unknown> = {};
  if (!e.data.accountId) {
    const acc = accountFor(os, t, m.from);
    if (acc) patch.accountId = acc;
  }
  if (!e.data.merchant && t.counterparty) patch.merchant = t.counterparty;
  if (Object.keys(patch).length) os.entities.update(entityId, { data: patch }, 'assistant');
  os.entities.timeline.add({ entityId, kind: m.source, title: `Seen in ${sourceLabel(m)}`, body: m.body.slice(0, 300), actor: 'system', occurredAt: m.receivedAt, meta: { ingest: true } });
}

/** File one parsed (or proposed) message as a transaction; logged in To check. */
export function fileItem(os: LifeOSContext, id: string): IngestResult {
  const item = ingestItem(os, id);
  if (!item || item.parsed?.kind !== 'txn') return { id, status: item?.status ?? 'failed' };
  if (item.status === 'confirmed') return { id, status: 'confirmed', entityId: item.entityId };
  if (!os.registry.entityTypes.has('transaction')) {
    setItem(os, id, { status: 'failed', note: 'finance module not installed' });
    return { id, status: 'failed' };
  }
  const t = item.parsed.txn;
  const created: string[] = [];
  const accountId = accountFor(os, t, item.from, created);
  const kind = t.transfer ? 'transfer' : t.direction === 'credit' ? 'income' : 'expense';
  const merchant = t.counterparty ?? (t.channel === 'atm' ? 'ATM withdrawal' : undefined);
  const category = t.channel === 'atm' ? 'cash' : t.transfer ? 'transfer' : categoryFor(os, merchant);
  const e = os.entities.create({ type: 'transaction', data: { amount: t.amount, kind, category, merchant, date: t.date ?? iso(item.receivedAt), accountId: accountId ?? undefined, note: t.ref ? `Ref ${t.ref}` : undefined } }, 'assistant');
  os.entities.timeline.add({ entityId: e.id, kind: item.source, title: `From ${sourceLabel(item)}`, body: item.text.slice(0, 300), actor: 'system', occurredAt: item.receivedAt, meta: { ingestId: id } });
  setItem(os, id, { status: 'confirmed', entityId: e.id });
  for (const a of created) os.dumps.addExtraction({ source: item.source, sourceRef: id, kind: 'account', entityId: a, label: `Account: ${os.entities.get(a)?.title ?? 'new account'}` });
  os.dumps.addExtraction({
    source: item.source,
    sourceRef: id,
    kind: 'transaction',
    entityId: e.id,
    label: `${kind === 'income' ? 'Received' : kind === 'transfer' ? 'Transfer' : 'Spent'} ${os.format.currency(t.amount)}${merchant ? ` · ${merchant}` : ''}${t.last4 ? ` · ••${t.last4}` : ''}`,
    flag: category === 'other' && kind === 'expense' ? 'Category unknown — set it once and it’s learned' : null,
  });
  return { id, status: 'confirmed', entityId: e.id };
}

/** First-run review: file the proposals you kept; the rest are dismissed. */
export function confirmProposed(os: LifeOSContext, keep: string[], dismiss: string[] = []): number {
  let n = 0;
  os.db.transaction(() => {
    for (const id of keep) if (fileItem(os, id).status === 'confirmed') n++;
    for (const id of dismiss) setItem(os, id, { status: 'dismissed', note: 'dismissed in review' });
  });
  bus.emit('data.changed', { table: 'ingest_queue', id: 'review' });
  return n;
}

export { sourceLabel };
