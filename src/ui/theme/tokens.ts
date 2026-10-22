/**
 * Design tokens. Since 22 Oct 2026 the design language is **v3 Noir**
 * (docs/DESIGN.md; the NR-* artboards on the LifeOS Claude Design canvas):
 * the dark theme is Noir — near-black ground, charcoal cards, lime accent,
 * colour blocks, pills — and the type scale and shapes are Noir's for both
 * themes. The light theme keeps the v1.1 Stitch colours until it is redrawn.
 * Token names are the old roles (`accent.mustard` is the accent: lime in
 * Noir). A value the artboards do not specify is marked "working value".
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
  bg: { ground: string; tile: string; tileRaised: string; lowest: string; container: string; dim: string; bar: string; pressed: string; scrim: string; overlay: string; pill: string; toast: string };
  /** onBar / onBarActive: nav bar icon+label, inactive and active (active is mustard for the icon). */
  /** onBarText: text on the bar colour (toast). */
  /** onToast: text on the toast (Noir: a white pill, dark text). onAccent: ink on the accent and on colour blocks. */
  fg: { primary: string; secondary: string; tertiary: string; onBar: string; onBarActive: string; onBarText: string; onToast: string; onAccent: string };
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
    toast: '#1C1C19',
  },
  fg: {
    primary: '#1C1C19', // on-surface
    secondary: '#4D4635', // on-surface-variant
    tertiary: '#7F7663', // outline
    onBar: '#B5B0A6',
    onBarActive: '#F3C84B',
    onBarText: '#F3F0EB', // inverse-on-surface
    onToast: '#F3F0EB',
    onAccent: '#241A00',
  },
  line: '#DCDAD5', // surface-dim
  ringTrack: '#DCDAD5',
  rail: '#D1C5AF', // outline-variant
  chart: ['#6F9E88', '#7F9BB0', '#8C7FB0', '#C89AA6', '#8E9B70'],
  accent: { mustard: '#F3C84B', mustardInk: '#241A00', mustardSoft: '#FFE08F', gold: '#755B00' },
  alert: { coral: '#E9635A', coralText: '#BA1A1A', coralInk: '#FFFFFF', coralFill: '#FFDAD6' },
  ok: { sage: '#BFCC9E', sageText: '#57633D', sageInk: '#151F02', sageFill: '#D8E5B5' },
};

