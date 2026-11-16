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
