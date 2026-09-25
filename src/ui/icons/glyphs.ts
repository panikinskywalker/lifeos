/**
 * Icon geometry — pure data, no React Native, so it can be tested and
 * rendered outside the app.
 *
 * The Claude Design canvas draws every icon with Lucide, so the set is
 * generated from Lucide (scripts/gen-icons.mjs, ISC licence in
 * LICENSE-lucide). 24×24 viewBox, stroke 2, round caps and joins,
 * currentColor. A part is a path `d`, `{ c: [cx, cy, r] }` or
 * `{ r: [x, y, w, h, rx] }`.
 */
import { lucideGlyphs } from './lucide.generated';

export type GlyphPart = string | { readonly c: readonly [number, number, number] } | { readonly r: readonly [number, number, number, number, number] };
export type Glyph = readonly GlyphPart[];

export const glyphs: Record<keyof typeof lucideGlyphs, Glyph> = lucideGlyphs;

export type IconName = keyof typeof glyphs;
export const ICON_NAMES = Object.keys(glyphs) as IconName[];

/**
 * Pre-DESIGN.md names (SF-Symbol style) used by module manifests and older
 * screens, mapped onto the set. Lets `<Icon name="creditcard" />` keep working
 * while modules migrate; new code should use `IconName`s directly.
 */
export const LEGACY_ICON_ALIASES: Record<string, IconName> = {
  house: 'home', 'house.fill': 'home', 'house.lodge': 'home',
  creditcard: 'card', 'creditcard.fill': 'card', banknote: 'cash', 'dollarsign.circle': 'cash', indianrupeesign: 'cash', 'building.columns': 'bank',
  'chart.pie': 'pie', 'chart.bar': 'chart', 'chart.line': 'trend',
  'figure.run': 'activity', dumbbell: 'activity', lungs: 'activity', 'waveform.path.ecg': 'activity',
  'heart.fill': 'heart', pills: 'heart', 'cross.case': 'heart',
  person: 'user', 'person.2': 'people',
  airplane: 'plane', 'airplane.departure': 'plane',
  cube: 'box', 'cube.box': 'box', shippingbox: 'box', archivebox: 'archive',
  doc: 'file', 'doc.text': 'file', 'note.text': 'book', 'text.book.closed': 'book', graduationcap: 'book',
  lightbulb: 'bulb',
  'checkmark.circle': 'check-circle', checkmark: 'check', checklist: 'list', 'list.bullet': 'list',
  'bolt.fill': 'bolt', 'bolt.horizontal': 'bolt',
  sparkles: 'sparkle', magnifyingglass: 'search', gear: 'settings', gearshape: 'settings', 'slider.horizontal.3': 'settings',
  'plus.circle.fill': 'plus-circle',
  'chevron.right': 'chevron-right', 'chevron.left': 'chevron-left', 'chevron.down': 'chevron-down', 'chevron.up': 'chevron-up',
  xmark: 'x', 'xmark.circle.fill': 'x-circle',
  'star.fill': 'star', 'bell.fill': 'bell', 'bubble.left': 'comment',
  'car.fill': 'car', flag: 'pin', pencil: 'edit', 'square.and.pencil': 'edit', paintbrush: 'edit', signature: 'edit', hammer: 'wrench',
  'arrow.up.arrow.down': 'sort', 'arrow.right': 'arrow-right', 'arrow.left.arrow.right': 'transfer',
  'fork.knife': 'food', tv: 'film', globe: 'map', drop: 'drop', 'sun.max': 'sun', ellipsis: 'more',
  'square.grid.2x2': 'grid', 'line.3.horizontal.decrease': 'filter', 'arrow.clockwise': 'refresh', 'info.circle': 'info',
  'exclamationmark.triangle': 'warning', 'eye.slash': 'eye', 'square.and.arrow.up': 'share', 'square.and.arrow.down': 'download',
  'circle.fill': 'circle', photo: 'image', 'bed.double': 'moon', scalemass: 'scale', trophy: 'star', tray: 'inbox',
  play: 'arrow-right', pause: 'minus', 'arrow.up.circle.fill': 'arrow-up',
};

export function resolveIconName(name: string): IconName | null {
  if (name in glyphs) return name as IconName;
  return LEGACY_ICON_ALIASES[name] ?? null;
}
