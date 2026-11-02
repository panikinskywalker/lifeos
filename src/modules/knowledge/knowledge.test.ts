import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '../crm';
import { travelModule } from '../travel';
import { projectsModule } from '../projects';
import { factGroups, foldMemory, knowledgeAiTools, knowledgeModule, mentionsIn, notes, noteSnippet, noteTitle, searchBrain, whatIKnow, type NoteData } from '.';

let os: LifeOSContext;

beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, travelModule, projectsModule, knowledgeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const tool = (name: string) => knowledgeAiTools.find((t) => t.name === name)!;
const person = (title: string) => os.records.create({ object: 'person', title, data: {} });
const note = (body: string, extra: Partial<NoteData> & { title?: string } = {}) => {
  const { title, ...data } = extra;
  return os.records.create<NoteData>({ object: 'note', title, data: { body, ...data } });
};

describe('Note', () => {
  it('takes its title from the first line until you name it', () => {
    expect(noteTitle('# Goa plan\nflights with [[Karan]]')).toBe('Goa plan');
    expect(noteTitle('- [[Karan]] *likes* filter coffee')).toBe('Karan likes filter coffee');
    expect(noteTitle('x'.repeat(80))).toHaveLength(60);
    expect(noteSnippet('Goa plan\n- flights with [[Karan]]\n- stay in Anjuna')).toBe('flights with Karan · stay in Anjuna');
    expect(noteSnippet('Just one line')).toBe('Just one line');

    const n = note('Goa plan\nflights first');
    expect(n.title).toBe('Goa plan');
    expect(os.records.update<NoteData>(n.id, { data: { body: 'Goa in December\nflights first' } }).title).toBe('Goa in December');
    const named = note('first line', { title: 'Reading list' });
    expect(os.records.update<NoteData>(named.id, { data: { body: 'another line' } }).title).toBe('Reading list');
  });

  it('links its [[mentions]] and names the unknown ones', () => {
    const karan = person('Karan Mehta');
    const n = note('Dinner with [[Karan Mehta]] and [[Zoya]]');
    expect(os.links.targets(n.id, 'mention')).toEqual([karan.id]);
    expect(mentionsIn(os, n.data.body, n.id)).toEqual([{ title: 'Karan Mehta', id: karan.id }, { title: 'Zoya', id: null }]);
  });
});

describe('the Second Brain', () => {
  it('lists notes pinned first, by kind, and searches notes and facts together', () => {
    const a = note('Biryani\nsoak the rice', { kind: 'recipe' });
    const b = note('Pottery class idea', { kind: 'idea' });
    os.records.update(a.id, { starred: true });
    expect(notes(os).map((n) => n.id)).toEqual([a.id, b.id]);
    expect(notes(os, { kind: 'idea' }).map((n) => n.id)).toEqual([b.id]);
    os.facts.add({ text: 'Mum likes pottery', source: 'user' });
    const found = searchBrain(os, 'pottery');
    expect(found.notes.map((n) => n.id)).toEqual([b.id]);
    expect(found.facts.map((f) => f.text)).toEqual(['Mum likes pottery']);
  });

  it('groups facts by what they are about, About you first', () => {
    const dad = person('Dad');
    os.facts.add({ text: 'Dad hates surprises', subjectId: dad.id, source: 'talk' });
    os.facts.add({ text: 'Dad likes cricket', subjectId: dad.id, source: 'talk' });
    os.facts.add({ text: 'Suresh is the landlord', subjectKey: 'name:suresh', source: 'talk' });
    os.facts.add({ text: 'I am vegetarian on Tuesdays', source: 'user' });
    expect(factGroups(os, os.facts.list()).map((g) => [g.title, g.facts.length])).toEqual([['About you', 1], ['Dad', 2], ['Suresh', 1]]);
  });

  it('knows a record by name: its facts, the notes that mention it, what you call it', () => {
    const karan = person('Karan Mehta');
    os.facts.add({ text: 'Karan likes filter coffee', subjectId: karan.id, source: 'talk' });
    const n = note('Birthday ideas for [[Karan Mehta]]');
    os.aliases.learn('KM', karan.id);
    const k = whatIKnow(os, 'karan mehta');
    expect(k.record?.id).toBe(karan.id);
    expect(k.facts.map((f) => f.text)).toEqual(['Karan likes filter coffee']);
    expect(k.notes.map((x) => x.id)).toEqual([n.id]);
    expect(k.aliases.map((a) => a.alias)).toEqual(['KM']);
    expect(os.aliases.all().map((a) => a.alias)).toEqual(['KM']);
    // A name that is not a record: the facts kept under it.
    os.facts.add({ text: 'Suresh collects rent on the 5th', subjectKey: 'name:suresh', source: 'talk' });
    expect(whatIKnow(os, 'Suresh')).toMatchObject({ record: null, facts: [expect.objectContaining({ text: 'Suresh collects rent on the 5th' })] });
  });
});

