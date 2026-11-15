import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { IconButton, ScreenHeader, Text } from '@ui/kit';
import { perMonth } from '@modules/finance/reports';
import { balances, type DebtData } from '@modules/finance/split';
import type { SubscriptionData } from '@modules/finance/types';
import { Caps, Disc, Rows, SectionHead, day, debtReason, shortMoney } from './parts';
import { NoSubscriptions } from './screens';
import { SettleButton } from './splitScreens';

/** The number card at the top of a Money list: a caps label, the figure, a line. */
function Headline({ label, value, unit, line }: { label: string; value: string; unit?: string; line: string }) {
  const t = useTheme();
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 6 }}>
      <Caps>{label}</Caps>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 34, lineHeight: 38, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>
        {value}
        {unit ? <Text color="secondary" style={{ fontSize: 15, fontWeight: '600' }}>{unit}</Text> : null}
      </Text>
      <Text variant="caption" color="secondary">{line}</Text>
    </View>
  );
}

/** A list row: disc, title, a line, the amount on the right (with a small line under it). */
function Row({ name, colorKey, title, line, lineColor, amount, amountColor, meta, onPress }: { name: string; colorKey?: string; title: string; line: string; lineColor?: string; amount: string; amountColor?: string; meta?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${line}, ${amount}`} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, opacity: pressed ? 0.7 : 1 })}>
      <Disc name={name} colorKey={colorKey} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="rowTitle" numberOfLines={1}>{title}</Text>
        <Text variant="caption" numberOfLines={1} style={{ color: lineColor ?? t.c.fg.secondary }}>{line}</Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
        <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'], color: amountColor }}>{amount}</Text>
        {meta ? <Text color="secondary" style={{ fontSize: 12, lineHeight: 15, fontVariant: ['tabular-nums'] }}>{meta}</Text> : null}
      </View>
    </Pressable>
  );
}

function ListScreen({ title, sub, right, children }: { title: string; sub: string; right?: React.ReactNode; children: React.ReactNode }) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.c.bg.ground }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 32, gap: 24 }}>
      <ScreenHeader title={title} subtitle={sub} onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/finance/index' as never))} right={right} />
      {children}
    </ScrollView>
  );
}

const inDays = (iso: string) => {
  const n = Math.round((day(iso).getTime() - day(format(new Date(), 'yyyy-MM-dd')).getTime()) / 86_400_000);
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n < 0 ? 'due' : `in ${n} days`;
};

/** Money › Subscriptions (docs/MODEL.md, Money pages with no artboard): what they cost, soonest renewal first; paused and cancelled below. */
export function SubscriptionsScreen(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const all = useLive((o) => o.records.query<SubscriptionData>('subscription', {}, { limit: 1000 }), []);
  const live = all.filter((s) => (s.status ?? 'active') === 'active').sort((a, b) => a.data.nextBillingAt.localeCompare(b.data.nextBillingAt));
  const active = live.filter((s) => !s.data.bill);
  const bills = live.filter((s) => s.data.bill);
  const rest = all.filter((s) => (s.status ?? 'active') !== 'active');
  const monthly = active.reduce((n, s) => n + perMonth(s.data.amount, s.data.rrule), 0);
  const money = (s: ObjectRecord<SubscriptionData>, n: number) => os.format.currency(Math.round(n), s.data.currency);
  const open = (s: ObjectRecord<SubscriptionData>) => router.push(`/entity/subscription/${s.id}` as never);
  const add = <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} accessibilityLabel="Add a subscription" onPress={() => router.push('/entity/subscription/new' as never)} />;
  return (
    <ListScreen title="Subscriptions" sub={live.length ? [active.length ? `${active.length} subscription${active.length === 1 ? '' : 's'}` : null, bills.length ? `${bills.length} bill${bills.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') : 'Money'} right={add}>
      {active.length ? (
        <>
          <Headline label="EVERY MONTH" value={os.format.currency(Math.round(monthly))} unit="/mo" line={`${os.format.currency(Math.round(monthly * 12))} a year`} />
          <View style={{ gap: 10 }}>
            <SectionHead title="Next to renew" />
            <Rows gap={4}>
              {active.map((s) => {
                const when = inDays(s.data.nextBillingAt);
                const soon = when === 'today' || when === 'tomorrow' || when === 'due';
                return <Row key={s.id} name={s.data.name} title={s.data.name} line={`${format(day(s.data.nextBillingAt), 'EEE d MMM')} · ${when}`} lineColor={soon ? t.c.alert.coralText : undefined} amount={money(s, s.data.amount)} meta={perMonth(s.data.amount, s.data.rrule) !== s.data.amount ? `${money(s, perMonth(s.data.amount, s.data.rrule))}/mo` : undefined} onPress={() => open(s)} />;
              })}
            </Rows>
          </View>
        </>
      ) : (
        <NoSubscriptions />
      )}
      {bills.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Bills" sub={`${os.format.currency(Math.round(bills.reduce((n, b) => n + b.data.amount, 0)))} next`} />
          <Rows gap={4}>
            {bills.map((b) => {
              const when = inDays(b.data.nextBillingAt);
              return <Row key={b.id} name={b.data.name} title={b.data.payee ? `${b.data.name} · ${b.data.payee}` : b.data.name} line={`${when === 'due' ? 'was due' : 'due'} ${format(day(b.data.nextBillingAt), 'EEE d MMM')}${when === 'due' ? '' : ` · ${when}`}`} lineColor={when === 'due' || when === 'today' ? t.c.alert.coralText : undefined} amount={money(b, b.data.amount)} onPress={() => open(b)} />;
            })}
          </Rows>
        </View>
      ) : null}
      {rest.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Paused and cancelled" sub={String(rest.length)} />
          <Rows gap={4}>
            {rest.map((s) => (
              <Row key={s.id} name={s.data.name} title={s.data.name} line={s.status === 'paused' ? 'Paused' : 'Cancelled'} amount={money(s, s.data.amount)} amountColor={t.c.fg.secondary} onPress={() => open(s)} />
            ))}
          </Rows>
        </View>
      ) : null}
    </ListScreen>
  );
}

