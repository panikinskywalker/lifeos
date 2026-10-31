import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { DeviceBridge, LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { runSource } from '@core/filing/sources';
import { crmModule } from '../crm';
import { travelModule } from '../travel';
import { placesModule } from '../places';
import { financeModule } from '../finance';
import { agendaToday, completeTask, dueCycle, foldR4, overdueTasks, projectStatus, projectsModule, undoComplete, type TaskData } from '.';

const DAY = 86_400_000;
const iso = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const at = (t: number, h: number) => {
  const d = new Date(t);
  d.setHours(h, 0, 0, 0);
  return d.getTime();
};

let os: LifeOSContext;
const modules = [crmModule, projectsModule, travelModule, placesModule, financeModule];
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules, registry: new Registry() });
});
afterEach(() => os.db.close());

const task = (title: string, data: Partial<TaskData> = {}, status?: string) => os.records.create<TaskData>({ object: 'task', title, status, data: { priority: 'medium', ...data } });
const tool = (name: string) => projectsModule.aiTools!.find((t) => t.name === name)!;

describe('tasks: due dates and repeats are Cycles', () => {
  it('a due date makes a one-off Due Cycle; done finishes the task and takes it out of Upkeep', () => {
    const now = Date.now();
    const t = task('Renew passport', { dueDate: iso(now + 3 * DAY) });
    const c = dueCycle(os, t.id)!;
    expect(c).toMatchObject({ name: 'Due', kind: 'fixed', everyN: null, enabled: true });
    expect(iso(c.nextDueAt!)).toBe(iso(now + 3 * DAY));
    // Moving Due moves the Cycle.
    os.records.update(t.id, { data: { dueDate: iso(now + 5 * DAY) } });
    expect(iso(dueCycle(os, t.id)!.nextDueAt!)).toBe(iso(now + 5 * DAY));
    const r = completeTask(os, os.records.get<TaskData>(t.id)!);
    expect(r.repeated).toBe(false);
    expect(os.records.get(t.id)!.status).toBe('done');
    expect(dueCycle(os, t.id)!.enabled).toBe(false);
    undoComplete(os, t.id, r);
    expect(os.records.get(t.id)!.status).toBe('todo');
    expect(dueCycle(os, t.id)!.enabled).toBe(true);
  });

  it('a repeating task stays open: done logs a cycle done Event and moves Due on; Undo moves it back', () => {
    const now = Date.now();
    const due = iso(now);
    const t = task('Water the plants', { dueDate: due, repeat: 'week' });
    expect(dueCycle(os, t.id)).toMatchObject({ everyN: 1, everyUnit: 'week' });
    const r = completeTask(os, os.records.get<TaskData>(t.id)!, now);
    expect(r.repeated).toBe(true);
    const after = os.records.get<TaskData>(t.id)!;
    expect(after.status).toBe('todo');
    expect(after.data.dueDate).toBe(iso(at(now, 12) + 7 * DAY));
    expect(os.records.timeline.forEntity(t.id).some((e) => e.kind === 'cycle.done' && e.title === 'Due done')).toBe(true);
    undoComplete(os, t.id, r);
    expect(os.records.get<TaskData>(t.id)!.data.dueDate).toBe(due);
  });

  it('done in Upkeep finishes a one-off task; a due date taken off takes it out of Upkeep', () => {
    const t = task('Pay rent', { dueDate: iso(Date.now()) });
    os.cycles.markDone(dueCycle(os, t.id)!.id);
    expect(os.records.get(t.id)!.status).toBe('done');
    const u = task('Call the plumber', { dueDate: iso(Date.now() + DAY) });
    os.records.update(u.id, { data: { dueDate: undefined } });
    expect(dueCycle(os, u.id)!.nextDueAt).toBeNull();
    os.records.update(u.id, { data: { dueDate: iso(Date.now() + 2 * DAY) } });
    expect(iso(dueCycle(os, u.id)!.nextDueAt!)).toBe(iso(Date.now() + 2 * DAY));
  });

  it('the R4 fold gives open tasks from before R4 their Due Cycle, once', () => {
    const t = task('Old task', { dueDate: iso(Date.now() - 2 * DAY) });
    const done = task('Old done', { dueDate: iso(Date.now() - 2 * DAY) }, 'done');
    for (const id of [t.id, done.id]) for (const c of os.cycles.forEntity(id)) os.db.run(`DELETE FROM cycles WHERE id=?`, [c.id]);
    expect(foldR4(os)).toBe(1);
    expect(dueCycle(os, t.id)).not.toBeNull();
    expect(dueCycle(os, done.id)).toBeNull();
    expect(foldR4(os)).toBe(0);
  });
});

