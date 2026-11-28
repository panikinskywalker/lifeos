import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { owedOf } from '@core/money/split';
import { balances, type DebtData } from '@modules/finance/split';
import { billsOf, type BillData } from '@modules/finance/bills';
import { swConfig, tripRatesOf as tripRates } from '@modules/finance/splitwise';

/**
 * What Udhari's home shows (NR-Udhari-Home): everyone's net with you, from
 * LifeOS's own shares (Debts) and Bills, so it works signed out of Splitwise
 * too; each group's net for you; and what moved lately.
 */

export interface PersonRow {
  /** A Person's id, or `sw:<friend id>` for a Splitwise friend not linked to anyone. */
  personId: string;
  name: string;
  /** + they owe you, − you owe them. */
  amount: number;
  /** What it is for: the shares' and Bills' names, newest first. */
  tags: string[];
  /** Days since their oldest open share, when it is a while (14 days or more). */
  oldestDays: number | null;
  linked: boolean;
  open: Array<ObjectRecord<DebtData>>;
  /** What Splitwise says (+ to you), when you are signed in and they are a Splitwise friend. */
  swAmount: number | null;
  /** Their Splitwise friend, linked or not. */
  friendId: number | null;
  /** Only on Splitwise: no one in People is linked to them yet. */
  swOnly: boolean;
  /** Splitwise's balance in other currencies, as Splitwise keeps them (JPY 10,653); counted in swAmount at a trip's rate when one is known. */
  swOther: Record<string, number>;
}

/** A friend's Splitwise balance in rupees: rupees, and other currencies at a trip's rate. */
function swRupees(f: { balance?: number; other?: Record<string, number> }, rates: Record<string, number>): number {
  return Math.round(((f.balance ?? 0) + Object.entries(f.other ?? {}).reduce((n, [cur, v]) => n + (rates[cur] ? v * rates[cur]! : 0), 0)) * 100) / 100;
}

/** What Splitwise says over all your friends, in rupees, and what is left in currencies with no rate. */
export function swTotals(os: LifeOSContext): { to: number; owe: number; unrated: Record<string, number> } {
  const c = swConfig(os);
  const rates = tripRates(os);
  const unrated: Record<string, number> = {};
  let to = 0;
  let owe = 0;
  for (const f of c.friends) {
    const n = swRupees(f, rates);
    if (n > 0) to += n;
    else owe -= n;
    for (const [cur, v] of Object.entries(f.other ?? {})) if (!rates[cur]) unrated[cur] = (unrated[cur] ?? 0) + v;
  }
  return { to, owe, unrated };
}

const DAY = 86_400_000;
const daysSince = (date: string, now: number) => Math.floor((now - Date.parse(`${date}T00:00:00`)) / DAY);
/** "Turf at Wings", "Turf · Joggers 7", "Visa fee (Parth)" → "Turf", "Turf", "Visa fee": the place and the person go, the thing stays. */
const tagOf = (s: string) => s.replace(/( at | · ).*$/, '').replace(/\s*\(.*\)$/, '').replace(/^(.+) paid (.+)$/, '').trim();
const parties = (b: ObjectRecord<BillData>) => new Set([...Object.keys(b.data.split.payers), ...Object.keys(owedOf(b.data.amount, b.data.split))]);

function openDebts(os: LifeOSContext): Array<ObjectRecord<DebtData>> {
  return os.records.query<DebtData>('debt', { filter: { and: [{ field: 'status', op: 'neq', value: 'settled' }] }, sort: [{ field: 'data.date', dir: 'asc' }] }, { limit: 10000 });
}

