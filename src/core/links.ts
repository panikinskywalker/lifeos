import type { ObjectRecord } from './domain/types';
import type { LifeOSContext } from './registry/context';
import type { Actor } from './events/bus';
import { holds, linkFields } from './graph/words';

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
export function addLink(os: LifeOSContext, fromId: string, toId: string, kind: string, actor: Actor = 'user'): () => void {
  const hit = fieldFor(os, fromId, toId, kind, false);
  if (hit) {
    const v = hit.data[hit.f.key];
    const list = Array.isArray(v) || hit.f.key.endsWith('Ids');
    const arr = Array.isArray(v) ? v.map(String) : [];
    if (list ? arr.includes(toId) : v === toId) return () => {};
    os.records.update(fromId, { data: { [hit.f.key]: list ? [...arr, toId] : toId } }, actor);
    return () => void os.records.update(fromId, { data: { [hit.f.key]: v } }, actor);
  }
  const l = os.links.link(fromId, toId, kind, {}, actor);
  return () => os.links.remove(l.id, actor);
}
