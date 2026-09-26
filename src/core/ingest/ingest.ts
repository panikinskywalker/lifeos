import type { LifeOSContext } from '../registry/context';
import type { Row } from '../db/adapter';
import { bus } from '../events/bus';
import { toInr } from './fx';
import { linkPayee, payeeFor } from './payee';
import { knownMerchant } from './merchants';
import { parseDeliverySms, type ParsedDelivery } from './delivery';
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
  const r = os.db.get<Row>(`SELECT * FROM sms_senders WHERE address=?`, [m.from])!;
  return { address: r.address as string, bank: (r.bank as string | null) ?? null, trusted: r.trusted === 1, decided: r.decided === 1, count: r.count as number, lastSeen: r.last_seen as number, sample: (r.sample as string | null) ?? null };
}

/* ------------------------------------------------------------------ */
/* Categories, accounts                                                  */
/* ------------------------------------------------------------------ */

/** Whole words only: "ola" is not in "Coca-Cola", "rent" is not in "Parent". */
const w = (alts: string) => new RegExp(`(?:^|[^a-z0-9])(?:${alts})(?:$|[^a-z0-9])`, 'i');
const KNOWN: Array<[RegExp, string]> = [
  [w('swiggy|zomato|eatfit|dominos?|pizza|mcdonalds?|kfc|burger|starbucks|cafe|coffee|chai|restaurant|dining|barbeque|biryani|haldiram'), 'food'],
  [w('bigbasket|blinkit|zepto|instamart|dmart|jiomart|grofers|more retail|nature.?s basket|milk|dairy'), 'groceries'],
  [w('uber|ola|rapido|metro|irctc|redbus|fuel|petrol|hpcl|bpcl|iocl|indian oil|shell|fastag|parking'), 'transport'],
  [w('amazon|flipkart|myntra|ajio|nykaa|meesho|tata cliq|croma|reliance digital|decathlon|ikea'), 'shopping'],
  [w('netflix|spotify|hotstar|prime video|youtube|bookmyshow|pvr|inox|steam|playstation'), 'entertainment'],
  [w('airtel|jio|vodafone|vi|bsnl|act fibernet|electricity|bescom|tata power|gas|water bill|broadband|recharge'), 'utilities'],
  [w('apollo|pharmeasy|1mg|netmeds|medplus|hospital|clinic|diagnostic|practo'), 'health'],
  [w('makemytrip|goibibo|cleartrip|yatra|indigo|air india|vistara|akasa|spicejet|airbnb|oyo|booking\\.com|agoda|hotel'), 'travel'],
  [w('rent|nobroker|housing'), 'housing'],
  [w('salary|payroll'), 'salary'],
];

export interface CategoryRule {
  /** A word or phrase; matched case-insensitively against the merchant and the message. */
  keyword: string;
  category: string;
}

/** Your keyword rules (You › Categories), in order. */
export function categoryRules(os: LifeOSContext): CategoryRule[] {
  return os.settings.get<CategoryRule[]>('categoryRules', []);
}

export function setCategoryRules(os: LifeOSContext, rules: CategoryRule[]) {
  os.settings.set('categoryRules', rules.filter((r) => r.keyword.trim() && r.category));
  bus.emit('data.changed', { table: 'settings', id: 'categoryRules' });
}

/** The built-in merchant list, for showing in settings. */
export const BUILTIN_CATEGORIES = KNOWN;

/**
 * A transaction's category: your keyword rules first (merchant or message
 * text), then what you taught it by recategorising, then the built-in
 * merchant list, else other.
 */
