import type { ObjectDef } from '../domain/types';
import type { ActionDef, AiToolDef, BoardManifest, EntityDetailSection, ModuleManifest, QuickAction, SourceDef, TileDef, TriggerDef } from './types';

/**
 * Central registry. Modules register manifests; every other subsystem looks
 * things up here by id. Registration is idempotent so hot reload is safe.
 */
export class Registry {
  readonly modules = new Map<string, ModuleManifest>();
  readonly boards = new Map<string, BoardManifest>();
  readonly objects = new Map<string, ObjectDef>();
  readonly tiles = new Map<string, TileDef>();
  readonly triggers = new Map<string, TriggerDef>();
  readonly actions = new Map<string, ActionDef>();
  readonly aiTools = new Map<string, AiToolDef>();
  readonly sources = new Map<string, SourceDef>();
  readonly quickActions: QuickAction[] = [];
  readonly detailSections: EntityDetailSection[] = [];

  register(m: ModuleManifest) {
    for (const dep of m.dependencies ?? []) {
      if (!this.modules.has(dep)) throw new Error(`Module "${m.id}" depends on "${dep}" which is not registered`);
    }
    this.modules.set(m.id, m);
    for (const t of m.objects ?? []) this.objects.set(t.id, { ...t, module: m.id });
    for (const t of m.triggers ?? []) this.triggers.set(t.id, { ...t, module: m.id });
    for (const a of m.actions ?? []) this.actions.set(a.id, { ...a, module: m.id });
    for (const t of m.aiTools ?? []) this.aiTools.set(t.name, t);
    for (const src of m.sources ?? []) this.sources.set(src.id, src);
  }

  /** Boards register after modules; their tiles, overrides and quick actions join the same lookups. */
  registerBoard(b: BoardManifest) {
    if (b.module && !this.modules.has(b.module)) throw new Error(`Board "${b.id}" is the companion of "${b.module}" which is not registered`);
    this.boards.set(b.id, b);
    for (const t of b.tiles ?? []) this.tiles.set(t.type, { ...t, board: b.id });
    for (const q of b.quickActions ?? []) {
      const i = this.quickActions.findIndex((x) => x.id === q.id);
      if (i >= 0) this.quickActions[i] = q;
      else this.quickActions.push(q);
    }
    for (const o of b.overrides ?? []) {
      for (const s of o.record ?? []) {
        const sec = { ...s, entityType: o.object };
        const i = this.detailSections.findIndex((x) => x.key === sec.key && x.entityType === sec.entityType);
        if (i >= 0) this.detailSections[i] = sec;
        else this.detailSections.push(sec);
      }
    }
    this.detailSections.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }

  /** The module's Overview, from its companion board. */
  overviewFor(moduleId: string) {
    for (const b of this.boards.values()) if (b.module === moduleId && b.overview) return b.overview;
    return undefined;
  }

  /** The companion board of a module, if it has one. */
  boardFor(moduleId: string) {
    for (const b of this.boards.values()) if (b.module === moduleId) return b;
    return undefined;
  }

  object(id: string): ObjectDef {
    const t = this.objects.get(id);
    if (!t) throw new Error(`Unknown Object "${id}"`);
    return t;
  }
  hasObject(type: string) {
    return this.objects.has(type);
  }
  module(id: string): ModuleManifest {
    const m = this.modules.get(id);
    if (!m) throw new Error(`Unknown module "${id}"`);
    return m;
  }
  objectsForModule(moduleId: string): ObjectDef[] {
    return [...this.objects.values()].filter((t) => t.module === moduleId);
  }
  colorFor(type: string): string | undefined {
    const t = this.objects.get(type);
    return t?.color ?? (t ? this.modules.get(t.module)?.color : undefined);
  }
}

export const registry = new Registry();
