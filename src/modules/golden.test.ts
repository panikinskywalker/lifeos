/**
 * Golden tests (M3): PRODUCT §7 sample sentences replayed against a
 * recorded-response model on the real record types and tools. Each asserts
 * the exact tool calls, which of them asked first (money & people), and the
 * resulting data. Flows 6–7 (UPI ingestion, morning brief) belong to M5/M4.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { ModuleManifest } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { Assistant, type AssistantTurn } from '@core/ai/assistant';
import type { ContentBlock, LLMProvider } from '@core/ai/provider';
import { accountType, debtType, subscriptionType, transactionType } from './finance/types';
import { financeAiTools } from './finance/aiTools';
import { balanceWith } from './finance/split';
import { assetsAiTools, assetType, routineType, vehicleType } from './assets/types';
import { groupType, personType } from './crm/types';
import { itemType } from './inventory';

const modules: ModuleManifest[] = [
  { id: 'crm', name: 'People', version: '1', description: '', icon: 'x', color: '#000', objects: [personType, groupType] },
  { id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', objects: [accountType, transactionType, subscriptionType, debtType], aiTools: financeAiTools },
  { id: 'assets', name: 'Things', version: '1', description: '', icon: 'x', color: '#000', objects: [assetType, vehicleType, routineType], aiTools: assetsAiTools },
  { id: 'inventory', name: 'Inventory', version: '1', description: '', icon: 'x', color: '#000', objects: [itemType] },
];

type Step = (results: Array<Record<string, any>>) => Array<{ name: string; input: Record<string, unknown> }>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** A model that replays `steps` (each sees the previous tool results), then says `final`. */
function recorded(steps: Step[], final = 'Done.'): LLMProvider {
  let i = 0;
  return {
    id: 'recorded',
    complete: async ({ messages }) => {
      const last = messages[messages.length - 1]!;
      const results = Array.isArray(last.content) ? last.content.filter((b): b is Extract<ContentBlock, { type: 'tool_result' }> => b.type === 'tool_result').map((b) => JSON.parse(b.content)) : [];
      const step = steps[i++];
      if (!step) return { content: [{ type: 'text', text: final }], stopReason: 'end_turn' };
      return { content: step(results).map((c, k) => ({ type: 'tool_use' as const, id: `t${i}-${k}`, name: c.name, input: c.input })), stopReason: 'tool_use' };
    },
  };
}

let os: LifeOSContext;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const daysFrom = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function say(text: string, steps: Step[]) {
  const turns: AssistantTurn[] = [];
  const asked: string[] = [];
  await new Assistant(os, { provider: recorded(steps), parser: false, onTurn: (t) => turns.push(t), confirm: async (d) => (asked.push(d.name), true) }).send(text);
  const tools = turns.filter((t) => t.role === 'tool');
  for (const t of tools) expect({ tool: t.toolName, error: t.isError ? t.toolResult : null }).toEqual({ tool: t.toolName, error: null });
  return { calls: tools.map((t) => t.toolName), asked, tools };
}

beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules, registry: new Registry() });
});
afterEach(() => os.db.close());

