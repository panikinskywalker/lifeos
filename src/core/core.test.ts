import { z } from 'zod';
import { createBetterSqliteAdapter } from './db/betterSqliteAdapter';
import { createLifeOS } from './lifeos';
import { Registry } from './registry/registry';
import type { ModuleManifest } from './registry/types';
import type { LifeOSContext } from './registry/context';
import { bus } from './events/bus';
import { nextOccurrence, describeRRule } from './automation/recurrence';
import { Assistant } from './ai/assistant';
import type { LLMProvider } from './ai/provider';

const testModule: ModuleManifest = {
  id: 'test-finance',
  name: 'Test Finance',
  version: '1.0.0',
  description: 'test',
  icon: 'x',
  color: '#000',
  objects: [
    {
      id: 'txn',
      module: 'test-finance',
      label: 'Transaction',
      labelPlural: 'Transactions',
      icon: 'x',
      schema: z.object({ amount: z.number(), category: z.string().default('other'), merchant: z.string().optional(), date: z.string() }),
      fields: [
        { key: 'amount', label: 'Amount', type: 'currency' },
        { key: 'category', label: 'Category', type: 'select', options: [{ value: 'food', label: 'Food' }, { value: 'travel', label: 'Travel' }] },
        { key: 'merchant', label: 'Merchant', type: 'text' },
        { key: 'date', label: 'Date', type: 'date' },
      ],
      indexed: ['category'],
      occurredAtField: 'date',
      computeTitle: (d) => d.merchant ?? 'Transaction',
      statuses: [{ value: 'pending', label: 'Pending' }, { value: 'cleared', label: 'Cleared' }],
      defaultViews: [{ name: 'Food', definition: { filter: { and: [{ field: 'data.category', op: 'eq', value: 'food' }] } } }],
    },
    {
      id: 'trip',
      module: 'test-finance',
      label: 'Trip',
      labelPlural: 'Trips',
      icon: 'x',
      schema: z.object({ destination: z.string() }),
      fields: [{ key: 'destination', label: 'Destination', type: 'text' }],
      computeTitle: (d) => `Trip to ${d.destination}`,
    },
  ],
  triggers: [],
  actions: [
    {
      id: 'test.flag', module: 'test-finance', label: 'Flag',
      run: async (cfg, ctx, os) => {
        if (ctx.entity) os.tags.apply(ctx.entity.id, String(cfg.tag ?? 'flagged'), 'automation');
      },
    },
  ],
};

let os: LifeOSContext;

beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [testModule], registry: new Registry() });
});
afterEach(() => os.db.close());

