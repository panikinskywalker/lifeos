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
import { gamesModule, applyTurfSync, fetchTurfSync, syncTurf, whoOwes, currentGame, statsFor, leaders, lineup, moneyAtAGlance, recordPayment, markPaid, isSending, turfChanges, SETTING_ME, SETTING_REV, TURF_KEY, TURF_URL, type TurfSyncPage } from './index';
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
const appearance = (name: string, date: string) => q<{ personId: string; gameDate: string; paid: boolean; amountPaid?: number; paidOn?: string; rsvp?: string; goals: number }>('appearance').find((a) => a.data.personId === person(name).id && a.data.gameDate === date)!;
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
    await runSource(os, src());
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
