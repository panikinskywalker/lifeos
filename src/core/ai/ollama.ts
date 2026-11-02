import type { ChatMessage, CompletionResult, ContentBlock, LLMProvider, ToolSpec } from './provider';
import { ProviderError } from './openaiCompat';

/**
 * The Mac model (R12, MODEL.md layer 7): Ollama's own /api/chat over
 * Tailscale. Not its /v1 copy, because only here can the context be set
 * (the filing prompt and tools do not fit Ollama's default). Every failure
 * is thrown as a retryable ProviderError, so the chain moves to the cloud.
 */

export const OLLAMA_PORT = 11434;
/** Context window asked of Ollama: the filing prompt plus every tool fits with room to work. */
export const OLLAMA_NUM_CTX = 16_384;
const PING_MS = 3_000;
const CALL_MS = 120_000;
/** A Mac that did not answer is skipped this long, so nothing waits on it. */
const DOWN_MS = 2 * 60_000;
/** A Mac that answered within this is not pinged again. */
const FRESH_MS = 60_000;

/** "100.64.1.2", "mac.tailnet.ts.net", "http://100.64.1.2:11434/v1" → "http://100.64.1.2:11434". */
export function normalizeOllamaUrl(input: string): string {
  let u = input.trim().replace(/\/+$/, '').replace(/\/(v1|api)$/, '');
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  if (!/^https?:\/\/(\[[^\]]+\]|[^/:]+):\d+/i.test(u)) u = u.replace(/^(https?:\/\/(\[[^\]]+\]|[^/:]+))/i, `$1:${OLLAMA_PORT}`);
  return u;
}

/** When each Mac last answered, and until when one that did not is skipped (shared by every provider built). */
const reach = new Map<string, { okAt: number; downUntil: number }>();
/** Forget what is known about a Mac (Test the Mac, tests). */
export function forgetOllama(baseUrl?: string): void {
  if (baseUrl) reach.delete(normalizeOllamaUrl(baseUrl));
  else reach.clear();
}

async function timed(url: string, init: RequestInit, ms: number, signal?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
    signal?.removeEventListener('abort', onAbort);
  }
}

type OllamaCall = { function: { name: string; arguments: unknown } };
type OllamaMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: OllamaCall[]; tool_name?: string };

function toOllamaMessages(system: string, messages: ChatMessage[]): OllamaMessage[] {
  const out: OllamaMessage[] = [{ role: 'system', content: system }];
  const names = new Map<string, string>();
  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    const text = m.content.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n');
    if (m.role === 'assistant') {
      const calls = m.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
      for (const c of calls) names.set(c.id, c.name);
      out.push({ role: 'assistant', content: text, ...(calls.length ? { tool_calls: calls.map((c) => ({ function: { name: c.name, arguments: c.input ?? {} } })) } : {}) });
    } else {
      for (const b of m.content) if (b.type === 'tool_result') out.push({ role: 'tool', content: b.content, tool_name: names.get(b.tool_use_id) });
      if (text) out.push({ role: 'user', content: text });
    }
  }
  return out;
}

/** Small models sometimes write the call as text: `<tool_call>{"name":…,"arguments":…}</tool_call>`. */
function callsInText(text: string): OllamaCall[] {
  const out: OllamaCall[] = [];
  for (const m of text.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g)) {
    try {
      const j = JSON.parse(m[1]!) as { name?: string; arguments?: unknown };
      if (j.name) out.push({ function: { name: j.name, arguments: j.arguments ?? {} } });
    } catch {
      /* not JSON: judged below as an unusable reply */
    }
  }
  return out;
}

const bad = (why: string) => new ProviderError(`ollama 400: invalid tool call (${why})`, 'ollama', 400);

export interface OllamaOptions {
  baseUrl: string;
  model: string;
  numCtx?: number;
  timeoutMs?: number;
}

