import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useToast } from '@ui/kit';
import {
  byCategory,
  CATEGORY_LABEL,
  checklistOf,
  isDone,
  moneyOf,
  nextTripCard,
  nightsOf,
  payWord,
  projectedOf,
  rateFor,
  SECTION_LABEL,
  sectionsOf,
  statusOf,
  stopsOf,
  stopSpan,
  tripLedger,
  tripOthers,
  tripParties,
  tripStays,
  tripTickets,
  viewFlights,
  viewPassTime,
  viewStayDates,
  viewStayStop,
  type StopData,
  type TravelEvent,
  type TripData,
} from '@modules/travel';
import { NextCard } from '../home';
import { Anim, JP_SANS, JP_SERIF, MONO } from './kit';
import { C, FACE, scriptName, setMoneyUnit, symOf, tripRoutes, useMoneyUnit, useShow } from './shell';

/**
 * View-only (JP-ViewOnly): what someone with the trip's link sees. The white
 * banner says so (Exit goes back); the header carries a View only pill; every
 * section reads the trip without its references, payment notes or papers, and
 * nothing can be added, edited or cancelled. The bar switches sections here
 * instead of opening the editable screens.
 */

type Tab = 'overview' | 'plan' | 'bookings' | 'money' | 'prep';
const TAB_LABEL: Record<Tab, string> = { overview: 'Overview', plan: 'Plan', bookings: 'Bookings', money: 'Money', prep: 'Prep' };

const SANS = 'PlusJakartaSans_500Medium';
const SEMI = 'PlusJakartaSans_600SemiBold';
const BOLD = 'PlusJakartaSans_700Bold';
const XBOLD = 'PlusJakartaSans_800ExtraBold';
const REG = 'PlusJakartaSans_400Regular';

const STOP_HEX: Record<string, string> = { green: '#5FD08A', teal: '#4CC9D4', indigo: '#8C9DFF', persimmon: '#FF9A4D', wood: '#C99A6E', plum: '#E08BC8', crimson: '#FF6B7A', gold: '#F2C94C', sky: '#6CC6FF', slate: '#95A1B2' };
const DISC_ORDER = ['green', 'teal', 'indigo', 'persimmon', 'wood', 'plum', 'crimson', 'gold', 'sky', 'slate'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayName = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

const EYE_OFF = ['M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49', 'M14.084 14.158a3 3 0 0 1-4.242-4.242', 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143', 'm2 2 20 20'];
const PLANE = 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z';

const Icon = ({ d, size = 18, color = C.white, children }: { d?: string[]; size?: number; color?: string; children?: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {d?.map((x) => <Path key={x} d={x} />)}
    {children}
  </Svg>
);

function Round({ label, onPress, children, on }: { label: string; onPress: () => void; children: React.ReactNode; on?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={on != null ? { selected: on } : undefined} onPress={onPress} hitSlop={4} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: on ? C.white : C.raised, alignItems: 'center', justifyContent: 'center', flexShrink: 0, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      {children}
    </Pressable>
  );
}

const Chip = ({ label, color = C.mid, bg = C.raised, icon }: { label: string; color?: string; bg?: string; icon?: string[] }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 26, paddingHorizontal: 11, borderRadius: 999, backgroundColor: bg, flexShrink: 1, minWidth: 0 }}>
    {icon ? <Icon d={icon} size={13} color={color} /> : null}
    <Text numberOfLines={1} style={{ flexShrink: 1, color, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: SEMI }}>{label}</Text>
  </View>
);

const Pill = ({ label }: { label: string }) => (
  <View style={{ height: 22, paddingHorizontal: 9, borderRadius: 999, backgroundColor: C.raised, justifyContent: 'center', flexShrink: 0 }}>
    <Text numberOfLines={1} style={{ color: C.mid, fontSize: 11, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: SEMI }}>{label}</Text>
  </View>
);

function Title({ title, sub }: { title: string; sub?: string | null }) {
  return (
    <View style={{ paddingTop: 10, paddingHorizontal: 4, gap: 1 }}>
      <Text accessibilityRole="header" numberOfLines={1} style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: SEMI }}>{title}</Text>
      {sub ? <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: SANS }}>{sub}</Text> : null}
    </View>
  );
}

