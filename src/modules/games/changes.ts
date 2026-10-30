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
  /** The local id of the record this change makes (a match, a player, a venue), and which. */
  creates?: string;
  createsKind?: 'games' | 'players' | 'venues';
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

/* ---------- players ---------- */

export interface PlayerInput {
  name: string;
  phone?: string;
  email?: string;
  /** UPI id (Turf web's payment id). */
  upi?: string;
  position?: string;
  secondaryPosition?: string;
  /** Comma-separated, as the profile keeps it. */
  comfortable?: string;
  preferredFoot?: string;
  speciality?: string;
  playingStyle?: string;
  startingLevel?: string;
  ability?: number;
  pace?: number;
  stamina?: number;
  defending?: number;
  passing?: number;
  dribbling?: number;
  shooting?: number;
  keeperWilling?: boolean;
  keeperRating?: number;
  jersey?: string;
  boots?: string;
  favouritePlayer?: string;
  clubs?: string;
  countries?: string;
  kitColors?: string;
  notes?: string;
  guest?: boolean;
}

/** The body Turf web's player form sends (create: action 'player'; edit: the PUT with every field). */
function playerBody(p: PlayerInput) {
  return {
    name: p.name.trim(),
    phone: p.phone ?? '',
    email: p.email ?? '',
    position: p.position ?? '',
    notes: p.notes ?? '',
    paymentId: p.upi ?? '',
    preferredFoot: p.preferredFoot ?? '',
    speciality: p.speciality ?? '',
    shoes: p.boots ?? '',
    jerseyNumber: p.jersey ?? '',
    favouritePlayer: p.favouritePlayer ?? '',
    supportedClubs: p.clubs ?? '',
    supportedCountries: p.countries ?? '',
    kitColors: p.kitColors ?? '',
    secondaryPosition: p.secondaryPosition ?? '',
    comfortablePositions: p.comfortable ? p.comfortable.split(',').map((x) => x.trim()).filter(Boolean) : [],
    goalkeeperWilling: p.keeperWilling ?? null,
    goalkeeperRating: p.keeperWilling ? p.keeperRating ?? null : null,
    playingStyle: p.playingStyle ?? '',
    startingLevel: p.startingLevel ?? null,
    initialAbility: p.ability ?? null,
    pace: p.pace ?? null,
    stamina: p.stamina ?? null,
    defending: p.defending ?? null,
    passing: p.passing ?? null,
    dribbling: p.dribbling ?? null,
    shooting: p.shooting ?? null,
    kind: p.guest ? 'guest' : 'regular',
  };
}

/** The profile fields a PlayerInput sets (blank clears). */
function profileFields(p: PlayerInput): Partial<PlayerProfileData> {
  const s = (v?: string) => (v && v.trim() ? v.trim() : undefined);
  return {
    name: p.name.trim(),
    position: s(p.position),
    secondaryPosition: s(p.secondaryPosition),
    comfortable: s(p.comfortable),
    preferredFoot: s(p.preferredFoot),
    speciality: s(p.speciality),
    playingStyle: s(p.playingStyle),
    startingLevel: s(p.startingLevel),
    ability: p.ability,
    pace: p.pace,
    stamina: p.stamina,
    defending: p.defending,
    passing: p.passing,
    dribbling: p.dribbling,
    shooting: p.shooting,
    keeperWilling: p.keeperWilling,
    keeperRating: p.keeperWilling ? p.keeperRating : undefined,
    jersey: s(p.jersey),
    boots: s(p.boots),
    favouritePlayer: s(p.favouritePlayer),
    clubs: s(p.clubs),
    countries: s(p.countries),
    kitColors: s(p.kitColors),
    notes: s(p.notes),
    guest: p.guest || undefined,
  };
}

