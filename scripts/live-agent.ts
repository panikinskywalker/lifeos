/**
 * Live check of the agent against real providers (not run by `npm test`):
 * files sentences through the real dump pipeline and asks questions, on an
 * in-memory database, then prints what was filed and linked.
 *
 *   npx tsx scripts/live-agent.ts            # keys from ~/.lifeos-keys or env
 *
 * ~/.lifeos-keys (outside the repo, never committed):
 *   GROQ_API_KEY=...
 *   GEMINI_API_KEY=...
 */
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { createBetterSqliteAdapter } from '../src/core/db/betterSqliteAdapter';
import { createLifeOS } from '../src/core/lifeos';
import { Registry } from '../src/core/registry/registry';
import type { ModuleManifest } from '../src/core/registry/types';
import { buildAgentProviders, type ProviderConfig } from '../src/core/ai/providers';
import { fileDump } from '../src/core/filing/dumps';
import { Assistant, READ_ONLY_TOOLS } from '../src/core/ai/assistant';
import { edgeLabel } from '../src/core/graph/edges';
import { accountType, debtType, subscriptionType, transactionType } from '../src/modules/finance/types';
import { financeAiTools } from '../src/modules/finance/aiTools';
import { assetsAiTools, assetType, routineType, vehicleType } from '../src/modules/assets/types';
import { groupType, personType } from '../src/modules/crm/types';
import { eventType, projectType, taskType } from '../src/modules/projects/types';
import { orgType, placeType } from '../src/modules/places/types';
import { tripType } from '../src/modules/travel/types';

const file = `${homedir()}/.lifeos-keys`;
const env: Record<string, string> = { ...(process.env as Record<string, string>) };
if (existsSync(file)) for (const l of readFileSync(file, 'utf8').split('\n')) { const m = /^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/.exec(l); if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, ''); }
const only = process.argv[2]; // optional: groq | gemini
const chain: ProviderConfig[] = [];
if (env.GROQ_API_KEY && only !== 'gemini') chain.push({ kind: 'groq', apiKey: env.GROQ_API_KEY });
if (env.GEMINI_API_KEY && only !== 'groq') chain.push({ kind: 'gemini', apiKey: env.GEMINI_API_KEY });
if (!chain.length) { console.error(`No keys: put GROQ_API_KEY / GEMINI_API_KEY in ${file}`); process.exit(1); }

