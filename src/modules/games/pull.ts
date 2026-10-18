import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { AppearanceData, GameData, PlayerProfileData, VenueData } from './types';

/**
 * Turf Ledger → LifeOS (docs/MODEL.md layer 4, *Services that also write*;
 * R9a). One pull is everything Turf Ledger holds (it keeps no updated-at),
 * applied by source key `turf:<table>:<id>`:
 * - players → a Person each (matched by phone, email or a unique name before
 *   one is made; only empty Person fields are filled) + a Player profile, all
 *   members of the Football group;
 * - venues → a Place each + a Venue;
 * - games → a Game each, participants → Appearances;
 * - an unpaid share between you and someone → a Debt (they owe you when you
 *   fronted the cost; you owe when they did), settled when the share is ticked;
 * - a row gone from Turf Ledger is archived here, never deleted.
 * Nothing is imported as a Transaction: the bank SMS already files the money.
 */

export interface TurfPlayer {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  position?: string | null;
  notes?: string | null;
  paymentId?: string | null;
  photoUrl?: string | null;
  preferredFoot?: string | null;
  speciality?: string | null;
  shoes?: string | null;
  jerseyNumber?: string | null;
  favouritePlayer?: string | null;
  supportedClubs?: string | null;
  supportedCountries?: string | null;
  kitColors?: string | null;
  secondaryPosition?: string | null;
  comfortablePositions?: string[];
  goalkeeperWilling?: boolean | null;
  goalkeeperRating?: number | null;
  playingStyle?: string | null;
  startingLevel?: string | null;
  initialAbility?: number | null;
  pace?: number | null;
  stamina?: number | null;
  defending?: number | null;
  passing?: number | null;
  dribbling?: number | null;
  shooting?: number | null;
  publicSlug?: string | null;
  availabilityMode?: string;
  weeklyAvailability?: string;
  defaultAvailability?: string;
  availabilityPeriods?: Array<{ status: string; startsAt: string; endsAt?: string | null; note?: string | null }>;
}

export interface TurfParticipant {
  playerId: string;
  playerName?: string;
  shareAmount: number;
  paid: boolean;
  team?: string | null;
  fieldPosition?: string | null;
  goals?: number;
  assists?: number;
  saves?: number;
  playedGoalkeeper?: boolean;
  attendanceStatus?: string;
}

export interface TurfGame {
  id: string;
  date: string;
  time?: string | null;
  venue: string;
  venueId?: string | null;
  sideSize?: number | null;
  teamAColor?: string | null;
  teamBColor?: string | null;
  teamAScore?: number | null;
  teamBScore?: number | null;
  goalDataQuality?: string;
  motmPlayerId?: string | null;
  frontedByPlayerId?: string | null;
  paymentTerms?: string;
  advanceAmount?: number | null;
  publicSlug?: string | null;
  captainAPlayerId?: string | null;
  captainBPlayerId?: string | null;
  totalAmount: number;
  expectedPlayers: number;
  participants: TurfParticipant[];
  rsvps?: Array<{ playerId: string; status: string; respondedAt?: string; teamPreference?: string | null }>;
}

export interface TurfVenue {
  id: string;
  name: string;
  defaultTime?: string | null;
  sideSize?: number | null;
  defaultCost?: number | null;
  mapsLink?: string | null;
  paymentTerms?: string;
  advanceAmount?: number | null;
  photoUrl?: string | null;
  notes?: string | null;
}

/** GET /api/lifeos, shape version 1 (Turf-App lib/lifeos-export.ts). Extra tables are read when R9c needs them. */
export interface TurfPull {
  format: 'turf-ledger-for-lifeos';
  version: number;
  generatedAt: string;
  players: TurfPlayer[];
  games: TurfGame[];
  venues: TurfVenue[];
  paymentAudit?: unknown[];
  playerPositions?: unknown[];
  teamGenerations?: unknown[];
  transactions?: unknown[];
}

export interface PullResult {
  created: number;
  updated: number;
  archived: number;
  peopleMatched: number;
  peopleCreated: number;
  debtsOpen: number;
}

