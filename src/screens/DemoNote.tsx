import React from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Text } from '@ui/kit';
import { isDemo } from '../platform/demo';

/** While demo data is on, says so where it could be mistaken for yours; tapping goes to the switch in You. */
export function DemoNote({ line = 'Demo data: this is all sample. Your own data is safe. Tap to switch.' }: { line?: string }) {
  const t = useTheme();
  const router = useRouter();
  if (!isDemo()) return null;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.navigate('/you')} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: t.radius.tile, backgroundColor: t.c.bg.tile }}>
      <Icon name="sparkle" size={16} color={t.c.fg.secondary} />
      <Text variant="caption" color="secondary" style={{ flex: 1 }}>
        {line}
      </Text>
    </Pressable>
  );
}
