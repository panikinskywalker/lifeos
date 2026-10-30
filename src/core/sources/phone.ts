import type { LifeOSContext } from '../registry/context';

/**
 * The phone's calendar (M4.2b). Pure — the platform reads the phone and hands
 * the events here; they only link people already in LifeOS. Contacts and the
 * call log are crm's sources since R2 (src/modules/crm/contacts.ts); the
 * calendar becomes a module's source with R4.
 */

const DAY = 86_400_000;
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

type PersonRow = { id: string; title: string; data: { email?: string } };
const people = (os: LifeOSContext) => os.records.query<PersonRow['data']>('person', {}, { limit: 5000 }) as unknown as PersonRow[];

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
  if (!os.registry.objects.has('event')) return 0;
  const all = os.records.query<{ startAt: number; endAt?: number; source?: string; sourceKey?: string }>('event', { filter: { and: [{ field: 'data.source', op: 'eq', value: 'calendar' }] } }, { limit: 5000 });
  const groups = new Map<string, typeof all>();
  for (const e of all) {
    const k = calendarKey({ title: e.title, start: e.data.startAt, end: e.data.endAt });
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  let removed = 0;
  os.db.transaction(() => {
    for (const [key, list] of groups) {
      const [keep, ...rest] = list.sort((a, b) => a.createdAt - b.createdAt);
      if (keep!.data.sourceKey !== key) os.records.update(keep!.id, { data: { sourceKey: key } }, 'system');
      for (const dup of rest) {
        for (const r of os.links.forEntity(dup.id)) {
          const [from, to] = r.direction === 'out' ? [keep!.id, r.other.id] : [r.other.id, keep!.id];
          os.links.link(from, to, r.relation.kind, {}, 'system');
        }
        os.records.delete(dup.id, 'system');
        removed++;
      }
    }
  });
  return removed;
}

/** Calendar events → events, one per real event (not per calendar), linked to the people in them who are in LifeOS. Re-sync updates in place. */
export function saveCalendarEvents(os: LifeOSContext, events: CalendarEvent[]): { created: number; updated: number; merged: number } {
  if (!os.registry.objects.has('event')) return { created: 0, updated: 0, merged: 0 };
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
      const [hit] = os.records.query<Record<string, unknown>>('event', { filter: { and: [{ field: 'data.sourceKey', op: 'eq', value: key }] } }, { limit: 1 });
      let id: string;
      if (hit) {
        id = hit.id;
        if (hit.data.location !== data.location || hit.data.notes !== data.notes || JSON.stringify(hit.data.calendars ?? null) !== JSON.stringify(data.calendars ?? null)) {
          os.records.update(id, { data }, 'system');
          updated++;
        }
      } else {
        id = os.records.create({ object: 'event', title: ev.title.trim(), data }, 'system').id;
        created++;
      }
      for (const a of ev.attendees ?? []) {
        const email = a.email?.toLowerCase();
        const p = all.find((x) => (email && x.data.email?.toLowerCase() === email) || (a.name && norm(x.title) === norm(a.name)));
        if (p && !os.links.forEntity(id, 'with').some((r) => r.other.id === p.id)) os.links.link(id, p.id, 'with', {}, 'system', { source: 'manual', sourceId: key });
      }
    }
  });
  return { created, updated, merged };
}

export const PHONE_SYNC_WINDOW = { calendarPastDays: 30, calendarFutureDays: 60, callLogDays: 30, day: DAY };
