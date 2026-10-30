import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { phoneKey } from '@core/identity';
import { BUILTIN_RELATIONSHIPS, addRelationship, customRelationships } from '../relationships';
import { birthdayIso, birthdayParts, CADENCES, listItems, type PersonData } from '../types';
import { CONTACT_OBJECTS, happenedAt } from '../lastSpoke';
import type { NotionBlock, NotionDataSource, NotionPage, RichText } from './client';

/**
 * The mapping between a Notion page and a Person (docs/MODEL.md layer 4, the
 * table agreed 24 Oct; R2b). Each Field has: its value on the page, its value
 * on the Person (both as plain text, "raw"), a normal form to compare them,
 * how to write it to the Person, and how to write it to the page.
 */

export const PROP = {
  name: 'Name',
  associations: 'Associations',
  birthday: 'Birthday',
  lastContacted: 'Last Contacted',
  lastUpdate: 'Last Update?',
  status: 'Status',
  phone: 'Phone',
  email: 'Email',
  upi: 'UPI IDs',
  relationship: 'Relationship',
  worksAt: 'Works at',
  role: 'Role',
  city: 'City',
  keepInTouch: 'Keep in touch',
  balance: 'Balance',
  lifeosId: 'LifeOS id',
} as const;

/** Keep in touch on the page ↔ the cadence in days. */
export const KEEP_IN_TOUCH: Array<{ name: string; value: string | null }> = [
  { name: 'Off', value: null },
  { name: 'Week', value: '7' },
  { name: '2 weeks', value: '14' },
  { name: 'Month', value: '30' },
  { name: '3 months', value: '91' },
  { name: '6 months', value: '182' },
  { name: 'Year', value: '365' },
];

/** The columns LifeOS adds to the copy once (your columns and views stay). */
export const NEW_PROPERTIES: Record<string, Record<string, unknown>> = {
  [PROP.phone]: { phone_number: {} },
  [PROP.email]: { email: {} },
  [PROP.upi]: { rich_text: {} },
  [PROP.relationship]: { select: { options: BUILTIN_RELATIONSHIPS.map((o) => ({ name: o.label })) } },
  [PROP.worksAt]: { rich_text: {} },
  [PROP.role]: { rich_text: {} },
  [PROP.city]: { rich_text: {} },
  [PROP.keepInTouch]: { select: { options: KEEP_IN_TOUCH.map((k) => ({ name: k.name })) } },
  [PROP.balance]: { number: { format: 'rupee' } },
  [PROP.lifeosId]: { rich_text: {} },
};

/** The Fields kept in step by "newest edit wins" (Last Contacted, Last Update?, Balance and LifeOS id have rules of their own). */
export const KEYS = ['name', 'birthday', 'tags', 'likes', 'phone', 'email', 'upi', 'relationship', 'worksAt', 'role', 'city', 'keepInTouch'] as const;
export type Key = (typeof KEYS)[number];

export const KEY_LABEL: Record<Key, string> = { name: 'Name', birthday: 'Birthday', tags: 'Associations', likes: 'Likes', phone: 'Phone', email: 'Email', upi: 'UPI IDs', relationship: 'Relationship', worksAt: 'Works at', role: 'Role', city: 'City', keepInTouch: 'Keep in touch' };

/** The page property each Key lives in (Likes lives in the page body). */
const KEY_PROP: Record<Exclude<Key, 'likes'>, string> = { name: PROP.name, birthday: PROP.birthday, tags: PROP.associations, phone: PROP.phone, email: PROP.email, upi: PROP.upi, relationship: PROP.relationship, worksAt: PROP.worksAt, role: PROP.role, city: PROP.city, keepInTouch: PROP.keepInTouch };
export const propOf = (k: Key): string | null => (k === 'likes' ? null : KEY_PROP[k]);

/** Person data keys whose change means the page needs to hear about it. */
export const MAPPED_CHANGES = new Set(['title', 'data.phone', 'data.email', 'data.upi', 'data.relationship', 'data.birthday', 'data.worksAtId', 'data.company', 'data.role', 'data.livesInId', 'data.city', 'data.contactEvery', 'data.lastContactAt', 'data.likes', 'data.notionId']);

