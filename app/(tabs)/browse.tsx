import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ToCheckBell } from '../../src/screens/ToCheckBell';
import { shortNameForModule, tintForModule } from '@ui/theme/moduleTint';
import { Icon, IconBox, IconButton, ModuleStack, RowList, Screen, Section, Text, RowItem } from '@ui/kit';
import { RecordRow } from '@ui/components/RecordRow';
import { isBoardShown, isModuleShown, shownModules } from '@core/registry/shown';

/** The number in a line, for dot numerals: "Pune in 41 days" → "41 DAYS", "₹77,445 spent" → "77.4K". At most 8 characters. */
function dotHeadline(line: string): string | null {
  const m = /(\d[\d,]*(?:\.\d+)?)\s*([kKlL%])?\s*([A-Za-z]+)?/.exec(line);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ''));
  const num = m[2] ? `${m[1]}${m[2].toUpperCase()}` : n >= 1e5 ? `${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K` : m[1]!;
  const unit = m[3] ? ({ d: 'days', h: 'hrs', m: 'min', w: 'wks' } as Record<string, string>)[m[3].toLowerCase()] ?? m[3] : '';
  const word = unit ? ` ${unit.toUpperCase()}` : '';
  return (num + word).length <= 8 ? num + word : num.slice(0, 8);
}

/** Browse (docs/MODEL.md §5): search, Boards, the module stack (NR-KitComponents), Facts (the Second Brain's), Recent. */
export default function BrowseTab() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const counts = useLive((o) => o.records.countsByType(), []);
  const facts = useLive((o) => o.facts.list({ limit: 10000 }).length, []);
  const recent = useLive((o) => o.records.recent(6), []);
  // Only modules and boards that are shown (You › Modules; docs/MODEL.md, Modules shown).
  const shown = useLive((o) => [...(shownModules(o) ?? ['*'])].join(), []);
  const modules = [...os.registry.modules.values()].filter((m) => m.id !== 'core' && isModuleShown(os, m.id));
  const boards = [...os.registry.boards.values()].filter((b) => b.placement === 'browse' && isBoardShown(os, b.id));
  void shown;
  const cards = useLive((o) => Object.fromEntries(modules.map((m) => {
    try {
      // Its companion board's card, else the cross-module board shown with it (Turf for games).
      const board = o.registry.boardFor(m.id) ?? [...o.registry.boards.values()].find((b) => b.shownWith === m.id);
      return [m.id, board?.overview?.(o, Date.now(), { cardOnly: true }).card ?? null];
    } catch {
      return [m.id, null];
    }
  })), []);
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
          items={modules.map((m) => {
            const types = os.registry.objectsForModule(m.id).filter((x) => !x.hidden);
            const n = types.reduce((sum, ty) => sum + (counts[ty.id] ?? 0), 0);
            const unit = types.length === 1 ? types[0]!.labelPlural.toLowerCase() : 'records';
            // The open card says what matters now (its Overview's line), with its dots: the card's own (a name, a place, a day), else the number ("41 DAYS").
            const card = cards[m.id];
            const line = card?.headline ?? `${n.toLocaleString('en-IN')} ${unit}`;
            const dots = (headline: string, own?: string) => own?.toUpperCase().slice(0, 8) ?? dotHeadline(headline) ?? undefined;
            const faces = card?.cycle?.map((c) => ({ line: c.headline, headline: dots(c.headline, c.dots) }));
            return { key: m.id, title: shortNameForModule(m.id, m.name), line, headline: dots(line, card?.dots), faces, icon: m.icon, tint: tintForModule(m.id), onPress: () => router.push(`/module/${m.id}`) };
          })}
        />
      </Section>
      <RowItem icon="link" tint="people" title="Links" subtitle="How your records connect" onPress={() => router.push('/links' as never)} />
      <RowItem icon="sparkle" tint="memory" title="Facts" subtitle={facts ? `${facts} thing${facts === 1 ? '' : 's'} you’ve told me · in the Journal` : 'What you’ve told LifeOS, in the Journal'} onPress={() => router.push('/memory')} />
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
