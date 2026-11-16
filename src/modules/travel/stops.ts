import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { STOP_COLORS, type StopData, type TripData } from './types';
import { DAY, isoOf, linkedTo, norm, placeFor } from './trips';

/**
 * A trip's line (the trip template, R7g slice 1; MODEL.md layer 2, *Stop*):
 * its stops in order, the nights each one has (from the stays at it), the gaps
 * with no bed and the nights on a plane, the moving days, ideas off the line.
 */

const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();
const addDays = (day: string, n: number) => isoOf(noon(day) + n * DAY);

interface Ev {
  kind?: string;
  startAt?: number;
  endAt?: number;
  location?: string;
  stopId?: string;
  sourceKey?: string;
  booking?: string;
}

/** A trip's stops: those on the line (in order), or any kinds asked for. */
export function stopsOf(os: LifeOSContext, tripId: string, kinds: Array<StopData['kind']> = ['stop']): ObjectRecord<StopData>[] {
  if (!os.registry.objects.has('stop')) return [];
  return os.records
    .query<StopData>('stop', { filter: { and: [{ field: 'data.tripId', op: 'eq', value: tripId }] } }, { limit: 500 })
    .filter((s) => !s.archived && kinds.includes(s.data.kind))
    .sort((a, b) => (a.data.order ?? 999) - (b.data.order ?? 999) || a.title.localeCompare(b.title));
}

/** The stop's mark: in the japan look its local name's first character (東), else its first letter. */
export function stopMark(stop: Pick<ObjectRecord<StopData>, 'title' | 'data'>, look?: string): string {
  if (look === 'japan' && stop.data.localName) return [...stop.data.localName][0]!;
  return (stop.title.trim()[0] ?? '?').toUpperCase();
}

export interface StopInput {
  localName?: string;
  kind?: StopData['kind'];
  order?: number;
  color?: string;
  about?: string;
  placeId?: string;
  coordinates?: { lat: number; lng: number };
  sourceKey?: string;
}

/** The trip's stop with this name (any kind), else a new one at the end of the line, with its Place. */
export function ensureStop(os: LifeOSContext, tripId: string, name: string, input: StopInput = {}): { stop: ObjectRecord<StopData>; created: boolean } {
  const n = norm(name);
  const all = stopsOf(os, tripId, ['stop', 'idea', 'airport']);
  const hit = all.find((s) => norm(s.title) === n);
  if (hit) return { stop: hit, created: false };
  const kind = input.kind ?? 'stop';
  const line = all.filter((s) => s.data.kind === 'stop');
  const used = new Set(all.map((s) => s.data.color));
  const color = input.color ?? STOP_COLORS.find((c) => !used.has(c)) ?? STOP_COLORS[all.length % STOP_COLORS.length];
  const order = input.order ?? (kind === 'stop' ? Math.max(0, ...line.map((s) => s.data.order ?? 0)) + 1 : undefined);
  const placeId = input.placeId ?? placeFor(os, name, { kind: kind === 'airport' ? 'airport' : 'city', coordinates: input.coordinates });
  const stop = os.records.create<StopData>(
    { object: 'stop', title: name.trim(), data: { tripId, kind, ...(order != null ? { order } : {}), color, ...(input.localName ? { localName: input.localName } : {}), ...(input.about ? { about: input.about } : {}), ...(placeId ? { placeId } : {}), ...(input.sourceKey ? { sourceKey: input.sourceKey } : {}) } },
    'assistant',
  );
  return { stop, created: true };
}

/** A stay Event's stop: the trip's stop for its city, made when new; the stay is linked to it (word `stop`). */
export function stayOnStop(os: LifeOSContext, tripId: string, stayId: string, city: string | null | undefined): string | null {
  const stay = os.records.get<Ev>(stayId);
  if (!stay || stay.data.stopId || !city?.trim() || !os.registry.objects.has('stop')) return stay?.data.stopId ?? null;
  const { stop } = ensureStop(os, tripId, city);
  os.records.update<Ev>(stayId, { data: { stopId: stop.id } }, 'assistant');
  return stop.id;
}

