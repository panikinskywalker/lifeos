import React from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { useControlFill, useSurface } from './Surface';
import { Text } from './Text';

/** Noir controls: a charcoal pill track (padding 4), 36-high segments, selected white with ground ink (mustard in light). */
export function Segmented<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  const control = useControlFill();
  const track = useSurface() === 'tile' ? control : t.c.bg.lowest;
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', backgroundColor: track, borderRadius: t.radius.chip, padding: 4, gap: 4 }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: sel }} aria-selected={sel} onPress={() => onChange(o.value)} style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: t.radius.chip, backgroundColor: sel ? (t.dark ? t.c.fg.primary : t.c.accent.mustard) : 'transparent' }}>
            <Text variant="label" color={sel ? (t.dark ? t.c.bg.ground : t.c.accent.mustardInk) : 'secondary'} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
