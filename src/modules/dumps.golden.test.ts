/**
 * Golden tests (M4.1b, PRODUCT v4 §5 + docs/GRAPH.md): things said in a dump
 * or on a record's page, filed through the real pipeline — parser first, then
 * a scripted model calling the graph tools — on the real record types. Each
 * asserts the graph that results (records, fields, notes, links, trips), that
 * nothing was asked, that the words are kept verbatim, and that To check can
 * cancel one write.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import type { ContentBlock, LLMProvider } from '@core/ai/provider';
import { bus } from '@core/events/bus';
import { chunks, fileDump, filePending, filingPrompt, undoFiling } from '@core/filing/dumps';
import { fillDefaults, parseDateish } from '@core/ai/createAnything';
import { edgeLabel } from '@core/graph/edges';
import { accountType, debtType, subscriptionType, transactionType } from './finance/types';
import { financeAiTools } from './finance/aiTools';
import { financeFilingTools } from './finance/filing/tools';
import { assetsAiTools, assetType, routineType, vehicleType } from './assets/types';
import { groupType, personType } from './crm/types';
import { eventType, projectType, taskType } from './projects/types';
import { orgType, placeType } from './places/types';
import { tripType } from './travel/types';

const modules: ModuleManifest[] = [
  { id: 'crm', name: 'People', version: '1', description: '', icon: 'x', color: '#000', objects: [personType, groupType] },
  { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', objects: [accountType, transactionType, subscriptionType, debtType], aiTools: financeAiTools, filingTools: financeFilingTools },
  { id: 'assets', name: 'Things', version: '1', description: '', icon: 'x', color: '#000', objects: [assetType, vehicleType, routineType], aiTools: assetsAiTools },
  { id: 'projects', name: 'Projects', version: '1', description: '', icon: 'x', color: '#000', objects: [taskType, projectType, eventType] },
  { id: 'places', name: 'Places', version: '1', description: '', icon: 'x', color: '#000', objects: [placeType, orgType] },
  { id: 'travel', name: 'Travel', version: '1', description: '', icon: 'x', color: '#000', objects: [tripType] },
];

type Call = { name: string; input: Record<string, unknown> };
/** A model that makes these tool calls, one round per array, then says "done". Records what it saw. */
function model(...rounds: Call[][]): LLMProvider & { seen: Array<{ system: string; first: string; results: string[] }> } {
  let i = 0;
  const seen: Array<{ system: string; first: string; results: string[] }> = [];
  return {
    id: 'scripted',
    seen,
    complete: async ({ system, messages }) => {
      const last = messages[messages.length - 1]!;
      const results = Array.isArray(last.content) ? last.content.filter((b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result').map((b) => b.content) : [];
      seen.push({ system, first: messages[0]!.content as string, results });
      const calls = rounds[i++];
      if (!calls) return { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' };
      return { content: calls.map((c, k) => ({ type: 'tool_use' as const, id: `r${i}-${k}`, name: c.name, input: c.input })), stopReason: 'tool_use' };
    },
  };
}
const offline: LLMProvider = { id: 'offline', complete: async () => { throw new Error('groq: network error'); } };

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules, registry: new Registry() });
});
afterEach(() => os.db.close());

const person = (name: string) => os.records.query('person').find((p) => p.title === name)!;
const links = (id: string) => os.links.forEntity(id).map((l) => `${edgeLabel(l.relation.kind, l.direction)} ${l.other.title}`).sort();
const say = async (body: string, m: LLMProvider | null, subjectId?: string) => {
  const d = os.dumps.add({ body, subjectId });
  const r = await fileDump(os, d.id, m);
  return { d, r };
};

