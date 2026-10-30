import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { AppearanceData, GameData, PlayerProfileData, VenueData } from './types';
import { computeDues, type Dues, type ShareRow } from './dues';
import { summaryText, summaryShortText, pendingText, allDuesText, allDuesShortText, reminderText, matchDetailsText, resultText, rsvpText, leaderboardText, type SummaryGame, type SummaryShare, type MatchTextGame } from './messages';
import { SETTING_ME } from './sync';

/**
 * Money and the WhatsApp texts from the records here, through Turf web's own
 * rules (dues.ts and messages.ts, copied): who owes whom (computeDues), and
 * every text Copy and Share send, so a message reads the same from either phone.
 * Players are keyed by Person; "you" is the Person behind Turf web's
 * ownerPlayerId.
 */

const live = <T>(rs: ObjectRecord<T>[]) => rs.filter((r) => !r.archived);
const cents = (rupees: number | undefined) => Math.round((rupees ?? 0) * 100);

export const SETTING_UPI = 'turf.ownerUpi';
export const SETTING_SQUAD = 'turf.squadName';

function names(os: LifeOSContext) {
  const profiles = live(os.records.query<PlayerProfileData>('player', {}, { limit: 100_000 }));
  const byPerson = new Map(profiles.map((p) => [p.data.personId, p.data.name]));
  return (personId: string | undefined | null) => (personId ? byPerson.get(personId) ?? os.records.get(personId)?.title ?? 'Someone' : null);
}

/** You, as a Person id (from "which player is you"). */
export function youPersonId(os: LifeOSContext): string | null {
  const me = os.settings.get<string | null>(SETTING_ME, null);
  if (!me) return null;
  return live(os.records.query<PlayerProfileData>('player', {}, { limit: 100_000 })).find((p) => p.data.sourceKey === `turf:players:${me}`)?.data.personId ?? null;
}

/** Every share with what's been paid, in Turf web's ShareRow shape. */
export function shareRows(os: LifeOSContext): ShareRow[] {
  const nameOf = names(os);
  const games = new Map(live(os.records.query<GameData>('game', {}, { limit: 100_000 })).map((g) => [g.id, g]));
  const out: ShareRow[] = [];
  for (const a of live(os.records.query<AppearanceData>('appearance', {}, { limit: 100_000 }))) {
    const g = games.get(a.data.gameId);
    if (!g) continue;
    out.push({
      gameId: g.id,
      playerId: a.data.personId,
      playerName: nameOf(a.data.personId) ?? 'Someone',
      date: g.data.date,
      time: g.data.time ?? null,
      venue: g.data.venueName,
      paymentTerms: g.data.paymentTerms,
      frontedBy: g.data.frontedById ?? null,
      frontedByName: nameOf(g.data.frontedById),
      shareCents: cents(a.data.share),
      paidCents: a.data.paid && !(a.data.amountPaid ?? 0) ? cents(a.data.share) : cents(a.data.amountPaid),
      lastPaidAt: a.data.paidOn ?? null,
    });
  }
  return out;
}

/** Who owes whom, as Turf web's Dues screen shows it. */
export function turfDues(os: LifeOSContext, now = new Date()): Dues {
  return computeDues(shareRows(os), youPersonId(os), now);
}

/** The Dues texts: everyone (long and short), or one person's reminder. */
export function duesTexts(os: LifeOSContext) {
  const d = turfDues(os);
  const squad = os.settings.get<string>(SETTING_SQUAD, 'Football');
  const upi = os.settings.get<string | null>(SETTING_UPI, null);
  return {
    all: allDuesText(d.people, squad, upi, d.credits),
    short: allDuesShortText(d.people, squad, upi, d.credits),
    reminder: (personId: string) => {
      const p = d.people.find((x) => x.playerId === personId);
      return p ? reminderText(p, upi) : null;
    },
  };
}

function matchParts(os: LifeOSContext, gameId: string) {
  const g = os.records.get<GameData>(gameId);
  if (!g) return null;
  const nameOf = names(os);
  const venue = g.data.venueId ? os.records.get<VenueData>(g.data.venueId) : undefined;
  const apps = live(os.records.query<AppearanceData>('appearance', { filter: { and: [{ field: 'data.gameId', op: 'eq', value: gameId }] } }, { limit: 500 }));
  const game: SummaryGame = { venue: g.data.venueName, date: g.data.date, time: g.data.time ?? null, sideSize: g.data.sideSize ?? null, paymentTerms: g.data.paymentTerms, totalCents: cents(g.data.totalCost), mapsLink: venue?.data.mapsLink ?? null };
  const shares: SummaryShare[] = apps.map((a) => ({ name: nameOf(a.data.personId) ?? 'Someone', shareCents: cents(a.data.share), paidCents: a.data.paid && !(a.data.amountPaid ?? 0) ? cents(a.data.share) : cents(a.data.amountPaid), fronted: a.data.personId === g.data.frontedById }));
  const match: MatchTextGame = {
    venue: g.data.venueName,
    date: g.data.date,
    time: g.data.time ?? null,
    sideSize: g.data.sideSize ?? null,
    expectedPlayers: g.data.expectedPlayers,
    totalAmount: g.data.totalCost,
    mapsLink: venue?.data.mapsLink ?? null,
    teamAColor: g.data.colorA ?? null,
    teamBColor: g.data.colorB ?? null,
    teamAScore: g.data.scoreA ?? null,
    teamBScore: g.data.scoreB ?? null,
    motmPlayerId: g.data.motmId ?? null,
    formationA: g.data.formationA ?? null,
    formationB: g.data.formationB ?? null,
    captainAPlayerId: g.data.captainAId ?? null,
    captainBPlayerId: g.data.captainBId ?? null,
    participants: apps.map((a) => ({ playerId: a.data.personId, playerName: nameOf(a.data.personId) ?? '', team: a.data.team ?? null, fieldPosition: a.data.position ?? null, goals: a.data.goals ?? 0, assists: a.data.assists ?? 0, saves: a.data.saves ?? 0, ownGoals: a.data.ownGoals ?? 0, attendanceStatus: a.data.attendance })),
  };
  return { g, game, shares, match };
}

/** A match's texts: payment status (long, short), who's still to pay, details, result, RSVP. */
export function matchTexts(os: LifeOSContext, gameId: string, link = '') {
  const p = matchParts(os, gameId);
  if (!p) return null;
  const upi = os.settings.get<string | null>(SETTING_UPI, null);
  return {
    summary: summaryText(p.game, p.shares, upi),
    summaryShort: summaryShortText(p.game, p.shares, upi),
    pending: pendingText(p.game, p.shares, upi),
    details: matchDetailsText(p.match),
    result: resultText(p.match, link || undefined),
    rsvp: link ? rsvpText(p.match, link) : null,
  };
}

export { leaderboardText };
