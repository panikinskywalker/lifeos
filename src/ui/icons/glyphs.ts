/**
 * Icon geometry — pure data, no React Native, so it can be tested and
 * rendered to a contact sheet outside the app.
 *
 * Grid: 24×24 viewBox, content inside 2..22, stroke 2 (2.2 in icon-boxes),
 * round caps and joins, currentColor. A glyph is a list of parts:
 * a string is a path `d`; `{ c: [cx, cy, r] }` a circle; `{ r: [x, y, w, h, rx] }` a rect.
 * All glyphs are original drawings.
 */

export type GlyphPart = string | { c: [number, number, number] } | { r: [number, number, number, number, number] };
export type Glyph = GlyphPart[];

/** Cog outline: `teeth` flat teeth between an inner and outer radius. */
function cog(teeth: number, inner: number, outer: number, cx = 12, cy = 12): string {
  const pt = (deg: number, rad: number) => {
    const a = (deg * Math.PI) / 180;
    return `${+(cx + rad * Math.cos(a)).toFixed(2)} ${+(cy + rad * Math.sin(a)).toFixed(2)}`;
  };
  const step = 360 / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const a = i * step - 90;
    d += `${i === 0 ? 'M' : 'L'}${pt(a - step * 0.3, inner)}L${pt(a - step * 0.16, outer)}L${pt(a + step * 0.16, outer)}L${pt(a + step * 0.3, inner)}`;
    d += `A${inner} ${inner} 0 0 1 ${pt(a + step - step * 0.3, inner)}`;
  }
  return d + 'Z';
}

