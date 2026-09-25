/**
 * Design tokens — source of truth is the LifeOS Claude Design canvas
 * ("Components & tokens" sheet), recorded in docs/DESIGN.md. Near-white
 * ground, tiles one shade off, mustard accent, muted module tints with a
 * matching ink, Manrope with tabular numerals.
 *
 * No shadows, no gradients. A value the canvas does not specify is marked
 * "working value".
 */

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

export interface Colors {
  /** tileRaised = the canvas's "nested / control" surface: controls sitting on a tile. */
  /** overlay: controls on a tinted record band; pill: the Done pill and an off toggle's thumb. */
  bg: { ground: string; tile: string; tileRaised: string; bar: string; pressed: string; scrim: string; overlay: string; pill: string };
  /** onBar / onBarActive: nav bar icon+label, inactive and active (active is mustard for the icon). */
  /** onBarText: text on the bar colour (toast). */
  fg: { primary: string; secondary: string; tertiary: string; onBar: string; onBarActive: string; onBarText: string };
  /** Track: segmented, toggle and chip tracks, hairlines. */
  line: string;
  /** Unfilled part of a Ring. */
  ringTrack: string;
  /** Timeline rail. */
  rail: string;
  /** Spending chart series, in order: sage · peach · rose · sky · stone (canvas). */
  chart: readonly [string, string, string, string, string];
  /** mustardSoft: the reminder / highlight icon-box behind a bell. */
  accent: { mustard: string; mustardInk: string; mustardSoft: string };
  /** coral / sage are fills, rings and dots; *Text variants are for text and icons. */
  alert: { coral: string; coralText: string; coralInk: string; coralFill: string };
  ok: { sage: string; sageText: string; sageInk: string };
}

export const lightTokens: Colors = {
  bg: {
    ground: '#FAFAF7',
    tile: '#F1F1EC',
    tileRaised: '#FAFAF7',
    bar: '#17201C',
    pressed: '#E4E4DD', // working value: pressed = track
    scrim: '#17201C47', // canvas: scrim 28%
    overlay: '#FFFFFF8C', // canvas: white 55%
    pill: '#FFFFFF',
  },
  fg: {
    primary: '#1B1F1D',
    secondary: '#6F7773',
    tertiary: '#A3A9A5',
    onBar: '#AEB5B0',
    onBarActive: '#F3C84B',
    onBarText: '#EDEEEA',
  },
  line: '#E4E4DD',
  ringTrack: '#E3E3DB',
  rail: '#D3D3CB',
  chart: ['#5F7F65', '#C9825A', '#B96E6A', '#6C8DB0', '#B5B2A6'],
  accent: { mustard: '#F3C84B', mustardInk: '#1B1F1D', mustardSoft: '#FBEFC6' },
  alert: { coral: '#E9635A', coralText: '#B8382F', coralInk: '#FFFFFF', coralFill: '#F8D9D5' },
  ok: { sage: '#8FB596', sageText: '#2F6142', sageInk: '#1B1F1D' },
};

export const darkTokens: Colors = {
  bg: {
    ground: '#141614',
    tile: '#1E211E',
    tileRaised: '#272B27',
    bar: '#242A26',
    pressed: '#333833', // working value: pressed = track
    scrim: '#00000073', // canvas: black 45%
    overlay: '#FFFFFF1A', // canvas: white 10%
    pill: '#2E332E',
  },
  fg: {
    primary: '#EDEEEA',
    secondary: '#9AA19C',
    tertiary: '#6C736E',
    onBar: '#8F978F',
    onBarActive: '#F3C84B',
    onBarText: '#EDEEEA',
  },
  line: '#333833',
  ringTrack: '#343934',
  rail: '#2E332E',
  chart: ['#8FB596', '#E0A27E', '#D9908B', '#93B1D1', '#7F7E76'],
  accent: { mustard: '#F3C84B', mustardInk: '#1B1F1D', mustardSoft: '#5D533C' },
  alert: { coral: '#F07A71', coralText: '#F5A29B', coralInk: '#1B1F1D', coralFill: '#4A2724' },
  ok: { sage: '#5F7F65', sageText: '#BCDCC0', sageInk: '#EDEEEA' },
};

export type TintKey = 'finance' | 'upkeep' | 'people' | 'tasks' | 'health' | 'memory' | 'travel' | 'documents';
export interface Tint {
  fill: string;
  ink: string;
}

