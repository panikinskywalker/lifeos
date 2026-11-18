// own-glyphs: this screen draws the trip template's inline icons (JP-Parts), not the kit's icon set.
import React, { useMemo, useState } from 'react';
import { type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, Share, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { Balances, Party } from '@core/money/split';
import { owedOf } from '@core/money/split';
import { useLive } from '@ui/hooks';
import { useToast } from '@ui/kit';
import { BILL_CATEGORIES, makeBill, type BillData } from '@modules/finance';
import { billInrOf, byCategory, CATEGORY_LABEL, categoryLines, costByDay, journeysTable, moneyInsights, notInSettleUp, pendingRefunds, projectedOf, rateFor, thingsCost, tripBalances, tripBills, tripLedger, tripParties, type DayCost, type Insight, type LedgerItem, type TripData } from '@modules/travel';
import { Anim, bgImage, MONO } from './jp/kit';
import { C, FACE, money, symOf, TripHeader, TripScreen, tripRoutes, useMoneyUnit, useShow, goTrip } from './jp/shell';

/**
 * Money on a trip, drawn to the JP-Money and JP-Settle artboards: Budget
 * (whose money and how far, the three levels against the cap, the budget
 * each, cost by day, insights, where it goes, the journeys, things that cost,
 * the forex card and a small spend, the rate, the copilot) and Settle up (your
 * balance, who owes whom, the group's balances, the expenses and paybacks,
 * bookings not in Settle up yet). Log a spend, Split a receipt and Pay back
 * are their own screens (jp/spend, jp/receipt, jp/payback); a Bill's page is
 * bill.tsx. Bills are finance's, Splitwise's way.
 */

export const moneyRoute = (tripId: string, tab?: 'budget' | 'settle') => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'money', trip: tripId, ...(tab ? { tab } : {}) } });
export const billRoute = (id: string) => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'bill', bill: id } });

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dt = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
/** "24 Dec" */
export const dayMonth = (iso: string) => `${dt(iso).getDate()} ${MO[dt(iso).getMonth()]}`;
/** "Thu 24 Dec" */
export const weekdayDay = (iso: string) => `${WD[dt(iso).getDay()]} ${dayMonth(iso)}`;

/** Names for parties: You, or a Person's first name. */
export function useNames(trip: ObjectRecord<TripData> | null) {
  return useLive((os) => {
    const m: Record<string, string> = { me: 'You' };
    for (const id of trip?.data.personIds ?? []) m[id] = (os.records.get(id)?.title ?? 'Someone').split(/\s+/)[0]!;
    return m;
  }, [trip?.id, trip?.version]);
}

/** The trip a screen's `trip` param names. */
export function useTrip(id: string | undefined) {
  return useLive((os) => {
    const x = os.records.get<TripData>(id ?? '');
    return x?.object === 'trip' ? x : null;
  }, [id]);
}

/** A party's face colour: You lime, the others by their order on the trip. */
export const faceColor = (parties: Party[], p: Party) => FACE[Math.max(0, parties.indexOf(p)) % FACE.length]!;

/* ------------------------------------------------------------------ */
/* Small pieces shared by the money screens                             */
/* ------------------------------------------------------------------ */

export const SPARK = 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z';
export const P = {
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  plus: ['M5 12h14', 'M12 5v14'],
  left: ['m12 19-7-7 7-7', 'M19 12H5'],
  right: ['m9 18 6-6-6-6'],
  down: ['m6 9 6 6 6-6'],
  pencil: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'],
  repeat: ['m17 2 4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3'],
  swap: ['M8 3 4 7l4 4', 'M4 7h16', 'm16 21 4-4-4-4', 'M20 17H4'],
  receipt: ['M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z', 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8', 'M12 17.5v-11'],
  wallet: ['M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'],
  route: ['M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15'],
  star: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'],
  file: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M10 9H8', 'M16 13H8', 'M16 17H8'],
  bed: ['M2 4v16', 'M2 8h18a2 2 0 0 1 2 2v10', 'M2 17h20', 'M6 8v9'],
  plane: ['M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'],
  train: ['M8 3.1V7a4 4 0 0 0 8 0V3.1', 'm9 15-1-1', 'm15 15 1-1', 'M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z', 'm8 19-2 3', 'm16 19 2 3'],
  bus: ['M8 6v6', 'M15 6v6', 'M2 12h19.6', 'M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3', 'M9 18h5'],
  food: ['M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2', 'M7 2v20', 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7'],
  bag: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'],
  ticket: ['M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z', 'M13 5v2', 'M13 17v2', 'M13 11v2'],
  scissors: ['M8.12 8.12 12 12', 'M20 4 8.12 15.88', 'M14.8 14.8 20 20'],
  sliders: ['M21 4h-7', 'M10 4H3', 'M21 12h-9', 'M8 12H3', 'M21 20h-5', 'M12 20H3', 'M14 2v4', 'M8 10v4', 'M16 18v4'],
  spark: [SPARK],
};
const CIRCLES: Partial<Record<keyof typeof P, Array<[number, number, number]>>> = { route: [[6, 19, 3], [18, 5, 3]], bus: [[7, 18, 2], [16, 18, 2]], scissors: [[6, 6, 3], [6, 18, 3]] };

/** A lucide icon by name, inline SVG. */
export function Ic({ n, size = 16, color = C.white, sw = 2 }: { n: keyof typeof P; size?: number; color?: string; sw?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {P[n].map((d) => <Path key={d} d={d} />)}
      {(CIRCLES[n] ?? []).map(([cx, cy, r]) => <Circle key={`${cx}${cy}`} cx={cx} cy={cy} r={r} />)}
    </Svg>
  );
}

const F = { r: 'PlusJakartaSans_400Regular', m: 'PlusJakartaSans_500Medium', s: 'PlusJakartaSans_600SemiBold', b: 'PlusJakartaSans_700Bold', x: 'PlusJakartaSans_800ExtraBold' } as const;
export { F };
const MUTED = 'rgba(245,245,247,0.42)';

/** The artboards' quiet caps label (11 px, semibold, 0.9 tracking). */
export const Label = ({ children, color = MUTED }: { children: React.ReactNode; color?: string }) => <Text style={{ color, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: F.s }}>{children}</Text>;

/** A face: a coloured initial. */
export function Face({ name, color, size = 26, font }: { name: string; color: string; size?: number; font?: number }) {
  return (
    <View style={{ justifyContent: 'center', alignItems: 'center', flexShrink: 0, width: size, height: size, backgroundColor: color, borderRadius: size / 2 }}>
      <Text style={{ color: C.ink, fontSize: font ?? Math.round(size * 0.36), fontFamily: F.b }}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

/** The artboards' segmented control. */
export function Seg<T extends string>({ options, value, onChange, bg = C.tile, h = 32, font = 14, on: onBg = C.white, bold }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void; bg?: string; h?: number; font?: number; on?: string; bold?: boolean }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, backgroundColor: bg, borderRadius: 999 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)} style={{ justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 0, height: h, backgroundColor: on ? onBg : 'transparent', borderRadius: 999 }}>
            <Text numberOfLines={1} style={{ color: on ? C.ink : C.mid, fontSize: font, lineHeight: font + 4, fontFamily: bold ? F.b : F.s }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A small rounded tag (To pay, Expense, Settlement). */
export const Tag = ({ children, on }: { children: React.ReactNode; on?: boolean }) => (
  <View style={{ alignItems: 'center', flexShrink: 0, height: 20, paddingHorizontal: 9, backgroundColor: on ? C.white : C.raised, borderRadius: 999, flexDirection: 'row' }}>
    <Text numberOfLines={1} style={{ color: on ? C.ink : C.mid, fontSize: 10, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: F.s }}>{children}</Text>
  </View>
);

/** A lime-tinted pill (on budget, Same as, From a receipt). */
export const LimePill = ({ children, icon, color = C.lime, h = 24 }: { children: React.ReactNode; icon?: keyof typeof P; color?: string; h?: number }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 5, height: h, paddingHorizontal: h > 24 ? 11 : 9, backgroundColor: color === C.lime ? 'rgba(215,245,92,0.16)' : 'rgba(255,107,122,0.16)', borderRadius: 999 }}>
    {icon ? <Ic n={icon} size={13} color={color} /> : null}
    <Text numberOfLines={1} style={{ color, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: F.s }}>{children}</Text>
  </View>
);

/** A raised pill button with an optional icon (Add journey, All, Show them). */
export function PillButton({ label, icon, onPress, h = 28, a11y }: { label: string; icon?: keyof typeof P; onPress?: () => void; h?: number; a11y?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 5, height: h, paddingHorizontal: h > 30 ? 14 : 11, backgroundColor: C.raised, borderRadius: 999, opacity: pressed ? 0.75 : 1 })}>
      {icon ? <Ic n={icon} size={13} color={C.mid} /> : null}
      <Text style={{ color: h > 30 ? C.white : C.mid, fontSize: h > 30 ? 13 : 12, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: F.s }}>{label}</Text>
    </Pressable>
  );
}

/** A card's title and its quiet line. */
export function CardHead({ title, sub, right }: { title: string; sub?: string | null; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: F.s }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: F.m }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const card = { gap: 12, padding: 16, backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' as const, minWidth: 0 };
export { card };

/** Horizontal chips that bleed to the page edge (the artboards' scrollers). */
export const Bleed = ({ children, gap = 6 }: { children: React.ReactNode; gap?: number }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ flexDirection: 'row', gap, paddingHorizontal: 20 }}>
    {children}
  </ScrollView>
);

