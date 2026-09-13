import type { FilterClause } from '../domain/types';
import type { AutomationContext } from '../registry/types';

/** Resolve "title", "status", "data.amount", "vars.to", "previous.status" from a context. */
export function resolvePath(path: string, ctx: AutomationContext): unknown {
  const [head, ...rest] = path.split('.');
  let root: unknown;
  if (head === 'vars') root = ctx.vars;
  else if (head === 'previous') root = ctx.previous;
  else if (head === 'data') root = ctx.entity?.data;
  else if (head === 'entity') root = ctx.entity;
  else return (ctx.entity as unknown as Record<string, unknown> | undefined)?.[head] ?? ctx.vars[head];
  let cur: unknown = root;
  for (const k of rest) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

export function evaluateCondition(c: FilterClause, ctx: AutomationContext): boolean {
  const v = resolvePath(c.field, ctx);
  const t = c.value;
  switch (c.op) {
    case 'eq':
      return looseEq(v, t);
    case 'neq':
      return !looseEq(v, t);
    case 'gt':
      return Number(v) > Number(t);
    case 'gte':
      return Number(v) >= Number(t);
    case 'lt':
      return Number(v) < Number(t);
    case 'lte':
      return Number(v) <= Number(t);
    case 'contains':
      return String(v ?? '').toLowerCase().includes(String(t ?? '').toLowerCase());
    case 'startsWith':
      return String(v ?? '').toLowerCase().startsWith(String(t ?? '').toLowerCase());
    case 'in':
      return Array.isArray(t) && t.some((x) => looseEq(v, x));
    case 'notIn':
      return !(Array.isArray(t) && t.some((x) => looseEq(v, x)));
    case 'isNull':
      return v == null || v === '';
    case 'notNull':
      return !(v == null || v === '');
    case 'between':
      return Array.isArray(t) && Number(v) >= Number(t[0]) && Number(v) <= Number(t[1]);
    case 'hasTag':
      return Array.isArray(ctx.vars.tags) && (ctx.vars.tags as string[]).map((x) => x.toLowerCase()).includes(String(t).toLowerCase());
    default:
      return false;
  }
}

function looseEq(a: unknown, b: unknown) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/** "{{title}} cost {{data.amount}}" → interpolated string. */
export function renderTemplate(tpl: string, ctx: AutomationContext): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, p) => {
    const v = resolvePath(p, ctx);
    return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
}
