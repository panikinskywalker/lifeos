import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { OPEN_TASK, TASK_DUE, type EventData, type ProjectData, type TaskData } from './types';

/**
 * Projects' reads and writes (R4): ticking a task (a repeating one rolls its
 * Due Cycle), today's agenda, what's overdue, a project's status. The board
 * and the AI tools both call these.
 */

const DAY = 86_400_000;
const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const isOpen = (t: { status?: string | null }) => OPEN_TASK.includes(t.status ?? 'todo');
const openTasks = (os: LifeOSContext) => os.records.query<TaskData>('task', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }] } }, { limit: 5000 });
/** A task's Due Cycle, if it has a due date. */
export const dueCycle = (os: LifeOSContext, taskId: string) => os.cycles.forEntity(taskId).find((c) => c.template === TASK_DUE) ?? null;

/** Tasks that belong to a project (its Project Field). */
export const tasksOf = (os: LifeOSContext, projectId: string) => os.records.query<TaskData>('task', { filter: { and: [{ field: 'data.projectId', op: 'eq', value: projectId }] } }, { limit: 2000 });

export function projectProgress(os: LifeOSContext, projectId: string) {
  const tasks = tasksOf(os, projectId);
  const done = tasks.filter((t) => t.status === 'done').length;
  return { total: tasks.length, done, progress: tasks.length ? done / tasks.length : 0 };
}

/**
 * Tick a task. A repeating one stays open: its Due Cycle is marked done (a
 * cycle done Event on its timeline) and Due moves on. Returns what Undo needs.
 */
export function completeTask(os: LifeOSContext, task: ObjectRecord<TaskData>, now = Date.now()): { repeated: boolean; eventId?: string } {
  const cycle = dueCycle(os, task.id);
  if (task.data.repeat && cycle?.everyN) {
    const eventId = os.cycles.markDone(cycle.id, { at: now });
    os.records.update<TaskData>(task.id, { data: { completedAt: now } as Partial<TaskData> });
    return { repeated: true, eventId };
  }
  os.records.update<TaskData>(task.id, { status: 'done', data: { completedAt: now } as Partial<TaskData> });
  return { repeated: false };
}

/** Undo a tick: reopen, or roll a repeating task's Due back. */
export function undoComplete(os: LifeOSContext, taskId: string, r: { repeated: boolean; eventId?: string }) {
  if (r.repeated && r.eventId) os.cycles.undoDone(r.eventId);
  else os.records.update<TaskData>(taskId, { status: 'todo', data: { completedAt: undefined } as Partial<TaskData> });
}

/** Done ↔ to do (the tick on a row). */
export function toggleTask(os: LifeOSContext, task: ObjectRecord<TaskData>) {
  if (task.status === 'done') undoComplete(os, task.id, { repeated: false });
  else completeTask(os, task);
}

export interface AgendaEvent { id: string; title: string; kind?: string; start: number; end?: number; allDay: boolean; location?: string }
export interface AgendaTask { id: string; title: string; due?: string; priority: TaskData['priority']; projectId?: string; status: string; daysLate: number; repeat?: string }

const asTask = (t: ObjectRecord<TaskData>, today: string): AgendaTask => ({
  id: t.id, title: t.title, due: t.data.dueDate, priority: t.data.priority ?? 'medium', projectId: t.data.projectId, status: t.status ?? 'todo', repeat: t.data.repeat || undefined,
  daysLate: t.data.dueDate && t.data.dueDate < today ? Math.round((startOfDay(Date.parse(`${today}T12:00:00`)) - startOfDay(Date.parse(`${t.data.dueDate.slice(0, 10)}T12:00:00`))) / DAY) : 0,
});
const asEvent = (e: ObjectRecord<EventData>): AgendaEvent => ({ id: e.id, title: e.title, kind: e.data.kind, start: e.data.startAt, end: e.data.endAt, allDay: !!e.data.allDay, location: e.data.location });

