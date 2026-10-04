import { categoryFor } from '../ingest/ingest';
import { z } from 'zod';
import type { ObjectDef, Field } from '../domain/types';
import type { LifeOSContext } from '../registry/context';
import type { AiToolDef } from '../registry/types';
import { coerce, parseDateish } from '../ai/createAnything';
import { resolveCandidates } from '../ai/lifeTools';
import { parseAmount } from '../ai/parser';
import { EDGE_WORDS, SYMMETRIC_EDGES, type Provenance } from './edges';
import { extrasOf } from '../ai/cards';

/** Exact Undo for writes made through other tools (a rolled cycle), while the app runs. */
export const exactUndo = new Map<string, () => void>();

/**
 * The agent's graph tools (docs/GRAPH.md §3). Every input — a dump, a day, an
 * update said on a record's page — is filed through these: find-or-create the
 * things mentioned, set their details, record what happened with who/where,
 * link things, add to-dos. Each write is logged against the dump with what it
 * replaced, so To check can tick it or cancel exactly that write. Nothing here
 * ever asks: best match wins and guesses are flagged.
 */

/* ------------------------------------------------------------------ */
/* Session: one dump being filed                                       */
/* ------------------------------------------------------------------ */

export interface GraphSession {
  dumpId: string;
  source: NonNullable<Provenance['source']>;
  /** The record whose page this was said on ("her", "it", "this" mean it). */
  subjectId?: string | null;
  /** Nodes already found or made in this dump, by "type:name" and by "name". */
  seen: Map<string, string>;
  /** Why a node was a guess ("Guessed Kendal Rao"), carried onto every write that touches it. */
  flags: Map<string, string>;
  writes: number;
  /** The words said "new" ("a new friend"): a reused record gets flagged. */
  saidNew: boolean;
}

export function newSession(dumpId: string, opts: { source?: GraphSession['source']; subjectId?: string | null; saidNew?: boolean } = {}): GraphSession {
  return { dumpId, source: opts.source ?? 'dump', subjectId: opts.subjectId ?? null, seen: new Map(), flags: new Map(), writes: 0, saidNew: !!opts.saidNew };
}

function log(os: LifeOSContext, s: GraphSession, x: Parameters<LifeOSContext['dumps']['addExtraction']>[0] extends infer T ? Omit<T & object, 'dumpId'> : never) {
  const flag = x.flag ?? (x.entityId ? s.flags.get(x.entityId) : undefined) ?? null;
  s.writes++;
  const row = os.dumps.addExtraction({ ...x, dumpId: s.dumpId, flag });
  // The record's own timeline points back at what was said.
  if (x.entityId && x.kind !== 'link' && os.records.get(x.entityId)) {
    const body = os.dumps.get(s.dumpId)?.body ?? '';
    os.records.timeline.add({ entityId: x.entityId, kind: 'dump', title: x.action === 'created' ? 'From something you said' : x.label, body: body.slice(0, 160), actor: 'assistant', meta: { dumpId: s.dumpId, extractionId: row.id }, occurredAt: Date.now() });
  }
  return row;
}

const prov = (s: GraphSession, confidence = 1): Provenance => ({ source: s.source, sourceId: s.dumpId, confidence });
const norm = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const titleCase = (t: string) => t.trim().replace(/\s+/g, ' ').replace(/(^|\s)(\p{L})/gu, (m) => m.toUpperCase());
const SELF = /^(i|me|myself|self|we|us|you|user|the user|owner|the owner)$/i;
const THIS = /^(she|he|her|him|they|them|it|this|this one|that|here|same)$/i;

/* ------------------------------------------------------------------ */
/* Identity resolution                                                  */
/* ------------------------------------------------------------------ */

export const NodeRef = z.union([
  z.string(),
  z.object({ name: z.string(), type: z.string().optional(), id: z.string().optional() }),
]);
export type NodeRef = z.infer<typeof NodeRef>;

const TYPE_GUESS: Array<[RegExp, string]> = [
  [/\b(airport|city|country|town|village|beach|park|mall|restaurant|cafe|café|bar|hotel|station|office|home)\b/i, 'place'],
  [/\b(inc|ltd|pvt|llp|corp|co|bank|airlines?|technologies|labs)\b\.?$/i, 'org'],
];

