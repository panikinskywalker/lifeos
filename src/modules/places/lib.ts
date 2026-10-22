import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { LocationValue } from '@core/domain/fields';
import type { Actor } from '@core/events/bus';
import { placeKindFor } from './kinds';
import type { OrgData, PlaceData } from './types';

/** Places' own queries and writes (R3): matching a name to a Place, the parent chain, visits, distance, the R3 fold. */

export const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
const titleCase = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/(^|\s)(\p{L})/gu, (m) => m.toUpperCase());
const DAY = 86_400_000;

export const has = (os: LifeOSContext, object: string) => os.registry.objects.has(object);

export function allPlaces(os: LifeOSContext): ObjectRecord<PlaceData>[] {
  return has(os, 'place') ? os.records.query<PlaceData>('place', {}, { limit: 100_000 }) : [];
}

export function allOrgs(os: LifeOSContext): ObjectRecord<OrgData>[] {
  return has(os, 'org') ? os.records.query<OrgData>('org', {}, { limit: 100_000 }) : [];
}

/** The Place a name means: a name you confirmed before (aliases), then the exact title, then "Toit" for "Toit, Indiranagar". */
export function findPlace(os: LifeOSContext, name: string, opts: { kind?: string; places?: ObjectRecord<PlaceData>[] } = {}): ObjectRecord<PlaceData> | null {
  const n = norm(name);
  if (!n) return null;
  for (const a of os.aliases.lookup(n)) {
    const e = os.records.get<PlaceData>(a.entityId);
    if (e?.object === 'place' && !e.archived) return e;
  }
  const list = (opts.places ?? allPlaces(os)).filter((p) => !opts.kind || p.data.kind === opts.kind);
  return list.find((p) => norm(p.title) === n) ?? list.find((p) => norm(p.title.split(',')[0]!) === n) ?? null;
}

/** Find or make a Place. A new one gets its kind from the name when none is given. */
export function ensurePlace(os: LifeOSContext, name: string, opts: { kind?: string; parentId?: string; address?: string; actor?: Actor } = {}): { place: ObjectRecord<PlaceData>; created: boolean } {
  const hit = findPlace(os, name, { kind: opts.kind === 'city' || opts.kind === 'country' ? opts.kind : undefined });
  if (hit) {
    const fill: Partial<PlaceData> = {};
    if (opts.parentId && !hit.data.parentId && opts.parentId !== hit.id) fill.parentId = opts.parentId;
    if (opts.address && !hit.data.address) fill.address = opts.address;
    if ((!hit.data.kind || hit.data.kind === 'other') && opts.kind) fill.kind = opts.kind;
    return { place: Object.keys(fill).length ? os.records.update<PlaceData>(hit.id, { data: fill }, opts.actor ?? 'assistant') : hit, created: false };
  }
  const data: PlaceData = { kind: opts.kind ?? placeKindFor(name) ?? 'other', ...(opts.parentId ? { parentId: opts.parentId } : {}), ...(opts.address ? { address: opts.address } : {}) };
  return { place: os.records.create<PlaceData>({ object: 'place', title: titleCase(name), data }, opts.actor ?? 'assistant'), created: true };
}

/** The Places a Place is in, nearest first: Koramangala → [Bengaluru, India]. */
export function parentChain(os: LifeOSContext, place: ObjectRecord<PlaceData>): ObjectRecord<PlaceData>[] {
  const out: ObjectRecord<PlaceData>[] = [];
  const seen = new Set([place.id]);
  let next = place.data.parentId;
  while (next && !seen.has(next) && out.length < 6) {
    const p = os.records.get<PlaceData>(next);
    if (!p || p.object !== 'place') break;
    out.push(p);
    seen.add(p.id);
    next = p.data.parentId;
  }
  return out;
}

/** The Places directly inside one. */
export function childPlaces(os: LifeOSContext, id: string): ObjectRecord<PlaceData>[] {
  return has(os, 'place') ? os.records.query<PlaceData>('place', { filter: { and: [{ field: 'data.parentId', op: 'eq', value: id }] }, sort: [{ field: 'title', dir: 'asc' }] }, { limit: 500 }) : [];
}

export interface Visit {
  id: string;
  title: string;
  at: number;
  kind?: string;
}

/** Events linked *at* a Place (and, with `inside`, at the Places in it), latest first. */
export function visitsOf(os: LifeOSContext, placeId: string, opts: { inside?: boolean; now?: number } = {}): Visit[] {
  const ids = [placeId, ...(opts.inside ? descendants(os, placeId) : [])];
  const now = opts.now ?? Date.now();
  const out = new Map<string, Visit>();
  for (const id of ids) {
    for (const r of os.links.forEntity(id, 'at')) {
      if (r.direction !== 'in' || r.other.object !== 'event') continue;
      const e = os.records.get<{ startAt?: number; kind?: string }>(r.other.id);
      if (!e?.data.startAt || e.data.startAt > now) continue;
      out.set(e.id, { id: e.id, title: e.title, at: e.data.startAt, kind: e.data.kind });
    }
  }
  return [...out.values()].sort((a, b) => b.at - a.at);
}

