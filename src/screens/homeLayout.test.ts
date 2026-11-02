/**
 * Today's layout (docs/MODEL.md layer 5, *What Today is made of*, R8): Today
 * lays out the tiles boards register, in your order, with their looks, and
 * reads nothing else.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBetterSqliteAdapter } from '@core/db/betterSqliteAdapter';
import { createLifeOS } from '@core/lifeos';
import { Registry } from '@core/registry/registry';
import type { LifeOSContext } from '@core/registry/context';
import type { TileDef } from '@core/registry/types';
import { bus } from '@core/events/bus';
import { TILE_ORDER, homeLayout, saveHomeLayout, setTileStyle, tileConfig, todayTiles } from './homeLayout';

const tile = (type: string, more: Partial<TileDef> = {}): TileDef => ({ type, board: 'x', name: type, icon: 'grid', sizes: ['medium'], defaultSize: 'medium', component: () => null, ...more });

let os: LifeOSContext;
beforeEach(async () => {
  bus.clear();
  os = await createLifeOS({ db: createBetterSqliteAdapter(':memory:'), modules: [], registry: new Registry() });
  // Registered out of order, as boards register; plus one Today has never heard of.
  os.registry.registerBoard({ id: 'b1', name: 'B1', icon: 'x', color: 'red', placement: 'browse', tiles: [tile('onthisday'), tile('later'), tile('steps', { sizes: ['small', 'medium'], defaultSize: 'small' })] });
  os.registry.registerBoard({ id: 'b2', name: 'B2', icon: 'x', color: 'red', placement: 'bar', tiles: [tile('progress', { configFields: [{ key: 'style', label: 'Look', type: 'select', options: [{ value: 'rows', label: 'Rows' }, { value: 'rings', label: 'Rings' }] }] }), tile('myday')] });
});
afterEach(() => os.db.close());

describe('Today', () => {
  it('lays out every registered tile in the default order; one it does not know goes last', () => {
    expect(todayTiles(os).map((t) => t.type)).toEqual(['myday', 'progress', 'steps', 'onthisday', 'later']);
    expect(homeLayout(os)).toEqual([{ id: 'myday' }, { id: 'progress' }, { id: 'steps' }, { id: 'onthisday' }, { id: 'later' }]);
    expect(os.registry.tiles.get('steps')!.board).toBe('b1');
  });

  it('keeps your saved order and switches; drops tiles no board registers; slots in new ones', () => {
    saveHomeLayout(os, [{ id: 'onthisday' }, { id: 'gone' }, { id: 'myday', hidden: true }, { id: 'steps' }]);
    expect(homeLayout(os)).toEqual([{ id: 'onthisday' }, { id: 'myday', hidden: true }, { id: 'progress' }, { id: 'steps' }, { id: 'later' }]);
  });

  it('a look is the first option of the style Field until you pick another', () => {
    expect(tileConfig(os, 'progress')).toEqual({ style: 'rows' });
    setTileStyle(os, 'progress', 'rings');
    expect(tileConfig(os, 'progress')).toEqual({ style: 'rings' });
    setTileStyle(os, 'progress', 'nonsense');
    expect(tileConfig(os, 'progress')).toEqual({ style: 'rows' });
    expect(tileConfig(os, 'myday')).toEqual({});
  });

  const ROOT = resolve(__dirname, '../..');
  const files = (dir: string, out: string[] = []): string[] => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) files(p, out);
      else if (/\.tsx?$/.test(n) && !/\.test\./.test(n)) out.push(p);
    }
    return out;
  };

  it('every tile in the default order is declared by exactly one board', () => {
    const src = files(join(ROOT, 'src/boards')).map((f) => readFileSync(f, 'utf8'));
    for (const id of TILE_ORDER) {
      const n = src.reduce((k, s) => k + (s.match(new RegExp(`(type: |tile\\()'${id}'`, 'g'))?.length ?? 0), 0);
      expect([id, n]).toEqual([id, 1]);
    }
  });

  it('Today reads nothing but the layout: no board, module or core query in the tab', () => {
    const today = readFileSync(join(ROOT, 'app/(tabs)/index.tsx'), 'utf8');
    const specs = [...today.matchAll(/^import\s+(type\s+)?[^'"]*from\s+'([^']+)'/gm)].map((m) => ({ type: !!m[1], spec: m[2]! }));
    expect(specs.filter((s) => /^@boards|^@modules|src\/boards|src\/modules/.test(s.spec))).toEqual([]);
    expect(specs.filter((s) => s.spec.startsWith('@core/') && !s.type)).toEqual([]);
  });
});
