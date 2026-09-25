import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { LifeOSContext } from '../registry/context';
import { bus } from '../events/bus';
import { routeMessage, usageSummary } from './routing';
import { Assistant } from './assistant';
import type { CompletionResult, LLMProvider } from './provider';

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('routing', () => {
  it('fast for one request; smart for plans, open questions and several requests', () => {
    expect(routeMessage('did laundry').tier).toBe('fast');
    expect(routeMessage('how much did I spend on food this month?').tier).toBe('fast');
    expect(routeMessage('Did the car service today, 6,400 at Hyundai').tier).toBe('fast');
    expect(routeMessage('plan Kyoto in late December with Priya').tier).toBe('smart');
    expect(routeMessage('why is my spending up?').tier).toBe('smart');
    expect(routeMessage('log the service and remind me about insurance next week').tier).toBe('smart');
  });

  it('a tool error hands the rest of the turn to the smart model; every call is metered', async () => {
    const calls: string[] = [];
    const fastScript: CompletionResult[] = [{ content: [{ type: 'tool_use', id: 'x', name: 'get_entity', input: { id: 'missing' } }, { type: 'tool_use', id: 'y', name: 'no_such_tool', input: {} }], stopReason: 'tool_use', usage: { input: 100, output: 20 } }];
    const smartScript: CompletionResult[] = [{ content: [{ type: 'text', text: 'Sorted.' }], stopReason: 'end_turn', usage: { input: 300, output: 40 } }];
    const fast: LLMProvider = { id: 'c', model: 'claude-haiku-4-5', complete: async () => { calls.push('fast'); return fastScript.shift()!; } };
    const smart: LLMProvider = { id: 'c', model: 'claude-sonnet-5', complete: async () => { calls.push('smart'); return smartScript.shift()!; } };
    const routes: string[] = [];
    await new Assistant(os, { provider: fast, smartProvider: smart, onRoute: (r) => routes.push(`${r.tier}:${r.reason}`) }).send('show me the thing');
    expect(calls).toEqual(['fast', 'smart']);
    expect(routes).toEqual(['fast:single request', 'smart:a tool call failed']);
    const u = usageSummary(os);
    expect(u).toMatchObject({ calls: 2, input: 400, output: 60 });
    expect(u.byModel.map((m) => m.model)).toEqual(['claude-sonnet-5', 'claude-haiku-4-5']);
    expect(u.daily).toHaveLength(14);
    expect(u.daily[13]!.tokens).toBe(460);
  });
});

describe('usage caps (SCOPE B5)', () => {
  it('meters per provider, stops a provider at its cap, and the chain moves on', async () => {
    const { meterProvider, providerTokensThisMonth, UsageCapError } = await import('./routing');
    const { createChainProvider } = await import('./providers');
    const mk = (id: string): LLMProvider => ({ id, model: `${id}-m`, complete: async () => ({ content: [{ type: 'text', text: id }], stopReason: 'end_turn', usage: { input: 10, output: 5 } }) });
    const caps: Record<string, number> = { groq: 20 };
    const groq = meterProvider(os, mk('groq'), { purpose: 'chat', cap: (p) => caps[p] });
    const gemini = meterProvider(os, mk('gemini'), { purpose: 'chat', cap: (p) => caps[p] });
    const chain = createChainProvider([groq, gemini]);
    const args = { system: '', messages: [{ role: 'user' as const, content: 'hi' }], tools: [] };
    const said = [];
    for (let i = 0; i < 3; i++) said.push(((await chain.complete(args)).content[0] as { text: string }).text);
    expect(said).toEqual(['groq', 'groq', 'gemini']);
    expect(providerTokensThisMonth(os, 'groq')).toBe(30);
    await expect(groq.complete(args)).rejects.toBeInstanceOf(UsageCapError);
    expect(usageSummary(os).byProvider.map((p) => [p.provider, p.calls])).toEqual([['groq', 2], ['gemini', 1]]);
  });
});
