/**
 * Your money, counted one way everywhere (docs/MODEL.md layer 2, Money · Your
 * share). A Transaction's amount is what moved in the account; what you spent is
 * your share of it (`share`, empty = all), less refunds; what came in leaves out
 * refunds and counts paybacks (share 0) as nothing.
 */

export interface MoneyLike {
  amount?: number;
  share?: number | null;
  kind?: string;
  refund?: boolean | null;
}

const mine = (d: MoneyLike) => (typeof d.share === 'number' ? d.share : (d.amount ?? 0));

/** What this transaction adds to your spending: an expense at your share; a refund takes its amount away. */
export function spentOf(d: MoneyLike): number {
  if (d.kind === 'expense') return mine(d);
  if (d.kind === 'income' && d.refund) return -(d.amount ?? 0);
  return 0;
}

/** What this transaction adds to what came in: income at your share, never a refund. */
export function incomeOf(d: MoneyLike): number {
  return d.kind === 'income' && !d.refund ? mine(d) : 0;
}

/** The same two rules in SQL, over a records table's `data` column (or `e.data` when aliased). */
export function spentSql(col = 'data'): string {
  const amt = `json_extract(${col},'$.amount')`;
  return `(CASE json_extract(${col},'$.kind') WHEN 'expense' THEN COALESCE(json_extract(${col},'$.share'), ${amt}) WHEN 'income' THEN (CASE WHEN COALESCE(json_extract(${col},'$.refund'),0)=1 THEN -${amt} ELSE 0 END) ELSE 0 END)`;
}

export function incomeSql(col = 'data'): string {
  return `(CASE WHEN json_extract(${col},'$.kind')='income' AND COALESCE(json_extract(${col},'$.refund'),0)=0 THEN COALESCE(json_extract(${col},'$.share'), json_extract(${col},'$.amount')) ELSE 0 END)`;
}

/** Kinds that can move what you spent or what came in (for WHERE clauses). */
export const MONEY_KINDS_SQL = (col = 'data') => `json_extract(${col},'$.kind') IN ('expense','income')`;
