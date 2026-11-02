import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ToCheckBell } from '../../src/screens/ToCheckBell';
import { shortNameForModule, tintForModule } from '@ui/theme/moduleTint';
import { Icon, IconBox, IconButton, ModuleStack, RowList, Screen, Section, Text, RowItem } from '@ui/kit';
import { RecordRow } from '@ui/components/RecordRow';

/** Browse (docs/MODEL.md §5): search, Boards, Modules in their tints, Facts (the Second Brain's), Recent. */
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
      <Pressable accessibilityRole="search" accessibilityLabel="Search everything" onPress={() => router.push('/search')} style={{ height: 50, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }}>
        <Icon name="search" size={18} color={t.c.fg.secondary} />
        <Text variant="body" color="tertiary">
          Search records, people, things…
        </Text>
      </Pressable>
      {boards.length ? (
        <Section title="Boards">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {boards.map((b) => {
              const tint = tintForModule(b.id);
              return (
                <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={b.name} onPress={() => router.push(`/board/${b.id}` as never)} style={({ pressed }) => ({ flexBasis: '40%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: t.radius.tile, backgroundColor: t.tints[tint].fill, opacity: pressed ? 0.85 : 1 })}>
                  <IconBox icon={b.icon} tint={tint} tone="overlay" size={36} color={t.c.fg.primary} />
                  <Text variant="rowTitle" numberOfLines={1} style={{ flex: 1 }}>
                    {b.name}
                  </Text>
                </Pressable>
              );
            })}
            {boards.length % 2 ? <View style={{ flexBasis: '40%', flexGrow: 1 }} /> : null}
          </View>
        </Section>
      ) : null}
      <Section title="Modules">
        {t.dark ? (
          // Noir: the module stack (NR-KitComponents), each module its gradient card.
          <ModuleStack
            items={modules.map((m) => {
              const types = os.registry.objectsForModule(m.id).filter((x) => !x.hidden);
              const n = types.reduce((sum, ty) => sum + (counts[ty.id] ?? 0), 0);
              const unit = types.length === 1 ? types[0]!.labelPlural.toLowerCase() : 'records';
              return { key: m.id, title: shortNameForModule(m.id, m.name), line: `${n.toLocaleString('en-IN')} ${unit}`, icon: m.icon, tint: tintForModule(m.id), onPress: () => router.push(`/module/${m.id}`) };
            })}
          />
        ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {modules.map((m) => {
            const tint = tintForModule(m.id);
            const types = os.registry.objectsForModule(m.id).filter((x) => !x.hidden);
            const n = types.reduce((sum, ty) => sum + (counts[ty.id] ?? 0), 0);
            const unit = types.length === 1 ? types[0]!.labelPlural.toLowerCase() : 'records';
            const name = shortNameForModule(m.id, m.name);
            const line = `${n.toLocaleString('en-IN')} ${unit}`;
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
        )}
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
