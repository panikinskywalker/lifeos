import { ProviderError } from './openaiCompat';
import type { BrainModel } from '../brain/model';

/**
 * Claude for the brain's passes (docs/MODEL.md layer 8): the Messages API over
 * fetch (no SDK, as `createClaudeProvider`: it runs in React Native), with
 * - the system prompt (house rules and Skills, which change rarely) cached
 *   with `cache_control`, so a pass pays full price only for the records;
 * - the answer constrained to a JSON schema (`output_config.format`);
 * - effort set explicitly (Opus 5.5 defaults to medium);
 * - server-side fallbacks, so a declined request is answered by another model.
 */

export const BRAIN_MODELS = [
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
] as const;
export const DEFAULT_BRAIN_MODEL = 'claude-opus-5-5';

export interface ClaudeBrainOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  effort?: 'low' | 'medium' | 'high';
  fetchImpl?: typeof fetch;
}

interface ApiResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
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
    async complete({ system, user, maxTokens, schema }) {
      const body: Record<string, unknown> = {
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
        output_config: { effort: opts.effort ?? 'medium', ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
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
  };
}
