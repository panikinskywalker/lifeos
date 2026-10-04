import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { TaskData } from './types';

export function projectProgress(os: LifeOSContext, projectId: string) {
  const total = os.records.count('task', { filter: { and: [{ field: 'data.projectId', op: 'eq', value: projectId }] } });
  const done = os.records.count('task', { filter: { and: [{ field: 'data.projectId', op: 'eq', value: projectId }, { field: 'status', op: 'eq', value: 'done' }] } });
  return { total, done, progress: total ? done / total : 0 };
}

export function toggleTask(os: LifeOSContext, task: ObjectRecord<TaskData>) {
  const done = task.status === 'done';
  os.records.update<TaskData>(task.id, { status: done ? 'todo' : 'done', data: { completedAt: done ? undefined : Date.now() } as Partial<TaskData> });
}

/* ------------------------------------------------------------------ */
