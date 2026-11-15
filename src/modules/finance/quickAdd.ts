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
  paidWith: 'cash' | 'upi' | 'card' | 'someone' | null;
  splitWith: string[];
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
  const splitWith = half ? [half] : split ? split.split(/,|\band\b/).map((s) => s.trim()).filter(Boolean) : [];
  return { payee, amount, date: iso(today), category: categoryFor(os, payee, text, amount), items: [], tax: null, paidWith, splitWith };
}

const CATEGORY_IDS = CATEGORIES.map((c) => c.value).filter((v) => v !== 'transfer');

export const BILL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['payee', 'amount', 'date', 'items', 'tax', 'category'],
  properties: {
    payee: { type: 'string' },
    amount: { type: 'number' },
    date: { type: 'string' },
    items: { type: 'array', items: { type: 'string' } },
    tax: { type: 'number' },
    category: { type: 'string', enum: CATEGORY_IDS },
  },
} as const;

const BILL_SYSTEM = `You read a photo of a bill or receipt, usually from India. Answer with JSON only: payee (the shop or restaurant name as printed), amount (the grand total paid, a number), date (YYYY-MM-DD, or "" if none is printed), items (up to 8 short lines like "2 masala dosa"), tax (GST and other taxes added, 0 if none), category (one id from the list). If it is not a bill, answer amount 0.`;

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
    maxTokens: 600,
  };
}

/** Claude's reading of the bill, kept to what makes sense. */
export function readBill(os: LifeOSContext, answer: unknown, today = new Date()): QuickPayment | null {
  const a = (answer ?? {}) as { payee?: unknown; amount?: unknown; date?: unknown; items?: unknown; tax?: unknown; category?: unknown };
  const amount = typeof a.amount === 'number' ? Math.round(a.amount * 100) / 100 : 0;
  if (amount <= 0) return null;
  const payee = typeof a.payee === 'string' ? a.payee.trim().slice(0, 80) : '';
  const date = typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a.date) && a.date <= iso(today) ? a.date : iso(today);
  const category = typeof a.category === 'string' && CATEGORY_IDS.includes(a.category) ? a.category : categoryFor(os, payee, '', amount);
  const items = Array.isArray(a.items) ? a.items.filter((x): x is string => typeof x === 'string').map((x) => x.slice(0, 60)).slice(0, 8) : [];
  return { payee, amount, date, category, items, tax: typeof a.tax === 'number' && a.tax > 0 ? a.tax : null, paidWith: null, splitWith: [] };
}

/** Save it as a payment on the account you picked (Cash is made once if you have none); Undo deletes it. */
export function saveQuick(os: LifeOSContext, p: QuickPayment, account: string | 'cash' | null): { id: string; undo: () => void } {
  const accountId = account === 'cash' ? (cashAccount(os) ?? undefined) : (account ?? undefined);
  const note = [p.items.join(', '), p.tax ? `tax ${os.format.currency(p.tax)}` : ''].filter(Boolean).join(' · ') || undefined;
  const tx = os.records.create<TransactionData>({ object: 'transaction', title: p.payee || 'Payment', data: { amount: p.amount, kind: 'expense', category: p.category, date: p.date, merchant: p.payee || undefined, accountId, note, source: 'manual' } as TransactionData }, 'user');
  return { id: tx.id, undo: () => os.records.delete(tx.id, 'user') };
}
