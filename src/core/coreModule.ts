import { z } from 'zod';
import type { ModuleManifest, TriggerDef, ActionDef, AiToolDef } from './registry/types';
import type { CoreEvents } from './events/bus';
import type { ObjectRecord, FilterClause, FilterGroup, SortSpec } from './domain/types';
import { evaluateCondition } from './automation/conditions';
import type { LifeOSContext } from './registry/context';
import { lifeTools, recordCard, touchesMoneyOrPeople } from './ai/lifeTools';
import { withExtras } from './ai/cards';
import { createAnythingTools, fillDefaults } from './ai/createAnything';
import { graphReadTools } from './graph/read';

/* ------------------------------------------------------------------ */
/* Generic triggers — work for every entity type                       */
/* ------------------------------------------------------------------ */

const entityTypeField = { key: 'entityType', label: 'Record type', type: 'select' as const, description: 'Leave empty for any type' };

const triggers: TriggerDef[] = [
  {
    id: 'core.entity.created', module: 'core', label: 'Record created', event: 'entity.created', configFields: [entityTypeField],
    toContext: (p) => ({ entity: (p as CoreEvents['entity.created']).entity, vars: {} }),
  },
  {
    id: 'core.entity.updated', module: 'core', label: 'Record updated', event: 'entity.updated', configFields: [entityTypeField, { key: 'field', label: 'Only when field changes', type: 'text' }],
    toContext: (p) => {
      const e = p as CoreEvents['entity.updated'];
      return { entity: e.entity, previous: e.previous, changed: e.changed, vars: { changed: e.changed } };
    },
  },
  {
    id: 'core.entity.status', module: 'core', label: 'Status changed', event: 'entity.status', configFields: [entityTypeField, { key: 'toStatus', label: 'To status', type: 'text' }],
    toContext: (p) => {
      const e = p as CoreEvents['entity.status'];
      return { entity: e.entity, vars: { from: e.from, to: e.to } };
    },
  },
  {
    id: 'core.entity.deleted', module: 'core', label: 'Record deleted', event: 'entity.deleted', configFields: [entityTypeField],
    toContext: (p) => ({ entity: (p as CoreEvents['entity.deleted']).entity, vars: {} }),
  },
  {
    id: 'core.tag.applied', module: 'core', label: 'Tag applied', event: 'tag.applied',
    toContext: (p) => {
      const e = p as CoreEvents['tag.applied'];
      return { vars: { entityId: e.entityId, tag: e.tag, tags: [e.tag] } };
    },
  },
  {
    id: 'core.reminder.due', module: 'core', label: 'Reminder due', event: 'reminder.due',
    toContext: (p) => {
      const e = p as CoreEvents['reminder.due'];
      return { vars: { reminder: e.reminder, entityId: e.reminder.entityId, title: e.reminder.title } };
    },
  },
  {
    id: 'core.schedule.daily', module: 'core', label: 'Every day', event: 'schedule.tick', description: 'Once a day, after its time',
    configFields: [{ key: 'time', label: 'After (HH:MM)', type: 'text', placeholder: '08:00', default: '08:00' }],
    toContext: (p) => ({ vars: { at: (p as CoreEvents['schedule.tick']).at } }),
  },
  {
    id: 'core.manual', module: 'core', label: 'Run by hand', description: 'Its button, Run now, or a sentence in Talk ("run month close")',
    configFields: [{ key: 'phrase', label: 'Run it by saying "run …"', type: 'text', placeholder: 'the rule’s name' }],
    toContext: () => null,
  },
];

const OP_WORDS: Record<string, string> = { eq: 'is', neq: 'is not', gt: 'more than', gte: 'at least', lt: 'less than', lte: 'at most', contains: 'contains', isNull: 'empty', notNull: 'not empty' };
const targetOf = (ctx: { entity?: ObjectRecord; vars: Record<string, unknown> }) => ctx.entity?.id ?? (ctx.vars.entityId as string | undefined);

/* ------------------------------------------------------------------ */
/* Generic actions                                                     */
/* ------------------------------------------------------------------ */

