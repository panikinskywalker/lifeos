import { useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { spendQuery, type SpendKind, type SpendPeriod, type SpendSort } from '@modules/finance/spend';
import { categoryOf, type TransactionData } from '@modules/finance/types';
import type { ObjectRecord } from '@core/domain/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ChipRow, FilterChip, Icon, IconButton, ScreenHeader, Text } from '@ui/kit';
import { Caps, Hairline, Rows, SmallPill, SplitBar, StatusPill, TxRow, catColor, day, kindWord, splitOf } from './parts';

const PERIODS: Array<[SpendPeriod, string]> = [['month', 'This month'], ['last_month', 'Last month'], ['3_months', '3 months'], ['year', 'This year'], ['all', 'All time']];
const KINDS: Array<[SpendKind, string]> = [['spending', 'Spending'], ['income', 'Income'], ['investments', 'Investments'], ['all', 'Everything']];
const SORTS: Array<[SpendSort, string]> = [['newest', 'Newest'], ['oldest', 'Oldest'], ['largest', 'Largest'], ['smallest', 'Smallest']];

type Tx = ObjectRecord<TransactionData>;

/**
 * Spend (NR-Money-Spend; the /spend route renders it): pick a period and what
 * to count, see the total against the period before and where it went, tap a
 * category to filter to it, then search, sort and filter by account. Payments
 * come in day groups; amount sorts are one list.
 */
export function SpendScreen() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string; period?: SpendPeriod; kind?: SpendKind }>();
  const [period, setPeriod] = useState<SpendPeriod>(params.period ?? 'month');
  const [kind, setKind] = useState<SpendKind>(params.kind ?? 'spending');
  const [cats, setCats] = useState<string[]>(params.category ? [params.category] : []);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [sort, setSort] = useState<SpendSort>('newest');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const r = useLive((o) => (o.registry.objects.has('transaction') ? spendQuery(o, { period, kind, categories: cats, accountIds: accounts, search, sort }) : null), [period, kind, cats.join(), accounts.join(), search, sort]);
  const names = useLive((o) => Object.fromEntries(o.records.query('account', {}, { limit: 500 }).map((a) => [a.id, a.title])), []);
  const toggle = (list: string[], set: (x: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const catWords = cats.map((c) => categoryOf(c).label).join(', ');
  const clear = () => {
    setPeriod('month');
    setCats([]);
    setAccounts([]);
    setSearch('');
  };
  const header = useMemo(() => {
    if (!r) return null;
    const better = kind === 'spending' ? 'down' : kind === 'income' ? 'up' : 'none';
    const pct = r.change == null || !Number.isFinite(r.change) ? null : Math.round(r.change * 100);
    const good = pct == null || pct === 0 || better === 'none' ? null : better === 'up' ? pct > 0 : pct < 0;
    return (
      <View style={{ gap: 16, paddingBottom: 8 }}>
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
        <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 14 }}>
          <Text variant="labelCaps" color="secondary" numberOfLines={2}>
            {`${r.label} · ${r.count} transaction${r.count === 1 ? '' : 's'}${catWords ? ` · ${catWords}` : ''}`.toUpperCase()}
          </Text>
          <Text variant="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{os.format.currency(r.total)}</Text>
          {pct != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: good == null ? t.c.bg.tileRaised : good ? t.c.accent.mustardSoft : t.c.alert.coralFill }}>
                {pct !== 0 ? (
                  <View style={{ transform: [{ rotate: pct < 0 ? '180deg' : '0deg' }] }}>
                    <Icon name="arrow-up" size={12} strokeWidth={2.5} color={good == null ? t.c.fg.primary : good ? t.c.accent.gold : t.c.alert.coralText} />
                  </View>
                ) : null}
                <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', fontVariant: ['tabular-nums'], color: good == null ? t.c.fg.primary : good ? t.c.accent.gold : t.c.alert.coralText }}>{Math.abs(pct)}%</Text>
              </View>
              <Text variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'], flexShrink: 1 }}>vs the period before{r.prevTotal != null ? ` (${os.format.currency(r.prevTotal)})` : ''}</Text>
            </View>
          ) : null}
          {r.byCategory.length > 1 ? <SplitBar parts={r.byCategory.slice(0, 8).map((c) => ({ key: c.category, share: c.share, color: catColor(c.category, t) }))} /> : null}
          <View style={{ gap: 2 }}>
            {r.byCategory.map((c) => {
              const on = cats.includes(c.category);
              return (
                <Pressable key={c.category} accessibilityRole="button" accessibilityLabel={categoryOf(c.category).label} accessibilityState={{ selected: on }} onPress={() => toggle(cats, setCats, c.category)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 8, borderRadius: 12, backgroundColor: on ? t.c.bg.tileRaised : 'transparent' }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: catColor(c.category, t) }} />
                  <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{categoryOf(c.category).label}</Text>
                  <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] }}>{Math.round(c.share * 100)}% · {c.count}</Text>
                  <Text style={{ minWidth: 84, textAlign: 'right', fontSize: 14, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{os.format.currency(c.total)}</Text>
                </Pressable>
              );
            })}
          </View>
          {cats.length ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Show all categories" hitSlop={12} onPress={() => setCats([])} style={{ alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 8 }}>
              <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '500' }}>Showing {catWords} · tap to show all</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingLeft: 16, paddingRight: 6, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          <Icon name="search" size={16} color={t.c.fg.secondary} />
          <TextInput accessibilityLabel="Search merchant or note" value={search} onChangeText={setSearch} placeholder="Search merchant or note" placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} style={{ flex: 1, minWidth: 0, height: 44, color: t.c.fg.primary, fontFamily: t.type.body.fontFamily, fontSize: 15 }} />
          <IconButton icon="filter" size={36} accessibilityLabel="Sort and filter" filled={showFilters || accounts.length ? t.c.accent.mustard : true} color={showFilters || accounts.length ? t.c.accent.mustardInk : undefined} onPress={() => setShowFilters((x) => !x)} />
        </View>
        {showFilters ? (
          <View style={{ gap: 10 }}>
            <Caps style={{ paddingHorizontal: 4 }}>SORT</Caps>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SORTS.map(([v, l]) => (
                <FilterChip key={v} label={l} selected={sort === v} onPress={() => setSort(v)} />
              ))}
            </View>
            {r.accounts.length ? (
              <>
                <Caps style={{ paddingHorizontal: 4, paddingTop: 4 }}>ACCOUNT</Caps>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {r.accounts.map((a) => (
                    <FilterChip key={a.id} label={a.title} selected={accounts.includes(a.id)} onPress={() => toggle(accounts, setAccounts, a.id)} />
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }, [r, period, kind, cats, accounts, sort, search, showFilters, t, os, catWords]);
  // Date sorts get day groups; amount sorts are one list.
  const byDate = sort === 'newest' || sort === 'oldest';
  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string | null; items: Tx[] }> = [];
    for (const x of r?.items ?? []) {
      const last = out[out.length - 1];
      if (byDate && last?.key === x.data.date) last.items.push(x);
      else if (!byDate && last) last.items.push(x);
      else out.push({ key: byDate ? x.data.date : 'all', label: byDate ? format(day(x.data.date), 'EEE d MMM').toUpperCase() : null, items: [x] });
    }
    return out;
  }, [r?.items, byDate]);
  if (!r) return null;
  const line = (x: Tx) => {
    const d = x.data;
    const split = splitOf(d);
    const third = split ? `split ${split.parts.length} ways` : d.originalCurrency ? `${d.originalCurrency} ${d.originalAmount}` : d.accountId ? names[d.accountId] : null;
    return [kindWord(d), third, byDate ? null : format(day(d.date), 'd MMM')].filter(Boolean).join(' · ');
  };
  const active = [period !== 'month' ? PERIODS.find(([v]) => v === period)![1] : null, ...cats.map((c) => categoryOf(c).label), ...accounts.map((a) => names[a] ?? 'Account'), search.trim() || null].filter((x): x is string => !!x);
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: 12 }}>
        <ScreenHeader title="Spend" subtitle="Money" onBack={() => router.back()} right={<IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} accessibilityLabel="Add a transaction" onPress={() => router.push('/entity/transaction/new' as never)} />} />
      </View>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.key}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 40, gap: 16 }}
        initialNumToRender={12}
        windowSize={7}
        ListEmptyComponent={
          <View style={{ gap: 12 }}>
            {active.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {active.map((a) => (
                  <View key={a} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.fg.primary, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.bg.ground }}>{a}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={{ paddingVertical: 28, paddingHorizontal: 20, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.fg.tertiary, alignItems: 'center', gap: 12 }}>
              <Text color="secondary" style={{ fontSize: 14, lineHeight: 18, textAlign: 'center' }}>{active.length ? 'Nothing here for these filters.' : 'Nothing here yet.'}</Text>
              {active.length ? <SmallPill title="Clear filters" onPress={clear} /> : null}
            </View>
          </View>
        }
        ListFooterComponent={
          r.count ? (
            <Text variant="caption" color="tertiary" style={{ textAlign: 'center', paddingVertical: 8 }}>
              {[`${r.count} payment${r.count === 1 ? '' : 's'}`, catWords || null, r.label].filter(Boolean).join(' · ')}
            </Text>
          ) : null
        }
        renderItem={({ item: g }) => (
          <View style={{ gap: 8 }}>
            {g.label ? <Caps style={{ paddingHorizontal: 4 }}>{g.label}</Caps> : null}
            <Rows>
              {g.items.map((x) => (
                <TxRow key={x.id} tx={x} line={line(x)} />
              ))}
            </Rows>
          </View>
        )}
      />
    </View>
  );
}