/** Canvas module tints. Things share sage with Upkeep. */
export const lightTints: Record<TintKey, Tint> = {
  finance: { fill: '#F4E8CC', ink: '#6E5010' },
  upkeep: { fill: '#CFE0D1', ink: '#2F6142' },
  people: { fill: '#EFCDC8', ink: '#94423C' },
  tasks: { fill: '#CFDDEB', ink: '#2E5A84' },
  health: { fill: '#CDE6DD', ink: '#24654B' },
  memory: { fill: '#DDD5EA', ink: '#544483' },
  travel: { fill: '#F4D9C4', ink: '#8E4F22' },
  documents: { fill: '#DEDCD3', ink: '#54544A' },
};

export const darkTints: Record<TintKey, Tint> = {
  finance: { fill: '#5D533C', ink: '#E8D7B0' },
  upkeep: { fill: '#3C5D40', ink: '#BCDCC0' },
  people: { fill: '#5D403C', ink: '#E8B7B0' },
  tasks: { fill: '#3C4D5D', ink: '#B2CCE6' },
  health: { fill: '#3C5D51', ink: '#B6E2D2' },
  memory: { fill: '#483C5D', ink: '#C7B6E2' },
  travel: { fill: '#5D4A3C', ink: '#E8C8B0' },
  documents: { fill: '#575342', ink: '#DBD6BD' },
};

export const TINT_KEYS = Object.keys(lightTints) as TintKey[];

/* ------------------------------------------------------------------ */
/* Type                                                                */
/* ------------------------------------------------------------------ */

/** Manrope faces, loaded in app/_layout.tsx and embedded via the expo-font plugin. */
export const fonts = {
  400: 'Manrope_400Regular',
  500: 'Manrope_500Medium',
  600: 'Manrope_600SemiBold',
  700: 'Manrope_700Bold',
  800: 'Manrope_800ExtraBold',
} as const;
export type FontWeightKey = keyof typeof fonts;

/** Maps a numeric/keyword fontWeight to the Manrope face that carries it (Android ignores fontWeight on custom families). */
export function fontForWeight(weight: string | number | undefined): string {
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight === undefined ? 400 : Number(weight);
  if (w >= 800) return fonts[800];
  if (w >= 700) return fonts[700];
  if (w >= 600) return fonts[600];
  if (w >= 500) return fonts[500];
  return fonts[400];
}

export interface TypeStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing?: number;
  fontVariant?: Array<'tabular-nums'>;
}

const face = (w: FontWeightKey, fontSize: number, lineHeight: number, em = 0, tabular = false): TypeStyle => ({
  fontFamily: fonts[w],
  fontSize,
  lineHeight,
  ...(em ? { letterSpacing: +(em * fontSize).toFixed(2) } : null),
  ...(tabular ? { fontVariant: ['tabular-nums' as const] } : null),
});

/** Canvas type scale (Manrope). Line heights: 1.1 titles, 1.3 text, 1.05 stats. */
const designType = {
  /** Stat · hero — 36/800, −0.02em, tabular */
  display: face(800, 36, 38, -0.02, true),
  /** Stat — canvas 26–32/800, −0.02em, tabular (28 is the working default) */
  stat: face(800, 28, 30, -0.02, true),
  /** Screen title — 30/800, −0.02em */
  title: face(800, 30, 33, -0.02),
  /** Section — 17/800, −0.01em */
  heading: face(800, 17, 22, -0.01),
  /** Row title — 15/700 */
  rowTitle: face(700, 15, 20),
  /** Body — 15/600 */
  body: face(600, 15, 20),
  /** Tile title — 14/700 */
  tileTitle: face(700, 14, 18),
  /** Chip / field label — 13/700 */
  label: face(700, 13, 17),
  /** Caption — 13/600, secondary */
  caption: face(600, 13, 17),
  /** Label caps — 12/700, +0.08em, uppercase at the call site */
  labelCaps: face(700, 12, 16, 0.08),
  /** Nav — 11/700 */
  nav: face(700, 11, 13),
};

/**
 * @deprecated Pre-DESIGN.md variant names, kept so un-rebuilt screens still
 * render. Each points at the nearest design style; delete once no screen uses them.
 */
const legacyType = {
  largeTitle: designType.title,
  title1: designType.title,
  title2: designType.heading,
  title3: designType.heading,
  headline: face(700, 15, 22),
  callout: designType.body,
  subhead: face(600, 14, 20),
  footnote: face(600, 13, 18),
  caption2: face(600, 11, 14),
  statSmall: face(800, 22, 26, 0, true),
};

export const type = { ...designType, ...legacyType };
export type TypeVariant = keyof typeof type;

