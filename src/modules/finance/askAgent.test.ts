import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { crmModule } from '@modules/crm';
import { financeModule } from '@modules/finance';
import { MoneyAgentChat, agentDefinition, ASK_AGENT_MODEL } from './askAgent';
import { moneyViews } from './ask';
import type { TransactionData } from './types';

/** Ask Money is an agent (docs/MODEL.md): tools answered on the phone, changes with Undo, made once. */

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [crmModule, financeModule], registry: new Registry() });
});
afterEach(() => os.db.close());

const spend = (title: string, amount: number, category = 'other') => os.records.create<TransactionData>({ object: 'transaction', title, data: { amount, kind: 'expense', category, date: '2026-11-02', merchant: title } as TransactionData }, 'assistant');

/** A pretend Managed Agents API: records what the app sends and plays a scripted agent turn. */
function fakeApi(script: (sent: Array<{ type: string; [k: string]: unknown }>) => Array<Record<string, unknown>>) {
  const calls: Array<{ method: string; path: string; body: unknown }> = [];
  const sent: Array<{ type: string; [k: string]: unknown }> = [];
  let events: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (url: string, init: { method: string; body?: string }) => {
    const path = url.replace('https://api.anthropic.com', '');
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path, body });
    const ok = (json: unknown) => ({ ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify(json) });
    if (path === '/v1/environments') return ok({ id: 'env_1' });
    if (path === '/v1/agents') return ok({ id: 'agent_1', version: 1 });
    if (path === '/v1/sessions') return ok({ id: 'sesn_1' });
    if (path === '/v1/sessions/sesn_1/events' && init.method === 'POST') {
      sent.push(...(body.events as typeof sent));
      events = script(sent);
      return ok({ data: [] });
    }
    if (path.startsWith('/v1/sessions/sesn_1/events')) return ok({ data: events });
    return { ok: false, status: 404, statusText: 'Not found', text: async () => '{"error":{"message":"nope"}}' };
  }) as unknown as typeof fetch;
  return { calls, sent, fetchImpl };
}

const hooks = () => {
  const out = { texts: [] as string[], steps: [] as string[], shows: [] as string[], changes: [] as Array<{ label: string; undo?: () => void }>, asked: [] as string[] };
  return { out, hooks: { text: (_: string, t: string) => out.texts.push(t), step: (s: string) => out.steps.push(s), show: (s: { title: string }) => out.shows.push(s.title), change: (c: { label: string; undo?: () => void }) => out.changes.push(c), confirm: async (l: string) => (out.asked.push(l), true) } };
};

