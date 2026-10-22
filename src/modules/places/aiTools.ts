import { z } from 'zod';
import type { AiToolDef } from '@core/registry/types';
import type { LifeOSContext } from '@core/registry/context';
import { log, type GraphSession } from '@core/graph/tools';
import { allOrgs, allPlaces, distanceKm, ensurePlace, findPlace, homePlace, lastBeen, orgsAt, parentChain, spentAt, visitsOf } from './lib';
import { PLACE_KINDS } from './types';

/**
 * Places' AI tools (R3): read tools for Talk and boards (where you've been,
 * a place's story, what is near), and `file_place` for filing a dump
 * ("Toit is in Indiranagar", "add Blue Tokai, 80 Ft Rd, a café").
 */

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const KINDS = PLACE_KINDS.map((k) => k.value);

function placeByName(os: LifeOSContext, name: string) {
  return findPlace(os, name) ?? allPlaces(os).find((p) => p.title.toLowerCase().includes(name.trim().toLowerCase())) ?? null;
}

/** Where you have been: Places with Events at them in the last N days, most visits first. */
export function placesBeen(os: LifeOSContext, days = 30, now = Date.now()) {
  const since = now - days * DAY;
  return allPlaces(os)
    .map((p) => {
      const v = visitsOf(os, p.id, { now }).filter((x) => x.at >= since);
      return { id: p.id, name: p.title, kind: p.data.kind, visits: v.length, last: v[0] ? iso(v[0].at) : null };
    })
    .filter((x) => x.visits > 0)
    .sort((a, b) => b.visits - a.visits || (b.last ?? '').localeCompare(a.last ?? ''));
}

/** One Place's story: kind, what it is in, visits, last been, the Organisations at it, what was spent there. */
export function placeInfo(os: LifeOSContext, name: string, now = Date.now()) {
  const p = placeByName(os, name);
  if (!p) return null;
  const visits = visitsOf(os, p.id, { inside: true, now });
  const home = homePlace(os);
  return {
    id: p.id,
    name: p.title,
    kind: p.data.kind,
    in: parentChain(os, p).map((x) => x.title),
    address: p.data.address ?? null,
    visits: visits.length,
    lastBeen: visits[0] ? { date: iso(visits[0].at), what: visits[0].title, daysAgo: lastBeen(os, p.id, now) } : null,
    recent: visits.slice(0, 5).map((v) => ({ date: iso(v.at), what: v.title })),
    organisations: orgsAt(os, p.id).map((o) => o.title),
    spent: spentAt(os, p.id),
    kmFromHome: home?.data.coordinates && p.data.coordinates && home.id !== p.id ? Math.round(distanceKm(home.data.coordinates, p.data.coordinates) * 10) / 10 : null,
  };
}

/** Places within `km` of a Place (or Home), nearest first. Needs map pins. */
export function placesNear(os: LifeOSContext, from: string | null, km = 3, kind?: string) {
  const origin = from ? placeByName(os, from) : homePlace(os);
  if (!origin?.data.coordinates) return { from: origin?.title ?? null, error: origin ? `${origin.title} has no map pin` : 'no such place', places: [] };
  const o = origin.data.coordinates;
  const places = allPlaces(os)
    .filter((p) => p.id !== origin.id && p.data.coordinates && (!kind || p.data.kind === kind))
    .map((p) => ({ id: p.id, name: p.title, kind: p.data.kind, km: Math.round(distanceKm(o, p.data.coordinates!) * 10) / 10 }))
    .filter((p) => p.km <= km)
    .sort((a, b) => a.km - b.km);
  return { from: origin.title, places };
}

