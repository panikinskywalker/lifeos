import { z } from 'zod';
import type { LifeOSContext } from '@core/registry/context';
import type { AiToolDef } from '@core/registry/types';
import { extrasOf, withExtras } from '@core/ai/cards';
import { stripNulls, toolSpec } from '@core/ai/assistant';
import { personToken, roundMoney, unmask } from '@core/ai/privacy';
import { fingerprint, managedRequest, ManagedError, sendEvents, sessionEvents, turnOver, type ManagedConfig, type ManagedEvent } from '@core/ai/managedAgent';
import { financeAiTools } from './aiTools';
import { BLOCKS, PERIODS, dropView, keepView, oddThings, type MoneyQuery } from './ask';
import { applySort, undoSort } from './aiSort';
import { categoryTargets, setCategoryTarget } from './categories';
import { comingUp, LINE_KEY, pace } from './home';
import { peopleNames } from './filing/moneyIn';
import { CATEGORIES, type AccountData, type TransactionData } from './types';
import type { SpendPeriod } from './spend';

/**
 * Ask Money as an agent (docs/MODEL.md, Ask Money is an agent): a Claude
 * Managed Agent on Claude Sonnet 5.5, with web search, whose every money tool the phone answers, so
 * figures come from the phone's sums and only rounded amounts and
 * placeholders for people leave it. It answers, says what to do, makes
 * changes with Undo (asking first for the bigger ones) and builds views on
 * Money home. It never moves money.
 */

export const ASK_AGENT_MODEL = 'claude-sonnet-5-5';
const SAVED_KEY = 'finance.askAgent';
/** A conversation's spend cap at list price, in US cents (Haiku answers cost a fraction of this). */
const SESSION_BUDGET_CENTS = '50';

export const ASK_AGENT_SYSTEM = `You are Money, the user's personal finance guru inside LifeOS, an app on their phone in India. You are sharp, warm and direct, like a friend who is great with money.

How you work:
- Every figure comes from a tool. Call money_overview at the start of a conversation and money_query (or another Money tool) for any number; never do arithmetic yourself and never invent a figure.
- When something deserves a look, say it plainly and say what to do: pay a card bill in full, pause a subscription that went up, a fee that looks new, how much a day keeps the month under its line.
- To show a figure, call money_show once per answer with one or two sentences, the block that fits (number, bars, line, calendar, list), a short title and the money query behind it. The phone draws it and lists the payments behind it.
- You can change things. recategorise and keep_view run at once and the user can undo them; set_budget asks the user first. Say what you changed.
- To put something on the user's Money home (a tracker, a chart), call keep_view with the money query; it stays live.
- You never move money, pay anyone or settle a debt. If asked, say so and offer to keep a view or note instead.
- You can search the web (web_search) and read pages (web_fetch) for what is not in the user's records: today's FD and savings rates, a fund's returns and expense ratio, tax rules and deadlines, card offers, prices. Put the figures you find next to theirs and say where they came from. Never put the user's names, account digits or exact figures into a search.
- Cards: when asked how to spend smarter, or when it would save real money, call cards_and_spend, look up each card's current rewards, cashback and fees on the web (by bank and card name; ask the user which card it is when the name is only the bank's, like "ICICI Bank card"), and say which card to use for which kind of spend, with the rupees it saves a month. Mention fees, caps and anything that expires.
- No buy or sell calls on a fund or a stock. Explain what they hold and the general rules (an emergency fund first, stepping a SIP up) instead.
- People appear as placeholders like "Person 3"; use them as given. Amounts are rounded rupees unless a currency is given.
- Think like a sharp personal finance advisor, not a search box. Look at more than one figure before you answer: compare with last month or the usual month (money_query with sameDaysBefore, or by month), find what drives a number (by category, then by payee), and name the specific shops, bills or days behind it.
- End with what to do: one to three concrete steps with rupee amounts ("cut Swiggy to 4 orders a week: about ₹2,400 a month"), not general advice.
- Keep it tight: a short paragraph or a few bullet lines, then the block. Ask a question back when the request is unclear.`;

