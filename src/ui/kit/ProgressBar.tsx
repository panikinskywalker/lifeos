import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Stitch target progress bar: 8 tall, pill ends, filled part in `color`,
 * optional target tick (a 2px line) — "61 % of income", "800 km to service".
 */
export function ProgressBar({ value, color, track, height = 8, target, accessibilityLabel, style }: { value: number; color?: string; track?: string; height?: number; target?: number; accessibilityLabel?: string; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const v = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }} style={[{ height, borderRadius: height / 2, backgroundColor: track ?? t.c.bg.dim, overflow: 'hidden' }, style]}>
      <View style={{ width: `${v * 100}%`, height, borderRadius: height / 2, backgroundColor: color ?? t.c.accent.mustard }} />
      {target != null ? <View style={{ position: 'absolute', left: `${Math.min(1, Math.max(0, target)) * 100}%`, top: 0, bottom: 0, width: 2, marginLeft: -1, backgroundColor: t.c.fg.primary }} /> : null}
    </View>
  );
}
