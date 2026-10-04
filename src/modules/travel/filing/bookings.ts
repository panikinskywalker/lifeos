import type { LifeOSContext } from '@core/registry/context';
import type { Mail } from '@core/filing/mail';
import { AIRPORTS, parseFlight, parseStay, type ParsedFlight, type ParsedStay } from './tickets';

export { parseFlight, parseStay, AIRPORTS, type ParsedFlight, type ParsedStay };

/** Flights and stays from booking mails (travel filing, R1 / R7d): one event per ticket, in its trip. */

const DAY = 86_400_000;
const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const cityOf = (code: string | null) => (code ? (AIRPORTS[code] ?? code) : null);

/** The trip covering this day (or two weeks from an open one's start), else a new "Trip to X". */
function tripOn(os: LifeOSContext, day: string, destination: string | null, ingestId: string, account: string, end?: string | null): string | null {
  if (!os.registry.objects.has('trip')) return null;
  const trips = os.records.query<{ destination?: string; startDate?: string; endDate?: string }>('trip', {}, { limit: 300 });
  const openEnd = (start: string) => iso(new Date(`${start}T12:00:00`).getTime() + 14 * DAY);
  const hit = trips.find((t) => t.data.startDate && t.data.startDate <= day && (t.data.endDate ?? openEnd(t.data.startDate)) >= day);
  if (hit) {
    if (end && hit.data.endDate && end > hit.data.endDate) os.records.update(hit.id, { data: { endDate: end } }, 'assistant');
    return hit.id;
  }
  if (!destination) return null;
  const t = os.records.create({ object: 'trip', title: `Trip to ${destination}`, data: { destination, startDate: day, ...(end ? { endDate: end } : {}) } }, 'assistant');
  os.records.timeline.add({ entityId: t.id, kind: 'email', title: `From Email · ${account}`, body: null, actor: 'system', occurredAt: Date.now(), meta: { ingestId } });
  os.filings.add({ source: 'email', sourceRef: ingestId, kind: 'trip', entityId: t.id, label: `Trip: Trip to ${destination} · from ${account}` });
  return t.id;
}

/** A ticket → one flight event (re-sent tickets and check-in mails update it), in its trip. */
export function fileFlight(os: LifeOSContext, ingestId: string, f: ParsedFlight, mail: Mail, account: string): { eventId: string | null; tripId: string | null } {
  if (!os.registry.objects.has('event')) return { eventId: null, tripId: null };
  const startAt = f.time ? new Date(`${f.date}T${f.time}:00`).getTime() : new Date(`${f.date}T12:00:00`).getTime();
  const route = f.from && f.to ? `${cityOf(f.from)} → ${cityOf(f.to)}` : null;
  const title = route ? `Flight ${route}` : `Flight ${f.flightNo}`;
  const notes = [f.pnr ? `PNR ${f.pnr}` : null, `From ${account}: “${mail.subject}”`].filter(Boolean).join('\n');
  const flights = os.records.query<{ kind?: string; flightNo?: string; startAt?: number; notes?: string }>('event', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'flight' }] } }, { limit: 500 });
  const same = flights.find((e) => (f.pnr && e.data.notes?.includes(`PNR ${f.pnr}`) && (!f.flightNo || !e.data.flightNo || e.data.flightNo === f.flightNo)) || (f.flightNo && e.data.flightNo === f.flightNo && e.data.startAt && iso(e.data.startAt) === f.date));
  const data = { kind: 'flight', startAt, allDay: !f.time, airline: f.airline ?? undefined, flightNo: f.flightNo ?? undefined, location: f.from && f.to ? `${f.from} → ${f.to}` : undefined, notes };
  let id: string;
  if (same) {
    id = same.id;
    os.records.update(id, { data: { startAt, ...(f.time ? { allDay: false } : {}) } }, 'assistant');
  } else {
    id = os.records.create({ object: 'event', title, data }, 'assistant').id;
    os.filings.add({ source: 'email', sourceRef: ingestId, kind: 'event', entityId: id, label: `Flight: ${route ?? f.flightNo} · ${f.date.slice(8)}/${f.date.slice(5, 7)}${f.flightNo ? ` · ${f.flightNo}` : ''} · from ${account}` });
  }
  os.records.timeline.add({ entityId: id, kind: 'email', title: `From Email · ${account}`, body: `${mail.fromName}: ${mail.subject}`, actor: 'system', occurredAt: mail.date, meta: { ingestId } });
  const tripId = tripOn(os, f.date, cityOf(f.to), ingestId, account);
  if (tripId && !os.links.forEntity(id, 'part_of').some((r) => r.other.id === tripId)) os.links.link(id, tripId, 'part_of', {}, 'assistant', { source: 'email', sourceId: ingestId });
  return { eventId: id, tripId };
}

/** A hotel / stay booking → a stay event across its nights, in its trip. */
export function fileStay(os: LifeOSContext, ingestId: string, st: ParsedStay, mail: Mail, account: string): { eventId: string | null; tripId: string | null } {
  if (!os.registry.objects.has('event')) return { eventId: null, tripId: null };
  const startAt = new Date(`${st.checkIn}T14:00:00`).getTime();
  const stays = os.records.query<{ kind?: string; startAt?: number }>('event', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'stay' }] } }, { limit: 500 });
  const same = stays.find((e) => e.title === `Stay · ${st.name}` && e.data.startAt && iso(e.data.startAt) === st.checkIn);
  let id: string;
  if (same) id = same.id;
  else {
    id = os.records.create({ object: 'event', title: `Stay · ${st.name}`, data: { kind: 'stay', startAt, allDay: true, ...(st.checkOut ? { endAt: new Date(`${st.checkOut}T11:00:00`).getTime() } : {}), location: st.place ?? undefined, notes: `From ${account}: “${mail.subject}”` } }, 'assistant').id;
    os.filings.add({ source: 'email', sourceRef: ingestId, kind: 'event', entityId: id, label: `Stay: ${st.name} · ${st.checkIn.slice(8)}/${st.checkIn.slice(5, 7)}${st.checkOut ? `–${st.checkOut.slice(8)}/${st.checkOut.slice(5, 7)}` : ''} · from ${account}` });
  }
  os.records.timeline.add({ entityId: id, kind: 'email', title: `From Email · ${account}`, body: `${mail.fromName}: ${mail.subject}`, actor: 'system', occurredAt: mail.date, meta: { ingestId } });
  const tripId = tripOn(os, st.checkIn, st.place, ingestId, account, st.checkOut);
  if (tripId && !os.links.forEntity(id, 'part_of').some((r) => r.other.id === tripId)) os.links.link(id, tripId, 'part_of', {}, 'assistant', { source: 'email', sourceId: ingestId });
  return { eventId: id, tripId };
}
