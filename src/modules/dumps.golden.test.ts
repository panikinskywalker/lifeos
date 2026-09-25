/**
 * Golden tests (M4.1, PRODUCT v4 §5 flows 3–5): brain dumps through the real
 * extraction path — parser first, then a recorded small-model reply — on the
 * real record types. Each asserts what was created, that it links back to the
 * dump, that the dump is stored verbatim, and that Undo reverses one item.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import type { LLMProvider } from '@core/ai/provider';
import { bus } from '@core/events/bus';
import { extractDump, extractPending, extractionPrompt, parseExtraction, undoExtraction } from '@core/dumps/extract';
import { fillDefaults, parseDateish } from '@core/ai/createAnything';
import { accountType, debtType, subscriptionType, transactionType } from './finance/types';
import { financeAiTools } from './finance/aiTools';
import { assetsAiTools, assetType, routineType, vehicleType } from './assets/types';
import { groupType, personType } from './crm/types';
import { eventType, projectType, taskType } from './projects/types';

const modules: ModuleManifest[] = [
  { id: 'crm', name: 'People', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [personType, groupType] },
  { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [accountType, transactionType, subscriptionType, debtType], aiTools: financeAiTools },
  { id: 'assets', name: 'Things', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [assetType, vehicleType, routineType], aiTools: assetsAiTools },
  { id: 'projects', name: 'Projects', version: '1', description: '', icon: 'x', color: '#000', entityTypes: [taskType, projectType, eventType] },
];

/** A small model that answers every extraction with `json`, and remembers what it was asked. */
function model(json: unknown): LLMProvider & { asked: string[] } {
  const asked: string[] = [];
  return {
    id: 'recorded',
    asked,
    complete: async ({ system, messages }) => {
      asked.push(`${system}\n---\n${messages[0]!.content as string}`);
      return { content: [{ type: 'text', text: `Here you go:\n\`\`\`json\n${JSON.stringify(json)}\n\`\`\`` }], stopReason: 'end_turn' };
    },
  };
}
const offline: LLMProvider = { id: 'offline', complete: async () => { throw Object.assign(new Error('network error'), { name: 'ProviderError' }); } };

let os: LifeOSContext;
const day = (n = 0) => parseDateish(`${n} days`)!;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules, registry: new Registry() });
});
afterEach(() => os.db.close());

describe('dump golden flows (PRODUCT v4 §5)', () => {
  it('3 · "made a new friend today, Karan, works at Zomato, met at the gym" → Person with company + fact + link to the dump', async () => {
    const text = 'made a new friend today, Karan, works at Zomato, met at the gym';
    const d = os.dumps.add({ body: text });
    const m = model({ people: [{ name: 'Karan', company: 'Zomato', relationship: 'friend', whereMet: 'the gym' }] });
    const r = await extractDump(os, d.id, m);
    expect(r).toEqual({ status: 'done', via: 'model', items: 2 });

    const [karan] = os.entities.query('person');
    expect(karan).toMatchObject({ title: 'Karan', data: { company: 'Zomato', relationship: 'friend' } });
    const facts = os.facts.list({ subjectId: karan!.id });
    expect(facts.map((f) => [f.text, f.source, f.sourceRef])).toEqual([[`Met Karan at the gym on ${day()}`, 'dump', d.id]]);
    // Links back: the extraction rows, the dump list on the record, and a timeline line.
    expect(os.dumps.extractions(d.id).map((x) => [x.kind, x.action, x.entityId ?? x.factId])).toEqual([['person', 'created', karan!.id], ['fact', 'created', facts[0]!.id]]);
    expect(os.dumps.forEntity(karan!.id).map((x) => x.id)).toEqual([d.id]);
    expect(os.entities.timeline.forEntity(karan!.id).some((e) => e.kind === 'dump' && e.meta.dumpId === d.id)).toBe(true);
    expect(os.dumps.get(d.id)).toMatchObject({ body: text, status: 'done' });
    // No form: nothing asked, the model saw the dump verbatim.
    expect(m.asked[0]).toContain(text);

    // Undo the person → gone, and so is the "met at" fact.
    undoExtraction(os, os.dumps.extractions(d.id)[0]!.id);
    expect(os.entities.query('person')).toEqual([]);
    expect(os.facts.list({ subjectId: karan!.id })).toEqual([]);
    expect(os.dumps.get(d.id)!.body).toBe(text);
  });

  it('4 · "bought a Dyson for 32k on the HDFC card, warranty 2 years" → Asset + Transaction + warranty cycle', async () => {
    const hdfc = os.entities.create({ type: 'account', title: 'HDFC card', data: { kind: 'credit', currency: 'INR' } });
    const d = os.dumps.add({ body: 'bought a Dyson for 32k on the HDFC card, warranty 2 years' });
    const m = model({
      entitiesToCreate: [{ type: 'asset', title: 'Dyson', data: { category: 'Appliance', purchasePrice: '32k', purchaseDate: 'today', warrantyUntil: '2 years' } }],
      transactions: [{ amount: 32000, kind: 'expense', merchant: 'Dyson', category: 'shopping', account: 'HDFC card', for: 'Dyson' }],
    });
    await extractDump(os, d.id, m);

    const [dyson] = os.entities.query('asset');
    expect(dyson).toMatchObject({ title: 'Dyson', data: { category: 'appliance', purchasePrice: 32000, purchaseDate: day(), warrantyUntil: parseDateish('2 years') } });
    const [tx] = os.entities.query('transaction');
    expect(tx).toMatchObject({ data: { amount: 32000, kind: 'expense', merchant: 'Dyson', accountId: hdfc.id, date: day() } });
    expect(os.relations.forEntity(tx!.id).map((l) => l.other.id)).toContain(dyson!.id);
    const cycles = os.cycles.forEntity(dyson!.id);
    expect(cycles.map((c) => [c.name, new Date(c.nextDueAt!).toISOString().slice(0, 10)])).toEqual([['Warranty ends', parseDateish('2 years')]]);
    expect(os.dumps.extractions(d.id).map((x) => x.kind)).toEqual(['asset', 'transaction']);

    // Undo just the expense: the Dyson stays.
    undoExtraction(os, os.dumps.extractions(d.id)[1]!.id);
    expect(os.entities.query('transaction')).toEqual([]);
    expect(os.entities.query('asset')).toHaveLength(1);
  });

  it('5 · a 6-line rant with one buried task → one task, rant verbatim, nothing invented', async () => {
    const rant = [
      'Honestly today was exhausting.',
      'The landlord still hasn’t fixed the leak and I’m so done with this building.',
      'Work was chaos, three meetings that could have been emails.',
      'Traffic on the way back was insane.',
      'I need to call the plumber tomorrow before 10.',
      'Anyway. Going to sleep early.',
    ].join('\n');
    const d = os.dumps.add({ body: rant });
    const m = model({ people: [], tasks: [{ title: 'Call the plumber', due: 'tomorrow' }], facts: [], events: [], transactions: [], cycleUpdates: [], entitiesToCreate: [] });
    await extractDump(os, d.id, m);

    expect(os.entities.query('task').map((t) => [t.title, (t.data as { dueDate?: string }).dueDate])).toEqual([['Call the plumber', parseDateish('tomorrow')]]);
    expect(os.entities.countsByType()).toEqual({ task: 1 });
    expect(os.facts.list()).toEqual([]);
    expect(os.dumps.get(d.id)!.body).toBe(rant);
    // The prompt tells the model not to invent (the model is the one that can).
    expect(m.asked[0]).toMatch(/Never invent/);
  });
});