export function createOllamaProvider(opts: OllamaOptions): LLMProvider {
  const base = normalizeOllamaUrl(opts.baseUrl);
  let think: boolean | undefined = false;

  async function reachable(signal?: AbortSignal) {
    const now = Date.now();
    const r = reach.get(base) ?? { okAt: 0, downUntil: 0 };
    if (r.downUntil > now) throw new ProviderError(`ollama: the Mac did not answer; skipped until ${new Date(r.downUntil).toLocaleTimeString()}`, 'ollama', 0);
    if (now - r.okAt < FRESH_MS) return;
    try {
      const res = await timed(`${base}/api/version`, {}, PING_MS, signal);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      reach.set(base, { okAt: Date.now(), downUntil: 0 });
    } catch (e) {
      if (signal?.aborted) throw e;
      reach.set(base, { okAt: 0, downUntil: Date.now() + DOWN_MS });
      throw new ProviderError(`ollama: network error, the Mac did not answer at ${base} (${(e as Error).message})`, 'ollama', 0);
    }
  }

  async function chat(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    try {
      return await timed(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, opts.timeoutMs ?? CALL_MS, signal);
    } catch (e) {
      if (signal?.aborted) throw e;
      if ((e as Error).name === 'AbortError') throw new ProviderError(`ollama 408: no answer within ${Math.round((opts.timeoutMs ?? CALL_MS) / 1000)} s`, 'ollama', 408);
      reach.set(base, { okAt: 0, downUntil: Date.now() + DOWN_MS });
      throw new ProviderError(`ollama: network error (${(e as Error).message})`, 'ollama', 0);
    }
  }

  return {
    id: 'ollama',
    model: opts.model,
    async complete({ system, messages, tools, maxTokens = 2048, signal }): Promise<CompletionResult> {
      if (!base) throw new ProviderError('ollama: no address for the Mac', 'ollama', 0);
      await reachable(signal);
      const body: Record<string, unknown> = {
        model: opts.model,
        messages: toOllamaMessages(system, messages),
        stream: false,
        keep_alive: '30m',
        options: { num_ctx: opts.numCtx ?? OLLAMA_NUM_CTX, temperature: 0.2, num_predict: maxTokens },
        ...(tools.length ? { tools: toOllamaTools(tools) } : {}),
      };
      if (think !== undefined) body.think = think;
      let res = await chat(body, signal);
      let error = res.ok ? '' : await res.text();
      if (res.status === 400 && think !== undefined && /think/i.test(error)) {
        // An older Ollama, or a model without a thinking switch: ask without it.
        think = undefined;
        delete body.think;
        res = await chat(body, signal);
        error = res.ok ? '' : await res.text();
      }
      if (!res.ok) {
        // 404 is a model that is not pulled, 500 usually out of memory, 400 a model that cannot call tools.
        // All go to the cloud: a 400 is passed on as 500 so the chain moves on (and a last provider fails, not waits).
        throw new ProviderError(`ollama ${res.status}: ${error.slice(0, 300)}`, 'ollama', res.status === 400 ? 500 : res.status);
      }
      reach.set(base, { okAt: Date.now(), downUntil: 0 });
      const json = (await res.json()) as { message?: { content?: string; tool_calls?: OllamaCall[] }; done_reason?: string; prompt_eval_count?: number; eval_count?: number };
      let text = (json.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
      let calls = json.message?.tool_calls ?? [];
      if (!calls.length && /<tool_call>/.test(text)) {
        calls = callsInText(text);
        text = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();
      }
      if (!text && !calls.length) throw bad('the reply was empty');
      const offered = new Set(tools.map((t) => t.name));
      const content: ContentBlock[] = text ? [{ type: 'text', text }] : [];
      calls.forEach((c, i) => {
        if (!offered.has(c.function.name)) throw bad(`${c.function.name} was not offered`);
        let input = c.function.arguments;
        if (typeof input === 'string') {
          try {
            input = JSON.parse(input);
          } catch {
            throw bad(`arguments for ${c.function.name} are not JSON`);
          }
        }
        if (!input || typeof input !== 'object' || Array.isArray(input)) throw bad(`arguments for ${c.function.name} are not an object`);
        content.push({ type: 'tool_use', id: `ollama-${Date.now().toString(36)}-${i}`, name: c.function.name, input });
      });
      return {
        content,
        stopReason: calls.length ? 'tool_use' : json.done_reason === 'length' ? 'max_tokens' : 'end_turn',
        usage: { input: json.prompt_eval_count ?? 0, output: json.eval_count ?? 0 },
      };
    },
  };
}

function toOllamaTools(tools: ToolSpec[]) {
  return tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

/* ------------------------------------------------------------------ */
/* Test the Mac (You › Agent)                                          */
/* ------------------------------------------------------------------ */

export interface MacCheck {
  ok: boolean;
  /** One line per step, in order; the last says what to do when it failed. */
  lines: string[];
}

/** Can the phone reach the Mac, is the model pulled, and does it call a tool? */
export async function testOllama(baseUrl: string, model: string): Promise<MacCheck> {
  const base = normalizeOllamaUrl(baseUrl);
  const lines: string[] = [];
  if (!base) return { ok: false, lines: ['No address yet: type the Mac’s Tailscale IP or name.'] };
  forgetOllama(base);
  try {
    const res = await timed(`${base}/api/version`, {}, PING_MS * 2);
    const v = (await res.json()) as { version?: string };
    lines.push(`Reached the Mac at ${base}${v.version ? ` (Ollama ${v.version})` : ''}.`);
  } catch (e) {
    return { ok: false, lines: [`Could not reach ${base} (${(e as Error).message}).`, 'Is the Mac awake, Ollama running with OLLAMA_HOST=0.0.0.0, and Tailscale on here and there?'] };
  }
  try {
    const res = await timed(`${base}/api/tags`, {}, PING_MS * 2);
    const names = ((await res.json()) as { models?: Array<{ name: string }> }).models?.map((m) => m.name) ?? [];
    if (!names.some((n) => n === model || n === `${model}:latest`)) return { ok: false, lines: [...lines, `${model} is not pulled. On the Mac: ollama pull ${model}`] };
    lines.push(`${model} is pulled.`);
  } catch (e) {
    return { ok: false, lines: [...lines, `Could not list the models (${(e as Error).message}).`] };
  }
  const t0 = Date.now();
  try {
    const p = createOllamaProvider({ baseUrl: base, model });
    const tool: ToolSpec = { name: 'log_done', description: 'A chore the user did.', input_schema: { type: 'object', properties: { what: { type: 'string' } }, required: ['what'] } };
    const r = await p.complete({ system: 'File what the user says by calling a tool. Never reply in words.', messages: [{ role: 'user', content: 'did laundry' }], tools: [tool], maxTokens: 200 });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (!r.content.some((b) => b.type === 'tool_use')) return { ok: false, lines: [...lines, `It answered in ${secs} s but called no tool: try another model.`] };
    lines.push(`It called a tool in ${secs} s. The Mac is ready.`);
    return { ok: true, lines };
  } catch (e) {
    return { ok: false, lines: [...lines, `The test call failed: ${(e as Error).message.slice(0, 160)}`] };
  }
}
