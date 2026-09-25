import type { DatabaseAdapter } from './db/adapter';
import { migrate } from './db/migrate';
import { registry as defaultRegistry, Registry } from './registry/registry';
import type { LifeOSContext } from './registry/context';
import type { ModuleManifest } from './registry/types';
import { EntityRepo } from './repo/entityRepo';
import { AttachmentRepo, CommentRepo, CustomFieldRepo, DashboardRepo, ModuleRepo, RelationRepo, ReminderRepo, SettingsRepo, TagRepo, ViewRepo } from './repo/sideRepos';
import { ChangeLog } from './sync/changeLog';
import { CycleRepo } from './cycles/cycleRepo';
import { AutomationEngine } from './automation/engine';
import { Scheduler } from './automation/scheduler';
import { createFormatters, DEFAULT_LOCALE, type LocaleSettings } from './format';
import { bus } from './events/bus';
import { coreModule } from './coreModule';
import type { Entity } from './domain/types';

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
  // Meters: a value typed into the mirrored field (odometerKm) becomes a reading.
  const mirrorMeters = (entity: Entity) => {
    for (const m of registry.entityTypes.get(entity.type)?.meters ?? []) {
      const v = Number((entity.data as Record<string, unknown>)[m.field]);
      if (!Number.isFinite(v) || (entity.data as Record<string, unknown>)[m.field] == null) continue;
      if (ctx.cycles.latestMeter(entity.id, m.meter) === v) continue;
      ctx.cycles.logMeter(entity.id, v, { meter: m.meter, unit: m.unit, label: m.label }, 'user');
    }
  };
  bus.on('entity.created', ({ entity }) => {
    mirrorMeters(entity);
    ctx.cycles.applyTemplates(entity, registry.entityTypes.get(entity.type));
  });
  bus.on('entity.updated', ({ entity, changed }) => {
    const meters = registry.entityTypes.get(entity.type)?.meters ?? [];
    if (meters.some((m) => changed.includes(m.field) || changed.includes(`data.${m.field}`))) mirrorMeters(entity);
  });
  if (!settings.get('cycles.templatesBackfilled', false)) {
    db.transaction(() => {
      for (const def of registry.entityTypes.values()) {
        if (!def.cycleTemplates) continue;
        for (const e of entities.query(def.type, {}, { limit: 100000 })) ctx.cycles.applyTemplates(e, def);
      }
    });
    settings.set('cycles.templatesBackfilled', true);
  }

  ctx.automation.start();
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