const Foot = ({ children, onPress }: { children: string; onPress?: () => void }) => (
  <Pressable disabled={!onPress} accessibilityRole={onPress ? 'button' : 'text'} onPress={onPress} style={{ paddingVertical: 4 }}>
    <Text style={{ color: C.low, fontSize: 13, textAlign: 'center', fontFamily: REG }}>{children}</Text>
  </Pressable>
);

/** The contributors-only line. */
const Hidden = ({ children }: { children: string }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.tile }}>
    <Icon d={EYE_OFF} size={16} color={C.mid} />
    <Text style={{ flexShrink: 1, color: C.mid, fontSize: 13, fontFamily: SEMI }}>{children}</Text>
  </View>
);

/** A stop's disc: its colour, its mark (the local name's first character in mincho). */
function StopDisc({ stop, index, japan, size = 44 }: { stop: ObjectRecord<StopData> | null; index: number; japan: boolean; size?: number }) {
  const color = STOP_HEX[stop?.data.color ?? ''] ?? STOP_HEX[DISC_ORDER[index % DISC_ORDER.length]!]!;
  const mark = stop ? (japan && stop.data.localName ? [...stop.data.localName][0]! : (stop.title.trim()[0] ?? '?').toUpperCase()) : '·';
  const kanji = japan && !!stop?.data.localName;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text style={{ color: C.ink, fontSize: size * 0.45, lineHeight: size * 0.55, fontFamily: kanji ? JP_SERIF : BOLD, fontWeight: kanji ? '800' : undefined }}>{mark}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Header and bar (the shell's, read-only)                              */
/* ------------------------------------------------------------------ */

function Banner({ onExit }: { onExit: () => void }) {
  return (
    <Anim k="jr" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 14, paddingRight: 12, backgroundColor: C.white, borderRadius: 18 }}>
      <Icon d={EYE_OFF} size={16} color={C.ink} />
      <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
        <Text style={{ color: C.ink, fontSize: 14, fontFamily: XBOLD }}>View-only preview</Text>
        <Text style={{ color: 'rgba(11,11,13,0.62)', fontSize: 12, fontFamily: SEMI }}>what someone with the link sees</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Exit the view-only preview" onPress={onExit} style={({ pressed }) => ({ height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.ink, justifyContent: 'center', flexShrink: 0, opacity: pressed ? 0.8 : 1 })}>
        <Text style={{ color: C.white, fontSize: 13, lineHeight: 20, fontFamily: SEMI }}>Exit</Text>
      </Pressable>
    </Anim>
  );
}

