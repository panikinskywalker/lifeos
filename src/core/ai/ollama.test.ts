import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOllamaProvider, forgetOllama, normalizeOllamaUrl, testOllama } from './ollama';
import { createProvider } from './providers';
import { isLocalProvider } from './provider';

const tools = [{ name: 'log_done', description: 'a chore', input_schema: { type: 'object' } }];
const ask = { system: 's', messages: [{ role: 'user' as const, content: 'did laundry' }], tools };

/** Routes each path to a handler; records request bodies. */
function serve(routes: Record<string, (body: Record<string, unknown>) => Response>) {
  const bodies: Array<Record<string, unknown>> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    if (init?.body) bodies.push(body);
    const h = routes[path];
    if (!h) throw new Error(`no route ${path}`);
    return h(body);
  }));
  return bodies;
}
const version = () => Response.json({ version: '0.12.6' });

beforeEach(() => forgetOllama());
afterEach(() => vi.unstubAllGlobals());

describe('the Mac provider (Ollama /api/chat)', () => {
  it('takes an IP, a Tailscale name or an old /v1 address', () => {
    expect(normalizeOllamaUrl('100.64.1.2')).toBe('http://100.64.1.2:11434');
    expect(normalizeOllamaUrl('rutvij-mac.tail1234.ts.net')).toBe('http://rutvij-mac.tail1234.ts.net:11434');
    expect(normalizeOllamaUrl('http://100.64.1.2:11434/v1/')).toBe('http://100.64.1.2:11434');
    expect(normalizeOllamaUrl('https://mac.example:8443')).toBe('https://mac.example:8443');
    expect(normalizeOllamaUrl('  ')).toBe('');
  });

  it('is what settings build for "ollama", and counts as local', () => {
    expect(createProvider({ kind: 'ollama', baseUrl: '100.64.1.2' }).id).toBe('ollama');
    expect(createProvider({ kind: 'ollama', baseUrl: '100.64.1.2' }, 'small').model).toBe('qwen3:8b');
    expect(isLocalProvider('ollama')).toBe(true);
    expect(isLocalProvider('groq')).toBe(false);
  });

  it('reads tool calls and usage; a call written as text is still a call', async () => {
    serve({ '/api/version': version, '/api/chat': () => Response.json({ message: { content: '<think>hm</think>\n<tool_call>{"name":"log_done","arguments":{"what":"laundry"}}</tool_call>' }, prompt_eval_count: 700, eval_count: 20 }) });
    const r = await createOllamaProvider({ baseUrl: '100.64.1.2', model: 'qwen3:8b' }).complete(ask);
    expect(r.stopReason).toBe('tool_use');
    expect(r.content).toEqual([expect.objectContaining({ type: 'tool_use', name: 'log_done', input: { what: 'laundry' } })]);
    expect(r.usage).toEqual({ input: 700, output: 20 });
  });

  it('an Ollama without the thinking switch is asked again without it', async () => {
    const bodies = serve({ '/api/version': version, '/api/chat': (b) => ('think' in b ? new Response('{"error":"invalid think value"}', { status: 400 }) : Response.json({ message: { content: 'done' } })) });
    const p = createOllamaProvider({ baseUrl: '100.64.1.2', model: 'llama3.1:8b' });
    expect((await p.complete(ask)).content).toEqual([{ type: 'text', text: 'done' }]);
    await p.complete(ask);
    expect(bodies.map((b) => 'think' in b)).toEqual([true, false, false]);
  });

  it('a model that is not pulled, or an empty reply, is a retryable failure', async () => {
    serve({ '/api/version': version, '/api/chat': () => new Response('{"error":"model \\"qwen3:8b\\" not found, try pulling it first"}', { status: 404 }) });
    await expect(createOllamaProvider({ baseUrl: '100.64.1.2', model: 'qwen3:8b' }).complete(ask)).rejects.toMatchObject({ status: 404, isModelMissing: true, isRetryable: true });
    serve({ '/api/version': version, '/api/chat': () => Response.json({ message: { content: '' } }) });
    await expect(createOllamaProvider({ baseUrl: '100.64.1.2', model: 'qwen3:8b' }).complete(ask)).rejects.toMatchObject({ status: 400, isBadToolCall: true });
  });

  it('pings only when the Mac has not answered for a minute', async () => {
    serve({ '/api/version': version, '/api/chat': () => Response.json({ message: { content: 'done' } }) });
    const p = createOllamaProvider({ baseUrl: '100.64.1.2', model: 'qwen3:8b' });
    await p.complete(ask);
    await p.complete(ask);
    expect(vi.mocked(fetch).mock.calls.map((c) => new URL(String(c[0])).pathname)).toEqual(['/api/version', '/api/chat', '/api/chat']);
  });
});

describe('Test the Mac', () => {
  it('says what is missing: the model not pulled', async () => {
    serve({ '/api/version': version, '/api/tags': () => Response.json({ models: [{ name: 'llama3.1:8b' }] }) });
    const r = await testOllama('100.64.1.2', 'qwen3:8b');
    expect(r).toEqual({ ok: false, lines: ['Reached the Mac at http://100.64.1.2:11434 (Ollama 0.12.6).', 'qwen3:8b is not pulled. On the Mac: ollama pull qwen3:8b'] });
  });

  it('ready when it reaches the Mac, the model is there and it calls a tool', async () => {
    serve({ '/api/version': version, '/api/tags': () => Response.json({ models: [{ name: 'qwen3:8b' }] }), '/api/chat': () => Response.json({ message: { content: '', tool_calls: [{ function: { name: 'log_done', arguments: { what: 'laundry' } } }] } }) });
    const r = await testOllama('100.64.1.2', 'qwen3:8b');
    expect(r.ok).toBe(true);
    expect(r.lines[2]).toMatch(/^It called a tool in \d+\.\d s\. The Mac is ready\.$/);
  });

  it('no answer: says what to check', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Network request failed'); }));
    const r = await testOllama('100.64.1.2', 'qwen3:8b');
    expect(r.ok).toBe(false);
    expect(r.lines[1]).toMatch(/Tailscale/);
  });
});