/* ------------------------------------------------------------------ */
/* Reading a page                                                      */
/* ------------------------------------------------------------------ */

export const plain = (rt: RichText[] | undefined | null) => (rt ?? []).map((t) => t.plain_text ?? t.text?.content ?? '').join('');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** A property's value as text (multi-select: names joined by ", "; number: as a string). */
export function propText(page: NotionPage, name: string): string {
  const p = page.properties?.[name] as Record<string, unknown> | undefined;
  if (!p) return '';
  const type = (p.type as string | undefined) ?? Object.keys(p).find((k) => k !== 'id' && k !== 'type') ?? '';
  const v = p[type];
  switch (type) {
    case 'title':
    case 'rich_text':
      return squash(plain(v as RichText[]));
    case 'date':
      return ((v as { start?: string } | null)?.start ?? '').slice(0, 10);
    case 'select':
    case 'status':
      return (v as { name?: string } | null)?.name ?? '';
    case 'multi_select':
      return ((v as Array<{ name: string }> | null) ?? []).map((o) => o.name).join(', ');
    case 'phone_number':
    case 'email':
    case 'url':
      return typeof v === 'string' ? v.trim() : '';
    case 'number':
      return typeof v === 'number' ? String(v) : '';
    default:
      return '';
  }
}

export const propNumber = (page: NotionPage, name: string): number | null => {
  const v = (page.properties?.[name] as { number?: unknown } | undefined)?.number;
  return typeof v === 'number' ? v : null;
};

export const multiNames = (page: NotionPage, name: string): string[] => (((page.properties?.[name] as { multi_select?: Array<{ name: string }> } | undefined)?.multi_select ?? []).map((o) => o.name.trim()).filter(Boolean));

/** One section of the page body: a heading and what follows it, up to the next heading. */
export interface Section {
  title: string;
  heading: NotionBlock | null;
  blocks: NotionBlock[];
}

export const sectionKey = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const LIKES = 'likes';
export const LIFE_UPDATES = 'life updates';
export const LOG = 'lifeos log';

const isHeading = (b: NotionBlock) => /^heading_\d$/.test(b.type);
export const blockText = (b: NotionBlock) => squash(plain(((b[b.type] as { rich_text?: RichText[] } | undefined)?.rich_text) ?? []));
export const isBullet = (b: NotionBlock) => b.type === 'bulleted_list_item' || b.type === 'numbered_list_item';

/** The page body split at its headings (blocks before the first heading are a section with no title). */
export function sections(blocks: NotionBlock[]): Section[] {
  const out: Section[] = [{ title: '', heading: null, blocks: [] }];
  for (const b of blocks) {
    if (b.in_trash) continue;
    if (isHeading(b)) out.push({ title: blockText(b), heading: b, blocks: [] });
    else out[out.length - 1]!.blocks.push(b);
  }
  return out;
}

export const findSection = (all: Section[], key: string) => all.find((s) => s.heading && sectionKey(s.title) === key) ?? null;

/** A like as one list item: commas would split it, so they become semicolons. */
const asLike = (s: string) => s.replace(/,/g, ';').trim();

/** The Likes section's bullets, as the likes list ("filter coffee, pottery"). */
export const likesFromBody = (all: Section[]) => (findSection(all, LIKES)?.blocks ?? []).filter(isBullet).map(blockText).map(asLike).filter(Boolean).join(', ');

/* ------------------------------------------------------------------ */
/* Values on each side                                                 */
/* ------------------------------------------------------------------ */

export type Raw = Partial<Record<Key, string>>;

