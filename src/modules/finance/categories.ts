import type { LifeOSContext } from '@core/registry/context';
import type { FieldDef, FieldOption } from '@core/domain/types';
import { bus } from '@core/events/bus';
import { palette } from '@ui/theme/tokens';
import { CATEGORIES } from './types';

/**
 * Your own spending categories ("Pets", "Gym"): kept in settings and merged
 * into the built-in list, so every picker, chart, budget and keyword rule
 * sees them. Deleting one moves its transactions to Other.
 */

export interface CustomCategory {
  value: string;
  label: string;
  color: string;
  icon: string;
}

const KEY = 'finance.customCategories';
const BUILTIN = CATEGORIES.slice();
/** Colours offered for a new category, in turn. */
export const CATEGORY_COLORS = [palette.orange, palette.blue, palette.pink, palette.purple, palette.teal, palette.red, palette.yellow, palette.indigo, palette.green, palette.brown];
/** Icons offered for a category. */
export const CATEGORY_ICONS = ['tag', 'heart', 'gift', 'cart', 'bag', 'car', 'plane', 'food', 'film', 'book', 'activity', 'leaf', 'shirt', 'cash', 'briefcase', 'home', 'phone', 'drop', 'flame', 'cake'];

/** Category pickers to keep in step (each select field's options array, filtered as it was built). */
const pickers: Array<{ options: FieldOption[]; keep: (v: string) => boolean }> = [];

/** Register a select field whose options are the category list (done once per field at start). */
export function trackCategoryField(field: FieldDef | undefined) {
  if (!field?.options || pickers.some((p) => p.options === field.options)) return;
  const present = new Set(field.options.map((o) => o.value));
  const excluded = new Set(BUILTIN.map((c) => c.value).filter((v) => !present.has(v)));
  pickers.push({ options: field.options, keep: (v) => !excluded.has(v) });
  field.onCreateOption = (label: string) => (current ? addCategory(current, { label }) : null);
}

let current: LifeOSContext | null = null;

export function customCategories(os: LifeOSContext): CustomCategory[] {
  return os.settings.get<CustomCategory[]>(KEY, []);
}

/** Put the custom categories into the shared list (before Fees / Transfer / Other) and every picker. */
export function applyCategories(os: LifeOSContext) {
  current = os;
  const custom = customCategories(os);
  const at = BUILTIN.findIndex((c) => c.value === 'fees');
  const merged = [...BUILTIN.slice(0, at), ...custom, ...BUILTIN.slice(at)];
  CATEGORIES.splice(0, CATEGORIES.length, ...merged);
  for (const p of pickers) p.options.splice(0, p.options.length, ...merged.filter((c) => p.keep(c.value)).map(({ value, label, color }) => ({ value, label, color })));
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);

function save(os: LifeOSContext, list: CustomCategory[]) {
  os.settings.set(KEY, list);
  applyCategories(os);
  bus.emit('data.changed', { table: 'settings', id: KEY });
}

/** A new category (or the existing one with that name). Returns it as a picker option. */
export function addCategory(os: LifeOSContext, c: { label: string; color?: string; icon?: string }): CustomCategory | null {
  const label = c.label.trim().replace(/\s+/g, ' ');
  if (!label) return null;
  const same = CATEGORIES.find((x) => x.label.toLowerCase() === label.toLowerCase());
  if (same) return { value: same.value, label: same.label, color: same.color ?? palette.gray, icon: same.icon };
  const list = customCategories(os);
  let value = `c_${slug(label) || 'category'}`;
  for (let i = 2; CATEGORIES.some((x) => x.value === value); i++) value = `c_${slug(label)}_${i}`;
  const cat: CustomCategory = { value, label: label.charAt(0).toUpperCase() + label.slice(1), color: c.color ?? CATEGORY_COLORS[list.length % CATEGORY_COLORS.length]!, icon: c.icon ?? 'tag' };
  save(os, [...list, cat]);
  return cat;
}

export function updateCategory(os: LifeOSContext, value: string, patch: Partial<Omit<CustomCategory, 'value'>>) {
  save(
    os,
    customCategories(os).map((c) => (c.value === value ? { ...c, ...patch, label: patch.label?.trim() || c.label } : c)),
  );
}

/** Remove a category; its transactions, budgets and subscriptions move to Other, keyword rules to it are dropped. Returns how many records moved. */
export function deleteCategory(os: LifeOSContext, value: string): number {
  let moved = 0;
  os.db.transaction(() => {
    for (const type of ['transaction', 'budget', 'subscription']) {
      if (!os.registry.entityTypes.has(type)) continue;
      for (const e of os.entities.query<{ category?: string }>(type, { filter: { and: [{ field: 'data.category', op: 'eq', value }] } }, { limit: 100000 })) {
        os.entities.update(e.id, { data: { category: 'other' } }, 'user');
        moved++;
      }
    }
  });
  const rules = os.settings.get<Array<{ keyword: string; category: string }>>('categoryRules', []);
  if (rules.some((r) => r.category === value)) os.settings.set('categoryRules', rules.filter((r) => r.category !== value));
  const learned = os.settings.get<Record<string, string>>('merchantCategories', {});
  if (Object.values(learned).includes(value)) os.settings.set('merchantCategories', Object.fromEntries(Object.entries(learned).filter(([, v]) => v !== value)));
  save(
    os,
    customCategories(os).filter((c) => c.value !== value),
  );
  return moved;
}
