import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, subDays } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, IconButton, ProgressBar, RingBadges, ScreenHeader, Sheet, Text, TrackColumns, useBottomBarInset, useToast } from '@ui/kit';
import { blocks } from '@ui/theme/tokens';
import { sortWithAI, undoSort } from '@modules/finance/aiSort';
import { suggestBudget, undoBudget, adoptBudget } from '@modules/finance/budget';
import { dailySpend, incomeInRange, monthRange, netWorth, spendByCategory, spendInRange, targetStatuses } from '@modules/finance/lib';
import { subscriptionRunRate } from '@modules/finance/reports';
import { comingUp, monthClose, pace, type MonthClose, type Pace } from '@modules/finance/home';
import { balances } from '@modules/finance/split';
import { PAYEE_WHO } from '@modules/finance/filing/payee';
import { categoryOf, INSTRUMENTS, type TransactionData } from '@modules/finance/types';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { PayeeGuess } from './payeeGuess';
import { YourViews } from './ask';
import { walletTotals } from './wallet';
import { AddSheet } from './addSheet';
import { UploadSheet } from './uploadSheet';
import { Caps, Disc, KIND_WORD, SectionHead, Hairline, IconDisc, Rows, Spark, TxRow, accountIcon, catColor, shortMoney, day, kindWord, relDay, splitOf } from './parts';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/**
 * Money's home (docs/MODEL.md, Money redesign: direction C): where it went (the
 * kit's ring), the pace, this week in tracks, what needs you, before payday as
 * day cards, your views, one line each for accounts and who owes whom, recent.
 * Money's own bar holds Spend, Accounts and cards, Subscriptions and Ask.
 */
export function FinanceHome(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const os = useOS();
  const router = useRouter();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const bottom = useBottomBarInset();
  const [menu, setMenu] = useState(false);
  const [budget, setBudget] = useState(false);
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('This week');
  const chart = useLive((o) => chartSeries(o, chartPeriod), [chartPeriod]);
  const m = monthRange(0);
  const data = useLive(
    (o) => {
      const now = new Date();
      const inMonth = { filter: { and: [{ field: 'data.date', op: 'gte' as const, value: m.start }, { field: 'data.date', op: 'lte' as const, value: m.end }] } };
      return {
        spent: spendInRange(o, m.start, m.end),
        byCat: spendByCategory(o, m.start, m.end).sort((a, b) => b.total - a.total),
        monthCount: o.records.count('transaction', inMonth),
        count: o.records.count('transaction'),
        recent: o.records.query<TransactionData>('transaction', { sort: [{ field: 'data.date', dir: 'desc' }, { field: 'createdAt', dir: 'desc' }] }, { limit: 5 }),
        nw: netWorth(o),
        subs: subscriptionRunRate(o),
        targets: targetStatuses(o, day(m.start)),
        pace: pace(o),
        owes: balances(o).map((b) => ({ ...b, name: o.records.get(b.personId)?.title ?? 'Someone' })),
        coming: comingUp(o),
        close: monthClose(o),
      };
    },
    [m.start],
  );
  const isEmpty = !data.count && !data.nw.accounts.length && !data.nw.holdings.length && !data.subs.rows.length;
  const monthName = m.label.split(' ')[0]!;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/browse' as never));
  const header = (
    <ScreenHeader
      title="Money"
      subtitle={isEmpty ? 'No payments yet' : `${monthName} · ${data.monthCount} payment${data.monthCount === 1 ? '' : 's'}`}
      onBack={back}
      right={
        <>
          <IconButton icon="grid" accessibilityLabel="Money screens" filled onPress={() => setMenu(true)} />
          <ToCheckBell />
          <IconButton icon="plus" accessibilityLabel="Add a payment" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} onPress={() => setAdding(true)} />
        </>
      }
    />
  );
  const sheets = (
    <>
      <MoneyScreens visible={menu} onClose={() => setMenu(false)} onUpload={() => setUploading(true)} />
      <UploadSheet visible={uploading} onClose={() => setUploading(false)} />
      <AddSheet visible={adding} onClose={() => setAdding(false)} onUpload={() => setUploading(true)} />
      <Sheet visible={budget} onClose={() => setBudget(false)} title="A budget for you">
        <SuggestedBudget bare onDone={() => setBudget(false)} />
      </Sheet>
    </>
  );

  if (isEmpty) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: t.c.bg.ground }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: bottom, gap: 20 }}>
        {header}
        <EmptyHome />
        {sheets}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.c.bg.ground }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: bottom, gap: 22 }}>
      {header}

      {data.close ? <MonthClosed c={data.close} /> : null}

      {data.byCat.length ? <WhereItWent byCat={data.byCat} total={data.spent} month={monthName} offset={0} onBudget={data.targets.length ? undefined : () => setBudget(true)} /> : null}

      {data.pace ? <PaceLine p={data.pace} /> : null}

      <TrackColumns
        label="ANALYTICS"
        period={chartPeriod}
        periods={[...CHART_PERIODS]}
        onPeriod={(p) => setChartPeriod(p as ChartPeriod)}
        value={shortMoney(os, chart.values.reduce((a, b) => a + b, 0))}
        values={chart.values}
        labels={chart.labels}
        today={chart.today}
        axis={(n) => shortMoney(os, n)}
      />

      <NeedsYou />
      <SortOther />

      {data.coming.items.length ? <ComingUp coming={data.coming} /> : null}

      <YourViews />

      {data.nw.accounts.length ? <AccountsLine nw={data.nw} /> : null}
      {data.owes.length ? <OwesLine owes={data.owes} /> : null}

      {data.targets.length ? <Targets targets={data.targets} /> : null}

      <Recent items={data.recent} count={data.count} />
      {sheets}
    </ScrollView>
  );
}

