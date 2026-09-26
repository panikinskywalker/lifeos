import { z } from 'zod';
import type { LifeOSContext } from '../registry/context';
import type { AiToolDef } from '../registry/types';
import { resolveCandidates, clearMatch } from '../ai/lifeTools';
import { edgeLabel } from './edges';

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
  const e = os.entities.get(id);
  if (!e) return null;
  const d = e.data as { startAt?: number; startDate?: string; date?: string };
  return d.startAt ?? (d.startDate ? Date.parse(d.startDate) : d.date ? Date.parse(d.date) : e.occurredAt ?? null);
};

/** Neighbours of a record, dated things first (newest first), then the rest by link word. */
export function neighbours(os: LifeOSContext, id: string, opts: { kind?: string; limit?: number } = {}): Neighbour[] {
  const out: Neighbour[] = [];
  for (const r of os.relations.forEntity(id, opts.kind)) {
    const o = r.other;
    const dated = o.type === 'event' || o.type === 'trip' || o.type === 'transaction';
    let context: string | null = null;
    if (dated) {
      const around = os.relations
        .forEntity(o.id)
        .filter((x) => x.other.id !== id)
        .slice(0, 5)
        .map((x) => `${edgeLabel(x.relation.kind, x.direction).toLowerCase()} ${x.other.title}`);
      context = around.length ? around.join(' · ') : null;
    }
    out.push({ id: o.id, type: o.type, title: o.title, label: edgeLabel(r.relation.kind, r.direction), kind: r.relation.kind, at: dated ? eventTime(os, o.id) : null, context });
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
      const e = os.entities.get(id)!;
      return { record: e.title, type: e.type, connections: neighbours(os, id, { kind: i.kind, limit: i.limit ?? 20 }).map((n) => ({ ...n, at: n.at ? day(n.at) : undefined })) };
    },
  },
];