export function udhariPeople(os: LifeOSContext, now = Date.now()): { owe: PersonRow[]; owed: PersonRow[]; settled: PersonRow[] } {
  const c = swConfig(os);
  const debts = openDebts(os);
  const bills = billsOf(os);
  const row = (personId: string, amount: number): PersonRow => {
    const open = debts.filter((d) => d.data.personId === personId);
    const mine = bills.filter((b) => b.data.kind === 'spend' && parties(b).has(personId));
    // What it is for, the most money first.
    const by = new Map<string, number>();
    for (const [what, n] of [...open.map((d) => [d.data.reason ?? '', d.data.amount] as const), ...mine.map((b) => [b.title, b.data.inr ?? b.data.amount] as const)]) {
      const tag = tagOf(what);
      if (tag) by.set(tag, (by.get(tag) ?? 0) + n);
    }
    const tags = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag).slice(0, 3);
    const oldest = open[0] ? daysSince(open[0].data.date, now) : null;
    const link = c.people[personId];
    const friend = link ? c.friends.find((f) => f.id === link.sw) : undefined;
    return { personId, name: os.records.get(personId)?.title ?? 'Someone', amount, tags, oldestDays: oldest !== null && oldest >= 14 ? oldest : null, linked: !!link, open, swAmount: signedIn && friend ? swRupees(friend, rates) : null, friendId: link?.sw ?? null, swOnly: false, swOther: friend?.other ?? {} };
  };
  const signedIn = !!c.me && !c.signedOut;
  const rates = tripRates(os);
  const all = balances(os).map((b) => row(b.personId, b.amount));
  if (signedIn) {
    // Everyone Splitwise has a balance with: linked people LifeOS has as square, and friends no one is linked to yet.
    const shown = new Set(all.map((r) => r.personId));
    for (const f of c.friends) {
      if (Math.abs(swRupees(f, rates)) < 1 && !Object.keys(f.other ?? {}).length) continue;
      const pid = Object.entries(c.people).find(([, v]) => v.sw === f.id)?.[0];
      if (pid && shown.has(pid)) continue;
      all.push(pid ? row(pid, 0) : { personId: `sw:${f.id}`, name: f.name, amount: 0, tags: [], oldestDays: null, linked: false, open: [], swAmount: swRupees(f, rates), friendId: f.id, swOnly: true, swOther: f.other ?? {} });
    }
  }
  const sideOf = (r: PersonRow) => r.amount || r.swAmount || 0;
  all.sort((a, b) => Math.abs(sideOf(b)) - Math.abs(sideOf(a)));
  // Settled lately: shares settled in the last 60 days with someone now square.
  const since = now - 60 * DAY;
  const square = new Set(all.map((r) => r.personId));
  const settledIds = [...new Set(os.records.query<DebtData>('debt', { filter: { and: [{ field: 'status', op: 'eq', value: 'settled' }] } }, { limit: 5000 }).filter((d) => d.updatedAt >= since && !square.has(d.data.personId)).map((d) => d.data.personId))];
  return {
    owe: all.filter((r) => sideOf(r) > 0),
    owed: all.filter((r) => sideOf(r) < 0),
    settled: settledIds.filter((id) => os.records.get(id)).map((id) => row(id, 0)),
  };
}

export interface GroupRow {
  id: string;
  title: string;
  memberIds: string[];
  sub: string;
  /** + owed to you in it, − you owe in it. */
  net: number;
}

/** Groups with shares or Bills, each with your net in it, the biggest first. */
export function udhariGroups(os: LifeOSContext): GroupRow[] {
  const ids = new Set([...openDebts(os).map((d) => d.data.groupId), ...billsOf(os).map((b) => b.data.groupId)].filter((g): g is string => !!g));
  return [...ids]
    .map((id) => {
      const g = os.records.get<{ kind?: string }>(id);
      if (!g) return null;
      const memberIds = os.groups.members(id).map((m) => m.memberId);
      const net = Math.round(balances(os, id).reduce((n, b) => n + b.amount, 0) * 100) / 100;
      const kind = g.data.kind ? g.data.kind[0]!.toUpperCase() + g.data.kind.slice(1) : null;
      return { id, title: g.title, memberIds, sub: [`${memberIds.length + 1} of you`, kind].filter(Boolean).join(' · '), net };
    })
    .filter((g): g is GroupRow => !!g)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
}

export interface ActivityRow {
  key: string;
  date: string;
  /** For the same day, the newest first. */
  at: number;
  title: string;
  sub: string;
  /** + to you, − from you; null when nothing is owed by it (a payback). */
  amount: number;
  payment: boolean;
  route: string;
}

/**
 * What moved lately, newest first: paybacks and settle-ups, shares (a game's
 * many shares as one line) and Bills, each with what it means for you.
 */
