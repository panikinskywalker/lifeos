import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { MessageParser, ParserRead, RawMessage } from '@core/filing/contract';
import { placeKindFor } from './kinds';
import { allOrgs, allPlaces, ensurePlace, findPlace, has, norm } from './lib';
import type { OrgData, PlaceData } from './types';

/**
 * Places filing (R3; docs/MODEL.md §4): where things happened becomes a Place.
 * - **Events with a location** (the calendar, travel's stay and booking mails,
 *   anything else that writes `location`) are linked *at* a Place: one you
 *   have is matched by name; a location with an address makes a new Place,
 *   shown in To check with Undo; "Zoom" or a meeting link is not a place.
 * - **Mail**: a table booking ("Your table at Toit is confirmed") becomes an
 *   Event at the restaurant; mail from an Organisation's website domain lands
 *   on its timeline, and what other parsers filed from it is *sent by* it.
 * - **Dumps** go through core's graph tools (record_event's *at* role makes
 *   the Place) and `file_place` (aiTools.ts) for "Toit is in Indiranagar".
 */

const ONLINE = /\b(zoom|google meet|meet\.google|teams|microsoft teams|webex|skype|hangouts?|online|virtual|phone call|call|whatsapp|slack|huddle|tbd|tba)\b|https?:\/\/|www\./i;

export interface ParsedLocation {
  name: string;
  address?: string;
  /** An existing Place named in the address (the city), to hang a new Place in. */
  parentId?: string;
}

/** "Toit, 298 100 Feet Rd, Indiranagar, Bengaluru 560038, India" → name Toit, the rest the address, in Indiranagar. */
export function parseLocation(os: LifeOSContext, text: string | null | undefined, places = allPlaces(os)): ParsedLocation | null {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 200 || ONLINE.test(t) || /→|->/.test(t)) return null;
  const parts = t.split(/\s*[,\n]\s*/).filter(Boolean);
  // "298, 100 Feet Rd, …" is an address with no name: nothing to call the Place.
  if (/^\d/.test(parts[0]!)) return null;
  const name = parts[0]!;
  const rest = parts.slice(1);
  let parentId: string | undefined;
  for (const part of [...rest].reverse()) {
    const words = norm(part.replace(/\b\d{5,6}\b/g, ''));
    const hit = words && places.find((p) => ['area', 'city', 'country'].includes(p.data.kind) && norm(p.title) === words);
    if (hit) {
      parentId = hit.id;
      if (hit.data.kind !== 'country') break;
    }
  }
  return { name, ...(rest.length ? { address: rest.join(', ') } : {}), ...(parentId ? { parentId } : {}) };
}

const PLACE_FOR_EVENT: Record<string, string> = { stay: 'stay', flight: 'airport', gym: 'gym', workout: 'gym', dinner: 'restaurant', lunch: 'restaurant', breakfast: 'restaurant', coffee: 'restaurant', drinks: 'restaurant', reservation: 'restaurant', game: 'venue', match: 'venue' };

/**
 * An Event's location → its Place, linked *at*. Matched when you have it;
 * made (To check, Undo) when the location carries an address or the event
 * says what kind of place it is; otherwise left as text.
 */
