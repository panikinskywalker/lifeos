import React from 'react';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { MANUAL_TRIGGER, DAILY_TRIGGER, type AutomationRule, type AutomationRun, type StepRun } from '@core/automation/engine';
import { RowItem, useToast, type ValueTone } from '@ui/kit';

/**
 * Automations' shared parts, a first pass from the kit until the
 * NR-Automations-Parts artboard (docs/design/AUTOMATIONS-BRIEF.md): the
 * trigger in words, the run row, and Run with its toast and Undo.
 */

export const TINT = 'tasks' as const;
export const route = (page: string, q: Record<string, string> = {}) => {
  const qs = Object.entries(q).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `/board/automation/${page}${qs ? `?${qs}` : ''}` as never;
};

/** "When a Transaction is created" · "By hand: run month close" · "Every day after 10:00". */
export function triggerWords(os: LifeOSContext, rule: Pick<AutomationRule, 'trigger' | 'name'>): string {
  const c = rule.trigger.config;
  if (rule.trigger.id === MANUAL_TRIGGER) return `By hand · “run ${String(c.phrase || rule.name).toLowerCase()}”`;
  if (rule.trigger.id === DAILY_TRIGGER) return `Every day after ${String(c.time || '08:00')}`;
  const def = os.registry.triggers.get(rule.trigger.id);
  const obj = c.entityType ? os.registry.objects.get(String(c.entityType))?.label : null;
  return `${def?.label ?? rule.trigger.id}${obj ? ` · ${obj}` : ''}`;
}

/** A rule can be run now when it doesn't need a record to start from. */
export const runsWithoutRecord = (rule: AutomationRule) => rule.trigger.id === MANUAL_TRIGGER || rule.trigger.id === DAILY_TRIGGER;

export const STATUS: Record<string, { label: string; tone: ValueTone; icon: string }> = {
  ok: { label: 'Done', tone: 'ok', icon: 'check-circle' },
  error: { label: 'Failed', tone: 'alert', icon: 'alert' },
  skipped: { label: 'Skipped', tone: 'secondary', icon: 'circle' },
  undone: { label: 'Undone', tone: 'secondary', icon: 'undo' },
};
export const STEP_STATUS: Record<StepRun['status'], string> = { done: 'Done', failed: 'Failed', stopped: 'Stopped here', undone: 'Undone' };

const when = (at: number) => {
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/** What a run did, in one line: its last step's line, or why it stopped. */
export function runLine(run: AutomationRun): string {
  if (run.status === 'skipped') return run.log[0]?.msg ?? 'Conditions not met';
  if (run.steps.length) {
    const failed = run.steps.find((s) => s.status === 'failed');
    if (failed) return `Step ${run.steps.indexOf(failed) + 1}: ${failed.line}`;
    return run.steps.map((s) => s.line).join(' · ');
  }
  return run.log.map((l) => l.msg).join('; ');
}

export function RunRow({ ctx, run, name }: { ctx: LifeOSContext; run: AutomationRun; name?: boolean }) {
  const router = useRouter();
  const s = STATUS[run.status] ?? STATUS.ok!;
  const rule = name ? ctx.automation.rules.get(run.ruleId) : undefined;
  const title = name ? rule?.name ?? 'A deleted rule' : run.about?.manual ? 'By hand' : run.about?.title ?? 'Ran';
  return <RowItem icon={s.icon} tint={TINT} title={title} subtitle={runLine(run)} value={s.label} valueTone={s.tone} meta={when(run.startedAt)} onPress={() => router.push(route('run', { run: run.id }))} />;
}

/** Run a rule by hand: a toast with what it did and Undo (or Open when it failed). */
export function useRunNow(ctx: LifeOSContext) {
  const toast = useToast();
  const router = useRouter();
  return async (rule: AutomationRule, said?: string) => {
    const run = await ctx.automation.runManual(rule, said);
    const failed = run.steps.find((s) => s.status === 'failed');
    if (failed) return toast.show({ message: `${rule.name}: stopped at step ${run.steps.indexOf(failed) + 1}`, icon: 'alert', action: { label: 'Open', onPress: () => router.push(route('run', { run: run.id })) } });
    const done = run.steps.filter((s) => s.status === 'done').length;
    const undoable = run.steps.some((s) => s.canUndo);
    toast.show({
      message: `${rule.name}: ${done} step${done === 1 ? '' : 's'} done${run.steps.some((s) => s.status === 'stopped') ? ', then stopped' : ''}`,
      icon: 'bolt',
      ...(undoable ? { undo: () => void ctx.automation.undoRun(run.id) } : { action: { label: 'Open', onPress: () => router.push(route('run', { run: run.id })) } }),
    });
  };
}
