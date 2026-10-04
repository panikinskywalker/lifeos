import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

/**
 * The one-way rule (docs/MODEL.md §3, docs/PLUGINS.md):
 *
 *   boards → modules → core        ui → core        platform → anything in src
 *
 * - core imports nothing above it (no ui, modules, boards, platform, react-native).
 * - a module imports core only — never ui, never another module, never boards.
 * - ui imports core only — never a module or a board.
 * - a board imports core, ui and modules — never another board.
 *
 * Test files are exempt (a core test may build fixtures from a module's Objects).
 * `ALLOWED` lists the violations that exist today; it may only shrink. Adding a
 * line here needs a reason in the commit message.
 */

const ROOT = resolve(__dirname, '..');
type Tier = 'core' | 'modules' | 'boards' | 'ui' | 'platform' | 'screens' | 'other';

function tierOf(rel: string): Tier {
  const top = rel.split('/')[0];
  if (top === 'core' || top === 'modules' || top === 'boards' || top === 'ui' || top === 'platform' || top === 'screens') return top;
  return 'other';
}

function moduleOf(rel: string): string | null {
  const parts = rel.split('/');
  return parts[0] === 'modules' || parts[0] === 'boards' ? parts[1] ?? null : null;
}

const MAY_IMPORT: Record<Tier, Tier[]> = {
  core: ['core'],
  modules: ['modules', 'core'],
  ui: ['ui', 'core'],
  boards: ['boards', 'core', 'ui', 'modules', 'screens'],
  // app-shell tiers: screens and platform are glue and may use each other
  screens: ['screens', 'core', 'ui', 'modules', 'boards', 'platform'],
  platform: ['platform', 'core', 'ui', 'modules', 'boards', 'screens'],
  other: ['other', 'core', 'ui', 'modules', 'boards', 'screens', 'platform'],
};

/** Packages a tier must not touch at all. */
const FORBIDDEN_PACKAGES: Partial<Record<Tier, RegExp>> = {
  core: /^(react|react-native|expo|@expo|@react-navigation)(\/|$)|^expo-/,
  modules: /^(react|react-native|expo|@expo|@react-navigation)(\/|$)|^expo-/,
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(p);
  }
  return out;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;

function imports(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of src.matchAll(IMPORT_RE)) out.push((m[1] ?? m[2] ?? m[3])!);
  return out;
}

function resolveTarget(fromFile: string, spec: string): string | null {
  if (spec.startsWith('@core/')) return 'core/' + spec.slice(6);
  if (spec.startsWith('@ui/')) return 'ui/' + spec.slice(4);
  if (spec.startsWith('@modules/')) return 'modules/' + spec.slice(9);
  if (spec.startsWith('@boards/')) return 'boards/' + spec.slice(8);
  if (spec.startsWith('.')) {
    const abs = resolve(dirname(fromFile), spec);
    const rel = relative(ROOT, abs);
    return rel.startsWith('..') ? null : rel.replace(/\\/g, '/');
  }
  return null; // a package
}

/** Violations that exist today (R0 stage A). Shrinks to empty by the end of R0. */
const ALLOWED = new Set<string>([
  // core → react: ComponentType on the deprecated widget / screen fields; gone with stage B
  'core/registry/types.ts',
  // modules → ui: colours and screens still inside modules until stage B moves them to boards
  ...[
    'finance/categories.ts', 'finance/types.ts', 'finance/reportsScreen.tsx', 'finance/screens.tsx', 'finance/subscriptionHero.tsx', 'finance/splitScreens.tsx',
    'automation/index.tsx',
  ].map((f) => `modules/${f}`),
]);

describe('the one-way rule', () => {
  const files = walk(ROOT).filter((f) => !/\.test\.tsx?$/.test(f));
  const violations: string[] = [];
  const stillAllowed = new Set<string>();

  for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    // the install lists are the one place that names every module / board
    if (rel === 'modules/index.ts' || rel === 'boards/index.ts') continue;
    const tier = tierOf(rel);
    const mod = moduleOf(rel);
    for (const spec of imports(file)) {
      const target = resolveTarget(file, spec);
      if (!target) {
        const banned = FORBIDDEN_PACKAGES[tier];
        if (banned && banned.test(spec)) {
          if (ALLOWED.has(rel)) stillAllowed.add(rel);
          else violations.push(`${rel} imports package "${spec}" (${tier} must not)`);
        }
        continue;
      }
      const tTier = tierOf(target);
      const ok = MAY_IMPORT[tier].includes(tTier);
      const tMod = moduleOf(target);
      const crossModule = (tier === 'modules' && tTier === 'modules' && tMod && mod && tMod !== mod) || (tier === 'boards' && tTier === 'boards' && tMod && mod && tMod !== mod);
      if (!ok || crossModule) {
        if (ALLOWED.has(rel)) stillAllowed.add(rel);
        else violations.push(`${rel} → ${target} (${tier} may not import ${crossModule ? 'another ' + tier.slice(0, -1) : tTier})`);
      }
    }
  }

  it('no tier imports upward and no module imports another module', () => {
    expect(violations).toEqual([]);
  });

  it('the allowlist only shrinks: every entry still needs to be there', () => {
    const stale = [...ALLOWED].filter((f) => !stillAllowed.has(f));
    expect(stale).toEqual([]);
  });
});