/** Which existing record a name means — or null to create. Aliases → exact title → fuzzy (≥0.8 is a flagged guess) → session/page context first. */
export function resolveNode(os: LifeOSContext, s: GraphSession, ref: NodeRef, opts: { type?: string; isNew?: boolean } = {}): { id: string | null; confidence: number; flag?: string; type?: string; name: string } {
  const r = typeof ref === 'string' ? { name: ref } : ref;
  const name = r.name.trim();
  const type = (r.type ?? opts.type)?.toLowerCase();
  if (r.id && os.records.get(r.id)) return { id: r.id, confidence: 1, name };
  if (s.subjectId && (THIS.test(name) || norm(name) === norm(os.records.get(s.subjectId)?.title ?? '\0'))) return { id: s.subjectId, confidence: 1, name };
  const seen = s.seen.get(`${type ?? ''}:${norm(name)}`) ?? s.seen.get(norm(name));
  if (seen) return { id: seen, confidence: 1, name };
  const cands = resolveCandidates(os, name, type && os.registry.objects.has(type) ? [type] : undefined).filter((c) => c.why !== `a ${c.object}`);
  const [a, b] = cands;
  if (opts.isNew) {
    // Models mark almost everything "new". An exact name already here is that record; only when the
    // user actually said "new" do we flag it, so two different Kendals can be split from To check.
    if (a && a.score >= 0.95) return { id: a.id, confidence: 0.9, flag: s.saidNew ? `Used your existing ${a.title} — cancel if this is someone new` : undefined, type: a.object, name };
    return { id: null, confidence: 1, type, name };
  }
  if (a && a.score >= 0.95 && (!b || a.score - b.score >= 0.1)) return { id: a.id, confidence: a.score, type: a.object, name };
  // The exact name as another kind of record ("HDFC card" is an account, not a person): use it.
  if (type && (!a || a.score < 0.8)) {
    const any = resolveCandidates(os, name).find((c) => c.score >= 0.95 && c.why !== `a ${c.object}`);
    if (any) return { id: any.id, confidence: 0.9, type: any.object, name };
  }
  if (a && a.score >= 0.8) {
    const other = b && b.score >= 0.8 ? ` (also ${b.title})` : '';
    return { id: a.id, confidence: a.score, flag: `Guessed “${name}” is ${a.title}${other}`, type: a.object, name };
  }
  return { id: null, confidence: 1, type, name };
}

/** Find the node, or create it with sensible defaults. Logs a creation. */
export function upsertNode(os: LifeOSContext, s: GraphSession, ref: NodeRef, opts: { type?: string; isNew?: boolean; attributes?: Record<string, unknown> } = {}): { id: string; created: boolean } | null {
  const r = resolveNode(os, s, ref, opts);
  if (SELF.test(r.name)) return null;
  let id = r.id;
  let created = false;
  if (!id) {
    const type = pickType(os, r.type, r.name);
    const def = os.registry.objects.get(type)!;
    const title = titleCase(r.name);
    const data = baseData(def, title);
    const e = os.records.create({ object: type, title, data }, 'assistant');
    id = e.id;
    created = true;
    if (r.flag) s.flags.set(id, r.flag);
    log(os, s, { kind: type, action: 'created', entityId: id, label: `${def.label}: ${title}`, flag: r.flag });
  } else if (r.flag) s.flags.set(id, r.flag);
  const e = os.records.get(id)!;
  s.seen.set(`${e.object}:${norm(r.name)}`, id);
  s.seen.set(norm(r.name), id);
  s.seen.set(norm(e.title), id);
  if (opts.attributes && Object.keys(opts.attributes).length) setAttributes(os, s, id, opts.attributes);
  return { id, created };
}

function pickType(os: LifeOSContext, type: string | undefined, name: string): string {
  const alias: Record<string, string> = { people: 'person', friend: 'person', contact: 'person', organisation: 'org', organization: 'org', company: 'org', employer: 'org', brand: 'org', shop: 'org', city: 'place', country: 'place', venue: 'place', location: 'place', flight: 'event', meeting: 'event', car: 'vehicle', bike: 'vehicle', todo: 'task', book: 'note' };
  const t = type ? (alias[type] ?? type) : TYPE_GUESS.find(([re]) => re.test(name))?.[1] ?? 'person';
  if (os.registry.objects.has(t)) return t;
  return os.registry.objects.has('note') ? 'note' : [...os.registry.objects.keys()][0]!;
}

