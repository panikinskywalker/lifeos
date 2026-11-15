import { useContext, useMemo, useState } from 'react';
import { FlatList, Pressable, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { periodRange, spendQuery, type SpendKind, type SpendPeriod, type SpendSort } from '@modules/finance/spend';
import { dailySpend, incomeInRange, spendInRange } from '@modules/finance/lib';
import { categoryOf, type TransactionData } from '@modules/finance/types';
import type { ObjectRecord } from '@core/domain/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ChipRow, FilterChip, Icon, IconButton, OnBar, PickerSheet, RingBadges, ScreenHeader, Sheet, Text, useBottomBarInset } from '@ui/kit';
import { blocks } from '@ui/theme/tokens';
import { Caps, Rows, SmallPill, SplitBar, TxRow, catColor, day, kindWord, shortMoney, splitOf } from './parts';

const PERIODS: Array<[SpendPeriod, string]> = [['month', 'This month'], ['last_month', 'Last month'], ['3_months', '3 months'], ['year', 'This year'], ['all', 'All time']];
const KINDS: Array<[SpendKind, string]> = [['spending', 'Spent'], ['income', 'Came in'], ['investments', 'Investing'], ['all', 'All']];
const INK = '#0B0B0D';
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
  const onBar = useContext(OnBar);
  const barInset = useBottomBarInset();
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
  // The calendar (a month's days, each with what went that day) and each kind's total for the period.
  const days = useLive((o) => {
    if (!o.registry.objects.has('transaction') || (period !== 'month' && period !== 'last_month')) return null;
    const range = periodRange(period, new Date());
    const from = range.from!;
    const last = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)), 0).getDate();
    return dailySpend(o, from, `${from.slice(0, 8)}${String(last).padStart(2, '0')}`);
  }, [period]);
  const kindTotals = useLive((o) => {
    if (!o.registry.objects.has('transaction')) return null;
    const range = periodRange(period, new Date());
    const from = range.from ?? '0000-01-01';
    const inv = o.db.get<{ s: number | null; n: number }>(`SELECT SUM(json_extract(data,'$.amount')) AS s, COUNT(*) AS n FROM records WHERE object='transaction' AND deleted_at IS NULL AND json_extract(data,'$.kind')='investment' AND json_extract(data,'$.date') BETWEEN ? AND ?`, [from, range.to]);
    const count = o.records.count('transaction', { filter: { and: [{ field: 'data.date', op: 'gte', value: from }, { field: 'data.date', op: 'lte', value: range.to }] } });
    return { spending: spendInRange(o, from, range.to), income: incomeInRange(o, from, range.to), investments: inv?.s ?? 0, count } as Record<string, number>;
  }, [period]);
  const [picking, setPicking] = useState(false);
  const [openDay, setOpenDay] = useState<string | null>(null);
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
    const active = [...cats.map((c) => categoryOf(c).label), ...accounts.map((x) => names[x] ?? 'Account'), search.trim() || null].filter((x): x is string => !!x);
    return (
      <View style={{ gap: 14, paddingBottom: 8 }}>
        {/* Period: one control; the arrows step this month and last month, the middle picks any period. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, padding: 6, borderRadius: 999, backgroundColor: t.c.bg.tile }}>
          <IconButton icon="chevron-left" accessibilityLabel="Last month" filled disabled={period !== 'month'} onPress={() => setPeriod('last_month')} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Period, ${r.label}. Pick another`} onPress={() => setPicking(true)} style={{ flex: 1, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700' }}>{r.label}</Text>
            {period === 'month' ? <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{`1 to ${new Date().getDate()}`}</Text> : null}
            <Icon name="chevron-down" size={14} color={t.c.fg.secondary} />
          </Pressable>
          <IconButton icon="chevron-right" accessibilityLabel="This month" filled disabled={period !== 'last_month'} onPress={() => setPeriod('month')} />
        </View>
        {/* What to count, each with its total for the period; the one picked is lime. */}
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          {KINDS.map(([v, l]) => {
            const on = kind === v;
            const amount = v === 'all' ? `${kindTotals?.count ?? 0}` : shortMoney(os, kindTotals?.[v] ?? 0);
            return (
              <Pressable key={v} accessibilityRole="tab" accessibilityLabel={`${l}, ${amount}`} accessibilityState={{ selected: on }} onPress={() => setKind(v)} style={{ flex: 1, minWidth: 0, height: 56, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 1, backgroundColor: on ? t.c.accent.mustard : 'transparent' }}>
                <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: on ? t.c.accent.mustardInk : t.c.fg.primary }}>{l}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', fontVariant: ['tabular-nums'], color: on ? 'rgba(11,11,13,0.7)' : t.c.fg.secondary }}>{amount}</Text>
              </Pressable>
            );
          })}
        </View>
        {r.byCategory.length > 1 ? (
          <ChipRow>
            <CatChip label="All" selected={!cats.length} onPress={() => setCats([])} />
            {r.byCategory.map((c) => (
              <CatChip key={c.category} label={categoryOf(c.category).label} dot={catColor(c.category, t)} count={c.count} selected={cats.includes(c.category)} onPress={() => toggle(cats, setCats, c.category)} />
            ))}
          </ChipRow>
        ) : null}
        <View style={{ padding: 18, borderRadius: 32, backgroundColor: blocks.orange, gap: 14 }}>
          <Text numberOfLines={2} style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, color: INK }}>
            {`${r.label} · ${kind === 'spending' ? 'your share · ' : ''}${r.count} payment${r.count === 1 ? '' : 's'}${catWords ? ` · ${catWords}` : ''}${kind === 'all' ? ' · in less out' : ''}`.toUpperCase()}
          </Text>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 48, lineHeight: 50, fontWeight: '700', letterSpacing: -2, color: INK, fontVariant: ['tabular-nums'] }}>{os.format.currency(r.total)}</Text>
          {r.prevTotal != null && kind !== 'all' && r.total !== r.prevTotal ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -6 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: r.total < r.prevTotal ? '180deg' : '0deg' }] }}>
                <Icon name="arrow-up" size={13} strokeWidth={2.6} color={t.c.accent.mustard} />
              </View>
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: INK, fontVariant: ['tabular-nums'] }}>{`${os.format.currency(Math.abs(r.total - r.prevTotal))} ${r.total < r.prevTotal ? 'less' : 'more'} than ${PREV_WORD[period] ?? 'the period before'}`}</Text>
            </View>
          ) : null}
          {r.byCategory.length > 1 ? <SplitBar parts={r.byCategory.slice(0, 6).map((c, i) => ({ key: c.category, share: c.share, color: `rgba(11,11,13,${Math.max(0.16, 1 - i * 0.17).toFixed(2)})` }))} /> : null}
        </View>
        {kind === 'spending' && days ? <MonthDays days={days} onDay={setOpenDay} /> : null}
        {kind === 'spending' && r.byCategory.length ? (
          <RingBadges
            total={shortMoney(os, r.total)}
            caption={`spent ${period === 'month' || period === 'last_month' ? 'in ' : ''}${r.label}`}
            format={(n) => shortMoney(os, n)}
            parts={r.byCategory.map((c) => ({ key: c.category, label: categoryOf(c.category).label, value: c.total, color: catColor(c.category, t), icon: categoryOf(c.category).icon, onPress: () => toggle(cats, setCats, c.category) }))}
          />
        ) : null}
        {active.length ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear filters" onPress={clear} style={{ alignSelf: 'flex-start', height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{`Clear filters · ${active.join(', ')}`}</Text>
          </Pressable>
        ) : null}
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
                  {r.accounts.map((acc) => (
                    <FilterChip key={acc.id} label={acc.title} selected={accounts.includes(acc.id)} onPress={() => toggle(accounts, setAccounts, acc.id)} />
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }, [r, period, kind, cats, accounts, sort, search, showFilters, t, os, catWords, days, kindTotals]);
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
  const active = [period !== 'month' ? PERIODS.find(([v]) => v === period)![1] : null, ...cats.map((c) => categoryOf(c).label), ...accounts.map((x) => names[x] ?? 'Account'), search.trim() || null].filter((x): x is string => !!x);
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: 12 }}>
        <ScreenHeader title="Spend" subtitle="Money" onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/finance' as never))} right={<IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} accessibilityLabel="Add a transaction" onPress={() => router.push('/entity/transaction/new' as never)} />} />
      </View>
      <FlatList
        data={groups}
        keyExtractor={(g) => g.key}
        ListHeaderComponent={header}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: t.layout.gutter, paddingBottom: onBar ? barInset : insets.bottom + 40, gap: 16 }}
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
      <PickerSheet visible={picking} onClose={() => setPicking(false)} title="Period" items={PERIODS.map(([v, l]) => ({ id: v, title: l }))} selected={[period]} onSelect={(v) => { setPeriod(v as SpendPeriod); setPicking(false); }} />
      <DaySheet date={openDay} onClose={() => setOpenDay(null)} />
    </View>
  );
}