export const placesAiTools: AiToolDef[] = [
  {
    name: 'places_been',
    description: 'Where the user has been: places with events at them in the last N days (default 30), most visits first, with the last date.',
    input: z.object({ days: z.number().int().positive().max(3650).optional() }),
    run: async (input, os) => ({ places: placesBeen(os, (input as { days?: number }).days ?? 30).slice(0, 25) }),
  },
  {
    name: 'place_info',
    description: 'One place by name: kind, what it is in (area, city, country), visits and when last been, recent visits, organisations at it, money spent there, km from home.',
    input: z.object({ name: z.string() }),
    run: async (input, os) => placeInfo(os, (input as { name: string }).name) ?? { error: 'no such place' },
  },
  {
    name: 'places_near',
    description: 'Places within a distance of a named place (or home when no name), nearest first; optionally one kind (restaurant, gym, venue…). Needs map pins.',
    input: z.object({ from: z.string().optional(), km: z.number().positive().max(500).optional(), kind: z.string().optional() }),
    run: async (input, os) => {
      const i = input as { from?: string; km?: number; kind?: string };
      return placesNear(os, i.from ?? null, i.km ?? 3, i.kind);
    },
  },
  {
    name: 'organisations',
    description: 'Organisations (companies, shops, banks, services, payees) of a kind, or matching a name, with where they are.',
    input: z.object({ kind: z.string().optional(), name: z.string().optional() }),
    run: async (input, os) => {
      const i = input as { kind?: string; name?: string };
      const q = i.name?.trim().toLowerCase();
      return {
        organisations: allOrgs(os)
          .filter((o) => (!i.kind || o.data.kind === i.kind) && (!q || o.title.toLowerCase().includes(q)))
          .slice(0, 50)
          .map((o) => ({ id: o.id, name: o.title, kind: o.data.kind, at: o.data.placeId ? (os.records.get(o.data.placeId)?.title ?? null) : null, website: o.data.website ?? null })),
      };
    },
  },
];

/** Filing a dump: a Place with what it is in, its kind and address — every write logged on the dump with Undo. */
export function placesFilingTools(s: GraphSession): AiToolDef[] {
  return [
    {
      name: 'file_place',
      description: `A place mentioned with details: "Toit is in Indiranagar", "Blue Tokai, 80 Ft Rd, is a café". kind: ${KINDS.join(' | ')}; in: the area / city / country it is in, nearest first ("Indiranagar, Bengaluru").`,
      input: z.object({ name: z.string(), kind: z.string().optional(), in: z.string().optional(), address: z.string().optional() }),
      run: async (input, os) => {
        const i = input as { name: string; kind?: string; in?: string; address?: string };
        if (!os.registry.objects.has('place')) return { error: 'no places module installed' };
        const kind = i.kind && KINDS.includes(i.kind.toLowerCase()) ? i.kind.toLowerCase() : undefined;
        // "Indiranagar, Bengaluru" → Indiranagar in Bengaluru; the outermost first so each hangs in the next.
        const chain = (i.in ?? '').split(',').map((x) => x.trim()).filter(Boolean).reverse();
        let parentId: string | undefined;
        chain.forEach((name) => {
          const r = ensurePlace(os, name, { parentId });
          if (r.created) log(os, s, { kind: 'place', action: 'created', entityId: r.place.id, label: `Place: ${r.place.title}` });
          parentId = r.place.id;
        });
        const before = findPlace(os, i.name);
        const r = ensurePlace(os, i.name, { kind, parentId, address: i.address });
        if (r.created) log(os, s, { kind: 'place', action: 'created', entityId: r.place.id, label: `Place: ${r.place.title}${kind ? ` (${kind})` : ''}` });
        else if (before && JSON.stringify(before.data) !== JSON.stringify(r.place.data)) {
          const was = before.data as unknown as Record<string, unknown>;
          const now = r.place.data as unknown as Record<string, unknown>;
          const changed = Object.fromEntries(Object.keys(now).filter((k) => JSON.stringify(was[k]) !== JSON.stringify(now[k])).map((k) => [k, was[k] ?? null]));
          log(os, s, { kind: 'place', action: 'updated', entityId: r.place.id, label: `Place: ${r.place.title} · ${Object.keys(changed).join(', ')}`, before: changed });
        }
        return { id: r.place.id, name: r.place.title, created: r.created, in: parentChain(os, r.place).map((p) => p.title) };
      },
    },
  ];
}
