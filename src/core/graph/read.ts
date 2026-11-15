import { z } from 'zod';
import type { LifeOSContext } from '../registry/context';
import type { AiToolDef } from '../registry/types';
import { resolveCandidates, clearMatch } from '../ai/lifeTools';
import { edgeLabel } from './edges';
import { humanise } from './words';
import { aspectsOf, isDetail, viewLinks, type ViewLink } from './view';
import type { LinkRef } from '../links';

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
  /** The word on the line, read from the nearer record ("played in", "venue"). */
  word?: string;
  /** Filing only guessed it: drawn dashed with a "?". */
  guessed?: boolean;
  /** The stored Link (tap a line for where it came from); null for a join (Priya in a game). */
  ref?: LinkRef | null;
  /** The record the line passes through (her Appearance), when it is a join. */
  via?: { id: string; object: string; title: string } | null;
}

/**
 * The network around one record for the Links screen (MODEL.md layer 5),
 * drawn from what Links shows (./view.ts: faces folded in, joins as one line),
 * so a game is one node, not the game, each Appearance and each Debt. Ring
 * one is everything linked to the centre; ring two is ranked by how many of
 * ring one each record shares (Karan, at two of Priya's games, before a game
 * only one of them was at), then by how recently it was linked, at most four
 * of one Object, and capped at `limit` nodes so a phone screen stays
 * readable. Records of hidden Objects (check-ins, readings) and details of
 * a meeting (an Appearance, the Debt for a share) are left out, the centre
 * apart.
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
  const order = (v: ViewLink) => os.links.get(v.ref?.linkId ?? '')?.createdAt ?? os.records.get(v.via?.id ?? v.other.id)?.createdAt ?? 0;
  let frontier = [centre.id];
  for (let hop = 1; hop <= hops && frontier.length; hop++) {
    const seen = new Map<string, { reach: number; latest: number }>();
    const pending: Array<[string, ViewLink]> = [];
    for (const id of frontier) {
      for (const v of viewLinks(os, id)) {
        if (hiddenObj(v.other.object) || (v.other.id !== centre.id && isDetail(os, v.other.id))) continue;
        pending.push([id, v]);
        if (nodes.has(v.other.id)) continue;
        const s = seen.get(v.other.id) ?? { reach: 0, latest: 0 };
        s.reach++;
        s.latest = Math.max(s.latest, order(v));
        seen.set(v.other.id, s);
      }
    }
    const ranked = [...seen.entries()].sort((a, b) => (hop === 1 ? 0 : b[1].reach - a[1].reach) || b[1].latest - a[1].latest).map(([id]) => id);
    const next: string[] = [];
    const perObject = new Map<string, number>();
    for (const id of ranked) {
      if (nodes.size >= limit) break;
      const n = node(id, hop);
      if (!n) continue;
      // Beyond ring one, a few of each Object, so people, places and games get the room.
      const k = (perObject.get(n.type) ?? 0) + 1;
      if (hop > 1 && k > RING_PER_OBJECT) continue;
      perObject.set(n.type, k);
      nodes.set(id, n);
      next.push(id);
    }
    for (const [near, v] of pending) {
      if (!nodes.has(v.other.id)) continue;
      // One line per pair, with the first word found (from the nearer record).
      const pair = [near, v.other.id].sort().join('|');
      if (!edges.has(pair)) edges.set(pair, { from: near, to: v.other.id, kind: v.kind, word: v.line, guessed: v.guessed, ref: v.ref, via: v.via });
    }
    frontier = next;
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

/** One link as the Links card shows it: the record at the other end, and enough to remove the Link and put it back. */
export interface LinkItem {
  /** The stored Link's id; for a join, `join:<its id>`. */
  linkId: string;
  fromId: string;
  toId: string;
  kind: string;
  direction: 'out' | 'in';
  id: string;
  type: string;
  title: string;
  module: string | null;
  /** Dated things (events, trips, payments, games): when (ms). */
  at: number | null;
  /** A payment's amount, signed by kind (income +, expense −). */
  amount: number | null;
  /** What the link carries: a join's own line and what folded into it ("₹450 · unpaid · Owes you ₹450"), or what else the other record points at. */
  context: string | null;
  /** The other record's own subtitle ("20:00 · 6-a-side"). */
  subtitle: string | null;
  /** Filing only guessed this Link (confidence under 1). */
  guessed: boolean;
  /** The other record is of a hidden Object (a habit check-in, a reading). */
  hidden: boolean;
  /** False for a join (Priya in a game): it is removed from the game, not here. */
  removable: boolean;
  /** The record the link passes through (her Appearance; the Venue of a Place), to open it. */
  via: { id: string; type: string; title: string } | null;
}
export interface LinkGroup {
  /** The link word as read from this record ("Works at"; on a Project, "Tasks"; on Priya, "Games"). */
  word: string;
  items: LinkItem[];
}

const DATED = new Set(['event', 'trip', 'transaction', 'game', 'workout', 'delivery']);

/** The titles of what a record's link Fields point at, leaving out `except` (the record the card is on). */
function fieldContext(os: LifeOSContext, id: string, except: Set<string>): string | null {
  const r = os.records.get(id);
  const def = r ? os.registry.objects.get(r.object) : undefined;
  if (!r || !def) return null;
  const out: string[] = [];
  for (const f of def.fields) {
    if (f.type !== 'link') continue;
    const v = (r.data as Record<string, unknown>)[f.key];
    for (const x of Array.isArray(v) ? v : v ? [v] : []) {
      if (except.has(String(x))) continue;
      const t = os.records.get(String(x))?.title;
      if (t && !out.includes(t)) out.push(t);
    }
  }
  return out.length ? out.slice(0, 2).join(' · ') : null;
}