const QUERY = z.object({
  measure: z.enum(['spent', 'came_in', 'bills']),
  period: z.enum(PERIODS as [SpendPeriod, ...SpendPeriod[]]).default('month'),
  by: z.enum(['day', 'week', 'month', 'category', 'payee']).optional(),
  only: z.array(z.string()).optional(),
  payee: z.string().optional(),
  leaveOut: z.array(z.string()).optional(),
  sort: z.enum(['newest', 'largest']).optional(),
});
const CATEGORY_IDS = CATEGORIES.map((c) => c.value).filter((v) => v !== 'other' && v !== 'transfer') as [string, ...string[]];

/** The agent's own tools, beyond Money's read-only ones. */
export const MONEY_AGENT_TOOLS: AiToolDef[] = [
  {
    name: 'money_overview',
    description: 'The month at a glance, worked out on the phone: spent so far and the pace against the monthly line, what is due before payday, and anything that looks wrong (charged twice, a new fee, a bill that went up). Call it first.',
    input: z.object({}),
    run: async (_input, os) => {
      const p = pace(os);
      const c = comingUp(os);
      const odd = oddThings(os);
      const people = new Set(peopleNames(os).map((n) => n.toLowerCase()));
      const name = (s: string) => (people.has(s.toLowerCase()) ? personToken(os, s) : s);
      return {
        pace: p ? { spent: roundMoney(p.spent), line: roundMoney(p.line), perDayToStayUnder: p.over ? null : roundMoney(p.perDay), over: p.over ? roundMoney(-p.left) : null, daysLeft: p.daysLeft } : null,
        beforePayday: c.items.map((i) => ({ title: name(i.title), amount: roundMoney(i.amount), due: i.due, late: i.late })),
        chargedTwice: odd.twice.map((p2) => ({ payee: name(p2.txs[0]!.title), amount: roundMoney(p2.txs[0]!.data.amount), date: p2.txs[0]!.data.date })),
        newFees: odd.fees.map((f) => ({ payee: name(f.tx.title), amount: roundMoney(f.tx.data.amount), date: f.tx.data.date })),
        billsWentUp: odd.prices.map((x) => ({ name: x.sub.data.name, from: roundMoney(x.from), to: roundMoney(x.to) })),
      };
    },
  },
  {
    name: 'cards_and_spend',
    description: 'Your cards and bank accounts with what goes through each: for every one its name, bank and kind, what a card owes now and its limit, and over the last 3 months the average spent a month by category and at the top shops. Use it to say which card to use for what (look up each card\'s rewards on the web).',
    input: z.object({}),
    run: async (_input, os) => {
      const people = new Set(peopleNames(os).map((n) => n.toLowerCase()));
      const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
      const accounts = os.records.query<AccountData>('account', {}, { limit: 100 }).filter((a) => a.data.kind === 'credit' || a.data.kind === 'bank' || a.data.kind === 'wallet');
      return {
        accounts: accounts.map((a) => {
          const txs = os.records.query<TransactionData>('transaction', { filter: { and: [{ field: 'data.accountId', op: 'eq', value: a.id }, { field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: since }] } }, { limit: 3000 });
          const sum = (key: (t: TransactionData & { title?: string }) => string | null) => {
            const m = new Map<string, number>();
            for (const t of txs) {
              const k = key({ ...t.data, title: t.title });
              if (k) m.set(k, (m.get(k) ?? 0) + t.data.amount);
            }
            return [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8).map(([k, v]) => ({ name: k, perMonth: roundMoney(v / 3) }));
          };
          return {
            name: a.title.replace(/\s*[•·]+\s*\d{3,4}$/, ''),
            bank: a.data.institution ?? null,
            kind: a.data.kind,
            owedNow: a.data.kind === 'credit' ? roundMoney(Math.max(0, -(a.data.knownBalance ?? 0))) : null,
            limit: a.data.creditLimit ? roundMoney(a.data.creditLimit) : null,
            spentPerMonth: roundMoney(txs.reduce((n, t) => n + t.data.amount, 0) / 3),
            byCategory: sum((t) => t.category),
            topShops: sum((t) => { const n = (t.title || t.merchant || '').trim(); return n && !people.has(n.toLowerCase()) ? n : null; }),
          };
        }),
      };
    },
  },
  {
    name: 'recategorise',
    description: 'Move every payment to a shop or merchant into a category, and learn it so the next one files there too. payee is the shop name as the user or money_query gives it. Runs at once; the user can undo it.',
    input: z.object({ payee: z.string(), category: z.enum(CATEGORY_IDS) }),
    run: async (input, os) => {
      const i = input as { payee: string; category: string };
      const want = unmask(os, i.payee).trim().toLowerCase();
      if (new Set(peopleNames(os).map((n) => n.toLowerCase())).has(want)) return { error: 'That is a person, not a shop.' };
      const txs = os.records.query<TransactionData>('transaction', { filter: { and: [{ field: 'data.kind', op: 'eq', value: 'expense' }] } }, { limit: 5000 }).filter((t) => (t.title || t.data.merchant || '').trim().toLowerCase() === want);
      if (!txs.length) return { error: `No payments to "${i.payee}" found.` };
      const name = (txs[0]!.title || txs[0]!.data.merchant || i.payee).trim();
      const done = applySort(os, [{ name, ids: txs.map((t) => t.id), typical: 0 }], { [name]: i.category });
      return withExtras({ moved: done.changed.length, payee: name, category: i.category }, { undo: () => undoSort(os, done) });
    },
  },
  {
    name: 'keep_view',
    description: 'Put a live card on the user\'s Money home: a title, the block (number, bars, line, calendar, list) and the money query behind it. It stays up to date. Runs at once; the user can remove it.',
    input: z.object({ title: z.string(), block: z.enum(BLOCKS as [string, ...string[]]), query: QUERY }),
    run: async (input, os) => {
      const i = input as { title: string; block: string; query: MoneyQuery };
      const v = keepView(os, { title: i.title, kind: i.block as never, query: i.query });
      return withExtras({ kept: v.title }, { undo: () => void dropView(os, v.id) });
    },
  },
  {
    name: 'set_budget',
    description: 'Set a monthly limit: for one category (category id), or the whole month\'s line when category is left out. Asks the user first.',
    input: z.object({ monthly: z.number().positive(), category: z.enum(CATEGORY_IDS).optional() }),
    confirm: true,
    describe: (i: { monthly: number; category?: string }, os) => `Set ${i.category ? `a ${CATEGORIES.find((c) => c.value === i.category)?.label ?? i.category} limit` : 'your monthly line'} of ${os.format.currency(Math.round(i.monthly))} a month?`,
    run: async (input, os) => {
      const i = input as { monthly: number; category?: string };
      if (i.category) {
        const before = categoryTargets(os)[i.category] ?? null;
        setCategoryTarget(os, i.category, Math.round(i.monthly));
        return withExtras({ set: true }, { undo: () => setCategoryTarget(os, i.category!, before) });
      }
      const before = os.settings.get<number | null>(LINE_KEY, null);
      os.settings.set(LINE_KEY, Math.round(i.monthly));
      return withExtras({ set: true }, { undo: () => os.settings.set(LINE_KEY, before) });
    },
  },
];

