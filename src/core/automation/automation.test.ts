import { z } from 'zod';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from '../registry/registry';
import type { ModuleManifest } from '../registry/types';
import type { LifeOSContext } from '../registry/context';
import type { BrainModel } from '../brain/model';
import { bus } from '../events/bus';

/** R10 automations: steps with data passing, Continue only if, Ask Claude, manual runs, the run log with Undo, the once-off migration. */

const mod: ModuleManifest = {
  id: 'test-money', name: 'Test', version: '1.0.0', description: 'test', icon: 'x', color: '#000',
  objects: [
    {
      id: 'txn', module: 'test-money', label: 'Transaction', labelPlural: 'Transactions', icon: 'x',
      schema: z.object({ amount: z.number(), merchant: z.string().optional() }),
      fields: [{ key: 'amount', label: 'Amount', type: 'money' }, { key: 'merchant', label: 'Merchant', type: 'text' }],
      computeTitle: (d) => d.merchant ?? 'Transaction',
    },
    { id: 'note', module: 'test-money', label: 'Note', labelPlural: 'Notes', icon: 'x', schema: z.object({}).passthrough(), fields: [] },
  ],
  templates: [{ id: 'test.flag', name: 'Flag it', description: 'Tag big ones', trigger: { id: 'core.entity.created', config: { entityType: 'txn' } }, conditions: [], steps: [{ action: 'core.addTag', config: { tag: 'big' } }] }],
};

let os: LifeOSContext;
let sent: Array<{ title: string; body?: string }>;
const settle = () => new Promise((r) => setTimeout(r, 20));
const model = (text: string, calls: string[] = []): BrainModel => ({
  id: 'claude', model: 'claude-haiku-5-5',
  complete: async ({ user }) => {
    calls.push(user);
    return { text, usage: { input: 50, output: 20, cacheRead: 0, cacheWrite: 0 } };
  },
});

beforeEach(async () => {
  bus.clear();
  sent = [];
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [mod], registry: new Registry(), notify: async (n) => (sent.push({ title: n.title, body: n.body }), null) });
});
afterEach(() => os.db.close());

const onTxn = { id: 'core.entity.created', config: { entityType: 'txn' } };

describe('steps', () => {
  it('a later step reads an earlier step’s output, and the run log keeps each step', async () => {
    os.automation.rules.save({
      name: 'Note big spends', enabled: true, trigger: onTxn, conditions: [],
      steps: [
        { action: 'core.createEntity', config: { entityType: 'note', title: 'About {{title}}' } },
        { action: 'core.addComment', config: { body: '{{title}}: see {{steps.s1.title}}' } },
      ],
    });
    const t = os.records.create({ object: 'txn', data: { amount: 5000, merchant: 'Croma' } });
    await settle();
    expect(os.facts.list({ subjectId: t.id })[0]!.text).toBe('Croma: see About Croma');
    const [run] = os.automation.rules.runs();
    expect(run!.status).toBe('ok');
    expect(run!.about?.entityId).toBe(t.id);
    expect(run!.steps.map((s) => [s.key, s.status])).toEqual([['s1', 'done'], ['s2', 'done']]);
    expect(run!.steps[0]!.input).toEqual({ entityType: 'note', title: 'About Croma' });
    expect(run!.steps[0]!.output.title).toBe('About Croma');
  });

  it('Continue only if ends the run quietly', async () => {
    os.automation.rules.save({
      name: 'Only huge', enabled: true, trigger: onTxn, conditions: [],
      steps: [{ action: 'core.continueIf', config: { field: 'data.amount', op: 'gt', value: '10000' } }, { action: 'core.addTag', config: { tag: 'huge' } }],
    });
    const small = os.records.create({ object: 'txn', data: { amount: 900, merchant: 'Chai' } });
    const big = os.records.create({ object: 'txn', data: { amount: 25000, merchant: 'Flight' } });
    await settle();
    expect(os.tags.forEntity(small.id)).toHaveLength(0);
    expect(os.tags.forEntity(big.id).map((x) => x.name)).toEqual(['huge']);
    const runs = os.automation.rules.runs();
    expect(runs.every((r) => r.status === 'ok')).toBe(true);
    expect(runs.find((r) => r.about?.entityId === small.id)!.steps.map((s) => s.status)).toEqual(['stopped']);
  });

  it('a failing step stops the run and is logged; Retry runs it again on the same record', async () => {
    const rule = os.automation.rules.save({ name: 'Broken', enabled: true, trigger: onTxn, conditions: [], steps: [{ action: 'core.addTag', config: { tag: 'x' } }, { action: 'nope.gone', config: {} }, { action: 'core.star', config: {} }] });
    const t = os.records.create({ object: 'txn', data: { amount: 1, merchant: 'A' } });
    await settle();
    const [run] = os.automation.rules.runs(rule.id);
    expect(run!.status).toBe('error');
    expect(run!.steps.map((s) => s.status)).toEqual(['done', 'failed']);
    expect(os.records.get(t.id)!.starred).toBe(false);
    os.automation.rules.save({ ...rule, steps: [{ action: 'core.star', config: {} }] });
    const again = await os.automation.retry(run!.id);
    expect(again!.status).toBe('ok');
    expect(os.records.get(t.id)!.starred).toBe(true);
  });
});

