/** games (R9a, R9c): Turf web sync pages into People, Places, Games, Appearances, payment entries and Debts; the queries and tools over them; the fetch; payments recorded here and sent. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSource } from '@core/filing/sources';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { groupType, personType } from '../crm/types';
import { placeType } from '../places/types';
import { accountType, debtType, transactionType } from '../finance/types';
import { gamesModule, applyTurfSync, fetchTurfSync, syncTurf, whoOwes, currentGame, statsFor, leaders, lineup, moneyAtAGlance, recordPayment, markPaid, isSending, turfChanges, setAttendance, setStats, setScore, followGoals, toggleCaptain, setMotm, createMatch, editMatch, matchDefaults, suggestTeams, saveTeams, setFormation, squadRatings, matchRating, kitsOf, kitName, validFormation, shuffleTeams, createPlayer, editPlayer, setAvailability, saveVenue, pendingSubmissions, submissionChanges, auditLog, turfDues, duesTexts, matchTexts, leaderTables, rankLeaders, confirmSmsAsk, settleSmsAsk, undoSmsPayment, SMS_ASK, SMS_PAID, SETTING_ME, SETTING_REV, TURF_KEY, TURF_URL, type TurfSyncPage } from './index';
import { sampleSync } from './fixtures/sampleSync';

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
afterEach(() => {
  vi.unstubAllGlobals();
  os.db.close();
});

const first = (): TurfSyncPage => JSON.parse(JSON.stringify(sampleSync)) as TurfSyncPage;
/** A later page: only what changed after `since`. */
const delta = (since: number, rev: number, tables: TurfSyncPage['tables'], deleted: TurfSyncPage['deleted'] = []): TurfSyncPage => ({ since, rev, tables, deleted });
const q = <T = Record<string, unknown>>(object: string) => os.records.query<T>(object, { includeArchived: true }, { limit: 1000 });
const live = <T = Record<string, unknown>>(object: string) => q<T>(object).filter((r) => !r.archived);
const person = (name: string) => q<{ phone?: string; upi?: string; email?: string }>('person').find((p) => p.title === name)!;
const appearance = (name: string, date: string) => q<{ personId: string; gameDate: string; paid: boolean; amountPaid?: number; paidOn?: string; rsvp?: string; goals: number; sourceKey?: string }>('appearance').find((a) => a.data.personId === person(name).id && a.data.gameDate === date)!;
const row = (table: string, match: (r: Record<string, unknown>) => boolean) => ({ ...sampleSync.tables[table]!.find(match)! });
const NOW = Date.parse('2026-10-18T12:00:00+05:30');