const CHART_PERIODS = ['This week', 'This month', 'Last month', '3 months', 'This year'] as const;
type ChartPeriod = (typeof CHART_PERIODS)[number];

/** What the Analytics columns show for a period: days for a week, weeks for a month, months for longer. */
function chartSeries(os: LifeOSContext, p: ChartPeriod): { values: number[]; labels: string[]; today?: number } {
  const now = new Date();
  const iso = (d: Date) => format(d, 'yyyy-MM-dd');
  if (p === 'This week') {
    const days = dailySpend(os, iso(subDays(now, 6)), iso(now));
    return { values: days.map((d) => d.total), labels: days.map((d) => format(day(d.date), 'EEE')), today: days.length - 1 };
  }
  if (p === 'This month' || p === 'Last month') {
    const m = monthRange(p === 'This month' ? 0 : -1);
    const days = dailySpend(os, m.start, m.end);
    const weeks = [0, 7, 14, 21, 28].filter((s) => s < days.length).map((s) => days.slice(s, s + 7));
    return { values: weeks.map((w) => w.reduce((a, d) => a + d.total, 0)), labels: weeks.map((w) => `${Number(w[0]!.date.slice(8))}-${Number(w[w.length - 1]!.date.slice(8))}`), today: p === 'This month' ? Math.min(weeks.length - 1, Math.floor((now.getDate() - 1) / 7)) : undefined };
  }
  const months = p === '3 months' ? [-2, -1, 0] : Array.from({ length: now.getMonth() + 1 }, (_, i) => i - now.getMonth());
  return {
    values: months.map((k) => { const r = monthRange(k); return spendInRange(os, r.start, r.end); }),
    labels: months.map((k) => format(new Date(now.getFullYear(), now.getMonth() + k, 1), p === '3 months' ? 'MMM' : 'MMMMM')),
    today: months.length - 1,
  };
}

/** The pace in one line: what a day can be and stay under your line, or how far over it you are. */
function PaceLine({ p }: { p: Pace }) {
  const os = useOS();
  const t = useTheme();
  const money = os.format.currency;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tileRaised, marginTop: -8 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.over ? t.c.alert.coralText : t.c.accent.mustard }} />
      <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>
        {p.over ? (
          <>
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.alert.coralText }}>{money(-p.left)} over</Text> your {p.yours ? 'line' : 'usual month'} of {shortMoney(os, p.line)}
          </>
        ) : (
          <>
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.accent.gold }}>{money(p.perDay)} a day</Text> keeps it under {shortMoney(os, p.line)}
            {p.yours ? '' : ', your usual month'}
          </>
        )}
      </Text>
    </View>
  );
}

