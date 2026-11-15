import type { Field, ObjectDef } from '../domain/types';
import type { LifeOSContext } from '../registry/context';
import { EDGE_WORDS } from './edges';

/**
 * How a Link reads (MODEL.md layer 5, *Links*; the NR Links artboards L1 to
 * L4). Words are lower case, as the record would say them: Karan *works at*
 * Zomato, was *with* the dinner, *paid* ₹1,240, is *member of* Saturday
 * football, *played in* a game. Most Links are made by a link Field, so the
 * Field says what the Link means: from the record holding it, the Field's
 * label ("project", "venue"); from the record it points at, a verb when the
 * Field names a part someone plays (*with*, *paid*, *captain of*), else the
 * other Object's records ("tasks", "transactions"), never the Field's word
 * read backwards. Links no Field made use the Object's declared words, then
 * core's words, then the other Object's name.
 */

/** Words for a part someone plays, read from either side (out: from the record holding it; in: from the one it names). */
const VERBS: Record<string, { out: string; in: string }> = {
  person: { out: 'with', in: 'with' },
  with: { out: 'with', in: 'with' },
  payee: { out: 'paid', in: 'paid' },
  member: { out: 'members', in: 'member of' },
  captain: { out: 'captain', in: 'captain of' },
  'fronted by': { out: 'fronted by', in: 'fronted' },
  'man of the match': { out: 'player of the match', in: 'player of the match' },
  'works at': { out: 'works at', in: 'people' },
  'lives in': { out: 'lives in', in: 'people' },
  toAccount: { out: 'to account', in: 'transfers in' },
};

const fits = (to: Field['linkTo'] | string | string[] | undefined, object: string) => to === undefined || to === 'any' || (Array.isArray(to) ? to.includes(object) : to === object);

/** "toAccount" → "to account", "kept_in" → "kept in". */
export const humanise = (kind: string) => kind.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim();
const coreWord = (kind: string) => EDGE_WORDS[kind] ?? EDGE_WORDS[kind.replace(/ /g, '_')];

/** The link Fields on `object` that make Links of this word to `other` (a Game has two for *captain*). */
export function linkFields(def: ObjectDef | undefined, kind: string, other?: string): Field[] {
  return (def?.fields ?? []).filter((f) => f.type === 'link' && f.linkWord === kind && (!other || fits(f.linkTo, other)));
}

/** Does a link Field's value hold this record id (one id, or a list)? */
export const holds = (value: unknown, id: string) => (Array.isArray(value) ? value.map(String).includes(id) : value != null && String(value) === id);

export interface Reading {
  /** The group's word on the Links card, lower case. */
  word: string;
  /** Set when the word is the other Object's name because its Field points here; the card may qualify it. */
  viaField?: { object: string; plural: string; kind: string };
}

const low = (s: string) => s.toLowerCase();

/**
 * How one Link reads from `self` towards `other`. `data` is the holding
 * record's data when `self` holds the Link (to name the right one of two
 * Fields with one word: captain, team A or B).
 */
export function readLink(os: LifeOSContext, self: { object: string; data?: unknown }, other: { id: string; object: string }, kind: string, direction: 'out' | 'in'): Reading {
  const mine = os.registry.objects.get(self.object);
  const theirs = os.registry.objects.get(other.object);
  const verb = VERBS[kind];
  if (direction === 'out') {
    if (verb) return { word: verb.out };
    const fields = linkFields(mine, kind, other.object);
    const f = fields.find((x) => holds((self.data as Record<string, unknown> | undefined)?.[x.key], other.id)) ?? fields[0];
    if (f) return { word: low(f.label) };
    const own = self.object !== other.object ? mine?.links?.find((w) => w.kind === kind && fits(w.to, other.object)) : undefined;
    if (own) return { word: low(own.label) };
    return { word: low(coreWord(kind)?.out ?? humanise(kind)) };
  }
  // A Place in a Place: only the direction tells ("contains").
  if (self.object === other.object && coreWord(kind)) return { word: low(coreWord(kind)!.in) };
  if (verb) return { word: verb.in };
  if (theirs && linkFields(theirs, kind, self.object).length) return { word: low(theirs.labelPlural), viaField: { object: other.object, plural: low(theirs.labelPlural), kind } };
  const own = self.object !== other.object ? mine?.links?.find((w) => w.kind === kind && fits(w.to, other.object)) : undefined;
  if (own) return { word: low(own.label) };
  const inverse = theirs?.links?.find((w) => w.kind === kind && w.inverseLabel)?.inverseLabel;
  if (inverse) return { word: low(inverse) };
  const core = coreWord(kind);
  if (core) return { word: low(core.in) };
  return { word: low(theirs?.labelPlural ?? humanise(kind)) };
}

/** The word on a line of the Links network, from the nearer record: its card's word ("works at", "with", "captain of"), one record named in the singular ("task", not "tasks"). */
export function lineWord(os: LifeOSContext, near: { object: string; data?: unknown }, far: { id: string; object: string }, kind: string, direction: 'out' | 'in'): string {
  const r = readLink(os, near, far, kind, direction);
  return r.viaField ? low(os.registry.objects.get(far.object)?.label ?? r.word) : r.word;
}
