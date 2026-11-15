import type { LifeOSContext } from '@core/registry/context';
import type { AppearanceData, GameData } from './types';
import { squadRatings } from './teams';
import { toggleCaptain } from './changes';

/**
 * Captains, as Turf web picks them (its lib/captains.ts, docs/RATINGS.md): a
 * light, rotating honour, one a side.
 * 1. Last match's player of the match takes the armband on their side.
 * 2. Otherwise the regular (3 of the squad's last 12 matches) on that side who
 *    has captained least lately, then longest ago (never first), then the
 *    higher overall; whoever captained last time sits out unless nobody else can.
 * 3. No regulars on a side: the highest overall there.
 * Ids are Person ids.
 */

export type CaptainGame = { date: string; motmId?: string; captainAId?: string; captainBId?: string; played: string[] };
export type CaptainPick = { personId: string; why: string } | null;

export function suggestCaptains(sides: { A: string[]; B: string[] }, history: CaptainGame[], overall: (id: string) => number): { A: CaptainPick; B: CaptainPick } {
  const past = [...history].sort((a, b) => b.date.localeCompare(a.date));
  const recent = past.slice(0, 12);
  const regular = (id: string) => recent.filter((g) => g.played.includes(id)).length >= 3;
  const captained = (g: CaptainGame, id: string) => g.captainAId === id || g.captainBId === id;
  const lastPotm = past[0]?.motmId ?? null;
  const lastCaptains = new Set([past[0]?.captainAId, past[0]?.captainBId].filter((x): x is string => !!x));
  const pick = (ids: string[], taken: string | null): CaptainPick => {
    const pool = ids.filter((id) => id !== taken);
    if (!pool.length) return null;
    if (lastPotm && pool.includes(lastPotm)) return { personId: lastPotm, why: 'player of the match last time' };
    const regulars = pool.filter(regular);
    if (!regulars.length) return { personId: [...pool].sort((a, b) => overall(b) - overall(a))[0]!, why: 'highest overall on the side' };
    const fresh = regulars.filter((id) => !lastCaptains.has(id));
    const field = fresh.length ? fresh : regulars;
    const times = (id: string) => recent.filter((g) => captained(g, id)).length;
    const since = (id: string) => {
      const i = past.findIndex((g) => captained(g, id));
      return i === -1 ? Infinity : i;
    };
    const best = [...field].sort((a, b) => times(a) - times(b) || since(b) - since(a) || overall(b) - overall(a))[0]!;
    const n = times(best);
    return { personId: best, why: n === 0 ? (since(best) === Infinity ? 'a regular who hasn’t captained yet' : 'a regular, not captain lately') : `captained ${n} of the last 12` };
  };
  const A = pick(sides.A, null);
  return { A, B: pick(sides.B, A?.personId ?? null) };
}

/** Pick and set this match's captains; returns who and why (null for a side with nobody on it). */
export function pickCaptains(os: LifeOSContext, gameId: string) {
  const g = os.records.get<GameData>(gameId);
  if (!g) throw new Error('That match isn’t here any more');
  const appsOf = (id: string) => os.records.query<AppearanceData>('appearance', { filter: { and: [{ field: 'data.gameId', op: 'eq', value: id }] } }, { limit: 500 });
  const here = appsOf(g.id).filter((a) => a.data.attendance !== 'no_show');
  const side = (t: 'A' | 'B') => here.filter((a) => a.data.team === t).map((a) => a.data.personId);
  const history = os.records
    .query<GameData>('game', {}, { limit: 100_000 })
    .filter((x) => x.id !== g.id && x.data.date <= g.data.date)
    .map((x): CaptainGame => ({ date: x.data.date, motmId: x.data.motmId, captainAId: x.data.captainAId, captainBId: x.data.captainBId, played: appsOf(x.id).filter((a) => a.data.attendance !== 'no_show').map((a) => a.data.personId) }));
  const rated = squadRatings(os, g).players;
  const r = suggestCaptains({ A: side('A'), B: side('B') }, history, (id) => rated.get(id)?.overall ?? 60);
  for (const [t, c] of [['A', r.A], ['B', r.B]] as const) {
    if (!c || (t === 'A' ? g.data.captainAId : g.data.captainBId) === c.personId) continue;
    const a = here.find((x) => x.data.personId === c.personId);
    if (a) toggleCaptain(os, a.id);
  }
  return r;
}
