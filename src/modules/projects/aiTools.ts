import { z } from 'zod';
import type { AiToolDef } from '@core/registry/types';
import type { GoalData, ProjectData } from './types';
import { agendaToday, findProject, overdueTasks, projectProgress, projectStatus, upcomingTasks } from './lib';

const today = () => new Date().toISOString().slice(0, 10);

/** Projects' AI tools (R4): today's agenda, what's overdue, a project's status. `tasks_overview` keeps its name until R12. */
export const projectsTools: AiToolDef[] = [
  {
    name: 'agenda_today',
    description: "Today's agenda: the events (calendar, meetings, flights) in time order and the open tasks due today.",
    input: z.object({}),
    run: async (_i, os) => {
      const a = agendaToday(os);
      return { day: a.day, events: a.events.map((e) => ({ id: e.id, title: e.title, kind: e.kind, at: e.allDay ? 'all day' : os.format.time(e.start), until: e.end && !e.allDay ? os.format.time(e.end) : undefined, location: e.location })), tasks: a.tasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority })), overdue: overdueTasks(os).length };
    },
  },
  {
    name: 'tasks_overdue',
    description: 'Open tasks past their due date, the longest late first, with how many days late.',
    input: z.object({}),
    run: async (_i, os) => ({ overdue: overdueTasks(os).map((t) => ({ id: t.id, title: t.title, due: t.due, daysLate: t.daysLate, priority: t.priority, project: t.projectId ? os.records.get(t.projectId)?.title : undefined })) }),
  },
  {
    name: 'project_status',
    description: "Where a project stands: progress (tasks done of all), what's overdue, the next task, events coming up, spend. Give its name or id.",
    input: z.object({ project: z.string().describe('The project name ("flat move") or id') }),
    run: async (input, os) => {
      const { project } = input as { project: string };
      const p = findProject(os, project);
      if (!p) return { error: `No project called “${project}”`, projects: os.records.query('project', {}, { limit: 50 }).map((x) => x.title) };
      const s = projectStatus(os, p);
      return { ...s, progress: Math.round(s.progress * 100) + '%', spend: s.spend ? os.format.currency(s.spend) : undefined };
    },
  },
  {
    name: 'tasks_overview',
    description: 'Open tasks due today/overdue, upcoming tasks, active projects with progress, and active goals.',
    input: z.object({}),
    run: async (_i, os) => ({
      dueOrOverdue: [...overdueTasks(os), ...agendaToday(os).tasks].map((x) => ({ id: x.id, title: x.title, due: x.due, priority: x.priority, status: x.status })),
      upcoming: upcomingTasks(os, Date.now(), 15).map((x) => ({ id: x.id, title: x.title, due: x.due })),
      projects: os.records.query<ProjectData>('project', { filter: { and: [{ field: 'status', op: 'in', value: ['active', 'planning'] }] } }).map((p) => ({ id: p.id, title: p.title, status: p.status, ...projectProgress(os, p.id) })),
      // Goal stays as it was until it is decided (MODEL.md layer 2, Agenda).
      goals: os.records.query<GoalData>('goal', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }).map((g) => ({ id: g.id, title: g.title, target: g.data.targetValue, current: g.data.currentValue, unit: g.data.unit, by: g.data.targetDate })),
      today: today(),
    }),
  },
];
