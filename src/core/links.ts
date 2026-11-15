import type { ObjectRecord } from './domain/types';
import type { LifeOSContext } from './registry/context';
import type { Actor } from './events/bus';
import { holds, linkFields } from './graph/words';
import { SYMMETRIC_EDGES } from './graph/edges';

/** "[[Creta]] needs a wash, ask [[Priya Sharma]]" → ['Creta', 'Priya Sharma']. */
export function parseLinks(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\[\[([^[\]\n]{1,80})\]\]/g)) {
    const t = m[1]!.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** A [[title]] → record id: exact title first (case-insensitive), then a learned alias. Null when unsure. */
export function resolveLink(os: LifeOSContext, title: string, exclude?: string): string | null {
  const t = norm(title);
  const exact = os.records.search.search(title, { limit: 20 }).filter((h) => h.object !== 'fact' && h.object !== 'dump' && h.id !== exclude && norm(h.title) === t);
  if (exact.length === 1) return exact[0]!.id;
  if (exact.length > 1) return null;
  const alias = os.aliases.lookup(title).find((a) => norm(a.alias) === t && a.entityId !== exclude);
  return alias?.entityId ?? null;
}

/** Text fields of a record that may carry [[links]]. */
function linkText(os: LifeOSContext, e: ObjectRecord): string {
  const def = os.registry.objects.get(e.object);
  if (!def) return '';
  return def.fields
    .filter((f) => f.type === 'text' || f.type === 'longtext')
    .map((f) => (e.data as Record<string, unknown>)[f.key])
    .filter((v): v is string => typeof v === 'string' && v.includes('[['))
    .join('\n');
}

/**
 * Keep a record's 'mention' relations equal to the [[links]] in its text:
 * new links are added, links removed from the text are unlinked. Unresolved
 * titles are left alone (no guessing).
 */
export function syncMentions(os: LifeOSContext, e: ObjectRecord, actor: Actor = 'user'): void {
  const want = new Set(parseLinks(linkText(os, e)).map((t) => resolveLink(os, t, e.id)).filter((x): x is string => !!x));
  const have = new Set(os.links.targets(e.id, 'mention'));
  for (const id of want) if (!have.has(id)) os.links.link(e.id, id, 'mention', {}, actor);
  for (const id of have) if (!want.has(id)) os.links.unlink(e.id, id, 'mention', actor);
}

/** Notes (and other records) that [[link]] to this one. */
export function backlinks(os: LifeOSContext, id: string): ObjectRecord[] {
  return os.links
    .sources(id, 'mention')
    .map((s) => os.records.get(s))
    .filter((x): x is ObjectRecord => !!x);
}

/** A Link to take out or put back: its id and how it was stored. */
export interface LinkRef {
  linkId?: string;
  fromId: string;
  toId: string;
  kind: string;
}

/**
 * The link Field on the holding record that made this Link, if any (a Task's
 * Project, a Game's captain). Links that Fields make are mirrored from the
 * record's data, so changing only the Link would come back on the next edit.
 */
function fieldFor(os: LifeOSContext, fromId: string, toId: string, kind: string, holding: boolean) {
  const from = os.records.get(fromId);
  const to = os.records.get(toId);
  if (!from || !to) return null;
  const fields = linkFields(os.registry.objects.get(from.object), kind, to.object);
  const data = from.data as Record<string, unknown>;
  const f = holding ? fields.find((x) => holds(data[x.key], toId)) : fields.find((x) => Array.isArray(data[x.key]) || x.key.endsWith('Ids')) ?? fields.find((x) => data[x.key] == null) ?? fields[0];
  return f ? { from, f, data } : null;
}

/**
 * Remove a Link by hand (the Links card). A Link made by a link Field takes
 * the record out of that Field, which removes the Link; any other Link is
 * removed as it is. Returns what puts it back exactly (Undo).
 */
export function removeLink(os: LifeOSContext, l: LinkRef, actor: Actor = 'user'): () => void {
  const hit = fieldFor(os, l.fromId, l.toId, l.kind, true);
  if (hit) {
    const v = hit.data[hit.f.key];
    os.records.update(l.fromId, { data: { [hit.f.key]: Array.isArray(v) ? v.filter((x) => String(x) !== l.toId) : undefined } }, actor);
    return () => void os.records.update(l.fromId, { data: { [hit.f.key]: v } }, actor);
  }
  if (l.linkId) os.links.remove(l.linkId, actor);
  else os.links.unlink(l.fromId, l.toId, l.kind, actor);
  return () => void os.links.link(l.fromId, l.toId, l.kind, {}, actor);
}

/**
 * Add a Link by hand. A word that is one of the record's link Fields fills
 * that Field (a one-record Field is replaced, a list gains the record), so the
 * record page and form agree with the Link; any other word is a plain Link.
 * Returns its Undo.
 */
export function addLink(os: LifeOSContext, fromId: string, toId: string, kind: string, actor: Actor = 'user', since?: number | null, bothWays = false): () => void {
  const hit = fieldFor(os, fromId, toId, kind, false);
  if (hit) {
    const v = hit.data[hit.f.key];
    const list = Array.isArray(v) || hit.f.key.endsWith('Ids');
    const arr = Array.isArray(v) ? v.map(String) : [];
    if (list ? arr.includes(toId) : v === toId) return () => {};
    os.records.update(fromId, { data: { [hit.f.key]: list ? [...arr, toId] : toId } }, actor);
    return () => void os.records.update(fromId, { data: { [hit.f.key]: v } }, actor);
  }
  const prov = { source: 'manual' as const, confidence: 1, validFrom: since ?? null };
  const l = os.links.link(fromId, toId, kind, {}, actor, prov);
  // Both ways (the L5 artboard): the same word read from the other record too ("works with" each other); words core keeps symmetric are stored once already.
  const back = bothWays && !SYMMETRIC_EDGES.has(kind) ? os.links.link(toId, fromId, kind, {}, actor, prov) : null;
  return () => {
    os.links.remove(l.id, actor);
    if (back) os.links.remove(back.id, actor);
  };
}

/** Since when and until when a Link was true (the L3 artboard's Set dates). Returns its Undo. */
export function setLinkDates(os: LifeOSContext, linkId: string, since: number | null, until: number | null): () => void {
  const row = os.db.get<{ valid_from: number | null; valid_to: number | null }>(`SELECT valid_from, valid_to FROM links WHERE id=?`, [linkId]);
  os.links.setValidity(linkId, since, until);
  return () => os.links.setValidity(linkId, row?.valid_from ?? null, row?.valid_to ?? null);
}

/** Where a Link came from and how sure it is, for the Links screen's link sheet (the L3 artboard). */
export interface LinkInfo {
  id: string;
  fromId: string;
  toId: string;
  kind: string;
  createdAt: number;
  since: number | null;
  until: number | null;
  confidence: number;
  /** How it was made: a dump (with its sentence while the dump is kept), a message, the agent, a Field, or you. */
  origin: { by: 'dump' | 'message' | 'agent' | 'field' | 'you'; line: string; quote: string | null; at: number };
  /** Made by a link Field: its word cannot be changed here (edit the record). */
  field: string | null;
}

export function linkInfo(os: LifeOSContext, linkId: string): LinkInfo | null {
  const l = os.links.get(linkId);
  if (!l) return null;
  const row = os.db.get<{ valid_from: number | null; valid_to: number | null }>(`SELECT valid_from, valid_to FROM links WHERE id=?`, [linkId]);
  const hit = fieldFor(os, l.fromId, l.toId, l.kind, true);
  const fromDef = hit ? os.registry.objects.get(hit.from.object) : undefined;
  let origin: LinkInfo['origin'];
  if (hit) origin = { by: 'field', line: `From the ${fromDef?.label.toLowerCase() ?? 'record'}'s ${hit.f.label} field`, quote: null, at: l.createdAt };
  else if (l.source === 'dump') {
    const d = l.sourceId ? os.dumps.get(l.sourceId) : null;
    origin = { by: 'dump', line: 'From a dump', quote: d?.body.trim() ?? null, at: d?.createdAt ?? l.createdAt };
  } else if (l.source === 'sms' || l.source === 'notification' || l.source === 'email') origin = { by: 'message', line: l.source === 'sms' ? 'From an SMS' : l.source === 'email' ? 'From a mail' : 'From a notification', quote: null, at: l.createdAt };
  else if (l.source === 'assistant') origin = { by: 'agent', line: 'Filed by the agent', quote: null, at: l.createdAt };
  else origin = { by: 'you', line: 'Added by you', quote: null, at: l.createdAt };
  return { id: l.id, fromId: l.fromId, toId: l.toId, kind: l.kind, createdAt: l.createdAt, since: row?.valid_from ?? null, until: row?.valid_to ?? null, confidence: l.confidence ?? 1, origin, field: hit ? hit.f.label : null };
}

/** Change a Link's word, keeping its ends, provenance and confidence (not for Links a Field made). Returns its Undo. */
export function changeLinkWord(os: LifeOSContext, linkId: string, kind: string, actor: Actor = 'user'): () => void {
  const l = os.links.get(linkId);
  if (!l || l.kind === kind) return () => {};
  const row = os.db.get<{ valid_from: number | null; valid_to: number | null }>(`SELECT valid_from, valid_to FROM links WHERE id=?`, [linkId]);
  const prov = { source: (l.source ?? 'manual') as 'manual', sourceId: l.sourceId, confidence: l.confidence ?? 1, validFrom: row?.valid_from ?? null, validTo: row?.valid_to ?? null };
  os.links.remove(linkId, actor);
  const n = os.links.link(l.fromId, l.toId, kind, l.meta, actor, prov);
  return () => {
    os.links.remove(n.id, actor);
    os.links.link(l.fromId, l.toId, l.kind, l.meta, actor, prov);
  };
}
