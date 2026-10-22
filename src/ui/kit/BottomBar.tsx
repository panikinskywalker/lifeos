import React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';

export interface BottomBarItem {
  key: string;
  label: string;
  icon: IconName;
  /** The Dump action: the lime disc beside the pill instead of a plain tab. */
  primary?: boolean;
}

/** The nav sits 20 above the bottom edge (inset 20). */
const BAR_BOTTOM_GAP = 20;

/** Space a tab screen must leave at the bottom so content clears the floating nav. */
export function useBottomBarInset(): number {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return insets.bottom + BAR_BOTTOM_GAP + t.layout.bar.height + 16;
}

/**
 * Noir nav (NR-KitComponents · Nav): a dark pill (padding 6, hairline edge)
 * of 52 icon discs — the lime disc is where you are — and beside it, 10
 * apart, the 64 lime Dump disc with its glow. No labels; each disc says its
 * tab to a screen reader.
 */
export function BottomBar({ items, active, onPress, onLongPress, floating = true }: { items: BottomBarItem[]; active: string; onPress: (key: string) => void; onLongPress?: (key: string) => void; floating?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { inset, disc, fab } = t.layout.bar;
  const tabs = items.filter((i) => !i.primary);
  const action = items.find((i) => i.primary);
  return (
    <View
      accessibilityRole="tablist"
      pointerEvents="box-none"
      style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 }, floating ? { position: 'absolute', left: inset, right: inset, bottom: insets.bottom + BAR_BOTTOM_GAP } : null]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, borderRadius: 999, backgroundColor: t.c.bg.bar, borderWidth: t.dark ? 1 : 0, borderColor: t.c.line }}>
        {tabs.map((item) => {
          const selected = item.key === active;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityLabel={item.label}
              accessibilityState={{ selected }}
              aria-selected={selected}
              onPress={() => onPress(item.key)}
              onLongPress={onLongPress ? () => onLongPress(item.key) : undefined}
              style={({ pressed }) => ({ width: disc, height: disc, borderRadius: disc / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? t.c.accent.mustard : pressed ? t.c.bg.pressed : 'transparent' })}
            >
              <Icon name={item.icon} size={22} color={selected ? t.c.accent.mustardInk : t.c.fg.onBar} />
            </Pressable>
          );
        })}
      </View>
      {action ? (
        <Pressable
          accessibilityRole="tab"
          accessibilityLabel={action.label}
          accessibilityState={{ selected: action.key === active }}
          aria-selected={action.key === active}
          onPress={() => onPress(action.key)}
          onLongPress={onLongPress ? () => onLongPress(action.key) : undefined}
          style={({ pressed }) => ({ width: fab, height: fab, borderRadius: fab / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.accent.mustard, transform: [{ scale: pressed ? 0.95 : 1 }], shadowColor: t.c.accent.mustard, shadowOpacity: t.dark ? 0.25 : 0, shadowRadius: 30, shadowOffset: { width: 0, height: 10 }, elevation: t.dark ? 10 : 0 })}
        >
          <Icon name={action.icon} size={26} color={t.c.accent.mustardInk} />
        </Pressable>
      ) : null}
    </View>
  );
}
