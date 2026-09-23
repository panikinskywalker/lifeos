import { readFileSync } from 'node:fs';
import path from 'node:path';
import { glyphs, ICON_NAMES, LEGACY_ICON_ALIASES, resolveIconName, type Glyph } from './glyphs';

const root = path.resolve(__dirname, '../../..');

describe('icon set', () => {
  it('has every icon DESIGN.md requires', () => {
    const design = readFileSync(path.join(root, 'docs/DESIGN.md'), 'utf8');
    const line = design.split('\n').find((l) => l.includes('Required set:'));
    expect(line).toBeTruthy();
    const required = line!.split('Required set:')[1]!.replace(/\(.*?\)/g, '').replace(/\.$/, '').split(',').map((s) => s.trim()).filter(Boolean);
    expect(required.length).toBeGreaterThan(40);
    expect(required.filter((n) => !(n in glyphs))).toEqual([]);
  });

  it('draws inside the 24 grid with valid parts', () => {
    for (const name of ICON_NAMES) {
      const glyph: Glyph = glyphs[name];
      expect(glyph.length, name).toBeGreaterThan(0);
      for (const part of glyph) {
        if (typeof part === 'string') expect(part, name).toMatch(/^[Mm][-\d.\s,MmLlHhVvCcSsQqTtAaZz]+$/);
        else if ('c' in part) expect(part.c[0] - part.c[2] >= 1 && part.c[0] + part.c[2] <= 23, name).toBe(true);
        else expect(part.r[0] >= 1 && part.r[0] + part.r[2] <= 23 && part.r[1] >= 1 && part.r[1] + part.r[3] <= 23, name).toBe(true);
      }
    }
  });

  it('resolves every legacy alias and every icon name used in the app', () => {
    for (const [from, to] of Object.entries(LEGACY_ICON_ALIASES)) expect(to in glyphs, `${from} → ${to}`).toBe(true);
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const e of require('node:fs').readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name) && !e.name.endsWith('.test.ts')) {
          for (const m of readFileSync(p, 'utf8').matchAll(/\bicon(?:Name)?[=:]\s*\{?\s*['"]([a-z0-9.-]+)['"]/g)) used.add(m[1]!);
        }
      }
    };
    walk(path.join(root, 'src'));
    walk(path.join(root, 'app'));
    expect([...used].filter((n) => !resolveIconName(n))).toEqual([]);
  });
});
