import type { DatabaseAdapter } from './db/adapter';
import { migrate } from './db/migrate';
import { registry as defaultRegistry, Registry } from './registry/registry';
import type { LifeOSContext } from './registry/context';
import type { ModuleManifest } from './registry/types';
import { EntityRepo } from './repo/entityRepo';
import { AttachmentRepo, CommentRepo, CustomFieldRepo, DashboardRepo, ModuleRepo, RelationRepo, ReminderRepo, SettingsRepo, TagRepo, ViewRepo } from './repo/sideRepos';
import { ChangeLog } from './sync/changeLog';
import { CycleRepo } from './cycles/cycleRepo';
import { GroupRepo } from './repo/groupRepo';
import { AliasRepo } from './repo/aliasRepo';
import { FactRepo } from './repo/factRepo';
import { DumpRepo } from './repo/dumpRepo';
import { QuestionRepo } from './repo/questionRepo';
import { AutomationEngine } from './automation/engine';
import { Scheduler } from './automation/scheduler';
import { createFormatters, DEFAULT_LOCALE, type LocaleSettings } from './format';
import { bus } from './events/bus';
import { coreModule } from './coreModule';
import type { Entity } from './domain/types';
import { resolveLink, syncMentions } from './links';
import { learnCategory } from './ingest/ingest';
import { linkMissingPayees } from './ingest/payee';

export interface LifeOSOptions {
  db: DatabaseAdapter;
  modules: ModuleManifest[];
  registry?: Registry;
  navigate?: LifeOSContext['navigate'];
  notify?: LifeOSContext['notify'];
  cancelNotification?: LifeOSContext['cancelNotification'];
}

/**
 * Boot sequence:
 *   migrate DB → build repos → register core + modules → install new modules
 *   (onInstall seeds views/dashboards/rules) → ensure indexes → start
 *   automation + scheduler → run module onStart hooks.
 */
