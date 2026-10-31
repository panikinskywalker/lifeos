import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { createClaudeBrain } from '@core/ai/brainModel';
import { answerNudge, brief, gather, moduleLimit, passDue, runPass, setBrainSettings, upkeepCandidates, type BrainDef, type BrainModel, type Candidate } from '.';
import { parseAnswer, systemPrompt, HOUSE_RULES } from './prompt';

/** The brain's pass with Claude mocked: no test calls the API. */

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 31, 7, 30).getTime(); // Sat 31 Oct, 7:30 am
let os: LifeOSContext;

const cand = (key: string, over: Partial<Candidate> = {}): Candidate => ({ key, kind: 'going off', shape: 'check', title: key, line: `${key}: code's words`, record: { thing: key }, ...over });

/** A fake module: its candidates and asks are whatever the test puts here. */
let offered: Record<string, Candidate[]> = {};
let asked: Record<string, ReturnType<NonNullable<BrainDef['asks']>>> = {};
const acted: Array<[string, string, string]> = [];
const fake = (id: string, name: string): ModuleManifest => ({
  id,
  name,
  version: '1',
  description: '',
  icon: 'x',
  color: 'teal',
  objects: [{ id: `${id}-thing`, module: id, label: 'Thing', labelPlural: 'Things', icon: 'x', schema: z.object({}).passthrough(), fields: [] }],
  brain: {
    candidates: () => offered[id] ?? [],
    asks: () => asked[id] ?? [],
    act: (_os, verb, n) => {
      acted.push([id, verb, n.key]);
      if (verb === 'apply') return { put: n.key };
      if (verb === 'yes') return { open: `tel:${n.key}` };
      return null;
    },
    skills: [{ name: name, body: `${name} rules.` }],
  },
});

/** Claude, mocked: answers every nudge with keep and a line of its own, fills every ask. */
function mockModel(over: (user: { nudges: Array<{ id: string; urgent: boolean; asks?: Array<{ id: string; list: boolean }> }>; asks: Array<{ id: string; list: boolean }> }) => Partial<{ nudges: unknown[]; fills: unknown[]; remember: unknown[]; skills: unknown[] }> = () => ({})) {
  const calls: Array<{ system: string; user: string }> = [];
  const model: BrainModel = {
    id: 'claude',
    model: 'claude-opus-5-5',
    complete: vi.fn(async ({ system, user }) => {
      calls.push({ system, user });
      const u = JSON.parse(user);
      const allAsks = [...u.asks, ...u.nudges.flatMap((n: { asks?: unknown[] }) => n.asks ?? [])];
      const base = {
        nudges: u.nudges.map((n: { id: string }) => ({ id: n.id, keep: true, line: `Claude: ${n.id} \u2014 worded` })),
        fills: allAsks.map((a: { id: string; list: boolean }) => ({ id: a.id, text: a.list ? '' : `text for ${a.id}`, items: a.list ? ['one', 'two'] : [] })),
        remember: [],
        skills: [],
        ...over(u),
      };
      return { text: JSON.stringify(base), usage: { input: 300, output: 120, cacheRead: 1500, cacheWrite: 0 } };
    }),
  };
  return { model, calls };
}