describe('applyTurfSync', () => {
  it('first sync: players become People (matched before made), regulars in the Football group, venues Places, games and appearances, payment entries; no Transactions', () => {
    // Priya is already in People, with another phone format and her own UPI: matched, not duplicated, her fields kept.
    const priya = os.records.create({ object: 'person', title: 'Priya', data: { phone: '+91-98200-00002', upi: 'priya@ybl' } });
    const r = applyTurfSync(os, first());
    expect(r).toMatchObject({ peopleMatched: 1, peopleCreated: 4, archived: 0, payments: 4, rev: 40 });
    expect(os.settings.get(SETTING_REV, 0)).toBe(40);
    expect(q('person')).toHaveLength(5);
    expect(person('Priya').id).toBe(priya.id);
    expect(person('Priya').data).toMatchObject({ upi: 'priya@ybl', email: 'priya@example.com' });
    expect(person('Rutvij').data).toMatchObject({ upi: 'rutvij@okicici' });

    const [group] = q<{ name: string; memberIds: string[] }>('group');
    expect(group!.data.name).toBe('Football');
    expect(group!.data.memberIds).toHaveLength(4); // the guest stays out
    expect(group!.data.memberIds).not.toContain(person('Neel (guest)').id);

    expect(q('place').map((p) => p.title).sort()).toEqual(['Dome Turf', 'Playground Arena']);
    const games = q<{ date: string; venueId: string; frontedById: string; motmId: string; rsvps?: Record<string, string> }>('game');
    expect(games).toHaveLength(3);
    const sat = games.find((g) => g.data.date === '2026-10-17')!;
    expect(os.records.get(sat.data.venueId)!.title).toBe('Playground Arena');
    expect(sat.data).toMatchObject({ frontedById: person('Rutvij').id, motmId: person('Karan').id });
    // Arjun said maybe to the next game before he's in its lineup: kept on the game.
    expect(games.find((g) => g.data.date === '2026-10-24')!.data.rsvps).toEqual({ p_priya: 'in', p_arjun: 'maybe' });

    expect(q('appearance')).toHaveLength(8);
    expect(appearance('Karan', '2026-10-17').data).toMatchObject({ paid: false, goals: 4, rsvp: 'in' });
    expect(appearance('Priya', '2026-10-17').data).toMatchObject({ paid: true, amountPaid: 450, paidOn: '2026-10-18' });
    // A part payment: ₹200 of ₹450, one entry on the timeline.
    const arjun = appearance('Arjun', '2026-10-17');
    expect(arjun.data).toMatchObject({ paid: false, amountPaid: 200 });
    const entries = os.records.timeline.forEntity(arjun.id).filter((e) => e.kind === 'payment');
    expect(entries.map((e) => [e.meta.amount, e.meta.via, e.meta.entry])).toEqual([[200, 'lifeos', 'payment']]);

    const karan = q<{ availability: string; periods: Array<{ id: string; note: string }>; comfortable?: string }>('player').find((p) => p.title === 'Karan')!;
    expect(karan.data.availability).toBe('INJ');
    expect(karan.data.periods).toEqual([expect.objectContaining({ id: 'av_karan', note: 'Ankle' })]);
    expect(q<{ comfortable?: string }>('player').find((p) => p.title === 'Rutvij')!.data.comfortable).toBe('CM, RW');

    expect(q('transaction')).toHaveLength(0);
  });

  it('the same page again changes nothing; a later page carries only what changed, and partial rows find their records', () => {
    applyTurfSync(os, first());
    expect(applyTurfSync(os, first())).toMatchObject({ created: 0, updated: 0, archived: 0, peopleCreated: 0 });
    expect(os.records.timeline.forEntity(appearance('Arjun', '2026-10-17').id).filter((e) => e.kind === 'payment')).toHaveLength(1);

    // Karan pays his ₹450 for Saturday on the iPhone: one share row and one entry, nothing else.
    const r = applyTurfSync(os, delta(40, 41, {
      game_players: [{ ...row('game_players', (x) => x.game_id === 'g_sat' && x.player_id === 'p_karan'), paid: 1, paid_at: '2026-10-19 08:00:00' }],
      payments: [{ id: 'pay_5', game_id: 'g_sat', player_id: 'p_karan', amount_cents: 45000, kind: 'payment', via: 'web', recorded_by: 'rutvij', created_at: '2026-10-19T08:00:00.000Z' }],
    }));
    expect(r).toMatchObject({ created: 0, payments: 1, rev: 41 });
    expect(appearance('Karan', '2026-10-17').data).toMatchObject({ paid: true, amountPaid: 450, paidOn: '2026-10-19', goals: 4 });

    // A field emptied on Turf web is emptied here (records merge, so it must be cleared, not left).
    applyTurfSync(os, delta(41, 41, { game_players: [{ ...row('game_players', (x) => x.game_id === 'g_sat' && x.player_id === 'p_priya'), team: null, field_position: null }] }));
    expect(q<{ team?: string; position?: string }>('appearance').find((a) => a.id === appearance('Priya', '2026-10-17').id)!.data).not.toHaveProperty('team');

    // The next game moves a day: its appearances follow without their rows being sent.
    applyTurfSync(os, delta(41, 42, { games: [{ ...row('games', (x) => x.id === 'g_next'), date: '2026-10-25' }] }));
    expect(appearance('Priya', '2026-10-25').data.rsvp).toBe('in');
  });

  it('deletes are tombstones: archived here, never deleted, and back when they return; a removed entry lowers amount paid', () => {
    applyTurfSync(os, first());
    applyTurfSync(os, delta(40, 45, {}, [
      { table: 'games', key: 'g_wed', rev: 41 },
      ...['p_rutvij', 'p_priya', 'p_karan'].map((p) => ({ table: 'game_players', key: `g_wed:${p}`, rev: 42 })),
      { table: 'payments', key: 'pay_4', rev: 43 }, // Arjun's ₹200 undone on the iPhone
      { table: 'player_availability_periods', key: 'av_karan', rev: 44 },
      { table: 'match_rsvps', key: 'g_next:p_arjun', rev: 45 },
    ]));
    expect(live('game')).toHaveLength(2);
    expect(q('game')).toHaveLength(3);
    expect(live('appearance')).toHaveLength(5);
    expect(appearance('Arjun', '2026-10-17').data.amountPaid).toBe(0);
    expect(os.records.timeline.forEntity(appearance('Arjun', '2026-10-17').id).filter((e) => e.kind === 'payment')).toHaveLength(0);
    expect(q<{ periods?: unknown[] }>('player').find((p) => p.title === 'Karan')!.data.periods).toBeUndefined();
    expect(q<{ date: string; rsvps?: Record<string, string> }>('game').find((g) => g.data.date === '2026-10-24')!.data.rsvps).toEqual({ p_priya: 'in' });

    // Wednesday restored on Turf web (undo): the same records come back.
    applyTurfSync(os, delta(45, 46, { games: [row('games', (x) => x.id === 'g_wed')], game_players: sampleSync.tables.game_players!.filter((x) => x.game_id === 'g_wed') }));
    expect(live('game')).toHaveLength(3);
    expect(q('game')).toHaveLength(3);
    expect(live('appearance')).toHaveLength(8);
  });

  it('debts follow Turf web’s "who you are": owed to you on games you fronted, by you on others’; part payments lower them, paid settles', () => {
    applyTurfSync(os, first());
    const view = () => q<{ personId: string; direction: string; amount: number; date: string }>('debt').map((d) => [os.records.get(d.data.personId)!.title, d.data.direction, d.data.amount, d.data.date, d.status]).sort();
    expect(view()).toEqual([
      ['Arjun', 'they_owe', 250, '2026-10-17', 'open'], // ₹450 less his ₹200
      ['Karan', 'they_owe', 450, '2026-10-17', 'open'],
      ['Priya', 'i_owe', 500, '2026-10-14', 'open'],
      ['Priya', 'they_owe', 450, '2026-10-17', 'settled'],
    ]);
    const karanDebt = q<{ personId: string }>('debt').find((d) => os.records.get(d.data.personId)!.title === 'Karan')!;
    expect(os.links.forEntity(karanDebt.id).some((l) => l.other.object === 'appearance')).toBe(true);

    applyTurfSync(os, delta(40, 41, { game_players: [{ ...row('game_players', (x) => x.game_id === 'g_sat' && x.player_id === 'p_karan'), paid: 1 }] }));
    expect(os.records.get(karanDebt.id)!.status).toBe('settled');

    // You are Priya now (changed in Turf web's settings): the old debts go, new ones come.
    applyTurfSync(os, delta(41, 42, { settings: [{ key: 'ownerPlayerId', value: '"p_priya"' }] }));
    expect(os.settings.get(SETTING_ME, null)).toBe('p_priya');
    expect(view().map((d) => [d[0], d[1], d[4]])).toEqual([['Karan', 'they_owe', 'open'], ['Rutvij', 'i_owe', 'settled'], ['Rutvij', 'they_owe', 'open']]);
  });

  it('refuses something that isn’t a sync page', () => {
    expect(() => applyTurfSync(os, { players: [] } as unknown as TurfSyncPage)).toThrow(/sync page/);
  });
});

