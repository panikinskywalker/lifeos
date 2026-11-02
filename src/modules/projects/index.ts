import type { ModuleManifest } from '@core/registry/types';
import type { ObjectRecord } from '@core/domain/types';
import { bus } from '@core/events/bus';
import { PRIORITIES, TASK_DUE, OPEN_TASK, taskType, projectType, eventType, type TaskData } from './types';
import { projectsTools } from './aiTools';
import { calendarSource } from './sources';
import { foldGoals } from './fold';

export const PROJECTS_COLOR = 'blue';
export * from './types';
export * from './lib';
export * from './calendar';
export { calendarSource, CALENDAR_WINDOW } from './sources';
export { foldGoals } from './fold';

/** R4, once: open tasks with a due date get their Due Cycle (the templates backfill ran before tasks had one). */
export function foldR4(os: Parameters<NonNullable<ModuleManifest['onStart']>>[0]): number {
  let n = 0;
  os.db.transaction(() => {
    for (const t of os.records.query<TaskData>('task', { filter: { and: [{ field: 'data.dueDate', op: 'notNull' }] } }, { limit: 100000 })) {
      if (!OPEN_TASK.includes(t.status ?? 'todo')) continue;
      n += os.cycles.applyTemplates(t as unknown as ObjectRecord, taskType as never).length;
    }
  });
  return n;
}

export const projectsModule: ModuleManifest = {
  id: 'projects',
  name: 'Projects & Tasks',
  version: '1.1.0',
  description: 'Tasks, projects and events, the calendar with them. Everything else links to them.',
  icon: 'checkmark.circle',
  color: PROJECTS_COLOR,
  dependencies: ['crm', 'travel'],
  objects: [projectType, taskType, eventType],
  sources: [calendarSource],
  onStart: (os) => {
    // Goal is dropped: each goal becomes a Project, once (before the R4 fold, so its tasks get their Due Cycle with the rest).
    if (!os.settings.get<boolean>('projects.foldedGoals', false)) {
      foldGoals(os);
      os.settings.set('projects.foldedGoals', true);
    }
    if (!os.settings.get<boolean>('projects.foldedR4', false)) {
      foldR4(os);
      os.settings.set('projects.foldedR4', true);
    }
    // A due date taken off a task: its Due Cycle has no date (out of Upkeep) until one is set again.
    bus.on('entity.updated', ({ entity, changed }) => {
      if (entity.object !== 'task' || !changed.includes('data.dueDate') || (entity.data as { dueDate?: string }).dueDate) return;
      for (const c of os.cycles.forEntity(entity.id)) if (c.template === TASK_DUE && c.nextDueAt != null) os.cycles.update(c.id, { nextDueAt: null });
    });
    // Done in Upkeep: a one-off task's Due Cycle is finished, so the task is done.
    bus.on('data.changed', ({ table, id }) => {
      if (table !== 'cycles' || !id) return;
      const c = os.cycles.get(id);
      if (!c || c.template !== TASK_DUE || c.everyN || c.nextDueAt != null || c.lastDoneAt == null) return;
      const t = os.records.get(c.entityId);
      if (t && OPEN_TASK.includes(t.status ?? 'todo')) os.records.update(t.id, { status: 'done', data: { completedAt: c.lastDoneAt } });
    });
  },
  triggers: [
    {
      id: 'projects.task.completed', module: 'projects', label: 'Task completed', event: 'entity.status',
      toContext: (p) => {
        const e = p as { entity: ObjectRecord; to: string | null };
        if (e.entity.object !== 'task' || e.to !== 'done') return null;
        return { entity: e.entity, vars: { projectId: e.entity.data.projectId } };
      },
    },
  ],
  actions: [
    {
      id: 'projects.createTask', module: 'projects', label: 'Create task',
      configFields: [{ key: 'title', label: 'Title', type: 'text', required: true }, { key: 'inDays', label: 'Due in (days)', type: 'number' }, { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES }],
      run: async (cfg, ctx, os) => {
        const due = cfg.inDays != null && cfg.inDays !== '' ? new Date(Date.now() + Number(cfg.inDays) * 86400000).toISOString().slice(0, 10) : undefined;
        const task = os.records.create<TaskData>({ object: 'task', title: String(cfg.title), data: { priority: (cfg.priority as TaskData['priority']) || 'medium', dueDate: due, projectId: ctx.entity?.object === 'project' ? ctx.entity.id : undefined } }, 'automation');
        if (ctx.entity && ctx.entity.object !== 'project') os.links.link(task.id, ctx.entity.id, 'related', {}, 'automation');
        return { line: `Task: ${task.title}`, output: { id: task.id, title: task.title }, undo: { id: task.id } };
      },
      outputs: ['id', 'title'],
      undo: (u, os) => os.records.delete((u as { id: string }).id, 'automation'),
    },
  ],
  aiTools: projectsTools,
};