export function fileEventPlace(os: LifeOSContext, event: ObjectRecord, opts: { places?: ObjectRecord<PlaceData>[] } = {}): { placeId: string; created: boolean } | null {
  if (event.object !== 'event' || !has(os, 'place')) return null;
  const d = event.data as { location?: string; kind?: string; source?: string; sourceKey?: string };
  if (!d.location || d.kind === 'flight') return null;
  if (os.links.forEntity(event.id, 'at').some((r) => r.direction === 'out')) return null;
  const places = opts.places ?? allPlaces(os);
  const source = d.source === 'calendar' ? 'calendar' : 'email';
  // Travel's stays say the hotel in the title and the city as the location: the Place is the hotel, in that city.
  const hotel = d.kind === 'stay' ? /^Stay · (.+)$/.exec(event.title)?.[1] : undefined;
  if (hotel) {
    const city = findPlace(os, d.location, { places }) ?? ensurePlace(os, d.location, { kind: 'city' }).place;
    const made = ensurePlace(os, hotel, { kind: 'stay', parentId: city.id });
    if (made.created) os.filings.add({ source, sourceRef: d.sourceKey ?? event.id, kind: 'place', entityId: made.place.id, label: `Place: ${made.place.title} · from “${event.title}”` });
    os.links.link(event.id, made.place.id, 'at', { as: hotel }, 'assistant', { source: 'email', sourceId: d.sourceKey ?? null });
    return { placeId: made.place.id, created: made.created };
  }
  const whole = findPlace(os, d.location, { places });
  const loc = whole ? null : parseLocation(os, d.location, places);
  if (!whole && !loc) return null;
  const hit = whole ?? findPlace(os, loc!.name, { places });
  let placeId = hit?.id;
  let created = false;
  if (!placeId) {
    const kind = PLACE_FOR_EVENT[d.kind ?? ''] ?? placeKindFor(`${loc!.name} ${event.title}`);
    if (!loc!.address && !kind) return null;
    const made = ensurePlace(os, loc!.name, { kind, address: loc!.address, parentId: loc!.parentId });
    placeId = made.place.id;
    created = made.created;
    places.push(made.place);
    if (created) {
      os.filings.add({ source, sourceRef: d.sourceKey ?? event.id, kind: 'place', entityId: placeId, label: `Place: ${made.place.title} · from “${event.title}”`, confidence: 0.8, flag: 'A new place from an event’s location — check it' });
    }
  }
  os.links.link(event.id, placeId, 'at', { as: d.location }, 'assistant', { source: source === 'calendar' ? 'manual' : 'email', sourceId: d.sourceKey ?? null, confidence: created ? 0.8 : 1 });
  return { placeId, created };
}

/** Once after R3, and whenever the calendar or mail brings events: every event with a location but no Place. */
export function fileEventPlaces(os: LifeOSContext): number {
  if (!has(os, 'event') || !has(os, 'place')) return 0;
  const places = allPlaces(os);
  let n = 0;
  os.db.transaction(() => {
    for (const e of os.records.query('event', { filter: { and: [{ field: 'data.location', op: 'notNull' }] } }, { limit: 5000 })) {
      if (fileEventPlace(os, e, { places })) n++;
    }
  });
  return n;
}

/* ------------------------------------------------------------------ */
/* Mail                                                                 */
/* ------------------------------------------------------------------ */

const domainOf = (addr: string) => /@([\w.-]+)>?\s*$/.exec(addr)?.[1]?.toLowerCase() ?? null;
const siteDomain = (url: string) => /^(?:https?:\/\/)?(?:www\.)?([\w.-]+)/i.exec(url.trim())?.[1]?.toLowerCase() ?? null;
/** "mailer.zomato.com" and "zomato.com" are the same sender. */
const sameSite = (a: string, b: string) => a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);

/** The Organisation whose website matches the sender's domain. */
export function orgForSender(os: LifeOSContext, from: string, orgs = allOrgs(os)): ObjectRecord<OrgData> | null {
  const d = domainOf(from);
  if (!d || /^(gmail|googlemail|yahoo|outlook|hotmail|icloud|me|proton(mail)?)\./.test(d)) return null;
  return orgs.find((o) => o.data.website && sameSite(d, siteDomain(o.data.website) ?? '\0')) ?? null;
}

