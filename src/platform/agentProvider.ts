import type { LLMProvider } from '@core/ai/provider';
import { buildAgentProviders, createProvider, PROVIDER_PRESETS, type ChainEvents, type ProviderConfig } from '@core/ai/providers';
import { meterProvider } from '@core/ai/routing';
import type { LifeOSContext } from '@core/registry/context';
import { useSettings } from '@ui/hooks/useSettings';
import { getProviderKey } from './boot';

export interface AgentProviders {
  /** Conversation: the chain in your order (Groq → Gemini → Claude by default). */
  main: LLMProvider;
  /** Fact mining and other side jobs: each provider's small model. */
  small: LLMProvider;
  /** Harder asks (plans, several requests, a failed step): Claude's smart model when you have a Claude key and routing is on. */
  smart?: LLMProvider;
  /** Providers in use, in order (no keys). */
  active: ProviderConfig[];
}

/**
 * The agent's provider stack from settings + SecureStore keys (SCOPE v2 B5):
 * every provider metered into ai_usage and stopped at its monthly cap, the
 * chain falling through on rate limits and outages. Null when no provider
 * has a usable key — Talk then runs on the on-device parser alone.
 */
export async function buildAgentFromSettings(os: LifeOSContext, events?: ChainEvents): Promise<AgentProviders | null> {
  const s = useSettings.getState();
  const withKeys: ProviderConfig[] = [];
  for (const c of s.aiChain) {
    if (c.enabled === false) continue;
    const preset = PROVIDER_PRESETS[c.kind];
    const apiKey = preset.needsKey ? await getProviderKey(c.kind) : undefined;
    if (preset.needsKey && !apiKey) continue;
    if (!preset.needsKey && !(c.baseUrl || preset.baseUrl)) continue;
    withKeys.push({ ...c, apiKey: apiKey ?? undefined });
  }
  if (!withKeys.length) return null;
  const cap = (id: string) => useSettings.getState().aiMonthlyCaps[id] || undefined;
  const { main, small } = buildAgentProviders({
    chain: withKeys,
    events,
    wrap: (p, role) => meterProvider(os, p, { purpose: role === 'small' ? 'facts' : 'chat', cap }),
  });
  let smart: LLMProvider | undefined;
  const claudeKey = s.aiRouting ? await getProviderKey('claude') : null;
  if (claudeKey) smart = meterProvider(os, createProvider({ kind: 'claude', apiKey: claudeKey, model: s.aiModel }), { purpose: 'chat', cap });
  return { main, small, smart, active: withKeys.map((c) => ({ ...c, apiKey: undefined })) };
}
