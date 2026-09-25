import React from 'react';
import { ActivityIndicator, Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { useControlFill } from './Surface';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

function tap() {
  if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
}

/**
 * Canvas buttons: radius 14; primary mustard with ink 15/800; secondary in the
 * control fill with ink 15/700; destructive on the coral fill. Heights: sm 42
 * (inside cards) · md 50 · lg 54 (screen's main action).
 */
export function Button({ title, onPress, variant = 'primary', size = 'md', icon, loading, disabled, small, block, style, accessibilityLabel }: { title: string; onPress?: () => void; variant?: ButtonVariant; size?: ButtonSize; icon?: IconName | (string & {}); loading?: boolean; disabled?: boolean; /** @deprecated use size="sm" */ small?: boolean; block?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const t = useTheme();
  const control = useControlFill();
  const h = { sm: 42, md: 50, lg: 54 }[small ? 'sm' : size];
  const bg = { primary: t.c.accent.mustard, secondary: control, ghost: 'transparent', destructive: t.c.alert.coralFill }[variant];
  const fg = { primary: t.c.accent.mustardInk, secondary: t.c.fg.primary, ghost: t.c.fg.primary, destructive: t.c.alert.coralText }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          height: h,
          paddingHorizontal: variant === 'primary' ? 20 : 18,
          borderRadius: t.radius.button,
          backgroundColor: bg,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          alignSelf: block ? 'stretch' : 'flex-start',
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text variant="body" color={fg} style={{ fontWeight: variant === 'primary' ? '800' : '700' }}>
        {title}
      </Text>
    </Pressable>
  );
}

/**
 * Round icon-only button (40, 48dp target). filled: true = the control fill,
 * 'overlay' = on a tinted band, or any colour string.
 */
export function IconButton({ icon, onPress, accessibilityLabel, color, filled, size = 40, style, disabled }: { icon: IconName | (string & {}); onPress?: () => void; accessibilityLabel: string; color?: string; filled?: boolean | 'overlay' | (string & {}); size?: number; style?: StyleProp<ViewStyle>; disabled?: boolean }) {
  const t = useTheme();
  const control = useControlFill();
  const bg = filled === 'overlay' ? t.c.bg.overlay : typeof filled === 'string' ? filled : filled ? control : 'transparent';
  const pad = Math.max(0, (t.layout.touch - size) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={pad}
      onPress={onPress}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: pressed && !filled ? t.c.bg.pressed : bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.75 : 1 }, style]}
    >
      <View>
        <Icon name={icon} size={size >= 40 ? 20 : 18} color={color ?? t.c.fg.primary} />
      </View>
    </Pressable>
  );
}