/* ------------------------------------------------------------------ */
/* Nights                                                               */
/* ------------------------------------------------------------------ */

export type NightKind = 'stay' | 'gap' | 'air';
export interface Night {
  day: string;
  kind: NightKind;
  stopId: string | null;
  stayId: string | null;
  /** The stay is planned, not booked yet. */
  planned?: boolean;
}

/** The trip's stays that hold a bed (a cancelled one does not). */
function staysOf(os: LifeOSContext, tripId: string) {
  return linkedTo<Ev>(os, tripId, 'event').filter((e) => e.data.kind === 'stay' && e.data.startAt && e.data.booking !== 'cancelled');
}

/** Every night of the trip, Starts to the night before Ends: at a stay (and its stop), on a plane, or a gap with no bed. */
export function nightsOf(os: LifeOSContext, trip: ObjectRecord<TripData>): Night[] {
  const { startDate, endDate } = trip.data;
  if (!startDate || !endDate || endDate <= startDate) return [];
  const stays = staysOf(os, trip.id).map((e) => {
    const from = isoOf(e.data.startAt!);
    const to = e.data.endAt ? isoOf(e.data.endAt) : addDays(from, 1);
    return { id: e.id, from, to: to > from ? to : addDays(from, 1), stopId: e.data.stopId ?? null, planned: e.data.booking === 'planned' };
  });
  const flightDays = new Set(linkedTo<Ev>(os, trip.id, 'event').filter((e) => e.data.kind === 'flight' && e.data.startAt).map((e) => isoOf(e.data.startAt!)));
  const out: Night[] = [];
  for (let d = startDate; d < endDate; d = addDays(d, 1)) {
    const s = stays.find((x) => x.from <= d && d < x.to);
    out.push(s ? { day: d, kind: 'stay', stopId: s.stopId, stayId: s.id, ...(s.planned ? { planned: true } : {}) } : { day: d, kind: flightDays.has(d) ? 'air' : 'gap', stopId: null, stayId: null });
  }
  return out;
}

export interface Segment {
  kind: NightKind;
  stopId: string | null;
  stayId: string | null;
  from: string;
  /** The day it ends (the morning after its last night). */
  to: string;
  nights: number;
}

/** Nights in runs: the same stop (or gap, or plane) on consecutive nights. */
export function segmentsOf(nights: Night[]): Segment[] {
  const out: Segment[] = [];
  for (const n of nights) {
    const last = out[out.length - 1];
    const key = (x: { kind: NightKind; stopId: string | null; stayId: string | null }) => `${x.kind}:${x.stopId ?? x.stayId ?? ''}`;
    if (last && key(last) === key(n)) {
      last.nights++;
      last.to = addDays(n.day, 1);
    } else out.push({ kind: n.kind, stopId: n.stopId, stayId: n.stayId, from: n.day, to: addDays(n.day, 1), nights: 1 });
  }
  return out;
}

/** The days you move from one stop to the next. */
export function movingDays(nights: Night[]): Array<{ day: string; fromStopId: string; toStopId: string }> {
  const out: Array<{ day: string; fromStopId: string; toStopId: string }> = [];
  let prev: string | null = null;
  for (const n of nights) {
    if (n.stopId && prev && n.stopId !== prev) out.push({ day: n.day, fromStopId: prev, toStopId: n.stopId });
    if (n.stopId) prev = n.stopId;
  }
  return out;
}

/** A stop's nights on the trip: when it starts, the morning you leave, how many. */
export function stopSpan(nights: Night[], stopId: string): { from: string; to: string; nights: number } | null {
  const mine = nights.filter((n) => n.stopId === stopId);
  if (!mine.length) return null;
  return { from: mine[0]!.day, to: addDays(mine[mine.length - 1]!.day, 1), nights: mine.length };
}

/* ------------------------------------------------------------------ */
/* Changing the line                                                    */
/* ------------------------------------------------------------------ */

