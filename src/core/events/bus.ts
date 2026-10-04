import type { ObjectRecord, Link, Reminder, Comment, Attachment } from '../domain/types';

/**
 * Typed in-process event bus. Every mutation in the repo layer emits here;
 * the automation engine, search indexer, UI query cache and AI context all
 * subscribe. This is the seam that keeps modules decoupled from each other.
 */
export type CoreEvents = {
  'entity.created': { entity: ObjectRecord; actor: Actor };
  'entity.updated': { entity: ObjectRecord; previous: ObjectRecord; changed: string[]; actor: Actor };
  'entity.deleted': { entity: ObjectRecord; actor: Actor };
  'entity.restored': { entity: ObjectRecord; actor: Actor };
  'entity.status': { entity: ObjectRecord; from: string | null; to: string | null; actor: Actor };
  'relation.added': { relation: Link; actor: Actor };
  'relation.removed': { relation: Link; actor: Actor };
  'comment.added': { comment: Comment; actor: Actor };
  'attachment.added': { attachment: Attachment; actor: Actor };
  'reminder.created': { reminder: Reminder; actor: Actor };
  'reminder.due': { reminder: Reminder };
  'reminder.completed': { reminder: Reminder; actor: Actor };
  'tag.applied': { entityId: string; tag: string; actor: Actor };
  'schedule.tick': { at: number };
  'app.foreground': { at: number };
  'module.installed': { moduleId: string };
  /** You recategorised a payment: the payee / merchant now means that category; `others` earlier payments from them still say something else. */
  'category.learned': { entityId: string; category: string; payee: string; others: string[] };
  /** Any other stored change (removals, snoozes, views, dashboards) so live queries refresh. */
  'data.changed': { table: string; id: string };
};

export type Actor = 'user' | 'automation' | 'assistant' | 'system';
export type EventName = keyof CoreEvents;
export type Handler<K extends EventName> = (payload: CoreEvents[K]) => void | Promise<void>;

class EventBus {
  private handlers = new Map<EventName, Set<Handler<EventName>>>();

  on<K extends EventName>(name: K, handler: Handler<K>): () => void {
    if (!this.handlers.has(name)) this.handlers.set(name, new Set());
    this.handlers.get(name)!.add(handler as Handler<EventName>);
    return () => this.handlers.get(name)?.delete(handler as Handler<EventName>);
  }

  /** Subscribe to every event (used by automation + activity feed). */
  onAny(handler: (name: EventName, payload: CoreEvents[EventName]) => void): () => void {
    this.anyHandlers.add(handler);
    return () => this.anyHandlers.delete(handler);
  }
  private anyHandlers = new Set<(name: EventName, payload: CoreEvents[EventName]) => void>();

  emit<K extends EventName>(name: K, payload: CoreEvents[K]): void {
    for (const h of this.handlers.get(name) ?? []) {
      try {
        void (h as Handler<K>)(payload);
      } catch (e) {
        console.warn(`[bus] handler for ${name} threw`, e);
      }
    }
    for (const h of this.anyHandlers) {
      try {
        h(name, payload);
      } catch (e) {
        console.warn(`[bus] any-handler threw`, e);
      }
    }
  }

  clear() {
    this.handlers.clear();
    this.anyHandlers.clear();
  }
}

export const bus = new EventBus();