const actions: ActionDef[] = [
  {
    id: 'core.setStatus', module: 'core', label: 'Set status', configFields: [{ key: 'status', label: 'Status', type: 'text', required: true }], outputs: ['status'],
    run: async (cfg, ctx, os) => {
      if (!ctx.entity) return 'no record';
      const from = os.records.get(ctx.entity.id)?.status ?? null;
      os.records.setStatus(ctx.entity.id, String(cfg.status), 'automation');
      return { line: `Status ${cfg.status}`, output: { status: String(cfg.status) }, undo: { id: ctx.entity.id, from } };
    },
    undo: (u, os) => {
      const x = u as { id: string; from: string | null };
      os.records.setStatus(x.id, x.from, 'automation');
    },
  },
  {
    id: 'core.addTag', module: 'core', label: 'Add tag', configFields: [{ key: 'tag', label: 'Tag', type: 'text', required: true }], outputs: ['tag'],
    run: async (cfg, ctx, os) => {
      const id = targetOf(ctx);
      if (!id) return 'no record';
      const had = os.tags.forEntity(id).some((t) => t.name.toLowerCase() === String(cfg.tag).replace(/^#/, '').toLowerCase());
      const tag = os.tags.apply(id, String(cfg.tag), 'automation');
      return { line: `Tagged #${tag.name}`, output: { tag: tag.name }, undo: had ? undefined : { id, tagId: tag.id } };
    },
    undo: (u, os) => {
      const x = u as { id: string; tagId: string };
      os.tags.remove(x.id, x.tagId);
    },
  },
  {
    id: 'core.addComment', module: 'core', label: 'Add a fact', configFields: [{ key: 'body', label: 'Fact', type: 'longtext', required: true, description: 'Fills in {{title}}, {{data.amount}}, {{steps.s1.text}}' }], outputs: ['text'],
    run: async (cfg, ctx, os) => {
      const id = targetOf(ctx);
      if (!id) return 'no record';
      const f = os.facts.add({ text: String(cfg.body), subjectId: id, source: 'automation' });
      return { line: `Noted: ${f.text}`, output: { text: f.text }, undo: { factId: f.id } };
    },
    undo: (u, os) => os.facts.forget((u as { factId: string }).factId),
  },
  {
    id: 'core.createReminder', module: 'core', label: 'Create reminder',
    configFields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'inDays', label: 'Due in (days from now)', type: 'number', default: 1 },
      { key: 'atField', label: 'Or relative to a date field', type: 'text', placeholder: 'expiresOn', description: 'data.<field> on the triggering record' },
      { key: 'offsetDays', label: 'Days before that date', type: 'number', default: 0 },
      { key: 'rrule', label: 'Repeat (RRULE)', type: 'text', placeholder: 'FREQ=WEEKLY;INTERVAL=1' },
    ],
    outputs: ['id', 'title', 'dueAt'],
    run: async (cfg, ctx, os) => {
      let dueAt = Date.now() + Number(cfg.inDays ?? 1) * 86400000;
      if (cfg.atField && ctx.entity) {
        const raw = (ctx.entity.data as Record<string, unknown>)[String(cfg.atField)];
        const base = typeof raw === 'number' ? raw : raw ? new Date(String(raw)).getTime() : NaN;
        if (!Number.isNaN(base)) dueAt = base - Number(cfg.offsetDays ?? 0) * 86400000;
      }
      if (dueAt < Date.now()) dueAt = Date.now() + 3600000;
      const r = os.reminders.create({ entityId: ctx.entity?.id ?? null, title: String(cfg.title), dueAt, rrule: cfg.rrule ? String(cfg.rrule) : null }, 'automation');
      return { line: `Reminder: ${r.title}`, output: { id: r.id, title: r.title, dueAt: new Date(dueAt).toISOString().slice(0, 10) }, undo: { id: r.id } };
    },
    undo: (u, os) => os.reminders.remove((u as { id: string }).id),
  },
  {
    id: 'core.notify', module: 'core', label: 'Send notification',
    configFields: [{ key: 'title', label: 'Title', type: 'text', required: true }, { key: 'body', label: 'Body', type: 'longtext' }],
    outputs: ['title'],
    run: async (cfg, ctx, os) => {
      await os.notify({ title: String(cfg.title), body: cfg.body ? String(cfg.body) : undefined, data: { entityId: ctx.entity?.id } });
      return { line: `Notified: ${cfg.title}`, output: { title: String(cfg.title) } };
    },
  },
  {
    id: 'core.createEntity', module: 'core', label: 'Create record',
    configFields: [
      { key: 'entityType', label: 'Type', type: 'text', required: true },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'data', label: 'Fields (JSON, supports templates)', type: 'longtext' },
      { key: 'linkKind', label: 'Link to triggering record as', type: 'text', placeholder: 'related' },
    ],
    outputs: ['id', 'title'],
    run: async (cfg, ctx, os) => {
      let data: Record<string, unknown> = {};
      if (typeof cfg.data === 'string' && cfg.data.trim()) data = JSON.parse(cfg.data);
      else if (cfg.data && typeof cfg.data === 'object') data = cfg.data as Record<string, unknown>;
      const e = os.records.create({ object: String(cfg.entityType), title: cfg.title ? String(cfg.title) : undefined, data }, 'automation');
      if (ctx.entity && cfg.linkKind) os.links.link(e.id, ctx.entity.id, String(cfg.linkKind), {}, 'automation');
      return { line: `Made ${e.title}`, output: { id: e.id, title: e.title }, undo: { id: e.id } };
    },
    undo: (u, os) => os.records.delete((u as { id: string }).id, 'automation'),
  },
  {
    id: 'core.star', module: 'core', label: 'Star record',
    run: async (_cfg, ctx, os) => {
      if (!ctx.entity) return 'no record';
      const was = !!os.records.get(ctx.entity.id)?.starred;
      os.records.update(ctx.entity.id, { starred: true }, 'automation');
      return { line: 'Starred', undo: was ? undefined : { id: ctx.entity.id } };
    },
    undo: (u, os) => void os.records.update((u as { id: string }).id, { starred: false }, 'automation'),
  },
  {
    id: 'core.continueIf', module: 'core', label: 'Continue only if', description: 'Ends the run quietly when it doesn’t hold',
    configFields: [
      { key: 'field', label: 'Field', type: 'text', required: true, placeholder: 'steps.s1.count', description: 'title, data.<key>, vars.<name>, steps.<key>.<output>' },
      { key: 'op', label: 'Is', type: 'select', default: 'notNull', options: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'isNull', 'notNull'].map((v) => ({ value: v, label: OP_WORDS[v] ?? v })) },
      { key: 'value', label: 'Value', type: 'text' },
    ],
    run: async (cfg, ctx) => {
      const c = { field: String(cfg.field ?? ''), op: String(cfg.op || 'notNull'), value: cfg.value } as FilterClause;
      const ok = evaluateCondition(c, ctx);
      return ok ? { line: `${c.field} ${OP_WORDS[c.op] ?? c.op} ${c.value ?? ''}`.trim() } : { line: `Stopped: ${c.field} is not ${OP_WORDS[c.op] ?? c.op} ${c.value ?? ''}`.trim(), stop: true };
    },
  },
  {
    id: 'core.askModel', module: 'core', label: 'Ask Claude', description: 'Sends only this prompt, filled in; counts against the brain’s daily budget',
    configFields: [
      { key: 'prompt', label: 'Prompt', type: 'longtext', required: true, description: 'Fills in {{title}}, {{data.amount}}, {{steps.s1.title}}' },
      { key: 'maxTokens', label: 'Longest answer (tokens)', type: 'number', default: 400 },
      { key: 'fallback', label: 'If Claude can’t be asked, use', type: 'longtext', description: 'Leave empty to stop the run instead' },
    ],
    outputs: ['text'],
    run: async (cfg, _ctx, os) => {
      const r = await os.automation.ask(String(cfg.prompt ?? ''), { maxTokens: Number(cfg.maxTokens) || 400, why: 'automation step' });
      if ('text' in r) return { line: r.text, output: { text: r.text, asked: true } };
      const fb = String(cfg.fallback ?? '').trim();
      if (!fb) throw new Error(`Claude not asked: ${r.error}`);
      return { line: `Claude not asked (${r.error}): ${fb}`, output: { text: fb, asked: false } };
    },
  },
];