beforeEach(async () => {
  bus.clear();
  offered = {};
  asked = {};
  acted.length = 0;
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [fake('home', 'Home'), fake('people', 'People')], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('the limits', () => {
  it('two a module a day, urgent first then soonest; another module keeps its own two', async () => {
    offered.home = [cand('a', { rank: 3 }), cand('b', { rank: 1 }), cand('c', { rank: 2, urgent: true }), cand('d', { rank: 0 })];
    offered.people = [cand('p1'), cand('p2'), cand('p3')];
    const g = gather(os, NOW);
    expect(g.nudges.filter((x) => x.b.module === 'home').map((x) => x.c.key)).toEqual(['c', 'd']);
    expect(g.nudges.filter((x) => x.b.module === 'people')).toHaveLength(2);
  });

  it('what was filed today counts: the evening pass files only what is left of the two', async () => {
    offered.home = [cand('a', { rank: 0 })];
    await runPass(os, { pass: 'morning', model: null, now: NOW });
    expect(moduleLimit(os, 'home', NOW)).toBe(1);
    offered.home = [cand('a', { rank: 0 }), cand('b', { rank: 1 }), cand('c', { rank: 2 })];
    const r = await runPass(os, { pass: 'evening', model: null, now: NOW + 12 * 3600_000 });
    expect(r.filed.map((n) => n.key)).toEqual(['b']);
    expect(moduleLimit(os, 'home', NOW + DAY)).toBe(2);
  });

  it('a module whose nudges you keep turning down gets one a day', async () => {
    for (let i = 0; i < 3; i++) {
      offered.home = [cand(`x${i}`)];
      const r = await runPass(os, { pass: 'manual', model: null, now: NOW + i * DAY });
      answerNudge(os, r.filed[0]!.id, 'no');
    }
    expect(moduleLimit(os, 'home', NOW + 3 * DAY)).toBe(1);
    expect(moduleLimit(os, 'people', NOW + 3 * DAY)).toBe(2);
  });

  it('at most three notifications a day, urgent ones take the slots first', async () => {
    const notify = vi.fn(async () => 'n');
    os.notify = notify;
    offered.home = [cand('h1', { urgent: false, rank: 0 }), cand('h2', { urgent: true, rank: 5 })];
    offered.people = [cand('p1', { urgent: true }), cand('p2')];
    const r = await runPass(os, { pass: 'morning', model: null, now: NOW });
    expect(r.filed).toHaveLength(4);
    expect(r.notified).toBe(3);
    const bodies = (notify.mock.calls as unknown as Array<[{ body: string }]>).map((c) => c[0].body);
    expect(bodies.slice(0, 2).sort()).toEqual(["h2: code's words", "p1: code's words"]);
    offered.people = [cand('p3', { urgent: true })];
    expect((await runPass(os, { pass: 'evening', model: null, now: NOW + 3600_000 })).notified).toBe(0);
  });
});

describe('the pass', () => {
  it('files a nudge per candidate into To check, in Claude’s words, with no em dash', async () => {
    offered.home = [cand('paneer', { subjectId: null, urgent: true })];
    const { model, calls } = mockModel();
    const r = await runPass(os, { pass: 'morning', model, now: NOW });
    expect(r.called).toBe(true);
    expect(r.filed[0]!.line).toBe('Claude: n1, worded');
    const f = os.filings.toCheck();
    expect(f.map((x) => [x.kind, x.source, x.sourceRef, x.label])).toEqual([['nudge-check', 'brain', r.passId, 'Claude: n1, worded']]);
    expect(os.brain.nudges.forFiling(f[0]!.id)!.key).toBe('paneer');
    // The cached part is house rules and Skills; the records go in the user message.
    expect(calls[0]!.system.startsWith(HOUSE_RULES)).toBe(true);
    expect(calls[0]!.system).toContain('## home / Home\nHome rules.');
    expect(JSON.parse(calls[0]!.user).nudges[0]).toMatchObject({ id: 'n1', module: 'Home', kind: 'going off', urgent: true, record: { thing: 'paneer' } });
  });

  it('a key is filed once; Not this keeps it from coming back', async () => {
    offered.home = [cand('a'), cand('b')];
    const r = await runPass(os, { pass: 'morning', model: null, now: NOW });
    answerNudge(os, r.filed.find((n) => n.key === 'b')!.id, 'no');
    expect(os.brain.learned.has('not-this:b')).toBe(true);
    const next = await runPass(os, { pass: 'morning', model: null, now: NOW + DAY });
    expect(next.filed).toEqual([]);
    expect(next.note).toBe('nothing new');
  });

  it('nothing new calls no one', async () => {
    const { model } = mockModel();
    const r = await runPass(os, { pass: 'morning', model, now: NOW });
    expect(r).toMatchObject({ called: false, note: 'nothing new' });
    expect(model.complete).not.toHaveBeenCalled();
  });

  it('without a key, the nudges are filed in code’s words', async () => {
    offered.home = [cand('a')];
    const r = await runPass(os, { pass: 'morning', model: null, now: NOW });
    expect(r).toMatchObject({ called: false, note: 'no key' });
    expect(r.filed[0]!.line).toBe("a: code's words");
    expect(os.brain.sent.recent()).toEqual([]);
  });

  it('over the daily budget: no call, code’s words, nothing logged as sent', async () => {
    setBrainSettings(os, { budget: 500 });
    offered.home = [cand('a')];
    const { model } = mockModel();
    const r = await runPass(os, { pass: 'morning', model, now: NOW });
    expect(r.note).toBe('over budget');
    expect(model.complete).not.toHaveBeenCalled();
    expect(r.filed[0]!.line).toBe("a: code's words");
  });

  it('the budget counts today’s sends, cache reads at a tenth', async () => {
    offered.home = [cand('a')];
    const { model } = mockModel();
    await runPass(os, { pass: 'morning', model, now: NOW });
    expect(os.brain.sent.tokensToday(NOW)).toBe(300 + 120 + 150);
    expect(os.brain.sent.tokensToday(NOW + DAY)).toBe(0);
  });

  it('Claude may hold one back for today (not urgent ones); it comes back tomorrow', async () => {
    offered.home = [cand('a', { rank: 0 }), cand('b', { rank: 1, urgent: true })];
    const { model } = mockModel((u) => ({ nudges: u.nudges.map((n) => ({ id: n.id, keep: false, line: 'drop' })) }));
    const r = await runPass(os, { pass: 'morning', model, now: NOW });
    expect(r.filed.map((n) => n.key)).toEqual(['b']);
    expect((await runPass(os, { pass: 'evening', model: null, now: NOW + 3600_000 })).filed).toEqual([]);
    expect((await runPass(os, { pass: 'morning', model: null, now: NOW + DAY })).filed.map((n) => n.key)).toEqual(['a']);
  });

  it('a failed call is logged and the nudges still come, in code’s words', async () => {
    offered.home = [cand('a')];
    const model: BrainModel = { id: 'claude', model: 'm', complete: async () => { throw new Error('Claude API 500: down'); } };
    const r = await runPass(os, { pass: 'morning', model, now: NOW });
    expect(r).toMatchObject({ note: 'error', called: true });
    expect(r.filed[0]!.line).toBe("a: code's words");
    expect(os.brain.sent.recent()[0]).toMatchObject({ outcome: 'error', error: 'Claude API 500: down' });
  });

  it('the Sent to Claude log holds what left, field by field', async () => {
    offered.people = [cand('bday', { kind: 'coming up', record: { name: 'Karan Shah', turns: 30, likes: ['filter coffee', 'RCB'] } })];
    const { model } = mockModel();
    await runPass(os, { pass: 'morning', model, now: NOW, why: 'morning pass' });
    const [s] = os.brain.sent.recent();
    expect(s).toMatchObject({ pass: 'morning', why: 'morning pass', model: 'claude-opus-5-5', records: 1, input: 300, output: 120, cacheRead: 1500, outcome: 'ok' });
    expect(s!.lines).toEqual(['People · coming up · name=Karan Shah, turns=30, likes=filter coffee/RCB']);
  });
});

describe('the learned store', () => {
  it('an answer already known never calls Claude again', async () => {
    asked.home = [{ key: 'dish:abc', slot: 'cook tonight', prompt: 'a dish', record: { use_soon: ['paneer'] }, brief: true }];
    const { model } = mockModel();
    await runPass(os, { pass: 'morning', model, now: NOW });
    expect(os.brain.learned.get('dish:abc')).toBe('text for a1');
    await runPass(os, { pass: 'evening', model, now: NOW + 12 * 3600_000 });
    expect(model.complete).toHaveBeenCalledTimes(1);
  });

  it('asks on a nudge go with it, and only the unanswered ones', async () => {
    os.brain.learned.put('gifts:k', ['a book'], { module: 'people' });
    offered.people = [cand('bday', { asks: [{ key: 'gifts:k', slot: 'gift ideas', prompt: 'gifts', list: true }, { key: 'wish:k', slot: 'wish', prompt: 'a wish' }] })];
    const { model, calls } = mockModel();
    await runPass(os, { pass: 'morning', model, now: NOW });
    expect(JSON.parse(calls[0]!.user).nudges[0].asks.map((a: { slot: string }) => a.slot)).toEqual(['wish']);
    expect(os.brain.learned.get('wish:k')).toBe('text for a1');
    expect(os.brain.learned.get('gifts:k')).toEqual(['a book']);
  });

  it('keeps what Claude says to remember, and the Skills it adds', async () => {
    offered.home = [cand('a')];
    const { model } = mockModel(() => ({ remember: [{ key: 'inventory.life:paneer', module: 'home', value: '4' }], skills: [{ module: 'home', name: 'Mornings', body: 'Rutvij cooks at night.' }] }));
    await runPass(os, { pass: 'morning', model, now: NOW });
    expect(os.brain.learned.all({ kinds: ['fact'] }).map((l) => [l.key, l.value, l.source])).toEqual([['inventory.life:paneer', '4', 'claude']]);
    expect(os.brain.skills.all().map((s) => [s.id, s.source])).toEqual([['home/Home', 'code'], ['home/Mornings', 'claude'], ['people/People', 'code'], ['upkeep/Upkeep', 'code']]);
  });

  it('a Skill you changed is not overwritten by code’s seed', async () => {
    os.brain.skills.put({ module: 'home', name: 'Home', body: 'Mine.', source: 'you' });
    offered.home = [cand('a')];
    await runPass(os, { pass: 'morning', model: null, now: NOW });
    expect(os.brain.skills.all().find((s) => s.id === 'home/Home')!.body).toBe('Mine.');
  });
});

describe('the cards', () => {
  it('done, undo?: applied at filing, undone from the card', async () => {
    offered.home = [cand('butter', { kind: 'running out', shape: 'done' })];
    const [n] = (await runPass(os, { pass: 'morning', model: null, now: NOW })).filed;
    expect(n!.undo).toEqual({ put: 'butter' });
    expect(os.filings.toCheck()[0]!.kind).toBe('nudge-done');
    answerNudge(os, n!.id, 'undo');
    expect(acted.map((a) => a[1])).toEqual(['apply', 'undo']);
    expect(os.filings.toCheck()).toEqual([]);
    expect(os.brain.nudges.get(n!.id)!.state).toBe('undone');
  });

  it('shall I?: Yes runs the module’s verb and hands back what to open; Later only ticks', async () => {
    offered.people = [cand('karan', { shape: 'ask', yes: 'Call', rank: 0 }), cand('dad', { shape: 'ask', rank: 1 })];
    const [a, b] = (await runPass(os, { pass: 'morning', model: null, now: NOW })).filed;
    expect(answerNudge(os, a!.id, 'yes')).toEqual({ open: 'tel:karan' });
    expect(answerNudge(os, b!.id, 'later')).toEqual({});
    expect(acted.map((x) => x[1])).toEqual(['yes']);
    expect(os.filings.toCheck()).toEqual([]);
    expect(answerNudge(os, a!.id, 'yes')).toBeNull();
  });
});

describe('when, and the Morning brief', () => {
  it('the morning pass from 7, the evening one from 7 pm, once a day each', async () => {
    expect(passDue(os, new Date(2026, 9, 31, 6, 59).getTime())).toBeNull();
    expect(passDue(os, NOW)).toBe('morning');
    await runPass(os, { pass: 'morning', model: null, now: NOW });
    expect(passDue(os, NOW + 3600_000)).toBeNull();
    const seven = new Date(2026, 9, 31, 19, 5).getTime();
    expect(passDue(os, seven)).toBe('evening');
    await runPass(os, { pass: 'evening', model: null, now: seven });
    expect(passDue(os, seven + 3600_000)).toBeNull();
    expect(passDue(os, NOW + DAY)).toBe('morning');
    setBrainSettings(os, { on: false });
    expect(passDue(os, NOW + DAY)).toBeNull();
  });

  it('a phone that slept through the morning runs the evening pass, and that stands for both', async () => {
    const late = new Date(2026, 9, 31, 20, 0).getTime();
    expect(passDue(os, late)).toBe('evening');
    await runPass(os, { pass: 'evening', model: null, now: late });
    expect(passDue(os, late + 60_000)).toBeNull();
  });

  it('the brief: today’s nudges urgent first, Not this left out, the dish line, and the last pass', async () => {
    const thing = os.records.create({ object: 'home-thing', title: 'Paneer', data: {} });
    offered.home = [cand('later'), cand('paneer', { urgent: true, subjectId: thing.id })];
    offered.people = [cand('nope', { route: '/board/turf/dues' })];
    asked.home = [{ key: 'dish:1', slot: 'cook tonight', prompt: 'p', brief: true, route: '/module/home/index' }, { key: 'gifts:1', slot: 'gift ideas', prompt: 'p', list: true }];
    const { model } = mockModel();
    const r = await runPass(os, { pass: 'morning', model, now: NOW });
    answerNudge(os, r.filed.find((n) => n.key === 'nope')!.id, 'no');
    const b = brief(os, NOW + 60_000);
    expect(b.lines.map((l) => [l.text, l.route])).toEqual([
      ['Claude: n1, worded', `/entity/home-thing/${thing.id}`],
      ['Claude: n2, worded', '/check'],
      ['Cook tonight: text for a1', '/module/home/index'],
    ]);
    expect(b.pass).toMatchObject({ pass: 'morning', at: NOW });
    expect(brief(os, NOW + DAY).lines.map((l) => l.text)).toEqual(['Cook tonight: text for a1']);
  });
});

describe('Upkeep’s candidates (core)', () => {
  it('due and late Cycles of modules without a brain of their own; Yes marks it done, Undo puts it back', async () => {
    const core = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [fake('home', 'Home'), { id: 'kit', name: 'Kit', version: '1', description: '', icon: 'x', color: 'teal', objects: [{ id: 'gadget', module: 'kit', label: 'Gadget', labelPlural: 'Gadgets', icon: 'x', schema: z.object({}).passthrough(), fields: [] }] }], registry: new Registry() });
    const filter = core.records.create({ object: 'gadget', title: 'Water filter', data: {} });
    const mine = core.records.create({ object: 'home-thing', title: 'Has a brain', data: {} });
    const c = core.cycles.create({ entityId: filter.id, name: 'Change the filter', kind: 'fixed', nextDueAt: NOW - 3 * DAY });
    core.cycles.create({ entityId: mine.id, name: 'Skip me', kind: 'fixed', nextDueAt: NOW - DAY });
    core.cycles.create({ entityId: filter.id, name: 'Far off', kind: 'fixed', nextDueAt: NOW + 90 * DAY });
    const cands = upkeepCandidates(core, NOW);
    expect(cands.map((x) => [x.title, x.kind, x.shape, x.urgent])).toEqual([['Water filter', 'due', 'ask', true]]);
    expect(cands[0]!.record).toMatchObject({ thing: 'Water filter', cycle: 'Change the filter', days_left: -3 });
    const r = await runPass(core, { pass: 'morning', model: null, now: NOW });
    expect(r.filed.map((n) => n.module)).toEqual(['upkeep']);
    answerNudge(core, r.filed[0]!.id, 'yes');
    expect(core.cycles.get(c.id)!.lastDoneAt).not.toBeNull();
    core.db.close();
  });
});

