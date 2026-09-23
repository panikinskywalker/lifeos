import React from 'react';
import { ActivityIndicator, Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

function tap() {
  if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
}

/** Primary = mustard; secondary = line fill (reads on ground and tile); ghost = text only; destructive = coral. 48 high (40 when small). */
export function Button({ title, onPress, variant = 'primary', icon, loading, disabled, small, block, style, accessibilityLabel }: { title: string; onPress?: () => void; variant?: ButtonVariant; icon?: IconName | (string & {}); loading?: boolean; disabled?: boolean; small?: boolean; block?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string }) {
  const t = useTheme();
  const bg = { primary: t.c.accent.mustard, secondary: t.c.line, ghost: 'transparent', destructive: t.c.alert.coral }[variant];
  const fg = { primary: t.c.accent.mustardInk, secondary: t.c.fg.primary, ghost: t.c.fg.primary, destructive: t.c.alert.coralInk }[variant];
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
          minHeight: small ? 40 : t.layout.touch,
          paddingHorizontal: small ? 14 : 20,
          borderRadius: t.radius.chip,
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
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text variant="body" color={fg} style={{ fontWeight: '700' }}>
        {title}
      </Text>
    </Pressable>
  );
}

/** Round icon-only button with a 48dp target. `filled` gives it a tile background. */
export function IconButton({ icon, onPress, accessibilityLabel, color, filled, size = 40, style, disabled }: { icon: IconName | (string & {}); onPress?: () => void; accessibilityLabel: string; color?: string; filled?: boolean | string; size?: number; style?: StyleProp<ViewStyle>; disabled?: boolean }) {
  const t = useTheme();
  const bg = typeof filled === 'string' ? filled : filled ? t.c.bg.tile : 'transparent';
  const pad = Math.max(0, (t.layout.touch - size) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      hitSlop={pad}
      onPress={onPress}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, backgroundColor: pressed && !filled ? t.c.bg.pressed : bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }, style]}
    >
      <View>
        <Icon name={icon} size={Math.round(size * 0.55)} color={color ?? t.c.fg.primary} />
      </View>
    </Pressable>
  );
}