function Header({ trip, tab, onBack, searching, onSearch }: { trip: ObjectRecord<TripData>; tab: Tab; onBack: () => void; searching: boolean; onSearch: () => void }) {
  const u = useMoneyUnit();
  const local = trip.data.localCurrency && trip.data.localCurrency !== 'INR' ? trip.data.localCurrency : null;
  const script = scriptName(trip);
  return (
    <Anim k="jr" delay={50} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 2 }}>
      <Round label="All trips" onPress={onBack}>
        <Icon d={['m12 19-7-7 7-7', 'M19 12H5']} />
      </Round>
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.vermilion }} />
          <Text numberOfLines={1} style={{ flexShrink: 1, color: C.mid, fontSize: 10, letterSpacing: 1.5, fontFamily: MONO }}>{TAB_LABEL[tab].toUpperCase()}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ flexShrink: (trip.data.destination || trip.title).length > 10 ? 1 : 0, color: C.white, fontSize: 22, lineHeight: 26, letterSpacing: -0.4, fontFamily: BOLD }}>{trip.data.destination || trip.title}</Text>
          {script ? <Text style={{ flexShrink: 1, minWidth: 13, marginLeft: 4, color: C.mid, fontSize: 13, fontFamily: JP_SANS, fontWeight: '700' }}>{script}</Text> : null}
          <View style={{ marginLeft: 6, flexShrink: 0 }}>
            <Pill label="View only" />
          </View>
        </View>
      </View>
      <Round label={searching ? 'Close the search' : 'Find in this trip'} onPress={onSearch} on={searching}>
        <Icon d={['m21 21-4.3-4.3']} color={searching ? C.ink : C.white}>
          <Circle cx={11} cy={11} r={8} />
        </Icon>
      </Round>
      {local ? (
        <View style={{ flexDirection: 'row', padding: 3, backgroundColor: C.raised, borderRadius: 999, flexShrink: 0 }}>
          {(['inr', 'local'] as const).map((x) => (
            <Pressable key={x} accessibilityRole="button" accessibilityLabel={x === 'inr' ? 'Show rupees' : `Show ${local}`} accessibilityState={{ selected: u === x }} onPress={() => setMoneyUnit(x)} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: u === x ? C.white : 'transparent' }}>
              <Text style={{ color: u === x ? C.ink : C.mid, fontSize: 13, fontFamily: BOLD }}>{x === 'inr' ? '₹' : symOf(local).trim()}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Anim>
  );
}

const BAR: Array<{ key: Tab; d: string[]; circle?: boolean }> = [
  { key: 'overview', d: ['m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z'], circle: true },
  { key: 'plan', d: ['M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z', 'M15 5.764v15', 'M9 3.236v15'] },
  { key: 'bookings', d: ['M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z', 'M13 5v2', 'M13 17v2', 'M13 11v2'] },
  { key: 'money', d: ['M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'] },
  { key: 'prep', d: ['m3 17 2 2 4-4', 'm3 7 2 2 4-4', 'M13 6h8', 'M13 12h8', 'M13 18h8'] },
];

/** The trip bar, switching the read-only sections; the copilot stays with contributors. */
function ViewBar({ tab, onTab, onCopilot }: { tab: Tab; onTab: (t: Tab) => void; onCopilot: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(20, insets.bottom + 8), paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'center', gap: 3, padding: 5, backgroundColor: C.tile, borderWidth: 1, borderColor: C.line, borderRadius: 999, boxShadow: '0 12px 30px rgba(0,0,0,0.5)' }}>
        {BAR.map((b) => {
          const on = b.key === tab;
          return (
            <Pressable key={b.key} accessibilityRole="tab" accessibilityLabel={TAB_LABEL[b.key]} accessibilityState={{ selected: on }} onPress={() => onTab(b.key)} style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.lime : 'transparent', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
              <Icon size={21} color={on ? C.ink : C.mid} d={b.d}>
                {b.circle ? <Circle cx={12} cy={12} r={10} /> : null}
              </Icon>
            </Pressable>
          );
        })}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Ask the trip copilot" onPress={onCopilot} style={({ pressed }) => ({ width: 62, height: 62, borderRadius: 31, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(215,245,92,0.25)', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <Icon size={26} color={C.ink} d={['M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z']} />
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

type Names = Record<string, string>;
const hit = (q: string) => (s: string | null | undefined) => !q || (s ?? '').toLowerCase().includes(q);

function Bookings({ trip, names, q }: { trip: ObjectRecord<TripData>; names: Names; q: string }) {
  const show = useShow(trip);
  const [all, setAll] = useState(false);
  const d = useLive(
    (os) => {
      const stays = tripStays(os, trip.id).filter((e) => statusOf(e) !== 'cancelled');
      const stops = stopsOf(os, trip.id);
      return {
        journeys: viewFlights(os, trip.id),
        tickets: tripTickets(os, trip.id).filter((e) => statusOf(e) !== 'cancelled'),
        stays: stays.map((e) => ({ e, stop: viewStayStop(os, e), index: Math.max(0, stops.findIndex((s) => s.id === e.data.stopId)) })),
        others: tripOthers(os, trip.id).filter((e) => statusOf(e) !== 'cancelled'),
      };
    },
    [trip.id, trip.version],
  );
  const f = hit(q);
  const japan = trip.data.look === 'japan' || !!scriptName(trip);
  const journeys = d.journeys.filter((j) => f([j.from, j.to, ...j.via, ...j.legs.map((l) => `${l.flightNo ?? ''} ${l.airline ?? ''}`)].join(' ')));
  const stays = d.stays.filter((s) => f(s.e.title) || f(s.stop?.title));
  const others = d.others.filter((e) => f(e.title));
  const parties = tripParties(trip);
  const priceOf = (e: ObjectRecord<TravelEvent>) => {
    const m = moneyOf(e);
    if (m.total == null) return null;
    const rate = rateFor(trip, m.currency);
    return rate != null ? show(m.total * rate) : `${symOf(m.currency)}${Math.round(m.total).toLocaleString('en-US')}`;
  };
  const airlines = [...new Set(d.journeys.flatMap((j) => j.legs.map((l) => l.airline).filter(Boolean)))] as string[];
  const confirmed = d.journeys.length > 0 && d.journeys.every((j) => j.legs.every((l) => l.confirmed));
  const ticketToPay = d.tickets.reduce((n, e) => n + moneyOf(e).toPay * (rateFor(trip, moneyOf(e).currency) ?? 0), 0);
  const payers = [...new Set(d.tickets.map((e) => e.data.paidBy ?? 'me'))];
  const payLine = !d.tickets.length ? null : ticketToPay > 0.5 ? `${show(ticketToPay)} to pay` : payers.length === 1 ? `Paid by ${names[payers[0]!] ?? 'someone'} · nothing to pay` : 'Paid · nothing to pay';
  const shown = all || q ? stays : stays.slice(0, 5);
  const more = stays.length - shown.length;
  return (
    <>
      {journeys.length ? (
        <Anim k="jr" delay={150} style={{ backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' }}>
          <View style={{ gap: 18, padding: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: C.low, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontFamily: SEMI }}>{['FLIGHTS', ...airlines.map((a) => a.toUpperCase())].join(' · ')}</Text>
              <View style={{ flexGrow: 1 }} />
              <Anim k="jstamp" style={{ paddingVertical: 2, paddingHorizontal: 8, borderWidth: 2, borderColor: confirmed ? C.lime : C.amber, borderRadius: 8, transform: [{ rotate: '-6deg' }] }}>
                <Text style={{ color: confirmed ? C.lime : C.amber, fontSize: 11, letterSpacing: 2, fontFamily: MONO }}>{confirmed ? 'CONFIRMED' : 'PENDING'}</Text>
              </Anim>
            </View>
            {journeys.map((j) => (
              <View key={j.legs[0]!.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <View style={{ flexShrink: 0 }}>
                  <Text style={{ color: C.white, fontSize: 30, lineHeight: 30, letterSpacing: 1, fontFamily: XBOLD }}>{j.from}</Text>
                  <Text style={{ color: C.mid, fontSize: 10, lineHeight: 14, marginTop: 4, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{viewPassTime(j.departAt)}</Text>
                </View>
                <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, alignItems: 'center', gap: 4, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.white, fontSize: 10, letterSpacing: 0.9, fontFamily: MONO }}>{j.legs.map((l) => l.flightNo).filter(Boolean).join(' · ') || 'FLIGHT'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' }}>
                    <View style={{ flexGrow: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                    <Icon d={[PLANE]} size={14} color={C.lime} />
                    <View style={{ flexGrow: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                  </View>
                  <Text numberOfLines={1} style={{ color: C.low, fontSize: 10, letterSpacing: 0.9, fontFamily: MONO }}>{j.via.length ? `via ${j.via.join(', ')}` : 'direct'}</Text>
                </View>
                <View style={{ flexShrink: 0 }}>
                  <Text style={{ color: C.white, fontSize: 30, lineHeight: 30, letterSpacing: 1, textAlign: 'right', fontFamily: XBOLD }}>{j.to}</Text>
                  <Text style={{ color: C.mid, fontSize: 10, lineHeight: 14, marginTop: 4, letterSpacing: 0.9, textAlign: 'right', fontVariant: ['tabular-nums'], fontFamily: MONO }}>{j.arriveAt ? viewPassTime(j.arriveAt) : ' '}</Text>
                </View>
              </View>
            ))}
          </View>
          <View style={{ marginHorizontal: 16, borderTopWidth: 2, borderTopColor: 'rgba(255,255,255,0.14)', borderStyle: 'dashed' }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16 }}>
            {parties.map((p, i) => (
              <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: '30%' }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: FACE[i % FACE.length], alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Text style={{ color: C.ink, fontSize: 9, fontFamily: BOLD }}>{(names[p] ?? '?').slice(0, 1).toUpperCase()}</Text>
                </View>
                <Text numberOfLines={1} style={{ flexShrink: 1, color: C.white, fontSize: 13, fontFamily: SEMI }}>{names[p] ?? 'Someone'}</Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
            {payLine ? <Chip label={payLine} icon={ticketToPay > 0.5 ? undefined : ['M20 6 9 17l-5-5']} color={ticketToPay > 0.5 ? C.amber : C.lime} bg={ticketToPay > 0.5 ? 'rgba(246,181,71,0.16)' : 'rgba(215,245,92,0.16)'} /> : null}
            <View style={{ flexGrow: 1 }} />
            <Chip label="Ref hidden" icon={EYE_OFF} />
          </View>
        </Anim>
      ) : null}
      <Hidden>References, payment details and documents are for contributors only.</Hidden>
      {stays.length ? (
        <>
          <Title title="Stays" sub={String(stays.length)} />
          <View style={{ gap: 8 }}>
            {shown.map(({ e, stop, index }, i) => {
              const price = priceOf(e);
              return (
                <Anim key={e.id} k="jr" delay={200 + Math.min(i, 8) * 40} accessible accessibilityLabel={`${e.title.replace(/^Stay · /, '')}, ${viewStayDates(e)}, ${payWord(e)}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: C.tile, borderRadius: 22 }}>
                  <StopDisc stop={stop} index={index} japan={japan} />
                  <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: SEMI }}>{e.title.replace(/^Stay · /, '')}</Text>
                    <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: REG }}>
                      {viewStayDates(e)} · {e.data.checkIn?.trim() ? `check-in ${e.data.checkIn.trim()}` : <Text style={{ color: '#FFB547' }}>check-in time missing</Text>}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    {price ? <Text style={{ color: C.white, fontSize: 15, fontVariant: ['tabular-nums'], fontFamily: BOLD }}>{price}</Text> : null}
                    <Pill label={payWord(e)} />
                  </View>
                </Anim>
              );
            })}
          </View>
          <Foot onPress={more ? () => setAll(true) : undefined}>{more ? `${more} more ${more === 1 ? 'stay' : 'stays'} · no Add, Edit or Cancel in this view` : 'No Add, Edit or Cancel in this view'}</Foot>
        </>
      ) : null}
      {others.length ? (
        <>
          <Title title="Other bookings" sub={String(others.length)} />
          <View style={{ gap: 8 }}>
            {others.map((e) => {
              const price = priceOf(e);
              return (
                <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: C.tile, borderRadius: 22 }}>
                  <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: SEMI }}>{e.title}</Text>
                    <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: REG }}>{viewStayDates(e)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                    {price ? <Text style={{ color: C.white, fontSize: 15, fontVariant: ['tabular-nums'], fontFamily: BOLD }}>{price}</Text> : null}
                    <Pill label={payWord(e)} />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      ) : null}
      {!journeys.length && !stays.length && !others.length ? <Foot>{q ? 'Nothing here matches.' : 'Nothing booked yet.'}</Foot> : null}
    </>
  );
}

function Overview({ trip, names, q }: { trip: ObjectRecord<TripData>; names: Names; q: string }) {
  const d = useLive(
    (os) => {
      const nights = nightsOf(os, trip);
      return {
        card: nextTripCard(os, trip),
        stops: stopsOf(os, trip.id).map((s, i) => ({ s, i, span: stopSpan(nights, s.id) })),
      };
    },
    [trip.id, trip.version],
  );
  const japan = trip.data.look === 'japan' || !!scriptName(trip);
  const f = hit(q);
  const stops = d.stops.filter((x) => f(x.s.title) || f(x.s.data.localName));
  const people = tripParties(trip).map((p) => names[p] ?? 'Someone');
  const span = (x: { from: string; to: string; nights: number }) => `${x.nights} ${x.nights === 1 ? 'night' : 'nights'} · ${dayName(x.from).slice(4)} to ${dayName(x.to).slice(4)}`;
  return (
    <>
      <NextCard card={d.card} people={people} label="The trip" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {people.map((n, i) => (
          <View key={`${n}${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 34, paddingLeft: 4, paddingRight: 12, borderRadius: 999, backgroundColor: C.tile }}>
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: FACE[i % FACE.length], alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.ink, fontSize: 9, fontFamily: BOLD }}>{n.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={{ color: C.white, fontSize: 13, fontFamily: SEMI }}>{n}</Text>
          </View>
        ))}
      </View>
      {stops.length ? (
        <>
          <Title title="The line" sub={`${d.stops.length} ${d.stops.length === 1 ? 'stop' : 'stops'}`} />
          <View style={{ padding: 14, borderRadius: 24, backgroundColor: C.tile, gap: 4 }}>
            {stops.map((x, k) => (
              <View key={x.s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52 }}>
                <View style={{ alignItems: 'center' }}>
                  <StopDisc stop={x.s} index={x.i} japan={japan} size={36} />
                  {k < stops.length - 1 ? <View style={{ position: 'absolute', top: 40, width: 2, height: 14, borderRadius: 1, backgroundColor: 'rgba(245,245,247,0.16)' }} /> : null}
                </View>
                <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text numberOfLines={1} style={{ flexShrink: 1, color: C.white, fontSize: 15, lineHeight: 20, fontFamily: SEMI }}>{x.s.title}</Text>
                    {japan && x.s.data.localName ? <Text style={{ color: C.mid, fontSize: 13, fontFamily: JP_SERIF, fontWeight: '800' }}>{x.s.data.localName}</Text> : null}
                  </View>
                  <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: REG }}>{x.span ? span(x.span) : 'no nights yet'}</Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
      <Foot>The plan as it stands · no Add, Edit or Cancel in this view</Foot>
    </>
  );
}

function Plan({ trip, q }: { trip: ObjectRecord<TripData>; q: string }) {
  const d = useLive(
    (os) =>
      nightsOf(os, trip).map((n) => ({
        n,
        stop: n.stopId ? os.records.get<StopData>(n.stopId)?.title ?? null : null,
        stay: n.stayId ? (os.records.get(n.stayId)?.title ?? '').replace(/^Stay · /, '') : null,
      })),
    [trip.id, trip.version],
  );
  const f = hit(q);
  const rows = d.filter((x) => f(x.stop) || f(x.stay) || f(dayName(x.n.day)));
  return (
    <>
      <Title title="Night by night" sub={d.length ? `${d.length} ${d.length === 1 ? 'night' : 'nights'}` : 'No dates yet'} />
      {rows.length ? (
        <View style={{ padding: 14, borderRadius: 24, backgroundColor: C.tile, gap: 8 }}>
          {rows.map((x, i) => (
            <React.Fragment key={x.n.day}>
              {i ? <View style={{ height: 1, backgroundColor: C.line }} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 }}>
                <Text style={{ width: 86, color: C.mid, fontSize: 11, letterSpacing: 0.6, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{dayName(x.n.day).toUpperCase()}</Text>
                <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: x.n.kind === 'gap' ? C.amber : C.white, fontSize: 14, lineHeight: 19, fontFamily: SEMI }}>{x.n.kind === 'air' ? 'On a plane' : x.n.kind === 'gap' ? 'No bed booked' : x.stop ?? x.stay ?? 'A stay'}</Text>
                  {x.n.kind === 'stay' && x.stay ? <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: REG }}>{x.stay}{x.n.planned ? ' · planned' : ''}</Text> : null}
                </View>
              </View>
            </React.Fragment>
          ))}
        </View>
      ) : (
        <Foot>{q ? 'Nothing here matches.' : 'The nights show once the trip has dates.'}</Foot>
      )}
    </>
  );
}

function Money({ trip, q }: { trip: ObjectRecord<TripData>; q: string }) {
  const show = useShow(trip);
  const d = useLive(
    (os) => {
      const items = tripLedger(os, trip);
      return { all: projectedOf(items), each: projectedOf(items, 'me'), cats: byCategory(items) };
    },
    [trip.id, trip.version],
  );
  const n = tripParties(trip).length;
  const f = hit(q);
  const cats = d.cats.filter((c) => f(CATEGORY_LABEL[c.cat] ?? c.cat));
  const top = Math.max(1, ...d.cats.map((c) => c.inr));
  const budget = trip.data.budget ?? null;
  return (
    <>
      <Anim k="jr" delay={150} style={{ padding: 18, borderRadius: 28, backgroundColor: C.tile, gap: 10 }}>
        <Text style={{ color: C.low, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontFamily: SEMI }}>PROJECTED · EVERYONE</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: C.white, fontSize: 38, lineHeight: 42, letterSpacing: -1.2, fontVariant: ['tabular-nums'], fontFamily: BOLD }}>{show(d.all.total)}</Text>
        <Text style={{ color: C.mid, fontSize: 13, fontFamily: SANS }}>{n > 1 ? `about ${show(d.all.total / n, true)} each · ` : ''}{budget ? `budget ${show(budget, true)} a person` : 'no budget set'}</Text>
        <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.08)' }}>
          {(['paid', 'booked', 'estimate'] as const).map((k) => (d.all[k] > 0 ? <View key={k} style={{ flexGrow: d.all[k], backgroundColor: k === 'paid' ? C.lime : k === 'booked' ? C.white : 'rgba(245,245,247,0.3)' }} /> : null))}
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {(['paid', 'booked', 'estimate'] as const).map((k) => (
            <View key={k} style={{ flexGrow: 1, flexBasis: 0, gap: 2 }}>
              <Text style={{ color: C.low, fontSize: 10, letterSpacing: 1.5, fontFamily: MONO }}>{k === 'estimate' ? 'ESTIMATED' : k.toUpperCase()}</Text>
              <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, fontVariant: ['tabular-nums'], fontFamily: BOLD }}>{show(d.all[k], true)}</Text>
            </View>
          ))}
        </View>
      </Anim>
      {cats.length ? (
        <>
          <Title title="Where the money goes" sub="everyone · projected" />
          <View style={{ padding: 16, borderRadius: 24, backgroundColor: C.tile, gap: 14 }}>
            {cats.map((c) => (
              <View key={c.cat} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                  <Text numberOfLines={1} style={{ flexGrow: 1, flexShrink: 1, color: C.white, fontSize: 14, fontFamily: SEMI }}>{CATEGORY_LABEL[c.cat] ?? c.cat}</Text>
                  <Text style={{ color: C.white, fontSize: 14, fontVariant: ['tabular-nums'], fontFamily: BOLD }}>{show(c.inr)}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                  <Anim k="jbar" style={{ width: `${Math.round((c.inr / top) * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: C.lime }} />
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}
      <Hidden>Who paid what, and settling up, are for contributors only.</Hidden>
    </>
  );
}

function Prep({ trip, q }: { trip: ObjectRecord<TripData>; q: string }) {
  const groups = useLive((os) => sectionsOf(checklistOf(os, trip.id).filter((t) => t.data.section !== 'documents' && t.data.section !== 'money')), [trip.id, trip.version]);
  const f = hit(q);
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((t) => f(t.title)) })).filter((g) => g.items.length);
  return (
    <>
      {shown.map((g) => (
        <React.Fragment key={g.section}>
          <Title title={SECTION_LABEL[g.section] ?? g.section} sub={`${g.items.filter(isDone).length} of ${g.items.length} done`} />
          <View style={{ padding: 14, borderRadius: 24, backgroundColor: C.tile, gap: 10 }}>
            {g.items.map((t) => {
              const done = isDone(t);
              return (
                <View key={t.id} accessible accessibilityLabel={`${t.title}${done ? ', done' : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 32 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: done ? 0 : 2, borderColor: 'rgba(245,245,247,0.28)', backgroundColor: done ? C.lime : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    {done ? <Icon d={['M20 6 9 17l-5-5']} size={12} color={C.ink} /> : null}
                  </View>
                  <Text numberOfLines={2} style={{ flexShrink: 1, color: done ? C.low : C.white, fontSize: 14, lineHeight: 19, fontFamily: SEMI, textDecorationLine: done ? 'line-through' : 'none' }}>{t.title}</Text>
                </View>
              );
            })}
          </View>
        </React.Fragment>
      ))}
      {!shown.length ? <Foot>{q ? 'Nothing here matches.' : 'No checklist yet.'}</Foot> : null}
      <Hidden>Papers, and what to pay and carry, are for contributors only.</Hidden>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The screen                                                          */
/* ------------------------------------------------------------------ */

const TABS: Tab[] = ['overview', 'plan', 'bookings', 'money', 'prep'];

export function ViewOnlyScreen({ params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'bookings');
  const [query, setQuery] = useState<string | null>(null);
  const trip = useLive((os) => os.records.get<TripData>(params.trip ?? '') ?? null, [params.trip]);
  const names = useLive(
    (os) => {
      const m: Names = { me: 'You' };
      for (const id of trip?.data.personIds ?? []) m[id] = (os.records.get(id)?.title ?? 'Someone').split(/\s+/)[0]!;
      return m;
    },
    [trip?.id, trip?.version],
  );
  const exit = () => (router.canGoBack() ? router.back() : router.replace(trip ? tripRoutes.overview(trip.id) : tripRoutes.travel));
  const pad = { paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 130 + insets.bottom, gap: 12 };
  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink }}>
        <View style={pad}>
          <Banner onExit={exit} />
          <Foot>That trip is not here any more.</Foot>
        </View>
      </View>
    );
  }
  const q = (query ?? '').trim().toLowerCase();
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <ScrollView contentContainerStyle={pad} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Banner onExit={exit} />
        <Header trip={trip} tab={tab} onBack={exit} searching={query != null} onSearch={() => setQuery((v) => (v == null ? '' : null))} />
        {query != null ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, paddingHorizontal: 14, borderRadius: 18, backgroundColor: C.tile }}>
            <Icon d={['m21 21-4.3-4.3']} size={16} color={C.mid}>
              <Circle cx={11} cy={11} r={8} />
            </Icon>
            <TextInput value={query} onChangeText={setQuery} autoFocus placeholder={`Find in ${TAB_LABEL[tab].toLowerCase()}`} placeholderTextColor={C.low} accessibilityLabel="Find in this trip" style={{ flex: 1, color: C.white, fontSize: 15, fontFamily: SANS, paddingVertical: 0 }} />
          </View>
        ) : null}
        {tab === 'bookings' ? <Bookings trip={trip} names={names} q={q} /> : tab === 'overview' ? <Overview trip={trip} names={names} q={q} /> : tab === 'plan' ? <Plan trip={trip} q={q} /> : tab === 'money' ? <Money trip={trip} q={q} /> : <Prep trip={trip} q={q} />}
      </ScrollView>
      <ViewBar tab={tab} onTab={setTab} onCopilot={() => toast.show({ message: 'The copilot is for contributors; this view only reads the trip.', icon: 'lock' })} />
    </View>
  );
}