/* ------------------------------------------------------------------ */
/* Shape & space                                                       */
/* ------------------------------------------------------------------ */

export const radius = {
  tile: 20,
  /** card, row, sheet body */
  card: 16,
  sheet: 24,
  /** bottom corners of the record header band */
  band: 28,
  button: 14,
  input: 14,
  iconBox: 10,
  checkbox: 7,
  /** stacked-bar segment (14 tall) */
  bar: 7,
  chip: 999,
  /** @deprecated */ sm: 10,
  /** @deprecated */ md: 14,
  /** @deprecated */ lg: 16,
  /** @deprecated */ xl: 20,
  /** @deprecated */ pill: 999,
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const layout = {
  gutter: 20,
  gridGap: 12,
  bar: { height: 66, radius: 22, inset: 20 },
  iconBox: 32,
  touch: 48,
} as const;

/** Canvas: 2px stroke everywhere; sizes 22 nav · 18 row · 16 tile · 14 chip. */
export const icon = { stroke: 2, strokeInBox: 2, size: 24, nav: 22, row: 18, tile: 16, chip: 14 } as const;

/* ------------------------------------------------------------------ */
/* Legacy colour aliases                                               */
/* ------------------------------------------------------------------ */

/**
 * @deprecated iOS-system palette names still used by un-rebuilt modules for
 * status and accent colours. Each now resolves to a DESIGN.md ink so the
 * whole app shifts to the calm palette immediately.
 */
export const palette = {
  red: lightTokens.alert.coral,
  orange: lightTints.travel.ink,
  yellow: lightTints.finance.ink,
  green: lightTints.upkeep.ink,
  mint: lightTints.health.ink,
  teal: lightTints.health.ink,
  cyan: lightTints.tasks.ink,
  blue: lightTints.tasks.ink,
  indigo: lightTints.memory.ink,
  purple: lightTints.memory.ink,
  pink: lightTints.people.ink,
  brown: lightTints.finance.ink,
  gray: lightTokens.fg.secondary,
};

/** @deprecated see `palette`. */
export const darkPalette: typeof palette = {
  red: darkTokens.alert.coral,
  orange: darkTints.travel.ink,
  yellow: darkTints.finance.ink,
  green: darkTints.upkeep.ink,
  mint: darkTints.health.ink,
  teal: darkTints.health.ink,
  cyan: darkTints.tasks.ink,
  blue: darkTints.tasks.ink,
  indigo: darkTints.memory.ink,
  purple: darkTints.memory.ink,
  pink: darkTints.people.ink,
  brown: darkTints.finance.ink,
  gray: darkTokens.fg.secondary,
};

/** @deprecated flat colour names from the old theme; use `Theme.c`. */
export interface ThemeColors {
  background: string;
  card: string;
  cardSecondary: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  separator: string;
  fill: string;
  fillSecondary: string;
  tint: string;
  tabBar: string;
  danger: string;
  success: string;
  warning: string;
  overlay: string;
  gray: string;
  accents: typeof palette;
}

function legacyColors(c: Colors, accents: typeof palette): ThemeColors {
  return {
    background: c.bg.ground,
    card: c.bg.tile,
    cardSecondary: c.bg.tileRaised,
    text: c.fg.primary,
    textSecondary: c.fg.secondary,
    textTertiary: c.fg.tertiary,
    separator: c.line,
    fill: c.line,
    fillSecondary: c.bg.tile,
    tint: accents.blue,
    tabBar: c.bg.bar,
    danger: c.alert.coralText,
    success: accents.green,
    warning: accents.orange,
    overlay: c.bg.scrim,
    gray: c.fg.secondary,
    accents,
  };
}

export const lightColors = legacyColors(lightTokens, palette);
export const darkColors = legacyColors(darkTokens, darkPalette);

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

export interface Theme {
  dark: boolean;
  /** DESIGN.md colour tokens. */
  c: Colors;
  tints: Record<TintKey, Tint>;
  type: typeof type;
  radius: typeof radius;
  spacing: typeof spacing;
  layout: typeof layout;
  /** @deprecated use `c` */
  colors: ThemeColors;
}

export function makeTheme(dark: boolean): Theme {
  return {
    dark,
    c: dark ? darkTokens : lightTokens,
    tints: dark ? darkTints : lightTints,
    type,
    radius,
    spacing,
    layout,
    colors: dark ? darkColors : lightColors,
  };
}

export const lightTheme = makeTheme(false);
export const darkTheme = makeTheme(true);
