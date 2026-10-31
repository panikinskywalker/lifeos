import type { LifeOSContext } from '@core/registry/context';
import { DAY_MS, isoOf, type ModuleOverview, type OverviewBlock } from '@core/dashboard/overview';

const startOf = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Tasks and projects at a glance: open / overdue / done this week, done per day, projects' progress, what's overdue. */
export function projectsOverview(os: LifeOSContext, now = Date.now()): ModuleOverview {
  const today = isoOf(now);
  const tasks = os.records.query<{ dueDate?: string; completedAt?: number; projectId?: string; priority?: string }>('task', {}, { limit: 5000 });
  const open = tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter((t) => t.data.dueDate && t.data.dueDate < today);
  const dueToday = open.filter((t) => t.data.dueDate === today);
  const monday = startOf(now) - ((new Date(now).getDay() + 6) % 7) * DAY_MS;
  const doneWeek = tasks.filter((t) => t.status === 'done' && (t.data.completedAt ?? 0) >= monday).length;
  const perDay = Array.from({ length: 14 }, (_, i) => {
    const s = startOf(now) - (13 - i) * DAY_MS;
    return tasks.filter((t) => t.status === 'done' && (t.data.completedAt ?? 0) >= s && (t.data.completedAt ?? 0) < s + DAY_MS).length;
  });
  const blocks: OverviewBlock[] = [
    { kind: 'stats', items: [{ label: 'Open', value: String(open.length) }, { label: 'Due today', value: String(dueToday.length) }, { label: 'Overdue', value: String(overdue.length), tone: overdue.length ? 'alert' : undefined }, { label: 'Done this week', value: String(doneWeek), tone: doneWeek ? 'ok' : undefined }] },
  ];
  if (perDay.some((x) => x > 0)) blocks.push({ kind: 'bars', title: 'Done per day (2 weeks)', labels: perDay.map((_, i) => new Date(startOf(now) - (13 - i) * DAY_MS).toLocaleDateString('en-IN', { weekday: 'narrow' })), values: perDay, format: 'number' });
  if (overdue.length || dueToday.length)
    blocks.push({ kind: 'list', title: 'Needs you', items: [...overdue, ...dueToday].slice(0, 8).map((t) => ({ title: t.title, sub: t.data.dueDate! < today ? `due ${t.data.dueDate!.slice(8)}/${t.data.dueDate!.slice(5, 7)}` : 'today', entityId: t.id, type: 'task', tone: t.data.dueDate! < today ? 'alert' : undefined })), more: { label: 'All tasks', type: 'task' } });
  if (os.registry.objects.has('project')) {
    const projects = os.records.query('project', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }] } }, { limit: 50 });
    const items = projects
      .map((p) => {
        const mine = tasks.filter((t) => t.data.projectId === p.id);
        return { label: p.title, ratio: mine.length ? mine.filter((t) => t.status === 'done').length / mine.length : 0, sub: `${mine.filter((t) => t.status === 'done').length} of ${mine.length} tasks`, entityId: p.id, type: 'project' };
      })
      .filter((x) => x.sub !== '0 of 0 tasks');
    if (items.length) blocks.push({ kind: 'progress', title: 'Projects', items });
  }
  return { card: { headline: overdue.length ? `${overdue.length} overdue` : `${open.length} open`, sub: `${dueToday.length} due today · ${doneWeek} done this week`, series: perDay.slice(7), seriesFormat: 'number', alert: overdue.length > 0 }, blocks };
}
