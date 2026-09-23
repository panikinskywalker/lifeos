import React from 'react';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { Text } from './Text';

export type ChipTone = 'neutral' | 'alert' | 'ok' | 'accent';

/** Static label: status, tag, count. Tinted by module or by tone. */
export function Chip({ label, tint, tone = 'neutral', icon, onPress, small }: { label: string; tint?: TintKey; tone?: ChipTone; icon?: IconName | (string & {}); onPress?: () => void; small?: boolean }) {
  const t = useTheme();
  const [bg, fg] = tint
    ? [t.tints[tint].fill, t.tints[tint].ink]
    : {
        neutral: [t.c.line, t.c.fg.primary],
        alert: [t.c.alert.coralFill, t.c.alert.coralText],
        ok: [t.tints.upkeep.fill, t.tints.upkeep.ink],
        accent: [t.c.accent.mustard, t.c.accent.mustardInk],
      }[tone];
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: small ? 24 : 28, paddingHorizontal: small ? 8 : 10, borderRadius: t.radius.chip, backgroundColor: bg, alignSelf: 'flex-start' }}>
      {icon ? <Icon name={icon} size={small ? 12 : 14} color={fg} /> : null}
      <Text variant="caption" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}

/** Selectable chip for filters. Selected = mustard. 36 high, 48 target. */
export function FilterChip({ label, selected, onPress, icon, count }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName | (string & {}); count?: number }) {
  const t = useTheme();
  // line, not tile: unselected chips must read on ground, tile and raised surfaces alike.
  const bg = selected ? t.c.accent.mustard : t.c.line;
  const fg = selected ? t.c.accent.mustardInk : t.c.fg.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: t.radius.chip, backgroundColor: pressed && !selected ? t.c.fg.tertiary : bg })}
    >
      {icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text variant="label" color={fg}>
        {label}
      </Text>
      {count != null ? (
        <Text variant="caption" color={selected ? fg : t.c.fg.secondary} style={{ fontVariant: ['tabular-nums'] }}>
          {count}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Horizontal scroller of FilterChips that bleeds to the screen edge. */
export function ChipRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{ marginHorizontal: -t.layout.gutter, flexGrow: 0 }, style]} contentContainerStyle={{ gap: 8, paddingHorizontal: t.layout.gutter }}>
      {children}
    </ScrollView>
  );
}
