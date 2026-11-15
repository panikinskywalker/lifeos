import type { Field, ObjectDef } from '../domain/types';
import type { LifeOSContext } from '../registry/context';
import { EDGE_WORDS } from './edges';

/**
 * How a Link reads (MODEL.md layer 5, *Links*). Most Links are made by a link
 * Field (a Task's Project, a Game's captain), so the Field says what the Link
 * means: from the record that holds the Field it reads as the Field's label
 * ("Project"); from the record it points at, it is one of that Object's
 * records ("Tasks"), never the Field's word read backwards ("Project" on the
 * Project). Links that no Field made use the Object's declared words, then
 * core's words (with → "Was at"), then the other Object's name.
 */

const fits = (to: Field['linkTo'] | string | string[] | undefined, object: string) => to === undefined || to === 'any' || (Array.isArray(to) ? to.includes(object) : to === object);

/** "toAccount" → "to account", "kept_in" → "kept in". */
export const humanise = (kind: string) => kind.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().trim();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const coreWord = (kind: string) => EDGE_WORDS[kind] ?? EDGE_WORDS[kind.replace(/ /g, '_')];

/** The link Fields on `object` that make Links of this word to `other` (a Game has two for *captain*). */
export function linkFields(def: ObjectDef | undefined, kind: string, other?: string): Field[] {
  return (def?.fields ?? []).filter((f) => f.type === 'link' && f.linkWord === kind && (!other || fits(f.linkTo, other)));
}

/** Does a link Field's value hold this record id (one id, or a list)? */
export const holds = (value: unknown, id: string) => (Array.isArray(value) ? value.map(String).includes(id) : value != null && String(value) === id);

export interface Reading {
  /** The group's word on the Links card. */
  word: string;
  /** Set when the word is the other Object's name because its Field points here; the card may qualify it. */
  viaField?: { object: string; plural: string; kind: string };
}

/**
 * How one Link reads from `self` towards `other`. `data` is the holding
 * record's data when `self` holds the Link (to name the right one of two
 * Fields with one word: Captain, team A or B).
 */
export function readLink(os: LifeOSContext, self: { object: string; data?: unknown }, other: { id: string; object: string }, kind: string, direction: 'out' | 'in'): Reading {
  const mine = os.registry.objects.get(self.object);
  const theirs = os.registry.objects.get(other.object);
  if (direction === 'out') {
    const fields = linkFields(mine, kind, other.object);
    const f = fields.find((x) => holds((self.data as Record<string, unknown> | undefined)?.[x.key], other.id)) ?? fields[0];
    if (f) return { word: f.label };
    const own = self.object !== other.object ? mine?.links?.find((w) => w.kind === kind && fits(w.to, other.object)) : undefined;
    if (own) return { word: own.label };
    return { word: coreWord(kind)?.out ?? cap(humanise(kind)) };
  }
  // A Place in a Place: only the direction tells ("Contains").
  if (self.object === other.object && coreWord(kind)) return { word: coreWord(kind)!.in };
  if (theirs && linkFields(theirs, kind, self.object).length) return { word: theirs.labelPlural, viaField: { object: other.object, plural: theirs.labelPlural, kind } };
  const own = self.object !== other.object ? mine?.links?.find((w) => w.kind === kind && fits(w.to, other.object)) : undefined;
  if (own) return { word: own.label };
  const inverse = theirs?.links?.find((w) => w.kind === kind && w.inverseLabel)?.inverseLabel;
  if (inverse) return { word: inverse };
  const core = coreWord(kind);
  if (core) return { word: core.in };
  return { word: theirs?.labelPlural ?? cap(humanise(kind)) };
}

/**
 * The word on a line of the Links network, from the nearer record: what the
 * far record is to it ("venue", "project") or, for a Link made by the far
 * record's Field, the role the near one plays there ("captain", "player").
 */
export function lineWord(os: LifeOSContext, near: { object: string; data?: unknown }, far: { id: string; object: string }, kind: string, direction: 'out' | 'in'): string {
  if (direction === 'out') return readLink(os, near, far, kind, 'out').word.toLowerCase();
  const core = coreWord(kind);
  if (core && !linkFields(os.registry.objects.get(far.object), kind, near.object).length) return core.in.toLowerCase();
  // A Debt's *person* Field, seen from the Person: the line says "debt", not "person".
  const role = humanise(kind);
  const nearLabel = os.registry.objects.get(near.object)?.label.toLowerCase();
  return role === nearLabel ? (os.registry.objects.get(far.object)?.label.toLowerCase() ?? role) : role;
}
