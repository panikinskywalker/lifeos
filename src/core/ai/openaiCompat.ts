import type {
  ChatMessage,
  CompletionResult,
  ContentBlock,
  LLMProvider,
  ToolSpec,
} from "./provider";

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
    this.name = "ProviderError";
  }
  get isRateLimit() {
    return this.status === 429;
  }
  /** The configured model doesn't exist (renamed or retired). */
  get isModelMissing() {
    return (
      (this.status === 404 || this.status === 400) &&
      /model[_ ]?(not[_ ]?found|does not exist|decommissioned|is not (supported|available)|not supported)|unknown model|no such model|invalid model/i.test(
        this.message,
      )
    );
  }
  /** Errors another provider could plausibly succeed on. */
  get isRetryable() {
    return (
      this.status === 0 ||
      this.status === 401 ||
      this.status === 403 ||
      this.status === 408 ||
      this.status === 413 ||
      this.status === 429 ||
      this.status >= 500 ||
      this.isModelMissing
    );
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
  /** When the model is missing, ask the host for its models, switch to a good one and retry (default true). */
  autoPickModel?: boolean;
  /** Tells settings which model it switched to, so it sticks. */
  onModelChanged?: (model: string) => void;
}

/** GET {baseUrl}/models — the chat models a host currently offers. */
export async function listModels(
  baseUrl: string,
  apiKey?: string,
): Promise<string[]> {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
    headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
  });
  if (!res.ok)
    throw new ProviderError(
      `models ${res.status}: ${(await res.text()).slice(0, 200)}`,
      "models",
      res.status,
    );
  const json = (await res.json()) as {
    data?: Array<{ id: string; active?: boolean }>;
    models?: Array<{ name?: string; id?: string }>;
  };
  const ids = (json.data ?? [])
    .filter((m) => m.active !== false)
    .map((m) => m.id);
  const extra = (json.models ?? [])
    .map((m) => (m.id ?? m.name ?? "").replace(/^models\//, ""))
    .filter(Boolean);
  // Chat models only: drop speech, embeddings, moderation, image models.
  return [...new Set([...ids, ...extra])].filter(
    (id) =>
      !/whisper|tts|embed|guard|moderation|playai|vision-preview|imagen|veo|aqa|distil|orpheus|prompt-guard/i.test(
        id,
      ),
  );
}

/**
 * Best chat model for tool use from a host's list: large instruct/tool models
 * first, then flash/"versatile" ones, then anything; `small` prefers the
 * cheap fast tier (fact mining).
 */
export function pickModel(models: string[], small = false): string | null {
  if (!models.length) return null;
  const score = (id: string) => {
    const m = id.toLowerCase();
    let s = 0;
    if (
      /gpt-oss|llama-4|llama-3\.3|qwen3|kimi|deepseek|gemini-\d(\.\d)?-(flash|pro)|claude|mistral-(large|medium)/.test(
        m,
      )
    )
      s += small ? 10 : 50;
    if (/instruct|versatile|flash|tool/.test(m)) s += 15;
    if (/preview|exp|experimental|beta/.test(m)) s -= 10;
    const size = Number(/(\d+)b\b/.exec(m)?.[1] ?? 0);
    if (small) s += /lite|mini|instant|8b|4b|small|flash/.test(m) ? 30 : 0;
    else
      s +=
        Math.min(size, 120) / 4 + (/lite|mini|instant|small/.test(m) ? -20 : 0);
    return s;
  };
  return [...models].sort(
    (a, b) => score(b) - score(a) || a.localeCompare(b),
  )[0]!;
}

type OAIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

function toOpenAIMessages(
  system: string,
  messages: ChatMessage[],
): OAIMessage[] {
  const out: OAIMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const text = m.content
        .filter(
          (b): b is Extract<ContentBlock, { type: "text" }> =>
            b.type === "text",
        )
        .map((b) => b.text)
        .join("\n");
      const calls = m.content.filter(
        (b): b is Extract<ContentBlock, { type: "tool_use" }> =>
          b.type === "tool_use",
      );
      out.push({
        role: "assistant",
        content: text || null,
        tool_calls: calls.length
          ? calls.map((c) => ({
              id: c.id,
              type: "function",
              function: {
                name: c.name,
                arguments: JSON.stringify(c.input ?? {}),
              },
            }))
          : undefined,
      });
    } else {
      // user turn: tool results become `tool` messages, text stays a user message
      const results = m.content.filter(
        (b): b is Extract<ContentBlock, { type: "tool_result" }> =>
          b.type === "tool_result",
      );
      for (const r of results)
        out.push({
          role: "tool",
          tool_call_id: r.tool_use_id,
          content: r.content,
        });
      const text = m.content
        .filter(
          (b): b is Extract<ContentBlock, { type: "text" }> =>
            b.type === "text",
        )
        .map((b) => b.text)
        .join("\n");
      if (text) out.push({ role: "user", content: text });
    }
  }
  return out;
}