/** The categories: their colour and icon. */
export const CAT_COLOR: Record<string, string> = { flights: '#A9C4FF', stays: '#F2C94C', transport: '#5FD08A', things: '#E08BC8', daily: '#6CC6FF', planned: '#C9B2FF', food: '#FFB27A', fun: '#8FE0C0', shopping: '#F4A8CE', other: '#B8B8C2' };
export const CAT_ICON: Record<string, keyof typeof P> = { flights: 'plane', stays: 'bed', transport: 'train', food: 'food', fun: 'star', shopping: 'bag', other: 'file', things: 'star', daily: 'wallet', planned: 'ticket' };
export const catLabel = (c?: string) => BILL_CATEGORIES.find((x) => x.value === c)?.label ?? CATEGORY_LABEL[c ?? 'other'] ?? 'Other';

/** Who a Bill was split among, in words. */
export function splitWords(b: Pick<BillData, 'amount' | 'split'>, names: Record<string, string>, parties: Party[]): string {
  const owed = owedOf(b.amount, b.split);
  const who = Object.keys(owed).filter((p) => (owed[p] ?? 0) > 0.005);
  const payer = Object.keys(b.split.payers)[0] ?? 'me';
  const n = (p: Party) => (p === 'me' ? 'you' : names[p] ?? 'Someone');
  if (who.length === 1 && who[0] === payer) return `just ${n(payer)}`;
  if (who.length === 1) return `paid by ${n(payer)} for ${n(who[0]!)}`;
  const ways = ['', 'one way', 'two ways', 'three ways', 'four ways', 'five ways', 'six ways'][who.length] ?? `${who.length} ways`;
  if (b.split.method === 'equal' && who.length === parties.length) return `split ${ways}`;
  return `paid by ${n(payer)} · ${who.length} share`;
}

/* ------------------------------------------------------------------ */
/* The screen                                                           */
/* ------------------------------------------------------------------ */

export function MoneyScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const [tab, setTab] = useState<'budget' | 'settle'>(params.tab === 'settle' ? 'settle' : 'budget');
  const trip = useTrip(params.trip);
  const names = useNames(trip);
  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        <Text style={{ color: C.mid, fontSize: 15, fontFamily: F.s }}>That trip isn’t here any more.</Text>
        <PillButton label="All trips" h={36} onPress={() => router.replace(tripRoutes.travel)} />
      </View>
    );
  }
  return (
    <TripScreen tripId={trip.id} active="money">
      <TripHeader trip={trip} label={tab === 'settle' ? 'Settle up' : 'Money'} />
      <Anim k="jr" delay={110}>
        <Seg options={[{ value: 'budget', label: 'Budget' }, { value: 'settle', label: 'Settle up' }]} value={tab} onChange={(v) => { setTab(v); router.setParams({ tab: v }); }} />
      </Anim>
      {tab === 'budget' ? <Budget trip={trip} ctx={ctx} names={names} /> : <Settle trip={trip} ctx={ctx} names={names} />}
    </TripScreen>
  );
}

/* ------------------------------------------------------------------ */
/* Budget                                                               */
/* ------------------------------------------------------------------ */

type LevelPick = 'paid' | 'booked' | 'estimate';

function Budget({ trip, ctx, names }: { trip: ObjectRecord<TripData>; ctx: LifeOSContext; names: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const show = useShow(trip);
  const parties = tripParties(trip);
  const [scope, setScope] = useState<string>('me');
  const [level, setLevel] = useState<LevelPick>('estimate');
  const who = scope === 'all' ? undefined : scope;
  const whoName = who ? names[who] ?? 'Someone' : 'Everyone';
  const d = useLive((os) => {
    const t = os.records.get<TripData>(trip.id) ?? trip;
    const ledger = tripLedger(os, t);
    const days = costByDay(os, t, who);
    return { ledger, days, insights: moneyInsights(os, t, days, ledger, who), journeys: journeysTable(os, t), things: thingsCost(os, t.id), refunds: pendingRefunds(os, t), stops: Object.fromEntries(os.records.query('stop', { filter: { and: [{ field: 'data.tripId', op: 'eq', value: t.id }] } }, { limit: 500 }).map((s) => [s.id, s.title])) as Record<string, string> };
  }, [trip.id, trip.version, who]);
  const items = d.ledger.filter((i) => level === 'estimate' || i.level === 'paid' || (level === 'booked' && i.level === 'booked'));
  const p = projectedOf(items, who);
  const full = projectedOf(d.ledger, who);
  const cap = (trip.data.budget ?? 0) * (who ? 1 : parties.length);
  const local = trip.data.localCurrency && trip.data.localCurrency !== 'INR' ? trip.data.localCurrency : null;
  const lr = rateFor(trip, trip.data.localCurrency) ?? 0;
  return (
    <>
      <Anim k="jr" delay={170} style={{ gap: 0 }}>
        <Bleed>
          {[{ value: 'all', label: 'Everyone' }, ...parties.map((x) => ({ value: x, label: names[x] ?? 'Someone' }))].map((o) => {
            const on = o.value === scope;
            return (
              <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setScope(o.value)} style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 7, height: 36, paddingLeft: on && o.value !== 'all' ? 6 : 16, paddingRight: 16, backgroundColor: on ? C.white : C.raised, borderRadius: 999 }}>
                {on && o.value !== 'all' ? <Face name={o.label} color={faceColor(parties, o.value)} size={26} font={9} /> : null}
                <Text numberOfLines={1} style={{ color: on ? C.ink : C.white, fontSize: 14, lineHeight: 18, fontFamily: F.s }}>{o.label}</Text>
              </Pressable>
            );
          })}
        </Bleed>
        <Seg options={[{ value: 'paid', label: 'Paid' }, { value: 'booked', label: '+ Booked' }, { value: 'estimate', label: '+ Estimates' }]} value={level} onChange={setLevel} />
      </Anim>

      <Anim k="jr" delay={230}>
        <Projected p={p} cap={cap} level={level} whoName={whoName} show={show} />
      </Anim>

      <Anim k="jr" delay={290}>
        <BudgetEach trip={trip} ctx={ctx} toast={toast} show={show} left={cap ? (cap - full.total) / (who ? 1 : parties.length) : null} refunds={d.refunds} />
      </Anim>

      {d.days.length ? (
        <Anim k="jr" delay={350}>
          <CostByDay days={d.days} trip={trip} whoName={whoName} stops={d.stops} show={show} />
        </Anim>
      ) : null}

      {d.insights.length ? (
        <Anim k="jr" delay={410}>
          <Insights insights={d.insights} who={who} whoName={whoName} stops={d.stops} show={show} onPress={(text) => router.push(tripRoutes.copilot(trip.id, text))} />
        </Anim>
      ) : null}

      <Anim k="jr" delay={470}>
        <WhereItGoes items={items} who={who} whoName={whoName} total={p.total} show={show} />
      </Anim>

      {d.journeys.length ? (
        <Anim k="jr" delay={530}>
          <Journeys rows={d.journeys} perPerson={byCategory(d.ledger, 'me').find((c) => c.cat === 'transport')?.inr ?? 0} show={show} onAdd={() => goTrip(router, tripRoutes.plan(trip.id, 'line'))} onOpen={(id) => router.push(tripRoutes.booking(id))} />
        </Anim>
      ) : null}

      {d.things.planned.count || d.things.want.count ? (
        <Anim k="jr" delay={590}>
          <View style={{ ...card, gap: 4 }}>
            <CardHead title="Things that cost" sub="from Plan · per person" />
            {([['planned', 'Planned', d.things.planned, 'check'], ['want', 'Want to', d.things.want, 'star']] as const).map(([k, label, g, icon]) =>
              g.count ? (
                <Pressable key={k} accessibilityRole="button" onPress={() => goTrip(router, tripRoutes.plan(trip.id))} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0, minHeight: 50 }}>
                  <View style={{ justifyContent: 'center', alignItems: 'center', flexShrink: 0, width: 36, height: 36, backgroundColor: C.raised, borderRadius: 18 }}>
                    <Ic n={icon} color={k === 'planned' ? C.lime : C.white} />
                  </View>
                  <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: C.white, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, fontFamily: F.s }}>{`${label} · ${g.count}`}</Text>
                    <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: F.m }}>{g.names.slice(0, 3).join(', ')}{g.names.length > 3 ? '…' : ''}</Text>
                  </View>
                  <Text numberOfLines={1} style={{ color: C.white, fontSize: 16, lineHeight: 21, fontVariant: ['tabular-nums'], fontFamily: F.b, flexShrink: 0 }}>{money(g.cost, trip.data.localCurrency ?? 'INR')}{'unknown' in g && g.unknown ? '+' : ''}</Text>
                </Pressable>
              ) : null,
            )}
          </View>
        </Anim>
      ) : null}

      <Anim k="jr" delay={650}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Wallet trip={trip} journeysLocal={d.journeys.reduce((a, j) => a + (j.fare ?? 0), 0)} />
          <SmallSpend trip={trip} ctx={ctx} toast={toast} onMore={(amount) => router.push({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'spend', trip: trip.id, amount: String(amount) } } as never)} />
        </View>
      </Anim>

      {local ? (
        <Anim k="jr" delay={710}>
          <RateRow trip={trip} ctx={ctx} toast={toast} lr={lr} local={local} />
        </Anim>
      ) : null}

      <Anim k="jr" delay={770} style={{ gap: 8 }}>
        <Label>ASK THE COPILOT</Label>
        <Bleed>
          {['Are we on budget?', 'Cheaper transport', 'Daily allowance check'].map((q) => (
            <Pressable key={q} accessibilityRole="button" onPress={() => router.push(tripRoutes.copilot(trip.id, q))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 6, height: 38, paddingHorizontal: 14, backgroundColor: C.raised, borderRadius: 999, opacity: pressed ? 0.75 : 1 })}>
              <Ic n="spark" size={13} color={C.lime} />
              <Text style={{ color: C.white, fontSize: 13, fontFamily: F.s }}>{q}</Text>
            </Pressable>
          ))}
        </Bleed>
      </Anim>

      <Anim k="jr" delay={830}>
        <LogRow tripId={trip.id} />
      </Anim>
    </>
  );
}

