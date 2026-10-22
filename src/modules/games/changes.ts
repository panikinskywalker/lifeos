import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { OutboxItem } from '@core/repo/outboxRepo';
import { newId } from '@core/domain/ids';
import type { AppearanceData, GameData, PlayerProfileData, VenueData } from './types';
import { dropPending, recountPaid, refreshTurfDebts } from './sync';
import { advanceFor, clampStat, expectedFor, followedAfterEdit, followedScore, needsFronter, splitShare } from './rules';
import { DEFAULT_KITS, kitOf, validFormation } from './kits';

/**
 * Changes made in LifeOS for Turf web (docs/MODEL.md layer 4, *Turf web*;
 * R9c.2–3). Each one is applied here at once and queued in `os.outbox` as the
 * same request Turf web's own screens send to /api/data, with its own id. It
 * keeps what it replaced, so a refusal puts things back. Turf web answers on
 * the next sync with its own truth, which wins.
 *
 * A match made here has no Turf web id yet: it is `local-<change id>` until
 * Turf web answers with the real one, and changes queued after it say the
 * local id, filled in when they are sent (sources.ts).
 */

export const TURF_SOURCE = 'turf';

/** What a refused change puts back: records as they were, records it made. */
export interface Undo {
  restore: Array<{ id: string; data: Record<string, unknown>; archived: boolean }>;
  remove: string[];
}

/** One request, exactly as Turf web's own screens send it to /api/data, and how to take it back. */
export interface TurfAction {
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body: Record<string, unknown>;
  undo?: Undo;
  /** The local id of the match this change makes. */
  creates?: string;
}

export const LOCAL_IDS = 'turf.localIds';
export const isLocalId = (id: string) => id.startsWith('local-');
/** The change that makes a local match has the local id's own id, so its fate is known. */
export const localMade = (os: LifeOSContext, local: string) => os.outbox.get(local.slice('local-'.length))?.state ?? null;

const ACTOR = 'user' as const;
const shortDay = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/* ---------- the queue ---------- */

export function queueTurf(os: LifeOSContext, c: { label: string; recordId?: string | null; action: TurfAction; id?: string }): OutboxItem<TurfAction> {
  return os.outbox.add<TurfAction>({ source: TURF_SOURCE, label: c.label, recordId: c.recordId ?? null, payload: c.action, id: c.id });
}

const snap = (os: LifeOSContext, ids: string[]): Undo['restore'] =>
  ids.flatMap((id) => {
    const r = os.records.get<Record<string, unknown>>(id);
    return r ? [{ id: r.id, data: { ...r.data }, archived: !!r.archived }] : [];
  });

/** Replace a record's data (records.update merges, so dropped fields are cleared explicitly). */
function replaceData<T extends object>(os: LifeOSContext, id: string, data: T, archived?: boolean) {
  const old = (os.records.get(id)?.data ?? {}) as Record<string, unknown>;
  const next = { ...data } as Record<string, unknown>;
  for (const k of Object.keys(old)) if (!(k in next)) next[k] = undefined;
  return os.records.update<T>(id, { data: next as T, ...(archived === undefined ? {} : { archived }) }, ACTOR);
}

/** Turf web said no: what the change showed here goes back. */
export function undoRefused(os: LifeOSContext, item: OutboxItem): void {
  const action = item.payload as TurfAction | null;
  os.db.transaction(() => {
    if (item.recordId && dropPending(os, item.recordId, item.id)) recountPaid(os, item.recordId);
    for (const r of action?.undo?.restore ?? []) if (os.records.get(r.id)) replaceData(os, r.id, r.data, r.archived);
    for (const id of action?.undo?.remove ?? []) if (os.records.get(id)) os.records.delete(id, ACTOR);
    refreshTurfDebts(os);
  });
}

/** For the board: what is sending and what Turf web refused, newest refusals first. */
export function turfChanges(os: LifeOSContext) {
  return { sending: os.outbox.waiting<TurfAction>(TURF_SOURCE), refused: os.outbox.refused<TurfAction>(TURF_SOURCE) };
}

/** Is anything for this record still on its way? */
export const isSending = (os: LifeOSContext, recordId: string) => os.outbox.forRecord(recordId).some((i) => i.state === 'waiting');

/* ---------- Turf web ids ---------- */