describe('entity store', () => {
  it('creates, derives title, indexes for search, writes timeline + change log', () => {
    const t = os.records.create({ object: 'txn', data: { amount: 450, category: 'food', merchant: 'Blue Tokai', date: '2026-09-01' } });
    expect(t.title).toBe('Blue Tokai');
    expect(t.status).toBe('pending');
    expect(t.occurredAt).toBe(new Date('2026-09-01').getTime());
    expect(os.records.timeline.forEntity(t.id)[0].kind).toBe('created');
    expect(os.records.search.search('blue')[0].id).toBe(t.id);
    expect(os.db.get<{ n: number }>(`SELECT COUNT(*) n FROM changes`)?.n).toBe(1);
  });

  it('validates data against the schema', () => {
    expect(() => os.records.create({ object: 'txn', data: { amount: 'lots', date: 'x' } })).toThrow();
  });

  it('updates with diff, version bump and status timeline', () => {
    const t = os.records.create({ object: 'txn', data: { amount: 10, date: '2026-09-01', merchant: 'A' } });
    const u = os.records.update(t.id, { data: { amount: 20 }, status: 'cleared' });
    expect(u.version).toBe(2);
    expect(u.data.amount).toBe(20);
    const tl = os.records.timeline.forEntity(t.id);
    expect(tl.some((e) => e.kind === 'status')).toBe(true);
    const same = os.records.update(t.id, { data: { amount: 20 } });
    expect(same.version).toBe(2); // no-op update doesn't bump
  });

  it('queries with the universal filter DSL, sorts and aggregates', () => {
    for (const [amt, cat, d] of [[100, 'food', '2026-09-01'], [200, 'food', '2026-09-02'], [900, 'travel', '2026-08-15']] as const) {
      os.records.create({ object: 'txn', data: { amount: amt, category: cat, date: d } });
    }
    const food = os.records.query('txn', { filter: { and: [{ field: 'data.category', op: 'eq', value: 'food' }] }, sort: [{ field: 'data.amount', dir: 'desc' }] });
    expect(food.map((e) => e.data.amount)).toEqual([200, 100]);
    const agg = os.records.aggregate('txn', { filter: { and: [{ field: 'data.amount', op: 'gte', value: 150 }] } }, { sum: ['data.amount'], count: true });
    expect(agg['sum_data.amount']).toBe(1100);
    expect(agg.count).toBe(2);
    const grouped = os.records.groupBy('txn', {}, 'data.category', { sum: ['data.amount'] });
    expect(grouped.find((g) => g.key === 'travel')?.values['sum_data.amount']).toBe(900);
    const series = os.records.series('txn', {}, 'month', 'data.amount');
    expect(series.map((s) => s.bucket)).toEqual(['2026-08', '2026-09']);
    expect(series[1].sum).toBe(300);
  });

  it('soft deletes and hides from queries and search', () => {
    const t = os.records.create({ object: 'txn', data: { amount: 1, date: '2026-01-01', merchant: 'Gone' } });
    os.records.delete(t.id);
    expect(os.records.get(t.id)).toBeUndefined();
    expect(os.records.search.search('gone')).toHaveLength(0);
    os.records.restore(t.id);
    expect(os.records.get(t.id)).toBeDefined();
  });

  it('restore undoes a delete: record, its links, search, change log and an event', () => {
    const t = os.records.create({ object: 'txn', data: { amount: 900, date: '2026-09-01', merchant: 'Houseboat' } });
    const trip = os.records.create({ object: 'trip', data: { destination: 'Alleppey' } });
    const other = os.records.create({ object: 'trip', data: { destination: 'Goa' } });
    os.links.link(t.id, trip.id, 'trip');
    os.links.link(t.id, other.id, 'related');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-23T09:00:00Z'));
    os.links.unlink(t.id, other.id, 'related'); // removed by hand earlier: must stay removed
    vi.setSystemTime(new Date('2026-09-23T09:05:00Z'));
    os.records.delete(t.id);
    vi.useRealTimers();
    expect(os.links.forEntity(trip.id)).toHaveLength(0);

    const seen: string[] = [];
    const off = bus.on('entity.restored', ({ entity }) => void seen.push(entity.id));
    os.records.restore(t.id);
    off();

    expect(seen).toEqual([t.id]);
    expect(os.links.forEntity(t.id).map((r) => r.other.id)).toEqual([trip.id]);
    expect(os.records.search.search('houseboat').map((h) => h.id)).toEqual([t.id]);
    const last = os.db.get<{ op: string; row_id: string }>(`SELECT op, row_id FROM changes WHERE tbl = 'entities' ORDER BY seq DESC LIMIT 1`);
    expect(last).toEqual({ op: 'update', row_id: t.id });
    os.records.restore(t.id); // restoring a live record is a no-op
    expect(seen).toEqual([t.id]);
  });

  it('seeds default views on install', () => {
    expect(os.views.forType('txn').map((v) => v.name)).toContain('Food');
  });
});

describe('live-query events', () => {
  it('every stored change emits an event, so live screens refresh', () => {
    const e = os.records.create({ object: 'txn', data: { amount: 1, date: '2026-09-01', merchant: 'Chai' } });
    const events: string[] = [];
    const off = bus.onAny((name) => void events.push(name));
    const emits = (label: string, fn: () => void) => {
      const before = events.length;
      fn();
      expect(events.length, label).toBeGreaterThan(before);
    };
    os.tags.apply(e.id, 'snack');
    emits('tag removed', () => os.tags.set(e.id, []));
    const c = os.comments.add(e.id, 'ok');
    emits('comment removed', () => os.comments.remove(c.id));
    const a = os.attachments.add({ entityId: e.id, name: 'r.jpg', mime: 'image/jpeg', size: 1, uri: 'file://r.jpg', kind: 'receipt' });
    emits('attachment removed', () => os.attachments.remove(a.id));
    const r = os.reminders.create({ entityId: e.id, title: 'x', dueAt: Date.now() + 1000 });
    emits('reminder snoozed', () => os.reminders.snooze(r.id, Date.now() + 5000));
    emits('reminder removed', () => os.reminders.remove(r.id));
    let fieldId = '';
    emits('custom field added', () => void (fieldId = os.customFields.add({ entityType: 'txn', key: 'vendor', label: 'Vendor', fieldType: 'text', options: {} }).id));
    emits('custom field removed', () => os.customFields.remove(fieldId));
    let viewId = '';
    emits('view saved', () => void (viewId = os.views.save('txn', { name: 'Chai', definition: {} }).id));
    emits('view removed', () => os.views.remove(viewId));
    let dashId = '';
    off();
  });
});

