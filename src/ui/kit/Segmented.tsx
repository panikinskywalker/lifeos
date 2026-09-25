import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useControlFill, useSurface } from './Surface';
import { Text } from './Text';

/** Stitch: pill track (white on the ground, control fill on a tile), 36-high segments, mustard selected. */
export function Segmented<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  const control = useControlFill();
  const track = useSurface() === 'tile' ? control : t.c.bg.lowest;
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: track, borderRadius: t.radius.chip, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: sel }} aria-selected={sel} onPress={() => onChange(o.value)} style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.chip, backgroundColor: sel ? t.c.accent.mustard : 'transparent' }}>
            <Text variant="tileTitle" color={sel ? t.c.accent.mustardInk : 'secondary'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
