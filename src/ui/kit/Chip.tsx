import React from 'react';
import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { useControlFill } from './Surface';
import { Text } from './Text';

/**
 * neutral: control fill, ink · muted: control fill, secondary ("in 3 d") ·
 * alert: coral fill and text · alertText: control fill, coral text (an
 * overdue item in a checklist) · accent: mustard · ok: sage tint.
 */
export type ChipTone = 'neutral' | 'muted' | 'alert' | 'alertText' | 'accent' | 'ok';

/**
 * Static chip. md (7/12, 13/700) for checklists and related records; sm
 * (3/8, 11/700) for category tags and status. `overlay` puts it on a tinted band.
 */
export function Chip({ label, tint, tone = 'neutral', icon, onPress, small, overlay }: { label: string; tint?: TintKey; tone?: ChipTone; icon?: IconName | (string & {}); onPress?: () => void; small?: boolean; overlay?: boolean }) {
  const t = useTheme();
  const control = useControlFill();
  const [bg, fg] = tint
    ? [t.tints[tint].fill, t.tints[tint].ink]
    : {
        neutral: [control, t.c.fg.primary],
        muted: [control, t.c.fg.secondary],
        alert: [t.c.alert.coralFill, t.c.alert.coralText],
        alertText: [control, t.c.alert.coralText],
        accent: [t.c.accent.mustard, t.c.accent.mustardInk],
        ok: [t.tints.upkeep.fill, t.tints.upkeep.ink],
      }[tone];
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: small ? 3 : 7, paddingHorizontal: small ? 8 : 12, borderRadius: t.radius.chip, backgroundColor: overlay ? t.c.bg.overlay : bg, alignSelf: 'flex-start' }}>
      {icon ? <Icon name={icon} size={small ? 12 : 14} color={fg} /> : null}
      <Text variant={small ? 'nav' : 'label'} color={fg} numberOfLines={1}>
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

/** Selectable filter pill (8/14, 13/700). Selected = mustard. 48dp target. */
export function FilterChip({ label, selected, onPress, icon, count }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName | (string & {}); count?: number }) {
  const t = useTheme();
  const control = useControlFill();
  const fg = selected ? t.c.accent.mustardInk : t.c.fg.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      aria-selected={!!selected}
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: t.radius.chip, backgroundColor: selected ? t.c.accent.mustard : control, opacity: pressed ? 0.75 : 1 })}
    >
      {icon ? <Icon name={icon} size={14} color={fg} /> : null}
      <Text variant="label" color={fg}>
        {count != null ? `${label} · ${count}` : label}
      </Text>
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