/** Money's read-only tools the agent may use (each goes through the privacy gate), then its own. */
const READS = new Set(['money_query', 'money_show', 'net_worth', 'portfolio', 'subscriptions_run_rate']);
export const askAgentTools = (): AiToolDef[] => [...financeAiTools.filter((t) => READS.has(t.name)), ...MONEY_AGENT_TOOLS];

export function agentDefinition() {
  return {
    name: 'Ask Money',
    description: 'LifeOS Money: a personal finance guru whose tools the phone answers.',
    model: { id: ASK_AGENT_MODEL, effort: 'medium' },
    system: ASK_AGENT_SYSTEM,
    tools: [
      // The web, run by Anthropic: search and read pages, nothing else in the sandbox (16 Nov, Rutvij).
      { type: 'agent_toolset_20260401', default_config: { enabled: false, permission_policy: { type: 'always_allow' } }, configs: [{ name: 'web_search', enabled: true }, { name: 'web_fetch', enabled: true }] },
      ...askAgentTools().map((t) => ({ type: 'custom', ...toolSpec(t) })),
    ],
  };
}

/** The environment the agent runs in: open to the web, since the web tools reach nothing on a closed network. */
const ENVIRONMENT = { name: 'LifeOS Ask Money (web)', config: { type: 'cloud', networking: { type: 'unrestricted' } } };

