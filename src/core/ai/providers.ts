import { createClaudeProvider, type LLMProvider } from './provider';
import { createOpenAICompatProvider, ProviderError } from './openaiCompat';
import { classifyFailure, type LimitStore } from './limits';

/* ------------------------------------------------------------------ */
/* Presets — where each host lives and a sensible default model.        */
/* Model names drift; every one of these is editable in settings.      */
/* ------------------------------------------------------------------ */

export type ProviderKind = 'groq' | 'gemini' | 'openrouter' | 'ollama' | 'claude' | 'custom';

export interface ProviderPreset {
  kind: ProviderKind;
  label: string;
  baseUrl: string;
  defaultModel: string;
  /** cheaper/faster model for side jobs like fact mining */
  smallModel: string;
  needsKey: boolean;
  keyUrl?: string;
  note: string;
  /** Roughly how many tokens a day the free tier allows (for the budget bar), when known. */
  freeDailyTokens?: number;
}

export const PROVIDER_PRESETS: Record<ProviderKind, ProviderPreset> = {
  groq: {
    kind: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'openai/gpt-oss-120b',
    smallModel: 'openai/gpt-oss-20b',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    note: 'Free tier, very fast. Open models. About 200k tokens a day and 8k a minute per model.',
    freeDailyTokens: 200_000,
  },
  gemini: {
    kind: 'gemini',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-flash-latest',
    smallModel: 'gemini-flash-lite-latest',
    needsKey: true,
    keyUrl: 'https://aistudio.google.com/apikey',
    note: 'Free tier. Google may use free-tier prompts to improve models.',
  },
  openrouter: {
    kind: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    smallModel: 'meta-llama/llama-3.3-70b-instruct:free',
    needsKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    note: 'Many models behind one key; :free models are rate-limited.',
  },
  ollama: {
    kind: 'ollama',
    label: 'Ollama (your Mac)',
    baseUrl: 'http://100.64.0.1:11434/v1', // replace with the Mac's Tailscale IP
    defaultModel: 'qwen3:8b',
    smallModel: 'qwen3:4b',
    needsKey: false,
    note: 'Free and private; only works while the Mac is on and reachable.',
  },
  claude: {
    kind: 'claude',
    label: 'Claude',
    baseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-haiku-4-5',
    smallModel: 'claude-haiku-4-5',
    needsKey: true,
    keyUrl: 'https://console.anthropic.com/settings/keys',
    note: 'Paid (prepaid credits). Best tool-calling; Haiku is cheap.',
  },
  custom: {
    kind: 'custom',
    label: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    defaultModel: '',
    smallModel: '',
    needsKey: false,
    note: 'Any host that speaks /v1/chat/completions.',
  },
};

/* ------------------------------------------------------------------ */
/* Config → provider                                                    */
/* ------------------------------------------------------------------ */

export interface ProviderConfig {
  kind: ProviderKind;
  apiKey?: string;
  model?: string; // overrides preset.defaultModel
  baseUrl?: string; // overrides preset.baseUrl
  enabled?: boolean; // default true
}

export function createProvider(cfg: ProviderConfig, role: 'main' | 'small' = 'main', onModelChanged?: (model: string) => void): LLMProvider {
  const preset = PROVIDER_PRESETS[cfg.kind];
  const model = cfg.model || (role === 'small' ? preset.smallModel : preset.defaultModel);
  const baseUrl = cfg.baseUrl || preset.baseUrl;
  if (cfg.kind === 'claude') {
    if (!cfg.apiKey) throw new ProviderError('claude: no API key', 'claude', 401);
    return createClaudeProvider({ apiKey: cfg.apiKey, model, baseUrl });
  }
  if (preset.needsKey && !cfg.apiKey) throw new ProviderError(`${cfg.kind}: no API key`, cfg.kind, 401);
  return createOpenAICompatProvider({ id: cfg.kind, baseUrl, apiKey: cfg.apiKey, model, onModelChanged });
}

/* ------------------------------------------------------------------ */
/* Chain — try providers in order, fall through on retryable failures   */
/* ------------------------------------------------------------------ */

export interface ChainEvents {
  onFallback?: (from: string, to: string, err: Error) => void;
  /** Called when a provider is rate-limited; lets the UI show "Groq is cooling down until 14:05". */
  onCooldown?: (provider: string, untilMs: number) => void;
  /** A provider moved to another model because its own is gone. */
  onModelChanged?: (provider: string, model: string) => void;
}

/** A rate limit that lifts within this is waited out rather than switching provider. */
const SHORT_WAIT_MS = 3000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  });

