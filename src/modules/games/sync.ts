import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { AppearanceData, AvailabilityPeriod, GameData, PlayerProfileData, VenueData } from './types';

/**
 * Turf web → LifeOS (docs/MODEL.md layer 4, *Turf web*; R9c). Turf web holds
 * the one true copy; every synced row carries a change number (`rev`) and a
 * deleted row leaves a tombstone. A sync page is everything changed after the
 * last number LifeOS saw, so it is partial: a share can arrive without its
 * game, which is then found by its source key `turf:<table>:<id>`.
 * - players → a Person each (matched by phone, email or a unique name before
 *   one is made; only empty Person fields are filled) + a Player profile;
 *   regulars are members of the Football group, guests are not;
 * - venues → a Place each + a Venue;
 * - games → a Game each, game_players → Appearances, match_rsvps onto both;
 * - payments → one Event per entry on its Appearance; the Appearance's
 *   amount paid is their sum, with entries still *sending* from LifeOS; an
 *   entry carrying a LifeOS action id replaces its sending one;
 * - settings.ownerPlayerId is "which player is you";
 * - a tombstone archives the record here, never deletes it (a payment entry,
 *   being an event, is removed);
 * - an open share between you and someone → a Debt, recomputed after every page.
 * Nothing is imported as a Transaction: the bank SMS already files the money.
 */

export type TurfRow = Record<string, unknown>;

/** GET /api/sync?since=N (Turf web lib/sync.ts). */
export interface TurfSyncPage {
  since: number;
  rev: number;
  tables: Partial<Record<string, TurfRow[]>>;
  deleted: Array<{ table: string; key: string; rev: number }>;
}

export interface SyncResult {
  created: number;
  updated: number;
  archived: number;
  peopleMatched: number;
  peopleCreated: number;
  payments: number;
  debtsOpen: number;
  rev: number;
}

const ACTOR = 'system' as const;
const SETTING_GROUP = 'turf.groupId';
const SETTING_DEBTS = 'turf.debts';
const SETTING_PAYMENTS = 'turf.payments';
/** The Turf web player id that is you; comes from Turf web's settings. */
export const SETTING_ME = 'turf.mePlayerId';
/** The last change number applied. */
export const SETTING_REV = 'turf.rev';
export const SETTING_LAST = 'turf.lastSync';

export const turfKey = (table: string, id: string) => `turf:${table}:${id}`;

const clean = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '')) as T;
const str = (r: TurfRow, k: string) => (typeof r[k] === 'string' && (r[k] as string).trim() ? (r[k] as string).trim() : undefined);
const num = (r: TurfRow, k: string) => (r[k] === null || r[k] === undefined || r[k] === '' || Number.isNaN(Number(r[k])) ? undefined : Number(r[k]));
const bool = (r: TurfRow, k: string) => r[k] === true || r[k] === 1 || r[k] === '1';
const json = <T>(v: unknown): T | undefined => {
  if (typeof v !== 'string') return (v ?? undefined) as T | undefined;
  try {
    return JSON.parse(v) as T;
  } catch {
    return undefined;
  }
};
const digits = (p?: string | null) => (p ?? '').replace(/\D/g, '').slice(-10);
const terms = (v?: string): GameData['paymentTerms'] => (['tentative', 'prepaid', 'advance_paid', 'postpaid'].includes(String(v)) ? (v as GameData['paymentTerms']) : 'postpaid');
const avail = (v?: string): PlayerProfileData['availability'] => (v === 'INJ' || v === 'OOS' ? v : 'AVL');

function bySourceKey<T>(os: LifeOSContext, object: string): Map<string, ObjectRecord<T>> {
  const out = new Map<string, ObjectRecord<T>>();
  if (!os.registry.objects.has(object)) return out;
  for (const r of os.records.query<T & { sourceKey?: string }>(object, { includeArchived: true }, { limit: 100_000 })) {
    const k = (r.data as { sourceKey?: string }).sourceKey;
    if (k?.startsWith('turf:')) out.set(k, r as unknown as ObjectRecord<T>);
  }
  return out;
}

