import type { LifeOSContext } from '../registry/context';
import { resolveCandidates } from '../ai/lifeTools';

/**
 * Phone connectors (M4.2b): contacts you pick, the phone's calendar, the
 * call log. Pure — the platform reads the phone and hands the items here.
 * Contacts are never bulk-imported; the calendar and call log only touch
 * people already in LifeOS.
 */

const DAY = 86_400_000;
const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** Last 10 digits: +91 98450 12345 = 09845012345 = 9845012345. */
export const phoneKey = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-10);
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

type PersonRow = { id: string; title: string; data: { phone?: string; email?: string; contactId?: string; lastContactAt?: string; birthday?: string; company?: string; role?: string } };
const people = (os: LifeOSContext) => os.entities.query<PersonRow['data']>('person', {}, { limit: 5000 }) as unknown as PersonRow[];

/* ------------------------------------------------------------------ */
/* Contacts                                                             */
/* ------------------------------------------------------------------ */

export interface DeviceContact {
  id: string;
  name: string;
  phones: string[];
  emails: string[];
  birthday?: { day: number; month: number; year?: number } | null;
  company?: string | null;
  jobTitle?: string | null;
}

/** The person a contact already is: the same contact, a phone number, an email, or exactly the same name. */
export function personForContact(os: LifeOSContext, c: DeviceContact): string | null {
  const all = people(os);
  const byContact = all.find((p) => p.data.contactId === c.id);
  if (byContact) return byContact.id;
  const phones = new Set(c.phones.map(phoneKey).filter((k) => k.length >= 8));
  const byPhone = all.find((p) => phones.has(phoneKey(p.data.phone)));
  if (byPhone) return byPhone.id;
  const emails = new Set(c.emails.map((e) => e.toLowerCase()));
  const byEmail = all.find((p) => p.data.email && emails.has(p.data.email.toLowerCase()));
  if (byEmail) return byEmail.id;
  const byName = resolveCandidates(os, c.name, ['person']).find((x) => x.score >= 0.95 && norm(x.title) === norm(c.name));
  return byName?.id ?? null;
}

function contactData(c: DeviceContact): Record<string, unknown> {
  const b = c.birthday;
  const birthday = b && b.month >= 0 && b.day ? `${b.year ?? new Date().getFullYear()}-${String(b.month + 1).padStart(2, '0')}-${String(b.day).padStart(2, '0')}` : undefined;
  return { phone: c.phones[0], email: c.emails[0], birthday, company: c.company ?? undefined, role: c.jobTitle ?? undefined, contactId: c.id };
}

/** Add the contacts you picked: a new person, or the existing one filled in (only empty fields). */
export function importContacts(os: LifeOSContext, picked: DeviceContact[]): { created: number; updated: number } {
  let created = 0;
  let updated = 0;
  for (const c of picked) {
    if (!c.name.trim()) continue;
    const data = Object.fromEntries(Object.entries(contactData(c)).filter(([, v]) => v != null && v !== ''));
    const id = personForContact(os, c);
    if (!id) {
      const e = os.entities.create({ type: 'person', title: c.name.trim(), data }, 'user');
      os.dumps.addExtraction({ source: 'contacts', sourceRef: c.id, kind: 'person', entityId: e.id, label: `Person: ${e.title} (from contacts)` });
      created++;
      continue;
    }
    const cur = os.entities.get<Record<string, unknown>>(id)!;
    const fill = Object.fromEntries(Object.entries(data).filter(([k]) => cur.data[k] == null || cur.data[k] === ''));
    if (Object.keys(fill).length) {
      os.entities.update(id, { data: fill }, 'user');
      os.dumps.addExtraction({ source: 'contacts', sourceRef: c.id, kind: 'person', action: 'updated', entityId: id, label: `${cur.title} · ${Object.keys(fill).filter((k) => k !== 'contactId').join(', ') || 'linked to contact'} from contacts`, before: Object.fromEntries(Object.keys(fill).map((k) => [k, null])) });
      updated++;
    }
  }
  return { created, updated };
}

