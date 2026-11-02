/**
 * R12: the golden sentences against a mocked Mac. A fake Ollama answers
 * /api/version, /api/tags and /api/chat over the stubbed fetch, replaying
 * each sentence's ideal tool calls in Ollama's own format, so the real
 * provider, chain and filing pipeline run end to end. Then: the cloud is
 * reached only when the Mac fails, and budgets count the cloud only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import { bus } from '@core/events/bus';
import type { ContentBlock, LLMProvider } from '@core/ai/provider';
import { createOllamaProvider, forgetOllama } from '@core/ai/ollama';
import { buildAgentProviders, createChainProvider } from '@core/ai/providers';
import { meterProvider, recordUsage, UsageCapError } from '@core/ai/routing';
import { GOLDEN, GOLDEN_QUESTIONS, runGoldenCase, runGoldenQuestions, type Call } from '../../scripts/golden-sentences';

const MAC = 'http://100.64.0.7:11434';
type Body = { model: string; messages: Array<{ role: string; content: string; tool_name?: string }>; tools?: unknown[]; think?: boolean; stream: boolean; options: { num_ctx: number } };

/** A fake Ollama: finds the case by the first user message and replays its rounds; `bad` breaks every reply. */
function fakeMac(opts: { down?: boolean; bad?: Call } = {}) {
  const seen = { version: 0, chat: [] as Body[] };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!url.startsWith(MAC)) throw new Error(`unexpected fetch ${url}`);
    if (opts.down) throw new TypeError('Network request failed');
    if (url.endsWith('/api/version')) return (seen.version++, Response.json({ version: '0.12.6' }));
    if (url.endsWith('/api/tags')) return Response.json({ models: [{ name: 'qwen3:8b' }] });
    const body = JSON.parse(String(init!.body)) as Body;
    seen.chat.push(body);
    if (opts.bad) return Response.json({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: opts.bad.name, arguments: opts.bad.input } }] }, done_reason: 'stop', prompt_eval_count: 900, eval_count: 30 });
    const first = body.messages.find((m) => m.role === 'user')!.content;
    const round = body.messages.filter((m) => m.role === 'assistant').length;
    const c = GOLDEN.find((g) => first.includes(g.say.split('\n')[0]!));
    const q = GOLDEN_QUESTIONS.find((x) => first.includes(x.ask));
    const rounds = c?.ideal ?? q?.ideal ?? [];
    const calls = rounds[round];
    const message = calls ? { role: 'assistant', content: '', tool_calls: calls.map((x) => ({ function: { name: x.name, arguments: x.input } })) } : { role: 'assistant', content: q?.answer ?? 'done' };
    return Response.json({ message, done_reason: 'stop', prompt_eval_count: 1200, eval_count: 40 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return seen;
}

/** A cloud provider that files like the ideal model, and counts its calls. */
function cloud(): LLMProvider & { calls: number } {
  const p = {
    id: 'groq',
    calls: 0,
    complete: async ({ messages }: Parameters<LLMProvider['complete']>[0]) => {
      p.calls++;
      const first = messages[0]!.content as string;
      const c = GOLDEN.find((g) => first.includes(g.say.split('\n')[0]!));
      const calls = c?.ideal[messages.filter((m) => m.role === 'assistant').length];
      if (!calls) return { content: [{ type: 'text' as const, text: 'done' }], stopReason: 'end_turn' };
      return { content: calls.map((x, k): ContentBlock => ({ type: 'tool_use', id: `g${k}`, name: x.name, input: x.input })), stopReason: 'tool_use' };
    },
  };
  return p;
}

const mac = () => createOllamaProvider({ baseUrl: '100.64.0.7', model: 'qwen3:8b' });

beforeEach(() => {
  bus.clear();
  forgetOllama();
});
afterEach(() => vi.unstubAllGlobals());

describe('golden sentences on the Mac (mocked Ollama)', () => {
  for (const c of GOLDEN)
    it(`${c.name}: filed by the Mac, the cloud never asked`, async () => {
      const seen = fakeMac();
      const sky = cloud();
      const r = await runGoldenCase(c, createChainProvider([mac(), sky]));
      expect(r).toMatchObject({ ok: true, why: null });
      expect(sky.calls).toBe(0);
      // Ollama's own API: context set, thinking off, one answer, tools offered, results named.
      for (const b of seen.chat) expect(b).toMatchObject({ model: 'qwen3:8b', stream: false, think: false, options: { num_ctx: 16_384 } });
      if (seen.chat.length) expect(seen.chat[0]!.tools!.length).toBeGreaterThan(3);
      for (const b of seen.chat.slice(1)) expect(b.messages.filter((m) => m.role === 'tool').every((m) => !!m.tool_name)).toBe(true);
    });

  it('the questions: answered on the Mac from what was filed', async () => {
    fakeMac();
    const results = await runGoldenQuestions(createChainProvider([mac(), cloud()]));
    expect(results.map((r) => r.why)).toEqual(GOLDEN_QUESTIONS.map(() => null));
  });
});

describe('cloud only on failure', () => {
  it('a tool that was not offered: that call goes to the cloud, which files it', async () => {
    fakeMac({ bad: { name: 'teleport', input: {} } });
    const sky = cloud();
    const fallbacks: string[] = [];
    const r = await runGoldenCase(GOLDEN[0]!, createChainProvider([mac(), sky], { onFallback: (a, b, e) => fallbacks.push(`${a}>${b}: ${e.message}`) }));
    expect(r.ok).toBe(true);
    expect(sky.calls).toBeGreaterThan(0);
    expect(fallbacks[0]).toMatch(/^ollama>groq: ollama 400: invalid tool call \(teleport was not offered\)/);
  });

  it('arguments that are not an object, or an empty reply, are failures too', async () => {
    fakeMac({ bad: { name: 'upsert_node', input: 'Kendal' as never } });
    await expect(mac().complete({ system: 's', messages: [{ role: 'user', content: 'x' }], tools: [{ name: 'upsert_node', description: '', input_schema: {} }] })).rejects.toMatchObject({ status: 400, isRetryable: true });
  });

  it('a Mac that does not answer is skipped for two minutes; the cloud files meanwhile', async () => {
    const seen = fakeMac({ down: true });
    const sky = cloud();
    const chain = createChainProvider([mac(), sky]);
    expect((await runGoldenCase(GOLDEN[0]!, chain)).ok).toBe(true);
    const calls = vi.mocked(fetch).mock.calls.length;
    expect((await runGoldenCase(GOLDEN[5]!, chain)).ok).toBe(true);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls); // not even pinged
    expect(sky.calls).toBeGreaterThan(1);
    expect(seen.chat).toEqual([]);
  });

  it('the Mac goes first in the chain, whatever its place in settings', () => {
    const { main, small } = buildAgentProviders({ chain: [{ kind: 'groq', apiKey: 'k' }, { kind: 'ollama', baseUrl: '100.64.0.7' }, { kind: 'claude', apiKey: 'k' }] });
    expect(main.id).toBe('chain(ollama>groq>claude)');
    expect(small.id).toBe('chain(ollama>groq>claude)');
  });
});

describe('the budget counts the cloud only', () => {
  it('a cap stops the cloud provider but never the Mac; the Mac’s tokens are still written down', async () => {
    fakeMac();
    const os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [], registry: new Registry() });
    recordUsage(os, { provider: 'ollama', model: 'qwen3:8b', purpose: 'chat', input: 50_000, output: 1_000 });
    recordUsage(os, { provider: 'groq', model: 'x', purpose: 'chat', input: 50_000, output: 1_000 });
    const cap = () => 10_000;
    const args = { system: 's', messages: [{ role: 'user' as const, content: 'met a new friend today named Kendal, her birthday is on 8 Sept' }], tools: [{ name: 'upsert_node', description: '', input_schema: {} }] };
    const local = await meterProvider(os, mac(), { purpose: 'chat', cap }).complete(args);
    expect(local.stopReason).toBe('tool_use');
    await expect(meterProvider(os, cloud(), { purpose: 'chat', cap }).complete(args)).rejects.toBeInstanceOf(UsageCapError);
    expect(os.db.get<{ n: number }>(`SELECT COUNT(*) n FROM ai_usage WHERE provider='ollama'`)!.n).toBe(2);
    os.db.close();
  });
});
