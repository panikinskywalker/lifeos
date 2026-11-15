import { z } from 'zod';
import type { LifeOSContext } from '../registry/context';
import type { AiToolDef } from '../registry/types';
import { resolveCandidates, clearMatch } from '../ai/lifeTools';
import { edgeLabel } from './edges';
import { humanise, lineWord, readLink, type Reading } from './words';

/**
 * Reading the life graph (docs/GRAPH.md §4): a record's neighbours with the
 * link words, events newest first with their date and who/where. Used by
 * retrieval before every answer and by the `connections` tool.
 */

export interface Neighbour {
  id: string;
  type: string;
  title: string;
  /** How it reads from the record: "With", "Part of", "Was at", "Works at"… */
  label: string;
  kind: string;
  /** For events: when it happened (ms). */
  at: number | null;
  /** For events: the other people/places on it ("with Mike · at Canoe"). */
  context: string | null;
}

const eventTime = (os: LifeOSContext, id: string): number | null => {
  const e = os.records.get(id);
  if (!e) return null;
  const d = e.data as { startAt?: number; startDate?: string; date?: string };
  return d.startAt ?? (d.startDate ? Date.parse(d.startDate) : d.date ? Date.parse(d.date) : e.occurredAt ?? null);
};

/** Neighbours of a record, dated things first (newest first), then the rest by link word. */
export function neighbours(os: LifeOSContext, id: string, opts: { kind?: string; limit?: number } = {}): Neighbour[] {
  const out: Neighbour[] = [];
  for (const r of os.links.forEntity(id, opts.kind)) {
    const o = r.other;
    const dated = o.object === 'event' || o.object === 'trip' || o.object === 'transaction';
    let context: string | null = null;
    if (dated) {
      const around = os.links
        .forEntity(o.id)
        .filter((x) => x.other.id !== id)
        .slice(0, 5)
        .map((x) => `${edgeLabel(x.relation.kind, x.direction).toLowerCase()} ${x.other.title}`);
      context = around.length ? around.join(' · ') : null;
    }
    out.push({ id: o.id, type: o.object, title: o.title, label: edgeLabel(r.relation.kind, r.direction), kind: r.relation.kind, at: dated ? eventTime(os, o.id) : null, context });
  }
  out.sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || a.label.localeCompare(b.label));
  return out.slice(0, opts.limit ?? 40);
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/** One line per neighbour for the model's context. */
export function describeNeighbours(os: LifeOSContext, id: string, limit = 10): string[] {
  return neighbours(os, id, { limit }).map((n) => `${n.label.toLowerCase()} ${n.title}${n.at ? ` (${day(n.at)})` : ''}${n.context ? ` — ${n.context}` : ''}`);
}

export const graphReadTools: AiToolDef[] = [
  {
    name: 'connections',
    description: 'Everything linked to a person, place, trip or thing — events newest first with dates and who/where. Use for "when did I last see Kendal?", "who was on the Canada trip?", "where does Karan work?".',
    input: z.object({ name: z.string().optional(), id: z.string().optional(), kind: z.string().optional().describe('only this link word, e.g. with, works_at'), limit: z.number().optional() }),
    run: async (input, os) => {
      const i = input as { name?: string; id?: string; kind?: string; limit?: number };
      const id = i.id ?? (i.name ? clearMatch(resolveCandidates(os, i.name))?.id : undefined);
      if (!id) return { error: i.name ? `no clear record called ${i.name}` : 'name or id required' };
      const e = os.records.get(id)!;
      return { record: e.title, type: e.object, connections: neighbours(os, id, { kind: i.kind, limit: i.limit ?? 20 }).map((n) => ({ ...n, at: n.at ? day(n.at) : undefined })) };
    },
  },
];

export interface GraphNode {
  id: string;
  type: string;
  title: string;
  module: string | null;
  /** 0 = the centre, 1 = linked to it, 2 = linked to those. */
  hop: number;
}
const RING_PER_OBJECT = 4;

export interface GraphEdge {
  from: string;
  to: string;
  kind: string;
  /** The word on the line, read from the nearer record (./words.ts lineWord). */
  word?: string;
}

/**
 * The network around one record for the Links screen (MODEL.md layer 5).
 * Ring one is everything linked to the centre; ring two is ranked by how many
 * of ring one each record shares (Karan, at two of Priya's games, before a
 * game only one of them was at), then by how recently it was linked, at most
 * four of one Object, and capped at `limit` nodes so a phone screen stays readable. Mentions and
 * records of hidden Objects (check-ins, readings) are left out, the centre
 * apart. Each line carries its word.
 */