export const glyphs = {
  /* ---- navigation & chrome ---- */
  home: ['M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z'],
  wrench: ['M20.2 6.5A4.5 4.5 0 0 1 14 12l-7.7 7.7a1.42 1.42 0 0 1-2-2L12 10a4.5 4.5 0 0 1 5.5-6.2l-.2 2.9z'],
  sparkle: ['M12 3c.8 4.8 3.4 7.4 8 9-4.6 1.6-7.2 4.2-8 9-.8-4.8-3.4-7.4-8-9 4.6-1.6 7.2-4.2 8-9z', 'M19 2.5v3M17.5 4h3'],
  grid: [{ r: [4, 4, 6.5, 6.5, 1.5] }, { r: [13.5, 4, 6.5, 6.5, 1.5] }, { r: [4, 13.5, 6.5, 6.5, 1.5] }, { r: [13.5, 13.5, 6.5, 6.5, 1.5] }],
  user: [{ c: [12, 8, 4] }, 'M4.5 20.5c.8-3.6 3.8-6 7.5-6s6.7 2.4 7.5 6'],
  people: [{ c: [9, 8.5, 3.5] }, 'M2.5 19.5c.6-3.2 3.2-5.5 6.5-5.5s5.9 2.3 6.5 5.5', 'M16 5.2a3.5 3.5 0 0 1 0 6.6', 'M18 14.3c1.8.8 3.1 2.6 3.5 5.2'],
  search: [{ c: [11, 11, 6.5] }, 'm16 16 4.5 4.5'],
  settings: [cog(8, 7.2, 9.5), { c: [12, 12, 3] }],
  more: [{ c: [5.5, 12, 1] }, { c: [12, 12, 1] }, { c: [18.5, 12, 1] }],
  'chevron-right': ['m9.5 5.5 6.5 6.5-6.5 6.5'],
  'chevron-left': ['M14.5 5.5 8 12l6.5 6.5'],
  'chevron-down': ['m5.5 9.5 6.5 6.5 6.5-6.5'],
  'chevron-up': ['M5.5 14.5 12 8l6.5 6.5'],
  'arrow-right': ['M4.5 12h15M13.5 6l6 6-6 6'],
  x: ['M6 6l12 12M18 6 6 18'],

  /* ---- actions ---- */
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  edit: ['M15.5 4.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z', 'm13.5 6.5 3 3'],
  trash: ['M4 6.5h16', 'M9 6.5v-2h6v2', 'm6 6.5 1 13a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4l1-13', 'M10 10.5v6M14 10.5v6'],
  undo: ['M8.5 5 4 9.5 8.5 14', 'M4 9.5h10a5.5 5.5 0 0 1 0 11h-3'],
  filter: ['M4 5h16l-6.2 7.4V19l-3.6-2v-4.6z'],
  sort: ['M7 4v16M3.5 16.5 7 20l3.5-3.5', 'M17 20V4m-3.5 3.5L17 4l3.5 3.5'],
  star: ['m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z'],
  pin: ['M9 3.5h6', 'M10 3.5v5.2l-3 3.8V14h10v-1.5l-3-3.8V3.5', 'M12 14v6.5'],
  mic: [{ r: [9, 3, 6, 11, 3] }, 'M5.5 11a6.5 6.5 0 0 0 13 0', 'M12 17.5V21'],
  send: ['M20.5 3.5 3.5 10.5l7 3 3 7z', 'm10.5 13.5 10-10'],
  share: [{ c: [18, 5.5, 2.5] }, { c: [6, 12, 2.5] }, { c: [18, 18.5, 2.5] }, 'm8.2 10.8 7.6-4.1m-7.6 6.1 7.6 4.1'],
  lock: [{ r: [5, 10.5, 14, 10, 2] }, 'M8 10.5v-3a4 4 0 0 1 8 0v3'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3.1-3.1a4 4 0 0 0-5.7-5.7l-1.5 1.5', 'M14 10a4 4 0 0 0-5.7 0l-3.1 3.1a4 4 0 0 0 5.7 5.7l1.5-1.5'],
  paperclip: ['m20 11.5-7.8 7.8a5 5 0 0 1-7.1-7.1l8.1-8.1a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3'],
  refresh: ['M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9', 'M19.5 4.5V9H15'],
  download: ['M12 4v11m-4.5-4.5L12 15l4.5-4.5M4.5 19.5h15'],
  transfer: ['M4 8.5h15.5m-4-4 4 4-4 4', 'M20 15.5H4.5m4-4-4 4 4 4'],
  'plus-circle': [{ c: [12, 12, 8.5] }, 'M12 8.5v7M8.5 12h7'],
  'x-circle': [{ c: [12, 12, 8.5] }, 'm9.2 9.2 5.6 5.6m0-5.6-5.6 5.6'],
  'check-circle': [{ c: [12, 12, 8.5] }, 'm8.5 12.3 2.5 2.5 4.8-5'],
  circle: [{ c: [12, 12, 8.5] }],

  /* ---- status & time ---- */
  bell: ['M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z', 'M10 20.5a2 2 0 0 0 4 0', 'M12 3v2'],
  calendar: [{ r: [4, 5.5, 16, 14.5, 2.5] }, 'M4 10h16M8.5 3.5v4m7-4v4'],
  clock: [{ c: [12, 12, 8.5] }, 'M12 7.5V12l3 2'],
  repeat: ['m17 3.5 3 3-3 3', 'M4 12v-1.5a4 4 0 0 1 4-4h12', 'm7 20.5-3-3 3-3', 'M20 12v1.5a4 4 0 0 1-4 4H4'],
  alert: ['M10.3 4.9 2.9 17.6a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.9a2 2 0 0 0-3.4 0z', 'M12 9.5v4M12 17h.01'],
  info: [{ c: [12, 12, 8.5] }, 'M12 11v5.5M12 7.8h.01'],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z'],
  sun: [{ c: [12, 12, 4] }, 'M12 2.5v2m0 15v2M4.6 4.6 6 6m12 12 1.4 1.4M2.5 12h2m15 0h2M4.6 19.4 6 18M18 6l1.4-1.4'],
  eye: ['M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z', { c: [12, 12, 3] }],
  target: [{ c: [12, 12, 8.5] }, { c: [12, 12, 4.5] }, { c: [12, 12, 0.8] }],
  inbox: ['M3.5 13.5 6 5.5a1.5 1.5 0 0 1 1.4-1h9.2a1.5 1.5 0 0 1 1.4 1l2.5 8V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z', 'M3.5 13.5H8L9.5 16h5l1.5-2.5h4.5'],

  /* ---- records & content ---- */
  tag: ['M3.5 12.2V5A1.5 1.5 0 0 1 5 3.5h7.2l8.3 8.3a1.5 1.5 0 0 1 0 2.1l-7.1 7.1a1.5 1.5 0 0 1-2.1 0z', { c: [8, 8, 1.3] }],
  comment: ['M6 4h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 4v-4H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
  file: ['M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z', 'M14 3.5v5h5', 'M9 13h6m-6 3.5h4'],
  folder: ['M3.5 7A1.5 1.5 0 0 1 5 5.5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z'],
  book: ['M4 5.5A1.5 1.5 0 0 1 5.5 4H11a1 1 0 0 1 1 1v15a2 2 0 0 0-2-2H4z', 'M20 5.5A1.5 1.5 0 0 0 18.5 4H13a1 1 0 0 0-1 1v15a2 2 0 0 1 2-2h6z'],
  list: ['M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01'],
  archive: [{ r: [3.5, 4.5, 17, 4, 1] }, 'M5 8.5v10A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-10', 'M10 12.5h4'],
  box: ['M3.5 7.5 12 3.5l8.5 4v9l-8.5 4-8.5-4z', 'm3.5 7.5 8.5 4 8.5-4M12 11.5v9'],
  bulb: ['M9 17.5h6M10 21h4', 'M12 3a6 6 0 0 0-3.5 10.9c.4.3.5.7.5 1.1v2.5h6V15c0-.4.2-.8.5-1.1A6 6 0 0 0 12 3z'],
  image: [{ r: [3.5, 4.5, 17, 15, 2] }, { c: [9, 9.5, 1.5] }, 'M20.5 15 16 10.5 6 19.5'],
  camera: ['M3 8.5A1.5 1.5 0 0 1 4.5 7h3L9 4.5h6L16.5 7h3A1.5 1.5 0 0 1 21 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z', { c: [12, 13, 3.5] }],
  key: [{ c: [8, 15.5, 4] }, 'm11 12.5 8.5-8.5M16.5 7 19 9.5M14 9.5l2 2'],

  /* ---- money ---- */
  card: [{ r: [3, 5.5, 18, 13, 2.5] }, 'M3 10h18M7 15h3'],
  receipt: ['M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z', 'M9 8.5h6M9 12h6m-6 3.5h3'],
  wallet: ['M19 7.5V6a1.5 1.5 0 0 0-1.5-1.5h-12a2 2 0 0 0 0 4H19a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5.5a2 2 0 0 1-2-2v-11', 'M16.5 14h.5'],
  cash: [{ r: [3, 6.5, 18, 11, 2] }, { c: [12, 12, 2.5] }, 'M6.5 9.5h.01m11 5h.01'],
  bank: ['M3.5 9 12 4l8.5 5z', 'M5.5 9.5v8M10 9.5v8m4-8v8m4.5-8v8M3.5 20h17'],
  chart: ['M4 20h16', 'M7 16.5v-4m5 4v-9m5 9v-6'],
  pie: ['M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z', 'M15 3.9A8.5 8.5 0 0 1 20.1 9H15z'],
  trend: ['M3.5 17 9.5 11l4 4 7-7.5', 'M15 7.5h5.5V13'],
  cart: ['M3 4h2.5l2.2 10.5a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.4-1.1L20.5 8h-14', { c: [9.5, 19.5, 1.2] }, { c: [17, 19.5, 1.2] }],
  bag: ['M5.5 8h13l-1 12.5h-11z', 'M9 10.5V7a3 3 0 0 1 6 0v3.5'],

  /* ---- things, places, body ---- */
  car: ['M3.5 16v-3.2l1.8-4.6A2 2 0 0 1 7.2 7h9.6a2 2 0 0 1 1.9 1.2l1.8 4.6V16a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z', 'M3.5 12.5h17', 'M6.5 17v2m11-2v2', 'M7 14.5h1.5m7 0H17'],
  bus: [{ r: [5, 3.5, 14, 14.5, 2.5] }, 'M5 11h14M8.5 14.5h.01m7 0h.01M7.5 18v2.5m9-2.5v2.5'],
  plane: ['M21.5 16v-2l-8-5V4.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1 3.5 1v-1.5l-2-1.5v-4.5z'],
  map: ['M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13L15 6.5z', 'M9 4.5v13m6-11v13'],
  location: ['M12 21s7-6 7-11.5a7 7 0 0 0-14 0C5 15 12 21 12 21z', { c: [12, 9.5, 2.5] }],
  shoe: ['M3 16.5V8l3.5 1 2-3 6 6 4.5 1.3a2.5 2.5 0 0 1 2 2.4V19H4a1 1 0 0 1-1-1z', 'M3 16.5h18', 'm10 9.5-1.5 1.5m3.5.5L10.5 13'],
  shirt: ['M8.5 4 4 6.5l1.5 4 2.5-1V20h8V9.5l2.5 1 1.5-4L15.5 4a3.5 3.5 0 0 1-7 0z'],
  drop: ['M12 3.5s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10.5 12 3.5 12 3.5z'],
  leaf: ['M5 19C5 10 10 5 20 4c-.5 9.5-5.5 15-15 15z', 'M5 19c3-5 6.5-8 10-10'],
  heart: ['m12 20.5-7.8-7.6a4.8 4.8 0 0 1 6.8-6.8l1 1 1-1a4.8 4.8 0 0 1 6.8 6.8z'],
  activity: ['M3 12h4l2.5-6 5 12 2.5-6h4'],
  flame: ['M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4-3-6.5-4.5-10.5-2 2-2.5 4-2.5 5.5-1-1-2-1.5-2-3.5-2.5 2-4 4.5-4 8.5A6.5 6.5 0 0 0 12 21z'],
  bolt: ['M13 3 5 13.5h6.5L11 21l8-10.5h-6.5z'],
  gift: [{ r: [4, 8, 16, 4, 1] }, 'M5.5 12v7.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V12', 'M12 8v12.5', 'M12 8C10.5 4 7 4 7 6s2.5 2 5 2 5 0 5-2-3.5-2-5 2z'],
  food: ['M7 3.5v17M4.5 3.5V8a2.5 2.5 0 0 0 5 0V3.5', 'M17 20.5v-17c-2 1-3.5 3.5-3.5 7V13H17'],
  film: [{ r: [3.5, 4.5, 17, 15, 2] }, 'M7.5 4.5v15m9-15v15M3.5 9.5h4m-4 5h4m9-5h4m-4 5h4'],
  briefcase: [{ r: [3.5, 7.5, 17, 12, 2] }, 'M9 7.5v-2A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5v2', 'M3.5 12.5h17'],
  scale: [{ r: [4, 4, 16, 16, 3] }, 'M8 10a5.5 5.5 0 0 1 8 0m-4 0 1.5-2'],
  phone: ['M5 4h3.5L10 8 8 9.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z'],
} satisfies Record<string, Glyph>;

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
  brain: 'bulb', lightbulb: 'bulb',
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
  'exclamationmark.triangle': 'alert', 'eye.slash': 'eye', 'square.and.arrow.up': 'share', 'square.and.arrow.down': 'download',
  'circle.fill': 'circle', photo: 'image', 'bed.double': 'moon', scalemass: 'scale', trophy: 'star', tray: 'inbox',
  play: 'arrow-right', pause: 'minus', 'arrow.up.circle.fill': 'send',
};

export function resolveIconName(name: string): IconName | null {
  if (name in glyphs) return name as IconName;
  return LEGACY_ICON_ALIASES[name] ?? null;
}
