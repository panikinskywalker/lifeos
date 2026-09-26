/**
 * The life-graph tools on the real record types (docs/GRAPH.md): identity
 * resolution, attributes vs notes, events with roles joining trips, links,
 * and exact reversal of one write — without a model.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { graphTools, newSession, resolveNode, reverseWrite, type GraphSession } from '@core/graph/tools';
import { parseDateish } from '@core/ai/createAnything';
import { edgeLabel } from '@core/graph/edges';
import { graphReadTools, neighbours } from '@core/graph/read';
import { accountType, transactionType } from './finance/types';
import { groupType, personType } from './crm/types';
import { eventType, taskType } from './projects/types';
import { orgType, placeType } from './places/types';
import { tripType } from './travel/types';

export const graphModules: ModuleManifest[] = [
  { id: 'crm', name: 'People', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [personType, groupType] },
  { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [accountType, transactionType] },
  { id: 'projects', name: 'Projects', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [taskType, eventType] },
  { id: 'places', name: 'Places', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [placeType, orgType] },
  { id: 'travel', name: 'Travel', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [tripType] },
];

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: graphModules, registry: new Registry() });
});
afterEach(() => os.db.close());

const session = (body: string, subjectId?: string) => newSession(os.dumps.add({ body, subjectId }).id, { subjectId });
const call = async (s: GraphSession, name: string, input: Record<string, unknown>) => {
  const t = graphTools(s).find((x) => x.name === name)!;
  return (await t.run(t.input.parse(input), os)) as Record<string, unknown>;
};
const linksOf = (id: string) => os.relations.forEntity(id).map((l) => `${edgeLabel(l.relation.kind, l.direction)} ${l.other.title}`).sort();

describe('graph tools', () => {
  it('new friend with a birthday → person with the birthday field, nothing asked', async () => {
    const s = session('met a new friend today named Kendal, her birthday is on 8 Sept');
    const k = await call(s, 'upsert_node', { name: 'kendal', type: 'person', is_new: true, attributes: { birthday: '8 Sept', relationship: 'friend' } });
    const e = os.entities.get(String(k.id))!;
    expect(e).toMatchObject({ title: 'Kendal', data: { birthday: parseDateish('8 sept'), relationship: 'friend' } });
    expect(os.cycles.forEntity(e.id).map((c) => c.name)).toContain('Birthday');
    expect(os.dumps.toCheck().map((x) => x.label)).toEqual([expect.stringContaining('Birthday → '), 'Person: Kendal']);
  });

  it('on her page: "her favourite colour is pink" → a tidy Notes line, updated in place later', async () => {
    const k = os.entities.create({ type: 'person', title: 'Kendal', data: { notes: 'Met at Priya’s party' } });
    const s = session('her fav colour is pink and she loves sushi', k.id);
    await call(s, 'set_attributes', { node: 'her', attributes: { 'favourite colour': 'pink', loves: 'sushi' } });
    expect((os.entities.get(k.id)!.data as { notes: string }).notes).toBe('Met at Priya’s party\n• Favourite colour: pink\n• Loves: sushi');
    const s2 = session('actually her favourite colour is green', k.id);
    await call(s2, 'set_attributes', { node: 'this', attributes: { favourite_colour: 'green' } });
    expect((os.entities.get(k.id)!.data as { notes: string }).notes).toBe('Met at Priya’s party\n• Favourite colour: green\n• Loves: sushi');
    // Cancel the change → back to pink.
    reverseWrite(os, os.dumps.extractions(s2.dumpId)[0]!.id);
    expect((os.entities.get(k.id)!.data as { notes: string }).notes).toContain('• Favourite colour: pink');
  });

  it('a flight with Kendal → event in a trip, Kendal on both, places created', async () => {
    const kendal = os.entities.create({ type: 'person', title: 'Kendal', data: {} });
    const s = session('took a flight from US to CAN with Kendal on 8th sept');
    await call(s, 'record_event', { kind: 'flight', when: '8 Sept', roles: [{ role: 'from', node: { name: 'USA', type: 'place' } }, { role: 'to', node: { name: 'Canada', type: 'place' } }, { role: 'with', node: 'Kendal' }], details: { airline: 'Air Canada' } });
    const [flight] = os.entities.query('event');
    expect(flight).toMatchObject({ title: 'Flight to Canada', data: { kind: 'flight', allDay: true, airline: 'Air Canada' } });
    expect(new Date((flight!.data as { startAt: number }).startAt).getDate()).toBe(8);
    const [trip] = os.entities.query('trip');
    expect(trip).toMatchObject({ title: 'Trip to Canada', data: { destination: 'Canada', startDate: parseDateish('8 sept') } });
    expect(linksOf(flight!.id)).toEqual(['From USA', 'Part of Trip to Canada', 'To Canada', 'With Kendal']);
    expect(linksOf(kendal.id)).toEqual(['Was at Flight to Canada', 'Was at Trip to Canada']);
    expect(os.entities.query('place').map((p) => p.title).sort()).toEqual(['Canada', 'USA']);
    // Reading it back: "when did I last see Kendal" = her newest dated neighbour, with who/where around it.
    const [latest] = neighbours(os, kendal.id);
    expect(latest).toMatchObject({ title: 'Flight to Canada', label: 'Was at', context: expect.stringContaining('to Canada') });
    const tool = graphReadTools[0]!;
    const out = (await tool.run(tool.input.parse({ name: 'Kendal' }), os)) as { connections: Array<{ title: string; at?: string }> };
    expect(out.connections[0]).toMatchObject({ title: 'Flight to Canada', at: parseDateish('8 sept') });
    // A second travel event that week joins the same trip.
    const s2 = session('hotel in Toronto on 9 sept');
    await call(s2, 'record_event', { kind: 'stay', when: '9 Sept', roles: [{ role: 'at', node: 'Toronto' }] });
    expect(os.entities.query('trip')).toHaveLength(1);
  });

  it('names: exact reuse, near-match is a flagged guess, "new" with an existing name flags a possible duplicate, "I" is skipped', async () => {
    os.entities.create({ type: 'person', title: 'Kendal Rao', data: {} });
    const s = session('x');
    expect(resolveNode(os, s, { name: 'Kendal Rao', type: 'person' })).toMatchObject({ confidence: 0.95 });
    expect(resolveNode(os, s, { name: 'Kendal Rao', type: 'person' }).flag).toBeUndefined();
    expect(resolveNode(os, s, { name: 'Kendal', type: 'person' }).flag).toMatch(/Guessed “Kendal” is Kendal Rao/);
    expect(resolveNode(os, s, { name: 'Kendal Rao', type: 'person' }, { isNew: true })).toMatchObject({ id: null, flag: 'Possible duplicate of Kendal Rao' });
    expect(await call(s, 'link', { from: 'I', to: 'Kendal Rao', kind: 'knows' })).toEqual({ skipped: 'that is the user' });
  });

  it('works at → company field + organisation node + link; family link; task about someone; spend with someone', async () => {
    const s = session('Karan works at Zomato, he is Priya’s brother. need to call Karan Friday. lunch with Karan 450');
    await call(s, 'set_attributes', { node: { name: 'Karan', type: 'person' }, attributes: { company: 'Zomato' } });
    await call(s, 'link', { from: 'Karan', to: { name: 'Priya', type: 'person' }, kind: 'family_of' });
    await call(s, 'create_task', { title: 'Call Karan', due: 'tomorrow', about: 'Karan' });
    await call(s, 'log_spend', { amount: '450', merchant: 'Lunch', category: 'food', with: ['Karan'] });
    const karan = os.entities.query('person').find((p) => p.title === 'Karan')!;
    expect(karan.data).toMatchObject({ company: 'Zomato' });
    expect(linksOf(karan.id)).toEqual(['Family Priya', 'Mentioned in Call Karan', 'Was at Transaction', 'Works at Zomato'].map((x) => (x === 'Was at Transaction' ? `Was at ${os.entities.query('transaction')[0]!.title}` : x)).sort());
    expect(os.entities.query('org').map((o) => o.title)).toEqual(['Zomato']);
    expect(os.entities.query('person')).toHaveLength(2);
  });

  it('cancel reverses exactly one write: a created node, a link, an updated field', async () => {
    const s = session('Asha lives in Pune, birthday 3 March');
    await call(s, 'upsert_node', { name: 'Asha', type: 'person', attributes: { birthday: '3 March' } });
    await call(s, 'link', { from: 'Asha', to: 'Pune', kind: 'lives_in' });
    const xs = os.dumps.extractions(s.dumpId);
    const asha = os.entities.query('person')[0]!;
    const linkRow = xs.find((x) => x.kind === 'link')!;
    expect(reverseWrite(os, linkRow.id)).toBe(true);
    expect(linksOf(asha.id)).toEqual([]);
    const bday = xs.find((x) => x.action === 'updated')!;
    reverseWrite(os, bday.id);
    expect((os.entities.get(asha.id)!.data as { birthday?: string }).birthday).toBeUndefined();
    reverseWrite(os, xs.find((x) => x.kind === 'person' && x.action === 'created')!.id);
    expect(os.entities.query('person')).toEqual([]);
    expect(os.dumps.toCheckCount()).toBe(1); // only Pune left
  });
});
