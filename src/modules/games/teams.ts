import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { AppearanceData, GameData, PlayerProfileData } from './types';
import { rateSquad, type RatedGame, type SquadRatings } from './ratings';
import { generateBestBalance, type BalanceResult, type GoalDataQuality, type RatingGame, type RatingPlayer } from './balance';
import { DEFAULT_KITS, defaultFormation, kitOf, type Kit } from './kits';

/**
 * Teams (docs/MODEL.md layer 3, *Match*; R9c.4): Turf web's ratings and team
 * generator (copied in ratings.ts / balance.ts) fed from the records here, so
 * Suggest teams works offline and gives the split Turf web would. Players are
 * keyed by their Person. "Plays well with" picks, side wishes and kit wishes
 * come from Turf web's sync (its migration 0029) and break ties, as there.
 */

const live = <T>(rs: ObjectRecord<T>[]) => rs.filter((r) => !r.archived);

/** A Player profile as the ratings read it. */
export function ratingPlayer(p: PlayerProfileData): RatingPlayer {
  return {
    id: p.personId,
    name: p.name,
    position: p.position ?? null,
    secondaryPosition: p.secondaryPosition ?? null,
    comfortablePositions: p.comfortable ? p.comfortable.split(',').map((x) => x.trim()).filter(Boolean) : [],
    goalkeeperWilling: p.keeperWilling ?? null,
    goalkeeperRating: p.keeperRating ?? null,
    startingLevel: p.startingLevel ?? null,
    initialAbility: p.ability ?? null,
    pace: p.pace ?? null,
    stamina: p.stamina ?? null,
    defending: p.defending ?? null,
    passing: p.passing ?? null,
    dribbling: p.dribbling ?? null,
    shooting: p.shooting ?? null,
  };
}

/** A Game and its Appearances as the ratings and the generator read them. */
export function ratingGame(g: ObjectRecord<GameData>, apps: AppearanceData[], nameOf: (personId: string) => string): RatingGame & RatedGame {
  return {
    id: g.id,
    date: g.data.date,
    sideSize: g.data.sideSize ?? null,
    teamAScore: g.data.scoreA ?? null,
    teamBScore: g.data.scoreB ?? null,
    goalDataQuality: (g.data.goalData ?? 'missing') as GoalDataQuality,
    motmPlayerId: g.data.motmId ?? null,
    participants: apps.map((a) => ({
      playerId: a.personId,
      playerName: nameOf(a.personId),
      team: a.team ?? null,
      fieldPosition: a.position ?? null,
      goals: a.goals ?? 0,
      assists: a.assists ?? 0,
      saves: a.saves ?? 0,
      ownGoals: a.ownGoals ?? 0,
      playedGoalkeeper: !!a.inGoal,
      attendanceStatus: a.attendance,
      ratingOverride: a.ratingOverride ?? null,
    })),
  };
}

/** Everyone's profile and every game, ready for the ratings; `before` limits the games to those up to a match. */
export function squadData(os: LifeOSContext, before?: ObjectRecord<GameData>) {
  const profiles = live(os.records.query<PlayerProfileData>('player', {}, { limit: 100_000 }));
  const games = live(os.records.query<GameData>('game', {}, { limit: 100_000 }));
  const apps = live(os.records.query<AppearanceData>('appearance', {}, { limit: 100_000 }));
  const byGame = new Map<string, AppearanceData[]>();
  for (const a of apps) byGame.set(a.data.gameId, [...(byGame.get(a.data.gameId) ?? []), a.data]);
  const names = new Map(profiles.map((p) => [p.data.personId, p.data.name]));
  const nameOf = (id: string) => names.get(id) ?? os.records.get(id)?.title ?? 'Player';
  const history = games
    .filter((g) => !before || (g.id !== before.id && g.data.date <= before.data.date))
    .map((g) => ratingGame(g, byGame.get(g.id) ?? [], nameOf));
  return { players: profiles.map((p) => ratingPlayer(p.data)), history, profiles };
}

/** The squad's ratings (overall, form…) from the games up to a match, or all of them. */
export function squadRatings(os: LifeOSContext, before?: ObjectRecord<GameData>): SquadRatings {
  const { players, history } = squadData(os, before);
  return rateSquad(players, history);
}

/** A match's two kits (Lime and Sky unless set). */
export function kitsOf(g: GameData): { A: Kit; B: Kit } {
  return { A: kitOf(g.colorA, DEFAULT_KITS.A), B: kitOf(g.colorB, DEFAULT_KITS.B) };
}

/** A side's formation: as set, else the format's first shape. */
export const formationOf = (g: GameData, team: 'A' | 'B') => (team === 'A' ? g.formationA : g.formationB) || defaultFormation(g.sideSize ?? null);

export interface TeamSuggestion {
  result: BalanceResult;
  /** Appearance id → side. */
  teams: Record<string, 'A' | 'B'>;
}

/**
 * Suggest teams for a match (Turf web's Suggest / Reshuffle): everyone but
 * no-shows, rated from the matches up to this one; `random` (Math.random)
 * reshuffles among splits as fair as the best. Null with fewer than two.
 */
