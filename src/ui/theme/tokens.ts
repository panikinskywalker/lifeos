/**
 * Design tokens — source of truth is docs/DESIGN.md (and, once shared, the
 * Claude Design canvas). Warm bone ground, tiles one shade off, mustard
 * accent, muted pastel module tints, Manrope with tabular numerals.
 *
 * No shadows, no gradients. If a value is not in DESIGN.md it is marked
 * "working value" and must be replaced from the canvas.
 */

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

export interface Colors {
  bg: { ground: string; tile: string; tileRaised: string; bar: string; pressed: string; scrim: string };
  fg: { primary: string; secondary: string; tertiary: string; onBar: string; onBarActive: string };
  line: string;
  accent: { mustard: string; mustardInk: string };
  /** coral/sage are for fills, rings and dots; *Text variants are the AA-contrast versions for text. */
  alert: { coral: string; coralText: string; coralInk: string; coralFill: string };
  ok: { sage: string; sageText: string; sageInk: string };
}

export const lightTokens: Colors = {
  bg: {
    ground: '#F4F3EE',
    tile: '#ECEBE5',
    tileRaised: '#FFFFFF',
    bar: '#17201C',
    pressed: '#E2E0D8', // working value: tile pressed state = line colour
    scrim: '#17201C66', // working value: sheet backdrop
  },
  fg: {
    primary: '#1B1F1D',
    secondary: '#6F7773',
    tertiary: '#A2A8A4',
    onBar: '#9AA19C', // working value: inactive icon on the bar
    onBarActive: '#F4F3EE', // working value: active label on the bar
  },
  line: '#E2E0D8',
  accent: { mustard: '#F3C84B', mustardInk: '#5A4300' },
  alert: { coral: '#E9635A', coralText: '#A8362E', coralInk: '#FFFFFF', coralFill: '#F7D5D1' }, // coralText: working value, 4.8:1 on coralFill
  ok: { sage: '#8FB59B', sageText: '#2E5A3C', sageInk: '#1B1F1D' },
};

export const darkTokens: Colors = {
  bg: {
    ground: '#141614',
    tile: '#1E211E',
    tileRaised: '#262A27',
    bar: '#262A27', // working value: the light bar colour is too close to the dark ground
    pressed: '#2C302D',
    scrim: '#00000099',
  },
  fg: {
    primary: '#F1F0EA',
    secondary: '#9AA19C',
    tertiary: '#6B726D', // working value
    onBar: '#9AA19C',
    onBarActive: '#F1F0EA',
  },
  line: '#2C302D',
  accent: { mustard: '#F3C84B', mustardInk: '#5A4300' },
  alert: { coral: '#E9635A', coralText: '#F08A82', coralInk: '#FFFFFF', coralFill: '#4A2825' },
  ok: { sage: '#8FB59B', sageText: '#8FB59B', sageInk: '#141614' },
};

export type TintKey = 'finance' | 'upkeep' | 'people' | 'tasks' | 'health' | 'memory' | 'travel' | 'documents';
export interface Tint {
  fill: string;
  ink: string;
}

export const lightTints: Record<TintKey, Tint> = {
  finance: { fill: '#F1DFB8', ink: '#6B4F12' },
  upkeep: { fill: '#CFE0D1', ink: '#2E5A3C' },
  people: { fill: '#EFCDC8', ink: '#7A3A34' },
  tasks: { fill: '#CFDDEB', ink: '#2B4A66' },
  health: { fill: '#CDE6DD', ink: '#215546' },
  memory: { fill: '#DDD5EA', ink: '#4B3D6B' },
  travel: { fill: '#F4D9C4', ink: '#7A4520' },
  documents: { fill: '#DEDCD3', ink: '#4C4B44' },
};

/** Same hue, fill at ~28% lightness, ink at ~80% (DESIGN.md › Dark). */
export const darkTints: Record<TintKey, Tint> = {
  finance: { fill: '#594E36', ink: '#E8D6B0' },
  upkeep: { fill: '#38573C', ink: '#BDDBC7' },
  people: { fill: '#593A36', ink: '#DEBDBA' },
  tasks: { fill: '#364759', ink: '#B9CDDF' },
  health: { fill: '#36594C', ink: '#B8E0D5' },
  memory: { fill: '#433659', ink: '#C7BFD9' },
  travel: { fill: '#594536', ink: '#E7C7B1' },
  documents: { fill: '#524E3D', ink: '#CFCEC9' },
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

const designType = {
  display: face(800, 40, 44, -0.03, true),
  title: face(800, 28, 32, -0.02),
  heading: face(700, 20, 26),
  body: face(600, 15, 22),
  caption: face(600, 12, 16),
  stat: face(800, 26, 28, 0, true),
  /** working value: tile/row labels a step above caption */
  label: face(700, 13, 18),
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
  card: 16,
  chip: 999,
  input: 12,
  iconBox: 10,
  /** @deprecated */ sm: 10,
  /** @deprecated */ md: 12,
  /** @deprecated */ lg: 16,
  /** @deprecated */ xl: 20,
  /** @deprecated */ pill: 999,
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const layout = {
  gutter: 20,
  gridGap: 12,
  bar: { height: 62, radius: 22, inset: 20 },
  iconBox: 32,
  touch: 48,
} as const;

export const icon = { stroke: 2, strokeInBox: 2.2, size: 24 } as const;

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