describe('relations, tags, comments, attachments', () => {
  it('links bidirectionally and filters by relatedTo', () => {
    const trip = os.records.create({ object: 'trip', data: { destination: 'Tokyo' } });
    const t1 = os.records.create({ object: 'txn', data: { amount: 5000, date: '2026-12-20', merchant: 'JR Pass' } });
    os.records.create({ object: 'txn', data: { amount: 50, date: '2026-12-20', merchant: 'Chai' } });
    os.links.link(t1.id, trip.id, 'trip');
    expect(os.links.forEntity(trip.id)[0].other.title).toBe('JR Pass');
    const inTrip = os.records.query('txn', { filter: { and: [{ field: 'relation.trip', op: 'relatedTo', value: trip.id }] } });
    expect(inTrip).toHaveLength(1);
    os.links.unlink(t1.id, trip.id);
    expect(os.links.forEntity(trip.id)).toHaveLength(0);
  });

  it('tags are case-insensitive and filterable', () => {
    const t = os.records.create({ object: 'txn', data: { amount: 1, date: '2026-01-01' } });
    os.tags.apply(t.id, 'Work');
    os.tags.apply(t.id, 'work');
    expect(os.tags.forEntity(t.id)).toHaveLength(1);
    expect(os.records.query('txn', { filter: { and: [{ field: 'tag', op: 'hasTag', value: 'WORK' }] } })).toHaveLength(1);
    os.tags.set(t.id, ['home']);
    expect(os.tags.forEntity(t.id).map((x) => x.name)).toEqual(['home']);
  });

  it('comments and attachments land on the timeline', () => {
    const t = os.records.create({ object: 'txn', data: { amount: 1, date: '2026-01-01' } });
    os.comments.add(t.id, 'Reimbursed by office');
    os.attachments.add({ entityId: t.id, name: 'receipt.jpg', uri: 'file:///x', kind: 'receipt' });
    const kinds = os.records.timeline.forEntity(t.id).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['comment', 'attachment', 'created']));
  });

  it('a record has at most one cover photo; replacing keeps the old one recoverable', () => {
    const t = os.records.create({ object: 'txn', data: { amount: 1, date: '2026-01-01' } });
    expect(os.attachments.cover(t.id)).toBeNull();
    const first = os.attachments.setCover({ entityId: t.id, name: 'a.jpg', mime: 'image/jpeg', uri: 'file:///a' });
    const second = os.attachments.setCover({ entityId: t.id, name: 'b.jpg', mime: 'image/jpeg', uri: 'file:///b' });
    expect(os.attachments.cover(t.id)?.id).toBe(second.id);
    expect(os.attachments.forEntity(t.id).filter((a) => a.kind === 'cover').map((a) => a.id)).toEqual([second.id]);
    expect(os.db.get<{ n: number }>('SELECT COUNT(*) n FROM attachments WHERE id=? AND deleted_at IS NOT NULL', [first.id])?.n).toBe(1);
    os.attachments.remove(second.id);
    expect(os.attachments.cover(t.id)).toBeNull();
  });
});

describe('reminders + recurrence', () => {
  it('rolls recurring reminders forward on complete', () => {
    const r = os.reminders.create({ title: 'Pay rent', dueAt: new Date('2026-09-01T09:00').getTime(), rrule: 'FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=1' });
    const done = os.reminders.complete(r.id)!;
    expect(done.doneAt).toBeNull();
    expect(new Date(done.nextAt!).getDate()).toBe(1);
    expect(done.nextAt!).toBeGreaterThan(Date.now());
  });
  it('computes next occurrences', () => {
    const mon = new Date('2026-09-14T09:00'); // Monday
    const n = nextOccurrence('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE', mon.getTime(), mon.getTime());
    expect(new Date(n).getDay()).toBe(3);
    expect(describeRRule('FREQ=WEEKLY;INTERVAL=2')).toBe('Every 2 weeks');
  });
});

