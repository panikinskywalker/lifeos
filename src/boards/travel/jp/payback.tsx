import React, { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { Party } from '@core/money/split';
import { useLive } from '@ui/hooks';
import { useToast } from '@ui/kit';
import { makePayment, type BillData } from '@modules/finance';
import { billInrOf, rateFor, tripBalances, tripBills, tripParties, type TripData } from '@modules/travel';
import { Anim, bgImage, MONO } from './kit';
import { C, money, TripScreen, tripRoutes, useShow, goTrip } from './shell';
import { dayMonth, F, Face, faceColor, Ic, Label, LimePill, Tag, today, useNames, useTrip } from '../money';

/**
 * Pay back, drawn to JP-Payback: who pays whom how much (from Settle up's
 * debts, or picked here), your balance before and after, what it leaves for
 * the one paid, how it was paid (outside the app), swipe to record it as a
 * payback Bill (makePayment) with Undo; the earlier paybacks below.
 */

const METHODS = ['UPI', 'Cash', 'Bank transfer', 'Card'];
const methodOf = (b: ObjectRecord<BillData>) => /^Paid by (.+?)(,|$)/.exec(b.data.notes ?? '')?.[1] ?? 'payback';

export function PaybackScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const trip = useTrip(params.trip);
  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.mid, fontSize: 15, fontFamily: F.s }}>That trip isn’t here any more.</Text>
      </View>
    );
  }
  return <Payback ctx={ctx} trip={trip} params={params} back={() => (router.canGoBack() ? router.back() : goTrip(router, tripRoutes.money(trip.id, 'settle')))} />;
}