export function createChainProvider(providers: LLMProvider[], events: ChainEvents = {}, maxWaitMs = 25_000, limits?: LimitStore): LLMProvider {
  if (!providers.length) throw new Error('chain: no providers configured');
  const cooldownUntil = new Map<string, number>();
  const restUntil = (id: string) => Math.max(cooldownUntil.get(id) ?? 0, limits?.get(id)?.until ?? 0);
  return {
    id: `chain(${providers.map((p) => p.id).join('>')})`,
    async complete(args) {
      let lastErr: Error | undefined;
      let waits = 0;
      const now = Date.now();
      // A provider resting for a while (daily quota, monthly cap, remembered across restarts) isn't called at all.
      const awake = providers.filter((p) => !limits?.get(p.id));
      if (!awake.length) {
        const until = Math.min(...providers.map((p) => limits!.get(p.id)!.until));
        const why = providers.map((p) => limits!.get(p.id)!.reason).join('; ');
        throw new ProviderError(`chain: every provider is resting (${why})`, 'chain', 429, Math.max(0, until - now));
      }
      const order = [...awake].sort((a, b) => Number(restUntil(a.id) > now) - Number(restUntil(b.id) > now));
      for (let i = 0; i < order.length; i++) {
        const p = order[i];
        try {
          return await p.complete(args);
        } catch (e) {
          const err = e as Error;
          if (err.name === 'AbortError') throw err;
          lastErr = err;
          const pe = err instanceof ProviderError ? err : undefined;
          if (pe?.isRateLimit) {
            const until = Date.now() + (pe.retryAfterMs ?? 60_000);
            cooldownUntil.set(p.id, until);
            events.onCooldown?.(p.id, until);
          }
          // Out for longer than a moment: remember it, so nothing calls it again until then.
          const rest = restFor(p.id, err);
          if (rest && limits) limits.set(p.id, rest);
          const retryable = pe ? pe.isRetryable : true;
          const next = order[i + 1];
          // Free tiers count tokens per minute: a limit that lifts in a moment is waited out on the same
          // provider; a longer one moves to the next provider, or is waited out when there is none.
          const wait = pe?.isRateLimit ? (pe.retryAfterMs ?? Infinity) : Infinity;
          if (pe?.isRateLimit && waits < 3 && (wait <= SHORT_WAIT_MS || (!next && wait <= maxWaitMs))) {
            waits++;
            await sleep(Math.max(wait, 250) + 150, args.signal);
            i--;
            continue;
          }
          if (!retryable || !next) throw err;
          events.onFallback?.(p.id, next.id, err);
        }
      }
      throw lastErr ?? new Error('chain: exhausted');
    },
  };
}

/** How long a provider should rest after this error (only for rests worth remembering: > a minute). */
function restFor(provider: string, err: Error): { until: number; reason: string } | null {
  const f = classifyFailure(err);
  if (f.kind !== 'wait') return null;
  if (f.until - Date.now() <= 60_000) return null;
  return { until: f.until, reason: f.reason.replace(/^The model/, provider.charAt(0).toUpperCase() + provider.slice(1)) };
}

/* ------------------------------------------------------------------ */
/* Convenience: build the whole stack from settings                     */
/* ------------------------------------------------------------------ */

export interface AgentProviderSettings {
  /** Ordered chain, first is preferred. */
  chain: ProviderConfig[];
  /** A provider switched model because its configured one is gone (so settings can keep it). */
  onModelChanged?: (kind: ProviderKind, role: 'main' | 'small', model: string) => void;
  /** Wrap each provider (usage meter + cap, see routing.ts meterProvider). */
  wrap?: (p: LLMProvider, role: 'main' | 'small') => LLMProvider;
  events?: ChainEvents;
  /** Remembered provider rests (daily quotas, caps); see limits.ts. */
  limits?: LimitStore;
}

/** main = conversation, small = fact mining and other side jobs. */
export function buildAgentProviders(s: AgentProviderSettings): { main: LLMProvider; small: LLMProvider } {
  const active = s.chain.filter((c) => c.enabled !== false);
  const build = (role: 'main' | 'small') =>
    createChainProvider(
      active.map((c) => {
        const p = createProvider(c, role, s.onModelChanged ? (m) => s.onModelChanged!(c.kind, role, m) : undefined);
        return s.wrap ? s.wrap(p, role) : p;
      }),
      s.events,
      25_000,
      s.limits,
    );
  return { main: build('main'), small: build('small') };
}