interface Saved {
  agentId: string;
  envId: string;
  fp: string;
  /** Which environment it is: a newer one is made when its networking changes. */
  envFp?: string;
}

/** The agent and its environment, made once with your key and updated when the definition changes. */
export async function ensureMoneyAgent(os: LifeOSContext, cfg: ManagedConfig): Promise<Saved> {
  const def = agentDefinition();
  const fp = fingerprint(def);
  const envFp = fingerprint(ENVIRONMENT);
  const saved = os.settings.get<Saved | null>(SAVED_KEY, null);
  if (saved && saved.fp === fp && saved.envFp === envFp) return saved;
  const envId = saved && saved.envFp === envFp ? saved.envId : (await managedRequest<{ id: string }>(cfg, 'POST', '/v1/environments', ENVIRONMENT)).id;
  const agentId = saved ? (saved.fp === fp ? saved.agentId : (await managedRequest(cfg, 'POST', `/v1/agents/${saved.agentId}`, def), saved.agentId)) : (await managedRequest<{ id: string }>(cfg, 'POST', '/v1/agents', def)).id;
  const next = { agentId, envId, fp, envFp };
  os.settings.set(SAVED_KEY, next);
  return next;
}

/** What the agent's turn is doing, for the Ask screen. */
export interface AgentHooks {
  text(id: string, text: string): void;
  step(label: string): void;
  show(input: { sentence: string; block: string; title: string; query: MoneyQuery }): void;
  change(c: { label: string; undo?: () => void }): void;
  confirm(label: string): Promise<boolean>;
}

const STEP: Record<string, string> = { cards_and_spend: 'Looked at your cards', money_overview: 'Looked at the month', money_query: 'Worked out a figure', net_worth: 'Looked at net worth', portfolio: 'Looked at investments', subscriptions_run_rate: 'Looked at subscriptions', recategorise: 'Moved payments', keep_view: 'Built a card', set_budget: 'Set a limit', money_show: 'Drew it' };

/** Run one tool the agent called, on the phone: validate, ask first when it must, run, return what goes back. */
export async function runAgentTool(os: LifeOSContext, name: string, input: unknown, hooks: Pick<AgentHooks, 'confirm' | 'change'>): Promise<string> {
  const tool = askAgentTools().find((t) => t.name === name);
  if (!tool) return JSON.stringify({ error: `No tool named ${name}.` });
  const parsed = tool.input.safeParse(stripNulls(input));
  if (!parsed.success) return JSON.stringify({ error: `Bad input: ${parsed.error.message.slice(0, 300)}` });
  const ask = typeof tool.confirm === 'function' ? tool.confirm(parsed.data, os) : tool.confirm;
  if (ask && !(await hooks.confirm(tool.describe?.(parsed.data, os) ?? `Run ${name}?`))) return JSON.stringify({ declined: true, note: 'The user said no. Do not try again.' });
  const out = await tool.run(parsed.data, os);
  const { undo } = extrasOf(out);
  if (undo) hooks.change({ label: changeLabel(name, out as Record<string, unknown>, os), undo });
  return JSON.stringify(out);
}

