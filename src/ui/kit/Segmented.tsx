import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

/** Pill track in the line colour (reads on ground and tile); the selected segment is raised (colour only, no shadow). */
export function Segmented<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: t.c.line, borderRadius: t.radius.chip, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: sel }} aria-selected={sel} onPress={() => onChange(o.value)} style={{ flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.chip, backgroundColor: sel ? t.c.bg.tileRaised : 'transparent' }}>
            <Text variant="label" color={sel ? 'primary' : 'secondary'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
