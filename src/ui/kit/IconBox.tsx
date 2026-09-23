import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';

/**
 * Rounded square holding one icon (radius 10). Tinted: module fill with ink
 * icon. `inverse` swaps them, for use on a tile already filled with the tint.
 */
export function IconBox({ icon, tint, inverse, size = 32, color, background, style }: { icon: IconName | (string & {}); tint?: TintKey; inverse?: boolean; size?: number; color?: string; background?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const tone = tint ? t.tints[tint] : null;
  const bg = background ?? (tone ? (inverse ? tone.ink : tone.fill) : t.c.bg.tileRaised);
  const fg = color ?? (tone ? (inverse ? tone.fill : tone.ink) : t.c.fg.primary);
  return (
    <View style={[{ width: size, height: size, borderRadius: t.radius.iconBox, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Icon name={icon} size={Math.round(size * 0.58)} color={fg} inBox />
    </View>
  );
}