function descendants(os: LifeOSContext, id: string, depth = 0): string[] {
  if (depth > 4) return [];
  return childPlaces(os, id).flatMap((c) => [c.id, ...descendants(os, c.id, depth + 1)]);
}

/** Organisations at a Place (a shop's branch, a restaurant's own record). */
export function orgsAt(os: LifeOSContext, placeId: string): ObjectRecord<OrgData>[] {
  return os.links.forEntity(placeId, 'at').filter((r) => r.direction === 'in' && r.other.object === 'org').map((r) => os.records.get<OrgData>(r.other.id)!).filter(Boolean);
}

/** What was spent at a Place: expenses whose payee is an Organisation at it. */
export function spentAt(os: LifeOSContext, placeId: string, sinceDay?: string): { total: number; count: number } {
  let total = 0;
  let count = 0;
  for (const o of orgsAt(os, placeId)) {
    for (const r of os.links.forEntity(o.id, 'payee')) {
      if (r.direction !== 'in' || r.other.object !== 'transaction') continue;
      const t = os.records.get<{ amount?: number; kind?: string; date?: string }>(r.other.id);
      if (!t || t.data.kind !== 'expense' || (sinceDay && (t.data.date ?? '') < sinceDay)) continue;
      total += t.data.amount ?? 0;
      count++;
    }
  }
  return { total, count };
}

/** Great-circle distance in km. */
export function distanceKm(a: LocationValue, b: LocationValue): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Your Home Place (kind home), if you have one with a pin. */
export function homePlace(os: LifeOSContext): ObjectRecord<PlaceData> | null {
  return allPlaces(os).find((p) => p.data.kind === 'home' && p.data.coordinates) ?? allPlaces(os).find((p) => p.data.kind === 'home') ?? null;
}

/** A link that opens the Place in a maps app: its own maps link, else its pin, else a search for its name and address. */
export function mapsLink(p: ObjectRecord<PlaceData>): string {
  if (p.data.mapsUrl) return p.data.mapsUrl;
  if (p.data.coordinates) return `https://www.google.com/maps/search/?api=1&query=${p.data.coordinates.lat},${p.data.coordinates.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.title, p.data.address].filter(Boolean).join(', '))}`;
}

/** Days since the latest visit, or null. */
export function lastBeen(os: LifeOSContext, placeId: string, now = Date.now()): number | null {
  const v = visitsOf(os, placeId, { inside: true, now })[0];
  return v ? Math.floor((now - v.at) / DAY) : null;
}

/* ------------------------------------------------------------------ */
/* The R3 fold                                                           */
/* ------------------------------------------------------------------ */

const MAPS_URL = /^\s*(https?:\/\/(?:www\.)?(?:google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.apple\.com)\S*)\s*$/i;

/**
 * Once, on first open after R3: a Place's city and country text become its
 * parent Places (a city in its country), and notes that are only a maps link
 * (Turf venues) move to the maps link Field. Safe to run again.
 */
export function foldCityCountry(os: LifeOSContext): number {
  if (!has(os, 'place')) return 0;
  let n = 0;
  os.db.transaction(() => {
    for (const p of allPlaces(os)) if (foldPlace(os, p)) n++;
  });
  return n;
}

/** One Place: city / country text → parent Places; notes that are only a maps link → the maps link Field. */
export function foldPlace(os: LifeOSContext, p: ObjectRecord<PlaceData>): boolean {
  const { city, country, notes } = p.data;
  const patch: Record<string, unknown> = {};
  if (city || country) {
    const countryP = country && norm(country) !== norm(p.title) ? ensurePlace(os, country, { kind: 'country', actor: 'system' }).place : null;
    const cityP = city && norm(city) !== norm(p.title) ? ensurePlace(os, city, { kind: 'city', parentId: countryP?.id, actor: 'system' }).place : null;
    const parent = cityP ?? countryP;
    if (parent && !p.data.parentId && parent.id !== p.id) patch.parentId = parent.id;
    patch.city = undefined;
    patch.country = undefined;
  }
  const url = notes ? MAPS_URL.exec(notes)?.[1] : undefined;
  if (url && !p.data.mapsUrl) {
    patch.mapsUrl = url;
    patch.notes = undefined;
  }
  if (!Object.keys(patch).length) return false;
  os.records.update(p.id, { data: patch }, 'system');
  return true;
}
