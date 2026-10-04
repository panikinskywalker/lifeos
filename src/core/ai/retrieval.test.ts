import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { LifeOSContext } from '../registry/context';
import type { ModuleManifest } from '../registry/types';
import { bus } from '../events/bus';
import { buildContext, historyWindow } from './retrieval';
import { Assistant } from './assistant';
import type { ChatMessage, LLMProvider } from './provider';

const mod: ModuleManifest = {
  id: 'm', name: 'M', version: '1', description: '', icon: 'x', color: '#000',
  objects: [
    { id: 'vehicle', module: 'm', label: 'Vehicle', labelPlural: 'Vehicles', icon: 'car', schema: z.object({ name: z.string(), plate: z.string().optional() }), fields: [{ key: 'name', label: 'Name', type: 'text' }, { key: 'plate', label: 'Registration', type: 'text' }], computeTitle: (x) => String(x.name) },
    { id: 'person', module: 'm', label: 'Person', labelPlural: 'People', icon: 'user', schema: z.object({ name: z.string() }), fields: [{ key: 'name', label: 'Name', type: 'text' }], computeTitle: (x) => String(x.name) },
  ],
};
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('retrieval', () => {
  it('packs matching facts, the record in question (cycles, timeline, facts) and other hits', () => {
    const car = os.records.create({ object: 'vehicle', data: { name: 'Creta', plate: 'KA 05 MZ 1234' } });
    os.cycles.create({ entityId: car.id, name: 'Service', kind: 'interval', everyN: 6, everyUnit: 'month', nextDueAt: Date.now() + 5 * 864e5 });
    os.facts.add({ text: 'The Creta is serviced at Hyundai Indiranagar', subjectId: car.id, source: 'talk' });
    os.facts.add({ text: 'Priya prefers window seats', source: 'talk' });
    const ctx = buildContext(os, 'when is the creta service due?');
    expect(ctx).toContain('Records this message is probably about');
    expect(ctx).toContain('Creta [Vehicle');
    expect(ctx).toMatch(/cycles: Service \(cycleId [^)]+\) ok, in 5 d/);
    expect(ctx).toContain('Hyundai Indiranagar');
    expect(ctx).not.toContain('window seats');
    expect(buildContext(os, 'zzz nothing')).toBe('');
    expect(buildContext(os, 'creta service', { budget: 120 }).length).toBeLessThanOrEqual(200);
  });

  it('history window keeps tool pairs whole', () => {
    const h: ChatMessage[] = [];
    for (let i = 0; i < 5; i++) {
      h.push({ role: 'user', content: `q${i}` });
      h.push({ role: 'assistant', content: [{ type: 'tool_use', id: `t${i}`, name: 'x', input: {} }] });
      h.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: `t${i}`, content: '{}' }] });
      h.push({ role: 'assistant', content: [{ type: 'text', text: `a${i}` }] });
    }
    const w = historyWindow(h, 2);
    expect(w[0]).toEqual({ role: 'user', content: 'q3' });
    expect(w).toHaveLength(8);
    expect(historyWindow(h, 99)).toBe(h);
  });

  it('the assistant sends retrieved context in the system prompt', async () => {
    os.facts.add({ text: 'Dad hates surprises', source: 'talk' });
    let system = '';
    const provider: LLMProvider = { id: 'x', complete: async (a) => { system = a.system; return { content: [{ type: 'text', text: 'ok' }], stopReason: 'end_turn' }; } };
    await new Assistant(os, { provider }).send('plan something for dad, he hates surprises?');
    expect(system).toContain('Things the user told you before');
    expect(system).toContain('Dad hates surprises');
  });
});
