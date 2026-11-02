import type { BrainDef, Candidate, Nudge } from '@core/brain/contract';
import type { LifeOSContext } from '@core/registry/context';
import type { TripData } from './types';
import { DAY, daysToStart, isoOf, trips, tripDays, tripPhase } from './trips';
import { DEFAULT_DAYS, climateOf, hasPacked, isAbroad, packingKey, packingList, stillPacked } from './packing';

/**
 * What travel brings the brain (docs/MODEL.md layer 8, *Travel through the
 * same brain*), all *coming up*: **pack** (a trip within 3 days with nothing
 * packed; Claude fills a list for this kind of trip, kept by its key),
 * **check in** (a flight within 48 hours; Yes opens the airline), **before you
 * go** (the day or two before: Claude joins it with the pass's other nudges,
 * "use the paneer first, skip Sunday's order"), and **back home?** (clothes
 * still packed after a trip). What leaves: the destination, days, purpose,
 * the airline and when; never a PNR or a mail.
 */

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const when = (days: number, day: string) => (days === 0 ? 'today' : days === 1 ? 'tomorrow' : `on ${WEEKDAY[new Date(`${day}T12:00:00`).getDay()]}`);

/** The airline's own site, for checking in (its web check-in page is a tap away there). */
export const AIRLINE_SITES: Record<string, string> = {
  IndiGo: 'https://www.goindigo.in',
  'Air India': 'https://www.airindia.com',
  'Air India Express': 'https://www.airindiaexpress.com',
  'Akasa Air': 'https://www.akasaair.com',
  SpiceJet: 'https://www.spicejet.com',
};

function tripRecord(t: TripData, now: number): Record<string, string | number | boolean | null> {
  return { destination: t.destination, days: tripDays(t) ?? null, starts_in_days: daysToStart(t, now), purpose: t.purpose ?? null, kind_of_place: climateOf(t), abroad: isAbroad(t) };
}

function packCandidates(os: LifeOSContext, now: number): Candidate[] {
  const out: Candidate[] = [];
  for (const t of trips(os)) {
    const d = daysToStart(t.data, now);
    if (d == null || d < 0 || d > 3 || hasPacked(os, t)) continue;
    const list = packingList(os, t);
    const record = tripRecord(t.data, now);
    out.push({
      key: `travel:pack:${t.id}:${t.data.startDate}`,
      kind: 'coming up',
      shape: 'ask',
      subjectId: t.id,
      route: `/module/travel/pack?trip=${t.id}`,
      title: t.title,
      line: `${t.data.destination} ${when(d, t.data.startDate!)}: pack ${list.line.split(' · ').pop()}`,
      record: { ...record, clean_clothes: list.clothes.filter((c) => c.state === 'clean').length },
      urgent: d === 0,
      rank: d,
      yes: 'Pack',
      asks: [{ key: packingKey(t.data), slot: `packing for ${t.data.destination}`, prompt: `What to pack for ${tripDays(t.data) ?? DEFAULT_DAYS} days in ${t.data.destination} beyond clothes and toiletries: a short list of things, one or two words each.`, record, list: true }],
      payload: { tripId: t.id, what: 'pack' },
    });
  }
  return out;
}

function checkInCandidates(os: LifeOSContext, now: number): Candidate[] {
  if (!os.registry.objects.has('event')) return [];
  const flights = os.records.query<{ kind?: string; startAt?: number; airline?: string; flightNo?: string; location?: string }>('event', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'flight' }] } }, { limit: 500 });
  const out: Candidate[] = [];
  for (const f of flights) {
    const at = f.data.startAt ?? 0;
    const hours = (at - now) / 3_600_000;
    if (hours < 2 || hours > 48) continue;
    const time = new Date(at).toTimeString().slice(0, 5);
    const d = Math.round((new Date(`${isoOf(at)}T12:00:00`).getTime() - new Date(`${isoOf(now)}T12:00:00`).getTime()) / DAY);
    out.push({
      key: `travel:checkin:${f.id}:${at}`,
      kind: 'coming up',
      shape: 'ask',
      subjectId: f.id,
      title: f.title,
      line: `Check in: ${f.data.flightNo ?? f.title} ${when(d, isoOf(at))} at ${time}`,
      record: { flight: f.title, airline: f.data.airline ?? null, departs_in_hours: Math.round(hours), route: f.data.location ?? null },
      urgent: hours <= 24,
      rank: Math.round(hours / 24) - 1,
      yes: f.data.airline && AIRLINE_SITES[f.data.airline] ? 'Check in' : 'Open',
      payload: { eventId: f.id, what: 'checkin' },
    });
  }
  return out;
}

