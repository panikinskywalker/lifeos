import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { OutingData, StopData, TripData } from './types';
import { isoOf, linkedTo, norm } from './trips';
import { nightsOf, stopSpan, stopsOf } from './stops';
import { thingsOf, thingStatus } from './outings';
import { checklistOf, isDone, notesOf, tripDocuments } from './prep';
import { tripBills } from './money';

/**
 * Search the trip (the trip template, JP-Search): one box over the trip's
 * records (its stops, stays, journeys and flights, things to do and events,
 * the checklist and the notes, the expenses and the papers). Each hit says
 * what it is in a quiet line and where a tap goes; the part of the title that
 * matched is marked for the highlight.
 */

export type HitKind = 'stop' | 'stay' | 'journey' | 'flight' | 'booking' | 'thing' | 'event' | 'task' | 'note' | 'bill' | 'document';

export interface SearchHit {
  kind: HitKind;
  id: string;
  title: string;
  sub: string;
  /** Where the query sits in the title ([start, end)), or null when it matched elsewhere. */
  match: [number, number] | null;
  /** What a tap opens. */
  target: { to: 'stop' | 'booking' | 'stay' | 'task' | 'bill' | 'document' | 'things'; id: string };
  /** Lower first. */
  rank: number;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''}`;
const wdm = (iso: string) => `${WEEKDAYS[new Date(`${iso}T12:00:00`).getDay()]} ${dm(iso)}`;
const span = (from: string, to: string) => (from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8, 10))}–${dm(to)}` : `${dm(from)} – ${dm(to)}`);
const SYM: Record<string, string> = { JPY: '¥', INR: '₹', USD: '$', EUR: '€', GBP: '£' };
const amt = (n: number, cur = 'INR') => `${SYM[cur] ?? `${cur} `}${Math.round(n).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US')}`;

interface Ev {
  kind?: string;
  startAt?: number;
  endAt?: number;
  location?: string;
  notes?: string;
  booking?: string;
  cost?: number;
  toPay?: number;
  currency?: string;
  payHow?: string;
  flightNo?: string;
  mode?: string;
  plan?: string;
  takes?: string;
  stopId?: string;
}

/** Where the words sit in a text, accents and case aside; -1 when they do not. */
function findIn(text: string, q: string): number {
  const t = text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  return t.indexOf(q);
}

