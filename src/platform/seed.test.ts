import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import { bus } from '@core/events/bus';
import { brief } from '@core/brain';
import { installedModules } from '@modules/index';
import { demoFolders, seedDemo } from './seed';

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: installedModules, registry: new Registry() });
  os.device = { folders: demoFolders };
});
afterEach(() => os.db.close());

describe('the demo database', () => {
  it('fills every module with something to show, once', async () => {
    await seedDemo(os);
    const counts = os.records.countsByType();
    for (const object of ['account', 'transaction', 'subscription', 'person', 'group', 'debt', 'trip', 'project', 'task', 'event', 'asset', 'document', 'habit', 'workout', 'measurement', 'note', 'place', 'org', 'delivery', 'stock', 'game']) {
      expect([object, counts[object] ?? 0]).not.toEqual([object, 0]);
    }
    expect(os.settings.get('onboarded', false)).toBe(true);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    await seedDemo(os);
    expect(Object.values(os.records.countsByType()).reduce((a, b) => a + b, 0)).toBe(total);
  });

  it('has files new in Your folders, kinds guessed from their names', async () => {
    await seedDemo(os);
    const fresh = os.records.query<{ kind: string }>('document', { filter: { and: [{ field: 'status', op: 'eq', value: 'new' }] } }, { limit: 50 });
    expect(fresh.map((d) => d.data.kind)).toEqual(expect.arrayContaining(['tax', 'contract', 'id', 'ticket', 'medical']));
  });

  it('files a morning of nudges in code’s own words, with no key', async () => {
    await seedDemo(os);
    const b = brief(os);
    expect(b.lines.length).toBeGreaterThan(0);
  });
});