describe('the Memory fold (R7f)', () => {
  it('moves name facts onto their record, keeps a deleted record’s name, and links old mentions', () => {
    const named = os.facts.add({ text: 'Suresh collects rent on the 5th', subjectKey: 'name:suresh', source: 'talk' });
    const nobody = os.facts.add({ text: 'Zoya moved to Pune', subjectKey: 'name:zoya', source: 'talk' });
    const gone = person('Old landlord');
    const onGone = os.facts.add({ text: 'Deposit was 50k', subjectId: gone.id, source: 'talk' });
    os.records.delete(gone.id);
    const n = note('Call [[Suresh]] about the lease');
    expect(os.links.targets(n.id, 'mention')).toEqual([]);

    const suresh = person('Suresh');
    expect(foldMemory(os)).toEqual({ moved: 1, named: 1, notes: 1 });
    expect(os.facts.get(named.id)?.subjectId).toBe(suresh.id);
    expect(os.facts.get(nobody.id)?.subjectId).toBeNull();
    expect(os.facts.get(onGone.id)).toMatchObject({ subjectId: gone.id, subjectKey: 'name:old landlord' });
    expect(os.links.targets(n.id, 'mention')).toEqual([suresh.id]);
    expect(os.facts.list({ subjectId: suresh.id }).map((f) => f.text)).toEqual(['Suresh collects rent on the 5th']);
    expect(os.records.timeline.forEntity(suresh.id, 10).some((e) => e.kind === 'fact')).toBe(true);
    expect(factGroups(os, os.facts.list()).map((g) => g.title).sort()).toEqual(['Old landlord', 'Suresh', 'Zoya']);
    // Nothing forgotten.
    expect(os.facts.list()).toHaveLength(3);
  });

  it('runs once, on first open', () => {
    expect(os.settings.get('knowledge.r7f', false)).toBe(true);
  });
});

describe('tools', () => {
  it('write_note writes, links and names what it could not find', async () => {
    person('Priya Sharma');
    const out = (await tool('write_note').run({ body: 'Met [[Priya Sharma]] and [[Arjun]] about the startup', kind: 'meeting' }, os)) as { created: string; id: string; linked: string[]; notFound: string[] };
    expect(out).toMatchObject({ created: 'Met Priya Sharma and Arjun about the startup', linked: ['Priya Sharma'], notFound: ['Arjun'] });
    expect(os.records.get(out.id)?.data).toMatchObject({ kind: 'meeting' });
  });

  it('find_notes and what_i_know read the Second Brain', async () => {
    note('Biryani\nsoak the rice an hour', { kind: 'recipe' });
    note('Book: Deep Work', { kind: 'book' });
    const r = (await tool('find_notes').run({ text: 'biryani' }, os)) as { notes: Array<{ title: string }> };
    expect(r.notes.map((n) => n.title)).toEqual(['Biryani']);
    expect(((await tool('find_notes').run({ kind: 'book' }, os)) as { notes: Array<{ title: string }> }).notes.map((n) => n.title)).toEqual(['Book: Deep Work']);
    const dad = person('Dad');
    os.facts.add({ text: 'Dad hates surprises', subjectId: dad.id, source: 'talk' });
    expect(await tool('what_i_know').run({ about: 'Dad' }, os)).toMatchObject({ about: 'Dad', recordId: dad.id, facts: [expect.objectContaining({ text: 'Dad hates surprises' })] });
  });
});