/** Turf web's ids for a share, from its source key `turf:game_players:<game>:<player>`. */
export function turfShareIds(a: AppearanceData): { gameId: string; playerId: string } | null {
  const m = /^turf:game_players:([^:]+):([^:]+)$/.exec(a.sourceKey ?? '');
  return m ? { gameId: m[1]!, playerId: m[2]! } : null;
}
const turfIdOf = (prefix: string, sourceKey?: string) => (sourceKey?.startsWith(prefix) ? sourceKey.slice(prefix.length) : null);
export const turfGameId = (g: GameData) => turfIdOf('turf:games:', g.sourceKey);
export const turfPlayerId = (p: PlayerProfileData) => turfIdOf('turf:players:', p.sourceKey);
export const turfVenueId = (v: VenueData) => turfIdOf('turf:venues:', v.sourceKey);

function share(os: LifeOSContext, appearanceId: string) {
  const a = os.records.get<AppearanceData>(appearanceId);
  if (!a || a.object !== 'appearance') throw new Error('That player isn’t in this match any more');
  const ids = turfShareIds(a.data);
  const g = os.records.get<GameData>(a.data.gameId);
  if (!ids || !g) throw new Error('That match didn’t come from Turf web');
  return { a, g, ids, name: os.records.get(a.data.personId)?.title ?? 'Someone' };
}

function game(os: LifeOSContext, gameId: string) {
  const g = os.records.get<GameData>(gameId);
  const id = g?.object === 'game' ? turfGameId(g.data) : null;
  if (!g || !id) throw new Error('That match didn’t come from Turf web');
  return { g, id };
}

const liveApps = (os: LifeOSContext, gameId: string) => os.records.query<AppearanceData>('appearance', { filter: { and: [{ field: 'data.gameId', op: 'eq', value: gameId }] } }, { limit: 500 });
const allApps = (os: LifeOSContext, gameId: string) => os.records.query<AppearanceData>('appearance', { includeArchived: true, filter: { and: [{ field: 'data.gameId', op: 'eq', value: gameId }] } }, { limit: 500 });

/** The score follows the goals here too, unless it was set by hand. */
function follow(os: LifeOSContext, gameId: string, afterEdit = false) {
  const g = os.records.get<GameData>(gameId);
  if (!g || g.data.scoreLocked) return;
  const apps = liveApps(os, gameId).map((a) => a.data);
  const s = afterEdit ? followedAfterEdit(g.data, apps) : followedScore(apps);
  if (s && (s.scoreA !== g.data.scoreA || s.scoreB !== g.data.scoreB)) os.records.update<GameData>(gameId, { data: { ...g.data, ...s } }, ACTOR);
}

/** Apply here, queue for Turf web, in one go. */
function change(os: LifeOSContext, c: { label: string; recordId: string; touches: string[]; method?: TurfAction['method']; body: Record<string, unknown>; apply: () => void }) {
  let item!: OutboxItem<TurfAction>;
  os.db.transaction(() => {
    const undo: Undo = { restore: snap(os, c.touches), remove: [] };
    c.apply();
    refreshTurfDebts(os);
    item = queueTurf(os, { label: c.label, recordId: c.recordId, action: { method: c.method ?? 'PATCH', body: c.body, undo } });
  });
  return item;
}

/* ---------- one player in one match ---------- */

export const ATTENDANCE_WORDS = { confirmed: 'on time', late: 'late', no_show: 'no-show' } as const;

export function setAttendance(os: LifeOSContext, appearanceId: string, status: AppearanceData['attendance']) {
  const { a, ids, name } = share(os, appearanceId);
  if (a.data.attendance === status) return null;
  return change(os, {
    label: `${name} ${ATTENDANCE_WORDS[status]} · ${shortDay(a.data.gameDate)}`,
    recordId: a.id,
    touches: [a.id],
    body: { action: 'attendance', ...ids, status },
    apply: () => os.records.update<AppearanceData>(a.id, { data: { ...a.data, attendance: status } }, ACTOR),
  });
}

export interface MatchStats {
  goals: number;
  assists: number;
  saves: number;
  ownGoals: number;
  inGoal: boolean;
}

