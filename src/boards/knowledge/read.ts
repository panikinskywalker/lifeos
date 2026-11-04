import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { Fact } from '@core/repo/factRepo';
import { lastMonths } from '@core/dashboard/overview';
import { factGroups, NOTE_KINDS, noteSnippet, noteTitle, type NoteData } from '@modules/knowledge';

/** What Journal's screens read: plain functions over core and the knowledge module; no UI. */

export type Note = ObjectRecord<NoteData>;

/** When a note happened: its domain time, else when it was written. */
export const noteAt = (n: Pick<Note, 'occurredAt' | 'createdAt'>) => n.occurredAt ?? n.createdAt;
export const newestFirst = (list: Note[]) => [...list].sort((a, b) => noteAt(b) - noteAt(a));
export const kindLabel = (kind?: string) => NOTE_KINDS.find((k) => k.value === kind)?.label ?? 'Note';

/** Notes written in each of the last six months, this month last. */
export function monthCounts(all: Note[], now = Date.now()): Array<{ label: string; value: number }> {
  return lastMonths(6, now).map((m) => {
    const from = new Date(`${m.start}T00:00:00`).getTime();
    const to = new Date(`${m.end}T23:59:59`).getTime();
    return { label: m.label, value: all.filter((n) => noteAt(n) >= from && noteAt(n) <= to).length };
  });
}

/** A note written on this date in an earlier year: a journal entry first, the nearest year first. */
export function onThisDayNote(all: Note[], now = Date.now()): { note: Note; ago: string } | null {
  const d = new Date(now);
  const hits = all
    .filter((n) => {
      const a = new Date(noteAt(n));
      return a.getMonth() === d.getMonth() && a.getDate() === d.getDate() && a.getFullYear() < d.getFullYear();
    })
    .sort((a, b) => Number(b.data.kind === 'journal') - Number(a.data.kind === 'journal') || noteAt(b) - noteAt(a));
  const note = hits[0];
  if (!note) return null;
  const years = d.getFullYear() - new Date(noteAt(note)).getFullYear();
  return { note, ago: years === 1 ? 'a year ago' : `${years} years ago` };
}

/** The opening sentences of a body, up to `max` characters, its [[mentions]] kept. */
export function quoteOf(body: string, max = 110): string {
  const flat = (body ?? '').split('\n').map((l) => l.replace(/^\s*(#+|[-*>]|\d+\.)\s*/, '').trim()).filter(Boolean).join(' ');
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const stop = cut.lastIndexOf('. ');
  return stop > 30 ? cut.slice(0, stop + 1) : `${cut.replace(/\[\[[^\]]*$/, '').trimEnd()}…`;
}

/** The line under a title: the whole body when the title is your own, else what follows its first line. */
export function bodyLine(n: Note, max = 140): string {
  if (n.title === noteTitle(n.data.body)) {
    const rest = noteSnippet(n.data.body, max);
    return rest === n.title ? '' : rest;
  }
  return quoteOf(n.data.body, max).replace(/\[\[|\]\]/g, '');
}

export interface FaceData {
  id: string;
  name: string;
  photo?: string | null;
}

export const photoOf = (os: LifeOSContext, id: string) => os.records.get<{ photo?: { uri?: string } }>(id)?.data.photo?.uri ?? null;
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Who and what a note is linked to: faces, then places, then a count of the rest ("1 payment"). */
export function linkedTo(os: LifeOSContext, id: string): { people: FaceData[]; places: string[]; others: string[] } {
  const seen = new Set<string>();
  const people: FaceData[] = [];
  const places: string[] = [];
  const counts = new Map<string, number>();
  for (const { other } of os.links.forEntity(id)) {
    if (seen.has(other.id)) continue;
    seen.add(other.id);
    if (other.object === 'person') people.push({ id: other.id, name: other.title, photo: photoOf(os, other.id) });
    else if (other.object === 'place') places.push(other.title);
    else counts.set(other.object, (counts.get(other.object) ?? 0) + 1);
  }
  const others = [...counts.entries()].map(([object, n]) => {
    const def = os.registry.objects.get(object);
    return `${n} ${(n === 1 ? def?.label : def?.labelPlural)?.toLowerCase() ?? 'more'}`;
  });
  return { people, places, others };
}

/** What a fact is about: the record, or the name, or you. */
export function aboutOf(os: LifeOSContext, f: Fact) {
  return factGroups(os, [f])[0]!;
}

/** Facts filing guessed and you have not looked at yet: fact id → the guess. */
export function factGuesses(os: LifeOSContext): Map<string, string> {
  return new Map(os.filings.ofKind('fact', { open: true, limit: 200 }).filter((x) => x.flag && x.factId).map((x) => [x.factId!, x.flag!]));
}