const ACTOR = 'system' as const;
const SETTING_GROUP = 'turf.groupId';
const SETTING_DEBTS = 'turf.debts';
export const SETTING_ME = 'turf.mePlayerId';

export const turfKey = (table: string, id: string) => `turf:${table}:${id}`;

const clean = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '')) as T;
const s = (v: string | null | undefined) => (v && v.trim() ? v.trim() : undefined);
const n = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(Number(v)) ? undefined : Number(v));
const digits = (p?: string | null) => (p ?? '').replace(/\D/g, '').slice(-10);
const terms = (v?: string): GameData['paymentTerms'] => (['tentative', 'prepaid', 'advance_paid', 'postpaid'].includes(String(v)) ? (v as GameData['paymentTerms']) : 'postpaid');
const avail = (v?: string): PlayerProfileData['availability'] => (v === 'INJ' || v === 'OOS' ? v : 'AVL');

function bySourceKey<T>(os: LifeOSContext, object: string): Map<string, ObjectRecord<T>> {
  const out = new Map<string, ObjectRecord<T>>();
  for (const r of os.records.query<T & { sourceKey?: string }>(object, { includeArchived: true }, { limit: 100_000 })) {
    const k = (r.data as { sourceKey?: string }).sourceKey;
    if (k?.startsWith('turf:')) out.set(k, r as unknown as ObjectRecord<T>);
  }
  return out;
}

/** Same data as before? Then don't write (no change log noise, no events) on every pull. */
function same(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) return false;
  return true;
}

