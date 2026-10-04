import { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { spendQuery, type SpendKind, type SpendPeriod, type SpendSort } from '@modules/finance/spend';
import { categoryOf } from '@modules/finance/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ChipRow, DeltaChip, FilterChip, Icon, IconButton, ScreenHeader, StackedBar, Stat, Text } from '@ui/kit';
import { EntityRow } from '@ui/components/EntityRow';

const PERIODS: Array<[SpendPeriod, string]> = [['month', 'This month'], ['last_month', 'Last month'], ['3_months', '3 months'], ['year', 'This year'], ['all', 'All time']];
const KINDS: Array<[SpendKind, string]> = [['spending', 'Spending'], ['income', 'Income'], ['investments', 'Investments'], ['all', 'Everything']];
const SORTS: Array<[SpendSort, string]> = [['newest', 'Newest'], ['oldest', 'Oldest'], ['largest', 'Largest'], ['smallest', 'Smallest']];

/**
 * Spend (M4.2c): pick a period and what to count, see the total against the
 * previous period and where it went by category — tap a category to filter
 * to it — then filter by account or words and sort the list.
 */
export default function SpendScreen() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string; period?: SpendPeriod }>();
  const [period, setPeriod] = useState<SpendPeriod>(params.period ?? 'month');
  const [kind, setKind] = useState<SpendKind>('spending');
  const [cats, setCats] = useState<string[]>(params.category ? [params.category] : []);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [sort, setSort] = useState<SpendSort>('newest');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const r = useLive((o) => (o.registry.objects.has('transaction') ? spendQuery(o, { period, kind, categories: cats, accountIds: accounts, search, sort }) : null), [period, kind, cats.join(), accounts.join(), search, sort]);
  const toggle = (list: string[], set: (x: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const header = useMemo(
    () =>
      r ? (
        <View style={{ gap: 14, paddingBottom: 8 }}>
          <ChipRow>
            {PERIODS.map(([v, l]) => (
              <FilterChip key={v} label={l} selected={period === v} onPress={() => setPeriod(v)} />
            ))}
          </ChipRow>
          <ChipRow>
            {KINDS.map(([v, l]) => (
              <FilterChip key={v} label={l} selected={kind === v} onPress={() => setKind(v)} />
            ))}
          </ChipRow>
          <View style={{ backgroundColor: t.c.bg.container, borderRadius: 24, padding: 16, gap: 12 }}>
            <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>
              {r.label} · {r.count} transaction{r.count === 1 ? '' : 's'}
              {cats.length ? ` · ${cats.map((c) => categoryOf(c).label).join(', ')}` : ''}
            </Text>
            <Stat value={os.format.currency(r.total)} size="hero" />
            <DeltaChip change={r.change} better={kind === 'spending' ? 'down' : kind === 'income' ? 'up' : 'none'} vs={`vs the period before${r.prevTotal != null ? ` (${os.format.currency(r.prevTotal)})` : ''}`} />
            {r.byCategory.length > 1 ? <StackedBar parts={r.byCategory.slice(0, 6).map((c) => ({ label: categoryOf(c.category).label, value: c.total, color: t.paletteColor(categoryOf(c.category).color) ?? t.c.chart[0], display: `${Math.round(c.share * 100)}%` }))} legend={false} /> : null}
            <View style={{ gap: 2 }}>
              {r.byCategory.map((c) => {
                const on = cats.includes(c.category);
                const cat = categoryOf(c.category);
                return (
                  <Pressable key={c.category} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => toggle(cats, setCats, c.category)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12, backgroundColor: on ? t.c.bg.tileRaised : 'transparent' }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.paletteColor(cat.color) ?? t.c.fg.tertiary }} />
                    <Text variant="label" style={{ flex: 1 }}>{cat.label}</Text>
                    <Text variant="caption" color="secondary">{Math.round(c.share * 100)}% · {c.count}</Text>
                    <Text variant="label" style={{ fontVariant: ['tabular-nums'], minWidth: 84, textAlign: 'right' }}>{os.format.currency(c.total)}</Text>
                  </Pressable>
                );
              })}
            </View>
            {cats.length ? (
              <Text variant="caption" color="secondary" onPress={() => setCats([])}>
                Showing {cats.map((c) => categoryOf(c).label).join(', ')} · tap to show all
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.c.bg.tile, borderRadius: t.radius.card, paddingHorizontal: 14, height: 46 }}>
            <Icon name="search" size={16} color={t.c.fg.secondary} />
            <TextInput value={search} onChangeText={setSearch} placeholder="Search merchant or note" placeholderTextColor={t.c.fg.tertiary} style={{ flex: 1, color: t.c.fg.primary, fontFamily: t.type.body.fontFamily, fontSize: 15 }} />
            <IconButton icon="filter" size={34} accessibilityLabel="Sort and filter" filled={showFilters || accounts.length ? t.c.accent.mustard : undefined} onPress={() => setShowFilters((x) => !x)} />
          </View>
          {showFilters ? (
            <View style={{ gap: 10 }}>
              <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>Sort</Text>
              <ChipRow>
                {SORTS.map(([v, l]) => (
                  <FilterChip key={v} label={l} selected={sort === v} onPress={() => setSort(v)} />
                ))}
              </ChipRow>
              {r.accounts.length ? (
                <>
                  <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>Account</Text>
                  <ChipRow>
                    {r.accounts.map((a) => (
                      <FilterChip key={a.id} label={a.title} selected={accounts.includes(a.id)} onPress={() => toggle(accounts, setAccounts, a.id)} />
                    ))}
                  </ChipRow>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null,
    [r, period, kind, cats, accounts, sort, search, showFilters, t, os],
  );
  if (!r) return null;
  // Date sorts get day headers; amount sorts are one list.
  const byDate = sort === 'newest' || sort === 'oldest';
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: 8 }}>
        <ScreenHeader title="Spend" onBack={() => router.back()} right={<IconButton icon="plus" filled accessibilityLabel="Add a transaction" onPress={() => router.push('/entity/transaction/new' as never)} />} />
      </View>
      <FlatList
        data={r.items}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 40 }}
        initialNumToRender={20}
        windowSize={7}
        ListEmptyComponent={<Text variant="caption" color="secondary" style={{ paddingVertical: 20, textAlign: 'center' }}>Nothing here for these filters.</Text>}
        renderItem={({ item, index }) => {
          const prev = r.items[index - 1];
          const showDay = byDate && (!prev || prev.data.date !== item.data.date);
          return (
            <View>
              {showDay ? (
                <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>
                  {format(new Date(`${item.data.date}T12:00:00`), 'EEE d MMM')}
                </Text>
              ) : null}
              <EntityRow entity={item as never} subtitle={[categoryOf(item.data.category).label, item.data.originalCurrency ? `${item.data.originalCurrency} ${item.data.originalAmount}` : null, byDate ? null : format(new Date(`${item.data.date}T12:00:00`), 'd MMM')].filter(Boolean).join(' · ')} />
            </View>
          );
        }}
      />
    </View>
  );
}
