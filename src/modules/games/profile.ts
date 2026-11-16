import type { LifeOSContext } from '@core/registry/context';
import type { AppearanceData, GameData, PlayerProfileData } from './types';
import type { Kit } from './kits';
import type { RatingPlayer } from './balance';
import { playerPositionCode } from './balance';
import { matchRating, positionCode, rateSquad, type RatedGame } from './ratings';
import { kitsOf, ratingPlayer, teamBestOf } from './teams';
import type { TurfSeason } from './inbox';

/**
 * A player's profile, worked out as Turf web works it out (its
 * app/ui/profile-stats.ts and profile-more.ts, docs/RATINGS.md): the season
 * line, form, traits against the squad, trophies, where they play, the overall
 * over time, who they win with and who beats them, turning up, months and
 * seasons, bests. Players are keyed by their Person.
 */

export type Outcome = 'W' | 'D' | 'L';

export type ProfileParticipant = {
  playerId: string; playerName: string; team: string | null; fieldPosition: string | null;
  goals: number; assists: number; saves: number; ownGoals: number; playedGoalkeeper: boolean; attendanceStatus: string; ratingOverride: number | null;
};

/** A Game as the profile reads it (and the ratings: it is a RatedGame). */
export type ProfileGame = Omit<RatedGame, 'participants'> & {
  date: string; time: string | null; venue: string; kits: { A: Kit; B: Kit };
  captainAPlayerId: string | null; captainBPlayerId: string | null;
  /** Who said In (Person ids). */
  going: string[];
  participants: ProfileParticipant[];
};