export async function createLifeOS(opts: LifeOSOptions): Promise<LifeOSContext> {
  const { db } = opts;
  const registry = opts.registry ?? defaultRegistry;
  migrate(db);

  const settings = new SettingsRepo(db);
  const localeGetter = () => ({ ...DEFAULT_LOCALE, ...settings.get<Partial<LocaleSettings>>('locale', {}) });
  const format = createFormatters(localeGetter);

  const entities = new EntityRepo(db, registry);
  entities.formatCurrency = (n, c) => format.currency(n, c);
  const changes = new ChangeLog(db);
  const timeline = entities.timeline;

  const ctx: LifeOSContext = {
    db,
    registry,
    entities,
    relations: new RelationRepo(db, timeline, changes),
    tags: new TagRepo(db, timeline),
    attachments: new AttachmentRepo(db, timeline, changes),
    cycles: new CycleRepo(db, timeline, changes),
    groups: new GroupRepo(db, changes),
    aliases: new AliasRepo(db, changes),
    facts: new FactRepo(db, changes),
    dumps: new DumpRepo(db, changes),
    questions: new QuestionRepo(db),
    comments: new CommentRepo(db, timeline, changes),
    reminders: new ReminderRepo(db, timeline, changes),
    customFields: new CustomFieldRepo(db),
    views: new ViewRepo(db),
    dashboards: new DashboardRepo(db),
    settings,
    modules: new ModuleRepo(db),
    automation: null as unknown as AutomationEngine,
    scheduler: null as unknown as Scheduler,
    format,
    navigate: opts.navigate ?? (() => {}),
    notify: opts.notify ?? (async () => null),
    cancelNotification: opts.cancelNotification ?? (async () => {}),
  };
  // Notes, tags and attachment names are part of a record's search text: reindex it when they change.
  const reindex = (entityId: string | null | undefined) => {
    const e = entityId ? entities.get(entityId) : undefined;
    const def = e ? registry.entityTypes.get(e.type) : undefined;
    if (e && def) entities.search.index(e, def);
  };
  const ownerOf = (table: 'comments' | 'attachments', id: string) => db.get<{ entity_id: string }>(`SELECT entity_id FROM ${table} WHERE id=?`, [id])?.entity_id;
  const wrap = <T extends object, K extends keyof T>(repo: T, name: K, entityOf: (args: never[], result: unknown) => string | null | undefined, before = false) => {
    const fn = (repo[name] as unknown as (...a: never[]) => unknown).bind(repo);
    (repo as Record<K, unknown>)[name] = (...args: never[]) => {
      const owner = before ? entityOf(args, undefined) : undefined;
      const result = fn(...args);
      reindex(before ? owner : entityOf(args, result));
      return result;
    };
  };
  wrap(ctx.comments, 'add', (a) => a[0] as string);
  wrap(ctx.comments, 'remove', (a) => ownerOf('comments', a[0] as string), true);
  wrap(ctx.tags, 'apply', (a) => a[0] as string);
  wrap(ctx.tags, 'remove', (a) => a[0] as string);
  wrap(ctx.tags, 'set', (a) => a[0] as string);
  wrap(ctx.attachments, 'add', (a) => (a[0] as { entityId: string }).entityId);
  wrap(ctx.attachments, 'setCover', (a) => (a[0] as { entityId: string }).entityId);
  wrap(ctx.attachments, 'remove', (a) => ownerOf('attachments', a[0] as string), true);

  // Relation fields: data.<key> holding an entity id (or ids) mirrors into the
  // relations table so the graph and the JSON stay consistent.
  entities.syncRelations = (entity, def, actor) => {
    for (const f of def.fields) {
      if (f.type !== 'relation' || !f.relationKind) continue;
      const raw = (entity.data as Record<string, unknown>)[f.key];
      const want = new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).map(String).filter(Boolean));
      const have = new Set(ctx.relations.targets(entity.id, f.relationKind));
      for (const id of want) if (!have.has(id)) ctx.relations.link(entity.id, id, f.relationKind, {}, actor);
      for (const id of have) if (!want.has(id)) ctx.relations.unlink(entity.id, id, f.relationKind, actor);
    }
  };
  ctx.automation = new AutomationEngine(ctx, registry);
  ctx.scheduler = new Scheduler(db, ctx);

  // Register core first (generic triggers/actions/AI tools), then modules in
  // dependency order.
  const all = [coreModule, ...topoSort(opts.modules)];
  for (const m of all) registry.register(m);

  // Install / start
  let home = ctx.dashboards.all()[0];
  if (!home) home = ctx.dashboards.create('Home', 'house');
  for (const m of all) {
    for (const t of m.entityTypes ?? []) entities.ensureIndexes(t);
    if (!ctx.modules.isInstalled(m.id)) {
      db.transaction(() => {
        for (const t of m.entityTypes ?? []) {
          for (const v of t.defaultViews ?? []) ctx.views.save(t.type, v);
        }
      });
      await m.onInstall?.(ctx);
      if (m.defaultWidgets?.length) {
        const d = ctx.dashboards.get(home.id)!;
        const existing = new Set(d.layout.map((w) => w.widgetType));
        for (const w of m.defaultWidgets) {
          if (existing.has(w.type)) continue;
          const def = registry.widgets.get(w.type);
          if (!def) continue;
          ctx.dashboards.addWidget(home.id, { widgetType: w.type, size: w.size ?? def.defaultSize, config: w.config ?? {} });
        }
      }
      ctx.modules.install(m.id, m.version);
      bus.emit('module.installed', { moduleId: m.id });
    }
  }

  // Reminder scan job: fires reminder.due for anything overdue. Runs on every tick.
  ctx.scheduler.registerHandler('reminder-scan', (_job, os) => {
    const due = os.reminders.upcoming(100, Date.now());
    for (const r of due) bus.emit('reminder.due', { reminder: r });
  });
  if (!ctx.scheduler.get('core.reminder-scan')) ctx.scheduler.schedule({ id: 'core.reminder-scan', kind: 'reminder-scan', at: Date.now(), rrule: 'FREQ=DAILY;INTERVAL=1' });

  // Default cycles: new records get their type's templates; existing records get them once.
  ctx.cycles.onReading = (entityId, meter, actor) => {
    const e = entities.get(entityId);
    const m = e && registry.entityTypes.get(e.type)?.meters?.find((x) => x.meter === meter);
    if (!e || !m) return;
    const latest = ctx.cycles.latestMeter(entityId, meter);
    if ((e.data as Record<string, unknown>)[m.field] !== latest) entities.update(entityId, { data: { [m.field]: latest ?? undefined } }, actor);
  };
  const ymd = (at: number) => {
    const d = new Date(at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  ctx.cycles.onChanged = (c) => {
    const e = entities.get(c.entityId);
    const map = e && c.template ? registry.entityTypes.get(e.type)?.cycleFields?.[c.template] : undefined;
    if (!e || !map) return;
    const data = e.data as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (map.nextDueAt && c.nextDueAt != null && data[map.nextDueAt] !== ymd(c.nextDueAt)) patch[map.nextDueAt] = ymd(c.nextDueAt);
    if (map.nextDueMeter && c.nextDueMeter != null && data[map.nextDueMeter] !== c.nextDueMeter) patch[map.nextDueMeter] = c.nextDueMeter;
    if (map.lastDoneAt && c.lastDoneAt != null && data[map.lastDoneAt] !== ymd(c.lastDoneAt)) patch[map.lastDoneAt] = ymd(c.lastDoneAt);
    if (Object.keys(patch).length) entities.update(e.id, { data: patch }, 'system');
  };
  // Paused / cancelled records: their cycles leave Upkeep until the record is live again.
  const syncEnabled = (e: Entity) => {
    const live = registry.entityTypes.get(e.type)?.cycleActiveStatuses;
    if (!live) return;
    const on = e.status == null || live.includes(e.status);
    for (const c of ctx.cycles.forEntity(e.id)) if (c.enabled !== on) ctx.cycles.update(c.id, { enabled: on });
  };
  bus.on('entity.status', ({ entity }) => syncEnabled(entity));
  // Meters: a value typed into the mirrored field (odometerKm) becomes a reading.
  const mirrorMeters = (entity: Entity) => {
    for (const m of registry.entityTypes.get(entity.type)?.meters ?? []) {
      const v = Number((entity.data as Record<string, unknown>)[m.field]);
      if (!Number.isFinite(v) || (entity.data as Record<string, unknown>)[m.field] == null) continue;
      if (ctx.cycles.latestMeter(entity.id, m.meter) === v) continue;
      ctx.cycles.logMeter(entity.id, v, { meter: m.meter, unit: m.unit, label: m.label }, 'user');
    }
  };
  ctx.facts.resolveLink = (title) => resolveLink(ctx, title);
  // [[links]] in a record's text become 'mention' relations (backlinks).
  bus.on('entity.created', ({ entity, actor }) => syncMentions(ctx, entity, actor));
  bus.on('entity.updated', ({ entity, changed, actor }) => {
    if (changed.some((k) => k.startsWith('data.'))) syncMentions(ctx, entity, actor);
  });
  bus.on('entity.created', ({ entity }) => {
    mirrorMeters(entity);
    ctx.cycles.applyTemplates(entity, registry.entityTypes.get(entity.type));
    syncEnabled(entity);
  });
  bus.on('entity.updated', ({ entity, previous, changed }) => {
    if (changed.some((k) => k.startsWith('data.'))) ctx.cycles.syncTemplates(entity, previous, registry.entityTypes.get(entity.type));
    const meters = registry.entityTypes.get(entity.type)?.meters ?? [];
    if (meters.some((m) => changed.includes(m.field) || changed.includes(`data.${m.field}`))) mirrorMeters(entity);
  });
  if (!settings.get('cycles.enabledSynced', false)) {
    db.transaction(() => {
      for (const def of registry.entityTypes.values()) {
        if (!def.cycleActiveStatuses) continue;
        for (const e of entities.query(def.type, {}, { limit: 100000 })) syncEnabled(e);
      }
    });
    settings.set('cycles.enabledSynced', true);
  }
  // Records that predate meter readings: their typed value becomes the first reading, once.
  if (!settings.get('meters.backfilled', false)) {
    db.transaction(() => {
      for (const def of registry.entityTypes.values()) {
        if (!def.meters?.length) continue;
        for (const e of entities.query(def.type, {}, { limit: 100000 })) mirrorMeters(e);
      }
    });
    settings.set('meters.backfilled', true);
  }
  if (!settings.get('cycles.templatesBackfilled', false)) {
    db.transaction(() => {
      for (const def of registry.entityTypes.values()) {
        if (!def.cycleTemplates) continue;
        for (const e of entities.query(def.type, {}, { limit: 100000 })) {
          ctx.cycles.applyTemplates(e, def);
          syncEnabled(e);
        }
      }
    });
    settings.set('cycles.templatesBackfilled', true);
  }

  ctx.automation.start();
  // You recategorised a transaction: that merchant keeps the category next time (SMS, notifications).
  bus.on('entity.updated', ({ entity, previous, actor }) => {
    if (actor !== 'user' || entity.type !== 'transaction') return;
    const d = entity.data as { category?: string; merchant?: string };
    if (d.merchant && d.category && d.category !== (previous.data as { category?: string }).category) learnCategory(ctx, d.merchant, d.category);
  });
  // One-time backfill: records indexed before notes, tags and attachment names were searchable.
  if (!settings.get<boolean>('search.indexV2', false)) {
    for (const e of entities.query(null, { includeArchived: true }, { limit: 100000 })) reindex(e.id);
    settings.set('search.indexV2', true);
  }
  // Once: payments filed before payees existed join their payee.
  if (!settings.get<boolean>('payees.backfilled', false)) {
    linkMissingPayees(ctx);
    settings.set('payees.backfilled', true);
  }
  for (const m of all) await m.onStart?.(ctx);
  return ctx;
}

function topoSort(mods: ModuleManifest[]): ModuleManifest[] {
  const byId = new Map(mods.map((m) => [m.id, m]));
  const out: ModuleManifest[] = [];
  const seen = new Set<string>();
  const visit = (m: ModuleManifest, stack: string[]) => {
    if (seen.has(m.id)) return;
    if (stack.includes(m.id)) throw new Error(`Module dependency cycle: ${[...stack, m.id].join(' → ')}`);
    for (const d of m.dependencies ?? []) {
      const dep = byId.get(d);
      if (dep) visit(dep, [...stack, m.id]);
    }
    seen.add(m.id);
    out.push(m);
  };
  for (const m of mods) visit(m, []);
  return out;
}