export function applyTurfPull(os: LifeOSContext, pull: TurfPull): PullResult {
  if (pull?.format !== 'turf-ledger-for-lifeos' || !Array.isArray(pull.players) || !Array.isArray(pull.games)) throw new Error('That isn’t a Turf Ledger pull');
  const res: PullResult = { created: 0, updated: 0, archived: 0, peopleMatched: 0, peopleCreated: 0, debtsOpen: 0 };
  const has = (o: string) => os.registry.objects.has(o);

  const upsert = <T extends object>(object: string, existing: ObjectRecord<T> | undefined, data: T): ObjectRecord<T> => {
    if (existing) {
      const merged = { ...(existing.data as Record<string, unknown>), ...data } as T;
      if (same(existing.data as Record<string, unknown>, merged as Record<string, unknown>) && !existing.archived) return existing;
      res.updated++;
      return os.records.update<T>(existing.id, { data: merged, archived: false }, ACTOR);
    }
    res.created++;
    return os.records.create<T>({ object, data }, ACTOR);
  };

  os.db.transaction(() => {
    /* ---------- players → People + Player profiles ---------- */
    const profiles = bySourceKey<PlayerProfileData>(os, 'player');
    const people = has('person') ? os.records.query<{ phone?: string; email?: string; upi?: string }>('person', {}, { limit: 100_000 }) : [];
    const byPhone = new Map(people.filter((p) => digits(p.data.phone).length === 10).map((p) => [digits(p.data.phone), p]));
    const byEmail = new Map(people.filter((p) => p.data.email).map((p) => [p.data.email!.trim().toLowerCase(), p]));
    const nameCount = new Map<string, number>();
    for (const p of people) nameCount.set(p.title.trim().toLowerCase(), (nameCount.get(p.title.trim().toLowerCase()) ?? 0) + 1);
    const byName = new Map(people.filter((p) => nameCount.get(p.title.trim().toLowerCase()) === 1).map((p) => [p.title.trim().toLowerCase(), p]));

    const personOf = new Map<string, string>(); // Turf player id → Person id
    const seen = new Set<string>();
    for (const tp of pull.players) {
      const key = turfKey('players', tp.id);
      seen.add(key);
      const prev = profiles.get(key);
      let personId = prev?.data.personId && os.records.get(prev.data.personId) ? prev.data.personId : undefined;
      if (!personId && has('person')) {
        const hit = byPhone.get(digits(tp.phone)) ?? (tp.email ? byEmail.get(tp.email.trim().toLowerCase()) : undefined) ?? byName.get(tp.name.trim().toLowerCase());
        if (hit) {
          personId = hit.id;
          res.peopleMatched++;
        } else {
          personId = os.records.create({ object: 'person', title: tp.name.trim(), data: clean({ relationship: 'friend', phone: s(tp.phone), email: s(tp.email), upi: s(tp.paymentId) }) }, ACTOR).id;
          res.peopleCreated++;
        }
      }
      if (!personId) continue;
      // Fill only what the Person doesn't have yet: your edits in People win.
      const person = os.records.get<{ phone?: string; email?: string; upi?: string }>(personId);
      if (person) {
        const gaps = clean({ phone: person.data.phone ? undefined : s(tp.phone), email: person.data.email ? undefined : s(tp.email), upi: person.data.upi ? undefined : s(tp.paymentId) });
        if (Object.keys(gaps).length) os.records.update(personId, { data: { ...person.data, ...gaps } }, ACTOR);
      }
      personOf.set(tp.id, personId);
      upsert<PlayerProfileData>('player', prev, clean({
        personId,
        name: tp.name.trim(),
        position: s(tp.position),
        secondaryPosition: s(tp.secondaryPosition),
        comfortable: tp.comfortablePositions?.length ? tp.comfortablePositions.join(', ') : undefined,
        preferredFoot: s(tp.preferredFoot),
        speciality: s(tp.speciality),
        playingStyle: s(tp.playingStyle),
        startingLevel: s(tp.startingLevel),
        ability: n(tp.initialAbility),
        pace: n(tp.pace),
        stamina: n(tp.stamina),
        defending: n(tp.defending),
        passing: n(tp.passing),
        dribbling: n(tp.dribbling),
        shooting: n(tp.shooting),
        keeperWilling: tp.goalkeeperWilling ?? undefined,
        keeperRating: n(tp.goalkeeperRating),
        jersey: s(tp.jerseyNumber),
        kitColors: s(tp.kitColors),
        boots: s(tp.shoes),
        favouritePlayer: s(tp.favouritePlayer),
        clubs: s(tp.supportedClubs),
        countries: s(tp.supportedCountries),
        availabilityMode: tp.availabilityMode === 'window_only' ? 'window_only' : 'regular',
        weekly: tp.weeklyAvailability === 'weekdays' || tp.weeklyAvailability === 'weekends' ? tp.weeklyAvailability : 'all_week',
        availability: avail(tp.defaultAvailability),
        periods: tp.availabilityPeriods?.length ? tp.availabilityPeriods.map((p) => ({ status: avail(p.status), startsAt: p.startsAt, endsAt: p.endsAt ?? null, note: p.note ?? null })) : undefined,
        photoPath: s(tp.photoUrl),
        shareSlug: s(tp.publicSlug),
        notes: s(tp.notes),
        sourceKey: key,
      }) as PlayerProfileData);
    }

    /* ---------- the Football group ---------- */
    if (has('group') && personOf.size) {
      let gid = os.settings.get<string | null>(SETTING_GROUP, null);
      let group = gid ? os.records.get<{ name: string; memberIds: string[] }>(gid) : undefined;
      if (!group) group = os.records.query<{ name: string; memberIds: string[] }>('group', {}, { limit: 1000 }).find((g) => g.data.name.trim().toLowerCase() === 'football');
      if (!group) group = os.records.create({ object: 'group', data: { name: 'Football', kind: 'friends', memberIds: [] } }, ACTOR);
      gid = group.id;
      os.settings.set(SETTING_GROUP, gid);
      const members = [...new Set([...(group.data.memberIds ?? []), ...personOf.values()])];
      if (members.length !== (group.data.memberIds ?? []).length) os.records.update(gid, { data: { ...group.data, memberIds: members } }, ACTOR);
    }

    /* ---------- venues → Places + Venues ---------- */
    const venues = bySourceKey<VenueData>(os, 'venue');
    const venueOf = new Map<string, string>(); // Turf venue id → Venue record id
    const venueByName = new Map<string, string>();
    for (const tv of pull.venues ?? []) {
      const key = turfKey('venues', tv.id);
      seen.add(key);
      const prev = venues.get(key);
      let placeId = prev?.data.placeId && os.records.get(prev.data.placeId) ? prev.data.placeId : undefined;
      if (!placeId && has('place')) {
        const named = os.records.query<{ kind: string }>('place', {}, { limit: 100_000 }).find((p) => p.title.trim().toLowerCase() === tv.name.trim().toLowerCase());
        placeId = named?.id ?? os.records.create({ object: 'place', title: tv.name.trim(), data: clean({ kind: 'venue', notes: s(tv.mapsLink) }) }, ACTOR).id;
      }
      const v = upsert<VenueData>('venue', prev, clean({
        placeId,
        name: tv.name.trim(),
        defaultTime: s(tv.defaultTime),
        sideSize: n(tv.sideSize),
        defaultCost: n(tv.defaultCost),
        paymentTerms: terms(tv.paymentTerms),
        advance: n(tv.advanceAmount),
        mapsLink: s(tv.mapsLink),
        photoPath: s(tv.photoUrl),
        notes: s(tv.notes),
        sourceKey: key,
      }) as VenueData);
      venueOf.set(tv.id, v.id);
      venueByName.set(`${tv.name.trim().toLowerCase()}|${tv.sideSize ?? ''}`, v.id);
      if (!venueByName.has(tv.name.trim().toLowerCase())) venueByName.set(tv.name.trim().toLowerCase(), v.id);
    }

    /* ---------- games + appearances ---------- */
    const games = bySourceKey<GameData>(os, 'game');
    const apps = bySourceKey<AppearanceData>(os, 'appearance');
    const appearanceIds: Array<{ key: string; rec: ObjectRecord<AppearanceData>; game: TurfGame; tp: TurfParticipant }> = [];
    for (const tg of pull.games) {
      const key = turfKey('games', tg.id);
      seen.add(key);
      const person = (pid?: string | null) => (pid ? personOf.get(pid) : undefined);
      const g = upsert<GameData>('game', games.get(key), clean({
        date: tg.date.slice(0, 10),
        time: s(tg.time),
        venueId: (tg.venueId ? venueOf.get(tg.venueId) : undefined) ?? venueByName.get(`${tg.venue.trim().toLowerCase()}|${tg.sideSize ?? ''}`) ?? venueByName.get(tg.venue.trim().toLowerCase()),
        venueName: tg.venue.trim(),
        sideSize: n(tg.sideSize),
        totalCost: Number(tg.totalAmount) || 0,
        expectedPlayers: Number(tg.expectedPlayers) || 0,
        paymentTerms: terms(tg.paymentTerms),
        advance: n(tg.advanceAmount),
        frontedById: person(tg.frontedByPlayerId),
        scoreA: n(tg.teamAScore),
        scoreB: n(tg.teamBScore),
        colorA: s(tg.teamAColor),
        colorB: s(tg.teamBColor),
        captainAId: person(tg.captainAPlayerId),
        captainBId: person(tg.captainBPlayerId),
        motmId: person(tg.motmPlayerId),
        goalData: (['complete', 'partial', 'inconsistent', 'missing'].includes(String(tg.goalDataQuality)) ? tg.goalDataQuality : 'missing') as GameData['goalData'],
        shareSlug: s(tg.publicSlug),
        sourceKey: key,
      }) as GameData);
      const rsvp = new Map((tg.rsvps ?? []).map((r) => [r.playerId, r.status]));
      for (const tp of tg.participants ?? []) {
        const pid = personOf.get(tp.playerId);
        if (!pid) continue;
        const akey = turfKey('game_players', `${tg.id}:${tp.playerId}`);
        seen.add(akey);
        const prev = apps.get(akey);
        const paid = !!tp.paid;
        const rec = upsert<AppearanceData>('appearance', prev, clean({
          gameId: g.id,
          personId: pid,
          gameDate: tg.date.slice(0, 10),
          share: Number(tp.shareAmount) || 0,
          paid,
          // Turf Ledger gives no paid date in the pull; the day LifeOS first saw it paid stands in.
          paidOn: paid ? prev?.data.paidOn ?? new Date().toISOString().slice(0, 10) : undefined,
          rsvp: rsvp.get(tp.playerId),
          attendance: tp.attendanceStatus === 'late' || tp.attendanceStatus === 'no_show' ? tp.attendanceStatus : 'confirmed',
          team: tp.team === 'A' || tp.team === 'B' ? tp.team : undefined,
          position: s(tp.fieldPosition),
          goals: Number(tp.goals) || 0,
          assists: Number(tp.assists) || 0,
          saves: Number(tp.saves) || 0,
          inGoal: !!tp.playedGoalkeeper,
          sourceKey: akey,
        }) as AppearanceData);
        // paidOn must clear when a share is unticked, which a merge would keep.
        if (!paid && rec.data.paidOn) os.records.update(rec.id, { data: { ...rec.data, paidOn: undefined } }, ACTOR);
        appearanceIds.push({ key: akey, rec, game: tg, tp });
      }
    }

    /* ---------- gone from Turf Ledger → archived ---------- */
    for (const map of [profiles, venues, games, apps] as Array<Map<string, ObjectRecord<unknown>>>) {
      for (const [k, r] of map) {
        if (!seen.has(k) && !r.archived) {
          os.records.update(r.id, { archived: true }, ACTOR);
          res.archived++;
        }
      }
    }

    /* ---------- Debts between you and someone ---------- */
    res.debtsOpen = syncDebts(os, appearanceIds, personOf);
  });
  os.settings.set('turf.lastPull', { at: Date.now(), generatedAt: pull.generatedAt, ...res });
  return res;
}

