import { ProviderError } from './openaiCompat';
import type { BrainModel } from '../brain/model';

/**
 * Claude for the brain's passes (docs/MODEL.md layer 8): the Messages API over
 * fetch (no SDK, as `createClaudeProvider`: it runs in React Native), with
 * - the system prompt (house rules and Skills, which change rarely) cached
 *   with `cache_control`, so a pass pays full price only for the records;
 * - the answer constrained to a JSON schema (`output_config.format`);
 * - effort set explicitly (Opus 5.5 defaults to medium);
 * - server-side fallbacks, so a declined request is answered by another model;
 * - a photo or PDF only when you sent one on purpose (Snap the fridge, an uploaded
 *   statement), before the text; a PDF goes as a `document` block.
 */

export const BRAIN_MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
] as const;
export const DEFAULT_BRAIN_MODEL = 'claude-haiku-5-5';
/** Reading a photo or PDF you sent (a bill, the fridge) goes to Haiku, whatever the brain's model (17 Nov, Rutvij). */
export const PHOTO_MODEL = 'claude-haiku-5-5';
/** A statement or fund screen: Haiku too (19 Nov, Rutvij: everything on Haiku), with room for a long list. */
export const STATEMENT_MODEL = 'claude-haiku-5-5';

export interface ClaudeBrainOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  effort?: 'low' | 'medium' | 'high';
  fetchImpl?: typeof fetch;
}

interface ApiResponse {
  content: Array<{ type: string; text?: string; citations?: Array<{ type?: string; url?: string; title?: string }>; content?: unknown }>;
  stop_reason: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; server_tool_use?: { web_search_requests?: number } };
}

/** The pages a web answer used: its citations first, then the search results it saw. */
function sourcesOf(content: ApiResponse['content']): Array<{ url: string; title: string }> {
  const seen = new Map<string, string>();
  for (const b of content) for (const c of b.citations ?? []) if (c.url && !seen.has(c.url)) seen.set(c.url, c.title || c.url);
  for (const b of content) {
    if (b.type !== 'web_search_tool_result' || !Array.isArray(b.content)) continue;
    for (const r of b.content as Array<{ type?: string; url?: string; title?: string }>) if (r.type === 'web_search_result' && r.url && !seen.has(r.url) && seen.size < 8) seen.set(r.url, r.title || r.url);
  }
  return [...seen].map(([url, title]) => ({ url, title }));
}

export function createClaudeBrain(opts: ClaudeBrainOptions): BrainModel {
  const model = opts.model ?? DEFAULT_BRAIN_MODEL;
  const baseUrl = (opts.baseUrl ?? 'https://api.anthropic.com').replace(/\/$/, '');
  const doFetch = opts.fetchImpl ?? fetch;
  // Haiku has no server-side fallback; Sonnet 5.5 takes only the "default" form, as Opus 5.5 does.
  const fallbacks = !model.startsWith('claude-haiku');
  return {
    id: 'claude',
    model,
    async complete({ system, user, maxTokens, schema, image, effort }) {
      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: image ? [{ type: image.mediaType === 'application/pdf' ? 'document' : 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } }, { type: 'text', text: user }] : user }],
        output_config: { effort: effort ?? opts.effort ?? 'medium', ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
      };
      if (fallbacks) body.fallbacks = 'default';
      let res: Response;
      try {
        res = await doFetch(`${baseUrl}/v1/messages`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': opts.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
            ...(fallbacks ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}),
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        throw new ProviderError(`claude: network error (${(e as Error).message})`, 'claude', 0);
      }
      if (!res.ok) throw new ProviderError(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`, 'claude', res.status === 529 ? 429 : res.status);
      const json = (await res.json()) as ApiResponse;
      const u = json.usage ?? {};
      const usage = { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 };
      if (json.stop_reason === 'refusal') throw Object.assign(new ProviderError('claude: declined this pass', 'claude', 200), { usage });
      if (json.stop_reason === 'max_tokens') throw Object.assign(new ProviderError('claude: the answer was cut off', 'claude', 200), { usage });
      const text = json.content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
      return { text, usage };
    },
    // Web research (the trip copilot): Anthropic's web search and fetch run on Anthropic's side within the request;
    // a long search may pause (`pause_turn`), and the paused turn is sent back unchanged to continue it.
    async research({ system, user, maxTokens, maxSearches = 4 }) {
      const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [{ role: 'user', content: user }];
      const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
      let searches = 0;
      let json: ApiResponse | null = null;
      const content: ApiResponse['content'] = [];
      for (let round = 0; round < 5; round++) {
        const body: Record<string, unknown> = {
          model,
          max_tokens: maxTokens,
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages,
          // Haiku takes the basic web tools; the 2026-02-09 ones (dynamic filtering) are for Opus and Sonnet.
          tools: [
            { type: fallbacks ? 'web_search_20260209' : 'web_search_20250305', name: 'web_search', max_uses: maxSearches },
            { type: fallbacks ? 'web_fetch_20260209' : 'web_fetch_20250910', name: 'web_fetch', max_uses: 3, max_content_tokens: 6000 },
          ],
          output_config: { effort: opts.effort ?? 'medium' },
        };
        if (fallbacks) body.fallbacks = 'default';
        let res: Response;
        try {
          res = await doFetch(`${baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': opts.apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true',
              ...(fallbacks ? { 'anthropic-beta': 'server-side-fallback-2026-07-01' } : {}),
            },
            body: JSON.stringify(body),
          });
        } catch (e) {
          throw Object.assign(new ProviderError(`claude: network error (${(e as Error).message})`, 'claude', 0), { usage });
        }
        if (!res.ok) throw Object.assign(new ProviderError(`Claude API ${res.status}: ${(await res.text()).slice(0, 300)}`, 'claude', res.status === 529 ? 429 : res.status), { usage });
        json = (await res.json()) as ApiResponse;
        const u = json.usage ?? {};
        usage.input += u.input_tokens ?? 0;
        usage.output += u.output_tokens ?? 0;
        usage.cacheRead += u.cache_read_input_tokens ?? 0;
        usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
        searches += u.server_tool_use?.web_search_requests ?? 0;
        content.push(...json.content);
        if (json.stop_reason !== 'pause_turn') break;
        messages.push({ role: 'assistant', content: json.content });
      }
      if (json?.stop_reason === 'refusal') throw Object.assign(new ProviderError('claude: declined this pass', 'claude', 200), { usage });
      // The answer is the text after the last tool call (earlier text is Claude narrating its searches).
      const last = json?.content ?? [];
      const lastTool = last.map((b) => b.type).lastIndexOf('web_search_tool_result');
      const tail = last.slice(Math.max(lastTool, last.map((b) => b.type).lastIndexOf('web_fetch_tool_result')) + 1);
      const text = (tail.some((b) => b.type === 'text') ? tail : last).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('').trim();
      return { text, sources: sourcesOf(content), searches, usage };
    },
  };
}