/** Swap a stop with the one before (-1) or after (+1) it on the line; returns its Undo, or null at an end. */
export function moveStop(os: LifeOSContext, stopId: string, dir: -1 | 1): (() => void) | null {
  const s = os.records.get<StopData>(stopId);
  if (!s?.data.tripId) return null;
  const line = stopsOf(os, s.data.tripId);
  const i = line.findIndex((x) => x.id === stopId);
  const other = line[i + dir];
  if (i < 0 || !other) return null;
  // Renumber so equal or missing orders still swap.
  const before = line.map((x) => [x.id, x.data.order] as const);
  const ids = line.map((x) => x.id);
  [ids[i], ids[i + dir]] = [ids[i + dir]!, ids[i]!];
  ids.forEach((id, k) => os.records.update<StopData>(id, { data: { order: k + 1 } }, 'user'));
  return () => {
    for (const [id, order] of before) if (os.records.get(id)) os.records.update<StopData>(id, { data: { order } }, 'user');
  };
}

/** An idea (or airport) onto the end of the line; returns its Undo. */
export function addToLine(os: LifeOSContext, stopId: string): () => void {
  const s = os.records.get<StopData>(stopId);
  if (!s?.data.tripId) throw new Error(`Stop ${stopId} not found`);
  const prev = { kind: s.data.kind, order: s.data.order };
  const order = Math.max(0, ...stopsOf(os, s.data.tripId).map((x) => x.data.order ?? 0)) + 1;
  os.records.update<StopData>(stopId, { data: { kind: 'stop', order } }, 'user');
  return () => {
    if (os.records.get(stopId)) os.records.update<StopData>(stopId, { data: prev }, 'user');
  };
}

/* ------------------------------------------------------------------ */
/* The fold, and the calendar file                                      */
/* ------------------------------------------------------------------ */

/** Once (R7g): a trip with no stops gets its destination as the first; each stay with no stop gets the stop for its city. */
export function foldStops(os: LifeOSContext): number {
  if (!os.registry.objects.has('stop')) return 0;
  let made = 0;
  for (const t of os.records.query<TripData>('trip', {}, { limit: 1000 })) {
    if (!stopsOf(os, t.id, ['stop', 'idea', 'airport']).length && t.data.destination?.trim()) {
      if (ensureStop(os, t.id, t.data.destination, { order: 1, placeId: t.data.placeId }).created) made++;
    }
    for (const e of staysOf(os, t.id)) if (!e.data.stopId && stayOnStop(os, t.id, e.id, e.data.location || t.data.destination)) made++;
  }
  return made;
}

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const icsDay = (day: string) => day.replace(/-/g, '');

/** The trip as a calendar file: the whole trip, and each run of nights at a stop with its stay. */
export function tripIcs(os: LifeOSContext, trip: ObjectRecord<TripData>, now = Date.now()): string {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ev = (uid: string, from: string, to: string, summary: string, desc?: string) => ['BEGIN:VEVENT', `UID:${uid}@lifeos`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDay(from)}`, `DTEND;VALUE=DATE:${icsDay(to)}`, `SUMMARY:${icsText(summary)}`, ...(desc ? [`DESCRIPTION:${icsText(desc)}`] : []), 'END:VEVENT'];
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LifeOS//Travel//EN', 'CALSCALE:GREGORIAN'];
  if (trip.data.startDate) lines.push(...ev(trip.id, trip.data.startDate, addDays(trip.data.endDate ?? trip.data.startDate, 1), trip.title));
  segmentsOf(nightsOf(os, trip)).forEach((g, i) => {
    if (g.kind !== 'stay' || !g.stopId) return;
    const stop = os.records.get<StopData>(g.stopId);
    const stay = g.stayId ? os.records.get(g.stayId) : null;
    lines.push(...ev(`${trip.id}-${i}`, g.from, g.to, `${stop?.title ?? 'Stay'}${stay ? ` · ${stay.title.replace(/^Stay · /, '')}` : ''}`, `${g.nights} night${g.nights === 1 ? '' : 's'} · ${trip.title}`));
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