/** People you already imported: fill whatever their contact has gained since (never overwrites). */
export function resyncContacts(os: LifeOSContext, contacts: DeviceContact[]): number {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  let n = 0;
  for (const p of people(os)) {
    const c = p.data.contactId ? byId.get(p.data.contactId) : undefined;
    if (!c) continue;
    const cur = p.data as Record<string, unknown>;
    const fill = Object.fromEntries(Object.entries(contactData(c)).filter(([k, v]) => v != null && v !== '' && (cur[k] == null || cur[k] === '')));
    if (Object.keys(fill).length) {
      os.entities.update(p.id, { data: fill }, 'system');
      n++;
    }
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Calendar                                                              */
/* ------------------------------------------------------------------ */

export interface CalendarEvent {
  id: string;
  title: string;
  start: number;
  end?: number | null;
  allDay?: boolean;
  location?: string | null;
  notes?: string | null;
  attendees?: Array<{ name?: string | null; email?: string | null }>;
  /** Which calendar(s) it's on ("Work · you@company.com"). */
  calendars?: string[];
}

/**
 * One event however many calendars it's in: the same meeting shows up once
 * per account (personal, work, a shared family calendar). Same title (any
 * case/spacing), same start and end minute = the same event.
 */
export function calendarKey(e: Pick<CalendarEvent, 'title' | 'start' | 'end'>): string {
  return `cal:${norm(e.title)}|${Math.round(e.start / 60_000)}|${e.end ? Math.round(e.end / 60_000) : ''}`;
}

/** Merge calendar events already filed twice or more (older syncs, other accounts): keep one, move its links, delete the rest. */
export function dedupeCalendarEvents(os: LifeOSContext): number {
  if (!os.registry.entityTypes.has('event')) return 0;
  const all = os.entities.query<{ startAt: number; endAt?: number; source?: string; sourceKey?: string }>('event', { filter: { and: [{ field: 'data.source', op: 'eq', value: 'calendar' }] } }, { limit: 5000 });
  const groups = new Map<string, typeof all>();
  for (const e of all) {
    const k = calendarKey({ title: e.title, start: e.data.startAt, end: e.data.endAt });
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  let removed = 0;
  os.db.transaction(() => {
    for (const [key, list] of groups) {
      const [keep, ...rest] = list.sort((a, b) => a.createdAt - b.createdAt);
      if (keep!.data.sourceKey !== key) os.entities.update(keep!.id, { data: { sourceKey: key } }, 'system');
      for (const dup of rest) {
        for (const r of os.relations.forEntity(dup.id)) {
          const [from, to] = r.direction === 'out' ? [keep!.id, r.other.id] : [r.other.id, keep!.id];
          os.relations.link(from, to, r.relation.kind, {}, 'system');
        }
        os.entities.delete(dup.id, 'system');
        removed++;
      }
    }
  });
  return removed;
}

/** Calendar events → events, one per real event (not per calendar), linked to the people in them who are in LifeOS. Re-sync updates in place. */
export function saveCalendarEvents(os: LifeOSContext, events: CalendarEvent[]): { created: number; updated: number; merged: number } {
  if (!os.registry.entityTypes.has('event')) return { created: 0, updated: 0, merged: 0 };
  const merged = dedupeCalendarEvents(os);
  let created = 0;
  let updated = 0;
  const all = people(os);
  // The same event from several calendars: one entry, everyone's attendees.
  const byKey = new Map<string, CalendarEvent>();
  for (const ev of events) {
    if (!ev.title?.trim()) continue;
    const k = calendarKey(ev);
    const prev = byKey.get(k);
    byKey.set(k, prev ? { ...prev, location: prev.location || ev.location, notes: prev.notes || ev.notes, attendees: [...(prev.attendees ?? []), ...(ev.attendees ?? [])], calendars: [...new Set([...(prev.calendars ?? []), ...(ev.calendars ?? [])])] } : ev);
  }
  os.db.transaction(() => {
    for (const [key, ev] of byKey) {
      const data = { kind: 'event', startAt: ev.start, endAt: ev.end ?? undefined, allDay: !!ev.allDay, location: ev.location || undefined, notes: ev.notes?.slice(0, 2000) || undefined, source: 'calendar', sourceKey: key, calendars: ev.calendars?.length ? [...ev.calendars].sort() : undefined };
      const [hit] = os.entities.query<Record<string, unknown>>('event', { filter: { and: [{ field: 'data.sourceKey', op: 'eq', value: key }] } }, { limit: 1 });
      let id: string;
      if (hit) {
        id = hit.id;
        if (hit.data.location !== data.location || hit.data.notes !== data.notes || JSON.stringify(hit.data.calendars ?? null) !== JSON.stringify(data.calendars ?? null)) {
          os.entities.update(id, { data }, 'system');
          updated++;
        }
      } else {
        id = os.entities.create({ type: 'event', title: ev.title.trim(), data }, 'system').id;
        created++;
      }
      for (const a of ev.attendees ?? []) {
        const email = a.email?.toLowerCase();
        const p = all.find((x) => (email && x.data.email?.toLowerCase() === email) || (a.name && norm(x.title) === norm(a.name)));
        if (p && !os.relations.forEntity(id, 'with').some((r) => r.other.id === p.id)) os.relations.link(id, p.id, 'with', {}, 'system', { source: 'manual', sourceId: key });
      }
    }
  });
  return { created, updated, merged };
}

/* ------------------------------------------------------------------ */
/* Call log                                                              */
/* ------------------------------------------------------------------ */

export interface CallEntry {
  number: string;
  name?: string | null;
  at: number;
  seconds: number;
  type: 'incoming' | 'outgoing' | 'missed' | 'other';
}

/** Calls with people in LifeOS move their "last contact" (and keep-in-touch cycle). Missed calls don't count. */
export function applyCallLog(os: LifeOSContext, calls: CallEntry[]): number {
  const byPhone = new Map<string, PersonRow>();
  for (const p of people(os)) {
    const k = phoneKey(p.data.phone);
    if (k.length >= 8) byPhone.set(k, p);
  }
  const latest = new Map<string, CallEntry>();
  for (const c of calls) {
    if (c.type === 'missed' || (c.type === 'incoming' && c.seconds <= 0)) continue;
    const p = byPhone.get(phoneKey(c.number));
    if (!p) continue;
    const prev = latest.get(p.id);
    if (!prev || c.at > prev.at) latest.set(p.id, c);
  }
  let n = 0;
  for (const [id, c] of latest) {
    const p = os.entities.get<PersonRow['data']>(id)!;
    const day = iso(c.at);
    if (p.data.lastContactAt && p.data.lastContactAt >= day) continue;
    os.entities.update(id, { data: { lastContactAt: day } }, 'system');
    os.entities.timeline.add({ entityId: id, kind: 'call', title: `${c.type === 'outgoing' ? 'Called' : 'Call from'} ${p.title}${c.seconds ? ` · ${Math.max(1, Math.round(c.seconds / 60))} min` : ''}`, actor: 'system', occurredAt: c.at, meta: { calllog: true } });
    n++;
  }
  return n;
}

export const PHONE_SYNC_WINDOW = { calendarPastDays: 30, calendarFutureDays: 60, callLogDays: 30, day: DAY };
