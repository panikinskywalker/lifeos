import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { DAY, describeCycle, startOfDay } from '@core/cycles/schedule';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { FilterChip, Icon, IconButton, Screen, Text } from '@ui/kit';
import { ASSET_CATEGORIES, categoryLabel, clothesSpaces, type AssetData } from '@modules/assets';
import { CapsHead, CATEGORY_PLURAL, categoryIcon, Disc, Group, isService, listPill, needsLook, NothingYet, Pill, worthOf, type Tone } from './parts';

/**
 * All Assets (NR-Assets-List): search, category chips, a group per category
 * with its worth, Clothing as one row into Home, then what you sold or lost.
 */

interface Row {
  a: ObjectRecord<AssetData>;
  sub: string;
  pill: { label: string; tone: Tone } | null;
}

/** A warranty in words, or null with none: "warranty 330 days left", "warranty until Mar 2028", "out of warranty". */
function warrantyWords(d: AssetData, now: number): string | null {
  const until = d.warrantyUntil?.slice(0, 10);
  if (!until) return null;
  const end = new Date(`${until}T12:00:00`).getTime();
  const left = Math.round((startOfDay(end) - startOfDay(now)) / DAY);
  if (left < 0) return 'out of warranty';
  return left <= 365 ? `warranty ${left} day${left === 1 ? '' : 's'} left` : `warranty until ${format(end, 'MMM yyyy')}`;
}

function rowOf(os: LifeOSContext, a: ObjectRecord<AssetData>, now: number): Row {
  const cycles = os.cycles.forEntity(a.id).map((cycle) => ({ cycle, status: os.cycles.status(cycle, now) }));
  const urgent = cycles.filter(needsLook).sort((x, y) => (x.status.daysLeft ?? 999) - (y.status.daysLeft ?? 999))[0];
  const space = a.data.spaceId ? os.records.get(a.data.spaceId)?.title : null;
  const place = a.data.placeId ? os.records.get(a.data.placeId)?.title : null;
  const where = space ?? place ?? a.data.location ?? null;
  const service = cycles.find(isService);
  const serviceWords = service && service.status.state !== 'unscheduled' ? `service ${describeCycle(service.cycle)}${service.cycle.nextDueAt ? ` · ${format(service.cycle.nextDueAt, 'MMM')}` : ''}` : null;
  const warranty = warrantyWords(a.data, now);
  const label = categoryLabel(a.data.category);
  if (a.data.category === 'vehicle') return { a, sub: a.subtitle ?? label, pill: urgent ? listPill(urgent) : null };
  if (urgent) return { a, sub: where ?? label, pill: listPill(urgent) };
  const running = warranty && warranty !== 'out of warranty' ? warranty : null;
  return { a, sub: running ?? serviceWords ?? warranty ?? where ?? label, pill: null };
}

function listData(os: LifeOSContext) {
  const now = Date.now();
  const all = os.records.query<AssetData>('asset', {}, { limit: 5000 });
  const live = all.filter((a) => a.status !== 'sold' && a.status !== 'lost');
  const gone = all
    .filter((a) => a.status === 'sold' || a.status === 'lost')
    .map((a) => {
      const at = os.records.timeline.forEntity(a.id, 200).find((e) => e.kind === 'status')?.occurredAt;
      return { a, word: a.status === 'sold' ? 'Sold' : 'Lost', at };
    });
  return { rows: live.map((a) => rowOf(os, a, now)), gone, clothesSpace: clothesSpaces(os)[0]?.id ?? null };
}

