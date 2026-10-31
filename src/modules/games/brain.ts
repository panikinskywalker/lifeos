import type { BrainDef, Candidate, Nudge } from '@core/brain/contract';
import type { LifeOSContext } from '@core/registry/context';
import type { GameData } from './types';
import { allAppearances, allGames } from './lib';
import { duesTexts, turfDues } from './money';
import { hasKickedOff } from './dues';

/**
 * What Turf brings the brain (docs/MODEL.md layer 8): *coming up* (a match in
 * the next three days short of players) and *due* (a share owed to you for
 * more than three days). Yes opens the match, or WhatsApp with the reminder
 * Turf already writes: the last step is yours, and money is never moved.
 */

const DAY = 86_400_000;
const iso = (at: number) => new Date(at - new Date(at).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const daysTo = (date: string, now: number) => Math.round((Date.parse(`${date}T00:00:00`) - Date.parse(`${iso(now)}T00:00:00`)) / DAY);
const digits = (phone: unknown) => (typeof phone === 'string' ? phone : '').replace(/\D/g, '');
const when = (d: number) => (d === 0 ? 'Tonight' : d === 1 ? 'Tomorrow' : `In ${d} days`);

function shortMatches(os: LifeOSContext, now: number): Candidate[] {
  const today = iso(now);
  const apps = allAppearances(os);
  const out: Candidate[] = [];
  for (const g of allGames(os)) {
    const d: GameData = g.data;
    if (d.date < today || hasKickedOff(d.date, d.time ?? null, new Date(now))) continue;
    const days = daysTo(d.date, now);
    if (days > 3) continue;
    const rsvpIn = Object.values(d.rsvps ?? {}).filter((s) => s === 'in').length;
    const players = rsvpIn || apps.filter((a) => a.data.gameId === g.id).length;
    const expected = d.expectedPlayers || (d.sideSize ? d.sideSize * 2 : 0);
    if (!expected || players >= expected) continue;
    const soon = days <= 1;
    out.push({
      key: `games:short:${g.id}:${soon ? 'soon' : 'ahead'}`,
      kind: 'coming up',
      shape: 'ask',
      subjectId: g.id,
      route: `/board/turf/game?game=${g.id}`,
      title: d.venueName,
      line: `${when(days)} at ${d.venueName}: ${players} in of ${expected}, ${expected - players} short`,
      record: { venue: d.venueName, date: d.date, kick_off: d.time ?? null, in: players, expected, short_by: expected - players },
      urgent: soon,
      rank: days,
      yes: 'Open match',
      payload: { gameId: g.id, what: 'short' },
    });
  }
  return out;
}

function dues(os: LifeOSContext, now: number): Candidate[] {
  return turfDues(os, new Date(now))
    .people.filter((p) => p.direction === 'owes_you' && p.totalCents > 0 && daysTo(p.since, now) <= -3)
    .map((p) => {
      const rupees = Math.round(p.totalCents / 100);
      return {
        key: `games:dues:${p.playerId}:${p.totalCents}:${p.since}`,
        kind: 'due',
        shape: 'ask',
        subjectId: p.playerId,
        route: '/board/turf/dues',
        title: p.name,
        line: `${p.name.split(/\s+/)[0]} owes ${os.format.currency(rupees)} for ${p.games.length} game${p.games.length === 1 ? '' : 's'} since ${p.since}`,
        record: { name: p.name, owes_rupees: rupees, games: p.games.length, since: p.since },
        rank: 10 - Math.min(9, Math.floor(rupees / 100)),
        yes: 'Remind',
        payload: { personId: p.playerId, what: 'dues' },
      } satisfies Candidate;
    });
}

export const gamesBrain: BrainDef = {
  candidates: (os, now) => [...shortMatches(os, now), ...dues(os, now)],
  act(os, verb, nudge: Nudge) {
    if (verb !== 'yes') return null;
    const p = (nudge.payload ?? {}) as { gameId?: string; personId?: string; what?: string };
    if (p.what === 'short' && p.gameId) return { open: `/board/turf/game?game=${p.gameId}` };
    if (p.what === 'dues' && p.personId) {
      const text = duesTexts(os).reminder(p.personId);
      const n = digits(os.records.get(p.personId)?.data.phone);
      if (text && n) return { open: `https://wa.me/${n}?text=${encodeURIComponent(text)}` };
      return { open: '/board/turf/dues' };
    }
    return null;
  },
  skills: [{ name: 'Turf', body: 'A match short of players tomorrow or tonight is urgent; further out it is a heads-up. Dues are said plainly with the amount, never as a scold; the reminder text is Turf’s own.' }],
};
