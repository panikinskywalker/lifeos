import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { LifeOSContext } from '../registry/context';
import type { ModuleManifest } from '../registry/types';
import { bus } from '../events/bus';
import { Assistant, type AssistantTurn } from './assistant';
import type { CompletionResult, LLMProvider } from './provider';
import { lifeTools, pickCycle, resolveCandidates, clearMatch } from './lifeTools';
import { extrasOf } from './cards';

const d = (s: string) => new Date(`${s}T10:00:00`).getTime();
const mod: ModuleManifest = {
  id: 'things', name: 'Things', version: '1', description: '', icon: 'x', color: '#000',
  entityTypes: [
    { type: 'vehicle', module: 'things', label: 'Vehicle', labelPlural: 'Vehicles', icon: 'car', schema: z.object({ name: z.string(), odometerKm: z.number().optional() }), fields: [{ key: 'name', label: 'Name', type: 'text' }], computeTitle: (x) => String(x.name), meters: [{ meter: 'odometer', field: 'odometerKm', label: 'Odometer', unit: 'km' }] },
    { type: 'person', module: 'things', label: 'Person', labelPlural: 'People', icon: 'user', schema: z.object({ name: z.string() }), fields: [], computeTitle: (x) => String(x.name) },
    { type: 'item', module: 'things', label: 'Item', labelPlural: 'Items', icon: 'box', schema: z.object({ name: z.string() }), fields: [], computeTitle: (x) => String(x.name) },
  ],
};
const tool = (name: string) => lifeTools.find((t) => t.name === name)!;
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('resolve_entity', () => {
  it('"the car" is your only vehicle; ambiguous names come back as candidates', async () => {
    const creta = os.entities.create({ type: 'vehicle', data: { name: 'Hyundai Creta' } });
    os.entities.create({ type: 'person', data: { name: 'Priya Sharma' } });
    os.entities.create({ type: 'person', data: { name: 'Priya Menon' } });
    expect(clearMatch(resolveCandidates(os, 'the car'))?.id).toBe(creta.id);
    expect(clearMatch(resolveCandidates(os, 'creta'))?.id).toBe(creta.id);
    const r = (await tool('resolve_entity').run({ text: 'Priya' }, os)) as { match?: unknown; candidates?: Array<{ title: string }> };
    expect(r.match).toBeUndefined();
    expect(r.candidates!.map((c) => c.title).sort()).toEqual(['Priya Menon', 'Priya Sharma']);
  });
});

describe('cycle tools', () => {
  it('log_event rolls the matching cycle with cost + odometer, and undo puts it back', async () => {
    const car = os.entities.create({ type: 'vehicle', data: { name: 'Creta' } });
    const svc = os.cycles.create({ entityId: car.id, name: 'Service', kind: 'either', everyN: 6, everyUnit: 'month', meterEvery: 10000, nextDueAt: d('2026-10-01') });
    os.cycles.create({ entityId: car.id, name: 'Insurance renewal', kind: 'fixed', everyN: 1, everyUnit: 'year', nextDueAt: d('2026-12-01') });
    expect(tool('log_event').confirm).toBeTypeOf('function');
    expect((tool('log_event').confirm as (i: unknown) => boolean)({ cost: 6400 })).toBe(true);
    const out = await tool('log_event').run({ entityId: car.id, what: 'service', date: '2026-09-20', cost: 6400, meter: 34200, note: 'Hyundai Indiranagar' }, os);
    expect(out).toMatchObject({ cycleRolled: true, expenseFiled: false });
    expect(os.cycles.get(svc.id)!.nextDueMeter).toBe(44200);
    expect(os.cycles.latestMeter(car.id)).toBe(34200);
    const { undo, card } = extrasOf(out);
    expect(card).toMatchObject({ kind: 'cycle', cycleId: svc.id });
    undo!();
    expect(os.cycles.get(svc.id)!.nextDueAt).toBe(d('2026-10-01'));
    expect(os.cycles.latestMeter(car.id)).toBeNull();
  });

  it('a phrase that matches no cycle is just an event — "washed the car" never rolls the service', async () => {
    const car = os.entities.create({ type: 'vehicle', data: { name: 'Creta' } });
    const svc = os.cycles.create({ entityId: car.id, name: 'Service', kind: 'interval', everyN: 6, everyUnit: 'month', nextDueAt: d('2026-10-01') });
    expect(pickCycle(os, car.id, 'wash')).toBeNull();
    const out = await tool('log_event').run({ entityId: car.id, what: 'Wash' }, os);
    expect(out).toMatchObject({ cycleRolled: false });
    expect(os.cycles.get(svc.id)!.nextDueAt).toBe(d('2026-10-01'));
    expect(os.entities.timeline.forEntity(car.id).some((e) => e.kind === 'event' && e.title === 'Wash')).toBe(true);
  });

  it('mark_cycle_done, set_next_due and log_meter each undo cleanly', async () => {
    const car = os.entities.create({ type: 'vehicle', data: { name: 'Creta' } });
    const c = os.cycles.create({ entityId: car.id, name: 'Wash', kind: 'interval', everyN: 3, everyUnit: 'week', nextDueAt: d('2026-09-20') });
    const done = await tool('mark_cycle_done').run({ entityId: car.id, date: '2026-09-21' }, os);
    expect(os.cycles.stats(c.id).count).toBe(1);
    extrasOf(done).undo!();
    expect(os.cycles.stats(c.id).count).toBe(0);
    const set = await tool('set_next_due').run({ cycleId: c.id, date: '2026-09-30' }, os);
    expect(os.cycles.get(c.id)!.nextDueAt).toBe(new Date('2026-09-30T09:00:00').getTime());
    extrasOf(set).undo!();
    expect(os.cycles.get(c.id)!.nextDueAt).toBe(d('2026-09-20'));
    const m = await tool('log_meter').run({ entityId: car.id, value: 30100 }, os);
    expect(os.entities.get<{ odometerKm: number }>(car.id)!.data.odometerKm).toBe(30100);
    extrasOf(m).undo!();
    expect(os.cycles.latestMeter(car.id)).toBeNull();
  });
});

