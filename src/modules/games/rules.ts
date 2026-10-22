import type { AppearanceData, GameData } from './types';

/**
 * Turf web's match rules, copied so LifeOS shows the same thing at once and
 * offline (docs/MODEL.md layer 2; R9c). Turf web stays the judge: whatever
 * it answers replaces these on the next sync. Copied from Turf web v0.0.61:
 * `lib/score.ts` and the match actions in `app/api/data/route.ts`. Keep in
 * step when those change.
 */

/** Everyone pays the same share of the turf cost, to the paisa. */
export const splitShare = (total: number, players: number) => (players > 0 ? Math.round((total / players) * 100) / 100 : 0);

/** Prepaid and advance-paid bookings need someone who fronted the cost. */
export const needsFronter = (terms: GameData['paymentTerms']) => terms === 'prepaid' || terms === 'advance_paid';

/** The advance counts only on an advance-paid booking, never more than the cost. */
export const advanceFor = (terms: GameData['paymentTerms'], total: number, advance?: number) => (terms === 'advance_paid' ? Math.max(0, Math.min(total, advance ?? 0)) : undefined);

/** Planned players: as given, else both sides full, else whoever is picked. */
export const expectedFor = (given: number | undefined, sideSize: number | undefined, picked: number) => given || (sideSize ? sideSize * 2 : picked);

/** Turf web's own kit colours for a new match (Lime and Sky). */
export const DEFAULT_KITS = { colorA: '#D7F55C', colorB: '#A9C4FF' } as const;

/**
 * The score follows the goals: team A is A's goals plus B's own goals, and
 * the other way round. Only once teams are known (someone is on A or B and
 * every scorer has a team); null means "leave the score as it is".
 */
export function followedScore(apps: AppearanceData[]): { scoreA: number; scoreB: number } | null {
  if (!apps.some((a) => a.team === 'A' || a.team === 'B')) return null;
  if (apps.some((a) => !a.team && ((a.goals ?? 0) > 0 || (a.ownGoals ?? 0) > 0))) return null;
  const sum = (team: 'A' | 'B', k: 'goals' | 'ownGoals') => apps.filter((a) => a.team === team).reduce((s, a) => s + (a[k] ?? 0), 0);
  return { scoreA: sum('A', 'goals') + sum('B', 'ownGoals'), scoreB: sum('B', 'goals') + sum('A', 'ownGoals') };
}

/** After a match edit: follow the goals only when some are logged or it had a score (no 0–0 from nothing). */
export function followedAfterEdit(game: GameData, apps: AppearanceData[]): { scoreA: number; scoreB: number } | null {
  if (game.scoreA == null && !apps.some((a) => (a.goals ?? 0) > 0 || (a.ownGoals ?? 0) > 0)) return null;
  return followedScore(apps);
}

/** Stats are whole numbers in Turf web's ranges. */
export const clampStat = (v: unknown, max: number) => Math.min(max, Math.max(0, Math.floor(Number(v) || 0)));
