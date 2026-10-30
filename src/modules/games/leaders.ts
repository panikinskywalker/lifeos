import type { LifeOSContext } from '@core/registry/context';
import { rateSquad, type RatedGame } from './ratings';
import type { RatingPlayer } from './balance';
import { squadData } from './teams';

/**
 * Leaders, copied from Turf web v0.0.61 (`app/ui/leaders.tsx`, its pure part;
 * rules in turf-web/docs/RATINGS.md): thirteen tables — overall, goals,
 * assists, G+A, appearances, wins, win rate, in form, most improved, player of
 * the match, saves, saves per game, clean sheets. Completed matches only;
 * totals rank anyone who played, averages need 40% of the most-capped
 * player's matches (the overall 25%; three at least); Golden Boot tie-breaks,
 * then a shared place; a position filter. Keep in step when Turf web changes.
 */

export type LeaderCategory = 'overall' | 'goals' | 'assists' | 'ga' | 'apps' | 'wins' | 'winRate' | 'form' | 'improved' | 'motm' | 'saves' | 'savesPerGame' | 'cleanSheets';
export type LeaderPosition = 'all' | 'GK' | 'DEF' | 'MID' | 'FWD';
export type Result = 'W' | 'D' | 'L';

export const LEADER_CATEGORIES: Array<{ key: LeaderCategory; short: string; title: string; unit: string; help: string }> = [
  { key: 'overall', short: 'Overall', title: 'Best overall', unit: 'OVR', help: 'The card’s number: the profile’s attributes for their position, moved up or down by recent match ratings against the squad’s. A quarter of the most-capped player’s matches to be ranked.' },
  { key: 'goals', short: 'Goals', title: 'Top scorers', unit: 'goals', help: 'Goals in completed matches. Level on goals: more assists, then fewer matches; still level, they share the place.' },
  { key: 'assists', short: 'Assists', title: 'Top assists', unit: 'assists', help: 'Assists in completed matches. Level: more goals, then fewer matches.' },
  { key: 'ga', short: 'G+A', title: 'Goal contributions', unit: 'G+A', help: 'Goals plus assists.' },
  { key: 'apps', short: 'Apps', title: 'Most appearances', unit: 'apps', help: 'Matches played; no-shows don’t count.' },
  { key: 'wins', short: 'Wins', title: 'Most wins', unit: 'wins', help: 'Wins from matches with a score and a team.' },
  { key: 'winRate', short: 'Win rate', title: 'Win rate', unit: '%', help: 'Share of scored matches won; 40% of the most-capped player’s matches to be ranked.' },
  { key: 'form', short: 'Form', title: 'In form', unit: 'avg', help: 'Average match rating over their last five matches (three needed, and one of the squad’s last three).' },
  { key: 'improved', short: 'Improved', title: 'Most improved', unit: 'OVR', help: 'Overall now against their overall when this period started.' },
  { key: 'motm', short: 'POTM', title: 'Player of the match', unit: 'POTM', help: 'Player-of-the-match awards.' },
  { key: 'saves', short: 'Saves', title: 'Top saves', unit: 'saves', help: 'Saves in goal.' },
  { key: 'savesPerGame', short: 'Saves/game', title: 'Saves per game', unit: '/ game', help: 'Keepers with 40% of the busiest keeper’s games in goal (two at least).' },
  { key: 'cleanSheets', short: 'Clean sheets', title: 'Clean sheets', unit: 'clean', help: 'Games in goal without conceding.' },
];

/** GK · DEF · MID · FWD from "Goalkeeper", "CB", "Forward", "ST"… */
export function posCode(position: string | null | undefined): Exclude<LeaderPosition, 'all'> | null {
  const v = String(position || '').toUpperCase();
  if (!v) return null;
  if (v.includes('GOAL') || v === 'GK') return 'GK';
  if (v.includes('DEF') || ['CB', 'LB', 'RB', 'LWB', 'RWB', 'SW'].includes(v)) return 'DEF';
  if (v.includes('MID') || ['CDM', 'CM', 'CAM', 'LM', 'RM', 'DM', 'AM'].includes(v)) return 'MID';
  if (v.includes('FORW') || v.includes('FWD') || v.includes('STR') || ['ST', 'CF', 'LW', 'RW', 'W'].includes(v)) return 'FWD';
  return null;
}

