import React, { useState } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { stackSegments } from './layout';
import { Text } from './Text';

export interface StackedBarPart {
  label: string;
  value: number;
  color: string;
  /** Shown in the legend; defaults to the raw value. */
  display?: string;
}

/** Rounded segments with 3 px gaps, plus an optional legend row (dot · label · value). */
export function StackedBar({ parts, height = 12, legend = true, track }: { parts: StackedBarPart[]; height?: number; legend?: boolean; track?: string }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const segs = stackSegments(parts.map((p) => p.value), width, 3, Math.max(6, height));
  return (
    <View style={{ gap: 10 }}>
      <View
        accessibilityRole="image"
        accessibilityLabel={parts.map((p) => `${p.label} ${p.display ?? p.value}`).join(', ')}
        style={{ height, borderRadius: height / 2, backgroundColor: segs.length ? 'transparent' : track ?? t.c.line }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {segs.map((s) => (
          <View key={s.index} style={{ position: 'absolute', left: s.x, width: s.width, height, borderRadius: height / 2, backgroundColor: parts[s.index]!.color }} />
        ))}
      </View>
      {legend ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 }}>
          {parts.map((p, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }} />
              <Text variant="caption" color="secondary">
                {p.label}
              </Text>
              <Text variant="caption" style={{ fontVariant: ['tabular-nums'] }}>
                {p.display ?? String(p.value)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