/** Required fields filled from the title or first option, so any type can be created from just a name. */
function baseData(def: ObjectDef, title: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    if (f.default !== undefined) out[f.key] = typeof f.default === 'function' ? (f.default as () => unknown)() : f.default;
    else if (f.required) {
      if (f.type === 'text' || f.type === 'longtext') out[f.key] = title;
      else if (f.type === 'date') out[f.key] = parseDateish('today');
      else if (f.type === 'datetime') out[f.key] = Date.now();
      else if (f.type === 'select' && f.options?.length) out[f.key] = (f.options.find((o) => o.value === 'other') ?? f.options[0]!).value;
      else if (f.type === 'number' || f.type === 'money') out[f.key] = 0;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Attributes and notes                                                 */
/* ------------------------------------------------------------------ */

const KEY_SYNONYMS: Record<string, string[]> = {
  birthday: ['birthday', 'birth date', 'birthdate', 'dob', 'date of birth', 'bday'],
  phone: ['phone', 'mobile', 'number', 'phone number', 'cell'],
  email: ['email', 'mail', 'e mail'],
  company: ['company', 'employer', 'works at', 'workplace'],
  role: ['role', 'job', 'title', 'job title', 'position', 'works as'],
  city: ['city', 'lives in', 'home town', 'hometown', 'based in'],
  relationship: ['relationship', 'relation', 'is my'],
  warrantyUntil: ['warranty', 'warranty until', 'warranty till', 'warranty ends', 'guarantee', 'under warranty until'],
  purchasePrice: ['price', 'cost', 'bought for', 'paid', 'purchase price'],
  purchaseDate: ['bought on', 'purchased on', 'purchase date', 'bought'],
  startDate: ['start', 'starts', 'from'],
  endDate: ['end', 'ends', 'until', 'till'],
};

function fieldFor(def: ObjectDef, key: string): Field | undefined {
  const k = norm(key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' '));
  return (
    def.fields.find((f) => norm(f.key.replace(/([a-z])([A-Z])/g, '$1 $2')) === k || norm(f.label) === k) ??
    def.fields.find((f) => KEY_SYNONYMS[f.key]?.includes(k)) ??
    undefined
  );
}

const shown = (v: unknown) => (v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : String(v));

/** Typed fields where the type has them, everything else as a tidy Notes line. Returns what went where. */
export function setAttributes(os: LifeOSContext, s: GraphSession, id: string, attributes: Record<string, unknown>): { fields: string[]; notes: string[] } {
  const e = os.records.get(id);
  if (!e) return { fields: [], notes: [] };
  const def = os.registry.objects.get(e.object)!;
  const data = e.data as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  const before: Record<string, unknown> = {};
  const notes: Array<[string, string]> = [];
  for (const [k, raw] of Object.entries(attributes)) {
    if (raw == null || raw === '') continue;
    const f = fieldFor(def, k);
    if (!f || f.type === 'link' || f.type === 'longtext') {
      notes.push([k, shown(raw)]);
      continue;
    }
    const v = coerce(f, raw);
    // A fixed-choice field only takes one of its options; anything else is kept as a note.
    if (f.type === 'select' && f.options?.length && !f.options.some((o) => o.value === v)) {
      notes.push([f.label, shown(raw)]);
      continue;
    }
    const ok = def.schema.safeParse({ ...data, ...patch, [f.key]: v });
    if (!ok.success) {
      notes.push([f.label, shown(raw)]);
      continue;
    }
    if (data[f.key] === v) continue;
    patch[f.key] = v;
    before[f.key] = data[f.key] ?? null;
  }
  const fields = Object.keys(patch);
  if (fields.length) {
    os.records.update(id, { data: patch }, 'assistant');
    const label = fields.map((k) => `${fieldFor(def, k)?.label ?? k} → ${shown(patch[k])}`).join(', ');
    log(os, s, { kind: e.object, action: 'updated', entityId: id, label: `${e.title} · ${label}`, before });
  }
  for (const [label, value] of notes) addNoteLine(os, s, id, label, value);
  // A person's company is also a link to the organisation.
  if (e.object === 'person' && typeof patch.company === 'string' && os.registry.objects.has('org')) {
    const org = upsertNode(os, s, { name: patch.company, type: 'org' });
    if (org) link(os, s, id, org.id, 'works_at');
  }
  return { fields, notes: notes.map(([l]) => l) };
}

/** "• Favourite colour: pink" in the record's Notes; the same label again updates its line. */
export function addNoteLine(os: LifeOSContext, s: GraphSession, id: string, label: string, value: string): void {
  const e = os.records.get(id);
  if (!e) return;
  const def = os.registry.objects.get(e.object)!;
  const key = def.fields.find((f) => f.key === 'notes' || f.key === 'body')?.key ?? def.fields.find((f) => f.type === 'longtext')?.key;
  const nice = titleCase(label.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()).replace(/^(\p{L})(.*)$/u, (_m, a: string, b: string) => a + b.toLowerCase());
  const line = `• ${nice}: ${value.trim()}`;
  if (!key) {
    const f = os.facts.add({ text: `${e.title} — ${nice}: ${value}`, subjectId: id, source: 'dump', sourceRef: s.dumpId });
    log(os, s, { kind: 'fact', factId: f.id, entityId: null, label: `${e.title} · ${nice}: ${value}` });
    return;
  }
  const old = String((e.data as Record<string, unknown>)[key] ?? '');
  const lines = old ? old.split('\n') : [];
  const at = lines.findIndex((l) => norm(l.replace(/^[•\-*]\s*/, '').split(':')[0] ?? '') === norm(nice));
  if (at >= 0 && lines[at] === line) return;
  if (at >= 0) lines[at] = line;
  else lines.push(line);
  os.records.update(id, { data: { [key]: lines.join('\n') } }, 'assistant');
  log(os, s, { kind: e.object, action: 'updated', entityId: id, label: `${e.title} · ${nice}: ${value}`, before: { [key]: old || null } });
}

/* ------------------------------------------------------------------ */
/* Links, events, tasks, money                                          */
/* ------------------------------------------------------------------ */

export function link(os: LifeOSContext, s: GraphSession, fromId: string, toId: string, kind: string, confidence = 1): string | null {
  if (fromId === toId) return null;
  const [a, b] = [fromId, toId];
  if (SYMMETRIC_EDGES.has(kind) && os.links.forEntity(a, kind).some((x) => x.other.id === b)) return null;
  const existing = os.links.forEntity(a, kind).find((x) => x.other.id === b && x.direction === 'out');
  if (existing) return null;
  const r = os.links.link(a, b, kind, {}, 'assistant', prov(s, confidence));
  const ta = nodeLabel(os, a);
  const tb = nodeLabel(os, b);
  const word = EDGE_WORDS[kind]?.out.toLowerCase() ?? kind.replace(/_/g, ' ');
  const flag = s.flags.get(a) ?? s.flags.get(b);
  log(os, s, { kind: 'link', action: 'created', relationId: r.id, entityId: a, label: `${ta} — ${word} — ${tb}`, flag });
  return r.id;
}

/** How a node reads in a To check line: an expense by its amount, anything else by its title. */
function nodeLabel(os: LifeOSContext, id: string): string {
  const e = os.records.get(id);
  if (!e) return 'record';
  if (e.object === 'transaction') {
    const d = e.data as { amount?: number; merchant?: string };
    return `${d.amount ? os.format.currency(d.amount) : 'Expense'}${d.merchant ? ` · ${d.merchant}` : ''}`;
  }
  return e.title;
}

/** A category as the model said it ("Pets", "food") → the category's stored value (your own ones included); unknown words kept as said. */
function categoryValue(os: LifeOSContext, said: string | undefined): string {
  if (!said) return 'other';
  const opts = os.registry.objects.get('transaction')?.fields.find((f) => f.key === 'category')?.options ?? [];
  const k = said.trim().toLowerCase();
  return (opts.find((o) => o.value.toLowerCase() === k || o.label.toLowerCase() === k) ?? opts.find((o) => o.label.toLowerCase().split(/\s*&\s*/)[0] === k))?.value ?? said;
}

const TRAVEL_KINDS = /^(flight|train|bus|drive|road trip|ferry|cruise|stay|hotel|check.?in|check.?out)$/i;

function dayStart(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 12, 0, 0, 0).getTime();
}

