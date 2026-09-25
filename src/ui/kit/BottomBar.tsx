import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface BottomBarItem {
  key: string;
  label: string;
  icon: IconName;
  /** The centre action (Talk): a raised mustard disc instead of a plain tab. */
  primary?: boolean;
}

/** Canvas: the bar sits 20 above the bottom edge (inset 20). */
const BAR_BOTTOM_GAP = 20;
const RAISED = 58;

/** Space a tab screen must leave at the bottom so content clears the floating bar. */
export function useBottomBarInset(): number {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return insets.bottom + BAR_BOTTOM_GAP + t.layout.bar.height + 16;
}

/**
 * Canvas bottom bar: dark pill 66 high, radius 22, inset 20. Tabs are a 22
 * icon over an 11/700 label; the selected one is mustard. The centre Talk is
 * a 58 mustard disc (mic) rising 26 above the bar, its label under it.
 */
export function BottomBar({ items, active, onPress, onLongPress, floating = true }: { items: BottomBarItem[]; active: string; onPress: (key: string) => void; onLongPress?: (key: string) => void; floating?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height, radius, inset } = t.layout.bar;
  return (
    <View
      accessibilityRole="tablist"
      style={[
        { height, borderRadius: radius, backgroundColor: t.c.bg.bar, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
        floating ? { position: 'absolute', left: inset, right: inset, bottom: insets.bottom + BAR_BOTTOM_GAP } : null,
      ]}
    >
      {items.map((item) => {
        const selected = item.key === active;
        if (item.primary) {
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              aria-selected={selected}
              onPress={() => onPress(item.key)}
              onLongPress={onLongPress ? () => onLongPress(item.key) : undefined}
              style={{ flex: 1, height, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 14 }}
            >
              {({ pressed }) => (
                <>
                  <View style={{ position: 'absolute', top: -26, width: RAISED, height: RAISED, borderRadius: RAISED / 2, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.95 : 1 }] }}>
                    <Icon name={item.icon} size={24} color={t.c.accent.mustardInk} />
                  </View>
                  <Text variant="nav" color={selected ? t.c.fg.onBarActive : t.c.fg.onBar}>
                    {item.label}
                  </Text>
                </>
              )}
            </Pressable>
          );
        }
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={item.label}
            accessibilityState={{ selected }}
                aria-selected={selected}
            onPress={() => onPress(item.key)}
            onLongPress={onLongPress ? () => onLongPress(item.key) : undefined}
            style={({ pressed }) => ({ flex: 1, height, alignItems: 'center', justifyContent: 'center', gap: 5, opacity: pressed ? 0.7 : 1 })}
          >
            <Icon name={item.icon} size={22} color={selected ? t.c.fg.onBarActive : t.c.fg.onBar} />
            <Text variant="nav" color={selected ? t.c.fg.onBarActive : t.c.fg.onBar} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
