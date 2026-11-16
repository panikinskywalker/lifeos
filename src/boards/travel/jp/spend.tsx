import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { owedOf, splitProblem, type Party, type SplitSpec } from '@core/money/split';
import { useLive } from '@ui/hooks';
import { useToast } from '@ui/kit';
import { BILL_CATEGORIES, makeBill, type BillData } from '@modules/finance';
import { rateFor, tripParties, type TripData } from '@modules/travel';
import { Anim } from './kit';
import { C, money, symOf, TripHeader, tripRoutes } from './shell';
import { CAT_ICON, F, Face, faceColor, Ic, Label, Seg, today, useNames, useTrip } from '../money';

/**
 * Log a spend, drawn to JP-AddExpense: a sheet over Money with the amount
 * typed on its own keypad (its ₹ value live), the category, who paid, how it
 * splits (equal, shares, exact, just you) with each share as a face, what it
 * was; saved to Settle up as finance's Bill, with Undo. With `bill` it edits
 * that Bill; `amount` starts it at an amount; `split=exact` starts on Exact.
 */

/** The sheet over the trip's Money page that Log a spend and Split a receipt are drawn as. */
export function SheetFrame({ trip, title, onClose, right, children }: { trip: ObjectRecord<TripData>; title: string; onClose: () => void; right?: React.ReactNode; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.ink, overflow: 'hidden' }}>
      <View pointerEvents="none" style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, opacity: 0.5 }}>
        <TripHeader trip={trip} label="Money" />
      </View>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.62)' }} />
      <Anim k="jr" style={{ position: 'absolute', top: insets.top + 40, right: 0, bottom: 0, left: 0, backgroundColor: C.tile, borderTopLeftRadius: 32, borderTopRightRadius: 32, boxShadow: '0 -16px 40px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingTop: 10, paddingHorizontal: 20, paddingBottom: 28 + insets.bottom }}>
          <View style={{ alignSelf: 'center', width: 36, height: 5, backgroundColor: 'rgba(245,245,247,0.25)', borderRadius: 3 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ justifyContent: 'center', alignItems: 'center', width: 40, height: 40, backgroundColor: C.raised, borderRadius: 20 }}>
              <Ic n="x" size={16} />
            </Pressable>
            <Text style={{ color: C.white, fontSize: 17, textAlign: 'center', fontFamily: F.b, flexGrow: 1, flexShrink: 1 }}>{title}</Text>
            {right ?? <View style={{ width: 40 }} />}
          </View>
          {children}
        </ScrollView>
      </Anim>
    </View>
  );
}

/** ₹ / local, inside a sheet: which currency the amount is in. */
export function CurSwitch({ local, value, onChange }: { local: string; value: string; onChange: (c: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', padding: 3, backgroundColor: C.raised, borderRadius: 999 }}>
      {['INR', local].map((c) => (
        <Pressable key={c} accessibilityRole="button" accessibilityLabel={`In ${c}`} accessibilityState={{ selected: value === c }} onPress={() => onChange(c)} style={{ justifyContent: 'center', alignItems: 'center', width: 30, height: 30, backgroundColor: value === c ? C.white : 'transparent', borderRadius: 15 }}>
          <Text style={{ color: value === c ? C.ink : C.mid, fontSize: 13, fontFamily: F.b }}>{symOf(c).trim()}</Text>
        </Pressable>
      ))}
    </View>
  );
}

type Method = 'equal' | 'shares' | 'exact' | 'me';
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

/** "3630.5" shown as 3,630.5 (en-IN grouping for ₹). */
const grouped = (s: string, cur: string) => {
  if (!s) return '0';
  const [i, f] = s.split('.');
  const n = Number(i || '0').toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US');
  return f != null ? `${n}.${f}` : n;
};
const typed = (s: string, k: string) => {
  if (k === 'del') return s.slice(0, -1);
  if (k === '.') return s.includes('.') ? s : `${s || '0'}.`;
  if (/\.\d\d$/.test(s) || s.replace('.', '').length >= 9) return s;
  return s === '0' ? k : s + k;
};

export function SpendScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const edit = useLive((os) => {
    const b = params.bill ? os.records.get<BillData>(params.bill) : null;
    return b?.object === 'bill' ? b : null;
  }, [params.bill]);
  const trip = useTrip(params.trip ?? edit?.data.tripId);
  const close = () => (router.canGoBack() ? router.back() : trip ? router.replace(tripRoutes.money(trip.id, 'settle')) : router.replace(tripRoutes.travel));
  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.mid, fontSize: 15, fontFamily: F.s }}>That trip isn’t here any more.</Text>
      </View>
    );
  }
  return <SpendForm key={edit?.id ?? 'new'} ctx={ctx} trip={trip} edit={edit} params={params} close={close} />;
}

