import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ChipRow, Icon, IconButton, ProgressBar, Sheet, Text } from '@ui/kit';
import { accountBalance, dailySpend, incomeInRange, monthRange, netWorth, spendByCategory, spendInRange, targetStatuses } from '@modules/finance/lib';
import { subscriptionRunRate } from '@modules/finance/reports';
import { PAYEE_WHO } from '@modules/finance/filing/payee';
import { categoryOf, INSTRUMENTS, type AccountData, type TransactionData } from '@modules/finance/types';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { PayeeGuess } from './payeeGuess';
import { Caps, SectionHead, Hairline, IconDisc, Rows, Spark, SplitBar, TxRow, accountIcon, catColor, day, kindWord, relDay, splitOf } from './parts';

const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** Money's home (NR-Money-Home): this month, subscriptions and net worth, what needs you, where it went, targets, accounts, investments, recent. */
export function FinanceHome(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const anchors = useRef<{ accounts?: number; investments?: number }>({});
  const [offset, setOffset] = useState(0);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const m = monthRange(offset);
  const data = useLive(
    (os) => {
      const usualMonths = [1, 2, 3].map((k) => { const r = monthRange(offset - k); return spendInRange(os, r.start, r.end); }).filter((x) => x > 0);
      const inMonth = { filter: { and: [{ field: 'data.date', op: 'gte' as const, value: m.start }, { field: 'data.date', op: 'lte' as const, value: m.end }] } };
      const salary = os.records.query<TransactionData>('transaction', { filter: { and: [...inMonth.filter.and, { field: 'data.kind', op: 'eq', value: 'income' }, { field: 'data.category', op: 'eq', value: 'salary' }] }, sort: [{ field: 'data.date', dir: 'asc' }] }, { limit: 1 })[0];
      const incomes = os.records.count('transaction', { filter: { and: [...inMonth.filter.and, { field: 'data.kind', op: 'eq', value: 'income' }] } });
      return {
        spent: spendInRange(os, m.start, m.end),
        usual: usualMonths.length ? usualMonths.reduce((a, b) => a + b, 0) / usualMonths.length : null,
        income: incomeInRange(os, m.start, m.end),
        incomeLine: salary ? `salary on the ${ordinal(day(salary.data.date).getDate())}` : incomes ? `${incomes} payment${incomes === 1 ? '' : 's'}` : null,
        byCat: spendByCategory(os, m.start, m.end).sort((a, b) => b.total - a.total),
        days: dailySpend(os, m.start, m.end),
        monthCount: os.records.count('transaction', inMonth),
        count: os.records.count('transaction'),
        recent: os.records.query<TransactionData>('transaction', { sort: [{ field: 'data.date', dir: 'desc' }, { field: 'createdAt', dir: 'desc' }] }, { limit: 5 }),
        nw: netWorth(os),
        subs: subscriptionRunRate(os),
        targets: targetStatuses(os, day(m.start)),
      };
    },
    [m.start],
  );
  const isEmpty = !data.count && !data.nw.accounts.length && !data.nw.holdings.length && !data.subs.rows.length;
  const goAnchor = (key: 'accounts' | 'investments') => scroll.current?.scrollTo({ y: Math.max(0, (anchors.current[key] ?? 0) - 12), animated: true });
  const add = (
    <IconButton icon="plus" accessibilityLabel="Add a transaction" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} onPress={() => router.push('/entity/transaction/new' as never)} />
  );
  const header = (sub: string, right: React.ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text variant="caption" color="secondary" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{sub}</Text>
        <Text variant="title" accessibilityRole="header">Money</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>{right}</View>
    </View>
  );

  if (isEmpty) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: t.c.bg.ground }} contentContainerStyle={{ paddingTop: insets.top, paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 32, gap: 20 }}>
        {header('No payments yet', add)}
        <EmptyHome />
      </ScrollView>
    );
  }

  const monthName = m.label.split(' ')[0];
  return (
    <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: t.c.bg.ground }} contentContainerStyle={{ paddingTop: insets.top, paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 32, gap: 24 }}>
      {header(`${monthName} · ${data.monthCount} transaction${data.monthCount === 1 ? '' : 's'}`, <><ToCheckBell />{add}</>)}

      <ChipRow>
        <NavChip label="Spend" icon="pie" onPress={() => router.push('/spend' as never)} />
        <NavChip label="Transactions" icon="arrow.up.arrow.down" onPress={() => router.push({ pathname: '/spend', params: { period: 'all', kind: 'all' } } as never)} />
        <NavChip label="Accounts" icon="card" onPress={() => goAnchor('accounts')} />
        <NavChip label="Subscriptions" icon="repeat" onPress={() => router.push('/entity/subscription' as never)} />
        <NavChip label="Investments" icon="trend" onPress={() => goAnchor('investments')} />
        <NavChip label="Reports" icon="chart" onPress={() => router.push('/module/finance/reports' as never)} />
      </ChipRow>

      <MonthCard label={m.label} offset={offset} setOffset={setOffset} spent={data.spent} usual={data.usual} income={data.income} incomeLine={data.incomeLine} days={data.days} onDay={setOpenDay} />

      <SummaryTiles subs={data.subs} nw={data.nw} onNetWorth={() => goAnchor('accounts')} />

      <NeedsYou />

      {data.byCat.length ? <WhereItWent byCat={data.byCat} total={data.spent} month={monthName!} offset={offset} /> : null}

      {data.targets.length ? <Targets targets={data.targets} /> : null}

      <View onLayout={(e) => (anchors.current.accounts = e.nativeEvent.layout.y)}>
        <Accounts nw={data.nw} />
      </View>

      {data.nw.holdings.length ? (
        <View onLayout={(e) => (anchors.current.investments = e.nativeEvent.layout.y)}>
          <Investments holdings={data.nw.holdings} />
        </View>
      ) : null}

      <Recent items={data.recent} count={data.count} />

      <DaySheet date={openDay} onClose={() => setOpenDay(null)} />
    </ScrollView>
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