describe('saying things (Jarvis golden flows)', () => {
  it('"met a new friend today named Kendal, her birthday is on 8 Sept" → Kendal with her birthday, a birthday cycle, nothing asked', async () => {
    const m = model([{ name: 'upsert_node', input: { name: 'Kendal', type: 'person', is_new: true, attributes: { birthday: '8 Sept', relationship: 'friend' } } }]);
    const { d, r } = await say('met a new friend today named Kendal, her birthday is on 8 Sept', m);
    expect(r).toMatchObject({ status: 'done', via: 'model' });
    expect(person('Kendal').data).toMatchObject({ birthday: parseDateish('8 sept'), relationship: 'friend' });
    expect(os.cycles.forEntity(person('Kendal').id).map((c) => c.name)).toEqual(['Birthday']);
    expect(os.filings.toCheck().map((x) => x.label)).toEqual([expect.stringMatching(/^Kendal · Birthday → .*, Relationship → friend$/), 'Person: Kendal']);
    expect(os.dumps.get(d.id)!.body).toBe('met a new friend today named Kendal, her birthday is on 8 Sept');
    expect(m.seen[0]!.system).toMatch(/never ask questions/);
  });

  it('on Kendal’s page: "her fav colour is pink, she’s vegetarian, new number 98450 12345" → phone field + tidy notes', async () => {
    const k = os.records.create({ object: 'person', title: 'Kendal', data: {} });
    const m = model([{ name: 'set_attributes', input: { node: 'her', attributes: { 'favourite colour': 'pink', diet: 'vegetarian', phone: '98450 12345' } } }]);
    await say('her fav colour is pink, she’s vegetarian, new number 98450 12345', m, k.id);
    expect(os.records.get(k.id)!.data).toMatchObject({ phone: '98450 12345', notes: '• Favourite colour: pink\n• Diet: vegetarian' });
    expect(m.seen[0]!.system).toContain('page of person "Kendal"');
    expect(os.filings.toCheck()).toHaveLength(3);
  });

  it('a day: flight US → Canada with Kendal on 8 Sept, dinner at Canoe with Kendal and her brother Mike, 180 for dinner → linked graph', async () => {
    const kendal = os.records.create({ object: 'person', title: 'Kendal', data: {} });
    const m = model(
      [
        { name: 'record_event', input: { kind: 'flight', when: '8 Sept', roles: [{ role: 'from', node: { name: 'USA', type: 'place' } }, { role: 'to', node: { name: 'Canada', type: 'place' } }, { role: 'with', node: 'Kendal' }] } },
        { name: 'upsert_node', input: { name: 'Mike', type: 'person' } },
        { name: 'link', input: { from: 'Mike', to: 'Kendal', kind: 'family_of' } },
      ],
      [
        { name: 'record_event', input: { kind: 'dinner', when: '8 Sept', roles: [{ role: 'at', node: { name: 'Canoe', type: 'place' } }, { role: 'with', node: 'Kendal' }, { role: 'with', node: 'Mike' }] } },
        { name: 'log_spend', input: { amount: 180, merchant: 'Canoe', category: 'food', with: ['Kendal', 'Mike'], date: '8 Sept' } },
      ],
    );
    const { r } = await say('Took a flight from the US to Canada with Kendal on 8 Sept. Had dinner at Canoe with Kendal and her brother Mike, I paid 180 for dinner.', m);
    expect(r.status).toBe('done');
    const trip = os.records.query('trip')[0]!;
    const flight = os.records.query('event').find((e) => (e.data as { kind: string }).kind === 'flight')!;
    const dinner = os.records.query('event').find((e) => (e.data as { kind: string }).kind === 'dinner')!;
    expect(trip.title).toBe('Trip to Canada');
    expect(links(flight.id)).toEqual(['From USA', 'Part of Trip to Canada', 'To Canada', 'With Kendal']);
    expect(links(dinner.id)).toEqual(['At Canoe', 'With Kendal', 'With Mike']);
    expect(links(kendal.id)).toEqual(expect.arrayContaining(['Family Mike', 'Was at Dinner at Canoe', 'Was at Flight to Canada', 'Was at Trip to Canada']));
    expect(os.records.query('transaction')[0]!.data).toMatchObject({ amount: 180, category: 'food', date: parseDateish('8 sept') });
    expect(os.records.query('person')).toHaveLength(2); // Kendal reused, Mike created — nobody duplicated
    // The model got each tool's result back (ids to keep linking).
    expect(m.seen[1]!.results.length).toBe(3);
  });

  it('"bought a Dyson for 32k on the HDFC card, warranty 2 years" → asset with a warranty cycle + the expense paid for it', async () => {
    const hdfc = os.records.create({ object: 'account', title: 'HDFC card', data: { kind: 'credit', currency: 'INR' } });
    const m = model([
      { name: 'upsert_node', input: { name: 'Dyson', type: 'asset', attributes: { category: 'appliance', purchasePrice: '32k', purchaseDate: 'today', warrantyUntil: '2 years' } } },
      { name: 'log_spend', input: { amount: '32k', merchant: 'Dyson', category: 'shopping', for: 'Dyson', account: 'HDFC card' } },
    ]);
    await say('bought a Dyson for 32k on the HDFC card, warranty 2 years', m);
    const dyson = os.records.query('asset')[0]!;
    expect(dyson.data).toMatchObject({ category: 'appliance', purchasePrice: 32000, warrantyUntil: parseDateish('2 years') });
    expect(os.cycles.forEntity(dyson.id).map((c) => c.name)).toEqual(['Warranty ends']);
    const tx = os.records.query('transaction')[0]!;
    expect(tx.data).toMatchObject({ amount: 32000, accountId: hdfc.id });
    expect(links(tx.id)).toEqual(['Account HDFC card', 'Paid for Dyson']);
  });

  it('a 6-line rant with one buried task → one task, rant verbatim, nothing else', async () => {
    const rant = ['Honestly today was exhausting.', 'The landlord still hasn’t fixed the leak and I’m so done with this building.', 'Work was chaos, three meetings that could have been emails.', 'Traffic on the way back was insane.', 'I need to call the plumber tomorrow before 10.', 'Anyway. Going to sleep early.'].join('\n');
    const m = model([{ name: 'create_task', input: { title: 'Call the plumber', due: 'tomorrow' } }]);
    const { d } = await say(rant, m);
    expect(os.records.countsByType()).toEqual({ task: 1 });
    expect(os.records.query('task')[0]!.data).toMatchObject({ dueDate: parseDateish('tomorrow') });
    expect(os.dumps.get(d.id)!.body).toBe(rant);
    expect(m.seen[0]!.system).toMatch(/never invent/);
  });

  it('"Karan works at Zomato, met him at the gym" → company field, Zomato as an organisation, a meeting at the gym', async () => {
    const m = model([
      { name: 'upsert_node', input: { name: 'Karan', type: 'person', is_new: true, attributes: { company: 'Zomato' } } },
      { name: 'record_event', input: { kind: 'met', when: 'today', roles: [{ role: 'with', node: 'Karan' }, { role: 'at', node: { name: 'the gym', type: 'place' } }] } },
    ]);
    await say('made a new friend today, Karan, works at Zomato, met at the gym', m);
    expect(links(person('Karan').id)).toEqual(['Was at Met at The Gym', 'Works at Zomato']);
    expect(os.records.query('org').map((o) => o.title)).toEqual(['Zomato']);
    // Cancel the organisation link only.
    const row = os.filings.toCheck().find((x) => x.label.includes('works at'))!;
    expect(undoFiling(os, row.id)).toBe(true);
    expect(links(person('Karan').id)).toEqual(['Was at Met at The Gym']);
  });
});

