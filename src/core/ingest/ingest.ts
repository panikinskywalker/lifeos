import type { LifeOSContext } from '../registry/context';
import type { Row } from '../db/adapter';
import { bus } from '../events/bus';
import { toInr } from './fx';
import { linkPayee, payeeFor } from './payee';
import { knownMerchant } from './merchants';
import { parseDeliverySms, type ParsedDelivery } from './delivery';
import { AIRPORTS, parseMail, type Mail, type ParsedFlight, type ParsedStay } from './mail';
import { parseBankSms, parsePaymentNotification, looksLikeBankSender, bankOf, BANK_NAMES, PAYMENT_APPS, type ParsedTxn, type SmsKind } from './bankSms';

/**
 * Messages → money (PRODUCT v4 §1.5, M4.2). Every bank SMS or payment-app
 * notification is kept raw in ingest_queue, parsed, deduplicated (the same
 * payment seen as an SMS and a GPay notification, or already said in a
 * dump), and filed as a transaction on the right account — live ones at
 * once (with To check + Undo), first-run history as proposals to review.
 */

export interface RawMessage {
  source: 'sms' | 'notification' | 'email';
  /** SMS sender ("VM-HDFCBK"), the app's package name, or the email's sender address. */
  from: string;
  /** Email only: the mailbox it was read from ("rutvij@gmail.com") — named on everything it files. */
  account?: string | null;
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
  /** Email only: the mailbox it came from. */
  account: string | null;
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
  account: (r.raw_extra ? ((JSON.parse(r.raw_extra as string) as { account?: string }).account ?? null) : null),
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
  /** A word or phrase; matched case-insensitively against the merchant and the message. Empty = any merchant. */
  keyword: string;
  /** Only money of exactly this much (₹28 is always the water bottle). Older rules; see `amounts`. */
  amount?: number | null;
  /** Only these exact amounts (football shares: ₹147, ₹131). */
  amounts?: number[] | null;
  /** Also 2×, 3× … 10× an amount (someone paying a friend's share too). */
  multiples?: boolean;
  /** Money out, money in, or either (default: out for amount rules, either for keyword-only ones). */
  direction?: 'spent' | 'received' | 'any';
  /**
   * A range ("anything from ₹100 to ₹200"): too loose alone, so it's sure only
   * when the money is from someone in `fromGroupId`, or came within
   * `withinHours` of a payment out whose merchant says `afterKeyword`
   * (friends' shares after you book the turf). Otherwise it's filed as a
   * flagged guess — and once you recategorise a payer, their payments stop
   * being guessed.
   */
  min?: number | null;
  max?: number | null;
  fromGroupId?: string | null;
  afterKeyword?: string | null;
  withinHours?: number | null;
  category: string;
}

const isRange = (r: CategoryRule) => r.min != null || r.max != null;

export const ruleAmounts = (r: CategoryRule): number[] => (r.amounts?.length ? r.amounts : r.amount != null ? [r.amount] : []);

/** Does this rule's amount part match? (No amounts = matches any amount.) */
function amountMatches(r: CategoryRule, amount: number | null | undefined): boolean {
  const list = ruleAmounts(r);
  if (!list.length) return true;
  if (amount == null) return false;
  return list.some((x) => {
    if (Math.abs(x - amount) < 0.005) return true;
    if (!r.multiples || x <= 0) return false;
    const k = Math.round(amount / x);
    return k >= 2 && k <= 10 && Math.abs(k * x - amount) < 0.005;
  });
}