describe('dump extraction mechanics', () => {
  it('parser first: an everyday sentence is filed offline with no model call', async () => {
    os.entities.create({ type: 'routine', data: { name: 'Laundry', everyN: 4, everyUnit: 'day', kind: 'chore' } });
    const d = os.dumps.add({ body: 'did laundry' });
    const m = model({});
    expect(await extractDump(os, d.id, m)).toMatchObject({ status: 'done', via: 'parser', items: 1 });
    expect(m.asked).toEqual([]);
  });

  it('no key and not a parser sentence → stays pending; a failing model → failed, retried later', async () => {
    const d = os.dumps.add({ body: 'Karan from the gym says the protein place in Indiranagar is good' });
    expect(await extractDump(os, d.id, null)).toMatchObject({ status: 'pending' });
    expect(os.dumps.get(d.id)!.status).toBe('pending');
    expect(await extractDump(os, d.id, offline)).toMatchObject({ status: 'failed' });
    expect(os.dumps.pending().map((x) => x.id)).toEqual([d.id]);
    const r = await extractPending(os, model({ facts: [{ text: 'The protein place in Indiranagar is good' }] }));
    expect(r).toEqual([{ status: 'done', via: 'model', items: 1 }]);
    expect(os.dumps.pending()).toEqual([]);
  });

  it('reads sloppy model JSON and drops malformed items instead of failing', () => {
    const x = parseExtraction('Sure! {"people":[{"name":"Asha","company":null},{"company":"no name"}],"tasks":"none","transactions":[{"amount":"₹1,240","merchant":"Swiggy"}]} hope that helps');
    expect(x.people).toEqual([{ name: 'Asha', company: undefined, role: undefined, relationship: undefined, whereMet: undefined, city: undefined, note: undefined }]);
    expect(x.tasks).toEqual([]);
    expect(x.transactions[0]!.amount).toBe(1240);
    expect(() => parseExtraction('I found nothing.')).toThrow(/no JSON/);
  });

  it('create anything: defaults for required fields, "32k" and "2 years" understood', () => {
    expect(fillDefaults(vehicleType as never, {}, 'Honda City')).toMatchObject({ make: 'Honda City' });
    expect(fillDefaults(assetType as never, { purchasePrice: '32k', warrantyUntil: 'in 2 years', category: 'Appliance' })).toMatchObject({ purchasePrice: 32000, warrantyUntil: parseDateish('2 years'), category: 'appliance' });
    expect(fillDefaults(routineType as never, {}, 'Water plants')).toMatchObject({ name: 'Water plants' });
    expect(extractionPrompt(os)).toContain('asset: category');
  });
});
