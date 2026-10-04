import { z } from 'zod';
import type { ModuleManifest } from '@core/registry/types';
import type { Entity } from '@core/domain/types';
import { PRIORITIES, taskType, projectType, goalType, eventType, type TaskData, type ProjectData, type GoalData } from './types';
import { projectProgress } from './lib';

export const PROJECTS_COLOR = 'blue';
export * from './types';
export * from './lib';
const today = () => new Date().toISOString().slice(0, 10);

export const projectsModule: ModuleManifest = {
  id: 'projects',
  name: 'Projects & Tasks',
  version: '1.0.0',
  description: 'Projects, tasks, goals and events. Everything else links to them.',
  icon: 'checkmark.circle',
  color: PROJECTS_COLOR,
  dependencies: ['crm', 'travel'],
  entityTypes: [projectType, taskType, goalType, eventType],
  triggers: [
    {
      id: 'projects.task.completed', module: 'projects', label: 'Task completed', event: 'entity.status',
      toContext: (p) => {
        const e = p as { entity: Entity; to: string | null };
        if (e.entity.type !== 'task' || e.to !== 'done') return null;
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
        const task = os.entities.create<TaskData>({ type: 'task', title: String(cfg.title), data: { priority: (cfg.priority as TaskData['priority']) || 'medium', dueDate: due, projectId: ctx.entity?.type === 'project' ? ctx.entity.id : undefined } }, 'automation');
        if (ctx.entity && ctx.entity.type !== 'project') os.relations.link(task.id, ctx.entity.id, 'related', {}, 'automation');
        return task.title;
      },
    },
  ],
  aiTools: [
    {
      name: 'tasks_overview',
      description: 'Open tasks due today/overdue, upcoming tasks, active projects with progress, and active goals.',
      input: z.object({}),
      run: async (_i, os) => ({
        dueOrOverdue: os.entities.query<TaskData>('task', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.dueDate', op: 'lte', value: today() }] } }).map((x) => ({ id: x.id, title: x.title, due: x.data.dueDate, priority: x.data.priority, status: x.status })),
        upcoming: os.entities.query<TaskData>('task', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.dueDate', op: 'gt', value: today() }] }, sort: [{ field: 'data.dueDate', dir: 'asc' }] }, { limit: 15 }).map((x) => ({ id: x.id, title: x.title, due: x.data.dueDate })),
        projects: os.entities.query<ProjectData>('project', { filter: { and: [{ field: 'status', op: 'in', value: ['active', 'planning'] }] } }).map((p) => ({ id: p.id, title: p.title, status: p.status, ...projectProgress(os, p.id) })),
        goals: os.entities.query<GoalData>('goal', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }).map((g) => ({ id: g.id, title: g.title, target: g.data.targetValue, current: g.data.currentValue, unit: g.data.unit, by: g.data.targetDate })),
      }),
    },
  ],
};

