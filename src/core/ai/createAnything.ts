import { z } from 'zod';
import type { LifeOSContext } from '../registry/context';
import type { AiToolDef } from '../registry/types';
import type { ObjectDef, FieldDef } from '../domain/types';
import { withExtras, type ReplyCard } from './cards';
import { clearMatch, resolveCandidates } from './lifeTools';
import { parseAmount } from './parser';

/**
 * "Create anything from a sentence" (PRODUCT v4 §2): the agent sends what it
 * knows and the rest gets sensible defaults, so no sentence dies on a missing
 * required field. Everything stays editable afterwards.
 */

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** "2026-10-01" stays; "today" / "yesterday" / "in 2 years" / "2 years" / "3 months from now" → ISO day. */
export function parseDateish(v: unknown, from = new Date()): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return isoDay(new Date(v));
  if (typeof v !== 'string') return undefined;
  const s = v.trim().toLowerCase();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (s === 'today' || s === 'now') return isoDay(from);
  if (s === 'yesterday') return isoDay(new Date(from.getTime() - 86400000));
  if (s === 'tomorrow') return isoDay(new Date(from.getTime() + 86400000));
  const m = /^(?:in\s+|\+)?(\d+(?:\.\d+)?|a|an|one|two|three|six)\s*(d|days?|w|weeks?|m|months?|y|yrs?|years?)(?:\s+from\s+now)?$/.exec(s);
  if (m) {
    const words: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, six: 6 };
    const n = words[m[1]!] ?? Number(m[1]);
    const d = new Date(from);
    const u = m[2]![0];
    if (u === 'd') d.setDate(d.getDate() + n);
    else if (u === 'w') d.setDate(d.getDate() + 7 * n);
    else if (u === 'm') d.setMonth(d.getMonth() + n);
    else d.setFullYear(d.getFullYear() + n);
    return isoDay(d);
  }
  const dm = dayMonth(s, from);
  if (dm) return dm;
  const t = Date.parse(v);
  return Number.isFinite(t) ? isoDay(new Date(t)) : undefined;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
