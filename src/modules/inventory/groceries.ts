import type { LifeOSContext } from '@core/registry/context';
import type { FileContext, FileOutcome, MessageParser, ParserRead, RawMessage } from '@core/filing/contract';
import type { Filing } from '@core/repo/filingRepo';
import type { SpaceData, StockData } from './types';
import { buy, shopLabel, undoAll, type StockUndo } from './stock';

/**
 * Groceries in, code only (docs/MODEL.md layer 8, *Groceries come in on their
 * own*; R7e). Blinkit sends no mail: its delivery notification, or the bank /
 * UPI SMS that names it, puts one card in To check asking for the invoice;
 * the invoice PDF shared into LifeOS is read by a parser and stocks Home.
 *
 * The invoice parser is written against a *plausible* Blinkit tax-invoice
 * layout (no real invoice yet). It sits behind one seam — `readInvoice(text)`
 * — so a real sample only changes `parseBlinkitInvoice`. Zepto and Instamart
 * mail parsers wait for a real mail each (their senders can't be told apart
 * from their marketing without one).
 */

/** To check kinds this module files; the Home board draws their cards. */
export const HOME_ORDER = 'home-order';
export const HOME_STOCKED = 'home-stocked';
export const HOME_UNREAD = 'home-unread';

/** Blinkit's Android app (was Grofers). */
export const BLINKIT_APP = 'com.grofers.customerapp';
const BLINKIT = /\bblinkit\b|\bgrofers\b|\bblink\s*commerce\b/i;

/** "₹437", "Rs.437.00", "INR 1,212" → 437. */
function amountIn(text: string): number | null {
  const m = /(?:₹|\bRs\.?|\bINR)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text);
  return m ? Number(m[1]!.replace(/,/g, '')) : null;
}

/** What a Blinkit order card keeps (in its `before`). */
export interface OrderAsk {
  shop: string;
  amount: number | null;
  /** When the message came. */
  at: number;
  /** 'delivered' from the app's notification, 'paid' from the bank's SMS. */
  said: 'delivered' | 'paid';
}

export const orderAskOf = (f: Pick<Filing, 'kind' | 'before'>): OrderAsk | null => (f.kind === HOME_ORDER && f.before && typeof f.before.shop === 'string' ? (f.before as unknown as OrderAsk) : null);

type OrderRead = ParserRead & ({ kind: 'order'; shop: string; amount: number | null; said: OrderAsk['said'] } | { kind: 'skip'; reason: string });

function read(_os: LifeOSContext, m: RawMessage): OrderRead | null {
  const text = `${m.title ?? ''}\n${m.body}`;
  if (m.source === 'notification') {
    if (m.from !== BLINKIT_APP) return null;
    if (!/\bdeliver(?:ed|y (?:is )?complete)|\bhas arrived\b|\barrived at\b|\breached you\b|\benjoy your order\b/i.test(text)) return { kind: 'skip', reason: 'not a delivery' };
    return { kind: 'order', shop: 'blinkit', amount: amountIn(text), said: 'delivered' };
  }
  if (m.source === 'sms') {
    if (!BLINKIT.test(m.body)) return null;
    if (/\brefund|\bcredited\b|\bcashback\b|\breversed\b/i.test(m.body) && !/\bdebited\b/i.test(m.body)) return { kind: 'skip', reason: 'a refund' };
    if (!/\bdebited\b|\bspent\b|\bpaid\b|\bsent\b|\bdeducted\b|\bpurchase\b|\btxn\b/i.test(m.body)) return null;
    const amount = amountIn(m.body);
    return amount ? { kind: 'order', shop: 'blinkit', amount, said: 'paid' } : null;
  }
  return null;
}

/** "Blinkit · ₹437 · just delivered". */
function orderLabel(os: LifeOSContext, a: OrderAsk): string {
  const when = a.said === 'delivered' ? 'just delivered' : `paid ${os.format.time(a.at)}`;
  return [shopLabel(a.shop), a.amount != null ? os.format.currency(a.amount) : null, when].filter(Boolean).join(' · ');
}
const ORDER_FLAG = 'Share the invoice and I’ll stock the fridge';

/** The window in which a notification and an SMS are the same order. */
const SAME_ORDER_MS = 3 * 3_600_000;

