/**
 * Pluggable LLM provider. The assistant only depends on this interface, so an
 * on-device model or another vendor can be added without touching tools or UI.
 */
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface CompletionResult {
  content: ContentBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | string;
  usage?: { input: number; output: number };
}

export interface LLMProvider {
  id: string;
  complete(args: { system: string; messages: ChatMessage[]; tools: ToolSpec[]; maxTokens?: number; signal?: AbortSignal }): Promise<CompletionResult>;
}

/* ------------------------------------------------------------------ */
/* Claude (Messages API over fetch — no SDK, works in React Native)     */
/* ------------------------------------------------------------------ */

export interface ClaudeProviderOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

export function createClaudeProvider(opts: ClaudeProviderOptions): LLMProvider {
  const model = opts.model ?? 'claude-sonnet-5';
  const baseUrl = (opts.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
  return {
    id: 'claude',
    async complete({ system, messages, tools, maxTokens = 2048, signal }) {
      const res = await fetch(`${baseUrl}/v1/messages`, {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': opts.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages, tools: tools.length ? tools : undefined }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Claude API ${res.status}: ${text.slice(0, 300)}`);
      }
      const json = (await res.json()) as { content: ContentBlock[]; stop_reason: string; usage?: { input_tokens: number; output_tokens: number } };
      return { content: json.content, stopReason: json.stop_reason, usage: json.usage ? { input: json.usage.input_tokens, output: json.usage.output_tokens } : undefined };
    },
  };
}

/** Deterministic provider for tests / offline demo: echoes and calls no tools. */
export function createEchoProvider(reply = (m: string) => `You said: ${m}`): LLMProvider {
  return {
    id: 'echo',
    async complete({ messages }) {
      const last = messages[messages.length - 1];
      const text = typeof last.content === 'string' ? last.content : last.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      return { content: [{ type: 'text', text: reply(text) }], stopReason: 'end_turn' };
    },
  };
}
