import { z, type ZodTypeAny } from 'zod';
import type { Formatters } from '../registry/context';

/* ------------------------------------------------------------------ */
/* Field types — the closed list (docs/MODEL.md §2, docs/PLUGINS.md).  */
/* One definition per type carries how it formats, queries, parses     */
/* and validates. The UI adds one renderer per type for row / record / */
/* form / tile; modules only pick a type per Field.                    */
/* ------------------------------------------------------------------ */

export type FieldType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'money'
  | 'date'
  | 'datetime'
  | 'duration'
  | 'select'
  | 'multiselect'
  | 'boolean'
  | 'link'
  | 'contact'
  | 'file'
  | 'location'
  | 'meter';

export const FIELD_TYPES: readonly FieldType[] = [
  'text', 'longtext', 'number', 'money', 'date', 'datetime', 'duration',
  'select', 'multiselect', 'boolean', 'link', 'contact', 'file', 'location', 'meter',
];

/** Named colours a module may give an option or itself; the theme resolves them per light / dark. */
export type PaletteKey = 'red' | 'orange' | 'yellow' | 'green' | 'mint' | 'teal' | 'cyan' | 'blue' | 'indigo' | 'purple' | 'pink' | 'brown' | 'gray';

export interface FieldOption {
  value: string;
  label: string;
  /** A palette name, or a hex when the colour is the user's (categories). */
  color?: PaletteKey | string;
  icon?: string;
}

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Show in list rows and cards. */
  summary?: boolean;
  /** Group fields into sections in forms and on the record page. */
  section?: string;
  /** Hint for forms and for the model. */
  description?: string;
  placeholder?: string;
  default?: unknown;
  /** number, duration, meter. */
  unit?: string;
  /** money: one currency for the Object (default) or chosen per record (`data.currency`). */
  currency?: 'fixed' | 'perRecord';
  /** select, multiselect. */
  options?: FieldOption[];
  /** select: the picker offers "Add …" and this makes the option (a new spending category). */
  onCreateOption?: (label: string) => FieldOption | null;
  /** link: which Object(s) may be linked, or any. */
  linkTo?: string | string[] | 'any';
  /** link: the Link's word ("works at", "paid"); defaults to the field key. */
  linkWord?: string;
  /** contact. */
  contactKind?: 'phone' | 'email' | 'url';
  /** text: a comma-separated list, shown as chips and typed with a chip input (UPI IDs, Likes; R2). */
  list?: boolean;
  /** text (each item, for a list): what it must look like; the chip input refuses others. */
  pattern?: RegExp;
  /** The line for a value that doesn't match `pattern`; `{item}` is what was typed (“{item}” needs an @ and a bank handle). */
  patternHint?: string;
  /** Show it in the form only while another Field has one of these values (an Asset's Registration, for category vehicle; R7a). */
  showFor?: { field: string; values: string[] };
}

/** Whether a Field belongs in the form for this data (see `Field.showFor`). */
export function fieldShown(field: Pick<Field, 'showFor'>, data: Record<string, unknown>): boolean {
  return !field.showFor || field.showFor.values.includes(String(data[field.showFor.field] ?? ''));
}

/** The line for a text value (or one list item) that doesn't match its Field's `pattern`, or null. */
export function patternError(field: Pick<Field, 'pattern' | 'patternHint' | 'label'>, item: string): string | null {
  if (!field.pattern || field.pattern.test(item)) return null;
  return (field.patternHint ?? `“{item}” doesn’t look like ${field.label.toLowerCase().replace(/s$/, '')}`).split('{item}').join(item);
}

export type MoneyValue = { amount: number; currency?: string };
export type LocationValue = { lat: number; lng: number; label?: string };
export type FileValue = { uri: string; name?: string; mime?: string };
export type MeterValue = { value: number; at?: number };

export type FilterOp =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'startsWith' | 'in' | 'notIn'
  | 'isNull' | 'notNull' | 'between'
  | 'hasTag' | 'relatedTo';