describe('queries and tools', () => {
  beforeEach(() => applyTurfSync(os, first()));

  it('who owes, biggest first, part payments counted', () => {
    expect(whoOwes(os).map((o) => [o.name, o.amount, o.shares, o.oldest])).toEqual([
      ['Karan', 950, 2, '2026-10-14'],
      ['Rutvij', 500, 1, '2026-10-14'],
      ['Arjun', 250, 1, '2026-10-17'],
      ['Priya', 150, 1, '2026-10-24'],
    ]);
    expect(moneyAtAGlance(os, NOW)).toMatchObject({ outstanding: 1850, owingPeople: 4, gamesThisMonth: 3, turfCostThisMonth: 5100 });
  });

  it('the next game, its lineup, and a player’s record', () => {
    const c = currentGame(os, NOW)!;
    expect(c).toMatchObject({ upcoming: true });
    expect(c.game.data.date).toBe('2026-10-24');
    expect(lineup(os, c.game.id).map((l) => l.name)).toEqual(['Priya']);
    expect(statsFor(os, person('Karan').id)).toMatchObject({ games: 2, goals: 6, assists: 1, wins: 1, draws: 1, losses: 0, motm: 1, paid: 0, unpaid: 950 });
    expect(statsFor(os, person('Arjun').id)).toMatchObject({ paid: 200, unpaid: 250 });
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

describe('fetchTurfSync', () => {
  const respond = (status: number, body: unknown, type = 'application/json') => async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } });
  const KEY = `tw_${'k'.repeat(30)}`;

  it('needs the address and the key', async () => {
    await expect(fetchTurfSync(os, 0, respond(200, sampleSync))).rejects.toThrow(/address and this phone’s key/);
  });

  it('sends the key, asks from the last change number, and says what went wrong in words', async () => {
    os.settings.set(TURF_URL, 'turf-web.example.dev/');
    secrets.set(TURF_KEY, KEY);
    const seen: Array<{ url: string; auth: string | null }> = [];
    const ok = (page: TurfSyncPage) => async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), auth: new Headers(init?.headers).get('authorization') });
      return new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    await syncTurf(os, ok(first()) as typeof fetch);
    await syncTurf(os, ok(delta(40, 40, {})) as typeof fetch);
    expect(seen).toEqual([
      { url: 'https://turf-web.example.dev/api/sync?since=0', auth: `Bearer ${KEY}` },
      { url: 'https://turf-web.example.dev/api/sync?since=40', auth: `Bearer ${KEY}` },
    ]);
    await expect(fetchTurfSync(os, 0, respond(401, { error: 'x' }))).rejects.toThrow(/refused this phone’s key/);
    await expect(fetchTurfSync(os, 0, respond(404, { error: 'x' }))).rejects.toThrow(/No Turf web at that address/);
    await expect(fetchTurfSync(os, 0, respond(200, '<html>sign in</html>', 'text/html'))).rejects.toThrow(/a page, not data/);
    await expect(fetchTurfSync(os, 0, respond(200, { players: [] }))).rejects.toThrow(/isn’t a sync page/);
  });

  it('the source is available only with both set', async () => {
    const src = os.registry.sources.get('turf')!;
    expect(src.label).toBe('Turf web');
    expect(await src.available!(os)).toBe(false);
    os.settings.set(TURF_URL, 'https://x.example');
    secrets.set(TURF_KEY, KEY);
    expect(await src.available!(os)).toBe(true);
  });
});