const reasonOf = debtReason;

/** Money › Who owes whom (docs/MODEL.md, Money pages with no artboard): per person, their net and Settle up, their open items under it; the last settled below. */
export function DebtsScreen(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const data = useLive((o) => {
    const open = o.records.query<DebtData>('debt', { filter: { and: [{ field: 'status', op: 'neq', value: 'settled' }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 2000 });
    const settled = o.records.query<DebtData>('debt', { filter: { and: [{ field: 'status', op: 'eq', value: 'settled' }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 10 });
    const people = balances(o).map((b) => ({ ...b, name: o.records.get(b.personId)?.title ?? 'Someone', items: open.filter((d) => d.data.personId === b.personId) }));
    return { people, settled, names: Object.fromEntries(settled.map((d) => [d.data.personId, o.records.get(d.data.personId)?.title ?? 'Someone'])) };
  }, []);
  const toYou = data.people.filter((p) => p.amount > 0).reduce((a, p) => a + p.amount, 0);
  const youOwe = data.people.filter((p) => p.amount < 0).reduce((a, p) => a - p.amount, 0);
  const add = <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} accessibilityLabel="Add a debt" onPress={() => router.push('/entity/debt/new' as never)} />;
  const short = (d: ObjectRecord<DebtData>) => format(day(d.data.date), 'EEE d MMM');
  return (
    <ListScreen title="Who owes whom" sub={data.people.length ? `${data.people.length} ${data.people.length === 1 ? 'person' : 'people'}` : 'Money'} right={add}>
      {data.people.length ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Headline label="TO YOU" value={shortMoney(os, toYou)} line={`${data.people.filter((p) => p.amount > 0).length} owe you`} /></View>
          <View style={{ flex: 1 }}><Headline label="YOU OWE" value={shortMoney(os, youOwe)} line={`to ${data.people.filter((p) => p.amount < 0).length}`} /></View>
        </View>
      ) : (
        <View style={{ padding: 20, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 6 }}>
          <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700' }}>All square</Text>
          <Text variant="caption" color="secondary">Split a payment from its page, or add who owes what with +. Turf shares land here on their own.</Text>
        </View>
      )}
      {data.people.map((p) => (
        <View key={p.personId} style={{ padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${p.name}`} onPress={() => router.push(`/entity/person/${p.personId}` as never)} style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Disc name={p.name} colorKey={p.personId} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="rowTitle" numberOfLines={1}>{p.name}</Text>
                <Text variant="caption" numberOfLines={1} style={{ fontWeight: '600', color: p.amount > 0 ? t.c.accent.gold : t.c.alert.coralText }}>{p.amount > 0 ? 'owes you' : 'you owe'} {os.format.currency(Math.abs(p.amount))}</Text>
              </View>
            </Pressable>
            <SettleButton personId={p.personId} amount={p.amount} label="Settle" quiet />
          </View>
          {p.items.map((d) => (
            <Pressable key={d.id} accessibilityRole="button" accessibilityLabel={`${reasonOf(d)}, ${short(d)}`} onPress={() => router.push(`/entity/debt/${d.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, paddingLeft: 54, opacity: pressed ? 0.7 : 1 })}>
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, lineHeight: 18 }}><Text color="secondary" style={{ fontSize: 13 }}>{`${short(d)} · `}</Text>{reasonOf(d)}</Text>
              <Text color="secondary" style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{`${d.data.direction === 'they_owe' ? '+' : '−'}${os.format.currency(d.data.amount, d.data.currency)}`}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      {data.settled.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Settled lately" />
          <Rows gap={4}>
            {data.settled.map((d) => (
              <Row key={d.id} name={data.names[d.data.personId]!} colorKey={d.data.personId} title={data.names[d.data.personId]!} line={`${short(d)} · ${reasonOf(d)}`} amount={os.format.currency(d.data.amount, d.data.currency)} amountColor={t.c.fg.secondary} onPress={() => router.push(`/entity/debt/${d.id}` as never)} />
            ))}
          </Rows>
        </View>
      ) : null}
    </ListScreen>
  );
}