describe('filing mechanics', () => {
  it('parser first: "did laundry" is filed offline with no model call, and lands in To check', async () => {
    os.records.create({ object: 'routine', data: { name: 'Laundry', everyN: 4, everyUnit: 'day', kind: 'chore' } });
    const m = model();
    const { r } = await say('did laundry', m);
    expect(r).toMatchObject({ status: 'done', via: 'parser', items: 1 });
    expect(m.seen).toEqual([]);
    const [x] = os.filings.toCheck();
    expect(x).toMatchObject({ kind: 'routine', action: 'logged' });
    expect(undoFiling(os, x!.id)).toBe(true);
  });

  it('no key → waits for one; offline or rate-limited → waiting (never counted as a failure); garbage → failed', async () => {
    const { d } = await say('Kendal’s sister is Ana', null);
    expect(os.dumps.get(d.id)).toMatchObject({ status: 'pending', error: 'no provider', attempts: 0 });
    // No connection: waits a minute, not a failed attempt; not due before then.
    expect(await fileDump(os, d.id, offline)).toMatchObject({ status: 'waiting', error: 'No connection' });
    const w = os.dumps.get(d.id)!;
    expect(w).toMatchObject({ status: 'pending', attempts: 0 });
    expect(w.retryAt! - Date.now()).toBeGreaterThan(30_000);
    expect(os.dumps.pending()).toEqual([]);
    expect(os.dumps.nextWake()).toBe(w.retryAt);
    // Groq's daily limit: waits for as long as Groq says.
    const daily: LLMProvider = { id: 'groq', complete: async () => { throw Object.assign(new Error('groq 429: Rate limit reached on tokens per day (TPD): Limit 200000. Please try again in 7m50.4s.'), { status: 429, retryAfterMs: 470_400 }); } };
    expect(await fileDump(os, d.id, daily)).toMatchObject({ status: 'waiting', error: "Groq's free daily limit is used up" });
    expect(os.dumps.get(d.id)!.retryAt! - Date.now()).toBeGreaterThan(460_000);
    // Once it's due, a working model files it.
    expect(await filePending(os, model([{ name: 'link', input: { from: 'Ana', to: 'Kendal', kind: 'family_of' } }]))).toEqual([]);
    os.db.run(`UPDATE dumps SET retry_at=? WHERE id=?`, [Date.now() - 1, d.id]);
    expect(await filePending(os, model([{ name: 'link', input: { from: 'Ana', to: 'Kendal', kind: 'family_of' } }]))).toEqual([{ status: 'done', via: 'model', items: 3 }]);
    // Unusable output is a real failure (counts toward giving up).
    const garbage: LLMProvider = { id: 'x', complete: async () => { throw new Error('extraction: model returned nonsense'); } };
    const { r } = await say('Asha moved to Pune', garbage);
    expect(r.status).toBe('failed');
  });

  it('cut off mid-dump → resumes from the next chunk, told what is already filed', async () => {
    const long = `Kendal called about the trip. ${'We talked for a long time about many unrelated plans and ideas. '.repeat(25)}\nNeed to book the Toronto hotel tomorrow.`;
    expect(chunks(long).length).toBe(2);
    let n = 0;
    const flaky: LLMProvider = {
      id: 'gemini',
      complete: async ({ messages }) => {
        n++;
        if (n === 1) return { content: [{ type: 'tool_use', id: 'a', name: 'upsert_node', input: { name: 'Kendal', type: 'person' } }], stopReason: 'tool_use' };
        if (n === 2) return { content: [{ type: 'text', text: 'done' }], stopReason: 'end_turn' }; // chunk 1 filed
        void messages;
        throw Object.assign(new Error('gemini 503: high demand'), { status: 503 });
      },
    };
    const { d, r } = await say(long, flaky);
    expect(r).toMatchObject({ status: 'waiting', error: 'Gemini is overloaded right now' });
    expect(os.dumps.get(d.id)!.progress).toMatchObject({ parsed: true, chunksDone: 1 });
    os.db.run(`UPDATE dumps SET retry_at=? WHERE id=?`, [Date.now() - 1, d.id]);
    const m = model([{ name: 'create_task', input: { title: 'Book the Toronto hotel', due: 'tomorrow' } }]);
    await filePending(os, m);
    expect(m.seen[0]!.first).toContain('Toronto hotel');
    expect(m.seen[0]!.first).not.toContain('Kendal called');
    expect(m.seen[0]!.system).toContain('Already filed from this text');
    expect(m.seen[0]!.system).toContain('Person: Kendal');
    expect(os.records.query('person')).toHaveLength(1);
    expect(os.dumps.get(d.id)!.status).toBe('done');
  });

  it('the parser files the everyday sentences inside a longer dump now; the model gets only the rest', async () => {
    os.records.create({ object: 'routine', data: { name: 'Laundry', everyN: 4, everyUnit: 'day', kind: 'chore' } });
    const { d, r } = await say('Did laundry. Spent 450 on lunch at Toit. Met Kendal there, she just moved to Pune.', null);
    // No key: the everyday sentences are filed anyway, the rest waits.
    expect(r).toMatchObject({ status: 'pending', via: 'parser', items: 2 });
    expect(os.filings.forDump(d.id).map((x) => x.kind)).toEqual(['routine', 'transaction']);
    const m = model([{ name: 'link', input: { from: 'Kendal', to: 'Pune', kind: 'lives_in' } }]);
    await filePending(os, m);
    expect(m.seen[0]!.first).toBe('Met Kendal there, she just moved to Pune.');
    expect(os.records.query('transaction')).toHaveLength(1);
  });

  it('low on free budget: the newest dump is filed first, the older backlog waits', async () => {
    const { budgetLow } = await import('@core/ai/limits');
    os.dumps.add({ body: 'older thing about Asha', createdAt: Date.now() - 60_000 });
    os.dumps.add({ body: 'newest thing about Kendal' });
    const m = model();
    await filePending(os, m, { newestFirst: true, max: 1 });
    expect(m.seen[0]!.first).toBe('newest thing about Kendal');
    expect(budgetLow(170_000, 200_000, false)).toBe(true);
    expect(budgetLow(20_000, 200_000, false)).toBe(false);
    expect(budgetLow(0, undefined, true)).toBe(true);
  });

  it('a bad tool call goes back to the model as an error instead of failing the dump', async () => {
    const m = model([{ name: 'teleport', input: {} }, { name: 'create_task', input: { title: 'x' } }]);
    const { r } = await say('something', m);
    expect(r.status).toBe('done');
    expect(m.seen[1]!.results[0]).toContain('unknown tool teleport');
  });

  it('long dumps are filed in chunks; the prompt lists record types', () => {
    const long = `${'I went for a long walk and thought about many things. '.repeat(30)}\nKendal called.`;
    expect(chunks(long).length).toBeGreaterThan(1);
    expect(chunks(long).join(' ').replace(/\s+/g, ' ')).toBe(long.replace(/\s+/g, ' ').trim());
    expect(filingPrompt(os)).toContain('person: relationship');
  });

  it('create anything: defaults for required fields, "32k" and "2 years" understood', () => {
    expect(fillDefaults(vehicleType as never, {}, 'Honda City')).toMatchObject({ make: 'Honda City' });
    expect(fillDefaults(assetType as never, { purchasePrice: '32k', warrantyUntil: 'in 2 years', category: 'Appliance' })).toMatchObject({ purchasePrice: 32000, warrantyUntil: parseDateish('2 years'), category: 'appliance' });
    expect(fillDefaults(routineType as never, {}, 'Water plants')).toMatchObject({ name: 'Water plants' });
  });
});