/** A player's form, filled from the profile and their Person. */
export function playerInputOf(os: LifeOSContext, profileId: string): PlayerInput | null {
  const p = os.records.get<PlayerProfileData>(profileId);
  if (!p) return null;
  const person = os.records.get<{ phone?: string; email?: string; upi?: string }>(p.data.personId);
  const d = p.data;
  return { name: d.name, phone: person?.data.phone, email: person?.data.email, upi: person?.data.upi, position: d.position, secondaryPosition: d.secondaryPosition, comfortable: d.comfortable, preferredFoot: d.preferredFoot, speciality: d.speciality, playingStyle: d.playingStyle, startingLevel: d.startingLevel, ability: d.ability, pace: d.pace, stamina: d.stamina, defending: d.defending, passing: d.passing, dribbling: d.dribbling, shooting: d.shooting, keeperWilling: d.keeperWilling, keeperRating: d.keeperRating, jersey: d.jersey, boots: d.boots, favouritePlayer: d.favouritePlayer, clubs: d.clubs, countries: d.countries, kitColors: d.kitColors, notes: d.notes, guest: d.guest };
}

/** A new player: a Person (unless one is given) and a Player profile, sent to Turf web. Returns the profile. */
export function createPlayer(os: LifeOSContext, input: PlayerInput, personId?: string): { profileId: string; item: OutboxItem<TurfAction> } {
  if (!input.name.trim()) throw new Error('Give them a name');
  const changeId = newId();
  const local = `local-${changeId}`;
  let profileId!: string;
  let item!: OutboxItem<TurfAction>;
  os.db.transaction(() => {
    const made: string[] = [];
    const pid = personId && os.records.get(personId) ? personId : os.records.create({ object: 'person', title: input.name.trim(), data: Object.fromEntries(Object.entries({ relationship: 'friend', phone: input.phone, email: input.email, upi: input.upi }).filter(([, v]) => v)) }, ACTOR).id;
    if (pid !== personId) made.push(pid);
    const profile = os.records.create<PlayerProfileData>({ object: 'player', data: { ...(profileFields(input) as PlayerProfileData), personId: pid, availability: 'AVL', availabilityMode: 'regular', weekly: 'all_week', sourceKey: `turf:players:${local}` } }, ACTOR);
    profileId = profile.id;
    made.unshift(profile.id);
    if (!input.guest) {
      const gid = os.settings.get<string | null>('turf.groupId', null);
      const group = gid ? os.records.get<{ memberIds?: string[] }>(gid) : undefined;
      if (group && !(group.data.memberIds ?? []).includes(pid)) os.records.update(gid!, { data: { ...group.data, memberIds: [...(group.data.memberIds ?? []), pid] } }, ACTOR);
    }
    item = queueTurf(os, { id: changeId, label: `New player · ${input.name.trim()}${input.guest ? ' (guest)' : ''}`, recordId: profile.id, action: { method: 'POST', body: { action: 'player', ...playerBody(input) }, undo: { restore: [], remove: made }, creates: local, createsKind: 'players' } });
  });
  return { profileId, item };
}

/** A player's details changed; Turf web gets every field, as its own form sends them. */
export function editPlayer(os: LifeOSContext, profileId: string, input: PlayerInput) {
  const p = os.records.get<PlayerProfileData>(profileId);
  const id = p ? turfPlayerId(p.data) : null;
  if (!p || !id) throw new Error('That player isn’t in Turf web');
  if (!input.name.trim()) throw new Error('Give them a name');
  const person = os.records.get<Record<string, unknown>>(p.data.personId);
  return change(os, {
    label: `${input.name.trim()} · details changed`,
    recordId: p.id,
    touches: [p.id, ...(person ? [person.id] : [])],
    method: 'PUT',
    body: { id, ...playerBody(input) },
    apply: () => {
      replaceData<PlayerProfileData>(os, p.id, { ...p.data, ...profileFields(input) } as PlayerProfileData);
      if (person) os.records.update(person.id, { data: { ...person.data, phone: input.phone || undefined, email: input.email || undefined, upi: input.upi || undefined } }, ACTOR);
    },
  });
}