describe('golden flows (PRODUCT §7)', () => {
  it('1 · "Did the car service today, 6,400 at Hyundai" → service logged, expense linked, cycle rolled, card with Undo; zero taps but the money confirm', async () => {
    const car = os.records.create({ type: 'vehicle', data: { make: 'Hyundai', model: 'Creta', odometerKm: 29400, nextServiceKm: 30000 } });
    const service = os.cycles.forEntity(car.id).find((c) => c.template === 'vehicle.service')!;
    const r = await say('Did the car service today, 6,400 at Hyundai', [
      () => [{ name: 'resolve_entity', input: { text: 'the car' } }],
      ([res]) => [{ name: 'log_event', input: { entityId: res!.match.id, what: 'Service', cost: 6400, note: 'Hyundai' } }],
    ]);
    expect(r.calls).toEqual(['resolve_entity', 'log_event']);
    expect(r.asked).toEqual(['log_event']);
    const rolled = os.cycles.get(service.id)!;
    expect(new Date(rolled.lastDoneAt!).toDateString()).toBe(new Date().toDateString());
    expect(rolled.nextDueMeter).toBe(39400);
    const tx = os.records.query<{ amount: number; category: string; kind: string }>('transaction');
    expect(tx.map((t) => t.data)).toEqual([expect.objectContaining({ amount: 6400, kind: 'expense', category: 'transport' })]);
    expect(os.links.targets(tx[0]!.id, 'vehicle')).toEqual([car.id]);
    const turn = r.tools[1]!;
    expect(turn.card).toMatchObject({ kind: 'cycle', cycleId: service.id });
    turn.undo!();
    expect(os.cycles.get(service.id)!.lastDoneAt).toBe(service.lastDoneAt);
    expect(os.records.query('transaction')).toHaveLength(0);
  });

  it('2 · "Recharged Jio 719 for 84 days" → plan updated, renewal done, next due +84 days, expense logged', async () => {
    const jio = os.records.create({ type: 'subscription', status: 'active', data: { name: 'Jio', amount: 599, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: today(), autoPost: false } });
    const r = await say('Recharged Jio 719 for 84 days', [
      () => [{ name: 'resolve_entity', input: { text: 'Jio' } }],
      ([res]) => [{ name: 'update_entity', input: { id: res!.match.id, data: { amount: 719, rrule: 'FREQ=DAILY;INTERVAL=84' } } }],
      () => [{ name: 'mark_cycle_done', input: { entityId: jio.id, cost: 719 } }],
    ]);
    expect(r.calls).toEqual(['resolve_entity', 'update_entity', 'mark_cycle_done']);
    expect(r.asked).toEqual(['update_entity', 'mark_cycle_done']);
    expect(os.records.get<{ nextBillingAt: string; amount: number }>(jio.id)!.data).toMatchObject({ amount: 719, nextBillingAt: daysFrom(84) });
    expect(os.records.query<{ amount: number }>('transaction').map((t) => t.data.amount)).toEqual([719]);
  });

  it('3 · "did laundry" / "Washed the white sneakers" → routine and item cycles roll', async () => {
    const laundry = os.records.create({ type: 'routine', data: { name: 'Laundry', everyN: 4, everyUnit: 'day', lastDoneOn: daysFrom(-5) } });
    const sneakers = os.records.create({ type: 'item', title: 'White sneakers', data: { quantity: 1 } });
    const wash = os.cycles.create({ entityId: sneakers.id, name: 'Wash', kind: 'interval', everyN: 3, everyUnit: 'week', lastDoneAt: Date.now() - 25 * 864e5 });
    const a = await say('did laundry', [() => [{ name: 'resolve_entity', input: { text: 'laundry' } }], ([res]) => [{ name: 'mark_cycle_done', input: { entityId: res!.match.id } }]]);
    expect(a).toMatchObject({ calls: ['resolve_entity', 'mark_cycle_done'], asked: [] });
    expect(os.records.get<{ lastDoneOn: string }>(laundry.id)!.data.lastDoneOn).toBe(today());
    const b = await say('Washed the white sneakers', [() => [{ name: 'resolve_entity', input: { text: 'the white sneakers' } }], ([res]) => [{ name: 'log_event', input: { entityId: res!.match.id, what: 'Wash' } }]]);
    expect(b).toMatchObject({ calls: ['resolve_entity', 'log_event'], asked: [] });
    expect(os.cycles.stats(wash.id).count).toBe(1);
  });

  it('4 · "Priya paid me back 2,600" → debt settled, money in, on her timeline (confirm card)', async () => {
    const priya = os.records.create({ type: 'person', data: {}, title: 'Priya Sharma' });
    os.records.create({ type: 'debt', status: 'open', data: { personId: priya.id, direction: 'they_owe', amount: 2600, reason: 'Toit', date: today(), kind: 'split' } });
    const r = await say('Priya paid me back 2,600', [
      () => [{ name: 'resolve_entity', input: { text: 'Priya', types: ['person'] } }],
      ([res]) => [
        { name: 'settle_debt', input: { personId: res!.match.id } },
        { name: 'create_entity', input: { type: 'transaction', data: { amount: 2600, kind: 'income', category: 'transfer', merchant: 'Priya Sharma', date: today() }, links: [{ toId: res!.match.id, kind: 'person' }] } },
      ],
    ]);
    expect(r.calls).toEqual(['resolve_entity', 'settle_debt', 'create_entity']);
    expect(r.asked).toEqual(['settle_debt', 'create_entity']);
    expect(balanceWith(os, priya.id)).toBe(0);
    expect(os.records.query<{ kind: string; amount: number }>('transaction').map((t) => [t.data.kind, t.data.amount])).toEqual([['income', 2600]]);
    expect(os.records.timeline.forEntity(priya.id).some((e) => e.kind === 'relation')).toBe(true);
  });

  it('5 · "Dinner was 3,600, split with Arjun and Priya" → expense + two debts (confirm card)', async () => {
    const arjun = os.records.create({ type: 'person', data: {}, title: 'Arjun Mehta' });
    const priya = os.records.create({ type: 'person', data: {}, title: 'Priya Sharma' });
    const r = await say('Dinner was 3,600, split with Arjun and Priya', [
      () => [{ name: 'resolve_entity', input: { text: 'Arjun' } }, { name: 'resolve_entity', input: { text: 'Priya' } }],
      () => [{ name: 'create_entity', input: { type: 'transaction', data: { amount: 3600, kind: 'expense', category: 'food', merchant: 'Dinner', date: today() } } }],
      ([tx]) => [{ name: 'split_transaction', input: { transactionId: tx!.id, payer: 'me', method: 'equal', parts: [{ party: 'me' }, { party: arjun.id }, { party: priya.id }] } }],
    ]);
    expect(r.calls).toEqual(['resolve_entity', 'resolve_entity', 'create_entity', 'split_transaction']);
    expect(r.asked).toEqual(['create_entity', 'split_transaction']);
    expect(os.records.query<{ amount: number; personId: string }>('debt').map((d) => d.data.amount)).toEqual([1200, 1200]);
    expect([balanceWith(os, arjun.id), balanceWith(os, priya.id)]).toEqual([1200, 1200]);
  });

  it('8 · questions answer from data, change nothing and ask nothing', async () => {
    const car = os.records.create({ type: 'vehicle', data: { make: 'Hyundai', model: 'Creta' } });
    os.records.timeline.add({ entityId: car.id, kind: 'event', title: 'Tyre change', actor: 'user', occurredAt: Date.now() - 40 * 864e5 });
    const priya = os.records.create({ type: 'person', data: {}, title: 'Priya Sharma' });
    os.records.create({ type: 'debt', status: 'open', data: { personId: priya.id, direction: 'they_owe', amount: 900, date: today(), kind: 'loan' } });
    os.facts.add({ text: 'The landlord is Suresh; rent is due on the 5th', source: 'talk' });
    const before = os.db.get<{ n: number }>('SELECT COUNT(*) n FROM changes')!.n;

    const q1 = await say('when did I last change tyres', [() => [{ name: 'resolve_entity', input: { text: 'the car' } }], ([res]) => [{ name: 'get_entity', input: { id: res!.match.id } }]]);
    expect((q1.tools[1]!.toolResult as { timeline: Array<{ title: string }> }).timeline.map((t) => t.title)).toContain('Tyre change');
    const q2 = await say('who owes me money', [() => [{ name: 'balances', input: {} }]]);
    expect((q2.tools[0]!.toolResult as { balances: unknown[] }).balances).toEqual([expect.objectContaining({ person: 'Priya Sharma', amount: 900, meaning: 'owes you' })]);
    const q3 = await say('what did I say about the landlord', [() => [{ name: 'recall', input: { query: 'landlord' } }]]);
    expect((q3.tools[0]!.toolResult as { facts: Array<{ text: string }> }).facts.map((f) => f.text)).toEqual(['The landlord is Suresh; rent is due on the 5th']);
    for (const q of [q1, q2, q3]) expect(q.asked).toEqual([]);
    expect(os.db.get<{ n: number }>('SELECT COUNT(*) n FROM changes')!.n).toBe(before);
  });

  it('9 · "Remember that the landlord\'s name is Suresh and rent is due on the 5th" → a fact, no routine until the user says yes', async () => {
    const r = await say("Remember that the landlord's name is Suresh and rent is due on the 5th", [() => [{ name: 'remember_fact', input: { text: 'The landlord is Suresh; rent is due on the 5th' } }]]);
    expect(r).toMatchObject({ calls: ['remember_fact'], asked: [] });
    expect(os.facts.list().map((f) => f.text)).toEqual(['The landlord is Suresh; rent is due on the 5th']);
    expect(os.records.query('routine')).toHaveLength(0);
  });
});

