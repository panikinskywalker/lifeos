import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { shortNameForModule, tintForModule } from '@ui/theme/moduleTint';
import { Icon, IconBox, IconButton, RowList, Screen, Section, Text, RowItem } from '@ui/kit';
import { EntityRow } from '@ui/components/EntityRow';

/** Browse (canvas 05): search, a two-column grid of modules in their tints, then Recent. */
export default function BrowseTab() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const counts = useLive((o) => o.entities.countsByType(), []);
  const facts = useLive((o) => o.facts.list({ limit: 10000 }).length, []);
  const recent = useLive((o) => o.entities.recent(6), []);
  const modules = [...os.registry.modules.values()].filter((m) => m.id !== 'core' && m.id !== 'dashboard');
  return (
    <Screen tab title="Browse" right={<IconButton icon="user-circle" accessibilityLabel="You" filled onPress={() => router.navigate('/you')} />}>
      <Pressable accessibilityRole="search" accessibilityLabel="Search everything" onPress={() => router.push('/search')} style={{ height: 50, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }}>
        <Icon name="search" size={18} color={t.c.fg.secondary} />
        <Text variant="body" color="tertiary">
          Search records, people, things…
        </Text>
      </Pressable>
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
      <RowItem icon="sparkle" tint="memory" title="Memory" subtitle={facts ? `${facts} thing${facts === 1 ? '' : 's'} you’ve told me` : 'What Talk remembers for you'} onPress={() => router.push('/memory')} />
      {recent.length ? (
        <Section title="Recent" action="Tags" onAction={() => router.push('/tag')}>
          <RowList>
            {recent.map((e) => (
              <EntityRow key={e.id} entity={e} showType />
            ))}
          </RowList>
        </Section>
      ) : null}
    </Screen>
  );
}