export interface AvailabilityInput {
  mode: 'regular' | 'window_only';
  weekly: 'all_week' | 'weekdays' | 'weekends';
  periods: Array<{ status: 'AVL' | 'INJ' | 'OOS'; startsAt: string; endsAt?: string | null; note?: string | null }>;
}

/** When a player can play: regular or only in windows, which days, and periods (injured, away…). */
export function setAvailability(os: LifeOSContext, profileId: string, a: AvailabilityInput) {
  const p = os.records.get<PlayerProfileData>(profileId);
  const id = p ? turfPlayerId(p.data) : null;
  if (!p || !id) throw new Error('That player isn’t in Turf web');
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (a.periods.some((x) => !day.test(x.startsAt) || (x.endsAt && (!day.test(x.endsAt) || x.endsAt < x.startsAt)))) throw new Error('Check the availability dates');
  return change(os, {
    label: `${p.data.name} · availability`,
    recordId: p.id,
    touches: [p.id],
    method: 'POST',
    body: { action: 'availability', id, availabilityMode: a.mode, weeklyAvailability: a.weekly, periods: a.periods.map((x) => ({ status: x.status, startsAt: x.startsAt, endsAt: x.endsAt ?? '', note: x.note ?? '' })) },
    apply: () => replaceData<PlayerProfileData>(os, p.id, { ...p.data, availabilityMode: a.mode, weekly: a.weekly, availability: a.mode === 'window_only' ? 'OOS' : 'AVL', periods: a.periods.length ? a.periods.map((x) => ({ status: x.status, startsAt: x.startsAt, endsAt: x.endsAt ?? null, note: x.note ?? null })) : undefined }),
  });
}

/* ---------- venues ---------- */

export interface VenueInput {
  name: string;
  defaultTime?: string;
  sideSize?: number;
  defaultCost?: number;
  mapsLink?: string;
  paymentTerms: VenueData['paymentTerms'];
  advance?: number;
  notes?: string;
}

const SIZES = [5, 6, 7, 8, 9, 11];

