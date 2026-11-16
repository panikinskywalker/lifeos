import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { TripData } from './types';
import { isoOf, linkedTo } from './trips';

/**
 * Prep (the trip template, R7g slice 5; MODEL.md *Task* and *Document*): the
 * trip's checklist is its Tasks (Trip and Section), its notes (the alerts)
 * are Tasks in *notes* by priority, Ready to fly counts each section, Docs
 * are the trip's Documents beside its documents Tasks, and the emergency
 * numbers come from a small table by country. Tasks are projects' Object,
 * read here as records.
 */

export interface TaskLike {
  notes?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  personIds?: string[];
  tripId?: string;
  section?: string;
  completedAt?: number;
  sourceKey?: string;
}

export type PrepFilter = 'all' | 'overdue' | 'week' | 'before' | 'during' | 'nodate';
export const SECTIONS = ['documents', 'money', 'to-do', 'packing'] as const;
export const SECTION_LABEL: Record<string, string> = { documents: 'Documents', money: 'Money & gear', 'to-do': 'To-do', packing: 'Packing', notes: 'Notes' };

export const isDone = (t: Pick<ObjectRecord<TaskLike>, 'status'>) => t.status === 'done';

function tasksOf(os: LifeOSContext, tripId: string): ObjectRecord<TaskLike>[] {
  if (!os.registry.objects.has('task')) return [];
  return os.records.query<TaskLike>('task', { filter: { and: [{ field: 'data.tripId', op: 'eq', value: tripId }] } }, { limit: 2000 }).filter((t) => !t.archived);
}

/** The checklist: the trip's Tasks that are not notes, open first, then by due day. */
export function checklistOf(os: LifeOSContext, tripId: string): ObjectRecord<TaskLike>[] {
  return tasksOf(os, tripId)
    .filter((t) => t.data.section !== 'notes')
    .sort((a, b) => Number(isDone(a)) - Number(isDone(b)) || (a.data.dueDate ?? '9').localeCompare(b.data.dueDate ?? '9') || a.title.localeCompare(b.title));
}

const PRIORITY: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** The trip's notes (alerts): open ones, critical first. */
export function notesOf(os: LifeOSContext, tripId: string, withDone = false): ObjectRecord<TaskLike>[] {
  return tasksOf(os, tripId)
    .filter((t) => t.data.section === 'notes' && (withDone || !isDone(t)))
    .sort((a, b) => (PRIORITY[a.data.priority ?? 'medium'] ?? 2) - (PRIORITY[b.data.priority ?? 'medium'] ?? 2) || a.title.localeCompare(b.title));
}

/** Overdue, due in the next 7 days, before you fly, during the trip, or with no date. */
export function filterChecklist(items: ObjectRecord<TaskLike>[], f: PrepFilter, trip: ObjectRecord<TripData>, now = Date.now()): ObjectRecord<TaskLike>[] {
  if (f === 'all') return items;
  const today = isoOf(now);
  const week = isoOf(now + 7 * 86_400_000);
  const start = trip.data.startDate ?? '9999';
  const open = items.filter((t) => !isDone(t));
  if (f === 'nodate') return open.filter((t) => !t.data.dueDate);
  const due = open.filter((t) => t.data.dueDate);
  if (f === 'overdue') return due.filter((t) => t.data.dueDate! < today);
  if (f === 'week') return due.filter((t) => t.data.dueDate! >= today && t.data.dueDate! <= week);
  if (f === 'before') return due.filter((t) => t.data.dueDate! < start);
  return due.filter((t) => t.data.dueDate! >= start);
}

/** The checklist in its sections, the usual ones first. */
export function sectionsOf(items: ObjectRecord<TaskLike>[]): Array<{ section: string; items: ObjectRecord<TaskLike>[] }> {
  const m = new Map<string, ObjectRecord<TaskLike>[]>();
  for (const t of items) {
    const s = t.data.section || 'to-do';
    m.set(s, [...(m.get(s) ?? []), t]);
  }
  const order = (s: string) => {
    const i = (SECTIONS as readonly string[]).indexOf(s);
    return i < 0 ? 99 : i;
  };
  return [...m.entries()].map(([section, items]) => ({ section, items })).sort((a, b) => order(a.section) - order(b.section) || a.section.localeCompare(b.section));
}

export interface Ready {
  done: number;
  total: number;
  /** 0 to 1. */
  share: number;
  dueToday: number;
  overdue: number;
  bySection: Array<{ section: string; done: number; total: number }>;
}