/** "8 sept" / "8th of september 2025" / "sept 8" / "september 8th, 2025" / "8/9" (day first). No year → this year. */
function dayMonth(s: string, from: Date): string | undefined {
  const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?';
  let m = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+of)?\\s+${mon}(?:,?\\s+(\\d{4}))?$`).exec(s);
  let day: number | undefined, month: number | undefined, year: number | undefined;
  if (m) [day, month, year] = [Number(m[1]), MONTHS.indexOf(m[2]!.slice(0, 3)), m[3] ? Number(m[3]) : undefined];
  else if ((m = new RegExp(`^${mon}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?$`).exec(s))) [month, day, year] = [MONTHS.indexOf(m[1]!.slice(0, 3)), Number(m[2]), m[3] ? Number(m[3]) : undefined];
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/.exec(s))) [day, month, year] = [Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : undefined];
  if (day == null || month == null || month < 0 || month > 11 || day < 1 || day > 31) return undefined;
  return isoDay(new Date(year ?? from.getFullYear(), month, day));
}

const empty = (v: unknown) => v === undefined || v === null || v === '';

export function coerce(f: FieldDef, v: unknown): unknown {
  if (empty(v)) return v;
  switch (f.type) {
    case 'number':
    case 'currency':
      return typeof v === 'number' ? v : typeof v === 'string' ? (parseAmount(v) ?? (Number.isFinite(Number(v)) ? Number(v) : v)) : v;
    case 'date':
      return parseDateish(v) ?? v;
    case 'datetime':
      return typeof v === 'string' && !/^\d+$/.test(v) ? (Number.isFinite(Date.parse(v)) ? Date.parse(v) : v) : v;
    case 'select': {
      const s = String(v).toLowerCase();
      return f.options?.find((o) => o.value.toLowerCase() === s || o.label.toLowerCase() === s)?.value ?? v;
    }
    case 'boolean':
      return typeof v === 'string' ? /^(y|yes|true|1)$/i.test(v) : v;
    default:
      return v;
  }
}

/** Fill required fields the sentence didn't give, and coerce "32k" / "2 years" / "Electronics" into field values. */
export function fillDefaults(def: ObjectDef, data: Record<string, unknown>, title?: string): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const f of def.fields) {
    out[f.key] = coerce(f, out[f.key]);
    if (!empty(out[f.key])) continue;
    if (f.defaultValue !== undefined) {
      out[f.key] = typeof f.defaultValue === 'function' ? (f.defaultValue as () => unknown)() : f.defaultValue;
      continue;
    }
    if (!f.required) continue;
    if (f.type === 'text' || f.type === 'longtext') out[f.key] = title?.trim() || def.label;
    else if (f.type === 'date') out[f.key] = isoDay(new Date());
    else if (f.type === 'datetime') out[f.key] = Date.now();
    else if (f.type === 'select' && f.options?.length) out[f.key] = (f.options.find((o) => o.value === 'other') ?? f.options[0]!).value;
    else if (f.type === 'boolean') out[f.key] = false;
  }
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

const personCard = (os: LifeOSContext, id: string): ReplyCard => {
  const e = os.records.get(id)!;
  const d = e.data as { company?: string; role?: string };
  return { kind: 'record', entityId: id, type: 'person', title: e.title, subtitle: [d.role, d.company].filter(Boolean).join(' · ') || e.subtitle, icon: 'user' };
};

export const createAnythingTools: AiToolDef[] = [
  {
    name: 'create_person_from_mention',
    description:
      'A person mentioned in passing ("made a new friend today, Karan, works at Zomato, met at the gym"). Creates the Person (or fills in an existing one with the same name) with company/role/relationship, and remembers where and when you met as a fact on them.',
    input: z.object({
      name: z.string(),
      company: z.string().optional(),
      role: z.string().optional(),
      relationship: z.string().optional().describe('friend | family | colleague | client | vendor | acquaintance'),
      city: z.string().optional(),
      whereMet: z.string().optional().describe('e.g. "the gym"'),
      metOn: z.string().optional().describe('ISO date; default today'),
      note: z.string().optional(),
    }),
    confirm: true,
    describe: (i: { name: string; company?: string }) => `Add ${i.name}${i.company ? ` (${i.company})` : ''} to People`,
    run: async (input, os) => {
      const i = input as { name: string; company?: string; role?: string; relationship?: string; city?: string; whereMet?: string; metOn?: string; note?: string };
      const def = os.registry.objects.get('person');
      if (!def) return { error: 'People module is not installed' };
      const name = i.name.trim().replace(/\b\w/g, (c) => c.toUpperCase());
      const existing = clearMatch(resolveCandidates(os, name, ['person']).filter((c) => c.score >= 0.95));
      const patch = Object.fromEntries(Object.entries({ company: i.company, role: i.role, relationship: i.relationship ?? (i.whereMet ? 'friend' : undefined), city: i.city, notes: i.note }).filter(([, v]) => !empty(v)));
      let id: string;
      let created = false;
      let filled: Record<string, unknown> = {};
      if (existing) {
        const e = os.records.get(existing.id)!;
        const before = e.data as Record<string, unknown>;
        const fill = Object.fromEntries(Object.entries(patch).filter(([k]) => empty(before[k])));
        filled = Object.fromEntries(Object.keys(fill).map((k) => [k, before[k]]));
        if (Object.keys(fill).length) os.records.update(e.id, { data: fill }, 'assistant');
        id = e.id;
      } else {
        id = os.records.create({ object: 'person', title: name, data: fillDefaults(def, patch, name) }, 'assistant').id;
        created = true;
      }
      const day = parseDateish(i.metOn) ?? isoDay(new Date());
      const fact = i.whereMet ? os.facts.add({ text: `Met ${name} at ${i.whereMet.replace(/^at\s+/i, '')} on ${day}`, subjectId: id, source: 'talk', statedAt: Date.parse(day) || Date.now() }) : null;
      const undo = () => {
        if (fact) os.facts.forget(fact.id);
        if (created) os.records.delete(id, 'user');
        else if (Object.keys(filled).length) os.records.update(id, { data: filled }, 'user');
      };
      return withExtras({ id, title: name, created, factId: fact?.id ?? null }, { undo, card: personCard(os, id) });
    },
  },
  {
    name: 'suggest_cycle',
    description:
      'Put a recurring or one-off due date on a record: keep in touch with a person every N days, a warranty that ends, a renewal (insurance, licence, domain), or any repeat. For warranty/renewal give `until` (ISO date or "2 years").',
    input: z.object({
      id: z.string(),
      kind: z.enum(['keep_in_touch', 'warranty', 'renewal', 'repeat']),
      everyN: z.number().int().positive().optional(),
      everyUnit: z.enum(['day', 'week', 'month', 'year']).optional(),
      until: z.string().optional(),
      name: z.string().optional(),
    }),
    run: async (input, os) => {
      const i = input as { id: string; kind: 'keep_in_touch' | 'warranty' | 'renewal' | 'repeat'; everyN?: number; everyUnit?: 'day' | 'week' | 'month' | 'year'; until?: string; name?: string };
      const e = os.records.get(i.id);
      if (!e) return { error: 'record not found' };
      const data = e.data as Record<string, unknown>;
      const days = (i.everyN ?? 30) * ({ day: 1, week: 7, month: 30, year: 365 } as const)[i.everyUnit ?? 'day'];
      const until = parseDateish(i.until);
      // Types that own the field get it through their cycle template, so the record page and the cycle agree.
      if (i.kind === 'keep_in_touch' && e.object === 'person') {
        os.records.update(e.id, { data: { contactEvery: days } }, 'assistant');
        return withExtras({ ok: true, cycle: `Keep in touch every ${days} days` }, { undo: () => os.records.update(e.id, { data: { contactEvery: data.contactEvery } }, 'user') });
      }
      if (i.kind === 'warranty' && e.object === 'asset' && until) {
        os.records.update(e.id, { data: { warrantyUntil: until } }, 'assistant');
        return withExtras({ ok: true, cycle: `Warranty until ${until}` }, { undo: () => os.records.update(e.id, { data: { warrantyUntil: data.warrantyUntil } }, 'user') });
      }
      const name = i.name ?? { keep_in_touch: 'Keep in touch', warranty: 'Warranty ends', renewal: 'Renewal', repeat: 'Repeat' }[i.kind];
      const c = until && i.kind !== 'repeat'
        ? os.cycles.create({ entityId: e.id, name, kind: 'fixed', nextDueAt: Date.parse(until), leadDays: i.kind === 'warranty' ? 30 : 14, everyN: i.kind === 'renewal' ? (i.everyN ?? 1) : null, everyUnit: i.kind === 'renewal' ? (i.everyUnit ?? 'year') : null }, 'assistant')
        : os.cycles.create({ entityId: e.id, name, kind: 'interval', everyN: i.everyN ?? 1, everyUnit: i.everyUnit ?? 'month', lastDoneAt: Date.now() }, 'assistant');
      return withExtras({ ok: true, cycleId: c.id, cycle: name }, { undo: () => os.cycles.remove(c.id) });
    },
  },
];