/** A trip this travel belongs to: one whose dates cover the day or whose destination matches, else a new "Trip to X". */
function tripFor(os: LifeOSContext, s: GraphSession, day: string, destination?: string): string | null {
  if (!os.registry.objects.has('trip')) return null;
  const trips = os.records.query<{ destination?: string; startDate?: string; endDate?: string }>('trip', {}, { limit: 200 });
  // A trip with no end date is open for two weeks from its start.
  const openEnd = (start: string) => new Date(Date.parse(start) + 14 * 86400000).toISOString().slice(0, 10);
  const covers = trips.find((t) => t.data.startDate && t.data.startDate <= day && (t.data.endDate ?? openEnd(t.data.startDate)) >= day);
  const named = destination ? trips.find((t) => norm(t.data.destination ?? '') === norm(destination) && (!t.data.startDate || Math.abs(Date.parse(t.data.startDate) - Date.parse(day)) < 45 * 86400000)) : undefined;
  const hit = covers ?? named;
  if (hit) return hit.id;
  if (!destination) return null;
  const t = os.records.create({ object: 'trip', title: `Trip to ${titleCase(destination)}`, data: { destination: titleCase(destination), startDate: day } }, 'assistant');
  log(os, s, { kind: 'trip', action: 'created', entityId: t.id, label: `Trip: Trip to ${titleCase(destination)}` });
  return t.id;
}

