import type { Ask } from '@core/brain/contract';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { Happening, OutingData, OutingKind, StopData, TripData } from './types';
import { isoOf, trips, tripPhase } from './trips';
import { nightsOf, stopSpan, stopsOf } from './stops';

/**
 * Things to do (the trip template, R7g slice 3; MODEL.md layer 2, *Thing to
 * do*): what to see, eat or do at each stop, and the events on your route,
 * festivals and what to be aware of (closures, holidays, crowds, weather).
 * Claude is asked, per stop and its dates, what is on; its answer is kept in
 * the learned store and offered to add, never added on its own.
 */

export type ThingStatus = 'idea' | 'want' | 'planned' | 'done';
export type ThingFilter = 'all' | 'planned' | 'want' | 'idea' | 'free';

export const thingStatus = (t: Pick<ObjectRecord<OutingData>, 'status'>): ThingStatus => (['idea', 'want', 'planned', 'done'].includes(t.status ?? '') ? (t.status as ThingStatus) : 'idea');

/** Every thing to do on a trip, events included. */
export function thingsOf(os: LifeOSContext, tripId: string): ObjectRecord<OutingData>[] {
  if (!os.registry.objects.has('outing')) return [];
  return os.records.query<OutingData>('outing', { filter: { and: [{ field: 'data.tripId', op: 'eq', value: tripId }] } }, { limit: 2000 }).filter((t) => !t.archived);
}

const ORDER: Record<ThingStatus, number> = { planned: 0, want: 1, idea: 2, done: 3 };

/** A stop's things to do (not events), planned first, then by name. */
export function thingsAt(os: LifeOSContext, stop: ObjectRecord<StopData>): ObjectRecord<OutingData>[] {
  if (!stop.data.tripId) return [];
  return thingsOf(os, stop.data.tripId)
    .filter((t) => t.data.stopId === stop.id && t.data.kind !== 'event')
    .sort((a, b) => ORDER[thingStatus(a)] - ORDER[thingStatus(b)] || a.title.localeCompare(b.title));
}

export function filterThings(list: ObjectRecord<OutingData>[], f: ThingFilter): ObjectRecord<OutingData>[] {
  if (f === 'all') return list;
  if (f === 'free') return list.filter((t) => t.data.cost === 0);
  return list.filter((t) => thingStatus(t) === f);
}

/** Events on the trip's dates (at a stop or trip-wide), soonest first. */
export function eventsOf(os: LifeOSContext, trip: ObjectRecord<TripData>): ObjectRecord<OutingData>[] {
  const { startDate: s, endDate: e } = trip.data;
  return thingsOf(os, trip.id)
    .filter((t) => t.data.kind === 'event' && (!s || !e || !t.data.day || (t.data.day <= e && (t.data.until ?? t.data.day) >= s)))
    .sort((a, b) => (a.data.day ?? '9').localeCompare(b.data.day ?? '9') || a.title.localeCompare(b.title));
}

/** What is on a day: events covering it (at that stop or trip-wide) and things planned for it. */
export function happeningOn(os: LifeOSContext, trip: ObjectRecord<TripData>, day: string, stopId?: string | null): { events: ObjectRecord<OutingData>[]; planned: ObjectRecord<OutingData>[] } {
  const all = thingsOf(os, trip.id);
  return {
    // The stop's own events first, then the trip-wide ones.
    events: all
      .filter((t) => t.data.kind === 'event' && t.data.day && t.data.day <= day && (t.data.until ?? t.data.day) >= day && (!t.data.stopId || !stopId || t.data.stopId === stopId))
      .sort((a, b) => Number(!a.data.stopId) - Number(!b.data.stopId) || a.title.localeCompare(b.title)),
    planned: all.filter((t) => t.data.kind !== 'event' && t.data.day === day),
  };
}

/** Set a thing's status; returns its Undo. */
export function setThingStatus(os: LifeOSContext, id: string, status: ThingStatus): () => void {
  const t = os.records.get<OutingData>(id);
  if (!t) throw new Error(`Thing ${id} not found`);
  const prev = t.status ?? null;
  os.records.setStatus(id, status, 'user');
  return () => {
    if (os.records.get(id)) os.records.update(id, { status: prev }, 'user');
  };
}