export function setStats(os: LifeOSContext, appearanceId: string, input: MatchStats) {
  const { a, g, ids, name } = share(os, appearanceId);
  const s = { goals: clampStat(input.goals, 20), assists: clampStat(input.assists, 20), saves: clampStat(input.saves, 50), ownGoals: clampStat(input.ownGoals, 20), inGoal: !!input.inGoal };
  const tags = [s.goals ? `${s.goals}G` : null, s.assists ? `${s.assists}A` : null, s.saves ? `${s.saves}S` : null, s.ownGoals ? `${s.ownGoals}OG` : null].filter(Boolean).join(' · ');
  return change(os, {
    label: `${name} ${tags || 'stats cleared'} · ${shortDay(a.data.gameDate)}`,
    recordId: a.id,
    touches: [a.id, g.id],
    body: { action: 'matchStats', ...ids, goals: s.goals, assists: s.assists, saves: s.saves, ownGoals: s.ownGoals, playedGoalkeeper: s.inGoal },
    apply: () => {
      os.records.update<AppearanceData>(a.id, { data: { ...a.data, goals: s.goals, assists: s.assists, saves: s.saves, ownGoals: s.ownGoals || undefined, inGoal: s.inGoal } }, ACTOR);
      follow(os, g.id);
    },
  });
}

/** Captain of the player's team, or not any more (Turf web toggles the same way). */
export function toggleCaptain(os: LifeOSContext, appearanceId: string) {
  const { a, g, ids, name } = share(os, appearanceId);
  const team = a.data.team;
  if (!team) throw new Error('Put them on a team before making them captain');
  const key = team === 'A' ? 'captainAId' : 'captainBId';
  const next = g.data[key] === a.data.personId ? undefined : a.data.personId;
  return change(os, {
    label: `${name} ${next ? 'made' : 'no longer'} team ${team} captain · ${shortDay(g.data.date)}`,
    recordId: g.id,
    touches: [g.id],
    body: { action: 'captain', ...ids, team },
    apply: () => replaceData<GameData>(os, g.id, { ...g.data, [key]: next }),
  });
}

/** Player of the match, or none. */
export function setMotm(os: LifeOSContext, gameId: string, appearanceId: string | null) {
  const { g, id } = game(os, gameId);
  const pick = appearanceId ? share(os, appearanceId) : null;
  const personId = pick?.a.data.personId;
  if (g.data.motmId === personId) return null;
  return change(os, {
    label: pick ? `${pick.name} player of the match · ${shortDay(g.data.date)}` : `Player of the match cleared · ${shortDay(g.data.date)}`,
    recordId: g.id,
    touches: [g.id],
    body: { action: 'motm', gameId: id, playerId: pick?.ids.playerId ?? '' },
    apply: () => replaceData<GameData>(os, g.id, { ...g.data, motmId: personId }),
  });
}

/* ---------- teams ---------- */

/**
 * Save teams (Pick teams): one `team` change per player whose side changed,
 * as Turf web's screen sends them; someone moved off a side stops being its
 * captain; the score follows the goals again. Returns how many changed.
 */
export function saveTeams(os: LifeOSContext, gameId: string, teams: Record<string, 'A' | 'B' | null>): number {
  const { g } = game(os, gameId);
  const kitName = (t: 'A' | 'B') => kitOf(t === 'A' ? g.data.colorA : g.data.colorB, t === 'A' ? DEFAULT_KITS.A : DEFAULT_KITS.B).name;
  let n = 0;
  os.db.transaction(() => {
    for (const [appearanceId, team] of Object.entries(teams)) {
      const { a, ids, name } = share(os, appearanceId);
      if ((a.data.team ?? null) === team) continue;
      n++;
      change(os, {
        label: `${name} → ${team ? kitName(team) : 'no team'} · ${shortDay(a.data.gameDate)}`,
        recordId: a.id,
        touches: [a.id, g.id],
        body: { action: 'team', ...ids, team: team ?? '', fieldPosition: a.data.position ?? '' },
        apply: () => {
          replaceData<AppearanceData>(os, a.id, { ...a.data, team: team ?? undefined });
          const cur = os.records.get<GameData>(g.id)!;
          const captains = { captainAId: team !== 'A' && cur.data.captainAId === a.data.personId ? undefined : cur.data.captainAId, captainBId: team !== 'B' && cur.data.captainBId === a.data.personId ? undefined : cur.data.captainBId };
          if (captains.captainAId !== cur.data.captainAId || captains.captainBId !== cur.data.captainBId) replaceData<GameData>(os, g.id, { ...cur.data, ...captains });
          follow(os, g.id);
        },
      });
    }
  });
  return n;
}