export function AssetsList({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const t = useTheme();
  const router = useRouter();
  const d = useLive(listData, []);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(params.category ?? null);
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => d.rows.filter((r) => (!category || r.a.data.category === category) && (!q || [r.a.title, r.a.data.serial, r.a.data.plate, r.a.data.notes].some((s) => s?.toLowerCase().includes(q)))), [d.rows, category, q]);
  const cats = ASSET_CATEGORIES.filter((c) => d.rows.some((r) => r.a.data.category === c.value));
  // Clothes live in Home: one row there, unless you are searching for one.
  const clothesFolded = !q && !!d.clothesSpace;
  const groups = ASSET_CATEGORIES.filter((c) => !(clothesFolded && c.value === 'clothing'))
    .map((c) => ({ c, rows: shown.filter((r) => r.a.data.category === c.value || (c.value === 'other' && !ASSET_CATEGORIES.some((k) => k.value === r.a.data.category))) }))
    .filter((g) => g.rows.length);
  const clothing = clothesFolded ? shown.filter((r) => r.a.data.category === 'clothing').length : 0;
  const open = (id: string) => router.push(`/entity/asset/${id}` as never);
  const sold = d.gone.filter((g) => g.word === 'Sold').length;
  const lost = d.gone.length - sold;
  const subtitle = [`${d.rows.length} owned`, sold ? `${sold} sold` : null, lost ? `${lost} lost` : null].filter(Boolean).join(' · ');
  const right = <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} accessibilityLabel="Add an Asset" onPress={() => router.push(category ? (`/entity/asset/new?category=${category}` as never) : ('/entity/asset/new' as never))} />;
  const header = { title: 'All Assets', subtitle, right, onBack: () => (router.canGoBack() ? router.back() : router.replace('/module/assets/index' as never)), contentStyle: { gap: 22 } };

  if (!d.rows.length && !d.gone.length) {
    return (
      <Screen {...header}>
        <NothingYet />
      </Screen>
    );
  }
  return (
    <Screen {...header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: t.c.line }}>
        <Icon name="search" size={18} color={t.c.fg.secondary} />
        <TextInput accessibilityLabel="Search Assets" value={query} onChangeText={setQuery} placeholder="Name, serial or registration" placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} cursorColor={t.c.accent.mustard} style={{ flex: 1, minWidth: 0, color: t.c.fg.primary, fontSize: 16, lineHeight: 21, fontFamily: fontForWeight(500), paddingVertical: 12 }} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -t.layout.gutter }} contentContainerStyle={{ paddingHorizontal: t.layout.gutter, gap: 8 }}>
        <FilterChip label="All" selected={!category} onPress={() => setCategory(null)} />
        {cats.map((c) => (
          <FilterChip key={c.value} label={CATEGORY_PLURAL[c.value] ?? c.label} selected={category === c.value} onPress={() => setCategory(c.value)} />
        ))}
      </ScrollView>
      {groups.map(({ c, rows }) => {
        const sum = rows.reduce((n, r) => n + worthOf(r.a.data), 0);
        return (
          <View key={c.value} style={{ gap: 10 }}>
            <CapsHead tone="tertiary" label={`${(CATEGORY_PLURAL[c.value] ?? c.label).toUpperCase()} · ${rows.length}`} right={rows.length > 1 && sum ? ctx.format.currency(Math.round(sum)) : null} />
            <Group>
              {rows.map((r) => (
                <Pressable key={r.a.id} accessibilityRole="button" accessibilityLabel={r.a.title} onPress={() => open(r.a.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, opacity: pressed ? 0.7 : 1 })}>
                  <Disc icon={categoryIcon(r.a.data.category)} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="rowTitle" numberOfLines={1}>{r.a.title}</Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>{r.sub}</Text>
                  </View>
                  {r.pill ? <Pill label={r.pill.label} tone={r.pill.tone} /> : worthOf(r.a.data) ? <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{ctx.format.currency(Math.round(worthOf(r.a.data)))}</Text> : null}
                </Pressable>
              ))}
            </Group>
          </View>
        );
      })}
      {clothing ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Clothing, ${clothing}`} onPress={() => router.push({ pathname: '/module/[id]/[page]', params: { id: 'inventory', page: 'space', space: d.clothesSpace } } as never)} style={({ pressed }) => ({ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 72, opacity: pressed ? 0.85 : 1 })}>
          <Disc icon="shirt" />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="rowTitle" numberOfLines={1}>{`Clothing · ${clothing}`}</Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>They live in Home, in Clothes</Text>
          </View>
          <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
        </Pressable>
      ) : null}
      {q && !shown.length ? (
        <Text color="secondary" style={{ textAlign: 'center' }}>{`Nothing called “${query.trim()}”.`}</Text>
      ) : null}
      {d.gone.length && !q && !category ? (
        <View style={{ gap: 10 }}>
          <CapsHead tone="tertiary" label={`SOLD OR LOST · ${d.gone.length}`} />
          <Group>
            {d.gone.map(({ a, word, at }) => (
              <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={a.title} onPress={() => open(a.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, opacity: pressed ? 0.7 : 1 })}>
                <Disc icon={categoryIcon(a.data.category)} outline color={t.c.fg.secondary} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="rowTitle" color="secondary" numberOfLines={1}>{a.title}</Text>
                  <Text variant="caption" color="secondary" numberOfLines={1}>{[at ? `${word.toLowerCase()} ${format(at, 'MMM yyyy')}` : null, 'not counted'].filter(Boolean).join(' · ')}</Text>
                </View>
                <Pill label={word} />
              </Pressable>
            ))}
          </Group>
        </View>
      ) : null}
    </Screen>
  );
}