export type LeaderRow = {
  player: RatingPlayer; apps: number; goals: number; assists: number; saves: number; keeperApps: number; cleanSheets: number; motm: number;
  wins: number; draws: number; losses: number; winRate: number | null; form: Result[]; formScore: number | null; recent: boolean;
  overall: number; improvement: number; matches: number;
};

type Game = RatedGame & { sideSize?: number | null };

/** A match is done once it has a score or its day has passed (Turf web: kicked off). */
export const isDone = (g: Pick<Game, 'date' | 'teamAScore' | 'teamBScore'>, today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)) => g.date < today || (g.date === today && g.teamAScore !== null && g.teamBScore !== null);

/** `games` is the period on show; `everything` every match, for where they started the period. */
export function buildRows(players: RatingPlayer[], games: Game[], everything: Game[] = games): LeaderRow[] {
  const done = games.filter((g) => isDone(g)).sort((a, b) => b.date.localeCompare(a.date));
  const ratings = rateSquad(players, done);
  const first = done.at(-1)?.date;
  const last = done[0]?.date;
  const upTo = (last ? everything.filter((g) => g.date <= last) : everything).filter((g) => isDone(g));
  const now = rateSquad(players, upTo).players;
  const start = rateSquad(players, first ? everything.filter((g) => g.date < first && isDone(g)) : []).players;
  const lastThree = new Set(done.slice(0, 3).map((g) => g.id));
  return players.map((player) => {
    const r: LeaderRow = { player, apps: 0, goals: 0, assists: 0, saves: 0, keeperApps: 0, cleanSheets: 0, motm: 0, wins: 0, draws: 0, losses: 0, winRate: null, form: [], formScore: null, recent: false, overall: 0, improvement: 0, matches: 0 };
    const results: Result[] = [];
    for (const g of done) {
      const p = g.participants.find((x) => x.playerId === player.id && x.attendanceStatus !== 'no_show');
      if (!p) continue;
      r.apps += 1;
      r.goals += p.goals || 0;
      r.assists += p.assists || 0;
      r.saves += p.saves || 0;
      if (lastThree.has(g.id)) r.recent = true;
      if (p.playedGoalkeeper) r.keeperApps += 1;
      if (g.motmPlayerId === player.id) r.motm += 1;
      if (!p.team || g.teamAScore === null || g.teamBScore === null) continue;
      const own = p.team === 'A' ? g.teamAScore : g.teamBScore;
      const against = p.team === 'A' ? g.teamBScore : g.teamAScore;
      results.push(own === against ? 'D' : own > against ? 'W' : 'L');
      if ((p.playedGoalkeeper || posCode(player.position) === 'GK' || posCode(p.fieldPosition) === 'GK') && against === 0) r.cleanSheets += 1;
    }
    r.wins = results.filter((x) => x === 'W').length;
    r.draws = results.filter((x) => x === 'D').length;
    r.losses = results.filter((x) => x === 'L').length;
    r.winRate = results.length ? Math.round((r.wins / results.length) * 100) : null;
    r.form = results.slice(0, 5);
    const rating = ratings.players.get(player.id);
    r.formScore = rating?.formScore ?? null;
    r.overall = now.get(player.id)?.overall ?? rating?.overall ?? 0;
    r.matches = rating?.matches ?? 0;
    r.improvement = r.overall - (start.get(player.id)?.overall ?? r.overall);
    return r;
  });
}