const mmdd = (iso: string) => {
  const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[1]}-${m[2]}` : '';
};

const relOptions = (os: LifeOSContext) => [...BUILTIN_RELATIONSHIPS, ...customRelationships(os)];
const keepName = (v: string | undefined) => KEEP_IN_TOUCH.find((k) => k.value === (v ?? null) && k.value)?.name ?? '';

/** The page's values (Likes from its body). */
export function notionValues(page: NotionPage, body: Section[]): Raw {
  const keep = propText(page, PROP.keepInTouch);
  return {
    name: propText(page, PROP.name),
    birthday: mmdd(propText(page, PROP.birthday)),
    tags: multiNames(page, PROP.associations).join(', '),
    likes: likesFromBody(body),
    phone: propText(page, PROP.phone),
    email: propText(page, PROP.email),
    upi: propText(page, PROP.upi),
    relationship: propText(page, PROP.relationship),
    worksAt: propText(page, PROP.worksAt),
    role: propText(page, PROP.role),
    city: propText(page, PROP.city),
    keepInTouch: keep.toLowerCase() === 'off' ? '' : keep,
  };
}

/** The Person's values, in the page's words (a relationship's label, Keep in touch's option name). */
export function lifeValues(os: LifeOSContext, p: ObjectRecord<PersonData>): Raw {
  const d = p.data;
  const org = d.worksAtId ? os.records.get(d.worksAtId)?.title : undefined;
  const place = d.livesInId ? os.records.get(d.livesInId)?.title : undefined;
  return {
    name: p.title,
    birthday: d.birthday ? mmdd(d.birthday) : '',
    tags: os.tags.forEntity(p.id).map((t) => t.name).join(', '),
    likes: listItems(d.likes).join(', '),
    phone: d.phone ?? '',
    email: d.email ?? '',
    upi: listItems(d.upi).join(', '),
    relationship: d.relationship ? relOptions(os).find((o) => o.value === d.relationship)?.label ?? d.relationship : '',
    worksAt: d.company?.trim() || org || '',
    role: d.role ?? '',
    city: d.city?.trim() || place || '',
    keepInTouch: keepName(d.contactEvery),
  };
}

const sortedList = (s: string) => listItems(s).map((x) => x.toLowerCase()).sort().join(', ');

/** The form two values are compared in: same normal form, same value. */
export function norm(k: Key, raw: string | undefined): string {
  const v = squash(raw ?? '');
  switch (k) {
    case 'name':
    case 'birthday':
      return v;
    case 'tags':
    case 'likes':
    case 'upi':
      return sortedList(v);
    case 'phone':
      return phoneKey(v).length >= 8 ? phoneKey(v) : v.toLowerCase();
    default:
      return v.toLowerCase();
  }
}

/* ------------------------------------------------------------------ */
/* Writing to the Person                                               */
/* ------------------------------------------------------------------ */

/** Write one page value to the Person (the caller decides whether that is an echo). */
export function applyKey(os: LifeOSContext, personId: string, k: Key, raw: string, actor: 'system' | 'user' = 'system'): void {
  const p = os.records.get<PersonData>(personId);
  if (!p) return;
  const v = squash(raw);
  const set = (data: Partial<PersonData>) => os.records.update<PersonData>(personId, { data }, actor);
  switch (k) {
    case 'name':
      if (v) os.records.update(personId, { title: v }, actor);
      return;
    case 'birthday': {
      const m = /^(\d{2})-(\d{2})$/.exec(v);
      // Notion's year is a placeholder: kept as no year, unless LifeOS already knows it.
      const year = birthdayParts(p.data.birthday)?.year ?? null;
      return void set({ birthday: m ? birthdayIso(Number(m[1]), Number(m[2]), year) : undefined });
    }
    case 'tags':
      return setTags(os, personId, listItems(v), actor);
    case 'likes':
      return void set({ likes: listItems(v).join(', ') || undefined });
    case 'upi':
      return void set({ upi: listItems(v).join(', ') || undefined });
    case 'relationship':
      return void set({ relationship: v ? relationshipValue(os, v) : undefined });
    case 'worksAt':
      return void set({ company: v || undefined });
    case 'keepInTouch': {
      const c = KEEP_IN_TOUCH.find((x) => x.name.toLowerCase() === v.toLowerCase())?.value ?? CADENCES.find((x) => x.label.toLowerCase() === v.toLowerCase())?.value;
      return void set({ contactEvery: c ?? undefined });
    }
    default:
      return void set({ [k]: v || undefined } as Partial<PersonData>);
  }
}

/** A relationship label from the page → its value; one LifeOS doesn't have is added (with a colour). */
export function relationshipValue(os: LifeOSContext, label: string): string | undefined {
  const l = label.trim().toLowerCase();
  const hit = relOptions(os).find((o) => o.label.toLowerCase() === l || o.value === l);
  return hit?.value ?? addRelationship(os, label)?.value;
}

/** Two lists as one, each item once (ignoring case), the first list's order first. */
export function mergeLists(a: string, b: string): string {
  const out = new Map<string, string>();
  for (const x of [...listItems(a), ...listItems(b)]) if (!out.has(x.toLowerCase())) out.set(x.toLowerCase(), x);
  return [...out.values()].join(', ');
}

/** Tags, one per association, keeping the page's spelling for new ones. */
export function setTags(os: LifeOSContext, personId: string, names: string[], actor: 'system' | 'user' = 'system'): void {
  const want = new Map<string, string>(names.map((n) => n.trim().replace(/^#/, '')).filter(Boolean).map((n) => [n.toLowerCase(), n] as [string, string]));
  const current = os.tags.forEntity(personId);
  for (const t of current) if (!want.has(t.name.toLowerCase())) os.tags.remove(personId, t.id);
  for (const [k, name] of want) if (!current.some((t) => t.name.toLowerCase() === k)) os.tags.apply(personId, name, actor);
}

/** Relationship, filled once where it is plain (Family / Extended Family → family, Girlfriend → partner, Colleague → colleague, Friend / Inner Circle → friend). */
export function relationshipFromAssociations(names: string[]): string | null {
  const has = new Set(names.map((n) => n.trim().toLowerCase()));
  if (has.has('family') || has.has('extended family')) return 'family';
  if (has.has('girlfriend')) return 'partner';
  if (has.has('colleague')) return 'colleague';
  if (has.has('friend') || has.has('inner circle')) return 'friend';
  return null;
}

/* ------------------------------------------------------------------ */
/* Writing to the page                                                 */
/* ------------------------------------------------------------------ */

const text = (s: string) => [{ type: 'text', text: { content: s.slice(0, 2000) } }];

const pad = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The next birthday's date (today counts), as you keep it in Notion now. */
export function nextOccurrence(mmddValue: string, now = new Date()): string | null {
  const m = /^(\d{2})-(\d{2})$/.exec(mmddValue);
  if (!m) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const next = new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]));
  if (next < today) next.setFullYear(now.getFullYear() + 1);
  return isoDay(next);
}

/**
 * A value as the property's own type wants it (by the copy's schema, so a
 * column you made a select stays a select). Formulas and the like are never written.
 */
export function propValue(type: string, raw: string | number | null, options: { names?: string[] } = {}): Record<string, unknown> | null {
  const s = raw == null ? '' : String(raw).trim();
  switch (type) {
    case 'title':
      return { title: text(s) };
    case 'rich_text':
      return { rich_text: s ? text(s) : [] };
    case 'phone_number':
      return { phone_number: s || null };
    case 'email':
      return { email: s || null };
    case 'url':
      return { url: s || null };
    case 'number': {
      const n = typeof raw === 'number' ? raw : Number(s);
      return { number: s === '' || !Number.isFinite(n) ? null : n };
    }
    case 'date':
      return { date: s ? { start: s } : null };
    case 'select':
      return { select: s ? { name: s.replace(/,/g, ' ').slice(0, 100) } : null };
    case 'multi_select': {
      const known = new Map((options.names ?? []).map((n) => [n.toLowerCase(), n]));
      return { multi_select: listItems(s).map((n) => ({ name: known.get(n.toLowerCase()) ?? n.replace(/,/g, ' ').slice(0, 100) })) };
    }
    default:
      return null;
  }
}

/** The property for one Key, from the Person's raw value, by the copy's schema; null when the copy has no such column. */
export function keyProperty(schema: NotionDataSource, k: Key, raw: string, now = new Date()): [string, Record<string, unknown>] | null {
  const name = propOf(k);
  if (!name) return null;
  const def = schema.properties[name];
  if (!def) return null;
  let v: string | null = raw;
  if (k === 'birthday') v = nextOccurrence(raw, now);
  if (k === 'keepInTouch') v = raw || 'Off';
  const options = def.type === 'multi_select' ? ((def.multi_select as { options?: Array<{ name: string }> } | undefined)?.options ?? []).map((o) => o.name) : undefined;
  const value = propValue(def.type, v, { names: options });
  return value ? [name, value] : null;
}

/** A property by name, if the copy has it (a typed value). */
export function namedProperty(schema: NotionDataSource, name: string, raw: string | number | null): [string, Record<string, unknown>] | null {
  const def = schema.properties[name];
  if (!def) return null;
  const value = propValue(def.type, raw);
  return value ? [name, value] : null;
}

/* Blocks -------------------------------------------------------------- */

export const heading2 = (s: string) => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: text(s) } });
export const heading3 = (s: string) => ({ object: 'block', type: 'heading_3', heading_3: { rich_text: text(s) } });
export const divider = () => ({ object: 'block', type: 'divider', divider: {} });
export const bullet = (s: string) => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: text(s) } });

/** The template every page in the database is made from, for a page LifeOS makes. */
export function templateBlocks(likes: string[]): unknown[] {
  return [
    heading2('Basic Deets'),
    divider(),
    heading3('How do I know them/First Met'),
    divider(),
    heading2('Address'),
    divider(),
    heading2('Family members'),
    divider(),
    heading2('Likes'),
    divider(),
    ...likes.map(bullet),
    heading2('Gift ideas'),
    divider(),
    heading2('About them'),
    divider(),
    heading2('Life Updates'),
    divider(),
    heading2('Lore'),
    divider(),
    heading2('LifeOS log'),
    divider(),
  ];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "30 Oct" (with the year when it isn't this one). */
export function dayLabel(at: number, now = Date.now()): string {
  const d = new Date(at);
  const y = new Date(now).getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === y ? '' : ` ${d.getFullYear()}`}`;
}

