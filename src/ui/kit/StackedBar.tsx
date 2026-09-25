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

/** Canvas: 14 tall, radius 7, 3px gaps, 6px minimum; legend in two columns (dot · label · value). */
export function StackedBar({ parts, height = 14, legend = true, track }: { parts: StackedBarPart[]; height?: number; legend?: boolean; track?: string }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const segs = stackSegments(parts.map((p) => p.value), width, 3, 6);
  return (
    <View style={{ gap: 12 }}>
      <View
        accessibilityRole="image"
        accessibilityLabel={parts.map((p) => `${p.label} ${p.display ?? p.value}`).join(', ')}
        style={{ height, borderRadius: t.radius.bar, backgroundColor: segs.length ? 'transparent' : track ?? t.c.line }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {segs.map((s) => (
          <View key={s.index} style={{ position: 'absolute', left: s.x, width: s.width, height, borderRadius: t.radius.bar, backgroundColor: parts[s.index]!.color }} />
        ))}
      </View>
      {legend ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 16 }}>
          {parts.map((p, i) => (
            <View key={i} style={{ width: '47%', flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.color }} />
              <Text variant="caption" color="secondary" numberOfLines={1} style={{ flex: 1 }}>
                {p.label}
              </Text>
              <Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>
                {p.display ?? String(p.value)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
