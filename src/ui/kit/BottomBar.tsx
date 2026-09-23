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

/** Gap kept between the bar and the bottom safe-area edge (working value). */
const BAR_BOTTOM_GAP = 12;
const RAISED = 58;

/** Space a tab screen must leave at the bottom so content clears the floating bar. */
export function useBottomBarInset(): number {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return insets.bottom + BAR_BOTTOM_GAP + t.layout.bar.height + 16;
}

/**
 * Floating bottom bar (62 high, radius 22, inset 20) on the bar colour. The
 * primary item is a raised mustard disc ringed in the ground colour — the
 * lift comes from the ring, not a shadow. Selected tabs use mustard.
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
            <View key={item.key} style={{ flex: 1, alignItems: 'center' }}>
              <Pressable
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected }}
                aria-selected={selected}
                onPress={() => onPress(item.key)}
                onLongPress={onLongPress ? () => onLongPress(item.key) : undefined}
                style={({ pressed }) => ({
                  width: RAISED,
                  height: RAISED,
                  borderRadius: RAISED / 2,
                  marginTop: -(RAISED - height / 2) - 8,
                  backgroundColor: t.c.accent.mustard,
                  borderWidth: 4,
                  borderColor: t.c.bg.ground,
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                })}
              >
                <Icon name={item.icon} size={26} color={t.c.accent.mustardInk} />
              </Pressable>
            </View>
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
            style={({ pressed }) => ({ flex: 1, height, alignItems: 'center', justifyContent: 'center', gap: 3, opacity: pressed ? 0.7 : 1 })}
          >
            <Icon name={item.icon} size={22} color={selected ? t.c.accent.mustard : t.c.fg.onBar} />
            <Text variant="caption" style={{ fontSize: 11, lineHeight: 13 }} color={selected ? t.c.fg.onBarActive : t.c.fg.onBar} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
