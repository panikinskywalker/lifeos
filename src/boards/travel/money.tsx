import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { askWithPhoto } from '@core/brain';
import { owedOf, splitProblem, type Party, type SplitMethod } from '@core/money/split';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, EmptyState, Icon, Screen, Segmented, Sheet, Text, TextField, useToast } from '@ui/kit';
import { BILL_CATEGORIES, makeBill, makePayment, parseReceipt, receiptQuestion, receiptShares, type BillData, type ReceiptRead } from '@modules/finance';
import { billInrOf, byCategory, CATEGORY_LABEL, journeysTable, notInSettleUp, projectedOf, rateFor, tripBalances, tripBills, tripLedger, tripParties, type TripData } from '@modules/travel';
import { datesLabel, Note, Row, RowCard, SectionHead } from './parts';
import { amount } from './bookings';

/**
 * Money on a trip (the trip template, R7g slice 4; JP-Money, JP-Settle,
 * JP-AddExpense, JP-Receipt, JP-Payback): Budget (whose money, the three
 * levels against the cap, the daily allowance and the rate, where it goes, the
 * journeys) and Settle up (your balance, who owes whom, the group's balances,
 * expenses and paybacks, bookings not in Settle up yet), with Log a spend,
 * Split a receipt photo and Record a payback. Bills are finance's, Splitwise's way.
 */

export const moneyRoute = (tripId: string, tab?: 'budget' | 'settle') => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'money', trip: tripId, ...(tab ? { tab } : {}) } });
export const billRoute = (id: string) => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'bill', bill: id } });
const LIME = '#D7F55C';
const CORAL = '#FF6B7A';
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const inr = (n: number) => amount(Math.round(n), 'INR');

/** Names for parties: You, or a Person's first name. */
export function useNames(trip: ObjectRecord<TripData> | null) {
  return useLive((os) => {
    const m: Record<string, string> = { me: 'You' };
    for (const id of trip?.data.personIds ?? []) m[id] = (os.records.get(id)?.title ?? 'Someone').split(/\s+/)[0]!;
    return m;
  }, [trip?.id, trip?.version]);
}

