import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { IconBox } from './IconBox';
import { Text } from './Text';

/** Round-cornered square checkbox, 24 px drawn, 48 px target. */
export function Checkbox({ checked, onChange, accessibilityLabel, color }: { checked: boolean; onChange?: (next: boolean) => void; accessibilityLabel: string; color?: string }) {
  const t = useTheme();
  const on = color ?? t.c.ok.sageText;
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked }} hitSlop={12} onPress={() => onChange?.(!checked)} style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: checked ? on : t.c.fg.tertiary, backgroundColor: checked ? on : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {checked ? <Icon name="check" size={16} strokeWidth={3} color={t.c.bg.ground} /> : null}
    </Pressable>
  );
}

export interface RowItemProps {
  title: string;
  subtitle?: string | null;
  icon?: IconName | (string & {});
  tint?: TintKey;
  /** Trailing value (amount, date, count). */
  value?: string | null;
  valueTone?: 'default' | 'alert' | 'ok' | 'secondary';
  /** Show a trailing checkbox instead of a value. */
  checked?: boolean;
  onToggle?: (next: boolean) => void;
  /** Trailing element after value (chip, switch). */
  trailing?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Hairline under the row (inset past the icon-box). */
  divider?: boolean;
  destructive?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** icon-box · title / sub · trailing value or checkbox. Min 56 high. */
export function RowItem({ title, subtitle, icon, tint, value, valueTone = 'default', checked, onToggle, trailing, chevron, onPress, onLongPress, divider, destructive, style }: RowItemProps) {
  const t = useTheme();
  const valueColor = { default: t.c.fg.primary, alert: t.c.alert.coralText, ok: t.c.ok.sageText, secondary: t.c.fg.secondary }[valueTone];
  const done = checked === true;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress && !onLongPress}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [{ backgroundColor: pressed ? t.c.bg.pressed : 'transparent' }, style]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 16 }}>
        {icon ? <IconBox icon={icon} tint={tint} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="body" numberOfLines={1} color={destructive ? t.c.alert.coralText : done ? 'secondary' : undefined} style={done ? { textDecorationLine: 'line-through' } : undefined}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value ? (
          <Text variant="body" color={valueColor} numberOfLines={1} style={{ fontVariant: ['tabular-nums'], fontWeight: '700' }}>
            {value}
          </Text>
        ) : null}
        {trailing}
        {checked !== undefined ? <Checkbox checked={checked} onChange={onToggle} accessibilityLabel={title} /> : null}
        {chevron ?? (!!onPress && checked === undefined) ? <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} /> : null}
      </View>
      {divider ? <View style={{ height: 1, backgroundColor: t.c.line, marginLeft: icon ? 60 : 16 }} /> : null}
    </Pressable>
  );
}
