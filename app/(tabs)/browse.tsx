import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ToCheckBell } from '../../src/screens/ToCheckBell';
import { shortNameForModule, tintForModule } from '@ui/theme/moduleTint';
import { Icon, IconBox, IconButton, ModuleStack, RowList, Screen, Section, Text, RowItem } from '@ui/kit';
import { RecordRow } from '@ui/components/RecordRow';

/** Browse (docs/MODEL.md §5): search, Boards, the module stack (NR-KitComponents), Facts (the Second Brain's), Recent. */
export default function BrowseTab() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const counts = useLive((o) => o.records.countsByType(), []);
  const facts = useLive((o) => o.facts.list({ limit: 10000 }).length, []);
  const recent = useLive((o) => o.records.recent(6), []);
  const modules = [...os.registry.modules.values()].filter((m) => m.id !== 'core');
  const boards = [...os.registry.boards.values()].filter((b) => b.placement === 'browse');
  return (
    <Screen tab title="Browse" right={<View style={{ flexDirection: 'row', gap: 8 }}><ToCheckBell /><IconButton icon="user-circle" accessibilityLabel="You" filled onPress={() => router.navigate('/you')} /></View>}>
      <Pressable accessibilityRole="search" accessibilityLabel="Search everything" onPress={() => router.push('/search')} style={{ minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: t.c.line, backgroundColor: t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18 }}>
        <Icon name="search" size={18} color={t.c.fg.tertiary} />
        <Text variant="rowTitle" color="tertiary" numberOfLines={1} style={{ flex: 1, fontWeight: '500' }}>
          Search records, people, things…
        </Text>
      </Pressable>
      {boards.length ? (
        <Section title="Boards">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {boards.map((b) => (
              <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={b.name} onPress={() => router.push(`/board/${b.id}` as never)} style={({ pressed }) => ({ flexBasis: '40%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 64, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.85 : 1 })}>
                <IconBox icon={b.icon} tint={tintForModule(b.id)} size={t.layout.iconBox} />
                <Text variant="rowTitle" numberOfLines={1} style={{ flex: 1 }}>
                  {b.name}
                </Text>
              </Pressable>
            ))}
            {boards.length % 2 ? <View style={{ flexBasis: '40%', flexGrow: 1 }} /> : null}
          </View>
        </Section>
      ) : null}
      <Section title="Modules">
        <ModuleStack
          items={modules.map((m, i) => {
            const types = os.registry.objectsForModule(m.id).filter((x) => !x.hidden);
            const n = types.reduce((sum, ty) => sum + (counts[ty.id] ?? 0), 0);
            const unit = types.length === 1 ? types[0]!.labelPlural.toLowerCase() : 'records';
            // Strips show the name alone; the last card, the open one, says what is in it.
            const line = i === modules.length - 1 ? `${n.toLocaleString('en-IN')} ${unit}` : undefined;
            return { key: m.id, title: shortNameForModule(m.id, m.name), line, icon: m.icon, tint: tintForModule(m.id), onPress: () => router.push(`/module/${m.id}`) };
          })}
        />
      </Section>
      <RowItem icon="link" tint="people" title="Links" subtitle="How your records connect" onPress={() => router.push('/links' as never)} />
      <RowItem icon="sparkle" tint="memory" title="Facts" subtitle={facts ? `${facts} thing${facts === 1 ? '' : 's'} you’ve told me · in the Second Brain` : 'What you’ve told LifeOS, in the Second Brain'} onPress={() => router.push('/memory')} />
      {recent.length ? (
        <Section title="Recent" action="Tags" onAction={() => router.push('/tag')}>
          <RowList>
            {recent.map((e) => (
              <RecordRow key={e.id} entity={e} showType />
            ))}
          </RowList>
        </Section>
      ) : null}
    </Screen>
  );
}
