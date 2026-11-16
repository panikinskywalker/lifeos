import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { StopData, TripData } from './types';
import { DAY, isoOf, tripPhase } from './trips';
import { movingDays, nightsOf, segmentsOf, stopsOf, type Night } from './stops';
import { deadlines, flightTrips, moneyOf, statusOf, tripFlights, tripJourneys, tripStays, type AirportEnd, type TravelEvent } from './booked';
import { checklistOf, isDone, notesOf, SECTION_LABEL } from './prep';
import { normalsFor, type Normals } from './weather';

/**
 * The trip's Overview before the trip (the trip template, JP-Overview): the
 * stage it is at (plan, book, prep, travel, home), the way there, what needs
 * attention (the trip's notes), what is coming up until you fly (grouped, with
 * the deadline rail), the seats-open board, the line of stops with their
 * nights, the stamps and the weather by stop. Read from the trip's records.
 */

const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();
const daysBetween = (a: string, b: string) => Math.round((noon(b) - noon(a)) / DAY);
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (at: number) => {
  const d = new Date(at);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/* ------------------------------------------------------------------ */
/* The stage                                                            */
/* ------------------------------------------------------------------ */

export type TripStage = 'plan' | 'book' | 'prep' | 'travel' | 'home';

/**
 * Plan (no dates or no stops yet), Book (a night with no bed, a stay still
 * planned, or no flight there), Prep (all booked, getting ready), Travel
 * (away), Home (back).
 */
export function stageOfTrip(os: LifeOSContext, trip: ObjectRecord<TripData>, now = Date.now()): TripStage {
  const phase = tripPhase(trip.data, now);
  if (phase === 'away') return 'travel';
  if (phase === 'back') return 'home';
  if (phase === 'undated') return 'plan';
  const nights = nightsOf(os, trip);
  if (!nights.some((n) => n.kind === 'stay') && !stopsOf(os, trip.id).length) return 'plan';
  const open = nights.some((n, i) => (n.kind === 'gap' && i > 0) || n.planned);
  return open || !flightTrips(tripFlights(os, trip.id)).length ? 'book' : 'prep';
}

/* ------------------------------------------------------------------ */
/* The way there                                                        */
/* ------------------------------------------------------------------ */

// Airports' hours from UTC in December (the trip template's season), and the zone's short name.
const ZONES: Array<[string[], number, string]> = [
  [['BOM', 'DEL', 'BLR', 'MAA', 'HYD', 'CCU', 'COK', 'GOI', 'GOX', 'AMD', 'PNQ', 'TRV', 'JAI', 'IXC', 'ATQ', 'LKO'], 5.5, 'IST'],
  [['HND', 'NRT', 'KIX', 'ITM', 'NGO', 'CTS', 'FUK', 'OKA', 'HIJ', 'KMQ', 'SDJ'], 9, 'JST'],
  [['ICN', 'GMP', 'PUS'], 9, 'KST'],
  [['HAN', 'SGN', 'DAD', 'BKK', 'DMK', 'HKT', 'CNX', 'PNH', 'REP'], 7, 'ICT'],
  [['SIN'], 8, 'SGT'],
  [['KUL'], 8, 'MYT'],
  [['HKG', 'MFM', 'TPE', 'PEK', 'PKX', 'PVG', 'SHA', 'CAN', 'MNL'], 8, ''],
  [['DPS', 'CGK'], 8, 'WITA'],
  [['CMB'], 5.5, 'IST'],
  [['KTM'], 5.75, 'NPT'],
  [['DXB', 'AUH', 'SHJ', 'MCT'], 4, 'GST'],
  [['DOH', 'BAH', 'KWI', 'RUH', 'JED'], 3, 'AST'],
  [['IST'], 3, 'TRT'],
  [['LHR', 'LGW', 'MAN', 'EDI', 'DUB', 'LIS'], 0, 'GMT'],
  [['CDG', 'FRA', 'MUC', 'AMS', 'ZRH', 'GVA', 'FCO', 'MXP', 'MAD', 'BCN', 'VIE', 'BRU', 'CPH', 'ARN', 'PRG'], 1, 'CET'],
  [['JFK', 'EWR', 'BOS', 'IAD', 'YYZ', 'ATL', 'MIA'], -5, 'EST'],
  [['ORD', 'DFW', 'IAH'], -6, 'CST'],
  [['SFO', 'LAX', 'SEA', 'YVR'], -8, 'PST'],
  [['SYD', 'MEL'], 11, 'AEDT'],
];
const CITY: Record<string, string> = { HND: 'Tokyo', NRT: 'Tokyo', KIX: 'Osaka', ITM: 'Osaka', NGO: 'Nagoya', CTS: 'Sapporo', HAN: 'Hanoi', SGN: 'Ho Chi Minh City', BOM: 'Mumbai', DEL: 'Delhi', BLR: 'Bengaluru', MAA: 'Chennai', ICN: 'Seoul', BKK: 'Bangkok', SIN: 'Singapore', HKG: 'Hong Kong', DXB: 'Dubai', DOH: 'Doha', KUL: 'Kuala Lumpur', LHR: 'London', CDG: 'Paris' };

/** An airport's hours from UTC and its zone's short name, when known. */
export function airportZone(code: string | null | undefined): { offset: number; name: string } | null {
  if (!code) return null;
  const z = ZONES.find(([codes]) => codes.includes(code));
  return z ? { offset: z[1], name: z[2] } : null;
}

/** The city of an airport end: "Tokyo Haneda" → Tokyo (known codes), else its first words. */
export const cityOf = (end: AirportEnd) => (end.code && CITY[end.code]) || end.city.replace(/\s+(airport|intl|international)$/i, '').trim() || end.code || '';

export interface WayThere {
  eventId: string;
  from: AirportEnd;
  to: AirportEnd;
  fromCity: string;
  toCity: string;
  via: string[];
  departAt: number;
  landAt: number | null;
  /** Door to door in the air, across time zones; null when a zone is not known. */
  minutes: number | null;
  fromZone: string | null;
  toZone: string | null;
  flightNos: string[];
  /** "23:05", the departure clock time. */
  departs: string;
  lands: string | null;
}

/** The first flight trip (the legs joined): the way there. */
export function wayThere(os: LifeOSContext, trip: ObjectRecord<TripData>): WayThere | null {
  const ft = flightTrips(tripFlights(os, trip.id))[0];
  if (!ft) return null;
  const a = airportZone(ft.from.code);
  const b = airportZone(ft.to.code);
  const minutes = ft.landAt != null && a && b ? Math.round((ft.landAt - ft.departAt) / 60000 + (a.offset - b.offset) * 60) : null;
  const viaCity = (s: string) => CITY[s] ?? s;
  return {
    eventId: ft.legs[0]!.e.id,
    from: ft.from,
    to: ft.to,
    fromCity: cityOf(ft.from),
    toCity: cityOf(ft.to),
    via: ft.via.map(viaCity),
    departAt: ft.departAt,
    landAt: ft.landAt,
    minutes: minutes != null && minutes > 0 ? minutes : null,
    fromZone: a?.name || null,
    toZone: b?.name || null,
    flightNos: ft.flightNos,
    departs: hhmm(ft.departAt),
    lands: ft.landAt != null ? hhmm(ft.landAt) : null,
  };
}

/** The day you fly out (the way there), else the trip's first day; null undated. */
export function flyDay(os: LifeOSContext, trip: ObjectRecord<TripData>): string | null {
  const w = wayThere(os, trip);
  return w ? isoOf(w.departAt) : trip.data.startDate ?? null;
}

/* ------------------------------------------------------------------ */
/* Needs attention                                                      */
/* ------------------------------------------------------------------ */

export interface AttentionRow {
  id: string;
  title: string;
  body: string | null;
  level: 'critical' | 'heads';
}

/** The trip's open notes that are critical (urgent) or a heads-up (high), critical first. */
export function needsAttention(os: LifeOSContext, tripId: string): { rows: AttentionRow[]; critical: number; heads: number; all: number } {
  const open = notesOf(os, tripId);
  const rows = open
    .filter((t) => t.data.priority === 'urgent' || t.data.priority === 'high')
    .map((t) => ({ id: t.id, title: t.title, body: t.data.notes?.trim() || null, level: t.data.priority === 'urgent' ? ('critical' as const) : ('heads' as const) }));
  return { rows, critical: rows.filter((r) => r.level === 'critical').length, heads: rows.filter((r) => r.level === 'heads').length, all: notesOf(os, tripId, true).length };
}

/* ------------------------------------------------------------------ */
/* Coming up, until you fly                                             */
/* ------------------------------------------------------------------ */

export type ComingGroup = 'action' | 'heads' | 'know';
export type ComingKind = 'seats' | 'cancel' | 'charge' | 'task' | 'flight';
export const COMING_LABEL: Record<ComingGroup, string> = { action: 'Needs action', heads: 'Heads up', know: 'Good to know' };

export interface ComingItem {
  day: string;
  group: ComingGroup;
  kind: ComingKind;
  title: string;
  /** What follows the group's name on the second line ("seats open"). */
  sub: string | null;
  /** Still to pay, in its currency (a stay whose free cancellation ends). */
  amount?: { value: number; currency: string };
  object: string;
  id: string;
}

export interface ComingUp {
  today: string;
  /** The day you fly (the rail's end). */
  until: string;
  days: number;
  items: ComingItem[];
  counts: Record<ComingGroup | 'deadlines', number>;
  /** The rail's marks: seats opening (above), free cancellation ending (below). */
  rail: Array<{ day: string; kind: 'seats' | 'cancel' }>;
}

/**
 * What happens between today and the flight: seats to book as they open and
 * checklist items due (needs action), free cancellations ending (heads up),
 * cards charged and the flight itself (good to know). Null once flown or undated.
 */
export function comingUpOf(os: LifeOSContext, trip: ObjectRecord<TripData>, now = Date.now()): ComingUp | null {
  const today = isoOf(now);
  const way = wayThere(os, trip);
  const until = way ? isoOf(way.departAt) : trip.data.startDate;
  if (!until || until < today) return null;
  const items: ComingItem[] = [];
  const stays = new Map(tripStays(os, trip.id).map((e) => [e.id, e]));
  for (const d of deadlines(os, trip, now)) {
    if (d.day > until) continue;
    if (d.kind === 'seats') items.push({ day: d.day, group: 'action', kind: 'seats', title: `Book ${d.title}`, sub: 'seats open', object: 'event', id: d.eventId });
    else {
      const e = stays.get(d.eventId) ?? os.records.get<TravelEvent>(d.eventId);
      const m = e ? moneyOf(e) : null;
      const amount = m && m.toPay > 0.5 ? { value: m.toPay, currency: m.currency } : undefined;
      if (d.kind === 'cancel') items.push({ day: d.day, group: 'heads', kind: 'cancel', title: d.line, sub: amount ? 'at the property' : null, amount, object: 'event', id: d.eventId });
      else items.push({ day: d.day, group: 'know', kind: 'charge', title: d.line, sub: null, amount, object: 'event', id: d.eventId });
    }
  }
  for (const t of checklistOf(os, trip.id)) {
    if (isDone(t) || !t.data.dueDate || t.data.dueDate > until) continue;
    items.push({ day: t.data.dueDate < today ? today : t.data.dueDate, group: 'action', kind: 'task', title: t.title, sub: t.data.dueDate < today ? 'overdue' : (SECTION_LABEL[t.data.section ?? 'to-do'] ?? 'To-do').toLowerCase(), object: 'task', id: t.id });
  }
  if (way) {
    const no = way.flightNos[0];
    const where = [way.fromCity, way.from.terminal].filter(Boolean).join(' ');
    items.push({ day: until, group: 'know', kind: 'flight', title: `Fly out of ${way.fromCity}${no ? ` · ${no} ${way.departs}` : ` · ${way.departs}`}`, sub: `${(trip.data.personIds ?? []).length ? 'Everyone' : 'You'}${where ? ` · ${where}` : ''}`, object: 'event', id: way.eventId });
  }
  const rank: Record<ComingKind, number> = { task: 0, seats: 1, cancel: 2, charge: 3, flight: 4 };
  items.sort((a, b) => a.day.localeCompare(b.day) || rank[a.kind] - rank[b.kind] || a.title.localeCompare(b.title));
  const n = (g: ComingGroup) => items.filter((i) => i.group === g).length;
  return {
    today,
    until,
    days: daysBetween(today, until),
    items,
    counts: { action: n('action'), heads: n('heads'), know: n('know'), deadlines: items.filter((i) => i.kind === 'seats' || i.kind === 'cancel' || i.kind === 'charge').length },
    rail: items.filter((i) => i.kind === 'seats' || i.kind === 'cancel').map((i) => ({ day: i.day, kind: i.kind as 'seats' | 'cancel' })),
  };
}

/* ------------------------------------------------------------------ */
/* Seats open (the departure board)                                     */
/* ------------------------------------------------------------------ */

export interface SeatRow {
  id: string;
  /** The day seats open. */
  opens: string;
  /** Days from today until they open. */
  inDays: number;
  /** The service ("Highway bus", "Shinano"), else the way ("Train"). */
  name: string;
  from: string;
  to: string;
  /** The day of the journey. */
  day: string;
}

/** "Shinano seats open 26 Nov; …" → Shinano; "Reserve JR seats (Azusa) from …" → JR. Falls back to the mode. */
export function serviceName(note: string | undefined, mode: string | undefined): string {
  const s = (note ?? '')
    .split(/[;.,(]|\bseats?\b|\bopens?\b|\bis\b|\bare\b|\bfrom\b|\s(?:→|->)\s/i)[0]!
    .replace(/^(reserve|book)\s+/i, '')
    .replace(/\blimited express\b/i, 'Ltd Exp')
    .trim();
  // "JR seats (Azusa/Kaiji)": the name in brackets too.
  const paren = /^[^;.]*?\(([^)]{2,24})\)/.exec(note ?? '')?.[1];
  if (s.length >= 2 && s.length <= 34) return paren && s.length <= 14 ? `${s} · ${paren}` : s;
  return mode ? mode.replace(/^\w/, (c) => c.toUpperCase()) : 'Journey';
}

/** Journeys not booked yet whose seats open from today on, soonest first. */
export function seatsOpenBoard(os: LifeOSContext, trip: ObjectRecord<TripData>, now = Date.now()): SeatRow[] {
  const today = isoOf(now);
  const title = (id: string | undefined) => (id ? os.records.get<StopData>(id)?.title ?? null : null);
  return tripJourneys(os, trip.id)
    .filter((e) => e.data.seatsOpenAt && e.data.plan !== 'booked' && statusOf(e) !== 'cancelled' && isoOf(e.data.seatsOpenAt) >= today)
    .map((e) => {
      const [a, b] = e.title.split(/\s*→\s*/);
      const opens = isoOf(e.data.seatsOpenAt!);
      return { id: e.id, opens, inDays: daysBetween(today, opens), name: serviceName(e.data.bookNote, e.data.mode), from: title(e.data.fromStopId) ?? a ?? '', to: title(e.data.toStopId) ?? b ?? '', day: isoOf(e.data.startAt!) };
    })
    .sort((x, y) => x.opens.localeCompare(y.opens) || x.name.localeCompare(y.name));
}

/* ------------------------------------------------------------------ */
/* The line: stops with their nights                                    */
/* ------------------------------------------------------------------ */

export interface LineStop {
  stopId: string;
  title: string;
  localName: string | null;
  color: string | null;
  /** Its first night. */
  from: string | null;
  nights: number;
}

export interface StopsLine {
  stops: LineStop[];
  /** Nights in a bed (not on a plane, not a gap). */
  nights: number;
  /** Stays slept at (rooms). */
  rooms: number;
  moves: number;
}

/** The stops in the order you sleep at them, each with its nights; the line's stops without nights when there are none. */
export function stopsLineOf(os: LifeOSContext, trip: ObjectRecord<TripData>, nights: Night[] = nightsOf(os, trip)): StopsLine {
  const line = stopsOf(os, trip.id, ['stop']);
  const byId = new Map(stopsOf(os, trip.id, ['stop', 'airport', 'idea']).map((s) => [s.id, s]));
  const toLine = (s: ObjectRecord<StopData>, from: string | null, n: number): LineStop => ({ stopId: s.id, title: s.title, localName: s.data.localName ?? null, color: s.data.color ?? null, from, nights: n });
  const stops: LineStop[] = [];
  for (const seg of segmentsOf(nights)) {
    const s = seg.kind === 'stay' && seg.stopId ? byId.get(seg.stopId) : null;
    if (!s) continue;
    const last = stops[stops.length - 1];
    if (last && last.stopId === s.id) last.nights += seg.nights;
    else stops.push(toLine(s, seg.from, seg.nights));
  }
  const slept = nights.filter((n) => n.kind === 'stay');
  return {
    stops: stops.length ? stops : line.map((s) => toLine(s, null, 0)),
    nights: slept.length,
    rooms: new Set(slept.map((n) => n.stayId)).size,
    moves: movingDays(nights).length,
  };
}

/** A stop's mark: its local name's first character, else its first letter. */
export const lineMark = (s: Pick<LineStop, 'title' | 'localName'>, japan: boolean) => (japan && s.localName ? [...s.localName][0]! : (s.title.trim()[0] ?? '?').toUpperCase());

/* ------------------------------------------------------------------ */
/* Stamps                                                               */
/* ------------------------------------------------------------------ */

export interface Stamps {
  stops: Array<LineStop & { got: boolean; next: boolean }>;
  got: number;
  first: LineStop | null;
}

/** A stamp for each stop on the line, collected once you have slept there; the next one to collect. */
export function stampsOfTrip(line: StopsLine, now = Date.now()): Stamps {
  const today = isoOf(now);
  const seen = new Set<string>();
  const stops = line.stops
    .filter((s) => (seen.has(s.stopId) ? false : (seen.add(s.stopId), true)))
    .map((s) => ({ ...s, got: !!s.from && s.from < today, next: false }));
  const next = stops.find((s) => !s.got);
  if (next) next.next = true;
  return { stops, got: stops.filter((s) => s.got).length, first: line.stops[0] ?? null };
}

/* ------------------------------------------------------------------ */
/* Weather by stop                                                      */
/* ------------------------------------------------------------------ */

/** Each stop's month normals (the month of its first night, else the trip's), when the table knows the place. */
export function weatherOfStops(line: StopsLine, trip: ObjectRecord<TripData>): Array<{ stop: LineStop; normals: Normals }> {
  const seen = new Set<string>();
  const out: Array<{ stop: LineStop; normals: Normals }> = [];
  for (const s of line.stops) {
    if (seen.has(s.stopId)) continue;
    seen.add(s.stopId);
    const day = s.from ?? trip.data.startDate;
    if (!day) continue;
    const normals = normalsFor(`${s.title} ${s.localName ?? ''}`, Number(day.slice(5, 7)));
    if (normals) out.push({ stop: s, normals });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Small words                                                          */
/* ------------------------------------------------------------------ */

const KANJI = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
/** 10 → 十, 14 → 十四, 20 → 二十 (1 to 99; other numbers in digits). */
export function kanjiNumber(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 10) return KANJI[n]!;
  const t = Math.floor(n / 10);
  const u = n % 10;
  return `${t > 1 ? KANJI[t] : ''}十${u ? KANJI[u] : ''}`;
}

/** "12 H 30", "45 MIN". */
export function durationWords(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} H${m ? ` ${pad(m)}` : ''}` : `${m} MIN`;
}