export interface ThingInput {
  kind?: OutingKind;
  stopId?: string;
  day?: string;
  until?: string;
  cost?: number;
  happening?: Happening;
  sure?: OutingData['sure'];
  notes?: string;
  link?: string;
  suggested?: boolean;
  status?: ThingStatus;
}

export function addThing(os: LifeOSContext, tripId: string, title: string, input: ThingInput = {}): ObjectRecord<OutingData> {
  const { status, ...data } = input;
  return os.records.create<OutingData>({ object: 'outing', title: title.trim(), data: { tripId, kind: data.kind ?? 'see', ...Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) } as OutingData, status: status ?? 'idea' }, 'user');
}

/* ------------------------------------------------------------------ */
/* What's on while you're there (Claude, through the brain's asks)      */
/* ------------------------------------------------------------------ */

/** The learned key for a stop's dates: the same stop and dates are never asked twice. */
export const onRouteKey = (stopId: string, from: string, to: string) => `travel:onroute:${stopId}:${from}:${to}`;

/** For trips in the next 90 days: per stop on the line, what is on and what to be aware of on its dates. */
export function onRouteAsks(os: LifeOSContext, now: number): Ask[] {
  const out: Ask[] = [];
  const horizon = isoOf(now + 90 * 86_400_000);
  for (const t of trips(os)) {
    if (tripPhase(t.data, now) === 'back' || !t.data.startDate || t.data.startDate > horizon) continue;
    const nights = nightsOf(os, t);
    for (const s of stopsOf(os, t.id)) {
      const span = stopSpan(nights, s.id);
      if (!span) continue;
      out.push({
        key: onRouteKey(s.id, span.from, span.to),
        slot: `what's on in ${s.title}`,
        prompt: `Festivals, seasonal events, closures, public holidays, crowds or weather to be aware of in ${s.title} (${t.data.destination}) from ${span.from} to ${span.to}. One per line: title | festival, seasonal, closure, crowds, holiday or weather | first day YYYY-MM-DD | last day YYYY-MM-DD | official, past or predicted | one short line.`,
        record: { place: s.title, country: t.data.destination, from: span.from, to: span.to },
        list: true,
      });
    }
  }
  return out;
}

export interface Suggested {
  title: string;
  happening: Happening;
  day?: string;
  until?: string;
  sure?: OutingData['sure'];
  line?: string;
}

const HAPPEN = new Set(['festival', 'seasonal', 'closure', 'crowds', 'holiday', 'weather']);
const SURE: Record<string, OutingData['sure']> = { official: 'official', past: 'past', 'past pattern': 'past', predicted: 'predicted' };

/** Claude's lines for a stop, read back from the learned store; those already added are left out. */
export function onRouteSuggestions(os: LifeOSContext, stop: ObjectRecord<StopData>, span: { from: string; to: string }): Suggested[] {
  const raw = os.brain?.learned.get<string[] | string>(onRouteKey(stop.id, span.from, span.to));
  const lines = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split('\n') : [];
  const have = new Set(stop.data.tripId ? thingsOf(os, stop.data.tripId).map((t) => t.title.toLowerCase()) : []);
  return lines
    .map((l) => l.split('|').map((x) => x.trim()))
    .filter((p) => p[0])
    .map((p) => ({ title: p[0]!, happening: (HAPPEN.has((p[1] ?? '').toLowerCase()) ? p[1]!.toLowerCase() : 'seasonal') as Happening, day: /^\d{4}-\d{2}-\d{2}$/.test(p[2] ?? '') ? p[2] : undefined, until: /^\d{4}-\d{2}-\d{2}$/.test(p[3] ?? '') ? p[3] : undefined, sure: SURE[(p[4] ?? '').toLowerCase()], line: p[5] || undefined }))
    .filter((x) => !have.has(x.title.toLowerCase()));
}
