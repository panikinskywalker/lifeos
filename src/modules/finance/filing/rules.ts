import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { knownMerchant } from './merchants';

/**
 * Categories for filed money (finance filing rules, R1): your keyword and
 * amount rules, what you taught by recategorising, the built-in merchant list.
 */

const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

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
    const group = r.fromGroupId && p.payerId ? os.groups.groupsOf(p.payerId).includes(r.fromGroupId) || ((os.records.get<{ memberIds?: string[] }>(r.fromGroupId)?.data.memberIds ?? []).includes(p.payerId)) : false;
    if (group) return { category: r.category, sure: true, why: `from ${os.records.get(r.fromGroupId!)?.title ?? 'the group'}` };
    const k = r.afterKeyword?.trim();
    if (k) {
      const hours = r.withinHours ?? 48;
      const since = iso(p.at - hours * 3_600_000);
      const until = iso(p.at);
      const re = new RegExp(`(^|[^a-z0-9])${k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i');
      const paid = os.records
        .query<{ merchant?: string; note?: string; kind?: string }>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: since }, { field: 'data.date', op: 'lte', value: until }] } }, { limit: 200 })
        .find((t) => re.test(`${t.data.merchant ?? ''} ${t.data.note ?? ''}`));
      if (paid) return { category: r.category, sure: true, why: `after your ${paid.title} payment` };
    }
    // Only the amount fits: a guess — unless you've said what this payer's money is.
    if (learned) return null;
    return { category: r.category, sure: false, why: `only the amount fits${r.fromGroupId ? ` — not from ${os.records.get(r.fromGroupId)?.title ?? 'the group'}` : ''}` };
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
  const r = os.links.forEntity(txId).find((x) => x.direction === 'out' && (x.relation.kind === 'payee' || x.relation.kind === 'person'));
  return r ? { id: r.other.id, type: r.other.object, title: r.other.title } : null;
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
    ? os.links.forEntity(payee.id).filter((r) => r.direction === 'in' && r.other.object === 'transaction').map((r) => r.other.id)
    : merchant
      ? os.db.all<{ id: string }>(`SELECT id FROM records WHERE object='transaction' AND deleted_at IS NULL AND lower(json_extract(data,'$.merchant'))=? LIMIT 500`, [merchant.toLowerCase()]).map((r) => r.id)
      : [];
  return ids.filter((id) => id !== txId && (os.records.get<{ category?: string; kind?: string }>(id)?.data.category ?? category) !== category && os.records.get<{ kind?: string }>(id)?.data.kind !== 'transfer');
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
      const e = os.records.get<{ category?: string }>(id);
      if (!e || e.data.category === category) continue;
      out.push({ id, was: e.data.category ?? 'other' });
      os.records.update(id, { data: { category } }, 'system');
    }
  });
  return out;
}
