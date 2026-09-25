import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAICompatProvider, ProviderError } from './openaiCompat';
import { buildAgentProviders, createChainProvider, UsageCapError, withUsageMeter } from './providers';
import type { ChatMessage, LLMProvider, ToolSpec } from './provider';

const tools: ToolSpec[] = [{ name: 'mark_cycle_done', description: 'Mark a cycle done', input_schema: { type: 'object', properties: { id: { type: 'string' } } } }];

function mockFetch(handler: (url: string, body: any) => { status?: number; json?: unknown; text?: string; headers?: Record<string, string> }) {
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const r = handler(url, body);
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (k: string) => r.headers?.[k.toLowerCase()] ?? null },
      json: async () => r.json,
      text: async () => r.text ?? JSON.stringify(r.json ?? {}),
    } as unknown as Response;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('OpenAI-compatible provider', () => {
  it('translates a Claude-shaped tool round-trip into OpenAI messages and back', async () => {
    const fetch = mockFetch((_url, body) => {
      // Assert the outbound shape on the second call (after a tool result)
      if (body.messages.length > 2) {
        expect(body.messages[0]).toEqual({ role: 'system', content: 'SYS' });
        expect(body.messages[1]).toEqual({ role: 'user', content: 'did laundry' });
        expect(body.messages[2]).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'mark_cycle_done' } }] });
        expect(body.messages[3]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '{"ok":true}' });
        return { json: { choices: [{ message: { content: 'Done — next laundry in 4 days.' }, finish_reason: 'stop' }], usage: { prompt_tokens: 40, completion_tokens: 9 } } };
      }
      expect(body.tools[0]).toMatchObject({ type: 'function', function: { name: 'mark_cycle_done' } });
      return {
        json: {
          choices: [{ message: { content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'mark_cycle_done', arguments: '{"id":"laundry"}' } }] }, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 30, completion_tokens: 5 },
        },
      };
    });
    const p = createOpenAICompatProvider({ id: 'groq', baseUrl: 'https://api.groq.com/openai/v1/', apiKey: 'k', model: 'm' });

    const first = await p.complete({ system: 'SYS', messages: [{ role: 'user', content: 'did laundry' }], tools });
    expect(first.stopReason).toBe('tool_use');
    expect(first.content).toEqual([{ type: 'tool_use', id: 'call_1', name: 'mark_cycle_done', input: { id: 'laundry' } }]);
    expect(fetch.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((fetch.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer k' });

    const history: ChatMessage[] = [
      { role: 'user', content: 'did laundry' },
      { role: 'assistant', content: first.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '{"ok":true}' }] },
    ];
    const second = await p.complete({ system: 'SYS', messages: history, tools });
    expect(second.stopReason).toBe('end_turn');
    expect(second.content).toEqual([{ type: 'text', text: 'Done — next laundry in 4 days.' }]);
    expect(second.usage).toEqual({ input: 40, output: 9 });
  });

  it('salvages sloppy tool arguments from open models', async () => {
    mockFetch(() => ({ json: { choices: [{ message: { content: null, tool_calls: [{ id: 'c', function: { name: 'x', arguments: '{"a":1} Let me know!' } }] }, finish_reason: 'tool_calls' }] } }));
    const p = createOpenAICompatProvider({ id: 't', baseUrl: 'http://x', model: 'm' });
    const r = await p.complete({ system: '', messages: [{ role: 'user', content: 'hi' }], tools });
    expect(r.content[0]).toMatchObject({ type: 'tool_use', input: { a: 1 } });
  });

  it('turns 429 into a ProviderError with retry-after', async () => {
    mockFetch(() => ({ status: 429, text: 'rate limited', headers: { 'retry-after': '7' } }));
    const p = createOpenAICompatProvider({ id: 'groq', baseUrl: 'http://x', apiKey: 'k', model: 'm' });
    await expect(p.complete({ system: '', messages: [{ role: 'user', content: 'hi' }], tools: [] })).rejects.toMatchObject({ name: 'ProviderError', status: 429, retryAfterMs: 7000, isRateLimit: true });
  });
});

