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
 * Static chip. md: Noir option pill (30 tall, 13/600). sm: status pill (28
 * tall, 12/600; lime good · coral late · grey quiet). `overlay` puts it on a
 * colour block.
 */
export function Chip({ label, tint, tone = 'neutral', icon, onPress, onLongPress, small, overlay, caps }: { label: string; tint?: TintKey; tone?: ChipTone; icon?: IconName | (string & {}); onPress?: () => void; onLongPress?: () => void; small?: boolean; overlay?: boolean; /** Stitch status pill: UPPERCASE micro label ('ACTIVE', 'URGENT', 'OPTIMAL'). */ caps?: boolean }) {
  const t = useTheme();
  const control = useControlFill();
  const [bg, fg] = tint
    ? [t.tints[tint].fill, t.tints[tint].ink]
    : {
        neutral: [control, t.c.fg.primary],
        muted: [t.dark ? t.c.bg.dim : control, t.c.fg.secondary],
        alert: [t.c.alert.coralFill, t.c.alert.coralText],
        alertText: [control, t.c.alert.coralText],
        accent: [t.c.accent.mustard, t.c.accent.mustardInk],
        ok: [t.c.ok.sageFill, t.c.ok.sageText],
      }[tone];
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: small ? 28 : 30, paddingHorizontal: small ? 11 : 12, borderRadius: t.radius.chip, backgroundColor: overlay ? t.c.bg.overlay : bg, alignSelf: 'flex-start' }}>
      {icon ? <Icon name={icon} size={small ? 12 : 14} color={fg} /> : null}
      <Text variant={small || caps ? 'labelMicro' : 'label'} color={fg} numberOfLines={1} style={[!small && !caps ? { fontSize: 13, lineHeight: 17 } : null, caps ? { textTransform: 'uppercase' } : null]}>
        {label}
      </Text>
    </View>
  );
  if (!onPress && !onLongPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={10} onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}

/** Noir chip (40 tall, 14/600). Selected = white with ground ink (mustard in light). 48dp target. */
export function FilterChip({ label, selected, onPress, icon, count }: { label: string; selected?: boolean; onPress?: () => void; icon?: IconName | (string & {}); count?: number }) {
  const t = useTheme();
  const control = useControlFill();
  const fg = selected ? (t.dark ? t.c.bg.ground : t.c.accent.mustardInk) : t.c.fg.primary;
  const selectedBg = t.dark ? t.c.fg.primary : t.c.accent.mustard;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      aria-selected={!!selected}
      accessibilityLabel={count != null ? `${label}, ${count}` : label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: t.radius.chip, backgroundColor: selected ? selectedBg : pressed && t.dark ? t.c.bg.pressed : control, opacity: pressed && !t.dark ? 0.75 : 1 })}
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