describe('agenda and projects', () => {
  it("today's agenda, what's overdue and a project's status", async () => {
    const now = Date.now();
    const p = os.records.create({ object: 'project', title: 'Flat move', status: 'active', data: { description: 'Into 4B by December' } });
    task('Book movers', { dueDate: iso(now - 3 * DAY), projectId: p.id, priority: 'high' });
    task('Pack books', { dueDate: iso(now), projectId: p.id, priority: 'urgent' });
    task('Change address', { dueDate: iso(now + 4 * DAY), projectId: p.id });
    task('Buy curtains', { projectId: p.id }, 'done');
    task('Unrelated', { dueDate: iso(now) });
    os.records.create({ object: 'event', title: 'Standup', data: { kind: 'meeting', startAt: at(now, 10), endAt: at(now, 10) + 900_000 } });
    os.records.create({ object: 'event', title: 'Holiday', data: { kind: 'event', startAt: at(now, 0), allDay: true } });
    os.records.create({ object: 'event', title: 'Tomorrow', data: { startAt: at(now, 9) + DAY } });
    const visit = os.records.create({ object: 'event', title: 'See the flat', data: { kind: 'met', startAt: now + 2 * DAY, projectId: p.id } });
    os.records.create({ object: 'transaction', title: 'Movers advance', data: { amount: 2000, kind: 'expense', category: 'home', date: iso(now), projectId: p.id } });

    const a = agendaToday(os, now);
    expect(a.events.map((e) => e.title)).toEqual(['Holiday', 'Standup']);
    expect(a.tasks.map((t) => t.title)).toEqual(['Pack books', 'Unrelated']);
    expect(overdueTasks(os, now)).toMatchObject([{ title: 'Book movers', daysLate: 3 }]);

    const s = projectStatus(os, os.records.get(p.id) as never, now);
    expect(s).toMatchObject({ total: 4, done: 1, open: 3, aim: 'Into 4B by December', spend: 2000, next: { title: 'Pack books' } });
    expect(s.overdue.map((t) => t.title)).toEqual(['Book movers']);
    expect(s.events.map((e) => e.id)).toEqual([visit.id]);

    const out = (await tool('project_status').run({ project: 'the flat move' }, os)) as { title: string; progress: string };
    expect(out).toMatchObject({ title: 'Flat move', progress: '25%' });
    expect(await tool('project_status').run({ project: 'nope' }, os)).toMatchObject({ error: 'No project called “nope”' });
    expect(((await tool('tasks_overdue').run({}, os)) as { overdue: unknown[] }).overdue).toHaveLength(1);
    expect(((await tool('agenda_today').run({}, os)) as { tasks: unknown[] }).tasks).toHaveLength(2);
  });
});

describe('the calendar source (declared by projects)', () => {
  it('files Events through the device bridge; they still link at their Place (R3) and move last spoke (R2)', async () => {
    const now = Date.now();
    const kendal = os.records.create({ object: 'person', title: 'Kendal Rao', data: { email: 'kendal@example.com' } });
    os.records.create({ object: 'place', title: 'Indiranagar', data: { kind: 'area' } });
    const start = at(now - 2 * DAY, 20);
    const read: Array<[number, number]> = [];
    const device: DeviceBridge = {
      calendar: {
        access: async () => 'granted',
        read: async (from, to) => {
          read.push([from, to]);
          return [
            { id: 'e1', title: 'Dinner with Kendal', start, end: start + 2 * 3_600_000, location: 'Toit, 298 100 Feet Rd, Indiranagar, Bengaluru 560038', attendees: [{ email: 'KENDAL@example.com' }], calendars: ['Personal'] },
            { id: 'e1-work', title: 'dinner  with kendal', start, end: start + 2 * 3_600_000, calendars: ['Work'] },
          ];
        },
      },
    };
    os.device = device;
    const src = os.registry.sources.get('calendar')!;
    expect(src.modules).toEqual(['projects']);
    expect(await runSource(os, src)).toBe(1);
    expect(Math.round((now - read[0]![0]) / DAY)).toBe(30);
    expect(Math.round((read[0]![1] - now) / DAY)).toBe(60);

    const [ev] = os.records.query('event');
    expect(ev).toMatchObject({ title: 'Dinner with Kendal', data: { source: 'calendar', calendars: ['Personal', 'Work'] } });
    // R3: at its Place.
    expect(os.links.forEntity(ev!.id, 'at').map((l) => l.other.title)).toEqual(['Toit']);
    // R2: with Kendal, whose last spoke moved to the dinner.
    expect(os.links.forEntity(ev!.id, 'with').map((l) => l.other.id)).toEqual([kendal.id]);
    expect(os.records.get<{ lastContactAt?: string }>(kendal.id)!.data.lastContactAt).toBe(iso(start));
    // A re-sync changes nothing.
    expect(await runSource(os, src)).toBe(0);
    expect(os.records.query('event')).toHaveLength(1);
  });

  it('no access: nothing read, nothing filed', async () => {
    os.device = { calendar: { access: async () => 'needed', read: async () => { throw new Error('should not read'); } } };
    expect(await runSource(os, os.registry.sources.get('calendar')!)).toBe(0);
  });
});