/** SCOPE v2 B5: the same sentences with no model at all — the on-device parser does them. */
async function offline(text: string) {
  const turns: AssistantTurn[] = [];
  const asked: string[] = [];
  await new Assistant(os, { provider: null, onTurn: (t) => turns.push(t), confirm: async (d) => (asked.push(d.name), true) }).send(text);
  const tools = turns.filter((t) => t.role === 'tool');
  for (const t of tools) expect({ tool: t.toolName, error: t.isError ? t.toolResult : null }).toEqual({ tool: t.toolName, error: null });
  return { calls: tools.map((t) => t.toolName), asked, reply: turns.filter((t) => t.role === 'assistant').map((t) => t.text).join(' '), tools };
}

describe('golden flows with no model (parser first)', () => {
  it('1 · car service with cost, vendor and the money confirm', async () => {
    const car = os.records.create({ type: 'vehicle', data: { make: 'Hyundai', model: 'Creta', odometerKm: 29400, nextServiceKm: 30000 } });
    const service = os.cycles.forEntity(car.id).find((c) => c.template === 'vehicle.service')!;
    const r = await offline('Did the car service today, 6,400 at Hyundai');
    expect(r).toMatchObject({ calls: ['log_event'], asked: ['log_event'] });
    expect(os.cycles.get(service.id)!.nextDueMeter).toBe(39400);
    expect(os.records.query<{ amount: number }>('transaction').map((t) => t.data.amount)).toEqual([6400]);
    expect(r.reply).toMatch(/Hyundai Creta service done · ₹6,400 filed/);
    expect(r.tools[0]!.undo).toBeTypeOf('function');
  });

  it('2 · Jio recharge', async () => {
    const jio = os.records.create({ type: 'subscription', status: 'active', data: { name: 'Jio', amount: 599, rrule: 'FREQ=MONTHLY;INTERVAL=1', nextBillingAt: today(), autoPost: false } });
    const r = await offline('Recharged Jio 719 for 84 days');
    expect(r).toMatchObject({ calls: ['update_entity', 'mark_cycle_done'], asked: ['update_entity', 'mark_cycle_done'] });
    expect(os.records.get<{ nextBillingAt: string; amount: number }>(jio.id)!.data).toMatchObject({ amount: 719, nextBillingAt: daysFrom(84) });
  });

  it('3 · did laundry / washed the white sneakers — no confirms', async () => {
    const laundry = os.records.create({ type: 'routine', data: { name: 'Laundry', everyN: 4, everyUnit: 'day', lastDoneOn: daysFrom(-5) } });
    const sneakers = os.records.create({ type: 'item', title: 'White sneakers', data: { quantity: 1 } });
    const wash = os.cycles.create({ entityId: sneakers.id, name: 'Wash', kind: 'interval', everyN: 3, everyUnit: 'week', lastDoneAt: Date.now() - 25 * 864e5 });
    expect(await offline('did laundry')).toMatchObject({ calls: ['mark_cycle_done'], asked: [] });
    expect(os.records.get<{ lastDoneOn: string }>(laundry.id)!.data.lastDoneOn).toBe(today());
    expect(await offline('Washed the white sneakers')).toMatchObject({ calls: ['log_event'], asked: [] });
    expect(os.cycles.stats(wash.id).count).toBe(1);
  });

  it('4 · Priya paid me back', async () => {
    const priya = os.records.create({ type: 'person', data: {}, title: 'Priya Sharma' });
    os.records.create({ type: 'debt', status: 'open', data: { personId: priya.id, direction: 'they_owe', amount: 2600, date: today(), kind: 'split' } });
    const r = await offline('Priya paid me back 2,600');
    expect(r).toMatchObject({ calls: ['settle_debt', 'create_entity'], asked: ['settle_debt', 'create_entity'] });
    expect(balanceWith(os, priya.id)).toBe(0);
  });

  it('5 · dinner split three ways', async () => {
    const arjun = os.records.create({ type: 'person', data: {}, title: 'Arjun Mehta' });
    const priya = os.records.create({ type: 'person', data: {}, title: 'Priya Sharma' });
    const r = await offline('Dinner was 3,600, split with Arjun and Priya');
    expect(r).toMatchObject({ calls: ['create_entity', 'split_transaction'], asked: ['create_entity', 'split_transaction'] });
    expect([balanceWith(os, arjun.id), balanceWith(os, priya.id)]).toEqual([1200, 1200]);
    expect(r.reply).toBe('Split ₹3,600 3 ways — Arjun and Priya owe you ₹1,200 each.');
  });

  it('8 · who owes me money / what did I say about the landlord — read only', async () => {
    const priya = os.records.create({ type: 'person', data: {}, title: 'Priya Sharma' });
    os.records.create({ type: 'debt', status: 'open', data: { personId: priya.id, direction: 'they_owe', amount: 900, date: today(), kind: 'loan' } });
    os.facts.add({ text: 'The landlord is Suresh; rent is due on the 5th', source: 'talk' });
    expect((await offline('who owes me money')).reply).toBe('Priya Sharma owes you ₹900.');
    expect((await offline('what did I say about the landlord')).reply).toBe('The landlord is Suresh; rent is due on the 5th.');
  });

  it('9 · remember that …', async () => {
    const r = await offline("Remember that the landlord's name is Suresh and rent is due on the 5th");
    expect(r).toMatchObject({ calls: ['remember_fact'], asked: [] });
    expect(os.facts.list().map((f) => f.text)).toEqual(["The landlord's name is Suresh and rent is due on the 5th"]);
  });

  it('ambiguous or unknown sentences fall through (no model: a helpful note)', async () => {
    os.records.create({ type: 'person', data: {}, title: 'Priya Sharma' });
    os.records.create({ type: 'person', data: {}, title: 'Priya Menon' });
    const r = await offline('Priya paid me back 500');
    expect(r.calls).toEqual([]);
    expect(r.reply).toMatch(/add a free Groq or Gemini key/);
  });
});