function SpendForm({ ctx, trip, edit, params, close }: { ctx: LifeOSContext; trip: ObjectRecord<TripData>; edit: ObjectRecord<BillData> | null; params: Record<string, string>; close: () => void }) {
  const toast = useToast();
  const names = useNames(trip);
  const parties = tripParties(trip);
  const local = trip.data.localCurrency ?? 'INR';
  const startMethod = (): Method => {
    if (!edit) return params.split === 'exact' ? 'exact' : 'equal';
    const s = edit.data.split;
    const live = Object.entries(s.shares).filter(([, v]) => Number(v) > 0).map(([p]) => p);
    if (s.method === 'equal') return live.length === 1 && live[0] === 'me' ? 'me' : 'equal';
    if (s.method === 'shares') return 'shares';
    return 'exact';
  };
  const editOwed = edit ? owedOf(edit.data.amount, edit.data.split) : {};
  const [amt, setAmt] = useState(edit ? String(edit.data.amount) : params.amount && Number(params.amount) > 0 ? String(Number(params.amount)) : '');
  const [cur, setCur] = useState(edit?.data.currency ?? local);
  const [cat, setCat] = useState(edit?.data.category ?? 'food');
  const [payer, setPayer] = useState<Party>(edit ? Object.keys(edit.data.split.payers)[0] ?? 'me' : 'me');
  const [method, setMethod] = useState<Method>(startMethod);
  const [inc, setInc] = useState<Record<Party, boolean>>(() => Object.fromEntries(parties.map((p) => [p, edit ? Number(edit.data.split.shares[p] ?? 0) > 0 : true])));
  const [counts, setCounts] = useState<Record<Party, number>>(() => Object.fromEntries(parties.map((p) => [p, edit?.data.split.method === 'shares' ? Number(edit.data.split.shares[p] ?? 0) : 1])));
  const [exact, setExact] = useState<Record<Party, string>>(() => Object.fromEntries(parties.map((p) => [p, edit && editOwed[p] ? String(editOwed[p]) : ''])));
  const [focus, setFocus] = useState<'total' | Party>('total');
  const [what, setWhat] = useState(edit?.title ?? '');
  const [error, setError] = useState<string | null>(null);
  const n = Number(amt) || 0;
  const rate = rateFor(trip, cur);
  const spec: SplitSpec = useMemo(() => {
    const payers = { [payer]: n };
    if (method === 'me') return { payers, method: 'equal', shares: { me: 1 } };
    if (method === 'shares') return { payers, method: 'shares', shares: Object.fromEntries(parties.map((p) => [p, counts[p] ?? 0])) };
    if (method === 'exact') return { payers, method: 'exact', shares: Object.fromEntries(parties.map((p) => [p, Number(exact[p]) || 0])) };
    return { payers, method: 'equal', shares: Object.fromEntries(parties.map((p) => [p, inc[p] ? 1 : 0])) };
  }, [payer, n, method, parties, counts, exact, inc]);
  const owed = n ? owedOf(n, spec) : {};
  const press = (k: string) => {
    setError(null);
    if (focus === 'total' || method !== 'exact') setAmt((s) => typed(s, k));
    else setExact((x) => ({ ...x, [focus]: typed(x[focus] ?? '', k) }));
  };
  const inrOf = (v: number) => (cur === 'INR' ? v : rate ? v * rate : null);
  const tot = inrOf(n);
  const people = Object.values(owed).filter((v) => v > 0.005).length;
  const liveLine = !n
    ? cur !== 'INR' && rate ? `${symOf(cur).trim()}1 = ₹${rate.toFixed(4)}` : 'Type the amount'
    : [cur !== 'INR' ? (tot != null ? `≈ ${money(tot)}` : 'no rate for this currency yet') : null, tot != null && people > 1 && method === 'equal' ? `${money(tot / people)} each` : tot != null && owed.me ? `your share ${money(inrOf(owed.me)!)}` : null].filter(Boolean).join(' · ');
  const tap = (p: Party) => {
    setError(null);
    if (method === 'equal') setInc((x) => ({ ...x, [p]: !x[p] }));
    else if (method === 'shares') setCounts((x) => ({ ...x, [p]: ((x[p] ?? 0) + 1) % 6 }));
    else if (method === 'exact') setFocus(focus === p ? 'total' : p);
  };
  const save = () => {
    const title = what.trim() || BILL_CATEGORIES.find((c) => c.value === cat)?.label || 'Spend';
    if (!(n > 0)) return setError('Type the amount.');
    const problem = splitProblem(n, spec);
    if (problem) return setError(problem);
    const input = { amount: n, currency: cur, rate: rate ?? undefined, date: edit?.data.date ?? today(), category: cat, split: spec, tripId: trip.id, groupId: trip.data.groupId };
    if (edit) {
      const prev = { title: edit.title, data: edit.data };
      ctx.records.update<BillData>(edit.id, { title, data: { ...input, inr: rate ? Math.round(n * rate * 100) / 100 : undefined } }, 'user');
      toast.show({ message: 'Saved', icon: 'check', undo: () => void ctx.records.update<BillData>(edit.id, prev, 'user') });
    } else {
      const b = makeBill(ctx, title, input);
      toast.show({ message: `${title} saved to Settle up`, icon: 'check', undo: () => ctx.records.delete(b.id, 'user') });
    }
    close();
  };
  const cats = BILL_CATEGORIES.filter((c) => c.value !== 'flights' || cat === 'flights');
  const tiles = method === 'me' ? ['me'] : parties;
  return (
    <SheetFrame trip={trip} title={edit ? 'Edit the spend' : 'Log a spend'} onClose={close} right={local !== 'INR' ? <CurSwitch local={local} value={cur} onChange={setCur} /> : undefined}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Amount ${money(n, cur)}`} onPress={() => setFocus('total')} style={{ alignItems: 'center', gap: 2, paddingVertical: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text style={{ color: C.mid, fontSize: 24, fontFamily: F.b }}>{symOf(cur).trim()}</Text>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1, color: amt ? C.white : 'rgba(245,245,247,0.3)', fontSize: 52, lineHeight: 56, letterSpacing: -2, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{grouped(amt, cur)}</Text>
          {focus === 'total' ? <Anim k="jblink" style={{ width: 2, height: 40, backgroundColor: C.lime }} /> : null}
        </View>
        <Text style={{ color: C.mid, fontSize: 13, fontVariant: ['tabular-nums'], fontFamily: F.s }}>{liveLine}</Text>
      </Pressable>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20 }}>
        {cats.map((c) => {
          const on = c.value === cat;
          const icon = c.value === 'other' ? null : CAT_ICON[c.value];
          return (
            <Pressable key={c.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setCat(c.value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: 16, backgroundColor: on ? C.white : C.raised, borderRadius: 999 }}>
              {icon ? <Ic n={icon} size={15} color={on ? C.ink : C.white} /> : null}
              <Text style={{ color: on ? C.ink : C.white, fontSize: 14, lineHeight: 18, fontFamily: F.s }}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ gap: 6 }}>
        <Label>PAID BY</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {parties.map((p) => {
            const on = p === payer;
            return (
              <Pressable key={p} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Paid by ${names[p]}`} onPress={() => setPayer(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 4, paddingRight: 12, backgroundColor: on ? C.white : C.raised, borderRadius: 18 }}>
                <Face name={names[p] ?? '?'} color={faceColor(parties, p)} size={28} font={10} />
                <Text style={{ color: on ? C.ink : C.white, fontSize: 13, fontFamily: F.s }}>{names[p] ?? 'Someone'}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {parties.length > 1 ? (
        <Seg options={[{ value: 'equal', label: 'Equal' }, { value: 'shares', label: 'Shares' }, { value: 'exact', label: 'Exact' }, { value: 'me', label: 'Just me' }]} value={method} onChange={(m) => { setMethod(m); setFocus('total'); setError(null); }} bg={C.raised} />
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {tiles.map((p) => {
          const off = method === 'equal' ? !inc[p] : method === 'shares' ? !counts[p] : false;
          const focused = method === 'exact' && focus === p;
          const v = method === 'exact' ? (exact[p] ? `${symOf(cur).trim()}${grouped(exact[p]!, cur)}` : '–') : money(owed[p] ?? 0, cur);
          return (
            <Pressable key={p} accessibilityRole="button" accessibilityState={{ selected: !off }} accessibilityLabel={`${names[p]} ${v}`} disabled={method === 'me'} onPress={() => tap(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: C.raised, borderRadius: 16, borderWidth: 1.5, borderColor: focused ? C.lime : 'transparent', flexGrow: 1, flexShrink: 1, flexBasis: tiles.length > 3 ? '30%' : 0, minWidth: 0, opacity: off ? 0.45 : 1 }}>
              <Face name={names[p] ?? '?'} color={faceColor(parties, p)} size={26} font={9} />
              <View style={{ minWidth: 0, flexShrink: 1 }}>
                <Text numberOfLines={1} style={{ color: C.white, fontSize: 12, fontFamily: F.s }}>{names[p] ?? 'Someone'}{method === 'shares' ? ` ×${counts[p] ?? 0}` : ''}</Text>
                <Text numberOfLines={1} style={{ color: C.white, fontSize: 13, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{v}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 18, backgroundColor: C.tile, borderWidth: 1, borderColor: C.line, borderRadius: 999 }}>
        <Ic n="file" size={18} color="rgba(245,245,247,0.42)" />
        <TextInput value={what} onChangeText={setWhat} placeholder="What was it?" placeholderTextColor="rgba(245,245,247,0.42)" accessibilityLabel="What was it" style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, color: C.white, fontSize: 16, fontFamily: F.m, padding: 0 }} />
      </View>

      <View style={{ gap: 6 }}>
        {[0, 1, 2, 3].map((r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 6 }}>
            {KEYS.slice(r * 3, r * 3 + 3).map((k) => (
              <Pressable key={k} accessibilityRole="button" accessibilityLabel={k === 'del' ? 'Delete a digit' : k === '.' ? 'Point' : k} onPress={() => press(k)} onLongPress={k === 'del' ? () => (focus === 'total' || method !== 'exact' ? setAmt('') : setExact((x) => ({ ...x, [focus]: '' }))) : undefined} style={({ pressed }) => ({ justifyContent: 'center', alignItems: 'center', height: 44, backgroundColor: k === 'del' ? (pressed ? C.raised : 'transparent') : pressed ? '#33333A' : C.raised, borderRadius: 14, flexGrow: 1, flexShrink: 1, flexBasis: 0 })}>
                {k === 'del' ? (
                  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
                    <Path d="m12 9 6 6" />
                    <Path d="m18 9-6 6" />
                  </Svg>
                ) : (
                  <Text style={{ color: C.white, fontSize: 20, fontVariant: ['tabular-nums'], fontFamily: F.s }}>{k}</Text>
                )}
              </Pressable>
            ))}
          </View>
        ))}
      </View>

      {error ? <Text style={{ color: C.coral, fontSize: 13, textAlign: 'center', fontFamily: F.s }}>{error}</Text> : null}
      <Pressable accessibilityRole="button" onPress={save} style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, height: 52, backgroundColor: C.lime, borderRadius: 999, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <Ic n="check" size={17} color={C.ink} />
        <Text style={{ color: C.ink, fontSize: 16, lineHeight: 20, fontFamily: F.s }}>{edit ? 'Save' : 'Save to Settle up'}</Text>
      </Pressable>
    </SheetFrame>
  );
}
