import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Text, useToast } from '@ui/kit';
import { balanceWith, type DebtData } from '@modules/finance/split';
import type { TransactionData } from '@modules/finance/types';
import { Disc, FieldRow, FieldValue, Hairline, Metric, Quick, RecordBar, RecordExtras, Rows, SectionHead, StatusPill, TxRow, day, debtReason, kindWord, relDay } from './parts';
import { useSettle } from './splitScreens';

const KIND: Record<DebtData['kind'], string> = { split: 'Split', loan: 'Loan', payment: 'Payment' };

/** A Debt's page (docs/MODEL.md, Money pages with no artboard): who owes whom and for what, the balance with that person, Settle up, the payment it came from, what else is open. Built from the kit. */
export function DebtPage({ entity, ctx, controls, say }: { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: React.ReactNode }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const debt = entity as ObjectRecord<DebtData>;
  const d = debt.data;
  const money = (n: number) => ctx.format.currency(n, d.currency);
  const view = useLive((o) => ({
    name: o.records.get(d.personId)?.title ?? 'Someone',
    group: d.groupId ? (o.records.get(d.groupId)?.title ?? null) : null,
    balance: balanceWith(o, d.personId),
    tx: d.transactionId ? (o.records.get<TransactionData>(d.transactionId) ?? null) : null,
    others: o.records.query<DebtData>('debt', { filter: { and: [{ field: 'data.personId', op: 'eq', value: d.personId }, { field: 'status', op: 'neq', value: 'settled' }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 20 }).filter((x) => x.id !== debt.id),
  }), [debt.id, debt.version]);
  const settle = useSettle(d.personId, view.balance);

  const theyOwe = d.direction === 'they_owe';
  const settled = debt.status === 'settled';
  const first = view.name.split(' ')[0];
  const tone = settled ? undefined : theyOwe ? t.c.accent.gold : t.c.alert.coralText;
  const reopen = () => {
    ctx.records.setStatus(debt.id, 'open');
    toast.show({ message: 'Open again', icon: 'repeat', undo: () => void ctx.records.setStatus(debt.id, 'settled') });
  };

  return (
    <View style={{ paddingHorizontal: t.layout.gutter, gap: 24 }}>
      {controls ? <RecordBar label="Debt" controls={controls} /> : null}

      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Disc name={view.name} colorKey={d.personId} size={56} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={2} accessibilityRole="header" style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.8 }}>{debtReason(debt)}</Text>
            <Text variant="caption" numberOfLines={1} style={{ fontWeight: '600', color: tone ?? t.c.fg.secondary }}>{theyOwe ? `${view.name} owes you` : `You owe ${view.name}`}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill label={settled ? 'Settled' : 'Open'} lime={!settled} />
          <StatusPill label={KIND[d.kind] ?? 'Debt'} />
          {view.group ? <StatusPill label={view.group} /> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 14, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.c.line }}>
          <Metric label="AMOUNT" value={`${theyOwe ? '+' : '−'}${money(d.amount)}`} line={settled ? 'settled' : theyOwe ? 'to you' : 'from you'} color={tone} />
          <Metric label="DATE" value={format(day(d.date), 'd MMM')} line={format(day(d.date), 'EEEE')} />
          <Metric label={`WITH ${first.toUpperCase()}`} value={view.balance === 0 ? 'Square' : money(Math.abs(view.balance))} line={view.balance > 0 ? 'owes you in all' : view.balance < 0 ? 'you owe in all' : 'nothing open'} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {view.balance !== 0 ? <Quick label="Settle up" icon="check" onPress={settle} /> : null}
        {settled ? <Quick label="Reopen" icon="repeat" onPress={reopen} /> : null}
        <Quick label={first} icon="user" onPress={() => router.push(`/entity/person/${d.personId}` as never)} />
        <Quick label="Edit" icon="edit" onPress={() => controls?.edit()} />
      </View>

      {view.tx ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="The payment" />
          <Rows>
            <TxRow tx={view.tx} line={[kindWord(view.tx.data), relDay(view.tx.data.date)].join(' · ')} />
          </Rows>
        </View>
      ) : null}

      {view.others.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title={`Also open with ${first}`} sub={String(view.others.length)} />
          <Rows gap={4}>
            {view.others.map((x) => (
              <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`${debtReason(x)}, ${money(x.data.amount)}`} onPress={() => router.push(`/entity/debt/${x.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="rowTitle" numberOfLines={1}>{debtReason(x)}</Text>
                  <Text variant="caption" color="secondary">{format(day(x.data.date), 'EEE d MMM')}</Text>
                </View>
                <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', fontVariant: ['tabular-nums'], color: x.data.direction === 'they_owe' ? t.c.accent.gold : t.c.alert.coralText }}>{`${x.data.direction === 'they_owe' ? '+' : '−'}${money(x.data.amount)}`}</Text>
              </Pressable>
            ))}
          </Rows>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHead title="Fields" />
        <View style={{ paddingVertical: 6, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          <FieldRow label="Person"><FieldValue>{view.name}</FieldValue></FieldRow>
          <Hairline />
          <FieldRow label="Who owes"><FieldValue>{theyOwe ? 'They owe me' : 'I owe them'}</FieldValue></FieldRow>
          <Hairline />
          <FieldRow label="Amount"><FieldValue>{money(d.amount)}</FieldValue></FieldRow>
          <Hairline />
          <FieldRow label="For"><FieldValue>{debtReason(debt)}</FieldValue></FieldRow>
          <Hairline />
          <FieldRow label="Date"><FieldValue>{format(day(d.date), 'EEE d MMM yyyy')}</FieldValue></FieldRow>
          <Hairline />
          <FieldRow label="Kind"><FieldValue>{KIND[d.kind] ?? 'Debt'}</FieldValue></FieldRow>
          {view.group ? (<><Hairline /><FieldRow label="Group"><FieldValue>{view.group}</FieldValue></FieldRow></>) : null}
        </View>
      </View>

      <RecordExtras entity={debt} module="finance" />

      {say}
    </View>
  );
}
