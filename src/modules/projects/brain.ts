import { cycleAct, cycleCandidates } from '@core/brain/upkeep';
import { plural } from '@core/brain/words';
import type { BrainDef, Candidate, Nudge } from '@core/brain/contract';
import type { LifeOSContext } from '@core/registry/context';
import { completeTask, eventsOn, overdueTasks } from './lib';
import { TASK_DUE, type EventData, type ProjectData, type TaskData } from './types';

/**
 * What Projects brings the brain (docs/MODEL.md layer 8, *Slices 4 and 6*):
 * *due*, an open task past its due day (shall I? Done ticks it, a repeating
 * one moves on), and *coming up*, an Event today or tomorrow whose kind needs
 * something from you (R4's `eventsOn`), leaving out Events on a trip (travel
 * brings those). What leaves: titles, the project, days late, the kind, when,
 * where, how many people; never an Event's notes or anyone's mail.
 */

const HOUR = 3_600_000;
/** Kinds of Event that need something from you (Event's kind is an open list). */
export const NEEDS_YOU = ['flight', 'stay', 'check-in', 'reservation', 'appointment', 'dinner', 'party', 'guests', 'wedding', 'concert', 'match', 'interview', 'exam'];
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function overdue(os: LifeOSContext, now: number): Candidate[] {
  return overdueTasks(os, now).map((t): Candidate => {
    const project = t.projectId ? os.records.get<ProjectData>(t.projectId)?.title ?? null : null;
    const due = os.cycles.forEntity(t.id).find((c) => c.template === TASK_DUE);
    return {
      // Upkeep's key for the same Due Cycle, so one filed before this brain is not filed again.
      key: due ? `upkeep:${due.id}:${due.nextDueAt ?? due.nextDueMeter ?? 'meter'}` : `projects:late:${t.id}:${t.due?.slice(0, 10) ?? ''}`,
      kind: 'due',
      shape: 'ask',
      subjectId: t.id,
      title: t.title,
      line: `${t.title}: ${plural(t.daysLate, 'day')} late`,
      record: { task: t.title, project, due: t.due?.slice(0, 10) ?? null, days_late: t.daysLate, priority: t.priority, repeats: !!t.repeat },
      urgent: t.priority === 'urgent',
      rank: -t.daysLate,
      yes: 'Done',
      payload: { taskId: t.id, cycleId: due?.id ?? null },
    };
  });
}

function whenWords(e: { start: number; allDay: boolean }, now: number): string {
  const d = new Date(e.start);
  const today = new Date(now).toDateString() === d.toDateString();
  const day = today ? 'today' : new Date(now + 86_400_000).toDateString() === d.toDateString() ? 'tomorrow' : WEEKDAY[d.getDay()]!;
  if (e.allDay) return day;
  const h = d.getHours();
  const m = d.getMinutes();
  return `${day} ${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`;
}

/** Events today (still to start) and tomorrow whose kind needs you, not on a trip. */
export function comingUp(os: LifeOSContext, now = Date.now()): Candidate[] {
  return eventsOn(os, now, 2).flatMap((e): Candidate[] => {
    const kind = (e.kind ?? '').toLowerCase();
    if (!NEEDS_YOU.includes(kind) || e.start < now) return [];
    const ev = os.records.get<EventData>(e.id);
    if (!ev || ev.data.tripId) return [];
    const people = new Set([...(ev.data.personIds ?? []), ...os.links.forEntity(ev.id).filter((l) => l.other.object === 'person').map((l) => l.other.id)]).size;
    const when = whenWords(e, now);
    return [{
      key: `projects:soon:${e.id}:${e.start}`,
      kind: 'coming up',
      shape: 'ask',
      subjectId: e.id,
      title: e.title,
      line: `${e.title}: ${when}${e.location ? `, ${e.location}` : ''}`,
      record: { event: e.title, kind, when, where: e.location ?? null, people },
      urgent: e.start - now <= 12 * HOUR,
      rank: Math.round((e.start - now) / HOUR),
      yes: 'Open',
    }];
  });
}

export const projectsBrain: BrainDef = {
  // Task Cycles are brought as overdue tasks above; any other Cycle on a projects record comes as Upkeep's.
  candidates: (os, now) => [...overdue(os, now), ...comingUp(os, now), ...cycleCandidates(os, now, 'projects').filter((c) => (c.payload as { template?: string | null }).template !== TASK_DUE)],
  act(os, verb, nudge: Nudge) {
    const p = (nudge.payload ?? {}) as { taskId?: string; template?: string | null };
    if (p.taskId) {
      const t = os.records.get<TaskData>(p.taskId);
      if (verb === 'yes' && t && t.status !== 'done') completeTask(os, t);
      return null;
    }
    if (!nudge.payload && verb === 'yes' && nudge.recordId) return { open: `/entity/event/${nudge.recordId}` };
    return cycleAct(os, verb, nudge);
  },
  skills: [{ name: 'Projects', body: 'A late task is said plainly with how late, never scolding. For an Event coming up, say what it needs from them (leave by, bring, book) only when the kind makes it clear; otherwise just when and where.' }],
};
