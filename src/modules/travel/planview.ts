import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { OutingData, StopData, TripData } from './types';
import { isoOf } from './trips';
import { movingDays, type Night } from './stops';
import { tripJourneys, type TravelEvent } from './booked';
import { normalsFor, type Normals } from './weather';

/**
 * Plan, as the trip template draws it (JP-Route, JP-Calendar, JP-Map,
 * JP-Place): the legs between the stops on the line with what to know about
 * booking each, the calendar's weeks and bars of nights, the drawn map's
 * projection, a stop's station code, the nearest stop to an idea, and the
 * shape of a day's crowds with its quiet hours.
 */

/* ------------------------------------------------------------------ */
/* Legs between the stops                                               */
/* ------------------------------------------------------------------ */

export interface PlanLeg {
  fromStopId: string;
  toStopId: string;
  /** The moving day (the first night at the next stop), or the journey's day. */
  day: string | null;
  journey: ObjectRecord<TravelEvent> | null;
}

/** A leg for each pair of stops next to each other on the line, with its journey when one is kept. */
export function planLegs(os: LifeOSContext, tripId: string, line: Array<Pick<ObjectRecord<StopData>, 'id'>>, nights: Night[]): PlanLeg[] {
  const journeys = tripJourneys(os, tripId);
  const moves = movingDays(nights);
  return line.slice(1).map((b, i) => {
    const a = line[i]!;
    const move = moves.find((m) => m.fromStopId === a.id && m.toStopId === b.id) ?? moves.find((m) => m.toStopId === b.id);
    const j = journeys.find((e) => e.data.fromStopId === a.id && e.data.toStopId === b.id) ?? (move ? journeys.find((e) => isoOf(e.data.startAt!) === move.day && (!e.data.toStopId || e.data.toStopId === b.id)) : undefined);
    return { fromStopId: a.id, toStopId: b.id, day: move?.day ?? (j ? isoOf(j.data.startAt!) : null), journey: j ?? null };
  });
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "22 Nov". */
export const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
const hhmm = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export type LegChipKind = 'seats' | 'booked' | 'open' | 'none';
/** What to know about booking a leg: booked, the day seats open (or that they are open now), or no booking. */
export function legChip(j: Pick<ObjectRecord<TravelEvent>, 'data'> | null, now = Date.now()): { kind: LegChipKind; label: string } {
  if (!j) return { kind: 'none', label: 'no journey yet' };
  if (j.data.plan === 'booked') return { kind: 'booked', label: 'booked' };
  const opens = j.data.seatsOpenAt ?? seatsFromNote(j.data.bookNote, j.data.startAt);
  if (opens) return opens > now ? { kind: 'seats', label: `seats open ${dayMonth(isoOf(opens))}` } : { kind: 'open', label: 'seats open now' };
  return { kind: 'none', label: 'no booking' };
}

const MONTH_AT: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
/** The day seats open from a booking note ("seats open about 22 Nov", "reserve from 24 Nov"), before the journey; or undefined. */
export function seatsFromNote(note: string | undefined, journeyAt: number | undefined): number | undefined {
  const m = /\b(?:open(?:s|ing)?|from)\s+(?:about\s+|around\s+|on\s+)?(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i.exec(note ?? '');
  if (!m || !journeyAt) return undefined;
  const j = new Date(journeyAt);
  let d = new Date(j.getFullYear(), MONTH_AT[m[2]!.toLowerCase()]!, Number(m[1]), 10, 0);
  if (d.getTime() > journeyAt) d = new Date(j.getFullYear() - 1, d.getMonth(), d.getDate(), 10, 0);
  return d.getTime();
}

/** "10:30→15:15 · 2–2.5 h": when it leaves and arrives, and how long it takes. */
export function legTimes(j: Pick<ObjectRecord<TravelEvent>, 'data'>): string {
  const t = j.data.allDay || !j.data.startAt ? null : `${hhmm(j.data.startAt)}${j.data.endAt ? `→${hhmm(j.data.endAt)}` : ''}`;
  return [t, j.data.takes?.replace(/^≈\s*/, '')].filter(Boolean).join(' · ');
}

/** Bus when it is only a bus; a train otherwise (train and bus too). */
export const legMode = (j: Pick<ObjectRecord<TravelEvent>, 'data'> | null): 'bus' | 'train' | 'plane' => (/plane|flight/i.test(j?.data.mode ?? '') ? 'plane' : /bus/i.test(j?.data.mode ?? '') && !/train|rail/i.test(j?.data.mode ?? '') ? 'bus' : 'train');

/** Hours a "2–2.5 h" or "40–60 min" takes, at most. */
export function takesHours(takes: string | undefined): number {
  if (!takes) return 0;
  const n = (takes.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (!n.length) return 0;
  const max = Math.max(...n);
  return /min/i.test(takes) && !/h\b/i.test(takes) ? max / 60 : max;
}

/** The moving day that takes longest (the most steps when they tie), or null. */
export function tightestMove(legs: PlanLeg[]): PlanLeg | null {
  const score = (l: PlanLeg) => takesHours(l.journey?.data.takes) * 10 + (l.journey?.data.steps?.split('\n').filter(Boolean).length ?? 0);
  return legs.filter((l) => l.day && l.journey).sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Each fare a person pays along the line, by currency. */
export function faresEach(legs: PlanLeg[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of legs) {
    const f = l.journey?.data.fare;
    if (f == null) continue;
    const c = l.journey!.data.currency ?? 'INR';
    out[c] = (out[c] ?? 0) + f;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* A stop                                                               */
/* ------------------------------------------------------------------ */

/** A stop's three-letter code for its station sign: its first letter and the next consonants (Magome → MGM). */
export function stationCode(title: string): string {
  const s = title.normalize('NFKD').replace(/[^A-Za-z]/g, '').toUpperCase();
  if (!s) return '';
  const at = [0, ...[...s].map((c, i) => (i && !'AEIOU'.includes(c) ? i : -1)).filter((i) => i > 0)].slice(0, 3);
  for (let i = 1; at.length < 3 && i < s.length; i++) if (!at.includes(i)) at.push(i);
  return at.sort((a, b) => a - b).map((i) => s[i]).join('');
}

/** The month's usual weather at a stop on its first night (the normals table), or null. */
export function planNormals(stop: Pick<ObjectRecord<StopData>, 'title' | 'data'>, day: string | null | undefined): Normals | null {
  if (!day) return null;
  return normalsFor(`${stop.title} ${stop.data.localName ?? ''}`, Number(day.slice(5, 7)));
}

export interface Pin {
  lat: number;
  lng: number;
}

/** Kilometres between two pins (great circle). */
export function kmBetween(a: Pin, b: Pin): number {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The stop on the line nearest a pin, and how far it is. */
export function nearestOnLine(pin: Pin, line: Array<{ id: string; pin: Pin | null | undefined }>): { id: string; km: number } | null {
  let best: { id: string; km: number } | null = null;
  for (const s of line) {
    if (!s.pin) continue;
    const km = kmBetween(pin, s.pin);
    if (!best || km < best.km) best = { id: s.id, km };
  }
  return best;
}

/* ------------------------------------------------------------------ */
/* The calendar                                                         */
/* ------------------------------------------------------------------ */

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Whole weeks, Monday first, from the week of the trip's first day to the week of its last. */
export function calendarDays(startDate: string, endDate: string): string[] {
  const first = new Date(`${startDate}T12:00:00`);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const out: string[] = [];
  for (const x = new Date(first); out.length < 7 * 12; x.setDate(x.getDate() + 1)) {
    const day = iso(x);
    out.push(day);
    if (day >= endDate && out.length % 7 === 0) break;
  }
  return out;
}

export interface CalendarCell {
  day: string;
  inTrip: boolean;
  /** The night's kind, 'home' on the last day. */
  kind: 'stay' | 'gap' | 'air' | 'home' | null;
  stopId: string | null;
  /** A bar starts here (its first night, or a new week); its label shows. */
  starts: boolean;
  /** A bar ends here (its last night, or the week's end). */
  ends: boolean;
  /** You move to the next stop on this day. */
  moving: boolean;
}

/** The calendar's cells: each night's stop as bars that break at the end of a week. */
export function calendarCells(days: string[], nights: Night[], endDate: string): CalendarCell[] {
  const byDay = new Map(nights.map((n) => [n.day, n]));
  const moves = new Set(movingDays(nights).map((m) => m.day));
  const key = (n: Night | undefined) => (n ? `${n.kind}:${n.stopId ?? ''}` : '');
  const start = nights[0]?.day ?? endDate;
  return days.map((day, i) => {
    const n = byDay.get(day);
    const prev = i % 7 === 0 ? undefined : byDay.get(days[i - 1]!);
    const next = i % 7 === 6 ? undefined : byDay.get(days[i + 1]!);
    const kind = n ? n.kind : day === endDate ? 'home' : null;
    return { day, inTrip: day >= start && day <= endDate, kind, stopId: n?.stopId ?? null, starts: !!n && key(prev) !== key(n), ends: !!n && key(next) !== key(n), moving: moves.has(day) };
  });
}

/* ------------------------------------------------------------------ */
/* The drawn map                                                        */
/* ------------------------------------------------------------------ */

/** The drawn map's projection (the land paths' own units): x east, y south. */
export const mapX = (lng: number) => 132.646 * lng - 17482.8;
export const mapY = (lat: number) => -162.311 * lat + 6141.9;

/** Fit pins into a box: the scale and offset that put them all inside it, centred, at most `maxScale`. */
export function fitMap(pins: Pin[], box: { x: number; y: number; w: number; h: number }, maxScale = 1.6): { scale: number; tx: number; ty: number; at: (p: Pin) => { x: number; y: number } } {
  const xs = pins.map((p) => mapX(p.lng)), ys = pins.map((p) => mapY(p.lat));
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const scale = pins.length ? Math.min(maxScale, box.w / Math.max(1, x1 - x0), box.h / Math.max(1, y1 - y0)) : 0.54;
  const tx = pins.length ? box.x + (box.w - (x1 - x0) * scale) / 2 - x0 * scale : 0;
  const ty = pins.length ? box.y + (box.h - (y1 - y0) * scale) / 2 - y0 * scale : 0;
  return { scale, tx, ty, at: (p) => ({ x: tx + mapX(p.lng) * scale, y: ty + mapY(p.lat) * scale }) };
}

/* ------------------------------------------------------------------ */
/* Crowds and quiet hours                                               */
/* ------------------------------------------------------------------ */

/** The hours the crowd card draws, 08 to 19. */
export const CROWD_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
// A sightseeing day's usual shape: quiet early, busiest around midday, emptying after day-trippers leave.
const SHAPE = [0.2, 0.3, 0.55, 0.85, 0.95, 0.8, 0.6, 0.45, 0.35, 0.22, 0.18, 0.12];

/** The hours a "quietest" note means ("before 8:00", "after 15:00", "early morning", "weekday mornings"), or null. */
export function quietHours(quietest: string | undefined): number[] | null {
  const q = (quietest ?? '').toLowerCase();
  if (!q) return null;
  const after = /after\s+(\d{1,2})(?::\d{2})?/.exec(q);
  if (after) return CROWD_HOURS.filter((h) => h >= Number(after[1]));
  const before = /before\s+(\d{1,2})(?::\d{2})?/.exec(q);
  if (before) return CROWD_HOURS.filter((h) => h < Math.max(9, Number(before[1])));
  if (/early|opening|dawn|sunrise/.test(q)) return [8, 9];
  if (/late afternoon/.test(q)) return [16, 17, 18, 19];
  if (/evening|night|dark|sunset/.test(q)) return [17, 18, 19];
  if (/morning/.test(q)) return [8, 9, 10];
  if (/afternoon/.test(q)) return [15, 16, 17];
  return null;
}

/** How full each hour gets (0 to 1) for a place this busy (1 quiet to 5 packed). */
export function crowdBars(crowd: number | undefined): number[] {
  const k = 0.75 + 0.05 * Math.min(5, Math.max(1, crowd ?? 3));
  return SHAPE.map((v) => Math.round(v * k * 100) / 100);
}

/** The thing at a stop whose quiet hours are worth a card: the busiest one that says when it is quietest. */
export function quietestThing(things: Array<ObjectRecord<OutingData>>): ObjectRecord<OutingData> | null {
  return things.filter((t) => quietHours(t.data.quietest)).sort((a, b) => (b.data.crowd ?? 0) - (a.data.crowd ?? 0) || Number(b.data.kind === 'see') - Number(a.data.kind === 'see'))[0] ?? null;
}

/* ------------------------------------------------------------------ */
/* The look                                                             */
/* ------------------------------------------------------------------ */

/** The season's character for a day (冬 in December). */
export function seasonMark(day: string | undefined): string {
  const m = day ? Number(day.slice(5, 7)) : 0;
  return m === 12 || m <= 2 ? '冬' : m <= 5 ? '春' : m <= 8 ? '夏' : '秋';
}

/** An event's character: 祭 a festival, 休 a closure, 祝 a holiday, 混 crowds, the weather's or the season's. */
export function happeningMark(e: Pick<ObjectRecord<OutingData>, 'data'>): string {
  const h = e.data.happening;
  if (h === 'festival') return '祭';
  if (h === 'closure') return '休';
  if (h === 'holiday') return '祝';
  if (h === 'crowds') return '混';
  if (h === 'weather') return seasonMark(e.data.day) === '冬' ? '雪' : '雨';
  return seasonMark(e.data.day);
}

/** The trip's dates as the calendar's title: "Dec → Jan", or one month. */
export function monthsTitle(trip: Pick<TripData, 'startDate' | 'endDate'>): string {
  if (!trip.startDate) return '';
  const a = MON[Number(trip.startDate.slice(5, 7)) - 1]!;
  const b = trip.endDate ? MON[Number(trip.endDate.slice(5, 7)) - 1]! : a;
  return a === b ? a : `${a} → ${b}`;
}
