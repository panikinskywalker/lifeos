import { z } from 'zod';
import type { AiToolDef } from '@core/registry/types';
import { formatMetric } from '@core/dashboard/metrics';
import { HEALTH_METRICS, compareInWords, healthToday, logMeasurement, workoutsIn } from './lib';
import { MEASUREMENT_METRICS, WORKOUT_KINDS } from './types';

/** Body's AI tools (R6): today at a glance, a metric against last week and your usual, workouts, logging a reading. */
export const healthTools: AiToolDef[] = [
  {
    name: 'health_today',
    description: "Today's body numbers: steps so far, last night's sleep, resting and average heart rate, the latest weight, screen time so far.",
    input: z.object({}),
    run: async (_i, os) => {
      const h = healthToday(os);
      const f = (id: Parameters<typeof formatMetric>[0], v: number | null) => (v == null ? null : formatMetric(id, v, os.format.currency));
      return { day: h.day, steps: f('steps', h.steps), sleep: f('sleep', h.sleep), restingHeartRate: f('resting_hr', h.restingHr), heartRate: f('heart_rate', h.heartRate), weight: h.weight ? { value: f('weight', h.weight.kg), on: h.weight.on } : null, screenTime: f('screen', h.screenHours) };
    },
  },
  {
    name: 'metric_compare',
    description: 'One body metric this week against last week and against your usual week (the median of the 8 weeks before). Weeks are averages per day with data; weight is the latest reading.',
    input: z.object({ metric: z.enum(HEALTH_METRICS).describe('steps · sleep · resting_hr · heart_rate · weight · screen (screen time)') }),
    run: async (input, os) => compareInWords(os, (input as { metric: (typeof HEALTH_METRICS)[number] }).metric),
  },
  {
    name: 'workouts',
    description: 'Workouts in the last N days (default 30), newest first, with totals: how many, minutes, km, minutes by type.',
    input: z.object({ days: z.number().int().min(1).max(365).optional() }),
    run: async (input, os) => {
      const s = workoutsIn(os, (input as { days?: number }).days ?? 30);
      const label = (k: string) => WORKOUT_KINDS.find((o) => o.value === k)?.label ?? k;
      return { ...s, workouts: s.workouts.slice(0, 30), byKind: s.byKind.map((k) => ({ ...k, kind: label(k.kind) })) };
    },
  },
  {
    name: 'log_measurement',
    description: 'Log a body reading you gave (weight 72.4, water 2, mood 4, sleep 7.5 hours). The unit comes from the metric.',
    input: z.object({
      metric: z.enum(MEASUREMENT_METRICS.map((m) => m.value) as [string, ...string[]]),
      value: z.number(),
      date: z.string().optional().describe('YYYY-MM-DD; today when left out'),
      notes: z.string().optional(),
    }),
    run: async (input, os) => {
      const r = logMeasurement(os, input as { metric: string; value: number; date?: string; notes?: string });
      return { id: r.id, logged: `${r.title} ${r.subtitle ?? ''}`.trim(), date: (r.data as { date: string }).date };
    },
  },
];