/** Events that touch a day (an all-day or a long one too), in time order. */
export function eventsOn(os: LifeOSContext, now = Date.now(), days = 1): AgendaEvent[] {
  const from = startOfDay(now);
  const to = from + days * DAY;
  return os.records
    .query<EventData>('event', { filter: { and: [{ field: 'data.startAt', op: 'lt', value: to }, { field: 'data.startAt', op: 'gte', value: from - 30 * DAY }] } }, { limit: 2000 })
    .filter((e) => (e.data.endAt ?? e.data.startAt) >= from || e.data.startAt >= from)
    .map(asEvent)
    .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
}

/** Today: the events and the open tasks due today, a priority first. */
export function agendaToday(os: LifeOSContext, now = Date.now()) {
  const today = ymd(now);
  const rank = { urgent: 0, high: 1, medium: 2, low: 3 } as const;
  const tasks = openTasks(os)
    .filter((t) => t.data.dueDate?.slice(0, 10) === today)
    .map((t) => asTask(t, today))
    .sort((a, b) => rank[a.priority] - rank[b.priority]);
  return { day: today, events: eventsOn(os, now), tasks };
}

/** Open tasks past their due day, the longest late first. */
export function overdueTasks(os: LifeOSContext, now = Date.now()): AgendaTask[] {
  const today = ymd(now);
  return openTasks(os)
    .filter((t) => t.data.dueDate && t.data.dueDate.slice(0, 10) < today)
    .map((t) => asTask(t, today))
    .sort((a, b) => b.daysLate - a.daysLate);
}

/** Open tasks due after today, soonest first. */
export function upcomingTasks(os: LifeOSContext, now = Date.now(), limit = 20): AgendaTask[] {
  const today = ymd(now);
  return openTasks(os)
    .filter((t) => t.data.dueDate && t.data.dueDate.slice(0, 10) > today)
    .map((t) => asTask(t, today))
    .sort((a, b) => a.due!.localeCompare(b.due!))
    .slice(0, limit);
}

/** A project by id, or by name ("the flat move"): exact first, then the one whose name contains it. */
export function findProject(os: LifeOSContext, q: string): ObjectRecord<ProjectData> | null {
  const byId = os.records.get<ProjectData>(q);
  if (byId?.object === 'project') return byId;
  const norm = (s: string) => s.toLowerCase().replace(/^the\s+/, '').trim();
  const all = os.records.query<ProjectData>('project', {}, { limit: 500 });
  return all.find((p) => norm(p.title) === norm(q)) ?? all.find((p) => norm(p.title).includes(norm(q))) ?? null;
}

/** Money spent on a project: expenses linked to it (through Links only; finance is never imported). */
export function projectSpend(os: LifeOSContext, projectId: string): number {
  let sum = 0;
  const seen = new Set<string>();
  for (const l of os.links.forEntity(projectId)) {
    if (l.other.object !== 'transaction' || seen.has(l.other.id)) continue;
    seen.add(l.other.id);
    const t = os.records.get<{ amount?: number; kind?: string }>(l.other.id);
    if (t && t.data.kind === 'expense') sum += Number(t.data.amount) || 0;
  }
  return sum;
}

/** Where a project stands: progress, what's overdue, what's next, its events coming up, spend. */
export function projectStatus(os: LifeOSContext, project: ObjectRecord<ProjectData>, now = Date.now()) {
  const today = ymd(now);
  const tasks = tasksOf(os, project.id);
  const open = tasks.filter(isOpen).map((t) => asTask(t, today));
  const events = os.links
    .forEntity(project.id, 'project')
    .filter((l) => l.other.object === 'event')
    .map((l) => os.records.get<EventData>(l.other.id))
    .filter((e): e is ObjectRecord<EventData> => !!e && (e.data.endAt ?? e.data.startAt) >= startOfDay(now))
    .map(asEvent)
    .sort((a, b) => a.start - b.start);
  return {
    id: project.id,
    title: project.title,
    status: project.status ?? 'active',
    aim: project.data.description,
    target: project.data.dueDate,
    ...projectProgress(os, project.id),
    overdue: open.filter((t) => t.daysLate > 0).sort((a, b) => b.daysLate - a.daysLate),
    next: open.filter((t) => t.daysLate === 0).sort((a, b) => (a.due ?? '9').localeCompare(b.due ?? '9'))[0] ?? null,
    open: open.length,
    events,
    spend: projectSpend(os, project.id),
  };
}
