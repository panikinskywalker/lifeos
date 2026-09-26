import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOpenAICompatProvider, ProviderError } from './openaiCompat';
import { buildAgentProviders, createChainProvider } from './providers';
import type { ChatMessage, LLMProvider, ToolSpec } from './provider';

const tools: ToolSpec[] = [{ name: 'mark_cycle_done', description: 'Mark a cycle done', input_schema: { type: 'object', properties: { id: { type: 'string' } } } }];

function mockFetch(handler: (url: string, body: any) => { status?: number; json?: unknown; text?: string; headers?: Record<string, string> }) {
  const fn = vi.fn(async (url: string, init: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
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

  it('the last provider, briefly limited, waits once and retries; a long limit fails fast', async () => {
    let n = 0;
    const groq: LLMProvider = { id: 'groq', complete: async () => { if (n++ === 0) throw new ProviderError('groq 429: tpm', 'groq', 429, 5); return { content: [{ type: 'text', text: 'ok' }], stopReason: 'end_turn' }; } };
    const r = await createChainProvider([groq]).complete({ system: '', messages: [], tools: [] });
    expect(r.content[0]).toEqual({ type: 'text', text: 'ok' });
    expect(n).toBe(2);
    const slow: LLMProvider = { id: 'slow', complete: async () => { throw new ProviderError('slow 429', 'slow', 429, 60_000); } };
    await expect(createChainProvider([slow]).complete({ system: '', messages: [], tools: [] })).rejects.toMatchObject({ status: 429 });
  });

  it('falls through when a request is too large for a free tier (413)', async () => {
    const big: LLMProvider = { id: 'groq', complete: async () => { throw new ProviderError('groq 413: Request too large', 'groq', 413); } };
    const r = await createChainProvider([big, fake('gemini', async () => ({ text: 'g' }))]).complete({ system: '', messages: [], tools: [] });
    expect(r.content[0]).toEqual({ type: 'text', text: 'g' });
  });

  it('does not fall through on a non-retryable 400', async () => {
    const bad: LLMProvider = { id: 'a', complete: async () => { throw new ProviderError('bad request', 'a', 400); } };
    const ok = fake('b', async () => ({ text: 'b' }));
    await expect(createChainProvider([bad, ok]).complete({ system: '', messages: [], tools: [] })).rejects.toMatchObject({ status: 400 });
  });
});

describe('buildAgentProviders', () => {
  it('builds a main and a small chain from settings, skipping disabled entries', () => {
    const roles: string[] = [];
    const { main, small } = buildAgentProviders({
      chain: [
        { kind: 'groq', apiKey: 'g' },
        { kind: 'claude', apiKey: 'c', enabled: false },
        { kind: 'gemini', apiKey: 'x' },
      ],
      wrap: (p, role) => (roles.push(`${p.id}:${role}:${p.model}`), p),
    });
    expect(main.id).toBe('chain(groq>gemini)');
    expect(small.id).toBe('chain(groq>gemini)');
    expect(roles).toEqual(['groq:main:llama-3.3-70b-versatile', 'gemini:main:gemini-flash-latest', 'groq:small:llama-3.1-8b-instant', 'gemini:small:gemini-flash-lite-latest']);
  });

  it('refuses a keyed provider without a key', () => {
    expect(() => buildAgentProviders({ chain: [{ kind: 'groq' }] })).toThrow(/no API key/);
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

describe('retired models', () => {
  it('asks the host for its models, switches to a good one, retries and reports it', async () => {
    const { pickModel } = await import('./openaiCompat');
    const seen: string[] = [];
    mockFetch((url, body) => {
      if (url.endsWith('/models')) return { json: { data: [{ id: 'whisper-large-v3' }, { id: 'llama-3.1-8b-instant' }, { id: 'openai/gpt-oss-120b' }, { id: 'llama-guard-4-12b' }] } };
      seen.push(body.model);
      if (body.model === 'llama-3.3-70b-versatile') return { status: 404, text: '{"error":{"message":"The model `llama-3.3-70b-versatile` has been decommissioned","code":"model_not_found"}}' };
      return { json: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] } };
    });
    const changed: string[] = [];
    const p = createOpenAICompatProvider({ id: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'k', model: 'llama-3.3-70b-versatile', onModelChanged: (m) => changed.push(m) });
    const r = await p.complete({ system: '', messages: [{ role: 'user', content: 'hi' }], tools: [] });
    expect(r.content[0]).toEqual({ type: 'text', text: 'ok' });
    expect(seen).toEqual(['llama-3.3-70b-versatile', 'openai/gpt-oss-120b']);
    expect(changed).toEqual(['openai/gpt-oss-120b']);
    expect(p.model).toBe('openai/gpt-oss-120b');
    expect(pickModel(['llama-3.1-8b-instant', 'openai/gpt-oss-120b'], true)).toBe('llama-3.1-8b-instant');
  });

  it('Gemini: "no longer available" switches to a current model from its models/ list', async () => {
    const { pickModel } = await import('./openaiCompat');
    const seen: string[] = [];
    mockFetch((url, body) => {
      if (url.endsWith('/models')) return { json: { object: 'list', data: ['models/gemini-2.5-flash', 'models/gemini-2.0-flash', 'models/gemini-3-flash', 'models/gemini-flash-latest', 'models/gemini-flash-lite-latest', 'models/gemini-2.5-flash-preview-tts', 'models/text-embedding-004', 'models/gemma-3-27b-it', 'models/gemini-2.5-flash-image'].map((id) => ({ id })) } };
      seen.push(body.model);
      if (body.model === 'gemini-2.5-flash') return { status: 404, text: '[{"error":{"code":404,"message":"This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use a newer model.","status":"NOT_FOUND"}}]' };
      return { json: { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] } };
    });
    const p = createOpenAICompatProvider({ id: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: 'k', model: 'gemini-2.5-flash' });
    await p.complete({ system: '', messages: [{ role: 'user', content: 'hi' }], tools: [] });
    expect(seen).toEqual(['gemini-2.5-flash', 'gemini-flash-latest']);
    expect(pickModel(['gemini-2.0-flash', 'gemini-3-flash', 'gemini-2.5-pro'])).toBe('gemini-3-flash');
    expect(pickModel(['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3-flash'], true)).toBe('gemini-flash-lite-latest');
    expect(new ProviderError('gemini 400: This model is no longer available', 'gemini', 400).isModelMissing).toBe(true);
    expect(new ProviderError('gemini 400: bad tool schema', 'gemini', 400).isModelMissing).toBe(false);
  });

  it('a model error with nothing to switch to falls through the chain', async () => {
    mockFetch((url) => (url.includes('groq') ? (url.endsWith('/models') ? { status: 500, text: 'down' } : { status: 404, text: 'model_not_found: The model does not exist' }) : { json: { choices: [{ message: { content: 'from gemini' }, finish_reason: 'stop' }] } }));
    const groq = createOpenAICompatProvider({ id: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'k', model: 'gone' });
    const gemini = createOpenAICompatProvider({ id: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: 'k', model: 'm' });
    const r = await createChainProvider([groq, gemini]).complete({ system: '', messages: [{ role: 'user', content: 'hi' }], tools: [] });
    expect(r.content[0]).toEqual({ type: 'text', text: 'from gemini' });
  });
});

describe('tool calls that small models fumble', () => {
  it('schemas sent to models allow null, extra keys and flatten name-or-object unions', async () => {
    const { toolSpec, stripNulls } = await import('./assistant');
    const { graphTools, newSession } = await import('../graph/tools');
    const spec = toolSpec(graphTools(newSession('d')).find((t) => t.name === 'record_event')!).input_schema as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const json = JSON.stringify(spec);
    expect(json).not.toContain('additionalProperties');
    expect(json).not.toContain('anyOf');
    expect(spec.properties.when.type).toEqual(['string', 'null']);
    expect(spec.properties.kind.type).toBe('string');
    expect(spec.properties.roles.items.properties.node.type).toBe('string');
    expect(stripNulls({ a: 1, b: null, c: [{ d: null, e: 'x' }] })).toEqual({ a: 1, c: [{ e: 'x' }] });
  });

  it('Groq "tool call validation failed" is retried once, then falls through the chain', async () => {
    let calls = 0;
    mockFetch((url) => {
      if (url.includes('groq')) {
        calls++;
        return { status: 400, text: '{"error":{"message":"tool call validation failed: parameters for tool record_event did not match schema","type":"invalid_request_error","code":"tool_use_failed"}}' };
      }
      return { json: { choices: [{ message: { content: 'from gemini' }, finish_reason: 'stop' }] } };
    });
    const groq = createOpenAICompatProvider({ id: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'g', model: 'm' });
    const gemini = createOpenAICompatProvider({ id: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKey: 'k', model: 'gemini-flash-latest' });
    const r = await createChainProvider([groq, gemini]).complete({ system: '', messages: [{ role: 'user', content: 'hi' }], tools: [] });
    expect(calls).toBe(2);
    expect(r.content[0]).toEqual({ type: 'text', text: 'from gemini' });
  });
});