export function udhariActivity(os: LifeOSContext, limit = 8): ActivityRow[] {
  const name = (id: string) => (id === 'me' ? 'You' : (os.records.get(id)?.title ?? 'Someone').split(' ')[0]!);
  const money = (n: number) => os.format.currency(Math.round(Math.abs(n)));
  const rows: ActivityRow[] = [];
  const debts = os.records.query<DebtData>('debt', { sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 300 });
  const games = new Map<string, Array<ObjectRecord<DebtData>>>();
  for (const d of debts) {
    if (d.data.kind === 'payment') {
      // A settle-up: "they owed you" is saved as the money coming your way.
      const toYou = d.data.direction === 'i_owe';
      rows.push({ key: d.id, date: d.data.date, at: d.createdAt, title: toYou ? `${name(d.data.personId)} paid you` : `You paid ${name(d.data.personId)}`, sub: d.data.reason === 'Paid, on Splitwise' ? 'from the bank text · recorded on Splitwise' : d.data.transactionId ? 'from the bank text · settled' : 'settled up', amount: toYou ? d.data.amount : -d.data.amount, payment: true, route: `/entity/debt/${d.id}` });
      continue;
    }
    const k = `${d.data.transactionId ?? d.data.reason}|${d.data.date}|${d.data.direction}`;
    games.set(k, [...(games.get(k) ?? []), d]);
  }
  for (const list of games.values()) {
    const d = list[0]!;
    const total = list.reduce((n, x) => n + x.data.amount, 0);
    const theyOwe = d.data.direction === 'they_owe';
    const open = list.filter((x) => x.status !== 'settled').length;
    const sub = list.length > 1 ? `${list.length} shares · ${open} open` : `${theyOwe ? `${name(d.data.personId)} owes you` : `you owe ${name(d.data.personId)}`}${d.status === 'settled' ? ' · settled' : ''}`;
    rows.push({ key: d.id, date: d.data.date, at: d.createdAt, title: d.data.reason || 'A share', sub, amount: theyOwe ? total : -total, payment: false, route: list.length > 1 && d.data.transactionId ? `/entity/transaction/${d.data.transactionId}` : `/entity/debt/${d.id}` });
  }
  for (const b of billsOf(os).slice(0, 200)) {
    const owed = owedOf(b.data.amount, b.data.split);
    const paid = b.data.split.payers;
    const rate = b.data.amount ? (b.data.inr ?? b.data.amount) / b.data.amount : 1;
    if (b.data.kind === 'payment') {
      const from = Object.keys(paid)[0] ?? 'me';
      const to = Object.keys(owed)[0] ?? 'me';
      if (from !== 'me' && to !== 'me') continue;
      rows.push({ key: b.id, date: b.data.date, at: b.createdAt, title: `${name(from)} paid ${to === 'me' ? 'you' : name(to)}`, sub: b.title, amount: (from === 'me' ? -1 : 1) * b.data.amount * rate, payment: true, route: `/entity/bill/${b.id}` });
      continue;
    }
    if (!(('me' in paid) || ('me' in owed))) continue;
    const net = ((paid.me ?? 0) - (owed.me ?? 0)) * rate;
    rows.push({ key: b.id, date: b.data.date, at: b.createdAt, title: b.title, sub: paid.me ? `you paid ${money(paid.me * rate)}${Math.abs(net) >= 1 ? ` · ${money(net)} to you` : ''}` : `${name(Object.keys(paid)[0] ?? 'me')} paid · your share ${money((owed.me ?? 0) * rate)}`, amount: net, payment: false, route: `/entity/bill/${b.id}` });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at).slice(0, limit);
}

export interface RecordRow {
  key: string;
  date: string;
  title: string;
  sub: string;
  /** + to you, − from you. */
  amount: number;
  route: string;
}

/** What LifeOS has with one person, newest first: their shares and the Bills they are in, each with what it means for you. */
export function personRecords(os: LifeOSContext, personId: string): RecordRow[] {
  const rows: RecordRow[] = [];
  for (const d of os.records.query<DebtData>('debt', { filter: { and: [{ field: 'data.personId', op: 'eq', value: personId }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 40 })) {
    const toYou = d.data.kind === 'payment' ? d.data.direction === 'i_owe' : d.data.direction === 'they_owe';
    rows.push({ key: d.id, date: d.data.date, title: d.data.kind === 'payment' ? (toYou ? 'They paid you' : 'You paid them') : d.data.reason || 'A share', sub: d.data.kind === 'payment' ? 'settled' : `${toYou ? 'owes you' : 'you owe'}${d.status === 'settled' ? ' · settled' : ''}`, amount: toYou ? d.data.amount : -d.data.amount, route: `/entity/debt/${d.id}` });
  }
  for (const b of billsOf(os).filter((x) => parties(x).has(personId)).slice(0, 40)) {
    const owed = owedOf(b.data.amount, b.data.split);
    const paid = b.data.split.payers;
    const rate = b.data.amount ? (b.data.inr ?? b.data.amount) / b.data.amount : 1;
    // Between the two of you: what they owe you from it, less what you owe them.
    const net = paid.me && owed[personId] ? owed[personId]! : paid[personId] && owed.me ? -owed.me : b.data.kind === 'payment' ? (paid[personId] ? b.data.amount : -b.data.amount) : 0;
    rows.push({ key: b.id, date: b.data.date, title: b.title, sub: b.data.kind === 'payment' ? 'a payback' : paid.me ? 'you paid' : paid[personId] ? 'they paid' : 'someone else paid', amount: net * rate, route: `/entity/bill/${b.id}` });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
