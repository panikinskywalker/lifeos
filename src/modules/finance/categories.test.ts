import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { categoryFor, setCategoryRules } from './filing/rules';
import { CATEGORIES, categoryOf, subscriptionType, transactionType } from './types';
import { addCategory, applyCategories, customCategories, deleteCategory, trackCategoryField, updateCategory } from './categories';

let os: LifeOSContext;
const pick = (def: typeof transactionType | typeof subscriptionType) => def.fields.find((f) => f.key === 'category')!;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [{ id: 'finance', name: 'Finance', version: '1', description: '', icon: 'x', color: '#000', objects: [transactionType, subscriptionType] }], registry: new Registry() });
  for (const d of [transactionType, subscriptionType]) trackCategoryField(pick(d));
  applyCategories(os);
});
afterEach(() => {
  os.settings.set('finance.customCategories', []);
  applyCategories(os);
  os.db.close();
});

describe('your own categories', () => {
  it('a new category joins the list and every category picker', () => {
    const pets = addCategory(os, { label: 'pets' })!;
    expect(pets).toMatchObject({ value: 'c_pets', label: 'Pets', icon: 'tag' });
    expect(categoryOf('c_pets').label).toBe('Pets');
    expect(pick(transactionType).options!.some((o) => o.value === 'c_pets')).toBe(true);
    expect(pick(subscriptionType).options!.some((o) => o.value === 'c_pets')).toBe(true);
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

describe('built-in categories, from Rutvij’s texts (10 Nov)', () => {
  it('names banks cut short still find their category', () => {
    expect(['SHREE SAI MEDICA', 'MAXCARE MULTISPE', 'COLLECTIVE COFF', 'BHAIYA JI VADAPA', 'Adidas India Ma'].map((m) => categoryFor(os, m))).toEqual(['health', 'health', 'food', 'food', 'shopping']);
    expect(categoryFor(os, 'Zomato Media Pr')).toBe('food');
    expect(['MYJIO', 'ETERNAL', 'SAI ICE CREAM', 'WAKEFIT'].map((m) => categoryFor(os, m))).toEqual(['utilities', 'food', 'food', 'shopping']);
  });

  it('a large NEFT from a company is salary; a small one, or one from a person, is not', () => {
    const text = 'credited with INR 196,958.00 as NEFT from HDFC A/c ***1234 of ACME TECH (I) ***';
    expect(categoryFor(os, 'ACME TECH (I)', text, 196958, 'credit')).toBe('salary');
    expect(categoryFor(os, 'ACME TECH (I)', text, 11642.64, 'credit')).toBe('other');
    expect(categoryFor(os, 'PRIYA SHARMA', text, 50000, 'credit')).toBe('other');
    expect(categoryFor(os, 'ACME TECH (I)', text, 196958, 'debit')).toBe('other');
  });
});