describe('Ask Claude', () => {
  it('sends only the filled prompt, hands the answer on, and is in Sent to Claude', async () => {
    const calls: string[] = [];
    os.automation.modelProvider = async () => model('Looks like a one-off gadget buy.', calls);
    os.automation.rules.save({
      name: 'Explain', enabled: true, trigger: onTxn, conditions: [],
      steps: [{ action: 'core.askModel', config: { prompt: 'Is ₹{{data.amount}} at {{title}} unusual?' } }, { action: 'core.notify', config: { title: '{{title}}', body: '{{steps.s1.text}}' } }],
    });
    os.records.create({ object: 'txn', data: { amount: 42000, merchant: 'Croma' } });
    await settle();
    expect(calls).toEqual(['Is ₹42000 at Croma unusual?']);
    expect(sent).toEqual([{ title: 'Croma', body: 'Looks like a one-off gadget buy.' }]);
    const log = os.brain.sent.recent();
    expect(log[0]!.pass).toBe('automation');
    expect(log[0]!.lines).toEqual(['Is ₹42000 at Croma unusual?']);
  });

  it('with no key uses the fallback, or stops the run without one', async () => {
    os.automation.modelProvider = async () => null;
    const rule = os.automation.rules.save({ name: 'Hello', enabled: true, trigger: { id: 'core.manual', config: {} }, conditions: [], steps: [{ action: 'core.askModel', config: { prompt: 'Say hi', fallback: 'Hi there' } }, { action: 'core.notify', config: { title: '{{steps.s1.text}}' } }] });
    const ok = await os.automation.runManual(rule);
    expect(ok.status).toBe('ok');
    expect(sent.map((s) => s.title)).toEqual(['Hi there']);
    os.automation.rules.save({ ...rule, steps: [{ action: 'core.askModel', config: { prompt: 'Say hi' } }, { action: 'core.notify', config: { title: 'never' } }] });
    const no = await os.automation.runManual(os.automation.rules.get(rule.id)!);
    expect(no.status).toBe('error');
    expect(no.steps[0]!.error).toMatch(/no Claude key/);
    expect(sent).toHaveLength(1);
  });

  it('keeps to the brain’s daily budget', async () => {
    const calls: string[] = [];
    os.automation.modelProvider = async () => model('yes', calls);
    os.settings.set('brain', { budget: 100 });
    const r = await os.automation.ask('Anything?', { maxTokens: 400, why: 'test' });
    expect(r).toEqual({ error: 'over today’s budget' });
    expect(calls).toHaveLength(0);
  });
});

describe('manual runs', () => {
  it('a sentence names a manual rule by its phrase or name', async () => {
    const rule = os.automation.rules.save({ name: 'Month close', enabled: true, trigger: { id: 'core.manual', config: { phrase: 'close the month' } }, conditions: [], steps: [{ action: 'core.notify', config: { title: 'Closing: {{vars.said}}' } }] });
    os.automation.rules.save({ name: 'Off one', enabled: false, trigger: { id: 'core.manual', config: {} }, conditions: [], steps: [] });
    expect(os.automation.findManual('Run month close.')?.id).toBe(rule.id);
    expect(os.automation.findManual('run close the month')?.id).toBe(rule.id);
    expect(os.automation.findManual('run off one')).toBeUndefined();
    expect(os.automation.findManual('month close')).toBeUndefined();
    const run = await os.automation.runManual(rule, 'run month close');
    expect(run.about?.manual).toBe(true);
    expect(sent[0]!.title).toBe('Closing: run month close');
    expect(os.automation.rules.get(rule.id)!.runCount).toBe(1);
  });

  it('Every day runs once a day, after its time', async () => {
    os.automation.rules.save({ name: 'Daily', enabled: true, trigger: { id: 'core.schedule.daily', config: { time: '09:00' } }, conditions: [], steps: [{ action: 'core.notify', config: { title: 'Morning' } }] });
    const at = (h: number) => new Date(2026, 10, 2, h, 0).getTime();
    bus.emit('schedule.tick', { at: at(7) });
    await settle();
    expect(sent).toHaveLength(0);
    bus.emit('schedule.tick', { at: at(9) });
    bus.emit('schedule.tick', { at: at(11) });
    await settle();
    expect(sent).toHaveLength(1);
    bus.emit('schedule.tick', { at: at(9) + 86_400_000 });
    await settle();
    expect(sent).toHaveLength(2);
  });
});

