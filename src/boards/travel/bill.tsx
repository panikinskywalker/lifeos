// own-glyphs: this screen draws the trip template's inline icons (JP-Parts), not the kit's icon set.
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { owedOf, type Party } from '@core/money/split';
import { useLive } from '@ui/hooks';
import { useToast } from '@ui/kit';
import { billInr, type BillData } from '@modules/finance';
import { nightsOf, stopMark, tripParties, type StopData, type TripData } from '@modules/travel';
import { Anim, JP_SERIF, MONO } from './jp/kit';
import { C, isJapan, money, symOf, TripScreen, tripRoutes, useShow } from './jp/shell';
import { catLabel, CAT_ICON, dayMonth, F, Face, faceColor, Ic, Label, LimePill, today, useNames, weekdayDay } from './money';

/**
 * A Bill's page, drawn to JP-Bill: how one spend was split, Splitwise's way.
 * When and what, its amount and the ₹ value fixed when saved (change it to
 * what the card charged), who paid, the method and each person's share (with
 * the receipt's lines when it came from a photo), what it did to each balance,
 * the bank payment, receipt and booking it is linked to; edit, or delete with
 * Undo, and questions for the copilot. A payback gets the same page, simpler.
 */

const PINK = '#FF8A95';
const METHODS: Array<{ value: string; label: string }> = [
  { value: 'equal', label: 'Equally' },
  { value: 'exact', label: 'Exact' },
  { value: 'percent', label: '%' },
  { value: 'shares', label: 'Shares' },
  { value: 'adjust', label: 'Adjust' },
];

/** The receipt's lines, as Split a receipt keeps them in the notes: "name (en) ×2 · ¥1,350 · You, Asha". */
function receiptLines(notes: string | undefined): Array<{ name: string; local?: string; price: string; value: number; who: string[] }> {
  return (notes ?? '')
    .split('\n')
    .map((l) => l.split(' · '))
    .filter((x) => x.length === 3)
    .map(([raw, price, who]) => {
      const m = /^(.*?)(?: \((.*)\))?( ×\d+)?$/.exec(raw!.trim());
      const name = m?.[2] ? `${m[2]}${m[3] ?? ''}` : raw!.trim();
      return { name, local: m?.[2] ? m[1] : undefined, price: price!.trim(), value: Number(price!.replace(/[^\d.]/g, '')) || 0, who: who!.split(',').map((s) => s.trim()).filter(Boolean) };
    });
}

export function BillScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const d = useLive(
    (os) => {
      const b = os.records.get<BillData>(params.bill ?? '');
      if (b?.object !== 'bill') return null;
      const trip = b.data.tripId ? os.records.get<TripData>(b.data.tripId) : null;
      const t = trip?.object === 'trip' ? trip : null;
      const event = b.data.eventId ? os.records.get(b.data.eventId) : null;
      const txn = b.data.transactionId ? os.records.get(b.data.transactionId) : null;
      const night = t ? nightsOf(os, t).find((x) => x.day === b.data.date) : null;
      const stop = night?.stopId ? os.records.get<StopData>(night.stopId) : null;
      return { b, trip: t, event: event ?? null, txn: txn ?? null, stop: stop ?? null };
    },
    [params.bill],
  );
  const tripNames = useNames(d?.trip ?? null);
  const back = () => (router.canGoBack() ? router.back() : d?.trip ? router.replace(tripRoutes.money(d.trip.id, 'settle')) : router.replace(tripRoutes.travel));
  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', gap: 14, paddingTop: insets.top }}>
        <Text style={{ color: C.mid, fontSize: 15, fontFamily: F.s }}>That spend isn’t here any more.</Text>
        <Pressable accessibilityRole="button" onPress={back} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.raised, justifyContent: 'center' }}>
          <Text style={{ color: C.white, fontSize: 13, fontFamily: F.s }}>Back</Text>
        </Pressable>
      </View>
    );
  }
  return <Bill ctx={ctx} d={d} tripNames={tripNames} back={back} />;
}

