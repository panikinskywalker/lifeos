import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { answerNudge, brief, runPass } from '@core/brain';
import { buy, dishAsk, findStock, inventoryBrain, inventoryModule, useOne, type StockData } from '.';

/** Home's candidates for the brain, built on R7e's: going off, running out, Cook tonight. */

const DAY = 86_400_000;
const NOW = Date.now();
const ago = (n: number) => NOW - n * DAY;
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [inventoryModule], registry: new Registry() });
  buy(os, { name: 'Malai paneer', at: ago(3) }); // use by tomorrow
  buy(os, { name: 'Spinach', at: ago(3) }); // use today
  buy(os, { name: 'Milk', at: ago(5) }); // probably gone
  const butter = buy(os, { name: 'Amul butter', at: ago(39) });
  useOne(os, butter.id, ago(19));
  buy(os, { name: 'Amul butter', at: ago(18) }); // running out
  buy(os, { name: 'Tata salt' });
});
afterEach(() => os.db.close());

const stock = (name: string) => findStock(os, name)!;

describe('Home’s candidates', () => {
  it('going off is is this right?, running out is done, undo?; no em dash in code’s words', () => {
    const c = inventoryBrain.candidates(os, NOW);
    expect(c.map((x) => [x.title, x.kind, x.shape, !!x.urgent])).toEqual([
      ['Milk', 'going off', 'check', false],
      ['Spinach', 'going off', 'check', true],
      ['Malai paneer', 'going off', 'check', true],
      ['Amul butter', 'running out', 'done', false],
    ]);
    expect(c.map((x) => x.line).join('\n')).not.toMatch(/[—–]/);
    expect(c[0]!.line).toMatch(/^Milk: bought \w+, probably gone\. Still there\?$/);
    expect(c[0]!.yes).toBe('It’s gone');
    expect(c[3]!.line).toBe('Amul butter: on the shopping list (every 3 wk · 18 d)');
    expect(c[1]!.record).toMatchObject({ thing: 'Spinach', keeps_days: 3, state: 'use soon', estimated: true });
  });

  it('the pass keeps Home to two, urgent first; Spinach and paneer', async () => {
    const r = await runPass(os, { pass: 'morning', model: null, now: NOW });
    expect(r.filed.filter((n) => n.module === 'inventory').map((n) => n.title)).toEqual(['Spinach', 'Malai paneer']);
  });

  it('running out puts it on the list on its own; Undo takes it off', async () => {
    const [low] = inventoryBrain.candidates(os, NOW).filter((x) => x.kind === 'running out');
    const { fileNudge } = await import('@core/brain');
    const n = fileNudge(os, 'inventory', low!, { passId: 'p', line: low!.line, at: NOW });
    expect(stock('Amul butter').data.onList).toBe(true);
    answerNudge(os, n.id, 'undo');
    expect(stock('Amul butter').data.onList).toBeUndefined();
    expect(inventoryBrain.candidates(os, NOW).some((x) => x.kind === 'running out')).toBe(true);
  });

  it('probably gone: Yes uses it up, Not this says it is still good', async () => {
    const { fileNudge } = await import('@core/brain');
    const milk = inventoryBrain.candidates(os, NOW).find((x) => x.title === 'Milk')!;
    answerNudge(os, fileNudge(os, 'inventory', milk, { passId: 'p', line: milk.line, at: NOW }).id, 'yes');
    expect(stock('Milk').data.quantity).toBe(0);
    const paneer = inventoryBrain.candidates(os, NOW).find((x) => x.title === 'Malai paneer')!;
    answerNudge(os, fileNudge(os, 'inventory', paneer, { passId: 'p', line: paneer.line, at: NOW }).id, 'no');
    expect(os.records.get<StockData>(stock('Malai paneer').id)!.data.checkedOn).toBeTruthy();
  });

  it('Cook tonight: one ask from the Fridge and Kitchen, keyed by what is there; filled, it is a brief line', async () => {
    const a = dishAsk(os, NOW)!;
    expect(a).toMatchObject({ slot: 'cook tonight', brief: true, route: '/module/inventory/index' });
    expect((a.record!.use_soon as string[]).sort()).toEqual(['Malai paneer', 'Spinach']);
    expect(a.record!.fresh).toContain('Amul butter');
    expect(dishAsk(os, NOW)!.key).toBe(a.key);
    buy(os, { name: 'Eggs' });
    expect(dishAsk(os, NOW)!.key).not.toBe(a.key);
    os.brain.learned.put(dishAsk(os, NOW)!.key, 'Palak paneer: spinach, paneer, cream', { module: 'inventory' });
    expect(brief(os, NOW).lines.map((l) => l.text)).toEqual(['Cook tonight: Palak paneer: spinach, paneer, cream']);
  });
});
