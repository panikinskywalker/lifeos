import { createClaudeProvider, type LLMProvider } from './provider';
import { createOpenAICompatProvider, ProviderError } from './openaiCompat';

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
}

export const PROVIDER_PRESETS: Record<ProviderKind, ProviderPreset> = {
  groq: {
    kind: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    smallModel: 'llama-3.1-8b-instant',
    needsKey: true,
    keyUrl: 'https://console.groq.com/keys',
    note: 'Free tier, very fast. Open models. Check per-model token limits.',
  },
  gemini: {
    kind: 'gemini',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    smallModel: 'gemini-2.5-flash-lite',
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

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  });

export function createChainProvider(providers: LLMProvider[], events: ChainEvents = {}, maxWaitMs = 20_000): LLMProvider {
  if (!providers.length) throw new Error('chain: no providers configured');
  const cooldownUntil = new Map<string, number>();
  return {
    id: `chain(${providers.map((p) => p.id).join('>')})`,
    async complete(args) {
      let lastErr: Error | undefined;
      let retried = false;
      const now = Date.now();
      const order = [...providers].sort((a, b) => Number((cooldownUntil.get(a.id) ?? 0) > now) - Number((cooldownUntil.get(b.id) ?? 0) > now));
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
          const retryable = pe ? pe.isRetryable : true;
          const next = order[i + 1];
          // Last one standing and only briefly limited (free tiers count per minute): wait it out once.
          if (!next && pe?.isRateLimit && !retried && (pe.retryAfterMs ?? Infinity) <= maxWaitMs) {
            retried = true;
            await sleep(pe.retryAfterMs!, args.signal);
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
    );
  return { main: build('main'), small: build('small') };
}