function beforeYouGo(os: LifeOSContext, now: number): Candidate[] {
  const out: Candidate[] = [];
  for (const t of trips(os)) {
    const d = daysToStart(t.data, now);
    if (d == null || d < 1 || d > 2) continue;
    const days = tripDays(t.data);
    const record = tripRecord(t.data, now);
    out.push({
      key: `travel:before:${t.id}:${t.data.startDate}`,
      kind: 'coming up',
      shape: 'check',
      subjectId: t.id,
      title: t.title,
      line: `${t.data.destination} ${when(d, t.data.startDate!)}${days ? ` for ${days} days` : ''}: before you go, use up the fridge, pause grocery orders, water the plants`,
      record,
      rank: 4 + d,
      yes: 'Right',
      asks: [{ key: `travel:beforelist:${t.id}:${t.data.startDate}`, slot: `before you go to ${t.data.destination}`, prompt: `What to do at home before leaving for ${days ?? 'a few'} days, joined with the other nudges in this pass (food to use up, orders to skip, matches to drop out of); short lines.`, record, list: true }],
      payload: { tripId: t.id, what: 'before' },
    });
  }
  return out;
}

function backHomeCandidates(os: LifeOSContext, now: number): Candidate[] {
  const out: Candidate[] = [];
  for (const t of trips(os)) {
    if (tripPhase(t.data, now) !== 'back' || (t.data.endDate ?? t.data.startDate)! < isoOf(now - 7 * DAY)) continue;
    const n = stillPacked(os, t.id);
    if (!n) continue;
    out.push({
      key: `travel:back:${t.id}:${t.data.endDate ?? t.data.startDate}`,
      kind: 'coming up',
      shape: 'ask',
      subjectId: t.id,
      route: `/module/travel/pack?trip=${t.id}`,
      title: t.title,
      line: `Back from ${t.data.destination}? ${n} ${n === 1 ? 'thing is' : 'things are'} still packed`,
      record: { destination: t.data.destination, still_packed: n },
      rank: 8,
      yes: 'Unpack',
      payload: { tripId: t.id, what: 'back' },
    });
  }
  return out;
}

export const travelBrain: BrainDef = {
  candidates: (os, now) => [...checkInCandidates(os, now), ...packCandidates(os, now), ...beforeYouGo(os, now), ...backHomeCandidates(os, now)],
  act(os, verb, nudge: Nudge) {
    if (verb !== 'yes') return null;
    const p = (nudge.payload ?? {}) as { tripId?: string; eventId?: string; what?: string };
    if (p.what === 'checkin' && p.eventId) {
      const f = os.records.get<{ airline?: string }>(p.eventId);
      if (!f) return null;
      const site = f.data.airline ? AIRLINE_SITES[f.data.airline] : undefined;
      return { open: site ?? `/entity/event/${f.id}` };
    }
    if ((p.what === 'pack' || p.what === 'back') && p.tripId) return { open: `/module/travel/pack?trip=${p.tripId}` };
    return null;
  },
  skills: [{ name: 'Travel', body: 'A flight to check in for comes first; then packing. Packing lists are short, things not advice; clothes are counted by the days. Before you go joins the trip with what else is coming up at home: food to use first, orders to skip, matches to drop out of. Never invent bookings.' }],
};