const TABLE = /\b(?:your\s+)?(?:table|reservation|booking)\s+(?:for\s+(\d{1,2})\s+(?:guests?|people|pax)\s+)?(?:is\s+)?(?:confirmed\s+)?at\s+([A-Z][\w&'’.-]*(?:\s+[A-Z&][\w&'’.-]*){0,5})/;
const TABLE_HINT = /\b(table|dineout|reservation)\b/i;
const WHEN = /\b(?:on\s+)?(?:(mon|tue|wed|thu|fri|sat|sun)\w*,?\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*,?\s*(\d{4})?(?:[^\d]{1,12}(\d{1,2})(?::(\d{2}))?\s*(am|pm))?/i;
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export interface ParsedTable {
  place: string;
  at: number;
  allDay: boolean;
  guests?: number;
  address?: string;
}

/** A table booking mail (Zomato, District, EazyDiner, Dineout, OpenTable, the restaurant itself). */
export function parseTable(subject: string, body: string, receivedAt: number): ParsedTable | null {
  const text = `${subject}\n${body}`;
  if (!TABLE_HINT.test(text)) return null;
  const m = TABLE.exec(text);
  if (!m) return null;
  const place = m[2]!.replace(/[.,]+$/, '').replace(/\s+(on|for|is)$/i, '').trim();
  const w = WHEN.exec(text.slice(m.index));
  if (!w) return null;
  const year = w[4] ? Number(w[4]) : new Date(receivedAt).getFullYear();
  const month = MONTHS.indexOf(w[3]!.slice(0, 3).toLowerCase());
  let hour = w[5] ? Number(w[5]) % 12 : 12;
  if (w[7]?.toLowerCase() === 'pm') hour += 12;
  const at = new Date(year, month, Number(w[2]), hour, w[6] ? Number(w[6]) : 0).getTime();
  const address = /\b(?:address|location|venue)\s*:?\s*([^\n]{8,160})/i.exec(body)?.[1]?.trim();
  return { place, at, allDay: !w[5], ...(m[1] ? { guests: Number(m[1]) } : {}), ...(address ? { address } : {}) };
}

type PlacesRead = ParserRead & { kind: 'table' | 'sender'; table?: ParsedTable; orgId?: string | null };

/** Runs after the others (priority 90) so mail they filed can be marked as sent by the Organisation. */
export const placesMailParser: MessageParser = {
  id: 'places.mail',
  module: 'places',
  priority: 90,
  read: (os, m: RawMessage) => {
    if (m.source !== 'email') return null;
    const org = has(os, 'org') ? orgForSender(os, m.from) : null;
    const table = has(os, 'event') && has(os, 'place') ? parseTable(m.title ?? '', m.body, m.receivedAt) : null;
    if (table) return { kind: 'table', table, orgId: org?.id ?? null } satisfies PlacesRead;
    if (org) return { kind: 'sender', orgId: org.id } satisfies PlacesRead;
    return null;
  },
  file: (os, m, read, ctx) => {
    const r = read as PlacesRead;
    const account = m.account ?? 'mail';
    const org = r.orgId ? os.records.get<OrgData>(r.orgId) : undefined;
    let entityId: string | null = null;
    if (r.kind === 'table' && r.table) {
      const t = r.table;
      const { place, created } = ensurePlace(os, t.place, { kind: 'restaurant', address: t.address });
      if (created) os.filings.add({ source: 'email', sourceRef: ctx.id, kind: 'place', entityId: place.id, label: `Place: ${place.title} · from ${account}` });
      const same = os.records.query<{ startAt?: number }>('event', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'reservation' }] } }, { limit: 500 }).find((e) => e.data.startAt === t.at && os.links.forEntity(e.id, 'at').some((l) => l.other.id === place.id));
      if (same) entityId = same.id;
      else {
        const ev = os.records.create({ object: 'event', title: `Table at ${place.title}`, data: { kind: 'reservation', startAt: t.at, allDay: t.allDay, notes: [t.guests ? `${t.guests} guests` : null, `From ${account}: “${m.title ?? ''}”`].filter(Boolean).join('\n') } }, 'assistant');
        os.links.link(ev.id, place.id, 'at', {}, 'assistant', { source: 'email', sourceId: ctx.id });
        os.filings.add({ source: 'email', sourceRef: ctx.id, kind: 'event', entityId: ev.id, label: `Table at ${place.title} · ${new Date(t.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · from ${account}` });
        entityId = ev.id;
      }
      if (org && org.id !== place.id) os.links.link(entityId, org.id, 'sent_by', {}, 'assistant', { source: 'email', sourceId: ctx.id });
    }
    if (org) {
      os.records.timeline.add({ entityId: org.id, kind: 'email', title: `Mail · ${m.title ?? '(no subject)'}`, body: `${(m.meta?.fromName as string | undefined) ?? m.from} → ${account}`, actor: 'system', occurredAt: m.receivedAt, meta: { ingestId: ctx.id } });
      for (const rel of ctx.related) {
        if (rel.id !== org.id && !os.links.forEntity(rel.id, 'sent_by').some((l) => l.other.id === org.id)) os.links.link(rel.id, org.id, 'sent_by', {}, 'assistant', { source: 'email', sourceId: ctx.id });
      }
    }
    if (entityId) return { status: 'confirmed', entityId, related: [{ id: entityId, word: 'part_of' }] };
    // Only "from Zomato": kept on its timeline; the mail itself stays a leftover for the other parsers.
    return { status: ctx.related.length ? 'confirmed' : 'dismissed', entityId: org?.id ?? null, note: ctx.related.length ? null : `from ${org?.title ?? 'a known sender'}; no parser understood it` };
  },
};
