import type { DatabaseAdapter, Row } from '../db/adapter';
import type { LifeEvent } from '../domain/types';
import { newId } from '../domain/ids';
import { safeJson } from './entityRepo';

export class TimelineRepo {
  constructor(private db: DatabaseAdapter) {}

  add(ev: Omit<LifeEvent, 'id' | 'createdAt' | 'meta'> & { meta?: Record<string, unknown> }): LifeEvent {
    const now = Date.now();
    const id = newId(now);
    this.db.run(`INSERT INTO timeline_events(id,entity_id,kind,title,body,actor,meta,occurred_at,created_at) VALUES (?,?,?,?,?,?,?,?,?)`, [
      id, ev.entityId, ev.kind, ev.title, ev.body ?? null, ev.actor, JSON.stringify(ev.meta ?? {}), ev.occurredAt, now,
    ]);
    return { ...ev, id, createdAt: now, meta: ev.meta ?? {} };
  }

  /** Drop an event — only for Undo of the action that just wrote it. */
  remove(id: string): void {
    this.db.run(`DELETE FROM timeline_events WHERE id=?`, [id]);
  }

  forEntity(entityId: string, limit = 100): LifeEvent[] {
    return this.db.all(`SELECT * FROM timeline_events WHERE entity_id = ? ORDER BY occurred_at DESC LIMIT ?`, [entityId, limit]).map(toEvent);
  }

  /** Cross-entity activity feed (the Dashboard "Activity" widget). */
  recent(limit = 50, types?: string[]): Array<LifeEvent & { entityTitle: string; entityType: string }> {
    const params: (string | number)[] = [];
    let typeSql = '';
    if (types?.length) {
      typeSql = ` AND e.type IN (${types.map(() => '?').join(',')})`;
      params.push(...types);
    }
    params.push(limit);
    return this.db
      .all(`SELECT t.*, e.title AS entity_title, e.type AS entity_type FROM timeline_events t JOIN entities e ON e.id = t.entity_id WHERE e.deleted_at IS NULL${typeSql} ORDER BY t.occurred_at DESC LIMIT ?`, params)
      .map((r) => ({ ...toEvent(r), entityTitle: r.entity_title as string, entityType: r.entity_type as string }));
  }
}

function toEvent(r: Row): LifeEvent {
  return {
    id: r.id as string,
    entityId: r.entity_id as string,
    kind: r.kind as string,
    title: r.title as string,
    body: (r.body as string | null) ?? null,
    actor: r.actor as LifeEvent['actor'],
    meta: safeJson(r.meta as string),
    occurredAt: r.occurred_at as number,
    createdAt: r.created_at as number,
  };
}
