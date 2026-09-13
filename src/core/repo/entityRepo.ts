import type { DatabaseAdapter, Row, SqlParam } from '../db/adapter';
import type { Entity, EntityRef, EntityTypeDef, ViewDefinition } from '../domain/types';
import { newId } from '../domain/ids';
import { bus, type Actor } from '../events/bus';
import type { Registry } from '../registry/registry';
import { compileGroup, compileSort, fieldExpr } from '../query/filter';
import { ChangeLog } from '../sync/changeLog';
import { TimelineRepo } from './timelineRepo';
import { SearchIndex } from '../search/searchIndex';

export interface CreateInput<T = Record<string, unknown>> {
  type: string;
  title?: string;
  subtitle?: string | null;
  data: T;
  status?: string | null;
  occurredAt?: number | null;
  starred?: boolean;
  id?: string;
  createdAt?: number;
}

export interface UpdateInput<T = Record<string, unknown>> {
  title?: string;
  subtitle?: string | null;
  data?: Partial<T>;
  status?: string | null;
  occurredAt?: number | null;
  starred?: boolean;
  archived?: boolean;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
}

export interface AggregateSpec {
  sum?: string[];
  avg?: string[];
  count?: boolean;
  min?: string[];
  max?: string[];
}

function rowToEntity(r: Row): Entity {
  return {
    id: r.id as string,
    type: r.type as string,
    title: (r.title as string) ?? '',
    subtitle: (r.subtitle as string | null) ?? null,
    data: safeJson(r.data as string),
    status: (r.status as string | null) ?? null,
    starred: !!r.starred,
    archived: !!r.archived,
    occurredAt: (r.occurred_at as number | null) ?? null,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
    version: r.version as number,
  };
}