/* ------------------------------------------------------------------ */
/* AI tools — the data-access layer Claude uses                        */
/* ------------------------------------------------------------------ */

const filterSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    and: z.array(z.union([clauseSchema, filterSchema])).optional(),
    or: z.array(z.union([clauseSchema, filterSchema])).optional(),
  }),
);
const clauseSchema = z.object({
  field: z.string().describe('Envelope field (title,status,occurredAt,createdAt) or data.<key>'),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'in', 'notIn', 'isNull', 'notNull', 'between', 'hasTag', 'relatedTo']),
  value: z.unknown().optional(),
});
const sortSchema: z.ZodType<SortSpec> = z.object({ field: z.string(), dir: z.enum(['asc', 'desc']) });

function slim(e: ObjectRecord, os: LifeOSContext) {
  const tags = os.tags.forEntity(e.id).map((t) => t.name);
  const rels = os.links.forEntity(e.id).slice(0, 12).map((r) => ({ kind: r.relation.kind, direction: r.direction, id: r.other.id, type: r.other.object, title: r.other.title }));
  return { id: e.id, type: e.object, title: e.title, subtitle: e.subtitle, status: e.status, starred: e.starred, occurredAt: e.occurredAt ? new Date(e.occurredAt).toISOString() : null, data: e.data, tags, relations: rels, updatedAt: new Date(e.updatedAt).toISOString() };
}