function toOpenAITools(tools: ToolSpec[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
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

export function createOpenAICompatProvider(
  opts: OpenAICompatOptions,
): LLMProvider {
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  let model = opts.model;
  const provider: LLMProvider = {
    id: opts.id,
    model,
    async complete(args): Promise<CompletionResult> {
      try {
        return await once(args);
      } catch (e) {
        if (
          !(e instanceof ProviderError) ||
          !e.isModelMissing ||
          opts.autoPickModel === false
        )
          throw e;
        // The model was renamed or retired: switch to what the host offers now, once.
        const small = /lite|mini|instant|8b|4b|small/i.test(model);
        const next = pickModel(
          (await listModels(baseUrl, opts.apiKey).catch(() => [])).filter(
            (m) => m !== model,
          ),
          small,
        );
        if (!next) throw e;
        model = next;
        provider.model = next;
        opts.onModelChanged?.(next);
        return once(args);
      }
    },
  };
  return provider;

  async function once({
    system,
    messages,
    tools,
    maxTokens = 2048,
    signal,
  }: Parameters<LLMProvider["complete"]>[0]): Promise<CompletionResult> {
    const body: Record<string, unknown> = {
      model,
      messages: toOpenAIMessages(system, messages),
      max_tokens: maxTokens,
      temperature: opts.temperature ?? 0.2,
    };
    if (tools.length) body.tools = toOpenAITools(tools);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
          ...(opts.extraHeaders ?? {}),
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      throw new ProviderError(
        `${opts.id}: network error (${(e as Error).message})`,
        opts.id,
        0,
      );
    }
    if (!res.ok) {
      const text = await res.text();
      const ra = res.headers.get("retry-after");
      const retryAfterMs = ra
        ? Number.isFinite(Number(ra))
          ? Number(ra) * 1000
          : Math.max(0, Date.parse(ra) - Date.now())
        : undefined;
      throw new ProviderError(
        `${opts.id} ${res.status}: ${text.slice(0, 300)}`,
        opts.id,
        res.status,
        retryAfterMs,
      );
    }
    const json = (await res.json()) as {
      choices: {
        message: {
          content: string | null;
          tool_calls?: {
            id: string;
            function: { name: string; arguments: string };
          }[];
        };
        finish_reason: string;
      }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };
    const choice = json.choices?.[0];
    const content: ContentBlock[] = [];
    if (choice?.message.content)
      content.push({ type: "text", text: choice.message.content });
    for (const c of choice?.message.tool_calls ?? [])
      content.push({
        type: "tool_use",
        id: c.id,
        name: c.function.name,
        input: parseArgs(c.function.arguments),
      });
    const hasCalls = (choice?.message.tool_calls?.length ?? 0) > 0;
    const stopReason = hasCalls
      ? "tool_use"
      : choice?.finish_reason === "length"
        ? "max_tokens"
        : "end_turn";
    return {
      content,
      stopReason,
      usage: json.usage
        ? {
            input: json.usage.prompt_tokens,
            output: json.usage.completion_tokens,
          }
        : undefined,
    };
  }
}
