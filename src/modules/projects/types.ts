import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';

/** Projects' Objects (docs/MODEL.md layer 2, Agenda; R4). No React Native: unit-tested. */

/** How often a task comes back (MODEL.md, Task's Repeats): its Due Cycle's period. */
export const REPEATS: Array<{ value: string; label: string; everyN: number; everyUnit: 'day' | 'week' | 'month' | 'year' }> = [
  { value: 'day', label: 'Every day', everyN: 1, everyUnit: 'day' },
  { value: 'week', label: 'Every week', everyN: 1, everyUnit: 'week' },
  { value: '2weeks', label: 'Every 2 weeks', everyN: 2, everyUnit: 'week' },
  { value: 'month', label: 'Every month', everyN: 1, everyUnit: 'month' },
  { value: '3months', label: 'Every 3 months', everyN: 3, everyUnit: 'month' },
  { value: 'year', label: 'Every year', everyN: 1, everyUnit: 'year' },
];

/** A yyyy-MM-dd day as local midnight (a Cycle's due). */
export const dayStart = (day: string | undefined): number | null => {
  if (!day) return null;
  const t = new Date(`${day.slice(0, 10)}T00:00:00`).getTime();
  return Number.isFinite(t) ? t : null;
};

/** The task's Due Cycle template (MODEL.md: due dates and recurring tasks are Cycles). */
export const TASK_DUE = 'task.due';
/** Statuses in which a task's Due Cycle is live (in Upkeep). */
export const OPEN_TASK = ['todo', 'doing', 'blocked'];

export const PRIORITIES = [{ value: 'low', label: 'Low', color: 'gray' }, { value: 'medium', label: 'Medium', color: 'blue' }, { value: 'high', label: 'High', color: 'orange' }, { value: 'urgent', label: 'Urgent', color: 'red' }];

export interface TaskData {
  notes?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  /** REPEATS value; empty = once. */
  repeat?: string;
  projectId?: string;
  estimateMin?: number;
  completedAt?: number;
  personIds?: string[];
}

