import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { useControlFill } from './Surface';

export type IconBoxTone = 'alert' | 'accent' | 'overlay' | 'plain';

/**
 * Noir disc holding one icon: the module's colour on a dark disc, or a tone —
 * alert (coral), accent (soft lime), overlay (on a colour block), plain (the
 * control fill). Round at every size: 28 tile header · 32 · 40 row · 48
 * record header · 56 empty state.
 */
export function IconBox({ icon, tint, tone, size = 32, color, background, style }: { icon: IconName | (string & {}); tint?: TintKey; tone?: IconBoxTone; size?: number; color?: string; background?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const control = useControlFill();
  const [bg, fg] =
    tone === 'alert'
      ? [t.c.alert.coralFill, t.c.alert.coralText]
      : tone === 'accent'
        ? [t.c.accent.mustardSoft, t.c.fg.primary]
        : tone === 'overlay'
          ? [t.c.bg.overlay, tint ? t.tints[tint].ink : t.c.fg.primary]
          : tint && tone !== 'plain'
            ? [t.tints[tint].fill, t.tints[tint].ink]
            : [control, t.c.fg.primary];
  const r = size / 2;
  const glyph = size >= 56 ? 28 : size >= 48 ? 24 : size >= 36 ? 18 : 16;
  return (
    <View style={[{ width: size, height: size, borderRadius: r, backgroundColor: background ?? bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Icon name={icon} size={glyph} color={color ?? fg} />
    </View>
  );
}
