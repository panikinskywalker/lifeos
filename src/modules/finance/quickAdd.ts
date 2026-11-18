import type { LifeOSContext } from '@core/registry/context';
import type { PhotoAsk } from '@core/brain/photo';
import { categoryFor } from './filing/rules';
import { cashAccount } from './filing/transactions';
import { CATEGORIES, type TransactionData } from './types';

/**
 * Add a payment (docs/MODEL.md, Add a payment): from a bill you snap or
 * attach, or from what you type or say ("₹640 at Shree Sagar, paid in cash,
 * half is Arjun's"). Reading a bill sends that one photo to Claude because you
 * pressed the button (as Snap the fridge does); nothing else leaves the phone.
 */

export interface QuickPayment {
  payee: string;
  amount: number;
  date: string;
  category: string;
  items: string[];
  tax: number | null;
  /** Each line of the bill with its quantity and what it costs in all, for splitting by item. */
  lines?: Array<{ name: string; qty: number; total: number }>;
  /** Service charge or tip on the bill. */
  service?: number | null;
  paidWith: 'cash' | 'upi' | 'card' | 'someone' | null;
  /** The card's last digits when a bill prints them ("Card XX1234"). */
  last4?: string;
  splitWith: string[];
  /** Who paid, when it was someone else ("Arjun paid"). */
  payer?: string;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** What you typed or said, read on the phone: the amount, who, how it was paid, who shares it. */
export function readSaid(os: LifeOSContext, text: string, today = new Date()): QuickPayment | null {
  const amount = Number(/(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)/i.exec(text)?.[1]?.replace(/,/g, '') ?? NaN);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const payee = /\b(?:at|to|from)\s+([A-Za-z][\w&' .-]*?)\s*(?=,|\.|\bpaid\b|\bwith\b|\bon\b|\bhalf\b|\bsplit\b|\bby\b|$)/i.exec(text)?.[1]?.trim() ?? /\bfor\s+([A-Za-z][\w&' -]*?)\s*(?=,|\.|$)/i.exec(text)?.[1]?.trim() ?? '';
  const paidWith = /\bcash\b/i.test(text) ? 'cash' : /\b(upi|gpay|google pay|phonepe|paytm)\b/i.test(text) ? 'upi' : /\bcard\b/i.test(text) ? 'card' : /\b(\w+) paid\b/i.test(text) && !/\b(i|me) paid\b/i.test(text) ? 'someone' : null;
  const half = /\bhalf (?:is|was) (\w+?)(?:'s|’s)?\b/i.exec(text)?.[1];
  const split = /\bsplit (?:it )?with ([\w ,]+?)(?=\.|$)/i.exec(text)?.[1];
  // "dinner with Arjun and Priya": names, as written with a capital.
  const withNames = /\bwith ((?:[A-Z][\w]*)(?:(?:\s*,\s*|\s+and\s+)[A-Z][\w]*)*)/.exec(text)?.[1];
  const splitWith = half ? [half] : split ? split.split(/,|\band\b/).map((s) => s.trim()).filter(Boolean) : withNames ? [...new Set(withNames.split(/,|\band\b/).map((s) => s.trim()).filter(Boolean))] : [];
  const payer = /\b([A-Z][\w]*) paid\b/.exec(text)?.[1];
  return { payee, amount, date: iso(today), category: categoryFor(os, payee, text, amount), items: [], tax: null, paidWith, splitWith, ...(payer && !/^(I|Me)$/.test(payer) ? { payer } : {}) };
}

const CATEGORY_IDS = CATEGORIES.map((c) => c.value).filter((v) => v !== 'transfer');

export const BILL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['payee', 'amount', 'date', 'items', 'lines', 'tax', 'service', 'category', 'paidWith', 'cardLast4'],
  properties: {
    payee: { type: 'string' },
    amount: { type: 'number' },
    date: { type: 'string' },
    items: { type: 'array', items: { type: 'string' } },
    lines: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'qty', 'total'], properties: { name: { type: 'string' }, qty: { type: 'number' }, total: { type: 'number' } } } },
    tax: { type: 'number' },
    service: { type: 'number' },
    category: { type: 'string', enum: CATEGORY_IDS },
    paidWith: { type: 'string', enum: ['cash', 'upi', 'card', 'unknown'] },
    cardLast4: { type: 'string' },
  },
} as const;

