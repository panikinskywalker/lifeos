import { z } from 'zod';
import type { ObjectDef } from '@core/domain/types';

/** Projects record types (no React Native — unit-tested). */

export const PRIORITIES = [{ value: 'low', label: 'Low', color: 'gray' }, { value: 'medium', label: 'Medium', color: 'blue' }, { value: 'high', label: 'High', color: 'orange' }, { value: 'urgent', label: 'Urgent', color: 'red' }];

export interface TaskData {
  notes?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  projectId?: string;
  goalId?: string;
  estimateMin?: number;
  completedAt?: number;
  personIds?: string[];
}

export const taskType: ObjectDef<TaskData> = {
  type: 'task',
  module: 'projects',
  label: 'Task',
  labelPlural: 'Tasks',
  icon: 'checkmark.circle',
  schema: z.object({ notes: z.string().optional(), priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'), dueDate: z.string().optional(), projectId: z.string().optional(), goalId: z.string().optional(), estimateMin: z.coerce.number().optional(), completedAt: z.number().optional(), personIds: z.array(z.string()).optional() }),
  fields: [
    { key: 'dueDate', label: 'Due', type: 'date', summary: true },
    { key: 'priority', label: 'Priority', type: 'select', defaultValue: 'medium', options: PRIORITIES },
    { key: 'projectId', label: 'Project', type: 'relation', relationTo: 'project', relationKind: 'project', summary: true },
    { key: 'goalId', label: 'Goal', type: 'relation', relationTo: 'goal', relationKind: 'goal', section: 'Links' },
    { key: 'personIds', label: 'People', type: 'relation', relationTo: 'person', relationKind: 'person', section: 'Links', defaultValue: [] },
    { key: 'estimateMin', label: 'Estimate (minutes)', type: 'number', section: 'Details' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['dueDate', 'projectId', 'priority'],
  occurredAtField: 'dueDate',
  statuses: [{ value: 'todo', label: 'To do' }, { value: 'doing', label: 'In progress', color: 'orange' }, { value: 'done', label: 'Done', color: 'green' }, { value: 'blocked', label: 'Blocked', color: 'red' }],
  searchText: (d) => d.notes ?? '',
  links: [{ kind: 'project', label: 'Project', to: 'project', cardinality: 'one' }, { kind: 'goal', label: 'Goal', to: 'goal', cardinality: 'one' }],
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
  type: 'project',
  module: 'projects',
  label: 'Project',
  labelPlural: 'Projects',
  icon: 'folder',
  schema: z.object({ description: z.string().optional(), dueDate: z.string().optional(), color: z.string().optional(), area: z.string().optional() }),
  fields: [
    { key: 'description', label: 'Description', type: 'longtext' },
    { key: 'dueDate', label: 'Target date', type: 'date', summary: true },
    { key: 'area', label: 'Area', type: 'select', summary: true, options: [{ value: 'work', label: 'Work' }, { value: 'personal', label: 'Personal' }, { value: 'home', label: 'Home' }, { value: 'side', label: 'Side project' }, { value: 'learning', label: 'Learning' }] },
  ],
  statuses: [{ value: 'active', label: 'Active' }, { value: 'planning', label: 'Planning', color: 'gray' }, { value: 'on_hold', label: 'On hold', color: 'orange' }, { value: 'done', label: 'Done', color: 'green' }],
  searchText: (d) => d.description ?? '',
  links: [{ kind: 'project', label: 'Tasks', to: 'task', cardinality: 'many' }, { kind: 'goal', label: 'Goal', to: 'goal', cardinality: 'one' }],
};

export interface GoalData {
  description?: string;
  targetDate?: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  area?: string;
}

export const goalType: ObjectDef<GoalData> = {
  type: 'goal',
  module: 'projects',
  label: 'Goal',
  labelPlural: 'Goals',
  icon: 'target',
  color: 'indigo',
  schema: z.object({ description: z.string().optional(), targetDate: z.string().optional(), targetValue: z.coerce.number().optional(), currentValue: z.coerce.number().optional(), unit: z.string().optional(), area: z.string().optional() }),
  fields: [
    { key: 'description', label: 'Why this matters', type: 'longtext' },
    { key: 'targetDate', label: 'Target date', type: 'date', summary: true },
    { key: 'targetValue', label: 'Target value', type: 'number', section: 'Progress' },
    { key: 'currentValue', label: 'Current value', type: 'number', section: 'Progress' },
    { key: 'unit', label: 'Unit', type: 'text', placeholder: 'kg, ₹, books…', section: 'Progress' },
    { key: 'area', label: 'Area', type: 'select', options: [{ value: 'health', label: 'Health' }, { value: 'money', label: 'Money' }, { value: 'career', label: 'Career' }, { value: 'learning', label: 'Learning' }, { value: 'relationships', label: 'Relationships' }, { value: 'other', label: 'Other' }] },
  ],
  statuses: [{ value: 'active', label: 'Active' }, { value: 'achieved', label: 'Achieved', color: 'green' }, { value: 'dropped', label: 'Dropped', color: 'gray' }],
  occurredAtField: 'targetDate',
};

export interface EventData {
  /** Free label: flight, dinner, meeting, concert, hike… (docs/GRAPH.md — any activity is an event with a kind). */
  kind?: string;
  startAt: number;
  endAt?: number;
  location?: string;
  notes?: string;
  allDay?: boolean;
  personIds?: string[];
  tripId?: string;
  airline?: string;
  flightNo?: string;
  cost?: number;
  /** calendar, gmail… and the source's id (a re-sync updates, never duplicates). */
  source?: string;
  sourceKey?: string;
  calendars?: string[];
}

export const eventType: ObjectDef<EventData> = {
  type: 'event',
  module: 'projects',
  label: 'Event',
  labelPlural: 'Events',
  icon: 'calendar',
  color: 'red',
  schema: z.object({ kind: z.string().optional(), startAt: z.number(), endAt: z.number().optional(), location: z.string().optional(), notes: z.string().optional(), allDay: z.boolean().optional(), personIds: z.array(z.string()).optional(), tripId: z.string().optional(), airline: z.string().optional(), flightNo: z.string().optional(), cost: z.coerce.number().optional(), source: z.string().optional(), sourceKey: z.string().optional(), calendars: z.array(z.string()).optional() }),
  fields: [
    { key: 'kind', label: 'Kind', type: 'text', summary: true, placeholder: 'flight, dinner, meeting, concert…' },
    { key: 'startAt', label: 'Starts', type: 'datetime', required: true, defaultValue: () => Date.now() + 3600000 },
    { key: 'endAt', label: 'Ends', type: 'datetime' },
    { key: 'allDay', label: 'All day', type: 'boolean' },
    { key: 'location', label: 'Location', type: 'text', summary: true },
    { key: 'personIds', label: 'People', type: 'relation', relationTo: 'person', relationKind: 'person', section: 'Links', defaultValue: [] },
    { key: 'tripId', label: 'Trip', type: 'relation', relationTo: 'trip', relationKind: 'trip', section: 'Links' },
    { key: 'airline', label: 'Airline', type: 'text', section: 'Travel' },
    { key: 'flightNo', label: 'Flight no.', type: 'text', section: 'Travel' },
    { key: 'cost', label: 'Cost', type: 'currency', section: 'Details' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  computeSubtitle: (d) => [d.kind && d.kind !== 'event' ? d.kind.charAt(0).toUpperCase() + d.kind.slice(1) : null, d.airline, d.flightNo, d.location].filter(Boolean).join(' · ') || undefined,
  occurredAtField: 'startAt',
  indexed: ['startAt'],
  searchText: (d) => [d.kind, d.location, d.airline, d.flightNo, d.notes].filter(Boolean).join(' '),
  defaultViews: [{ name: 'Upcoming', definition: { filter: { and: [{ field: 'occurredAt', op: 'gte', value: '__TODAY__' }] }, sort: [{ field: 'occurredAt', dir: 'asc' }], groupBy: 'day' } }],
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