/** A Fact said in LifeOS, as a Life Updates bullet: "30 Oct · Moved to Pune". */
export const factBullet = (textValue: string, at: number, now = Date.now()) => `${dayLabel(at, now)} · ${textValue}`;
/** The "30 Oct · " a Life Updates bullet starts with. */
export const stripDay = (s: string) => s.replace(/^\d{1,2} [A-Z][a-z]{2}( \d{4})? · /, '');

/* The LifeOS log ------------------------------------------------------ */

export interface LogLine {
  key: string;
  at: number;
  text: string;
}

/** The timeline as the page's LifeOS log: calls, meetings and payments, oldest first. */
export function logLines(os: LifeOSContext, personId: string, now = Date.now()): LogLine[] {
  const out: LogLine[] = [];
  for (const e of os.records.timeline.forEntity(personId, 1000)) {
    if (e.kind === 'call' && e.occurredAt <= now) out.push({ key: `call:${e.id}`, at: e.occurredAt, text: `${dayLabel(e.occurredAt, now)} · ${e.title}` });
  }
  for (const l of os.links.forEntity(personId)) {
    if (!CONTACT_OBJECTS.has(l.other.object) || (l.relation.confidence ?? 1) < 0.9) continue;
    const r = os.records.get<{ amount?: number; kind?: string }>(l.other.id);
    const at = r ? happenedAt(r) : null;
    if (!r || at == null || at > now) continue;
    const what = r.object === 'transaction' ? `${r.data.kind === 'income' ? 'Got' : 'Paid'} ${os.format.currency(Number(r.data.amount ?? 0))} · ${r.title}` : r.title;
    out.push({ key: `rec:${r.id}`, at, text: `${dayLabel(at, now)} · ${what}` });
  }
  return out.sort((a, b) => a.at - b.at);
}