const aiTools: AiToolDef[] = [
  ...lifeTools,
  ...createAnythingTools,
  ...graphReadTools,
  {
    name: 'list_entity_types',
    description: 'List every record type in LifeOS with its fields, statuses and relation kinds. Call this first when unsure how data is shaped.',
    input: z.object({ module: z.string().optional() }),
    run: async (input, os) => {
      const { module } = input as { module?: string };
      return [...os.registry.objects.values()]
        .filter((t) => !module || t.module === module)
        .map((t) => ({ type: t.id, module: t.module, label: t.label, fields: t.fields.map((f) => ({ key: f.key, type: f.type, label: f.label, options: f.options?.map((o) => o.value), linkTo: f.linkTo, linkWord: f.linkWord })), statuses: t.statuses?.map((s) => s.value), relations: t.links, count: os.records.count(t.id) }));
    },
  },
  {
    name: 'search',
    description: 'Full-text search across all records. Use for "find X" questions before querying by filter.',
    input: z.object({ query: z.string(), types: z.array(z.string()).optional(), limit: z.number().optional() }),
    run: async (input, os) => {
      const i = input as { query: string; types?: string[]; limit?: number };
      return os.records.search.search(i.query, { types: i.types, limit: i.limit ?? 20 });
    },
  },
  {
    name: 'query_entities',
    description: 'Query records of a type with structured filters, sort and limit. Dates are epoch milliseconds. Returns full records with tags and relations.',
    input: z.object({ type: z.string(), filter: filterSchema.optional(), sort: z.array(sortSchema).optional(), limit: z.number().max(100).optional(), includeArchived: z.boolean().optional() }),
    run: async (input, os) => {
      const i = input as { type: string; filter?: FilterGroup; sort?: SortSpec[]; limit?: number; includeArchived?: boolean };
      return os.records.query(i.type, { filter: i.filter, sort: i.sort, includeArchived: i.includeArchived }, { limit: i.limit ?? 25 }).map((e) => slim(e, os));
    },
  },
  {
    name: 'aggregate',
    description: 'Sum/avg/count numeric data fields over records matching a filter, optionally grouped by a field (e.g. sum data.amount of transactions grouped by data.category) or bucketed by time (day/week/month).',
    input: z.object({ type: z.string(), filter: filterSchema.optional(), sum: z.array(z.string()).optional(), avg: z.array(z.string()).optional(), groupBy: z.string().optional(), bucket: z.enum(['day', 'week', 'month']).optional(), timeField: z.string().optional() }),
    run: async (input, os) => {
      const i = input as { type: string; filter?: FilterGroup; sum?: string[]; avg?: string[]; groupBy?: string; bucket?: 'day' | 'week' | 'month'; timeField?: string };
      if (i.bucket) return os.records.series(i.type, { filter: i.filter }, i.bucket, i.sum?.[0], i.timeField ?? 'occurredAt');
      if (i.groupBy) return os.records.groupBy(i.type, { filter: i.filter }, i.groupBy, { sum: i.sum, avg: i.avg, count: true });
      return os.records.aggregate(i.type, { filter: i.filter }, { sum: i.sum, avg: i.avg, count: true });
    },
  },
  {
    name: 'get_entity',
    description: 'Fetch one record by id including tags, links, recent timeline, facts about it and reminders.',
    input: z.object({ id: z.string() }),
    run: async (input, os) => {
      const e = os.records.get((input as { id: string }).id);
      if (!e) return { error: 'not found' };
      return { ...slim(e, os), timeline: os.records.timeline.forEntity(e.id, 15).map((t) => ({ at: new Date(t.occurredAt).toISOString(), kind: t.kind, title: t.title, body: t.body })), facts: os.facts.list({ subjectId: e.id, limit: 30 }).map((f) => ({ at: new Date(f.statedAt).toISOString(), source: f.source, text: f.text })), reminders: os.reminders.forEntity(e.id).map((r) => ({ id: r.id, title: r.title, nextAt: r.nextAt ? new Date(r.nextAt).toISOString() : null, done: !!r.doneAt })) };
    },
  },
  {
    name: 'create_entity',
    description: 'Create a record of any type. Send what you know in `data` (field keys from the type list); missing required fields get sensible defaults and "32k" / "2 years" / "today" are understood. Optionally tag and link it to other records in the same call.',
    input: z.object({ type: z.string(), title: z.string().optional(), data: z.record(z.string(), z.unknown()), status: z.string().optional(), tags: z.array(z.string()).optional(), links: z.array(z.object({ toId: z.string(), kind: z.string() })).optional() }),
    confirm: (i: { type: string }, os) => touchesMoneyOrPeople(os, i.type),
    describe: (i: { type: string; title?: string; data: Record<string, unknown> }, os) => {
      const label = os.registry.objects.get(i.type)?.label ?? i.type;
      const amt = typeof i.data?.amount === 'number' ? ` · ${os.format.currency(i.data.amount as number)}` : '';
      return `Add ${label.toLowerCase()}: ${i.title ?? (i.data?.merchant as string) ?? (i.data?.name as string) ?? ''}${amt}`.trim();
    },
    run: async (input, os) => {
      const i = input as { type: string; title?: string; data: Record<string, unknown>; status?: string; tags?: string[]; links?: Array<{ toId: string; kind: string }> };
      const def = os.registry.objects.get(i.type);
      if (!def) return { error: `unknown record type ${i.type}` };
      const e = os.records.create({ object: i.type, title: i.title, data: fillDefaults(def, i.data ?? {}, i.title), status: i.status }, 'assistant');
      for (const t of i.tags ?? []) os.tags.apply(e.id, t, 'assistant');
      for (const l of i.links ?? []) os.links.link(e.id, l.toId, l.kind, {}, 'assistant');
      const saved = os.records.get(e.id)!;
      return withExtras(slim(saved, os), { undo: () => os.records.delete(e.id, 'user'), card: recordCard(os, saved) });
    },
  },
  {
    name: 'update_entity',
    description: 'Update fields, title, status, star or archive on an existing record. Only send the fields that change.',
    input: z.object({ id: z.string(), title: z.string().optional(), data: z.record(z.string(), z.unknown()).optional(), status: z.string().nullable().optional(), starred: z.boolean().optional(), archived: z.boolean().optional(), addTags: z.array(z.string()).optional() }),
    confirm: (i: { id: string }, os) => touchesMoneyOrPeople(os, os.records.get(i.id)?.object),
    describe: (i: { id: string; data?: Record<string, unknown> }, os) => `Change ${os.records.get(i.id)?.title ?? 'record'}${i.data ? `: ${Object.entries(i.data).map(([k, v]) => `${k} → ${String(v)}`).join(', ')}` : ''}`,
    run: async (input, os) => {
      const i = input as { id: string; title?: string; data?: Record<string, unknown>; status?: string | null; starred?: boolean; archived?: boolean; addTags?: string[] };
      const before = os.records.get(i.id);
      if (!before) return { error: 'not found' };
      const hadTags = new Set(os.tags.forEntity(i.id).map((t) => t.name));
      const e = os.records.update(i.id, { title: i.title, data: i.data, status: i.status, starred: i.starred, archived: i.archived }, 'assistant');
      for (const t of i.addTags ?? []) os.tags.apply(e.id, t, 'assistant');
      const saved = os.records.get(e.id)!;
      const undo = () => {
        os.records.update(before.id, { title: before.title, data: before.data as Record<string, unknown>, status: before.status, starred: before.starred, archived: before.archived }, 'user');
        for (const t of os.tags.forEntity(before.id)) if (!hadTags.has(t.name)) os.tags.remove(before.id, t.id);
      };
      return withExtras(slim(saved, os), { undo, card: recordCard(os, saved) });
    },
  },
  {
    name: 'delete_entity',
    description: 'Soft-delete a record (recoverable).',
    input: z.object({ id: z.string() }),
    confirm: (i: { id: string }, os) => touchesMoneyOrPeople(os, os.records.get(i.id)?.object),
    describe: (i: { id: string }, os) => `Delete ${os.records.get(i.id)?.title ?? 'record'} (you can restore it)`,
    run: async (input, os) => {
      const id = (input as { id: string }).id;
      const title = os.records.get(id)?.title;
      os.records.delete(id, 'assistant');
      return withExtras({ ok: true, deleted: title }, { undo: () => os.records.restore(id) });
    },
  },
  {
    name: 'link_entities',
    description: 'Create a typed relationship between two records (e.g. transaction → trip with kind "trip").',
    input: z.object({ fromId: z.string(), toId: z.string(), kind: z.string() }),
    run: async (input, os) => {
      const i = input as { fromId: string; toId: string; kind: string };
      const rel = os.links.link(i.fromId, i.toId, i.kind, {}, 'assistant');
      return withExtras({ ...rel }, { undo: () => os.links.unlink(i.fromId, i.toId, i.kind, 'user') });
    },
  },
  {
    name: 'add_comment',
    description: 'Add a fact about a record (one line, shown on its page).',
    input: z.object({ id: z.string(), body: z.string() }),
    run: async (input, os) => {
      const i = input as { id: string; body: string };
      return os.facts.add({ text: i.body, subjectId: i.id, source: 'talk' });
    },
  },
  {
    name: 'create_reminder',
    description: 'Create a reminder, optionally attached to a record and recurring (RRULE like FREQ=WEEKLY;INTERVAL=1;BYDAY=MO).',
    input: z.object({ title: z.string(), dueAt: z.string().describe('ISO datetime'), entityId: z.string().optional(), rrule: z.string().optional(), body: z.string().optional() }),
    run: async (input, os) => {
      const i = input as { title: string; dueAt: string; entityId?: string; rrule?: string; body?: string };
      const r = os.reminders.create({ title: i.title, dueAt: new Date(i.dueAt).getTime(), entityId: i.entityId, rrule: i.rrule, body: i.body }, 'assistant');
      return withExtras({ ...r }, { undo: () => os.reminders.remove(r.id) });
    },
  },
  {
    name: 'list_reminders',
    description: 'Upcoming (not done) reminders sorted by due time.',
    input: z.object({ limit: z.number().optional() }),
    run: async (input, os) => os.reminders.upcoming((input as { limit?: number }).limit ?? 20).map((r) => ({ id: r.id, title: r.title, nextAt: new Date(r.nextAt ?? r.dueAt).toISOString(), entityId: r.entityId, recurring: !!r.rrule })),
  },
  {
    name: 'recent_activity',
    description: 'Most recent timeline events across all records — what the user has been doing.',
    input: z.object({ limit: z.number().optional() }),
    run: async (input, os) => os.records.timeline.recent((input as { limit?: number }).limit ?? 30).map((t) => ({ at: new Date(t.occurredAt).toISOString(), entity: t.entityTitle, type: t.entityType, entityId: t.entityId, event: t.title, body: t.body })),
  },
  {
    name: 'create_automation',
    description: 'Create an automation rule; its actions run in order as steps s1, s2…, and a later step\'s text can use an earlier one\'s output as {{steps.s1.title}} (and the record as {{title}}, {{data.amount}}). Triggers: core.entity.created, core.entity.updated, core.entity.status, core.tag.applied, core.reminder.due, core.schedule.daily (config time HH:MM), core.manual (run by hand; config phrase) plus module triggers. Actions: core.setStatus, core.addTag, core.addComment, core.createReminder, core.notify, core.createEntity, core.continueIf (field, op, value: ends the run when false), core.askModel (prompt, fallback: output text) plus module actions.',
    input: z.object({ name: z.string(), trigger: z.object({ id: z.string(), config: z.record(z.string(), z.unknown()).default({}) }), conditions: z.array(clauseSchema).default([]), actions: z.array(z.object({ id: z.string(), config: z.record(z.string(), z.unknown()).default({}) })) }),
    confirm: true,
    run: async (input, os) => {
      const i = input as { name: string; trigger: { id: string; config: Record<string, unknown> }; conditions: never[]; actions: Array<{ id: string; config: Record<string, unknown> }> };
      for (const a of i.actions) if (!os.registry.actions.has(a.id)) return { error: `Unknown action ${a.id}` };
      if (!os.registry.triggers.has(i.trigger.id)) return { error: `Unknown trigger ${i.trigger.id}` };
      return os.automation.rules.save({ name: i.name, enabled: true, trigger: i.trigger, conditions: i.conditions, actions: i.actions });
    },
  },
];

export const coreModule: ModuleManifest = {
  id: 'core',
  name: 'Core',
  version: '1.0.0',
  description: 'ObjectRecord system, relationships, timeline, reminders, tags, search, automation primitives.',
  icon: 'cube',
  color: '#8E8E93',
  triggers,
  actions,
  aiTools,
};
