import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { createClaudeBrain } from '@core/ai/brainModel';
import { askWithPhoto, cycleAct, cycleCandidates, fileNudge, runPass, setBrainSettings, upkeepCandidates, type BrainModel, type PhotoAsk } from '.';

/** A photo you sent on purpose, and a module that brings its own Cycles. Claude mocked. */

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 2, 9, 0).getTime();
const PHOTO = 'aGVsbG8gZnJpZGdl'; // stands in for a JPEG's base64
let os: LifeOSContext;

const thing = (id: string, brain: boolean): ModuleManifest => ({
  id, name: id, version: '1', description: '', icon: 'x', color: 'teal',
  objects: [{ id: `${id}-thing`, module: id, label: 'Thing', labelPlural: 'Things', icon: 'x', schema: z.object({}).passthrough(), fields: [] }],
  ...(brain ? { brain: { candidates: (o: LifeOSContext, now: number) => cycleCandidates(o, now, id), act: (o: LifeOSContext, verb: Parameters<typeof cycleAct>[1], n: Parameters<typeof cycleAct>[2]) => cycleAct(o, verb, n) } } : {}),
});

beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [thing('mine', true), thing('plain', false)], registry: new Registry() });
});
afterEach(() => os.db.close());

const ask = (): PhotoAsk => ({ module: 'mine', moduleName: 'Mine', why: 'you pressed Snap', what: 'a photo of the fridge', system: 'Look.', prompt: 'Compare.', record: { in_the_fridge: ['Milk', 'Paneer'], use_soon: [] }, schema: { type: 'object' }, image: { mediaType: 'image/jpeg', data: PHOTO } });
const model = (text = '{"not_seen":["Milk"],"found":[],"dish":""}'): BrainModel => ({
  id: 'claude',
  model: 'claude-haiku-5-5',
  complete: vi.fn(async () => ({ text, usage: { input: 1800, output: 40, cacheRead: 0, cacheWrite: 0 } })),
});

describe('a photo sent on purpose', () => {
  it('goes with its records only; the log says a photo left and keeps neither it nor its base64', async () => {
    const m = model();
    const r = await askWithPhoto(os, m, ask(), NOW);
    expect(r).toEqual({ ok: true, answer: { not_seen: ['Milk'], found: [], dish: '' } });
    expect(m.complete).toHaveBeenCalledWith(expect.objectContaining({ image: { mediaType: 'image/jpeg', data: PHOTO } }));
    const [sent] = os.brain.sent.recent();
    expect(sent).toMatchObject({ pass: 'photo', why: 'you pressed Snap', outcome: 'ok', input: 1800 });
    expect(sent!.lines).toEqual(['Mine · a photo of the fridge: read once, not kept', 'Mine · in_the_fridge=Milk/Paneer']);
    expect(JSON.stringify(os.db.all('SELECT * FROM brain_sent'))).not.toContain(PHOTO);
    expect(JSON.stringify(os.db.all('SELECT * FROM brain_learned'))).not.toContain(PHOTO);
  });

  it('no key, the brain off, or over the budget: nothing leaves and nothing is logged', async () => {
    expect(await askWithPhoto(os, null, ask(), NOW)).toEqual({ ok: false, note: 'no key' });
    setBrainSettings(os, { budget: 2000 });
    const m = model();
    expect(await askWithPhoto(os, m, ask(), NOW)).toEqual({ ok: false, note: 'over budget' });
    setBrainSettings(os, { budget: 40_000, on: false });
    expect(await askWithPhoto(os, m, ask(), NOW)).toEqual({ ok: false, note: 'off' });
    expect(m.complete).not.toHaveBeenCalled();
    expect(os.brain.sent.recent()).toEqual([]);
  });

  it('a failed call or an answer that is not JSON is logged as an error', async () => {
    expect(await askWithPhoto(os, model('sorry'), ask(), NOW)).toMatchObject({ ok: false, note: 'error' });
    const broken: BrainModel = { id: 'claude', model: 'x', complete: async () => Promise.reject(new Error('Claude API 500')) };
    expect(await askWithPhoto(os, broken, ask(), NOW)).toMatchObject({ ok: false, note: 'error', error: 'Claude API 500' });
    expect(os.brain.sent.recent().map((e) => e.outcome)).toEqual(['error', 'error']);
  });

  it('over fetch, the photo goes before the text as a base64 image block; no photo, plain text', async () => {
    const bodies: Array<{ messages: Array<{ content: unknown }> }> = [];
    const fetchImpl = vi.fn(async (_u: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '{}' }], stop_reason: 'end_turn', usage: {} }), { status: 200 });
    });
    const claude = createClaudeBrain({ apiKey: 'k', model: 'claude-haiku-5-5', fetchImpl: fetchImpl as unknown as typeof fetch });
    await claude.complete({ system: 's', user: 'Compare.', maxTokens: 10, image: { mediaType: 'image/jpeg', data: PHOTO } });
    await claude.complete({ system: 's', user: 'Text only', maxTokens: 10 });
    expect(bodies[0]!.messages[0]!.content).toEqual([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: PHOTO } }, { type: 'text', text: 'Compare.' }]);
    expect(bodies[1]!.messages[0]!.content).toBe('Text only');
  });
});

describe('a module with a brain brings its own Cycles', () => {
  it('Upkeep leaves them out; the module offers them under the same keys, and Yes marks them done', async () => {
    const mine = os.records.create({ object: 'mine-thing', title: 'Filter', data: {} });
    const plain = os.records.create({ object: 'plain-thing', title: 'Kettle', data: {} });
    const c = os.cycles.create({ entityId: mine.id, name: 'Change', kind: 'fixed', nextDueAt: NOW - 2 * DAY });
    os.cycles.create({ entityId: plain.id, name: 'Descale', kind: 'fixed', nextDueAt: NOW - DAY });
    expect(upkeepCandidates(os, NOW).map((x) => x.title)).toEqual(['Kettle']);
    const own = cycleCandidates(os, NOW, 'mine');
    expect(own.map((x) => [x.title, x.key])).toEqual([['Filter', `upkeep:${c.id}:${NOW - 2 * DAY}`]]);
    expect(own[0]!.payload).toEqual({ cycleId: c.id, template: null });
    const r = await runPass(os, { pass: 'morning', model: null, now: NOW });
    expect(r.filed.map((n) => [n.module, n.title]).sort()).toEqual([['mine', 'Filter'], ['upkeep', 'Kettle']]);
    // Filed once: the same key is not offered again by either.
    expect((await runPass(os, { pass: 'evening', model: null, now: NOW + 1000 })).filed).toEqual([]);
    const n = fileNudge(os, 'mine', { ...own[0]!, key: 'again' }, { passId: 'p', line: 'x', at: NOW });
    const done = cycleAct(os, 'yes', n);
    expect(os.cycles.get(c.id)!.lastDoneAt).not.toBeNull();
    cycleAct(os, 'undo', { ...n, undo: done });
    expect(os.cycles.get(c.id)!.lastDoneAt).toBeNull();
  });

  it('a Cycle due today is offered too (its state is today, not soon)', () => {
    const plain = os.records.create({ object: 'plain-thing', title: 'Bins', data: {} });
    const today = new Date(NOW).setHours(0, 0, 0, 0);
    os.cycles.create({ entityId: plain.id, name: 'Out', kind: 'fixed', nextDueAt: today });
    expect(upkeepCandidates(os, NOW).map((x) => [x.title, x.record.days_left, x.urgent])).toEqual([['Bins', 0, true]]);
  });
});