function Bill({ ctx, d, tripNames, back }: { ctx: LifeOSContext; d: { b: ObjectRecord<BillData>; trip: ObjectRecord<TripData> | null; event: ObjectRecord | null; txn: ObjectRecord | null; stop: ObjectRecord<StopData> | null }; tripNames: Record<string, string>; back: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const show = useShow(d.trip);
  const [inrText, setInrText] = useState<string | null>(null);
  const { b, trip } = d;
  const parties = trip ? tripParties(trip) : ['me'];
  const n = (p: Party) => tripNames[p] ?? (p === 'me' ? 'You' : 'Someone');
  const cur = b.data.currency;
  const owed = owedOf(b.data.amount, b.data.split);
  const inr = billInr(b.data) || (trip && cur === trip.data.localCurrency && trip.data.fxRate ? b.data.amount * trip.data.fxRate : 0);
  const f = b.data.amount ? inr / b.data.amount : 0;
  const people = [...new Set([...Object.keys(b.data.split.payers), ...Object.keys(owed).filter((p) => (owed[p] ?? 0) > 0.005)])].sort((x, y) => parties.indexOf(x) - parties.indexOf(y));
  const payers = Object.entries(b.data.split.payers).filter(([, v]) => v > 0);
  const payer = payers[0]?.[0] ?? 'me';
  const payment = b.data.kind === 'payment';
  const lines = receiptLines(b.data.notes);
  const fromReceipt = !!b.data.receipt || lines.length > 0;
  const sum = Object.values(owed).reduce((a, v) => a + v, 0);
  const japan = trip ? isJapan(trip) : false;
  const color = (p: Party) => faceColor(parties, p);
  const del = () => {
    ctx.records.delete(b.id, 'user');
    back();
    toast.show({ message: payment ? 'Payback deleted' : 'Spend deleted', icon: 'trash', undo: () => void ctx.records.restore(b.id) });
  };
  const edit = () => trip && router.push({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'spend', trip: trip.id, bill: b.id } } as never);
  const equally = () => {
    if (b.data.split.method === 'equal') return;
    const prev = b.data;
    const who = Object.keys(owed).filter((p) => (owed[p] ?? 0) > 0.005);
    ctx.records.update<BillData>(b.id, { data: { split: { ...b.data.split, method: 'equal', shares: Object.fromEntries(who.map((p) => [p, 1])) } } }, 'user');
    toast.show({ message: `Split equally among ${who.length}`, icon: 'check', undo: () => void ctx.records.update<BillData>(b.id, { data: prev }, 'user') });
  };
  const saveInr = () => {
    const v = Number((inrText ?? '').replace(/[^\d.]/g, ''));
    if (v > 0 && Math.abs(v - inr) > 0.005) {
      const prev = { inr: b.data.inr };
      ctx.records.update<BillData>(b.id, { data: { inr: v } }, 'user');
      toast.show({ message: '₹ value changed', icon: 'check', undo: () => void ctx.records.update<BillData>(b.id, { data: prev }, 'user') });
    }
    setInrText(null);
  };
  const method = b.data.split.method;
  const live = Object.keys(owed).filter((p) => (owed[p] ?? 0) > 0.005);
  const totalShares = Object.values(b.data.split.shares).reduce((a, v) => a + (Number(v) || 0), 0);
  const how = method === 'equal' ? `Split equally among ${live.length}: ${money(b.data.amount / Math.max(1, live.length), cur)} each.` : method === 'exact' ? (lines.length ? `Exact amounts, from the receipt’s ${lines.length} ${lines.length === 1 ? 'item' : 'items'}: each line went to who had it.` : 'Exact amounts for each person.') : method === 'percent' ? 'By percent of the whole.' : method === 'shares' ? `By shares: ${totalShares} in all, ${money(b.data.amount / Math.max(1, totalShares), cur)} a share.` : 'Equal parts, with adjustments on top.';
  const detail = (p: Party): Array<[string, string]> => {
    if (lines.length) {
      return lines
        .filter((l) => l.who.includes(n(p)))
        .map((l) => [`${l.name}${l.local ? ` ${l.local}` : ''}${l.who.length === 2 ? ', half' : l.who.length > 2 ? ` 1 of ${l.who.length}` : ''}`, money(l.value / l.who.length, cur)] as [string, string]);
    }
    const s = Number(b.data.split.shares[p] ?? 0);
    if (method === 'shares') return [[`${s} ${s === 1 ? 'share' : 'shares'} of ${totalShares}`, '']];
    if (method === 'percent') return [[`${s}%`, '']];
    if (method === 'adjust' && s) return [[`${s > 0 ? '+' : ''}${money(s, cur)} adjusted`, '']];
    return [];
  };
  const head = payment ? 'A PAYBACK' : 'A SPEND';
  const mark = d.stop ? stopMark(d.stop, trip?.data.look) : null;
  const card = { gap: 10, padding: 16, backgroundColor: C.tile, borderRadius: 28 };
  const body = (
    <>
      <Anim k="jr" delay={110} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 4 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={back} style={{ justifyContent: 'center', alignItems: 'center', width: 44, height: 44, backgroundColor: C.raised, borderRadius: 22 }}>
          <Ic n="left" size={18} />
        </Pressable>
        <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
          <Text style={{ color: C.mid, fontSize: 10, letterSpacing: 2, fontFamily: MONO }}>{japan ? `割り勘 · ${head}` : head}</Text>
          <Text numberOfLines={1} style={{ color: C.white, fontSize: 20, lineHeight: 24, fontFamily: F.b }}>{b.title}</Text>
        </View>
        <View style={{ justifyContent: 'center', alignItems: 'center', width: 44, height: 44, borderWidth: 2, borderColor: '#C99A6E', borderRadius: 22 }}>
          {mark ? <Text style={{ color: '#C99A6E', fontSize: 18, lineHeight: 22, fontFamily: japan ? JP_SERIF : F.x, fontWeight: '800' }}>{mark}</Text> : <Ic n={payment ? 'repeat' : CAT_ICON[b.data.category ?? 'other'] ?? 'file'} size={18} color="#C99A6E" />}
        </View>
      </Anim>

      <Anim k="jr" delay={170}>
        <View style={card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Label>{[weekdayDay(b.data.date).toUpperCase(), payment ? 'PAYBACK' : catLabel(b.data.category).toUpperCase(), trip ? (trip.data.destination || trip.title).toUpperCase() : null].filter(Boolean).join(' · ')}</Label>
            <View style={{ flexGrow: 1 }} />
            {fromReceipt ? <LimePill h={26}>From a receipt</LimePill> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: C.white, fontSize: 34, letterSpacing: -1, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{money(b.data.amount, cur)}</Text>
            <View style={{ flexGrow: 1 }} />
            {cur !== 'INR' ? (
              inrText == null ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Change the ₹ value" onPress={() => setInrText(String(Math.round(inr)))}>
                  <Text style={{ color: C.white, fontSize: 15, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{money(inr)}</Text>
                </Pressable>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ color: C.mid, fontSize: 15, fontFamily: F.b }}>₹</Text>
                  <TextInput autoFocus value={inrText} onChangeText={setInrText} onSubmitEditing={saveInr} keyboardType="decimal-pad" accessibilityLabel="₹ value" style={{ width: 90, color: C.white, fontSize: 15, fontFamily: F.b, padding: 0, borderBottomWidth: 1.5, borderBottomColor: C.lime }} />
                  <Pressable accessibilityRole="button" onPress={saveInr} hitSlop={8}>
                    <Text style={{ color: C.lime, fontSize: 13, fontFamily: F.s }}>Save</Text>
                  </Pressable>
                </View>
              )
            ) : null}
          </View>
          {cur !== 'INR' ? (
            <Text style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: F.r }}>
              {f ? `₹ value fixed when saved, at ${symOf(cur).trim()}1 = ₹${(b.data.rate ?? f).toFixed(4)} on ${dayMonth(b.data.date)}. ` : 'No rate saved yet, so it counts at today’s trip rate. '}
              <Text onPress={() => setInrText(String(Math.round(inr)))} style={{ color: C.lime, fontFamily: F.s }}>Change it to what the card charged.</Text>
            </Text>
          ) : null}
        </View>
      </Anim>

      {payment ? (
        <Anim k="jr" delay={230}>
          <View style={card}>
            <Label>WHO PAID WHOM</Label>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Face name={n(payer)} color={color(payer)} size={36} font={15} />
              <Ic n="right" color={C.lime} />
              <Face name={n(Object.keys(owed)[0] ?? 'me')} color={color(Object.keys(owed)[0] ?? 'me')} size={36} font={15} />
              <Text style={{ flexGrow: 1, flexShrink: 1, color: C.mid, fontSize: 13, fontFamily: F.r }}>{`${n(payer)} paid ${n(Object.keys(owed)[0] ?? 'me')} outside the app${b.data.notes ? ` · ${b.data.notes.replace(/, outside the app$/, '')}` : ''}. It moves both balances; it is nobody’s spend.`}</Text>
            </View>
          </View>
        </Anim>
      ) : (
        <>
          <Anim k="jr" delay={230}>
            <View style={card}>
              <Label>PAID BY</Label>
              {payers.map(([p, v]) => (
                <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Face name={n(p)} color={color(p)} size={36} font={15} />
                  <View style={{ flexGrow: 1, flexShrink: 1 }}>
                    <Text style={{ color: C.white, fontSize: 16, fontFamily: F.s }}>{n(p)}</Text>
                    <Text style={{ color: C.mid, fontSize: 13, fontFamily: F.r }}>{payers.length === 1 ? 'one payer · several can share paying' : `${payers.length} paid together`}</Text>
                  </View>
                  <Text style={{ color: C.white, fontSize: 16, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{money(v, cur)}</Text>
                </View>
              ))}
            </View>
          </Anim>

          <Anim k="jr" delay={290}>
            <View style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Label>HOW IT SPLIT</Label>
                <View style={{ flexGrow: 1 }} />
                <Text style={{ color: Math.abs(sum - b.data.amount) < 0.01 ? C.lime : C.coral, fontSize: 12, fontFamily: F.s }}>{Math.abs(sum - b.data.amount) < 0.01 ? `adds up to ${money(b.data.amount, cur)}` : `off by ${money(Math.abs(sum - b.data.amount), cur)}`}</Text>
              </View>
              <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, backgroundColor: C.raised, borderRadius: 999 }}>
                {METHODS.map((m) => {
                  const on = m.value === method;
                  return (
                    <Pressable key={m.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityHint={on ? undefined : m.value === 'equal' ? 'Splits it equally now' : 'Opens the spend to change how it splits'} onPress={() => (on ? undefined : m.value === 'equal' ? equally() : edit())} style={{ justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 32, backgroundColor: on ? C.white : 'transparent', borderRadius: 999 }}>
                      <Text numberOfLines={1} style={{ color: on ? C.ink : C.mid, fontSize: 12, fontFamily: F.s }}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: F.r }}>{how}</Text>
              {people.filter((p) => (owed[p] ?? 0) > 0.005).map((p) => (
                <View key={p} style={{ gap: 6, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: C.raised, borderRadius: 20 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Face name={n(p)} color={color(p)} size={28} font={12} />
                    <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, fontFamily: F.s, flexGrow: 1, flexShrink: 1 }}>{n(p)}</Text>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ color: C.white, fontSize: 15, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{money(owed[p] ?? 0, cur)}</Text>
                      {cur !== 'INR' ? <Text style={{ color: C.mid, fontSize: 11, fontVariant: ['tabular-nums'], fontFamily: F.r }}>{money((owed[p] ?? 0) * f)}</Text> : null}
                    </View>
                  </View>
                  {detail(p).map(([l, v], i) => (
                    <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text numberOfLines={1} style={{ flexShrink: 1, color: C.mid, fontSize: 12, lineHeight: 18, fontFamily: F.r }}>{l}</Text>
                      <Text style={{ color: C.mid, fontSize: 12, lineHeight: 18, fontVariant: ['tabular-nums'], fontFamily: F.r }}>{v}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </Anim>
        </>
      )}

      <Anim k="jr" delay={350}>
        <View style={{ ...card, gap: 8 }}>
          <Label>WHAT IT DID TO BALANCES</Label>
          {people.map((p, i) => {
            const paid = (b.data.split.payers[p] ?? 0) * f;
            const share = (owed[p] ?? 0) * f;
            const net = paid - share;
            const their = p === 'me' ? 'your' : 'their';
            const sub = payment ? (paid > 0.005 ? `paid ${show(paid)} back` : `got ${show(share)} back`) : paid > 0.005 ? `paid ${show(paid)}, ${their} share ${show(share)}` : `owes ${n(payer) === 'You' ? 'you' : n(payer)} for ${their} share`;
            return (
              <React.Fragment key={p}>
                {i ? <View style={{ height: 1, backgroundColor: C.line }} /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
                  <Face name={n(p)} color={color(p)} size={28} font={12} />
                  <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                    <Text style={{ color: C.white, fontSize: 15, fontFamily: F.s }}>{n(p)}</Text>
                    <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: F.r }}>{sub}</Text>
                  </View>
                  <Text style={{ color: net > 0.5 ? C.lime : net < -0.5 ? PINK : C.mid, fontSize: 15, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{Math.abs(net) < 0.5 ? 'even' : `${net > 0 ? '+' : ''}${show(net)}`}</Text>
                </View>
              </React.Fragment>
            );
          })}
          {!payment && owed.me ? (
            <Text style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: F.r }}>{payer === 'me' ? `Your spending on the trip counts ${show(owed.me * f)}, your share. The rest is what they borrowed until a payback.` : `Your spending on the trip counts ${show(owed.me * f)}, your share, which you owe ${n(payer)} until a payback.`}</Text>
          ) : null}
        </View>
      </Anim>

      <Anim k="jr" delay={410}>
        <View style={{ padding: 14, backgroundColor: C.tile, borderRadius: 28 }}>
          {[
            ...(d.txn || payer === 'me' ? [{ k: 'txn', icon: 'bank', color: '#8C9DFF', title: 'Your payment', sub: d.txn ? d.txn.title : 'not matched to your bank yet', pill: d.txn ? 'Same as' : null, go: d.txn ? () => router.push(`/entity/transaction/${d.txn!.id}` as never) : undefined }] : []),
            ...(fromReceipt ? [{ k: 'receipt', icon: 'receipt2', color: '#C99A6E', title: 'Receipt photo', sub: `${lines.length} ${lines.length === 1 ? 'item' : 'items'} read${b.data.receipt?.name ? ` · ${b.data.receipt.name}` : ''}`, pill: null, go: undefined }] : []),
            { k: 'booking', icon: 'pin', color: C.mid, title: 'Booking', sub: d.event ? `${d.event.title} · a part payment` : 'none · not a part payment', pill: null, go: d.event ? () => router.push(tripRoutes.booking(d.event!.id)) : undefined },
          ].map((r, i) => (
            <React.Fragment key={r.k}>
              {i ? <View style={{ height: 1, backgroundColor: C.line }} /> : null}
              <Pressable disabled={!r.go} accessibilityRole={r.go ? 'button' : undefined} onPress={r.go} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
                <View style={{ justifyContent: 'center', alignItems: 'center', width: 36, height: 36, backgroundColor: C.raised, borderRadius: 18 }}>
                  <LinkIcon k={r.icon} color={r.color} />
                </View>
                <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
                  <Text style={{ color: C.white, fontSize: 16, lineHeight: 21, fontFamily: F.s }}>{r.title}</Text>
                  <Text numberOfLines={2} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: F.m }}>{r.sub}</Text>
                </View>
                {r.pill ? <LimePill h={26}>{r.pill}</LimePill> : null}
              </Pressable>
            </React.Fragment>
          ))}
        </View>
      </Anim>

      <Anim k="jr" delay={470} style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={del} style={({ pressed }) => ({ justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 46, borderWidth: 1.5, borderColor: 'rgba(245,245,247,0.28)', borderRadius: 999, opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ color: C.white, fontSize: 15, fontFamily: F.s }}>Delete</Text>
        </Pressable>
        {!payment && trip ? (
          <Pressable accessibilityRole="button" onPress={edit} style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 8, height: 46, backgroundColor: C.lime, borderRadius: 999, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <Ic n="pencil" size={16} color={C.ink} />
            <Text style={{ color: C.ink, fontSize: 15, fontFamily: F.s }}>Edit</Text>
          </Pressable>
        ) : null}
      </Anim>

      {trip && !payment ? (
        <Anim k="jr" delay={530} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ic n="spark" size={14} color={C.lime} />
            <Text style={{ color: C.mid, fontSize: 10, letterSpacing: 1.5, fontFamily: MONO }}>ASK THE COPILOT</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[method === 'equal' ? 'Split it by what each had instead' : 'Split it equally instead', `Who still owes from ${b.data.date === today() ? 'today' : dayMonth(b.data.date)}?`, ...(people.length > 1 ? [`Move a line to ${n(people.find((p) => p !== payer) ?? people[0]!)}`] : [])].map((q) => (
              <Pressable key={q} accessibilityRole="button" onPress={() => router.push(tripRoutes.copilot(trip.id, `${q} (${b.title}, ${money(b.data.amount, cur)}, ${dayMonth(b.data.date)})`))} style={({ pressed }) => ({ justifyContent: 'center', height: 36, paddingHorizontal: 14, borderWidth: 1, borderColor: 'rgba(215,245,92,0.35)', borderRadius: 999, opacity: pressed ? 0.75 : 1 })}>
                <Text style={{ color: C.white, fontSize: 13, fontFamily: F.s }}>{q}</Text>
              </Pressable>
            ))}
          </View>
        </Anim>
      ) : null}
    </>
  );
  if (!trip) {
    return <View style={{ flex: 1, backgroundColor: C.ink, padding: 20, gap: 12 }}>{body}</View>;
  }
  return (
    <TripScreen tripId={trip.id} active="money">
      {body}
    </TripScreen>
  );
}

/** The three link rows' icons: a bank, a receipt, a pin. */
function LinkIcon({ k, color }: { k: string; color: string }) {
  const d = k === 'bank' ? ['M3 21h18', 'M5 21V10', 'M19 21V10', 'M9 21V10', 'M15 21V10', 'm2 10 10-6 10 6'] : k === 'receipt2' ? ['M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z', 'M9 8h6', 'M9 12h6'] : ['M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z'];
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {d.map((x) => <Path key={x} d={x} />)}
      {k === 'pin' ? <Circle cx={12} cy={10} r={2.5} /> : null}
    </Svg>
  );
}
