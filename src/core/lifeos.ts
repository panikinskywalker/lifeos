import type { DatabaseAdapter } from './db/adapter';
import { migrate } from './db/migrate';
import { registry as defaultRegistry, Registry } from './registry/registry';
import type { LifeOSContext } from './registry/context';
import type { BoardManifest, ModuleManifest } from './registry/types';
import { RecordRepo } from './repo/recordRepo';
import { AttachmentRepo, CustomFieldRepo, ModuleRepo, LinkRepo, ReminderRepo, SettingsRepo, TagRepo, ViewRepo } from './repo/sideRepos';
import { ChangeLog } from './sync/changeLog';
import { CycleRepo } from './cycles/cycleRepo';
import { GroupRepo } from './repo/groupRepo';
import { AliasRepo } from './repo/aliasRepo';
import { FactRepo } from './repo/factRepo';
import { DumpRepo } from './repo/dumpRepo';
import { FilingRepo } from './repo/filingRepo';
import { QuestionRepo } from './repo/questionRepo';
import { AutomationEngine } from './automation/engine';
import { Scheduler } from './automation/scheduler';
import { createFormatters, DEFAULT_LOCALE, type LocaleSettings } from './format';
import { bus } from './events/bus';
import { coreModule } from './coreModule';
import type { ObjectRecord } from './domain/types';
import { resolveLink, syncMentions } from './links';

export interface LifeOSOptions {
  db: DatabaseAdapter;
  modules: ModuleManifest[];
  /** Boards register after modules (docs/MODEL.md §3). */
  boards?: BoardManifest[];
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

  const entities = new RecordRepo(db, registry);
  entities.formatCurrency = (n, c) => format.currency(n, c);
  const changes = new ChangeLog(db);
  const timeline = entities.timeline;

  const ctx: LifeOSContext = {
    db,
    registry,
    records: entities,
    links: new LinkRepo(db, timeline, changes),
    tags: new TagRepo(db, timeline),
    attachments: new AttachmentRepo(db, timeline, changes),
    cycles: new CycleRepo(db, timeline, changes),
    groups: new GroupRepo(db, changes),
    aliases: new AliasRepo(db, changes),
    facts: new FactRepo(db, changes, timeline),
    dumps: new DumpRepo(db, changes),
    filings: new FilingRepo(db),
    questions: new QuestionRepo(db),
    reminders: new ReminderRepo(db, timeline, changes),
    customFields: new CustomFieldRepo(db),
    views: new ViewRepo(db),
    settings,
    modules: new ModuleRepo(db),
    automation: null as unknown as AutomationEngine,
    scheduler: null as unknown as Scheduler,
    format,
    navigate: opts.navigate ?? (() => {}),
    notify: opts.notify ?? (async () => null),
    cancelNotification: opts.cancelNotification ?? (async () => {}),
  };
  // Facts about a record, its tags and attachment names are part of its search text: reindex it when they change.
  const reindex = (entityId: string | null | undefined) => {
    const e = entityId ? entities.get(entityId) : undefined;
    const def = e ? registry.objects.get(e.object) : undefined;
    if (e && def) entities.search.index(e, def);
  };
  const ownerOf = (table: 'attachments', id: string) => db.get<{ record_id: string }>(`SELECT record_id FROM ${table} WHERE id=?`, [id])?.record_id;
  const subjectOf = (factId: string) => db.get<{ subject_id: string | null }>(`SELECT subject_id FROM facts WHERE id=?`, [factId])?.subject_id;
  const wrap = <T extends object, K extends keyof T>(repo: T, name: K, entityOf: (args: never[], result: unknown) => string | null | undefined, before = false) => {
    const fn = (repo[name] as unknown as (...a: never[]) => unknown).bind(repo);
    (repo as Record<K, unknown>)[name] = (...args: never[]) => {
      const owner = before ? entityOf(args, undefined) : undefined;
      const result = fn(...args);
      reindex(before ? owner : entityOf(args, result));
      return result;
    };
  };
  wrap(ctx.facts, 'add', (_a, r) => (r as { subjectId?: string | null }).subjectId);
  wrap(ctx.facts, 'forget', (a) => subjectOf(a[0] as string), true);
  wrap(ctx.tags, 'apply', (a) => a[0] as string);
  wrap(ctx.tags, 'remove', (a) => a[0] as string);
  wrap(ctx.tags, 'set', (a) => a[0] as string);
  wrap(ctx.attachments, 'add', (a) => (a[0] as { entityId: string }).entityId);
  wrap(ctx.attachments, 'setCover', (a) => (a[0] as { entityId: string }).entityId);
  wrap(ctx.attachments, 'remove', (a) => ownerOf('attachments', a[0] as string), true);

