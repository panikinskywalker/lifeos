/**
 * Design tokens — colours from the Stitch "LifeOS Android design system"
 * (M1.5), layout and components from the LifeOS Claude Design canvas; both
 * recorded in docs/DESIGN.md. Warm cream ground, tiles in surface levels,
 * gold/mustard accent, module tints from the Stitch data palette.
 *
 * No shadows, no gradients. A value the canvas does not specify is marked
 * "working value".
 */

/* ------------------------------------------------------------------ */
/* Colour                                                              */
/* ------------------------------------------------------------------ */

export interface Colors {
  /**
   * Stitch surface levels: ground = surface, tile = container-high (bento
   * tiles), tileRaised = container-low (a slab nested in a tile), lowest =
   * white (segmented track, composer), container = the level between, dim =
   * tracks and pressed controls.
   */
  /** overlay: controls on a photo or tinted record band; pill: the Done pill and an off toggle's thumb. */
  bg: { ground: string; tile: string; tileRaised: string; lowest: string; container: string; dim: string; bar: string; pressed: string; scrim: string; overlay: string; pill: string };
  /** onBar / onBarActive: nav bar icon+label, inactive and active (active is mustard for the icon). */
  /** onBarText: text on the bar colour (toast). */
  fg: { primary: string; secondary: string; tertiary: string; onBar: string; onBarActive: string; onBarText: string };
  /** Track: segmented, toggle and chip tracks, hairlines. */
  line: string;
  /** Unfilled part of a Ring. */
  ringTrack: string;
  /** Timeline rail, chart gridlines. */
  rail: string;
  /** Data series, in order: mint · sky · lavender · rose · olive (Stitch). */
  chart: readonly [string, string, string, string, string];
  /** mustard: primary-container (actions, selected). gold: primary (links, accent text/icons). mustardSoft: primary-fixed. */
  accent: { mustard: string; mustardInk: string; mustardSoft: string; gold: string };
  /** coral / sage are fills, rings and dots; *Text variants are for text and icons. */
  alert: { coral: string; coralText: string; coralInk: string; coralFill: string };
  /** sageFill: the "done / optimal" pill (secondary-container). */
  ok: { sage: string; sageText: string; sageInk: string; sageFill: string };
}

/** Stitch "LifeOS Android design system" palette (Material 3 roles, warm cream + gold + sage + steel). */
export const lightTokens: Colors = {
  bg: {
    ground: '#FCF9F4', // surface
    tile: '#EBE8E3', // surface-container-high
    tileRaised: '#F6F3EE', // surface-container-low
    lowest: '#FFFFFF', // surface-container-lowest
    container: '#F0EDE8', // surface-container
    dim: '#DCDAD5', // surface-dim
    bar: '#1C1C19', // our dark bar, on-surface ink
    pressed: '#E5E2DD', // surface-container-highest
    scrim: '#1C1C1947',
    overlay: '#FFFFFFB3',
    pill: '#FFFFFF',
  },
  fg: {
    primary: '#1C1C19', // on-surface
    secondary: '#4D4635', // on-surface-variant
    tertiary: '#7F7663', // outline
    onBar: '#B5B0A6',
    onBarActive: '#F3C84B',
    onBarText: '#F3F0EB', // inverse-on-surface
  },
  line: '#DCDAD5', // surface-dim
  ringTrack: '#DCDAD5',
  rail: '#D1C5AF', // outline-variant
  chart: ['#6F9E88', '#7F9BB0', '#8C7FB0', '#C89AA6', '#8E9B70'],
  accent: { mustard: '#F3C84B', mustardInk: '#241A00', mustardSoft: '#FFE08F', gold: '#755B00' },
  alert: { coral: '#E9635A', coralText: '#BA1A1A', coralInk: '#FFFFFF', coralFill: '#FFDAD6' },
  ok: { sage: '#BFCC9E', sageText: '#57633D', sageInk: '#151F02', sageFill: '#D8E5B5' },
};

/** Derived by us — Stitch ships light only. Material-style dark roles of the same hues. */
export const darkTokens: Colors = {
  bg: {
    ground: '#141311',
    tile: '#252420',
    tileRaised: '#1D1C19',
    lowest: '#0F0E0C',
    container: '#211F1C',
    dim: '#3A3833',
    bar: '#2B2A26',
    pressed: '#33312C',
    scrim: '#00000073',
    overlay: '#0000004D',
    pill: '#33312C',
  },
  fg: {
    primary: '#E6E2DC',
    secondary: '#D1C5AF',
    tertiary: '#9A9079',
    onBar: '#9A9079',
    onBarActive: '#F3C84B',
    onBarText: '#E6E2DC',
  },
  line: '#3A3833',
  ringTrack: '#3A3833',
  rail: '#4D4635',
  chart: ['#8FC0A8', '#9FBBD0', '#AEA2D0', '#E0B6C0', '#AEBB8E'],
  accent: { mustard: '#F3C84B', mustardInk: '#241A00', mustardSoft: '#584400', gold: '#ECC245' },
  alert: { coral: '#F07A71', coralText: '#FFB4AB', coralInk: '#1C1C19', coralFill: '#5C1F1A' },
  ok: { sage: '#5B6741', sageText: '#BFCC9E', sageInk: '#E6E2DC', sageFill: '#404B27' },
};

