import type { Theme } from '@ui/theme/tokens';
import { blocks } from '@ui/theme/tokens';
import { categoryOf } from '@modules/finance/types';

/** The artboards' category colours; a custom category uses its own palette colour. */
const CATEGORY_COLORS: Record<string, string> = {
  housing: '#D9B48F',
  food: '#FF9F5A',
  groceries: blocks.mint,
  transport: blocks.sky,
  subscriptions: '#B8F0D8',
  shopping: blocks.pink,
  utilities: '#6FD3C8',
  entertainment: blocks.lilac,
  health: '#FF8A7A',
  travel: '#FF8A6A',
  education: '#9FB8F7',
  gifts: blocks.yellow,
  investment: blocks.lime,
  salary: blocks.lime,
  freelance: '#6FD3C8',
};

export const catColor = (value: string | undefined, t: Theme) => CATEGORY_COLORS[value ?? 'other'] ?? t.paletteColor(categoryOf(value)?.color) ?? t.c.fg.tertiary;
