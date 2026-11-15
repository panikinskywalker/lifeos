import type { LifeOSContext } from '../registry/context';
import type { LinkRef } from '../links';
import { humanise, lineWord, readLink, type Reading } from './words';

/**
 * What Links shows around a record (MODEL.md layer 5, *Links*): one thing
 * once. Records that are another face of a thing (a Player profile of Priya,
 * a Venue of a Place: `ObjectDef.linkRole.aspectOf`) fold into it; a record
 * that is the meeting of two (an Appearance, Priya in a game: `joins`) is
 * shown as one link between them, and what is about that meeting (the Debt
 * for her share) folds into that link. So Priya's Links say "Games: Sat 17
 * Oct", not the game, her Appearance and a Debt titled after the turf.
 */

export interface ViewLink {
  /** Unique within one record's view. */
  key: string;
  /** The record shown at the other end (a Place, never its Venue). */
  other: { id: string; object: string; title: string };
  /** The group word on the card ("Games", "Venue", "Players"). */
  word: string;
  viaField?: Reading['viaField'];
  /** The word on the network line, from this record ("played in", "venue"). */
  line: string;
  /** The stored Link, to remove it; null for a join (removing Priya from a game is the game's to do). */
  ref: LinkRef | null;
  /** The record the link passes through: the join (her Appearance) or the face (the Venue). */
  via: { id: string; object: string; title: string } | null;
  /** The join's own line and what folded into it ("₹450 · unpaid", "Owes you ₹450"). */
  details: string[];
  direction: 'out' | 'in';
  kind: string;
  guessed: boolean;
}

type Role = NonNullable<NonNullable<ReturnType<LifeOSContext['registry']['objects']['get']>>['linkRole']>;
const roleOf = (os: LifeOSContext, object: string): Role | undefined => os.registry.objects.get(object)?.linkRole;
const isJoin = (r: Role | undefined): r is { joins: [string, string]; words?: Record<string, string> } => !!r && 'joins' in r;
const isAspect = (r: Role | undefined): r is { aspectOf: string } => !!r && 'aspectOf' in r;
const val = (data: unknown, key: string) => {
  const v = (data as Record<string, unknown> | undefined)?.[key];
  return v == null || v === '' ? null : String(v);
};

/** The thing a record is a face of (a Player profile → its Person); itself otherwise. */
export function canonicalId(os: LifeOSContext, id: string): string {
  let cur = id;
  for (let i = 0; i < 3; i++) {
    const r = os.records.get(cur);
    const role = r ? roleOf(os, r.object) : undefined;
    const next = isAspect(role) ? val(r!.data, role.aspectOf) : null;
    if (!next || !os.records.get(next)) return cur;
    cur = next;
  }
  return cur;
}

/** The records that are faces of this one (Priya's Player profile). */
export function aspectsOf(os: LifeOSContext, id: string): string[] {
  return os.links
    .forEntity(id)
    .filter((l) => {
      if (l.direction !== 'in') return false;
      const role = roleOf(os, l.other.object);
      return isAspect(role) && val(os.records.get(l.other.id)?.data, role.aspectOf) === id;
    })
    .map((l) => l.other.id);
}

/** A join record's two ends, by Field. */
function endsOf(os: LifeOSContext, joinId: string): Array<[string, string]> {
  const j = os.records.get(joinId);
  const role = j ? roleOf(os, j.object) : undefined;
  if (!isJoin(role)) return [];
  return role.joins.map((f) => [f, val(j!.data, f)] as [string, string | null]).filter((x): x is [string, string] => !!x[1]);
}

/** The join a record is about, when it is not one of its ends (a Debt for an Appearance). */
function joinOfPart(os: LifeOSContext, id: string): string | null {
  for (const l of os.links.forEntity(id)) {
    if (!isJoin(roleOf(os, l.other.object))) continue;
    if (!endsOf(os, l.other.id).some(([, e]) => e === id)) return l.other.id;
  }
  return null;
}

/** The lines of what folded into a join (the Debt for the share). */
function partsOf(os: LifeOSContext, joinId: string): string[] {
  const ends = new Set(endsOf(os, joinId).map(([, e]) => e));
  return os.links
    .forEntity(joinId)
    .filter((l) => l.relation.kind !== 'mention' && !ends.has(l.other.id))
    .map((l) => os.records.get(l.other.id)?.subtitle ?? null)
    .filter((s): s is string => !!s);
}

