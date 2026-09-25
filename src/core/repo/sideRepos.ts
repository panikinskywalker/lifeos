import type { DatabaseAdapter, Row } from '../db/adapter';
import type { Attachment, Comment, CustomFieldDef, Dashboard, EntityRef, Relation, Reminder, SavedViewDef, Tag, ViewDefinition, WidgetInstance } from '../domain/types';
import { newId } from '../domain/ids';
import { bus, type Actor } from '../events/bus';
import { safeJson } from './entityRepo';
import { TimelineRepo } from './timelineRepo';
import { ChangeLog } from '../sync/changeLog';
import { nextOccurrence } from '../automation/recurrence';

/* ------------------------------------------------------------------ */
/* Relations — typed, bidirectional edges between any two entities     */
/* ------------------------------------------------------------------ */

export class RelationRepo {
  constructor(private db: DatabaseAdapter, private timeline: TimelineRepo, private changes: ChangeLog) {}

  link(fromId: string, toId: string, kind: string, meta: Record<string, unknown> = {}, actor: Actor = 'user'): Relation {
    const now = Date.now();
    const existing = this.db.get<Row>(`SELECT * FROM relations WHERE from_id=? AND to_id=? AND kind=?`, [fromId, toId, kind]);
    if (existing && !existing.deleted_at) return toRelation(existing);
    const id = existing ? (existing.id as string) : newId(now);
    this.db.transaction(() => {
      if (existing) this.db.run(`UPDATE relations SET deleted_at=NULL, meta=?, version=version+1 WHERE id=?`, [JSON.stringify(meta), id]);
      else this.db.run(`INSERT INTO relations(id,from_id,to_id,kind,meta,created_at) VALUES (?,?,?,?,?,?)`, [id, fromId, toId, kind, JSON.stringify(meta), now]);
      this.changes.record('relations', id, existing ? 'update' : 'insert', 1);
      const to = this.db.get<{ title: string }>(`SELECT title FROM entities WHERE id=?`, [toId]);
      const from = this.db.get<{ title: string }>(`SELECT title FROM entities WHERE id=?`, [fromId]);
      this.timeline.add({ entityId: fromId, kind: 'relation', title: `Linked to ${to?.title ?? 'record'}`, actor, occurredAt: now, meta: { kind, toId } });
      this.timeline.add({ entityId: toId, kind: 'relation', title: `Linked from ${from?.title ?? 'record'}`, actor, occurredAt: now, meta: { kind, fromId } });
    });
    const rel: Relation = { id, fromId, toId, kind, meta, createdAt: now };
    bus.emit('relation.added', { relation: rel, actor });
    return rel;
  }

  unlink(fromId: string, toId: string, kind?: string, actor: Actor = 'user') {
    const rows = this.db.all<Row>(`SELECT * FROM relations WHERE deleted_at IS NULL AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))${kind ? ' AND kind=?' : ''}`, kind ? [fromId, toId, toId, fromId, kind] : [fromId, toId, toId, fromId]);
    for (const r of rows) {
      this.db.run(`UPDATE relations SET deleted_at=?, version=version+1 WHERE id=?`, [Date.now(), r.id as string]);
      this.changes.record('relations', r.id as string, 'delete', 1);
      bus.emit('relation.removed', { relation: toRelation(r), actor });
    }
  }

  /** Everything linked to an entity in either direction, with the other side's ref. */
  forEntity(id: string, kind?: string): Array<{ relation: Relation; other: EntityRef; direction: 'out' | 'in' }> {
    const rows = this.db.all<Row>(
      `SELECT r.*, e.id AS o_id, e.type AS o_type, e.title AS o_title, CASE WHEN r.from_id=? THEN 'out' ELSE 'in' END AS direction
       FROM relations r JOIN entities e ON e.id = CASE WHEN r.from_id=? THEN r.to_id ELSE r.from_id END
       WHERE r.deleted_at IS NULL AND e.deleted_at IS NULL AND (r.from_id=? OR r.to_id=?)${kind ? ' AND r.kind=?' : ''}
       ORDER BY r.created_at DESC`,
      kind ? [id, id, id, id, kind] : [id, id, id, id],
    );
    return rows.map((r) => ({ relation: toRelation(r), other: { id: r.o_id as string, type: r.o_type as string, title: r.o_title as string }, direction: r.direction as 'out' | 'in' }));
  }

