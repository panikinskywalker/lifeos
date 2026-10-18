/** games (R9a): a Turf Ledger pull into People, Places, Games, Appearances and Debts; the queries and tools over them; the fetch. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { groupType, personType } from '../crm/types';
import { placeType } from '../places/types';
import { accountType, debtType, transactionType } from '../finance/types';
import { gamesModule, applyTurfPull, fetchTurfPull, whoOwes, currentGame, statsFor, leaders, lineup, moneyAtAGlance, SETTING_ME, TURF_TOKEN, TURF_URL, type TurfPull } from './index';
import { samplePull } from './fixtures/samplePull';

const modules: ModuleManifest[] = [
  { id: 'crm', name: 'People', version: '1', description: '', icon: 'x', color: '#000', objects: [personType, groupType] },
  { id: 'places', name: 'Places', version: '1', description: '', icon: 'x', color: '#000', objects: [placeType] },
  { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', objects: [accountType, transactionType, debtType] },
  gamesModule,
];

let os: LifeOSContext;
const secrets = new Map<string, string>();
beforeEach(async () => {
  bus.clear();
  secrets.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules, registry: new Registry() });
  os.device = { secrets: { get: async (k) => secrets.get(k) ?? null, set: async (k, v) => void (v ? secrets.set(k, v) : secrets.delete(k)) } };
});
afterEach(() => os.db.close());

const pull = (): TurfPull => JSON.parse(JSON.stringify(samplePull)) as TurfPull;
const q = <T = Record<string, unknown>>(object: string) => os.records.query<T>(object, { includeArchived: true }, { limit: 1000 });
const live = <T = Record<string, unknown>>(object: string) => q<T>(object).filter((r) => !r.archived);
const person = (name: string) => q<{ phone?: string; upi?: string; email?: string }>('person').find((p) => p.title === name)!;
const NOW = Date.parse('2026-10-18T12:00:00+05:30');

describe('applyTurfPull', () => {
  it('first pull: players become People (matched before made) in the Football group, venues Places, games and appearances; no Transactions', () => {
    // Priya is already in People, with another phone format and her own UPI note: matched, not duplicated, her fields kept.
    const priya = os.records.create({ object: 'person', title: 'Priya', data: { phone: '+91-98200-00002', upi: 'priya@ybl' } });
    const r = applyTurfPull(os, pull());
    expect(r).toMatchObject({ peopleMatched: 1, peopleCreated: 3, archived: 0 });
    expect(q('person')).toHaveLength(4);
    expect(person('Priya').id).toBe(priya.id);
    expect(person('Priya').data).toMatchObject({ upi: 'priya@ybl', email: 'priya@example.com' });
    expect(person('Karan').data).toMatchObject({ phone: '+919820000003' });
    expect(person('Rutvij').data).toMatchObject({ upi: 'rutvij@okicici' });

    const [group] = q<{ name: string; memberIds: string[] }>('group');
    expect(group!.data.name).toBe('Football');
    expect(group!.data.memberIds).toHaveLength(4);

    expect(q('place').map((p) => p.title).sort()).toEqual(['Dome Turf', 'Playground Arena']);
    const venues = q<{ name: string; placeId: string; defaultCost: number }>('venue');
    expect(venues).toHaveLength(2);
    expect(os.records.get(venues.find((v) => v.data.name === 'Dome Turf')!.data.placeId)!.title).toBe('Dome Turf');

    const games = q<{ date: string; venueId: string; frontedById: string; motmId: string }>('game');
    expect(games).toHaveLength(3);
    const sat = games.find((g) => g.data.date === '2026-10-17')!;
    expect(sat.title).toContain('Playground Arena');
    expect(os.records.get(sat.data.venueId)!.title).toBe('Playground Arena');
    expect(sat.data.frontedById).toBe(person('Rutvij').id);
    expect(sat.data.motmId).toBe(person('Karan').id);

    const apps = q<{ gameId: string; personId: string; paid: boolean; goals: number; rsvp?: string; inGoal: boolean }>('appearance');
    expect(apps).toHaveLength(8);
    const karanSat = apps.find((a) => a.data.gameId === sat.id && a.data.personId === person('Karan').id)!;
    expect(karanSat.data).toMatchObject({ paid: false, goals: 4, rsvp: 'in' });
    expect(apps.find((a) => a.data.personId === person('Arjun').id)!.data.inGoal).toBe(true);

    const karan = q<{ availability: string; periods: unknown[]; personId: string }>('player').find((p) => p.title === 'Karan')!;
    expect(karan.data).toMatchObject({ availability: 'INJ', personId: person('Karan').id });
    expect(karan.data.periods).toHaveLength(1);

    expect(q('transaction')).toHaveLength(0);
    expect(q('debt')).toHaveLength(0); // "which player is you" isn't set yet
  });

  it('the same pull again changes nothing; a later pull updates in place and archives what Turf Ledger no longer has', () => {
    applyTurfPull(os, pull());
    expect(applyTurfPull(os, pull())).toMatchObject({ created: 0, updated: 0, archived: 0, peopleCreated: 0 });

    const next = pull();
    next.games[0]!.participants[1]!.paid = true; // Karan paid for Saturday
    next.games = next.games.filter((g) => g.id !== 'g_wed'); // Wednesday deleted in Turf Ledger
    next.players = next.players.filter((p) => p.id !== 'p_arjun'); // …and Arjun removed (he stays a Person)
    next.games[0]!.participants = next.games[0]!.participants.filter((p) => p.playerId !== 'p_arjun');
    next.games[1]!.rsvps = []; // the next game (index 1 once Wednesday is gone): Arjun's maybe went with him
    const r = applyTurfPull(os, next);
    expect(r.archived).toBe(1 + 3 + 1 + 1); // the game, its 3 appearances, Arjun's profile, his Saturday appearance
    expect(live('game')).toHaveLength(2);
    expect(q('game')).toHaveLength(3);
    expect(q('person')).toHaveLength(4);
    const karanSat = live<{ personId: string; gameDate: string; paid: boolean; paidOn?: string }>('appearance').find((a) => a.data.personId === person('Karan').id && a.data.gameDate === '2026-10-17')!;
    expect(karanSat.data.paid).toBe(true);
    expect(karanSat.data.paidOn).toBeTruthy();

    // Back again in Turf Ledger: un-archived, not duplicated.
    applyTurfPull(os, pull());
    expect(live('game')).toHaveLength(3);
    expect(q('game')).toHaveLength(3);
  });

  it('debts: unpaid shares on a game you fronted are owed to you; your unpaid share on someone else’s is owed by you; ticking paid settles', () => {
    os.settings.set(SETTING_ME, 'p_rutvij');
    applyTurfPull(os, pull());
    const debts = q<{ personId: string; direction: string; amount: number; date: string }>('debt');
    const view = debts.map((d) => [os.records.get(d.data.personId)!.title, d.data.direction, d.data.amount, d.data.date, d.status]).sort();
    expect(view).toEqual([
      ['Arjun', 'they_owe', 450, '2026-10-17', 'open'],
      ['Karan', 'they_owe', 450, '2026-10-17', 'open'],
      ['Priya', 'i_owe', 500, '2026-10-14', 'open'],
      ['Priya', 'they_owe', 450, '2026-10-17', 'settled'],
    ]);
    // The debt is linked to its appearance.
    const karanDebt = debts.find((d) => os.records.get(d.data.personId)!.title === 'Karan')!;
    expect(os.links.forEntity(karanDebt.id).some((l) => l.other.object === 'appearance')).toBe(true);

    const next = pull();
    next.games[0]!.participants[1]!.paid = true;
    applyTurfPull(os, next);
    expect(os.records.get(karanDebt.id)!.status).toBe('settled');
    expect(q('debt')).toHaveLength(4);

    // Someone else is "you" now: the old debts go, new ones come.
    os.settings.set(SETTING_ME, 'p_priya');
    applyTurfPull(os, next);
    const after = q<{ personId: string; direction: string }>('debt').map((d) => [os.records.get(d.data.personId)!.title, d.data.direction, d.status]).sort();
    // Priya fronted Wednesday (Karan and Rutvij owe her); Rutvij fronted Saturday, where her share is already paid.
    expect(after).toEqual([['Karan', 'they_owe', 'open'], ['Rutvij', 'i_owe', 'settled'], ['Rutvij', 'they_owe', 'open']]);
  });

  it('refuses something that isn’t a pull', () => {
    expect(() => applyTurfPull(os, { players: [] } as unknown as TurfPull)).toThrow(/Turf Ledger pull/);
  });
});

describe('queries and tools', () => {
  beforeEach(() => applyTurfPull(os, pull()));

  it('who owes, biggest first, with the oldest unpaid game', () => {
    expect(whoOwes(os).map((o) => [o.name, o.amount, o.shares, o.oldest])).toEqual([
      ['Karan', 950, 2, '2026-10-14'],
      ['Rutvij', 500, 1, '2026-10-14'],
      ['Arjun', 450, 1, '2026-10-17'],
      ['Priya', 150, 1, '2026-10-24'],
    ]);
    expect(moneyAtAGlance(os, NOW)).toMatchObject({ outstanding: 2050, owingPeople: 4, gamesThisMonth: 3, turfCostThisMonth: 5100 });
  });

  it('the next game, its lineup, and a player’s record', () => {
    const c = currentGame(os, NOW)!;
    expect(c).toMatchObject({ upcoming: true });
    expect(c.game.data.date).toBe('2026-10-24');
    expect(lineup(os, c.game.id).map((l) => l.name)).toEqual(['Priya']);
    expect(statsFor(os, person('Karan').id)).toMatchObject({ games: 2, goals: 6, assists: 1, wins: 1, draws: 1, losses: 0, motm: 1, paid: 0, unpaid: 950 });
    expect(leaders(os, 'goals', 2).map((s) => [s.name, s.goals])).toEqual([['Karan', 6], ['Priya', 3]]);
  });

  it('the AI tools answer from the same queries', async () => {
    const tool = (name: string) => gamesModule.aiTools!.find((t) => t.name === name)!;
    expect(((await tool('turf_who_owes').run({}, os)) as Array<{ name: string }>)[0]!.name).toBe('Karan');
    expect(await tool('turf_player_stats').run({ name: 'karan' }, os)).toMatchObject({ goals: 6 });
    expect(await tool('turf_player_stats').run({ name: 'Nobody' }, os)).toMatchObject({ error: expect.stringContaining('Nobody') });
    expect(await tool('turf_leaders').run({ metric: 'saves', limit: 1 }, os)).toEqual([{ name: 'Arjun', saves: 9, games: 1 }]);
  });
});

describe('fetchTurfPull', () => {
  const respond = (status: number, body: unknown, type = 'application/json') => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } });

  it('needs the address and the token', async () => {
    await expect(fetchTurfPull(os, respond(200, samplePull))).rejects.toThrow(/address and token/);
  });

  it('sends the token, normalises the address, and says what went wrong in words', async () => {
    os.settings.set(TURF_URL, 'turf-ledger.example.site/');
    secrets.set(TURF_TOKEN, 't'.repeat(40));
    let seen: { url: string; auth: string | null } | null = null;
    const ok = async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), auth: new Headers(init?.headers).get('authorization') };
      return new Response(JSON.stringify(samplePull), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    expect((await fetchTurfPull(os, ok as typeof fetch)).players).toHaveLength(4);
    expect(seen).toEqual({ url: 'https://turf-ledger.example.site/api/lifeos', auth: `Bearer ${'t'.repeat(40)}` });
    await expect(fetchTurfPull(os, respond(401, { error: 'x' }))).rejects.toThrow(/refused the token/);
    await expect(fetchTurfPull(os, respond(404, { error: 'x' }))).rejects.toThrow(/endpoint turned on/);
    await expect(fetchTurfPull(os, respond(200, '<html>sign in</html>', 'text/html'))).rejects.toThrow(/a page, not data/);
  });

  it('the source is available only with both set', async () => {
    const src = os.registry.sources.get('turf')!;
    expect(await src.available!(os)).toBe(false);
    os.settings.set(TURF_URL, 'https://x.example');
    secrets.set(TURF_TOKEN, 'y'.repeat(40));
    expect(await src.available!(os)).toBe(true);
  });
});