describe('automation', () => {
  it('runs trigger → condition → action on entity.created', async () => {
    os.automation.rules.save({
      name: 'Flag big spends', enabled: true,
      trigger: { id: 'core.entity.created', config: { entityType: 'txn' } },
      conditions: [{ field: 'data.amount', op: 'gt', value: 1000 }],
      actions: [{ id: 'test.flag', config: { tag: 'big' } }, { id: 'core.addComment', config: { body: '{{title}} was {{data.amount}}' } }],
    });
    const small = os.records.create({ object: 'txn', data: { amount: 10, date: '2026-01-01', merchant: 'S' } });
    const big = os.records.create({ object: 'txn', data: { amount: 5000, date: '2026-01-01', merchant: 'Flight' } });
    await new Promise((r) => setTimeout(r, 20));
    expect(os.tags.forEntity(small.id)).toHaveLength(0);
    expect(os.tags.forEntity(big.id).map((t) => t.name)).toEqual(['big']);
    expect(os.comments.forEntity(big.id)[0].body).toBe('Flight was 5000');
    const runs = os.automation.rules.runs();
    expect(runs.map((r) => r.status).sort()).toEqual(['ok', 'skipped']);
  });

  it('scheduler runs due jobs and rolls recurring ones', async () => {
    let ran = 0;
    os.scheduler.registerHandler('ping', () => void ran++);
    os.scheduler.schedule({ kind: 'ping', at: Date.now() - 1000, rrule: 'FREQ=DAILY;INTERVAL=1' });
    os.scheduler.schedule({ kind: 'ping', at: Date.now() + 1e9 });
    await os.scheduler.tick();
    expect(ran).toBe(1);
    const job = os.scheduler.all().find((j) => j.kind === 'ping' && j.rrule)!;
    expect(job.nextAt).toBeGreaterThan(Date.now());
  });
});

describe('assistant tool loop', () => {
  it('executes tool calls against the repos and returns text', async () => {
    let round = 0;
    const provider: LLMProvider = {
      id: 'fake',
      async complete() {
        round++;
        if (round === 1) return { content: [{ type: 'tool_use', id: 'c1', name: 'create_entity', input: { type: 'txn', data: { amount: 120, category: 'food', merchant: 'Cafe', date: '2026-09-13' }, tags: ['coffee'] } }], stopReason: 'tool_use' };
        if (round === 2) return { content: [{ type: 'tool_use', id: 'c2', name: 'aggregate', input: { type: 'txn', sum: ['data.amount'] } }], stopReason: 'tool_use' };
        return { content: [{ type: 'text', text: 'Added Cafe for ₹120. Total spend is ₹120.' }], stopReason: 'end_turn' };
      },
    };
    const a = new Assistant(os, { provider, confirm: async () => true });
    const turns = await a.send('add 120 at Cafe for coffee');
    expect(os.records.query('txn')).toHaveLength(1);
    expect(os.tags.forEntity(os.records.query('txn')[0].id)[0].name).toBe('coffee');
    expect(turns.at(-1)?.text).toContain('Total spend');
    const spec = a.tools().find((t) => t.name === 'query_entities')!;
    expect(spec).toBeDefined();
  });
});

describe('nested transactions', () => {
  it('rolls back everything inside an outer transaction on failure', () => {
    expect(() =>
      os.db.transaction(() => {
        os.records.create({ object: 'trip', data: { destination: 'A' } });
        os.records.create({ object: 'trip', data: { destination: 'B' } });
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(os.records.count('trip')).toBe(0);
    os.db.transaction(() => {
      os.records.create({ object: 'trip', data: { destination: 'C' } });
    });
    expect(os.records.count('trip')).toBe(1);
  });
});

describe('groups', () => {
  it('members follow setMembers; leavers can rejoin; shares persist', () => {
    const g = 'group-1';
    os.groups.setMembers(g, ['priya', 'arjun'], { arjun: 2 });
    expect(os.groups.members(g)).toEqual([{ memberId: 'priya', defaultShare: 1 }, { memberId: 'arjun', defaultShare: 2 }]);
    os.groups.setMembers(g, ['arjun']);
    expect(os.groups.members(g).map((m) => m.memberId)).toEqual(['arjun']);
    expect(os.groups.groupsOf('priya')).toEqual([]);
    os.groups.setMembers(g, ['arjun', 'priya']);
    expect(os.groups.groupsOf('priya')).toEqual([g]);
    expect(os.groups.members(g).find((m) => m.memberId === 'arjun')!.defaultShare).toBe(2);
  });
});
