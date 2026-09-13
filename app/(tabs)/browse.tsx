import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Card, GroupLabel, IconButton, Row, Screen, Text } from '@ui/components/primitives';

/** Like Health › Browse: every module, every entity type, with counts. */
export default function BrowseTab() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const counts = useLive((o) => o.entities.countsByType(), []);
  const modules = [...os.registry.modules.values()].filter((m) => m.id !== 'core');
  return (
    <Screen title="Browse" padded={false} right={<IconButton icon="gear" bg onPress={() => router.push('/settings')} />}>
      {modules.map((m) => {
        const types = os.registry.typesForModule(m.id).filter((x) => !x.hidden);
        const hasHome = m.screens?.some((s) => s.key === 'index');
        return (
          <View key={m.id}>
            <GroupLabel>{m.name}</GroupLabel>
            <Card padded={false} style={{ marginHorizontal: 16 }}>
              {hasHome ? <Row title={`${m.name} overview`} subtitle={m.description} icon={m.icon} iconColor={m.color} onPress={() => router.push(`/module/${m.id}`)} last={types.length === 0} /> : null}
              {m.id === 'automation' ? <Row title="Rules" subtitle="Triggers, conditions, actions" icon="bolt" iconColor={m.color} onPress={() => router.push('/automation')} /> : null}
              {m.id === 'automation' ? <Row title="Reminders" subtitle="Everything scheduled" icon="bell" iconColor={m.color} onPress={() => router.push('/reminders')} last /> : null}
              {types.map((ty, i) => (
                <Row key={ty.type} title={ty.labelPlural} icon={ty.icon} iconColor={os.registry.colorFor(ty.type)} value={counts[ty.type] ? String(counts[ty.type]) : undefined} last={i === types.length - 1} onPress={() => router.push(`/entity/${ty.type}`)} />
              ))}
              {!hasHome && !types.length && m.id !== 'automation' ? <Text color="tertiary" style={{ padding: 16 }}>{m.description}</Text> : null}
            </Card>
          </View>
        );
      })}
      <GroupLabel>System</GroupLabel>
      <Card padded={false} style={{ marginHorizontal: 16 }}>
        <Row title="Tags" icon="tag" iconColor={t.colors.accents.yellow} onPress={() => router.push('/tag')} />
        <Row title="Settings" icon="gear" iconColor={t.colors.gray} onPress={() => router.push('/settings')} last />
      </Card>
    </Screen>
  );
}