function Payback({ ctx, trip, params, back }: { ctx: LifeOSContext; trip: ObjectRecord<TripData>; params: Record<string, string>; back: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const show = useShow(trip);
  const names = useNames(trip);
  const parties = tripParties(trip);
  const d = useLive((os) => {
    const t = os.records.get<TripData>(trip.id) ?? trip;
    return { b: tripBalances(os, t), paybacks: (tripBills(os, t.id) as ObjectRecord<BillData>[]).filter((x) => x.data.kind === 'payment') };
  }, [trip.id, trip.version]);
  const first = useMemo(() => {
    if (params.from && params.to && parties.includes(params.from) && parties.includes(params.to)) return { from: params.from, to: params.to, amount: Number(params.amount) || 0 };
    const mine = d.b.debts.find((x) => x.from === 'me') ?? d.b.debts[0];
    return mine ? { from: mine.from, to: mine.to, amount: Math.round(mine.amount) } : { from: 'me', to: parties[1] ?? 'me', amount: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [from, setFrom] = useState<Party>(first.from);
  const [to, setTo] = useState<Party>(first.to);
  const [text, setText] = useState(first.amount ? String(Math.round(first.amount)) : '');
  const local = trip.data.localCurrency && trip.data.localCurrency !== 'INR' ? trip.data.localCurrency : null;
  const [cur, setCur] = useState('INR');
  const [method, setMethod] = useState(0);
  const n = (p: Party) => names[p] ?? 'Someone';
  const amount = Number(text.replace(/[^\d.]/g, '')) || 0;
  const rate = rateFor(trip, cur) ?? 0;
  const inr = cur === 'INR' ? amount : amount * rate;
  const before = d.b.net[from] ?? 0;
  const after = before + inr;
  const toAfter = (d.b.net[to] ?? 0) - inr;
  const owedTo = d.b.debts.filter((x) => x.to === to && x.from !== from).map((x) => n(x.from));
  const owesTotal = d.b.debts.filter((x) => x.from === from).reduce((a, x) => a + x.amount, 0);
  const debtTo = d.b.debts.filter((x) => x.from === from && x.to === to).reduce((a, x) => a + x.amount, 0);
  const left = owesTotal - debtTo + Math.max(0, debtTo - inr);
  const settles = owesTotal > 0.5 && inr > 0 && left < 1;
  const meFrom = from === 'me';
  const word = (v: number) => (Math.abs(v) < 1 ? `${show(0)} · settled` : `${v > 0 ? '+' : ''}${show(v)}`);
  const record = () => {
    if (from === to) return toast.show({ message: 'Pick two different people', icon: 'info' });
    if (!(amount > 0)) return toast.show({ message: 'Type the amount first', icon: 'info' });
    const b = makePayment(ctx, from, to, amount, { date: today(), tripId: trip.id, groupId: trip.data.groupId, name: n, currency: cur, rate: cur === 'INR' ? undefined : rate || undefined, notes: `Paid by ${METHODS[method]}, outside the app` });
    toast.show({ message: `${n(from)} paid ${n(to)} ${show(inr)} · logged, not sent`, icon: 'check', undo: () => ctx.records.delete(b.id, 'user') });
    back();
  };
  const fmt = (s: string) => {
    const [i, f] = s.replace(/[^\d.]/g, '').split('.');
    return i ? `${Number(i).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US')}${f != null ? `.${f}` : ''}` : '';
  };
  return (
    <TripScreen tripId={trip.id} active="money">
      <Anim k="jr" delay={50} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={{ justifyContent: 'center', alignItems: 'center', width: 44, height: 44, backgroundColor: C.raised, borderRadius: 22 }}>
          <Ic n="left" size={18} />
        </Pressable>
        <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
          <Text style={{ color: C.mid, fontSize: 10, letterSpacing: 2, fontFamily: MONO }}>SETTLE UP</Text>
          <Text numberOfLines={1} style={{ color: C.white, fontSize: 20, lineHeight: 24, fontFamily: F.b }}>{meFrom ? `Pay back ${n(to)}` : `${n(from)} pays ${n(to) === 'You' ? 'you' : n(to)}`}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Paid to ${n(to)}; tap to change`} onPress={() => setTo(parties.filter((p) => p !== from)[(parties.filter((p) => p !== from).indexOf(to) + 1) % Math.max(1, parties.length - 1)] ?? to)}>
          <Face name={n(to)} color={faceColor(parties, to)} size={40} font={14} />
        </Pressable>
      </Anim>

      <Anim k="jr" delay={110}>
        <View style={[bgImage('linear-gradient(135deg,#3D5218 0%,#26330F 55%,#151A0B 100%)'), { gap: 22, padding: 16, borderRadius: 26, overflow: 'hidden' }]}>
          <View style={{ bottom: -26, left: -6, position: 'absolute' }}>
            <Text numberOfLines={1} style={{ color: 'rgba(215,245,92,0.08)', fontSize: 96, letterSpacing: -4, fontFamily: F.x }}>{(trip.data.destination || trip.title).toUpperCase()}</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <LimePill h={26}>{`${trip.data.destination || trip.title} · settle up`}</LimePill>
            <View style={[bgImage('linear-gradient(135deg,#E8E2C8,#B8B090)'), { width: 34, height: 26, borderRadius: 6, boxShadow: 'inset 0 0 0 1px rgba(11,11,13,0.2)' }]} />
          </View>
          <View>
            <Anim k="jroll">
              <Text style={{ color: C.white, fontSize: 38, lineHeight: 42, letterSpacing: -1.4, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{show(before)}</Text>
            </Anim>
            <Text style={{ color: C.mid, fontSize: 12, fontFamily: F.s }}>{meFrom ? 'your balance before this payback' : `${n(from)}’s balance before this payback`}</Text>
          </View>
        </View>
      </Anim>

      <Anim k="jr" delay={170}>
        <View style={{ gap: 6, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.raised, borderRadius: 22 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`From ${n(from)}; tap to change`} onPress={() => setFrom(parties[(parties.indexOf(from) + 1) % parties.length]!)}>
            <Label>{meFrom ? 'YOU SEND' : `${n(from).toUpperCase()} SENDS`}</Label>
          </Pressable>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TextInput value={fmt(text)} onChangeText={setText} keyboardType="decimal-pad" placeholder="0" placeholderTextColor="rgba(245,245,247,0.3)" accessibilityLabel="Amount" style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, color: C.white, fontSize: 30, letterSpacing: -0.8, fontVariant: ['tabular-nums'], fontFamily: F.b, padding: 0 }} />
            <Pressable accessibilityRole="button" accessibilityLabel={`In ${cur}; tap to change`} disabled={!local} onPress={() => setCur(cur === 'INR' && local ? local : 'INR')} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 11, backgroundColor: C.raised, borderRadius: 999 }}>
              {local ? <Ic n="down" size={13} color={C.mid} /> : null}
              <Text style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: F.s }}>{cur}</Text>
            </Pressable>
          </View>
        </View>
      </Anim>

      <Anim k="jr" delay={230} style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: -16 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Swap who pays" onPress={() => { setFrom(to); setTo(from); }} style={{ justifyContent: 'center', alignItems: 'center', width: 46, height: 46, backgroundColor: C.lime, borderWidth: 4, borderColor: C.tile, borderRadius: 23 }}>
          <Ic n="swap" size={16} color={C.ink} />
        </Pressable>
      </Anim>

      <Anim k="jr" delay={290}>
        <View style={[bgImage('linear-gradient(160deg,#2E3A14 0%,#26262B 80%)'), { alignItems: 'center', gap: 4, padding: 16, borderRadius: 22 }]}>
          <Label>{`${n(to).toUpperCase()} ${to === 'me' ? 'GET' : 'GETS'}`}</Label>
          <Anim k="jroll">
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: C.white, fontSize: 40, lineHeight: 44, letterSpacing: -1.4, fontVariant: ['tabular-nums'], fontFamily: F.x }}>{cur === 'INR' ? show(inr) : `${money(amount, cur)}`}</Text>
          </Anim>
          <View style={{ alignSelf: 'stretch', gap: 6, paddingTop: 12, marginTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
            {[
              [meFrom ? 'Your balance after' : `${n(from)} after`, word(after)],
              [to === 'me' ? 'Your balance after' : `${n(to)} after`, `${word(toAfter)}${toAfter > 0.5 && owedTo.length ? `, from ${owedTo.join(' and ')}` : ''}`],
              ['Method', `${METHODS[method]}, outside the app`],
            ].map(([l, v], i) => (
              <Pressable key={l} disabled={i !== 2} accessibilityRole={i === 2 ? 'button' : undefined} accessibilityLabel={i === 2 ? `Paid by ${METHODS[method]}; tap to change` : undefined} onPress={() => setMethod((method + 1) % METHODS.length)} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: C.mid, fontSize: 13, fontFamily: F.r }}>{l}</Text>
                <Text numberOfLines={1} style={{ flexShrink: 1, color: C.white, fontSize: 13, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{v}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Anim>

      <Anim k="jr" delay={350} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {settles ? <LimePill icon="check" h={28}>{meFrom ? 'Settles everything you owe' : `Settles what ${n(from)} owes`}</LimePill> : owesTotal > 0.5 && inr > 0 ? <LimePill h={28} color={C.coral}>{`Leaves ${show(left)} to pay`}</LimePill> : null}
        <View style={{ justifyContent: 'center', height: 28, paddingHorizontal: 11, backgroundColor: C.raised, borderRadius: 999 }}>
          <Text style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: F.s }}>Logged, not sent</Text>
        </View>
      </Anim>

      <Anim k="jr" delay={410}>
        <Swipe label={`Swipe to record ${cur === 'INR' ? show(inr) : money(amount, cur)}`} onDone={record} />
      </Anim>

      {d.paybacks.length ? (
        <Anim k="jr" delay={470} style={{ gap: 8 }}>
          <Label>EARLIER PAYBACKS</Label>
          {d.paybacks.map((b) => (
            <Pressable key={b.id} accessibilityRole="button" onPress={() => router.push(tripRoutes.bill(b.id))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: C.raised, borderRadius: 20, opacity: pressed ? 0.85 : 1 })}>
              <View style={{ justifyContent: 'center', alignItems: 'center', width: 36, height: 36, borderWidth: 1.5, borderColor: 'rgba(245,245,247,0.2)', borderRadius: 18, transform: [{ rotate: '-45deg' }] }}>
                <Ic n="left" size={15} color={C.lime} />
              </View>
              <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: C.white, fontSize: 14, fontFamily: F.b }}>{b.title}</Text>
                <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: F.r }}>{`${dayMonth(b.data.date)} · ${methodOf(b)}`}</Text>
              </View>
              <Text numberOfLines={1} style={{ color: C.lime, fontSize: 14, lineHeight: 21, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{show(billInrOf(b.data, trip))}</Text>
            </Pressable>
          ))}
        </Anim>
      ) : (
        <Anim k="jr" delay={470} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Label>EARLIER PAYBACKS</Label>
          <Tag>None yet</Tag>
        </Anim>
      )}
    </TripScreen>
  );
}

/** Swipe the knob to the end to record; let go early and it springs back. */
function Swipe({ label, onDone }: { label: string; onDone: () => void }) {
  const x = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(350);
  const max = Math.max(1, w - 64);
  const done = useRef(onDone);
  done.current = onDone;
  const maxRef = useRef(max);
  maxRef.current = max;
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4,
        onPanResponderMove: (_, g) => x.setValue(Math.max(0, Math.min(maxRef.current, g.dx))),
        onPanResponderRelease: (_, g) => {
          if (g.dx > maxRef.current * 0.7) {
            Animated.timing(x, { toValue: maxRef.current, duration: 120, useNativeDriver: false }).start(() => {
              done.current();
              x.setValue(0);
            });
          } else Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () => Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(),
      }),
    [x],
  );
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityActions={[{ name: 'activate' }, { name: 'increment' }]} onAccessibilityAction={() => done.current()} style={{ flexDirection: 'row', alignItems: 'center', height: 64, backgroundColor: C.raised, borderWidth: 1, borderColor: C.line, borderRadius: 32 }}>
      <View style={{ flexGrow: 1, paddingLeft: 54 }}>
        <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, textAlign: 'center', fontFamily: F.b }}>{label}</Text>
      </View>
      <View style={{ flexDirection: 'row', marginRight: 18 }}>
        {[0.25, 0.45, 0.65].map((o) => (
          <View key={o} style={{ opacity: o }}>
            <Ic n="right" size={14} />
          </View>
        ))}
      </View>
      <Animated.View {...pan.panHandlers} style={{ position: 'absolute', left: 6, width: 52, height: 52, transform: [{ translateX: x }] }}>
        <Anim k="jnudge" style={{ justifyContent: 'center', alignItems: 'center', width: 52, height: 52, backgroundColor: C.lime, borderRadius: 26, boxShadow: '0 0 18px rgba(215,245,92,0.35)' }}>
          <Ic n="right" size={20} color={C.ink} />
        </Anim>
      </Animated.View>
    </View>
  );
}