function Chips<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {options.map((o) => (
        <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: o.value === value }} onPress={() => onChange(o.value)} style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: o.value === value ? '#F5F5F7' : t.c.bg.tileRaised }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: o.value === value ? '#0B0B0D' : t.c.fg.secondary }}>{o.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function MoneyScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const [tab, setTab] = useState<'budget' | 'settle'>(params.tab === 'settle' ? 'settle' : 'budget');
  const [sheet, setSheet] = useState<null | 'spend' | 'payback' | 'receipt'>(null);
  const [payback, setPayback] = useState<{ from: Party; to: Party; amount: number } | null>(null);
  const trip = useLive((os) => {
    const x = os.records.get<TripData>(params.trip ?? '');
    return x?.object === 'trip' ? x : null;
  }, [params.trip]);
  const names = useNames(trip);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/travel/index' as never));
  if (!trip) {
    return (
      <Screen title="Money" onBack={back}>
        <EmptyState icon="wallet" tint="travel" line="That trip isn’t here any more." />
      </Screen>
    );
  }
  return (
    <Screen title="Money" subtitle={trip.title} onBack={back} contentStyle={{ gap: 14 }}>
      <Segmented options={[{ value: 'budget', label: 'Budget' }, { value: 'settle', label: 'Settle up' }]} value={tab} onChange={setTab} />
      {tab === 'budget' ? <Budget trip={trip} ctx={ctx} names={names} /> : <Settle trip={trip} ctx={ctx} names={names} onPayback={(p) => { setPayback(p); setSheet('payback'); }} onReceipt={() => setSheet('receipt')} />}
      <Button title="Log a spend" icon="plus" onPress={() => setSheet('spend')} />
      <SpendSheet visible={sheet === 'spend'} onClose={() => setSheet(null)} trip={trip} ctx={ctx} names={names} />
      <PaybackSheet visible={sheet === 'payback'} onClose={() => setSheet(null)} trip={trip} ctx={ctx} names={names} preset={payback} />
      <ReceiptSheet visible={sheet === 'receipt'} onClose={() => setSheet(null)} trip={trip} ctx={ctx} names={names} />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Budget                                                               */
/* ------------------------------------------------------------------ */

function Budget({ trip, ctx, names }: { trip: ObjectRecord<TripData>; ctx: LifeOSContext; names: Record<string, string> }) {
  const t = useTheme();
  const toast = useToast();
  const parties = tripParties(trip);
  const [scope, setScope] = useState<string>('me');
  const [open, setOpen] = useState<string | null>(null);
  const [rateText, setRateText] = useState<string | null>(null);
  const items = useLive((os) => tripLedger(os, os.records.get<TripData>(trip.id) ?? trip), [trip.id, trip.version]);
  const journeys = useLive((os) => journeysTable(os, trip), [trip.id, trip.version]);
  const who = scope === 'all' ? undefined : scope;
  const p = projectedOf(items, who);
  const cap = (trip.data.budget ?? 0) * (who ? 1 : parties.length);
  const cats = byCategory(items, who);
  const w = (v: number) => (p.total ? Math.max(0, v) / Math.max(p.total, cap || p.total) : 0);
  const saveRate = () => {
    const r = Number(rateText);
    if (!(r > 0)) return setRateText(null);
    const prev = { fxRate: trip.data.fxRate, fxDate: trip.data.fxDate };
    ctx.records.update<TripData>(trip.id, { data: { fxRate: r, fxDate: today() } }, 'user');
    toast.show({ message: 'Rate changed', icon: 'check', undo: () => void ctx.records.update<TripData>(trip.id, { data: prev }, 'user') });
    setRateText(null);
  };
  return (
    <View style={{ gap: 14 }}>
      <Chips options={[{ value: 'all', label: 'Everyone' }, ...parties.map((x) => ({ value: x, label: names[x] ?? 'Someone' }))]} value={scope} onChange={setScope} />
      <View style={{ padding: 16, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text variant="labelCaps" color="secondary">PROJECTED · {(who ? names[who] : 'EVERYONE')?.toUpperCase()}</Text>
          <View style={{ flex: 1 }} />
          {cap ? <Text style={{ fontSize: 12, fontWeight: '600', color: p.total > cap ? CORAL : LIME }}>{p.total > cap ? 'over budget' : 'on budget'}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ fontSize: 34, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{inr(p.total)}</Text>
          {cap ? <Text style={{ fontSize: 13, fontWeight: '600', color: t.c.fg.secondary }}>of {inr(cap)}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', backgroundColor: t.c.bg.tileRaised }}>
          <View style={{ flex: w(p.paid), backgroundColor: LIME }} />
          <View style={{ flex: w(p.booked), backgroundColor: '#F6E27F' }} />
          <View style={{ flex: w(p.estimate), backgroundColor: '#8C9DFF' }} />
          <View style={{ flex: Math.max(0, 1 - w(p.paid) - w(p.booked) - w(p.estimate)) }} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {([['PAID', p.paid, LIME], ['BOOKED', p.booked, '#F6E27F'], ['ESTIMATES', p.estimate, '#8C9DFF']] as const).map(([l, v, c]) => (
            <View key={l} style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: c }}>{l}</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(v)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[['CAP', trip.data.budget ? inr(trip.data.budget) : 'not set', 'per person'], ['A DAY', trip.data.dailyAllowance ? amount(trip.data.dailyAllowance, trip.data.localCurrency ?? 'INR') : 'not set', 'daily allowance'], ['LEFT', trip.data.budget ? inr(trip.data.budget - projectedOf(items, 'me').total) : '–', 'about, yours']].map(([l, v, s]) => (
          <View key={l} style={{ flex: 1, padding: 12, borderRadius: 20, backgroundColor: t.c.bg.tile, gap: 2 }}>
            <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: t.c.fg.tertiary }}>{l}</Text>
            <Text style={{ fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] }} numberOfLines={1}>{v}</Text>
            <Text style={{ fontSize: 11, color: t.c.fg.secondary }}>{s}</Text>
          </View>
        ))}
      </View>

      {trip.data.localCurrency && trip.data.localCurrency !== 'INR' ? (
        rateText == null ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Edit the rate" onPress={() => setRateText(String(trip.data.fxRate ?? ''))} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
            <Text style={{ fontSize: 13, fontWeight: '600' }}>{trip.data.fxRate ? `${amount(1, trip.data.localCurrency)} = ₹${trip.data.fxRate.toFixed(4)}` : 'No rate yet'}</Text>
            <Text style={{ fontSize: 13, fontWeight: '600', color: LIME }}>Edit rate</Text>
          </Pressable>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
            <View style={{ flex: 1 }}><TextField label={`₹ for one ${trip.data.localCurrency}`} value={rateText} onChange={setRateText} keyboardType="decimal-pad" /></View>
            <Button title="Save" size="sm" onPress={saveRate} />
          </View>
        )
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHead title="Where the money goes" sub={who ? `${names[who]} · projected` : 'everyone · projected'} />
        <RowCard>
          {cats.map((c) => (
            <View key={c.cat}>
              <Row title={CATEGORY_LABEL[c.cat] ?? c.cat} sub={`${Math.round((c.inr / (p.total || 1)) * 100)}% · ${c.items.length} ${c.items.length === 1 ? 'line' : 'lines'}`} trailing={<Text style={{ fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(c.inr)}</Text>} onPress={() => setOpen(open === c.cat ? null : c.cat)} />
              {open === c.cat ? c.items.map((it, i) => <Row key={i} minHeight={40} title={it.label} sub={it.level === 'paid' ? 'paid' : it.level === 'booked' ? 'to pay' : 'estimate'} trailing={<Text style={{ fontSize: 13, color: t.c.fg.secondary }}>{inr(who ? it.per[who] ?? 0 : it.inr)}</Text>} />) : null}
            </View>
          ))}
          {!cats.length ? <Text variant="caption" color="secondary" style={{ paddingVertical: 10 }}>Nothing yet: bookings, spends and the daily allowance add up here.</Text> : null}
        </RowCard>
      </View>

      {journeys.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Journeys" sub={`${journeys.length} · cost each`} />
          <RowCard>
            {journeys.map((j) => <Row key={j.id} minHeight={44} title={j.title} sub={[datesLabel({ startDate: j.day }), j.takes].filter(Boolean).join(' · ')} trailing={<Text style={{ fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{j.fare != null ? `${j.estimate ? '≈' : ''}${amount(j.fare, j.currency)}` : '–'}</Text>} />)}
          </RowCard>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Settle up                                                            */
/* ------------------------------------------------------------------ */

function Settle({ trip, ctx, names, onPayback, onReceipt }: { trip: ObjectRecord<TripData>; ctx: LifeOSContext; names: Record<string, string>; onPayback: (p: { from: Party; to: Party; amount: number }) => void; onReceipt: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const t = useTheme();
  const d = useLive((os) => {
    const tr = os.records.get<TripData>(trip.id) ?? trip;
    const group = tr.data.groupId ? os.records.get<{ simplifyDebts?: boolean }>(tr.data.groupId) : null;
    return { b: tripBalances(os, tr), bills: tripBills(os, tr.id), pending: notInSettleUp(os, tr), group };
  }, [trip.id, trip.version]);
  const n = (p: Party) => names[p] ?? 'Someone';
  const mine = d.b.net.me ?? 0;
  const myDebts = d.b.debts.filter((x) => x.from === 'me' || x.to === 'me');
  const addPending = (x: (typeof d.pending)[number]) => {
    const payer = x.e.data.paidBy ?? 'me';
    const who = x.e.data.kind === 'ticket' ? ((x.e.data.personIds ?? []).length ? x.e.data.personIds! : ['me']) : ['me', ...(x.e.data.personIds ?? [])];
    const bill = makeBill(ctx, x.e.title.replace(/^(Stay|Ticket) · /, ''), { amount: x.amount, currency: x.currency, rate: rateFor(trip, x.currency) ?? undefined, date: today(), category: x.e.data.kind === 'ticket' ? 'flights' : 'stays', split: { payers: { [payer]: x.amount }, method: 'equal', shares: Object.fromEntries(who.map((p) => [p, 1])) }, tripId: trip.id, groupId: trip.data.groupId, eventId: x.e.id });
    toast.show({ message: 'Added to Settle up', icon: 'check', undo: () => ctx.records.delete(bill.id, 'user') });
  };
  return (
    <View style={{ gap: 14 }}>
      <View style={{ padding: 16, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 10 }}>
        <Text variant="labelCaps" color="secondary">{mine < -0.5 ? 'YOU OWE' : mine > 0.5 ? 'YOU’RE OWED' : 'ALL SETTLED UP'}</Text>
        <Text style={{ fontSize: 34, fontWeight: '700', letterSpacing: -1, color: mine < -0.5 ? CORAL : mine > 0.5 ? LIME : t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{inr(Math.abs(mine))}</Text>
        {myDebts.map((x) => (
          <Row key={`${x.from}-${x.to}`} minHeight={40} title={x.from === 'me' ? `You owe ${n(x.to)}` : `${n(x.from)} owes you`} trailing={<Button title={x.from === 'me' ? 'Pay' : 'Record'} size="sm" variant="secondary" onPress={() => onPayback({ from: x.from, to: x.to, amount: x.amount })} />} sub={inr(x.amount)} />
        ))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {[['You paid for', d.b.paid.me], ['Your share', d.b.share.me], ['Payments made', d.b.sent.me], ['Received', d.b.received.me]].map(([l, v]) => (
            <View key={l as string} style={{ width: '46%', gap: 2 }}>
              <Text style={{ fontSize: 11, color: t.c.fg.secondary }}>{l as string}</Text>
              <Text style={{ fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr((v as number) ?? 0)}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Split a receipt" icon="camera" variant="secondary" size="sm" onPress={onReceipt} style={{ flex: 1 }} />
        <Button title="Record a payback" icon="transfer" variant="secondary" size="sm" onPress={() => onPayback({ from: myDebts[0]?.from ?? 'me', to: myDebts[0]?.to ?? tripParties(trip)[1] ?? 'me', amount: myDebts[0]?.amount ?? 0 })} style={{ flex: 1 }} />
      </View>

      <View style={{ gap: 10 }}>
        <SectionHead
          title="Who owes whom"
          sub={d.b.debts.length ? (d.group?.data.simplifyDebts ? 'simplified · the fewest payments' : 'pair by pair') : 'nobody owes anyone'}
          action={trip.data.groupId ? (d.group?.data.simplifyDebts ? 'Pair by pair' : 'Simplify') : undefined}
          onAction={() => trip.data.groupId && ctx.records.update(trip.data.groupId, { data: { simplifyDebts: !d.group?.data.simplifyDebts } }, 'user')}
        />
        {d.b.debts.length ? <RowCard>{d.b.debts.map((x) => <Row key={`${x.from}-${x.to}`} minHeight={44} title={`${n(x.from)} → ${n(x.to)}`} trailing={<Text style={{ fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{inr(x.amount)}</Text>} onPress={() => onPayback({ from: x.from, to: x.to, amount: x.amount })} />)}</RowCard> : null}
        <RowCard>
          {tripParties(trip).map((p) => {
            const v = d.b.net[p] ?? 0;
            return <Row key={p} minHeight={44} title={n(p)} sub={`paid for ${inr(d.b.paid[p] ?? 0)} · share ${inr(d.b.share[p] ?? 0)}`} trailing={<Text style={{ fontSize: 15, fontWeight: '700', color: v > 0.5 ? LIME : v < -0.5 ? CORAL : t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{v > 0.5 ? '+' : v < -0.5 ? '−' : ''}{inr(Math.abs(v))}</Text>} />;
          })}
        </RowCard>
      </View>

      {d.pending.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Not in Settle up yet" sub="paid on a booking, not logged as a spend" />
          <RowCard>
            {d.pending.map((x) => <Row key={x.e.id} title={x.e.title.replace(/^(Stay|Ticket) · /, '')} sub={`${amount(x.amount, x.currency)} paid`} trailing={<Button title="Add" size="sm" variant="secondary" onPress={() => addPending(x)} />} />)}
          </RowCard>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHead title="Expenses and payments" sub={`${d.bills.filter((b) => b.data.kind === 'spend').length} expenses · ${d.bills.filter((b) => b.data.kind === 'payment').length} payments`} />
        <RowCard>
          {d.bills.map((b) => (
            <Row key={b.id} title={b.title} sub={`${datesLabel({ startDate: b.data.date })} · ${b.data.kind === 'payment' ? 'payback' : (BILL_CATEGORIES.find((c) => c.value === b.data.category)?.label ?? 'spend')}`} trailing={<Text style={{ fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{amount(b.data.amount, b.data.currency)}</Text>} onPress={() => router.push(billRoute(b.id) as never)} />
          ))}
          {!d.bills.length ? <Text variant="caption" color="secondary" style={{ paddingVertical: 10 }}>No spends yet. Log one, or split a receipt photo.</Text> : null}
        </RowCard>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Log a spend                                                          */
/* ------------------------------------------------------------------ */

const METHODS: Array<{ value: SplitMethod; label: string }> = [
  { value: 'equal', label: 'Equally' },
  { value: 'exact', label: 'Exact' },
  { value: 'shares', label: 'Shares' },
  { value: 'percent', label: '%' },
  { value: 'adjust', label: 'Adjust' },
];

export function SpendSheet({ visible, onClose, trip, ctx, names, edit }: { visible: boolean; onClose: () => void; trip: ObjectRecord<TripData>; ctx: LifeOSContext; names: Record<string, string>; edit?: ObjectRecord<BillData> | null }) {
  const toast = useToast();
  const t = useTheme();
  const parties = tripParties(trip);
  const local = trip.data.localCurrency ?? 'INR';
  const [what, setWhat] = useState(edit?.title ?? '');
  const [amt, setAmt] = useState(edit ? String(edit.data.amount) : '');
  const [cur, setCur] = useState(edit?.data.currency ?? local);
  const [cat, setCat] = useState(edit?.data.category ?? 'food');
  const [payer, setPayer] = useState<Party>(edit ? Object.keys(edit.data.split.payers)[0] ?? 'me' : 'me');
  const [method, setMethod] = useState<SplitMethod>(edit?.data.split.method ?? 'equal');
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(parties.map((p) => [p, edit ? String(edit.data.split.shares[p] ?? '') : '1'])));
  const [error, setError] = useState<string | null>(null);
  const n = Number(amt) || 0;
  const rate = rateFor(trip, cur);
  const shares = useMemo(() => Object.fromEntries(parties.map((p) => [p, method === 'equal' ? (Number(vals[p]) > 0 ? 1 : 0) : Number(vals[p]) || 0])), [parties, method, vals]);
  const owed = n ? owedOf(n, { method, shares }) : {};
  const save = () => {
    const spec = { payers: { [payer]: n }, method, shares };
    if (!what.trim()) return setError('Say what it was.');
    if (!(n > 0)) return setError('Enter an amount.');
    const problem = splitProblem(n, spec);
    if (problem) return setError(problem);
    const input = { amount: n, currency: cur, rate: rate ?? undefined, date: edit?.data.date ?? today(), category: cat, split: spec, tripId: trip.id, groupId: trip.data.groupId };
    if (edit) {
      const prev = { title: edit.title, data: edit.data };
      ctx.records.update<BillData>(edit.id, { title: what.trim(), data: { ...input, inr: rate ? n * rate : undefined } }, 'user');
      toast.show({ message: 'Saved', icon: 'check', undo: () => void ctx.records.update<BillData>(edit.id, prev, 'user') });
    } else {
      const b = makeBill(ctx, what, input);
      toast.show({ message: `${what.trim()} saved to Settle up`, icon: 'check', undo: () => ctx.records.delete(b.id, 'user') });
      setWhat('');
      setAmt('');
    }
    setError(null);
    onClose();
  };
  const toggle = (p: string) => setVals((v) => ({ ...v, [p]: Number(v[p]) > 0 ? '0' : '1' }));
  return (
    <Sheet visible={visible} onClose={onClose} title={edit ? 'Edit the spend' : 'Log a spend'}>
      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><TextField label="Amount" value={amt} onChange={setAmt} keyboardType="decimal-pad" placeholder="3630" /></View>
          {local !== 'INR' ? <View style={{ paddingBottom: 6 }}><Chips options={[{ value: local, label: local }, { value: 'INR', label: 'INR' }]} value={cur} onChange={setCur} /></View> : null}
        </View>
        {n && cur !== 'INR' && rate ? <Text variant="caption" color="secondary">≈ {inr(n * rate)}{parties.length > 1 ? ` · ${inr((n * rate) / parties.length)} each if equal` : ''}</Text> : null}
        <TextField label="What" value={what} onChange={setWhat} placeholder="Dinner at Magome Chaya" />
        <Chips options={BILL_CATEGORIES.filter((c) => c.value !== 'flights')} value={cat} onChange={setCat} />
        <Text variant="labelCaps" color="secondary">PAID BY</Text>
        <Chips options={parties.map((p) => ({ value: p, label: names[p] ?? 'Someone' }))} value={payer} onChange={setPayer} />
        <Text variant="labelCaps" color="secondary">SPLIT</Text>
        <Segmented options={METHODS} value={method} onChange={setMethod} />
        <View style={{ gap: 6 }}>
          {parties.map((p) => (
            <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
              {method === 'equal' ? (
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: Number(vals[p]) > 0 }} onPress={() => toggle(p)} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: LIME, backgroundColor: Number(vals[p]) > 0 ? LIME : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {Number(vals[p]) > 0 ? <Icon name="check" size={14} color="#0B0B0D" /> : null}
                </Pressable>
              ) : (
                <View style={{ width: 90 }}><TextField value={vals[p] ?? ''} onChange={(v) => setVals((x) => ({ ...x, [p]: v }))} keyboardType="decimal-pad" placeholder={method === 'percent' ? '%' : method === 'adjust' ? '+/−' : '0'} /></View>
              )}
              <Text style={{ flex: 1, fontSize: 15, fontWeight: '600' }}>{names[p]}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{owed[p] != null ? amount(owed[p]!, cur) : ''}</Text>
            </View>
          ))}
        </View>
        {error ? <Text style={{ color: CORAL }}>{error}</Text> : null}
        <Button title={edit ? 'Save' : 'Save to Settle up'} icon="check" onPress={save} />
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Record a payback                                                     */
/* ------------------------------------------------------------------ */

function PaybackSheet({ visible, onClose, trip, ctx, names, preset }: { visible: boolean; onClose: () => void; trip: ObjectRecord<TripData>; ctx: LifeOSContext; names: Record<string, string>; preset: { from: Party; to: Party; amount: number } | null }) {
  const toast = useToast();
  const parties = tripParties(trip);
  const [from, setFrom] = useState<Party>(preset?.from ?? 'me');
  const [to, setTo] = useState<Party>(preset?.to ?? parties[1] ?? 'me');
  const [amt, setAmt] = useState(preset?.amount ? String(Math.round(preset.amount)) : '');
  const [error, setError] = useState<string | null>(null);
  const key = preset ? `${preset.from}-${preset.to}-${preset.amount}` : '';
  const [seen, setSeen] = useState(key);
  if (key !== seen) {
    setSeen(key);
    if (preset) {
      setFrom(preset.from);
      setTo(preset.to);
      setAmt(String(Math.round(preset.amount)));
    }
  }
  const save = () => {
    const n = Number(amt);
    if (from === to) return setError('Pick two different people.');
    if (!(n > 0)) return setError('Enter an amount.');
    const b = makePayment(ctx, from, to, n, { date: today(), tripId: trip.id, groupId: trip.data.groupId, name: (p) => names[p] ?? 'Someone' });
    toast.show({ message: `${names[from]} paid ${names[to]} ${inr(n)} · logged, not sent`, icon: 'check', undo: () => ctx.records.delete(b.id, 'user') });
    setError(null);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Record a payback">
      <View style={{ gap: 12 }}>
        <Text variant="labelCaps" color="secondary">WHO PAID</Text>
        <Chips options={parties.map((p) => ({ value: p, label: names[p] ?? 'Someone' }))} value={from} onChange={setFrom} />
        <Text variant="labelCaps" color="secondary">WHO GOT IT</Text>
        <Chips options={parties.map((p) => ({ value: p, label: names[p] ?? 'Someone' }))} value={to} onChange={setTo} />
        <TextField label="Amount, ₹" value={amt} onChange={setAmt} keyboardType="decimal-pad" />
        <Note icon="info">Paid outside the app (UPI, cash). LifeOS only records it; nothing is sent.</Note>
        {error ? <Text style={{ color: CORAL }}>{error}</Text> : null}
        <Button title="Record it" icon="check" onPress={save} />
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Split a receipt photo                                                */
/* ------------------------------------------------------------------ */

const MAX_BASE64 = 4_500_000;

function ReceiptSheet({ visible, onClose, trip, ctx, names }: { visible: boolean; onClose: () => void; trip: ObjectRecord<TripData>; ctx: LifeOSContext; names: Record<string, string> }) {
  const toast = useToast();
  const t = useTheme();
  const parties = tripParties(trip);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<ReceiptRead | null>(null);
  const [who, setWho] = useState<string[][]>([]);
  const [payer, setPayer] = useState<Party>('me');
  const pick = async (camera: boolean) => {
    setError(null);
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setError('LifeOS needs the camera or your photos for this.');
    const r = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5, base64: true, exif: false }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true, exif: false });
    const a = r.canceled ? null : r.assets[0];
    if (!a?.base64) return;
    if (a.base64.length > MAX_BASE64) return setError('That photo is too big to send. Try again a little further back.');
    setBusy(true);
    try {
      const model = (await ctx.device?.brain?.model()) ?? null;
      const res = await askWithPhoto(ctx, model, { ...receiptQuestion(parties.map((p) => names[p] ?? 'Someone')), image: { mediaType: a.mimeType === 'image/png' ? 'image/png' : 'image/jpeg', data: a.base64 } });
      if (!res.ok) return setError(res.note === 'no key' || res.note === 'off' ? 'Reading a receipt needs the brain on, with a key (You › Agent).' : res.note === 'over budget' ? 'Over today’s brain budget; try tomorrow or raise it in You › Agent.' : 'Couldn’t read that receipt.');
      const rr = parseReceipt(res.answer);
      if (!rr) return setError('That doesn’t look like a receipt.');
      setRead(rr);
      setWho(rr.items.map(() => []));
    } finally {
      setBusy(false);
    }
  };
  const tap = (i: number, p: string) => setWho((w) => w.map((x, k) => (k !== i ? x : x.includes(p) ? x.filter((y) => y !== p) : [...x, p])));
  const shares = read ? receiptShares(read.items, who, parties) : {};
  const save = () => {
    if (!read) return;
    const total = read.items.reduce((s, i) => s + i.price, 0);
    const rate = rateFor(trip, read.currency);
    const notes = read.items.map((it, i) => `${it.name}${it.en ? ` (${it.en})` : ''}${it.qty > 1 ? ` ×${it.qty}` : ''} · ${amount(it.price, read.currency)} · ${(who[i]?.length ? who[i]! : parties).map((p) => names[p]).join(', ')}`).join('\n');
    const b = makeBill(ctx, read.shop ?? 'A receipt', { amount: total, currency: read.currency, rate: rate ?? undefined, date: today(), category: 'food', split: { payers: { [payer]: total }, method: 'exact', shares }, tripId: trip.id, groupId: trip.data.groupId, notes });
    toast.show({ message: `${Object.keys(shares).length} shares saved to Settle up`, icon: 'check', undo: () => ctx.records.delete(b.id, 'user') });
    setRead(null);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Split a receipt">
      <View style={{ gap: 12 }}>
        {!read ? (
          <>
            <Note icon="camera">The photo goes to Claude only because you pressed this, and isn’t kept there. Its lines come back for you to assign.</Note>
            {busy ? <ActivityIndicator /> : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title="Take a photo" icon="camera" onPress={() => pick(true)} style={{ flex: 1 }} />
                <Button title="From photos" icon="image" variant="secondary" onPress={() => pick(false)} style={{ flex: 1 }} />
              </View>
            )}
          </>
        ) : (
          <>
            <Text variant="labelCaps" color="secondary">{read.shop ?? 'THE RECEIPT'} · {read.items.length} ITEMS · {amount(read.items.reduce((s, i) => s + i.price, 0), read.currency)}</Text>
            <Text variant="caption" color="secondary">Tap who had each line; a line nobody tapped is shared by all.</Text>
            {read.items.map((it, i) => (
              <View key={i} style={{ gap: 6, paddingVertical: 6 }}>
                <View style={{ flexDirection: 'row' }}>
                  <Text style={{ flex: 1, fontSize: 15, fontWeight: '600' }}>{it.name}{it.qty > 1 ? ` ×${it.qty}` : ''}</Text>
                  <Text style={{ fontSize: 15, fontWeight: '700' }}>{amount(it.price, read.currency)}</Text>
                </View>
                {it.en ? <Text variant="caption" color="secondary">{it.en}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {parties.map((p) => {
                    const on = who[i]?.includes(p);
                    return (
                      <Pressable key={p} accessibilityRole="checkbox" accessibilityState={{ checked: !!on }} onPress={() => tap(i, p)} style={{ height: 32, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? LIME : t.c.bg.tileRaised }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: on ? '#0B0B0D' : t.c.fg.secondary }}>{names[p]}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
            <Text variant="labelCaps" color="secondary">PAID BY</Text>
            <Chips options={parties.map((p) => ({ value: p, label: names[p] ?? 'Someone' }))} value={payer} onChange={setPayer} />
            <RowCard>{parties.map((p) => <Row key={p} minHeight={40} title={names[p] ?? 'Someone'} trailing={<Text style={{ fontWeight: '700' }}>{amount(shares[p] ?? 0, read.currency)}</Text>} />)}</RowCard>
            <Button title={`Save · ${Object.keys(shares).length} shares to Settle up`} icon="check" onPress={save} />
          </>
        )}
        {error ? <Text style={{ color: CORAL }}>{error}</Text> : null}
      </View>
    </Sheet>
  );
}

export { billInrOf };
