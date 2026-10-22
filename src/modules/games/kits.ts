/**
 * Kits and formations, copied from Turf web v0.0.61 (`lib/kits.ts`,
 * `lib/formations.ts`). A match has two kit colours; a kit's name is the
 * nearest preset (Lime, Sky…), its ink follows its brightness. A team's shape
 * is its outfield rows from the back (the keeper not counted). Keep in step
 * when Turf web changes.
 */

export const KIT_PRESETS: Array<{ name: string; hex: string }> = [
  { name: 'Lime', hex: '#D7F55C' },
  { name: 'Sky', hex: '#A9C4FF' },
  { name: 'Pink', hex: '#F4A8CE' },
  { name: 'Sun', hex: '#F6E27F' },
  { name: 'Coral', hex: '#FF5C47' },
  { name: 'Mint', hex: '#6FD3C8' },
  { name: 'Lilac', hex: '#C9A7F5' },
  { name: 'White', hex: '#F5F5F7' },
  { name: 'Black', hex: '#202421' },
  { name: 'Navy', hex: '#17345F' },
  { name: 'Blue', hex: '#2F80ED' },
  { name: 'Green', hex: '#25B95F' },
  { name: 'Orange', hex: '#F08A34' },
  { name: 'Red', hex: '#E84E42' },
  { name: 'Maroon', hex: '#7D2638' },
  { name: 'Purple', hex: '#8A5BD4' },
  { name: 'Grey', hex: '#929A96' },
];

export const DEFAULT_KITS = { A: '#D7F55C', B: '#A9C4FF' } as const;

const rgb = (hex: string): [number, number, number] | null => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  return [0, 2, 4].map((o) => Number.parseInt(m[1].slice(o, o + 2), 16)) as [number, number, number];
};

export const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

/** 'Lime', 'Sky', 'Blue'… the nearest preset's name. */
export function kitName(hex: string): string {
  const c = rgb(hex);
  if (!c) return 'Kit';
  let best = { name: 'Kit', d: Number.POSITIVE_INFINITY };
  for (const p of KIT_PRESETS) {
    const s = rgb(p.hex)!;
    const d = (c[0] - s[0]) ** 2 + (c[1] - s[1]) ** 2 + (c[2] - s[2]) ** 2;
    if (d < best.d) best = { name: p.name, d };
  }
  return best.name;
}

/** Text on this kit: dark on bright kits, light on dark ones. */
export function kitInk(hex: string): 'dark' | 'light' {
  const c = rgb(hex);
  if (!c) return 'dark';
  const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  return lum > 0.55 ? 'dark' : 'light';
}

export type Kit = { hex: string; name: string; ink: 'dark' | 'light'; letter: string; text: string };

export function kitOf(hex: string | null | undefined, fallback: string): Kit {
  const value = isHex(hex || '') ? (hex as string) : fallback;
  const name = kitName(value);
  return { hex: value, name, ink: kitInk(value), letter: name[0].toUpperCase(), text: kitText(value) };
}

/** The kit's colour as text on the dark ground: itself, unless it's too dark to read — then white. */
export function kitText(hex: string): string {
  const c = rgb(hex);
  if (!c) return hex;
  const lum = (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  return lum < 0.3 ? '#F5F5F7' : hex;
}


export const FORMATIONS: Record<number, string[]> = {
  5: ['1-2-1', '2-2', '2-1-1', '1-1-2'],
  6: ['2-2-1', '1-2-2', '2-1-2', '3-1-1', '1-3-1', '2-3'],
  7: ['2-3-1', '3-2-1', '2-1-2-1', '3-1-2', '2-2-2', '1-3-2'],
  8: ['3-3-1', '2-3-2', '3-2-2', '2-4-1', '3-1-2-1', '2-3-1-1'],
  9: ['3-3-2', '2-4-2', '3-2-3', '3-4-1', '2-3-3', '3-1-3-1'],
};

export function rows(formation: string): number[] {
  return formation.split('-').map(Number);
}

/** A formation fits a side of `size` players when its rows hold everyone but the keeper. */
export function validFormation(formation: string, size: number | null): boolean {
  if (!/^\d(-\d){1,4}$/.test(formation)) return false;
  if (!size) return true;
  if (FORMATIONS[size]) return FORMATIONS[size].includes(formation);
  if (size < 5 || size > 11) return false;
  return rows(formation).reduce((a, b) => a + b, 0) === size - 1;
}

export function defaultFormation(size: number | null): string | null {
  return size && FORMATIONS[size] ? FORMATIONS[size][0] : null;
}
