import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { AppearanceData, GameData, PlayerProfileData, VenueData } from './types';
import { owedOn, SETTING_ME } from './sync';

/** What the Turf board and the games tools read (pure queries over the games Objects). Archived records are left out. */

const live = <T>(rs: ObjectRecord<T>[]) => rs.filter((r) => !r.archived);
const iso = (ms: number) => new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export const allGames = (os: LifeOSContext) => live(os.records.query<GameData>('game', { sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 100_000 }));
export const allAppearances = (os: LifeOSContext) => live(os.records.query<AppearanceData>('appearance', {}, { limit: 100_000 }));
export const allPlayers = (os: LifeOSContext) => live(os.records.query<PlayerProfileData>('player', { sort: [{ field: 'title', dir: 'asc' }] }, { limit: 100_000 }));
export const allVenues = (os: LifeOSContext) => live(os.records.query<VenueData>('venue', { sort: [{ field: 'title', dir: 'asc' }] }, { limit: 100_000 }));

const nameOf = (os: LifeOSContext, personId?: string) => (personId ? os.records.get(personId)?.title ?? 'Someone' : '');

/** The Person behind "which player is you" (a Turf board setting), or null. */
export function mePersonId(os: LifeOSContext): string | null {
  const me = os.settings.get<string | null>(SETTING_ME, null);
  if (!me) return null;
  return allPlayers(os).find((p) => p.data.sourceKey === `turf:players:${me}`)?.data.personId ?? null;
}

export interface Owing {
  personId: string;
  name: string;
  amount: number;
  shares: number;
  oldest: string;
  appearanceIds: string[];
}

/** What is still owed per player, biggest first (part payments counted; whoever fronted the turf counts as paid in Turf web). */
export function whoOwes(os: LifeOSContext): Owing[] {
  const by = new Map<string, Owing>();
  for (const a of allAppearances(os)) {
    const owed = owedOn(a.data);
    if (!(owed > 0)) continue;
    const o = by.get(a.data.personId) ?? { personId: a.data.personId, name: nameOf(os, a.data.personId), amount: 0, shares: 0, oldest: a.data.gameDate, appearanceIds: [] };
    o.amount += owed;
    o.shares++;
    if (a.data.gameDate < o.oldest) o.oldest = a.data.gameDate;
    o.appearanceIds.push(a.id);
    by.set(a.data.personId, o);
  }
  return [...by.values()].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
}

export interface GameSummary {
  game: ObjectRecord<GameData>;
  players: number;
  collected: number;
  outstanding: number;
  paidCount: number;
}

export function summarise(os: LifeOSContext, game: ObjectRecord<GameData>, apps = allAppearances(os)): GameSummary {
  const mine = apps.filter((a) => a.data.gameId === game.id);
  const outstanding = mine.reduce((s, a) => s + owedOn(a.data), 0);
  const due = mine.reduce((s, a) => s + a.data.share, 0);
  return { game, players: mine.length, collected: Math.max(0, due - outstanding), outstanding, paidCount: mine.filter((a) => a.data.paid).length };
}

/** The next game from today, else the latest one played. */
export function currentGame(os: LifeOSContext, now = Date.now()): { game: ObjectRecord<GameData>; upcoming: boolean } | null {
  const today = iso(now);
  const gs = allGames(os);
  const next = [...gs].filter((g) => g.data.date >= today).sort((a, b) => (a.data.date + (a.data.time ?? '')).localeCompare(b.data.date + (b.data.time ?? '')))[0];
  if (next) return { game: next, upcoming: true };
  return gs[0] ? { game: gs[0], upcoming: false } : null;
}

export interface Lineup {
  appearance: ObjectRecord<AppearanceData>;
  name: string;
}

export function lineup(os: LifeOSContext, gameId: string): Lineup[] {
  return allAppearances(os)
    .filter((a) => a.data.gameId === gameId)
    .map((a) => ({ appearance: a, name: nameOf(os, a.data.personId) }))
    .sort((a, b) => (a.appearance.data.team ?? 'Z').localeCompare(b.appearance.data.team ?? 'Z') || a.name.localeCompare(b.name));
}

export interface PlayerStats {
  personId: string;
  name: string;
  games: number;
  goals: number;
  assists: number;
  saves: number;
  wins: number;
  draws: number;
  losses: number;
  motm: number;
  inGoal: number;
  paid: number;
  unpaid: number;
  lastPlayed: string | null;
}

function resultFor(g: GameData | undefined, team?: 'A' | 'B'): 'W' | 'D' | 'L' | null {
  if (!g || !team || g.scoreA == null || g.scoreB == null) return null;
  const mine = team === 'A' ? g.scoreA : g.scoreB;
  const theirs = team === 'A' ? g.scoreB : g.scoreA;
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
}

export function statsFor(os: LifeOSContext, personId: string, data = { games: allGames(os), apps: allAppearances(os) }): PlayerStats {
  const games = new Map(data.games.map((g) => [g.id, g.data]));
  const mine = data.apps.filter((a) => a.data.personId === personId && a.data.attendance !== 'no_show');
  const st: PlayerStats = { personId, name: nameOf(os, personId), games: mine.length, goals: 0, assists: 0, saves: 0, wins: 0, draws: 0, losses: 0, motm: 0, inGoal: 0, paid: 0, unpaid: 0, lastPlayed: null };
  for (const a of mine) {
    st.goals += a.data.goals;
    st.assists += a.data.assists;
    st.saves += a.data.saves;
    if (a.data.inGoal) st.inGoal++;
    const g = games.get(a.data.gameId);
    const r = resultFor(g, a.data.team);
    if (r === 'W') st.wins++;
    if (r === 'D') st.draws++;
    if (r === 'L') st.losses++;
    st.unpaid += owedOn(a.data);
    st.paid += a.data.share - owedOn(a.data);
    if (!st.lastPlayed || a.data.gameDate > st.lastPlayed) st.lastPlayed = a.data.gameDate;
  }
  st.motm = data.games.filter((g) => g.data.motmId === personId).length;
  return st;
}

export type LeaderMetric = 'games' | 'goals' | 'assists' | 'saves' | 'wins' | 'motm';

export function leaders(os: LifeOSContext, metric: LeaderMetric, limit = 10): PlayerStats[] {
  const data = { games: allGames(os), apps: allAppearances(os) };
  const ids = [...new Set(data.apps.map((a) => a.data.personId))];
  return ids
    .map((id) => statsFor(os, id, data))
    .filter((s) => s[metric] > 0)
    .sort((a, b) => b[metric] - a[metric] || b.games - a.games || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Home's money line: the open shares and this month's turf spend. */
export function moneyAtAGlance(os: LifeOSContext, now = Date.now()) {
  const owing = whoOwes(os);
  const month = iso(now).slice(0, 7);
  const gamesThisMonth = allGames(os).filter((g) => g.data.date.startsWith(month));
  return {
    outstanding: owing.reduce((s, o) => s + o.amount, 0),
    owingPeople: owing.length,
    gamesThisMonth: gamesThisMonth.length,
    turfCostThisMonth: gamesThisMonth.reduce((s, g) => s + g.data.totalCost, 0),
  };
}
