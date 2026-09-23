import React from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, View, type PressableProps, type ScrollViewProps, type StyleProp, type TextProps, type TextStyle, type ViewProps, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon as SvgIcon } from '../icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../theme/ThemeProvider';
import { fontForWeight, type Theme } from '../theme/tokens';

/* ------------------------------------------------------------------ */
/* Icon — inline SVG from src/ui/icons (legacy SF-style names resolve)  */
/* ------------------------------------------------------------------ */

export function Icon({ name, size = 20, color, style }: { name: string; size?: number; color?: string; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return <SvgIcon name={name} size={size} color={color ?? theme.c.fg.primary} style={style} />;
}

/* ------------------------------------------------------------------ */
/* Text                                                                */
/* ------------------------------------------------------------------ */

type Variant = keyof Theme['type'];
export function Text({ variant = 'body', color, style, children, ...rest }: TextProps & { variant?: Variant; color?: 'primary' | 'secondary' | 'tertiary' | string }) {
  const t = useTheme();
  const c = color === 'secondary' ? t.c.fg.secondary : color === 'tertiary' ? t.c.fg.tertiary : color && color !== 'primary' ? color : t.c.fg.primary;
  // Android ignores fontWeight on custom families: turn a weight override into the matching Manrope face.
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  const face = flat?.fontWeight !== undefined && !flat.fontFamily ? { fontFamily: fontForWeight(flat.fontWeight), fontWeight: undefined } : null;
  return (
    <RNText {...rest} style={[t.type[variant] as TextStyle, { color: c }, flat, face]}>
      {children}
    </RNText>
  );
}

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function Screen({ children, title, largeTitle = true, right, scroll = true, contentStyle, padded = true, ...rest }: ScrollViewProps & { title?: string; largeTitle?: boolean; right?: React.ReactNode; scroll?: boolean; contentStyle?: StyleProp<ViewStyle>; padded?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const body = (
    <>
      {title && largeTitle ? (
        <View style={[styles.largeTitleRow, { paddingHorizontal: t.spacing.lg }]}>
          <Text variant="largeTitle" style={{ flex: 1 }} numberOfLines={1}>
            {title}
          </Text>
          {right}
        </View>
      ) : null}
      <View style={[padded && { paddingHorizontal: t.spacing.lg }, contentStyle]}>{children}</View>
    </>
  );
  if (!scroll) return <View style={{ flex: 1, backgroundColor: t.colors.background }}>{body}</View>;
  return (
    <ScrollView
      {...rest}
      style={[{ flex: 1, backgroundColor: t.colors.background }, rest.style]}
      contentContainerStyle={[{ paddingBottom: insets.bottom + 100 }, rest.contentContainerStyle]}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
    >
      {body}
    </ScrollView>
  );
}

export function Card({ children, style, padded = true, onPress, accent, ...rest }: ViewProps & { padded?: boolean; onPress?: () => void; accent?: string }) {
  const t = useTheme();
  const inner = (
    <View {...rest} style={[{ backgroundColor: t.colors.card, borderRadius: t.radius.lg, overflow: 'hidden' }, padded && { padding: t.spacing.lg }, accent ? { borderLeftWidth: 0 } : null, style]}>
      {children}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
      {inner}
    </Pressable>
  );
}

/** Coloured header with icon, like "Activity" / "Heart" in Apple Health. */
export function SectionHeader({ title, icon, color, action, onAction, style }: { title: string; icon?: string; color?: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const c = color ?? t.colors.text;
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
        {icon ? <Icon name={icon} size={16} color={c} /> : null}
        <Text variant="headline" color={c} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="subhead" color={t.colors.tint}>
            {action}
          </Text>
          <Icon name="chevron.right" size={14} color={t.colors.tint} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Group label above a card group (small grey uppercase, like iOS Settings). */
export function GroupLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ paddingHorizontal: t.spacing.lg, paddingTop: t.spacing.xl, paddingBottom: t.spacing.sm }, style]}>
      <Text variant="footnote" color="secondary" style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {children}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

export function Row({ title, subtitle, value, valueColor, icon, iconColor, iconBg, onPress, onLongPress, chevron, right, first, last, destructive, style, children, badge, badgeColor }: {
  title: string;
  subtitle?: string | null;
  value?: string | null;
  valueColor?: string;
  icon?: string;
  iconColor?: string;
  iconBg?: string;
  onPress?: () => void;
  onLongPress?: () => void;
  chevron?: boolean;
  right?: React.ReactNode;
  first?: boolean;
  last?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}) {
  const t = useTheme();
  const showChevron = chevron ?? !!onPress;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress} style={({ pressed }) => [{ backgroundColor: pressed ? t.colors.fillSecondary : 'transparent' }, style]}>
      <View style={[styles.row, { paddingHorizontal: t.spacing.lg }]}>
        {icon ? (
          <View style={[styles.rowIcon, { backgroundColor: iconBg ?? (iconColor ?? t.colors.tint) + '22' }]}>
            <Icon name={icon} size={18} color={iconColor ?? t.colors.tint} />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="body" color={destructive ? t.colors.danger : undefined} numberOfLines={1} style={{ flexShrink: 1 }}>
              {title}
            </Text>
            {badge ? <Badge label={badge} color={badgeColor} /> : null}
          </View>
          {subtitle ? (
            <Text variant="footnote" color="secondary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          {children}
        </View>
        {value ? (
          <Text variant="body" color={valueColor ?? 'secondary'} style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
            {value}
          </Text>
        ) : null}
        {right}
        {showChevron ? <Icon name="chevron.right" size={16} color={t.colors.textTertiary} /> : null}
      </View>
      {!last ? <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.separator, marginLeft: icon ? 60 : t.spacing.lg }} /> : null}
    </Pressable>
  );
}

export function Badge({ label, color }: { label: string; color?: string }) {
  const t = useTheme();
  const c = color ?? t.colors.gray;
  return (
    <View style={{ backgroundColor: c + '22', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}>
      <Text variant="caption2" color={c}>
        {label}
      </Text>
    </View>
  );
}

export function Chip({ label, selected, onPress, color, icon }: { label: string; selected?: boolean; onPress?: () => void; color?: string; icon?: string }) {
  const t = useTheme();
  const c = color ?? t.colors.tint;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: t.radius.pill, backgroundColor: selected ? c : t.colors.fillSecondary, opacity: pressed ? 0.7 : 1 })}>
      {icon ? <Icon name={icon} size={14} color={selected ? '#fff' : t.colors.text} /> : null}
      <Text variant="subhead" color={selected ? '#fff' : undefined} style={{ fontWeight: '500' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Stats — big numeral + unit, the Health signature                     */
/* ------------------------------------------------------------------ */

export function Stat({ value, unit, label, color, small, trend }: { value: string; unit?: string; label?: string; color?: string; small?: boolean; trend?: { value: string; up: boolean } }) {
  const t = useTheme();
  return (
    <View>
      {label ? (
        <Text variant="footnote" color="secondary" style={{ marginBottom: 2 }}>
          {label}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, flexWrap: 'wrap' }}>
        <Text variant={small ? 'statSmall' : 'stat'} color={color} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {unit ? (
          <Text variant="subhead" color="secondary" style={{ marginBottom: small ? 4 : 7, fontWeight: '600' }}>
            {unit}
          </Text>
        ) : null}
        {trend ? (
          <Text variant="footnote" color={trend.up ? t.colors.success : t.colors.danger} style={{ marginBottom: small ? 5 : 8, marginLeft: 4 }}>
            {trend.up ? '↑' : '↓'} {trend.value}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons & inputs                                                    */
/* ------------------------------------------------------------------ */

export function Button({ title, onPress, variant = 'primary', color, icon, loading, disabled, style, small }: { title: string; onPress?: () => void; variant?: 'primary' | 'secondary' | 'plain' | 'destructive'; color?: string; icon?: string; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>; small?: boolean }) {
  const t = useTheme();
  const c = color ?? (variant === 'destructive' ? t.colors.danger : t.colors.tint);
  const bg = variant === 'primary' ? c : variant === 'secondary' ? c + '1F' : 'transparent';
  const fg = variant === 'primary' ? '#fff' : c;
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') void Haptics.selectionAsync();
        onPress?.();
      }}
      disabled={disabled || loading}
      style={({ pressed }) => [{ backgroundColor: bg, paddingVertical: small ? 8 : 14, paddingHorizontal: small ? 14 : 20, borderRadius: small ? t.radius.sm : t.radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text variant={small ? 'subhead' : 'headline'} color={fg} style={{ fontWeight: '600' }}>
        {title}
      </Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, color, size = 22, style, bg }: { icon: string; onPress?: () => void; color?: string; size?: number; style?: StyleProp<ViewStyle>; bg?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1, padding: 6 }, bg && { backgroundColor: t.colors.fillSecondary, borderRadius: t.radius.pill, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', padding: 0 }, style]}>
      <Icon name={icon} size={bg ? 18 : size} color={color ?? t.colors.tint} />
    </Pressable>
  );
}

export const Input = React.forwardRef<TextInput, React.ComponentProps<typeof TextInput> & { label?: string; error?: string; right?: React.ReactNode }>(function Input({ label, error, style, right, ...rest }, ref) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="footnote" color="secondary">
          {label}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: t.colors.fillSecondary, borderRadius: t.radius.sm, paddingHorizontal: 12 }}>
        <TextInput ref={ref} placeholderTextColor={t.colors.textTertiary} {...rest} style={[{ flex: 1, color: t.colors.text, fontSize: 17, paddingVertical: Platform.OS === 'ios' ? 12 : 9, minHeight: 44 }, style]} />
        {right}
      </View>
      {error ? (
        <Text variant="caption" color={t.colors.danger}>
          {error}
        </Text>
      ) : null}
    </View>
  );
});

export function Segmented<T extends string>({ options, value, onChange, color }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.colors.fillSecondary, borderRadius: t.radius.sm, padding: 2 }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={{ flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: t.radius.sm - 2, backgroundColor: sel ? t.colors.card : 'transparent', shadowOpacity: sel ? 0.08 : 0, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } }}>
            <Text variant="footnote" style={{ fontWeight: sel ? '600' : '400' }} color={sel && color ? color : undefined}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function EmptyState({ icon = 'tray', title, body, action, onAction, color }: { icon?: string; title: string; body?: string; action?: string; onAction?: () => void; color?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 8 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: (color ?? t.colors.tint) + '1A', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Icon name={icon} size={30} color={color ?? t.colors.tint} />
      </View>
      <Text variant="title3" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {body ? (
        <Text variant="subhead" color="secondary" style={{ textAlign: 'center' }}>
          {body}
        </Text>
      ) : null}
      {action ? <Button title={action} onPress={onAction} variant="secondary" color={color} style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

export function Divider({ inset = 0 }: { inset?: number }) {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.separator, marginLeft: inset }} />;
}

export function Spacer({ h = 16 }: { h?: number }) {
  return <View style={{ height: h }} />;
}

export function Loading() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.colors.background }}>
      <ActivityIndicator />
    </View>
  );
}

export function PressableScale({ children, style, ...rest }: PressableProps & { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable {...rest} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }], opacity: pressed ? 0.9 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  largeTitleRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, paddingBottom: 12, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 10 },
  rowIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
