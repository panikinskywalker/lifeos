import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { askWithPhoto, type BrainModel } from '@core/brain';
import { acceptFound, acceptMissing, buy, dishAsk, findStock, fixMissing, fridgeDiff, fridgeQuestion, fridgeSpace, inventoryModule, keepFridgeDish, spaceNamed, undoFridge, type StockData } from '.';

/** Snap the fridge (layer 8, slice 4): the question, the differences as pills, accept or fix, the dish. Claude mocked. */

const DAY = 86_400_000;
const NOW = Date.now();
let os: LifeOSContext;
let fridge: string;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [inventoryModule], registry: new Registry() });
  fridge = fridgeSpace(os)!.id;
  buy(os, { name: 'Amul butter', spaceId: fridge, at: NOW - 5 * DAY });
  buy(os, { name: 'Malai paneer', spaceId: fridge, at: NOW - 3 * DAY }); // use soon
  buy(os, { name: 'Milk', spaceId: fridge, at: NOW });
  buy(os, { name: 'Tata salt', spaceId: spaceNamed(os, 'Kitchen')!.id });
});
afterEach(() => os.db.close());

const stock = (name: string) => os.records.get<StockData>(findStock(os, name)!.id)!;

describe('Snap the fridge', () => {
  it('asks with the Fridge’s pills by name and the ones to use soon, nothing from other spaces', () => {
    const q = fridgeQuestion(os, NOW)!;
    expect(q.spaceId).toBe(fridge);
    expect((q.ask.record.in_the_fridge as string[]).sort()).toEqual(['Amul butter', 'Malai paneer', 'Milk']);
    expect(q.ask.record.use_soon).toEqual(['Malai paneer']);
    expect(q.ask).toMatchObject({ module: 'inventory', moduleName: 'Home', what: 'a photo of the fridge', why: 'you pressed Snap the fridge' });
    expect(q.ask.system).not.toMatch(/[\u2014\u2013]/);
  });

  it('the differences: not seen only from the list, found only what is not on it, the dish without em dashes', () => {
    const d = fridgeDiff(os, fridge, { not_seen: ['milk', 'Eggs', 'Milk'], found: ['Coriander', 'Amul Butter', 'coriander', ' '], dish: 'Paneer bhurji \u2014 paneer, butter' });
    expect(d.missing).toEqual([{ stockId: findStock(os, 'Milk')!.id, title: 'Milk' }]);
    expect(d.found).toEqual(['Coriander']);
    expect(d.dish).toBe('Paneer bhurji, paneer, butter');
    expect(fridgeDiff(os, fridge, null)).toEqual({ missing: [], found: [], dish: null });
  });

  it('accept: not seen is used up, found goes into the Fridge; Undo puts each back', () => {
    const u1 = acceptMissing(os, findStock(os, 'Milk')!.id, NOW)!;
    expect(stock('Milk').data.quantity).toBe(0);
    const u2 = acceptFound(os, 'Coriander', fridge, NOW);
    expect(stock('Coriander').data).toMatchObject({ spaceId: fridge, quantity: 1 });
    undoFridge(os, u1);
    undoFridge(os, u2);
    expect(stock('Milk').data.quantity).toBe(1);
    expect(findStock(os, 'Coriander')).toBeUndefined();
  });

  it('fix: not seen but still there is marked still good', () => {
    fixMissing(os, findStock(os, 'Amul butter')!.id, NOW);
    expect(stock('Amul butter').data.checkedOn).toBeTruthy();
  });

  it('the photo’s dish fills Cook tonight for the Fridge as it is now, and never over a dish already there', () => {
    acceptFound(os, 'Spinach', fridge, NOW - 2 * DAY);
    const key = dishAsk(os, NOW)!.key;
    expect(keepFridgeDish(os, 'Palak paneer: spinach, paneer, butter', NOW)).toBe(true);
    expect(os.brain.learned.get(key)).toBe('Palak paneer: spinach, paneer, butter');
    expect(keepFridgeDish(os, 'Something else: x', NOW)).toBe(false);
    expect(keepFridgeDish(os, null, NOW)).toBe(false);
  });

  it('end to end with Claude mocked: one logged send, the photo nowhere in LifeOS', async () => {
    const q = fridgeQuestion(os, NOW)!;
    const model: BrainModel = { id: 'claude', model: 'claude-haiku-5-5', complete: vi.fn(async () => ({ text: '{"not_seen":["Milk"],"found":["Lemons"],"dish":""}', usage: { input: 1700, output: 30, cacheRead: 0, cacheWrite: 0 } })) };
    const r = await askWithPhoto(os, model, { ...q.ask, image: { mediaType: 'image/jpeg', data: 'cGhvdG8=' } }, NOW);
    expect(r.ok).toBe(true);
    const d = fridgeDiff(os, q.spaceId, r.ok ? r.answer : null);
    expect([d.missing.map((m) => m.title), d.found]).toEqual([['Milk'], ['Lemons']]);
    expect(os.brain.sent.recent()[0]!.lines[0]).toBe('Home · a photo of the fridge: read once, not kept');
    expect(JSON.stringify(os.db.all('SELECT * FROM brain_sent'))).not.toContain('cGhvdG8=');
  });
});
