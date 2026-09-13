/**
 * Design tokens — Apple Health-inspired: grouped backgrounds, white/near-black
 * cards with generous radius, large titles, coloured section headers with an
 * icon, big numerals with small unit labels. Each module gets an accent.
 */
export const palette = {
  red: '#FF3B30', orange: '#FF9500', yellow: '#FFCC00', green: '#34C759', mint: '#00C7BE', teal: '#30B0C7', cyan: '#32ADE6',
  blue: '#007AFF', indigo: '#5856D6', purple: '#AF52DE', pink: '#FF2D55', brown: '#A2845E', gray: '#8E8E93',
};

export const darkPalette = {
  red: '#FF453A', orange: '#FF9F0A', yellow: '#FFD60A', green: '#30D158', mint: '#63E6E2', teal: '#40CBE0', cyan: '#64D2FF',
  blue: '#0A84FF', indigo: '#5E5CE6', purple: '#BF5AF2', pink: '#FF375F', brown: '#AC8E68', gray: '#8E8E93',
};

export interface ThemeColors {
  background: string; // grouped background
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

export const lightColors: ThemeColors = {
  background: '#F2F2F7',
  card: '#FFFFFF',
  cardSecondary: '#F2F2F7',
  text: '#000000',
  textSecondary: '#3C3C4399',
  textTertiary: '#3C3C434D',
  separator: '#3C3C4349',
  fill: '#78788033',
  fillSecondary: '#78788028',
  tint: palette.blue,
  tabBar: '#F9F9F9F0',
  danger: palette.red,
  success: palette.green,
  warning: palette.orange,
  overlay: '#00000066',
  gray: palette.gray,
  accents: palette,
};

export const darkColors: ThemeColors = {
  background: '#000000',
  card: '#1C1C1E',
  cardSecondary: '#2C2C2E',
  text: '#FFFFFF',
  textSecondary: '#EBEBF599',
  textTertiary: '#EBEBF54D',
  separator: '#54545899',
  fill: '#7878805C',
  fillSecondary: '#78788052',
  tint: darkPalette.blue,
  tabBar: '#161616F0',
  danger: darkPalette.red,
  success: darkPalette.green,
  warning: darkPalette.orange,
  overlay: '#00000099',
  gray: darkPalette.gray,
  accents: darkPalette,
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 26, pill: 999 } as const;

export const type = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: 0.37, lineHeight: 41 },
  title1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  title2: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  title3: { fontSize: 20, fontWeight: '600' as const, lineHeight: 25 },
  headline: { fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
  body: { fontSize: 17, fontWeight: '400' as const, lineHeight: 22 },
  callout: { fontSize: 16, fontWeight: '400' as const, lineHeight: 21 },
  subhead: { fontSize: 15, fontWeight: '400' as const, lineHeight: 20 },
  footnote: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },
  caption2: { fontSize: 11, fontWeight: '500' as const, lineHeight: 13 },
  stat: { fontSize: 34, fontWeight: '700' as const, lineHeight: 40, fontVariant: ['tabular-nums'] as const },
  statSmall: { fontSize: 24, fontWeight: '700' as const, lineHeight: 30, fontVariant: ['tabular-nums'] as const },
};

export type Theme = {
  dark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  type: typeof type;
};