/** Log a spend, and the receipt button beside it. */
function LogRow({ tripId }: { tripId: string }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Pressable accessibilityRole="button" onPress={() => router.push(tripRoutes.spend(tripId))} style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 8, height: 52, backgroundColor: C.lime, borderRadius: 999, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <Ic n="plus" size={17} color={C.ink} />
        <Text style={{ color: C.ink, fontSize: 16, lineHeight: 20, fontFamily: F.s }}>Log a spend</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Split a receipt photo" onPress={() => router.push(tripRoutes.receipt(tripId))} style={({ pressed }) => ({ justifyContent: 'center', alignItems: 'center', width: 52, height: 52, backgroundColor: C.raised, borderRadius: 26, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <Ic n="receipt" size={21} color={C.lime} />
      </Pressable>
    </View>
  );
}

function Projected({ p, cap, level, whoName, show }: { p: ReturnType<typeof projectedOf>; cap: number; level: LevelPick; whoName: string; show: (n: number, c?: boolean) => string }) {
  const over = cap > 0 && p.total > cap;
  const rest = cap > p.total ? cap - p.total : 0;
  const label = level === 'paid' ? 'PAID' : level === 'booked' ? 'PAID + BOOKED' : 'PROJECTED';
  const parts = [
    { k: 'PAID', v: p.paid, c: C.lime },
    ...(level !== 'paid' ? [{ k: 'BOOKED', v: p.booked, c: 'rgba(215,245,92,0.55)' }] : []),
    ...(level === 'estimate' ? [{ k: 'ESTIMATES', v: p.estimate, c: 'rgba(215,245,92,0.22)' }] : []),
  ];
  return (
    <View style={{ ...card, padding: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Label>{`${label} · ${whoName.toUpperCase()}`}</Label>
        <View style={{ flexGrow: 1 }} />
        {cap ? <LimePill icon={over ? 'x' : 'check'} color={over ? C.coral : C.lime}>{over ? 'over budget' : 'on budget'}</LimePill> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
        <Text style={{ color: C.white, fontSize: 44, lineHeight: 48, letterSpacing: -1.6, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{show(p.total)}</Text>
        {cap ? <Text style={{ color: C.mid, fontSize: 13, fontFamily: F.s }}>of {show(cap)}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 3, height: 12 }}>
        {parts.map((x, i) => (x.v > 0.5 ? <Anim key={x.k} k="jbar" delay={i * 150} style={{ flexGrow: x.v, flexShrink: 1, flexBasis: 0, backgroundColor: x.c, borderRadius: 4 }} /> : null))}
        {rest > 0.5 || !p.total ? <View style={{ flexGrow: rest || 1, flexShrink: 1, flexBasis: 0, backgroundColor: '#303036', borderRadius: 4 }} /> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {parts.map((x) => (
          <View key={x.k} style={{ gap: 3, minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, backgroundColor: x.c, borderRadius: 2 }} />
              <Label>{x.k}</Label>
            </View>
            <Text numberOfLines={1} style={{ color: C.white, fontSize: 18, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{show(x.v, true)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const ORANGE = '#F26B2B';
const INK62 = 'rgba(11,11,13,0.62)';

function BudgetEach({ trip, ctx, toast, show, left, refunds }: { trip: ObjectRecord<TripData>; ctx: LifeOSContext; toast: ReturnType<typeof useToast>; show: (n: number, c?: boolean) => string; left: number | null; refunds: ReturnType<typeof pendingRefunds> }) {
  const [edit, setEdit] = useState<{ cap: string; day: string } | null>(null);
  const local = trip.data.localCurrency ?? 'INR';
  const save = () => {
    if (!edit) return;
    const cap = Number(edit.cap.replace(/[^\d.]/g, ''));
    const day = Number(edit.day.replace(/[^\d.]/g, ''));
    const prev = { budget: trip.data.budget, dailyAllowance: trip.data.dailyAllowance };
    ctx.records.update<TripData>(trip.id, { data: { budget: cap > 0 ? cap : undefined, dailyAllowance: day > 0 ? day : undefined } }, 'user');
    toast.show({ message: 'Budget changed', icon: 'check', undo: () => void ctx.records.update<TripData>(trip.id, { data: prev }, 'user') });
    setEdit(null);
  };
  const cell = (k: string, v: string, s: string, field?: 'cap' | 'day') => (
    <View key={k} style={{ minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
      <Text style={{ color: INK62, fontSize: 9, lineHeight: 15, letterSpacing: 1, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{k}</Text>
      {edit && field ? (
        <TextInput value={edit[field]} onChangeText={(x) => setEdit({ ...edit, [field]: x })} keyboardType="decimal-pad" accessibilityLabel={field === 'cap' ? 'Cap, ₹ a person' : `A day, ${local}`} style={{ color: C.ink, fontSize: 20, letterSpacing: -0.5, fontFamily: F.x, padding: 0, borderBottomWidth: 2, borderBottomColor: C.ink, minWidth: 0 }} />
      ) : (
        <Text numberOfLines={1} style={{ color: C.ink, fontSize: 20, lineHeight: 27, letterSpacing: -0.5, fontVariant: ['tabular-nums'], fontFamily: F.x }}>{v}</Text>
      )}
      <Text numberOfLines={1} style={{ color: INK62, fontSize: 11, fontFamily: F.s }}>{s}</Text>
    </View>
  );
  return (
    <View style={{ gap: 12, padding: 16, backgroundColor: ORANGE, borderRadius: 28 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Label color={C.ink}>BUDGET · EACH</Label>
        <View style={{ flexGrow: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={edit ? 'Save the budget' : 'Change the budget'} onPress={() => (edit ? save() : setEdit({ cap: trip.data.budget ? String(trip.data.budget) : '', day: trip.data.dailyAllowance ? String(trip.data.dailyAllowance) : '' }))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 34, paddingHorizontal: 12, backgroundColor: edit ? C.ink : 'rgba(11,11,13,0.14)', borderRadius: 999, opacity: pressed ? 0.8 : 1 })}>
          <Ic n={edit ? 'check' : 'pencil'} size={17} color={edit ? ORANGE : C.ink} />
          <Text style={{ color: edit ? ORANGE : C.ink, fontSize: 13, lineHeight: 20, fontFamily: F.s }}>{edit ? 'Save' : 'Change'}</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
        {cell('CAP', trip.data.budget ? money(trip.data.budget, 'INR', true) : 'Not set', 'per person', 'cap')}
        {cell('A DAY', trip.data.dailyAllowance ? money(trip.data.dailyAllowance, local) : 'Not set', 'daily allowance', 'day')}
        {cell('LEFT', left == null ? '–' : show(left, true), left != null && left < 0 ? 'over, each' : 'about, each')}
      </View>
      {refunds.map((r) => (
        <View key={r.e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: 'rgba(11,11,13,0.12)', borderRadius: 16 }}>
          <Ic n="repeat" size={14} color={C.ink} />
          <Text numberOfLines={1} style={{ flexShrink: 1, color: C.ink, fontSize: 13, fontFamily: F.b }}>{`${r.e.title.replace(/^(Stay|Ticket) · /, '').split(/\s+/)[0]} refund +${show(r.each)} each`}</Text>
          <View style={{ flexGrow: 1 }} />
          <Text style={{ color: INK62, fontSize: 12, fontFamily: F.s }}>pending</Text>
        </View>
      ))}
    </View>
  );
}

/* Cost by day ------------------------------------------------------- */

function CostByDay({ days, trip, whoName, stops, show }: { days: DayCost[]; trip: ObjectRecord<TripData>; whoName: string; stops: Record<string, string>; show: (n: number, c?: boolean) => string }) {
  const unit = useMoneyUnit();
  const [mode, setMode] = useState<'projected' | 'spent'>('projected');
  const t0 = today();
  const priciest = days.reduce((a, b, i) => (b.projected > days[a]!.projected ? i : a), 0);
  const [sel, setSel] = useState(() => {
    const i = days.findIndex((d) => d.day === t0);
    return i >= 0 ? i : priciest;
  });
  const [w, setW] = useState(318);
  const at = Math.min(sel, days.length - 1);
  const day = days[at]!;
  const val = (x: DayCost) => (mode === 'projected' ? x.projected : x.spent);
  const local = trip.data.localCurrency && trip.data.localCurrency !== 'INR' && trip.data.fxRate ? trip.data.fxRate : null;
  const inUnit = (inr: number) => (unit === 'local' && local ? inr / local : inr);
  const from = Math.max(0, Math.min(at - 3, days.length - 7));
  const win = days.slice(from, from + 7);
  const max = Math.max(1, ...win.map(val));
  const x0 = 34;
  const H = 170;
  const base = 148;
  const yOf = (v: number) => base - (v / max) * 103;
  const xOf = (i: number) => (win.length > 1 ? x0 + (i * (w - x0)) / (win.length - 1) : (x0 + w) / 2);
  const pts = win.map((x, i) => [xOf(i), yOf(val(x))] as const);
  const path = pts.map(([x, y], i) => (i ? `C ${((pts[i - 1]![0] + x) / 2).toFixed(1)} ${pts[i - 1]![1].toFixed(1)}, ${((pts[i - 1]![0] + x) / 2).toFixed(1)} ${y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}` : `M${x.toFixed(1)} ${y.toFixed(1)}`)).join(' ');
  const maxU = inUnit(max);
  const step = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000].find((s) => maxU / s <= 3.5) ?? 1000000;
  const ticks: number[] = [];
  for (let v = step; v <= maxU * 1.3 && ticks.length < 4; v += step) ticks.push(v);
  const k = (v: number) => (v >= 1000 ? `${Math.round((v / 1000) * 10) / 10}k` : String(v));
  const si = at - from;
  const [sx, sy] = pts[si] ?? [0, 0];
  const what = day.moving ? `${day.toStopId && stops[day.toStopId] ? stops[day.toStopId] : 'On the move'} · a moving day` : day.stopId && stops[day.stopId] ? stops[day.stopId]! : at === days.length - 1 ? 'the last day' : '';
  const tip = show(val(day), true);
  const tipW = Math.max(64, tip.length * 8 + 18);
  const tx = Math.max(0, Math.min(w - tipW, sx - tipW / 2));
  const onLayout = (e: LayoutChangeEvent) => setW(Math.max(200, Math.round(e.nativeEvent.layout.width)));
  const parts = [day.allowance > 0.5 ? 'allowance' : null, day.stay > 0.5 ? 'stay' : null, day.fares > 0.5 ? 'fares' : null, day.things > 0.5 ? 'things' : null].filter(Boolean);
  return (
    <View style={card}>
      <CardHead title="Cost by day" sub={`${whoName} · ${mode === 'projected' ? parts.join(' + ') || 'allowance + stay + fares' : 'spends logged that day'}`} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous day" disabled={at <= 0} onPress={() => setSel(Math.max(0, at - 1))} style={{ justifyContent: 'center', alignItems: 'center', width: 36, height: 36, backgroundColor: C.raised, borderRadius: 18, opacity: at <= 0 ? 0.4 : 1 }}>
          <Ic n="left" size={15} />
        </Pressable>
        <View style={{ alignItems: 'center', justifyContent: 'center', height: 36, paddingHorizontal: 16, backgroundColor: C.raised, borderRadius: 18 }}>
          <Text style={{ color: C.white, fontSize: 13, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{weekdayDay(day.day)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Next day" disabled={at >= days.length - 1} onPress={() => setSel(Math.min(days.length - 1, at + 1))} style={{ justifyContent: 'center', alignItems: 'center', width: 36, height: 36, backgroundColor: C.raised, borderRadius: 18, opacity: at >= days.length - 1 ? 0.4 : 1 }}>
          <Ic n="right" size={15} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
        <Text style={{ color: C.white, fontSize: 30, lineHeight: 31, letterSpacing: -1, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{show(val(day))}</Text>
        <View style={{ flexGrow: 1 }} />
        <Text numberOfLines={1} style={{ flexShrink: 1, color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: F.s }}>{what}</Text>
      </View>
      <View onLayout={onLayout}>
        <Svg width={w} height={H} viewBox={`0 0 ${w} ${H}`} style={{ overflow: 'visible' }}>
          <Defs>
            <LinearGradient id="cbd" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={C.lime} stopOpacity={0.7} />
              <Stop offset="1" stopColor={C.lime} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {ticks.map((v) => {
            const y = base - ((local && unit === 'local' ? v * local : v) / max) * 103;
            return y > 8 ? (
              <React.Fragment key={v}>
                <Line x1={x0} x2={w} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeDasharray="3 4" />
                <SvgText x={0} y={y + 3} fontFamily="JetBrainsMono_500Medium" fontSize={9} fill={MUTED}>{k(v)}</SvgText>
              </React.Fragment>
            ) : null;
          })}
          {val(day) > 0.5 ? <Rect x={sx - 14.2} y={sy} width={28.4} height={Math.max(0, base - sy)} rx={6} fill="url(#cbd)" /> : null}
          <Path d={path} fill="none" stroke={C.lime} strokeWidth={2.5} strokeLinecap="round" />
          {win.map((x, i) => (
            <SvgText key={x.day} x={xOf(i)} y={166} textAnchor="middle" fontFamily={F.s} fontSize={10} fontWeight="600" fill={i === si ? C.white : MUTED}>
              {String(dt(x.day).getDate())}
            </SvgText>
          ))}
          <Circle cx={sx} cy={sy} r={5} fill={C.lime} stroke={C.tile} strokeWidth={2} />
          <Rect x={tx} y={Math.max(-0.6, sy - 46)} width={tipW} height={36} rx={10} fill={C.lime} />
          <SvgText x={tx + tipW / 2} y={Math.max(-0.6, sy - 46) + 16} textAnchor="middle" fontFamily={F.x} fontSize={12} fontWeight="800" fill={C.ink}>{tip}</SvgText>
          <SvgText x={tx + tipW / 2} y={Math.max(-0.6, sy - 46) + 29} textAnchor="middle" fontFamily={F.s} fontSize={9} fontWeight="600" fill={INK62}>{dayMonth(day.day)}</SvgText>
        </Svg>
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: x0 - 16, right: 0, flexDirection: 'row' }}>
          {win.map((x, i) => (
            <Pressable key={x.day} accessibilityRole="button" accessibilityLabel={weekdayDay(x.day)} onPress={() => setSel(from + i)} style={{ flex: 1 }} />
          ))}
        </View>
      </View>
      <Seg options={[{ value: 'projected', label: 'Projected' }, { value: 'spent', label: 'Spent so far' }]} value={mode} onChange={setMode} bg={C.raised} h={44} font={15} on={C.lime} bold />
    </View>
  );
}

/* Insights ---------------------------------------------------------- */

const INSIGHT_BG = ['#F6E27F', '#7FD0C8', '#F4A8CE', '#A9C4FF'];

function insightText(x: Insight, who: Party | undefined, whoName: string, stops: Record<string, string>, show: (n: number, c?: boolean) => string): string {
  if (x.kind === 'priciest') {
    const parts = [x.fares > 0.5 ? (x.toStopId && stops[x.toStopId] ? `the fare to ${stops[x.toStopId]}` : 'the fares') : null, x.stay > 0.5 ? 'the night' : null].filter(Boolean);
    const whose = who === 'me' ? 'Your' : who ? `${whoName}’s` : 'The trip’s';
    return `${whose} priciest day is ${dayMonth(x.day)}: ${show(x.inr, true)}${parts.length ? `, ${parts.join(' plus ')}` : ''}.`;
  }
  if (x.kind === 'railpass') {
    const pass = money(x.pass, 'JPY');
    const fares = money(x.fares, 'JPY');
    return x.payOff ? `A 7-day JR Pass (${pass}) could pay off: fares are ${fares} each${x.buses ? `, though the bus legs aren’t JR` : ''}.` : `A 7-day JR Pass (${pass}) wouldn’t pay off: fares are ${fares} each${x.buses ? `, and the bus legs aren’t JR` : ''}.`;
  }
  if (x.kind === 'stops') return `${stops[x.dearStopId] ?? 'One stop'} averages ${show(x.dearAvg, true)} a day.${x.cheapStopId && stops[x.cheapStopId] ? ` ${stops[x.cheapStopId]}’s nights are the cheapest.` : ''}`;
  return `${show(x.left, true)} spare after everything projected: about ${show(x.perDay, true)} more a day for ${x.days} days.`;
}

function Insights({ insights, who, whoName, stops, show, onPress }: { insights: Insight[]; who: Party | undefined; whoName: string; stops: Record<string, string>; show: (n: number, c?: boolean) => string; onPress: (text: string) => void }) {
  const [at, setAt] = useState(0);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setAt(Math.max(0, Math.min(insights.length - 1, Math.round(e.nativeEvent.contentOffset.x / 270))));
  return (
    <View style={{ gap: 10 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={32} snapToInterval={270} decelerationRate="fast" style={{ marginHorizontal: -20 }} contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20 }}>
        {insights.map((x, i) => {
          const text = insightText(x, who, whoName, stops, show);
          return (
            <Pressable key={x.kind} accessibilityRole="button" accessibilityHint="Ask the copilot about it" onPress={() => onPress(text)} style={({ pressed }) => ({ gap: 8, width: 262, minHeight: 96, padding: 16, backgroundColor: INSIGHT_BG[i % INSIGHT_BG.length], borderRadius: 24, opacity: pressed ? 0.85 : 1 })}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ic n="spark" size={13} color={C.ink} />
                <Text style={{ color: INK62, fontSize: 9, letterSpacing: 1, fontFamily: MONO }}>INSIGHT</Text>
              </View>
              <Text style={{ color: C.ink, fontSize: 15, lineHeight: 20, fontFamily: F.b }}>{text}</Text>
            </Pressable>
          );
        })}
        <View style={{ width: 12 }} />
      </ScrollView>
      {insights.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }}>
          {insights.map((x, i) => <View key={x.kind} style={{ width: i === at ? 18 : 5, height: 5, backgroundColor: i === at ? C.lime : 'rgba(245,245,247,0.25)', borderRadius: 3 }} />)}
        </View>
      ) : null}
    </View>
  );
}

/* Where the money goes ---------------------------------------------- */

function WhereItGoes({ items, who, whoName, total, show }: { items: LedgerItem[]; who: Party | undefined; whoName: string; total: number; show: (n: number, c?: boolean) => string }) {
  const [open, setOpen] = useState<string | null>('stays');
  const [all, setAll] = useState(false);
  const cats = byCategory(items, who);
  return (
    <View style={card}>
      <CardHead title="Where the money goes" sub={`${whoName} · ${total ? 'projected' : 'nothing yet'}`} />
      {cats.length ? (
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {cats.map((c) => <View key={c.cat} style={{ flexGrow: c.inr, flexShrink: 1, flexBasis: 0, height: 12, backgroundColor: CAT_COLOR[c.cat] ?? CAT_COLOR.other, borderRadius: 12 }} />)}
        </View>
      ) : (
        <Text style={{ color: C.mid, fontSize: 13, fontFamily: F.r }}>Bookings, spends and the daily allowance add up here.</Text>
      )}
      <View>
        {cats.map((c, ci) => {
          const isOpen = open === c.cat;
          const lines = isOpen ? categoryLines(c.items, who) : [];
          const shown = all ? lines : lines.slice(0, 3);
          const restSum = lines.slice(3).reduce((a, l) => a + l.inr, 0);
          return (
            <Anim key={c.cat} k="jr" delay={300 + ci * 50} style={{ gap: 4, paddingVertical: 6, borderTopWidth: ci ? 1 : 0, borderTopColor: C.line }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: isOpen }} onPress={() => { setOpen(isOpen ? null : c.cat); setAll(false); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 34 }}>
                <View style={{ width: 8, height: 8, backgroundColor: CAT_COLOR[c.cat] ?? CAT_COLOR.other, borderRadius: 4 }} />
                <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, fontFamily: F.s, flexGrow: 1, flexShrink: 1 }}>{CATEGORY_LABEL[c.cat] ?? catLabel(c.cat)}</Text>
                <Text style={{ width: 40, color: MUTED, fontSize: 13, textAlign: 'right', fontVariant: ['tabular-nums'], fontFamily: F.s }}>{`${Math.round((c.inr / (total || 1)) * 100)}%`}</Text>
                <Text numberOfLines={1} style={{ width: 84, color: C.white, fontSize: 15, textAlign: 'right', fontVariant: ['tabular-nums'], fontFamily: F.b }}>{show(c.inr)}</Text>
                <Ic n={isOpen ? 'down' : 'right'} color={MUTED} />
              </Pressable>
              {shown.map((l, i) => (
                <View key={`${l.ref ?? ''}${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 30, paddingLeft: 18 }}>
                  <Text numberOfLines={1} style={{ flexGrow: 1, flexShrink: 1, color: C.mid, fontSize: 13, fontFamily: F.r }}>{l.sub ? `${l.label} · ${l.sub}` : l.label}</Text>
                  <Tag>{l.word}</Tag>
                  <Text style={{ color: C.white, fontSize: 13, fontVariant: ['tabular-nums'], fontFamily: F.s }}>{show(l.inr)}</Text>
                </View>
              ))}
              {isOpen && !all && lines.length > 3 ? (
                <Pressable accessibilityRole="button" onPress={() => setAll(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 30, paddingLeft: 18 }}>
                  <Text style={{ flexGrow: 1, color: C.mid, fontSize: 13, fontFamily: F.r }}>{`${lines.length - 3} more ${(CATEGORY_LABEL[c.cat] ?? 'lines').toLowerCase()}`}</Text>
                  <Text style={{ color: C.white, fontSize: 13, fontVariant: ['tabular-nums'], fontFamily: F.s }}>{show(restSum)}</Text>
                </Pressable>
              ) : null}
            </Anim>
          );
        })}
      </View>
    </View>
  );
}

/* Journeys ---------------------------------------------------------- */

function Journeys({ rows, perPerson, show, onAdd, onOpen }: { rows: ReturnType<typeof journeysTable>; perPerson: number; show: (n: number, c?: boolean) => string; onAdd: () => void; onOpen: (id: string) => void }) {
  const [all, setAll] = useState(false);
  const cur = rows.find((r) => r.fare != null)?.currency ?? 'INR';
  const sum = rows.reduce((a, r) => a + (r.currency === cur ? r.fare ?? 0 : 0), 0);
  const shown = all ? rows : rows.slice(0, 6);
  const col = (w: number | null, text: string, right?: boolean) => (
    <View style={w ? { width: w, flexShrink: 0 } : { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
      <Label>{text}</Label>
    </View>
  );
  return (
    <View style={{ ...card, gap: 8 }}>
      <CardHead title="Journeys" sub={`${rows.length} · ${money(sum, cur)} each`} right={<PillButton label="Add journey" icon="plus" onPress={onAdd} />} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {col(44, 'DATE')}
        {col(null, 'JOURNEY')}
        <View style={{ width: 14 }} />
        {col(58, 'TAKES')}
        <View style={{ width: 56, flexShrink: 0 }}>
          <Text style={{ color: MUTED, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textAlign: 'right', fontFamily: F.s }}>EACH</Text>
        </View>
      </View>
      {shown.map((j) => (
        <Pressable key={j.id} accessibilityRole="button" onPress={() => onOpen(j.id)} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', minHeight: 40, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={{ width: 44, flexShrink: 0, color: C.white, fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{dayMonth(j.day)}</Text>
          <Text numberOfLines={1} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, color: C.white, fontSize: 13, fontFamily: F.s }}>{j.title}</Text>
          <Ic n={/bus/i.test(j.mode ?? '') ? 'bus' : 'train'} size={14} color={C.mid} />
          <Text numberOfLines={1} style={{ width: 58, flexShrink: 0, color: C.mid, fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: F.r }}>{j.takes ?? '–'}</Text>
          <Text numberOfLines={1} style={{ width: 56, flexShrink: 0, color: C.white, fontSize: 13, textAlign: 'right', fontVariant: ['tabular-nums'], fontFamily: F.b }}>{j.fare != null ? `${j.estimate ? '≈' : ''}${money(j.fare, j.currency)}` : '–'}</Text>
        </Pressable>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {rows.length > 6 ? (
          <Pressable accessibilityRole="button" onPress={() => setAll(!all)} hitSlop={8}>
            <Text style={{ color: C.mid, fontSize: 10, letterSpacing: 0.9, fontFamily: MONO }}>{all ? 'FEWER' : `+ ${rows.length - 6} MORE`}</Text>
          </Pressable>
        ) : null}
        <View style={{ flexGrow: 1 }} />
        {perPerson > 0.5 ? <Text style={{ color: C.mid, fontSize: 10, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{`≈ ${show(perPerson)} EACH`}</Text> : null}
      </View>
    </View>
  );
}

/* The wallet card and a small spend --------------------------------- */

function Wallet({ trip, journeysLocal }: { trip: ObjectRecord<TripData>; journeysLocal: number }) {
  const [page, setPage] = useState<0 | 1>(0);
  const local = trip.data.localCurrency ?? 'INR';
  const days = trip.data.startDate && trip.data.endDate ? Math.max(1, Math.round((dt(trip.data.endDate).getTime() - dt(trip.data.startDate).getTime()) / 86_400_000) + 1) : 0;
  const load = (trip.data.dailyAllowance ?? 0) * days;
  const pages = [
    { title: 'Forex card', amount: load, cap: load ? `to load · ${days} days` : 'set a daily allowance' },
    { title: 'Fares', amount: journeysLocal, cap: journeysLocal ? 'trains and buses, each' : 'no fares yet' },
  ];
  const pg = pages[page]!;
  return (
    <View style={{ alignItems: 'center', gap: 10, minWidth: 0, paddingTop: 12, paddingHorizontal: 12, paddingBottom: 14, backgroundColor: C.raised, borderRadius: 26, flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
      <View style={{ alignSelf: 'stretch' }}>
        <View style={[bgImage(page ? 'linear-gradient(135deg,#A9C4FF 0%,#7C93D6 100%)' : 'linear-gradient(135deg,#B9D98A 0%,#8FB060 100%)'), { gap: 14, padding: 14, borderRadius: 20, boxShadow: '0 10px 24px rgba(0,0,0,0.35)', overflow: 'hidden' }]}>
          <View style={{ width: 140, height: 140, top: -40, right: -30, position: 'absolute', borderWidth: 18, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 70 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ color: C.ink, fontSize: 13, lineHeight: 16, fontFamily: F.b }}>{pg.title}</Text>
            <View style={{ flexGrow: 1 }} />
            <Ic n={page ? 'route' : 'wallet'} color={C.ink} />
          </View>
          <Text numberOfLines={1} style={{ color: C.ink, fontSize: money(pg.amount, local).length > 9 ? 18 : money(pg.amount, local).length > 7 ? 21 : 26, letterSpacing: -0.5, fontVariant: ['tabular-nums'], fontFamily: F.x }}>{money(pg.amount, local)}</Text>
          <Text style={{ color: INK62, fontSize: 11, letterSpacing: 2, fontFamily: MONO }}>{'•••• •••• ••••'}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }}>
        {[0, 1].map((i) => <View key={i} style={{ width: i === page ? 18 : 5, height: 5, backgroundColor: i === page ? C.white : 'rgba(245,245,247,0.25)', borderRadius: 3 }} />)}
      </View>
      <View style={{ flexDirection: 'row', gap: 3, padding: 4, backgroundColor: C.ink, borderRadius: 999 }}>
        {(['wallet', 'route'] as const).map((n, i) => (
          <Pressable key={n} accessibilityRole="tab" accessibilityLabel={i ? 'Fares' : 'Forex card'} accessibilityState={{ selected: page === i }} onPress={() => setPage(i as 0 | 1)} style={{ justifyContent: 'center', alignItems: 'center', width: 36, height: 36, backgroundColor: page === i ? (i ? '#A9C4FF' : '#B9D98A') : 'transparent', borderRadius: 18 }}>
            <Ic n={n} color={page === i ? C.ink : C.mid} />
          </Pressable>
        ))}
      </View>
      <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: F.r }}>{pg.cap}</Text>
    </View>
  );
}

function SmallSpend({ trip, ctx, toast, onMore }: { trip: ObjectRecord<TripData>; ctx: LifeOSContext; toast: ReturnType<typeof useToast>; onMore: (amount: number) => void }) {
  const cur = trip.data.localCurrency ?? 'INR';
  const steps = cur === 'JPY' ? [100, 500, 1000, 2000, 5000] : cur === 'INR' ? [100, 250, 500, 1000, 2000] : [1, 5, 10, 20, 50];
  const [i, setI] = useState(1);
  const amt = steps[i]!;
  const [tw, setTw] = useState(120);
  const add = () => {
    const b = makeBill(ctx, 'Small spend', { amount: amt, currency: cur, rate: rateFor(trip, cur) ?? undefined, date: today(), category: 'other', split: { payers: { me: amt }, method: 'equal', shares: { me: 1 } }, tripId: trip.id, groupId: trip.data.groupId });
    toast.show({ message: `${money(amt, cur)} added, just you`, icon: 'check', undo: () => ctx.records.delete(b.id, 'user') });
  };
  const pct = (k: number) => `${(k / (steps.length - 1)) * 100}%` as const;
  return (
    <View style={{ gap: 12, padding: 16, backgroundColor: C.tile, borderRadius: 28, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1, color: C.white, fontSize: 34, letterSpacing: -1, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{money(amt, cur)}</Text>
        <View style={{ flexGrow: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel="More amounts" onPress={() => onMore(amt)} style={{ justifyContent: 'center', alignItems: 'center', width: 36, height: 36, backgroundColor: C.raised, borderRadius: 18 }}>
          <Ic n="sliders" size={15} />
        </Pressable>
      </View>
      <View accessibilityRole="adjustable" accessibilityLabel="Amount" accessibilityValue={{ text: money(amt, cur) }} onLayout={(e) => setTw(e.nativeEvent.layout.width)} style={{ height: 22, marginHorizontal: 6 }}>
        <View style={{ height: 3, top: '50%', right: 0, left: 0, marginTop: -1.5, position: 'absolute', backgroundColor: '#303036', borderRadius: 2 }} />
        <View style={{ width: pct(i), height: 3, top: '50%', left: 0, marginTop: -1.5, position: 'absolute', backgroundColor: C.lime, borderRadius: 2 }} />
        {steps.map((s, k) => <View key={s} style={{ width: 4, height: 4, top: '50%', left: pct(k), marginTop: -2, marginLeft: -2, position: 'absolute', backgroundColor: 'rgba(245,245,247,0.35)', borderRadius: 2 }} />)}
        <View style={{ width: 30, height: 20, top: '50%', left: pct(i), marginTop: -10, marginLeft: -15, position: 'absolute', backgroundColor: C.white, borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,.5)' }} />
        <View style={{ position: 'absolute', top: -8, bottom: -8, left: -6, right: -6, flexDirection: 'row' }} onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true} onResponderGrant={(e) => setI(Math.max(0, Math.min(steps.length - 1, Math.round(((e.nativeEvent.locationX - 6) / tw) * (steps.length - 1)))))} onResponderMove={(e) => setI(Math.max(0, Math.min(steps.length - 1, Math.round(((e.nativeEvent.locationX - 6) / tw) * (steps.length - 1)))))} />
      </View>
      <Text style={{ color: C.mid, fontSize: 13, fontFamily: F.r }}>Small spend? Add it.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`Add ${money(amt, cur)}, just you`} onPress={add} style={({ pressed }) => ({ justifyContent: 'center', alignItems: 'center', height: 46, backgroundColor: C.white, borderRadius: 999, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
        <Text style={{ color: C.ink, fontSize: 15, lineHeight: 20, fontFamily: F.s }}>Add</Text>
      </Pressable>
    </View>
  );
}

function RateRow({ trip, ctx, toast, lr, local }: { trip: ObjectRecord<TripData>; ctx: LifeOSContext; toast: ReturnType<typeof useToast>; lr: number; local: string }) {
  const [text, setText] = useState<string | null>(null);
  const save = () => {
    const r = Number(text);
    if (r > 0) {
      const prev = { fxRate: trip.data.fxRate, fxDate: trip.data.fxDate };
      ctx.records.update<TripData>(trip.id, { data: { fxRate: r, fxDate: today() } }, 'user');
      toast.show({ message: 'Rate changed', icon: 'check', undo: () => void ctx.records.update<TripData>(trip.id, { data: prev }, 'user') });
    }
    setText(null);
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: C.tile, borderRadius: 20 }}>
      <Ic n="swap" color={C.lime} />
      {text == null ? (
        <>
          <Text style={{ color: C.white, fontSize: 14, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{lr ? `${symOf(local).trim()}1 = ₹${lr.toFixed(4)}` : 'No rate yet'}</Text>
          {trip.data.fxDate ? <Text numberOfLines={1} style={{ flexShrink: 1, color: C.mid, fontSize: 12, fontFamily: F.r }}>{`· taken ${dayMonth(trip.data.fxDate)}`}</Text> : null}
          <View style={{ flexGrow: 1 }} />
          <Pressable accessibilityRole="button" accessibilityLabel="Edit the rate" hitSlop={10} onPress={() => setText(lr ? String(lr) : '')}>
            <Text style={{ color: C.lime, fontSize: 13, fontFamily: F.s }}>Edit rate</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={{ color: C.mid, fontSize: 14, fontFamily: F.b }}>{`${symOf(local).trim()}1 = ₹`}</Text>
          <TextInput autoFocus value={text} onChangeText={setText} onSubmitEditing={save} keyboardType="decimal-pad" accessibilityLabel={`₹ for one ${local}`} style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, color: C.white, fontSize: 14, fontFamily: F.b, padding: 0 }} />
          <Pressable accessibilityRole="button" hitSlop={10} onPress={save}>
            <Text style={{ color: C.lime, fontSize: 13, fontFamily: F.s }}>Save</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Settle up                                                            */
/* ------------------------------------------------------------------ */

function Settle({ trip, ctx, names }: { trip: ObjectRecord<TripData>; ctx: LifeOSContext; names: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const show = useShow(trip);
  const parties = tripParties(trip);
  const [me, setMe] = useState<Party>('me');
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'spend' | 'payment'>('all');
  const [many, setMany] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const d = useLive((os) => {
    const tr = os.records.get<TripData>(trip.id) ?? trip;
    const group = tr.data.groupId ? os.records.get<{ simplifyDebts?: boolean }>(tr.data.groupId) : null;
    return { b: tripBalances(os, tr), bills: tripBills(os, tr.id) as ObjectRecord<BillData>[], pending: notInSettleUp(os, tr), group };
  }, [trip.id, trip.version]);
  const n = (p: Party) => names[p] ?? 'Someone';
  const isMe = me === 'me';
  const net = d.b.net[me] ?? 0;
  const owes = d.b.debts.filter((x) => x.from === me);
  const owed = d.b.debts.filter((x) => x.to === me);
  const main = net < -0.5 ? owes[0] : net > 0.5 ? owed[0] : undefined;
  const other = main ? (main.from === me ? main.to : main.from) : null;
  const cardBg = other ? faceColor(parties, other) : C.lime;
  const summary = () => [`${trip.data.destination || trip.title} · settle up`, ...d.b.debts.map((x) => `${n(x.from)} ${x.from === 'me' ? 'owe' : 'owes'} ${n(x.to) === 'You' ? 'you' : n(x.to)} ${money(x.amount)}`), ...(d.b.debts.length ? [] : ['All settled up.'])].join('\n');
  const remind = () => void Share.share({ message: summary() }).catch(() => undefined);
  const pay = (from: Party, to: Party, amount: number) => router.push(tripRoutes.payback(trip.id, from, to, amount));
  const del = (b: ObjectRecord<BillData>) => {
    ctx.records.delete(b.id, 'user');
    setOpen(null);
    toast.show({ message: b.data.kind === 'payment' ? 'Payback deleted' : 'Expense deleted', icon: 'trash', undo: () => void ctx.records.restore(b.id) });
  };
  const addPending = (x: (typeof d.pending)[number]) => {
    const payer = x.e.data.paidBy ?? 'me';
    const who = x.e.data.kind === 'ticket' ? ((x.e.data.personIds ?? []).length ? x.e.data.personIds! : ['me']) : ['me', ...(x.e.data.personIds ?? [])];
    const bill = makeBill(ctx, x.e.title.replace(/^(Stay|Ticket) · /, ''), { amount: x.amount, currency: x.currency, rate: rateFor(trip, x.currency) ?? undefined, date: today(), category: x.e.data.kind === 'ticket' ? 'flights' : 'stays', split: { payers: { [payer]: x.amount }, method: 'equal', shares: Object.fromEntries(who.map((p) => [p, 1])) }, tripId: trip.id, groupId: trip.data.groupId, eventId: x.e.id });
    toast.show({ message: 'Added to Settle up', icon: 'check', undo: () => ctx.records.delete(bill.id, 'user') });
  };
  const list = d.bills.filter((b) => filter === 'all' || b.data.kind === filter);
  const shown = many ? list : list.slice(0, 8);
  const spends = d.bills.filter((b) => b.data.kind === 'spend').length;
  const pays = d.bills.length - spends;
  const payCount = (p: Party) => d.bills.filter((b) => b.data.kind === 'payment' && (b.data.split.payers[p] ?? 0) > 0).length;
  const pendingInr = d.pending.reduce((a, x) => a + x.amount * (rateFor(trip, x.currency) ?? 0), 0);
  const stat = (l: string, v: number) => (
    <View key={l}>
      <Text style={{ color: C.mid, fontSize: 12, lineHeight: 15, fontFamily: F.r }}>{l}</Text>
      <Text numberOfLines={1} style={{ color: C.white, fontSize: 16, lineHeight: 20, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{show(v)}</Text>
    </View>
  );
  return (
    <>
      {parties.length > 1 ? (
        <Anim k="jr" delay={170} style={{ gap: 6 }}>
          <Label>YOU ARE</Label>
          <Bleed>
            {parties.map((p) => {
              const on = p === me;
              return (
                <Pressable key={p} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`See it as ${n(p)}`} onPress={() => setMe(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 4, paddingRight: 12, backgroundColor: on ? C.white : C.raised, borderRadius: 18 }}>
                  <Face name={n(p)} color={faceColor(parties, p)} size={28} font={10} />
                  <Text style={{ color: on ? C.ink : C.white, fontSize: 13, fontFamily: F.s }}>{n(p)}</Text>
                </Pressable>
              );
            })}
          </Bleed>
        </Anim>
      ) : null}

      <Anim k="jr" delay={230} style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ gap: 6, minWidth: 0, padding: 14, backgroundColor: cardBg, borderRadius: 26, flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ justifyContent: 'center', alignItems: 'center', width: 40, height: 40, backgroundColor: C.ink, borderRadius: 20 }}>
              <Ic n={main ? 'repeat' : 'check'} size={18} color={cardBg} />
            </View>
            <Text style={{ color: INK62, fontSize: 10, letterSpacing: 1, fontFamily: MONO }}>{net < -0.5 ? (isMe ? 'YOU OWE' : 'OWES') : net > 0.5 ? (isMe ? 'YOU’RE OWED' : 'IS OWED') : 'SETTLED'}</Text>
          </View>
          <View style={{ paddingTop: 4 }}>
            <Anim k="jroll">
              <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: C.ink, fontSize: 36, lineHeight: 40, letterSpacing: -1, textAlign: 'center', fontVariant: ['tabular-nums'], fontFamily: F.x }}>{show(Math.abs(net))}</Text>
            </Anim>
            <Text numberOfLines={1} style={{ color: INK62, fontSize: 13, textAlign: 'center', fontFamily: F.b }}>{other ? `${main!.from === me ? 'to' : 'from'} ${n(other)}${(main!.from === me ? owes : owed).length > 1 ? ` +${(main!.from === me ? owes : owed).length - 1}` : ''}` : 'nobody owes anyone'}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            {main ? (
              <Pressable accessibilityRole="button" accessibilityLabel={main.from === me ? `Pay ${n(main.to)}` : `Record what ${n(main.from)} paid`} onPress={() => pay(main.from, main.to, main.amount)} style={({ pressed }) => ({ justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 44, backgroundColor: C.ink, borderRadius: 999, opacity: pressed ? 0.85 : 1 })}>
                <Text style={{ color: C.white, fontSize: 14, lineHeight: 20, fontFamily: F.s }}>{main.from === me ? 'Pay' : 'Record'}</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Remind: share who owes whom" onPress={remind} style={({ pressed }) => ({ justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 44, backgroundColor: C.ink, borderRadius: 999, opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ color: C.white, fontSize: 14, lineHeight: 20, fontFamily: F.s }}>Remind</Text>
            </Pressable>
          </View>
        </View>
        <View style={{ gap: 8, minWidth: 0, padding: 14, backgroundColor: C.tile, borderRadius: 26, overflow: 'hidden', flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
          <Label>{isMe ? 'YOUR BALANCE' : `${n(me).toUpperCase()}’S BALANCE`}</Label>
          {stat(isMe ? 'You paid for' : 'Paid for', d.b.paid[me] ?? 0)}
          {stat(isMe ? 'Your share' : 'Share', d.b.share[me] ?? 0)}
          {stat('Payments made', d.b.sent[me] ?? 0)}
          {stat('Received', d.b.received[me] ?? 0)}
        </View>
      </Anim>

      <Anim k="jr" delay={290} style={{ flexDirection: 'row', gap: 6 }}>
        {([
          ['Log a spend', 'plus', () => router.push(tripRoutes.spend(trip.id))],
          ['Split a receipt photo', 'receipt', () => router.push(tripRoutes.receipt(trip.id))],
          ['Split a bill', 'scissors', () => router.push({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'spend', trip: trip.id, split: 'exact' } } as never)],
          ['Record a payback', 'repeat', () => (owes[0] ? pay(owes[0].from, owes[0].to, owes[0].amount) : router.push(tripRoutes.payback(trip.id)))],
        ] as const).map(([label, icon, go]) => (
          <Pressable key={label} accessibilityRole="button" onPress={go} style={({ pressed }) => ({ alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 4, backgroundColor: C.tile, borderRadius: 20, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, opacity: pressed ? 0.8 : 1 })}>
            <View style={{ justifyContent: 'center', alignItems: 'center', width: 40, height: 40, backgroundColor: C.raised, borderRadius: 20 }}>
              <Ic n={icon} size={18} color={C.lime} />
            </View>
            <Text style={{ color: C.mid, fontSize: 11, lineHeight: 14, textAlign: 'center', fontFamily: F.s }}>{label}</Text>
          </Pressable>
        ))}
      </Anim>

      {parties.length > 1 ? (
        <Anim k="jr" delay={350}>
          <View style={{ ...card, gap: 4 }}>
            <CardHead
              title="Who owes whom"
              sub={d.b.debts.length ? `${['', 'one payback', 'two paybacks', 'three paybacks', 'four paybacks'][d.b.debts.length] ?? `${d.b.debts.length} paybacks`} ${d.b.debts.length === 1 ? 'settles' : 'settle'} it` : 'nobody owes anyone'}
              right={
                trip.data.groupId && d.group ? (
                  <Pressable accessibilityRole="switch" accessibilityState={{ checked: !!d.group.data.simplifyDebts }} accessibilityLabel="Simplify debts" onPress={() => ctx.records.update(trip.data.groupId!, { data: { simplifyDebts: !d.group?.data.simplifyDebts } }, 'user')} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, backgroundColor: d.group.data.simplifyDebts ? 'rgba(215,245,92,0.16)' : C.raised, borderRadius: 999 }}>
                    {d.group.data.simplifyDebts ? <Ic n="check" size={13} color={C.lime} /> : null}
                    <Text style={{ color: d.group.data.simplifyDebts ? C.lime : C.mid, fontSize: 12, lineHeight: 16, fontFamily: F.s }}>{d.group.data.simplifyDebts ? 'Simplified' : 'Simplify'}</Text>
                  </Pressable>
                ) : (
                  <Tag>INR</Tag>
                )
              }
            />
            <OwesGraph parties={parties} b={d.b} names={names} show={show} me={me} onPay={(x) => pay(x.from, x.to, x.amount)} />
          </View>
        </Anim>
      ) : null}

      {parties.length > 1 ? (
        <>
          <Anim k="jr" delay={410} style={{ paddingTop: 10, paddingHorizontal: 4 }}>
            <Text style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: F.s }}>Group balances</Text>
          </Anim>
          <Anim k="jr" delay={470}>
            <View style={{ padding: 14, backgroundColor: C.tile, borderRadius: 24, gap: 8 }}>
              {[...parties].sort((a, b) => (d.b.net[b] ?? 0) - (d.b.net[a] ?? 0)).map((p, i) => {
                const v = d.b.net[p] ?? 0;
                const sent = d.b.sent[p] ?? 0;
                const k = payCount(p);
                const sub = sent > 0.5 ? `paid back ${show(sent)} in ${k} ${k === 1 ? 'payment' : 'payments'}` : (d.b.paid[p] ?? 0) > 0.5 ? `paid for ${show(d.b.paid[p] ?? 0)} · share ${show(d.b.share[p] ?? 0)}` : `share ${show(d.b.share[p] ?? 0)}`;
                return (
                  <React.Fragment key={p}>
                    {i ? <View style={{ height: 1, backgroundColor: C.line }} /> : null}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 }}>
                      <Face name={n(p)} color={faceColor(parties, p)} size={40} font={14} />
                      <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
                        <Text numberOfLines={1} style={{ color: C.white, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, fontFamily: F.s }}>{n(p)}</Text>
                        <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: F.m }}>{sub}</Text>
                      </View>
                      <Text numberOfLines={1} style={{ color: v > 0.5 ? C.lime : C.white, fontSize: 16, lineHeight: 21, fontVariant: ['tabular-nums'], fontFamily: F.b, flexShrink: 0 }}>{v > 0.5 ? '+' : ''}{show(v)}</Text>
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          </Anim>
        </>
      ) : null}

      <Anim k="jr" delay={530}>
        <View style={{ ...card, gap: 4 }}>
          <CardHead title="Expenses and payments" sub={`${spends} ${spends === 1 ? 'expense' : 'expenses'} · ${pays} ${pays === 1 ? 'payment' : 'payments'}`} right={<PillButton label={filter === 'all' ? 'All' : filter === 'spend' ? 'Expenses' : 'Paybacks'} icon="down" a11y="Filter the list" onPress={() => setFilter(filter === 'all' ? 'spend' : filter === 'spend' ? 'payment' : 'all')} />} />
          {shown.map((b) => {
            const pay = b.data.kind === 'payment';
            const inr = billInrOf(b.data, trip);
            const payer = Object.keys(b.data.split.payers)[0] ?? 'me';
            if (open === b.id) {
              const owedBy = owedOf(b.data.amount, b.data.split);
              const f = b.data.amount ? inr / b.data.amount : 0;
              return (
                <View key={b.id} style={{ gap: 10, padding: 12, marginVertical: 2, marginHorizontal: -2, backgroundColor: C.raised, borderRadius: 18 }}>
                  <Pressable accessibilityRole="button" accessibilityHint="Opens how it split" onPress={() => router.push(tripRoutes.bill(b.id))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: F.s }}>{b.title}</Text>
                      <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: F.m }}>{pay ? `${dayMonth(b.data.date)} · payback` : `${dayMonth(b.data.date)} · ${catLabel(b.data.category)} · paid by ${n(payer)}`}</Text>
                    </View>
                    <Text style={{ color: C.white, fontSize: 16, lineHeight: 21, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{show(inr)}</Text>
                    <Ic n="right" color={MUTED} />
                  </Pressable>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(owedBy).filter(([, v]) => v > 0.005).map(([p, v]) => (
                      <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingLeft: 3, paddingRight: 10, backgroundColor: '#303036', borderRadius: 15 }}>
                        <Face name={n(p)} color={faceColor(parties, p)} size={24} font={9} />
                        <Text style={{ color: C.white, fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: F.s }}>{show(v * f)}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {!pay ? (
                      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'spend', trip: trip.id, bill: b.id } } as never)} style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 8, height: 38, backgroundColor: C.raised, borderRadius: 999, opacity: pressed ? 0.8 : 1 })}>
                        <Ic n="pencil" size={17} color={C.lime} />
                        <Text style={{ color: C.white, fontSize: 13, lineHeight: 20, fontFamily: F.s }}>Edit</Text>
                      </Pressable>
                    ) : null}
                    <Pressable accessibilityRole="button" onPress={() => del(b)} style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 8, height: 38, borderWidth: 1.5, borderColor: 'rgba(245,245,247,0.28)', borderRadius: 999, opacity: pressed ? 0.8 : 1 })}>
                      <Ic n="x" size={17} color={C.lime} />
                      <Text style={{ color: C.white, fontSize: 13, lineHeight: 20, fontFamily: F.s }}>Delete</Text>
                    </Pressable>
                  </View>
                </View>
              );
            }
            return (
              <Pressable key={b.id} accessibilityRole="button" accessibilityState={{ expanded: false }} onPress={() => setOpen(b.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54 }}>
                <View style={{ justifyContent: 'center', alignItems: 'center', flexShrink: 0, width: 36, height: 36, backgroundColor: C.raised, borderRadius: 18 }}>
                  <Ic n={pay ? 'repeat' : CAT_ICON[b.data.category ?? 'other'] ?? 'file'} color={C.mid} />
                </View>
                <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.white, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, fontFamily: F.s }}>{b.title}</Text>
                  <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: F.m }}>{pay ? `${dayMonth(b.data.date)} · ${show(inr)}` : `${dayMonth(b.data.date)} · ${splitWords(b.data, names, parties)}`}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 3 }}>
                  <Text numberOfLines={1} style={{ color: C.white, fontSize: 16, lineHeight: 21, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{show(inr)}</Text>
                  <Tag on={pay}>{pay ? 'Settlement' : 'Expense'}</Tag>
                </View>
              </Pressable>
            );
          })}
          {list.length > 8 && !many ? (
            <Pressable accessibilityRole="button" onPress={() => setMany(true)} style={{ minHeight: 44, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: C.lime, fontSize: 13, fontFamily: F.s }}>{`Show all ${list.length}`}</Text>
            </Pressable>
          ) : null}
          {!list.length ? <Text style={{ color: C.mid, fontSize: 13, paddingVertical: 10, fontFamily: F.r }}>No spends yet. Log one, or split a receipt photo.</Text> : null}
        </View>
      </Anim>

      {d.pending.length ? (
        <Anim k="jr" delay={590}>
          <View style={{ gap: 12, padding: 14, backgroundColor: C.tile, borderRadius: 24, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ justifyContent: 'center', alignItems: 'center', width: 40, height: 40, backgroundColor: C.raised, borderRadius: 20 }}>
                <Ic n="ticket" size={18} color="#FFB547" />
              </View>
              <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: F.s }}>Not in Settle up yet</Text>
                <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: F.m }}>{`${d.pending.length} ${d.pending.length === 1 ? 'booking' : 'bookings'} paid, not split · ${show(pendingInr)}`}</Text>
              </View>
              <PillButton label={pendingOpen ? 'Hide' : 'Show them'} h={36} onPress={() => setPendingOpen(!pendingOpen)} />
            </View>
            {pendingOpen
              ? d.pending.map((x) => (
                  <View key={x.e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, borderTopWidth: 1, borderTopColor: C.line }}>
                    <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, fontFamily: F.s }}>{x.e.title.replace(/^(Stay|Ticket) · /, '')}</Text>
                      <Text style={{ color: C.mid, fontSize: 12, fontFamily: F.r }}>{`${money(x.amount, x.currency)} paid${x.e.data.paidBy ? ` by ${n(x.e.data.paidBy)}` : ''}`}</Text>
                    </View>
                    <PillButton label="Add" icon="plus" h={32} onPress={() => addPending(x)} />
                  </View>
                ))
              : null}
          </View>
        </Anim>
      ) : null}
    </>
  );
}

/* Who owes whom, drawn ---------------------------------------------- */

function OwesGraph({ parties, b, names, show, me, onPay }: { parties: Party[]; b: Balances; names: Record<string, string>; show: (n: number, c?: boolean) => string; me: Party; onPay: (x: { from: Party; to: Party; amount: number }) => void }) {
  const [w, setW] = useState(318);
  const H = parties.length > 3 ? 300 : 270;
  const order = useMemo(() => [...parties].sort((a, c) => (b.net[c] ?? 0) - (b.net[a] ?? 0)), [parties, b]);
  const pos: Record<Party, { x: number; y: number }> = {};
  if (order.length === 2) {
    pos[order[0]!] = { x: w - 64, y: 110 };
    pos[order[1]!] = { x: 64, y: 110 };
  } else if (order.length === 3) {
    pos[order[0]!] = { x: w / 2, y: 54 };
    pos[order[1]!] = { x: w - 64, y: 196 };
    pos[order[2]!] = { x: 64, y: 196 };
  } else {
    const r = Math.min(w / 2 - 40, 110);
    order.forEach((p, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / order.length;
      pos[p] = { x: w / 2 + r * Math.cos(a), y: 140 + r * Math.sin(a) };
    });
  }
  const edges = b.debts.map((x) => {
    const A = pos[x.from]!;
    const B = pos[x.to]!;
    const dx = B.x - A.x, dy = B.y - A.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const s = { x: A.x + ux * 34, y: A.y + uy * 34 };
    const e = { x: B.x - ux * 38, y: B.y - uy * 38 };
    const c = { x: (s.x + e.x) / 2 - uy * 14, y: (s.y + e.y) / 2 + ux * 14 };
    const mid = { x: 0.25 * s.x + 0.5 * c.x + 0.25 * e.x, y: 0.25 * s.y + 0.5 * c.y + 0.25 * e.y };
    const ang = Math.atan2(e.y - c.y, e.x - c.x);
    const head = [ang - 0.5, ang + 0.5].map((t) => `M${(e.x - 9 * Math.cos(t)).toFixed(1)} ${(e.y - 9 * Math.sin(t)).toFixed(1)} L${e.x.toFixed(1)} ${e.y.toFixed(1)}`).join(' ');
    const label = show(x.amount);
    const lw = Math.max(64, label.length * 8 + 16);
    return { x, d: `M${s.x.toFixed(1)} ${s.y.toFixed(1)} Q ${c.x.toFixed(1)} ${c.y.toFixed(1)} ${e.x.toFixed(1)} ${e.y.toFixed(1)}`, head, mid, label, lw };
  });
  const top = order[0];
  return (
    <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={{ height: H }}>
      <Svg width={w} height={H} style={{ position: 'absolute', top: 0, left: 0 }}>
        {edges.map((g) => (
          <React.Fragment key={`${g.x.from}-${g.x.to}`}>
            <Path d={g.d} fill="none" stroke={C.lime} strokeWidth={2.5} strokeLinecap="round" strokeDasharray="6 7" />
            <Path d={g.head} fill="none" stroke={C.lime} strokeWidth={2.5} strokeLinecap="round" />
          </React.Fragment>
        ))}
      </Svg>
      {edges.map((g) => (
        <Pressable key={`l${g.x.from}-${g.x.to}`} accessibilityRole="button" accessibilityLabel={`${names[g.x.from] ?? 'Someone'} pays ${names[g.x.to] ?? 'someone'} ${g.label}`} onPress={() => onPay(g.x)} style={{ position: 'absolute', left: g.mid.x - g.lw / 2, top: g.mid.y - 14, width: g.lw, height: 28, borderRadius: 14, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.ink, fontSize: 13, fontVariant: ['tabular-nums'], fontFamily: F.x }}>{g.label}</Text>
        </Pressable>
      ))}
      {order.map((p) => {
        const at = pos[p]!;
        const ring = p === top && (b.net[p] ?? 0) > 0.5;
        return (
          <View key={p} style={{ position: 'absolute', left: at.x - 40, top: at.y - 30, width: 80, alignItems: 'center', gap: 6 }}>
            <View style={{ justifyContent: 'center', alignItems: 'center', width: 60, height: 60, backgroundColor: faceColor(parties, p), borderRadius: 30, boxShadow: ring ? `0 0 0 3px ${C.tile},0 0 0 5px ${C.lime}` : undefined }}>
              <Text style={{ color: C.ink, fontSize: 22, fontFamily: F.x }}>{(names[p] ?? '?').slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text numberOfLines={1} style={{ color: C.white, fontSize: 12, fontFamily: F.b }}>{names[p] ?? 'Someone'}</Text>
          </View>
        );
      })}
    </View>
  );
}

export { billInrOf };
