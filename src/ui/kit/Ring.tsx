import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { ringGeometry } from './layout';

/** Progress ring 0..1 with a flat track (no gradient). Children sit in the centre. */
export function Ring({ progress, size = 64, stroke = 8, color, track, children, accessibilityLabel }: { progress: number; size?: number; stroke?: number; color?: string; track?: string; children?: React.ReactNode; accessibilityLabel?: string }) {
  const t = useTheme();
  const g = ringGeometry(size, stroke, progress);
  const c = color ?? t.c.fg.primary;
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel} accessibilityValue={{ min: 0, max: 100, now: Math.round(g.progress * 100) }} style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={g.r} stroke={track ?? t.c.line} strokeWidth={stroke} fill="none" />
        {g.progress > 0 ? (
          <Circle cx={size / 2} cy={size / 2} r={g.r} stroke={c} strokeWidth={stroke} fill="none" strokeDasharray={`${g.circumference} ${g.circumference}`} strokeDashoffset={g.offset} strokeLinecap="round" transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}
