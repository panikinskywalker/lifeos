import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Text, useToast } from '@ui/kit';
import { blocks } from '@ui/theme/tokens';
import { balanceWith, type DebtData } from '@modules/finance/split';
import type { TransactionData } from '@modules/finance/types';
import { Disc, FieldRow, FieldValue, Hairline, RecordBar, RecordExtras, Rows, SectionHead, StatusPill, TxRow, day, debtReason, kindWord, relDay } from './parts';
import { useSettle } from './splitScreens';

const KIND: Record<DebtData['kind'], string> = { split: 'Split', loan: 'Loan', payment: 'Payment' };

/** A Debt's page (NR-Money-Debt): who owes whom and for what on a coloured amount card with the balance with that person, Settle up, the payment it came from, what else is open, its Fields. Built from the kit. */
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
  const reopen = () => {
    ctx.records.setStatus(debt.id, 'open');
    toast.show({ message: 'Open again', icon: 'repeat', undo: () => void ctx.records.setStatus(debt.id, 'settled') });
  };

  // The amount card wears lime when it comes to you, orange when you owe, grey once settled (NR-Money-Debt).
  const bg = settled ? t.c.bg.tile : theyOwe ? blocks.lime : blocks.orange;
  const ink = settled ? t.c.fg.primary : INK;
  const soft = settled ? t.c.fg.secondary : 'rgba(11,11,13,0.62)';
  const withThem = view.balance > 0 ? `${money(view.balance)} to you` : view.balance < 0 ? `you owe ${money(-view.balance)}` : 'all square';

  return (
    <View style={{ paddingHorizontal: t.layout.gutter, gap: 28 }}>
      {controls ? <RecordBar label="Debt" controls={controls} /> : null}

      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Disc name={view.name} colorKey={d.personId} size={56} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={2} accessibilityRole="header" style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.8 }}>{debtReason(debt)}</Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>{theyOwe ? `${view.name} owes you` : `You owe ${view.name}`}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill label={settled ? 'Settled' : 'Open'} lime={!settled} />
          <StatusPill label={KIND[d.kind] ?? 'Debt'} />
          {view.group ? <StatusPill label={view.group} /> : null}
        </View>
      </View>

      <View accessible accessibilityLabel={`Amount ${money(d.amount)}, ${format(day(d.date), 'EEE d MMM')}. Balance with ${first}: ${withThem}`} style={{ padding: 18, borderRadius: 32, backgroundColor: bg, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, color: ink }}>{settled ? 'WAS' : theyOwe ? 'COMES TO YOU' : 'YOU OWE'}</Text>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 48, lineHeight: 52, fontWeight: '700', letterSpacing: -2, color: ink, fontVariant: ['tabular-nums'] }}>{money(d.amount)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 2, paddingBottom: 4 }}>
            <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, color: soft }}>DATE</Text>
            <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: ink }}>{format(day(d.date), 'EEE d MMM')}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20, backgroundColor: settled ? t.c.bg.tileRaised : INK }}>
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '600', color: '#F5F5F7' }}>{`Balance with ${first}`}</Text>
          <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', fontVariant: ['tabular-nums'], color: view.balance > 0 ? blocks.lime : view.balance < 0 ? t.c.alert.coralText : t.c.fg.secondary }}>{withThem}</Text>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        {view.balance !== 0 ? (
          <>
            <Button title={`Settle up all ${money(Math.abs(view.balance))}`} icon="check" onPress={settle} block />
            <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>{`Settles everything open with ${first} · Undo after`}</Text>
          </>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button title={`${first}’s page`} icon="user" variant="secondary" size="sm" onPress={() => router.push(`/entity/person/${d.personId}` as never)} block /></View>
          <View style={{ flex: 1 }}><Button title="Edit" icon="edit" variant="secondary" size="sm" onPress={() => controls?.edit()} block /></View>
        </View>
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
        <View style={{ gap: 4 }}>
          <SectionHead title={`Also open with ${first}`} sub={String(view.others.length)} />
          {view.others.map((x, i) => (
            <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`${debtReason(x)}, ${format(day(x.data.date), 'EEE d MMM')}, ${money(x.data.amount)}`} onPress={() => router.push(`/entity/debt/${x.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, borderTopWidth: i ? 1 : 0, borderColor: t.c.line, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ width: 48, alignItems: 'center' }}>
                <Text color="secondary" style={{ fontSize: 10, lineHeight: 13, fontWeight: '700', letterSpacing: 0.8 }}>{format(day(x.data.date), 'EEE').toUpperCase()}</Text>
                <Text style={{ fontSize: 20, lineHeight: 24, fontWeight: '700' }}>{format(day(x.data.date), 'd')}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="rowTitle" numberOfLines={1}>{debtReason(x)}</Text>
                <Text variant="caption" color="secondary" numberOfLines={1}>{[KIND[x.data.kind], x.data.direction === 'they_owe' ? `${first} owes you` : `you owe ${first}`].join(' · ')}</Text>
              </View>
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'], color: x.data.direction === 'they_owe' ? t.c.accent.gold : t.c.alert.coralText }}>{money(x.data.amount)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHead title="Fields" />
        <View style={{ paddingVertical: 4, paddingHorizontal: 16, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
          <FieldRow label="Person"><FieldValue>{view.name}</FieldValue></FieldRow>
          <Hairline />
          <FieldRow label="Who owes"><FieldValue>{theyOwe ? `${first} owes you` : `You owe ${first}`}</FieldValue></FieldRow>
          <Hairline />
          <FieldRow label="For"><FieldValue>{debtReason(debt)}</FieldValue></FieldRow>
          <Hairline />
          <FieldRow label="Kind"><FieldValue>{KIND[d.kind] ?? 'Debt'}</FieldValue></FieldRow>
          {view.group ? (<><Hairline /><FieldRow label="Group"><FieldValue>{view.group}</FieldValue></FieldRow></>) : null}
        </View>
      </View>

      {settled ? (
        <View style={{ gap: 10, paddingTop: 14, borderTopWidth: 1, borderColor: t.c.line }}>
          <Text color="secondary" style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9 }}>ONCE SETTLED</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 16, paddingRight: 10, borderRadius: 999, backgroundColor: t.c.bg.tile }}>
            <StatusPill label={`Settled · ${format(new Date(debt.updatedAt), 'EEE d MMM')}`} />
            <View style={{ flex: 1 }} />
            <Button title="Reopen" icon="repeat" variant="secondary" size="sm" onPress={reopen} />
          </View>
        </View>
      ) : null}

      <RecordExtras entity={debt} module="finance" />

      {say}
    </View>
  );
}

const INK = '#0B0B0D';