/** A side's shape ("2-2-1"), or null for the format's default. */
export function setFormation(os: LifeOSContext, gameId: string, team: 'A' | 'B', formation: string | null) {
  const { g, id } = game(os, gameId);
  if (formation !== null && !validFormation(formation, g.data.sideSize ?? null)) throw new Error(`That shape doesn’t fit ${g.data.sideSize ? `${g.data.sideSize}-a-side` : 'this match'}`);
  const key = team === 'A' ? 'formationA' : 'formationB';
  if ((g.data[key] ?? null) === formation) return null;
  const kit = kitOf(team === 'A' ? g.data.colorA : g.data.colorB, team === 'A' ? DEFAULT_KITS.A : DEFAULT_KITS.B).name;
  return change(os, {
    label: `${kit} ${formation ?? 'shape cleared'} · ${shortDay(g.data.date)}`,
    recordId: g.id,
    touches: [g.id],
    body: { action: 'formation', gameId: id, team, formation },
    apply: () => replaceData<GameData>(os, g.id, { ...g.data, [key]: formation ?? undefined }),
  });
}

/* ---------- the score ---------- */

/** A score set by hand: it stops following the goals. */
export function setScore(os: LifeOSContext, gameId: string, scoreA: number, scoreB: number) {
  const { g, id } = game(os, gameId);
  const a = Math.floor(Number(scoreA));
  const b = Math.floor(Number(scoreB));
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0 || a > 99 || b > 99) throw new Error('Enter both scores');
  return change(os, {
    label: `Score ${a}–${b} · ${shortDay(g.data.date)}`,
    recordId: g.id,
    touches: [g.id],
    body: { action: 'score', gameId: id, teamAScore: a, teamBScore: b },
    apply: () => os.records.update<GameData>(g.id, { data: { ...g.data, scoreA: a, scoreB: b, scoreLocked: true } }, ACTOR),
  });
}

/** Back to following the goals. */
export function followGoals(os: LifeOSContext, gameId: string) {
  const { g, id } = game(os, gameId);
  return change(os, {
    label: `Score follows the goals · ${shortDay(g.data.date)}`,
    recordId: g.id,
    touches: [g.id],
    body: { action: 'score', gameId: id, follow: true },
    apply: () => {
      os.records.update<GameData>(g.id, { data: { ...g.data, scoreLocked: undefined } }, ACTOR);
      follow(os, g.id);
    },
  });
}

/* ---------- new and edited matches ---------- */

export interface MatchInput {
  date: string;
  time?: string;
  /** A Venue record. */
  venueId: string;
  totalCost: number;
  paymentTerms: GameData['paymentTerms'];
  advance?: number;
  sideSize?: number;
  expectedPlayers?: number;
  /** Player profile records, in the order picked. */
  playerIds: string[];
  /** A Player profile record, one of the picked. */
  frontedById?: string;
}

/** What a venue fills in for a new match. */
export function matchDefaults(os: LifeOSContext, venueId: string): Partial<MatchInput> {
  const v = os.records.get<VenueData>(venueId);
  if (!v) return {};
  return { venueId, time: v.data.defaultTime, sideSize: v.data.sideSize, totalCost: v.data.defaultCost, paymentTerms: v.data.paymentTerms, advance: v.data.advance };
}

function checkMatch(os: LifeOSContext, m: MatchInput) {
  const venue = os.records.get<VenueData>(m.venueId);
  if (!m.date || !venue) throw new Error('Choose the day and the venue');
  if (!(m.totalCost >= 0)) throw new Error('Enter the turf cost');
  if (!m.playerIds.length) throw new Error('Pick the players');
  if (new Set(m.playerIds).size !== m.playerIds.length) throw new Error('Each player can only be picked once');
  if (needsFronter(m.paymentTerms) && !m.frontedById) throw new Error('A prepaid booking needs whoever paid for it');
  if (m.frontedById && !m.playerIds.includes(m.frontedById)) throw new Error('Whoever fronted the cost must be in the match');
  const players = m.playerIds.map((id) => os.records.get<PlayerProfileData>(id));
  if (players.some((p) => !p || !turfPlayerId(p.data))) throw new Error('One of those players isn’t in Turf web');
  const venueTurf = turfVenueId(venue.data);
  return { venue, venueTurf, players: players as ObjectRecord<PlayerProfileData>[] };
}