function fake(id: string, impl: () => Promise<{ text: string }> | never): LLMProvider {
  return { id, complete: async () => ({ content: [{ type: 'text', text: (await impl()).text }], stopReason: 'end_turn', usage: { input: 10, output: 2 } }) };
}

describe('chain provider', () => {
  it('falls through on rate limit and puts the limited provider on cooldown', async () => {
    let groqCalls = 0;
    const groq: LLMProvider = { id: 'groq', complete: async () => { groqCalls++; throw new ProviderError('429', 'groq', 429, 30_000); } };
    const gemini = fake('gemini', async () => ({ text: 'from gemini' }));
    const fallbacks: string[] = [];
    const chain = createChainProvider([groq, gemini], { onFallback: (f, t) => fallbacks.push(`${f}>${t}`) });
    const args = { system: '', messages: [{ role: 'user' as const, content: 'hi' }], tools: [] };

    const r1 = await chain.complete(args);
    expect(r1.content[0]).toEqual({ type: 'text', text: 'from gemini' });
    expect(fallbacks).toEqual(['groq>gemini']);

    // Second call: groq is cooling down, so gemini is tried first and groq isn't hit at all.
    await chain.complete(args);
    expect(groqCalls).toBe(1);
  });

  it('does not fall through on a non-retryable 400', async () => {
    const bad: LLMProvider = { id: 'a', complete: async () => { throw new ProviderError('bad request', 'a', 400); } };
    const ok = fake('b', async () => ({ text: 'b' }));
    await expect(createChainProvider([bad, ok]).complete({ system: '', messages: [], tools: [] })).rejects.toMatchObject({ status: 400 });
  });
});

describe('usage meter', () => {
  it('accumulates tokens and enforces the monthly cap', async () => {
    let store: Record<string, any> = {};
    const p = withUsageMeter(fake('groq', async () => ({ text: 'x' })), { load: () => store, save: (u) => (store = u), monthlyTokenCap: () => 25 });
    const args = { system: '', messages: [], tools: [] };
    await p.complete(args);
    await p.complete(args);
    expect(store.groq).toEqual({ provider: 'groq', input: 20, output: 4, calls: 2 });
    await p.complete(args); // 24 -> 36, allowed because check happens before the call
    await expect(p.complete(args)).rejects.toBeInstanceOf(UsageCapError);
  });
});

describe('buildAgentProviders', () => {
  it('builds a main and a small chain from settings, skipping disabled entries', () => {
    let store: Record<string, any> = {};
    const { main, small } = buildAgentProviders({
      chain: [
        { kind: 'groq', apiKey: 'g' },
        { kind: 'claude', apiKey: 'c', enabled: false },
        { kind: 'gemini', apiKey: 'x' },
      ],
      usage: { load: () => store, save: (u) => (store = u) },
    });
    expect(main.id).toBe('chain(groq>gemini)');
    expect(small.id).toBe('chain(groq>gemini)');
  });

  it('refuses a keyed provider without a key', () => {
    expect(() => buildAgentProviders({ chain: [{ kind: 'groq' }], usage: { load: () => ({}), save: () => {} } })).toThrow(/no API key/);
  });
});

describe('Claude in the chain', () => {
  it('turns Claude 529 (overloaded) into a rate limit the chain falls through', async () => {
    mockFetch((url) => (url.includes('anthropic') ? { status: 529, text: 'overloaded' } : { json: { choices: [{ message: { content: 'from groq' }, finish_reason: 'stop' }] } }));
    const { createClaudeProvider } = await import('./provider');
    const claude = createClaudeProvider({ apiKey: 'k', model: 'claude-haiku-4-5' });
    const groq = createOpenAICompatProvider({ id: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'g', model: 'm' });
    const r = await createChainProvider([claude, groq]).complete({ system: '', messages: [{ role: 'user', content: 'hi' }], tools: [] });
    expect(r.content[0]).toEqual({ type: 'text', text: 'from groq' });
    expect(groq.model).toBe('m');
  });
});
