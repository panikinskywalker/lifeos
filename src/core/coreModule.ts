import { z } from 'zod';
import type { ModuleManifest, TriggerDef, ActionDef, AiToolDef } from './registry/types';
import type { CoreEvents } from './events/bus';
import type { Entity, FilterGroup, SortSpec } from './domain/types';
import type { LifeOSContext } from './registry/context';
import { lifeTools, recordCard, touchesMoneyOrPeople } from './ai/lifeTools';
import { withExtras } from './ai/cards';
import { createAnythingTools, fillDefaults } from './ai/createAnything';

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
    id: 'core.schedule.daily', module: 'core', label: 'Every day (scheduler tick)', event: 'schedule.tick',
    toContext: (p) => ({ vars: { at: (p as CoreEvents['schedule.tick']).at } }),
  },
];

/* ------------------------------------------------------------------ */
/* Generic actions                                                     */
/* ------------------------------------------------------------------ */

const actions: ActionDef[] = [
  {
    id: 'core.setStatus', module: 'core', label: 'Set status', configFields: [{ key: 'status', label: 'Status', type: 'text', required: true }],
    run: async (cfg, ctx, os) => {
      if (!ctx.entity) return 'no entity';
      os.entities.setStatus(ctx.entity.id, String(cfg.status), 'automation');
      return `status=${cfg.status}`;
    },
  },
  {
    id: 'core.addTag', module: 'core', label: 'Add tag', configFields: [{ key: 'tag', label: 'Tag', type: 'text', required: true }],
    run: async (cfg, ctx, os) => {
      const id = ctx.entity?.id ?? (ctx.vars.entityId as string | undefined);
      if (!id) return 'no entity';
      os.tags.apply(id, String(cfg.tag), 'automation');
      return `#${cfg.tag}`;
    },
  },
  {
    id: 'core.addComment', module: 'core', label: 'Add comment', configFields: [{ key: 'body', label: 'Comment (supports {{title}} templates)', type: 'longtext', required: true }],
    run: async (cfg, ctx, os) => {
      const id = ctx.entity?.id ?? (ctx.vars.entityId as string | undefined);
      if (!id) return 'no entity';
      os.comments.add(id, String(cfg.body), 'automation');
    },
  },
  {
    id: 'core.createReminder', module: 'core', label: 'Create reminder',
    configFields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'inDays', label: 'Due in (days from now)', type: 'number', defaultValue: 1 },
      { key: 'atField', label: 'Or relative to a date field', type: 'text', placeholder: 'expiresOn', description: 'data.<field> on the triggering record' },
      { key: 'offsetDays', label: 'Days before that date', type: 'number', defaultValue: 0 },
      { key: 'rrule', label: 'Repeat (RRULE)', type: 'text', placeholder: 'FREQ=WEEKLY;INTERVAL=1' },
    ],
    run: async (cfg, ctx, os) => {
      let dueAt = Date.now() + Number(cfg.inDays ?? 1) * 86400000;
      if (cfg.atField && ctx.entity) {
        const raw = (ctx.entity.data as Record<string, unknown>)[String(cfg.atField)];
        const base = typeof raw === 'number' ? raw : raw ? new Date(String(raw)).getTime() : NaN;
        if (!Number.isNaN(base)) dueAt = base - Number(cfg.offsetDays ?? 0) * 86400000;
      }
      if (dueAt < Date.now()) dueAt = Date.now() + 3600000;
      const r = os.reminders.create({ entityId: ctx.entity?.id ?? null, title: String(cfg.title), dueAt, rrule: cfg.rrule ? String(cfg.rrule) : null }, 'automation');
      return r.title;
    },
  },
  {
    id: 'core.notify', module: 'core', label: 'Send notification',
    configFields: [{ key: 'title', label: 'Title', type: 'text', required: true }, { key: 'body', label: 'Body', type: 'longtext' }],
    run: async (cfg, ctx, os) => {
      await os.notify({ title: String(cfg.title), body: cfg.body ? String(cfg.body) : undefined, data: { entityId: ctx.entity?.id } });
      return String(cfg.title);
    },
  },
  {
    id: 'core.createEntity', module: 'core', label: 'Create record',
    configFields: [
      { key: 'entityType', label: 'Type', type: 'text', required: true },
      { key: 'title', label: 'Title', type: 'text' },
      { key: 'data', label: 'Fields (JSON, supports templates)', type: 'json' },
      { key: 'linkKind', label: 'Link to triggering record as', type: 'text', placeholder: 'related' },
    ],
    run: async (cfg, ctx, os) => {
      let data: Record<string, unknown> = {};
      if (typeof cfg.data === 'string' && cfg.data.trim()) data = JSON.parse(cfg.data);
      else if (cfg.data && typeof cfg.data === 'object') data = cfg.data as Record<string, unknown>;
      const e = os.entities.create({ type: String(cfg.entityType), title: cfg.title ? String(cfg.title) : undefined, data }, 'automation');
      if (ctx.entity && cfg.linkKind) os.relations.link(e.id, ctx.entity.id, String(cfg.linkKind), {}, 'automation');
      return e.title;
    },
  },
  {
    id: 'core.star', module: 'core', label: 'Star record',
    run: async (_cfg, ctx, os) => {
      if (ctx.entity) os.entities.update(ctx.entity.id, { starred: true }, 'automation');
    },
  },
  {
    id: 'core.archive', module: 'core', label: 'Archive record',
    run: async (_cfg, ctx, os) => {
      if (ctx.entity) os.entities.update(ctx.entity.id, { archived: true }, 'automation');
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

function slim(e: Entity, os: LifeOSContext) {
  const tags = os.tags.forEntity(e.id).map((t) => t.name);
  const rels = os.relations.forEntity(e.id).slice(0, 12).map((r) => ({ kind: r.relation.kind, direction: r.direction, id: r.other.id, type: r.other.type, title: r.other.title }));
  return { id: e.id, type: e.type, title: e.title, subtitle: e.subtitle, status: e.status, starred: e.starred, occurredAt: e.occurredAt ? new Date(e.occurredAt).toISOString() : null, data: e.data, tags, relations: rels, updatedAt: new Date(e.updatedAt).toISOString() };
}

const aiTools: AiToolDef[] = [
  ...lifeTools,
  ...createAnythingTools,
  {
    name: 'list_entity_types',
    description: 'List every record type in LifeOS with its fields, statuses and relation kinds. Call this first when unsure how data is shaped.',
    input: z.object({ module: z.string().optional() }),
    run: async (input, os) => {
      const { module } = input as { module?: string };
      return [...os.registry.entityTypes.values()]
        .filter((t) => !module || t.module === module)
        .map((t) => ({ type: t.type, module: t.module, label: t.label, fields: t.fields.map((f) => ({ key: f.key, type: f.type, label: f.label, options: f.options?.map((o) => o.value), relationTo: f.relationTo, relationKind: f.relationKind })), statuses: t.statuses?.map((s) => s.value), relations: t.relations, count: os.entities.count(t.type) }));
    },
  },
  {
    name: 'search',
    description: 'Full-text search across all records. Use for "find X" questions before querying by filter.',
    input: z.object({ query: z.string(), types: z.array(z.string()).optional(), limit: z.number().optional() }),
    run: async (input, os) => {
      const i = input as { query: string; types?: string[]; limit?: number };
      return os.entities.search.search(i.query, { types: i.types, limit: i.limit ?? 20 });
    },
  },
  {
    name: 'query_entities',
    description: 'Query records of a type with structured filters, sort and limit. Dates are epoch milliseconds. Returns full records with tags and relations.',
    input: z.object({ type: z.string(), filter: filterSchema.optional(), sort: z.array(sortSchema).optional(), limit: z.number().max(100).optional(), includeArchived: z.boolean().optional() }),
    run: async (input, os) => {
      const i = input as { type: string; filter?: FilterGroup; sort?: SortSpec[]; limit?: number; includeArchived?: boolean };
      return os.entities.query(i.type, { filter: i.filter, sort: i.sort, includeArchived: i.includeArchived }, { limit: i.limit ?? 25 }).map((e) => slim(e, os));
    },
  },
  {
    name: 'aggregate',
    description: 'Sum/avg/count numeric data fields over records matching a filter, optionally grouped by a field (e.g. sum data.amount of transactions grouped by data.category) or bucketed by time (day/week/month).',
    input: z.object({ type: z.string(), filter: filterSchema.optional(), sum: z.array(z.string()).optional(), avg: z.array(z.string()).optional(), groupBy: z.string().optional(), bucket: z.enum(['day', 'week', 'month']).optional(), timeField: z.string().optional() }),
    run: async (input, os) => {
      const i = input as { type: string; filter?: FilterGroup; sum?: string[]; avg?: string[]; groupBy?: string; bucket?: 'day' | 'week' | 'month'; timeField?: string };
      if (i.bucket) return os.entities.series(i.type, { filter: i.filter }, i.bucket, i.sum?.[0], i.timeField ?? 'occurredAt');
      if (i.groupBy) return os.entities.groupBy(i.type, { filter: i.filter }, i.groupBy, { sum: i.sum, avg: i.avg, count: true });
      return os.entities.aggregate(i.type, { filter: i.filter }, { sum: i.sum, avg: i.avg, count: true });
    },
  },
  {
    name: 'get_entity',
    description: 'Fetch one record by id including tags, relations, recent timeline, comments and reminders.',
    input: z.object({ id: z.string() }),
    run: async (input, os) => {
      const e = os.entities.get((input as { id: string }).id);
      if (!e) return { error: 'not found' };
      return { ...slim(e, os), timeline: os.entities.timeline.forEntity(e.id, 15).map((t) => ({ at: new Date(t.occurredAt).toISOString(), kind: t.kind, title: t.title, body: t.body })), comments: os.comments.forEntity(e.id).map((c) => ({ at: new Date(c.createdAt).toISOString(), author: c.author, body: c.body })), reminders: os.reminders.forEntity(e.id).map((r) => ({ id: r.id, title: r.title, nextAt: r.nextAt ? new Date(r.nextAt).toISOString() : null, done: !!r.doneAt })) };
    },
  },
  {
    name: 'create_entity',
    description: 'Create a record of any type. Send what you know in `data` (field keys from the type list); missing required fields get sensible defaults and "32k" / "2 years" / "today" are understood. Optionally tag and link it to other records in the same call.',
    input: z.object({ type: z.string(), title: z.string().optional(), data: z.record(z.string(), z.unknown()), status: z.string().optional(), tags: z.array(z.string()).optional(), links: z.array(z.object({ toId: z.string(), kind: z.string() })).optional() }),
    confirm: (i: { type: string }, os) => touchesMoneyOrPeople(os, i.type),
    describe: (i: { type: string; title?: string; data: Record<string, unknown> }, os) => {
      const label = os.registry.entityTypes.get(i.type)?.label ?? i.type;
      const amt = typeof i.data?.amount === 'number' ? ` · ${os.format.currency(i.data.amount as number)}` : '';
      return `Add ${label.toLowerCase()}: ${i.title ?? (i.data?.merchant as string) ?? (i.data?.name as string) ?? ''}${amt}`.trim();
    },
    run: async (input, os) => {
      const i = input as { type: string; title?: string; data: Record<string, unknown>; status?: string; tags?: string[]; links?: Array<{ toId: string; kind: string }> };
      const def = os.registry.entityTypes.get(i.type);
      if (!def) return { error: `unknown record type ${i.type}` };
      const e = os.entities.create({ type: i.type, title: i.title, data: fillDefaults(def, i.data ?? {}, i.title), status: i.status }, 'assistant');
      for (const t of i.tags ?? []) os.tags.apply(e.id, t, 'assistant');
      for (const l of i.links ?? []) os.relations.link(e.id, l.toId, l.kind, {}, 'assistant');
      const saved = os.entities.get(e.id)!;
      return withExtras(slim(saved, os), { undo: () => os.entities.delete(e.id, 'user'), card: recordCard(os, saved) });
    },
  },
  {
    name: 'update_entity',
    description: 'Update fields, title, status, star or archive on an existing record. Only send the fields that change.',
    input: z.object({ id: z.string(), title: z.string().optional(), data: z.record(z.string(), z.unknown()).optional(), status: z.string().nullable().optional(), starred: z.boolean().optional(), archived: z.boolean().optional(), addTags: z.array(z.string()).optional() }),
    confirm: (i: { id: string }, os) => touchesMoneyOrPeople(os, os.entities.get(i.id)?.type),
    describe: (i: { id: string; data?: Record<string, unknown> }, os) => `Change ${os.entities.get(i.id)?.title ?? 'record'}${i.data ? `: ${Object.entries(i.data).map(([k, v]) => `${k} → ${String(v)}`).join(', ')}` : ''}`,
    run: async (input, os) => {
      const i = input as { id: string; title?: string; data?: Record<string, unknown>; status?: string | null; starred?: boolean; archived?: boolean; addTags?: string[] };
      const before = os.entities.get(i.id);
      if (!before) return { error: 'not found' };
      const hadTags = new Set(os.tags.forEntity(i.id).map((t) => t.name));
      const e = os.entities.update(i.id, { title: i.title, data: i.data, status: i.status, starred: i.starred, archived: i.archived }, 'assistant');
      for (const t of i.addTags ?? []) os.tags.apply(e.id, t, 'assistant');
      const saved = os.entities.get(e.id)!;
      const undo = () => {
        os.entities.update(before.id, { title: before.title, data: before.data as Record<string, unknown>, status: before.status, starred: before.starred, archived: before.archived }, 'user');
        for (const t of os.tags.forEntity(before.id)) if (!hadTags.has(t.name)) os.tags.remove(before.id, t.id);
      };
      return withExtras(slim(saved, os), { undo, card: recordCard(os, saved) });
    },
  },
  {
    name: 'delete_entity',
    description: 'Soft-delete a record (recoverable).',
    input: z.object({ id: z.string() }),
    confirm: (i: { id: string }, os) => touchesMoneyOrPeople(os, os.entities.get(i.id)?.type),
    describe: (i: { id: string }, os) => `Delete ${os.entities.get(i.id)?.title ?? 'record'} (you can restore it)`,
    run: async (input, os) => {
      const id = (input as { id: string }).id;
      const title = os.entities.get(id)?.title;
      os.entities.delete(id, 'assistant');
      return withExtras({ ok: true, deleted: title }, { undo: () => os.entities.restore(id) });
    },
  },
  {
    name: 'link_entities',
    description: 'Create a typed relationship between two records (e.g. transaction → trip with kind "trip").',
    input: z.object({ fromId: z.string(), toId: z.string(), kind: z.string() }),
    run: async (input, os) => {
      const i = input as { fromId: string; toId: string; kind: string };
      const rel = os.relations.link(i.fromId, i.toId, i.kind, {}, 'assistant');
      return withExtras({ ...rel }, { undo: () => os.relations.unlink(i.fromId, i.toId, i.kind, 'user') });
    },
  },
  {
    name: 'add_comment',
    description: 'Add a note/comment to a record\'s timeline.',
    input: z.object({ id: z.string(), body: z.string() }),
    run: async (input, os) => {
      const i = input as { id: string; body: string };
      return os.comments.add(i.id, i.body, 'assistant');
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
    run: async (input, os) => os.entities.timeline.recent((input as { limit?: number }).limit ?? 30).map((t) => ({ at: new Date(t.occurredAt).toISOString(), entity: t.entityTitle, type: t.entityType, entityId: t.entityId, event: t.title, body: t.body })),
  },
  {
    name: 'create_automation',
    description: 'Create an automation rule. Triggers: core.entity.created, core.entity.updated, core.entity.status, core.tag.applied, core.reminder.due, core.schedule.daily plus module triggers. Actions: core.setStatus, core.addTag, core.addComment, core.createReminder, core.notify, core.createEntity plus module actions.',
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
  description: 'Entity system, relationships, timeline, reminders, tags, search, automation primitives.',
  icon: 'cube',
  color: '#8E8E93',
  triggers,
  actions,
  aiTools,
};