export function suggestTeams(os: LifeOSContext, gameId: string, random?: () => number): TeamSuggestion | null {
  const g = os.records.get<GameData>(gameId);
  if (!g || g.object !== 'game') return null;
  const side = live(os.records.query<AppearanceData>('appearance', { filter: { and: [{ field: 'data.gameId', op: 'eq', value: gameId }] } }, { limit: 500 })).filter((a) => a.data.attendance !== 'no_show');
  const { players, history } = squadData(os, g);
  const byPerson = new Map(players.map((p) => [p.id, p]));
  const squad = side.map((a) => byPerson.get(a.data.personId)).filter((p): p is RatingPlayer => !!p);
  if (squad.length < 2) return null;
  const rated = rateSquad(players, history).players;
  // Wishes, as Turf web feeds its generator: "plays well with", the side asked for, the kit wished for; they only break ties.
  const profiles = live(os.records.query<PlayerProfileData>('player', {}, { limit: 100_000 }));
  const personOf = new Map(profiles.map((p) => [p.data.sourceKey?.replace('turf:players:', '') ?? '', p.data.personId]));
  const byTurf = <V,>(m: Record<string, V> | undefined) => Object.fromEntries(Object.entries(m ?? {}).flatMap(([id, v]) => (personOf.get(id) ? [[personOf.get(id)!, v]] : []))) as Record<string, V>;
  const wishes = profiles.flatMap((p) => (p.data.partners ?? []).flatMap((id): Array<[string, string]> => (personOf.get(id) ? [[p.data.personId, personOf.get(id)!]] : [])));
  const kits = kitsOf(g.data);
  const darkSide = kits.A.ink === 'light' && kits.B.ink === 'dark' ? 'A' : kits.B.ink === 'light' && kits.A.ink === 'dark' ? 'B' : null;
  const result = generateBestBalance(squad, history, {}, {
    ratings: new Map(squad.map((p) => [p.id, { overall: rated.get(p.id)?.overall ?? 60, provisional: rated.get(p.id)?.provisional ?? true }])),
    wishes,
    sides: byTurf(g.data.sides),
    kits: byTurf(g.data.kitPicks),
    darkSide,
    random,
  });
  if (!result) return null;
  const a = new Set(result.teamA);
  return { result, teams: Object.fromEntries(side.filter((x) => byPerson.has(x.data.personId)).map((x) => [x.id, a.has(x.data.personId) ? 'A' : 'B'])) };
}

/** A plain shuffle: keepers first, then everyone else, alternating sides (Turf web's Random). */
export function shuffleTeams(apps: Array<ObjectRecord<AppearanceData>>, keeper: (a: AppearanceData) => boolean, random: () => number = Math.random): Record<string, 'A' | 'B'> {
  const pool = [...apps].sort(() => random() - 0.5);
  const order = [...pool.filter((a) => keeper(a.data)), ...pool.filter((a) => !keeper(a.data))];
  return Object.fromEntries(order.map((a, i) => [a.id, i % 2 === 0 ? 'A' : 'B']));
}

/**
 * Auto-pick up to `expected` (Turf web's New match, docs/RATINGS.md): who said
 * In, keepers until there are two, who said Maybe, last match's players, then
 * most appearances; only those available. Takes and returns Player profile ids.
 */
export function autoPick(os: LifeOSContext, picked: string[], expected: number, gameId?: string): string[] {
  const everyone = live(os.records.query<PlayerProfileData>('player', {}, { limit: 100_000 }));
  const profiles = everyone.filter((p) => p.data.availability === 'AVL');
  const games = live(os.records.query<GameData>('game', {}, { limit: 100_000 })).filter((g) => g.id !== gameId).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const apps = live(os.records.query<AppearanceData>('appearance', {}, { limit: 100_000 })).filter((a) => a.data.attendance !== 'no_show');
  const count = new Map<string, number>();
  for (const a of apps) count.set(a.data.personId, (count.get(a.data.personId) ?? 0) + 1);
  const last = new Set(apps.filter((a) => a.data.gameId === games[0]?.id).map((a) => a.data.personId));
  const said = gameId ? os.records.get<GameData>(gameId)?.data.rsvps ?? {} : {};
  const turfId = (p: (typeof profiles)[number]) => p.data.sourceKey?.replace('turf:players:', '') ?? '';
  const byApps = [...profiles].sort((a, b) => (count.get(b.data.personId) ?? 0) - (count.get(a.data.personId) ?? 0));
  const keeper = (p: (typeof profiles)[number]) => /goal|^gk$/i.test(p.data.position ?? '');
  const have = new Set(picked);
  const add: string[] = [];
  const take = (id: string) => {
    if (!have.has(id) && !add.includes(id) && have.size + add.length < expected) add.push(id);
  };
  for (const p of profiles) if (said[turfId(p)] === 'going') take(p.id);
  const keepers = () => [...have, ...add].filter((id) => everyone.some((x) => x.id === id && keeper(x))).length;
  for (const p of byApps) if (keeper(p) && keepers() < 2) take(p.id);
  for (const p of profiles) if (said[turfId(p)] === 'maybe') take(p.id);
  for (const p of profiles) if (last.has(p.data.personId)) take(p.id);
  for (const p of byApps) take(p.id);
  return add;
}