export type Aggregate = 'sum' | 'avg' | 'min' | 'max' | 'count';

export interface ParseCtx {
  /** Default currency when a money text names none. */
  currency: string;
  /** "now" for relative dates ("yesterday", "next Friday"). */
  now: number;
}

export interface FieldTypeDef<T = unknown> {
  type: FieldType;
  /** From a sentence, SMS or mail fragment; undefined when the text is not this type. */
  parse: (text: string, field: Field, ctx: ParseCtx) => T | undefined;
  /** Row and record text. */
  format: (value: T, field: Field, f: Formatters) => string;
  query: { ops: FilterOp[]; aggregate?: Aggregate[]; buckets?: boolean };
  /** Validation for one Field, derived from the Field (options, required…). */
  zod: (field: Field) => ZodTypeAny;
}

const TEXT_OPS: FilterOp[] = ['eq', 'neq', 'contains', 'startsWith', 'in', 'notIn', 'isNull', 'notNull'];
const ORDER_OPS: FilterOp[] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'between', 'isNull', 'notNull'];
const PICK_OPS: FilterOp[] = ['eq', 'neq', 'in', 'notIn', 'isNull', 'notNull'];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const NUMBER_IN = /-?\d[\d,]*(?:\.\d+)?/;
const MONEY_IN = /(?:₹|rs\.?|inr|\$|usd|€|eur|£|gbp)\s*(-?\d[\d,]*(?:\.\d+)?)\s*(k|l|lakh|cr|crore)?|(-?\d[\d,]*(?:\.\d+)?)\s*(k|l|lakh|cr|crore)?\s*(?:₹|rs|inr|rupees|bucks)/i;
const CURRENCY_OF: Array<[RegExp, string]> = [[/₹|rs|inr|rupee/i, 'INR'], [/\$|usd/i, 'USD'], [/€|eur/i, 'EUR'], [/£|gbp/i, 'GBP']];
const SCALE: Record<string, number> = { k: 1e3, l: 1e5, lakh: 1e5, cr: 1e7, crore: 1e7 };

function num(s: string): number {
  return Number(s.replace(/,/g, ''));
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Everyday date words; the full sentence parser handles the rest. */
export function parseDateText(text: string, now: number): string | undefined {
  const t = text.trim().toLowerCase();
  if (ISO_DAY.test(t)) return t;
  const d = new Date(now);
  if (t === 'today') return isoDay(d);
  if (t === 'yesterday') { d.setDate(d.getDate() - 1); return isoDay(d); }
  if (t === 'tomorrow') { d.setDate(d.getDate() + 1); return isoDay(d); }
  const m = t.match(/^(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?$/);
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : d.getFullYear();
    const dt = new Date(y, Number(m[2]) - 1, Number(m[1]));
    return Number.isNaN(dt.getTime()) ? undefined : isoDay(dt);
  }
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? undefined : isoDay(new Date(parsed));
}

export function parseMoneyText(text: string, fallbackCurrency: string): MoneyValue | undefined {
  const m = text.match(MONEY_IN);
  if (!m) return undefined;
  const raw = m[1] ?? m[3];
  if (!raw) return undefined;
  const scale = SCALE[(m[2] ?? m[4] ?? '').toLowerCase()] ?? 1;
  const cur = CURRENCY_OF.find(([re]) => re.test(m[0]))?.[1] ?? fallbackCurrency;
  return { amount: num(raw) * scale, currency: cur };
}

export function parseDurationText(text: string): number | undefined {
  const t = text.toLowerCase();
  let mins = 0;
  let hit = false;
  const h = t.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/);
  const m = t.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (h) { mins += Number(h[1]) * 60; hit = true; }
  if (m) { mins += Number(m[1]); hit = true; }
  return hit ? Math.round(mins) : undefined;
}

function formatDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function opt(field: Field) {
  const vals = (field.options ?? []).map((o) => o.value);
  return vals.length ? z.enum(vals as [string, ...string[]]) : z.string();
}