export interface EventInput {
  kind: string;
  title?: string;
  when?: string;
  end?: string;
  cost?: number | string;
  roles?: Array<{ role: string; node: NodeRef }>;
  partOf?: NodeRef;
  details?: Record<string, unknown>;
}

/** Something that happened: an event with a kind, a date, and role links to who/where. Travel joins a trip. */
export function recordEvent(os: LifeOSContext, s: GraphSession, i: EventInput): { id: string } | { error: string } {
  if (!os.registry.objects.has('event')) return { error: 'no event type installed' };
  const day = parseDateish(i.when ?? 'today') ?? parseDateish('today')!;
  const hasTime = !!i.when && /\d{1,2}[:.]\d{2}|\b\d{1,2}\s*(am|pm)\b/i.test(i.when);
  const startAt = hasTime && Number.isFinite(Date.parse(`${day} ${i.when!.match(/\d{1,2}([:.]\d{2})?\s*(am|pm)?/i)![0]}`)) ? Date.parse(`${day} ${i.when!.match(/\d{1,2}([:.]\d{2})?\s*(am|pm)?/i)![0]}`) : dayStart(day);
  const kind = i.kind.trim().toLowerCase();
  const roles = (i.roles ?? []).map((r) => ({ role: r.role.toLowerCase().replace(/\s+/g, '_'), node: r.node }));
  const placeName = (role: string) => {
    const r = roles.find((x) => x.role === role)?.node;
    return r ? (typeof r === 'string' ? r : r.name) : undefined;
  };
  const to = placeName('to');
  const at = placeName('at');
  const withNames = roles.filter((r) => r.role === 'with').map((r) => titleCase(typeof r.node === 'string' ? r.node : r.node.name)).filter((n) => !SELF.test(n));
  const people = withNames.length ? ` with ${withNames.length > 2 ? `${withNames.slice(0, 2).join(', ')} +${withNames.length - 2}` : withNames.join(' and ')}` : '';
  const title = i.title?.trim() || (kind === 'flight' && to ? `Flight to ${titleCase(to)}` : `${titleCase(kind)}${at ? ` at ${titleCase(at)}` : to ? ` to ${titleCase(to)}` : people}`);
  const cost = typeof i.cost === 'string' ? (parseAmount(i.cost) ?? undefined) : i.cost;
  const details = Object.fromEntries(Object.entries(i.details ?? {}).filter(([k]) => ['airline', 'flightNo', 'location', 'notes'].includes(k)).map(([k, v]) => [k, String(v)]));
  const ev = os.records.create({ object: 'event', title, data: { kind, startAt, allDay: !hasTime, ...(i.end ? { endAt: dayStart(parseDateish(i.end) ?? day) } : {}), ...(cost ? { cost } : {}), ...details } }, 'assistant');
  log(os, s, { kind: 'event', action: 'created', entityId: ev.id, label: `${titleCase(kind)}: ${title} (${new Date(startAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })})` });
  const withIds: string[] = [];
  for (const r of roles) {
    const typeHint = ['from', 'to', 'at', 'in', 'location', 'venue', 'where'].includes(r.role) ? 'place' : r.role === 'with' ? 'person' : undefined;
    const n = upsertNode(os, s, r.node, { type: typeof r.node === 'object' && r.node.type ? r.node.type : typeHint });
    if (!n) continue;
    const kindWord = ['where', 'venue', 'location', 'in'].includes(r.role) ? 'at' : r.role;
    link(os, s, ev.id, n.id, kindWord);
    if (kindWord === 'with') withIds.push(n.id);
  }
  let tripId: string | null = null;
  if (i.partOf) tripId = upsertNode(os, s, i.partOf, { type: 'trip' })?.id ?? null;
  else if (TRAVEL_KINDS.test(kind)) tripId = tripFor(os, s, day, to ?? at);
  if (tripId) {
    link(os, s, ev.id, tripId, 'part_of');
    for (const p of withIds) link(os, s, tripId, p, 'with');
  }
  return { id: ev.id };
}