/** What a rule says, for lists and toasts: "₹28", "ZOMATO", "ZOMATO · ₹28", "₹147 / ₹131 (or multiples) · received", "₹100–₹200 · received". */
export function ruleText(r: CategoryRule, currency: (n: number) => string = (n) => `₹${n}`): string {
  const list = ruleAmounts(r);
  const range = isRange(r) ? (r.min != null && r.max != null ? `${currency(r.min)}–${currency(r.max)}` : r.min != null ? `${currency(r.min)} or more` : `up to ${currency(r.max!)}`) : null;
  const money = list.length ? `${list.map(currency).join(' / ')}${r.multiples ? ' (or multiples)' : ''}` : range;
  const dir = r.direction === 'received' ? 'received' : r.direction === 'any' ? 'in or out' : null;
  return [r.keyword.trim() || null, money, dir].filter(Boolean).join(' · ');
}

/** Your keyword rules (You › Categories), in order. */
export function categoryRules(os: LifeOSContext): CategoryRule[] {
  return os.settings.get<CategoryRule[]>('categoryRules', []);
}

export function setCategoryRules(os: LifeOSContext, rules: CategoryRule[]) {
  os.settings.set('categoryRules', rules.filter((r) => (r.keyword.trim() || ruleAmounts(r).length || isRange(r)) && r.category));
  bus.emit('data.changed', { table: 'settings', id: 'categoryRules' });
}

/** The built-in merchant list, for showing in settings. */
export const BUILTIN_CATEGORIES = KNOWN;

/**
 * The category one of your rules gives a spend, if any: keyword + amount
 * first, then keyword ("ZOMATO"), then an exact amount alone (₹28 → Water).
 */
export function ruleCategory(os: LifeOSContext, merchant: string | null | undefined, text = '', amount?: number | null, direction: 'debit' | 'credit' = 'debit'): string | null {
  const hay = `${merchant ?? ''} ${text}`.toLowerCase();
  const rules = categoryRules(os);
  const words = (r: CategoryRule) => {
    const k = r.keyword.trim().toLowerCase();
    return !k || new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i').test(hay);
  };
  // Keyword-only rules work both ways (as they always have); amount rules default to money out.
  const way = (r: CategoryRule) => {
    const d = r.direction ?? (ruleAmounts(r).length ? 'spent' : 'any');
    return d === 'any' || d === (direction === 'credit' ? 'received' : 'spent');
  };
  const byAmount = (r: CategoryRule) => ruleAmounts(r).length > 0 && amountMatches(r, amount);
  const live = rules.filter((r) => way(r) && !isRange(r));
  // Most specific first: keyword and amount, then keyword, then amount alone.
  const hit =
    live.find((r) => r.keyword.trim() && byAmount(r) && words(r)) ??
    live.find((r) => r.keyword.trim() && !ruleAmounts(r).length && words(r)) ??
    live.find((r) => !r.keyword.trim() && byAmount(r));
  return hit?.category ?? null;
}

/**
 * A range rule for money already linked to its payer: sure when the payer is
 * in the rule's group or it came soon after the named payment out; a guess
 * (with why) when only the amount fits; null when it doesn't apply or you
 * already taught LifeOS what this payer's money is.
 */