/** v3 Noir (NR-KitComponents, 22 Oct): measured from the artboards. Text levels are #F5F5F7 at 100 / 62 / 42 %. */
export const darkTokens: Colors = {
  bg: {
    ground: '#0B0B0D',
    tile: '#1A1A1E', // cards, rows, row groups, inputs
    tileRaised: '#26262B', // nested slab, chips, icon buttons, module discs, secondary button
    lowest: '#26262B', // segmented track
    container: '#1A1A1E',
    dim: '#FFFFFF12', // rgba(255,255,255,0.07): quiet pill, bar track
    bar: '#1A1A1E', // the nav pill
    pressed: '#FFFFFF24', // rgba(255,255,255,0.14)
    scrim: '#0000008C', // working value: "rises over a dimmed page"
    overlay: '#0B0B0D24', // rgba(11,11,13,0.14): quiet control on a colour block
    pill: '#F5F5F76B', // off toggle thumb
    toast: '#F5F5F7', // white pill
  },
  fg: {
    primary: '#F5F5F7',
    secondary: '#F5F5F79E',
    tertiary: '#F5F5F76B',
    onBar: '#F5F5F79E',
    onBarActive: '#0B0B0D', // icon on the lime disc
    onBarText: '#F5F5F7',
    onToast: '#0B0B0D',
    onAccent: '#0B0B0D',
  },
  line: '#FFFFFF14', // rgba(255,255,255,0.08) hairline
  ringTrack: '#FFFFFF12',
  rail: '#FFFFFF14',
  chart: ['#D7F55C', '#A9C4FF', '#F4A8CE', '#F6E27F', '#C9A7F5'],
  accent: { mustard: '#D7F55C', mustardInk: '#0B0B0D', mustardSoft: '#D7F55C29', gold: '#D7F55C' },
  alert: { coral: '#FF5C47', coralText: '#FF8A7A', coralInk: '#0B0B0D', coralFill: '#FF5C472E' },
  ok: { sage: '#D7F55C', sageText: '#D7F55C', sageInk: '#0B0B0D', sageFill: '#D7F55C29' },
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

/** Noir module discs: a dark disc, the module's colour (NR-KitComponents · Module discs). */
export const darkTints: Record<TintKey, Tint> = {
  finance: { fill: '#26262B', ink: '#F26B2B' },
  upkeep: { fill: '#26262B', ink: '#A9C4FF' },
  people: { fill: '#26262B', ink: '#F4A8CE' },
  tasks: { fill: '#26262B', ink: '#C9A7F5' },
  health: { fill: '#26262B', ink: '#D7F55C' },
  memory: { fill: '#26262B', ink: '#B48CF2' },
  travel: { fill: '#26262B', ink: '#FF8A6A' },
  documents: { fill: '#26262B', ink: '#F6E27F' },
};

/** Noir colour blocks (tiles on a colour, faces): everything on them is ground-black. */
export const blocks = { lime: '#D7F55C', sky: '#A9C4FF', orange: '#F26B2B', pink: '#F4A8CE', yellow: '#F6E27F', lilac: '#C9A7F5', mint: '#9FE0B5' } as const;

/** Noir module gradients (Browse · module stack, hero tiles), 160°. */
export const gradients = {
  finance: ['#F2742B', '#9E2A2A'],
  health: ['#3BA35E', '#145A66'],
  tasks: ['#8E6CF0', '#3A47C8'],
  people: ['#F25CA2', '#8E1F60'],
  upkeep: ['#3E86E8', '#1A3A86'],
  memory: ['#9B5CF6', '#2F2A8C'],
  travel: ['#E8452F', '#6E2290'],
  documents: ['#5E5E66', '#26262B'],
} as const satisfies Record<TintKey, readonly [string, string]>;

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

/** JetBrains Mono (Noir: numbered labels and instrument readouts), loaded beside Plus Jakarta Sans. */
export const monoFonts = { 500: 'JetBrainsMono_500Medium', 700: 'JetBrainsMono_700Bold' } as const;

/** Bebas Neue (Turf · Noir: team letters, crests, scores and formations). */
export const displayFont = 'BebasNeue_400Regular';

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

const mono = (w: keyof typeof monoFonts, fontSize: number, lineHeight: number, letterSpacing = 0): TypeStyle => ({ fontFamily: monoFonts[w], fontSize, lineHeight, letterSpacing, fontVariant: ['tabular-nums'] });

/** v3 Noir type scale (NR-KitComponents): Plus Jakarta Sans 600 / 700, tabular numbers, tight big numerals, UPPERCASE labels at the call site. */
const designType = {
  /** Hero number — 44/700, −1.5 (number card) */
  display: { ...face(700, 44, 46, 0, true), letterSpacing: -1.5 },
  /** Number on a tile — 30/700, −1.5 */
  stat: { ...face(700, 30, 32, 0, true), letterSpacing: -1.5 },
  /** Quiet metric — 22/700, −0.5 (metrics row) */
  metric: { ...face(700, 22, 26, 0, true), letterSpacing: -0.5 },
  /** Screen title — 22/700, −0.5 (top bar) */
  title: { ...face(700, 22, 25), letterSpacing: -0.5 },
  /** Section header / sheet title — 17/600, −0.2 */
  heading: { ...face(600, 17, 22), letterSpacing: -0.2 },
  /** The sentence on a text widget — 24/600, −0.4 */
  sentence: { ...face(600, 24, 30), letterSpacing: -0.4 },
  /** Row title — 16/600 */
  rowTitle: face(600, 16, 21),
  /** Body — 15/400 */
  body: face(400, 15, 21),
  /** Tile title — 15/600 */
  tileTitle: face(600, 15, 19),
  /** Chip — 14/600 */
  label: face(600, 14, 18),
  /** Caption / where — 13/400 */
  caption: face(400, 13, 17),
  /** Section label — 11/600, +0.9, UPPERCASE at the call site, tertiary */
  labelCaps: { ...face(600, 11, 14, 0, true), letterSpacing: 0.9 },
  /** Status pill / micro — 12/600 */
  labelMicro: face(600, 12, 16),
  /** Numbered label / readout — JetBrains Mono 10/500, +0.6, UPPERCASE at the call site */
  mono: mono(500, 10, 13, 0.6),
  /** Nav — 11/600 (Noir's nav has no labels; kept for the old bar) */
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

/** Noir shapes: pills everywhere, cards 24 / 28, sheets 32. */
export const radius = {
  /** tiles, text widgets, number cards */
  tile: 28,
  /** card, row card, row group, sheet body */
  card: 24,
  sheet: 32,
  /** bottom corners of the record header band (working value) */
  band: 28,
  button: 999,
  input: 20,
  /** module disc / face: round */
  iconBox: 999,
  checkbox: 999,
  /** progress bar (22 tall) */
  bar: 11,
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
  /** Noir nav: a 64-tall pill of 52 discs (6 padding) and a 64 lime Dump disc beside it. */
  bar: { height: 64, radius: 999, inset: 20, disc: 52, fab: 64 },
  /** module disc / face in a row */
  iconBox: 40,
  touch: 48,
  /** buttons: 52 full, 44 compact; round actions 44 */
  button: { tall: 52, compact: 44, round: 44 },
} as const;

/** 2px stroke everywhere; sizes 22 nav · 18 row · 16 tile · 14 chip. */
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
  /** A module's colour name ("pink", see PaletteKey in core) → this theme's hex; a hex passes through. */
  paletteColor: (c: string | undefined | null) => string | undefined;
  /** DESIGN.md colour tokens. */
  c: Colors;
  tints: Record<TintKey, Tint>;
  /** Noir colour blocks and module gradients (same in both themes). */
  blocks: typeof blocks;
  gradients: typeof gradients;
  type: typeof type;
  radius: typeof radius;
  spacing: typeof spacing;
  layout: typeof layout;
  /** @deprecated use `c` */
  colors: ThemeColors;
}

/** Resolve a colour name from core (PaletteKey) to a hex for the given scheme; hex and unknown strings pass through. */
export function paletteColor(c: string | undefined | null, dark = false): string | undefined {
  if (!c) return undefined;
  const p = (dark ? darkPalette : palette) as Record<string, string>;
  return p[c] ?? c;
}

export function makeTheme(dark: boolean): Theme {
  return {
    dark,
    paletteColor: (c) => paletteColor(c, dark),
    c: dark ? darkTokens : lightTokens,
    tints: dark ? darkTints : lightTints,
    blocks,
    gradients,
    type,
    radius,
    spacing,
    layout,
    colors: dark ? darkColors : lightColors,
  };
}

export const lightTheme = makeTheme(false);
export const darkTheme = makeTheme(true);