/* ------------------------------------------------------------------ */
/* Undo one write (To check › cancel)                                   */
/* ------------------------------------------------------------------ */

/** Reverse exactly one logged write: remove the link, delete what was created, restore replaced fields, forget the fact. */
export function reverseWrite(os: LifeOSContext, extractionId: string): boolean {
  const x = os.dumps.extraction(extractionId);
  if (!x || x.undone) return false;
  const exact = exactUndo.get(extractionId);
  if (exact) {
    exact();
    exactUndo.delete(extractionId);
  } else if (x.relationId) os.links.remove(x.relationId);
  else if (x.factId) os.facts.forget(x.factId);
  else if (x.entityId && x.action === 'created') os.records.delete(x.entityId, 'user');
  else if (x.entityId && x.action === 'updated' && x.before) {
    const back = Object.fromEntries(Object.entries(x.before).map(([k, v]) => [k, v ?? undefined]));
    if (os.records.get(x.entityId)) os.records.update(x.entityId, { data: back }, 'user');
  } else return false;
  os.dumps.markUndone(extractionId);
  return true;
}

/* ------------------------------------------------------------------ */
/* The tools                                                            */
/* ------------------------------------------------------------------ */

const Attr = z.record(z.string(), z.unknown());
/** A name plus an optional separate type hint (models handle flat strings far better than unions). */
const withType = (r: NodeRef, type?: string): NodeRef => (typeof r === 'string' && type ? { name: r, type } : r);
const nameOf = (r: NodeRef) => (typeof r === 'string' ? r : r.name);

