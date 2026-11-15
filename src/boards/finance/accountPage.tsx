import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, NumberField, Sheet, Text, TrackColumns, useToast } from '@ui/kit';
import { accountBalance, accountFlows, setBalance } from '@modules/finance/lib';
import type { AccountData, TransactionData } from '@modules/finance/types';
import { FieldRow, FieldValue, Hairline, IconDisc, KIND_WORD, Metric, Quick, RecordBar, RecordExtras, Rows, SectionHead, StatusPill, TxRow, accountIcon, day, kindWord, relDay, shortMoney } from './parts';

/** An Account's page (docs/MODEL.md, Money pages with no artboard): who it is, three numbers, add or move money, money out by month, its payments, its Fields. Built from the kit. */
export function AccountPage({ entity, ctx, controls, say }: { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: React.ReactNode }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const t = useTheme();
  const router = useRouter();
  const a = entity as ObjectRecord<AccountData>;
  const d = a.data;
  const money = (n: number) => `${n < 0 ? '−' : ''}${ctx.format.currency(Math.abs(n), d.currency)}`;
  const balance = useLive((o) => accountBalance(o, a), [a.id, a.version]);
  const flows = useLive((o) => accountFlows(o, a.id, 6), [a.id, a.version]);
  const txns = useLive((o) => o.records.query<TransactionData>('transaction', { filter: { or: [{ field: 'data.accountId', op: 'eq', value: a.id }, { field: 'data.toAccountId', op: 'eq', value: a.id }] }, sort: [{ field: 'data.date', dir: 'desc' }, { field: 'createdAt', dir: 'desc' }] }, { limit: 10 }), [a.id]);
  const institution = useLive((o) => (d.institutionId ? (o.records.ref(d.institutionId)?.title ?? null) : (d.institution ?? null)), [d.institutionId, d.institution]);

  const now = flows[flows.length - 1];
  const today = format(new Date(), 'yyyy-MM-dd');
  const card = d.kind === 'credit';
  const owed = Math.max(0, -balance);
  const st = card ? d.statement : undefined;
  const late = !!st && st.dueOn < today;
  const monthName = format(new Date(), 'MMM').toUpperCase();
  const addTx = (kind: string) => router.push({ pathname: '/entity/[type]/new', params: { type: 'transaction', accountId: a.id, kind } } as never);
  // Set balance (docs/MODEL.md, Balances follow the bank): what the bank shows becomes the start; Undo puts the old one back.
  const toast = useToast();
  const [ask, setAsk] = useState(false);
  const [typed, setTyped] = useState<number | undefined>(undefined);
  const saveBalance = () => {
    if (typed == null) return;
    // A card's figure is what you owe: its balance is that, below zero.
    const before = setBalance(ctx, a.id, card ? -Math.abs(typed) : typed);
    setAsk(false);
    setTyped(undefined);
    toast.show({ message: card ? `Owed set to ${money(Math.abs(typed))}` : `Balance set to ${money(typed)}`, icon: 'check', undo: () => void ctx.records.update(a.id, { data: before }, 'user') });
  };

  return (
    <View style={{ paddingHorizontal: t.layout.gutter, gap: 24 }}>
      {controls ? <RecordBar label="Account" controls={controls} /> : null}

      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <IconDisc icon={accountIcon(d.kind)} size={56} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={2} accessibilityRole="header" style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.8 }}>{a.title}</Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>{[institution ?? KIND_WORD[d.kind], d.last4 ? `··${d.last4}` : null].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <StatusPill label={KIND_WORD[d.kind]} lime />
          <StatusPill label={d.includeInNetWorth === false ? 'Not in net worth' : 'In net worth'} />
          {d.currency && d.currency !== 'INR' ? <StatusPill label={d.currency} /> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 14, paddingVertical: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.c.line }}>
          {card ? (
            <>
              <Metric label="OWED" value={money(owed)} line={balance > 0 ? `${money(balance)} in credit` : typeof d.knownBalance === 'number' && d.knownOn ? `bank said, ${format(day(d.knownOn), 'd MMM')}` : 'from its spends'} />
              <Metric label="BILL" value={st ? money(st.total) : '-'} line={st ? `${late ? 'was due' : 'due'} ${format(day(st.dueOn), 'EEE d MMM')}` : 'no statement yet'} color={late ? t.c.alert.coralText : undefined} />
              <Metric label="LIMIT USED" value={d.creditLimit ? `${Math.round((owed / d.creditLimit) * 100)}%` : '-'} line={d.creditLimit ? `of ${shortMoney(ctx, d.creditLimit)}` : 'no limit set'} />
            </>
          ) : (
            <>
              <Metric label="BALANCE" value={money(balance)} line={typeof d.knownBalance === 'number' && d.knownOn ? `bank said, ${format(day(d.knownOn), 'd MMM')}` : 'from opening balance'} color={balance < 0 ? t.c.alert.coralText : undefined} grow={1.7} />
              <Metric label={`IN · ${monthName}`} value={shortMoney(ctx, now?.in ?? 0)} />
              <Metric label={`OUT · ${monthName}`} value={shortMoney(ctx, now?.out ?? 0)} />
            </>
          )}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Quick label="Add" icon="plus" onPress={() => addTx('expense')} />
        <Quick label="Transfer" icon="arrow.up.arrow.down" onPress={() => addTx('transfer')} />
        <Quick label={card ? 'Set owed' : 'Set balance'} icon="check" onPress={() => setAsk(true)} />
        <Quick label="Edit" icon="edit" onPress={() => controls?.edit()} />
      </View>
      <Sheet visible={ask} onClose={() => setAsk(false)} title={card ? 'What does the card app say you owe?' : 'What does the bank show?'} footer={<Button title={card ? 'Set owed' : 'Set balance'} onPress={saveBalance} disabled={typed == null} />}>
        <View style={{ gap: 10 }}>
          <NumberField label={card ? 'Owed now' : 'Balance now'} unit="₹" value={typed} onChange={setTyped} autoFocus />
          <Text variant="caption" color="secondary">This becomes the figure from now on; only payments after it are added. The app shows {card ? money(owed) : money(balance)}.</Text>
        </View>
      </Sheet>

      {flows.some((f) => f.out > 0) ? (
        <TrackColumns label="Money out" period="last 6 months" value={shortMoney(ctx, now?.out ?? 0)} values={flows.map((f) => f.out)} labels={flows.map((f) => f.label)} today={flows.length - 1} axis={(n) => shortMoney(ctx, n)} />
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHead title="Payments" sub={txns.length ? `latest ${txns.length}` : null} action="Add" lime onAction={() => addTx('expense')} />
        {txns.length ? (
          <Rows>
            {txns.map((x) => (
              <TxRow key={x.id} tx={x} line={[x.data.toAccountId === a.id && x.data.kind === 'transfer' ? 'Transfer in' : kindWord(x.data), relDay(x.data.date)].join(' · ')} />
            ))}
          </Rows>
        ) : (
          <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>No payments on this account yet. Bank texts that name its last digits land here.</Text>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <SectionHead title="Fields" />
        <View style={{ paddingVertical: 6, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          <FieldRow label="Type"><FieldValue>{KIND_WORD[d.kind]}</FieldValue></FieldRow>
          {institution ? (<><Hairline /><FieldRow label="Bank or issuer"><FieldValue>{institution}</FieldValue></FieldRow></>) : null}
          {d.last4 ? (<><Hairline /><FieldRow label="Last 4 digits"><FieldValue>{d.last4}</FieldValue></FieldRow></>) : null}
          <Hairline />
          <FieldRow label="Opening balance"><FieldValue>{money(d.openingBalance ?? 0)}</FieldValue></FieldRow>
          {card && d.creditLimit ? (<><Hairline /><FieldRow label="Credit limit"><FieldValue>{money(d.creditLimit)}</FieldValue></FieldRow></>) : null}
          <Hairline />
          <FieldRow label="In net worth"><FieldValue>{d.includeInNetWorth === false ? 'No' : 'Yes'}</FieldValue></FieldRow>
        </View>
      </View>

      <RecordExtras entity={a} module="finance" />

      {say}
    </View>
  );
}