export function egoGraph(os: LifeOSContext, centreId: string, opts: { hops?: number; limit?: number } = {}): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const hops = opts.hops ?? 2;
  const limit = opts.limit ?? 36;
  const centre = os.records.get(centreId);
  if (!centre) return { nodes: [], edges: [] };
  const hiddenObj = (o: string) => !!os.registry.objects.get(o)?.hidden;
  const node = (id: string, hop: number): GraphNode | null => {
    const e = os.records.get(id);
    return e ? { id: e.id, type: e.object, title: e.title, module: os.registry.objects.get(e.object)?.module ?? null, hop } : null;
  };
  const nodes = new Map<string, GraphNode>([[centre.id, node(centre.id, 0)!]]);
  const edges = new Map<string, GraphEdge>();
  const addEdge = (near: string, r: ReturnType<LifeOSContext['links']['forEntity']>[number]) => {
    if (edges.has(r.relation.id)) return;
    const n = os.records.get(near);
    edges.set(r.relation.id, { from: r.relation.fromId, to: r.relation.toId, kind: r.relation.kind, word: n ? lineWord(os, n, r.other, r.relation.kind, r.direction) : undefined });
  };
  let frontier = [centre.id];
  for (let hop = 1; hop <= hops && frontier.length; hop++) {
    // Every candidate for this ring, with how many of the last ring reach it.
    const seen = new Map<string, { reach: number; latest: number }>();
    const pending: Array<[string, ReturnType<LifeOSContext['links']['forEntity']>[number]]> = [];
    for (const id of frontier) {
      for (const r of os.links.forEntity(id)) {
        if (r.relation.kind === 'mention' || hiddenObj(r.other.object)) continue;
        pending.push([id, r]);
        if (nodes.has(r.other.id)) continue;
        const s = seen.get(r.other.id) ?? { reach: 0, latest: 0 };
        s.reach++;
        s.latest = Math.max(s.latest, r.relation.createdAt);
        seen.set(r.other.id, s);
      }
    }
    const ranked = [...seen.entries()].sort((a, b) => (hop === 1 ? 0 : b[1].reach - a[1].reach) || b[1].latest - a[1].latest).map(([id]) => id);
    const next: string[] = [];
    const perObject = new Map<string, number>();
    for (const id of ranked) {
      if (nodes.size >= limit) break;
      const n = node(id, hop);
      if (!n) continue;
      // Beyond ring one, a few of each Object (four of the other players' Appearances, not twenty), so people, places and games get the room.
      const k = (perObject.get(n.type) ?? 0) + 1;
      if (hop > 1 && k > RING_PER_OBJECT) continue;
      perObject.set(n.type, k);
      nodes.set(id, n);
      next.push(id);
    }
    for (const [near, r] of pending) if (nodes.has(r.other.id)) addEdge(near, r);
    frontier = next;
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()].filter((e) => nodes.has(e.from) && nodes.has(e.to)) };
}

/** One Link as the Links card shows it: the other record, and enough to remove the Link and put it back. */
export interface LinkItem {
  linkId: string;
  fromId: string;
  toId: string;
  kind: string;
  direction: 'out' | 'in';
  id: string;
  type: string;
  title: string;
  module: string | null;
  /** Dated things (events, trips, payments): when (ms). */
  at: number | null;
  /** A payment's amount, signed by kind (income +, expense −). */
  amount: number | null;
  /** What else the other record points at, when it joins things up (an Appearance on a Game: "Priya"). */
  context: string | null;
  /** The other record's own subtitle ("₹150 · unpaid"). */
  subtitle: string | null;
  /** Filing only guessed this Link (confidence under 1). */
  guessed: boolean;
  /** The other record is of a hidden Object (a habit check-in, a reading). */
  hidden: boolean;
}
export interface LinkGroup {
  /** The link word as read from this record ("Works at"; on the Organisation, "People here"; on a Project, "Tasks"). */
  word: string;
  items: LinkItem[];
}

const DATED = new Set(['event', 'trip', 'transaction', 'game', 'workout', 'delivery']);

/** The titles of what a record's link Fields point at, leaving out `except` (the record the card is on). */
function fieldContext(os: LifeOSContext, id: string, except: string): string | null {
  const r = os.records.get(id);
  const def = r ? os.registry.objects.get(r.object) : undefined;
  if (!r || !def) return null;
  const out: string[] = [];
  for (const f of def.fields) {
    if (f.type !== 'link') continue;
    const v = (r.data as Record<string, unknown>)[f.key];
    for (const x of Array.isArray(v) ? v : v ? [v] : []) {
      if (String(x) === except) continue;
      const t = os.records.get(String(x))?.title;
      if (t && !out.includes(t)) out.push(t);
    }
  }
  return out.length ? out.slice(0, 2).join(' · ') : null;
}

/**
 * A record's Links grouped by how they read from it (MODEL.md layer 5,
 * *Links*; words in ./words.ts). Records pointing here through their Field
 * group under their Object ("Appearances"); when one Object points here
 * through more than one Field, each is named ("Games · captain", "Games ·
 * fronted by"). Mentions are left out (Mentioned in has them). Groups of
 * hidden Objects (check-ins, readings) come last, the rest by size; inside a
 * group dated things newest first, then by title.
 */