function matchBody(os: LifeOSContext, m: MatchInput, c: ReturnType<typeof checkMatch>) {
  const fronted = m.frontedById ? os.records.get<PlayerProfileData>(m.frontedById) : undefined;
  return {
    action: 'game',
    date: m.date,
    time: m.time ?? '',
    venue: c.venue.data.name,
    venueId: c.venueTurf ?? '',
    totalAmount: m.totalCost,
    paymentTerms: m.paymentTerms,
    advanceAmount: advanceFor(m.paymentTerms, m.totalCost, m.advance) ?? null,
    sideSize: m.sideSize ?? null,
    playerIds: c.players.map((p) => turfPlayerId(p.data)!),
    expectedPlayers: expectedFor(m.expectedPlayers, m.sideSize, m.playerIds.length),
    frontedByPlayerId: fronted ? turfPlayerId(fronted.data) ?? '' : '',
  };
}

function gameData(os: LifeOSContext, m: MatchInput, c: ReturnType<typeof checkMatch>, base: Partial<GameData>, sourceKey: string): GameData {
  const fronted = m.frontedById ? os.records.get<PlayerProfileData>(m.frontedById) : undefined;
  return {
    ...base,
    date: m.date,
    time: m.time || undefined,
    venueId: c.venue.id,
    venueName: c.venue.data.name,
    sideSize: m.sideSize || undefined,
    totalCost: m.totalCost,
    expectedPlayers: expectedFor(m.expectedPlayers, m.sideSize, m.playerIds.length),
    paymentTerms: m.paymentTerms,
    advance: advanceFor(m.paymentTerms, m.totalCost, m.advance),
    frontedById: fronted?.data.personId,
    sourceKey,
  } as GameData;
}

/** A new match: on the board at once, its shares split, sent to Turf web. Returns the Game record. */
export function createMatch(os: LifeOSContext, m: MatchInput): { gameId: string; item: OutboxItem<TurfAction> } {
  const c = checkMatch(os, m);
  const changeId = newId();
  const local = `local-${changeId}`;
  const shareEach = splitShare(m.totalCost, m.playerIds.length);
  const today = new Date().toISOString().slice(0, 10);
  let gameId!: string;
  let item!: OutboxItem<TurfAction>;
  os.db.transaction(() => {
    const g = os.records.create<GameData>({ object: 'game', data: gameData(os, m, c, { colorA: DEFAULT_KITS.A, colorB: DEFAULT_KITS.B, goalData: 'missing' }, `turf:games:${local}`) }, ACTOR);
    gameId = g.id;
    const made = [g.id];
    for (const p of c.players) {
      const fronted = p.id === m.frontedById;
      made.push(os.records.create<AppearanceData>({ object: 'appearance', data: { gameId: g.id, personId: p.data.personId, gameDate: m.date, share: shareEach, paid: fronted, ...(fronted ? { paidOn: today } : {}), attendance: 'confirmed', goals: 0, assists: 0, saves: 0, inGoal: false, sourceKey: `turf:game_players:${local}:${turfPlayerId(p.data)}` } }, ACTOR).id);
    }
    refreshTurfDebts(os);
    item = queueTurf(os, {
      id: changeId,
      label: `New match · ${shortDay(m.date)} · ${c.venue.data.name} · ${m.playerIds.length} players`,
      recordId: g.id,
      action: { method: 'POST', body: matchBody(os, m, c), undo: { restore: [], remove: made }, creates: local },
    });
  });
  return { gameId, item };
}

/**
 * An edited match: the day, venue, cost, terms or squad. Shares are split
 * again; everyone kept keeps their team, stats and payments; a share is paid
 * once its entries cover it, and whoever fronted counts as paid. Taking off
 * someone who has paid needs a refund first (Turf web refuses it too).
 */
