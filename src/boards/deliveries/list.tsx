import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { ChipRow, FilterChip, Icon, Screen, Text } from '@ui/kit';
import { isoDay, onTheWay, otpOf, STAGE, type DeliveryData } from '@modules/deliveries';
import { AddButton, dayLabel, DeliveryRow, GroupLabel, lateDays, Pill, RowCard, soonest, type Delivery } from './parts';

/**
 * All deliveries (NR-Deliveries-List): search and filter every delivery, by
 * status. What is on its way goes soonest first; what is closed goes by its
 * day, and only the newest few until you ask for more.
 */

type Filter = 'all' | 'way' | 'delivered' | 'cancelled' | 'returned';

/** How many closed ones show before Show more: delivered, then cancelled and returned. */
const FIRST_DELIVERED = 4;
const FIRST_CLOSED = 2;

/** On its status but not on its way: a quick-commerce order that has heard nothing since. */
const probablyCame = (e: Delivery, now: number) => STAGE[e.data.status] < 3 && !onTheWay(e, now);
const closedDay = (e: Delivery) => e.data.deliveredOn ?? isoDay(e.updatedAt);

const matches = (e: Delivery, q: string) => [e.title, e.data.shop, e.data.carrier, e.data.tracking, e.data.orderId].some((s) => s?.toLowerCase().includes(q));

function Row({ e, now }: { e: Delivery; now: number }) {
  const t = useTheme();
  const otp = otpOf(e, now);
  const late = lateDays(e, now);
  const closed = STAGE[e.data.status] > 3;
  const came = probablyCame(e, now);
  const open = !closed && !came && e.data.status !== 'delivered';
  const right = otp ? (
    <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: t.c.accent.mustard, fontVariant: ['tabular-nums'] }}>{`OTP ${otp}`}</Text>
  ) : late ? (
    <Pill label={`${late} d late`} tone="coral" />
  ) : open ? null : (
    <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{dayLabel(closedDay(e))}</Text>
  );
  const sub = came ? ['Probably came', e.data.shop].filter(Boolean).join(' · ') : e.subtitle ?? '';
  return <DeliveryRow entity={e} sub={sub} minHeight={60} muted={closed} right={right} />;
}

function Group({ label, color, items, count, now }: { label: string; color?: string; items: Delivery[]; count: number; now: number }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <GroupLabel text={label} color={color} count={count} />
      <RowCard>{items.map((e) => <Row key={e.id} e={e} now={now} />)}</RowCard>
    </View>
  );
}

export function DeliveriesList() {
  const router = useRouter();
  const t = useTheme();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [newest, setNewest] = useState(true);
  const [more, setMore] = useState(false);
  const d = useLive((os) => ({ all: os.records.query<DeliveryData>('delivery', {}, { limit: 5000 }), now: Date.now() }), []);

  const way = d.all.filter((e) => onTheWay(e, d.now));
  const query = q.trim().toLowerCase();
  const shown = d.all.filter((e) => {
    if (query && !matches(e, query)) return false;
    return filter === 'all' ? true : filter === 'way' ? onTheWay(e, d.now) : filter === 'delivered' ? e.data.status === 'delivered' || probablyCame(e, d.now) : e.data.status === filter;
  });
  const open = shown.filter((e) => onTheWay(e, d.now)).sort(soonest);
  const byDay = (a: Delivery, b: Delivery) => (newest ? closedDay(b).localeCompare(closedDay(a)) : closedDay(a).localeCompare(closedDay(b)));
  const delivered = shown.filter((e) => e.data.status === 'delivered' || probablyCame(e, d.now)).sort(byDay);
  const closed = shown.filter((e) => STAGE[e.data.status] > 3).sort(byDay);
  const capped = filter === 'all' && !query && !more;
  const hidden = capped ? Math.max(0, delivered.length - FIRST_DELIVERED) + Math.max(0, closed.length - FIRST_CLOSED) : 0;

  return (
    <Screen title="All deliveries" subtitle={`${d.all.length} · ${way.length} on the way`} onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/deliveries/index' as never))} right={<AddButton />} contentStyle={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: t.c.line }}>
        <Icon name="search" size={18} color={t.c.fg.secondary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Item, shop, carrier, tracking or order no."
          placeholderTextColor={t.c.fg.tertiary}
          selectionColor={t.c.accent.mustard}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search deliveries"
          style={{ flex: 1, minHeight: 46, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 16, lineHeight: 21, paddingVertical: 0 }}
        />
      </View>
      <ChipRow>
        <FilterChip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <FilterChip label={`On the way · ${way.length}`} selected={filter === 'way'} onPress={() => setFilter('way')} />
        <FilterChip label="Delivered" selected={filter === 'delivered'} onPress={() => setFilter('delivered')} />
        <FilterChip label="Cancelled" selected={filter === 'cancelled'} onPress={() => setFilter('cancelled')} />
        <FilterChip label="Returned" selected={filter === 'returned'} onPress={() => setFilter('returned')} />
        <FilterChip label={newest ? 'Newest' : 'Oldest'} icon="sort" onPress={() => setNewest((n) => !n)} />
      </ChipRow>

      <Group label="OUT FOR DELIVERY" color={t.c.accent.mustard} items={open.filter((e) => e.data.status === 'out_for_delivery')} count={open.filter((e) => e.data.status === 'out_for_delivery').length} now={d.now} />
      <Group label="SHIPPED" items={open.filter((e) => e.data.status === 'shipped')} count={open.filter((e) => e.data.status === 'shipped').length} now={d.now} />
      <Group label="ORDERED" items={open.filter((e) => e.data.status === 'ordered')} count={open.filter((e) => e.data.status === 'ordered').length} now={d.now} />
      <Group label="DELIVERED" items={capped ? delivered.slice(0, FIRST_DELIVERED) : delivered} count={delivered.length} now={d.now} />
      <Group label={filter === 'cancelled' ? 'CANCELLED' : filter === 'returned' ? 'RETURNED' : 'CANCELLED AND RETURNED'} items={capped ? closed.slice(0, FIRST_CLOSED) : closed} count={closed.length} now={d.now} />

      {!shown.length ? <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, textAlign: 'center', paddingVertical: 12 }}>{d.all.length ? 'Nothing matches.' : 'No deliveries yet.'}</Text> : null}
      {hidden ? (
        <Pressable accessibilityRole="button" onPress={() => setMore(true)} style={({ pressed }) => ({ height: 48, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>{`Show ${hidden} more`}</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}
