import type { ChatMessage, CompletionResult, ContentBlock, LLMProvider, ToolSpec } from './provider';

/**
 * OpenAI-compatible chat-completions provider. One implementation covers
 * Groq, Gemini (its /openai endpoint), OpenRouter, Ollama, LM Studio, etc.
 * The assistant speaks the Claude-shaped message format in provider.ts; this
 * file translates both ways.
 */

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: string,
    public readonly status: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
  get isRateLimit() {
    return this.status === 429;
  }
  /** Errors another provider could plausibly succeed on. */
  get isRetryable() {
    return this.status === 0 || this.status === 401 || this.status === 403 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export interface OpenAICompatOptions {
  id: string; // 'groq' | 'gemini' | 'openrouter' | 'ollama' | ...
  baseUrl: string; // e.g. https://api.groq.com/openai/v1
  apiKey?: string; // Ollama needs none
  model: string;
  extraHeaders?: Record<string, string>;
  /** Some hosts reject `tool_choice`/`parallel_tool_calls`; keep the body minimal by default. */
  temperature?: number;
}

type OAIMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

function toOpenAIMessages(system: string, messages: ChatMessage[]): OAIMessage[] {
  const out: OAIMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (typeof m.content === 'string') {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === 'assistant') {
      const text = m.content.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n');
      const calls = m.content.filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
      out.push({
        role: 'assistant',
        content: text || null,
        tool_calls: calls.length ? calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) } })) : undefined,
      });
    } else {
      // user turn: tool results become `tool` messages, text stays a user message
      const results = m.content.filter((b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result');
      for (const r of results) out.push({ role: 'tool', tool_call_id: r.tool_use_id, content: r.content });
      const text = m.content.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text').map((b) => b.text).join('\n');
      if (text) out.push({ role: 'user', content: text });
    }
  }
  return out;
}

function toOpenAITools(tools: ToolSpec[]) {
  return tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

function parseArgs(raw: string): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    // Some open models emit trailing commentary after the JSON; salvage the first object.
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    return { _raw: raw };
  }
}

export function createOpenAICompatProvider(opts: OpenAICompatOptions): LLMProvider {
  const baseUrl = opts.baseUrl.replace(/\/$/, '');
  return {
    id: opts.id,
    model: opts.model,
    async complete({ system, messages, tools, maxTokens = 2048, signal }): Promise<CompletionResult> {
      const body: Record<string, unknown> = {
        model: opts.model,
        messages: toOpenAIMessages(system, messages),
        max_tokens: maxTokens,
        temperature: opts.temperature ?? 0.2,
      };
      if (tools.length) body.tools = toOpenAITools(tools);

      let res: Response;
      try {
        res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          signal,
          headers: { 'content-type': 'application/json', ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}), ...(opts.extraHeaders ?? {}) },
          body: JSON.stringify(body),
        });
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        throw new ProviderError(`${opts.id}: network error (${(e as Error).message})`, opts.id, 0);
      }
      if (!res.ok) {
        const text = await res.text();
        const ra = res.headers.get('retry-after');
        const retryAfterMs = ra ? (Number.isFinite(Number(ra)) ? Number(ra) * 1000 : Math.max(0, Date.parse(ra) - Date.now())) : undefined;
        throw new ProviderError(`${opts.id} ${res.status}: ${text.slice(0, 300)}`, opts.id, res.status, retryAfterMs);
      }
      const json = (await res.json()) as {
        choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }; finish_reason: string }[];
        usage?: { prompt_tokens: number; completion_tokens: number };
      };
      const choice = json.choices?.[0];
      const content: ContentBlock[] = [];
      if (choice?.message.content) content.push({ type: 'text', text: choice.message.content });
      for (const c of choice?.message.tool_calls ?? []) content.push({ type: 'tool_use', id: c.id, name: c.function.name, input: parseArgs(c.function.arguments) });
      const hasCalls = (choice?.message.tool_calls?.length ?? 0) > 0;
      const stopReason = hasCalls ? 'tool_use' : choice?.finish_reason === 'length' ? 'max_tokens' : 'end_turn';
      return { content, stopReason, usage: json.usage ? { input: json.usage.prompt_tokens, output: json.usage.completion_tokens } : undefined };
    },
  };
}