/** The other Money screens, from the grid button in the header. */
function MoneyScreens({ visible, onClose, onUpload }: { visible: boolean; onClose: () => void; onUpload: () => void }) {
  const router = useRouter();
  const go = (to: string | { pathname: string; params: Record<string, string> }) => {
    onClose();
    if (to === 'upload') return onUpload();
    router.push(to as never);
  };
  const rows: Array<[string, string, string | { pathname: string; params: Record<string, string> }]> = [
    ['Spend', 'pie', '/module/finance/spend'],
    ['Transactions', 'arrow.up.arrow.down', { pathname: '/module/finance/spend', params: { period: 'all', kind: 'all' } }],
    ['Accounts and cards', 'card', '/module/finance/wallet'],
    ['Subscriptions', 'repeat', '/module/finance/subscriptions'],
    ['Who owes whom', 'people', '/module/finance/debts'],
    ['Splitwise', 'link', '/board/splitwise'],
    ['Reports', 'chart', '/module/finance/reports'],
    ['Import & export', 'file', '/module/finance/files'],
    ['Ask Money', 'sparkle', '/module/finance/ask'],
    ['Upload a statement', 'file', 'upload'],
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title="Money">
      <View>
        {rows.map(([label, icon, to], i) => (
          <React.Fragment key={label}>
            {i ? <Hairline /> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => go(to)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
              <IconDisc icon={icon} />
              <Text variant="rowTitle" style={{ flex: 1 }}>{label}</Text>
              <Icon name="chevron-right" size={16} />
            </Pressable>
          </React.Fragment>
        ))}
      </View>
    </Sheet>
  );
}

/** One line for the accounts: what is in them and what the cards owe; opens Accounts and cards. */
function AccountsLine({ nw }: { nw: ReturnType<typeof netWorth> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const w = walletTotals(nw);
  const money = (n: number) => os.format.currency(Math.round(n));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${money(w.inAccounts)} in accounts${w.owe ? `, you owe ${money(w.owe)} on cards` : ''}. Opens Accounts and cards`} onPress={() => router.push('/module/finance/wallet' as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row' }}>
        {[blocks.lime, blocks.lilac, blocks.orange].map((c, i) => (
          <View key={c} style={{ width: 28, height: 40, borderRadius: 8, backgroundColor: c, marginLeft: i ? -14 : 0, borderWidth: i ? 2 : 0, borderColor: t.c.bg.tile }} />
        ))}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: blocks.sky, fontVariant: ['tabular-nums'] }}>{money(w.inAccounts)} in accounts</Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>{w.owe ? `you owe ${money(w.owe)} on ${w.cards} card${w.cards === 1 ? '' : 's'}` : `${nw.accounts.length} account${nw.accounts.length === 1 ? '' : 's'}`}</Text>
      </View>
      <Icon name="chevron-right" size={16} color={t.c.fg.secondary} />
    </Pressable>
  );
}

/** One line for who owes whom: owed to you in lime, what you owe after it; opens the list. */
function OwesLine({ owes }: { owes: Array<{ personId: string; amount: number; name: string }> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toYou = owes.filter((o) => o.amount > 0).reduce((a, o) => a + o.amount, 0);
  const youOwe = owes.filter((o) => o.amount < 0);
  const money = (n: number) => os.format.currency(Math.round(n));
  const line = youOwe.length === 1 ? `you owe ${youOwe[0]!.name.split(' ')[0]} ${money(-youOwe[0]!.amount)}` : youOwe.length ? `you owe ${money(youOwe.reduce((a, o) => a - o.amount, 0))}` : `${owes.length} ${owes.length === 1 ? 'person' : 'people'}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${money(toYou)} owed to you, ${line}. Opens Who owes whom`} onPress={() => router.push('/module/finance/debts' as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, marginTop: -10, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row' }}>
        {owes.slice(0, 3).map((o, i) => (
          <View key={o.personId} style={{ marginLeft: i ? -10 : 0, borderRadius: 22, borderWidth: 3, borderColor: t.c.bg.tile }}>
            <Disc name={o.name} colorKey={o.personId} size={36} />
          </View>
        ))}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: toYou ? t.c.accent.gold : t.c.alert.coralText, fontVariant: ['tabular-nums'] }}>{toYou ? `${money(toYou)} owed to you` : 'You owe'}</Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>{line}</Text>
      </View>
      <Icon name="chevron-right" size={16} color={t.c.fg.secondary} />
    </Pressable>
  );
}

/** Last month, closed (MODEL phase D, 6; the 1st to the 3rd): three numbers, the biggest changes, what is new; opens that month in Reports. */
function MonthClosed({ c }: { c: MonthClose }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const money = (n: number) => os.format.currency(Math.round(Math.abs(n)));
  const extras = [...c.newSubs.map((x) => `New: ${x.name} ${money(x.amount)}`), ...c.prices.map((x) => `${x.name} went ${x.to > x.from ? 'up' : 'down'} to ${money(x.to)}`)];
  const num = (label: string, value: string, line?: string, color?: string) => (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Caps>{label}</Caps>
      <Text numberOfLines={1} style={{ fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.4, fontVariant: ['tabular-nums'], color }}>{value}</Text>
      {line ? <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 15 }}>{line}</Text> : null}
    </View>
  );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${c.label}, closed: spent ${money(c.spent)}, saved ${money(c.saved)}. Opens ${c.label} in Reports`} onPress={() => router.push({ pathname: '/module/finance/reports', params: { tab: 'month', month: '-1' } } as never)} style={({ pressed }) => ({ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 14, opacity: pressed ? 0.9 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="check" size={16} color={t.c.accent.gold} />
        <Caps color={t.c.accent.gold}>{`${c.label.toUpperCase()}, CLOSED`}</Caps>
        <View style={{ flex: 1 }} />
        <Icon name="chevron-right" size={16} color={t.c.fg.secondary} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {num('SPENT', shortMoney(os, c.spent), c.usual ? `${shortMoney(os, Math.abs(c.spent - c.usual))} ${c.spent > c.usual ? 'over' : 'under'} usual` : undefined)}
        {num('CAME IN', shortMoney(os, c.income))}
        {num(c.saved >= 0 ? 'SAVED' : 'MORE OUT', shortMoney(os, Math.abs(c.saved)), undefined, c.saved >= 0 ? t.c.accent.gold : t.c.alert.coralText)}
      </View>
      {c.changes.length ? (
        <View>
          {c.changes.map((x, i) => (
            <React.Fragment key={x.category}>
              {i ? <Hairline /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: catColor(x.category, t) }} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>{categoryOf(x.category).label}</Text>
                <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'], color: x.delta > 0 ? t.c.alert.coralText : t.c.accent.gold }}>{`${x.delta > 0 ? '+' : '−'}${money(x.delta)}`}</Text>
                <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, width: 62, textAlign: 'right' }}>vs usual</Text>
              </View>
            </React.Fragment>
          ))}
        </View>
      ) : null}
      {extras.length ? <Text variant="caption" color="secondary">{extras.join(' · ')}</Text> : null}
    </Pressable>
  );
}

/** A screen link in the row under the header: orange icon, 40 tall. */
function NavChip({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
      <Icon name={icon} size={14} color={t.tints.finance.ink} />
      <Text variant="label">{label}</Text>
    </Pressable>
  );
}

function Big({ label, value, line, color }: { label: string; value: string; line?: string | null; color?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Caps>{label}</Caps>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'], color }}>{value}</Text>
      {line ? <Text variant="caption" color="secondary" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{line}</Text> : null}
    </View>
  );
}