/** Every record of the trip matching the words, best first: a title starting with them, then a word in the title, then the notes. */
export function searchTrip(os: LifeOSContext, trip: ObjectRecord<TripData>, query: string, limit = 40): SearchHit[] {
  const q = query.trim().toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  if (!q) return [];
  const out: SearchHit[] = [];
  const add = (h: Omit<SearchHit, 'match' | 'rank'>, extra: Array<string | undefined | null> = [], base = 0) => {
    const at = findIn(h.title, q);
    if (at >= 0) {
      const wordStart = at === 0 || /[\s\-–·(/→]/.test(h.title[at - 1] ?? '');
      out.push({ ...h, match: [at, at + q.length], rank: base + (at === 0 ? 0 : wordStart ? 1 : 2) });
      return;
    }
    if (extra.some((x) => x && findIn(x, q) >= 0)) out.push({ ...h, match: null, rank: base + 3 });
  };
  const nights = nightsOf(os, trip);
  const stops = stopsOf(os, trip.id);
  const stopName = new Map<string, string>(stopsOf(os, trip.id, ['stop', 'idea', 'airport'] as Array<StopData['kind']>).map((s) => [s.id, s.title]));
  stops.forEach((s, i) => {
    const sp = stopSpan(nights, s.id);
    add({ kind: 'stop', id: s.id, title: s.title, sub: [`stop ${i + 1}`, sp ? span(sp.from, sp.to) : null].filter(Boolean).join(' · '), target: { to: 'stop', id: s.id } }, [s.data.localName, s.data.about]);
  });
  for (const e of linkedTo<Ev>(os, trip.id, 'event')) {
    if (e.archived) continue;
    const k = e.data.kind ?? 'other';
    const day = e.data.startAt ? isoOf(e.data.startAt) : null;
    const title = e.title.replace(/^(Stay|Ticket) · /, '');
    if (k === 'stay') {
      const toPay = e.data.toPay ?? 0;
      const sub = ['stay', e.data.booking === 'cancelled' ? 'cancelled' : toPay > 0.5 ? `${amt(toPay, e.data.currency)} to pay${e.data.payHow ? `, ${e.data.payHow.toLowerCase()}` : ''}` : day ? dm(day) : null].filter(Boolean).join(' · ');
      add({ kind: 'stay', id: e.id, title, sub, target: { to: 'stay', id: e.id } }, [e.data.location, e.data.notes, e.data.stopId ? stopName.get(e.data.stopId) : null], 1);
    } else if (k === 'journey') {
      add({ kind: 'journey', id: e.id, title: day ? `${wdm(day)} · ${title}` : title, sub: ['moving day', e.data.mode, e.data.takes].filter(Boolean).join(' · '), target: { to: 'booking', id: e.id } }, [e.data.notes, e.data.location], 1);
    } else if (k === 'flight') {
      add({ kind: 'flight', id: e.id, title, sub: ['flight', e.data.flightNo, day ? dm(day) : null].filter(Boolean).join(' · '), target: { to: 'booking', id: e.id } }, [e.data.location, e.data.flightNo, e.data.notes], 1);
    } else {
      add({ kind: 'booking', id: e.id, title, sub: [k === 'ticket' ? 'ticket' : 'booking', day ? dm(day) : null].filter(Boolean).join(' · '), target: { to: 'booking', id: e.id } }, [e.data.location, e.data.notes], 1);
    }
  }
  for (const t of thingsOf(os, trip.id) as ObjectRecord<OutingData & { notes?: string }>[]) {
    const ev = t.data.kind === 'event';
    add({ kind: ev ? 'event' : 'thing', id: t.id, title: t.title, sub: [ev ? 'event' : 'thing to do', ev ? null : thingStatus(t), t.data.stopId ? stopName.get(t.data.stopId) : null, t.data.day ? dm(t.data.day) : null].filter(Boolean).join(' · '), target: { to: 'things', id: t.id } }, [t.data.notes, t.data.stopId ? stopName.get(t.data.stopId) : null], 2);
  }
  for (const t of checklistOf(os, trip.id)) {
    add({ kind: 'task', id: t.id, title: t.title, sub: ['checklist', isDone(t) ? 'done' : null, t.data.dueDate ? dm(t.data.dueDate) : null].filter(Boolean).join(' · '), target: { to: 'task', id: t.id } }, [t.data.notes], 2);
  }
  for (const t of notesOf(os, trip.id, true)) {
    add({ kind: 'note', id: t.id, title: t.title, sub: ['note', isDone(t) ? 'handled' : t.data.priority ?? null].filter(Boolean).join(' · '), target: { to: 'task', id: t.id } }, [t.data.notes], 3);
  }
  for (const b of tripBills(os, trip.id)) {
    add({ kind: 'bill', id: b.id, title: b.title, sub: [b.data.kind === 'payment' ? 'payment' : 'expense', amt(b.data.amount, b.data.currency), b.data.date ? dm(b.data.date) : null].filter(Boolean).join(' · '), target: { to: 'bill', id: b.id } }, [b.data.notes], 3);
  }
  for (const d of tripDocuments(os, trip.id)) {
    add({ kind: 'document', id: d.id, title: d.title, sub: ['paper', d.data.kind].filter(Boolean).join(' · '), target: { to: 'document', id: d.id } }, [], 3);
  }
  return out.sort((a, b) => a.rank - b.rank || a.title.length - b.title.length).slice(0, limit);
}

/** Search words as a normalised key (for tests and for "no hits for …"). */
export const searchKey = (q: string) => norm(q);