export function linkGroups(os: LifeOSContext, id: string): LinkGroup[] {
  const self = os.records.get(id);
  if (!self) return [];
  const selfLabel = os.registry.objects.get(self.object)?.label.toLowerCase();
  const read: Array<{ reading: Reading; item: LinkItem }> = [];
  for (const r of os.links.forEntity(id)) {
    if (r.relation.kind === 'mention') continue;
    const o = r.other;
    const def = os.registry.objects.get(o.object);
    const reading = readLink(os, self, o, r.relation.kind, r.direction);
    let amount: number | null = null;
    const rec = os.records.get(o.id);
    if (o.object === 'transaction') {
      const d = rec?.data as { amount?: number; kind?: string } | undefined;
      if (typeof d?.amount === 'number') amount = d.kind === 'income' ? d.amount : d.kind === 'expense' ? -d.amount : d.amount;
    }
    read.push({
      reading,
      item: {
        linkId: r.relation.id, fromId: r.relation.fromId, toId: r.relation.toId, kind: r.relation.kind, direction: r.direction,
        id: o.id, type: o.object, title: o.title, module: def?.module ?? null,
        at: DATED.has(o.object) ? eventTime(os, o.id) : null, amount,
        context: reading.viaField ? fieldContext(os, o.id, id) : null,
        subtitle: rec?.subtitle && rec.subtitle !== o.title ? rec.subtitle : null,
        guessed: (r.relation.confidence ?? 1) < 1,
        hidden: !!def?.hidden,
      },
    });
  }
  // One Object pointing here through several Fields: name each but the one that is just this Object's name.
  const kindsBy = new Map<string, Set<string>>();
  for (const { reading: x } of read) if (x.viaField) kindsBy.set(x.viaField.object, (kindsBy.get(x.viaField.object) ?? new Set()).add(x.viaField.kind));
  const groups = new Map<string, LinkItem[]>();
  for (const { reading: x, item } of read) {
    const v = x.viaField;
    const word = v && (kindsBy.get(v.object)?.size ?? 0) > 1 && humanise(v.kind) !== selfLabel ? `${v.plural} · ${humanise(v.kind)}` : x.word;
    const list = groups.get(word) ?? [];
    if (!list.some((i) => i.id === item.id)) list.push(item);
    groups.set(word, list);
  }
  return [...groups.entries()]
    .map(([word, items]) => ({ word, items: items.sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || a.title.localeCompare(b.title)) }))
    .sort((a, b) => Number(a.items.every((i) => i.hidden)) - Number(b.items.every((i) => i.hidden)) || b.items.length - a.items.length || a.word.localeCompare(b.word));
}

/**
 * The records that join up the most, for Browse › Links. Ranked by breadth:
 * each kind of linked record counts up to five, so a card with 40 payments
 * doesn't outrank a person linked to games, debts, a group and a trip; then
 * by modules reached, then by links. Hidden Objects (check-ins, readings,
 * spaces) neither count nor appear, so a habit's 50 check-ins don't top it.
 */
export function mostLinked(os: LifeOSContext, limit = 20): Array<{ id: string; type: string; title: string; module: string | null; links: number; modules: number }> {
  const hidden = [...os.registry.objects.values()].filter((d) => d.hidden).map((d) => d.id);
  const ph = hidden.map(() => '?').join(',') || "''";
  const rows = os.db.all<{ id: string; object: string; title: string; other: string; oobj: string }>(
    `SELECT DISTINCT r.id, r.object, r.title, o.id AS other, o.object AS oobj
     FROM links l JOIN records r ON r.id IN (l.from_id, l.to_id)
     JOIN records o ON o.id = CASE WHEN r.id = l.from_id THEN l.to_id ELSE l.from_id END
     WHERE l.deleted_at IS NULL AND l.kind <> 'mention' AND r.id <> o.id AND r.deleted_at IS NULL AND o.deleted_at IS NULL AND r.archived = 0
       AND r.object NOT IN (${ph}) AND o.object NOT IN (${ph})`,
    [...hidden, ...hidden],
  );
  const by = new Map<string, { id: string; type: string; title: string; others: Set<string>; mods: Set<string>; perObject: Map<string, number>; score: number }>();
  for (const x of rows) {
    const e = by.get(x.id) ?? { id: x.id, type: x.object, title: x.title, others: new Set(), mods: new Set(), perObject: new Map(), score: 0 };
    if (e.others.has(x.other)) continue;
    e.others.add(x.other);
    e.mods.add(os.registry.objects.get(x.oobj)?.module ?? x.oobj);
    const n = (e.perObject.get(x.oobj) ?? 0) + 1;
    e.perObject.set(x.oobj, n);
    if (n <= 5) e.score++;
    by.set(x.id, e);
  }
  return [...by.values()]
    .sort((a, b) => b.score - a.score || b.mods.size - a.mods.size || b.others.size - a.others.size || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map((e) => ({ id: e.id, type: e.type, title: e.title, module: os.registry.objects.get(e.type)?.module ?? null, links: e.others.size, modules: e.mods.size }));
}