function MonthCard({ label, offset, setOffset, spent, usual, income, incomeLine, days, onDay, pace: p }: { label: string; offset: number; setOffset: (n: number) => void; spent: number; usual: number | null; income: number; incomeLine: string | null; days: Array<{ date: string; total: number }>; onDay: (date: string) => void; pace?: Pace | null }) {
  const os = useOS();
  const t = useTheme();
  const money = os.format.currency;
  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const sorted = days.map((d) => d.total).sort((a, b) => b - a);
  // One day far above the rest (rent) would flatten the month: draw the rest to scale and cut it off at the top.
  const cut = sorted[1] && sorted[0]! > sorted[1] * 1.5 ? days.find((d) => d.total === sorted[0])! : null;
  const cap = cut ? sorted[1]! / 0.97 : sorted[0] || 1;
  const cutWord = useLive(
    (o) => {
      if (!cut) return null;
      const top = o.records.query<TransactionData>('transaction', { filter: { and: [{ field: 'data.date', op: 'eq', value: cut.date }, { field: 'data.kind', op: 'eq', value: 'expense' }] }, sort: [{ field: 'data.amount', dir: 'desc' }] }, { limit: 1 })[0];
      return top ? categoryOf(top.data.category).label.toLowerCase() : null;
    },
    [cut?.date],
  );
  const caption = cut ? `The ${ordinal(day(cut.date).getDate())}${cutWord ? ` is ${cutWord},` : ' is'} cut off at the top. Tap a day for its payments.` : 'Tap a day for its payments.';
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconButton icon="chevron-left" accessibilityLabel="Previous month" filled onPress={() => setOffset(offset - 1)} />
        <Text variant="heading" style={{ flex: 1, textAlign: 'center' }}>{label}</Text>
        <IconButton icon="chevron-right" accessibilityLabel="Next month" filled disabled={offset >= 0} onPress={() => setOffset(Math.min(0, offset + 1))} />
      </View>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <Big label="SPENT" value={money(spent)} line={usual ? `usual ${money(Math.round(usual))}` : null} />
        <Big label="CAME IN" value={money(income)} line={incomeLine} color={income ? t.c.accent.gold : undefined} />
      </View>
      {p ? (
        // The kit's text widget: the sentence is the figure, its key words bright.
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '500', color: t.c.fg.secondary }}>
          {p.over ? (
            <>
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.alert.coralText }}>{money(-p.left)} over</Text> your {p.yours ? 'line' : 'usual month'} of {shortMoney(os, p.line)}
            </>
          ) : (
            <>
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.fg.primary }}>{money(p.perDay)} a day</Text> keeps it under {shortMoney(os, p.line)}
              {p.yours ? '' : ', your usual month'}
            </>
          )}
        </Text>
      ) : null}
      <View accessibilityLabel={`Spend by day in ${label}`} style={{ flexDirection: 'row', gap: 3 }}>
        {days.map((d) => {
          const n = day(d.date).getDate();
          const isNow = d.date === todayIso;
          const future = d.date > todayIso;
          const todayN = offset === 0 ? new Date().getDate() : -9;
          const showLabel = isNow || ((n === 1 || n % 5 === 0) && Math.abs(n - todayN) > 2);
          const h = d.total ? Math.max(4, Math.min(1, d.total / cap) * 84) : 3;
          return (
            <Pressable key={d.date} accessibilityRole="button" accessibilityLabel={`${format(day(d.date), 'EEE d MMM')}, ${money(d.total)}`} disabled={future || !d.total} onPress={() => onDay(d.date)} style={{ flex: 1, height: 100, minWidth: 0 }}>
              <View style={{ height: 84, justifyContent: 'flex-end' }}>
                <View style={{ height: h, borderRadius: d.total ? 2.5 : 1.5, backgroundColor: isNow ? t.c.accent.mustard : d.total ? (t.dark ? '#F5F5F752' : t.c.fg.tertiary) : t.c.line }} />
              </View>
              {showLabel ? (
                <View pointerEvents="none" style={{ position: 'absolute', top: 87, left: '50%', marginLeft: -12, width: 24, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, lineHeight: 13, fontWeight: isNow ? '700' : '600', color: isNow ? t.c.accent.gold : t.c.fg.tertiary }}>{n}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      {spent ? <Text variant="caption" color="secondary">{caption}</Text> : null}
    </View>
  );
}

/** The payments of the day you tapped. */
function DaySheet({ date, onClose }: { date: string | null; onClose: () => void }) {
  const items = useLive((o) => (date ? o.records.query<TransactionData>('transaction', { filter: { and: [{ field: 'data.date', op: 'eq', value: date }] }, sort: [{ field: 'data.amount', dir: 'desc' }] }, { limit: 200 }) : []), [date]);
  return (
    <Sheet visible={!!date} onClose={onClose} title={date ? format(day(date), 'EEE d MMM') : ''}>
      <View>
        {items.map((x, i) => (
          <React.Fragment key={x.id}>
            {i ? <Hairline /> : null}
            <TxRow tx={x} line={kindWord(x.data)} />
          </React.Fragment>
        ))}
      </View>
    </Sheet>
  );
}

function SummaryTiles({ subs, nw, onNetWorth }: { subs: ReturnType<typeof subscriptionRunRate>; nw: ReturnType<typeof netWorth>; onNetWorth: () => void }) {
  const os = useOS();
  const router = useRouter();
  const money = os.format.currency;
  const next = [...subs.rows].sort((a, b) => a.sub.data.nextBillingAt.localeCompare(b.sub.data.nextBillingAt))[0]?.sub;
  const daysTo = next ? Math.round((day(next.data.nextBillingAt).getTime() - day(format(new Date(), 'yyyy-MM-dd')).getTime()) / 86_400_000) : 0;
  const nextLine = next ? `${next.data.name} ${daysTo > 0 ? `in ${daysTo} d` : daysTo === 0 ? 'today' : 'due'}` : '';
  const hasWorth = nw.accounts.length > 0 || nw.holdings.length > 0;
  return (
    <>
      {subs.rows.length ? null : <NoSubscriptions />}
      {subs.rows.length || hasWorth ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {subs.rows.length ? (
            <SummaryTile icon="repeat" label="SUBSCRIPTIONS" value={money(Math.round(subs.monthly))} unit="/mo" line={`${subs.rows.length} active · ${nextLine}`} onPress={() => router.push('/module/finance/subscriptions' as never)} />
          ) : null}
          {hasWorth ? (
            <SummaryTile icon="trend" label="NET WORTH" value={money(Math.round(nw.total))} line={`${nw.accounts.length} account${nw.accounts.length === 1 ? '' : 's'} · ${nw.holdings.length} holding${nw.holdings.length === 1 ? '' : 's'}`} onPress={onNetWorth} />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function SummaryTile({ icon, label, value, unit, line, onPress }: { icon: string; label: string; value: string; unit?: string; line: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${value}${unit ?? ''}, ${line}`} onPress={onPress} style={({ pressed }) => ({ flex: 1, minWidth: 0, padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 8, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={16} color={t.tints.finance.ink} />
        <Caps>{label}</Caps>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>
        {value}
        {unit ? <Text color="secondary" style={{ fontSize: 13, fontWeight: '600' }}>{unit}</Text> : null}
      </Text>
      <Text variant="caption" color="secondary" numberOfLines={2}>{line}</Text>
    </Pressable>
  );
}

/** NR-Money-States · Subscriptions, none active. */
export function NoSubscriptions() {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ padding: 20, borderRadius: 28, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <IconDisc icon="repeat" size={44} />
      <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>No active subscriptions.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Add a subscription" hitSlop={4} onPress={() => router.push('/entity/subscription/new' as never)} style={{ height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700' }}>Add one</Text>
      </Pressable>
    </View>
  );
}

/** NR-Money-States · Nothing in yet. */
function EmptyHome() {
  const t = useTheme();
  const router = useRouter();
  const small = (title: string, to: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={() => router.push(to as never)} style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Text variant="label" numberOfLines={1}>{title}</Text>
    </Pressable>
  );
  return (
    <View style={{ padding: 20, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 16 }}>
      <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="comment" size={22} color={t.tints.finance.ink} />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3 }}>Let bank SMS file your payments</Text>
        <Text color="secondary" style={{ fontSize: 14, lineHeight: 20 }}>LifeOS reads bank and UPI messages on the phone, files each payment with its account and category, and asks in To check when it is not sure.</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Turn on SMS in Data sources" onPress={() => router.push('/settings/sources' as never)} style={({ pressed }) => ({ height: 48, borderRadius: 999, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.accent.mustardInk }}>Turn on SMS in Data sources</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {small('Add an account', '/entity/account/new')}
        {small('Add a payment', '/entity/transaction/new')}
      </View>
      <Text variant="caption" color="secondary">Or tell Dump: “spent 450 on lunch”.</Text>
    </View>
  );
}

/** From To check: payments asking who the payee is, answered right here. */
/** Who owes whom: everyone with a balance (Turf, splits, IOUs), net, biggest first; a row opens their page, where Settle is. */
function WhoOwes({ owes }: { owes: Array<{ personId: string; amount: number; name: string }> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toYou = owes.filter((o) => o.amount > 0).reduce((a, o) => a + o.amount, 0);
  const youOwe = owes.filter((o) => o.amount < 0).reduce((a, o) => a - o.amount, 0);
  const sub = [toYou ? `${shortMoney(os, toYou)} to you` : null, youOwe ? `${shortMoney(os, youOwe)} you owe` : null].filter(Boolean).join(' · ');
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Who owes whom" sub={sub} action={`All ${owes.length}`} chevron onAction={() => router.push('/module/finance/debts' as never)} />
      <Rows padding={14} gap={4}>
        {owes.slice(0, 5).map((o) => (
          <Pressable key={o.personId} accessibilityRole="button" accessibilityLabel={`${o.name} ${o.amount > 0 ? 'owes you' : 'you owe'} ${os.format.currency(Math.abs(o.amount))}`} onPress={() => router.push(`/entity/person/${o.personId}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
            <Disc name={o.name} colorKey={o.personId} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="rowTitle" numberOfLines={1}>{o.name}</Text>
              <Text variant="caption" color="secondary">{o.amount > 0 ? 'owes you' : 'you owe'}</Text>
            </View>
            <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'], color: o.amount > 0 ? t.c.accent.gold : t.c.alert.coralText }}>{os.format.currency(Math.abs(o.amount))}</Text>
          </Pressable>
        ))}
      </Rows>
    </View>
  );
}

/** Before payday as day cards you swipe: card bills (a late one first, in coral), renewals and SIPs, soonest first, with their total. */
function ComingUp({ coming }: { coming: ReturnType<typeof comingUp> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const total = coming.items.reduce((a, i) => a + i.amount, 0);
  const until = format(new Date(`${coming.until}T12:00:00`), 'EEE d MMM');
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title={coming.payday ? 'Before payday' : 'Coming up'} sub={`${coming.payday ? until : `by ${until}`} · ${shortMoney(os, total)}`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -t.layout.gutter }} contentContainerStyle={{ paddingHorizontal: t.layout.gutter, gap: 10 }}>
        {coming.items.map((i) => {
          const d = new Date(`${i.due}T12:00:00`);
          // Each kind has its colour, from the kit's blocks (NR-Money-Home v34): late coral, a bill or card bill sky, a renewal lilac, a SIP mint.
          const kind = i.late ? 'LATE' : i.kind === 'card' ? 'CARD BILL' : i.kind === 'sip' ? 'SIP' : i.bill ? 'BILL' : 'RENEWS';
          const bg = i.late ? t.c.alert.coralText : i.kind === 'card' || i.bill ? blocks.sky : i.kind === 'sip' ? blocks.mint : blocks.lilac;
          const cat = i.kind === 'card' ? 'Card bill' : categoryOf(i.category).label;
          return (
            <Pressable key={i.key} accessibilityRole="button" accessibilityLabel={`${i.title}, ${cat}, ${os.format.currency(i.amount)}, ${i.late ? 'late, was due' : kind === 'RENEWS' ? 'renews' : 'due'} ${format(d, 'EEE d MMM')}`} onPress={() => router.push(`/entity/${i.object}/${i.id}` as never)} style={({ pressed }) => ({ width: 140, padding: 14, borderRadius: 24, gap: 10, backgroundColor: bg, opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, color: 'rgba(11,11,13,0.68)' }}>{`${kind} · ${format(d, 'EEE d').toUpperCase()}`}</Text>
              <Text numberOfLines={1} style={{ alignSelf: 'flex-start', fontSize: 11, lineHeight: 14, fontWeight: '700', color: '#0B0B0D', backgroundColor: 'rgba(11,11,13,0.12)', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' }}>{cat}</Text>
              <View style={{ gap: 1 }}>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4, color: '#0B0B0D', fontVariant: ['tabular-nums'] }}>{os.format.currency(Math.round(i.amount))}</Text>
                <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: 'rgba(11,11,13,0.68)' }}>{i.title.replace(/ bill$/, '').replace(/ SIP$/, '')}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View accessible accessibilityLabel="Colours: coral late, blue bill due, lilac renews, green SIP" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 4 }}>
        {([[t.c.alert.coralText, 'Late'], [blocks.sky, 'Bill due'], [blocks.lilac, 'Renews'], [blocks.mint, 'SIP']] as const).map(([c, w]) => (
          <View key={w} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c }} />
            <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '600' }}>{w}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Payments still in Other: your model sorts the shops (names and rounded amounts only), with Undo (docs/MODEL.md, Better categories). */
function SortOther() {
  const os = useOS();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const n = useLive((o) => o.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM records WHERE object='transaction' AND deleted_at IS NULL AND json_extract(data,'$.kind')='expense' AND json_extract(data,'$.category')='other'`)?.n ?? 0, []);
  if (n < 1) return null;
  const sort = async () => {
    setBusy(true);
    try {
      const agent = await os.device?.agent?.().catch(() => null);
      if (!agent) return toast.show({ message: 'Connect OpenRouter in You › Agent first (one tap, free models)', icon: 'info' });
      const done = await sortWithAI(os, agent.main);
      if (!done || !done.shops.length) return toast.show({ message: 'Nothing it was sure of. Set one yourself and it is learned', icon: 'info' });
      toast.show({ message: `Sorted ${done.shops.length} shop${done.shops.length === 1 ? '' : 's'} · ${done.changed.length} payments`, icon: 'check', undo: () => undoSort(os, done) });
    } catch (e) {
      toast.show({ message: `Couldn’t sort: ${(e as Error).message.slice(0, 80)}`, icon: 'alert' });
    } finally {
      setBusy(false);
    }
  };
  return <SectionHead title="No category yet" sub={`${n} payment${n === 1 ? '' : 's'} in Other`} action={busy ? 'Sorting…' : 'Sort with AI'} lime onAction={busy ? undefined : () => void sort()} />;
}

function NeedsYou() {
  const os = useOS();
  const items = useLive((o) => {
    const asks = o.filings.toCheck().filter((f) => f.entityId && (f.kind === PAYEE_WHO || f.flag));
    const who = new Set(asks.filter((f) => f.kind === PAYEE_WHO).map((f) => f.entityId));
    const isGuess = (id: string) => o.links.forEntity(id).some((r) => r.direction === 'out' && (r.relation.confidence ?? 1) < 1 && r.relation.meta.guess);
    return [...new Set(asks.map((f) => f.entityId!))]
      .map((id) => o.records.get(id))
      .filter((e): e is ObjectRecord => !!e && e.object === 'transaction' && (who.has(e.id) || isGuess(e.id)))
      .slice(0, 3);
  }, []);
  if (!items.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Needs you" sub="From To check" />
      {items.map((e) => (
        <PayeeGuess key={e.id} entity={e} ctx={os} />
      ))}
    </View>
  );
}

function WhereItWent({ byCat, total, month, offset, onBudget }: { byCat: Array<{ category: string; total: number; count: number }>; total: number; month: string; offset: number; onBudget?: () => void }) {
  const os = useOS();
  const router = useRouter();
  const t = useTheme();
  const period = offset === 0 ? 'month' : 'last_month';
  const hasTargets = useLive((o) => targetStatuses(o).length > 0, []);
  const short = (n: number) => shortMoney(os, n);
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Where it went" sub={`${month} · ${byCat.length} categor${byCat.length === 1 ? 'y' : 'ies'}`} action="Spend" chevron onAction={() => router.push({ pathname: '/module/finance/spend', params: { period } } as never)} />
      <RingBadges
        total={short(total)}
        caption={`spent in ${month.split(' ')[0]}`}
        format={short}
        action={hasTargets ? undefined : { label: 'Set a budget', onPress: onBudget ?? (() => router.push('/settings/categories' as never)) }}
        parts={byCat.map((c) => ({ key: c.category, label: categoryOf(c.category).label, value: c.total, color: catColor(c.category, t), icon: categoryOf(c.category).icon, onPress: () => router.push({ pathname: '/module/finance/spend', params: { category: c.category, period } } as never) }))}
      />
    </View>
  );
}

function Targets({ targets }: { targets: ReturnType<typeof targetStatuses> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const money = os.format.currency;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Targets" sub="Monthly, set on each category" action="Edit" onAction={() => router.push('/settings/categories' as never)} />
      <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 16 }}>
        {targets.map((s) => {
          const over = s.remaining < 0;
          return (
            <View key={s.category} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>{categoryOf(s.category).label}</Text>
                <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', fontVariant: ['tabular-nums'], color: over ? t.c.alert.coralText : t.c.fg.secondary }}>{over ? `${money(-s.remaining)} over` : `${money(s.remaining)} left`}</Text>
              </View>
              <ProgressBar value={Math.min(1, s.progress)} color={over ? t.c.alert.coralText : catColor(s.category, t)} height={8} accessibilityLabel={over ? `Over the ${money(s.limit)} target` : `${Math.round(s.progress * 100)} percent of ${money(s.limit)} used`} />
              <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '500', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{money(s.spent)} of {money(s.limit)}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** No targets yet: a budget from your last 3 months, and what it leaves to save; one tap makes it yours (docs/MODEL.md, Suggested budget). */
function SuggestedBudget({ bare, onDone }: { bare?: boolean; onDone?: () => void } = {}) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const s = useLive((o) => suggestBudget(o), []);
  if (!s) return null;
  const money = os.format.currency;
  const take = () => {
    const before = adoptBudget(os, s);
    toast.show({ message: `Budget set · ${money(s.total)} a month across ${s.items.length} categories`, icon: 'check', undo: () => undoBudget(os, s, before) });
    onDone?.();
  };
  return (
    <View style={{ gap: 10 }}>
      {bare ? <Text variant="caption" color="secondary">From your last 3 months</Text> : <SectionHead title="A budget for you" sub="From your last 3 months" />}
      <View style={{ padding: bare ? 0 : 18, borderRadius: 28, backgroundColor: bare ? 'transparent' : t.c.bg.tile, gap: 12 }}>
        {s.items.map((i) => (
          <View key={i.category} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor(i.category, t) }} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>{categoryOf(i.category).label}</Text>
            <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{money(i.monthly)}</Text>
          </View>
        ))}
        <Hairline />
        {s.income > 0 ? (
          <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '500' }}>
            About {money(s.income)} comes in a month. {s.save >= 0 ? <Text style={{ fontWeight: '700', color: t.c.accent.gold }}>This leaves {money(s.save)} to save.</Text> : <Text style={{ fontWeight: '700', color: t.c.alert.coralText }}>That is {money(-s.save)} more than comes in.</Text>}
          </Text>
        ) : (
          <Text variant="caption" color="secondary">No income filed in these months, so nothing to compare it with yet.</Text>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel={`Use these, ${money(s.total)} a month`} onPress={take} style={({ pressed }) => ({ height: 48, borderRadius: 999, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.accent.mustardInk }}>Use these · {money(s.total)}/mo</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Accounts({ nw }: { nw: ReturnType<typeof netWorth> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const money = os.format.currency;
  const lines = useLive((o) => Object.fromEntries(nw.accounts.map(({ account: a }) => [a.id, a.data.institutionId ? o.records.ref(a.data.institutionId)?.title : a.data.institution])), [nw.accounts.map((a) => a.account.id).join()]);
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Accounts" action={nw.accounts.length ? `All ${nw.accounts.length}` : undefined} chevron onAction={() => router.push({ pathname: '/module/finance/reports', params: { tab: 'worth' } } as never)} />
      <Rows padding={14} gap={8}>
        <View style={{ padding: 4, paddingBottom: 6, gap: 2 }}>
          <Caps>NET WORTH</Caps>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{money(Math.round(nw.total))}</Text>
          {nw.investments ? <Text variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>{money(Math.round(nw.investments))} of it in investments</Text> : null}
        </View>
        {nw.accounts.map(({ account: a, balance }) => {
          const inst = lines[a.id];
          const held = nw.holdings.filter((h) => h.investment.data.accountId === a.id).length;
          const limit = a.data.kind === 'credit' && a.data.creditLimit ? Math.max(0, -balance) / a.data.creditLimit : null;
          // A card's bill (from its statement text): due in a few days in white, late in coral.
          const st = a.data.kind === 'credit' ? a.data.statement : undefined;
          const late = !!st && st.dueOn < format(new Date(), 'yyyy-MM-dd');
          const billLine = st ? `${money(st.total)} ${late ? 'was due' : 'due'} ${format(new Date(`${st.dueOn}T12:00:00`), 'EEE d MMM')}` : null;
          const line = a.data.kind === 'investment' ? `Investment · ${held} holding${held === 1 ? '' : 's'}` : a.data.kind === 'cash' ? 'In the wallet' : [inst ?? KIND_WORD[a.data.kind], a.data.last4 ? `··${a.data.last4}` : null].filter(Boolean).join(' · ');
          return (
            <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`${a.title}, ${money(balance, a.data.currency)}`} onPress={() => router.push(`/entity/account/${a.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
              <IconDisc icon={accountIcon(a.data.kind)} />
              <View style={{ flex: 1, minWidth: 0, gap: limit != null ? 4 : 2 }}>
                <Text variant="rowTitle" numberOfLines={1}>{a.title}</Text>
                {limit != null ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 64, height: 4, borderRadius: 2, backgroundColor: t.c.bg.tileRaised, overflow: 'hidden' }}>
                      <View style={{ width: `${Math.min(100, limit * 100)}%`, height: 4, backgroundColor: t.tints.finance.ink }} />
                    </View>
                    <Text variant="caption" color="secondary" numberOfLines={1} style={{ flex: 1 }}>{[inst, `${Math.round(limit * 100)}% of limit`].filter(Boolean).join(' · ')}</Text>
                  </View>
                ) : null}
                {billLine ? (
                  <Text variant="caption" numberOfLines={1} style={{ fontWeight: '600', color: late ? t.c.alert.coralText : t.c.fg.primary }}>{billLine}</Text>
                ) : limit != null ? null : (
                  <Text variant="caption" color="secondary" numberOfLines={1}>{line}</Text>
                )}
              </View>
              <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'], color: balance < 0 ? t.c.alert.coralText : t.c.fg.primary }}>{balance < 0 ? `−${money(-balance, a.data.currency)}` : money(balance, a.data.currency)}</Text>
            </Pressable>
          );
        })}
        {nw.accounts.length ? null : (
          <Pressable accessibilityRole="button" accessibilityLabel="Add an account" onPress={() => router.push('/entity/account/new' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 }}>
            <IconDisc icon="plus" />
            <Text variant="rowTitle">Add an account</Text>
          </Pressable>
        )}
      </Rows>
    </View>
  );
}

function Investments({ holdings }: { holdings: ReturnType<typeof netWorth>['holdings'] }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const money = os.format.currency;
  const top = [...holdings].sort((a, b) => b.value - a.value).slice(0, 2);
  const history = useLive((o) => Object.fromEntries(top.map((h) => [h.investment.id, o.cycles.readings(h.investment.id, 'value', 30).map((r) => r.value).reverse()])), [top.map((h) => h.investment.id).join()]);
  const sips = holdings.filter((h) => h.investment.data.sip);
  const sipLine = sips.length === 1 ? `SIP of ${money(sips[0]!.investment.data.sip!)}${sips[0]!.investment.data.sipDay ? ` on the ${ordinal(sips[0]!.investment.data.sipDay)}` : ' a month'}` : sips.length ? `SIPs of ${money(sips.reduce((n, h) => n + (h.investment.data.sip ?? 0), 0))} a month` : null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Investments" sub={sipLine} action={`All ${holdings.length}`} chevron onAction={() => router.push('/entity/investment' as never)} />
      <Rows padding={14} gap={8}>
        {top.map(({ investment: i, value }) => {
          const d = i.data;
          const gain = d.currentValue != null && d.invested ? (d.currentValue - d.invested) / d.invested : null;
          const line = d.maturesOn ? `Matures ${format(day(d.maturesOn), 'EEE d MMM yyyy')}` : `${INSTRUMENTS.find((x) => x.value === d.instrument)?.label ?? 'Holding'} · ${money(d.invested, d.currency)} in`;
          const spark = history[i.id] ?? [];
          return (
            <Pressable key={i.id} accessibilityRole="button" accessibilityLabel={`${i.title}, ${money(value, d.currency)}`} onPress={() => router.push(`/entity/investment/${i.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="rowTitle" numberOfLines={1}>{i.title}</Text>
                <Text variant="caption" color="secondary" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{line}</Text>
              </View>
              {spark.length > 1 ? <Spark values={spark} color={gain != null && gain < 0 ? t.c.alert.coralText : t.c.accent.gold} /> : null}
              <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(value, d.currency)}</Text>
                <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', fontVariant: ['tabular-nums'], color: gain == null ? t.c.fg.secondary : gain >= 0 ? t.c.accent.gold : t.c.alert.coralText }}>{gain == null ? 'no value yet' : `${gain >= 0 ? '+' : '−'}${Math.abs(gain * 100).toFixed(1)}%`}</Text>
              </View>
            </Pressable>
          );
        })}
      </Rows>
    </View>
  );
}

function Recent({ items, count }: { items: Array<ObjectRecord<TransactionData>>; count: number }) {
  const router = useRouter();
  if (!items.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Recent" action={`All ${count}`} chevron onAction={() => router.push({ pathname: '/module/finance/spend', params: { period: 'all', kind: 'all' } } as never)} />
      <Rows padding={14} gap={8}>
        {items.map((x) => {
          const split = splitOf(x.data);
          return <TxRow key={x.id} tx={x} minHeight={52} line={[kindWord(x.data), relDay(x.data.date), split ? `split ${split.parts.length} ways` : null].filter(Boolean).join(' · ')} />;
        })}
      </Rows>
    </View>
  );
}