  /** Ids of entities linked from `id` with a given kind (e.g. transaction → account). */
  targets(id: string, kind: string): string[] {
    return this.db.all<{ to_id: string }>(`SELECT to_id FROM relations WHERE from_id=? AND kind=? AND deleted_at IS NULL`, [id, kind]).map((r) => r.to_id);
  }
  sources(id: string, kind: string): string[] {
    return this.db.all<{ from_id: string }>(`SELECT from_id FROM relations WHERE to_id=? AND kind=? AND deleted_at IS NULL`, [id, kind]).map((r) => r.from_id);
  }
}

function toRelation(r: Row): Relation {
  return { id: r.id as string, fromId: r.from_id as string, toId: r.to_id as string, kind: r.kind as string, meta: safeJson(r.meta as string), createdAt: r.created_at as number };
}

/* ------------------------------------------------------------------ */
/* Tags                                                                */
/* ------------------------------------------------------------------ */

export class TagRepo {
  constructor(private db: DatabaseAdapter, private timeline: TimelineRepo) {}

  all(): Tag[] {
    return this.db.all<Row>(`SELECT * FROM tags ORDER BY name`).map(toTag);
  }
  ensure(name: string, color?: string): Tag {
    const n = name.trim().replace(/^#/, '');
    const existing = this.db.get<Row>(`SELECT * FROM tags WHERE name = ? COLLATE NOCASE`, [n]);
    if (existing) return toTag(existing);
    const now = Date.now();
    const id = newId(now);
    this.db.run(`INSERT INTO tags(id,name,color,created_at) VALUES (?,?,?,?)`, [id, n, color ?? null, now]);
    return { id, name: n, color: color ?? null, createdAt: now };
  }
  forEntity(entityId: string): Tag[] {
    return this.db.all<Row>(`SELECT t.* FROM tags t JOIN entity_tags et ON et.tag_id=t.id WHERE et.entity_id=? ORDER BY t.name`, [entityId]).map(toTag);
  }
  apply(entityId: string, name: string, actor: Actor = 'user'): Tag {
    const tag = this.ensure(name);
    const r = this.db.run(`INSERT OR IGNORE INTO entity_tags(entity_id,tag_id,created_at) VALUES (?,?,?)`, [entityId, tag.id, Date.now()]);
    if (r.changes) {
      this.timeline.add({ entityId, kind: 'tag', title: `Tagged #${tag.name}`, actor, occurredAt: Date.now() });
      bus.emit('tag.applied', { entityId, tag: tag.name, actor });
    }
    return tag;
  }
  remove(entityId: string, tagId: string) {
    this.db.run(`DELETE FROM entity_tags WHERE entity_id=? AND tag_id=?`, [entityId, tagId]);
    bus.emit('data.changed', { table: 'entity_tags', id: entityId });
  }
  set(entityId: string, names: string[], actor: Actor = 'user') {
    const current = this.forEntity(entityId);
    const want = new Set(names.map((n) => n.trim().replace(/^#/, '').toLowerCase()).filter(Boolean));
    for (const t of current) if (!want.has(t.name.toLowerCase())) this.remove(entityId, t.id);
    for (const n of want) if (!current.some((t) => t.name.toLowerCase() === n)) this.apply(entityId, n, actor);
  }
  counts(): Array<Tag & { count: number }> {
    return this.db.all<Row>(`SELECT t.*, COUNT(et.entity_id) AS count FROM tags t LEFT JOIN entity_tags et ON et.tag_id=t.id GROUP BY t.id ORDER BY count DESC, t.name`).map((r) => ({ ...toTag(r), count: Number(r.count) }));
  }
}
function toTag(r: Row): Tag {
  return { id: r.id as string, name: r.name as string, color: (r.color as string | null) ?? null, createdAt: r.created_at as number };
}

/* ------------------------------------------------------------------ */
/* Attachments                                                         */
/* ------------------------------------------------------------------ */

export class AttachmentRepo {
  constructor(private db: DatabaseAdapter, private timeline: TimelineRepo, private changes: ChangeLog) {}
  add(a: Omit<Attachment, 'id' | 'createdAt'>, actor: Actor = 'user'): Attachment {
    const now = Date.now();
    const id = newId(now);
    this.db.run(`INSERT INTO attachments(id,entity_id,name,mime,size,uri,kind,created_at) VALUES (?,?,?,?,?,?,?,?)`, [id, a.entityId, a.name, a.mime ?? null, a.size ?? null, a.uri, a.kind, now]);
    this.changes.record('attachments', id, 'insert', 1);
    this.timeline.add({ entityId: a.entityId, kind: 'attachment', title: `Attached ${a.name}`, actor, occurredAt: now, meta: { attachmentId: id } });
    const att = { ...a, id, createdAt: now };
    bus.emit('attachment.added', { attachment: att, actor });
    return att;
  }
  forEntity(entityId: string): Attachment[] {
    return this.db.all<Row>(`SELECT * FROM attachments WHERE entity_id=? AND deleted_at IS NULL ORDER BY created_at DESC`, [entityId]).map(toAttachment);
  }
  /** The record's cover photo (photo header), if any. */
  cover(entityId: string): Attachment | null {
    const r = this.db.get<Row>(`SELECT * FROM attachments WHERE entity_id=? AND kind='cover' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1`, [entityId]);
    return r ? toAttachment(r) : null;
  }
  /** Replace the cover photo; the previous one is soft-deleted. */
  setCover(a: Omit<Attachment, 'id' | 'createdAt' | 'kind'>, actor: Actor = 'user'): Attachment {
    const prev = this.cover(a.entityId);
    if (prev) this.remove(prev.id);
    return this.add({ ...a, kind: 'cover' }, actor);
  }
  remove(id: string) {
    this.db.run(`UPDATE attachments SET deleted_at=? WHERE id=?`, [Date.now(), id]);
    this.changes.record('attachments', id, 'delete', 1);
    bus.emit('data.changed', { table: 'attachments', id: id });
  }
}
function toAttachment(r: Row): Attachment {
  return { id: r.id as string, entityId: r.entity_id as string, name: r.name as string, mime: (r.mime as string | null) ?? null, size: (r.size as number | null) ?? null, uri: r.uri as string, kind: r.kind as Attachment['kind'], createdAt: r.created_at as number };
}

/* ------------------------------------------------------------------ */
/* Comments                                                            */
/* ------------------------------------------------------------------ */

export class CommentRepo {
  constructor(private db: DatabaseAdapter, private timeline: TimelineRepo, private changes: ChangeLog) {}
  add(entityId: string, body: string, author: Comment['author'] = 'user'): Comment {
    const now = Date.now();
    const id = newId(now);
    this.db.run(`INSERT INTO comments(id,entity_id,body,author,created_at,updated_at) VALUES (?,?,?,?,?,?)`, [id, entityId, body, author, now, now]);
    this.changes.record('comments', id, 'insert', 1);
    this.timeline.add({ entityId, kind: 'comment', title: 'Comment', body, actor: author, occurredAt: now, meta: { commentId: id } });
    const c: Comment = { id, entityId, body, author, createdAt: now, updatedAt: now };
    bus.emit('comment.added', { comment: c, actor: author });
    return c;
  }
  forEntity(entityId: string): Comment[] {
    return this.db.all<Row>(`SELECT * FROM comments WHERE entity_id=? AND deleted_at IS NULL ORDER BY created_at ASC`, [entityId]).map((r) => ({
      id: r.id as string, entityId: r.entity_id as string, body: r.body as string, author: r.author as Comment['author'], createdAt: r.created_at as number, updatedAt: r.updated_at as number,
    }));
  }
  remove(id: string) {
    this.db.run(`UPDATE comments SET deleted_at=? WHERE id=?`, [Date.now(), id]);
    bus.emit('data.changed', { table: 'comments', id: id });
  }
}

/* ------------------------------------------------------------------ */
/* Reminders                                                           */
/* ------------------------------------------------------------------ */

export class ReminderRepo {
  constructor(private db: DatabaseAdapter, private timeline: TimelineRepo, private changes: ChangeLog) {}

  create(r: { entityId?: string | null; title: string; body?: string | null; dueAt: number; rrule?: string | null }, actor: Actor = 'user'): Reminder {
    const now = Date.now();
    const id = newId(now);
    const nextAt = r.dueAt;
    this.db.run(`INSERT INTO reminders(id,entity_id,title,body,due_at,rrule,next_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, [id, r.entityId ?? null, r.title, r.body ?? null, r.dueAt, r.rrule ?? null, nextAt, now, now]);
    this.changes.record('reminders', id, 'insert', 1);
    if (r.entityId) this.timeline.add({ entityId: r.entityId, kind: 'reminder', title: `Reminder set: ${r.title}`, actor, occurredAt: now, meta: { reminderId: id, dueAt: r.dueAt } });
    const rem: Reminder = { id, entityId: r.entityId ?? null, title: r.title, body: r.body ?? null, dueAt: r.dueAt, rrule: r.rrule ?? null, nextAt, doneAt: null, snoozedUntil: null, notificationId: null, createdAt: now, updatedAt: now };
    bus.emit('reminder.created', { reminder: rem, actor });
    return rem;
  }

  get(id: string): Reminder | undefined {
    const r = this.db.get<Row>(`SELECT * FROM reminders WHERE id=? AND deleted_at IS NULL`, [id]);
    return r ? toReminder(r) : undefined;
  }
  forEntity(entityId: string): Reminder[] {
    return this.db.all<Row>(`SELECT * FROM reminders WHERE entity_id=? AND deleted_at IS NULL ORDER BY next_at ASC`, [entityId]).map(toReminder);
  }
  upcoming(limit = 50, before?: number): Reminder[] {
    const params: (number | string)[] = [];
    let sql = `SELECT * FROM reminders WHERE deleted_at IS NULL AND done_at IS NULL`;
    if (before) {
      sql += ` AND COALESCE(snoozed_until, next_at) <= ?`;
      params.push(before);
    }
    sql += ` ORDER BY COALESCE(snoozed_until, next_at) ASC LIMIT ?`;
    params.push(limit);
    return this.db.all<Row>(sql, params).map(toReminder);
  }
  /** Mark done. Recurring reminders roll forward instead of closing. */
  complete(id: string, actor: Actor = 'user'): Reminder | undefined {
    const r = this.get(id);
    if (!r) return;
    const now = Date.now();
    if (r.rrule) {
      const next = nextOccurrence(r.rrule, r.nextAt ?? r.dueAt, now);
      this.db.run(`UPDATE reminders SET next_at=?, snoozed_until=NULL, notification_id=NULL, updated_at=?, version=version+1 WHERE id=?`, [next, now, id]);
    } else {
      this.db.run(`UPDATE reminders SET done_at=?, snoozed_until=NULL, updated_at=?, version=version+1 WHERE id=?`, [now, now, id]);
    }
    this.changes.record('reminders', id, 'update', 1);
    if (r.entityId) this.timeline.add({ entityId: r.entityId, kind: 'reminder', title: `Reminder done: ${r.title}`, actor, occurredAt: now });
    const updated = this.get(id)!;
    bus.emit('reminder.completed', { reminder: updated, actor });
    return updated;
  }
  snooze(id: string, until: number) {
    this.db.run(`UPDATE reminders SET snoozed_until=?, notification_id=NULL, updated_at=?, version=version+1 WHERE id=?`, [until, Date.now(), id]);
    bus.emit('data.changed', { table: 'reminders', id: id });
  }
  setNotificationId(id: string, notificationId: string | null) {
    this.db.run(`UPDATE reminders SET notification_id=? WHERE id=?`, [notificationId, id]);
  }
  remove(id: string) {
    this.db.run(`UPDATE reminders SET deleted_at=? WHERE id=?`, [Date.now(), id]);
    this.changes.record('reminders', id, 'delete', 1);
    bus.emit('data.changed', { table: 'reminders', id: id });
  }
}
function toReminder(r: Row): Reminder {
  return {
    id: r.id as string, entityId: (r.entity_id as string | null) ?? null, title: r.title as string, body: (r.body as string | null) ?? null, dueAt: r.due_at as number, rrule: (r.rrule as string | null) ?? null,
    nextAt: (r.next_at as number | null) ?? null, doneAt: (r.done_at as number | null) ?? null, snoozedUntil: (r.snoozed_until as number | null) ?? null, notificationId: (r.notification_id as string | null) ?? null,
    createdAt: r.created_at as number, updatedAt: r.updated_at as number,
  };
}

/* ------------------------------------------------------------------ */
/* Custom fields (user-defined per entity type)                        */
/* ------------------------------------------------------------------ */

export class CustomFieldRepo {
  constructor(private db: DatabaseAdapter) {}
  forType(entityType: string): CustomFieldDef[] {
    return this.db.all<Row>(`SELECT * FROM custom_field_defs WHERE entity_type=? AND deleted_at IS NULL ORDER BY sort_order, created_at`, [entityType]).map((r) => ({
      id: r.id as string, entityType: r.entity_type as string, key: r.key as string, label: r.label as string, fieldType: r.field_type as CustomFieldDef['fieldType'], options: safeJson(r.options as string) as CustomFieldDef['options'], sortOrder: r.sort_order as number,
    }));
  }
  add(def: Omit<CustomFieldDef, 'id' | 'sortOrder'> & { sortOrder?: number }): CustomFieldDef {
    const now = Date.now();
    const id = newId(now);
    const key = def.key.replace(/[^a-zA-Z0-9_]/g, '_');
    this.db.run(`INSERT INTO custom_field_defs(id,entity_type,key,label,field_type,options,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?)`, [id, def.entityType, key, def.label, def.fieldType, JSON.stringify(def.options ?? {}), def.sortOrder ?? 0, now]);
    bus.emit('data.changed', { table: 'custom_field_defs', id: id });
    return { ...def, key, id, sortOrder: def.sortOrder ?? 0 };
  }
  remove(id: string) {
    this.db.run(`UPDATE custom_field_defs SET deleted_at=? WHERE id=?`, [Date.now(), id]);
    bus.emit('data.changed', { table: 'custom_field_defs', id: id });
  }
}

/* ------------------------------------------------------------------ */
/* Saved views                                                         */
/* ------------------------------------------------------------------ */

export interface SavedView extends SavedViewDef {
  id: string;
  entityType: string;
  sortOrder: number;
}

export class ViewRepo {
  constructor(private db: DatabaseAdapter) {}
  forType(entityType: string): SavedView[] {
    return this.db.all<Row>(`SELECT * FROM saved_views WHERE entity_type=? AND deleted_at IS NULL ORDER BY sort_order, created_at`, [entityType]).map(toView);
  }
  get(id: string): SavedView | undefined {
    const r = this.db.get<Row>(`SELECT * FROM saved_views WHERE id=? AND deleted_at IS NULL`, [id]);
    return r ? toView(r) : undefined;
  }
  save(entityType: string, v: SavedViewDef & { sortOrder?: number }): SavedView {
    const now = Date.now();
    if (v.id && this.get(v.id)) {
      this.db.run(`UPDATE saved_views SET name=?, icon=?, definition=?, is_default=?, updated_at=? WHERE id=?`, [v.name, v.icon ?? null, JSON.stringify(v.definition), v.isDefault ? 1 : 0, now, v.id]);
      bus.emit('data.changed', { table: 'saved_views', id: v.id });
      return this.get(v.id)!;
    }
    const id = v.id ?? newId(now);
    this.db.run(`INSERT INTO saved_views(id,entity_type,name,icon,definition,is_default,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`, [id, entityType, v.name, v.icon ?? null, JSON.stringify(v.definition), v.isDefault ? 1 : 0, v.sortOrder ?? 0, now, now]);
    bus.emit('data.changed', { table: 'saved_views', id: id });
    return this.get(id)!;
  }
  remove(id: string) {
    this.db.run(`UPDATE saved_views SET deleted_at=? WHERE id=?`, [Date.now(), id]);
    bus.emit('data.changed', { table: 'saved_views', id: id });
  }
}
function toView(r: Row): SavedView {
  return { id: r.id as string, entityType: r.entity_type as string, name: r.name as string, icon: (r.icon as string | null) ?? undefined, definition: safeJson(r.definition as string) as ViewDefinition, isDefault: !!r.is_default, sortOrder: r.sort_order as number };
}

/* ------------------------------------------------------------------ */
/* Dashboards                                                          */
/* ------------------------------------------------------------------ */

export class DashboardRepo {
  constructor(private db: DatabaseAdapter) {}
  all(): Dashboard[] {
    return this.db.all<Row>(`SELECT * FROM dashboards WHERE deleted_at IS NULL ORDER BY sort_order, created_at`).map(toDashboard);
  }
  get(id: string): Dashboard | undefined {
    const r = this.db.get<Row>(`SELECT * FROM dashboards WHERE id=? AND deleted_at IS NULL`, [id]);
    return r ? toDashboard(r) : undefined;
  }
  create(name: string, icon?: string, layout: WidgetInstance[] = []): Dashboard {
    const now = Date.now();
    const id = newId(now);
    const order = Number(this.db.get<{ n: number }>(`SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM dashboards`)?.n ?? 0);
    this.db.run(`INSERT INTO dashboards(id,name,icon,layout,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`, [id, name, icon ?? null, JSON.stringify(layout), order, now, now]);
    bus.emit('data.changed', { table: 'dashboards', id: id });
    return { id, name, icon: icon ?? null, layout, sortOrder: order };
  }
  setLayout(id: string, layout: WidgetInstance[]) {
    this.db.run(`UPDATE dashboards SET layout=?, updated_at=? WHERE id=?`, [JSON.stringify(layout), Date.now(), id]);
    bus.emit('data.changed', { table: 'dashboards', id: id });
  }
  rename(id: string, name: string, icon?: string) {
    this.db.run(`UPDATE dashboards SET name=?, icon=COALESCE(?, icon), updated_at=? WHERE id=?`, [name, icon ?? null, Date.now(), id]);
    bus.emit('data.changed', { table: 'dashboards', id: id });
  }
  remove(id: string) {
    this.db.run(`UPDATE dashboards SET deleted_at=? WHERE id=?`, [Date.now(), id]);
    bus.emit('data.changed', { table: 'dashboards', id: id });
  }
  addWidget(id: string, w: Omit<WidgetInstance, 'id'>): WidgetInstance {
    const d = this.get(id);
    if (!d) throw new Error('dashboard missing');
    const inst: WidgetInstance = { ...w, id: newId() };
    this.setLayout(id, [...d.layout, inst]);
    return inst;
  }
}
function toDashboard(r: Row): Dashboard {
  let layout: WidgetInstance[] = [];
  try {
    layout = JSON.parse(r.layout as string) as WidgetInstance[];
  } catch {
    layout = [];
  }
  return { id: r.id as string, name: r.name as string, icon: (r.icon as string | null) ?? null, layout, sortOrder: r.sort_order as number };
}

/* ------------------------------------------------------------------ */
/* Key-value settings                                                  */
/* ------------------------------------------------------------------ */

export class SettingsRepo {
  constructor(private db: DatabaseAdapter) {}
  get<T = unknown>(key: string, fallback: T): T {
    const r = this.db.get<{ value: string }>(`SELECT value FROM settings WHERE key=?`, [key]);
    if (!r) return fallback;
    try {
      return JSON.parse(r.value) as T;
    } catch {
      return fallback;
    }
  }
  set(key: string, value: unknown) {
    this.db.run(`INSERT INTO settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`, [key, JSON.stringify(value), Date.now()]);
  }
  all(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const r of this.db.all<{ key: string; value: string }>(`SELECT key,value FROM settings`)) {
      try {
        out[r.key] = JSON.parse(r.value);
      } catch {
        /* ignore */
      }
    }
    return out;
  }
}

/* ------------------------------------------------------------------ */
/* Installed modules                                                   */
/* ------------------------------------------------------------------ */

export class ModuleRepo {
  constructor(private db: DatabaseAdapter) {}
  installed(): Array<{ id: string; version: string; enabled: boolean; settings: Record<string, unknown> }> {
    return this.db.all<Row>(`SELECT * FROM modules`).map((r) => ({ id: r.id as string, version: r.version as string, enabled: !!r.enabled, settings: safeJson(r.settings as string) }));
  }
  isInstalled(id: string) {
    return !!this.db.get(`SELECT id FROM modules WHERE id=?`, [id]);
  }
  install(id: string, version: string) {
    this.db.run(`INSERT INTO modules(id,version,enabled,settings,installed_at) VALUES (?,?,1,'{}',?) ON CONFLICT(id) DO UPDATE SET version=excluded.version`, [id, version, Date.now()]);
  }
  setEnabled(id: string, enabled: boolean) {
    this.db.run(`UPDATE modules SET enabled=? WHERE id=?`, [enabled ? 1 : 0, id]);
  }
}
