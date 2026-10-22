/**
 * Turf's ratings, copied from Turf web v0.0.61 (`lib/ratings.ts`, rules in
 * turf-web/docs/RATINGS.md) so the S22 works out the same numbers offline:
 * match ratings, the overall (base from the attributes for the position plus a
 * form boost), form, the card's face stats. Keep in step when Turf web changes.
 * Only the quote style differs from the original.
 */

export const RATINGS_VERSION = 'turf_ratings_v3';

export type PositionCode = 'GK' | 'DEF' | 'MID' | 'FWD';
export type Outcome = 'W' | 'D' | 'L';

export type RatedPlayer = {
  id: string;
  name: string;
  position: string | null;
  goalkeeperRating: number | null;
  startingLevel: string | number | null;
  initialAbility: number | null;
  pace: number | null;
  stamina: number | null;
  defending: number | null;
  passing: number | null;
  dribbling: number | null;
  shooting: number | null;
};

export type RatedParticipant = {
  playerId: string;
  team: string | null;
  fieldPosition?: string | null;
  goals: number;
  assists?: number;
  saves?: number;
  ownGoals?: number;
  playedGoalkeeper?: boolean;
  attendanceStatus?: string;
  ratingOverride?: number | null;
};

export type RatedGame = {
  id: string;
  date: string;
  teamAScore: number | null;
  teamBScore: number | null;
  motmPlayerId?: string | null;
  /** Winners of the 'best on your team' votes, once the vote has closed. */
  teamBest?: string[];
  participants: RatedParticipant[];
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const tenth = (v: number) => Math.round(v * 10 + 1e-9) / 10; // half-tenths round up

export function positionCode(position: string | null | undefined): PositionCode | null {
  const v = String(position || '').toUpperCase();
  if (v.includes('GOAL') || v === 'GK') return 'GK';
  if (v.includes('DEF') || v === 'CB' || v === 'LB' || v === 'RB') return 'DEF';
  if (v.includes('MID') || v === 'CM' || v === 'CDM' || v === 'CAM') return 'MID';
  if (v.includes('FORW') || v.includes('FWD') || v.includes('STR') || v === 'ST' || v.includes('WING')) return 'FWD';
  return null;
}

// ---- Match rating ----

export type MatchInput = {
  goals: number; assists: number; saves: number; ownGoals: number;
  inGoal: boolean; role: PositionCode | null;
  /** null when the score wasn't logged or they had no side. */
  outcome: Outcome | null; conceded: number | null;
  potm: boolean; teamBest: boolean; late: boolean;
};

/**
 * A match rating, 3.0–10.0, from 6.0: goals (defenders' and keepers' count
 * more), assists, keeping, the result, a clean sheet, player of the match,
 * best on their team; own goals and turning up late cost.
 */
export function matchRating(n: MatchInput): { rating: number; partial: boolean } {
  const goalValue = n.inGoal || n.role === 'GK' || n.role === 'DEF' ? 0.7 : 0.5;
  const goals = Math.min(n.goals, 3) * goalValue + Math.max(0, n.goals - 3) * goalValue * 0.6;
  const assists = Math.min(n.assists, 3) * 0.35 + Math.max(0, n.assists - 3) * 0.2;
  const keeping = n.inGoal ? Math.min(1.5, n.saves * 0.1) : 0;
  const result = n.outcome === 'W' ? 0.5 : n.outcome === 'D' ? 0.1 : n.outcome === 'L' ? -0.3 : 0;
  const cleanSheet = n.outcome && n.conceded === 0 ? (n.inGoal || n.role === 'GK' ? 0.8 : n.role === 'DEF' ? 0.4 : 0.1) : 0;
  const votes = (n.potm ? 0.7 : 0) + (n.teamBest ? 0.4 : 0);
  const costs = n.ownGoals * 0.5 + (n.late ? 0.2 : 0);
  return { rating: tenth(clamp(6 + goals + assists + keeping + result + cleanSheet + votes - costs, 3, 10)), partial: n.outcome === null };
}

/** Rating colour band: 8+ lime, 7s mint, 6s sand, under 6 coral. */
export function band(r: number): 'lime' | 'mint' | 'sand' | 'coral' {
  return r >= 8 ? 'lime' : r >= 7 ? 'mint' : r >= 6 ? 'sand' : 'coral';
}

export type RatedNight = {
  gameId: string; date: string; side: 'A' | 'B' | null; outcome: Outcome | null;
  goals: number; assists: number; saves: number; ownGoals: number; inGoal: boolean;
  potm: boolean; teamBest: boolean; late: boolean;
  rating: number; partial: boolean; edited: boolean;
};

function outcomeOf(g: RatedGame, side: string | null): Outcome | null {
  if (g.teamAScore === null || g.teamBScore === null || (side !== 'A' && side !== 'B')) return null;
  if (g.teamAScore === g.teamBScore) return 'D';
  return (g.teamAScore > g.teamBScore) === (side === 'A') ? 'W' : 'L';
}

/** A player's matches (not no-shows), newest first, each with its rating. */
export function nightsFor(player: Pick<RatedPlayer, 'id' | 'position'>, games: RatedGame[]): RatedNight[] {
  const out: RatedNight[] = [];
  for (const g of games) {
    const me = g.participants.find((p) => p.playerId === player.id && p.attendanceStatus !== 'no_show');
    if (!me) continue;
    const side = me.team === 'A' || me.team === 'B' ? me.team : null;
    const outcome = outcomeOf(g, side);
    const conceded = side === 'A' ? g.teamBScore : side === 'B' ? g.teamAScore : null;
    const inGoal = Boolean(me.playedGoalkeeper);
    const night = {
      goals: me.goals || 0, assists: me.assists || 0, saves: me.saves || 0, ownGoals: me.ownGoals || 0, inGoal,
      potm: g.motmPlayerId === player.id, teamBest: Boolean(g.teamBest?.includes(player.id)), late: me.attendanceStatus === 'late',
    };
    const worked = matchRating({ ...night, role: inGoal ? 'GK' : positionCode(me.fieldPosition) || positionCode(player.position), outcome, conceded });
    const edited = me.ratingOverride !== null && me.ratingOverride !== undefined;
    out.push({ gameId: g.id, date: g.date, side, outcome, ...night, rating: edited ? Number(me.ratingOverride) : worked.rating, partial: edited ? false : worked.partial, edited });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

// ---- The overall ----

/** An attribute (1–5, or an old 0–100 value) on the card's scale: 1 → 45 … 5 → 85. */
export function cardValue(v: number | null | undefined): number | null {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return null;
  const five = Number(v) > 5 ? Math.round(Number(v) / 20) : Math.round(Number(v));
  return 35 + clamp(five, 1, 5) * 10;
}

type Attr = 'pace' | 'stamina' | 'defending' | 'passing' | 'dribbling' | 'shooting';
/** How much each attribute counts for each position (EA FC style, out of 100). */
export const POSITION_WEIGHTS: Record<'FWD' | 'MID' | 'DEF' | 'ANY', Record<Attr, number>> = {
  FWD: { shooting: 35, pace: 20, dribbling: 20, passing: 10, stamina: 10, defending: 5 },
  MID: { passing: 30, dribbling: 20, stamina: 20, shooting: 10, defending: 10, pace: 10 },
  DEF: { defending: 45, pace: 15, stamina: 15, passing: 15, dribbling: 5, shooting: 5 },
  ANY: { pace: 17, stamina: 17, defending: 16, passing: 17, dribbling: 17, shooting: 16 },
};
const LEVELS: Record<string, number> = { beginner: 50, intermediate: 60, advanced: 70, expert: 80, '1': 50, '2': 55, '3': 60, '4': 70, '5': 80 };

/** The overall from the profile alone: attributes for their position, else their ability or level, else 60. */
export function baseOverall(p: RatedPlayer): { value: number; fromProfile: boolean } {
  const code = positionCode(p.position);
  const weights = POSITION_WEIGHTS[code === 'FWD' || code === 'MID' || code === 'DEF' ? code : 'ANY'];
  const given = (Object.keys(weights) as Attr[]).map((a) => ({ w: weights[a], v: cardValue(p[a]) })).filter((x): x is { w: number; v: number } => x.v !== null && x.w > 0);
  const outfield = given.length ? given.reduce((s, x) => s + x.v * x.w, 0) / given.reduce((s, x) => s + x.w, 0) : null;
  const keeper = code === 'GK' ? cardValue(p.goalkeeperRating) : null;
  const fallback = cardValue(p.initialAbility) ?? (p.startingLevel === null || p.startingLevel === undefined ? null : LEVELS[String(p.startingLevel).toLowerCase()] ?? null);
  const value = keeper !== null ? keeper * 0.7 + (outfield ?? keeper) * 0.3 : outfield ?? fallback;
  return value === null ? { value: 60, fromProfile: false } : { value, fromProfile: true };
}

export type PlayerRating = {
  overall: number;          // 30–99, the card's number
  base: number;             // from the profile
  boost: number;            // from form, ± up to 12
  matches: number;          // matches played in the games given
  provisional: boolean;     // fewer than 3 matches, or nothing on the profile
  average: number | null;   // average match rating
  form: Array<{ gameId: string; outcome: Outcome | null; rating: number }>; // last five, newest first
  formScore: number | null; // average rating of the last five (three needed)
  nights: RatedNight[];
  perGame: { goals: number; assists: number; saves: number; keeperGames: number };
};

export type SquadRatings = { players: Map<string, PlayerRating>; squadAverage: number; squadPerGame: { goals: number; assists: number; saves: number } };

/** Recent ratings count most: 1, 0.9, 0.81 … over the last ten; partial nights count half. */
function weightedAverage(nights: RatedNight[]) {
  let total = 0, weight = 0;
  nights.slice(0, 10).forEach((n, i) => { const w = 0.9 ** i * (n.partial ? 0.5 : 1); total += n.rating * w; weight += w; });
  return weight ? total / weight : null;
}

/** Everyone's ratings from the completed games given (any order). */
export function rateSquad(players: RatedPlayer[], games: RatedGame[]): SquadRatings {
  const ordered = [...games].sort((a, b) => b.date.localeCompare(a.date));
  const nights = new Map(players.map((p) => [p.id, nightsFor(p, ordered)]));
  const all = [...nights.values()].flat();
  const squadAverage = all.length ? all.reduce((s, n) => s + n.rating, 0) / all.length : 6.3;
  const per = (list: RatedNight[], key: 'goals' | 'assists') => (list.length ? list.reduce((s, n) => s + n[key], 0) / list.length : 0);
  const kept = all.filter((n) => n.inGoal);
  const squadPerGame = { goals: per(all, 'goals'), assists: per(all, 'assists'), saves: kept.length ? kept.reduce((s, n) => s + n.saves, 0) / kept.length : 0 };
  const out = new Map<string, PlayerRating>();
  for (const p of players) {
    const mine = nights.get(p.id) || [];
    const base = baseOverall(p);
    const avg = weightedAverage(mine);
    const n = Math.min(10, mine.length);
    const boost = avg === null ? 0 : clamp((avg - squadAverage) * 8 * (n / (n + 4)), -12, 12);
    const last5 = mine.slice(0, 5);
    const keeperNights = mine.filter((x) => x.inGoal);
    out.set(p.id, {
      overall: Math.round(clamp(base.value + boost, 30, 99)),
      base: Math.round(base.value), boost: tenth(boost), matches: mine.length,
      provisional: mine.length < 3 || !base.fromProfile,
      average: mine.length ? tenth(mine.reduce((s, x) => s + x.rating, 0) / mine.length) : null,
      form: last5.map((x) => ({ gameId: x.gameId, outcome: x.outcome, rating: x.rating })),
      formScore: last5.length >= 3 ? tenth(last5.reduce((s, x) => s + x.rating, 0) / last5.length) : null,
      nights: mine,
      perGame: { goals: per(mine, 'goals'), assists: per(mine, 'assists'), saves: keeperNights.length ? keeperNights.reduce((s, x) => s + x.saves, 0) / keeperNights.length : 0, keeperGames: keeperNights.length },
    });
  }
  return { players: out, squadAverage, squadPerGame };
}

// ---- The card's face stats ----

export type FaceStats = { keeper: boolean; stats: Array<[string, number]> };

/** Six stats for the card, from the attributes on the card's scale; a missing one shows 5 under the base overall. */
export function faceStats(p: RatedPlayer): FaceStats {
  const fallback = Math.round(baseOverall(p).value) - 5;
  const of = (v: number | null | undefined) => cardValue(v) ?? fallback;
  if (positionCode(p.position) === 'GK') {
    const gk = cardValue(p.goalkeeperRating) ?? fallback + 5;
    return { keeper: true, stats: [['DIV', gk], ['HAN', gk], ['KIC', of(p.passing)], ['REF', gk], ['SPE', of(p.pace)], ['POS', gk]] };
  }
  return { keeper: false, stats: [['PAC', of(p.pace)], ['SHO', of(p.shooting)], ['PAS', of(p.passing)], ['DRI', of(p.dribbling)], ['DEF', of(p.defending)], ['PHY', of(p.stamina)]] };
}
