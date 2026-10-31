import { z } from 'zod';
import type { AiToolDef } from '@core/registry/types';
import { withExtras } from '@core/ai/cards';
import { clothesByState, clothesSpaces, dueForService, underWarranty } from './assets';
import { CLOTHES_STATES, clothesStateLabel, type ClothesState } from './types';

const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`);

function serviceWhen(r: { state: string; daysLeft: number | null; kmLeft: number | null }): string {
  const parts: string[] = [];
  if (r.daysLeft != null) parts.push(r.daysLeft < 0 ? `${-r.daysLeft} d late` : inDays(r.daysLeft));
  if (r.kmLeft != null) parts.push(r.kmLeft <= 0 ? `${Math.round(-r.kmLeft).toLocaleString('en-IN')} km past` : `${Math.round(r.kmLeft).toLocaleString('en-IN')} km to go`);
  return parts.join(' · ') || r.state;
}

/** The assets module's tools for the agent (no React Native; unit-tested). */
export const assetsAiTools: AiToolDef[] = [
  {
    name: 'under_warranty',
    description: 'Things you own still under warranty, soonest end first ("what is under warranty", "when does the laptop warranty end"). within_days keeps those ending by then.',
    input: z.object({ within_days: z.number().int().positive().optional() }),
    run: async (input, os) => {
      const rows = underWarranty(os, Date.now(), (input as { within_days?: number }).within_days);
      return withExtras({ assets: rows.map((r) => ({ id: r.id, title: r.title, until: r.until, daysLeft: r.daysLeft })) }, { card: { kind: 'list', title: 'Under warranty', items: rows.map((r) => ({ entityId: r.id, type: 'asset', title: r.title, value: `ends ${inDays(r.daysLeft)}` })) } });
    },
  },
  {
    name: 'due_for_service',
    description: 'Things due for service (a car by months or km, an AC by months): late, or due within within_days (default 30) or 1,000 km. Most urgent first.',
    input: z.object({ within_days: z.number().int().positive().optional() }),
    run: async (input, os) => {
      const rows = dueForService(os, Date.now(), (input as { within_days?: number }).within_days ?? 30);
      return withExtras(
        { assets: rows.map((r) => ({ id: r.id, title: r.title, cycleId: r.cycleId, late: r.state === 'overdue', daysLeft: r.daysLeft, kmLeft: r.kmLeft, when: serviceWhen(r) })) },
        { card: { kind: 'list', title: 'Due for service', items: rows.map((r) => ({ entityId: r.id, type: 'asset', title: r.title, value: serviceWhen(r) })) } },
      );
    },
  },
  {
    name: 'clothes',
    description: 'Your clothes by state: clean, in the wash (wash), packed. state narrows to one; space names a clothes space in Home (default: all).',
    input: z.object({ state: z.enum(['clean', 'wash', 'packed']).optional(), space: z.string().optional() }),
    run: async (input, os) => {
      const i = input as { state?: ClothesState; space?: string };
      const space = i.space ? clothesSpaces(os).find((s) => s.id === i.space || s.title.toLowerCase() === i.space!.trim().toLowerCase()) : undefined;
      if (i.space && !space) return { error: `No clothes space called “${i.space}”.`, spaces: clothesSpaces(os).map((s) => s.title) };
      const by = clothesByState(os, space?.id);
      const states = i.state ? [i.state] : CLOTHES_STATES.map((s) => s.value);
      const out = Object.fromEntries(states.map((s) => [s, by[s].map((a) => ({ id: a.id, title: a.title }))]));
      const items = states.flatMap((s) => by[s].map((a) => ({ entityId: a.id, type: 'asset', title: a.title, value: clothesStateLabel(s) })));
      return withExtras(out, { card: { kind: 'list', title: i.state ? `Clothes · ${clothesStateLabel(i.state).toLowerCase()}` : 'Clothes', items } });
    },
  },
  {
    name: 'create_routine',
    description: 'Add a chore / routine ("add a chore: vacuum every Saturday", "remind me to water the plants every 3 days"). kind chore | personal | home; weekday 0 = Sunday … 6 = Saturday.',
    input: z.object({ name: z.string(), everyN: z.number().int().positive(), everyUnit: z.enum(['day', 'week', 'month']), kind: z.enum(['chore', 'personal', 'home']).default('chore'), minutes: z.number().optional(), weekday: z.number().int().min(0).max(6).optional(), lastDoneOn: z.string().optional() }),
    run: async (input, os) => {
      const i = input as { name: string; everyN: number; everyUnit: 'day' | 'week' | 'month'; kind: string; minutes?: number; weekday?: number; lastDoneOn?: string };
      const e = os.records.create({ object: 'routine', data: { ...i, weekday: i.weekday != null ? String(i.weekday) : undefined } }, 'assistant');
      const c = os.cycles.forEntity(e.id)[0];
      return withExtras({ created: e.title, schedule: e.subtitle, cycleId: c?.id }, { undo: () => os.records.delete(e.id, 'user'), card: c ? { kind: 'cycle', entityId: e.id, cycleId: c.id, title: e.title, due: e.subtitle ?? '' } : { kind: 'record', entityId: e.id, type: 'routine', title: e.title, subtitle: e.subtitle } });
    },
  },
];