describe('Ask Money as an agent', () => {
  it('is a Sonnet 5.5 agent with web search; every money tool is answered on the phone', () => {
    const def = agentDefinition();
    expect(def.model.id).toBe(ASK_AGENT_MODEL);
    expect(ASK_AGENT_MODEL).toBe('claude-sonnet-5-5');
    const toolset = def.tools.find((t) => t.type === 'agent_toolset_20260401') as { default_config: { enabled: boolean }; configs: Array<{ name: string; enabled: boolean }> };
    expect(toolset.default_config.enabled).toBe(false);
    expect(toolset.configs.filter((c) => c.enabled).map((c) => c.name).sort()).toEqual(['web_fetch', 'web_search']);
    const custom = def.tools.filter((t): t is (typeof def.tools)[number] & { name: string } => t.type === 'custom');
    expect(custom.map((t) => t.name)).toEqual(expect.arrayContaining(['money_overview', 'cards_and_spend', 'money_query', 'money_show', 'recategorise', 'keep_view', 'set_budget']));
  });

  it('answers a tool call on the phone, moves the payments with Undo, shows the answer, and makes the agent only once', async () => {
    spend('BLINKIT', 487);
    spend('BLINKIT', 312);
    const api = fakeApi((sent) => {
      const result = sent.find((e) => e.type === 'user.custom_tool_result');
      if (!result) return [
        { id: 'e1', type: 'session.status_running' },
        { id: 'e2', type: 'agent.custom_tool_use', name: 'recategorise', input: { payee: 'BLINKIT', category: 'groceries' } },
        { id: 'e3', type: 'session.status_idle', stop_reason: { type: 'requires_action', event_ids: ['e2'] } },
      ];
      return [
        { id: 'e1', type: 'session.status_running' },
        { id: 'e2', type: 'agent.custom_tool_use', name: 'recategorise', input: { payee: 'BLINKIT', category: 'groceries' } },
        { id: 'e3', type: 'session.status_idle', stop_reason: { type: 'requires_action', event_ids: ['e2'] } },
        { id: 'e4', type: 'agent.custom_tool_use', name: 'money_show', input: { sentence: 'Groceries now has Blinkit.', block: 'number', title: 'Groceries', query: { measure: 'spent', period: 'all', only: ['groceries'] } } },
        { id: 'e5', type: 'agent.message', content: [{ type: 'text', text: 'Done: Blinkit is groceries now.' }] },
        { id: 'e6', type: 'session.status_idle', stop_reason: { type: 'end_turn' } },
      ];
    });
    const chat = new MoneyAgentChat(os, { apiKey: 'k', fetchImpl: api.fetchImpl }, { wait: async () => undefined });
    const h = hooks();
    expect(await chat.ask('put blinkit in groceries', h.hooks)).toBe('done');
    const cats = os.records.query<TransactionData>('transaction').map((t) => t.data.category);
    expect(cats).toEqual(['groceries', 'groceries']);
    expect(h.out.changes[0]!.label).toContain('Moved 2 payments to Groceries');
    expect(h.out.shows).toEqual(['Groceries']);
    expect(h.out.texts).toEqual(['Done: Blinkit is groceries now.']);
    expect(api.sent.filter((e) => e.type === 'user.custom_tool_result')).toHaveLength(2);
    h.out.changes[0]!.undo!();
    expect(os.records.query<TransactionData>('transaction').map((t) => t.data.category)).toEqual(['other', 'other']);
    // A second conversation reuses the stored agent and environment.
    await new MoneyAgentChat(os, { apiKey: 'k', fetchImpl: api.fetchImpl }, { wait: async () => undefined }).ask('again', hooks().hooks);
    expect(api.calls.filter((c) => c.path === '/v1/agents' || c.path === '/v1/environments')).toHaveLength(2);
    // Each conversation has a spend cap.
    expect(api.calls.find((c) => c.path === '/v1/sessions')!.body).toMatchObject({ budget: { type: 'limit', max_list_cost: { currency: 'USD' } } });
  });

  it('asks before setting a budget, and keeps a view on Money home with Undo', async () => {
    const api = fakeApi((sent) => {
      const done = sent.filter((e) => e.type === 'user.custom_tool_result').length;
      const base = [
        { id: 'a1', type: 'session.status_running' },
        { id: 'a2', type: 'agent.custom_tool_use', name: 'set_budget', input: { monthly: 40000 } },
        { id: 'a3', type: 'agent.custom_tool_use', name: 'keep_view', input: { title: 'Swiggy this month', block: 'bars', query: { measure: 'spent', period: 'month', payee: 'Swiggy', by: 'week' } } },
      ];
      return done < 2 ? base : [...base, { id: 'a4', type: 'session.status_idle', stop_reason: { type: 'end_turn' } }];
    });
    const h = hooks();
    await new MoneyAgentChat(os, { apiKey: 'k', fetchImpl: api.fetchImpl }, { wait: async () => undefined }).ask('budget 40k and a swiggy card', h.hooks);
    expect(h.out.asked[0]).toContain('monthly line');
    expect(os.settings.get('finance.monthlyLine', null)).toBe(40000);
    expect(moneyViews(os).map((v) => v.title)).toEqual(['Swiggy this month']);
    h.out.changes.find((c) => c.label.includes('Money home'))!.undo!();
    expect(moneyViews(os)).toHaveLength(0);
  });

  it('never names a person to the model: money tools send placeholders', async () => {
    os.records.create({ object: 'person', title: 'Priya Sharma', data: {} });
    spend('Priya Sharma', 900, 'food');
    const api = fakeApi((sent) => {
      const done = sent.some((e) => e.type === 'user.custom_tool_result');
      const base = [{ id: 'p1', type: 'session.status_running' }, { id: 'p2', type: 'agent.custom_tool_use', name: 'money_query', input: { measure: 'spent', period: 'all', by: 'payee' } }];
      return done ? [...base, { id: 'p3', type: 'session.status_idle', stop_reason: { type: 'end_turn' } }] : base;
    });
    await new MoneyAgentChat(os, { apiKey: 'k', fetchImpl: api.fetchImpl }, { wait: async () => undefined }).ask('who did I pay', hooks().hooks);
    const result = JSON.stringify(api.sent.find((e) => e.type === 'user.custom_tool_result'));
    expect(result).not.toContain('Priya');
    expect(result).toContain('Person');
  });

  it('cards and spend: what goes through each card by category and shop, rounded, never a person', async () => {
    os.records.create({ object: 'person', title: 'Priya Sharma', data: {} });
    const card = os.records.create({ object: 'account', title: 'ICICI Bank card ••3007', data: { kind: 'credit', institution: 'ICICI Bank', last4: '3007', currency: 'INR', openingBalance: 0, creditLimit: 130000 } });
    const day = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 10);
    for (const [title, amount, category] of [['Swiggy', 487, 'food'], ['Swiggy', 512, 'food'], ['Priya Sharma', 900, 'food'], ['Amazon', 2399, 'shopping']] as const) os.records.create<TransactionData>({ object: 'transaction', title, data: { amount, kind: 'expense', category, date: day, merchant: title, accountId: card.id } as TransactionData }, 'assistant');
    const { runAgentTool } = await import('./askAgent');
    const out = JSON.parse(await runAgentTool(os, 'cards_and_spend', {}, { confirm: async () => true, change: () => {} }));
    const c = out.accounts.find((a: { name: string }) => a.name === 'ICICI Bank card');
    expect(c).toMatchObject({ bank: 'ICICI Bank', kind: 'credit', limit: 130000 });
    expect(c.byCategory[0]).toEqual({ name: 'shopping', perMonth: 800 });
    expect(JSON.stringify(out)).not.toContain('Priya');
    expect(JSON.stringify(out)).not.toContain('3007');
  });

  it('name_card renames the card a ref points at, and Undo puts the old name back', async () => {
    const a = os.records.create({ object: 'account', title: 'ICICI Bank card ••3007', data: { kind: 'credit', institution: 'ICICI Bank', last4: '3007', currency: 'INR', openingBalance: 0 } });
    const { runAgentTool } = await import('./askAgent');
    const changes: Array<{ label: string; undo?: () => void }> = [];
    const refs = JSON.parse(await runAgentTool(os, 'cards_and_spend', {}, { confirm: async () => true, change: () => {} })).accounts.map((x: { ref: string }) => x.ref);
    await runAgentTool(os, 'name_card', { ref: refs[0], name: 'Amazon Pay ICICI card' }, { confirm: async () => true, change: (c) => changes.push(c) });
    expect(os.records.get(a.id)!.title).toBe('Amazon Pay ICICI card');
    expect(changes[0]!.label).toBe('Named ICICI Bank card "Amazon Pay ICICI card"');
    changes[0]!.undo!();
    expect(os.records.get(a.id)!.title).toBe('ICICI Bank card ••3007');
  });

  it('a card ref in the answer shows as the card name and last digits, which never go to the model', async () => {
    os.records.create({ object: 'account', title: 'ICICI Bank card', data: { kind: 'credit', institution: 'ICICI Bank', last4: '8013', currency: 'INR', openingBalance: 0 } });
    await new Promise((r) => setTimeout(r, 3));
    os.records.create({ object: 'account', title: 'ICICI Bank card', data: { kind: 'credit', institution: 'ICICI Bank', last4: '3007', currency: 'INR', openingBalance: 0 } });
    const api = fakeApi(() => [
      { id: 'e1', type: 'session.status_running' },
      { id: 'e2', type: 'agent.message', content: [{ type: 'text', text: 'Use card-1 for Amazon and Card-2 for the rest; card-9 is not there.' }] },
      { id: 'e3', type: 'session.status_idle', stop_reason: { type: 'end_turn' } },
    ]);
    const h = hooks();
    await new MoneyAgentChat(os, { apiKey: 'k', fetchImpl: api.fetchImpl }, { wait: async () => undefined }).ask('which card for what', h.hooks);
    expect(h.out.texts).toEqual(['Use ICICI Bank card ••8013 for Amazon and ICICI Bank card ••3007 for the rest; card-9 is not there.']);
    expect(JSON.stringify(api.calls)).not.toContain('8013');
  });

  it('card_use writes what a card is for on it, and Undo takes it off', async () => {
    const a = os.records.create({ object: 'account', title: 'ICICI Bank card', data: { kind: 'credit', institution: 'ICICI Bank', last4: '8013', currency: 'INR', openingBalance: 0 } });
    const { runAgentTool } = await import('./askAgent');
    const changes: Array<{ label: string; undo?: () => void }> = [];
    await runAgentTool(os, 'card_use', { ref: 'card-1', useFor: 'Amazon and Flipkart' }, { confirm: async () => true, change: (c) => changes.push(c) });
    expect((os.records.get(a.id)!.data as { useFor?: string }).useFor).toBe('Amazon and Flipkart');
    expect(changes[0]!.label).toBe('ICICI Bank card ••8013: use for Amazon and Flipkart');
    changes[0]!.undo!();
    expect((os.records.get(a.id)!.data as { useFor?: string }).useFor).toBeUndefined();
  });
});