/** Ready to fly: what is done of each section and overall. */
export function readyToFly(items: ObjectRecord<TaskLike>[], now = Date.now()): Ready {
  const today = isoOf(now);
  const done = items.filter(isDone).length;
  return {
    done,
    total: items.length,
    share: items.length ? done / items.length : 0,
    dueToday: items.filter((t) => !isDone(t) && t.data.dueDate === today).length,
    overdue: items.filter((t) => !isDone(t) && t.data.dueDate && t.data.dueDate < today).length,
    bySection: sectionsOf(items).map((g) => ({ section: g.section, done: g.items.filter(isDone).length, total: g.items.length })),
  };
}

/** The trip's Documents (passports, tickets, the insurance). */
export function tripDocuments(os: LifeOSContext, tripId: string) {
  return os.registry.objects.has('document') ? linkedTo<{ kind?: string; expiresOn?: string; file?: unknown }>(os, tripId, 'document') : [];
}

export interface Emergency {
  country: string;
  police: string;
  ambulance: string;
  line?: string;
}

const EMERGENCY: Array<{ re: RegExp; e: Emergency }> = [
  { re: /japan|tokyo|kyoto|osaka/i, e: { country: 'Japan', police: '110', ambulance: '119', line: 'Japan Visitor Hotline · 050-3816-2787 · 24 h, English' } },
  { re: /thailand|bangkok|phuket/i, e: { country: 'Thailand', police: '191', ambulance: '1669', line: 'Tourist Police · 1155' } },
  { re: /singapore/i, e: { country: 'Singapore', police: '999', ambulance: '995' } },
  { re: /dubai|abu dhabi|uae|emirates/i, e: { country: 'UAE', police: '999', ambulance: '998' } },
  { re: /london|uk|england|scotland|britain/i, e: { country: 'UK', police: '999', ambulance: '999' } },
  { re: /paris|france|germany|italy|spain|europe|amsterdam|zurich|switzerland/i, e: { country: 'Europe', police: '112', ambulance: '112' } },
  { re: /usa|new york|san francisco|los angeles|canada|toronto|vancouver/i, e: { country: 'USA / Canada', police: '911', ambulance: '911' } },
  { re: /india|goa|delhi|mumbai|bengaluru|manali/i, e: { country: 'India', police: '112', ambulance: '108' } },
];

/** The emergency numbers where the trip goes, from a small table by country. */
export function emergencyFor(trip: ObjectRecord<TripData>): Emergency | null {
  const hay = [trip.data.destination, trip.data.localCurrency === 'JPY' ? 'japan' : '', trip.title].join(' ');
  return EMERGENCY.find((x) => x.re.test(hay))?.e ?? null;
}

/* ------------------------------------------------------------------ */
/* The Prep screens (the trip template's JP-Todo, JP-Pack, JP-Docs)     */
/* ------------------------------------------------------------------ */

/** Open items due today. */
export function dueToday(items: ObjectRecord<TaskLike>[], now = Date.now()): ObjectRecord<TaskLike>[] {
  const today = isoOf(now);
  return items.filter((t) => !isDone(t) && t.data.dueDate === today);
}

/** The departure-day check: the items due on the day you fly, done ones too. */
export function departureDay(items: ObjectRecord<TaskLike>[], trip: Pick<ObjectRecord<TripData>, 'data'>): ObjectRecord<TaskLike>[] {
  const start = trip.data.startDate;
  return start ? items.filter((t) => t.data.dueDate === start) : [];
}

/** Checklist items about downloads and apps (offline maps, translate, the itinerary), for Docs › Downloads. */
export const isDownload = (t: Pick<ObjectRecord<TaskLike>, 'title'>) => /\b(download|offline|install|app|apps)\b/i.test(t.title);

export type ShelfKind = 'passport' | 'visa' | 'ticket' | 'stay' | 'insurance' | 'qr' | 'doc';
export type ShelfStatus = 'done' | 'pending' | 'due';
export interface ShelfTile {
  key: string;
  kind: ShelfKind;
  title: string;
  line: string;
  status: ShelfStatus;
  /** The day it is due, for 'due'. */
  due?: string;
  /** What a tap opens. */
  open: { task?: string; document?: string; event?: string; bookings?: boolean };
}

