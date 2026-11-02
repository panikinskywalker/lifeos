/**
 * The golden sentences (MODEL.md layer 7): the acceptance bar for any model
 * in the chain. Each is filed through the real dump pipeline on a fresh
 * in-memory database and judged by what was filed, loosely enough that a
 * real model's wording passes and strictly enough that a wrong filing fails.
 * Used by src/modules/mac.golden.test.ts (a mocked Mac replaying `ideal`)
 * and scripts/golden-mac.ts (the real Mac).
 */
import { createBetterSqliteAdapter } from '../src/core/db/betterSqliteAdapter';
import { createLifeOS } from '../src/core/lifeos';
import { Registry } from '../src/core/registry/registry';
import type { LifeOSContext } from '../src/core/registry/context';
import type { ModuleManifest } from '../src/core/registry/types';
import type { LLMProvider } from '../src/core/ai/provider';
import { bus } from '../src/core/events/bus';
import { Assistant, READ_ONLY_TOOLS } from '../src/core/ai/assistant';
import { fileDump } from '../src/core/filing/dumps';
import { parseDateish } from '../src/core/ai/createAnything';
import { edgeLabel } from '../src/core/graph/edges';
import { accountType, debtType, subscriptionType, transactionType } from '../src/modules/finance/types';
import { financeAiTools } from '../src/modules/finance/aiTools';
import { financeFilingTools } from '../src/modules/finance/filing/tools';
import { assetsAiTools, assetType, routineType } from '../src/modules/assets';
import { groupType, personType } from '../src/modules/crm/types';
import { eventType, projectType, taskType } from '../src/modules/projects/types';
import { orgType, placeType } from '../src/modules/places/types';
import { tripType } from '../src/modules/travel/types';