function maybe<T extends ZodTypeAny>(field: Field, s: T) {
  return field.required ? s : s.optional().nullable();
}

const defs: { [K in FieldType]: FieldTypeDef } = {
  text: {
    type: 'text',
    parse: (t) => (t.trim() ? t.trim() : undefined),
    format: (v) => String(v ?? ''),
    query: { ops: TEXT_OPS, aggregate: ['count'] },
    zod: (f) => maybe(f, z.string()),
  },
  longtext: {
    type: 'longtext',
    parse: (t) => (t.trim() ? t : undefined),
    format: (v) => String(v ?? ''),
    query: { ops: ['contains', 'isNull', 'notNull'] },
    zod: (f) => maybe(f, z.string()),
  },
  number: {
    type: 'number',
    parse: (t) => { const m = t.match(NUMBER_IN); return m ? num(m[0]) : undefined; },
    format: (v, f, fmt) => (v == null ? '' : `${fmt.number(v as number)}${f.unit ? ` ${f.unit}` : ''}`),
    query: { ops: ORDER_OPS, aggregate: ['sum', 'avg', 'min', 'max', 'count'], buckets: true },
    zod: (f) => maybe(f, z.number()),
  },
  money: {
    type: 'money',
    parse: (t, _f, ctx) => parseMoneyText(t, ctx.currency),
    format: (v, _f, fmt) => {
      if (v == null) return '';
      if (typeof v === 'number') return fmt.currency(v);
      const m = v as MoneyValue;
      return fmt.currency(m.amount, m.currency);
    },
    query: { ops: ORDER_OPS, aggregate: ['sum', 'avg', 'min', 'max', 'count'], buckets: true },
    zod: (f) => maybe(f, z.number()),
  },
  date: {
    type: 'date',
    parse: (t, _f, ctx) => parseDateText(t, ctx.now),
    format: (v, _f, fmt) => (v == null ? '' : fmt.date(v as string, 'medium')),
    query: { ops: ORDER_OPS, aggregate: ['min', 'max', 'count'], buckets: true },
    zod: (f) => maybe(f, z.string().regex(ISO_DAY)),
  },
  datetime: {
    type: 'datetime',
    parse: (t) => { const p = Date.parse(t); return Number.isNaN(p) ? undefined : p; },
    format: (v, _f, fmt) => (v == null ? '' : fmt.dateTime(v as number)),
    query: { ops: ORDER_OPS, aggregate: ['min', 'max', 'count'], buckets: true },
    zod: (f) => maybe(f, z.union([z.number(), z.string()])),
  },
  duration: {
    type: 'duration',
    parse: (t) => parseDurationText(t),
    format: (v) => (v == null ? '' : formatDuration(v as number)),
    query: { ops: ORDER_OPS, aggregate: ['sum', 'avg', 'min', 'max', 'count'] },
    zod: (f) => maybe(f, z.number().nonnegative()),
  },
  select: {
    type: 'select',
    parse: (t, f) => {
      const s = t.trim().toLowerCase();
      return f.options?.find((o) => o.value.toLowerCase() === s || o.label.toLowerCase() === s)?.value;
    },
    format: (v, f) => (v == null ? '' : f.options?.find((o) => o.value === v)?.label ?? String(v)),
    query: { ops: PICK_OPS, aggregate: ['count'] },
    zod: (f) => maybe(f, f.onCreateOption ? z.string() : opt(f)),
  },
  multiselect: {
    type: 'multiselect',
    parse: (t, f) => {
      const vals = t.split(/[,;]/).map((s) => defs.select.parse(s, f, { currency: 'INR', now: 0 }) as string | undefined).filter((x): x is string => !!x);
      return vals.length ? vals : undefined;
    },
    format: (v, f) => (Array.isArray(v) ? v.map((x) => defs.select.format(x, f, undefined as unknown as Formatters)).join(', ') : ''),
    query: { ops: ['in', 'notIn', 'contains', 'isNull', 'notNull'], aggregate: ['count'] },
    zod: (f) => maybe(f, z.array(f.onCreateOption ? z.string() : opt(f))),
  },
  boolean: {
    type: 'boolean',
    parse: (t) => (/^(yes|true|done|y|1)$/i.test(t.trim()) ? true : /^(no|false|n|0)$/i.test(t.trim()) ? false : undefined),
    format: (v) => (v ? 'Yes' : 'No'),
    query: { ops: ['eq', 'neq'], aggregate: ['count'] },
    zod: (f) => maybe(f, z.boolean()),
  },
  link: {
    type: 'link',
    parse: () => undefined, // identity resolution is filing's job, not a text parse
    format: (v) => (v == null ? '' : String(v)),
    query: { ops: ['eq', 'neq', 'in', 'notIn', 'isNull', 'notNull', 'relatedTo'], aggregate: ['count'] },
    zod: (f) => maybe(f, z.string()),
  },
  contact: {
    type: 'contact',
    parse: (t, f) => {
      const s = t.trim();
      if (f.contactKind === 'email' || !f.contactKind) { if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return s; }
      if (f.contactKind === 'url' || !f.contactKind) { if (/^https?:\/\//i.test(s)) return s; }
      if (f.contactKind === 'phone' || !f.contactKind) { if (/^\+?[\d\s()-]{7,}$/.test(s)) return s.replace(/[\s()-]/g, ''); }
      return undefined;
    },
    format: (v) => (v == null ? '' : String(v)),
    query: { ops: TEXT_OPS },
    zod: (f) => maybe(f, z.string()),
  },
  file: {
    type: 'file',
    parse: () => undefined,
    format: (v) => (v == null ? '' : (v as FileValue).name ?? 'File'),
    query: { ops: ['isNull', 'notNull'] },
    zod: (f) => maybe(f, z.object({ uri: z.string(), name: z.string().optional(), mime: z.string().optional() })),
  },
  location: {
    type: 'location',
    parse: (t) => {
      const m = t.match(/(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/);
      return m ? { lat: Number(m[1]), lng: Number(m[2]) } : undefined;
    },
    format: (v) => (v == null ? '' : (v as LocationValue).label ?? `${(v as LocationValue).lat.toFixed(4)}, ${(v as LocationValue).lng.toFixed(4)}`),
    query: { ops: ['isNull', 'notNull'] },
    zod: (f) => maybe(f, z.object({ lat: z.number(), lng: z.number(), label: z.string().optional() })),
  },
  meter: {
    type: 'meter',
    parse: (t) => { const m = t.match(NUMBER_IN); return m ? num(m[0]) : undefined; },
    format: (v, f, fmt) => (v == null ? '' : `${fmt.number(typeof v === 'number' ? v : (v as MeterValue).value)}${f.unit ? ` ${f.unit}` : ''}`),
    query: { ops: ORDER_OPS, aggregate: ['max', 'min', 'count'], buckets: true },
    zod: (f) => maybe(f, z.number()),
  },
};

export const fieldTypes: Readonly<{ [K in FieldType]: FieldTypeDef }> = defs;

export function fieldType(type: FieldType): FieldTypeDef {
  const d = defs[type];
  if (!d) throw new Error(`Unknown field type "${type}"`);
  return d;
}

/** The zod object for a set of Fields (an Object's schema, unless the module refines it). */
export function schemaFor(fields: Field[]): z.ZodObject<Record<string, ZodTypeAny>> {
  const shape: Record<string, ZodTypeAny> = {};
  for (const f of fields) shape[f.key] = fieldType(f.type).zod(f);
  return z.object(shape).passthrough();
}

/** Names of the old field types and what they became (R0 migration aid; remove after stage E). */
export const LEGACY_FIELD_TYPE: Record<string, FieldType | null> = {
  currency: 'money',
  relation: 'link',
  json: null,
};