const BILL_SYSTEM = `You read a photo of a bill or receipt, usually from India. Answer with JSON only: payee (the shop or restaurant name as printed), amount (the grand total paid, a number), date (YYYY-MM-DD, or "" if none is printed), items (up to 8 short lines like "2 masala dosa"), lines (every item line as printed: its name, quantity and the line's total price before tax), tax (GST and other taxes added, 0 if none), service (service charge or tip, 0 if none), category (one id from the list), paidWith (cash, upi or card when the bill says how it was paid, else unknown), cardLast4 (the card's last 4 digits if printed, else ""). If it is not a bill, answer amount 0.`;

/** The question that goes with a bill photo: the category list and nothing about you. */
export function billAsk(): Omit<PhotoAsk, 'image'> {
  return {
    module: 'finance',
    moduleName: 'Money',
    why: 'you pressed Snap a bill',
    what: 'a photo of a bill',
    system: BILL_SYSTEM,
    prompt: 'Read this bill.',
    record: { categories: CATEGORY_IDS },
    schema: BILL_SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 2000,
    effort: 'low',
  };
}

/** Claude's reading of the bill, kept to what makes sense. */
export function readBill(os: LifeOSContext, answer: unknown, today = new Date()): QuickPayment | null {
  const a = (answer ?? {}) as { payee?: unknown; amount?: unknown; date?: unknown; items?: unknown; lines?: unknown; tax?: unknown; service?: unknown; category?: unknown; paidWith?: unknown; cardLast4?: unknown };
  const amount = typeof a.amount === 'number' ? Math.round(a.amount * 100) / 100 : 0;
  if (amount <= 0) return null;
  const payee = typeof a.payee === 'string' ? a.payee.trim().slice(0, 80) : '';
  const date = typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date) && a.date <= iso(today) ? a.date : iso(today);
  const category = typeof a.category === 'string' && CATEGORY_IDS.includes(a.category) ? a.category : categoryFor(os, payee, '', amount);
  const items = Array.isArray(a.items) ? a.items.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 60)).slice(0, 8) : [];
  const paidWith = a.paidWith === 'cash' || a.paidWith === 'upi' || a.paidWith === 'card' ? a.paidWith : null;
  const last4 = typeof a.cardLast4 === 'string' ? a.cardLast4.replace(/\D/g, '').slice(-4) : '';
  const lines = (Array.isArray(a.lines) ? a.lines : []).map((l: { name?: unknown; qty?: unknown; total?: unknown }) => ({ name: String(l.name ?? '').trim().slice(0, 60), qty: typeof l.qty === 'number' && l.qty > 0 ? l.qty : 1, total: typeof l.total === 'number' ? Math.round(l.total * 100) / 100 : 0 })).filter((l) => l.name && l.total > 0).slice(0, 40);
  return { payee, amount, date, category, items, lines, tax: typeof a.tax === 'number' && a.tax > 0 ? a.tax : null, service: typeof a.service === 'number' && a.service > 0 ? a.service : null, paidWith, ...(last4.length === 4 ? { last4 } : {}), splitWith: [] };
}

/** Save it as a payment on the account you picked (Cash is made once if you have none); Undo deletes it. */
export function saveQuick(os: LifeOSContext, p: QuickPayment, account: string | 'cash' | null): { id: string; undo: () => void } {
  const accountId = account === 'cash' ? (cashAccount(os) ?? undefined) : (account ?? undefined);
  const note = [p.items.join(', '), p.tax ? `tax ${os.format.currency(p.tax)}` : ''].filter(Boolean).join(' · ') || undefined;
  const tx = os.records.create<TransactionData>({ object: 'transaction', title: p.payee || 'Payment', data: { amount: p.amount, kind: 'expense', category: p.category, date: p.date, merchant: p.payee || undefined, accountId, note, source: 'manual' } as TransactionData }, 'user');
  return { id: tx.id, undo: () => os.records.delete(tx.id, 'user') };
}