export const GOLDEN_MODULES: ModuleManifest[] = [
  { id: 'crm', name: 'People', version: '1', description: '', icon: 'x', color: '#000', objects: [personType, groupType] },
  { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', objects: [accountType, transactionType, subscriptionType, debtType], aiTools: financeAiTools, filingTools: financeFilingTools },
  { id: 'assets', name: 'Things', version: '1', description: '', icon: 'x', color: '#000', objects: [assetType, routineType], aiTools: assetsAiTools },
  { id: 'projects', name: 'Projects', version: '1', description: '', icon: 'x', color: '#000', objects: [taskType, projectType, eventType] },
  { id: 'places', name: 'Places', version: '1', description: '', icon: 'x', color: '#000', objects: [placeType, orgType] },
  { id: 'travel', name: 'Travel', version: '1', description: '', icon: 'x', color: '#000', objects: [tripType] },
];

export type Call = { name: string; input: Record<string, unknown> };

export interface GoldenCase {
  name: string;
  say: string;
  /** Said on this record's page (its title; made by `setup`). */
  on?: string;
  setup?: (os: LifeOSContext) => void;
  /** What a good model calls, one round per array (the mocked Mac replays these). */
  ideal: Call[][];
  /** Null when the filing is right, else what is wrong. */
  check: (os: LifeOSContext) => string | null;
}

const find = (os: LifeOSContext, object: string, re: RegExp) => os.records.query(object, {}, { limit: 500 }).filter((r) => re.test(r.title));
const linksOf = (os: LifeOSContext, id: string) => os.links.forEntity(id).map((l) => `${edgeLabel(l.relation.kind, l.direction)} ${l.other.title}`.toLowerCase());
const fail = (...problems: Array<string | false | null | undefined>) => problems.filter(Boolean).join('; ') || null;

export const GOLDEN: GoldenCase[] = [
  {
    name: 'a new friend with a birthday',
    say: 'met a new friend today named Kendal, her birthday is on 8 Sept',
    ideal: [[{ name: 'upsert_node', input: { name: 'Kendal', type: 'person', is_new: true, attributes: { birthday: '8 Sept', relationship: 'friend' } } }]],
    check: (os) => {
      const k = find(os, 'person', /^kendal$/i);
      return fail(k.length !== 1 && `${k.length} people called Kendal`, k[0] && (k[0].data as { birthday?: string }).birthday !== parseDateish('8 sept') && `birthday is ${(k[0].data as { birthday?: string }).birthday ?? 'missing'}`);
    },
  },
  {
    name: 'details on a person’s page',
    say: 'her fav colour is pink, she’s vegetarian, new number 98450 12345',
    on: 'Kendal',
    setup: (os) => void os.records.create({ object: 'person', title: 'Kendal', data: {} }),
    ideal: [[{ name: 'set_attributes', input: { node: 'this', attributes: { 'favourite colour': 'pink', diet: 'vegetarian', phone: '98450 12345' } } }]],
    check: (os) => {
      const people = os.records.query('person');
      const d = (people[0]?.data ?? {}) as { phone?: string; notes?: string };
      const all = JSON.stringify(d).toLowerCase();
      return fail(people.length !== 1 && `${people.length} people (expected Kendal only)`, (d.phone ?? '').replace(/\D/g, '') !== '9845012345' && `phone is ${d.phone ?? 'missing'}`, !/pink/.test(all) && 'pink not kept', !/vegetarian/.test(all) && 'vegetarian not kept');
    },
  },
  {
    name: 'a day: flight, dinner, a brother, a bill',
    say: 'Took a flight from the US to Canada with Kendal on 8 Sept. Had dinner at Canoe with Kendal and her brother Mike, I paid 180 for dinner.',
    setup: (os) => void os.records.create({ object: 'person', title: 'Kendal', data: {} }),
    ideal: [
      [
        { name: 'record_event', input: { kind: 'flight', when: '8 Sept', roles: [{ role: 'from', node: { name: 'USA', type: 'place' } }, { role: 'to', node: { name: 'Canada', type: 'place' } }, { role: 'with', node: 'Kendal' }] } },
        { name: 'upsert_node', input: { name: 'Mike', type: 'person' } },
        { name: 'link', input: { from: 'Mike', to: 'Kendal', kind: 'family_of' } },
      ],
      [
        { name: 'record_event', input: { kind: 'dinner', when: '8 Sept', roles: [{ role: 'at', node: { name: 'Canoe', type: 'place' } }, { role: 'with', node: 'Kendal' }, { role: 'with', node: 'Mike' }] } },
        { name: 'log_spend', input: { amount: 180, merchant: 'Canoe', category: 'food', with: ['Kendal', 'Mike'], date: '8 Sept' } },
      ],
    ],
    check: (os) => {
      const kendal = find(os, 'person', /^kendal$/i);
      const mike = find(os, 'person', /^mike$/i);
      const flight = os.records.query('event').find((e) => /flight/i.test(`${(e.data as { kind?: string }).kind} ${e.title}`));
      const tx = os.records.query<{ amount: number }>('transaction');
      return fail(
        kendal.length !== 1 && `${kendal.length} people called Kendal`,
        mike.length !== 1 && 'no Mike',
        !flight && 'no flight',
        flight && kendal[0] && !linksOf(os, flight.id).some((l) => /kendal/.test(l)) && 'flight not linked to Kendal',
        !os.records.query('trip').length && 'no trip',
        !tx.some((t) => t.data.amount === 180) && 'no 180 spend',
      );
    },
  },
  {
    name: 'a purchase with a warranty on a card',
    say: 'bought a Dyson for 32k on the HDFC card, warranty 2 years',
    setup: (os) => void os.records.create({ object: 'account', title: 'HDFC card', data: { kind: 'credit', currency: 'INR' } }),
    ideal: [[
      { name: 'upsert_node', input: { name: 'Dyson', type: 'asset', attributes: { category: 'appliance', purchasePrice: '32k', purchaseDate: 'today', warrantyUntil: '2 years' } } },
      { name: 'log_spend', input: { amount: '32k', merchant: 'Dyson', category: 'shopping', for: 'Dyson', account: 'HDFC card' } },
    ]],
    check: (os) => {
      const dyson = find(os, 'asset', /dyson/i)[0];
      const hdfc = find(os, 'account', /hdfc/i)[0]!;
      const tx = os.records.query<{ amount: number; accountId?: string }>('transaction').find((t) => t.data.amount === 32000);
      return fail(
        !dyson && 'no Dyson',
        dyson && (dyson.data as { warrantyUntil?: string }).warrantyUntil !== parseDateish('2 years') && 'warranty date wrong',
        dyson && !os.cycles.forEntity(dyson.id).length && 'no warranty cycle',
        !tx && 'no 32,000 spend',
        tx && tx.data.accountId !== hdfc.id && 'spend not on the HDFC card',
      );
    },
  },
  {
    name: 'a rant with one buried task',
    say: ['Honestly today was exhausting.', 'The landlord still hasn’t fixed the leak and I’m so done with this building.', 'Work was chaos, three meetings that could have been emails.', 'Traffic on the way back was insane.', 'I need to call the plumber tomorrow before 10.', 'Anyway. Going to sleep early.'].join('\n'),
    ideal: [[{ name: 'create_task', input: { title: 'Call the plumber', due: 'tomorrow' } }]],
    check: (os) => {
      const counts = os.records.countsByType();
      const task = os.records.query('task')[0];
      return fail(JSON.stringify(counts) !== JSON.stringify({ task: 1 }) && `filed ${JSON.stringify(counts)} (expected one task only)`, task && !/plumber/i.test(task.title) && `task is "${task.title}"`);
    },
  },
  {
    name: 'a friend’s work and where you met',
    say: 'made a new friend today, Karan, works at Zomato, met at the gym',
    ideal: [[
      { name: 'upsert_node', input: { name: 'Karan', type: 'person', is_new: true, attributes: { company: 'Zomato' } } },
      { name: 'record_event', input: { kind: 'met', when: 'today', roles: [{ role: 'with', node: 'Karan' }, { role: 'at', node: { name: 'the gym', type: 'place' } }] } },
    ]],
    check: (os) => {
      const karan = find(os, 'person', /^karan$/i)[0];
      const works = karan && (/zomato/i.test(JSON.stringify(karan.data)) || linksOf(os, karan.id).some((l) => /zomato/.test(l)));
      return fail(!karan && 'no Karan', karan && !works && 'Zomato not on Karan');
    },
  },
  {
    name: 'a service done on the car',
    say: 'Took the Creta in for its service at Hyundai today, paid 6,400',
    setup: (os) => void os.records.create({ object: 'asset', title: 'Hyundai Creta', data: { category: 'vehicle', odometerKm: 29400, nextServiceKm: 30000 } }),
    ideal: [[{ name: 'log_done', input: { thing: 'Hyundai Creta', what: 'Service', cost: 6400 } }]],
    check: (os) => {
      const car = find(os, 'asset', /creta/i)[0]!;
      const service = os.cycles.forEntity(car.id).find((c) => c.template === 'asset.service');
      const tx = os.records.query<{ amount: number }>('transaction').find((t) => t.data.amount === 6400);
      return fail(os.records.query('asset').length !== 1 && 'a second car was made', !service?.lastDoneAt && 'service not rolled', !tx && 'no 6,400 spend');
    },
  },
];

/** Questions asked after Karan was filed: the answer must mention the word. */
export const GOLDEN_QUESTIONS: Array<{ ask: string; expect: RegExp; ideal: Call[][]; answer: string }> = [
  { ask: 'where does Karan work?', expect: /zomato/i, ideal: [[{ name: 'search', input: { query: 'Karan' } }]], answer: 'Karan works at Zomato.' },
];

/** Each LifeOS listens on the one event bus: clear it before the database closes (one run at a time). */
function close(os: LifeOSContext) {
  bus.clear();
  os.db.close();
}

export async function goldenLifeOS(): Promise<LifeOSContext> {
  bus.clear();
  return createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: GOLDEN_MODULES, registry: new Registry() });
}