describe('Claude over fetch (mocked)', () => {
  it('caches the system prompt, asks for the JSON schema, opts into fallbacks, reads usage', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: { body: string; headers: Record<string, string> }) => {
      void init;
      return new Response(JSON.stringify({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: '{"nudges":[],"fills":[],"remember":[],"skills":[]}' }], stop_reason: 'end_turn', usage: { input_tokens: 40, output_tokens: 9, cache_read_input_tokens: 1200, cache_creation_input_tokens: 0 } }), { status: 200 });
    });
    const m = createClaudeBrain({ apiKey: 'sk-test', fetchImpl: fetchImpl as unknown as typeof fetch });
    const r = await m.complete({ system: systemPrompt([]), user: '{}', maxTokens: 100, schema: { type: 'object' } });
    expect(r.usage).toEqual({ input: 40, output: 9, cacheRead: 1200, cacheWrite: 0 });
    expect(parseAnswer(r.text)).toEqual({ nudges: [], fills: [], remember: [], skills: [] });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'claude-opus-5-5', system: [{ type: 'text', cache_control: { type: 'ephemeral' } }], output_config: { effort: 'medium', format: { type: 'json_schema' } }, fallbacks: 'default' });
    expect(body.temperature).toBeUndefined();
    expect(init.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
    expect(init.headers['x-api-key']).toBe('sk-test');
  });

  it('a refusal is an error, with its usage kept', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ content: [], stop_reason: 'refusal', usage: { input_tokens: 10, output_tokens: 0 } }), { status: 200 });
    const m = createClaudeBrain({ apiKey: 'k', model: 'claude-haiku-5-5', fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(m.complete({ system: 's', user: 'u', maxTokens: 10 })).rejects.toMatchObject({ usage: { input: 10 } });
  });
});

