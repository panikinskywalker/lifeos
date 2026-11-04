import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { Fact } from '@core/repo/factRepo';
import type { Alias } from '@core/repo/aliasRepo';
import { backlinks, parseLinks, resolveLink, syncMentions } from '@core/links';
import type { NoteData } from './types';

/**
 * The Second Brain (docs/MODEL.md layer 2, Mind; R7f): Notes, Facts and the
 * names Talk learned, read together. Plain functions over core; no UI.
 */

export interface Mention {
  title: string;
  /** The record it links to; null when no record (or more than one) has that name. */
  id: string | null;
}

/** The [[mentions]] in a text, each with the record it resolves to. */
export function mentionsIn(os: LifeOSContext, text: string, exclude?: string): Mention[] {
  return parseLinks(text).map((title) => ({ title, id: resolveLink(os, title, exclude) }));
}

/** Notes, pinned (starred) first, then the latest edited. `q` searches title and body; `kind` narrows. */
export function notes(os: LifeOSContext, opts: { q?: string; kind?: string; limit?: number } = {}): ObjectRecord<NoteData>[] {
  const limit = opts.limit ?? 500;
  let list: ObjectRecord<NoteData>[];
  if (opts.q?.trim()) {
    const ids = os.records.search.search(opts.q.trim(), { types: ['note'], limit: limit * 2 }).map((h) => h.id);
    list = os.records.getMany(ids).filter((r) => r.object === 'note') as ObjectRecord<NoteData>[];
  } else {
    list = os.records.query<NoteData>('note', { sort: [{ field: 'updatedAt', dir: 'desc' }] }, { limit: 5000 });
  }
  return list
    .filter((n) => !n.archived && (!opts.kind || n.data.kind === opts.kind))
    .sort((a, b) => Number(b.starred) - Number(a.starred) || (opts.q?.trim() ? 0 : b.updatedAt - a.updatedAt))
    .slice(0, limit);
}

export interface FactGroup {
  /** A record id, `name:<lower name>`, or 'you'. */
  key: string;
  title: string;
  /** The record the facts are about, when there is one. */
  record?: ObjectRecord;
  facts: Fact[];
}

const capital = (s: string) => s.replace(/^\p{L}/u, (c) => c.toUpperCase());

/** Facts by what they are about: About you first, then the biggest groups. */
export function factGroups(os: LifeOSContext, facts: Fact[]): FactGroup[] {
  const by = new Map<string, FactGroup>();
  for (const f of facts) {
    const record = f.subjectId ? os.records.get(f.subjectId) : null;
    const name = f.subjectKey?.startsWith('name:') ? f.subjectKey.slice(5) : null;
    const key = record ? record.id : name ? `name:${name}` : 'you';
    const title = record ? record.title : name ? capital(name) : 'About you';
    if (!by.has(key)) by.set(key, { key, title, record: record ?? undefined, facts: [] });
    by.get(key)!.facts.push(f);
  }
  return [...by.values()].sort((a, b) => (a.key === 'you' ? -1 : b.key === 'you' ? 1 : b.facts.length - a.facts.length || a.title.localeCompare(b.title)));
}

/** The Second Brain's search: Notes (title, body) and Facts together. */
export function searchBrain(os: LifeOSContext, q: string, limit = 50): { notes: ObjectRecord<NoteData>[]; facts: Fact[] } {
  if (!q.trim()) return { notes: [], facts: [] };
  return { notes: notes(os, { q, limit }), facts: os.facts.search(q, limit) };
}

export interface Known {
  record: ObjectRecord | null;
  name: string;
  facts: Fact[];
  /** Notes that [[mention]] the record. */
  notes: ObjectRecord[];
  /** What you call it ("the car"). */
  aliases: Alias[];
}

/** Everything the Second Brain holds about a record (by id) or a name. */
export function whatIKnow(os: LifeOSContext, about: string): Known {
  const a = about.trim();
  const byId = os.records.get(a);
  const id = byId?.id ?? resolveLink(os, a) ?? os.aliases.lookup(a)[0]?.entityId ?? null;
  const record = byId ?? (id ? os.records.get(id) : null);
  if (record) {
    return { record, name: record.title, facts: os.facts.list({ subjectId: record.id }), notes: backlinks(os, record.id).filter((n) => !n.archived), aliases: os.aliases.forEntity(record.id) };
  }
  const key = `name:${a.toLowerCase()}`;
  const named = os.facts.list({ limit: 5000 }).filter((f) => f.subjectKey === key);
  const said = named.length ? named : os.facts.search(a, 20);
  return { record: null, name: a, facts: said, notes: notes(os, { q: a, limit: 20 }), aliases: [] };
}

const lower = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * A record made (or renamed) after notes already named it: those notes' [[Name]] link to it now.
 * Returns how many notes were looked at. Notes stay as they are when the name is still ambiguous.
 */
export function relinkNotesNaming(os: LifeOSContext, record: ObjectRecord): number {
  if (record.object === 'note' || record.title.trim().length < 2) return 0;
  const name = lower(record.title);
  const hits = os.records.search.search(record.title, { types: ['note'], limit: 200 }).map((h) => os.records.get(h.id));
  const naming = hits.filter((n): n is ObjectRecord => !!n && parseLinks(String((n.data as { body?: string }).body ?? '')).some((t) => lower(t) === name));
  for (const n of naming) syncMentions(os, n, 'system');
  return naming.length;
}