function file(os: LifeOSContext, m: RawMessage, r: ParserRead, ctx: FileContext): FileOutcome {
  const o = r as OrderRead & { kind: 'order' };
  // The money parser ran first (priority 30): the Transaction it made from this SMS is the order's payment.
  const txId = os.filings.forSource(ctx.id).find((f) => f.kind === 'transaction' && !f.undone)?.entityId ?? null;
  const twin = os.filings.ofKind(HOME_ORDER, { since: m.receivedAt - SAME_ORDER_MS, open: true }).find((f) => orderAskOf(f)?.shop === o.shop);
  if (twin) {
    // The SMS and the notification are one order: one card, which learns what the other didn't say.
    const was = orderAskOf(twin)!;
    const next: OrderAsk = { ...was, amount: was.amount ?? o.amount, said: was.said === 'delivered' || o.said === 'delivered' ? 'delivered' : 'paid' };
    os.filings.update(twin.id, { label: orderLabel(os, next), entityId: twin.entityId ?? txId, before: next as unknown as Record<string, unknown> });
    return { status: 'duplicate', entityId: txId, note: 'same Blinkit order as an earlier message' };
  }
  const ask: OrderAsk = { shop: o.shop, amount: o.amount, at: m.receivedAt, said: o.said };
  os.filings.add({ source: m.source, sourceRef: ctx.id, kind: HOME_ORDER, action: 'logged', entityId: txId, label: orderLabel(os, ask), flag: ORDER_FLAG, before: ask as unknown as Record<string, unknown> });
  return { status: 'confirmed', entityId: txId, note: `${shopLabel(o.shop)} order: asked for the invoice` };
}

/** Blinkit's delivery notification and its bank / UPI SMS → one To check card (after the money parser, so it can link the payment). */
export const groceryOrderParser: MessageParser = {
  id: 'inventory.orders',
  module: 'inventory',
  priority: 40,
  packages: [BLINKIT_APP],
  label: (m) => (m.source === 'notification' && m.from === BLINKIT_APP ? 'Blinkit' : null),
  read,
  file,
};

/* ------------------------------------------------------------------ */
/* Invoices                                                            */
/* ------------------------------------------------------------------ */

export interface InvoiceLine {
  name: string;
  size?: string;
  quantity: number;
  /** The line's total, ₹. */
  price?: number;
}