/** Graph tools bound to one filing session (a dump). */
export function graphTools(s: GraphSession): AiToolDef[] {
  return [
    {
      name: 'upsert_node',
      description: 'A person, place, organisation, trip, thing or other record mentioned. Finds the existing one or creates it; optional details go on it. Not needed for people/places inside record_event roles — those are created there.',
      input: z.object({ name: z.string(), type: z.string().optional().describe('person | place | org | trip | vehicle | asset | … (see record types)'), is_new: z.boolean().optional().describe('only if the user said it is new'), attributes: Attr.optional() }),
      run: async (input, os) => {
        const i = input as { name: string; type?: string; is_new?: boolean; attributes?: Record<string, unknown> };
        const n = upsertNode(os, s, { name: i.name, type: i.type }, { isNew: i.is_new, attributes: i.attributes });
        if (!n) return { skipped: 'that is the user' };
        const e = os.records.get(n.id)!;
        return { id: n.id, name: e.title, type: e.object, created: n.created };
      },
    },
    {
      name: 'set_attributes',
      description: 'Details about a record: {"birthday": "8 Sept", "company": "Zomato", "favourite colour": "pink"}. Known fields are filled; anything else becomes a line in its Notes. Use "this" as the node on a record page.',
      input: z.object({ node: NodeRef.describe('the name (or "this" on a record page)'), node_type: z.string().optional(), attributes: Attr }),
      run: async (input, os) => {
        const i = input as { node: NodeRef; node_type?: string; attributes: Record<string, unknown> };
        const n = upsertNode(os, s, withType(i.node, i.node_type));
        if (!n) return { skipped: 'that is the user' };
        return { id: n.id, ...setAttributes(os, s, n.id, i.attributes) };
      },
    },
    {
      name: 'record_event',
      description: 'Something that happened: kind (flight, dinner, meeting, concert, hike, call, visit…), when (a date like "8 Sept" or "yesterday", optional time), and roles linking who and where: [{"role":"with","node":"Kendal"},{"role":"from","node":"USA"},{"role":"to","node":"Canada"},{"role":"at","node":"Toit"}]. Travel joins a trip automatically.',
      input: z.object({
        kind: z.string(),
        title: z.string().optional(),
        when: z.string().optional(),
        end: z.string().optional(),
        cost: z.union([z.number(), z.string()]).optional(),
        roles: z.array(z.object({ role: z.string().describe('with | at | from | to'), node: NodeRef.describe('a name'), type: z.string().optional().describe('person | place | org') })).optional(),
        part_of: NodeRef.optional().describe('a trip name, if said'),
        details: Attr.optional().describe('airline, flightNo, notes'),
      }),
      run: async (input, os) => {
        const i = input as { kind: string; title?: string; when?: string; end?: string; cost?: number | string; roles?: Array<{ role: string; node: NodeRef; type?: string }>; part_of?: NodeRef; details?: Record<string, unknown> };
        return recordEvent(os, s, { ...i, roles: i.roles?.map((r) => ({ role: r.role, node: withType(r.node, r.type) })), partOf: i.part_of });
      },
    },
    {
      name: 'link',
      description: `A relationship between two things: "Kendal is Priya's sister" → family_of; "works at Zomato" → works_at. Words: ${Object.keys(EDGE_WORDS).join(', ')} (others allowed).`,
      input: z.object({ from: NodeRef.describe('a name'), to: NodeRef.describe('a name'), kind: z.string(), from_type: z.string().optional(), to_type: z.string().optional() }),
      run: async (input, os) => {
        const i = input as { from: NodeRef; to: NodeRef; kind: string; from_type?: string; to_type?: string };
        const a = upsertNode(os, s, withType(i.from, i.from_type));
        const b = upsertNode(os, s, withType(i.to, i.to_type), { type: i.kind === 'works_at' ? 'org' : i.kind === 'lives_in' || i.kind === 'located_in' ? 'place' : undefined });
        if (!a || !b) return { skipped: 'that is the user' };
        const kind = i.kind.toLowerCase().replace(/\s+/g, '_');
        return { linked: !!link(os, s, a.id, b.id, kind), from: nameOf(i.from), to: nameOf(i.to), kind };
      },
    },
    {
      name: 'create_task',
      description: 'Something the user needs to do ("need to call the plumber tomorrow"). Only real to-dos.',
      input: z.object({ title: z.string(), due: z.string().optional(), about: NodeRef.optional() }),
      run: async (input, os) => {
        const i = input as { title: string; due?: string; about?: NodeRef };
        if (!os.registry.objects.has('task')) return { error: 'no task type installed' };
        const t = os.records.create({ object: 'task', title: i.title.trim(), data: { dueDate: parseDateish(i.due), priority: 'medium' } }, 'assistant');
        log(os, s, { kind: 'task', action: 'created', entityId: t.id, label: `Task: ${t.title}${i.due ? ` (${parseDateish(i.due) ?? i.due})` : ''}` });
        if (i.about) {
          const n = upsertNode(os, s, i.about);
          if (n) link(os, s, t.id, n.id, 'about');
        }
        return { id: t.id };
      },
    },
    {
      name: 'log_done',
      description: 'A chore or service done on something the user has ("did the car service, 6,400 at Hyundai", "watered the plants", "car at 34,200 km"). Rolls its due date and files the cost.',
      input: z.object({ thing: NodeRef, what: z.string(), date: z.string().optional(), cost: z.union([z.number(), z.string()]).optional(), meter: z.number().optional() }),
      run: async (input, os) => {
        const i = input as { thing: NodeRef; what: string; date?: string; cost?: number | string; meter?: number };
        const r = resolveNode(os, s, i.thing);
        if (!r.id) return { error: `no record called ${nameOf(i.thing)}` };
        const tool = os.registry.aiTools.get('log_event');
        if (!tool) return { error: 'cycles not available' };
        const cost = typeof i.cost === 'string' ? (parseAmount(i.cost) ?? undefined) : i.cost;
        const out = (await tool.run(tool.input.parse({ entityId: r.id, what: i.what, date: parseDateish(i.date ?? 'today'), cost, meter: i.meter }), os)) as Record<string, unknown>;
        if (out?.error) return out;
        const row = log(os, s, { kind: 'cycle', action: 'logged', entityId: r.id, label: String(out.logged ?? `${i.what} on ${os.records.get(r.id)?.title}`), flag: r.flag });
        const undo = extrasOf(out).undo;
        if (undo) exactUndo.set(row.id, undo);
        return { done: out.logged, next: out.next };
      },
    },
    {
      name: 'check_in',
      description: 'A habit the user tracks was done ("did yoga", "read 20 pages", "went for a run"). Ticks it for the day.',
      input: z.object({ habit: z.string(), date: z.string().optional() }),
      run: async (input, os) => {
        const i = input as { habit: string; date?: string };
        const tool = os.registry.aiTools.get('habit_check_in');
        if (!tool) return { error: 'habits not available' };
        const out = (await tool.run(tool.input.parse({ habit: i.habit, date: parseDateish(i.date ?? 'today') }), os)) as Record<string, unknown>;
        if (out?.error || !out.entityId) return out;
        const row = log(os, s, { kind: 'habit', action: 'logged', entityId: String(out.entityId), label: String(out.logged) });
        if (out.logId) exactUndo.set(row.id, () => os.records.delete(String(out.logId), 'user'));
        return { done: out.logged };
      },
    },
    {
      name: 'log_spend',
      description: 'Money spent or received: amount, merchant, what it was for (a record, e.g. the Dyson just bought), who with, which card/account, date.',
      input: z.object({ amount: z.union([z.number(), z.string()]), kind: z.enum(['expense', 'income']).optional(), merchant: z.string().optional(), category: z.string().optional(), date: z.string().optional(), for: NodeRef.optional(), with: z.array(NodeRef).optional(), account: z.string().optional(), note: z.string().optional() }),
      run: async (input, os) => {
        const i = input as { amount: number | string; kind?: 'expense' | 'income'; merchant?: string; category?: string; date?: string; for?: NodeRef; with?: NodeRef[]; account?: string; note?: string };
        if (!os.registry.objects.has('transaction')) return { error: 'no finance module installed' };
        const amount = typeof i.amount === 'number' ? i.amount : parseAmount(i.amount);
        if (!amount) return { error: 'no amount' };
        const account = i.account ? resolveCandidates(os, i.account, ['account']).find((c) => c.score >= 0.8) : undefined;
        const data = { amount, kind: i.kind ?? 'expense', category: i.category ? categoryValue(os, i.category) : categoryFor(os, i.merchant ?? (i.for ? nameOf(i.for) : null), i.note ?? '', typeof amount === 'number' ? amount : null), merchant: i.merchant ?? (i.for ? nameOf(i.for) : undefined), date: parseDateish(i.date ?? 'today'), accountId: account?.id, note: i.note ?? (i.account && !account ? i.account : undefined) };
        const tx = os.records.create({ object: 'transaction', data }, 'assistant');
        log(os, s, { kind: 'transaction', action: 'created', entityId: tx.id, label: `${data.kind === 'income' ? 'Income' : 'Spent'}: ${os.format.currency(amount)}${data.merchant ? ` · ${data.merchant}` : ''}` });
        if (i.for) {
          const n = upsertNode(os, s, i.for);
          if (n) link(os, s, tx.id, n.id, 'paid_for');
        }
        for (const w of i.with ?? []) {
          const r = resolveNode(os, s, w, { type: 'person' });
          const hit = r.id ? os.records.get(r.id) : undefined;
          // "…on the HDFC card" said as "with": it's how it was paid, not who was there.
          if (hit?.object === 'account') {
            if (!data.accountId) os.records.update(tx.id, { data: { accountId: hit.id } }, 'assistant');
            continue;
          }
          const n = upsertNode(os, s, w, { type: 'person' });
          if (n) link(os, s, tx.id, n.id, 'with');
        }
        return { id: tx.id };
      },
    },
  ];
}

