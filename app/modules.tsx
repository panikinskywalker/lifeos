import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { shortNameForModule, tintForModule } from '@ui/theme/moduleTint';
import { IconBox, Screen, Text } from '@ui/kit';

/** Modules (was Browse, canvas 05): every installed module in its tint, with its record counts. */
export default function ModulesScreen() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const counts = useLive((o) => o.entities.countsByType(), []);
  const modules = [...os.registry.modules.values()].filter((m) => m.id !== 'core' && m.id !== 'dashboard');
  return (
    <Screen title="Modules" onBack={() => (router.canGoBack() ? router.back() : router.replace('/almanac'))}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {modules.map((m) => {
          const tint = tintForModule(m.id);
          const types = os.registry.typesForModule(m.id).filter((x) => !x.hidden);
          const n = types.reduce((sum, ty) => sum + (counts[ty.type] ?? 0), 0);
          const unit = types.length === 1 ? types[0]!.labelPlural.toLowerCase() : 'records';
          const name = shortNameForModule(m.id, m.name);
          const line = types.length ? `${n.toLocaleString('en-IN')} ${unit}` : 'rules & reminders';
          return (
            <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={`${name}, ${line}`} onPress={() => router.push(`/module/${m.id}`)} style={({ pressed }) => ({ flexBasis: '40%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: t.radius.tile, backgroundColor: t.tints[tint].fill, opacity: pressed ? 0.85 : 1 })}>
              <IconBox icon={m.icon} tint={tint} tone="overlay" size={36} color={t.c.fg.primary} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="rowTitle" numberOfLines={1}>
                  {name}
                </Text>
                <Text variant="labelCaps" color={t.tints[tint].ink} numberOfLines={1} style={{ letterSpacing: 0 }}>
                  {line}
                </Text>
              </View>
            </Pressable>
          );
        })}
        {modules.length % 2 ? <View style={{ flexBasis: '40%', flexGrow: 1 }} /> : null}
      </View>
    </Screen>
  );
}
