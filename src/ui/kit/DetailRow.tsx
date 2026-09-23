import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

/**
 * Label/value pair for a record's fields. Short values sit right-aligned on
 * one line; long values (or `stacked`) go under the label. Tappable values
 * (links to other records) show a chevron.
 */
export function DetailRow({ label, value, stacked, onPress, divider, valueColor }: { label: string; value: string; stacked?: boolean; onPress?: () => void; divider?: boolean; valueColor?: string }) {
  const t = useTheme();
  const long = stacked ?? value.length > 32;
  return (
    <Pressable accessibilityRole={onPress ? 'link' : undefined} accessibilityLabel={`${label}: ${value}`} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? t.c.bg.pressed : 'transparent' })}>
      <View style={{ paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, flexDirection: long ? 'column' : 'row', alignItems: long ? 'stretch' : 'center', gap: long ? 4 : 12 }}>
        <Text variant="label" color="secondary">
          {label}
        </Text>
        <View style={{ flex: long ? undefined : 1, flexDirection: 'row', alignItems: 'center', justifyContent: long ? 'flex-start' : 'flex-end', gap: 4 }}>
          <Text variant="body" color={valueColor} style={{ textAlign: long ? 'left' : 'right', flexShrink: 1, fontVariant: ['tabular-nums'] }} selectable>
            {value}
          </Text>
          {onPress ? <Icon name="chevron-right" size={16} color={t.c.fg.tertiary} /> : null}
        </View>
      </View>
      {divider ? <View style={{ height: 1, backgroundColor: t.c.line, marginLeft: 16 }} /> : null}
    </Pressable>
  );
}
