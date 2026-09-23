import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { icon as iconTokens } from '../theme/tokens';
import { glyphs, ICON_NAMES, resolveIconName, type Glyph, type GlyphPart, type IconName } from './glyphs';

export { ICON_NAMES, LEGACY_ICON_ALIASES, resolveIconName, type IconName } from './glyphs';

export interface IconProps {
  size?: number;
  color?: string;
  /** 2 by default; pass `inBox` for the 2.2 stroke used inside icon-boxes. */
  strokeWidth?: number;
  inBox?: boolean;
  style?: StyleProp<ViewStyle>;
}
export type IconComponent = React.FC<IconProps>;

function renderPart(p: GlyphPart, i: number) {
  if (typeof p === 'string') return <Path key={i} d={p} />;
  if ('c' in p) return <Circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.c[2]} />;
  return <Rect key={i} x={p.r[0]} y={p.r[1]} width={p.r[2]} height={p.r[3]} rx={p.r[4]} />;
}

function makeIcon(name: IconName, glyph: Glyph): IconComponent {
  const Component: IconComponent = ({ size = iconTokens.size, color = '#1B1F1D', strokeWidth, inBox, style }) => (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      color={color}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? (inBox ? iconTokens.strokeInBox : iconTokens.stroke)}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {glyph.map(renderPart)}
    </Svg>
  );
  Component.displayName = `${name.replace(/(^|-)(\w)/g, (_, __, c: string) => c.toUpperCase())}Icon`;
  return React.memo(Component);
}

/** One component per icon, keyed by name (`icons.car`, `icons['chevron-right']`). */
export const icons = Object.fromEntries(ICON_NAMES.map((n) => [n, makeIcon(n, glyphs[n])])) as Record<IconName, IconComponent>;

/** Icon by name. Accepts legacy SF-style names; unknown names render an empty circle so gaps are visible. */
export function Icon({ name, ...props }: IconProps & { name: IconName | (string & {}) }) {
  const Component = icons[resolveIconName(name) ?? 'circle'];
  return <Component {...props} />;
}
