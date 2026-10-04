import type { FilterClause, FilterGroup, SortSpec } from '../domain/types';
import type { SqlParam } from '../db/adapter';

/**
 * Universal filter DSL → SQL. The same ViewDefinition drives list screens,
 * widgets, automation conditions and AI queries, so there is exactly one
 * place that knows how "data.amount > 500 AND hasTag(travel)" becomes SQL.
 */

const ENVELOPE_COLUMNS: Record<string, string> = {
  id: 'e.id',
  object: 'e.object',
  /** @deprecated saved views written before R0 may still say 'type'. */
  type: 'e.object',
  title: 'e.title',
  subtitle: 'e.subtitle',
  status: 'e.status',
  starred: 'e.starred',
  archived: 'e.archived',
  occurredAt: 'e.occurred_at',
  createdAt: 'e.created_at',
  updatedAt: 'e.updated_at',
};

export function fieldExpr(field: string): string {
  if (ENVELOPE_COLUMNS[field]) return ENVELOPE_COLUMNS[field];
  const key = field.startsWith('data.') ? field.slice(5) : field;
  if (!/^[a-zA-Z0-9_.]+$/.test(key)) throw new Error(`Invalid field "${field}"`);
  return `json_extract(e.data, '$.${key}')`;
}

function isGroup(x: FilterClause | FilterGroup): x is FilterGroup {
  return 'and' in x || 'or' in x;
}

/**
 * Dynamic date tokens so saved views stay correct forever:
 *   __TODAY__, __TOMORROW__, __WEEK_START__, __MONTH_START__, __YEAR_START__,
 *   __DAYS_AGO_n__, __DAYS_AHEAD_n__, __NOW__
 * Envelope time fields resolve to epoch ms; data.* fields to yyyy-MM-dd.
 */
export function resolveDateToken(token: string, asEpoch: boolean, now = new Date()): SqlParam | undefined {
  const m = /^__([A-Z_]+?)(?:_(\d+))?__$/.exec(token);
  if (!m) return undefined;
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const n = Number(m[2] ?? 0);
  switch (m[1]) {
    case 'NOW':
      return asEpoch ? now.getTime() : now.toISOString().slice(0, 10);
    case 'TODAY':
      break;
    case 'TOMORROW':
      d.setDate(d.getDate() + 1);
      break;
    case 'WEEK_START':
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      break;
    case 'MONTH_START':
      d.setDate(1);
      break;
    case 'YEAR_START':
      d.setMonth(0, 1);
      break;
    case 'DAYS_AGO':
      d.setDate(d.getDate() - n);
      break;
    case 'DAYS_AHEAD':
      d.setDate(d.getDate() + n);
      break;
    default:
      return undefined;
  }
  if (asEpoch) return d.getTime();
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toParam(v: unknown, field?: string): SqlParam {
  if (typeof v === 'string' && v.startsWith('__') && v.endsWith('__')) {
    const asEpoch = !!field && !field.startsWith('data.') && field in ENVELOPE_COLUMNS;
    const r = resolveDateToken(v, asEpoch);
    if (r !== undefined) return r;
  }
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'string') return v;
  if (v instanceof Date) return v.getTime();
  return JSON.stringify(v);
}

export function compileClause(c: FilterClause, params: SqlParam[]): string {
  const f = c.field === 'tag' || c.op === 'hasTag' ? null : fieldExpr(c.field);
  switch (c.op) {
    case 'eq':
      params.push(toParam(c.value, c.field));
      return `${f} = ?`;
    case 'neq':
      params.push(toParam(c.value, c.field));
      return `(${f} IS NULL OR ${f} != ?)`;
    case 'gt':
      params.push(toParam(c.value, c.field));
      return `${f} > ?`;
    case 'gte':
      params.push(toParam(c.value, c.field));
      return `${f} >= ?`;
    case 'lt':
      params.push(toParam(c.value, c.field));
      return `${f} < ?`;
    case 'lte':
      params.push(toParam(c.value, c.field));
      return `${f} <= ?`;
    case 'between': {
      const [a, b] = c.value as [unknown, unknown];
      params.push(toParam(a, c.field), toParam(b, c.field));
      return `${f} BETWEEN ? AND ?`;
    }
    case 'contains':
      params.push(`%${String(c.value)}%`);
      return `${f} LIKE ? COLLATE NOCASE`;
    case 'startsWith':
      params.push(`${String(c.value)}%`);
      return `${f} LIKE ? COLLATE NOCASE`;
    case 'in': {
      const arr = (c.value as unknown[]) ?? [];
      if (!arr.length) return '0';
      arr.forEach((v) => params.push(toParam(v)));
      return `${f} IN (${arr.map(() => '?').join(',')})`;
    }
    case 'notIn': {
      const arr = (c.value as unknown[]) ?? [];
      if (!arr.length) return '1';
      arr.forEach((v) => params.push(toParam(v)));
      return `(${f} IS NULL OR ${f} NOT IN (${arr.map(() => '?').join(',')}))`;
    }
    case 'isNull':
      return `(${f} IS NULL OR ${f} = '')`;
    case 'notNull':
      return `(${f} IS NOT NULL AND ${f} != '')`;
    case 'hasTag':
      params.push(String(c.value));
      return `EXISTS (SELECT 1 FROM record_tags et JOIN tags t ON t.id = et.tag_id WHERE et.record_id = e.id AND t.name = ? COLLATE NOCASE)`;
    case 'relatedTo': {
      // value: entity id, optional kind via field "relation.<kind>"
      const kind = c.field.startsWith('relation.') ? c.field.slice(9) : null;
      params.push(String(c.value), String(c.value));
      const kindSql = kind ? ` AND r.kind = ?` : '';
      if (kind) params.push(kind);
      return `EXISTS (SELECT 1 FROM links r WHERE r.deleted_at IS NULL AND ((r.from_id = e.id AND r.to_id = ?) OR (r.to_id = e.id AND r.from_id = ?))${kindSql})`;
    }
    default:
      throw new Error(`Unsupported op ${(c as FilterClause).op}`);
  }
}

export function compileGroup(g: FilterGroup | undefined, params: SqlParam[]): string {
  if (!g) return '1';
  const parts: string[] = [];
  if (g.and?.length) parts.push('(' + g.and.map((x) => (isGroup(x) ? compileGroup(x, params) : compileClause(x, params))).join(' AND ') + ')');
  if (g.or?.length) parts.push('(' + g.or.map((x) => (isGroup(x) ? compileGroup(x, params) : compileClause(x, params))).join(' OR ') + ')');
  return parts.length ? parts.join(' AND ') : '1';
}

export function compileSort(sort: SortSpec[] | undefined, fallback = 'e.updated_at DESC'): string {
  if (!sort?.length) return fallback;
  return sort.map((s) => `${fieldExpr(s.field)} ${s.dir === 'asc' ? 'ASC' : 'DESC'}`).join(', ');
}