/**
 * A record's Links grouped by how they read from it (MODEL.md layer 5,
 * *Links*; words in ./words.ts, one thing once in ./view.ts). Records
 * pointing here through their Field group under their Object ("Tasks"); when
 * one Object points here in several ways, each is named ("Games · captain"
 * beside "Games", the ones played in). Groups of hidden Objects (check-ins)
 * come last, the rest by size; inside a group dated things newest first,
 * then by title; one record once per group.
 */
export function linkGroups(os: LifeOSContext, id: string): LinkGroup[] {
  const self = os.records.get(id);
  if (!self) return [];
  const selfLabel = os.registry.objects.get(self.object)?.label.toLowerCase();
  const views = viewLinks(os, id);
  const me = new Set([id, ...aspectsOf(os, id)]);
  // One Object pointing here through two Fields that read alike ("transactions" for account and to account): name each but the plain one.
  const ways = new Map<string, Set<string>>();
  for (const v of views) if (v.viaField) ways.set(v.viaField.object, (ways.get(v.viaField.object) ?? new Set()).add(v.viaField.kind));
  const groups = new Map<string, LinkItem[]>();
  for (const v of views) {
    const f = v.viaField;
    const word = f && (ways.get(f.object)?.size ?? 0) > 1 && humanise(f.kind) !== selfLabel ? `${f.plural} · ${humanise(f.kind)}` : v.word;
    const rec = os.records.get(v.other.id);
    const def = os.registry.objects.get(v.other.object);
    let amount: number | null = null;
    if (v.other.object === 'transaction') {
      const d = rec?.data as { amount?: number; kind?: string } | undefined;
      if (typeof d?.amount === 'number') amount = d.kind === 'income' ? d.amount : d.kind === 'expense' ? -d.amount : d.amount;
    }
    const item: LinkItem = {
      linkId: v.ref?.linkId ?? v.key,
      fromId: v.ref?.fromId ?? '',
      toId: v.ref?.toId ?? '',
      kind: v.kind,
      direction: v.direction,
      id: v.other.id,
      type: v.other.object,
      title: v.other.title,
      module: def?.module ?? null,
      at: DATED.has(v.other.object) ? eventTime(os, v.other.id) : null,
      amount,
      context: v.details.length ? v.details.join(' · ') : v.direction === 'in' ? fieldContext(os, v.via?.id ?? v.other.id, me) : null,
      subtitle: rec?.subtitle && rec.subtitle !== v.other.title ? rec.subtitle : null,
      guessed: v.guessed,
      hidden: !!def?.hidden,
      removable: !!v.ref,
      via: v.via ? { id: v.via.id, type: v.via.object, title: v.via.title } : null,
    };
    const list = groups.get(word) ?? [];
    if (!list.some((i) => i.id === item.id)) list.push(item);
    groups.set(word, list);
  }
  return [...groups.entries()]
    .map(([word, items]) => ({ word, items: items.sort((a, b) => (b.at ?? -Infinity) - (a.at ?? -Infinity) || a.title.localeCompare(b.title)) }))
    .sort((a, b) => Number(a.items.every((i) => i.hidden)) - Number(b.items.every((i) => i.hidden)) || b.items.length - a.items.length || a.word.localeCompare(b.word));
}

/**
 * The records that join up the most, for Browse › Links, counted as Links
 * shows them (./view.ts). Ranked by breadth: each kind of linked record
 * counts up to five, so a card with 40 payments doesn't outrank a person
 * linked to games, a group and a trip; then by modules reached, then by
 * links. Hidden Objects (check-ins, readings, spaces) and records that are a
 * face or a meeting of others (a Player profile, a Venue, an Appearance)
 * neither count nor appear.
 */
export function mostLinked(os: LifeOSContext, limit = 20): Array<{ id: string; type: string; title: string; module: string | null; links: number; modules: number }> {
  const skip = [...os.registry.objects.values()].filter((d) => d.hidden || d.linkRole).map((d) => d.id);
  const ph = skip.map(() => '?').join(',') || "''";
  // Candidates by raw links, then counted as Links shows them.
  const cands = os.db.all<{ id: string; n: number }>(
    `SELECT r.id, COUNT(DISTINCT CASE WHEN r.id = l.from_id THEN l.to_id ELSE l.from_id END) AS n
     FROM links l JOIN records r ON r.id IN (l.from_id, l.to_id)
     WHERE l.deleted_at IS NULL AND l.kind <> 'mention' AND l.from_id <> l.to_id AND r.deleted_at IS NULL AND r.archived = 0 AND r.object NOT IN (${ph})
     GROUP BY r.id ORDER BY n DESC LIMIT ?`,
    [...skip, Math.max(limit * 4, 60)],
  );
  const hidden = (o: string) => !!os.registry.objects.get(o)?.hidden;
  const scored = cands.map(({ id }) => {
    const r = os.records.get(id)!;
    const others = new Map<string, string>();
    for (const v of viewLinks(os, id)) if (!hidden(v.other.object)) others.set(v.other.id, v.other.object);
    const perObject = new Map<string, number>();
    let score = 0;
    const mods = new Set<string>();
    for (const o of others.values()) {
      const n = (perObject.get(o) ?? 0) + 1;
      perObject.set(o, n);
      if (n <= 5) score++;
      mods.add(os.registry.objects.get(o)?.module ?? o);
    }
    return { id, type: r.object, title: r.title, module: os.registry.objects.get(r.object)?.module ?? null, links: others.size, modules: mods.size, score };
  });
  return scored
    .filter((x) => x.links > 0)
    .sort((a, b) => b.score - a.score || b.modules - a.modules || b.links - a.links || a.title.localeCompare(b.title))
    .slice(0, limit)
    .map(({ score: _score, ...x }) => x);
}