export function rangeRule(os: LifeOSContext, p: { amount: number; direction: 'debit' | 'credit'; payerId?: string | null; merchant?: string | null; at: number }): { category: string; sure: boolean; why: string } | null {
  const taught = os.settings.get<Record<string, string>>('merchantCategories', {});
  const learned = (p.payerId ? taught[`person:${p.payerId}`] : undefined) ?? (p.merchant ? taught[norm(p.merchant)] : undefined);
  for (const r of categoryRules(os).filter(isRange)) {
    const d = r.direction ?? 'received';
    if (d !== 'any' && d !== (p.direction === 'credit' ? 'received' : 'spent')) continue;
    if ((r.min != null && p.amount < r.min) || (r.max != null && p.amount > r.max)) continue;
    const group = r.fromGroupId && p.payerId ? os.groups.groupsOf(p.payerId).includes(r.fromGroupId) || ((os.entities.get<{ memberIds?: string[] }>(r.fromGroupId)?.data.memberIds ?? []).includes(p.payerId)) : false;
    if (group) return { category: r.category, sure: true, why: `from ${os.entities.get(r.fromGroupId!)?.title ?? 'the group'}` };
    const k = r.afterKeyword?.trim();
    if (k) {
      const hours = r.withinHours ?? 48;
      const since = iso(p.at - hours * 3_600_000);
      const until = iso(p.at);
      const re = new RegExp(`(^|[^a-z0-9])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i');
      const paid = os.entities
        .query<{ merchant?: string; note?: string; kind?: string }>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: since }, { field: 'data.date', op: 'lte', value: until }] } }, { limit: 200 })
        .find((t) => re.test(`${t.data.merchant ?? ''} ${t.data.note ?? ''}`));
      if (paid) return { category: r.category, sure: true, why: `after your ${paid.title} payment` };
    }
    // Only the amount fits: a guess — unless you've said what this payer's money is.
    if (learned) return null;
    return { category: r.category, sure: false, why: `only the amount fits${r.fromGroupId ? ` — not from ${os.entities.get(r.fromGroupId)?.title ?? 'the group'}` : ''}` };
  }
  return null;
}

/**
 * A transaction's category: your rules first (keywords in the merchant or
 * message, exact amounts), then what you taught it by recategorising, then
 * the built-in merchant list, else other.
 */
export function categoryFor(os: LifeOSContext, merchant: string | null | undefined, text = '', amount?: number | null, direction: 'debit' | 'credit' = 'debit'): string {
  const byRule = ruleCategory(os, merchant, text, amount, direction);
  if (byRule) return byRule;
  if (merchant) {
    const taught = learnedCategory(os, merchant);
    if (taught) return taught;
    const brand = knownMerchant(merchant);
    if (brand) return brand.category;
    const hit = KNOWN.find(([re]) => re.test(merchant));
    if (hit) return hit[1];
  }
  return text ? (KNOWN.find(([re]) => re.test(text))?.[1] ?? 'other') : 'other';
}

/** Who a transaction was paid to / by: its linked payee (a shop / payee record, or a person). */
export function payeeOf(os: LifeOSContext, txId: string): { id: string; type: string; title: string } | null {
  const r = os.relations.forEntity(txId).find((x) => x.direction === 'out' && (x.relation.kind === 'payee' || x.relation.kind === 'person'));
  return r ? { id: r.other.id, type: r.other.type, title: r.other.title } : null;
}

/**
 * You changed a transaction's category: remember it for next time. A shop or
 * payee is learned by its record (so every name the bank uses for it counts)
 * and by the name; a person isn't — a friend's money isn't always the same
 * thing (rules like "₹100–200 from the Football group" handle people) — but
 * their in-range payments stop being guessed. Returns the earlier payments
 * from the same payee that still have another category.
 */
export function learnCategory(os: LifeOSContext, merchant: string | null | undefined, category: string, txId?: string): string[] {
  const learned = os.settings.get<Record<string, string>>('merchantCategories', {});
  const payee = txId ? payeeOf(os, txId) : null;
  const next = { ...learned };
  if (payee?.type === 'person') next[`person:${payee.id}`] = category;
  else {
    if (merchant) next[norm(merchant)] = category;
    if (payee) next[`payee:${payee.id}`] = category;
  }
  os.settings.set('merchantCategories', next);
  if (!txId || payee?.type === 'person') return [];
  // The others: same payee record, else the same merchant name.
  const ids = payee
    ? os.relations.forEntity(payee.id).filter((r) => r.direction === 'in' && r.other.type === 'transaction').map((r) => r.other.id)
    : merchant
      ? os.db.all<{ id: string }>(`SELECT id FROM entities WHERE type='transaction' AND deleted_at IS NULL AND lower(json_extract(data,'$.merchant'))=? LIMIT 500`, [merchant.toLowerCase()]).map((r) => r.id)
      : [];
  return ids.filter((id) => id !== txId && (os.entities.get<{ category?: string; kind?: string }>(id)?.data.category ?? category) !== category && os.entities.get<{ kind?: string }>(id)?.data.kind !== 'transfer');
}

/** What you taught it for a payee record (by its id) or a name. */
export function learnedCategory(os: LifeOSContext, merchant: string | null | undefined, payeeId?: string | null): string | null {
  const learned = os.settings.get<Record<string, string>>('merchantCategories', {});
  return (payeeId ? learned[`payee:${payeeId}`] : undefined) ?? (merchant ? learned[norm(merchant)] : undefined) ?? null;
}

/** "Change the others too": give these transactions the category (Undo returns each one's own). */
export function recategorise(os: LifeOSContext, ids: string[], category: string): Array<{ id: string; was: string }> {
  const out: Array<{ id: string; was: string }> = [];
  os.db.transaction(() => {
    for (const id of ids) {
      const e = os.entities.get<{ category?: string }>(id);
      if (!e || e.data.category === category) continue;
      out.push({ id, was: e.data.category ?? 'other' });
      os.entities.update(id, { data: { category } }, 'system');
    }
  });
  return out;
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
       AND NOT EXISTS (SELECT 1 FROM ingest_queue q WHERE q.entity_id = e.id AND q.source <> 'email') LIMIT 1`,
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

function sourceLabel(m: { source: string; from: string; account?: string | null }): string {
  if (m.source === 'email') return `Email · ${m.account ?? 'Gmail'}`;
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
    let category = t.channel === 'atm' || t.transfer ? 'transfer' : categoryFor(os, merchant, item.text, amount, t.direction);
    // An autopay / e-mandate / SI charge from somewhere we don't know is still a subscription.
    if (category === 'other' && kind === 'expense' && t.recurring) category = 'subscriptions';
    const note = [item.source === 'email' ? `From ${item.account ?? 'email'}` : null, t.ref ? `Ref ${t.ref}` : null].filter(Boolean).join(' · ');
    data = { amount, kind, category, merchant, date, accountId: accountId ?? undefined, note: note || undefined, ...fx };
    const shown = t.currency !== 'INR' ? `${t.currency} ${t.amount.toLocaleString('en-IN')}${fx.fxRate ? ` (${os.format.currency(amount)})` : ''}` : os.format.currency(amount);
    label = `${kind === 'income' ? 'Received' : kind === 'transfer' ? (t.channel === 'atm' ? 'Cash' : 'Transfer') : 'Spent'} ${shown}${merchant ? ` · ${merchant}` : ''}${t.last4 ? ` · ••${t.last4}` : ''}`;
    if (category === 'other' && kind === 'expense') flag = 'Category unknown — set it once and it’s learned (or add a keyword rule)';
    if (t.currency !== 'INR' && !fx.fxRate) flag = `No ${t.currency} rate yet — converted to rupees when the app is next online`;
    if (item.source === 'email') label += ` · from ${item.account ?? 'email'}`;
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
  // What you taught it for this payee (any name the bank uses for them) beats the name match and the built-in list.
  const byPayee = !t.investment && !t.transfer && t.channel !== 'atm' && !ruleCategory(os, data.merchant as string | undefined, item.text, amount, t.direction) ? learnedCategory(os, null, payeeOf(os, e.id)?.id) : null;
  if (byPayee && byPayee !== data.category) {
    os.entities.update(e.id, { data: { category: byPayee } }, 'assistant');
    data.category = byPayee;
    if (flag?.startsWith('Category unknown')) flag = null;
  }
  // A range rule ("₹100–200 received → Football") needs the payer, so it's checked once they're linked.
  if (!byPayee && !t.investment && !t.transfer && t.channel !== 'atm' && !ruleCategory(os, data.merchant as string | undefined, item.text, amount, t.direction)) {
    const payerId = os.relations.forEntity(e.id).find((r) => r.relation.kind === 'person' && r.direction === 'out')?.other.id ?? null;
    const rr = rangeRule(os, { amount, direction: t.direction, payerId, merchant: data.merchant as string | undefined, at: item.receivedAt });
    if (rr && rr.category !== data.category) {
      os.entities.update(e.id, { data: { category: rr.category } }, 'assistant');
      data.category = rr.category;
      const name = os.registry.entityTypes.get('transaction')?.fields.find((f) => f.key === 'category')?.options?.find((o) => o.value === rr.category)?.label ?? rr.category;
      label += ` · ${name}`;
      if (!rr.sure) flag = `Guessed ${name}: ${rr.why}. Change the category if not — it won’t guess for this payer again`;
    }
  }
  if (!t.investment && !t.transfer && t.direction === 'debit' && data.category === 'subscriptions' && typeof data.merchant === 'string') {
    linkSubscription(os, e.id, data.merchant, amount, date, (data.accountId as string | undefined) ?? undefined, created, item.source as 'sms' | 'notification' | 'email');
  }
  os.entities.timeline.add({ entityId: e.id, kind: item.source, title: `From ${sourceLabel(item)}`, body: (item.source === 'email' ? `${item.title ?? ''}\n${item.text}` : item.text).slice(0, 300), actor: 'system', occurredAt: item.receivedAt, meta: { ingestId: id } });
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
function linkSubscription(os: LifeOSContext, txId: string, name: string, amount: number, date: string, accountId: string | undefined, created: string[], via: 'sms' | 'notification' | 'email' = 'sms') {
  if (!os.registry.entityTypes.has('subscription')) return;
  const key = norm(name);
  const subs = os.entities.query<{ name: string; amount: number; nextBillingAt: string; rrule?: string; accountId?: string }>('subscription', {}, { limit: 500 });
  const sub = subs.find((s) => s.status !== 'cancelled' && (norm(s.data.name) === key || norm(s.data.name).startsWith(`${key} `) || key.startsWith(`${norm(s.data.name)} `)));
  if (!sub) {
    const s = os.entities.create({ type: 'subscription', data: { name, amount, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: addMonths(date), category: 'subscriptions', accountId, autoPost: false } }, 'assistant');
    os.relations.link(txId, s.id, 'subscription', {}, 'assistant', { source: via });
    created.push(s.id);
    return;
  }
  os.relations.link(txId, sub.id, 'subscription', {}, 'assistant', { source: via });
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
  const via = m.source === 'email' ? ` · from ${m.account ?? 'email'}` : '';
  if (!hit) {
    const e = os.entities.create({ type: 'delivery', data: { shop: d.shop ?? undefined, item: d.item ?? undefined, carrier: d.carrier ?? undefined, tracking: d.tracking ?? undefined, orderId: d.orderId ?? undefined, status: d.status, expectedDate: d.status === 'delivered' ? undefined : (d.expected ?? undefined), deliveredOn: d.status === 'delivered' ? day : undefined } }, 'assistant');
    os.entities.timeline.add({ entityId: e.id, kind: m.source, title: `${STATUS_WORD[d.status]!}${via}`, body: m.body.slice(0, 300), actor: 'system', occurredAt: m.receivedAt, meta: { ingestId } });
    os.dumps.addExtraction({ source: m.source, sourceRef: ingestId, kind: 'delivery', entityId: e.id, label: `Delivery: ${e.title} · ${STATUS_WORD[d.status]}${d.expected && d.status !== 'delivered' ? ` · by ${d.expected.slice(8)}/${d.expected.slice(5, 7)}` : ''}${via}` });
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
    os.dumps.addExtraction({ source: m.source, sourceRef: ingestId, kind: 'delivery', action: 'updated', entityId: hit.id, label: `${os.entities.get(hit.id)?.title ?? 'Delivery'} · ${STATUS_WORD[(patch.status as string) ?? hit.data.status]}${via}`, before });
  }
  os.entities.timeline.add({ entityId: hit.id, kind: m.source, title: `${STATUS_WORD[d.status]!}${via}`, body: m.body.slice(0, 300), actor: 'system', occurredAt: m.receivedAt, meta: { ingestId } });
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

/* ------------------------------------------------------------------ */
/* Email (M4.2b)                                                         */
/* ------------------------------------------------------------------ */

/**
 * Take in one email from a connected mailbox. Money becomes a transaction
 * (or confirms one the SMS already filed), shipping a delivery, a ticket a
 * flight in its trip, a booking a stay. Every record it touches says which
 * mailbox it came from — in its note, on its timeline, and in To check.
 */
export function ingestMail(os: LifeOSContext, mail: Mail, account: string): IngestResult {
  const text = mail.text.slice(0, 6000);
  const m: RawMessage = { source: 'email', from: mail.from, account, title: mail.subject, body: text, receivedAt: mail.date };
  const id = messageId({ ...m, body: `${account}|${mail.uid}|${mail.subject}` });
  const existing = ingestItem(os, id);
  if (existing) return { id, status: existing.status, entityId: existing.entityId, reason: 'seen before' };
  const now = Date.now();
  os.db.run(
    `INSERT INTO ingest_queue(id,source,package,received_at,raw_title,raw_text,raw_extra,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'pending',?,?)`,
    [id, 'email', mail.from, mail.date, mail.subject, text, JSON.stringify({ account, fromName: mail.fromName, uid: mail.uid }), now, now],
  );
  const parsed = parseMail({ ...mail, text });
  if (parsed.kind === 'skip') {
    setItem(os, id, { status: 'dismissed', note: parsed.reason });
    return { id, status: 'dismissed', reason: parsed.reason };
  }
  if (parsed.kind === 'delivery') {
    if (!os.registry.entityTypes.has('delivery')) return (setItem(os, id, { status: 'dismissed', note: 'deliveries not installed' }), { id, status: 'dismissed' });
    const entityId = fileDelivery(os, id, parsed.delivery, { ...m, body: `${mail.subject}\n${text}` });
    setItem(os, id, { status: 'confirmed', entityId, note: 'delivery' });
    return { id, status: 'confirmed', entityId };
  }
  let travelId: string | null = null;
  let tripId: string | null = null;
  if (parsed.kind === 'flight' || parsed.kind === 'stay') {
    const r = parsed.kind === 'flight' ? fileFlight(os, id, parsed.flight, mail, account) : fileStay(os, id, parsed.stay, mail, account);
    travelId = r.eventId;
    tripId = r.tripId;
  }
  const t = parsed.kind === 'txn' ? parsed.txn : parsed.txn;
  if (!t) {
    setItem(os, id, { status: travelId ? 'confirmed' : 'dismissed', entityId: travelId, note: parsed.kind });
    return { id, status: travelId ? 'confirmed' : 'dismissed', entityId: travelId };
  }
  setItem(os, id, { parsed: { kind: 'txn', txn: t } });
  os.db.run(`UPDATE ingest_queue SET dedupe_key=? WHERE id=?`, [`${t.direction}:${t.amount.toFixed(2)}`, id]);
  // The bank SMS (or you) may have filed this payment already: confirm it instead of counting it twice.
  const same = sameMoney(os, t.amount, t.direction === 'credit' ? 'income' : 'expense', t.date ?? iso(mail.date));
  let entityId: string | null | undefined;
  if (same) {
    enrich(os, same, t, m);
    const e = os.entities.get<{ merchant?: string }>(same)!;
    // The mail knows who it was ("Adobe"), where the bank only had a code.
    if (t.counterparty && (!e.data.merchant || /\d{4,}|\*/.test(e.data.merchant))) os.entities.update(same, { data: { merchant: t.counterparty } }, 'assistant');
    setItem(os, id, { status: 'duplicate', entityId: same, note: 'same payment as a filed transaction' });
    os.dumps.addExtraction({ source: 'email', sourceRef: id, kind: 'transaction', action: 'updated', entityId: same, label: `Matched ${os.entities.get(same)?.title ?? 'a payment'} · ${os.format.currency(t.amount)} to an email from ${account}` });
    entityId = same;
  } else {
    entityId = fileItem(os, id).entityId;
  }
  if (entityId && tripId) os.relations.link(entityId, tripId, 'part_of', {}, 'assistant', { source: 'email', sourceId: id });
  if (travelId && entityId) os.relations.link(entityId, travelId, 'paid_for', {}, 'assistant', { source: 'email', sourceId: id });
  return { id, status: same ? 'duplicate' : 'confirmed', entityId: travelId ?? entityId };
}

/** A transaction for this amount within a day either side (from any source). */
function sameMoney(os: LifeOSContext, amount: number, kind: string, day: string): string | null {
  if (!os.registry.entityTypes.has('transaction')) return null;
  const d = new Date(`${day}T12:00:00`).getTime();
  return (
    os.db.get<{ id: string }>(
      `SELECT id FROM entities WHERE type='transaction' AND deleted_at IS NULL AND json_extract(data,'$.kind')=? AND ABS(json_extract(data,'$.amount') - ?) < 0.5
         AND json_extract(data,'$.date') BETWEEN ? AND ? ORDER BY ABS(julianday(json_extract(data,'$.date')) - julianday(?)) LIMIT 1`,
      [kind, amount, iso(d - DAY), iso(d + DAY), day],
    )?.id ?? null
  );
}

const cityOf = (code: string | null) => (code ? (AIRPORTS[code] ?? code) : null);

/** The trip covering this day (or two weeks from an open one's start), else a new "Trip to X". */
function tripOn(os: LifeOSContext, day: string, destination: string | null, ingestId: string, account: string, end?: string | null): string | null {
  if (!os.registry.entityTypes.has('trip')) return null;
  const trips = os.entities.query<{ destination?: string; startDate?: string; endDate?: string }>('trip', {}, { limit: 300 });
  const openEnd = (start: string) => iso(new Date(`${start}T12:00:00`).getTime() + 14 * DAY);
  const hit = trips.find((t) => t.data.startDate && t.data.startDate <= day && (t.data.endDate ?? openEnd(t.data.startDate)) >= day);
  if (hit) {
    if (end && hit.data.endDate && end > hit.data.endDate) os.entities.update(hit.id, { data: { endDate: end } }, 'assistant');
    return hit.id;
  }
  if (!destination) return null;
  const t = os.entities.create({ type: 'trip', title: `Trip to ${destination}`, data: { destination, startDate: day, ...(end ? { endDate: end } : {}) } }, 'assistant');
  os.entities.timeline.add({ entityId: t.id, kind: 'email', title: `From Email · ${account}`, body: null, actor: 'system', occurredAt: Date.now(), meta: { ingestId } });
  os.dumps.addExtraction({ source: 'email', sourceRef: ingestId, kind: 'trip', entityId: t.id, label: `Trip: Trip to ${destination} · from ${account}` });
  return t.id;
}

/** A ticket → one flight event (re-sent tickets and check-in mails update it), in its trip. */
function fileFlight(os: LifeOSContext, ingestId: string, f: ParsedFlight, mail: Mail, account: string): { eventId: string | null; tripId: string | null } {
  if (!os.registry.entityTypes.has('event')) return { eventId: null, tripId: null };
  const startAt = f.time ? new Date(`${f.date}T${f.time}:00`).getTime() : new Date(`${f.date}T12:00:00`).getTime();
  const route = f.from && f.to ? `${cityOf(f.from)} → ${cityOf(f.to)}` : null;
  const title = route ? `Flight ${route}` : `Flight ${f.flightNo}`;
  const notes = [f.pnr ? `PNR ${f.pnr}` : null, `From ${account}: “${mail.subject}”`].filter(Boolean).join('\n');
  const flights = os.entities.query<{ kind?: string; flightNo?: string; startAt?: number; notes?: string }>('event', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'flight' }] } }, { limit: 500 });
  const same = flights.find((e) => (f.pnr && e.data.notes?.includes(`PNR ${f.pnr}`) && (!f.flightNo || !e.data.flightNo || e.data.flightNo === f.flightNo)) || (f.flightNo && e.data.flightNo === f.flightNo && e.data.startAt && iso(e.data.startAt) === f.date));
  const data = { kind: 'flight', startAt, allDay: !f.time, airline: f.airline ?? undefined, flightNo: f.flightNo ?? undefined, location: f.from && f.to ? `${f.from} → ${f.to}` : undefined, notes };
  let id: string;
  if (same) {
    id = same.id;
    os.entities.update(id, { data: { startAt, ...(f.time ? { allDay: false } : {}) } }, 'assistant');
  } else {
    id = os.entities.create({ type: 'event', title, data }, 'assistant').id;
    os.dumps.addExtraction({ source: 'email', sourceRef: ingestId, kind: 'event', entityId: id, label: `Flight: ${route ?? f.flightNo} · ${f.date.slice(8)}/${f.date.slice(5, 7)}${f.flightNo ? ` · ${f.flightNo}` : ''} · from ${account}` });
  }
  os.entities.timeline.add({ entityId: id, kind: 'email', title: `From Email · ${account}`, body: `${mail.fromName}: ${mail.subject}`, actor: 'system', occurredAt: mail.date, meta: { ingestId } });
  const tripId = tripOn(os, f.date, cityOf(f.to), ingestId, account);
  if (tripId && !os.relations.forEntity(id, 'part_of').some((r) => r.other.id === tripId)) os.relations.link(id, tripId, 'part_of', {}, 'assistant', { source: 'email', sourceId: ingestId });
  return { eventId: id, tripId };
}

/** A hotel / stay booking → a stay event across its nights, in its trip. */
function fileStay(os: LifeOSContext, ingestId: string, st: ParsedStay, mail: Mail, account: string): { eventId: string | null; tripId: string | null } {
  if (!os.registry.entityTypes.has('event')) return { eventId: null, tripId: null };
  const startAt = new Date(`${st.checkIn}T14:00:00`).getTime();
  const stays = os.entities.query<{ kind?: string; startAt?: number }>('event', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'stay' }] } }, { limit: 500 });
  const same = stays.find((e) => e.title === `Stay · ${st.name}` && e.data.startAt && iso(e.data.startAt) === st.checkIn);
  let id: string;
  if (same) id = same.id;
  else {
    id = os.entities.create({ type: 'event', title: `Stay · ${st.name}`, data: { kind: 'stay', startAt, allDay: true, ...(st.checkOut ? { endAt: new Date(`${st.checkOut}T11:00:00`).getTime() } : {}), location: st.place ?? undefined, notes: `From ${account}: “${mail.subject}”` } }, 'assistant').id;
    os.dumps.addExtraction({ source: 'email', sourceRef: ingestId, kind: 'event', entityId: id, label: `Stay: ${st.name} · ${st.checkIn.slice(8)}/${st.checkIn.slice(5, 7)}${st.checkOut ? `–${st.checkOut.slice(8)}/${st.checkOut.slice(5, 7)}` : ''} · from ${account}` });
  }
  os.entities.timeline.add({ entityId: id, kind: 'email', title: `From Email · ${account}`, body: `${mail.fromName}: ${mail.subject}`, actor: 'system', occurredAt: mail.date, meta: { ingestId } });
  const tripId = tripOn(os, st.checkIn, st.place, ingestId, account, st.checkOut);
  if (tripId && !os.relations.forEntity(id, 'part_of').some((r) => r.other.id === tripId)) os.relations.link(id, tripId, 'part_of', {}, 'assistant', { source: 'email', sourceId: ingestId });
  return { eventId: id, tripId };
}
