/**
 * The golden sentences against a real Ollama (R12; not run by `npm test`).
 * The Mac model alone, no cloud behind it: every sentence must pass for the
 * model to stay first in the chain (MODEL.md layer 7).
 *
 *   npx tsx scripts/golden-mac.ts                         # http://localhost:11434, qwen3:8b
 *   npx tsx scripts/golden-mac.ts 100.64.1.2 qwen3:8b     # the Mac's Tailscale address, a model
 *   OLLAMA_URL=… OLLAMA_MODEL=… npx tsx scripts/golden-mac.ts
 */
import { createOllamaProvider, normalizeOllamaUrl, testOllama } from '../src/core/ai/ollama';
import { PROVIDER_PRESETS } from '../src/core/ai/providers';
import { GOLDEN, runGoldenCase, runGoldenQuestions, type GoldenResult } from './golden-sentences';

const url = normalizeOllamaUrl(process.argv[2] ?? process.env.OLLAMA_URL ?? 'localhost');
const model = process.argv[3] ?? process.env.OLLAMA_MODEL ?? PROVIDER_PRESETS.ollama.defaultModel;

const show = (r: GoldenResult) => {
  console.log(`${r.ok ? '✓' : '✗'} ${r.name}  (${(r.ms / 1000).toFixed(1)} s)${r.why ? `\n    ${r.why}` : ''}`);
  for (const f of r.filed) console.log(`    · ${f}`);
};

async function main() {
  console.log(`Ollama at ${url}, model ${model}\n`);
  const check = await testOllama(url, model);
  for (const l of check.lines) console.log(`  ${l}`);
  if (!check.ok) process.exit(2);
  console.log('');
  const mac = createOllamaProvider({ baseUrl: url, model });
  const results: GoldenResult[] = [];
  for (const c of GOLDEN) {
    const r = await runGoldenCase(c, mac);
    show(r);
    results.push(r);
  }
  for (const r of await runGoldenQuestions(mac)) {
    show(r);
    results.push(r);
  }
  const failed = results.filter((r) => !r.ok).length;
  const secs = results.reduce((a, r) => a + r.ms, 0) / 1000;
  console.log(`\n${results.length - failed} of ${results.length} passed in ${secs.toFixed(0)} s${failed ? `: ${model} is not ready to go first.` : `: ${model} can go first.`}`);
  process.exit(failed ? 1 : 0);
}
void main();