function changeLabel(name: string, out: Record<string, unknown>, os: LifeOSContext): string {
  if (name === 'recategorise') return `Moved ${out.moved} payment${out.moved === 1 ? '' : 's'} to ${CATEGORIES.find((c) => c.value === out.category)?.label ?? out.category} · ${out.payee} files there from now on`;
  if (name === 'keep_view') return `Added "${out.kept}" to Money home`;
  if (name === 'set_budget') return 'Limit set';
  return `Done · ${name}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One Ask conversation: a session made on the first question, kept for the
 * follow-ups. Each turn sends the question and reads the session's events
 * until it is idle, answering every tool call on the phone.
 */
export class MoneyAgentChat {
  private session: string | null = null;
  private seen = new Set<string>();

  constructor(private os: LifeOSContext, private cfg: ManagedConfig, private opts: { pollMs?: number; maxPolls?: number; wait?: (ms: number) => Promise<void> } = {}) {}

  async ask(question: string, hooks: AgentHooks): Promise<'done' | 'budget' | 'ended'> {
    if (!this.session) this.session = await this.open();
    const id = this.session;
    await sendEvents(this.cfg, id, [{ type: 'user.message', content: [{ type: 'text', text: question }] }]);
    let running = false;
    for (let n = 0; n < (this.opts.maxPolls ?? 300); n++) {
      for (const e of await sessionEvents(this.cfg, id)) {
        if (this.seen.has(e.id)) continue;
        this.seen.add(e.id);
        if (e.type === 'session.status_running' || e.type.startsWith('agent.')) running = true;
        await this.handle(id, e, hooks);
        const over = running ? turnOver(e) : null;
        if (over) return over;
      }
      await (this.opts.wait ?? sleep)(this.opts.pollMs ?? 900);
    }
    throw new Error('Money took too long to answer. Try again.');
  }

  private async open(): Promise<string> {
    const body = (s: Saved) => ({ agent: s.agentId, environment_id: s.envId, title: 'Ask Money', budget: { type: 'limit', max_list_cost: { amount: SESSION_BUDGET_CENTS, currency: 'USD' } } });
    let saved = await ensureMoneyAgent(this.os, this.cfg);
    try {
      return (await managedRequest<{ id: string }>(this.cfg, 'POST', '/v1/sessions', body(saved))).id;
    } catch (e) {
      // The stored agent belongs to another key or was deleted: make it again once.
      if (!(e instanceof ManagedError) || e.status !== 404) throw e;
      this.os.settings.set(SAVED_KEY, null);
      saved = await ensureMoneyAgent(this.os, this.cfg);
      return (await managedRequest<{ id: string }>(this.cfg, 'POST', '/v1/sessions', body(saved))).id;
    }
  }

  private async handle(sessionId: string, e: ManagedEvent, hooks: AgentHooks) {
    if (e.type === 'agent.message') {
      const text = ((e.content as Array<{ type: string; text?: string }> | undefined) ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
      if (text) hooks.text(e.id, unmask(this.os, text));
      return;
    }
    // The web tools run on Anthropic's side; the step says what it looked up, so you see every search.
    if (e.type === 'agent.tool_use') {
      const input = (e.input ?? {}) as { query?: string; url?: string };
      if (e.name === 'web_search') hooks.step(`Searched the web: ${String(input.query ?? '').slice(0, 60)}`);
      else if (e.name === 'web_fetch') hooks.step(`Read ${String(input.url ?? '').replace(/^https?:\/\//, '').split('/')[0]}`);
      if (e.evaluated_permission === 'ask') await sendEvents(this.cfg, sessionId, [{ type: 'user.tool_confirmation', tool_use_id: e.id, result: e.name === 'web_search' || e.name === 'web_fetch' ? 'allow' : 'deny' }]);
      return;
    }
    if (e.type !== 'agent.custom_tool_use') return;
    const name = String(e.name ?? '');
    hooks.step(STEP[name] ?? name);
    let result: string;
    if (name === 'money_show') {
      const parsed = MONEY_SHOW.safeParse(stripNulls(e.input));
      if (parsed.success) hooks.show({ ...parsed.data, sentence: unmask(this.os, parsed.data.sentence), query: parsed.data.query as MoneyQuery });
      result = JSON.stringify(parsed.success ? { shown: true } : { error: parsed.error.message.slice(0, 300) });
    } else {
      result = await runAgentTool(this.os, name, e.input, hooks).catch((err: Error) => JSON.stringify({ error: err.message.slice(0, 300) }));
    }
    await sendEvents(this.cfg, sessionId, [{ type: 'user.custom_tool_result', custom_tool_use_id: e.id, content: [{ type: 'text', text: result }] }]);
  }
}

const MONEY_SHOW = z.object({ sentence: z.string(), block: z.enum(BLOCKS as [string, ...string[]]), title: z.string(), query: QUERY });