const PREV_WORD: Partial<Record<SpendPeriod, string>> = { month: 'last month by today', last_month: 'the month before', '3_months': 'the 3 months before', year: 'last year by today' };

/** A category as a chip: its colour, its name and how many payments. */
function CatChip({ label, dot, count, selected, onPress }: { label: string; dot?: string; count?: number; selected: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}${count != null ? `, ${count} payments` : ''}`} accessibilityState={{ selected }} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: selected ? t.c.fg.primary : t.c.bg.tile, borderWidth: selected ? 0 : 1, borderColor: t.c.line }}>
      {dot ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} /> : null}
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: selected ? '700' : '600', color: selected ? t.c.bg.ground : t.c.fg.primary }}>{label}</Text>
      {count != null ? <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: selected ? 'rgba(11,11,13,0.6)' : t.c.fg.secondary }}>{count}</Text> : null}
    </Pressable>
  );
}

/**
 * The month as a calendar (docs/MODEL.md, Spend): each date box shows what
 * went that day, more lime for more; the biggest day solid lime, today ringed.
 * Weeks start on Monday; tap a day for its payments.
 */
function MonthDays({ days, onDay }: { days: Array<{ date: string; total: number }>; onDay: (date: string) => void }) {
  const os = useOS();
  const t = useTheme();
  const today = format(new Date(), 'yyyy-MM-dd');
  const max = Math.max(1, ...days.map((d) => d.total));
  const top = days.find((d) => d.total === max && d.total > 0);
  const past = days.filter((d) => d.date <= today);
  const avg = past.length ? past.reduce((n, d) => n + d.total, 0) / past.length : 0;
  const lead = (day(days[0]!.date).getDay() + 6) % 7;
  const cells: Array<{ date: string; total: number } | null> = [...Array(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const short = (n: number) => (n < 1000 ? os.format.currency(Math.round(n)) : `${os.format.currency(0).replace(/[\d.,\s]/g, '')}${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`);
  return (
    <View style={{ padding: 16, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={{ flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2 }}>Every day</Text>
        <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'] }}>{`${os.format.currency(Math.round(avg))} a day`}</Text>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
          <Text key={i} color="secondary" style={{ flex: 1, textAlign: 'center', fontSize: 11, lineHeight: 14, fontWeight: '700' }}>{w}</Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -2 }}>
        {cells.map((c, i) => {
          if (!c) return <View key={`e${i}`} style={{ width: `${100 / 7}%`, height: 58 }} />;
          const n = day(c.date).getDate();
          const future = c.date > today;
          const isTop = c === top;
          const bg = future ? 'rgba(255,255,255,0.03)' : isTop ? t.c.accent.mustard : `rgba(215,245,92,${(0.06 + 0.42 * (c.total / max)).toFixed(2)})`;
          const ink = isTop ? t.c.accent.mustardInk : t.c.fg.primary;
          return (
            <View key={c.date} style={{ width: `${100 / 7}%`, height: 58, padding: 2 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${format(day(c.date), 'EEE d MMM')}, ${os.format.currency(Math.round(c.total))}`} disabled={future || !c.total} onPress={() => onDay(c.date)} style={{ flex: 1, borderRadius: 12, backgroundColor: bg, paddingVertical: 5, paddingHorizontal: 4, justifyContent: 'space-between', borderWidth: c.date === today ? 2 : 0, borderColor: t.c.fg.primary }}>
                <Text style={{ fontSize: 11, lineHeight: 13, fontWeight: c.date === today ? '800' : '600', color: future ? t.c.fg.tertiary : isTop ? 'rgba(11,11,13,0.7)' : t.c.fg.secondary }}>{n}</Text>
                {!future && c.total ? <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 11, lineHeight: 13, fontWeight: '700', color: ink, fontVariant: ['tabular-nums'], letterSpacing: -0.3 }}>{short(c.total)}</Text> : null}
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** The payments of the day you tapped. */
function DaySheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  const items = useLive((o) => (date ? o.records.query<TransactionData>('transaction', { filter: { and: [{ field: 'data.date', op: 'eq', value: date }] }, sort: [{ field: 'data.amount', dir: 'desc' }] }, { limit: 200 }) : []), [date]);
  return (
    <Sheet visible={!!date} onClose={onClose} title={date ? format(day(date), 'EEE d MMM') : ''}>
      <View>
        {items.map((x) => (
          <TxRow key={x.id} tx={x} line={kindWord(x.data)} />
        ))}
      </View>
    </Sheet>
  );
}