describe('payments recorded in LifeOS (R9c.2)', () => {
  const KEY = `tw_${'k'.repeat(30)}`;
  const src = () => os.registry.sources.get('turf')!;
  const entries = (id: string) => os.records.timeline.forEntity(id).filter((e) => e.kind === 'payment');
  const debt = (name: string, date: string) => q<{ personId: string; date: string; amount: number }>('debt').find((d) => d.data.personId === person(name).id && d.data.date === date)!;
  /** A Turf web stand-in: answers /api/actions with `answer`, /api/sync with what it took (each payment as a row carrying the action id). */
  const turfWeb = (answer: (a: { id: string; body: Record<string, unknown> }) => number, opts: { offline?: boolean } = {}) => {
    const taken: Array<{ id: string; method: string; body: Record<string, unknown> }> = [];
    let rev = 40;
    const rows: Record<string, unknown>[] = [];
    const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (opts.offline) throw new TypeError('Network request failed');
      const u = String(url);
      if (u.includes('/api/actions')) {
        const { actions } = JSON.parse(String(init!.body)) as { actions: Array<{ id: string; method: string; body: Record<string, unknown> }> };
        let stopped = false;
        const results = actions.map((a) => {
          if (stopped) return { id: a.id, status: 'skipped' };
          const status = answer(a);
          if (status >= 500) stopped = true;
          if (status < 300) {
            taken.push(a);
            rows.push({ id: `pay_${a.id.slice(-6)}`, game_id: a.body.gameId, player_id: a.body.playerId, amount_cents: Math.round(Number(a.body.amount) * 100), kind: a.body.kind, via: 'lifeos', action_id: a.id, created_at: new Date().toISOString() });
          }
          return { id: a.id, status, result: status < 300 ? { ok: true } : { error: status === 404 ? 'Player not found in this match.' : 'Could not apply those changes.' } };
        });
        return new Response(JSON.stringify({ results }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const page = delta(rev, rev + rows.length, { payments: rows.splice(0) });
      rev = page.rev;
      return new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchFn);
    return { taken, fetchFn };
  };

  beforeEach(() => {
    applyTurfSync(os, first());
    os.settings.set(TURF_URL, 'https://turf-web.example.dev');
    secrets.set(TURF_KEY, KEY);
  });

  it('a part payment shows at once as sending: paid so far, who owes and the Debt all move; the change waits with its own id', () => {
    const karan = appearance('Karan', '2026-10-17');
    const item = recordPayment(os, karan.id, { amount: 200, note: 'Cash at the turf' });
    expect(item.payload).toEqual({ method: 'PATCH', body: { action: 'payment', gameId: 'g_sat', playerId: 'p_karan', kind: 'payment', amount: 200, note: 'Cash at the turf' } });
    expect(item.label).toMatch(/^Karan paid .*200.* · Sat, 17 Oct|^Karan paid .*200.* · Sat 17 Oct/);
    expect(appearance('Karan', '2026-10-17').data.amountPaid).toBe(200);
    expect(entries(karan.id)).toEqual([expect.objectContaining({ meta: expect.objectContaining({ pending: true, actionId: item.id, amount: 200 }) })]);
    expect(isSending(os, karan.id)).toBe(true);
    expect(debt('Karan', '2026-10-17').data.amount).toBe(250);
    expect(whoOwes(os).find((o) => o.name === 'Karan')!.amount).toBe(750);
    expect(turfChanges(os).sending).toHaveLength(1);
  });

  it('sent before the sync; the entry Turf web confirms (same action id) replaces the sending one', async () => {
    const web = turfWeb(() => 201);
    const karan = appearance('Karan', '2026-10-17');
    const item = recordPayment(os, karan.id, { amount: 450 });
    await runSource(os, src());
    expect(web.taken.map((a) => a.id)).toEqual([item.id]);
    expect(String(web.fetchFn.mock.calls[0]![0])).toBe('https://turf-web.example.dev/api/actions');
    expect(new Headers(web.fetchFn.mock.calls[0]![1]!.headers).get('authorization')).toBe(`Bearer ${KEY}`);
    expect(os.outbox.get(item.id)!.state).toBe('sent');
    const after = entries(karan.id);
    expect(after).toHaveLength(1);
    expect(after[0]!.meta).toMatchObject({ amount: 450, via: 'lifeos' });
    expect(after[0]!.meta.pending).toBeUndefined();
    expect(appearance('Karan', '2026-10-17').data.amountPaid).toBe(450);
    expect(isSending(os, karan.id)).toBe(false);
    expect(os.records.get(debt('Karan', '2026-10-17').id)!.status).toBe('settled');
  });

  it('offline: the change keeps waiting, in order, with why; it goes when Turf web is back', async () => {
    turfWeb(() => 201, { offline: true });
    const first = recordPayment(os, appearance('Karan', '2026-10-17').id, { amount: 100 });
    const second = markPaid(os, appearance('Arjun', '2026-10-17').id)!;
    expect(second.payload.body).toMatchObject({ amount: 250, note: 'Marked paid' });
    await expect(runSource(os, src())).rejects.toThrow(/Network/);
    expect(turfChanges(os).sending.map((i) => [i.id, i.error])).toEqual([[first.id, 'Network request failed'], [second.id, 'Network request failed']]);
    expect(appearance('Karan', '2026-10-17').data.amountPaid).toBe(100); // still shown as paid so far

    const web = turfWeb(() => 201);
    await runSource(os, src());
    expect(web.taken.map((a) => a.id)).toEqual([first.id, second.id]);
    expect(turfChanges(os).sending).toHaveLength(0);
    expect(appearance('Arjun', '2026-10-17').data.amountPaid).toBe(450);
  });

  it('refused: what it showed is undone and the refusal waits on the board with Turf web’s words until dismissed', async () => {
    turfWeb(() => 404);
    const karan = appearance('Karan', '2026-10-17');
    const item = recordPayment(os, karan.id, { amount: 450 });
    await runSource(os, src());
    expect(os.outbox.get(item.id)).toMatchObject({ state: 'refused', error: 'Player not found in this match.' });
    expect(entries(karan.id)).toHaveLength(0);
    expect(appearance('Karan', '2026-10-17').data.amountPaid).toBe(0);
    expect(debt('Karan', '2026-10-17').data.amount).toBe(450);
    expect(turfChanges(os).refused.map((i) => i.label)).toEqual([item.label]);
    os.outbox.dismiss(item.id);
    expect(turfChanges(os).refused).toHaveLength(0);
  });

  it('a server error stops there: it and everything after keep waiting, nothing is sent out of order', async () => {
    let n = 0;
    turfWeb(() => (n++ === 0 ? 500 : 201));
    const a = recordPayment(os, appearance('Karan', '2026-10-17').id, { amount: 100 });
    const b = recordPayment(os, appearance('Arjun', '2026-10-17').id, { amount: 50 });
    // No sync while they wait: it would put back Turf web's older copy over what's shown.
    await expect(runSource(os, src())).rejects.toThrow(/2 changes still waiting/);
    expect(turfChanges(os).sending.map((i) => i.id)).toEqual([a.id, b.id]);
    expect(os.outbox.get(b.id)!.error).toBe('Waiting for the one before it');
  });

  it('refunds go as negative amounts, corrections either way; nonsense is refused before it is queued', () => {
    const priya = appearance('Priya', '2026-10-17');
    expect(recordPayment(os, priya.id, { amount: 50, kind: 'refund', note: 'Left early' }).payload.body).toMatchObject({ kind: 'refund', amount: -50 });
    expect(appearance('Priya', '2026-10-17').data.amountPaid).toBe(400);
    expect(recordPayment(os, priya.id, { amount: -20, kind: 'correction' }).payload.body).toMatchObject({ kind: 'correction', amount: -20 });
    expect(() => recordPayment(os, priya.id, { amount: 0 })).toThrow(/Enter an amount/);
    expect(() => recordPayment(os, priya.id, { amount: -5 })).toThrow(/without a minus/);
    expect(markPaid(os, appearance('Rutvij', '2026-10-17').id)).toBeNull(); // nothing owed
  });
});

const debt = (name: string, date: string) => q<{ personId: string; date: string; amount: number }>('debt').find((d) => d.data.personId === person(name).id && d.data.date === date)!;

describe('matches changed in LifeOS (R9c.3)', () => {
  const KEY = `tw_${'k'.repeat(30)}`;
  const src = () => os.registry.sources.get('turf')!;
  const game = (date: string) => q<Record<string, unknown> & { date: string; scoreA?: number; scoreB?: number; scoreLocked?: boolean; captainAId?: string; motmId?: string; sourceKey?: string }>('game').find((g) => g.data.date === date)!;
  const profile = (name: string) => q('player').find((p) => p.title === name)!.id;
  const venue = (name: string) => q<{ name: string }>('venue').find((v) => v.data.name === name)!.id;
  /** Turf web stand-in: every action taken; a new match gets id g_new and comes back in the sync with its shares. */
  const turfWeb = (refuse: (body: Record<string, unknown>) => boolean = () => false) => {
    const taken: Array<{ id: string; method: string; body: Record<string, unknown> }> = [];
    let rev = 40;
    const pending: TurfSyncPage['tables'] = {};
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('/api/actions')) {
        const { actions } = JSON.parse(String(init!.body)) as { actions: typeof taken };
        const results = actions.map((a) => {
          if (refuse(a.body)) return { id: a.id, status: 400, result: { error: 'Complete the game and select its players.' } };
          taken.push(a);
          if (a.method === 'POST' && a.body.action === 'game') {
            const ids = a.body.playerIds as string[];
            pending.games = [{ id: 'g_new', date: a.body.date, time: a.body.time, venue: a.body.venue, venue_id: a.body.venueId, side_size: a.body.sideSize, total_amount: a.body.totalAmount, expected_players: a.body.expectedPlayers, payment_terms: a.body.paymentTerms, fronted_by_player_id: a.body.frontedByPlayerId || null, team_a_color: '#D7F55C', team_b_color: '#A9C4FF', goal_data_quality: 'missing', score_locked: 0 }];
            pending.game_players = ids.map((pid) => ({ game_id: 'g_new', player_id: pid, share_amount: Math.round((Number(a.body.totalAmount) / ids.length) * 100) / 100, paid: pid === a.body.frontedByPlayerId ? 1 : 0, goals: 0, assists: 0, saves: 0, own_goals: 0, played_goalkeeper: 0, attendance_status: 'confirmed' }));
            return { id: a.id, status: 201, result: { id: 'g_new' } };
          }
          return { id: a.id, status: 200, result: { ok: true } };
        });
        return new Response(JSON.stringify({ results }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const page = delta(rev, rev + 1, { ...pending });
      for (const k of Object.keys(pending)) delete pending[k];
      rev = page.rev;
      return new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    return taken;
  };

  beforeEach(() => {
    applyTurfSync(os, first());
    os.settings.set(TURF_URL, 'https://turf-web.example.dev');
    secrets.set(TURF_KEY, KEY);
  });

  it('attendance and stats show at once; the score follows the goals (own goals count for the other team) until set by hand', () => {
    const karan = appearance('Karan', '2026-10-17');
    expect(setAttendance(os, karan.id, 'late')!.payload.body).toEqual({ action: 'attendance', gameId: 'g_sat', playerId: 'p_karan', status: 'late' });
    expect(appearance('Karan', '2026-10-17').data).toMatchObject({ attendance: 'late' });
    expect(setAttendance(os, karan.id, 'late')).toBeNull(); // no change, nothing queued

    // Karan (team A) gets a 5th goal, Priya (B) an own goal: 7–5 becomes 9–5.
    const item = setStats(os, karan.id, { goals: 5, assists: 0, saves: 0, ownGoals: 0, inGoal: false });
    expect(item.payload.body).toEqual({ action: 'matchStats', gameId: 'g_sat', playerId: 'p_karan', goals: 5, assists: 0, saves: 0, ownGoals: 0, playedGoalkeeper: false });
    setStats(os, appearance('Priya', '2026-10-17').id, { goals: 1, assists: 2, saves: 0, ownGoals: 1, inGoal: false });
    // Followed from the goals now logged: A = 2 + 5 + B's own goal; B = Priya's 1.
    expect(game('2026-10-17').data).toMatchObject({ scoreA: 8, scoreB: 1 });

    setScore(os, game('2026-10-17').id, 7, 5);
    expect(game('2026-10-17').data).toMatchObject({ scoreA: 7, scoreB: 5, scoreLocked: true });
    setStats(os, karan.id, { goals: 6, assists: 0, saves: 0, ownGoals: 0, inGoal: false });
    expect(game('2026-10-17').data).toMatchObject({ scoreA: 7, scoreB: 5 }); // set by hand: stays
    expect(followGoals(os, game('2026-10-17').id).payload.body).toEqual({ action: 'score', gameId: 'g_sat', follow: true });
    expect(game('2026-10-17').data).toMatchObject({ scoreA: 9, scoreB: 1 });
    expect(game('2026-10-17').data.scoreLocked).toBeUndefined();
    expect(() => setScore(os, game('2026-10-17').id, -1, 2)).toThrow(/both scores/);
  });

  it('captain toggles on the player’s team; player of the match moves or clears', () => {
    const priya = appearance('Priya', '2026-10-17'); // team B, already captain
    const karan = appearance('Karan', '2026-10-17'); // team A
    expect(toggleCaptain(os, priya.id).payload.body).toEqual({ action: 'captain', gameId: 'g_sat', playerId: 'p_priya', team: 'B' });
    expect(game('2026-10-17').data.captainBId).toBeUndefined();
    toggleCaptain(os, karan.id);
    expect(game('2026-10-17').data.captainAId).toBe(person('Karan').id);
    expect(() => toggleCaptain(os, appearance('Priya', '2026-10-24').id)).toThrow(/on a team/);

    expect(setMotm(os, game('2026-10-17').id, priya.id)!.payload.body).toEqual({ action: 'motm', gameId: 'g_sat', playerId: 'p_priya' });
    expect(game('2026-10-17').data.motmId).toBe(person('Priya').id);
    expect(setMotm(os, game('2026-10-17').id, null)!.payload.body).toMatchObject({ playerId: '' });
    expect(game('2026-10-17').data.motmId).toBeUndefined();
  });

  it('a refused change is put back exactly', async () => {
    turfWeb((b) => b.action === 'matchStats');
    const karan = appearance('Karan', '2026-10-17');
    setStats(os, karan.id, { goals: 9, assists: 3, saves: 0, ownGoals: 0, inGoal: true });
    expect(game('2026-10-17').data).toMatchObject({ scoreA: 11 });
    await runSource(os, src());
    expect(appearance('Karan', '2026-10-17').data).toMatchObject({ goals: 4, assists: 0, inGoal: false });
    expect(game('2026-10-17').data).toMatchObject({ scoreA: 7, scoreB: 5 });
    expect(turfChanges(os).refused).toHaveLength(1);
  });

  it('a new match: venue defaults, shares split, whoever fronted counts as paid; Turf web’s id replaces the local one, so the sync adds no second copy', async () => {
    expect(matchDefaults(os, venue('Dome Turf'))).toMatchObject({ time: '07:00', sideSize: 5, totalCost: 1500, paymentTerms: 'advance_paid', advance: 500 });
    const taken = turfWeb();
    const { gameId, item } = createMatch(os, { ...matchDefaults(os, venue('Dome Turf')), date: '2026-10-28', venueId: venue('Dome Turf'), totalCost: 1500, paymentTerms: 'advance_paid', advance: 500, playerIds: [profile('Rutvij'), profile('Karan'), profile('Arjun')], frontedById: profile('Rutvij') } as Parameters<typeof createMatch>[1]);
    expect(item.payload.body).toMatchObject({ action: 'game', date: '2026-10-28', time: '07:00', venue: 'Dome Turf', venueId: 'v_dome', totalAmount: 1500, paymentTerms: 'advance_paid', advanceAmount: 500, sideSize: 5, playerIds: ['p_rutvij', 'p_karan', 'p_arjun'], expectedPlayers: 10, frontedByPlayerId: 'p_rutvij' });
    expect(item.payload.method).toBe('POST');
    const made = os.records.get<{ sourceKey: string }>(gameId)!;
    expect(made.data.sourceKey).toMatch(/^turf:games:local-/);
    expect(appearance('Karan', '2026-10-28').data).toMatchObject({ share: 500, paid: false });
    expect(appearance('Rutvij', '2026-10-28').data).toMatchObject({ share: 500, paid: true });
    expect(debt('Karan', '2026-10-28').data.amount).toBe(500); // you fronted: he owes you

    // Offline, a goal is logged on the new match: it names the local id.
    const goal = setStats(os, appearance('Karan', '2026-10-28').id, { goals: 2, assists: 0, saves: 0, ownGoals: 0, inGoal: false });
    expect(goal.payload.body.gameId).toMatch(/^local-/);

    await runSource(os, src());
    // Sent in order; the goal went with Turf web's id for the match.
    expect(taken.map((a) => [a.method, a.body.action, a.body.gameId ?? null])).toEqual([['POST', 'game', null], ['PATCH', 'matchStats', 'g_new']]);
    expect(os.records.get<{ sourceKey: string }>(gameId)!.data.sourceKey).toBe('turf:games:g_new');
    expect(q<{ date: string }>('game').filter((g) => g.data.date === '2026-10-28')).toHaveLength(1);
    expect(q<{ gameDate: string }>('appearance').filter((a) => a.data.gameDate === '2026-10-28')).toHaveLength(3);
    expect(appearance('Karan', '2026-10-28').data.sourceKey).toBe('turf:game_players:g_new:p_karan');
    expect(turfChanges(os).sending).toHaveLength(0);
  });

  it('a refused new match goes, and so does what was queued on it', async () => {
    turfWeb((b) => b.action === 'game');
    const { gameId } = createMatch(os, { date: '2026-10-29', venueId: venue('Playground Arena'), totalCost: 1800, paymentTerms: 'postpaid', playerIds: [profile('Priya'), profile('Karan')] });
    setAttendance(os, appearance('Priya', '2026-10-29').id, 'late');
    await runSource(os, src());
    expect(os.records.get(gameId)).toBeFalsy();
    expect(q<{ gameDate: string }>('appearance').filter((a) => a.data.gameDate === '2026-10-29')).toHaveLength(0);
    expect(turfChanges(os).refused.map((i) => i.error)).toEqual(['The match it belongs to wasn’t made in Turf web', 'Complete the game and select its players.']);
  });

  it('an edit splits the shares again, keeps who stays as they were, adds and takes off; someone who paid needs a refund first', () => {
    const sat = game('2026-10-17');
    const base = { date: '2026-10-17', time: '20:00', venueId: venue('Playground Arena'), totalCost: 1800, paymentTerms: 'postpaid' as const, sideSize: 6, frontedById: profile('Rutvij') };
    expect(() => editMatch(os, sat.id, { ...base, playerIds: [profile('Rutvij'), profile('Karan'), profile('Priya')] })).toThrow(/Arjun paid towards this match/);

    const item = editMatch(os, sat.id, { ...base, playerIds: [profile('Rutvij'), profile('Karan'), profile('Priya'), profile('Arjun'), profile('Neel (guest)')] });
    expect(item.payload).toMatchObject({ method: 'PUT', body: { action: 'game', id: 'g_sat', playerIds: ['p_rutvij', 'p_karan', 'p_priya', 'p_arjun', 'p_guest'] } });
    expect(appearance('Karan', '2026-10-17').data).toMatchObject({ share: 360, goals: 4, team: 'A', paid: false });
    expect(appearance('Priya', '2026-10-17').data).toMatchObject({ share: 360, paid: true, amountPaid: 450 }); // ₹90 credit
    expect(appearance('Neel (guest)', '2026-10-17').data).toMatchObject({ share: 360, paid: false, sourceKey: 'turf:game_players:g_sat:p_guest' });
    // Not set by hand, so like Turf web the score follows the goals logged after an edit (2 + 4 for A, 1 for B).
    expect(game('2026-10-17').data).toMatchObject({ scoreA: 6, scoreB: 1 });
  });
});

describe('teams and the generator (R9c.4)', () => {
  beforeEach(() => applyTurfSync(os, first()));
  const sat = () => q<{ date: string; captainAId?: string; captainBId?: string; scoreA?: number; scoreB?: number; formationA?: string }>('game').find((g) => g.data.date === '2026-10-17')!;
  const app = (name: string) => appearance(name, '2026-10-17');

  it('the ratings are Turf web’s: a match rating from 6.0, an overall from the profile plus form', () => {
    expect(matchRating({ goals: 2, assists: 1, saves: 0, ownGoals: 0, inGoal: false, role: 'MID', outcome: 'W', conceded: 5, potm: false, teamBest: false, late: false })).toEqual({ rating: 7.9, partial: false });
    const r = squadRatings(os).players;
    expect(r.get(person('Rutvij').id)).toMatchObject({ matches: 2, provisional: true });
    expect(r.get(person('Rutvij').id)!.overall).toBeGreaterThan(30);
  });

  it('suggest teams splits everyone into equal sides, the keeper and the two strongest apart; reshuffle stays as fair', () => {
    const s = suggestTeams(os, sat().id)!;
    expect(Object.keys(s.teams)).toHaveLength(4);
    const sides = Object.values(s.teams);
    expect(sides.filter((x) => x === 'A')).toHaveLength(2);
    expect(s.result.explanation.join(' ')).toMatch(/Average overall/);
    let n = 0;
    const again = suggestTeams(os, sat().id, () => (n++ % 7) / 7)!;
    expect(Object.values(again.teams).filter((x) => x === 'A')).toHaveLength(2);
    expect(suggestTeams(os, (appearance('Priya', '2026-10-24').data as unknown as { gameId: string }).gameId)).toBeNull(); // one player
  });

  it('save teams sends one change per player who moved; a captain moved off loses the armband; the score follows the goals', () => {
    // Rutvij (A, captain) and Karan (A) swap with Priya (B, captain) and Arjun (B).
    const n = saveTeams(os, sat().id, { [app('Rutvij').id]: 'B', [app('Karan').id]: 'A', [app('Priya').id]: 'A', [app('Arjun').id]: 'B' });
    expect(n).toBe(2);
    const bodies = turfChanges(os).sending.map((i) => i.payload.body);
    expect(bodies).toEqual([
      { action: 'team', gameId: 'g_sat', playerId: 'p_rutvij', team: 'B', fieldPosition: 'CM' },
      { action: 'team', gameId: 'g_sat', playerId: 'p_priya', team: 'A', fieldPosition: 'CB' },
    ]);
    // The sample match wears Blue v Red.
    expect(turfChanges(os).sending.map((i) => i.label)).toEqual([expect.stringMatching(/^Rutvij → Red/), expect.stringMatching(/^Priya → Blue/)]);
    expect(sat().data.captainAId).toBeUndefined();
    expect(sat().data.captainBId).toBeUndefined();
    // Goals logged: Karan 4 + Priya 1 for A, Rutvij 2 for B.
    expect(sat().data).toMatchObject({ scoreA: 5, scoreB: 2 });
    expect(saveTeams(os, sat().id, { [app('Karan').id]: 'A' })).toBe(0);
  });

  it('formations: a shape that fits the format, sent and shown; one that doesn’t is refused here', () => {
    expect(validFormation('2-2-1', 6)).toBe(true);
    expect(setFormation(os, sat().id, 'A', '1-2-2')!.payload.body).toEqual({ action: 'formation', gameId: 'g_sat', team: 'A', formation: '1-2-2' });
    expect(sat().data.formationA).toBe('1-2-2');
    expect(() => setFormation(os, sat().id, 'B', '3-3-3')).toThrow(/doesn’t fit 6-a-side/);
  });

  it('kits: names and letters from the colours; a plain shuffle alternates with keepers first', () => {
    expect(kitName('#2f80ed')).toBe('Blue');
    expect(kitsOf(sat().data as never)).toMatchObject({ A: { name: 'Blue', letter: 'B' }, B: { name: 'Red', letter: 'R' } });
    const apps = q<{ gameDate: string; inGoal: boolean }>('appearance').filter((a) => a.data.gameDate === '2026-10-17') as never[];
    const s = shuffleTeams(apps, (a) => (a as { inGoal: boolean }).inGoal, () => 0.3);
    expect(Object.values(s).filter((x) => x === 'A')).toHaveLength(2);
  });
});

describe('players, venues, friends and the money texts (R9c.5)', () => {
  const KEY = `tw_${'k'.repeat(30)}`;
  const src = () => os.registry.sources.get('turf')!;
  /** Turf web stand-in: a new player is p_new, a new venue v_new; the next sync brings them back. */
  const turfWeb = () => {
    const taken: Array<{ id: string; method: string; body: Record<string, unknown> }> = [];
    const pending: TurfSyncPage['tables'] = {};
    let rev = 40;
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('/api/actions')) {
        const { actions } = JSON.parse(String(init!.body)) as { actions: typeof taken };
        const results = actions.map((a) => {
          taken.push(a);
          if (a.body.action === 'player') {
            pending.players = [{ id: 'p_new', name: a.body.name, phone: a.body.phone || null, position: a.body.position || null, kind: a.body.kind, availability_mode: 'regular', weekly_availability: 'all_week', default_availability: 'AVL' }];
            return { id: a.id, status: 201, result: { id: 'p_new' } };
          }
          if (a.body.action === 'venue' && !a.body.id) {
            pending.venues = [{ id: 'v_new', name: a.body.name, side_size: a.body.sideSize, default_cost: a.body.defaultCost, payment_terms: a.body.paymentTerms }];
            return { id: a.id, status: 201, result: { id: 'v_new' } };
          }
          return { id: a.id, status: 200, result: { ok: true } };
        });
        return new Response(JSON.stringify({ results }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const page = delta(rev, rev + 1, { ...pending });
      for (const k of Object.keys(pending)) delete pending[k];
      rev = page.rev;
      return new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    return taken;
  };
  beforeEach(() => {
    applyTurfSync(os, first());
    os.settings.set(TURF_URL, 'https://turf-web.example.dev');
    secrets.set(TURF_KEY, KEY);
  });

  it('a new player is a Person and a profile at once, in the Football group; Turf web’s id replaces the local one', async () => {
    const taken = turfWeb();
    const { profileId, item } = createPlayer(os, { name: 'Dev Patel', phone: '98200 00009', position: 'RB', pace: 4 });
    expect(item.payload).toMatchObject({ method: 'POST', body: { action: 'player', name: 'Dev Patel', phone: '98200 00009', position: 'RB', pace: 4, kind: 'regular' } });
    expect(q('person').find((p) => p.title === 'Dev Patel')).toBeTruthy();
    const group = q<{ memberIds: string[] }>('group')[0]!;
    expect(group.data.memberIds).toContain(person('Dev Patel').id);
    await runSource(os, src());
    expect(taken.map((a) => a.body.action)).toEqual(['player']);
    expect(os.records.get<{ sourceKey: string }>(profileId)!.data.sourceKey).toBe('turf:players:p_new');
    expect(q('player').filter((p) => p.title === 'Dev Patel')).toHaveLength(1);
  });

  it('editing a player sends every field as Turf web’s form does; availability replaces the periods', () => {
    const karan = q('player').find((p) => p.title === 'Karan')!;
    const edit = editPlayer(os, karan.id, { name: 'Karan Mehta', phone: '+919820000003', position: 'Forward', speciality: 'Finishing', jersey: '9' });
    expect(edit.payload).toMatchObject({ method: 'PUT', body: { id: 'p_karan', name: 'Karan Mehta', jerseyNumber: '9', speciality: 'Finishing', pace: null, kind: 'regular' } });
    expect(os.records.get<{ jersey?: string; name: string }>(karan.id)!.data).toMatchObject({ name: 'Karan Mehta', jersey: '9' });
    const av = setAvailability(os, karan.id, { mode: 'regular', weekly: 'weekends', periods: [{ status: 'OOS', startsAt: '2026-11-01', endsAt: '2026-11-08', note: 'Away' }] });
    expect(av.payload.body).toEqual({ action: 'availability', id: 'p_karan', availabilityMode: 'regular', weeklyAvailability: 'weekends', periods: [{ status: 'OOS', startsAt: '2026-11-01', endsAt: '2026-11-08', note: 'Away' }] });
    expect(os.records.get<{ periods: unknown[]; weekly: string }>(karan.id)!.data).toMatchObject({ weekly: 'weekends', periods: [{ status: 'OOS', startsAt: '2026-11-01' }] });
    // Turf web's own copy of the period arrives with an id and replaces the one made here.
    applyTurfSync(os, delta(40, 41, { player_availability_periods: [{ id: 'av_new', player_id: 'p_karan', status: 'OOS', starts_at: '2026-11-01', ends_at: '2026-11-08', note: 'Away' }] }, [{ table: 'player_availability_periods', key: 'av_karan', rev: 41 }]));
    expect(os.records.get<{ periods: Array<{ id?: string }> }>(karan.id)!.data.periods.map((p) => p.id)).toEqual(['av_new']);
    expect(() => setAvailability(os, karan.id, { mode: 'regular', weekly: 'all_week', periods: [{ status: 'INJ', startsAt: '2026-11-08', endsAt: '2026-11-01' }] })).toThrow(/dates/);
  });

  it('venues: a new one (and its Place) gets Turf web’s id; an edit sends the venue’s id; Turf web’s rules apply here first', async () => {
    turfWeb();
    const { venueId } = saveVenue(os, null, { name: 'Green Turf Arena', sideSize: 6, defaultCost: 2000, paymentTerms: 'postpaid' });
    expect(q('place').some((p) => p.title === 'Green Turf Arena')).toBe(true);
    await runSource(os, src());
    expect(os.records.get<{ sourceKey: string }>(venueId)!.data.sourceKey).toBe('turf:venues:v_new');
    expect(q<{ name: string }>('venue').filter((v) => v.data.name === 'Green Turf Arena')).toHaveLength(1);
    const dome = q<{ name: string }>('venue').find((v) => v.data.name === 'Dome Turf')!;
    expect(saveVenue(os, dome.id, { name: 'Dome Turf', sideSize: 5, defaultCost: 1600, paymentTerms: 'prepaid' }).item!.payload.body).toMatchObject({ action: 'venue', id: 'v_dome', defaultCost: 1600, paymentTerms: 'prepaid', advanceAmount: null });
    expect(() => saveVenue(os, null, { name: 'X', sideSize: 10, paymentTerms: 'postpaid' })).toThrow(/ground size/);
    expect(() => saveVenue(os, null, { name: 'X', mapsLink: 'maps.google.com/x', paymentTerms: 'postpaid' })).toThrow(/Maps link/);
  });

  it('a friend’s profile submission waits in To check until Turf web settles it; the audit log is kept', () => {
    applyTurfSync(os, delta(40, 41, {
      profile_submissions: [{ id: 'sub_1', player_id: 'p_karan', invite_id: 'inv_1', payload: JSON.stringify({ position: 'Striker', jerseyNumber: '9', phone: '+919820000003' }), status: 'pending', submitted_at: '2026-10-20T10:00:00Z' }],
      change_log: [{ id: 'c2', created_at: '2026-10-20T09:00:00Z', actor: 'rutvij', device: 'iPhone', kind: 'stats', summary: 'Karan 4G · Sat 17 Oct', game_id: 'g_sat', player_id: 'p_karan', target: '{}' }],
    }));
    const [sub] = pendingSubmissions(os);
    expect(sub).toMatchObject({ id: 'sub_1', name: 'Karan', status: 'pending' });
    expect(submissionChanges(sub!, q<never>('player').find((p) => (p as { title: string }).title === 'Karan')!.data, person('Karan').data).map((c) => c.label)).toEqual(['Position', 'Shirt number']);
    expect(os.filings.toCheck().filter((f) => f.kind === 'turf-submission').map((f) => f.label)).toEqual(['Karan submitted their profile']);
    expect(auditLog(os).map((a) => a.summary)).toEqual(['Karan 4G · Sat 17 Oct', 'Arjun paid ₹200 · Sat 17 Oct']);
    applyTurfSync(os, delta(41, 42, { profile_submissions: [{ id: 'sub_1', player_id: 'p_karan', invite_id: 'inv_1', payload: '{}', status: 'approved' }] }));
    expect(pendingSubmissions(os)).toHaveLength(0);
    expect(os.filings.toCheck().filter((f) => f.kind === 'turf-submission')).toHaveLength(0);
  });

  it('dues and the WhatsApp texts come out of Turf web’s own rules', () => {
    const d = turfDues(os, new Date('2026-10-25T12:00:00+05:30'));
    expect(d.owedToYou.totalCents).toBe(70_000); // Karan ₹450 + Arjun ₹250 on the game you fronted
    expect(d.youOwe.totalCents).toBe(50_000); // your ₹500 to Priya for Wednesday
    const texts = duesTexts(os);
    expect(texts.all).toContain('Karan');
    expect(texts.reminder(person('Arjun').id)).toContain('250');
    const m = matchTexts(os, q<{ date: string }>('game').find((g) => g.data.date === '2026-10-17')!.id)!;
    expect(m.summary).toContain('Playground Arena');
    expect(m.pending).toContain('Karan');
  });

  it('leaders rank like Turf web: goals with Golden Boot tie-breaks', () => {
    const { rows } = leaderTables(os);
    const r = rankLeaders(rows, 'goals');
    expect(r.sorted.slice(0, 2).map((x) => [x.player.name, x.goals])).toEqual([['Karan', 6], ['Priya', 3]]);
    expect(r.places.slice(0, 2)).toEqual([1, 2]);
  });
});

describe('shares paid by SMS (R9c.6)', () => {
  beforeEach(() => applyTurfSync(os, first()));
  const sms = (amount: number, date: string, merchant: string, raw: string) => os.records.create({ object: 'transaction', data: { amount, kind: 'income', category: 'other', date, merchant, rawText: raw } });
  const asks = () => os.filings.toCheck().filter((f) => f.kind === SMS_ASK);
  const paid = () => os.filings.toCheck().filter((f) => f.kind === SMS_PAID);

  it('a new sender is asked about once; Yes records the share and learns them; next time it is recorded on its own, with Undo', () => {
    // Karan owes ₹500 (Wed 14) and ₹450 (Sat 17). A first SMS from an unknown UPI id: asked.
    sms(450, '2026-10-18', 'KARAN MEHTA', 'Rs.450.00 credited to HDFC Bank A/c XX1234 on 18-10-26 from VPA karan.m@okhdfc (UPI 426912345679)');
    expect(asks().map((f) => f.label)).toEqual(['Karan paid ₹450 for Sat, 17 Oct?']);
    expect(asks()[0]!.flag).toMatch(/₹450 in from KARAN MEHTA · SMS/);
    const askId = asks()[0]!.id;
    confirmSmsAsk(os, askId);
    confirmSmsAsk(os, askId); // a second Yes pays nothing more
    expect(appearance('Karan', '2026-10-17').data).toMatchObject({ amountPaid: 450 });
    // The answered question stays until the payment has gone, then leaves To check.
    expect(asks().map((f) => f.id)).toEqual([askId]);
    settleSmsAsk(os, askId);
    expect(asks()).toHaveLength(0);
    expect(os.aliases.lookup('karan.m@okhdfc').map((a) => a.entityId)).toEqual([person('Karan').id]);
    expect(turfChanges(os).sending.map((i) => i.payload.body)).toEqual([expect.objectContaining({ action: 'payment', playerId: 'p_karan', amount: 450, via: 'sms' })]);

    // The same sender pays the Wednesday share: known, exact, in the window — recorded without asking.
    sms(500, '2026-10-19', 'KARAN MEHTA', 'Rs.500.00 credited to HDFC Bank A/c XX1234 on 19-10-26 from VPA karan.m@okhdfc');
    expect(asks()).toHaveLength(0);
    expect(paid().map((f) => f.label)).toEqual([expect.stringMatching(/^Karan paid ₹500 · Wed, 14 Oct/)]);
    expect(appearance('Karan', '2026-10-14').data.amountPaid).toBe(500);
    undoSmsPayment(os, paid()[0]!.id);
    expect(appearance('Karan', '2026-10-14').data.amountPaid).toBe(0);
    expect(paid()).toHaveLength(0);
  });

  it('a smaller amount is asked as a part payment; money from outside the squad or with nothing open is left alone', () => {
    sms(200, '2026-10-18', 'KARAN MEHTA', 'Rs.200.00 credited from VPA karan.m@okhdfc');
    expect(asks().map((f) => f.label)).toEqual(['Karan paid ₹200 of ₹500 for Wed, 14 Oct?']);
    sms(450, '2026-10-18', 'SWIGGY REFUND', 'Rs.450 credited from VPA swiggy@icici');
    sms(999, '2026-12-30', 'KARAN MEHTA', 'Rs.999 credited from VPA karan.m@okhdfc');
    expect(asks()).toHaveLength(1);
  });
});
