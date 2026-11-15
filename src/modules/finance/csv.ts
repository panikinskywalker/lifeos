import type { LifeOSContext } from '@core/registry/context';
import { categoryOf, type TransactionData } from './types';
import { categoryFor } from './filing/rules';
import { sameMoneyFor } from './filing/transactions';

/**
 * Payments in and out as CSV (docs/MODEL.md, Import and export, 15 Nov): export
 * any date range; import a bank statement's CSV with its columns matched
 * (guessed, then yours to change), a preview of what it will add, payments
 * already filed skipped, and Undo for the whole import.
 */

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Payments between two days (inclusive), oldest first: Date, Payee, Category, Kind, Amount (money out is negative), Account, Note. */
export function paymentsCsv(os: LifeOSContext, start: string, end: string): { csv: string; count: number } {
  const accounts = new Map(os.records.query('account', {}, { limit: 1000 }).map((a) => [a.id, a.title]));
  const rows = os.records.query<TransactionData>('transaction', { filter: { and: [{ field: 'data.date', op: 'gte', value: start }, { field: 'data.date', op: 'lte', value: end }] }, sort: [{ field: 'data.date', dir: 'asc' }] }, { limit: 100_000 });
  const lines = [['Date', 'Payee', 'Category', 'Kind', 'Amount', 'Account', 'Note'].join(',')];
  for (const t of rows) {
    const d = t.data;
    const out = d.kind === 'expense' || ((d.kind === 'transfer' || d.kind === 'investment') && !!d.accountId);
    const kind = { expense: 'Spent', income: d.refund ? 'Refund' : 'Received', transfer: 'Transfer', investment: 'Investment' }[d.kind];
    lines.push([d.date, t.title || d.merchant || '', categoryOf(d.category).label, kind, (out ? -d.amount : d.amount).toFixed(2), accounts.get((d.accountId ?? d.toAccountId) as string) ?? '', d.note ?? ''].map(cell).join(','));
  }
  return { csv: lines.join('\n'), count: rows.length };
}

/** A CSV's rows (quotes, commas and new lines inside quotes handled). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) {
      if (c === '"' && t[i + 1] === '"') (f += '"'), i++;
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(f.trim()), (f = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(f.trim());
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
      f = '';
    } else f += c;
  }
  row.push(f.trim());
  if (row.some((x) => x !== '')) rows.push(row);
  return rows;
}

/** Which column holds what: one signed amount, or money out and money in apart. */
export interface CsvMapping {
  header: number;
  date: number;
  description: number;
  amount?: number;
  out?: number;
  in?: number;
}

/** The header row (the first with a date-like and an amount-like name) and a guess at each column. */
export function guessMapping(rows: string[][]): CsvMapping | null {
  const find = (h: string[], re: RegExp) => h.findIndex((x) => re.test(x));
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const h = rows[r]!.map((x) => x.toLowerCase());
    const date = find(h, /\b(?:txn |transaction |value |posting )?date\b/);
    const description = find(h, /narration|description|particulars|details|remarks|merchant|payee/);
    const out = find(h, /withdrawal|debit|money out|paid out|dr\b/);
    const inn = find(h, /deposit|credit|money in|paid in|cr\b/);
    const amount = find(h, /^amount|txn amount|transaction amount/);
    if (date >= 0 && description >= 0 && (amount >= 0 || (out >= 0 && inn >= 0))) return out >= 0 && inn >= 0 && amount < 0 ? { header: r, date, description, out, in: inn } : { header: r, date, description, amount };
  }
  return null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** 02/11/26, 02-11-2026, 2026-11-02, 02 Nov 2026, 02-Nov-26 → 2026-11-02 (Indian banks write the day first). */
export function readDate(s: string): string | null {
  const v = s.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(v);
  if (m) return `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  m = /^(\d{1,2})[\s/-]([a-z]{3})[a-z]*[\s/-](\d{2,4})/.exec(v);
  if (m && MONTHS.includes(m[2]!)) return `${m[3]!.length === 2 ? `20${m[3]}` : m[3]}-${String(MONTHS.indexOf(m[2]!) + 1).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return null;
}

/** "1,234.50", "(1,234.50)", "-1234.5", "1,234.50 Dr" → a signed number; blank → null. */
export function readAmount(s: string | undefined): number | null {
  const v = (s ?? '').trim();
  if (!v) return null;
  const neg = /^\(.*\)$/.test(v) || /^-/.test(v) || /\bdr\.?$/i.test(v);
  const n = Number(v.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? (neg ? -n : n) : null;
}

export interface StatementRow {
  date: string;
  description: string;
  amount: number;
  kind: 'expense' | 'income';
}

/** What the import will add, and how many rows it could not read. */
export function readStatement(rows: string[][], m: CsvMapping): { rows: StatementRow[]; skipped: number } {
  const out: StatementRow[] = [];
  let skipped = 0;
  for (const r of rows.slice(m.header + 1)) {
    const date = readDate(r[m.date] ?? '');
    let amount: number | null = null;
    if (m.amount != null) amount = readAmount(r[m.amount]);
    else {
      const o = readAmount(r[m.out!]);
      const i = readAmount(r[m.in!]);
      amount = o ? -Math.abs(o) : i ? Math.abs(i) : null;
    }
    const description = (r[m.description] ?? '').replace(/\s+/g, ' ').trim();
    if (!date || amount == null || !description) {
      skipped++;
      continue;
    }
    out.push({ date, description, amount: Math.abs(amount), kind: amount < 0 ? 'expense' : 'income' });
  }
  return { rows: out, skipped };
}

/** File the statement on an account: each row a payment, categorised; one already filed (same day ±1, amount, kind) is skipped. Returns the new ids for Undo. */
export function importStatement(os: LifeOSContext, accountId: string, rows: StatementRow[]): { created: string[]; already: number } {
  const created: string[] = [];
  let already = 0;
  os.db.transaction(() => {
    for (const r of rows) {
      if (sameMoneyFor(os, r.amount, r.kind, r.date, r.description)) {
        already++;
        continue;
      }
      const category = categoryFor(os, r.description, r.description, r.amount, r.kind === 'income' ? 'credit' : 'debit');
      const t = os.records.create({ object: 'transaction', title: r.description.slice(0, 80), data: { amount: r.amount, kind: r.kind, category, date: r.date, merchant: r.description.slice(0, 120), accountId, source: 'import' } }, 'assistant');
      created.push(t.id);
    }
  });
  return { created, already };
}

export function undoImport(os: LifeOSContext, created: string[]): void {
  os.db.transaction(() => {
    for (const id of created) if (os.records.get(id)) os.records.delete(id, 'user');
  });
}
