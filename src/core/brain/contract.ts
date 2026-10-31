import type { LifeOSContext } from '../registry/context';

/**
 * The brain's contract (docs/MODEL.md layer 8, *The contract*; docs/PLUGINS.md).
 * A module offers what might need you as plain Candidates, found in code from
 * its own records; core keeps the limits, asks Claude once per pass and files
 * the Nudges into To check. Nothing here imports a module.
 */

export type NudgeKind = 'running out' | 'going off' | 'due' | 'coming up';

/** done, undo? · is this right? · shall I? */
export type NudgeShape = 'done' | 'check' | 'ask';

/** The To check filing kind for each shape. */
export const NUDGE_FILING: Record<NudgeShape, string> = { done: 'nudge-done', check: 'nudge-check', ask: 'nudge-ask' };
export const NUDGE_KINDS = Object.values(NUDGE_FILING);

/** A value that may leave the phone: plain, no blobs. */
export type Plain = string | number | boolean | null | string[];

/** A slot Claude fills (gift ideas, the wish, tonight's dish), kept in the learned store under `key`. */
export interface Ask {
  /** Made by the module from what the answer rests on: the same key is never asked twice. */
  key: string;
  /** What is filled, in your words ("gift ideas", "wish", "dish"). */
  slot: string;
  /** What Claude is asked, in one line. */
  prompt: string;
  /** The records it rests on (an Ask on a Candidate also has the Candidate's). */
  record?: Record<string, Plain>;
  /** Shown as a line of the Morning brief once filled (Home's Cook tonight; not gift ideas). */
  brief?: boolean;
  /** What a brief line for it opens (Home's Cook tonight → the Home board). */
  route?: string;
  /** A list ("gift ideas") or one text ("wish"). */
  list?: boolean;
}

export interface Candidate {
  /** Stable while it is the same notice ("crm:bday:<id>:2026"); a key is filed once. */
  key: string;
  kind: NudgeKind;
  shape: NudgeShape;
  /** The record the card and the brief line open. */
  subjectId?: string | null;
  /** Or a screen to open ("/board/turf/dues"). */
  route?: string;
  title: string;
  /** Code's own words, used when Claude is not asked (no key, over budget, offline). */
  line: string;
  /** The only thing that leaves the phone: the record's fields as plain values (no phone numbers, no messages). */
  record: Record<string, Plain>;
  /** Urgent ones notify first (going off today, a match short tomorrow, a birthday today). */
  urgent?: boolean;
  /** Lower is sooner, within a module. */
  rank?: number;
  /** The main verb on the card: ask ("Send in WhatsApp"), check ("Right"). */
  yes?: string;
  /** Slots Claude fills along with it. */
  asks?: Ask[];
  /** Read only by the module's act. */
  payload?: unknown;
}

export type NudgeState = 'open' | 'yes' | 'no' | 'later' | 'undone';

export interface Nudge {
  id: string;
  key: string;
  module: string;
  kind: NudgeKind;
  shape: NudgeShape;
  passId: string;
  filingId: string | null;
  recordId: string | null;
  route: string | null;
  title: string;
  /** As it reads (Claude's words, or code's). */
  line: string;
  yes: string | null;
  urgent: boolean;
  payload: unknown;
  /** What a done nudge's Undo needs (from act 'apply'). */
  undo: unknown;
  state: NudgeState;
  notifiedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export type ActVerb = 'apply' | 'yes' | 'no' | 'undo';

/** What an act may hand back to the card: a link to open (tel:, WhatsApp, an app). */
export interface ActResult {
  open?: string;
}

export interface BrainDef {
  candidates(os: LifeOSContext, now: number): Candidate[];
  /** Fills that are not nudges (Home's Cook tonight). */
  asks?(os: LifeOSContext, now: number): Ask[];
  /** apply (done shape, at filing; returns what undo needs) · yes · no (Not this) · undo. */
  act?(os: LifeOSContext, verb: ActVerb, nudge: Nudge): unknown;
  /** The module's starting rules, kept as Skills. */
  skills?: Array<{ name: string; body: string }>;
}

/** A short stable hash for keys made from a set of things (djb2, base 36). */
export function keyHash(parts: string[]): string {
  let h = 5381;
  for (const ch of [...parts].sort().join('|')) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
