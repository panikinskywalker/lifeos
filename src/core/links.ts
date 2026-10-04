import type { ObjectRecord } from './domain/types';
import type { LifeOSContext } from './registry/context';
import type { Actor } from './events/bus';

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
  const exact = os.records.search.search(title, { limit: 20 }).filter((h) => h.type !== 'fact' && h.type !== 'dump' && h.id !== exclude && norm(h.title) === t);
  if (exact.length === 1) return exact[0]!.id;
  if (exact.length > 1) return null;
  const alias = os.aliases.lookup(title).find((a) => norm(a.alias) === t && a.entityId !== exclude);
  return alias?.entityId ?? null;
}

/** Text fields of a record that may carry [[links]]. */
function linkText(os: LifeOSContext, e: ObjectRecord): string {
  const def = os.registry.objects.get(e.type);
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
