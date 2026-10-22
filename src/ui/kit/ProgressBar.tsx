import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Progress bar, pill ends, filled part in `color`, optional target tick (a
 * 2px line) — "61 % of income", "800 km to service". 8 tall by default; at 22
 * it is Noir's readable bar (NR-KitComponents · Progress), with a soft gloss.
 */
export function ProgressBar({ value, color, track, height = 8, target, accessibilityLabel, style }: { value: number; color?: string; track?: string; height?: number; target?: number; accessibilityLabel?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }} style={[{ height, borderRadius: height / 2, backgroundColor: track ?? t.c.bg.dim, overflow: 'hidden' }, style]}>
      <View style={{ width: `${v * 100}%`, height, borderRadius: height / 2, backgroundColor: color ?? t.c.accent.mustard, overflow: 'hidden' }}>
        {t.dark && height >= 16 ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: height / 2, backgroundColor: '#FFFFFF26' }} /> : null}
      </View>
      {target != null ? <View style={{ position: 'absolute', left: `${Math.min(1, Math.max(0, target)) * 100}%`, top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: t.c.fg.primary }} /> : null}
    </View>
  );
}