export const taskType: ObjectDef<TaskData> = {
  id: 'task',
  module: 'projects',
  label: 'Task',
  labelPlural: 'Tasks',
  icon: 'checkmark.circle',
  schema: z.object({ notes: z.string().optional(), priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'), dueDate: z.string().optional(), repeat: z.string().optional(), projectId: z.string().optional(), estimateMin: z.coerce.number().optional(), completedAt: z.number().optional(), personIds: z.array(z.string()).optional() }),
  fields: [
    { key: 'dueDate', label: 'Due', type: 'date', summary: true },
    { key: 'repeat', label: 'Repeats', type: 'select', options: REPEATS.map(({ value, label }) => ({ value, label })), description: 'Done moves Due on; the task stays open' },
    { key: 'priority', label: 'Priority', type: 'select', default: 'medium', options: PRIORITIES },
    { key: 'projectId', label: 'Project', type: 'link', linkTo: 'project', linkWord: 'project', summary: true },
    { key: 'personIds', label: 'People', type: 'link', linkTo: 'person', linkWord: 'person', section: 'Links', default: [] },
    { key: 'estimateMin', label: 'Estimate (minutes)', type: 'number', section: 'Details' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['dueDate', 'projectId', 'priority'],
  occurredAtField: 'dueDate',
  cycleFields: { [TASK_DUE]: { nextDueAt: 'dueDate' } },
  cycleActiveStatuses: OPEN_TASK,
  cycleTemplates: (d) => {
    const due = dayStart(d.dueDate);
    if (due == null) return [];
    const r = REPEATS.find((x) => x.value === d.repeat);
    return [{ template: TASK_DUE, name: 'Due', kind: 'fixed', everyN: r?.everyN ?? null, everyUnit: r?.everyUnit ?? null, nextDueAt: due }];
  },
  statuses: [{ value: 'todo', label: 'To do' }, { value: 'doing', label: 'In progress', color: 'orange' }, { value: 'done', label: 'Done', color: 'green' }, { value: 'blocked', label: 'Blocked', color: 'red' }],
  searchText: (d) => d.notes ?? '',
  links: [{ kind: 'project', label: 'Project', to: 'project', cardinality: 'one' }],
  defaultViews: [
    { name: 'Today', icon: 'sun.max', isDefault: false, definition: { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.dueDate', op: 'lte', value: '__TODAY__' }] }, sort: [{ field: 'data.dueDate', dir: 'asc' }] } },
    { name: 'Upcoming', icon: 'calendar', definition: { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.dueDate', op: 'gt', value: '__TODAY__' }] }, sort: [{ field: 'data.dueDate', dir: 'asc' }], groupBy: 'day' } },
    { name: 'Board', icon: 'square.grid.2x2', definition: { layout: 'board', filter: { and: [{ field: 'status', op: 'neq', value: 'done' }] } } },
    { name: 'Done', definition: { filter: { and: [{ field: 'status', op: 'eq', value: 'done' }] }, sort: [{ field: 'updatedAt', dir: 'desc' }] } },
  ],
};

export interface ProjectData {
  description?: string;
  dueDate?: string;
  color?: string;
  area?: string;
}

export const projectType: ObjectDef<ProjectData> = {
  id: 'project',
  module: 'projects',
  label: 'Project',
  labelPlural: 'Projects',
  icon: 'folder',
  schema: z.object({ description: z.string().optional(), dueDate: z.string().optional(), color: z.string().optional(), area: z.string().optional() }),
  fields: [
    { key: 'description', label: 'Aim', type: 'longtext', placeholder: 'What done looks like' },
    { key: 'dueDate', label: 'Target date', type: 'date', summary: true },
    { key: 'area', label: 'Area', type: 'select', summary: true, options: [{ value: 'work', label: 'Work' }, { value: 'personal', label: 'Personal' }, { value: 'home', label: 'Home' }, { value: 'side', label: 'Side project' }, { value: 'learning', label: 'Learning' }] },
  ],
  statuses: [{ value: 'active', label: 'Active' }, { value: 'planning', label: 'Planning', color: 'gray' }, { value: 'on_hold', label: 'On hold', color: 'orange' }, { value: 'done', label: 'Done', color: 'green' }],
  searchText: (d) => d.description ?? '',
  links: [{ kind: 'project', label: 'Tasks and events', to: ['task', 'event'], cardinality: 'many' }],
};

export interface EventData {
  /** An open list: met, call, meeting, flight, stay, reservation, check-in; `event` from the calendar (MODEL.md, Event's Fields). */
  kind?: string;
  startAt: number;
  endAt?: number;
  location?: string;
  notes?: string;
  allDay?: boolean;
  personIds?: string[];
  projectId?: string;
  tripId?: string;
  /** Travel (R7g): the trip stop a stay is at (word `stop`; places owns `at`). */
  stopId?: string;
  /** Travel's booking and journey Fields (MODEL.md, *Event, new Fields for travel*; R7g slice 2). */
  booking?: 'confirmed' | 'pending' | 'planned' | 'cancelled';
  currency?: string;
  toPay?: number;
  /** Who paid the part already paid: 'me', or a Person's id. */
  paidBy?: string;
  payHow?: string;
  chargeOn?: string;
  cancelBy?: string;
  cancelNote?: string;
  checkIn?: string;
  checkOut?: string;
  access?: string;
  reference?: string;
  bookingUrl?: string;
  mapUrl?: string;
  fromStopId?: string;
  toStopId?: string;
  mode?: string;
  plan?: string;
  fare?: number;
  estimate?: boolean;
  takes?: string;
  bookNote?: string;
  seatsOpenAt?: number;
  book?: Array<{ label: string; url: string }>;
  lastConnection?: string;
  steps?: string;
  airline?: string;
  flightNo?: string;
  cost?: number;
  /** calendar, gmail… and the source's id (a re-sync updates, never duplicates). */
  source?: string;
  sourceKey?: string;
  calendars?: string[];
}

export const eventType: ObjectDef<EventData> = {
  id: 'event',
  module: 'projects',
  label: 'Event',
  labelPlural: 'Events',
  icon: 'calendar',
  color: 'red',
  schema: z.object({ kind: z.string().optional(), startAt: z.number(), endAt: z.number().optional(), location: z.string().optional(), notes: z.string().optional(), allDay: z.boolean().optional(), personIds: z.array(z.string()).optional(), projectId: z.string().optional(), tripId: z.string().optional(), stopId: z.string().optional(), booking: z.enum(['confirmed', 'pending', 'planned', 'cancelled']).optional(), currency: z.string().optional(), toPay: z.coerce.number().optional(), paidBy: z.string().optional(), payHow: z.string().optional(), chargeOn: z.string().optional(), cancelBy: z.string().optional(), cancelNote: z.string().optional(), checkIn: z.string().optional(), checkOut: z.string().optional(), access: z.string().optional(), reference: z.string().optional(), bookingUrl: z.string().optional(), mapUrl: z.string().optional(), fromStopId: z.string().optional(), toStopId: z.string().optional(), mode: z.string().optional(), plan: z.string().optional(), fare: z.coerce.number().optional(), estimate: z.boolean().optional(), takes: z.string().optional(), bookNote: z.string().optional(), seatsOpenAt: z.number().optional(), book: z.array(z.object({ label: z.string(), url: z.string() })).optional(), lastConnection: z.string().optional(), steps: z.string().optional(), airline: z.string().optional(), flightNo: z.string().optional(), cost: z.coerce.number().optional(), source: z.string().optional(), sourceKey: z.string().optional(), calendars: z.array(z.string()).optional() }),
  fields: [
    { key: 'kind', label: 'Kind', type: 'text', summary: true, placeholder: 'flight, dinner, meeting, concert…' },
    { key: 'startAt', label: 'Starts', type: 'datetime', required: true, default: () => Date.now() + 3600000 },
    { key: 'endAt', label: 'Ends', type: 'datetime' },
    { key: 'allDay', label: 'All day', type: 'boolean' },
    { key: 'location', label: 'Location', type: 'text', summary: true },
    { key: 'personIds', label: 'People', type: 'link', linkTo: 'person', linkWord: 'person', section: 'Links', default: [] },
    { key: 'projectId', label: 'Project', type: 'link', linkTo: 'project', linkWord: 'project', section: 'Links' },
    { key: 'tripId', label: 'Trip', type: 'link', linkTo: 'trip', linkWord: 'trip', section: 'Links' },
    { key: 'stopId', label: 'Stop', type: 'link', linkTo: 'stop', linkWord: 'stop', section: 'Travel', description: 'The trip stop a stay is at' },
    { key: 'airline', label: 'Airline', type: 'text', section: 'Travel' },
    { key: 'booking', label: 'Booking', type: 'select', section: 'Booking', options: [{ value: 'confirmed', label: 'Confirmed' }, { value: 'pending', label: 'Pending' }, { value: 'planned', label: 'Planned, not booked' }, { value: 'cancelled', label: 'Cancelled' }] },
    { key: 'currency', label: 'Currency', type: 'select', section: 'Booking', options: ['INR', 'JPY', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'THB'].map((c) => ({ value: c, label: c })) },
    { key: 'toPay', label: 'Still to pay', type: 'money', section: 'Booking' },
    { key: 'payHow', label: 'How the rest is paid', type: 'text', section: 'Booking' },
    { key: 'chargeOn', label: 'Card charged on', type: 'date', section: 'Booking' },
    { key: 'cancelBy', label: 'Free to cancel until', type: 'date', section: 'Booking' },
    { key: 'cancelNote', label: 'Cancellation time', type: 'text', section: 'Booking', placeholder: '23:59 JST' },
    { key: 'checkIn', label: 'Check-in', type: 'text', section: 'Booking', placeholder: '15:00–19:00' },
    { key: 'checkOut', label: 'Check-out', type: 'text', section: 'Booking', placeholder: 'by 10:00' },
    { key: 'access', label: 'Getting there', type: 'text', section: 'Booking' },
    { key: 'reference', label: 'Reference', type: 'text', section: 'Booking' },
    { key: 'bookingUrl', label: 'Booking link', type: 'contact', section: 'Booking' },
    { key: 'mapUrl', label: 'Map link', type: 'contact', section: 'Booking' },
    { key: 'fromStopId', label: 'From', type: 'link', linkTo: 'stop', linkWord: 'from_stop', section: 'Journey' },
    { key: 'toStopId', label: 'To', type: 'link', linkTo: 'stop', linkWord: 'to_stop', section: 'Journey' },
    { key: 'mode', label: 'How', type: 'select', section: 'Journey', options: ['Flight', 'Train', 'Bus', 'Train + bus', 'Taxi', 'Car', 'Walk', 'Ferry', 'Other'].map((m) => ({ value: m.toLowerCase(), label: m })) },
    { key: 'plan', label: 'Plan', type: 'select', section: 'Journey', options: [{ value: 'booked', label: 'Booked' }, { value: 'suggested', label: 'Suggested' }, { value: 'decided', label: 'Decided, not booked' }, { value: 'undecided', label: 'To decide' }] },
    { key: 'fare', label: 'Cost each', type: 'money', section: 'Journey' },
    { key: 'estimate', label: 'Cost is an estimate', type: 'boolean', section: 'Journey' },
    { key: 'takes', label: 'Takes', type: 'text', section: 'Journey', placeholder: '3.5–4 h' },
    { key: 'bookNote', label: 'Book ahead', type: 'text', section: 'Journey', placeholder: 'seats open 26 Nov' },
    { key: 'seatsOpenAt', label: 'Seats open', type: 'datetime', section: 'Journey' },
    { key: 'lastConnection', label: 'Last connection', type: 'text', section: 'Journey' },
    { key: 'steps', label: 'Step by step', type: 'longtext', section: 'Journey', description: 'One per line: 10:30 Leave the guest house' },
    { key: 'flightNo', label: 'Flight no.', type: 'text', section: 'Travel' },
    { key: 'cost', label: 'Cost', type: 'money', section: 'Details' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  computeSubtitle: (d) => [d.kind && d.kind !== 'event' ? d.kind.charAt(0).toUpperCase() + d.kind.slice(1) : null, d.airline, d.flightNo, d.location].filter(Boolean).join(' · ') || undefined,
  occurredAtField: 'startAt',
  indexed: ['startAt'],
  searchText: (d) => [d.kind, d.location, d.airline, d.flightNo, d.notes].filter(Boolean).join(' '),
  defaultViews: [{ name: 'Upcoming', definition: { filter: { and: [{ field: 'occurredAt', op: 'gte', value: '__TODAY__' }] }, sort: [{ field: 'occurredAt', dir: 'asc' }], groupBy: 'day' } }],
};