const keeperTable = (c: LeaderCategory) => c === 'saves' || c === 'savesPerGame' || c === 'cleanSheets';
export const metric = (r: LeaderRow, c: LeaderCategory): number => (c === 'overall' ? r.overall : c === 'goals' ? r.goals : c === 'assists' ? r.assists : c === 'ga' ? r.goals + r.assists : c === 'apps' ? r.apps : c === 'wins' ? r.wins : c === 'winRate' ? r.winRate ?? -1 : c === 'form' ? r.formScore ?? -1 : c === 'improved' ? r.improvement : c === 'motm' ? r.motm : c === 'saves' ? r.saves : c === 'savesPerGame' ? (r.keeperApps ? r.saves / r.keeperApps : 0) : r.cleanSheets);
export const shown = (r: LeaderRow, c: LeaderCategory): string => (c === 'winRate' ? (r.winRate === null ? '—' : `${r.winRate}`) : c === 'form' ? (r.formScore === null ? '—' : r.formScore.toFixed(1)) : c === 'improved' ? `${r.improvement > 0 ? '+' : ''}${r.improvement}` : c === 'savesPerGame' ? (r.keeperApps ? (r.saves / r.keeperApps).toFixed(1) : '0') : String(metric(r, c)));

/** Golden Boot style: the next things that split a tie (bigger first, unless negated). */
const tiebreaks = (r: LeaderRow, c: LeaderCategory): number[] => (c === 'goals' ? [r.assists, -r.apps] : c === 'assists' ? [r.goals, -r.apps] : c === 'ga' ? [r.goals, -r.apps] : c === 'wins' ? [r.winRate ?? 0] : c === 'motm' ? [-r.apps] : c === 'overall' ? [r.matches] : c === 'saves' || c === 'cleanSheets' ? [-r.keeperApps] : c === 'apps' ? [] : [r.apps]);
const averaged = (c: LeaderCategory) => c === 'overall' || c === 'winRate' || c === 'form' || c === 'improved' || c === 'savesPerGame';

/** Ranked rows with their places (level players share one), and who isn't ranked yet and why. */
export function rankLeaders(rows: LeaderRow[], c: LeaderCategory, position: LeaderPosition = 'all') {
  const pool = rows.filter((r) => position === 'all' || posCode(r.player.position) === position);
  const most = Math.max(0, ...rows.map((r) => r.apps));
  const mostKeeper = Math.max(0, ...rows.map((r) => r.keeperApps));
  const needed = c === 'savesPerGame' ? Math.max(2, Math.ceil(mostKeeper * 0.4)) : c === 'overall' ? Math.max(3, Math.ceil(most * 0.25)) : averaged(c) ? Math.max(3, Math.ceil(most * 0.4)) : 1;
  const count = (r: LeaderRow) => (keeperTable(c) ? r.keeperApps : r.apps);
  const eligible = pool.filter((r) => count(r) >= needed && (c !== 'form' || (r.formScore !== null && r.recent)) && (c !== 'winRate' || r.winRate !== null));
  const key = (r: LeaderRow) => [metric(r, c), ...tiebreaks(r, c)];
  const cmp = (a: LeaderRow, b: LeaderRow) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i += 1) if (kb[i] !== ka[i]) return kb[i]! - ka[i]!;
    return 0;
  };
  const sorted = [...eligible].sort((a, b) => cmp(a, b) || a.player.name.localeCompare(b.player.name));
  const places = sorted.map((r, i) => (i > 0 && cmp(sorted[i - 1]!, r) === 0 ? -1 : i + 1));
  for (let i = 1; i < places.length; i += 1) if (places[i] === -1) places[i] = places[i - 1]!;
  const developing = pool.filter((r) => r.apps > 0 && !eligible.includes(r) && count(r) < needed).sort((a, b) => b.apps - a.apps || a.player.name.localeCompare(b.player.name));
  return { sorted, places, developing, needed };
}

/** Leaders from the records here (players keyed by Person), every completed match or those since `from`. */
export function leaderTables(os: LifeOSContext, from?: string) {
  const { players, history } = squadData(os);
  const games = from ? history.filter((g) => g.date >= from) : history;
  const done = games.filter((g) => isDone(g)).sort((a, b) => b.date.localeCompare(a.date));
  const rows = buildRows(players, games, history);
  /** Places before the last match day, for ▲▼. */
  const before = (c: LeaderCategory, position: LeaderPosition) => {
    const last = done[0]?.date;
    if (!last) return new Map<string, number>();
    const was = rankLeaders(buildRows(players, games.filter((g) => g.date < last), history), c, position);
    return new Map(was.sorted.map((r, i) => [r.player.id, was.places[i]!]));
  };
  return { rows, matches: done.length, before };
}
