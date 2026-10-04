import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { setCategoryRules } from '@core/ingest/ingest';
import { budgetType, CATEGORIES, categoryOf, transactionType } from './types';
import { addCategory, applyCategories, customCategories, deleteCategory, trackCategoryField, updateCategory } from './categories';

let os: LifeOSContext;
const pick = (def: typeof transactionType | typeof budgetType) => def.fields.find((f) => f.key === 'category')!;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [{ id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', objects: [transactionType, budgetType] }], registry: new Registry() });
  for (const d of [transactionType, budgetType]) trackCategoryField(pick(d));
  applyCategories(os);
});
afterEach(() => {
  os.settings.set('finance.customCategories', []);
  applyCategories(os);
  os.db.close();
});

describe('your own categories', () => {
  it('a new category joins the list and every category picker (budgets keep leaving out income kinds)', () => {
    const pets = addCategory(os, { label: 'pets' })!;
    expect(pets).toMatchObject({ value: 'c_pets', label: 'Pets', icon: 'tag' });
    expect(categoryOf('c_pets').label).toBe('Pets');
    expect(pick(transactionType).options!.some((o) => o.value === 'c_pets')).toBe(true);
    expect(pick(budgetType).options!.some((o) => o.value === 'c_pets')).toBe(true);
    expect(pick(budgetType).options!.some((o) => o.value === 'salary')).toBe(false);
    // Before Fees / Transfer / Other, so it sits with the spending ones.
    expect(CATEGORIES.findIndex((c) => c.value === 'c_pets')).toBeLessThan(CATEGORIES.findIndex((c) => c.value === 'fees'));
    // Same name again (any case) is the same category; a built-in name is the built-in.
    expect(addCategory(os, { label: 'PETS' })!.value).toBe('c_pets');
    expect(addCategory(os, { label: 'groceries' })!.value).toBe('groceries');
    expect(customCategories(os)).toHaveLength(1);
  });

  it('the picker can make one on the spot', () => {
    expect(pick(transactionType).onCreateOption!('Gym')).toMatchObject({ value: 'c_gym', label: 'Gym' });
  });

  it('rename and recolour; delete moves its transactions to Other and drops rules to it', () => {
    const gym = addCategory(os, { label: 'Gym' })!;
    updateCategory(os, gym.value, { label: 'Fitness', icon: 'activity' });
    expect(categoryOf('c_gym')).toMatchObject({ label: 'Fitness', icon: 'activity' });
    const tx = os.records.create({ object: 'transaction', data: { amount: 1500, kind: 'expense', category: 'c_gym', date: '2026-09-26', merchant: 'Cult' } });
    expect(tx.subtitle).toBe('Fitness');
    setCategoryRules(os, [{ keyword: 'CULT', category: 'c_gym' }, { keyword: 'ZOMATO', category: 'food' }]);
    expect(deleteCategory(os, 'c_gym')).toBe(1);
    expect(os.records.get<{ category: string }>(tx.id)!.data.category).toBe('other');
    expect(os.settings.get<Array<{ keyword: string }>>('categoryRules', []).map((r) => r.keyword)).toEqual(['ZOMATO']);
    expect(pick(transactionType).options!.some((o) => o.value === 'c_gym')).toBe(false);
  });
});