const modules: ModuleManifest[] = [
  { id: 'crm', name: 'People', version: '1', description: '', icon: 'x', color: '#000', objects: [personType, groupType] },
  { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', objects: [accountType, transactionType, subscriptionType, debtType], aiTools: financeAiTools },
  { id: 'assets', name: 'Things', version: '1', description: '', icon: 'x', color: '#000', objects: [assetType, vehicleType, routineType], aiTools: assetsAiTools },
  { id: 'projects', name: 'Projects', version: '1', description: '', icon: 'x', color: '#000', objects: [taskType, projectType, eventType] },
  { id: 'places', name: 'Places', version: '1', description: '', icon: 'x', color: '#000', objects: [placeType, orgType] },
  { id: 'travel', name: 'Travel', version: '1', description: '', icon: 'x', color: '#000', objects: [tripType] },
];

const TELL = [
  'met a new friend today named Kendal, her birthday is on 8 Sept',
  'Took a flight from the US to Canada with Kendal on 8th Sept. We had dinner at Canoe with her brother Mike, I paid 180 for dinner.',
  'Karan works at Zomato, met him at the gym today. Need to call the plumber tomorrow.',
  'bought a Dyson for 32k on the HDFC card, warranty 2 years',
];
const ON_PAGE: [string, string] = ['Kendal', 'her favourite colour is pink and she is vegetarian'];
const ASK = ['when did I last see Kendal?', 'where does Karan work', 'who was on the Canada trip?'];

async function main() {
  const os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules, registry: new Registry() });
  os.records.create({ object: 'account', title: 'HDFC card', data: { kind: 'credit', currency: 'INR' } });
  let fellBack = '';
  const built = buildAgentProviders({ chain, events: { onFallback: (a, b, e) => (fellBack += ` [${a}→${b}: ${e.message.slice(0, 120)}]`) } });
  // LIVE_DEBUG=1 prints every tool call the model makes and what came back.
  const main: typeof built.main = env.LIVE_DEBUG
    ? { ...built.main, complete: async (args) => {
        const r = await built.main.complete(args);
        for (const b of r.content) if (b.type === 'tool_use') console.log(`      → ${b.name} ${JSON.stringify(b.input)}`);
        if (!r.content.some((b) => b.type === 'tool_use')) console.log(`      ✎ [${built.main.model ?? '?'}] ${r.content.map((b) => (b.type === 'text' ? b.text : '')).join(' ').replace(/\s+/g, ' ').slice(0, 160)}`);
        const last = args.messages[args.messages.length - 1]!;
        if (Array.isArray(last.content)) for (const b of last.content) if (b.type === 'tool_result' && b.is_error) console.log(`      ← error ${b.content.slice(0, 200)}`);
        return r;
      } }
    : built.main;
  console.log(`Chain: ${chain.map((c) => c.kind).join(' → ')}\n`);
  let failures = 0;
  const file1 = async (body: string, subjectId?: string) => {
    fellBack = '';
    const d = os.dumps.add({ body, subjectId });
    const t0 = Date.now();
    const r = await fileDump(os, d.id, main);
    const ok = r.status === 'done' && !r.error;
    if (!ok) failures++;
    console.log(`${ok ? '✓' : '✗'} “${body}”  (${r.status}, ${r.items} writes, ${Date.now() - t0} ms)${r.error ? `\n    ERROR: ${r.error}` : ''}${fellBack}`);
    for (const x of os.filings.forDump(d.id)) console.log(`    · ${x.label}${x.flag ? `   ⚑ ${x.flag}` : ''}`);
  };
  for (const s of TELL) await file1(s);
  const kendal = os.records.query('person').find((p) => p.title.toLowerCase() === ON_PAGE[0].toLowerCase());
  if (kendal) await file1(ON_PAGE[1], kendal.id);
  else console.log('✗ no Kendal to test the page update on');

  console.log('\n— Graph —');
  for (const e of os.records.query(null, {}, { limit: 100 })) {
    const links = os.links.forEntity(e.id).map((l) => `${edgeLabel(l.relation.kind, l.direction).toLowerCase()} ${l.other.title}`);
    const d = e.data as Record<string, unknown>;
    const facts = ['birthday', 'company', 'relationship', 'notes', 'purchasePrice', 'warrantyUntil', 'amount', 'kind', 'dueDate'].filter((k) => d[k] != null && d[k] !== '').map((k) => `${k}=${String(d[k]).replace(/\n/g, ' / ')}`);
    console.log(`${e.object.padEnd(11)} ${e.title}${facts.length ? `  {${facts.join(', ')}}` : ''}${links.length ? `\n              ↳ ${links.join(' · ')}` : ''}`);
  }

  console.log('\n— Questions —');
  const a = new Assistant(os, { provider: main, toolFilter: (t) => READ_ONLY_TOOLS.has(t.name), confirm: async () => true, parser: true });
  for (const q of ASK) {
    try {
      const turns = await a.send(q);
      console.log(`? ${q}\n  → ${turns.filter((x) => x.role === 'assistant').map((x) => x.text).join(' ').replace(/\s+/g, ' ').slice(0, 300)}`);
    } catch (e) {
      failures++;
      console.log(`? ${q}\n  ✗ ${(e as Error).message.slice(0, 300)}`);
    }
  }
  const usage = os.db.all<{ provider: string; n: number; tin: number; tout: number }>(`SELECT provider, COUNT(*) n, SUM(input_tokens) tin, SUM(output_tokens) tout FROM ai_usage GROUP BY provider`);
  if (usage.length) console.log(`\nUsage: ${usage.map((u) => `${u.provider} ${u.n} calls, ${u.tin} in / ${u.tout} out`).join(' · ')}`);
  console.log(failures ? `\n${failures} failed` : '\nAll filed.');
  process.exit(failures ? 1 : 0);
}
void main();
