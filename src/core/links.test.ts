import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createBetterSqliteAdapter } from './db/betterSqliteAdapter';
import { createLifeOS } from './lifeos';
import { Registry } from './registry/registry';
import type { LifeOSContext } from './registry/context';
import type { ModuleManifest } from './registry/types';
import { bus } from './events/bus';
import { backlinks, parseLinks } from './links';

const mod: ModuleManifest = {
  id: 'k', name: 'K', version: '1', description: '', icon: 'x', color: '#000',
  objects: [
    { type: 'note', module: 'k', label: 'Note', labelPlural: 'Notes', icon: 'file', schema: z.object({ title: z.string(), body: z.string().default('') }), fields: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'body', label: 'Body', type: 'longtext' }], computeTitle: (x) => String(x.title) },
    { type: 'person', module: 'k', label: 'Person', labelPlural: 'People', icon: 'user', schema: z.object({ name: z.string() }), fields: [{ key: 'name', label: 'Name', type: 'text' }], computeTitle: (x) => String(x.name) },
  ],
};
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('[[links]]', () => {
  it('parses titles once each', () => {
    expect(parseLinks('Ask [[Priya Sharma]] about [[Kyoto]] and [[Priya Sharma]] again; not [[ ]] or [[a\nb]]')).toEqual(['Priya Sharma', 'Kyoto']);
  });

  it('a note’s links become mentions that follow edits; the target shows backlinks', () => {
    const priya = os.records.create({ object: 'person', data: { name: 'Priya Sharma' } });
    const arjun = os.records.create({ object: 'person', data: { name: 'Arjun' } });
    const n = os.records.create({ object: 'note', data: { title: 'Goa plan', body: 'Book with [[Priya Sharma]] and [[Arjun]]; ask [[Nobody]]' } });
    expect(os.links.targets(n.id, 'mention').sort()).toEqual([priya.id, arjun.id].sort());
    expect(backlinks(os, priya.id).map((e) => e.title)).toEqual(['Goa plan']);
    os.records.update(n.id, { data: { body: 'Only [[Arjun]] now' } });
    expect(os.links.targets(n.id, 'mention')).toEqual([arjun.id]);
    expect(backlinks(os, priya.id)).toEqual([]);
  });

  it('ambiguous titles are not guessed; a fact’s [[link]] sets what it is about', () => {
    os.records.create({ object: 'person', data: { name: 'Priya' } });
    os.records.create({ object: 'person', data: { name: 'Priya' } });
    const n = os.records.create({ object: 'note', data: { title: 'x', body: 'call [[Priya]]' } });
    expect(os.links.targets(n.id, 'mention')).toEqual([]);
    const dad = os.records.create({ object: 'person', data: { name: 'Dad' } });
    expect(os.facts.add({ text: '[[Dad]] hates surprises', source: 'user' }).subjectId).toBe(dad.id);
  });
});
