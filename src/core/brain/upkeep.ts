import type { LifeOSContext } from '../registry/context';
import { upkeep } from '../cycles/upkeep';
import { nudgeText } from '../cycles/nudges';
import { logDone, undoLoggedDone, type LoggedDone } from '../cycles/upkeep';
import type { ActVerb, BrainDef, Candidate, Nudge } from './contract';

/**
 * Upkeep's candidates (docs/MODEL.md layer 8: *due*). Upkeep is core, so core
 * offers every Cycle that is due, late or inside its lead days, except those on
 * records of a module that offers candidates of its own: such a module brings
 * its Cycles itself, through `cycleCandidates(os, now, module)` (same keys), in
 * its own words. Yes marks it done (an Event, the next due rolled); Undo puts
 * it back (`cycleAct`).
 */

export const UPKEEP = 'upkeep';

const DAY = 86_400_000;
const iso = (at: number) => new Date(at - new Date(at).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export function upkeepCandidates(os: LifeOSContext, now: number): Candidate[] {
  return cycleCandidates(os, now);
}

/**
 * Due Cycles as Candidates. Without `module`: those of modules with no brain
 * (Upkeep's own). With it: that module's only, for its brain to word.
 */
export function cycleCandidates(os: LifeOSContext, now: number, module?: string): Candidate[] {
  const out: Candidate[] = [];
  for (const i of upkeep(os, 'All', now).items) {
    const { cycle, entity, status, def } = i;
    if (!cycle.enabled || (cycle.snoozedUntil && cycle.snoozedUntil > now)) continue;
    if (module ? def?.module !== module : def && os.registry.modules.get(def.module)?.brain) continue;
    // Due today is its own state ('today'), not 'soon'.
    if (status.state !== 'overdue' && status.state !== 'today' && status.state !== 'soon') continue;
    const daysLeft = status.daysLeft;
    out.push({
      key: `upkeep:${cycle.id}:${cycle.nextDueAt ?? cycle.nextDueMeter ?? 'meter'}`,
      kind: 'due',
      shape: 'ask',
      subjectId: entity.id,
      title: entity.title,
      line: nudgeText(i, daysLeft),
      record: {
        thing: entity.title,
        what: def?.label ?? entity.object,
        cycle: cycle.name,
        due: cycle.nextDueAt != null ? iso(cycle.nextDueAt) : null,
        days_left: daysLeft,
        last_done: cycle.lastDoneAt != null ? iso(cycle.lastDoneAt) : null,
        km_left: status.meterLeft,
      },
      urgent: (daysLeft != null && daysLeft <= 0) || (status.meterLeft != null && status.meterLeft <= 0),
      rank: daysLeft ?? (status.meterLeft != null ? Math.round(status.meterLeft / 100) : 30),
      yes: 'Done',
      payload: { cycleId: cycle.id, template: cycle.template ?? null },
    });
  }
  return out;
}

/** Yes on a Cycle's nudge marks it done (with a cost filed as an expense, when given); Undo puts it back. */
export function cycleAct(os: LifeOSContext, verb: ActVerb, nudge: Nudge, done: { cost?: number | null; asExpense?: boolean } = {}): unknown {
  const { cycleId } = (nudge.payload ?? {}) as { cycleId?: string };
  if (!cycleId || !os.cycles.get(cycleId)) return null;
  if (verb === 'yes') return logDone(os, cycleId, done);
  if (verb === 'undo' && nudge.undo) undoLoggedDone(os, nudge.undo as LoggedDone);
  return null;
}

/** Upkeep as the runner sees it: the same contract as a module. */
export const upkeepBrain: BrainDef = {
  candidates: upkeepCandidates,
  act: (os, verb, nudge) => cycleAct(os, verb, nudge),
  skills: [{ name: 'Upkeep', body: 'A Cycle that is late matters more than one coming up. Say what it is and how late, in a few words ("Water filter: 12 days late"). Never suggest a shop or a price.' }],
};

export { DAY as UPKEEP_DAY };
