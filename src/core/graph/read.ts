import { z } from 'zod';
import type { LifeOSContext } from '../registry/context';
import type { AiToolDef } from '../registry/types';
import { resolveCandidates, clearMatch } from '../ai/lifeTools';
import { edgeLabel } from './edges';
import type { LinkWordDef } from '../domain/types';

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
export interface GraphEdge {
  from: string;
  to: string;
  kind: string;
}

/**
 * The graph around one record for the graph view: breadth-first to `hops`,
 * nearest first, capped at `limit` nodes so a phone screen stays readable.
 */
export function egoGraph(os: LifeOSContext, centreId: string, opts: { hops?: number; limit?: number } = {}): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const hops = opts.hops ?? 2;
  const limit = opts.limit ?? 36;
  const centre = os.records.get(centreId);
  if (!centre) return { nodes: [], edges: [] };
  const node = (id: string, hop: number): GraphNode | null => {
    const e = os.records.get(id);
    return e ? { id: e.id, type: e.object, title: e.title, module: os.registry.objects.get(e.object)?.module ?? null, hop } : null;
  };
  const nodes = new Map<string, GraphNode>([[centre.id, node(centre.id, 0)!]]);
  const edges = new Map<string, GraphEdge>();
  let frontier = [centre.id];
  for (let hop = 1; hop <= hops && frontier.length; hop++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const r of os.links.forEntity(id)) {
        if (r.relation.kind === 'mention') continue;
        const other = r.other.id;
        if (!nodes.has(other)) {
          if (nodes.size >= limit) continue;
          const n = node(other, hop);
          if (!n) continue;
          nodes.set(other, n);
          next.push(other);
        }
        const key = r.relation.id;
        if (!edges.has(key)) edges.set(key, { from: r.relation.fromId, to: r.relation.toId, kind: r.relation.kind });
      }
    }
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
}
export interface LinkGroup {
  /** The link word as read from this record ("Works at"; on the Organisation, "People here"). */
  word: string;
  items: LinkItem[];
}

type Words = LinkWordDef[];
const fits = (to: string | string[], object: string) => to === 'any' || (Array.isArray(to) ? to.includes(object) : to === object);

/**
 * How a Link reads from this record: this Object's own label for the word when
 * it declares the word towards the other's Object (Place: *at* reads "Been
 * here"); else the other Object's inverse label for an incoming Link; else the
 * core word in that direction ("works at" from the Organisation: "People here").
 * Between two records of one Object (a Place in a Place) only the direction tells.
 */
export function linkWord(mine: Words, theirs: Words, kind: string, direction: 'out' | 'in', self: string, other: string): string {
  if (self !== other) {
    const own = mine.find((w) => w.kind === kind && fits(w.to, other));
    if (own) return own.label;
  }
  if (direction === 'in') {
    const inverse = theirs.find((w) => w.kind === kind && w.inverseLabel)?.inverseLabel;
    if (inverse) return inverse;
  }
  return edgeLabel(kind.replace(/ /g, '_'), direction);
}

/**
 * A record's Links grouped by link word (MODEL.md layer 5, *Links*). The word
 * is this Object's own label for an outgoing Link, the other Object's inverse
 * label for an incoming one, else the core word. Mentions are left out.
 * Groups with more first; inside a group dated things newest first, then by title.
 */
export function linkGroups(os: LifeOSContext, id: string): LinkGroup[] {
  const self = os.records.get(id);
  if (!self) return [];
  const mine = os.registry.objects.get(self.object)?.links ?? [];
  const groups = new Map<string, LinkItem[]>();
  for (const r of os.links.forEntity(id)) {
    if (r.relation.kind === 'mention') continue;
    const o = r.other;
    const def = os.registry.objects.get(o.object);
    const word = linkWord(mine, def?.links ?? [], r.relation.kind, r.direction, self.object, o.object);
    const dated = o.object === 'event' || o.object === 'trip' || o.object === 'transaction';
    let amount: number | null = null;
    if (o.object === 'transaction') {
      const d = os.records.get(o.id)?.data as { amount?: number; kind?: string } | undefined;
      if (typeof d?.amount === 'number') amount = d.kind === 'income' ? d.amount : d.kind === 'expense' ? -d.amount : d.amount;
    }
    const item: LinkItem = { linkId: r.relation.id, fromId: r.relation.fromId, toId: r.relation.toId, kind: r.relation.kind, direction: r.direction, id: o.id, type: o.object, title: o.title, module: def?.module ?? null, at: dated ? eventTime(os, o.id) : null, amount };
    groups.set(word, [...(groups.get(word) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([word, items]) => ({ word, items: items.sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || a.title.localeCompare(b.title)) }))
    .sort((a, b) => b.items.length - a.items.length || a.word.localeCompare(b.word));
}

/** The records with the most Links (mentions left out), for Browse › Links. */
export function mostLinked(os: LifeOSContext, limit = 20): Array<{ id: string; type: string; title: string; module: string | null; links: number }> {
  return os.db
    .all<{ id: string; object: string; title: string; n: number }>(
      `SELECT r.id, r.object, r.title, COUNT(*) AS n
       FROM links l JOIN records r ON r.id IN (l.from_id, l.to_id)
       JOIN records o ON o.id = CASE WHEN r.id = l.from_id THEN l.to_id ELSE l.from_id END
       WHERE l.deleted_at IS NULL AND l.kind <> 'mention' AND r.deleted_at IS NULL AND o.deleted_at IS NULL AND r.archived = 0
       GROUP BY r.id ORDER BY n DESC, r.title LIMIT ?`,
      [limit],
    )
    .map((r) => ({ id: r.id, type: r.object, title: r.title, module: os.registry.objects.get(r.object)?.module ?? null, links: r.n }));
}