/** Every link around a record as Links shows it: faces folded in, joins as one link, mentions left out. */
export function viewLinks(os: LifeOSContext, id: string): ViewLink[] {
  const centre = os.records.get(id);
  if (!centre) return [];
  const centreIsJoin = isJoin(roleOf(os, centre.object));
  const sources = new Set([id, ...aspectsOf(os, id)]);
  const out: ViewLink[] = [];
  const keys = new Set<string>();
  const later: Array<{ ends: string[]; line: string | null; fallback: ReturnType<LifeOSContext['links']['forEntity']>[number]; self: { object: string; data?: unknown } }> = [];
  const push = (v: ViewLink) => {
    if (keys.has(v.key)) return;
    keys.add(v.key);
    out.push(v);
  };
  for (const s of sources) {
    const self = os.records.get(s);
    if (!self) continue;
    for (const r of os.links.forEntity(s)) {
      if (r.relation.kind === 'mention' || sources.has(r.other.id)) continue;
      const o = r.other;
      const role = roleOf(os, o.object);
      const guessed = (r.relation.confidence ?? 1) < 1;
      // A join with this record at one end: the record at the other end.
      if (isJoin(role) && !centreIsJoin) {
        const ends = endsOf(os, o.id);
        const mine = ends.find(([, e]) => sources.has(e));
        const theirs = ends.find(([f]) => f !== mine?.[0]);
        if (mine && theirs) {
          const e = os.records.get(canonicalId(os, theirs[1]));
          if (!e || sources.has(e.id)) continue;
          const j = os.records.get(o.id)!;
          const jdef = os.registry.objects.get(o.object);
          push({
            key: `join:${o.id}`,
            other: { id: e.id, object: e.object, title: e.title },
            // From Priya, the game reads by its Field's word ("played in"); from the game, Priya by the join's word for her ("players").
            word: (role.words?.[theirs[0]] ?? humanise(jdef?.fields.find((f) => f.key === theirs[0])?.linkWord ?? theirs[0])).toLowerCase(),
            line: humanise(jdef?.fields.find((f) => f.key === theirs[0])?.linkWord ?? theirs[0]),
            ref: null,
            via: { id: j.id, object: j.object, title: j.title },
            details: [j.subtitle, ...partsOf(os, j.id)].filter((x): x is string => !!x),
            direction: r.direction,
            kind: r.relation.kind,
            guessed,
          });
          continue;
        }
      }
      // About a join this record is an end of (the Debt for Priya's share): it is in that join's link.
      const pj = joinOfPart(os, o.id);
      if (pj && endsOf(os, pj).some(([, e]) => sources.has(e))) continue;
      // About someone else's share in a game shown here (what you owe Priya for the game she fronted): held to fold into that game's row.
      if (pj) {
        later.push({ ends: endsOf(os, pj).map(([, e]) => canonicalId(os, e)), line: os.records.get(o.id)?.subtitle ?? null, fallback: r, self });
        continue;
      }
      // A face of something: show the thing.
      let shown = { id: o.id, object: o.object, title: o.title };
      if (isAspect(role)) {
        const c = canonicalId(os, o.id);
        if (sources.has(c)) continue;
        const cr = os.records.get(c);
        if (cr) shown = { id: cr.id, object: cr.object, title: cr.title };
      }
      const reading = readLink(os, self, o, r.relation.kind, r.direction);
      push({
        key: r.relation.id,
        other: shown,
        word: reading.word,
        viaField: reading.viaField,
        line: lineWord(os, self, o, r.relation.kind, r.direction),
        ref: { linkId: r.relation.id, fromId: r.relation.fromId, toId: r.relation.toId, kind: r.relation.kind },
        via: shown.id !== o.id ? { id: o.id, object: o.object, title: o.title } : null,
        details: [],
        direction: r.direction,
        kind: r.relation.kind,
        guessed,
      });
    }
  }
  for (const p of later) {
    // Only into a game row (a join): on a group, a member row would pin "You owe ₹500" on the wrong person.
    const row = out.find((v) => !v.ref && p.ends.includes(v.other.id));
    if (row) {
      if (p.line && !row.details.includes(p.line)) row.details.push(p.line);
      continue;
    }
    // Nothing here to fold it into: it stays a link of its own.
    const r = p.fallback;
    const reading = readLink(os, p.self, r.other, r.relation.kind, r.direction);
    push({
      key: r.relation.id,
      other: { id: r.other.id, object: r.other.object, title: r.other.title },
      word: reading.word,
      viaField: reading.viaField,
      line: lineWord(os, p.self, r.other, r.relation.kind, r.direction),
      ref: { linkId: r.relation.id, fromId: r.relation.fromId, toId: r.relation.toId, kind: r.relation.kind },
      via: null,
      details: [],
      direction: r.direction,
      kind: r.relation.kind,
      guessed: (r.relation.confidence ?? 1) < 1,
    });
  }
  return out;
}

/**
 * A record that is a detail of a meeting rather than a thing of its own: the
 * meeting itself (an Appearance) or what is about it (a Debt for that share).
 * The Links network draws these as lines and row details, never as nodes.
 */
export function isDetail(os: LifeOSContext, id: string): boolean {
  const r = os.records.get(id);
  if (!r) return false;
  return isJoin(roleOf(os, r.object)) || !!joinOfPart(os, id);
}
