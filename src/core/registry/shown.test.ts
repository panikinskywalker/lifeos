import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '../db/betterSqliteAdapter';
import { createLifeOS } from '../lifeos';
import { Registry } from './registry';
import type { LifeOSContext } from './context';
import { bus } from '../events/bus';
import { isModuleShown, setModuleShown, shownModules, startShownModules, SHOW_ALL_KEY } from './shown';

/** Modules shown (docs/MODEL.md, 15 Nov): Money and Turf on a phone's first start; show all, demo and no list show everything. */
let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  const mods = ['finance', 'games', 'health'].map((id) => ({ id, name: id, version: '1', description: '', icon: 'x', color: '#000', objects: [] }));
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: mods, registry: new Registry() });
});
afterEach(() => os.db.close());

describe('modules shown', () => {
  it('no list: everything; first start: Money and Turf; a switch adds one; show all and demo show everything', () => {
    expect(shownModules(os)).toBeNull();
    startShownModules(os);
    expect([isModuleShown(os, 'finance'), isModuleShown(os, 'games'), isModuleShown(os, 'health'), isModuleShown(os, 'core')]).toEqual([true, true, false, true]);
    setModuleShown(os, 'health', true);
    expect(isModuleShown(os, 'health')).toBe(true);
    setModuleShown(os, 'health', false);
    os.settings.set(SHOW_ALL_KEY, true);
    expect(isModuleShown(os, 'health')).toBe(true);
    os.settings.set(SHOW_ALL_KEY, false);
    os.settings.set('demoSeeded', true);
    expect(isModuleShown(os, 'health')).toBe(true);
  });
});