describe('undo', () => {
  it('undoes a run last step first, where the action can be, and says what it couldn’t', async () => {
    const rule = os.automation.rules.save({ name: 'Flag', enabled: true, trigger: onTxn, conditions: [], steps: [{ action: 'core.addTag', config: { tag: 'review' } }, { action: 'core.createReminder', config: { title: 'Review {{title}}', inDays: 1 } }, { action: 'core.notify', config: { title: 'Flagged' } }] });
    const t = os.records.create({ object: 'txn', data: { amount: 1, merchant: 'Amazon' } });
    await settle();
    const [run] = os.automation.rules.runs(rule.id);
    expect(os.tags.forEntity(t.id)).toHaveLength(1);
    expect(os.reminders.upcoming(10).map((r) => r.title)).toContain('Review Amazon');
    expect(run!.steps.map((s) => s.canUndo)).toEqual([true, true, false]);
    const r = await os.automation.undoRun(run!.id);
    expect(r).toEqual({ undone: 2, kept: ['Send notification'] });
    expect(os.tags.forEntity(t.id)).toHaveLength(0);
    expect(os.reminders.upcoming(10).map((x) => x.title)).not.toContain('Review Amazon');
    const after = os.automation.rules.run(run!.id)!;
    expect(after.status).toBe('undone');
    expect(after.steps.map((s) => s.status)).toEqual(['undone', 'undone', 'done']);
  });

  it('a tag the record already had is not removed by Undo', async () => {
    const t = os.records.create({ object: 'txn', data: { amount: 1, merchant: 'B' } });
    os.tags.apply(t.id, 'review');
    const rule = os.automation.rules.save({ name: 'Tag', enabled: true, trigger: { id: 'core.manual', config: {} }, conditions: [], steps: [{ action: 'core.addTag', config: { tag: 'review' } }] });
    const run = await os.automation.execute(rule, { entity: t, vars: {} });
    expect(run.steps[0]!.canUndo).toBe(false);
  });
});

describe('rules from before R10', () => {
  it('become steps once, in place, keeping every rule', async () => {
    const now = Date.now();
    os.db.run(`INSERT INTO automation_rules(id,name,enabled,trigger,conditions,actions,run_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, ['old1', 'Old rule', 1, JSON.stringify(onTxn), '[]', JSON.stringify([{ id: 'core.addTag', config: { tag: 'a' } }, { id: 'core.star', config: {} }]), 7, now, now]);
    os.db.run(`INSERT INTO automation_rules(id,name,enabled,trigger,conditions,actions,run_count,created_at,updated_at,deleted_at) VALUES (?,?,?,?,?,?,?,?,?,?)`, ['old2', 'Deleted', 0, JSON.stringify(onTxn), '[]', JSON.stringify([{ id: 'core.star', config: {} }]), 0, now, now, now]);
    os.db.run(`INSERT INTO automation_runs(id,rule_id,status,trigger_payload,log,started_at,finished_at) VALUES (?,?,?,?,?,?,?)`, ['run1', 'old1', 'ok', JSON.stringify({ entity: { id: 'x', title: 'Croma' }, actor: 'user' }), JSON.stringify([{ at: now, level: 'info', msg: 'Add tag: #a' }]), now, now]);
    os.settings.set('automation.stepsV1', false);
    os.automation.start();
    expect(os.settings.get('automation.stepsV1', false)).toBe(true);
    const raw = os.db.all<{ id: string; actions: string }>(`SELECT id, actions FROM automation_rules ORDER BY id`);
    expect(raw.map((r) => JSON.parse(r.actions))).toEqual([
      [{ key: 's1', action: 'core.addTag', config: { tag: 'a' } }, { key: 's2', action: 'core.star', config: {} }],
      [{ key: 's1', action: 'core.star', config: {} }],
    ]);
    const rule = os.automation.rules.get('old1')!;
    expect([rule.name, rule.enabled, rule.runCount]).toEqual(['Old rule', true, 7]);
    const run = os.automation.rules.run('run1')!;
    expect(run.log[0]!.msg).toBe('Add tag: #a');
    expect(run.about).toEqual({ entityId: 'x', title: 'Croma' });
    expect(os.automation.rules.migrateSteps()).toBe(0);
  });

  it('save still takes the old actions shape', () => {
    const r = os.automation.rules.save({ name: 'Old shape', enabled: true, trigger: onTxn, conditions: [], actions: [{ id: 'core.star', config: {} }] });
    expect(r.steps).toEqual([{ key: 's1', action: 'core.star', config: {} }]);
  });

  it('templates come from modules', () => {
    expect(os.automation.templates().map((t) => [t.id, t.module])).toEqual([['test.flag', 'test-money']]);
  });
});