  // Link fields: data.<key> holding an entity id (or ids) mirrors into the
  // relations table so the graph and the JSON stay consistent.
  entities.syncRelations = (entity, def, actor) => {
    for (const f of def.fields) {
      if (f.type !== 'link' || !f.linkWord) continue;
      const raw = (entity.data as Record<string, unknown>)[f.key];
      const want = new Set((Array.isArray(raw) ? raw : raw ? [raw] : []).map(String).filter(Boolean));
      // Only links the field made: a payment's payer (linked from the SMS, with what it called them) isn't the field's to remove.
      const have = new Set(ctx.links.forEntity(entity.id, f.linkWord).filter((r) => r.direction === 'out' && !('as' in r.relation.meta)).map((r) => r.other.id));
      for (const id of want) if (!have.has(id)) ctx.links.link(entity.id, id, f.linkWord, {}, actor);
      for (const id of have) if (!want.has(id)) ctx.links.unlink(entity.id, id, f.linkWord, actor);
    }
  };
  ctx.automation = new AutomationEngine(ctx, registry);
  ctx.scheduler = new Scheduler(db, ctx);

  // Register core first (generic triggers/actions/AI tools), then modules in
  // dependency order.
  const all = [coreModule, ...topoSort(opts.modules)];
  for (const m of all) registry.register(m);
  for (const b of opts.boards ?? []) registry.registerBoard(b);

  // Install / start
  for (const m of all) {
    for (const t of m.objects ?? []) entities.ensureIndexes(t);
    if (!ctx.modules.isInstalled(m.id)) {
      db.transaction(() => {
        for (const t of m.objects ?? []) {
          for (const v of t.defaultViews ?? []) ctx.views.save(t.id, v);
        }
      });
      await m.onInstall?.(ctx);
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
    const m = e && registry.objects.get(e.object)?.meters?.find((x) => x.meter === meter);
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
    const map = e && c.template ? registry.objects.get(e.object)?.cycleFields?.[c.template] : undefined;
    if (!e || !map) return;
    const data = e.data as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (map.nextDueAt && c.nextDueAt != null && data[map.nextDueAt] !== ymd(c.nextDueAt)) patch[map.nextDueAt] = ymd(c.nextDueAt);
    if (map.nextDueMeter && c.nextDueMeter != null && data[map.nextDueMeter] !== c.nextDueMeter) patch[map.nextDueMeter] = c.nextDueMeter;
    if (map.lastDoneAt && c.lastDoneAt != null && data[map.lastDoneAt] !== ymd(c.lastDoneAt)) patch[map.lastDoneAt] = ymd(c.lastDoneAt);
    if (Object.keys(patch).length) entities.update(e.id, { data: patch }, 'system');
  };
  // Paused / cancelled records: their cycles leave Upkeep until the record is live again.
  const syncEnabled = (e: ObjectRecord) => {
    const live = registry.objects.get(e.object)?.cycleActiveStatuses;
    if (!live) return;
    const on = e.status == null || live.includes(e.status);
    for (const c of ctx.cycles.forEntity(e.id)) if (c.enabled !== on) ctx.cycles.update(c.id, { enabled: on });
  };
  bus.on('entity.status', ({ entity }) => syncEnabled(entity));
  // Meters: a value typed into the mirrored field (odometerKm) becomes a reading.
  const mirrorMeters = (entity: ObjectRecord) => {
    for (const m of registry.objects.get(entity.object)?.meters ?? []) {
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
    ctx.cycles.applyTemplates(entity, registry.objects.get(entity.object));
    syncEnabled(entity);
  });
  bus.on('entity.updated', ({ entity, previous, changed }) => {
    if (changed.some((k) => k.startsWith('data.'))) ctx.cycles.syncTemplates(entity, previous, registry.objects.get(entity.object));
    const meters = registry.objects.get(entity.object)?.meters ?? [];
    if (meters.some((m) => changed.includes(m.field) || changed.includes(`data.${m.field}`))) mirrorMeters(entity);
  });
  if (!settings.get('cycles.enabledSynced', false)) {
    db.transaction(() => {
      for (const def of registry.objects.values()) {
        if (!def.cycleActiveStatuses) continue;
        for (const e of entities.query(def.id, {}, { limit: 100000 })) syncEnabled(e);
      }
    });
    settings.set('cycles.enabledSynced', true);
  }
  // Records that predate meter readings: their typed value becomes the first reading, once.
  if (!settings.get('meters.backfilled', false)) {
    db.transaction(() => {
      for (const def of registry.objects.values()) {
        if (!def.meters?.length) continue;
        for (const e of entities.query(def.id, {}, { limit: 100000 })) mirrorMeters(e);
      }
    });
    settings.set('meters.backfilled', true);
  }
  if (!settings.get('cycles.templatesBackfilled', false)) {
    db.transaction(() => {
      for (const def of registry.objects.values()) {
        if (!def.cycleTemplates) continue;
        for (const e of entities.query(def.id, {}, { limit: 100000 })) {
          ctx.cycles.applyTemplates(e, def);
          syncEnabled(e);
        }
      }
    });
    settings.set('cycles.templatesBackfilled', true);
  }

  ctx.automation.start();
  // One-time backfill: records indexed before notes, tags and attachment names were searchable.
  if (!settings.get<boolean>('search.indexV2', false)) {
    for (const e of entities.query(null, { includeArchived: true }, { limit: 100000 })) reindex(e.id);
    settings.set('search.indexV2', true);
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
