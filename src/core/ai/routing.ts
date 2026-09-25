import { newId } from '../domain/ids';
import type { LifeOSContext } from '../registry/context';
import type { LLMProvider } from './provider';

export type Tier = 'fast' | 'smart';

const ACTION = /\b(add|log|logged|did|done|paid|pay|split|remind|set|mark|create|book|record|renew|renewed|washed|serviced|bought|spent|remember|forget|move|change|cancel|pause|settle|plan|schedule|track)\b/g;
const PLAN = /\b(plan|planning|itinerary|organi[sz]e|budget for|figure out|help me (decide|think|choose)|compare|should i|what if|why|analy[sz]e|strategy|optimi[sz]e|work out)\b/i;

/**
 * Model routing (M3): the fast model (Haiku) by default; the smart one
 * (Sonnet) for a plan, a "why / should I" question, or a message carrying
 * two or more separate requests ("log the service and remind me about
 * insurance"). A tool error mid-turn also escalates (see Assistant).
 */
export function routeMessage(text: string): { tier: Tier; reason: string } {
  const t = text.toLowerCase();
  if (PLAN.test(t)) return { tier: 'smart', reason: 'plan or open question' };
  const clauses = t.split(/\b(?:and then|then|also|and|;|,)\b|[;,]/).filter((c) => c.trim().length > 2);
  const actionClauses = clauses.filter((c) => (c.match(ACTION) ?? []).length > 0).length;
  if (actionClauses >= 2) return { tier: 'smart', reason: `${actionClauses} requests in one message` };
  if (t.length > 400) return { tier: 'smart', reason: 'long message' };
  return { tier: 'fast', reason: 'single request' };
}

export type UsagePurpose = 'chat' | 'facts';

export function recordUsage(os: LifeOSContext, u: { model: string; provider?: string; purpose: UsagePurpose; input: number; output: number; conversationId?: string | null; at?: number }): void {
  os.db.run(`INSERT INTO ai_usage(id,at,model,purpose,input_tokens,output_tokens,conversation_id,provider) VALUES (?,?,?,?,?,?,?,?)`, [newId(), u.at ?? Date.now(), u.model, u.purpose, Math.round(u.input), Math.round(u.output), u.conversationId ?? null, u.provider ?? null]);
}

const monthStart = (now: number) => {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

/** Tokens (in + out) a provider has used this calendar month. */
export function providerTokensThisMonth(os: LifeOSContext, provider: string, now = Date.now()): number {
  return os.db.get<{ n: number }>(`SELECT COALESCE(SUM(input_tokens + output_tokens), 0) n FROM ai_usage WHERE provider = ? AND at >= ?`, [provider, monthStart(now)])?.n ?? 0;
}

export class UsageCapError extends Error {
  constructor(public readonly provider: string, public readonly cap: number) {
    super(`${provider}: monthly cap of ${cap.toLocaleString('en-IN')} tokens reached`);
    this.name = 'UsageCapError';
  }
}

/**
 * Meter a provider (SCOPE B5): every call is written to ai_usage with its
 * provider and model; once this month's tokens reach the provider's cap it
 * refuses (UsageCapError), and a chain simply moves on to the next provider.
 */
export function meterProvider(os: LifeOSContext, provider: LLMProvider, opts: { purpose: UsagePurpose; cap?: (providerId: string) => number | undefined; conversationId?: () => string | null }): LLMProvider {
  return {
    id: provider.id,
    get model() {
      return provider.model;
    },
    async complete(args) {
      const cap = opts.cap?.(provider.id);
      if (cap && providerTokensThisMonth(os, provider.id) >= cap) throw new UsageCapError(provider.id, cap);
      const result = await provider.complete(args);
      if (result.usage) recordUsage(os, { provider: provider.id, model: provider.model ?? provider.id, purpose: opts.purpose, ...result.usage, conversationId: opts.conversationId?.() ?? null });
      return result;
    },
  };
}

export interface UsageSummary {
  calls: number;
  input: number;
  output: number;
  byModel: Array<{ model: string; calls: number; input: number; output: number }>;
  byProvider: Array<{ provider: string; calls: number; input: number; output: number }>;
  /** Tokens per day, oldest first, `days` long. */
  daily: Array<{ day: string; tokens: number }>;
}

/** Usage since `since` (default: start of this month) for You › Agent. */
export function usageSummary(os: LifeOSContext, opts: { since?: number; days?: number; now?: number } = {}): UsageSummary {
  const now = opts.now ?? Date.now();
  const d = new Date(now);
  const since = opts.since ?? new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const rows = os.db.all<{ model: string; calls: number; input: number; output: number }>(`SELECT model, COUNT(*) calls, SUM(input_tokens) input, SUM(output_tokens) output FROM ai_usage WHERE at >= ? GROUP BY model ORDER BY SUM(input_tokens + output_tokens) DESC`, [since]);
  const days = opts.days ?? 14;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (days - 1)).getTime();
  const perDay = new Map(os.db.all<{ day: string; tokens: number }>(`SELECT strftime('%Y-%m-%d', at / 1000, 'unixepoch', 'localtime') day, SUM(input_tokens + output_tokens) tokens FROM ai_usage WHERE at >= ? GROUP BY day`, [start]).map((r) => [r.day, r.tokens]));
  const daily = Array.from({ length: days }, (_, i) => {
    const x = new Date(start);
    x.setDate(x.getDate() + i);
    const key = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    return { day: key, tokens: perDay.get(key) ?? 0 };
  });
  const prov = os.db.all<{ provider: string; calls: number; input: number; output: number }>(`SELECT COALESCE(provider, 'claude') provider, COUNT(*) calls, SUM(input_tokens) input, SUM(output_tokens) output FROM ai_usage WHERE at >= ? GROUP BY COALESCE(provider, 'claude') ORDER BY SUM(input_tokens + output_tokens) DESC`, [since]);
  return {
    byProvider: prov.map((r) => ({ provider: r.provider, calls: r.calls, input: r.input ?? 0, output: r.output ?? 0 })),
    calls: rows.reduce((a, r) => a + r.calls, 0),
    input: rows.reduce((a, r) => a + (r.input ?? 0), 0),
    output: rows.reduce((a, r) => a + (r.output ?? 0), 0),
    byModel: rows.map((r) => ({ model: r.model, calls: r.calls, input: r.input ?? 0, output: r.output ?? 0 })),
    daily,
  };
}