export function safeJson(s: string | null | undefined): Record<string, unknown> {
  if (!s) return {};
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Generic, type-aware entity store. Every write:
 *  1. validates `data` against the registered zod schema,
 *  2. derives title/subtitle/occurredAt via the type def,
 *  3. bumps version + appends to the change log,
 *  4. writes a timeline event,
 *  5. updates the FTS index,
 *  6. emits a bus event (automation, UI cache, AI all listen).
 */
export class EntityRepo {
  readonly timeline: TimelineRepo;
  readonly search: SearchIndex;
  private changes: ChangeLog;
  formatCurrency: (n: number, c?: string) => string = (n, c = 'INR') => `${c} ${n.toFixed(2)}`;
  /** Injected at boot; keeps `data.<relationField>` and the relations table in sync. */
  syncRelations: ((entity: Entity, def: EntityTypeDef, actor: Actor) => void) | null = null;

  constructor(private db: DatabaseAdapter, private registry: Registry) {
    this.timeline = new TimelineRepo(db);
    this.search = new SearchIndex(db);
    this.changes = new ChangeLog(db);
  }

  private def(type: string): EntityTypeDef {
    return this.registry.type(type);
  }

  private derive(def: EntityTypeDef, data: Record<string, unknown>, title?: string, subtitle?: string | null, occurredAt?: number | null) {
    const t = title?.trim() || def.computeTitle?.(data) || def.label;
    const st = subtitle !== undefined ? subtitle : def.computeSubtitle?.(data, { formatCurrency: this.formatCurrency }) ?? null;
    let occ = occurredAt ?? null;
    if (occ == null && def.occurredAtField) {
      const v = data[def.occurredAtField];
      if (typeof v === 'number') occ = v;
      else if (typeof v === 'string' && v) occ = new Date(v).getTime();
    }
    return { title: t, subtitle: st, occurredAt: occ };
  }

  create<T extends object>(input: CreateInput<T>, actor: Actor = 'user'): Entity<T> {
    const def = this.def(input.type);
    const data = def.schema.parse(input.data) as T;
    const now = input.createdAt ?? Date.now();
    const id = input.id ?? newId(now);
    const d = this.derive(def, data as Record<string, unknown>, input.title, input.subtitle, input.occurredAt);
    const entity: Entity<T> = {
      id,
      type: input.type,
      title: d.title,
      subtitle: d.subtitle,
      data,
      status: input.status ?? def.statuses?.[0]?.value ?? null,
      starred: !!input.starred,
      archived: false,
      occurredAt: d.occurredAt,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      version: 1,
    };
    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO entities(id,type,title,subtitle,data,status,starred,archived,occurred_at,created_at,updated_at,deleted_at,version)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, entity.type, entity.title, entity.subtitle ?? null, JSON.stringify(data), entity.status ?? null, entity.starred ? 1 : 0, 0, entity.occurredAt ?? null, now, now, null, 1],
      );
      this.changes.record('entities', id, 'insert', 1);
      this.timeline.add({ entityId: id, kind: 'created', title: `${def.label} created`, actor, occurredAt: now });
      this.search.index(entity as Entity, def);
      this.syncRelations?.(entity as Entity, def, actor);
    });
    bus.emit('entity.created', { entity: entity as Entity, actor });
    return entity;
  }

  get<T = Record<string, unknown>>(id: string): Entity<T> | undefined {
    const r = this.db.get(`SELECT * FROM entities WHERE id = ? AND deleted_at IS NULL`, [id]);
    return r ? (rowToEntity(r) as Entity<T>) : undefined;
  }

  getMany(ids: string[]): Entity[] {
    if (!ids.length) return [];
    const rows = this.db.all(`SELECT * FROM entities WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`, ids);
    const map = new Map(rows.map((r) => [r.id as string, rowToEntity(r)]));
    return ids.map((i) => map.get(i)).filter((x): x is Entity => !!x);
  }

  ref(id: string): EntityRef | undefined {
    const r = this.db.get<{ id: string; type: string; title: string }>(`SELECT id,type,title FROM entities WHERE id = ? AND deleted_at IS NULL`, [id]);
    return r ?? undefined;
  }

  update<T extends object>(id: string, patch: UpdateInput<T>, actor: Actor = 'user'): Entity<T> {
    const previous = this.get<T>(id);
    if (!previous) throw new Error(`Entity ${id} not found`);
    const def = this.def(previous.type);
    const mergedData = patch.data ? def.schema.parse({ ...(previous.data as object), ...(patch.data as object) }) : previous.data;
    const now = Date.now();
    const d = this.derive(def, mergedData as Record<string, unknown>, patch.title ?? (patch.title === undefined && !previous.title ? undefined : previous.title), patch.subtitle, patch.occurredAt ?? previous.occurredAt);
    // If the user never customised the title, keep it derived from data.
    const derivedPrev = def.computeTitle?.(previous.data as Record<string, unknown>);
    const title = patch.title !== undefined ? d.title : derivedPrev && previous.title === derivedPrev ? def.computeTitle!(mergedData as Record<string, unknown>) : previous.title;
    const subtitle = patch.subtitle !== undefined ? patch.subtitle : def.computeSubtitle ? def.computeSubtitle(mergedData as Record<string, unknown>, { formatCurrency: this.formatCurrency }) ?? null : previous.subtitle ?? null;
    const status = patch.status !== undefined ? patch.status : previous.status ?? null;
    const next: Entity<T> = {
      ...previous,
      title,
      subtitle,
      data: mergedData as T,
      status,
      starred: patch.starred ?? previous.starred,
      archived: patch.archived ?? previous.archived,
      occurredAt: patch.occurredAt !== undefined ? patch.occurredAt : d.occurredAt ?? previous.occurredAt ?? null,
      updatedAt: now,
      version: previous.version + 1,
    };
    const changed = diffKeys(previous as Entity, next as Entity);
    if (!changed.length) return previous;
    this.db.transaction(() => {
      this.db.run(
        `UPDATE entities SET title=?, subtitle=?, data=?, status=?, starred=?, archived=?, occurred_at=?, updated_at=?, version=? WHERE id=?`,
        [next.title, next.subtitle ?? null, JSON.stringify(next.data), next.status ?? null, next.starred ? 1 : 0, next.archived ? 1 : 0, next.occurredAt ?? null, now, next.version, id],
      );
      this.changes.record('entities', id, 'update', next.version);
      if (previous.status !== next.status) {
        this.timeline.add({ entityId: id, kind: 'status', title: `Status → ${labelFor(def, next.status)}`, actor, occurredAt: now, meta: { from: previous.status, to: next.status } });
      } else {
        const human = changed.filter((k) => !['updatedAt', 'version', 'subtitle'].includes(k)).map((k) => k.replace(/^data\./, ''));
        if (human.length) this.timeline.add({ entityId: id, kind: 'updated', title: `Updated ${human.slice(0, 4).join(', ')}${human.length > 4 ? '…' : ''}`, actor, occurredAt: now, meta: { changed: human } });
      }
      this.search.index(next as Entity, def);
      if (changed.some((k) => k.startsWith('data.'))) this.syncRelations?.(next as Entity, def, actor);
    });
    bus.emit('entity.updated', { entity: next as Entity, previous: previous as Entity, changed, actor });
    if (previous.status !== next.status) bus.emit('entity.status', { entity: next as Entity, from: previous.status ?? null, to: next.status ?? null, actor });
    return next;
  }

  setStatus(id: string, status: string | null, actor: Actor = 'user') {
    return this.update(id, { status }, actor);
  }

  delete(id: string, actor: Actor = 'user'): void {
    const e = this.get(id);
    if (!e) return;
    const now = Date.now();
    this.db.transaction(() => {
      this.db.run(`UPDATE entities SET deleted_at=?, updated_at=?, version=version+1 WHERE id=?`, [now, now, id]);
      this.db.run(`UPDATE relations SET deleted_at=? WHERE deleted_at IS NULL AND (from_id=? OR to_id=?)`, [now, id, id]);
      this.changes.record('entities', id, 'delete', e.version + 1);
      this.search.remove(id);
    });
    bus.emit('entity.deleted', { entity: e, actor });
  }

  restore(id: string): void {
    this.db.run(`UPDATE entities SET deleted_at=NULL, updated_at=?, version=version+1 WHERE id=?`, [Date.now(), id]);
    const e = this.get(id);
    if (e) this.search.index(e, this.def(e.type));
  }

  /** The universal query: same DSL for screens, widgets, automations and AI. */
  query<T = Record<string, unknown>>(type: string | string[] | null, view: ViewDefinition = {}, opts: QueryOptions = {}): Entity<T>[] {
    const { where, params } = this.buildWhere(type, view);
    const sort = compileSort(view.sort);
    const limit = opts.limit ?? 200;
    const offset = opts.offset ?? 0;
    const rows = this.db.all(`SELECT e.* FROM entities e WHERE ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`, [...params, limit, offset]);
    return rows.map(rowToEntity) as Entity<T>[];
  }

  count(type: string | string[] | null, view: ViewDefinition = {}): number {
    const { where, params } = this.buildWhere(type, view);
    return (this.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM entities e WHERE ${where}`, params)?.n as number) ?? 0;
  }

  aggregate(type: string | string[] | null, view: ViewDefinition, spec: AggregateSpec): Record<string, number> {
    const { where, params } = this.buildWhere(type, view);
    const cols: string[] = [];
    for (const f of spec.sum ?? []) cols.push(`COALESCE(SUM(${fieldExpr(f)}),0) AS "sum_${f}"`);
    for (const f of spec.avg ?? []) cols.push(`COALESCE(AVG(${fieldExpr(f)}),0) AS "avg_${f}"`);
    for (const f of spec.min ?? []) cols.push(`MIN(${fieldExpr(f)}) AS "min_${f}"`);
    for (const f of spec.max ?? []) cols.push(`MAX(${fieldExpr(f)}) AS "max_${f}"`);
    if (spec.count || !cols.length) cols.push(`COUNT(*) AS count`);
    const r = this.db.get(`SELECT ${cols.join(', ')} FROM entities e WHERE ${where}`, params) ?? {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(r)) out[k] = Number(v ?? 0);
    return out;
  }

  /** Group + aggregate, e.g. spend by category or count by status. */
  groupBy(type: string | string[] | null, view: ViewDefinition, groupField: string, spec: AggregateSpec = { count: true }): Array<{ key: string | null; values: Record<string, number> }> {
    const { where, params } = this.buildWhere(type, view);
    const g = fieldExpr(groupField);
    const cols: string[] = [`${g} AS grp`];
    for (const f of spec.sum ?? []) cols.push(`COALESCE(SUM(${fieldExpr(f)}),0) AS "sum_${f}"`);
    for (const f of spec.avg ?? []) cols.push(`COALESCE(AVG(${fieldExpr(f)}),0) AS "avg_${f}"`);
    cols.push(`COUNT(*) AS count`);
    const rows = this.db.all(`SELECT ${cols.join(', ')} FROM entities e WHERE ${where} GROUP BY grp ORDER BY 2 DESC`, params);
    return rows.map((r) => {
      const { grp, ...rest } = r;
      const values: Record<string, number> = {};
      for (const [k, v] of Object.entries(rest)) values[k] = Number(v ?? 0);
      return { key: grp == null ? null : String(grp), values };
    });
  }

  /** Time-bucketed aggregate for charts: day | week | month. */
  series(type: string | string[] | null, view: ViewDefinition, bucket: 'day' | 'week' | 'month', sumField?: string, timeField = 'occurredAt'): Array<{ bucket: string; sum: number; count: number }> {
    const { where, params } = this.buildWhere(type, view);
    const t = fieldExpr(timeField);
    const fmt = bucket === 'day' ? '%Y-%m-%d' : bucket === 'week' ? '%Y-W%W' : '%Y-%m';
    const sum = sumField ? `COALESCE(SUM(${fieldExpr(sumField)}),0)` : `0`;
    const rows = this.db.all<{ b: string; s: number; c: number }>(
      `SELECT strftime('${fmt}', ${t}/1000, 'unixepoch', 'localtime') AS b, ${sum} AS s, COUNT(*) AS c FROM entities e WHERE ${where} AND ${t} IS NOT NULL GROUP BY b ORDER BY b ASC`,
      params,
    );
    return rows.map((r) => ({ bucket: r.b, sum: Number(r.s), count: Number(r.c) }));
  }

  private buildWhere(type: string | string[] | null, view: ViewDefinition): { where: string; params: SqlParam[] } {
    const params: SqlParam[] = [];
    const parts: string[] = ['e.deleted_at IS NULL'];
    if (type) {
      const types = Array.isArray(type) ? type : [type];
      parts.push(`e.type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }
    if (!view.includeArchived) parts.push('e.archived = 0');
    if (view.search?.trim()) {
      params.push(`%${view.search.trim()}%`, `%${view.search.trim()}%`);
      parts.push(`(e.title LIKE ? COLLATE NOCASE OR e.subtitle LIKE ? COLLATE NOCASE)`);
    }
    parts.push(compileGroup(view.filter, params));
    return { where: parts.join(' AND '), params };
  }

  /** Recently touched entities of any type — powers "Recents" and the AI context. */
  recent(limit = 20, types?: string[]): Entity[] {
    const params: SqlParam[] = [];
    let where = 'deleted_at IS NULL AND archived = 0';
    if (types?.length) {
      where += ` AND type IN (${types.map(() => '?').join(',')})`;
      params.push(...types);
    }
    params.push(limit);
    return this.db.all(`SELECT * FROM entities WHERE ${where} ORDER BY updated_at DESC LIMIT ?`, params).map(rowToEntity);
  }

  countsByType(): Record<string, number> {
    const rows = this.db.all<{ type: string; n: number }>(`SELECT type, COUNT(*) AS n FROM entities WHERE deleted_at IS NULL AND archived = 0 GROUP BY type`);
    return Object.fromEntries(rows.map((r) => [r.type, Number(r.n)]));
  }

  /** Create expression indexes declared by a type (idempotent, safe on every start). */
  ensureIndexes(def: EntityTypeDef) {
    for (const key of def.indexed ?? []) {
      if (!/^[a-zA-Z0-9_]+$/.test(key)) continue;
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_data_${def.type}_${key} ON entities(type, json_extract(data,'$.${key}')) WHERE type='${def.type}'`);
    }
  }
}

function diffKeys(a: Entity, b: Entity): string[] {
  const out: string[] = [];
  for (const k of ['title', 'subtitle', 'status', 'starred', 'archived', 'occurredAt'] as const) {
    if (a[k] !== b[k]) out.push(k);
  }
  const ad = a.data as Record<string, unknown>;
  const bd = b.data as Record<string, unknown>;
  const keys = new Set([...Object.keys(ad), ...Object.keys(bd)]);
  for (const k of keys) {
    if (JSON.stringify(ad[k]) !== JSON.stringify(bd[k])) out.push(`data.${k}`);
  }
  return out;
}

function labelFor(def: EntityTypeDef, status: string | null | undefined): string {
  if (!status) return 'none';
  return def.statuses?.find((s) => s.value === status)?.label ?? status;
}
