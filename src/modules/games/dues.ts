/**
 * Dues, copied from Turf web v0.0.61 (`lib/dues.ts`, the pure part; its
 * database read is replaced by `games/money.ts`), so both phones work out who
 * owes whom the same way. Keep in step when Turf web changes it. Its original
 * comment follows.
 */
// Who owes whom, worked out the same way for both phones and the dues screen.
//
// A share's balance is its amount less the payments against it (part payments
// leave a balance; more than the share is a credit). Who the money is owed to
// follows who fronted the cost:
//   - you fronted, or nobody did (you collect)  → the player owes you;
//   - someone else fronted                      → you owe them for your share,
//                                                 and others owe them for theirs.
// The fronter's own share is never owed. A game's dues only count once it is
// financially live (as in Turf Ledger): never while tentative, at once when
// prepaid, otherwise from kick-off.


export type ShareRow = {
  gameId: string;
  playerId: string;
  playerName: string;
  date: string;
  time: string | null;
  venue: string;
  paymentTerms: string;
  frontedBy: string | null;
  frontedByName: string | null;
  shareCents: number;
  paidCents: number;
  creditInCents?: number;    // the part of paidCents that is credit moved in from an earlier match
  lastPaidAt: string | null;
};

export type Direction = "owes_you" | "you_owe" | "owes_other";

export type DueGame = { gameId: string; date: string; venue: string; shareCents: number; paidCents: number; balanceCents: number; creditCents?: number };

export type DuePerson = {
  playerId: string;          // the debtor, or for "you_owe" the person you owe
  name: string;
  direction: Direction;
  creditorId: string | null; // who is owed, when it isn't you
  creditorName: string | null;
  totalCents: number;
  since: string;             // oldest open game
  games: DueGame[];
};

export type Dues = {
  owedToYou: { totalCents: number; people: number; oldest: string | null };
  youOwe: { totalCents: number; people: number; oldest: string | null };
  people: DuePerson[];
  credits: Array<{ playerId: string; name: string; creditCents: number }>;
  settled: Array<{ playerId: string; name: string; lastPaidAt: string }>;
};

/** Has the match started, in the squad's timezone (e.g. "+05:30")? */
export function hasKickedOff(date: string, time: string | null, now: Date, timezone = "+05:30"): boolean {
  const stamp = Date.parse(`${date}T${time && /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : "23:59"}:00${timezone}`);
  return Number.isFinite(stamp) && now.getTime() >= stamp;
}

export function duesCount(row: Pick<ShareRow, "paymentTerms" | "date" | "time">, now: Date, timezone?: string): boolean {
  if (row.paymentTerms === "tentative") return false;
  if (row.paymentTerms === "prepaid") return true;
  return hasKickedOff(row.date, row.time, now, timezone);
}

export function computeDues(shares: ShareRow[], ownerPlayerId: string | null, now = new Date(), timezone?: string, settledWithinDays = 30): Dues {
  const people = new Map<string, DuePerson>();
  const credit = new Map<string, { name: string; cents: number }>();
  const open = new Set<string>();
  const lastPaid = new Map<string, { name: string; at: string }>();

  for (const s of shares) {
    if (s.lastPaidAt && (!lastPaid.get(s.playerId) || lastPaid.get(s.playerId)!.at < s.lastPaidAt)) lastPaid.set(s.playerId, { name: s.playerName, at: s.lastPaidAt });
    if (s.frontedBy === s.playerId) continue;
    if (!duesCount(s, now, timezone)) continue;
    const balance = s.shareCents - s.paidCents;
    if (balance < 0) {
      const c = credit.get(s.playerId) || { name: s.playerName, cents: 0 };
      c.cents += -balance;
      credit.set(s.playerId, c);
      continue;
    }
    if (balance === 0) continue;
    const youCollect = !s.frontedBy || s.frontedBy === ownerPlayerId;
    let direction: Direction;
    let key: string;
    let personId: string;
    let name: string;
    if (youCollect) {
      if (s.playerId === ownerPlayerId) continue; // you don't owe yourself
      direction = "owes_you"; personId = s.playerId; name = s.playerName; key = `you:${s.playerId}`;
    } else if (s.playerId === ownerPlayerId) {
      direction = "you_owe"; personId = s.frontedBy!; name = s.frontedByName || "Them"; key = `owe:${s.frontedBy}`;
    } else {
      direction = "owes_other"; personId = s.playerId; name = s.playerName; key = `other:${s.playerId}:${s.frontedBy}`;
    }
    open.add(s.playerId);
    const person = people.get(key) || {
      playerId: personId, name, direction,
      creditorId: direction === "owes_you" ? null : s.frontedBy,
      creditorName: direction === "owes_you" ? null : s.frontedByName,
      totalCents: 0, since: s.date, games: [],
    };
    person.totalCents += balance;
    if (s.date < person.since) person.since = s.date;
    person.games.push({ gameId: s.gameId, date: s.date, venue: s.venue, shareCents: s.shareCents, paidCents: s.paidCents, balanceCents: balance, creditCents: s.creditInCents || 0 });
    people.set(key, person);
  }

  const list = [...people.values()].map((p) => ({ ...p, games: p.games.sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => b.totalCents - a.totalCents || a.since.localeCompare(b.since) || a.name.localeCompare(b.name));
  const tally = (direction: Direction) => {
    const group = list.filter((p) => p.direction === direction);
    return {
      totalCents: group.reduce((sum, p) => sum + p.totalCents, 0),
      people: group.length,
      oldest: group.reduce<string | null>((oldest, p) => (!oldest || p.since < oldest ? p.since : oldest), null),
    };
  };
  const cutoff = new Date(now.getTime() - settledWithinDays * 86_400_000).toISOString();
  return {
    owedToYou: tally("owes_you"),
    youOwe: tally("you_owe"),
    people: list,
    credits: [...credit.entries()].map(([playerId, c]) => ({ playerId, name: c.name, creditCents: c.cents })),
    settled: [...lastPaid.entries()]
      .filter(([playerId, p]) => !open.has(playerId) && p.at >= cutoff)
      .map(([playerId, p]) => ({ playerId, name: p.name, lastPaidAt: p.at }))
      .sort((a, b) => b.lastPaidAt.localeCompare(a.lastPaidAt)),
  };
}

/** What a player has put in for their own shares (the fronter's own share counts as paid); tentative matches don't count. */
export function moneyOf(shares: ShareRow[], playerId: string): { spentCents: number } {
  let spentCents = 0;
  for (const s of shares) {
    if (s.playerId !== playerId || s.paymentTerms === "tentative") continue;
    spentCents += s.frontedBy === playerId ? s.shareCents : Math.max(0, Math.min(s.shareCents, s.paidCents));
  }
  return { spentCents };
}
