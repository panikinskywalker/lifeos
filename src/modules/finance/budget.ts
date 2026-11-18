import type { LifeOSContext } from '@core/registry/context';
import { incomeInRange, monthRange, spendByCategory } from './lib';
import { categoryTargets, setCategoryTarget } from './categories';

/**
 * A suggested budget (docs/MODEL.md, Suggested budget, 15 Nov; from broke):
 * from your last 3 full months, a monthly limit for each category you spent
 * in at least twice (its middle month, rounded up), against what usually
 * comes in, and what that leaves to save. One tap makes them your targets.
 */

const SKIP = new Set(['other', 'transfer', 'investment']);
const roundUp = (n: number) => (n >= 2000 ? Math.ceil(n / 500) * 500 : Math.ceil(n / 100) * 100);

export interface BudgetSuggestion {
  items: Array<{ category: string; monthly: number }>;
  total: number;
  income: number;
  save: number;
}

export function suggestBudget(os: LifeOSContext, now: number | Date = Date.now()): BudgetSuggestion | null {
  const months = [1, 2, 3].map((k) => monthRange(-k, now));
  const per = months.map((m) => new Map(spendByCategory(os, m.start, m.end).map((c) => [c.category, c.total])));
  const cats = new Set(per.flatMap((m) => [...m.keys()]));
  const items: BudgetSuggestion['items'] = [];
  for (const c of cats) {
    if (!c || SKIP.has(c)) continue;
    const vals = per.map((m) => Math.max(0, m.get(c) ?? 0)).sort((a, b) => a - b);
    if (vals.filter((v) => v > 0).length < 2) continue;
    items.push({ category: c, monthly: roundUp(vals[1]!) });
  }
  if (!items.length) return null;
  items.sort((a, b) => b.monthly - a.monthly);
  const incomes = months.map((m) => incomeInRange(os, m.start, m.end)).filter((x) => x > 0);
  const income = incomes.length ? Math.round(incomes.reduce((a, b) => a + b, 0) / incomes.length) : 0;
  const total = items.reduce((n, i) => n + i.monthly, 0);
  return { items, total, income, save: income - total };
}

/** Make the suggestion your targets; returns what was there for Undo. */
export function adoptBudget(os: LifeOSContext, s: BudgetSuggestion): Record<string, number> {
  const before = categoryTargets(os);
  for (const i of s.items) setCategoryTarget(os, i.category, i.monthly);
  return before;
}

export function undoBudget(os: LifeOSContext, s: BudgetSuggestion, before: Record<string, number>): void {
  for (const i of s.items) setCategoryTarget(os, i.category, before[i.category] ?? null);
}
