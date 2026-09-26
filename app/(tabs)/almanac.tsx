import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { almanacSections, onThisDay } from '@core/almanac/almanac';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { TintKey } from '@ui/theme/tokens';
import { Icon, IconBox, IconButton, RowItem, RowList, Screen, Section, Text } from '@ui/kit';
import { EntityRow } from '@ui/components/EntityRow';
import { ToCheckBell } from '../../src/screens/ToCheckBell';

/**
 * Almanac (M4.4, PRODUCT v4 §1.2, replaces Browse): a reference book of your
 * life. Search everything; browse by area — People · Things · Money · Body ·
 * Mind · Places — or by date in Time; "On this day"; what changed recently.
 */
export default function AlmanacTab() {
  const t = useTheme();
  const router = useRouter();
  const sections = useLive((o) => almanacSections(o), []);
  const back = useLive((o) => onThisDay(o), []);
  const recent = useLive((o) => o.entities.recent(6), []);
  const open = (id: string) => router.push((id === 'time' ? '/almanac/time' : `/almanac/${id}`) as never);
  return (
    <Screen tab title="Almanac" right={<View style={{ flexDirection: 'row', gap: 8 }}><ToCheckBell /><IconButton icon="user-circle" accessibilityLabel="You" filled onPress={() => router.navigate('/you')} /></View>}>
      <Pressable accessibilityRole="search" accessibilityLabel="Search everything" onPress={() => router.push('/search')} style={{ height: 50, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 }}>
        <Icon name="search" size={18} color={t.c.fg.secondary} />
        <Text variant="body" color="tertiary">
          Search people, things, dumps, what you’ve said…
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {sections.map((s) => {
          const tint = s.tint as TintKey;
          const meta = s.id === 'time' ? 'by day, month, year' : `${s.total.toLocaleString('en-IN')} ${s.total === 1 ? 'record' : 'records'}`;
          return (
            <Pressable
              key={s.id}
              accessibilityRole="button"
              accessibilityLabel={`${s.label}, ${meta}`}
              onPress={() => open(s.id)}
              style={({ pressed }) => ({ flexBasis: s.id === 'time' ? '100%' : '40%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: t.radius.tile, backgroundColor: t.tints[tint].fill, opacity: pressed ? 0.85 : 1 })}
            >
              <IconBox icon={s.icon} tint={tint} tone="overlay" size={36} color={t.c.fg.primary} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="rowTitle" numberOfLines={1}>
                  {s.label}
                </Text>
                <Text variant="labelCaps" color={t.tints[tint].ink} numberOfLines={1} style={{ letterSpacing: 0 }}>
                  {meta}
                </Text>
              </View>
              {s.id === 'time' ? <Icon name="chevron-right" size={18} color={t.c.fg.secondary} /> : null}
            </Pressable>
          );
        })}
      </View>
      {back.length ? (
        <Section title="On this day">
          <RowList>
            {back.slice(0, 4).map((d) => (
              <RowItem
                key={d.day}
                icon="history"
                tint="memory"
                title={d.items.map((i) => i.title).slice(0, 2).join(' · ')}
                subtitle={d.items.length > 2 ? `+ ${d.items.length - 2} more` : undefined}
                value={d.ago}
                valueTone="secondary"
                chevron
                onPress={() => router.push({ pathname: '/almanac/time', params: { span: 'day', day: d.day } } as never)}
              />
            ))}
          </RowList>
        </Section>
      ) : null}
      {recent.length ? (
        <Section title="Recently changed" action="Tags" onAction={() => router.push('/tag')}>
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