export type TintKey = 'finance' | 'upkeep' | 'people' | 'tasks' | 'health' | 'memory' | 'travel' | 'documents';
export interface Tint {
  fill: string;
  ink: string;
}

/** Module tints redrawn from the Stitch data palette. Things share mint with Upkeep. */
export const lightTints: Record<TintKey, Tint> = {
  finance: { fill: '#F7E7B4', ink: '#584400' }, // gold
  upkeep: { fill: '#CFE2D8', ink: '#284938' }, // mint
  people: { fill: '#F0DCE1', ink: '#7A3E4E' }, // rose
  tasks: { fill: '#D3E3EF', ink: '#2E4A5C' }, // steel
  health: { fill: '#D8E5B5', ink: '#404B27' }, // sage
  memory: { fill: '#E1DCEF', ink: '#4B3F75' }, // lavender
  travel: { fill: '#F5DCCB', ink: '#7A4420' }, // terracotta
  documents: { fill: '#E5E2DD', ink: '#4D4635' }, // stone
};

export const darkTints: Record<TintKey, Tint> = {
  finance: { fill: '#584400', ink: '#FFE08F' },
  upkeep: { fill: '#284938', ink: '#CFE2D8' },
  people: { fill: '#5A2E3A', ink: '#F0DCE1' },
  tasks: { fill: '#2E4A5C', ink: '#C9E6FD' },
  health: { fill: '#404B27', ink: '#DAE8B8' },
  memory: { fill: '#3D3361', ink: '#E1DCEF' },
  travel: { fill: '#5E3418', ink: '#F5DCCB' },
  documents: { fill: '#4D4635', ink: '#E5E2DD' },
};

export const TINT_KEYS = Object.keys(lightTints) as TintKey[];

/* ------------------------------------------------------------------ */
/* Type                                                                */
/* ------------------------------------------------------------------ */

/** Plus Jakarta Sans faces (Stitch), loaded in app/_layout.tsx and embedded via the expo-font plugin. */
export const fonts = {
  400: 'PlusJakartaSans_400Regular',
  500: 'PlusJakartaSans_500Medium',
  600: 'PlusJakartaSans_600SemiBold',
  700: 'PlusJakartaSans_700Bold',
  800: 'PlusJakartaSans_800ExtraBold',
} as const;
export type FontWeightKey = keyof typeof fonts;

/** Maps a numeric/keyword fontWeight to the Plus Jakarta Sans face that carries it (Android ignores fontWeight on custom families). */
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

/** Stitch type scale (Plus Jakarta Sans): 600 headings, 400 body, tabular metrics, UPPERCASE labels (applied at the call site). */
const designType = {
  /** Hero metric — 36/700, −0.025em, tabular (display-hero-mobile) */
  display: face(700, 36, 42, -0.025, true),
  /** Metric — 26/600, −0.015em, tabular (headline-metric-mobile) */
  stat: face(600, 26, 32, -0.015, true),
  /** Screen title — 30/700, −0.025em ("Good morning.") */
  title: face(700, 30, 36, -0.025),
  /** Tile / section headline — 19/600, −0.015em (headline-tile) */
  heading: face(600, 19, 24, -0.015),
  /** Row title — 15/600 */
  rowTitle: face(600, 15, 20),
  /** Body — 15/400, −0.005em (body-default) */
  body: face(400, 15, 22, -0.005),
  /** Tile title — 14/600 */
  tileTitle: face(600, 14, 18),
  /** Chip / field label — 13/600 */
  label: face(600, 13, 17),
  /** Caption — 13/400, secondary (body-sm) */
  caption: face(400, 13, 18),
  /** Label caps — 12/600, +0.06em, uppercase at the call site (label-telemetry) */
  labelCaps: face(600, 12, 16, 0.06),
  /** Micro label — 10/700, +0.05em, uppercase at the call site (label-micro) */
  labelMicro: face(700, 10, 14, 0.05),
  /** Nav — 11/600 */
  nav: face(600, 11, 13),
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
  statSmall: face(600, 22, 26, -0.015, true),
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