export function categoryFor(os: LifeOSContext, merchant: string | null | undefined, text = ''): string {
  const hay = `${merchant ?? ''} ${text}`.toLowerCase();
  for (const r of categoryRules(os)) {
    const k = r.keyword.trim().toLowerCase();
    if (k && new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i').test(hay)) return r.category;
  }
  if (merchant) {
    const learned = os.settings.get<Record<string, string>>('merchantCategories', {});
    const key = norm(merchant);
    if (learned[key]) return learned[key]!;
    const brand = knownMerchant(merchant);
    if (brand) return brand.category;
    const hit = KNOWN.find(([re]) => re.test(merchant));
    if (hit) return hit[1];
  }
  return text ? (KNOWN.find(([re]) => re.test(text))?.[1] ?? 'other') : 'other';
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

/** The investment account a mutual fund lives in (one per fund, or "Mutual funds"). */
function fundAccount(os: LifeOSContext, fund: string | null, created: string[]): string | null {
  if (!os.registry.entityTypes.has('account')) return null;
  const title = fund ? fund.replace(/\s+(?:SIP|Direct|Growth|Plan)\b.*$/i, '').trim() : 'Mutual funds';
  const hit = os.entities.query<{ kind?: string }>('account', {}, { limit: 500 }).find((a) => a.title.toLowerCase() === title.toLowerCase());
  if (hit) return hit.id;
  const a = os.entities.create({ type: 'account', title, data: { kind: 'investment', institution: 'Mutual fund', currency: 'INR', openingBalance: 0 } }, 'assistant');
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
  // Straight to the few candidates (date and kind are indexed), not a scan of recent transactions.
  const tx = os.db.get<{ id: string }>(
    `SELECT e.id FROM entities e WHERE e.type='transaction' AND e.deleted_at IS NULL
       AND json_extract(e.data,'$.date') IN (?, ?) AND json_extract(e.data,'$.kind')=? AND json_extract(e.data,'$.amount')=?
       AND NOT EXISTS (SELECT 1 FROM ingest_queue q WHERE q.entity_id = e.id) LIMIT 1`,
    [day, prev, kind, t.amount],
  );
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
    // Shops and couriers aren't money senders: a shipping text becomes (or moves) a delivery.
    const del = !s.trusted || !bankOf(m.from) ? parseDeliverySms(m.body, m.from, m.receivedAt) : null;
    if (del && os.registry.entityTypes.has('delivery')) {
      const entityId = fileDelivery(os, id, del, m);
      setItem(os, id, { status: 'confirmed', entityId, note: 'delivery' });
      return { id, status: 'confirmed', entityId };
    }
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
  const date = t.date ?? iso(item.receivedAt);

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
    // A mutual fund SIP / redemption: money moving into (or out of) an investment, never spend.
    const bank = t.last4 ? accountFor(os, { ...t, investment: false }, item.from, created) : null;
    const fund = fundAccount(os, t.fund, created);
    const out = t.direction === 'debit';
    data = { amount, kind: 'transfer', category: 'investment', merchant: t.fund ?? 'Mutual fund', date, accountId: (out ? bank : fund) ?? undefined, toAccountId: (out ? fund : bank) ?? undefined, note: t.ref ? `Ref ${t.ref}` : undefined };
    label = `${out ? 'Invested' : 'Redeemed'} ${os.format.currency(amount)} · ${t.fund ?? 'mutual fund'}`;
  } else {
    const accountId = accountFor(os, t, item.from, created);
    const kind = t.transfer || t.channel === 'atm' ? 'transfer' : t.direction === 'credit' ? 'income' : 'expense';
    const merchant = t.counterparty ?? (t.channel === 'atm' ? 'ATM withdrawal' : undefined);
    let category = t.channel === 'atm' || t.transfer ? 'transfer' : categoryFor(os, merchant, item.text);
    // An autopay / e-mandate / SI charge from somewhere we don't know is still a subscription.
    if (category === 'other' && kind === 'expense' && t.recurring) category = 'subscriptions';
    data = { amount, kind, category, merchant, date, accountId: accountId ?? undefined, note: t.ref ? `Ref ${t.ref}` : undefined, ...fx };
    const shown = t.currency !== 'INR' ? `${t.currency} ${t.amount.toLocaleString('en-IN')}${fx.fxRate ? ` (${os.format.currency(amount)})` : ''}` : os.format.currency(amount);
    label = `${kind === 'income' ? 'Received' : kind === 'transfer' ? (t.channel === 'atm' ? 'Cash' : 'Transfer') : 'Spent'} ${shown}${merchant ? ` · ${merchant}` : ''}${t.last4 ? ` · ••${t.last4}` : ''}`;
    if (category === 'other' && kind === 'expense') flag = 'Category unknown — set it once and it’s learned (or add a keyword rule)';
    if (t.currency !== 'INR' && !fx.fxRate) flag = `No ${t.currency} rate yet — converted to rupees when the app is next online`;
  }
  const e = os.entities.create({ type: 'transaction', data }, 'assistant');
  // Everyone you pay or get paid by is one record; this payment joins theirs.
  if (!t.investment && !t.transfer && t.channel !== 'atm' && (t.counterparty || t.vpa)) {
    const pm = payeeFor(os, t.counterparty, t.vpa, { business: data.category !== 'other' && data.category !== 'transfer' ? true : undefined });
    if (pm) {
      linkPayee(os, e.id, pm, t.counterparty, t.vpa, item.source);
      if (pm.guess) flag = pm.guess;
      if (pm.created) created.push(pm.id);
    }
  }
  if (!t.investment && !t.transfer && t.direction === 'debit' && data.category === 'subscriptions' && typeof data.merchant === 'string') {
    linkSubscription(os, e.id, data.merchant, amount, date, (data.accountId as string | undefined) ?? undefined, created);
  }
  os.entities.timeline.add({ entityId: e.id, kind: item.source, title: `From ${sourceLabel(item)}`, body: item.text.slice(0, 300), actor: 'system', occurredAt: item.receivedAt, meta: { ingestId: id } });
  setItem(os, id, { status: 'confirmed', entityId: e.id });
  for (const a of created) {
    const ce = os.entities.get(a);
    const kind = ce?.type === 'org' || ce?.type === 'subscription' ? ce.type : 'account';
    const label = kind === 'org' ? `Payee: ${ce!.title}` : kind === 'subscription' ? `Subscription: ${ce!.title} (monthly — change if yearly)` : `Account: ${ce?.title ?? 'new account'}`;
    os.dumps.addExtraction({ source: item.source, sourceRef: id, kind, entityId: a, label });
  }
  os.dumps.addExtraction({ source: item.source, sourceRef: id, kind: 'transaction', entityId: e.id, label, flag });
  return { id, status: 'confirmed', entityId: e.id };
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
function linkSubscription(os: LifeOSContext, txId: string, name: string, amount: number, date: string, accountId: string | undefined, created: string[]) {
  if (!os.registry.entityTypes.has('subscription')) return;
  const key = norm(name);
  const subs = os.entities.query<{ name: string; amount: number; nextBillingAt: string; rrule?: string; accountId?: string }>('subscription', {}, { limit: 500 });
  const sub = subs.find((s) => s.status !== 'cancelled' && (norm(s.data.name) === key || norm(s.data.name).startsWith(`${key} `) || key.startsWith(`${norm(s.data.name)} `)));
  if (!sub) {
    const s = os.entities.create({ type: 'subscription', data: { name, amount, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: addMonths(date), category: 'subscriptions', accountId, autoPost: false } }, 'assistant');
    os.relations.link(txId, s.id, 'subscription', {}, 'assistant', { source: 'sms' });
    created.push(s.id);
    return;
  }
  os.relations.link(txId, sub.id, 'subscription', {}, 'assistant', { source: 'sms' });
  const at = new Date(`${date}T12:00:00`).getTime();
  // An auto-posted bill for this renewal (within five days) was a placeholder for this charge.
  for (const r of os.relations.forEntity(sub.id, 'subscription')) {
    if (r.direction !== 'in' || r.other.id === txId) continue;
    const tx = os.entities.get<{ note?: string; date?: string }>(r.other.id);
    if (tx?.data.note === 'Auto-posted subscription' && tx.data.date && Math.abs(new Date(`${tx.data.date}T12:00:00`).getTime() - at) <= 5 * DAY_MS) os.entities.delete(tx.id, 'assistant');
  }
  const patch: Record<string, unknown> = {};
  if (sub.data.amount !== amount) patch.amount = amount;
  if (!sub.data.accountId && accountId) patch.accountId = accountId;
  // Billed now: the next renewal is a cycle on (only when this charge is the one that was due).
  if (sub.data.nextBillingAt <= iso(at + 5 * DAY_MS)) patch.nextBillingAt = addMonths(date, cycleMonths(sub.data.rrule));
  if (Object.keys(patch).length) os.entities.update(sub.id, { data: patch }, 'assistant');
}

const STAGE: Record<string, number> = { ordered: 0, shipped: 1, out_for_delivery: 2, delivered: 3, cancelled: 4, returned: 4 };
const STATUS_WORD: Record<string, string> = { ordered: 'Ordered', shipped: 'Shipped', out_for_delivery: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned' };

/** One delivery per order: found by tracking / order number, or the same shop's open order from the last month. Status only moves forward. */
function fileDelivery(os: LifeOSContext, ingestId: string, d: ParsedDelivery, m: RawMessage): string {
  type D = { shop?: string; item?: string; carrier?: string; tracking?: string; orderId?: string; status: string; expectedDate?: string; deliveredOn?: string };
  const recent = os.entities.query<D>('delivery', { sort: [{ field: 'createdAt', dir: 'desc' }] }, { limit: 300 });
  const norm2 = (x?: string | null) => (x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const hit =
    recent.find((e) => (d.tracking && e.data.tracking === d.tracking) || (d.orderId && e.data.orderId === d.orderId)) ??
    recent.find(
      (e) =>
        STAGE[e.data.status]! < 3 &&
        m.receivedAt - e.createdAt < 30 * 86_400_000 &&
        ((d.shop && e.data.shop === d.shop) || (d.carrier && e.data.carrier === d.carrier)) &&
        (!d.item || !e.data.item || norm2(e.data.item).includes(norm2(d.item).split(' ')[0]!) || norm2(d.item).includes(norm2(e.data.item).split(' ')[0]!)),
    );
  const day = iso(m.receivedAt);
  if (!hit) {
    const e = os.entities.create({ type: 'delivery', data: { shop: d.shop ?? undefined, item: d.item ?? undefined, carrier: d.carrier ?? undefined, tracking: d.tracking ?? undefined, orderId: d.orderId ?? undefined, status: d.status, expectedDate: d.status === 'delivered' ? undefined : (d.expected ?? undefined), deliveredOn: d.status === 'delivered' ? day : undefined } }, 'assistant');
    os.entities.timeline.add({ entityId: e.id, kind: 'sms', title: STATUS_WORD[d.status]!, body: m.body.slice(0, 300), actor: 'system', occurredAt: m.receivedAt, meta: { ingestId } });
    os.dumps.addExtraction({ source: 'sms', sourceRef: ingestId, kind: 'delivery', entityId: e.id, label: `Delivery: ${e.title} · ${STATUS_WORD[d.status]}${d.expected && d.status !== 'delivered' ? ` · by ${d.expected.slice(8)}/${d.expected.slice(5, 7)}` : ''}` });
    return e.id;
  }
  const patch: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  const set = (k: keyof D, v: unknown) => {
    if (v == null || v === '' || hit.data[k] === v) return;
    patch[k] = v;
    before[k] = hit.data[k] ?? null;
  };
  if (STAGE[d.status]! >= STAGE[hit.data.status]!) set('status', d.status);
  if (d.status === 'delivered') set('deliveredOn', day);
  else if (d.expected) set('expectedDate', d.expected);
  if (!hit.data.item) set('item', d.item);
  if (!hit.data.carrier) set('carrier', d.carrier);
  if (!hit.data.tracking) set('tracking', d.tracking);
  if (!hit.data.orderId) set('orderId', d.orderId);
  if (!hit.data.shop) set('shop', d.shop);
  if (Object.keys(patch).length) {
    os.entities.update(hit.id, { data: patch }, 'assistant');
    os.dumps.addExtraction({ source: 'sms', sourceRef: ingestId, kind: 'delivery', action: 'updated', entityId: hit.id, label: `${os.entities.get(hit.id)?.title ?? 'Delivery'} · ${STATUS_WORD[(patch.status as string) ?? hit.data.status]}`, before });
  }
  os.entities.timeline.add({ entityId: hit.id, kind: 'sms', title: STATUS_WORD[d.status]!, body: m.body.slice(0, 300), actor: 'system', occurredAt: m.receivedAt, meta: { ingestId } });
  return hit.id;
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