/** Same data as before? Then don't write (no change log noise, no events) on every sync. */
function same(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) return false;
  return true;
}

export function isSyncPage(v: unknown): v is TurfSyncPage {
  const p = v as TurfSyncPage;
  return !!p && typeof p.rev === 'number' && !!p.tables && typeof p.tables === 'object' && Array.isArray(p.deleted);
}

export function applyTurfSync(os: LifeOSContext, page: TurfSyncPage): SyncResult {
  if (!isSyncPage(page)) throw new Error('That isn’t a Turf web sync page');
  const res: SyncResult = { created: 0, updated: 0, archived: 0, peopleMatched: 0, peopleCreated: 0, payments: 0, debtsOpen: 0, rev: page.rev };
  const has = (o: string) => os.registry.objects.has(o);
  const rows = (table: string) => page.tables[table] ?? [];

  /**
   * Replace the record's fields with Turf web's (records.update merges, so a
   * field Turf web emptied is cleared explicitly), except `keep`, which other
   * tables fill; un-archive what comes back.
   */
  const upsert = <T extends object>(object: string, existing: ObjectRecord<T> | undefined, data: T, keep: Array<keyof T> = []): ObjectRecord<T> => {
    if (existing) {
      const old = existing.data as Record<string, unknown>;
      const next = { ...data } as Record<string, unknown>;
      for (const k of Object.keys(old)) if (!(k in next)) next[k] = (keep as string[]).includes(k) ? old[k] : undefined;
      if (same(old, next) && !existing.archived) return existing;
      res.updated++;
      const r = os.records.update<T>(existing.id, { data: next as T, archived: false }, ACTOR);
      existing.data = r.data;
      existing.archived = false;
      return r;
    }
    res.created++;
    return os.records.create<T>({ object, data }, ACTOR);
  };
  const archive = (r: ObjectRecord<unknown> | undefined) => {
    if (r && !r.archived) {
      os.records.update(r.id, { archived: true }, ACTOR);
      r.archived = true;
      res.archived++;
    }
  };

  os.db.transaction(() => {
    const profiles = bySourceKey<PlayerProfileData>(os, 'player');
    const venues = bySourceKey<VenueData>(os, 'venue');
    const games = bySourceKey<GameData>(os, 'game');
    const apps = bySourceKey<AppearanceData>(os, 'appearance');

    /* ---------- settings: which player is you ---------- */
    for (const r of rows('settings')) if (r.key === 'ownerPlayerId') os.settings.set(SETTING_ME, json<string | null>(r.value) ?? null);

    /* ---------- players → People + Player profiles ---------- */
    const people = has('person') ? os.records.query<{ phone?: string; email?: string; upi?: string }>('person', {}, { limit: 100_000 }) : [];
    const byPhone = new Map(people.filter((p) => digits(p.data.phone).length === 10).map((p) => [digits(p.data.phone), p]));
    const byEmail = new Map(people.filter((p) => p.data.email).map((p) => [p.data.email!.trim().toLowerCase(), p]));
    const nameCount = new Map<string, number>();
    for (const p of people) nameCount.set(p.title.trim().toLowerCase(), (nameCount.get(p.title.trim().toLowerCase()) ?? 0) + 1);
    const byName = new Map(people.filter((p) => nameCount.get(p.title.trim().toLowerCase()) === 1).map((p) => [p.title.trim().toLowerCase(), p]));

    const regulars: string[] = [];
    for (const tp of rows('players')) {
      const id = String(tp.id);
      const name = str(tp, 'name') ?? 'Player';
      const key = turfKey('players', id);
      const prev = profiles.get(key);
      let personId = prev?.data.personId && os.records.get(prev.data.personId) ? prev.data.personId : undefined;
      if (!personId && has('person')) {
        const email = str(tp, 'email')?.toLowerCase();
        const hit = byPhone.get(digits(str(tp, 'phone'))) ?? (email ? byEmail.get(email) : undefined) ?? byName.get(name.toLowerCase());
        if (hit) {
          personId = hit.id;
          res.peopleMatched++;
        } else {
          personId = os.records.create({ object: 'person', title: name, data: clean({ relationship: 'friend', phone: str(tp, 'phone'), email: str(tp, 'email'), upi: str(tp, 'payment_id') }) }, ACTOR).id;
          res.peopleCreated++;
        }
      }
      if (!personId) continue;
      // Fill only what the Person doesn't have yet: your edits in People win.
      const person = os.records.get<{ phone?: string; email?: string; upi?: string }>(personId);
      if (person) {
        const gaps = clean({ phone: person.data.phone ? undefined : str(tp, 'phone'), email: person.data.email ? undefined : str(tp, 'email'), upi: person.data.upi ? undefined : str(tp, 'payment_id') });
        if (Object.keys(gaps).length) os.records.update(personId, { data: { ...person.data, ...gaps } }, ACTOR);
      }
      if (tp.kind !== 'guest') regulars.push(personId);
      const comfortable = json<string[]>(tp.comfortable_positions);
      const weekly = str(tp, 'weekly_availability');
      const rec = upsert<PlayerProfileData>('player', prev, clean({
        personId,
        name,
        position: str(tp, 'position'),
        secondaryPosition: str(tp, 'secondary_position'),
        comfortable: Array.isArray(comfortable) && comfortable.length ? comfortable.join(', ') : undefined,
        preferredFoot: str(tp, 'preferred_foot'),
        speciality: str(tp, 'speciality'),
        playingStyle: str(tp, 'playing_style'),
        startingLevel: str(tp, 'starting_level'),
        ability: num(tp, 'initial_ability'),
        pace: num(tp, 'pace'),
        stamina: num(tp, 'stamina'),
        defending: num(tp, 'defending'),
        passing: num(tp, 'passing'),
        dribbling: num(tp, 'dribbling'),
        shooting: num(tp, 'shooting'),
        keeperWilling: tp.goalkeeper_willing === null || tp.goalkeeper_willing === undefined ? undefined : bool(tp, 'goalkeeper_willing'),
        keeperRating: num(tp, 'goalkeeper_rating'),
        jersey: str(tp, 'jersey_number'),
        kitColors: str(tp, 'kit_colors'),
        boots: str(tp, 'shoes'),
        favouritePlayer: str(tp, 'favourite_player'),
        clubs: str(tp, 'supported_clubs'),
        countries: str(tp, 'supported_countries'),
        availabilityMode: tp.availability_mode === 'window_only' ? 'window_only' : 'regular',
        weekly: weekly === 'weekdays' || weekly === 'weekends' ? weekly : 'all_week',
        availability: avail(str(tp, 'default_availability')),
        photoPath: str(tp, 'photo_key'),
        shareSlug: str(tp, 'public_slug'),
        notes: str(tp, 'notes'),
        sourceKey: key,
      }) as PlayerProfileData, ['periods']);
      profiles.set(key, rec);
    }

    /* ---------- the Football group (regulars; guests stay out) ---------- */
    if (has('group') && regulars.length) {
      let gid = os.settings.get<string | null>(SETTING_GROUP, null);
      let group = gid ? os.records.get<{ name: string; memberIds: string[] }>(gid) : undefined;
      if (!group) group = os.records.query<{ name: string; memberIds: string[] }>('group', {}, { limit: 1000 }).find((g) => g.data.name.trim().toLowerCase() === 'football');
      if (!group) group = os.records.create({ object: 'group', data: { name: 'Football', kind: 'friends', memberIds: [] } }, ACTOR);
      gid = group.id;
      os.settings.set(SETTING_GROUP, gid);
      const members = [...new Set([...(group.data.memberIds ?? []), ...regulars])];
      if (members.length !== (group.data.memberIds ?? []).length) os.records.update(gid, { data: { ...group.data, memberIds: members } }, ACTOR);
    }

    const personOf = (pid: unknown) => (pid ? profiles.get(turfKey('players', String(pid)))?.data.personId : undefined);

    /* ---------- availability periods onto their profiles ---------- */
    const setPeriods = (profile: ObjectRecord<PlayerProfileData>, periods: AvailabilityPeriod[]) => {
      const next = { ...profile.data, periods: periods.length ? periods : undefined };
      if (same(profile.data as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>)) return;
      res.updated++;
      profile.data = os.records.update<PlayerProfileData>(profile.id, { data: next }, ACTOR).data;
    };
    for (const r of rows('player_availability_periods')) {
      const profile = profiles.get(turfKey('players', String(r.player_id)));
      if (!profile) continue;
      const period: AvailabilityPeriod = { id: String(r.id), status: avail(str(r, 'status')), startsAt: str(r, 'starts_at') ?? '', endsAt: str(r, 'ends_at') ?? null, note: str(r, 'note') ?? null };
      setPeriods(profile, [...(profile.data.periods ?? []).filter((p) => p.id !== period.id), period].sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
    }

    /* ---------- venues → Places + Venues ---------- */
    for (const tv of rows('venues')) {
      const key = turfKey('venues', String(tv.id));
      const name = str(tv, 'name') ?? 'Venue';
      const prev = venues.get(key);
      let placeId = prev?.data.placeId && os.records.get(prev.data.placeId) ? prev.data.placeId : undefined;
      if (!placeId && has('place')) {
        const named = os.records.query<{ kind: string }>('place', {}, { limit: 100_000 }).find((p) => p.title.trim().toLowerCase() === name.toLowerCase());
        placeId = named?.id ?? os.records.create({ object: 'place', title: name, data: clean({ kind: 'venue', notes: str(tv, 'maps_link') }) }, ACTOR).id;
      }
      venues.set(key, upsert<VenueData>('venue', prev, clean({
        placeId,
        name,
        defaultTime: str(tv, 'default_time'),
        sideSize: num(tv, 'side_size'),
        defaultCost: num(tv, 'default_cost'),
        paymentTerms: terms(str(tv, 'payment_terms')),
        advance: num(tv, 'advance_amount'),
        mapsLink: str(tv, 'maps_link'),
        photoPath: str(tv, 'photo_key'),
        notes: str(tv, 'notes'),
        sourceKey: key,
      }) as VenueData));
    }
    const venueByName = (name: string) => [...venues.values()].find((v) => !v.archived && v.data.name.trim().toLowerCase() === name.trim().toLowerCase())?.id;

    /* ---------- games ---------- */
    const touchedGames = new Set<string>();
    for (const tg of rows('games')) {
      const key = turfKey('games', String(tg.id));
      const venueName = str(tg, 'venue') ?? '';
      const quality = str(tg, 'goal_data_quality');
      games.set(key, upsert<GameData>('game', games.get(key), clean({
        date: (str(tg, 'date') ?? '').slice(0, 10),
        time: str(tg, 'time'),
        venueId: (tg.venue_id ? venues.get(turfKey('venues', String(tg.venue_id)))?.id : undefined) ?? venueByName(venueName),
        venueName,
        sideSize: num(tg, 'side_size'),
        totalCost: num(tg, 'total_amount') ?? 0,
        expectedPlayers: num(tg, 'expected_players') ?? 0,
        paymentTerms: terms(str(tg, 'payment_terms')),
        advance: num(tg, 'advance_amount'),
        frontedById: personOf(tg.fronted_by_player_id),
        scoreA: num(tg, 'team_a_score'),
        scoreB: num(tg, 'team_b_score'),
        scoreLocked: bool(tg, 'score_locked') || undefined,
        formationA: str(tg, 'formation_a'),
        formationB: str(tg, 'formation_b'),
        colorA: str(tg, 'team_a_color'),
        colorB: str(tg, 'team_b_color'),
        captainAId: personOf(tg.captain_a_player_id),
        captainBId: personOf(tg.captain_b_player_id),
        motmId: personOf(tg.motm_player_id),
        goalData: (['complete', 'partial', 'inconsistent', 'missing'].includes(String(quality)) ? quality : 'missing') as GameData['goalData'],
        shareSlug: str(tg, 'public_slug'),
        sourceKey: key,
      }) as GameData, ['rsvps']));
      touchedGames.add(key);
    }

    /* ---------- RSVPs onto their games ---------- */
    const setRsvp = (gameKey: string, playerId: string, status: string | null) => {
      const g = games.get(gameKey);
      if (!g) return;
      const rsvps = { ...(g.data.rsvps ?? {}) };
      if (status) rsvps[playerId] = status;
      else delete rsvps[playerId];
      const next: GameData = { ...g.data, rsvps: Object.keys(rsvps).length ? rsvps : undefined };
      if (same(g.data as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>)) return;
      res.updated++;
      g.data = os.records.update<GameData>(g.id, { data: next }, ACTOR).data;
      touchedGames.add(gameKey);
    };
    for (const r of rows('match_rsvps')) setRsvp(turfKey('games', String(r.game_id)), String(r.player_id), str(r, 'status') ?? null);

    /* ---------- game_players → Appearances ---------- */
    const appearanceData = (gameKey: string, playerId: string, tp: TurfRow | null, prev?: ObjectRecord<AppearanceData>): AppearanceData | null => {
      const g = games.get(gameKey);
      const pid = personOf(playerId);
      if (!g || !pid) return null;
      const base = prev?.data;
      const at = tp ? str(tp, 'attendance_status') : base?.attendance;
      const team = tp ? str(tp, 'team') : base?.team;
      const paid = tp ? bool(tp, 'paid') : !!base?.paid;
      return clean({
        gameId: g.id,
        personId: pid,
        gameDate: g.data.date,
        share: tp ? num(tp, 'share_amount') ?? 0 : base?.share ?? 0,
        amountPaid: base?.amountPaid,
        paid,
        paidOn: paid ? (tp ? str(tp, 'paid_at')?.slice(0, 10) : base?.paidOn) : undefined,
        rsvp: g.data.rsvps?.[playerId],
        attendance: at === 'late' || at === 'no_show' ? at : 'confirmed',
        team: team === 'A' || team === 'B' ? team : undefined,
        position: tp ? str(tp, 'field_position') : base?.position,
        goals: tp ? num(tp, 'goals') ?? 0 : base?.goals ?? 0,
        ownGoals: tp ? num(tp, 'own_goals') || undefined : base?.ownGoals,
        ratingOverride: tp ? num(tp, 'rating_override') : base?.ratingOverride,
        assists: tp ? num(tp, 'assists') ?? 0 : base?.assists ?? 0,
        saves: tp ? num(tp, 'saves') ?? 0 : base?.saves ?? 0,
        inGoal: tp ? bool(tp, 'played_goalkeeper') : !!base?.inGoal,
        sourceKey: turfKey('game_players', `${gameKey.slice('turf:games:'.length)}:${playerId}`),
      } as unknown as Record<string, unknown>) as unknown as AppearanceData;
    };
    for (const tp of rows('game_players')) {
      const gameKey = turfKey('games', String(tp.game_id));
      const key = turfKey('game_players', `${tp.game_id}:${tp.player_id}`);
      const data = appearanceData(gameKey, String(tp.player_id), tp, apps.get(key));
      if (data) apps.set(key, upsert<AppearanceData>('appearance', apps.get(key), data));
    }
    // A game whose date or RSVPs changed: its appearances follow.
    for (const gameKey of touchedGames) {
      const gid = gameKey.slice('turf:games:'.length);
      for (const [key, a] of apps) {
        if (a.archived || !key.startsWith(`turf:game_players:${gid}:`)) continue;
        const data = appearanceData(gameKey, key.slice(`turf:game_players:${gid}:`.length), null, a);
        if (data) upsert<AppearanceData>('appearance', a, data);
      }
    }

    /* ---------- payments → entries on the Appearance ---------- */
    const entries = os.settings.get<Record<string, { eventId: string; appearanceId: string }>>(SETTING_PAYMENTS, {});
    const touchedApps = new Set<string>();
    const dropEntry = (id: string) => {
      const e = entries[id];
      if (!e) return;
      os.records.timeline.remove(e.eventId);
      touchedApps.add(e.appearanceId);
      delete entries[id];
    };
    for (const r of rows('payments')) {
      const id = String(r.id);
      const a = apps.get(turfKey('game_players', `${r.game_id}:${r.player_id}`));
      dropEntry(id);
      if (!a) continue;
      // Made in LifeOS: the entry Turf web confirmed takes the place of the sending one.
      if (r.action_id) dropPending(os, a.id, String(r.action_id));
      const kind = str(r, 'kind') ?? 'payment';
      const cents = num(r, 'amount_cents') ?? 0;
      const amount = (kind === 'refund' ? -Math.abs(cents) : cents) / 100;
      const via = str(r, 'via');
      const ev = os.records.timeline.add({
        entityId: a.id,
        kind: 'payment',
        title: `${kind === 'refund' ? 'Refunded' : kind === 'correction' ? 'Corrected by' : kind === 'opening' ? 'Paid (from Turf Ledger)' : 'Paid'} ${os.format.currency(Math.abs(amount))}`,
        body: str(r, 'note') ?? null,
        actor: ACTOR,
        meta: clean({ sourceKey: turfKey('payments', id), amount, entry: kind, via, recordedBy: str(r, 'recorded_by'), device: str(r, 'device') }),
        occurredAt: Date.parse(str(r, 'created_at') ?? '') || Date.now(),
      });
      entries[id] = { eventId: ev.id, appearanceId: a.id };
      touchedApps.add(a.id);
      res.payments++;
    }

    /* ---------- tombstones: archived here, never deleted ---------- */
    for (const d of page.deleted) {
      if (d.table === 'players') archive(profiles.get(turfKey('players', d.key)) as ObjectRecord<unknown> | undefined);
      else if (d.table === 'venues') archive(venues.get(turfKey('venues', d.key)) as ObjectRecord<unknown> | undefined);
      else if (d.table === 'games') archive(games.get(turfKey('games', d.key)) as ObjectRecord<unknown> | undefined);
      else if (d.table === 'game_players') archive(apps.get(turfKey('game_players', d.key)) as ObjectRecord<unknown> | undefined);
      else if (d.table === 'payments') dropEntry(d.key);
      else if (d.table === 'match_rsvps') {
        const [gid, pid] = d.key.split(':');
        setRsvp(turfKey('games', gid!), pid!, null);
        const a = apps.get(turfKey('game_players', d.key));
        if (a && !a.archived) upsert<AppearanceData>('appearance', a, appearanceData(turfKey('games', gid!), pid!, null, a)!);
      } else if (d.table === 'player_availability_periods') {
        for (const p of profiles.values()) if (p.data.periods?.some((x) => x.id === d.key)) setPeriods(p, p.data.periods.filter((x) => x.id !== d.key));
      } else if (d.table === 'settings' && d.key === 'ownerPlayerId') os.settings.set(SETTING_ME, null);
    }
    os.settings.set(SETTING_PAYMENTS, entries);

    /* ---------- amount paid = the sum of the entries ---------- */
    for (const id of touchedApps) recountPaid(os, id);

    /* ---------- Debts between you and someone ---------- */
    res.debtsOpen = syncDebts(os, profiles);
    os.settings.set(SETTING_REV, page.rev);
  });
  os.settings.set(SETTING_LAST, { at: Date.now(), ...res });
  return res;
}

/** A payment entry on an Appearance's timeline: confirmed by Turf web, or still sending from LifeOS. */
const isEntry = (e: { kind: string; meta: Record<string, unknown> }) => e.kind === 'payment' && (String(e.meta.sourceKey ?? '').startsWith('turf:payments:') || e.meta.pending === true);

/** Remove the sending entry a change made (confirmed or refused). */
export function dropPending(os: LifeOSContext, appearanceId: string, actionId: string): boolean {
  const hit = os.records.timeline.forEntity(appearanceId, 1000).filter((e) => e.kind === 'payment' && e.meta.pending === true && e.meta.actionId === actionId);
  for (const e of hit) os.records.timeline.remove(e.id);
  return hit.length > 0;
}

/** Amount paid = the sum of the entries, sending ones included. */
export function recountPaid(os: LifeOSContext, appearanceId: string) {
  const a = os.records.get<AppearanceData>(appearanceId);
  if (!a) return;
  const sum = os.records.timeline.forEntity(appearanceId, 1000).filter(isEntry).reduce((s, e) => s + Number(e.meta.amount ?? 0), 0);
  const amountPaid = Math.round(sum * 100) / 100;
  if (a.data.amountPaid !== amountPaid) os.records.update<AppearanceData>(appearanceId, { data: { ...a.data, amountPaid } }, ACTOR);
}

/** Debts again, after a change made here (a payment recorded or refused). */
export function refreshTurfDebts(os: LifeOSContext): number {
  return syncDebts(os, bySourceKey<PlayerProfileData>(os, 'player'));
}

/** What is still owed on a share: nothing once ticked paid (whoever fronted counts as paid). */
export const owedOn = (a: AppearanceData) => (a.paid ? 0 : Math.max(0, (a.share || 0) - (a.amountPaid ?? 0)));

/**
 * An open share between you and someone is a Debt: they owe you when you
 * fronted the cost, you owe them when they did; nothing when neither is you
 * or "which player is you" isn't set. Its amount is what is still owed and it
 * is settled at zero; removed when it no longer applies (you changed who you
 * are, the share or the game went away). Recomputed from the records, since
 * a sync page holds only what changed.
 */
function syncDebts(os: LifeOSContext, profiles: Map<string, ObjectRecord<PlayerProfileData>>): number {
  if (!os.registry.objects.has('debt')) return 0;
  const meTurf = os.settings.get<string | null>(SETTING_ME, null);
  const me = meTurf ? profiles.get(turfKey('players', meTurf))?.data.personId ?? null : null;
  const mine = os.settings.get<Record<string, string>>(SETTING_DEBTS, {});
  const next: Record<string, string> = {};
  const games = new Map(os.records.query<GameData>('game', {}, { limit: 100_000 }).map((g) => [g.id, g]));
  let open = 0;
  for (const a of os.records.query<AppearanceData>('appearance', {}, { limit: 100_000 })) {
    const key = a.data.sourceKey;
    const g = games.get(a.data.gameId);
    if (!key?.startsWith('turf:') || !g || !me || !(a.data.share > 0)) continue;
    const fronted = g.data.frontedById ?? null;
    let want: { personId: string; direction: 'they_owe' | 'i_owe' } | null = null;
    if (fronted === me && a.data.personId !== me) want = { personId: a.data.personId, direction: 'they_owe' };
    else if (fronted && fronted !== me && a.data.personId === me) want = { personId: fronted, direction: 'i_owe' };
    if (!want) continue;
    const owed = owedOn(a.data);
    const status = owed > 0 ? 'open' : 'settled';
    const data = clean({ personId: want.personId, direction: want.direction, amount: status === 'open' ? owed : a.data.share, reason: `Turf · ${g.data.venueName} · ${g.data.date}`, date: g.data.date, kind: 'split' as const, groupId: os.settings.get<string | null>(SETTING_GROUP, null) ?? undefined });
    const existing = mine[key] ? os.records.get<Record<string, unknown>>(mine[key]) : undefined;
    let id: string;
    if (existing) {
      if (!same(existing.data, data)) os.records.update(existing.id, { data }, ACTOR);
      if (existing.status !== status) os.records.setStatus(existing.id, status, ACTOR);
      id = existing.id;
    } else {
      id = os.records.create({ object: 'debt', data, status }, ACTOR).id;
      os.links.link(id, a.id, 'for', {}, ACTOR);
    }
    next[key] = id;
    if (status === 'open') open++;
  }
  for (const [k, id] of Object.entries(mine)) if (!next[k] && os.records.get(id)) os.records.delete(id, ACTOR);
  os.settings.set(SETTING_DEBTS, next);
  return open;
}