export interface GoldenResult {
  name: string;
  ok: boolean;
  why: string | null;
  ms: number;
  filed: string[];
}

/** Files one golden sentence on a fresh database with this provider and judges the result. */
export async function runGoldenCase(c: GoldenCase, provider: LLMProvider): Promise<GoldenResult> {
  const os = await goldenLifeOS();
  try {
    c.setup?.(os);
    const subjectId = c.on ? os.records.query(null, {}, { limit: 50 }).find((r) => r.title === c.on)?.id : undefined;
    const d = os.dumps.add({ body: c.say, subjectId });
    const t0 = Date.now();
    const r = await fileDump(os, d.id, provider);
    const ms = Date.now() - t0;
    const filed = os.filings.forDump(d.id).map((x) => x.label);
    const why = r.status !== 'done' ? `${r.status}: ${r.error ?? ''}` : c.check(os);
    return { name: c.name, ok: !why, why, ms, filed };
  } finally {
    close(os);
  }
}

/** Files Karan, then asks each golden question through Talk (read-only tools). */
export async function runGoldenQuestions(provider: LLMProvider, filer: LLMProvider = provider): Promise<GoldenResult[]> {
  const os = await goldenLifeOS();
  try {
    const karan = GOLDEN.find((c) => /Karan/.test(c.say))!;
    await fileDump(os, os.dumps.add({ body: karan.say }).id, filer);
    const out: GoldenResult[] = [];
    for (const q of GOLDEN_QUESTIONS) {
      const t0 = Date.now();
      try {
        const turns = await new Assistant(os, { provider, toolFilter: (t) => READ_ONLY_TOOLS.has(t.name), confirm: async () => true, parser: false }).send(q.ask);
        const text = turns.filter((x) => x.role === 'assistant').map((x) => x.text).join(' ');
        out.push({ name: q.ask, ok: q.expect.test(text), why: q.expect.test(text) ? null : `answer was "${text.slice(0, 160)}"`, ms: Date.now() - t0, filed: [] });
      } catch (e) {
        out.push({ name: q.ask, ok: false, why: (e as Error).message.slice(0, 200), ms: Date.now() - t0, filed: [] });
      }
    }
    return out;
  } finally {
    close(os);
  }
}
