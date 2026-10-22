/**
 * The team generator, copied from Turf web v0.0.61 (`lib/team-balance.ts`,
 * rules in turf-web/docs/RATINGS.md): every split of the squad tried; hard
 * rules (equal sizes, keepers split, the two strongest apart), then the gap
 * between the sides' average overall, positions, provisional players and
 * chemistry; "play well with", side and kit wishes only break ties. Keep in
 * step when Turf web changes. Only the import path and quotes differ.
 */
import { rateSquad, type RatedGame } from './ratings';

export const PLAYER_RATING_VERSION = 'player_rating_v2';
export const CHEMISTRY_VERSION = 'chemistry_v1';
export const TEAM_BALANCE_VERSION = 'team_balance_v2';

export type PositionCode = 'GK' | 'DEF' | 'MID' | 'FWD';
export type GoalDataQuality = 'complete' | 'partial' | 'missing' | 'inconsistent';

export type RatingPlayer = {
  id: string;
  name: string;
  position: string | null;
  secondaryPosition: string | null;
  comfortablePositions: string[];
  goalkeeperWilling: boolean | null;
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

export type RatingParticipant = {
  playerId: string;
  playerName: string;
  team: string | null;
  fieldPosition: string | null;
  goals: number;
  assists?: number;
  saves?: number;
  playedGoalkeeper?: boolean;
  attendanceStatus?: 'confirmed' | 'late' | 'no_show';
};

export type RatingGame = {
  id: string;
  date: string;
  sideSize: number | null;
  teamAScore: number | null;
  teamBScore: number | null;
  goalDataQuality: GoalDataQuality;
  motmPlayerId?: string | null;
  participants: RatingParticipant[];
};

export type PlayerRatingResult = {
  playerId: string;
  baseRating: number;
  evidenceRating: number;
  currentRating: number;
  recentFormAdjustment: number;
  effectiveAppearances: number;
  confidence: number;
  unknownProfile: boolean;
  profileCompleteness: number;
  missingProfileFields: string[];
  version: typeof PLAYER_RATING_VERSION;
};

export type ChemistryResult = {
  playerAId: string;
  playerBId: string;
  matches: number;
  score: number;
  version: typeof CHEMISTRY_VERSION;
};

export type BalanceLocks = Record<string, 'A' | 'B'>;


export type BalanceResult = {
  teamA: string[];
  teamB: string[];
  score: number;
  ratingDifference: number;
  /** Average overall per side and each side's share of the two. */
  balance: { a: number; b: number; shareA: number; shareB: number };
  keepers: { a: number; b: number };
  positionDifference: number;
  /** 'Who I play well with' pairs kept on the same side, of those possible in this squad. */
  wishesKept: number;
  wishesPossible: number;
  sideWishesMet: number; sideWishes: number;
  kitWishesMet: number; kitWishes: number;
  explanation: string[];
  evaluatedSplits: number;
  algorithmVersion: typeof TEAM_BALANCE_VERSION;
};

const ATTRIBUTES = ['pace', 'stamina', 'defending', 'passing', 'dribbling', 'shooting'] as const;
type Attribute = typeof ATTRIBUTES[number];

const POSITION_WEIGHTS: Record<Exclude<PositionCode, 'GK'> | 'UTILITY', Record<Attribute, number>> = {
  DEF: { defending: .35, stamina: .2, passing: .2, pace: .15, dribbling: .05, shooting: .05 },
  MID: { passing: .3, stamina: .2, dribbling: .2, pace: .1, defending: .1, shooting: .1 },
  FWD: { shooting: .3, pace: .2, dribbling: .2, passing: .15, stamina: .1, defending: .05 },
  UTILITY: { pace: 1 / 6, stamina: 1 / 6, defending: 1 / 6, passing: 1 / 6, dribbling: 1 / 6, shooting: 1 / 6 },
};

const STARTING_LEVELS: Record<string, number> = {
  beginner: 35,
  intermediate: 50,
  advanced: 65,
  expert: 80,
  '1': 35,
  '2': 42,
  '3': 50,
  '4': 65,
  '5': 80,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function dateWeight(date: string, halfLifeDays: number) {
  // Whole days in India time, so the server and the phone agree on a rating.
  const ageDays = Math.max(0, (Date.parse(`${todayInIndia()}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  return 2 ** (-ageDays / halfLifeDays);
}

/** Today's date in India (yyyy-mm-dd), the squad's day, wherever the code runs. */
function todayInIndia() {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

export function normalizeAttribute(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  const oneToFive = value > 5 ? Math.round(value / 20) : Math.round(value);
  return clamp(oneToFive, 1, 5) * 20;
}

export function playerPositionCode(position: string | null | undefined): PositionCode | null {
  const value = String(position || '').toUpperCase();
  if (value.includes('GOAL') || value === 'GK') return 'GK';
  if (value.includes('DEF')) return 'DEF';
  if (value.includes('MID')) return 'MID';
  if (value.includes('FORW') || value.includes('FWD') || value.includes('STR')) return 'FWD';
  return null;
}

function attributeRating(player: RatingPlayer) {
  const position = playerPositionCode(player.position);
  const weights = POSITION_WEIGHTS[position === 'GK' || position === null ? 'UTILITY' : position];
  const available = ATTRIBUTES
    .map((attribute) => ({ attribute, value: normalizeAttribute(player[attribute]) }))
    .filter((entry): entry is { attribute: Attribute; value: number } => entry.value !== null);
  const goalkeeperScore = position === 'GK' ? normalizeAttribute(player.goalkeeperRating) : null;
  if (!available.length) {
    return goalkeeperScore === null
      ? { score: null, completeness: 0 }
      : { score: goalkeeperScore, completeness: 1 / ATTRIBUTES.length };
  }
  const weightTotal = available.reduce((sum, entry) => sum + weights[entry.attribute], 0);
  const outfieldScore = available.reduce((sum, entry) => sum + entry.value * (weights[entry.attribute] / weightTotal), 0);
  const score = goalkeeperScore === null ? outfieldScore : goalkeeperScore * .6 + outfieldScore * .4;
  return { score, completeness: available.length / ATTRIBUTES.length };
}

function ratingProfile(player: RatingPlayer) {
  const ability = normalizeAttribute(player.initialAbility);
  const prior = player.startingLevel === null ? null : STARTING_LEVELS[String(player.startingLevel).toLowerCase()] ?? null;
  const attributes = attributeRating(player);
  const inputs = [
    { value: attributes.score, weight: .55 },
    { value: ability, weight: .3 },
    { value: prior, weight: .15 },
  ].filter((entry): entry is { value: number; weight: number } => entry.value !== null);
  const totalWeight = inputs.reduce((sum, entry) => sum + entry.weight, 0);
  const observed = totalWeight ? inputs.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight : 50;
  const profileSignals = (ability !== null ? 1 : 0) + (prior !== null ? 1 : 0) + attributes.completeness * 6;
  const completeness = clamp(profileSignals / 8, 0, 1);
  const profileInfluence = .35 + completeness * .65;
  const score = 50 * (1 - profileInfluence) + observed * profileInfluence;
  const missing = [
    ...(player.position ? [] : ['primary position']),
    ...(ability === null ? ['initial ability'] : []),
    ...ATTRIBUTES.filter((attribute) => normalizeAttribute(player[attribute]) === null),
  ];
  const hasProfileEvidence = ability !== null || prior !== null || attributes.score !== null;
  return { score: clamp(score, 20, 95), unknown: !hasProfileEvidence, completeness, missing };
}

function qualityWeight(game: RatingGame) {
  const hasTeams = game.participants.some((person) => person.team === 'A') &&
    game.participants.some((person) => person.team === 'B');
  const hasScore = game.teamAScore !== null && game.teamBScore !== null;
  if (hasTeams && hasScore && game.goalDataQuality === 'complete') return 1;
  if (hasTeams && hasScore) return game.goalDataQuality === 'inconsistent' ? .55 : .8;
  if (hasTeams) return .3;
  return .1;
}

function resultEvidence(
  game: RatingGame,
  participant: RatingParticipant,
  baseRatings: Map<string, number>,
) {
  if (!participant.team || game.teamAScore === null || game.teamBScore === null) return 0;
  const teamScore = participant.team === 'A' ? game.teamAScore : game.teamBScore;
  const opponentScore = participant.team === 'A' ? game.teamBScore : game.teamAScore;
  const actual = teamScore > opponentScore ? 1 : teamScore === opponentScore ? .5 : 0;
  const teamRatings = game.participants
    .filter((person) => person.team === participant.team)
    .map((person) => baseRatings.get(person.playerId) ?? 50);
  const opponentRatings = game.participants
    .filter((person) => person.team && person.team !== participant.team)
    .map((person) => baseRatings.get(person.playerId) ?? 50);
  const average = (values: number[]) => values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 50;
  const expected = 1 / (1 + 10 ** ((average(opponentRatings) - average(teamRatings)) / 20));
  const goalScale = (game.sideSize || 6) <= 6 ? 5 : (game.sideSize || 8) <= 8 ? 4 : 3;
  const goalDifference = clamp((teamScore - opponentScore) / goalScale, -1, 1);
  return (actual - expected) * 1.4 + goalDifference * .3;
}

function goalEvidence(game: RatingGame, participant: RatingParticipant, player: RatingPlayer) {
  if (game.goalDataQuality !== 'complete' && game.goalDataQuality !== 'partial') return 0;
  if (!participant.team) return 0;
  const teamScore = participant.team === 'A' ? game.teamAScore : game.teamBScore;
  if (teamScore === null || teamScore <= 0) return 0;
  const multiplier = ({ GK: 1.5, DEF: 1.3, MID: 1, FWD: .8 } as const)[playerPositionCode(player.position) || 'MID'];
  return clamp((participant.goals / teamScore) * multiplier, 0, .75);
}

function contributionEvidence(game: RatingGame, participant: RatingParticipant, player: RatingPlayer) {
  if (game.goalDataQuality !== 'complete' && game.goalDataQuality !== 'partial') return 0;
  if (!participant.team) return 0;
  const teamScore = participant.team === 'A' ? game.teamAScore : game.teamBScore;
  if (teamScore === null || teamScore <= 0) return 0;
  const assistMultiplier = ({ GK: 1.35, DEF: 1.2, MID: 1, FWD: .9 } as const)[playerPositionCode(player.position) || 'MID'];
  return clamp(((participant.assists || 0) / teamScore) * assistMultiplier, 0, .6);
}

function defensiveEvidence(game: RatingGame, participant: RatingParticipant, player: RatingPlayer) {
  if (!participant.team || game.teamAScore === null || game.teamBScore === null) return 0;
  const conceded = participant.team === 'A' ? game.teamBScore : game.teamAScore;
  const role = playerPositionCode(participant.fieldPosition || player.position);
  const cleanSheet = conceded === 0 ? (role === 'GK' || participant.playedGoalkeeper ? .45 : role === 'DEF' ? .2 : .05) : 0;
  const keeperSaves = participant.playedGoalkeeper ? clamp((participant.saves || 0) / 12, 0, .55) : 0;
  return cleanSheet + keeperSaves;
}

export function calculatePlayerRatings(players: RatingPlayer[], games: RatingGame[]): Map<string, PlayerRatingResult> {
  const results = new Map<string, PlayerRatingResult>();
  const baseRatings = new Map(players.map((player) => [player.id, ratingProfile(player).score]));
  const today = todayInIndia();
  for (const player of players) {
    const base = ratingProfile(player);
    const evidence: Array<{ value: number; weight: number; date: string }> = [];
    for (const game of games) {
      if (game.date > today) continue;
      const participant = game.participants.find((person) => person.playerId === player.id && person.attendanceStatus !== 'no_show');
      if (!participant) continue;
      const weight = qualityWeight(game) * dateWeight(game.date, 180);
      const result = resultEvidence(game, participant, baseRatings);
      const goals = goalEvidence(game, participant, player);
      const assists = contributionEvidence(game, participant, player);
      const defending = defensiveEvidence(game, participant, player);
      const motm = game.motmPlayerId === player.id ? .55 : 0;
      const attendance = participant.attendanceStatus === 'late' ? -.06 : 0;
      const value = result * .58 + goals * .19 + assists * .1 + defending * .07 + motm * .12 + attendance;
      evidence.push({ value, weight, date: game.date });
    }
    const effectiveAppearances = evidence.reduce((sum, item) => sum + item.weight, 0);
    const weightedEvidence = effectiveAppearances
      ? evidence.reduce((sum, item) => sum + item.value * item.weight, 0) / effectiveAppearances
      : 0;
    const evidenceRating = clamp(50 + weightedEvidence * 10, 25, 90);
    const matchConfidence = 1 - Math.exp(-effectiveAppearances / 8);
    const confidence = clamp(matchConfidence * .78 + base.completeness * .22, 0, 1);
    const influence = Math.min(matchConfidence * .65, .65);
    const recent = [...evidence].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
    const recentWeight = recent.reduce((sum, item) => sum + item.weight, 0);
    const recentFormAdjustment = recentWeight
      ? clamp((recent.reduce((sum, item) => sum + item.value * item.weight, 0) / recentWeight) * 2, -3, 3)
      : 0;
    const currentRating = clamp(base.score * (1 - influence) + evidenceRating * influence + recentFormAdjustment, 20, 95);
    results.set(player.id, {
      playerId: player.id,
      baseRating: round(base.score),
      evidenceRating: round(evidenceRating),
      currentRating: round(currentRating),
      recentFormAdjustment: round(recentFormAdjustment),
      effectiveAppearances: round(effectiveAppearances, 2),
      confidence: round(confidence * 100),
      unknownProfile: base.unknown,
      profileCompleteness: round(base.completeness * 100),
      missingProfileFields: base.missing,
      version: PLAYER_RATING_VERSION,
    });
  }
  return results;
}

export type ChemistryGame = { date: string; teamAScore: number | null; teamBScore: number | null; participants: Array<{ playerId: string; team: string | null; attendanceStatus?: string }> };

export function calculateChemistry(games: ChemistryGame[]): Map<string, ChemistryResult> {
  const pairs = new Map<string, { a: string; b: string; matches: number; weightedMatches: number; weightedResults: number; latestWeight: number }>();
  const today = todayInIndia();
  for (const game of games) {
    if (game.date > today) continue;
    for (const team of ['A', 'B']) {
      const teammates = game.participants.filter((person) => person.team === team && person.attendanceStatus !== 'no_show');
      const result = game.teamAScore === null || game.teamBScore === null
        ? .5
        : team === 'A'
          ? game.teamAScore > game.teamBScore ? 1 : game.teamAScore === game.teamBScore ? .5 : 0
          : game.teamBScore > game.teamAScore ? 1 : game.teamAScore === game.teamBScore ? .5 : 0;
      const recency = dateWeight(game.date, 120);
      for (let i = 0; i < teammates.length; i += 1) {
        for (let j = i + 1; j < teammates.length; j += 1) {
          const [a, b] = [teammates[i].playerId, teammates[j].playerId].sort();
          const key = `${a}:${b}`;
          const row = pairs.get(key) || { a, b, matches: 0, weightedMatches: 0, weightedResults: 0, latestWeight: 0 };
          row.matches += 1;
          row.weightedMatches += recency;
          row.weightedResults += result * recency;
          row.latestWeight = Math.max(row.latestWeight, recency);
          pairs.set(key, row);
        }
      }
    }
  }
  const output = new Map<string, ChemistryResult>();
  for (const [key, row] of pairs) {
    const familiarity = Math.min(row.weightedMatches / 6, 1) * 100;
    const observedResult = row.weightedMatches ? row.weightedResults / row.weightedMatches : .5;
    const adjustedResult = ((observedResult * row.matches) + (.5 * 4)) / (row.matches + 4) * 100;
    const recency = row.latestWeight * 100;
    const raw = familiarity * .5 + adjustedResult * .3 + recency * .2;
    const evidenceFactor = Math.min(row.matches / 8, 1);
    output.set(key, {
      playerAId: row.a,
      playerBId: row.b,
      matches: row.matches,
      score: round(clamp(50 + (raw - 50) * evidenceFactor, 25, 85)),
      version: CHEMISTRY_VERSION,
    });
  }
  return output;
}

function combinations<T>(items: T[], choose: number, visit: (values: T[]) => void) {
  const current: T[] = [];
  function walk(index: number) {
    if (current.length === choose) {
      visit([...current]);
      return;
    }
    for (let i = index; i <= items.length - (choose - current.length); i += 1) {
      current.push(items[i]);
      walk(i + 1);
      current.pop();
    }
  }
  walk(0);
}

function pairChemistry(ids: string[], chemistry: Map<string, ChemistryResult>) {
  let total = 0;
  let count = 0;
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      total += chemistry.get([ids[i], ids[j]].sort().join(':'))?.score ?? 50;
      count += 1;
    }
  }
  return count ? total / count : 50;
}

export type BalanceOptions = {
  /** Each player's overall and whether it's still provisional (lib/ratings.ts); else worked out from `games`. */
  ratings?: Map<string, { overall: number; provisional: boolean }>;
  /** 'Who I play well with' picks, as [player, partner]. */
  wishes?: Array<[string, string]>;
  /** The side a player would rather play for. */
  sides?: Record<string, 'A' | 'B'>;
  /** Dark or light, and which side wears the darker kit. */
  kits?: Record<string, 'dark' | 'light'>;
  darkSide?: 'A' | 'B' | null;
  /** Reshuffle: a random pick among the splits as fair as the best (pass Math.random). */
  random?: () => number;
};

const HARD = 1000;

/**
 * The fairest split of a squad into two sides (docs/RATINGS.md): every split is
 * tried (14 players is 1,716). Hard rules — equal sizes, keepers split, the two
 * strongest apart — then the gap between the sides' average overall counts
 * most, then positions, provisional players and chemistry; 'play well with'
 * picks (mutual ones more), side and kit wishes only break ties.
 */
export function generateBestBalance(
  squad: RatingPlayer[],
  games: ChemistryGame[],
  locks: BalanceLocks = {},
  wishesOrOptions: Array<[string, string]> | BalanceOptions = {},
): BalanceResult | null {
  const options: BalanceOptions = Array.isArray(wishesOrOptions) ? { wishes: wishesOrOptions } : wishesOrOptions;
  if (squad.length < 2) return null;
  const rated = options.ratings ?? new Map([...rateSquad(squad, games as RatedGame[]).players].map(([id, r]) => [id, { overall: r.overall, provisional: r.provisional }]));
  const ovr = (id: string) => rated.get(id)?.overall ?? 60;
  const chemistry = calculateChemistry(games);
  const targetA = Math.ceil(squad.length / 2);
  const lockedA = squad.filter((player) => locks[player.id] === 'A');
  const lockedB = squad.filter((player) => locks[player.id] === 'B');
  const unlocked = squad.filter((player) => !locks[player.id]);
  const chooseA = targetA - lockedA.length;
  if (chooseA < 0 || lockedB.length > squad.length - targetA || chooseA > unlocked.length) return null;
  const inSquad = new Set(squad.map((player) => player.id));
  const wishes = (options.wishes || []).filter(([a, b]) => a !== b && inSquad.has(a) && inSquad.has(b));
  const pairKey = (a: string, b: string) => [a, b].sort().join(':');
  const pairs = new Map<string, { a: string; b: string; mutual: boolean }>();
  for (const [a, b] of wishes) { const k = pairKey(a, b); const was = pairs.get(k); pairs.set(k, { a, b, mutual: Boolean(was) }); }
  const sideWishes = Object.entries(options.sides || {}).filter(([id]) => inSquad.has(id));
  const kitWishes = options.darkSide ? Object.entries(options.kits || {}).filter(([id]) => inSquad.has(id)) : [];
  const isKeeper = (p: RatingPlayer) => playerPositionCode(p.position) === 'GK';
  const keepers = squad.filter(isKeeper).length;
  const strongest = [...squad].sort((x, y) => ovr(y.id) - ovr(x.id)).slice(0, 2).map((x) => x.id);
  const roles = ['DEF', 'MID', 'FWD'] as const;
  const splits: Array<{ score: number; a: string[] }> = [];
  combinations(unlocked, chooseA, (selected) => {
    const teamA = [...lockedA, ...selected];
    const aSet = new Set(teamA.map((player) => player.id));
    const teamB = squad.filter((player) => !aSet.has(player.id));
    if (!teamB.length) return;
    const avg = (team: RatingPlayer[]) => team.reduce((sum, x) => sum + ovr(x.id), 0) / team.length;
    const ratingDifference = Math.abs(avg(teamA) - avg(teamB));
    const keeperGap = Math.abs(teamA.filter(isKeeper).length - teamB.filter(isKeeper).length);
    const hard = (keepers >= 2 && keeperGap > 1 + (keepers % 2) ? HARD : 0) + (strongest.length === 2 && aSet.has(strongest[0]) === aSet.has(strongest[1]) ? HARD : 0);
    const provisionalGap = Math.abs(teamA.filter((x) => rated.get(x.id)?.provisional).length - teamB.filter((x) => rated.get(x.id)?.provisional).length);
    const positionGap = roles.reduce((sum, role) => sum + Math.abs(teamA.filter((x) => playerPositionCode(x.position) === role).length - teamB.filter((x) => playerPositionCode(x.position) === role).length), 0);
    const chemistryGap = Math.abs(pairChemistry(teamA.map((x) => x.id), chemistry) - pairChemistry(teamB.map((x) => x.id), chemistry));
    const kept = [...pairs.values()].filter((w) => aSet.has(w.a) === aSet.has(w.b));
    const sidesMet = sideWishes.filter(([id, side]) => aSet.has(id) === (side === 'A')).length;
    const kitsMet = kitWishes.filter(([id, shade]) => aSet.has(id) === ((shade === 'dark') === (options.darkSide === 'A'))).length;
    const score = hard + ratingDifference * 40 + positionGap * 15 + provisionalGap * 10 + chemistryGap * 0.1
      - kept.reduce((sum, w) => sum + (w.mutual ? 5 : 3), 0) - sidesMet * 2 - kitsMet * 1;
    splits.push({ score, a: teamA.map((x) => x.id) });
  });
  if (!splits.length) return null;
  splits.sort((x, y) => x.score - y.score);
  // Reshuffle: any split within a third of a rating point of the best, chosen at random.
  const near = options.random ? splits.filter((x) => x.score <= splits[0].score + 40 / 3).slice(0, 24) : [splits[0]];
  const pick = near[Math.floor((options.random?.() ?? 0) * near.length)] || splits[0];
  const aSet = new Set(pick.a);
  const teamA = squad.filter((x) => aSet.has(x.id));
  const teamB = squad.filter((x) => !aSet.has(x.id));
  const avgOf = (team: RatingPlayer[]) => team.reduce((sum, x) => sum + ovr(x.id), 0) / team.length;
  const avgA = avgOf(teamA), avgB = avgOf(teamB);
  const ratingDifference = Math.abs(avgA - avgB);
  const keptPairs = [...pairs.values()].filter((w) => aSet.has(w.a) === aSet.has(w.b)).length;
  const sidesMet = sideWishes.filter(([id, side]) => aSet.has(id) === (side === 'A')).length;
  const kitsMet = kitWishes.filter(([id, shade]) => aSet.has(id) === ((shade === 'dark') === (options.darkSide === 'A'))).length;
  const keeperA = teamA.filter(isKeeper).length, keeperB = teamB.filter(isKeeper).length;
  const positionDifference = roles.reduce((sum, role) => sum + Math.abs(teamA.filter((x) => playerPositionCode(x.position) === role).length - teamB.filter((x) => playerPositionCode(x.position) === role).length), 0);
  const nameOf = (id: string) => squad.find((x) => x.id === id)?.name.split(/\s+/)[0] || '?';
  const share = Math.round((avgA / Math.max(1, avgA + avgB)) * 100);
  return {
    teamA: pick.a,
    teamB: teamB.map((x) => x.id),
    score: round(pick.score, 2),
    ratingDifference: round(ratingDifference),
    balance: { a: round(avgA), b: round(avgB), shareA: share, shareB: 100 - share },
    keepers: { a: keeperA, b: keeperB },
    positionDifference,
    wishesKept: keptPairs,
    wishesPossible: pairs.size,
    sideWishesMet: sidesMet, sideWishes: sideWishes.length,
    kitWishesMet: kitsMet, kitWishes: kitWishes.length,
    explanation: [
      `Average overall ${round(avgA)} v ${round(avgB)} (${share}% · ${100 - share}%).`,
      keepers === 0 ? 'No keepers in the squad.' : keepers === 1 ? 'One keeper; the other side rotates in goal.' : `Keepers ${keeperA} v ${keeperB}.`,
      ...(strongest.length === 2 ? [`The two strongest, ${nameOf(strongest[0])} and ${nameOf(strongest[1])}, are on opposite sides.`] : []),
      positionDifference <= 1 ? 'Defenders, midfielders and forwards are matched.' : 'Positions are as close as this squad allows.',
      ...(pairs.size ? [`${keptPairs} of ${pairs.size} 'play well with' ${pairs.size === 1 ? 'pick' : 'picks'} together.`] : []),
      ...(sideWishes.length ? [`${sidesMet} of ${sideWishes.length} side wishes met.`] : []),
      ...(kitWishes.length ? [`${kitsMet} of ${kitWishes.length} kit wishes met.`] : []),
      ...(Object.keys(locks).length ? [`${Object.keys(locks).length} manual ${Object.keys(locks).length === 1 ? 'lock' : 'locks'} kept.`] : []),
    ],
    evaluatedSplits: splits.length,
    algorithmVersion: TEAM_BALANCE_VERSION,
  };
}
