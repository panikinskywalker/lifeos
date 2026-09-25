import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { LifeOSContext } from '../registry/context';
import type { ModuleManifest } from '../registry/types';
import { bus } from '../events/bus';
import { mineFacts, parseMined } from './factMiner';
import { lifeTools } from './lifeTools';
import { extrasOf } from './cards';
import { Assistant } from './assistant';
import type { LLMProvider } from './provider';

const mod: ModuleManifest = { id: 'p', name: 'P', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [{ type: 'person', module: 'p', label: 'Person', labelPlural: 'People', icon: 'user', schema: z.object({ name: z.string() }), fields: [], computeTitle: (x) => String(x.name) }] };
const replying = (text: string): LLMProvider => ({ id: 'fake', complete: async () => ({ content: [{ type: 'text', text }], stopReason: 'end_turn' }) });
const tool = (n: string) => lifeTools.find((t) => t.name === n)!;
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('facts', () => {
  it('parses the miner reply, fences and all; rejects junk', () => {
    expect(parseMined('```json\n{"facts":[{"text":"Dad hates surprises","subject":"Dad","replaces":null}]}\n```')).toEqual([{ text: 'Dad hates surprises', subject: 'Dad', replaces: null }]);
    expect(parseMined('no json here')).toEqual([]);
    expect(parseMined('{"facts":[{"text":"x"}]}')).toEqual([]);
  });

  it('mining links subjects, skips duplicates, supersedes known facts, and is searchable', async () => {
    const suresh = os.entities.create({ type: 'person', data: { name: 'Suresh' } });
    const got = await mineFacts(os, replying('{"facts":[{"text":"Suresh is the landlord; rent is due on the 5th","subject":"Suresh"}]}'), 'Remember the landlord is Suresh, rent on the 5th', 'c1');
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ subjectId: suresh.id, source: 'talk', sourceRef: 'c1' });
    expect(await mineFacts(os, replying('{"facts":[{"text":"Suresh is the landlord; rent is due on the 5th!","subject":"Suresh"}]}'), 'again, rent on the 5th', 'c1')).toEqual([]);
    const old = got[0]!;
    const next = await mineFacts(os, replying(`{"facts":[{"text":"Rent is due on the 7th now","subject":"Suresh","replaces":"${old.id}"}]}`), 'rent moved to the 7th', 'c2');
    expect(os.facts.get(old.id)!.active).toBe(false);
    expect(os.facts.search('rent').map((f) => f.text)).toEqual([next[0]!.text]);
    expect(os.entities.search.search('rent').some((h) => h.type === 'fact')).toBe(true);
    expect(await mineFacts(os, { id: 'boom', complete: async () => { throw new Error('offline'); } }, 'something long enough', 'c3')).toEqual([]);
  });

  it('remember / recall / forget tools with undo', async () => {
    const dad = os.entities.create({ type: 'person', data: { name: 'Dad' } });
    const r = await tool('remember_fact').run({ text: 'Dad hates surprises', subjectId: dad.id }, os);
    expect(await tool('remember_fact').run({ text: 'dad hates surprises.', subjectId: dad.id }, os)).toMatchObject({ alreadyKnown: 'Dad hates surprises' });
    const rc = (await tool('recall').run({ subjectId: dad.id }, os)) as { facts: Array<{ id: string; text: string; about: string }> };
    expect(rc.facts).toEqual([expect.objectContaining({ text: 'Dad hates surprises', about: 'Dad' })]);
    const f = await tool('forget_fact').run({ factId: rc.facts[0]!.id }, os);
    expect(os.facts.list()).toEqual([]);
    extrasOf(f).undo!();
    expect(os.facts.list()).toHaveLength(1);
    extrasOf(r).undo!();
    expect(os.facts.list()).toEqual([]);
  });

  it('the assistant mines beside the reply', async () => {
    const seen: string[] = [];
    const a = new Assistant(os, { provider: replying('Noted.'), factProvider: replying('{"facts":[{"text":"User prefers aisle seats","subject":null}]}'), onFacts: (fs) => seen.push(...fs.map((x) => x.text)) });
    await a.send('I always prefer aisle seats on flights');
    await a.lastMining;
    expect(seen).toEqual(['User prefers aisle seats']);
  });
});
