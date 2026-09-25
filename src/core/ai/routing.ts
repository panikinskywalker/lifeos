import { newId } from '../domain/ids';
import type { LifeOSContext } from '../registry/context';

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

export function recordUsage(os: LifeOSContext, u: { model: string; purpose: UsagePurpose; input: number; output: number; conversationId?: string | null; at?: number }): void {
  os.db.run(`INSERT INTO ai_usage(id,at,model,purpose,input_tokens,output_tokens,conversation_id) VALUES (?,?,?,?,?,?,?)`, [newId(), u.at ?? Date.now(), u.model, u.purpose, Math.round(u.input), Math.round(u.output), u.conversationId ?? null]);
}

export interface UsageSummary {
  calls: number;
  input: number;
  output: number;
  byModel: Array<{ model: string; calls: number; input: number; output: number }>;
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
  return {
    calls: rows.reduce((a, r) => a + r.calls, 0),
    input: rows.reduce((a, r) => a + (r.input ?? 0), 0),
    output: rows.reduce((a, r) => a + (r.output ?? 0), 0),
    byModel: rows.map((r) => ({ model: r.model, calls: r.calls, input: r.input ?? 0, output: r.output ?? 0 })),
    daily,
  };
}
