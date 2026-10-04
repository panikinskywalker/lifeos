import type { EntityTypeDef } from '../domain/types';
import type { ActionDef, AiToolDef, BoardManifest, EntityDetailSection, ModuleManifest, QuickAction, TriggerDef, WidgetDef } from './types';

/**
 * Central registry. Modules register manifests; every other subsystem looks
 * things up here by id. Registration is idempotent so hot reload is safe.
 */
export class Registry {
  readonly modules = new Map<string, ModuleManifest>();
  readonly boards = new Map<string, BoardManifest>();
  readonly entityTypes = new Map<string, EntityTypeDef>();
  readonly widgets = new Map<string, WidgetDef>();
  readonly triggers = new Map<string, TriggerDef>();
  readonly actions = new Map<string, ActionDef>();
  readonly aiTools = new Map<string, AiToolDef>();
  readonly quickActions: QuickAction[] = [];
  readonly detailSections: EntityDetailSection[] = [];

  register(m: ModuleManifest) {
    for (const dep of m.dependencies ?? []) {
      if (!this.modules.has(dep)) throw new Error(`Module "${m.id}" depends on "${dep}" which is not registered`);
    }
    this.modules.set(m.id, m);
    for (const t of m.entityTypes ?? []) this.entityTypes.set(t.type, { ...t, module: m.id });
    for (const w of m.widgets ?? []) this.widgets.set(w.type, { ...w, module: m.id });
    for (const t of m.triggers ?? []) this.triggers.set(t.id, { ...t, module: m.id });
    for (const a of m.actions ?? []) this.actions.set(a.id, { ...a, module: m.id });
    for (const t of m.aiTools ?? []) this.aiTools.set(t.name, t);
    for (const q of m.quickActions ?? []) {
      const i = this.quickActions.findIndex((x) => x.id === q.id);
      if (i >= 0) this.quickActions[i] = q;
      else this.quickActions.push(q);
    }
    for (const s of m.detailSections ?? []) {
      const i = this.detailSections.findIndex((x) => x.key === s.key && x.entityType === s.entityType);
      if (i >= 0) this.detailSections[i] = s;
      else this.detailSections.push(s);
    }
    this.detailSections.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }

  /** Boards register after modules; their tiles, overrides and quick actions join the same lookups. */
  registerBoard(b: BoardManifest) {
    if (b.module && !this.modules.has(b.module)) throw new Error(`Board "${b.id}" is the companion of "${b.module}" which is not registered`);
    this.boards.set(b.id, b);
    for (const t of b.tiles ?? []) this.widgets.set(t.type, { ...t, module: b.module ?? b.id });
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

  /** The overview for a module: its companion board's override, else the module's own (deprecated) one. */
  overviewFor(moduleId: string) {
    for (const b of this.boards.values()) {
      if (b.module !== moduleId) continue;
      const o = b.overrides?.find((x) => x.overview)?.overview;
      if (o) return o;
    }
    return this.modules.get(moduleId)?.overview;
  }

  type(type: string): EntityTypeDef {
    const t = this.entityTypes.get(type);
    if (!t) throw new Error(`Unknown entity type "${type}"`);
    return t;
  }
  hasType(type: string) {
    return this.entityTypes.has(type);
  }
  module(id: string): ModuleManifest {
    const m = this.modules.get(id);
    if (!m) throw new Error(`Unknown module "${id}"`);
    return m;
  }
  typesForModule(moduleId: string): EntityTypeDef[] {
    return [...this.entityTypes.values()].filter((t) => t.module === moduleId);
  }
  colorFor(type: string): string | undefined {
    const t = this.entityTypes.get(type);
    return t?.color ?? (t ? this.modules.get(t.module)?.color : undefined);
  }
}

export const registry = new Registry();