const KIND_RANK: Record<ShelfKind, number> = { passport: 0, visa: 1, ticket: 2, stay: 3, insurance: 4, qr: 5, doc: 6 };
const kindOfTitle = (s: string): ShelfKind =>
  /insurance/i.test(s) ? 'insurance' : /visa/i.test(s) ? 'visa' : /ticket|flight|boarding/i.test(s) ? 'ticket' : /passport/i.test(s) ? 'passport' : /\b(web|qr|immigration|customs)\b/i.test(s) ? 'qr' : /stay|hotel|booking|confirmation/i.test(s) ? 'stay' : 'doc';
const DOC_KIND: Record<string, ShelfKind> = { id: 'passport', insurance: 'insurance', ticket: 'ticket' };

interface EventLike {
  kind?: string;
  booking?: string;
  flightNo?: string;
  personIds?: string[];
  startAt?: number;
}

function tripEvents(os: LifeOSContext, tripId: string): ObjectRecord<EventLike>[] {
  return linkedTo<EventLike>(os, tripId, 'event').filter((e) => !e.archived);
}

/**
 * The docs shelf: one tile per document Task on the checklist (done, due on a
 * day, or still pending), the e-tickets and the stays' confirmations from the
 * bookings, and each Document linked to the trip.
 */
export function docsShelf(os: LifeOSContext, trip: ObjectRecord<TripData>, now = Date.now()): ShelfTile[] {
  const today = isoOf(now);
  const out: ShelfTile[] = [];
  for (const t of checklistOf(os, trip.id).filter((x) => x.data.section === 'documents')) {
    const done = isDone(t);
    const due = !done && t.data.dueDate && t.data.dueDate >= today ? t.data.dueDate : undefined;
    out.push({ key: `task:${t.id}`, kind: kindOfTitle(t.title), title: t.title, line: t.data.notes?.split('\n')[0]?.trim() || (done ? 'done' : due ? 'to do' : 'still pending'), status: done ? 'done' : due ? 'due' : 'pending', due, open: { task: t.id } });
  }
  const events = tripEvents(os, trip.id).filter((e) => e.data.booking !== 'cancelled');
  const flights = events.filter((e) => e.data.kind === 'flight');
  if (flights.length) {
    const nos = [...new Set(flights.map((f) => f.data.flightNo).filter(Boolean))] as string[];
    const people = 1 + (trip.data.personIds?.length ?? 0);
    const open = flights.filter((f) => f.data.booking && f.data.booking !== 'confirmed').length;
    out.push({ key: 'tickets', kind: 'ticket', title: 'E-tickets', line: [nos.slice(0, 3).join(' · ') || `${flights.length} flight${flights.length === 1 ? '' : 's'}`, `${people} ${people === 1 ? 'person' : 'people'}`].join(' · '), status: open ? 'pending' : 'done', open: { bookings: true } });
  }
  const stays = events.filter((e) => e.data.kind === 'stay');
  if (stays.length) {
    const open = stays.filter((s) => s.data.booking && s.data.booking !== 'confirmed').length;
    out.push({ key: 'stays', kind: 'stay', title: 'Booking confirmations', line: open ? `${stays.length} stays · ${open} not confirmed` : `${stays.length} stay${stays.length === 1 ? '' : 's'}`, status: open ? 'pending' : 'done', open: { bookings: true } });
  }
  for (const d of tripDocuments(os, trip.id)) {
    const expires = d.data.expiresOn;
    const short = !!expires && expires < (trip.data.endDate ?? trip.data.startDate ?? today);
    out.push({ key: `doc:${d.id}`, kind: DOC_KIND[d.data.kind ?? ''] ?? kindOfTitle(d.title), title: d.title, line: short ? `expires ${expires}` : expires ? 'valid for the trip' : 'on file', status: short ? 'pending' : 'done', open: { document: d.id } });
  }
  return out.map((x, i) => ({ x, i })).sort((a, b) => KIND_RANK[a.x.kind] - KIND_RANK[b.x.kind] || a.i - b.i).map((y) => y.x);
}