export function editMatch(os: LifeOSContext, gameId: string, m: MatchInput) {
  const { g, id } = game(os, gameId);
  const c = checkMatch(os, m);
  const apps = allApps(os, g.id);
  const turfIds = c.players.map((p) => turfPlayerId(p.data)!);
  const keyOf = (pid: string) => `turf:game_players:${id}:${pid}`;
  const keep = new Set(turfIds.map(keyOf));
  const held = apps.filter((a) => !a.archived && !keep.has(a.data.sourceKey ?? '') && (a.data.amountPaid ?? 0) !== 0);
  if (held.length) throw new Error(`${held.map((a) => os.records.get(a.data.personId)?.title ?? 'Someone').join(', ')} paid towards this match — refund them before taking them off`);
  const shareEach = splitShare(m.totalCost, m.playerIds.length);
  const today = new Date().toISOString().slice(0, 10);
  let item!: OutboxItem<TurfAction>;
  os.db.transaction(() => {
    const undo: Undo = { restore: snap(os, [g.id, ...apps.map((a) => a.id)]), remove: [] };
    replaceData<GameData>(os, g.id, gameData(os, m, c, g.data, g.data.sourceKey!));
    for (const [i, p] of c.players.entries()) {
      const key = keyOf(turfIds[i]!);
      const prev = apps.find((a) => a.data.sourceKey === key);
      const fronted = p.id === m.frontedById;
      const base: AppearanceData = prev ? { ...prev.data } : { gameId: g.id, personId: p.data.personId, gameDate: m.date, share: 0, paid: false, attendance: 'confirmed', goals: 0, assists: 0, saves: 0, inGoal: false, sourceKey: key };
      const paid = fronted || (base.amountPaid ?? 0) >= shareEach;
      const data: AppearanceData = { ...base, gameDate: m.date, share: shareEach, paid, paidOn: paid ? base.paidOn ?? today : undefined };
      if (prev) replaceData<AppearanceData>(os, prev.id, data, false);
      else undo.remove.push(os.records.create<AppearanceData>({ object: 'appearance', data }, ACTOR).id);
    }
    for (const a of apps) if (!a.archived && !keep.has(a.data.sourceKey ?? '')) os.records.update(a.id, { archived: true }, ACTOR);
    follow(os, g.id, true);
    refreshTurfDebts(os);
    item = queueTurf(os, { label: `Match edited · ${shortDay(m.date)} · ${c.venue.data.name}`, recordId: g.id, action: { method: 'PUT', body: { ...matchBody(os, m, c), id }, undo } });
  });
  return item;
}

/** The form's starting point for an edit. */
export function matchInputOf(os: LifeOSContext, gameId: string): MatchInput | null {
  const g = os.records.get<GameData>(gameId);
  if (!g) return null;
  const profiles = os.records.query<PlayerProfileData>('player', {}, { limit: 100_000 });
  const profileOf = (personId?: string) => (personId ? profiles.find((p) => p.data.personId === personId)?.id : undefined);
  return {
    date: g.data.date,
    time: g.data.time,
    venueId: g.data.venueId ?? '',
    totalCost: g.data.totalCost,
    paymentTerms: g.data.paymentTerms,
    advance: g.data.advance,
    sideSize: g.data.sideSize,
    expectedPlayers: g.data.expectedPlayers,
    playerIds: liveApps(os, g.id).map((a) => profileOf(a.data.personId)).filter((x): x is string => !!x),
    frontedById: profileOf(g.data.frontedById),
  };
}

/* ---------- when Turf web answers a new match ---------- */

/** Turf web made the match: the local one takes its real id, so the sync finds it instead of adding a second. */
export function remapLocalMatch(os: LifeOSContext, local: string, real: string) {
  const map = os.settings.get<Record<string, string>>(LOCAL_IDS, {});
  map[local] = real;
  os.settings.set(LOCAL_IDS, map);
  os.db.transaction(() => {
    const g = os.records.query<GameData>('game', { includeArchived: true, filter: { and: [{ field: 'data.sourceKey', op: 'eq', value: `turf:games:${local}` }] } }, { limit: 1 })[0];
    if (!g) return;
    os.records.update<GameData>(g.id, { data: { ...g.data, sourceKey: `turf:games:${real}` } }, 'system');
    for (const a of allApps(os, g.id)) {
      const k = a.data.sourceKey ?? '';
      if (k.startsWith(`turf:game_players:${local}:`)) os.records.update<AppearanceData>(a.id, { data: { ...a.data, sourceKey: k.replace(`:${local}:`, `:${real}:`) } }, 'system');
    }
  });
}

/** A queued body with local ids filled in from what Turf web has answered; `missing` lists the ones it hasn't yet. */
export function resolveLocal(os: LifeOSContext, body: Record<string, unknown>): { body: Record<string, unknown>; missing: string[] } {
  const map = os.settings.get<Record<string, string>>(LOCAL_IDS, {});
  const missing: string[] = [];
  const fix = (v: unknown): unknown => {
    if (typeof v === 'string' && isLocalId(v)) {
      if (map[v]) return map[v];
      missing.push(v);
      return v;
    }
    if (Array.isArray(v)) return v.map(fix);
    return v;
  };
  return { body: Object.fromEntries(Object.entries(body).map(([k, v]) => [k, fix(v)])), missing };
}