describe('quiet hours', () => {
  it('a nudge filed inside quiet hours waits for them to end, and stays in the notification plan', async () => {
    const { notificationPlan } = await import('@core/notify/plan');
    const notify = vi.fn(async () => 'n');
    os.notify = notify;
    offered.home = [cand('paneer', { urgent: true })];
    const early = new Date(2026, 9, 31, 7, 0).getTime(); // quiet until 7:30 by default
    await runPass(os, { pass: 'morning', model: null, now: early });
    const end = new Date(2026, 9, 31, 7, 30).getTime();
    expect((notify.mock.calls as unknown as Array<[{ at?: number }]>)[0]![0].at).toBe(end);
    expect(notificationPlan(os, early).filter((p) => p.kind === 'nudge').map((p) => [p.at, p.body, p.title])).toEqual([[end, "paneer: code's words", 'Home']]);
    expect(notificationPlan(os, end + 1).filter((p) => p.kind === 'nudge')).toEqual([]);
  });
});

describe('which model', () => {
  it('Opus on the first day the brain runs, Haiku from the next; Opus can be turned on for one more day', async () => {
    const { brainModelId, setModelForToday } = await import('.');
    expect(brainModelId(os, NOW)).toBe('claude-opus-5-5');
    expect(brainModelId(os, NOW + 3600_000)).toBe('claude-opus-5-5');
    expect(brainModelId(os, NOW + DAY)).toBe('claude-haiku-5-5');
    setModelForToday(os, 'claude-opus-5-5', NOW + 5 * DAY);
    expect(brainModelId(os, NOW + 5 * DAY)).toBe('claude-opus-5-5');
    expect(brainModelId(os, NOW + 6 * DAY)).toBe('claude-haiku-5-5');
    setModelForToday(os, null, NOW + 6 * DAY);
    expect(brainModelId(os, NOW + 6 * DAY)).toBe('claude-haiku-5-5');
  });

  it('someone who already set the brain up does not get a surprise Opus day', () => {
    setBrainSettings(os, { budget: 20_000 });
    return import('.').then(({ brainModelId }) => expect(brainModelId(os, NOW)).toBe('claude-haiku-5-5'));
  });
});