/**
 * An unpaid share between you and someone is a Debt: they owe you when you
 * fronted the cost, you owe them when they did; nothing when neither is you
 * or "which player is you" isn't set. Settled when ticked paid; removed when
 * it no longer applies (you changed who you are, the share went away).
 */
function syncDebts(os: LifeOSContext, rows: Array<{ key: string; rec: ObjectRecord<AppearanceData>; game: TurfGame; tp: TurfParticipant }>, personOf: Map<string, string>): number {
  if (!os.registry.objects.has('debt')) return 0;
  const me = os.settings.get<string | null>(SETTING_ME, null);
  const mine = os.settings.get<Record<string, string>>(SETTING_DEBTS, {});
  const next: Record<string, string> = {};
  let open = 0;
  for (const { key, rec, game, tp } of rows) {
    const fronted = game.frontedByPlayerId ?? null;
    let want: { personId: string; direction: 'they_owe' | 'i_owe' } | null = null;
    if (me && fronted === me && tp.playerId !== me) want = { personId: rec.data.personId, direction: 'they_owe' };
    else if (me && fronted && fronted !== me && tp.playerId === me) want = personOf.get(fronted) ? { personId: personOf.get(fronted)!, direction: 'i_owe' } : null;
    const existing = mine[key] ? os.records.get<Record<string, unknown>>(mine[key]) : undefined;
    if (!want || !(rec.data.share > 0)) {
      if (existing) os.records.delete(existing.id, ACTOR);
      continue;
    }
    const data = { personId: want.personId, direction: want.direction, amount: rec.data.share, reason: `Turf · ${game.venue.trim()} · ${game.date.slice(0, 10)}`, date: game.date.slice(0, 10), kind: 'split' as const, groupId: os.settings.get<string | null>(SETTING_GROUP, null) ?? undefined };
    const status = rec.data.paid ? 'settled' : 'open';
    let id: string;
    if (existing) {
      if (!same(existing.data, clean(data))) os.records.update(existing.id, { data: clean(data) }, ACTOR);
      if (existing.status !== status) os.records.setStatus(existing.id, status, ACTOR);
      id = existing.id;
    } else {
      id = os.records.create({ object: 'debt', data: clean(data), status }, ACTOR).id;
      os.links.link(id, rec.id, 'for', {}, ACTOR);
    }
    next[key] = id;
    if (status === 'open') open++;
  }
  // Debts whose share is gone from the pull.
  for (const [k, id] of Object.entries(mine)) if (!next[k] && os.records.get(id)) os.records.delete(id, ACTOR);
  os.settings.set(SETTING_DEBTS, next);
  return open;
}