function MonthCard({ label, offset, setOffset, spent, usual, income, incomeLine, days, onDay }: { label: string; offset: number; setOffset: (n: number) => void; spent: number; usual: number | null; income: number; incomeLine: string | null; days: Array<{ date: string; total: number }>; onDay: (date: string) => void }) {
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
            <SummaryTile icon="repeat" label="SUBSCRIPTIONS" value={money(Math.round(subs.monthly))} unit="/mo" line={`${subs.rows.length} active · ${nextLine}`} onPress={() => router.push('/entity/subscription' as never)} />
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

function WhereItWent({ byCat, total, month, offset }: { byCat: Array<{ category: string; total: number; count: number }>; total: number; month: string; offset: number }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const period = offset === 0 ? 'month' : 'last_month';
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Where it went" sub={`${month} · ${byCat.length} categor${byCat.length === 1 ? 'y' : 'ies'}`} action="Spend" chevron onAction={() => router.push({ pathname: '/spend', params: { period } } as never)} />
      <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 14 }}>
        <SplitBar parts={byCat.map((c) => ({ key: c.category, share: c.total / (total || 1), color: catColor(c.category, t) }))} />
        <View style={{ gap: 2 }}>
          {byCat.map((c, i) => {
            // The big four read in full; the rest step back.
            const tone = i < 4 ? t.c.fg.primary : t.c.fg.secondary;
            return (
              <Pressable key={c.category} accessibilityRole="button" accessibilityLabel={`${categoryOf(c.category).label}, ${os.format.currency(c.total)}`} hitSlop={{ top: 4, bottom: 4 }} onPress={() => router.push({ pathname: '/spend', params: { category: c.category, period } } as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor(c.category, t), opacity: i < 4 ? 1 : 0.7 }} />
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: tone }}>{categoryOf(c.category).label}</Text>
                <Text variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>{Math.round((c.total / (total || 1)) * 100)}%</Text>
                <Text style={{ minWidth: 84, textAlign: 'right', fontSize: 14, lineHeight: 18, fontWeight: '700', color: tone, fontVariant: ['tabular-nums'] }}>{os.format.currency(c.total)}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
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

const KIND_WORD: Record<AccountData['kind'], string> = { bank: 'Bank', cash: 'Cash', credit: 'Credit card', investment: 'Investment', wallet: 'Wallet', loan: 'Loan' };

function Accounts({ nw }: { nw: ReturnType<typeof netWorth> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const money = os.format.currency;
  const lines = useLive((o) => Object.fromEntries(nw.accounts.map(({ account: a }) => [a.id, a.data.institutionId ? o.records.ref(a.data.institutionId)?.title : a.data.institution])), [nw.accounts.map((a) => a.account.id).join()]);
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Accounts" action={nw.accounts.length ? `All ${nw.accounts.length}` : undefined} chevron onAction={() => router.push('/entity/account' as never)} />
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
                ) : (
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
      <SectionHead title="Recent" action={`All ${count}`} chevron onAction={() => router.push({ pathname: '/spend', params: { period: 'all', kind: 'all' } } as never)} />
      <Rows padding={14} gap={8}>
        {items.map((x) => {
          const split = splitOf(x.data);
          return <TxRow key={x.id} tx={x} minHeight={52} line={[kindWord(x.data), relDay(x.data.date), split ? `split ${split.parts.length} ways` : null].filter(Boolean).join(' · ')} />;
        })}
      </Rows>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* An Account's page (no artboard): the balance and its payments        */
/* ------------------------------------------------------------------ */

export function AccountSection({ entity, ctx }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const router = useRouter();
  const t = useTheme();
  const a = entity as ObjectRecord<AccountData>;
  const balance = useLive((os) => accountBalance(os, a), [entity.id, entity.version]);
  const txns = useLive((os) => os.records.query<TransactionData>('transaction', { filter: { or: [{ field: 'data.accountId', op: 'eq', value: entity.id }, { field: 'data.toAccountId', op: 'eq', value: entity.id }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 10 }), [entity.id]);
  const money = ctx.format.currency;
  const used = a.data.kind === 'credit' && a.data.creditLimit ? Math.max(0, -balance) : null;
  return (
    <View style={{ gap: 16 }}>
      <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 10 }}>
        <Caps>CURRENT BALANCE</Caps>
        <Text variant="display" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} color={balance < 0 ? t.c.alert.coralText : undefined}>{balance < 0 ? `−${money(-balance, a.data.currency)}` : money(balance, a.data.currency)}</Text>
        {used != null ? (
          <View style={{ gap: 6 }}>
            <ProgressBar value={Math.min(1, used / a.data.creditLimit!)} color={t.tints.finance.ink} height={8} />
            <Text variant="caption" color="secondary">{money(used)} of {money(a.data.creditLimit!)} limit used</Text>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 10 }}>
        <SectionHead title="Transactions" action="Add" lime onAction={() => router.push({ pathname: '/entity/[type]/new', params: { type: 'transaction', accountId: entity.id } } as never)} />
        {txns.length ? (
          <Rows>
            {txns.map((x) => (
              <TxRow key={x.id} tx={x} line={[kindWord(x.data), relDay(x.data.date)].join(' · ')} />
            ))}
          </Rows>
        ) : (
          <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>No transactions on this account.</Text>
        )}
      </View>
    </View>
  );
}