export interface Invoice {
  shop: string;
  orderId?: string;
  /** yyyy-MM-dd. */
  date?: string;
  total?: number;
  lines: InvoiceLine[];
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
/** "30-Oct-2026", "30 Oct 26", "30/10/2026" → 2026-10-30. */
function dayOf(s: string): string | undefined {
  const named = /(\d{1,2})[-\/ ]([A-Za-z]{3})[A-Za-z]*[-\/ ,]+(\d{2,4})/.exec(s);
  const num = /(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/.exec(s);
  const [d, mo, y] = named ? [Number(named[1]), MONTHS[named[2]!.toLowerCase()], named[3]!] : num ? [Number(num[1]), Number(num[2]), num[3]!] : [];
  if (!d || !mo || !y) return undefined;
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  return `${year}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Fees, not things: they never become Stock. */
const NOT_A_THING = /\b(?:handling|delivery|packaging|packing|small cart|convenience|platform|surge|late night)\b.*\b(?:fee|charges?)\b|\btip\b|\bdonation\b|\bfeeding india\b/i;
const MONEY = /^-?[\d,]+\.\d{2}$/;
const INT = /^\d{1,3}$/;
const SIZE_END = /\s*\(?(\d+(?:\.\d+)?\s*(?:g|gm|kg|ml|l|ltr|pcs?|pieces?|units?)(?:\s*[x×]\s*\d+)?)\)?\s*$/i;

/**
 * A Blinkit tax invoice's text, as a PDF reader gives it (one table row per
 * line). Plausible layout, unverified: a header naming Blink Commerce, "Order
 * Id", "Invoice Date", then rows of
 *   Sr · UPC (optional) · description · MRP · discount · qty · taxable · taxes… · total
 * and a closing "Invoice Value" / "Total". A row's description ends at its
 * first price (two decimals); its quantity is the first whole number after
 * that; its total is the last price. Fee rows are dropped.
 */
export function parseBlinkitInvoice(text: string): Invoice | null {
  if (!BLINKIT.test(text)) return null;
  const orderId = /order\s*(?:id|no\.?|number)\s*[:#.]?\s*([A-Z0-9-]{6,})/i.exec(text)?.[1];
  const dateLine = /(?:invoice|order)\s*date\s*[:.]?\s*([^\n]{6,24})/i.exec(text)?.[1];
  const totals = [...text.matchAll(/(?:invoice value|grand total|order total|total amount|amount payable|\btotal\b)\s*[:₹Rs.\s]*([\d,]+\.\d{2})/gi)];
  const total = totals.length ? Number(totals[totals.length - 1]![1]!.replace(/,/g, '')) : undefined;
  const lines: InvoiceLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const tokens = raw.trim().split(/\s+/);
    if (tokens.length < 4 || !/^\d{1,3}\.?$/.test(tokens[0]!)) continue;
    let i = 1;
    if (/^\d{8,14}$/.test(tokens[i] ?? '')) i++; // UPC / EAN
    const firstPrice = tokens.findIndex((t, k) => k >= i && MONEY.test(t.replace(/^₹/, '')));
    if (firstPrice <= i) continue;
    const desc = tokens.slice(i, firstPrice).join(' ');
    const nums = tokens.slice(firstPrice).map((t) => t.replace(/^₹/, ''));
    if (!nums.every((t) => MONEY.test(t) || INT.test(t) || /^\d+(?:\.\d+)?%$/.test(t))) continue;
    if (NOT_A_THING.test(desc)) continue;
    const qty = nums.find((t) => INT.test(t));
    const money = nums.filter((t) => MONEY.test(t));
    const sz = SIZE_END.exec(desc);
    const name = (sz ? desc.slice(0, sz.index) : desc).replace(/\s*[-–,]\s*$/, '').trim();
    if (!name) continue;
    lines.push({ name, quantity: qty ? Number(qty) : 1, ...(sz ? { size: sz[1]!.replace(/(\d)\s*([a-z])/i, '$1 $2') } : {}), ...(money.length ? { price: Number(money[money.length - 1]!.replace(/,/g, '')) } : {}) });
  }
  if (!lines.length) return null;
  return { shop: 'blinkit', ...(orderId ? { orderId } : {}), ...(dateLine && dayOf(dateLine) ? { date: dayOf(dateLine) } : {}), ...(total != null ? { total } : {}), lines };
}

/** The seam: every invoice reader LifeOS has. A real sample changes only its own reader. */
const INVOICE_READERS: Array<(text: string) => Invoice | null> = [parseBlinkitInvoice];

export function readInvoice(text: string): Invoice | null {
  for (const r of INVOICE_READERS) {
    const inv = r(text);
    if (inv) return inv;
  }
  return null;
}

/** What a "stocked from an order" card keeps: how to undo it. */
export interface StockedNote {
  shop: string;
  undo: StockUndo[];
  orderCard: string | null;
}

export const stockedNoteOf = (f: Pick<Filing, 'kind' | 'before'>): StockedNote | null => (f.kind === HOME_STOCKED && f.before && Array.isArray(f.before.undo) ? (f.before as unknown as StockedNote) : null);

/**
 * Stock Home from an invoice's text: each line bought (source order, the
 * shop, the order's payment when a card has it), into the space its name
 * suggests. The order's card leaves To check; a *done, undo?* card says what
 * came in ("9 things from Blinkit · Fridge 5 · Kitchen 3 · Bathroom 1").
 * Returns null when no reader knows the text.
 */
export function stockFromInvoice(os: LifeOSContext, text: string, opts: { at?: number } = {}): { filingId: string; ids: string[]; label: string } | null {
  const inv = readInvoice(text);
  if (!inv) return null;
  const at = opts.at ?? (inv.date ? new Date(`${inv.date}T12:00:00`).getTime() : Date.now());
  // The card for this order: the newest open one from the same shop in the last two days.
  const card = os.filings.ofKind(HOME_ORDER, { since: at - 2 * 86_400_000, open: true }).find((f) => orderAskOf(f)?.shop === inv.shop) ?? null;
  const orderId = card?.entityId && os.records.get(card.entityId)?.object === 'transaction' ? card.entityId : undefined;
  const undo: StockUndo[] = [];
  os.db.transaction(() => {
    for (const l of inv.lines) undo.push(buy(os, { name: l.name, size: l.size, quantity: l.quantity, price: l.price, at, source: 'order', shop: inv.shop, orderId }, 'assistant'));
  });
  const bySpace = new Map<string, number>();
  for (const u of undo) {
    const sp = os.records.get<StockData>(u.id)?.data.spaceId;
    const name = (sp && os.records.get<SpaceData>(sp)?.title) || 'Home';
    bySpace.set(name, (bySpace.get(name) ?? 0) + 1);
  }
  const n = undo.length;
  const label = [`${n} ${n === 1 ? 'thing' : 'things'} from ${shopLabel(inv.shop)}`, ...[...bySpace.entries()].sort((a, b) => b[1] - a[1]).map(([s, k]) => `${s} ${k}`)].join(' · ');
  const note: StockedNote = { shop: inv.shop, undo, orderCard: card?.id ?? null };
  const f = os.filings.add({ source: 'share', kind: HOME_STOCKED, action: 'created', entityId: orderId ?? null, label, before: note as unknown as Record<string, unknown> });
  if (card) os.filings.setChecked(card.id);
  return { filingId: f.id, ids: undo.map((u) => u.id), label };
}

/** A shared PDF with no text LifeOS can read (a scan, a locked file): a card says so, never a silent failure. */
export function noteUnreadInvoice(os: LifeOSContext, fileName: string): Filing {
  return os.filings.add({ source: 'share', kind: HOME_UNREAD, action: 'logged', label: `Couldn’t read this invoice · ${fileName}`, flag: 'It has no text LifeOS can read: a scanned picture, or a locked PDF. Add what came by hand.' });
}

/** Undo a stocked order: every line back as it was, the order's card back in To check. */
export function undoStocked(os: LifeOSContext, filingId: string): void {
  const f = os.filings.get(filingId);
  const note = f ? stockedNoteOf(f) : null;
  if (!f || !note) return;
  undoAll(os, note.undo);
  os.filings.markUndone(f.id);
  if (note.orderCard) os.filings.setChecked(note.orderCard, false);
}