export interface Paper {
  id: string;
  /** A Document record, or a booking (an Event) whose confirmation it is. */
  source: 'document' | 'event';
  title: string;
  /** "PDF", "Booking". */
  kind: string;
  /** What the paper says, a line each; the reference is never among them. */
  lines: string[];
  reference?: string;
  file?: { uri: string; mime: string; name: string };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1] ?? ''}`;

/** The papers the viewer pages through: the trip's Documents, then each booking's confirmation, in time order. */
export function tripPapers(os: LifeOSContext, trip: ObjectRecord<TripData>): Paper[] {
  const docs: Paper[] = tripDocuments(os, trip.id).map((d) => {
    const f = d.data.file as { uri?: string; mime?: string; name?: string } | undefined;
    const data = d.data as { kind?: string; expiresOn?: string; issuer?: string; text?: string; number?: string };
    return {
      id: d.id,
      source: 'document' as const,
      title: d.title,
      kind: f?.mime?.includes('pdf') ? 'PDF' : f?.mime?.startsWith('image/') ? 'Photo' : 'Paper',
      lines: [data.issuer, data.expiresOn ? `valid to ${dm(data.expiresOn)}` : null, ...(data.text ?? '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 4)].filter((x): x is string => !!x),
      reference: data.number,
      file: f?.uri ? { uri: f.uri, mime: f.mime ?? 'application/octet-stream', name: f.name ?? d.title } : undefined,
    };
  });
  const ev = linkedTo<EventLike & { checkIn?: string; checkOut?: string; location?: string; reference?: string; toPay?: number; currency?: string; endAt?: number; payHow?: string }>(os, trip.id, 'event')
    .filter((e) => !e.archived && e.data.booking !== 'cancelled' && ['stay', 'flight', 'ticket', 'activity'].includes(e.data.kind ?? '') && e.data.startAt)
    .sort((a, b) => (a.data.startAt ?? 0) - (b.data.startAt ?? 0));
  const books: Paper[] = ev.map((e) => {
    const from = e.data.startAt ? isoOf(e.data.startAt) : null;
    const to = e.data.endAt ? isoOf(e.data.endAt) : null;
    return {
      id: e.id,
      source: 'event' as const,
      title: e.data.kind === 'flight' && e.data.location ? e.data.location : e.title.replace(/^(Stay|Ticket) · /, ''),
      kind: e.data.kind === 'flight' ? 'E-ticket' : 'Booking',
      lines: [
        e.data.kind === 'flight' && e.data.location ? [e.data.flightNo, e.title].filter(Boolean).join(' · ') : null,
        from ? (to && to !== from ? `${dm(from)} to ${dm(to)}` : dm(from)) : null,
        e.data.kind === 'flight' ? null : e.data.location ?? null,
        e.data.checkIn ? `check-in ${e.data.checkIn}` : null,
        e.data.checkOut ? `check-out ${e.data.checkOut}` : null,
        e.data.toPay ? `${Math.round(e.data.toPay).toLocaleString('en-US')} ${e.data.currency ?? ''} to pay${e.data.payHow ? `, ${e.data.payHow}` : ''}`.trim() : null,
      ].filter((x): x is string => !!x),
      reference: e.data.reference,
    };
  });
  return [...docs, ...books];
}

/** When the trip was last saved as an offline copy, or null. */
export const offlineSavedAt = (os: LifeOSContext, tripId: string): number | null => os.settings.get<number | null>(`travel.offline.${tripId}`, null);
export const markOfflineSaved = (os: LifeOSContext, tripId: string, at = Date.now()) => os.settings.set(`travel.offline.${tripId}`, at);

/** The offline copy: bookings, tickets, addresses and the plan as plain text, to keep on the phone or print. */
export function offlineSheet(os: LifeOSContext, trip: ObjectRecord<TripData>): string {
  const lines: string[] = [`${trip.title}`, [trip.data.startDate, trip.data.endDate].filter(Boolean).join(' to '), ''];
  for (const p of tripPapers(os, trip).filter((x) => x.source === 'event')) {
    lines.push(`${p.kind}: ${p.title}`, ...p.lines.map((l) => `  ${l}`), ...(p.reference ? [`  ref ${p.reference}`] : []), '');
  }
  const open = checklistOf(os, trip.id).filter((t) => !isDone(t));
  if (open.length) lines.push('Still to do', ...open.map((t) => `  [ ] ${t.title}${t.data.dueDate ? ` (by ${dm(t.data.dueDate)})` : ''}`), '');
  const sos = emergencyFor(trip);
  if (sos) lines.push(`Emergency in ${sos.country}: police ${sos.police}, ambulance ${sos.ambulance}${sos.line ? ` · ${sos.line}` : ''}`);
  return lines.join('\n');
}

/** Home's clothes Space (the one that holds clothes), for the Clothes chip on Packing. */
export function clothesSpaceId(os: LifeOSContext): string | null {
  if (!os.registry.objects.has('space')) return null;
  return os.records.query<{ holds?: string }>('space', {}, { limit: 100 }).find((s) => s.data.holds === 'clothes')?.id ?? null;
}