function checkVenue(v: VenueInput) {
  if (!v.name.trim()) throw new Error('Give the venue a name');
  if (v.sideSize && !SIZES.includes(v.sideSize)) throw new Error('Choose a supported ground size');
  if (v.defaultCost != null && v.defaultCost <= 0) throw new Error('The usual cost must be more than zero');
  if (v.mapsLink && !/^https?:\/\//i.test(v.mapsLink)) throw new Error('Use a complete Google Maps link');
}

const venueBody = (v: VenueInput) => ({ action: 'venue', name: v.name.trim(), defaultTime: v.defaultTime ?? '', sideSize: v.sideSize ?? null, defaultCost: v.defaultCost ?? null, mapsLink: v.mapsLink ?? '', paymentTerms: v.paymentTerms, advanceAmount: v.paymentTerms === 'advance_paid' ? v.advance ?? 0 : null, notes: v.notes ?? '' });

const venueData = (v: VenueInput, base: Partial<VenueData>): VenueData => ({ ...base, name: v.name.trim(), defaultTime: v.defaultTime || undefined, sideSize: v.sideSize || undefined, defaultCost: v.defaultCost || undefined, mapsLink: v.mapsLink || undefined, paymentTerms: v.paymentTerms, advance: v.paymentTerms === 'advance_paid' ? v.advance : undefined, notes: v.notes || undefined }) as VenueData;

/** A new venue (a Place too) or an edited one, sent to Turf web. Returns the Venue record. */
export function saveVenue(os: LifeOSContext, venueId: string | null, v: VenueInput): { venueId: string; item: OutboxItem<TurfAction> | null } {
  checkVenue(v);
  if (venueId) {
    const cur = os.records.get<VenueData>(venueId);
    const id = cur ? turfVenueId(cur.data) : null;
    if (!cur || !id) throw new Error('That venue isn’t in Turf web');
    const item = change(os, { label: `${v.name.trim()} · venue saved`, recordId: cur.id, touches: [cur.id], method: 'POST', body: { ...venueBody(v), id }, apply: () => replaceData<VenueData>(os, cur.id, venueData(v, cur.data)) });
    return { venueId: cur.id, item };
  }
  const changeId = newId();
  const local = `local-${changeId}`;
  let vid!: string;
  let item!: OutboxItem<TurfAction>;
  os.db.transaction(() => {
    const place = os.records.query<{ kind?: string }>('place', {}, { limit: 100_000 }).find((pl) => pl.title.trim().toLowerCase() === v.name.trim().toLowerCase());
    const made: string[] = [];
    const placeId = place?.id ?? os.records.create({ object: 'place', title: v.name.trim(), data: { kind: 'venue' } }, ACTOR).id;
    if (!place) made.push(placeId);
    const rec = os.records.create<VenueData>({ object: 'venue', data: venueData(v, { placeId, sourceKey: `turf:venues:${local}` }) }, ACTOR);
    vid = rec.id;
    made.unshift(rec.id);
    item = queueTurf(os, { id: changeId, label: `New venue · ${v.name.trim()}`, recordId: rec.id, action: { method: 'POST', body: venueBody(v), undo: { restore: [], remove: made }, creates: local, createsKind: 'venues' } });
  });
  return { venueId: vid, item };
}

/** The venue form's starting point. */
export function venueInputOf(os: LifeOSContext, venueId: string): VenueInput | null {
  const v = os.records.get<VenueData>(venueId);
  if (!v) return null;
  return { name: v.data.name, defaultTime: v.data.defaultTime, sideSize: v.data.sideSize, defaultCost: v.data.defaultCost, mapsLink: v.data.mapsLink, paymentTerms: v.data.paymentTerms, advance: v.data.advance, notes: v.data.notes };
}

/* ---------- when Turf web answers a new match, player or venue ---------- */

/** Turf web made the record: the local one takes its real id. If Turf web already had it (a venue of the same name and size), the local copy folds into that one. */
export function remapLocal(os: LifeOSContext, kind: 'games' | 'players' | 'venues', local: string, real: string) {
  if (kind === 'games') return remapLocalMatch(os, local, real);
  const map = os.settings.get<Record<string, string>>(LOCAL_IDS, {});
  map[local] = real;
  os.settings.set(LOCAL_IDS, map);
  const object = kind === 'players' ? 'player' : 'venue';
  const find = (key: string) => os.records.query<{ sourceKey?: string }>(object, { includeArchived: true, filter: { and: [{ field: 'data.sourceKey', op: 'eq', value: key }] } }, { limit: 1 })[0];
  os.db.transaction(() => {
    const mine = find(`turf:${kind}:${local}`);
    if (!mine) return;
    const theirs = find(`turf:${kind}:${real}`);
    if (theirs && theirs.id !== mine.id && kind === 'venues') {
      for (const g of os.records.query<GameData>('game', { includeArchived: true, filter: { and: [{ field: 'data.venueId', op: 'eq', value: mine.id }] } }, { limit: 10_000 })) os.records.update<GameData>(g.id, { data: { ...g.data, venueId: theirs.id } }, 'system');
      os.records.delete(mine.id, 'system');
      return;
    }
    os.records.update(mine.id, { data: { ...(mine.data as object), sourceKey: `turf:${kind}:${real}` } }, 'system');
    if (kind === 'players') {
      for (const a of os.records.query<AppearanceData>('appearance', { includeArchived: true }, { limit: 100_000 })) {
        const k = a.data.sourceKey ?? '';
        if (k.endsWith(`:${local}`)) os.records.update<AppearanceData>(a.id, { data: { ...a.data, sourceKey: k.replace(`:${local}`, `:${real}`) } }, 'system');
      }
    }
  });
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