export type ProfilePlayer = RatingPlayer;

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  return `${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
};
const todayIST = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const kickOffMs = (g: Pick<ProfileGame, 'date' | 'time'>) => Date.parse(`${g.date}T${g.time && /^\d{2}:\d{2}/.test(g.time) ? g.time.slice(0, 5) : '20:00'}:00+05:30`);

/** Turf web's isUpcoming: a later day, or today until a score is in and 90 minutes after kick-off. */
export function isUpcomingGame(g: Pick<ProfileGame, 'date' | 'time' | 'teamAScore'>, now = Date.now()) {
  const today = todayIST();
  if (g.date > today) return true;
  if (g.date < today) return false;
  return g.teamAScore === null || now < kickOffMs(g) + 90 * 60_000;
}

/** Everyone and every match, in the profile's shape. */
export function profileGames(os: LifeOSContext): { players: ProfilePlayer[]; games: ProfileGame[]; profiles: Array<{ id: string; data: PlayerProfileData }> } {
  const live = <T>(rs: Array<{ archived?: boolean } & T>) => rs.filter((r) => !r.archived);
  const profiles = live(os.records.query<PlayerProfileData>('player', {}, { limit: 100_000 }));
  const games = live(os.records.query<GameData>('game', {}, { limit: 100_000 }));
  const apps = live(os.records.query<AppearanceData>('appearance', {}, { limit: 100_000 }));
  const byGame = new Map<string, AppearanceData[]>();
  for (const a of apps) byGame.set(a.data.gameId, [...(byGame.get(a.data.gameId) ?? []), a.data]);
  const names = new Map(profiles.map((p) => [p.data.personId, p.data.name]));
  const personOf = new Map(profiles.map((p) => [p.data.sourceKey?.replace('turf:players:', '') ?? '', p.data.personId]));
  const nameOf = (id: string) => names.get(id) ?? os.records.get(id)?.title ?? 'Player';
  return {
    profiles,
    players: profiles.map((p) => ratingPlayer(p.data)),
    games: games.map((g): ProfileGame => {
      const parts = (byGame.get(g.id) ?? []).map((a): ProfileParticipant => ({
        playerId: a.personId, playerName: nameOf(a.personId), team: a.team ?? null, fieldPosition: a.position ?? null,
        goals: a.goals ?? 0, assists: a.assists ?? 0, saves: a.saves ?? 0, ownGoals: a.ownGoals ?? 0, playedGoalkeeper: !!a.inGoal, attendanceStatus: a.attendance, ratingOverride: a.ratingOverride ?? null,
      }));
      const teamBest = teamBestOf(g.data, parts.map((x) => ({ personId: x.playerId, team: x.team as 'A' | 'B' | undefined })), personOf);
      return {
        id: g.id, date: g.data.date, time: g.data.time ?? null, venue: g.data.venueName ?? '', kits: kitsOf(g.data),
        teamAScore: g.data.scoreA ?? null, teamBScore: g.data.scoreB ?? null, motmPlayerId: g.data.motmId ?? null, teamBest,
        captainAPlayerId: g.data.captainAId ?? null, captainBPlayerId: g.data.captainBId ?? null,
        going: Object.entries(g.data.rsvps ?? {}).filter(([, s]) => s === 'going').map(([id]) => personOf.get(id)).filter((x): x is string => !!x),
        participants: parts,
      };
    }),
  };
}

function outcomeOf(g: ProfileGame, side: string | null): Outcome | null {
  if (g.teamAScore === null || g.teamBScore === null || (side !== 'A' && side !== 'B')) return null;
  if (g.teamAScore === g.teamBScore) return 'D';
  return (g.teamAScore > g.teamBScore) === (side === 'A') ? 'W' : 'L';
}
const playedIn = (g: ProfileGame, id: string) => g.participants.find((x) => x.playerId === id && x.attendanceStatus !== 'no_show');
const ratedOnly = (games: ProfileGame[]) => games.filter((g) => !isUpcomingGame(g));

/* ---------- profile-stats ---------- */

export type MonthLine = { month: string; label: string; apps: number; goals: number; assists: number; wins: number; draws: number; losses: number };
export type Best = { label: string; value: string; sub: string };
export type Profile = {
  apps: number; goals: number; assists: number; saves: number; keeperApps: number; cleanSheets: number;
  wins: number; draws: number; losses: number; winRate: number | null; potm: number;
  rating: { value: number | null; level: string; confidence: number; confidenceLabel: string; missing: string[] };
  months: MonthLine[]; seasons: MonthLine[]; bests: Best[];
  firstGame: string | null; lastGame: string | null;
};

/** The overall's word: the card tiers (bronze under 65, silver 65–74, gold 75+), gold 85+ is elite. */
export function levelOf(rating: number | null): string {
  if (rating === null) return 'Unrated';
  if (rating < 65) return 'Bronze';
  if (rating < 75) return 'Silver';
  if (rating < 85) return 'Gold';
  return 'Elite';
}

export function profileOf(player: ProfilePlayer, players: ProfilePlayer[], allGames: ProfileGame[], seasons: TurfSeason[] = []): Profile {
  const games = ratedOnly(allGames).sort((a, b) => `${a.date} ${a.time || ''}`.localeCompare(`${b.date} ${b.time || ''}`));
  const mine = games.map((g) => ({ g, p: playedIn(g, player.id) })).filter((x): x is { g: ProfileGame; p: ProfileParticipant } => !!x.p);
  const p: Profile = {
    apps: mine.length, goals: 0, assists: 0, saves: 0, keeperApps: 0, cleanSheets: 0, wins: 0, draws: 0, losses: 0, winRate: null, potm: 0,
    rating: { value: null, level: 'Unrated', confidence: 0, confidenceLabel: 'No matches yet', missing: [] },
    months: [], seasons: [], bests: [],
    firstGame: mine[0]?.g.date ?? null, lastGame: mine[mine.length - 1]?.g.date ?? null,
  };
  const months = new Map<string, MonthLine>();
  let streak = 0, bestStreak = 0, unbeaten = 0, bestUnbeaten = 0;
  let bestGame: { goals: number; date: string } | null = null;
  let bestGa: { ga: number; date: string } | null = null;
  for (const { g, p: me } of mine) {
    const outcome = outcomeOf(g, me.team);
    p.goals += me.goals; p.assists += me.assists; p.saves += me.saves;
    if (g.motmPlayerId === player.id) p.potm += 1;
    if (outcome === 'W') p.wins += 1; else if (outcome === 'D') p.draws += 1; else if (outcome === 'L') p.losses += 1;
    if (me.playedGoalkeeper) {
      p.keeperApps += 1;
      const against = me.team === 'A' ? g.teamBScore : me.team === 'B' ? g.teamAScore : null;
      if (against === 0) p.cleanSheets += 1;
    }
    streak = me.goals > 0 ? streak + 1 : 0; bestStreak = Math.max(bestStreak, streak);
    if (outcome) { unbeaten = outcome === 'L' ? 0 : unbeaten + 1; bestUnbeaten = Math.max(bestUnbeaten, unbeaten); }
    if (me.goals > 0 && (!bestGame || me.goals > bestGame.goals)) bestGame = { goals: me.goals, date: g.date };
    if (me.goals + me.assists > 0 && (!bestGa || me.goals + me.assists > bestGa.ga)) bestGa = { ga: me.goals + me.assists, date: g.date };
    const key = g.date.slice(0, 7);
    const m = months.get(key) ?? { month: key, label: `${MO[Number(key.slice(5)) - 1]} ${key.slice(0, 4)}`, apps: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0 };
    m.apps += 1; m.goals += me.goals; m.assists += me.assists;
    if (outcome === 'W') m.wins += 1; else if (outcome === 'D') m.draws += 1; else if (outcome === 'L') m.losses += 1;
    months.set(key, m);
  }
  const decided = p.wins + p.draws + p.losses;
  p.winRate = decided ? Math.round((p.wins / decided) * 100) : null;
  p.months = [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
  p.seasons = [...seasons].sort((a, b) => b.startsOn.localeCompare(a.startsOn)).map((season) => {
    const line: MonthLine = { month: season.id, label: season.name, apps: 0, goals: 0, assists: 0, wins: 0, draws: 0, losses: 0 };
    for (const { g, p: me } of mine) {
      if (g.date < season.startsOn || (season.endsOn && g.date > season.endsOn)) continue;
      const outcome = outcomeOf(g, me.team);
      line.apps += 1; line.goals += me.goals; line.assists += me.assists;
      if (outcome === 'W') line.wins += 1; else if (outcome === 'D') line.draws += 1; else if (outcome === 'L') line.losses += 1;
    }
    return line;
  }).filter((line) => line.apps > 0);
  if (mine.length) {
    p.bests = [
      bestGame ? { label: 'Most in a match', value: `${bestGame.goals}`, sub: `goals · ${dm(bestGame.date)}` } : null,
      bestGa && (!bestGame || bestGa.ga > bestGame.goals) ? { label: 'Most involved', value: `${bestGa.ga}`, sub: `goals + assists · ${dm(bestGa.date)}` } : null,
      bestStreak > 1 ? { label: 'Scoring run', value: `${bestStreak}`, sub: 'matches in a row' } : null,
      bestUnbeaten > 1 ? { label: 'Unbeaten run', value: `${bestUnbeaten}`, sub: 'matches without a loss' } : null,
      { label: 'First match', value: dm(mine[0]!.g.date), sub: mine[0]!.g.venue },
    ].filter((b): b is Best => !!b);
  }
  // The overall (docs/RATINGS.md): base from the profile, plus form from match ratings.
  const rating = rateSquad(players, ratedOnly(allGames)).players.get(player.id);
  if (rating) {
    const missing = [...(player.position ? [] : ['primary position']), ...(['pace', 'stamina', 'defending', 'passing', 'dribbling', 'shooting'] as const).filter((k) => player[k] === null)];
    p.rating = { value: rating.overall, level: levelOf(rating.overall), confidence: Math.min(100, rating.matches * 10), confidenceLabel: rating.provisional ? 'Provisional' : rating.matches < 10 ? 'Building' : 'Settled', missing };
  }
  return p;
}

/* ---------- profile-more ---------- */

export type Night = {
  gameId: string; date: string; venue: string; kit: Kit; side: 'A' | 'B' | null;
  outcome: Outcome | null; for: number | null; against: number | null;
  goals: number; assists: number; saves: number; ownGoals: number; inGoal: boolean; potm: boolean; captain: boolean; teamBest: boolean;
  rating: number; partial: boolean; edited: boolean; late: boolean;
};
export type Trait = { key: string; label: string; value: number; display: string; top: number | null; rank: number | null; of: number; note?: string };
export type Trophy = { key: string; label: string; value: string; sub: string; icon: string; unlocked: boolean; progress?: number };
export type Rival = { id: string; name: string; games: number; wins: number; winRate: number };
export type More = {
  nights: Night[]; missed: number; avgRating: number | null; best: number | null;
  hatTricks: number; lastHatTrick: string | null; mostInGame: { goals: number; date: string } | null;
  ownGoals: number; captain: number;
  turnout: { saidYes: number; played: number; late: number; noShow: number };
  zones: Array<{ zone: 'GK' | 'DEF' | 'MID' | 'FWD'; games: number; share: number }>;
  partners: Rival[]; hardest: Rival | null; trophies: Trophy[];
  traits: { squad: Trait[]; position: Trait[]; positionLabel: string };
  overall: { now: number | null; series: Array<{ label: string; value: number }>; delta: number | null; since: string | null };
};

export function nightsOf(playerId: string, games: ProfileGame[], position: string | null = null): Night[] {
  return ratedOnly(games).flatMap((g): Night[] => {
    const me = playedIn(g, playerId);
    if (!me) return [];
    const side: 'A' | 'B' | null = me.team === 'A' || me.team === 'B' ? me.team : null;
    const outcome = outcomeOf(g, me.team);
    const against = side === 'A' ? g.teamBScore : side === 'B' ? g.teamAScore : null;
    const potm = g.motmPlayerId === playerId;
    const teamBest = !!g.teamBest?.includes(playerId);
    const late = me.attendanceStatus === 'late';
    const worked = matchRating({ goals: me.goals, assists: me.assists, saves: me.saves, ownGoals: me.ownGoals, inGoal: me.playedGoalkeeper, role: me.playedGoalkeeper ? 'GK' : positionCode(me.fieldPosition) || positionCode(position), outcome, conceded: against, potm, teamBest, late });
    const edited = me.ratingOverride !== null && me.ratingOverride !== undefined;
    return [{
      gameId: g.id, date: g.date, venue: g.venue, kit: side === 'B' ? g.kits.B : g.kits.A, side, outcome,
      for: side === 'A' ? g.teamAScore : side === 'B' ? g.teamBScore : null, against,
      goals: me.goals, assists: me.assists, saves: me.saves, ownGoals: me.ownGoals, inGoal: me.playedGoalkeeper, potm, teamBest,
      captain: g.captainAPlayerId === playerId || g.captainBPlayerId === playerId,
      rating: edited ? Number(me.ratingOverride) : worked.rating, partial: edited ? false : worked.partial, edited, late,
    }];
  }).sort((a, b) => b.date.localeCompare(a.date));
}

/** `games` is the period on show (a season or all time); `allGames` every match, for the overall over time and the apps milestone. */
export function moreOf(player: ProfilePlayer, players: ProfilePlayer[], games: ProfileGame[], allGames: ProfileGame[] = games): More {
  const id = player.id;
  const done = ratedOnly(games).sort((a, b) => a.date.localeCompare(b.date));
  const nights = nightsOf(id, done, player.position);
  const asc = [...nights].reverse();
  const first = asc[0]?.date ?? null;

  const turnout = { saidYes: 0, played: nights.length, late: nights.filter((n) => n.late).length, noShow: 0 };
  for (const g of done) {
    if (g.going.includes(id)) turnout.saidYes += 1;
    if (g.participants.some((p) => p.playerId === id && p.attendanceStatus === 'no_show')) turnout.noShow += 1;
  }

  const hat = nights.filter((n) => n.goals >= 3);
  let mostInGame: More['mostInGame'] = null;
  for (const n of asc) if (n.goals > 0 && (!mostInGame || n.goals > mostInGame.goals)) mostInGame = { goals: n.goals, date: n.date };
  let run = 0, streak = 0;
  for (const g of done.filter((x) => !first || x.date >= first)) { run = playedIn(g, id) ? run + 1 : 0; streak = Math.max(streak, run); }

  const zoneCount = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  for (const g of done) {
    const me = playedIn(g, id);
    if (!me) continue;
    const z = me.playedGoalkeeper ? 'GK' : playerPositionCode(me.fieldPosition) || playerPositionCode(player.position);
    if (z) zoneCount[z] += 1;
  }
  const zoned = Object.values(zoneCount).reduce((s, n) => s + n, 0);
  const zones = (Object.entries(zoneCount) as Array<[More['zones'][number]['zone'], number]>).filter(([, n]) => n > 0).map(([zone, n]) => ({ zone, games: n, share: Math.round((n / Math.max(1, zoned)) * 100) })).sort((a, b) => b.games - a.games);

  const withs = new Map<string, { name: string; games: number; wins: number }>();
  const againsts = new Map<string, { name: string; games: number; wins: number }>();
  for (const g of done) {
    const me = playedIn(g, id);
    const o = me ? outcomeOf(g, me.team) : null;
    if (!me || !o) continue;
    for (const p of g.participants) {
      if (p.playerId === id || p.attendanceStatus === 'no_show' || (p.team !== 'A' && p.team !== 'B')) continue;
      const map = p.team === me.team ? withs : againsts;
      const t = map.get(p.playerId) ?? { name: p.playerName, games: 0, wins: 0 };
      t.games += 1; if (o === 'W') t.wins += 1;
      map.set(p.playerId, t);
    }
  }
  const rivals = (m: typeof withs): Rival[] => [...m.entries()].filter(([, t]) => t.games >= 3).map(([pid, t]) => ({ id: pid, name: t.name, games: t.games, wins: t.wins, winRate: Math.round((t.wins / t.games) * 100) }));
  const partners = rivals(withs).sort((a, b) => b.winRate - a.winRate || b.games - a.games).slice(0, 3);
  const hardest = rivals(againsts).sort((a, b) => a.winRate - b.winRate || b.games - a.games)[0] ?? null;

  const regulars = players.filter((p) => nightsOf(p.id, done, p.position).length >= 3);
  const code = playerPositionCode(player.position);
  const sameSpot = regulars.filter((p) => playerPositionCode(p.position) === code);
  const statOf = (p: ProfilePlayer) => {
    const ns = nightsOf(p.id, done, p.position);
    const decided = ns.filter((n) => n.outcome);
    const yes = done.filter((g) => g.going.includes(p.id)).length;
    return {
      goals: ns.length ? ns.reduce((s, n) => s + n.goals, 0) / ns.length : 0,
      assists: ns.length ? ns.reduce((s, n) => s + n.assists, 0) / ns.length : 0,
      winRate: decided.length ? decided.filter((n) => n.outcome === 'W').length / decided.length : 0,
      turnsUp: yes ? Math.min(1, done.filter((g) => g.going.includes(p.id) && playedIn(g, p.id)).length / yes) : -1,
      defending: p.defending ?? -1,
    };
  };
  const mine = statOf(player);
  const traitsAgainst = (group: ProfilePlayer[]): Trait[] => {
    const pool = group.some((p) => p.id === id) ? group : [...group, player];
    const stats = pool.map((p) => ({ id: p.id, s: statOf(p) }));
    const place = (k: keyof typeof mine) => {
      if (mine[k] <= 0) return { rank: null, top: null, of: stats.filter((x) => x.s[k] >= 0).length };
      const ranked = stats.filter((x) => x.s[k] >= 0);
      const rank = 1 + ranked.filter((x) => x.s[k] > mine[k]).length;
      return { rank, of: ranked.length, top: Math.max(1, Math.round((rank / Math.max(1, ranked.length)) * 100)) };
    };
    return [
      { key: 'goals', label: 'Goals per game', value: mine.goals, display: mine.goals.toFixed(2), ...place('goals') },
      { key: 'assists', label: 'Assists per game', value: mine.assists, display: mine.assists.toFixed(2), ...place('assists') },
      { key: 'winRate', label: 'Win rate', value: mine.winRate, display: `${Math.round(mine.winRate * 100)}%`, ...place('winRate') },
      ...(mine.turnsUp >= 0 ? [{ key: 'turnsUp', label: 'Turns up', value: mine.turnsUp, display: `${Math.round(mine.turnsUp * 100)}%`, ...place('turnsUp'), note: `${turnout.played} of ${turnout.saidYes} they said yes to` }] : []),
      ...(mine.defending >= 0 ? [{ key: 'defending', label: 'Defending', value: mine.defending / 5, display: String(Math.round(mine.defending * 20)), ...place('defending'), note: 'rated, not counted' }] : []),
    ];
  };

  const everything = ratedOnly(allGames);
  const firstEver = nightsOf(id, everything, player.position).at(-1)?.date ?? null;
  const series: Array<{ label: string; value: number }> = [];
  if (firstEver) {
    const start = new Date(`${firstEver.slice(0, 7)}-01T12:00:00Z`);
    const today = new Date();
    for (let d = new Date(start); d <= today; d.setUTCMonth(d.getUTCMonth() + 1)) {
      const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
      const r = rateSquad(players, everything.filter((g) => g.date <= end)).players.get(id);
      if (r && r.matches) series.push({ label: MO[d.getUTCMonth()]!, value: r.overall });
    }
  }
  const now = series.at(-1)?.value ?? null;
  const prev = series.length > 1 ? series[series.length - 2]! : null;

  const apps = nightsOf(id, everything, player.position).length;
  const potm = nights.filter((n) => n.potm).length;
  const months = new Map<string, Map<string, number>>();
  for (const g of done) for (const p of g.participants) {
    if (p.attendanceStatus === 'no_show' || !p.goals) continue;
    const m = months.get(g.date.slice(0, 7)) ?? new Map<string, number>();
    m.set(p.playerId, (m.get(p.playerId) ?? 0) + p.goals);
    months.set(g.date.slice(0, 7), m);
  }
  const topMonth = [...months.entries()].sort((a, b) => b[0].localeCompare(a[0])).find(([, m]) => {
    const best = Math.max(...m.values());
    return (m.get(id) ?? 0) === best && best > 0;
  });
  const captain = nights.filter((n) => n.captain).length;
  const milestone = [10, 25, 50, 100, 200].find((m) => m > apps) ?? 500;
  const trophies: Trophy[] = [
    { key: 'hat', label: 'Hat-tricks', icon: 'flame', value: `×${hat.length}`, sub: hat.length ? `last · ${dm(hat[0]!.date)}` : 'three in a night', unlocked: hat.length > 0 },
    { key: 'potm', label: 'POTM', icon: 'star', value: `×${potm}`, sub: 'this period', unlocked: potm > 0 },
    { key: 'top', label: 'Top scorer', icon: 'target', value: topMonth ? MO[Number(topMonth[0].slice(5)) - 1]!.toUpperCase() : '–', sub: topMonth ? `${topMonth[1].get(id)} goals` : 'most goals in a month', unlocked: !!topMonth },
    { key: 'streak', label: 'Streak', icon: 'calendar', value: String(streak), sub: 'matches in a row', unlocked: streak >= 3 },
    { key: 'best', label: 'Best night', icon: 'sparkle', value: String(mostInGame?.goals ?? 0), sub: mostInGame ? `goals · ${dm(mostInGame.date)}` : 'most goals in a night', unlocked: (mostInGame?.goals ?? 0) >= 2 },
    { key: 'captain', label: 'Captain', icon: 'shield', value: `×${captain}`, sub: 'led a side', unlocked: captain > 0 },
    { key: 'apps', label: `${milestone} apps`, icon: 'list', value: String(apps), sub: `${milestone - apps} to go`, unlocked: false, progress: apps / milestone },
  ];

  const ratings = nights.map((n) => n.rating);
  return {
    nights,
    missed: first ? done.filter((g) => g.date >= first && !playedIn(g, id)).length : 0,
    avgRating: ratings.length ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10 : null,
    best: ratings.length ? Math.max(...ratings) : null,
    hatTricks: hat.length, lastHatTrick: hat[0]?.date ?? null, mostInGame,
    ownGoals: nights.reduce((s, n) => s + n.ownGoals, 0), captain, turnout, zones, partners, hardest,
    trophies: [...trophies.filter((t) => t.unlocked), ...trophies.filter((t) => t.progress !== undefined), ...trophies.filter((t) => !t.unlocked && t.progress === undefined)],
    traits: { squad: traitsAgainst(regulars), position: traitsAgainst(sameSpot), positionLabel: code === 'FWD' ? 'Strikers' : code === 'MID' ? 'Midfield' : code === 'DEF' ? 'Defenders' : code === 'GK' ? 'Keepers' : 'Position' },
    overall: { now, series, delta: now !== null && prev ? now - prev.value : null, since: prev?.label ?? null },
  };
}

/** The squad's best in the period, for the stat bars. */
export type SquadMax = { goals: number; hatTricks: number; assists: number; ga: number; wins: number; potm: number; saves: number; played: number };
export function squadMax(games: ProfileGame[]): SquadMax {
  const per = new Map<string, SquadMax>();
  for (const g of games) {
    const r = g.teamAScore === null || g.teamBScore === null ? null : g.teamAScore === g.teamBScore ? 'D' : g.teamAScore > g.teamBScore ? 'A' : 'B';
    for (const p of g.participants) {
      if (p.attendanceStatus === 'no_show') continue;
      const m = per.get(p.playerId) ?? { goals: 0, hatTricks: 0, assists: 0, ga: 0, wins: 0, potm: 0, saves: 0, played: 0 };
      m.goals += p.goals; m.assists += p.assists; m.ga += p.goals + p.assists; m.saves += p.saves; m.played += 1;
      if (p.goals >= 3) m.hatTricks += 1;
      if (g.motmPlayerId === p.playerId) m.potm += 1;
      if (r && r !== 'D' && r === p.team) m.wins += 1;
      per.set(p.playerId, m);
    }
  }
  const max: SquadMax = { goals: 0, hatTricks: 0, assists: 0, ga: 0, wins: 0, potm: 0, saves: 0, played: 0 };
  for (const m of per.values()) for (const k of Object.keys(max) as Array<keyof SquadMax>) max[k] = Math.max(max[k], m[k]);
  return max;
}
