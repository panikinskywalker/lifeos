import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { owedOf } from '@core/money/split';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, EmptyState, Icon, Screen, Text, useToast } from '@ui/kit';
import { BILL_CATEGORIES, billInr, type BillData } from '@modules/finance';
import type { TripData } from '@modules/travel';
import { datesLabel, Note, Row, RowCard, SectionHead } from './parts';
import { amount, bookingRoute } from './bookings';
import { SpendSheet, useNames } from './money';

/**
 * A Bill's page (the trip template, R7g slice 4; JP-Bill): how one spend was
 * split, Splitwise's way. Who paid, the method, each share, the rate and its ₹
 * value, what it did to each balance, the booking or bank payment it is linked
 * to, the receipt's lines; edit, or delete with undo.
 */

const METHOD_LABEL: Record<string, string> = { equal: 'Split equally', exact: 'Exact amounts', percent: 'By percent', shares: 'By shares', adjust: 'Equal, with adjustments' };

export function BillScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const t = useTheme();
  const [editing, setEditing] = useState(false);
  const d = useLive(
    (os) => {
      const b = os.records.get<BillData>(params.bill ?? '');
      if (b?.object !== 'bill') return null;
      const trip = b.data.tripId ? os.records.get<TripData>(b.data.tripId) : null;
      const event = b.data.eventId ? os.records.get(b.data.eventId) : null;
      const txn = b.data.transactionId ? os.records.get(b.data.transactionId) : null;
      const names: Record<string, string> = { me: 'You' };
      for (const p of new Set([...Object.keys(b.data.split.payers), ...Object.keys(b.data.split.shares)])) if (p !== 'me') names[p] = os.records.get(p)?.title ?? 'Someone';
      return { b, trip: trip?.object === 'trip' ? trip : null, event, txn, names };
    },
    [params.bill],
  );
  const tripNames = useNames(d?.trip ?? null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/travel/index' as never));
  if (!d) {
    return (
      <Screen title="Expense" onBack={back}>
        <EmptyState icon="receipt" tint="travel" line="That expense isn’t here any more." />
      </Screen>
    );
  }
  const { b, names } = d;
  const cur = b.data.currency;
  const owed = owedOf(b.data.amount, b.data.split);
  const f = b.data.amount ? billInr(b.data) / b.data.amount : 0;
  const parties = [...new Set([...Object.keys(b.data.split.payers), ...Object.keys(owed)])];
  const payment = b.data.kind === 'payment';
  const del = () => {
    ctx.records.delete(b.id);
    back();
    toast.show({ message: payment ? 'Payback deleted' : 'Expense deleted', icon: 'trash', undo: () => ctx.records.restore(b.id) });
  };
  return (
    <Screen title={payment ? 'Payback' : 'Expense'} subtitle={d.trip?.title} onBack={back} contentStyle={{ gap: 14 }}>
      <View style={{ padding: 16, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 6 }}>
        <Text variant="labelCaps" color="secondary">{payment ? 'PAYBACK' : (BILL_CATEGORIES.find((c) => c.value === b.data.category)?.label ?? 'SPEND').toUpperCase()} · {datesLabel({ startDate: b.data.date }).toUpperCase()}</Text>
        <Text style={{ fontSize: 22, fontWeight: '700' }}>{b.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text style={{ fontSize: 34, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{amount(b.data.amount, cur)}</Text>
          {cur !== 'INR' ? <Text style={{ fontSize: 14, fontWeight: '600', color: t.c.fg.secondary }}>≈ {amount(billInr(b.data), 'INR')}</Text> : null}
        </View>
        {cur !== 'INR' ? <Text variant="caption" color="secondary">{b.data.rate ? `At ${amount(1, cur)} = ₹${b.data.rate.toFixed(4)}, fixed when saved` : 'No rate saved; counted at ₹0 until one is set'}</Text> : null}
      </View>

      {payment ? (
        <Note icon="transfer">{`${names[Object.keys(b.data.split.payers)[0] ?? 'me']} paid ${names[Object.keys(b.data.split.shares)[0] ?? 'me']} outside the app. It moves both balances; it is nobody’s spend.`}</Note>
      ) : (
        <View style={{ gap: 10 }}>
          <SectionHead title="How it was split" sub={METHOD_LABEL[b.data.split.method] ?? b.data.split.method} />
          <RowCard>
            {parties.map((p) => {
              const paid = b.data.split.payers[p] ?? 0;
              const share = owed[p] ?? 0;
              const net = (paid - share) * f;
              const extra = b.data.split.method === 'shares' ? ` · ${b.data.split.shares[p] ?? 0} shares` : b.data.split.method === 'percent' ? ` · ${b.data.split.shares[p] ?? 0}%` : b.data.split.method === 'adjust' && b.data.split.shares[p] ? ` · ${b.data.split.shares[p]! > 0 ? '+' : ''}${b.data.split.shares[p]} adjusted` : '';
              return (
                <Row
                  key={p}
                  title={names[p] ?? 'Someone'}
                  sub={`${paid ? `paid ${amount(paid, cur)} · ` : ''}share ${amount(share, cur)}${extra}`}
                  trailing={<Text style={{ fontSize: 14, fontWeight: '700', color: net > 0.5 ? '#D7F55C' : net < -0.5 ? '#FF6B7A' : t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{net > 0.5 ? `gets back ${amount(net, 'INR')}` : net < -0.5 ? `owes ${amount(-net, 'INR')}` : 'even'}</Text>}
                />
              );
            })}
          </RowCard>
          <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>Paying for someone counts as their spend and their borrowing; they owe it back.</Text>
        </View>
      )}

      {b.data.notes ? (
        <View style={{ gap: 10 }}>
          <SectionHead title={b.data.notes.includes(' · ') ? 'The receipt' : 'Notes'} />
          <RowCard>
            {b.data.notes.split('\n').filter(Boolean).map((l, i) => {
              const [name, price, who] = l.split(' · ');
              return price ? <Row key={i} minHeight={40} title={name ?? l} sub={who ?? null} trailing={<Text style={{ fontWeight: '700' }}>{price}</Text>} /> : <Text key={i} variant="caption" color="secondary" style={{ paddingVertical: 8 }}>{l}</Text>;
            })}
          </RowCard>
        </View>
      ) : null}

      {d.event || d.txn || d.trip ? (
        <RowCard>
          {d.event ? <Row lead={<Icon name="moon" size={18} color="#F6E27F" />} title="Toward the booking" sub={d.event.title} onPress={() => router.push(bookingRoute(d.event!.id) as never)} /> : null}
          {d.txn ? <Row lead={<Icon name="bank" size={18} color="#8C9DFF" />} title="Your bank’s record" sub={d.txn.title} onPress={() => router.push(`/entity/transaction/${d.txn!.id}` as never)} /> : null}
          {d.trip ? <Row lead={<Icon name="airplane" size={18} color="#6CC6FF" />} title="Trip" sub={d.trip.title} onPress={() => router.push(`/entity/trip/${d.trip!.id}` as never)} /> : null}
        </RowCard>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {!payment && d.trip ? <Button title="Edit" icon="edit" variant="secondary" onPress={() => setEditing(true)} style={{ flex: 1 }} /> : null}
        <Button title="Delete" icon="trash" variant="secondary" onPress={del} style={{ flex: 1 }} />
      </View>
      {d.trip && editing ? <SpendSheet visible={editing} onClose={() => setEditing(false)} trip={d.trip} ctx={ctx} names={tripNames} edit={b} /> : null}
    </Screen>
  );
}