describe('assistant loop', () => {
  it('lifts cards and undo onto tool turns; the model never sees them', async () => {
    const car = os.entities.create({ type: 'vehicle', data: { name: 'Creta' } });
    const sent: string[] = [];
    const script: CompletionResult[] = [
      { content: [{ type: 'tool_use', id: 't1', name: 'log_meter', input: { entityId: car.id, value: 31000 } }], stopReason: 'tool_use' },
      { content: [{ type: 'text', text: 'Logged 31,000 km.' }], stopReason: 'end_turn' },
    ];
    const provider: LLMProvider = { id: 'script', complete: async ({ messages }) => { sent.push(JSON.stringify(messages[messages.length - 1])); return script.shift()!; } };
    const turns: AssistantTurn[] = [];
    await new Assistant(os, { provider, onTurn: (t) => turns.push(t) }).send('Creta is at 31,000');
    const t = turns.find((x) => x.role === 'tool')!;
    expect(t.card).toMatchObject({ kind: 'record', entityId: car.id });
    expect(t.undo).toBeTypeOf('function');
    expect(sent[1]).toContain('Odometer 31000');
    expect(sent[1]).not.toContain('undo');
  });
});

describe('confirmation policy', () => {
  it('money & people ask; everything else runs with Undo; a declined confirm changes nothing', async () => {
    const create = os.registry.aiTools.get('create_entity')!;
    const ask = create.confirm as (i: unknown, o: LifeOSContext) => boolean;
    expect(ask({ type: 'item' }, os)).toBe(false);
    expect(ask({ type: 'person' }, os)).toBe(true);
    expect(ask({ type: 'transaction' }, os)).toBe(true);

    const summaries: string[] = [];
    const script: CompletionResult[] = [
      { content: [{ type: 'tool_use', id: 'a', name: 'create_entity', input: { type: 'person', data: { name: 'Suresh' } } }, { type: 'tool_use', id: 'b', name: 'create_entity', input: { type: 'item', data: { name: 'Umbrella' } } }], stopReason: 'tool_use' },
      { content: [{ type: 'text', text: 'ok' }], stopReason: 'end_turn' },
    ];
    const provider: LLMProvider = { id: 's', complete: async () => script.shift()! };
    const turns: AssistantTurn[] = [];
    await new Assistant(os, { provider, onTurn: (t) => turns.push(t), confirm: async (_d, _i, summary) => { summaries.push(summary); return false; } }).send('add Suresh and my umbrella');
    expect(summaries).toEqual(['Add person: Suresh']);
    expect(os.entities.query('person')).toHaveLength(0);
    const tools = turns.filter((t) => t.role === 'tool');
    expect(tools[0]).toMatchObject({ isError: true });
    expect(tools[1]!.undo).toBeTypeOf('function');
    expect(os.entities.query('item')).toHaveLength(1);
    tools[1]!.undo!();
    expect(os.entities.query('item')).toHaveLength(0);
  });

  it('update undo restores the previous values and only the tags it added', async () => {
    const e = os.entities.create({ type: 'item', data: { name: 'Umbrella' } });
    os.tags.apply(e.id, 'rain');
    const out = await os.registry.aiTools.get('update_entity')!.run({ id: e.id, data: { name: 'Big umbrella' }, addTags: ['car'] }, os);
    expect(os.entities.get(e.id)!.title).toBe('Big umbrella');
    extrasOf(out).undo!();
    expect(os.entities.get(e.id)!.title).toBe('Umbrella');
    expect(os.tags.forEntity(e.id).map((t) => t.name)).toEqual(['rain']);
  });
});

describe('learned aliases', () => {
  it('after the user picks one, the alias resolves straight to it; forgetting undoes it', async () => {
    const city = os.entities.create({ type: 'vehicle', data: { name: 'Honda City' } });
    os.entities.create({ type: 'vehicle', data: { name: 'Hyundai Creta' } });
    expect(clearMatch(resolveCandidates(os, 'the car'))).toBeNull(); // two vehicles: ambiguous
    const out = await tool('remember_alias').run({ alias: 'the car', entityId: city.id }, os);
    const r = (await tool('resolve_entity').run({ text: 'serviced the car today' }, os)) as { match?: { id: string; why: string } };
    expect(r.match).toMatchObject({ id: city.id, why: 'you call it "the car"' });
    expect(os.aliases.lookup('cartoon')).toEqual([]); // word boundaries
    extrasOf(out).undo!();
    expect(clearMatch(resolveCandidates(os, 'the car'))).toBeNull();
  });

  it('learning the same alias again counts uses instead of duplicating', () => {
    const dad = os.entities.create({ type: 'person', data: { name: 'Ramesh Rao' } });
    os.aliases.learn('Dad', dad.id);
    os.aliases.learn('dad!', dad.id);
    expect(os.aliases.forEntity(dad.id)).toEqual([expect.objectContaining({ uses: 2 })]);
    os.entities.delete(dad.id);
    expect(os.aliases.lookup('call dad')).toEqual([]);
  });
});
