import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import {
  addDay, bringAndPack, departOf, cashNeed, changeWallet, checklistOf, clock, dayAgenda, dayPlans, dayTrack, dayView, greeting, halfOfDay, happeningOn, hm, hourlyNormals, isDone, isoOf, lastConnection, leaveBy, moneyOf, nextLeg, nightsOf, nightsWord, notesOf, packingList, SKY_WORD, thingsAt, thingStatus, type OutingData, stampsOf, stampToday,
  stopNormals, stopPin, stopsOf, sunTimes, tempAt, tripDays, walletOf, type AgendaItem, type Normals, type Sky, type StopData, type TaskLike, type TravelEvent, type TripData,
} from '@modules/travel';
import { makeBill } from '@modules/finance';
import { toggleTask, type TaskData } from '@modules/projects';
import { useLive } from '@ui/hooks';
import { useToast } from '@ui/kit';
import { Anim, bgImage, JP_SANS, JP_SERIF, MONO } from './kit';
import { C, DotMatrix, isJapan, money, symOf, TripHeader, TripScreen, tripRoutes, useShow, goTrip } from './shell';

/**
 * The trip page while you are away (JP-Today in the morning, JP-TodayPM in the
 * afternoon; JP-Parts 10 to 16 and 48 to 51): where the day sits on the trip,
 * when to leave and the next leg, the last connection, the day's lines, the
 * month's weather by the hour and the sunset, cash and the IC card, the card to
 * show a driver, the stamp you just collected; after lunch, the rest of today,
 * what to bring and pack, and tomorrow.
 */

/* ------------------------------------------------------------------ */
/* Shared pieces (the recap uses them too)                              */
/* ------------------------------------------------------------------ */

export const STOP_HEX: Record<string, string> = { green: '#5FD08A', teal: '#4CC9D4', indigo: '#8C9DFF', persimmon: '#FF9A4D', wood: '#C99A6E', plum: '#E08BC8', crimson: '#FF6B7A', gold: '#F2C94C', sky: '#6CC6FF', slate: '#9FB0C8' };
export const hexOf = (color: string | null | undefined, fallback = '#9FB0C8') => (color ? STOP_HEX[color] ?? (color.startsWith('#') ? color : fallback) : fallback);

export const P = {
  chevR: ['m9 18 6-6-6-6'],
  check: ['M20 6 9 17l-5-5'],
  plus: ['M5 12h14', 'M12 5v14'],
  train: ['M8 3.1V7a4 4 0 0 0 8 0V3.1', 'm9 15-1-1', 'm15 15 1-1', 'M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z', 'm8 19-2 3', 'm16 19 2 3'],
  bus: ['M8 6v6', 'M15 6v6', 'M2 12h19.6', 'M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3', 'M9 18h5'],
  trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'],
  snow: ['m20 16-4-4 4-4', 'm4 8 4 4-4 4', 'm16 4-4 4-4-4', 'm8 20 4-4 4 4', 'M2 12h20', 'M12 2v20'],
  sun: ['M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'],
  cloud: ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'],
  rain: ['M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242', 'M16 14v6', 'M8 14v6', 'M12 16v6'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  yen: ['M12 9.5V21', 'm6 3 6 7 6-7', 'M6 15h12', 'M6 11h12'],
  wallet: ['M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'],
  sliders: ['M21 4h-7', 'M10 4H3', 'M21 12h-9', 'M8 12H3', 'M21 20h-5', 'M12 20H3', 'M14 2v4', 'M8 10v4', 'M16 18v4'],
  expand: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
  copy: ['M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
  calendar: ['M8 2v4', 'M16 2v4', 'M3 10h18'],
  timer: ['M10 2h4', 'm12 14 3-3'],
  sparkle: ['M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z'],
};

/** A Lucide-style stroke icon from path data (and any circles or rects as children). */
export function Ico({ d = [], size = 18, color = C.white, width = 2, children }: { d?: string[]; size?: number; color?: string; width?: number; children?: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {d.map((x) => <Path key={x} d={x} />)}
      {children}
    </Svg>
  );
}

export const SkyIcon = ({ sky, size = 18, color }: { sky: Sky | 'moon'; size?: number; color?: string }) =>
  sky === 'sun' ? <Ico d={P.sun} size={size} color={color ?? '#F2C94C'}><Circle cx={12} cy={12} r={4} /></Ico> : sky === 'snow' ? <Ico d={P.snow} size={size} color={color ?? '#9AD0FF'} /> : sky === 'rain' ? <Ico d={P.rain} size={size} color={color ?? '#9AD0FF'} /> : sky === 'moon' ? <Ico d={P.moon} size={size} color={color ?? '#C9A7F5'} /> : <Ico d={P.cloud} size={size} color={color ?? C.mid} />;

/** The 11 px caps label the artboards put over a card. */
export const Label = ({ children, color = C.low }: { children: React.ReactNode; color?: string }) => <Text numberOfLines={1} style={{ flexShrink: 1, color, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{children}</Text>;

/** A card's 17 px title and its 13 px line. */
export function CardHead({ title, sub, right }: { title: string; sub?: string | null; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: 'PlusJakartaSans_500Medium' }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** A small pill (26 px), lime tint by default. */
export function Pill({ label, tone = 'lime', icon, onPress, height = 26 }: { label: string; tone?: 'lime' | 'grey' | 'coral'; icon?: React.ReactNode; onPress?: () => void; height?: number }) {
  const bg = tone === 'lime' ? 'rgba(215,245,92,0.16)' : tone === 'coral' ? 'rgba(255,92,71,0.18)' : C.raised;
  const fg = tone === 'lime' ? C.lime : tone === 'coral' ? '#FF8A7A' : C.mid;
  return (
    <Pressable disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 5, height, paddingHorizontal: height < 24 ? 9 : 11, backgroundColor: bg, borderRadius: 999 }}>
      {icon}
      <Text numberOfLines={1} style={{ color: fg, fontSize: height < 24 ? 11 : 12, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{label}</Text>
    </Pressable>
  );
}

/** An eki stamp: the stop's mark in mincho on its colour, tilted, with the inked ring. */
export function StampDisc({ mark, color, size = 52, faded }: { mark: string; color: string; size?: number; faded?: boolean }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: faded ? 'transparent' : color, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }], borderWidth: faded ? 1.5 : 0, borderStyle: faded ? 'dashed' : 'solid', borderColor: 'rgba(11,11,13,0.25)', boxShadow: faded ? undefined : `inset 0 0 0 ${Math.round(size * 0.06)}px ${color}, inset 0 0 0 ${Math.round(size * 0.1)}px rgba(11,11,13,0.55)` }}>
      <Text style={{ color: faded ? 'rgba(11,11,13,0.3)' : C.ink, fontSize: Math.round(size * 0.46), lineHeight: Math.round(size * 0.5), fontFamily: JP_SERIF, fontWeight: '800' }}>{mark}</Text>
    </View>
  );
}

/** Ask the copilot: a row of chips that open it with the question (or go where a chip says). */
export function AskChips({ tripId, asks }: { tripId: string; asks: Array<{ label: string }> }) {
  const router = useRouter();
  return (
    <View style={{ gap: 8 }}>
      <Label>ASK THE COPILOT</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20 }}>
        {asks.map((a) => (
          <Pressable key={a.label} accessibilityRole="button" onPress={() => router.push(tripRoutes.copilot(tripId, a.label))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 6, height: 38, paddingHorizontal: 14, backgroundColor: C.raised, borderRadius: 999, opacity: pressed ? 0.8 : 1 })}>
            <Ico d={P.sparkle} size={13} color={C.lime} />
            <Text style={{ color: C.white, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{a.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dLabel = (day: string, week = true) => {
  const d = new Date(`${day}T12:00:00`);
  return `${week ? `${WEEK[d.getDay()]} ` : ''}${d.getDate()} ${MON[d.getMonth()]}`;
};
export const monthWord = (day: string) => MON[Number(day.slice(5, 7)) - 1]!;

/** The time now, ticking each second; a preview's fixed moment ticks on from where it was set. */
export function useClock(fixed?: number): number {
  const start = useRef(Date.now()).current;
  const [t, setT] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return fixed != null ? fixed + (t - start) : t;
}

/** A local-currency amount shown in the unit the ₹ / local switch says. */
export function useShowLocal(trip: ObjectRecord<TripData>) {
  const show = useShow(trip);
  const cur = trip.data.localCurrency ?? 'INR';
  const rate = cur === 'INR' ? 1 : trip.data.fxRate;
  return (amount: number, compact = false) => (rate ? show(amount * rate, compact) : money(amount, cur, compact));
}

const card = (bg: string = C.tile, radius = 28, pad = 16) => ({ backgroundColor: bg, borderRadius: radius, padding: pad, overflow: 'hidden' as const });

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

export function TodayPage({ trip, ctx, now: fixed }: { trip: ObjectRecord<TripData>; ctx: LifeOSContext; now?: number }) {
  const now = useClock(fixed);
  const minute = Math.floor(now / 60_000);
  const d: D = useLive(
    (os): D => {
      const t = os.records.get<TripData>(trip.id) ?? trip;
      const at = minute * 60_000;
      const today = isoOf(at);
      const nights = nightsOf(os, t);
      const v = dayView(os, t, today, nights);
      const stop = (id: string | null | undefined) => (id ? os.records.get<StopData>(id) ?? null : null);
      const journey = v.journeys[0] ?? null;
      const here = stop(journey?.data.fromStopId) ?? stop(v.fromStopId) ?? stop(v.stopId);
      const there = stop(journey?.data.toStopId) ?? stop(v.stopId) ?? here;
      const stay = (v.night?.stayId ? os.records.get<TravelEvent>(v.night.stayId) : null) ?? null;
      const tomorrow = addDay(today, 1);
      const tv = t.data.endDate && tomorrow <= t.data.endDate ? dayView(os, t, tomorrow, nights) : null;
      const tj = tv?.journeys[0] ?? null;
      const plans = dayPlans(os, t.id);
      return {
        t,
        today,
        nights,
        v,
        journey,
        here,
        there,
        stay,
        line: stopsOf(os, t.id),
        track: dayTrack(os, nights, today),
        agenda: dayAgenda(os, t, today, at, nights),
        stamps: stampsOf(os, t, today, nights),
        cash: cashNeed(os, t, today, 5),
        tasks: checklistOf(os, t.id),
        things: v.stopId && stop(v.stopId) ? thingsAt(os, stop(v.stopId)!).filter((x) => ['planned', 'want'].includes(thingStatus(x))).slice(0, 3) : [],
        notes: notesOf(os, t.id).slice(0, 3),
        plan: plans.get(today) ?? null,
        happening: happeningOn(os, t, today, v.stopId).events[0] ?? null,
        tomorrow: tv ? { day: tomorrow, v: tv, journey: tj, from: stop(tj?.data.fromStopId) ?? there, to: stop(tj?.data.toStopId) ?? stop(tv.stopId), plan: plans.get(tomorrow) ?? null } : null,
        packing: packingList(os, t),
        pin: stopPin(os, there) ?? stopPin(os, here),
      };
    },
    [trip.id, minute],
  );
  const half = halfOfDay(now, d.journey?.data.endAt);
  const jp = isJapan(d.t);
  const total = tripDays(d.t.data) ?? d.nights.length;
  const label = half === 'morning' ? `Day ${d.v.index} of ${total}` : `Day ${d.v.index} · ${hm(now)}`;
  return (
    <TripScreen tripId={trip.id} active="overview">
      <TripHeader trip={d.t} label={label} />
      {half === 'morning' ? <Morning d={d} ctx={ctx} now={now} jp={jp} /> : <Afternoon d={d} ctx={ctx} now={now} jp={jp} />}
    </TripScreen>
  );
}

/** What the page reads. */
type D = {
  t: ObjectRecord<TripData>;
  today: string;
  nights: ReturnType<typeof nightsOf>;
  v: ReturnType<typeof dayView>;
  journey: ObjectRecord<TravelEvent> | null;
  here: ObjectRecord<StopData> | null;
  there: ObjectRecord<StopData> | null;
  stay: ObjectRecord<TravelEvent> | null;
  line: ObjectRecord<StopData>[];
  track: ReturnType<typeof dayTrack>;
  agenda: ReturnType<typeof dayAgenda>;
  stamps: ReturnType<typeof stampsOf>;
  cash: ReturnType<typeof cashNeed>;
  tasks: ObjectRecord<TaskLike>[];
  things: ObjectRecord<OutingData>[];
  notes: ObjectRecord<TaskLike>[];
  plan: string | null;
  happening: ReturnType<typeof happeningOn>['events'][number] | null;
  tomorrow: { day: string; v: ReturnType<typeof dayView>; journey: ObjectRecord<TravelEvent> | null; from: ObjectRecord<StopData> | null; to: ObjectRecord<StopData> | null; plan: string | null } | null;
  packing: ReturnType<typeof packingList>;
  pin: { lat: number; lng: number } | null;
};

/** The stop's name in its script (when the japan look has one), else its name. */
const localOf = (s: ObjectRecord<StopData> | null | undefined, jp: boolean) => (s ? (jp && s.data.localName ? s.data.localName : s.title) : '');
const isLocal = (s: ObjectRecord<StopData> | null | undefined, jp: boolean) => !!s && jp && !!s.data.localName;

/* ------------------------------------------------------------------ */
/* Morning                                                             */
/* ------------------------------------------------------------------ */

function Morning({ d, ctx, now, jp }: { d: D; ctx: LifeOSContext; now: number; jp: boolean }) {
  const router = useRouter();
  const moving = !!d.journey && !!d.here && !!d.there && d.here.id !== d.there.id;
  const leave = d.journey ? leaveBy(d.journey, now) : null;
  const leg = d.journey ? nextLeg(d.journey, now) : null;
  const last = d.journey ? lastConnection(d.journey) : null;
  const stamp = jp ? stampToday(d.stamps, d.today) : null;
  return (
    <>
      <Anim k="jr" delay={110}>
        <Text style={{ color: C.mid, fontSize: 34, lineHeight: 38, letterSpacing: -0.8, fontFamily: 'PlusJakartaSans_400Regular' }}>{greeting(now)},</Text>
        <Text numberOfLines={1} style={{ color: C.white, fontSize: 34, lineHeight: 38, letterSpacing: -0.8, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{d.here?.title ?? d.t.data.destination}</Text>
      </Anim>
      <OfflinePill t={d.t} />
      <DayTrackCard d={d} jp={jp} moving={moving} />
      {leave && leave.seconds > 0 && moving ? <LeaveBy d={d} leave={leave} /> : null}
      {leg ? <NextLeg leg={leg} onPress={() => router.push(tripRoutes.day(d.t.id, d.today, 'travel'))} /> : null}
      {last ? <LastConnection title={last.title} body={last.body} bus={/\bbus\b/i.test(last.title + last.body)} onPress={() => router.push(tripRoutes.day(d.t.id, d.today, 'travel'))} /> : null}
      <DayGrid d={d} ctx={ctx} moving={moving} />
      <WeatherMorning d={d} now={now} jp={jp} moving={moving} />
      <CashCard d={d} />
      <WalletCard d={d} ctx={ctx} />
      <SmallSpend d={d} ctx={ctx} />
      {d.stay ? <DriverCard d={d} jp={jp} /> : null}
      {stamp ? <StampCollected stamp={stamp} total={d.stamps.length} onPress={() => router.push(tripRoutes.stop(stamp.stop.id))} /> : null}
      <AskChips tripId={d.t.id} asks={[{ label: 'What now? Plan the next few hours' }, { label: `Where can we eat near ${leg?.to ?? d.there?.title ?? 'here'}?` }, { label: 'What should we pack for tomorrow?' }]} />
    </>
  );
}

function OfflinePill({ t }: { t: ObjectRecord<TripData> }) {
  const online = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator.onLine !== false : null;
  const when = new Date(t.updatedAt);
  return (
    <Anim k="jr" delay={170} style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 8, height: 34, paddingHorizontal: 12, backgroundColor: C.tile, borderRadius: 17 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: online === false ? C.amber : '#FFB547' }} />
      <Text numberOfLines={1} style={{ flexShrink: 1, color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{`${online === false ? 'Offline' : 'Works offline'} · your saved copy from ${when.getDate()} ${MON[when.getMonth()]}, ${hm(t.updatedAt)}`}</Text>
    </Anim>
  );
}

function DayTrackCard({ d, jp, moving }: { d: D; jp: boolean; moving: boolean }) {
  const router = useRouter();
  const there = d.there;
  const c = hexOf(there?.data.color);
  const first = d.nights[0]?.day;
  const last = d.t.data.endDate;
  return (
    <Anim k="jr" delay={230}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open the day" onPress={() => router.push(tripRoutes.day(d.t.id, d.today))} style={[card(C.tile, 28), { gap: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ color: C.mid, fontSize: 10, letterSpacing: 1.5, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{dLabel(d.today).toUpperCase()}</Text>
          <View style={{ flexGrow: 1 }} />
          <Pill label={moving ? 'Moving day' : d.v.night?.kind === 'air' ? 'On the plane' : d.v.stopId ? `Night ${(d.nights.filter((n) => n.stopId === d.v.stopId && n.day <= d.today).length)} here` : 'Last day'} icon={moving ? <Ico d={P.train} size={13} color={C.lime} /> : undefined} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {moving ? (
            <>
              <Text numberOfLines={1} style={{ flexShrink: 1, color: C.white, fontSize: isLocal(d.here, jp) ? 30 : 24, lineHeight: 34, fontFamily: isLocal(d.here, jp) ? JP_SANS : 'PlusJakartaSans_800ExtraBold', fontWeight: '900' }}>{localOf(d.here, jp)}</Text>
              <Ico d={P.chevR} size={18} color={C.low} />
            </>
          ) : null}
          <Text numberOfLines={1} style={{ flexShrink: 1, color: c, fontSize: isLocal(there, jp) ? 30 : 24, lineHeight: 34, fontFamily: isLocal(there, jp) ? JP_SANS : 'PlusJakartaSans_800ExtraBold', fontWeight: '900' }}>{there ? localOf(there, jp) : 'Going home'}</Text>
          <View style={{ flexGrow: 1 }} />
          {there ? (
            <View style={{ width: 44, height: 44, flexShrink: 0 }}>
              <Anim k="jpulse2" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: c, borderRadius: 999 }} />
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: c, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: c, fontSize: 18, lineHeight: 20, fontFamily: jp ? JP_SERIF : 'PlusJakartaSans_800ExtraBold', fontWeight: '800' }}>{jp && there.data.localName ? [...there.data.localName][0] : there.title.slice(0, 1).toUpperCase()}</Text>
              </View>
            </View>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {d.track.map((cell) => (
            <View key={cell.day} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 10, borderRadius: 3, backgroundColor: cell.color ? hexOf(cell.color) : '#303036', opacity: cell.when === 'future' ? 0.22 : 1, boxShadow: cell.when === 'today' ? `0 0 0 2px ${C.tile},0 0 0 4px ${C.lime}` : undefined }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: C.low, fontSize: 9, letterSpacing: 0.9, fontFamily: MONO }}>{first ? dLabel(first, false).toUpperCase() : ''}</Text>
          <View style={{ flexGrow: 1, alignItems: 'center' }}>
            <Text style={{ color: C.lime, fontSize: 9, letterSpacing: 0.9, fontFamily: MONO }}>TODAY</Text>
          </View>
          <Text style={{ color: C.low, fontSize: 9, letterSpacing: 0.9, fontFamily: MONO }}>{last ? dLabel(last, false).toUpperCase() : ''}</Text>
        </View>
      </Pressable>
    </Anim>
  );
}

function LeaveBy({ d, leave }: { d: D; leave: NonNullable<ReturnType<typeof leaveBy>> }) {
  const router = useRouter();
  const s = leave.seconds;
  const digits = s >= 3600 ? `${String(Math.floor(s / 3600)).padStart(2, '0')}${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}` : `${String(Math.floor(s / 60)).padStart(2, '0')}${String(s % 60).padStart(2, '0')}`;
  const spoken = s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 60)} min ${s % 60} s`;
  const from = d.v.checkOuts[0] ? 'the stay' : d.here?.title ?? 'here';
  const what = leave.what ? leave.what.split(/,\s*/).slice(1).join(', ') || leave.note || leave.what : leave.note;
  const mapsTo = leaveTo(d, leave.what);
  return (
    <Anim k="jr" delay={290} style={[card(C.lime, 28, 18), { gap: 12 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: C.ink, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{`LEAVE ${from === 'the stay' ? 'THE STAY' : from.toUpperCase()} IN`}</Text>
        <View style={{ flexGrow: 1 }} />
        <Ico d={P.timer} size={18} color={C.ink}><Circle cx={12} cy={14} r={8} /></Ico>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14 }}>
        <DotMatrix text={digits} color={C.ink} pitch={6} dim={0.12} label={`Leave in ${spoken}`} />
        <View style={{ flexShrink: 1, gap: 2, paddingBottom: 2 }}>
          <Text style={{ color: C.ink, fontSize: 15, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{`by ${leave.time}`}</Text>
          {what ? <Text numberOfLines={2} style={{ color: 'rgba(11,11,13,0.62)', fontSize: 12, lineHeight: 15, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{what}</Text> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => void Linking.openURL(mapsTo)} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 44, borderRadius: 999, backgroundColor: C.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={C.lime} strokeWidth={2} strokeLinejoin="round"><Polygon points="3 11 22 2 13 21 11 13 3 11" /></Svg>
          <Text style={{ color: C.white, fontSize: 14, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Take me there</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push(tripRoutes.day(d.t.id, d.today, 'travel'))} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 44, borderRadius: 999, backgroundColor: 'rgba(11,11,13,0.14)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Ico d={P.calendar} size={17} color={C.ink}><Rect width={18} height={18} x={3} y={4} rx={2} /></Ico>
          <Text style={{ color: C.ink, fontSize: 14, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Open the full day</Text>
        </Pressable>
      </View>
    </Anim>
  );
}

/** Where "Take me there" goes: the station the first step walks to, else the first leg's station, else tonight's stop. */
function leaveTo(d: D, what: string | null) {
  const walk = /\b(?:walk|taxi)\b[^,]*?\bto\s+([^,(|]+)/i.exec(what ?? '')?.[1]?.trim();
  const leg = d.journey ? nextLeg(d.journey, 0) : null;
  const q = walk ?? (leg?.from ? `${leg.from} station` : d.there?.title ?? d.t.data.destination);
  const near = d.here?.title && !q.toLowerCase().includes(d.here.title.toLowerCase()) ? ` ${d.here.title}` : '';
  return `https://www.google.com/maps/dir/?api=1&travelmode=transit&destination=${encodeURIComponent(`${q}${near}`)}`;
}

function NextLeg({ leg, onPress }: { leg: NonNullable<ReturnType<typeof nextLeg>>; onPress: () => void }) {
  const kind = leg.mode === 'bus' ? 'NEXT BUS' : leg.mode === 'train' ? 'NEXT TRAIN' : 'NEXT';
  const Box = ({ time, place, approx }: { time: string; place: string; approx?: boolean }) => (
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, alignItems: 'center', gap: 2, paddingVertical: 12, paddingHorizontal: 8, borderWidth: 1.5, borderColor: 'rgba(245,245,247,0.18)', borderRadius: 20 }}>
      <Text style={{ color: C.white, fontSize: 34, lineHeight: 38, letterSpacing: -1, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{time}</Text>
      <Text numberOfLines={1} style={{ color: C.low, fontSize: 9, letterSpacing: 1, fontFamily: MONO }}>{`${place.toUpperCase()}${approx ? ' · EST.' : ''}`}</Text>
    </View>
  );
  return (
    <Anim k="jr" delay={350}>
      <Pressable accessibilityRole="button" onPress={onPress} style={[card(C.tile, 28), { gap: 10 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <Label>{`${kind} · ${leg.name.toUpperCase()}`}</Label>
          {leg.note ? <Text numberOfLines={1} style={{ flexShrink: 1, color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{leg.note}</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Box time={leg.time ?? '--:--'} place={leg.from ?? ''} approx={leg.approx} />
          <View style={{ width: 28, height: 28, marginHorizontal: -10, zIndex: 1, borderRadius: 14, backgroundColor: C.lime, borderWidth: 4, borderColor: C.tile, alignItems: 'center', justifyContent: 'center' }}>
            <Ico d={P.chevR} size={14} color={C.ink} />
          </View>
          <Box time={leg.arrive ?? '--:--'} place={leg.to ?? ''} approx={leg.arriveApprox} />
        </View>
      </Pressable>
    </Anim>
  );
}

function LastConnection({ title, body, bus, onPress }: { title: string; body: string; bus: boolean; onPress: () => void }) {
  return (
    <Anim k="jr" delay={410}>
      <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, backgroundColor: 'rgba(255,92,71,0.18)', borderRadius: 20 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#FF5C47', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {bus ? (
            <Ico d={P.bus} size={16} color={C.ink}><Circle cx={7} cy={18} r={2} /><Circle cx={16} cy={18} r={2} /></Ico>
          ) : (
            <Ico d={P.train} size={16} color={C.ink} />
          )}
        </View>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: 'PlusJakartaSans_700Bold' }}>{title}</Text>
          {body ? <Text numberOfLines={3} style={{ color: C.mid, fontSize: 13, lineHeight: 18, fontFamily: 'PlusJakartaSans_400Regular' }}>{body}</Text> : null}
        </View>
      </Pressable>
    </Anim>
  );
}

/* The day's lines: schedule, notes, the day's aim, tasks. */
function DayGrid({ d, ctx, moving }: { d: D; ctx: LifeOSContext; moving: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const showLocal = useShowLocal(d.t);
  const [hidden, setHidden] = useState(false);
  const day = () => router.push(tripRoutes.day(d.t.id, d.today, 'itinerary'));
  const timed = d.agenda.items.filter((x) => x.time && x.kind !== 'last');
  const firstOpen = Math.max(0, timed.findIndex((x) => x.state !== 'done'));
  const sched = timed.slice(firstOpen, firstOpen + 3).length >= 2 ? timed.slice(firstOpen, firstOpen + 3) : timed.slice(-3);
  const schedBg = [C.ink, d.there?.data.color ? hexOf(d.there.data.color) : '#D9B39A', C.lime];
  const notes: Array<{ t: string; s: string }> = [];
  for (const e of d.v.toPay) notes.push({ t: /\bcash\b/i.test(e.data.payHow ?? '') ? 'Cash only' : 'To pay there', s: `${showLocal(moneyOf(e).toPay)} at ${e.title.replace(/^Stay · /, '')}` });
  if (d.stay?.data.checkIn) notes.push({ t: `Check-in ${d.stay.data.checkIn}`, s: d.stay.title.replace(/^Stay · /, '') });
  if (d.stay?.data.access) notes.push({ t: 'Getting there', s: d.stay.data.access });
  for (const x of d.agenda.items.filter((i) => i.kind === 'thing')) notes.push({ t: x.title, s: x.sub ?? '' });
  if (!notes.length && d.plan) notes.push({ t: 'The plan', s: d.plan });
  for (const n of d.notes) if (notes.length < 3) notes.push({ t: n.title, s: n.data.notes?.split('\n')[0] ?? '' });
  const reach = moving && d.journey?.data.endAt ? `Reach ${d.there?.title} by ${hm(d.journey.data.endAt)}` : d.there ? `A day in ${d.there.title}` : 'Today';
  const reachSub = d.plan ?? d.journey?.data.lastConnection ?? d.there?.data.about ?? null;
  const open = d.tasks.filter((x) => !isDone(x));
  const due = [...open.filter((x) => x.data.dueDate && x.data.dueDate <= d.today), ...open.filter((x) => !x.data.dueDate || x.data.dueDate > d.today)];
  const doneToday = d.tasks.filter((x) => isDone(x) && x.data.completedAt && isoOf(x.data.completedAt) === d.today);
  const tasks = [...due.slice(0, 4), ...doneToday].slice(0, 4);
  const tick = (task: ObjectRecord<TaskLike>) => {
    const was = task.status;
    toggleTask(ctx, task as unknown as ObjectRecord<TaskData>);
    if (was !== 'done') toast.show({ message: `${task.title} done`, icon: 'check', undo: () => void ctx.records.update(task.id, { status: was ?? 'todo', data: { completedAt: undefined } }, 'user') });
  };
  const cell = { height: 190, padding: 14, borderRadius: 28, overflow: 'hidden' as const, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 };
  return (
    <Anim k="jr" delay={470} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Today's schedule" onPress={day} style={[cell, { gap: 6, backgroundColor: C.white }]}>
          <Text style={{ color: C.ink, fontSize: 14, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>Schedule</Text>
          {!sched.length && d.things.length ? d.things.map((x, i) => (
            <View key={x.id} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: schedBg[i] }}>
              <Text style={{ color: i ? 'rgba(11,11,13,0.62)' : C.mid, fontSize: 9, letterSpacing: 0.5, fontFamily: MONO }}>{thingStatus(x) === 'planned' ? 'PLANNED' : 'WANT TO'}</Text>
              <Text numberOfLines={1} style={{ color: i ? C.ink : C.white, fontSize: 13, lineHeight: 16, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{x.title}</Text>
            </View>
          )) : null}
          {sched.length ? sched.map((x, i) => (
            <View key={x.key} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 999, backgroundColor: schedBg[i] }}>
              <Text style={{ color: i ? 'rgba(11,11,13,0.62)' : C.mid, fontSize: 9, letterSpacing: 0.5, fontFamily: MONO }}>{x.time}</Text>
              <Text numberOfLines={1} style={{ color: i ? C.ink : C.white, fontSize: 13, lineHeight: 16, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{shortTitle(x)}</Text>
            </View>
          )) : d.things.length ? null : <Text style={{ color: 'rgba(11,11,13,0.62)', fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Nothing timed today. Open the day to plan it.</Text>}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Notes for today" onPress={day} style={[cell, { gap: 8, backgroundColor: C.raised }]}>
          <Text style={{ color: C.white, fontSize: 14, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>Notes</Text>
          {notes.slice(0, 3).map((n) => (
            <View key={n.t + n.s} style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#303036', borderRadius: 14 }}>
              <Text numberOfLines={1} style={{ color: C.white, fontSize: 12, lineHeight: 15, fontFamily: 'PlusJakartaSans_700Bold' }}>{n.t}</Text>
              {n.s ? <Text numberOfLines={1} style={{ color: C.mid, fontSize: 11, lineHeight: 14, fontFamily: 'PlusJakartaSans_400Regular' }}>{n.s}</Text> : null}
            </View>
          ))}
          {!notes.length ? <Text style={{ color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Nothing to note today.</Text> : null}
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {hidden ? null : (
          <View style={[cell, { justifyContent: 'space-between', backgroundColor: '#F6E27F' }]}>
            <View>
              <Text numberOfLines={2} style={{ color: C.ink, fontSize: 14, lineHeight: 18, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{reach}</Text>
              {reachSub ? <Text numberOfLines={4} style={{ marginTop: 4, color: 'rgba(11,11,13,0.62)', fontSize: 12, lineHeight: 16, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{reachSub}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Hide for today" onPress={() => { setHidden(true); toast.show({ message: 'Hidden for today', icon: 'check', undo: () => setHidden(false) }); }} style={{ width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: 'rgba(11,11,13,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                <Ico d={P.trash} size={15} color={C.ink} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Open the journey" onPress={() => router.push(tripRoutes.day(d.t.id, d.today, moving ? 'travel' : 'overview'))} style={{ flexGrow: 1, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: 'rgba(11,11,13,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                <Ico d={P.chevR} size={16} color={C.ink} />
              </Pressable>
            </View>
          </View>
        )}
        <View style={[cell, { gap: 7, backgroundColor: C.white }]}>
          <Text style={{ color: C.ink, fontSize: 14, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>Tasks</Text>
          {tasks.map((x) => {
            const done = isDone(x);
            return (
              <Pressable key={x.id} accessibilityRole="checkbox" accessibilityState={{ checked: done }} accessibilityLabel={x.title} onPress={() => tick(x)} hitSlop={4} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? C.ink : 'transparent', borderWidth: done ? 0 : 1.5, borderColor: 'rgba(11,11,13,0.35)' }}>
                  {done ? <Ico d={P.check} size={11} color={C.lime} /> : null}
                </View>
                <Text numberOfLines={1} style={{ flexShrink: 1, color: done ? 'rgba(11,11,13,0.42)' : C.ink, fontSize: 12, lineHeight: 15, fontFamily: 'PlusJakartaSans_700Bold', textDecorationLine: done ? 'line-through' : 'none' }}>{x.title}</Text>
              </Pressable>
            );
          })}
          {!tasks.length ? <Text style={{ color: 'rgba(11,11,13,0.62)', fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' }}>All done.</Text> : null}
          <View style={{ flexGrow: 1 }} />
          <Pressable accessibilityRole="button" onPress={() => goTrip(router, tripRoutes.prep(d.t.id, 'checklist'))} hitSlop={6}>
            <Text style={{ color: 'rgba(11,11,13,0.62)', fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold' }}>{`${open.length} open on the checklist`}</Text>
          </Pressable>
        </View>
      </View>
    </Anim>
  );
}

/** A step's short name for a pill ("Limited express Shinano Nagano → …" → "Limited express Shinano"). */
function shortTitle(x: AgendaItem) {
  const t = x.title.split(/\s*→\s*/)[0]!.split(/[,(|]/)[0]!.trim();
  if (x.kind === 'step' && /→/.test(x.title)) return t.split(/\s+/).slice(0, -1).join(' ') || t;
  return t.replace(/^Check (in at|out of) /, (m) => (m.startsWith('Check in') ? 'Check in · ' : 'Check out · '));
}

/* The month's weather: a sentence, today's curve, the sunset, by stop. */
function WeatherMorning({ d, now, jp, moving }: { d: D; now: number; jp: boolean; moving: boolean }) {
  const hereN = stopNormals(d.here, d.today);
  const there = d.there ?? d.here;
  const thereN = stopNormals(there, d.today) ?? hereN;
  const min = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const sun = d.pin ? sunTimes(d.pin.lat, d.pin.lng, d.today) : null;
  const month = monthWord(d.today);
  const byStop = d.line.map((s) => ({ s, n: stopNormals(s, d.nights.find((x) => x.stopId === s.id)?.day ?? d.today) })).filter((x) => x.n);
  if (!hereN && !thereN && !byStop.length) return null;
  const skyC = (sky: Sky) => (sky === 'snow' || sky === 'rain' ? '#6CC6FF' : sky === 'sun' ? '#F6B547' : C.white);
  return (
    <>
      {hereN || thereN ? (
        <Anim k="jr" delay={530} style={{ padding: 18, backgroundColor: C.tile, borderRadius: 26 }}>
          <Text style={{ color: 'rgba(245,245,247,0.5)', fontSize: 22, lineHeight: 28, letterSpacing: -0.4, fontFamily: 'PlusJakartaSans_600SemiBold' }}>
            {hereN ? (
              <>
                {'It’s about '}
                <Text style={{ color: C.white, fontFamily: 'PlusJakartaSans_700Bold' }}>{`${Math.round(tempAt(hereN, min))}°`.replace('-', '−')}</Text>
                {` now in ${d.here?.title}. `}
              </>
            ) : null}
            {thereN ? (
              <>
                <Text style={{ color: skyC(thereN.sky), fontFamily: 'PlusJakartaSans_700Bold' }}>{SKY_WORD[thereN.sky]}</Text>
                {` is usual ${moving || !hereN ? `in ${there?.title}` : 'here'} in ${month}, `}
                <Text style={{ color: C.white, fontFamily: 'PlusJakartaSans_700Bold' }}>{`${thereN.lo}° to ${thereN.hi}°`.replace(/-/g, '−')}</Text>
                {'.'}
              </>
            ) : null}
          </Text>
        </Anim>
      ) : null}
      {thereN ? (
        <Anim k="jr" delay={590} style={{ flexDirection: 'row', gap: 12 }}>
          <TempCurve n={thereN} place={there?.title ?? ''} minute={min} />
          {sun ? <SunDial set={sun.set} /> : null}
        </Anim>
      ) : null}
      {byStop.length ? (
        <Anim k="jr" delay={650} style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Label>WEATHER BY STOP</Label>
            <View style={{ flexGrow: 1 }} />
            <Text style={{ color: C.low, fontSize: 9, letterSpacing: 0.5, fontFamily: MONO }}>{`${month.toUpperCase()} NORMALS`}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20 }}>
            {byStop.map(({ s, n }) => {
              const on = s.id === d.v.stopId;
              return (
                <View key={s.id} style={{ width: 66, flexShrink: 0, alignItems: 'center', gap: 5, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 18, backgroundColor: on ? hexOf(s.data.color) : C.tile }}>
                  <Text numberOfLines={1} style={{ color: on ? C.ink : C.white, fontSize: 12, fontFamily: jp && s.data.localName ? JP_SANS : 'PlusJakartaSans_800ExtraBold', fontWeight: '900' }}>{jp && s.data.localName ? [...s.data.localName][0] : s.title.slice(0, 3)}</Text>
                  <SkyIcon sky={n!.sky} color={on ? C.ink : undefined} />
                  <Text style={{ color: on ? C.ink : C.white, fontSize: 13, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{`${n!.hi}°`}</Text>
                  <Text style={{ color: on ? 'rgba(11,11,13,0.62)' : C.low, fontSize: 11, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{`${n!.lo}°`}</Text>
                </View>
              );
            })}
          </ScrollView>
        </Anim>
      ) : null}
    </>
  );
}

/** Smooth path through points (the artboards' wave). */
function wave(pts: Array<[number, number]>) {
  return pts.reduce((acc, [x, y], i) => {
    if (!i) return `M${x.toFixed(1)} ${y.toFixed(1)}`;
    const [px, py] = pts[i - 1]!;
    const mx = (px + x) / 2;
    return `${acc} C ${mx.toFixed(1)} ${py.toFixed(1)}, ${mx.toFixed(1)} ${y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}`;
  }, '');
}

function TempCurve({ n, place, minute }: { n: Normals; place: string; minute: number }) {
  const cold = n.sky !== 'sun';
  const line = cold ? '#6CC6FF' : '#F6B547';
  const hours = [6, 9, 12, 15, 18, 21, 24];
  const ys = (t: number) => 70 - ((t - n.lo) / Math.max(1, n.hi - n.lo)) * 42;
  const pts = hours.map((h, i) => [i * 25, ys(tempAt(n, h * 60))] as [number, number]);
  const xNow = Math.min(150, Math.max(0, ((minute - 360) / (18 * 60)) * 150));
  const yNow = ys(tempAt(n, minute));
  const advice = n.sky === 'snow' ? 'snow is usual · bring the waterproof layer' : n.sky === 'rain' ? 'rain is usual · bring an umbrella' : n.lo <= 3 ? `down to ${n.lo}° tonight · bring a warm layer` : `up to ${n.hi}° by mid-afternoon`;
  return (
    <View style={[bgImage(cold ? 'linear-gradient(180deg,#14304A 0%,#0F1A26 100%)' : 'linear-gradient(180deg,#3A2A10 0%,#1A140A 100%)'), { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 2, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 12, borderRadius: 26, overflow: 'hidden' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, color: 'rgba(245,245,247,0.7)', fontSize: 10, letterSpacing: 0.6, fontFamily: MONO }}>{`${SKY_WORD[n.sky].toUpperCase()} · ${place.toUpperCase()}`}</Text>
        <View style={{ flexGrow: 1 }} />
        <SkyIcon sky={n.sky} size={16} color={line} />
      </View>
      <Text style={{ color: C.white, fontSize: 26, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{`${n.hi}°`.replace('-', '−')}</Text>
      <View style={{ marginTop: 4, marginHorizontal: -14, height: 90 }}>
        <Svg width="100%" height={90} viewBox="0 0 150 90" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="tdwm" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={line} stopOpacity={0.55} />
              <Stop offset="1" stopColor={line} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={`${wave(pts)} L 150 90 L 0 90 Z`} fill="url(#tdwm)" />
          <Path d={wave(pts)} fill="none" stroke={line} strokeWidth={2} />
          <Line x1={xNow} x2={xNow} y1={0} y2={90} stroke="rgba(245,245,247,0.6)" strokeWidth={1} />
        </Svg>
        <View style={{ position: 'absolute', left: `${(xNow / 150) * 100}%`, top: yNow - 7, marginLeft: -7, width: 14, height: 14, borderRadius: 7, backgroundColor: C.white, boxShadow: `0 0 0 3px ${line}66` }} />
      </View>
      <Text numberOfLines={2} style={{ color: C.white, fontSize: 12, lineHeight: 16, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{advice}</Text>
    </View>
  );
}

function SunDial({ set }: { set: number }) {
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  const lit = Math.round((set / 1440) * 60);
  const a = (set / 1440) * Math.PI * 2;
  const sx = 66 + 55 * Math.sin(a);
  const sy = 66 - 55 * Math.cos(a);
  return (
    <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, padding: 10, backgroundColor: C.tile, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 132, height: 132 }}>
        <Svg width={132} height={132} viewBox="0 0 132 132">
          <Circle cx={66} cy={66} r={40} fill={C.raised} />
          <Circle cx={66} cy={66} r={40} fill="none" stroke="rgba(255,181,71,0.25)" strokeWidth={1} />
          <Defs>
            <RadialGradient id="tdsun">
              <Stop offset="0" stopColor="#FFF2C8" />
              <Stop offset="0.45" stopColor="#FFB547" />
              <Stop offset="1" stopColor="#FFB547" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {ticks.map((i) => {
            const t = (i / 60) * Math.PI * 2;
            const big = i % 15 === 0;
            return <Line key={i} x1={66 + 60 * Math.sin(t)} y1={66 - 60 * Math.cos(t)} x2={66 + 50 * Math.sin(t)} y2={66 - 50 * Math.cos(t)} stroke={i <= lit ? '#FFB547' : 'rgba(245,245,247,0.18)'} strokeWidth={big ? 2 : 1.2} strokeLinecap="round" />;
          })}
          <Circle cx={sx} cy={sy} r={16} fill="url(#tdsun)" />
        </Svg>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <SkyIcon sky="sun" size={15} color="#FFB547" />
          <Text style={{ color: C.white, fontSize: 17, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{clock(set)}</Text>
          <Text style={{ color: C.mid, fontSize: 11, fontFamily: 'PlusJakartaSans_600SemiBold' }}>sunset</Text>
        </View>
      </View>
    </View>
  );
}

/* Cash for the next days: what you carry against the cash-only payments coming. */
function CashCard({ d }: { d: D }) {
  const router = useRouter();
  const showLocal = useShowLocal(d.t);
  const w = walletOf(d.t);
  const need = d.cash.amount;
  const pct = need > 0 ? Math.min(100, Math.round((w.cash / need) * 100)) : w.cash > 0 ? 100 : 0;
  const big = showLocal(w.cash).replace(/^[^\d−-]+/, '');
  const unit = /^₹/.test(showLocal(1)) ? 'rupees' : w.currency === 'JPY' ? 'yen' : w.currency.toLowerCase();
  return (
    <Anim k="jr" delay={710}>
      <Pressable accessibilityRole="button" accessibilityLabel="Cash for the next five days" onPress={() => goTrip(router, tripRoutes.money(d.t.id))} style={[card(C.tile, 28), { gap: 8 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Label>CASH FOR THE NEXT 5 DAYS</Label>
          <View style={{ flexGrow: 1 }} />
          {w.currency === 'JPY' ? <Ico d={P.yen} size={15} color={C.lime} /> : <Ico d={P.wallet} size={15} color={C.lime} />}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingBottom: 4 }}>
          <View style={{ width: 78, height: 170, flexShrink: 0 }}>
            <View style={{ position: 'absolute', top: 0, left: 24, width: 30, height: 14, backgroundColor: '#2E2E34', borderTopLeftRadius: 5, borderTopRightRadius: 5, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 }} />
            <View style={{ position: 'absolute', top: 12, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(245,245,247,0.06)', borderWidth: 1.5, borderColor: 'rgba(245,245,247,0.16)', borderRadius: 18, overflow: 'hidden' }}>
              <Anim k="jrise" style={[bgImage(`linear-gradient(180deg,${pct < 50 ? '#FF6B7A' : '#D7F55C'}CC,${pct < 50 ? '#FF6B7A' : '#D7F55C'}55)`), { position: 'absolute', left: 0, right: 0, bottom: 0, height: `${pct}%` }]} />
              {pct > 0 ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: `${pct}%`, height: 2, backgroundColor: pct < 50 ? C.coral : C.lime, boxShadow: `0 0 12px ${pct < 50 ? C.coral : C.lime}` }} /> : null}
            </View>
          </View>
          <View style={{ flexGrow: 1, flexShrink: 1, alignItems: 'flex-end', gap: 2, minWidth: 0 }}>
            {need > 0 ? (
              <>
                <Text style={{ color: pct < 50 ? C.coral : C.lime, fontSize: 30, letterSpacing: -0.5, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{`${pct}%`}</Text>
                <Text style={{ color: C.mid, fontSize: 13, textAlign: 'right', fontFamily: 'PlusJakartaSans_600SemiBold' }}>of what you need</Text>
                <Text style={{ marginTop: 8, color: C.white, fontSize: 22, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{showLocal(need)}</Text>
                <Text numberOfLines={2} style={{ color: C.mid, fontSize: 12, textAlign: 'right', fontFamily: 'PlusJakartaSans_600SemiBold' }}>{`needed by ${dLabel(d.cash.by!, false)}`}</Text>
              </>
            ) : (
              <>
                <Text style={{ color: C.lime, fontSize: 30, letterSpacing: -0.5, fontFamily: 'PlusJakartaSans_700Bold' }}>None due</Text>
                <Text style={{ color: C.mid, fontSize: 13, textAlign: 'right', fontFamily: 'PlusJakartaSans_600SemiBold' }}>nothing cash-only in the next 5 days</Text>
              </>
            )}
          </View>
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', left: 58, right: 16, bottom: 12, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ flexShrink: 1, color: C.white, fontSize: 58, lineHeight: 62, letterSpacing: -3, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{big}</Text>
          <Text style={{ color: C.mid, fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold' }}>{unit}</Text>
        </View>
      </Pressable>
    </Anim>
  );
}

/* Cash and the IC card (JP-Parts 15): what you carry, Withdrew / Topped up. */
function WalletCard({ d, ctx }: { d: D; ctx: LifeOSContext }) {
  const toast = useToast();
  const showLocal = useShowLocal(d.t);
  const w = walletOf(d.t);
  const [entry, setEntry] = useState<null | 'cash' | 'ic'>(null);
  const [text, setText] = useState('');
  const ic = isJapan(d.t) ? 'Suica' : 'IC card';
  const save = () => {
    const n = Number(text.replace(/[^\d.]/g, ''));
    if (!entry || !n) return setEntry(null);
    const undo = changeWallet(ctx, d.t.id, { [entry]: n });
    toast.show({ message: entry === 'cash' ? `Withdrew ${money(n, w.currency)}` : `Topped up ${ic} · ${money(n, w.currency)}`, icon: 'wallet', undo });
    setEntry(null);
    setText('');
  };
  const need = d.cash.items[0];
  const line = need ? (w.cash >= d.cash.amount ? `enough for ${need.title.split(/\s+/)[0]}` : `${showLocal(d.cash.amount - w.cash)} short`) : w.told ? 'cash in hand' : 'tell it what you withdrew';
  return (
    <Anim k="jr" delay={740} style={[card(C.tile, 28), { gap: 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Label>{`CASH & ${isJapan(d.t) ? 'IC' : 'CARD'}`}</Label>
        <View style={{ flexGrow: 1 }} />
        <Ico d={P.wallet} size={15} color={C.lime} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text style={{ color: C.white, fontSize: 26, lineHeight: 27, letterSpacing: -0.5, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{showLocal(w.cash)}</Text>
          <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, lineHeight: 15, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{`cash · ${line}`}</Text>
        </View>
        <View style={{ flexGrow: 1 }} />
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: C.white, fontSize: 26, lineHeight: 27, letterSpacing: -0.5, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{showLocal(w.ic)}</Text>
          <Text style={{ color: C.mid, fontSize: 12, lineHeight: 15, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{ic}</Text>
        </View>
      </View>
      {entry ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flexGrow: 1, flexShrink: 1, height: 40, borderRadius: 999, backgroundColor: C.raised, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: C.mid, fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold' }}>{symOf(w.currency).trim()}</Text>
            <TextInput autoFocus value={text} onChangeText={setText} onSubmitEditing={save} keyboardType="numeric" placeholder={entry === 'cash' ? 'How much you withdrew' : 'How much you topped up'} placeholderTextColor={C.low} style={{ flexGrow: 1, color: C.white, fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold', paddingVertical: 0 }} />
          </View>
          <Pressable accessibilityRole="button" onPress={save} style={{ height: 40, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.ink, fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold' }}>Save</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['cash', 'ic'] as const).map((k) => (
            <Pressable key={k} accessibilityRole="button" onPress={() => setEntry(k)} style={({ pressed }) => ({ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 40, borderRadius: 999, backgroundColor: C.raised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
              <Ico d={P.plus} size={17} color={C.lime} />
              <Text style={{ color: C.white, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{k === 'cash' ? 'Withdrew' : 'Topped up'}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Anim>
  );
}

const stepFor = (cur: string) => (cur === 'JPY' ? 500 : cur === 'INR' ? 200 : cur === 'THB' ? 100 : 5);

/* Bought something small? Slide to the amount and add it (a Bill for you, out of your cash). */
function SmallSpend({ d, ctx }: { d: D; ctx: LifeOSContext }) {
  const toast = useToast();
  const showLocal = useShowLocal(d.t);
  const cur = d.t.data.localCurrency ?? 'INR';
  const [wide, setWide] = useState(false);
  const step = stepFor(cur) * (wide ? 5 : 1);
  const [k, setK] = useState(1);
  const [w, setW] = useState(1);
  const amount = k * step;
  const pick = (e: GestureResponderEvent) => setK(Math.max(0, Math.min(4, Math.round((e.nativeEvent.locationX / w) * 4))));
  const add = () => {
    if (!amount) return;
    const rate = cur === 'INR' ? undefined : d.t.data.fxRate;
    const bill = makeBill(ctx, 'Small spend', { amount, currency: cur, ...(rate ? { rate } : {}), date: d.today, category: 'food', split: { payers: { me: amount }, method: 'equal', shares: { me: 1 } }, tripId: d.t.id });
    const undoCash = walletOf(d.t).cash > 0 ? changeWallet(ctx, d.t.id, { cash: -amount }) : null;
    toast.show({ message: `Added ${money(amount, cur)}`, icon: 'check', undo: () => { ctx.records.delete(bill.id, 'user'); undoCash?.(); } });
  };
  return (
    <Anim k="jr" delay={770} style={[card(C.tile, 28), { gap: 12, overflow: 'visible' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: C.white, fontSize: 34, letterSpacing: -1, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{showLocal(amount)}</Text>
        <View style={{ flexGrow: 1 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={wide ? 'Smaller amounts' : 'More amounts'} onPress={() => setWide((x) => !x)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: wide ? C.white : C.raised, alignItems: 'center', justifyContent: 'center' }}>
          <Ico d={P.sliders} size={15} color={wide ? C.ink : C.white} />
        </Pressable>
      </View>
      <View
        onLayout={(e: LayoutChangeEvent) => setW(Math.max(1, e.nativeEvent.layout.width))}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={pick}
        onResponderMove={pick}
        accessibilityRole="adjustable"
        accessibilityLabel="Amount"
        accessibilityValue={{ text: money(amount, cur) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => setK((x) => Math.max(0, Math.min(4, x + (e.nativeEvent.actionName === 'increment' ? 1 : -1))))}
        style={{ height: 22, marginHorizontal: 6 }}
      >
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: '50%', marginTop: -1.5, height: 3, borderRadius: 2, backgroundColor: '#303036' }} />
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, width: `${k * 25}%`, top: '50%', marginTop: -1.5, height: 3, borderRadius: 2, backgroundColor: C.lime }} />
        {[0, 1, 2, 3, 4].map((i) => <View key={i} pointerEvents="none" style={{ position: 'absolute', left: `${i * 25}%`, top: '50%', marginTop: -2, marginLeft: -2, width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(245,245,247,0.35)' }} />)}
        <View pointerEvents="none" style={{ position: 'absolute', left: `${k * 25}%`, top: '50%', marginTop: -10, marginLeft: -15, width: 30, height: 20, borderRadius: 10, backgroundColor: C.white, boxShadow: '0 2px 8px rgba(0,0,0,.5)' }} />
      </View>
      <Text style={{ color: C.mid, fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' }}>Bought something small? Slide to the amount and add it.</Text>
      <Pressable accessibilityRole="button" disabled={!amount} onPress={add} style={({ pressed }) => ({ height: 46, borderRadius: 999, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', opacity: !amount ? 0.4 : pressed ? 0.85 : 1 })}>
        <Text style={{ color: C.ink, fontSize: 15, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Add</Text>
      </Pressable>
    </Anim>
  );
}

/* Show the driver (JP-Parts 14): tonight's stay big, the town in its script, Open in Maps, Copy. */
function DriverCard({ d, jp }: { d: D; jp: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const stay = d.stay!;
  const name = stay.title.replace(/^Stay · /, '');
  const town = d.there;
  const local = jp && town?.data.localName ? town.data.localName : null;
  const line3 = [stay.data.access, !stay.data.access ? town?.title : null].filter(Boolean).join(' · ');
  const maps = stay.data.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${town?.title ?? ''}`.trim())}`;
  const copy = () => void Clipboard.setStringAsync([name, [local, town?.title].filter(Boolean).join(' '), stay.data.access].filter(Boolean).join('\n')).then(() => toast.show({ message: 'Copied for the driver', icon: 'check' }));
  return (
    <Anim k="jr" delay={830}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name}`} onPress={() => router.push(tripRoutes.stay(stay.id))} style={{ gap: 8, padding: 16, backgroundColor: C.white, borderRadius: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ color: 'rgba(11,11,13,0.62)', fontSize: 10, letterSpacing: 1, fontFamily: MONO }}>{jp ? 'SHOW THE DRIVER · 運転手さんへ' : 'SHOW THE DRIVER'}</Text>
          <View style={{ flexGrow: 1 }} />
          <Ico d={P.expand} size={16} color="rgba(11,11,13,0.62)" />
        </View>
        <Text numberOfLines={2} adjustsFontSizeToFit style={{ color: C.ink, fontSize: 34, lineHeight: 40, letterSpacing: 0.5, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{name}</Text>
        {local ? <Text style={{ color: C.ink, fontSize: 18, lineHeight: 24, fontFamily: JP_SANS, fontWeight: '700' }}>{local}</Text> : null}
        {line3 ? <Text numberOfLines={2} style={{ color: 'rgba(11,11,13,0.62)', fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{line3}</Text> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(maps)} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 40, borderRadius: 999, backgroundColor: C.ink, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={C.lime} strokeWidth={2} strokeLinejoin="round"><Polygon points="3 11 22 2 13 21 11 13 3 11" /></Svg>
            <Text style={{ color: C.white, fontSize: 14, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Open in Maps</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={copy} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 40, borderRadius: 999, backgroundColor: 'rgba(11,11,13,0.14)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ico d={P.copy} size={17} color={C.ink}><Rect width={14} height={14} x={8} y={8} rx={2} ry={2} /></Ico>
            <Text style={{ color: C.ink, fontSize: 14, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Copy</Text>
          </Pressable>
        </View>
      </Pressable>
    </Anim>
  );
}

/* The stamp collected this morning (JP-Parts 16): it presses in. */
function StampCollected({ stamp, total, onPress }: { stamp: NonNullable<ReturnType<typeof stampToday>>; total: number; onPress: () => void }) {
  const about = stamp.stop.data.about?.split(/[.;\n]/)[0]?.trim();
  const sub = [`${stamp.index} of ${total}`, [nightsWord(stamp.nights), about && about.length <= 28 ? about.charAt(0).toLowerCase() + about.slice(1) : null].filter(Boolean).join(', ')].join(' · ');
  return (
    <Anim k="jr" delay={1000}>
      <Pressable accessibilityRole="button" onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 10, paddingRight: 14, backgroundColor: C.white, borderRadius: 22 }}>
        <Anim k="jstamp" style={{ flexShrink: 0 }}>
          <StampDisc mark={stamp.mark} color={hexOf(stamp.color)} size={40} />
        </Anim>
        <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: C.ink, fontSize: 14, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>
            {'Stamp collected · '}
            {stamp.stop.data.localName ? <Text style={{ fontFamily: JP_SANS, fontWeight: '800' }}>{`${stamp.stop.data.localName} `}</Text> : null}
            {stamp.stop.title}
          </Text>
          <Text numberOfLines={1} style={{ color: 'rgba(11,11,13,0.62)', fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{sub}</Text>
        </View>
        <Text style={{ color: C.ink, fontSize: 13, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>Open</Text>
      </Pressable>
    </Anim>
  );
}

/* ------------------------------------------------------------------ */
/* Afternoon                                                           */
/* ------------------------------------------------------------------ */

function Afternoon({ d, ctx, now, jp }: { d: D; ctx: LifeOSContext; now: number; jp: boolean }) {
  const router = useRouter();
  const h = new Date(now).getHours();
  const there = d.there;
  const lastTimed = [...d.agenda.items].reverse().find((x) => x.time && x.kind !== 'pack');
  return (
    <>
      <Anim k="jr" delay={110}>
        <Text style={{ color: C.mid, fontSize: 34, lineHeight: 38, letterSpacing: -0.8, fontFamily: 'PlusJakartaSans_400Regular' }}>{h >= 18 ? 'This evening' : h >= 14 ? 'This afternoon' : 'Arrived'}</Text>
        <Text numberOfLines={1} style={{ color: C.white, fontSize: 34, lineHeight: 38, letterSpacing: -0.8, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{there ? `in ${there.title}` : d.v.night?.kind === 'air' ? 'in the air' : 'going home'}</Text>
      </Anim>
      <RestOfToday d={d} now={now} />
      {d.happening ? <Happening d={d} jp={jp} onPress={() => router.push(tripRoutes.day(d.t.id, d.today))} /> : null}
      <WeatherAfternoon d={d} now={now} />
      <BringPack d={d} ctx={ctx} />
      {d.tomorrow ? <Tomorrow d={d} jp={jp} /> : null}
      <AskChips tripId={d.t.id} asks={[{ label: `What can we do after ${lastTimed?.time ?? '17:00'}?` }, { label: `Where should we eat in ${there?.title ?? 'town'} tonight?` }, { label: 'What do we need for tomorrow?' }]} />
    </>
  );
}

const TAG: Record<NonNullable<AgendaItem['tag']>, { label: string; tone: 'lime' | 'grey' | 'coral' }> = { cash: { label: 'Cash', tone: 'grey' }, idea: { label: 'Idea', tone: 'grey' }, want: { label: 'Want to', tone: 'grey' }, planned: { label: 'Planned', tone: 'lime' }, 'heads-up': { label: 'Heads up', tone: 'coral' } };

function RestOfToday({ d, now }: { d: D; now: number }) {
  const router = useRouter();
  const rest = d.agenda.rest;
  const done = d.agenda.done;
  const h = new Date(now).getHours();
  const doneLine = done.length ? `${done.length} done ${h < 12 ? 'so far' : h < 17 ? 'this morning' : 'today'} · ${done.slice(-2).map((x) => shortTitle(x)).join(', ')}` : null;
  const open = (x: AgendaItem) => router.push(x.kind === 'check-in' || x.kind === 'check-out' ? tripRoutes.stay(x.ref!) : tripRoutes.day(d.t.id, d.today, x.kind === 'thing' ? 'itinerary' : 'travel'));
  return (
    <Anim k="jr" delay={170} style={[card(C.tile, 28), { gap: 14 }]}>
      <CardHead title="Rest of today" sub={`${dLabel(d.today)} · ${rest.length} thing${rest.length === 1 ? '' : 's'}`} right={<Pill label="Full day" tone="grey" height={28} icon={<Ico d={P.chevR} size={13} color={C.mid} />} onPress={() => router.push(tripRoutes.day(d.t.id, d.today, 'itinerary'))} />} />
      <View>
        {doneLine ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: C.line }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ico d={P.check} size={12} color={C.ink} />
            </View>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: C.mid, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{doneLine}</Text>
          </View>
        ) : null}
        {rest.map((x, i) => {
          const lastRow = i === rest.length - 1;
          const isNow = x.state === 'now';
          const heads = x.tag === 'heads-up';
          const tag = x.tag ? TAG[x.tag] : null;
          return (
            <Pressable key={x.key} accessibilityRole="button" onPress={() => open(x)} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 44, flexShrink: 0 }}>
                <Text style={{ color: isNow ? C.lime : x.state === 'next' ? C.white : C.mid, fontSize: 12, lineHeight: 20, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{x.time ?? '·'}</Text>
              </View>
              <View style={{ width: 16, flexShrink: 0, alignItems: 'center', paddingTop: 3 }}>
                {isNow ? (
                  <View style={{ width: 14, height: 14 }}>
                    <Anim k="jpulse2" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999, backgroundColor: C.lime }} />
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999, backgroundColor: C.lime }} />
                  </View>
                ) : (
                  <View style={{ width: 12, height: 12, margin: 1, borderRadius: 6, borderWidth: 2, borderColor: heads ? '#FF5C47' : 'rgba(245,245,247,0.4)' }} />
                )}
                {lastRow ? null : <View style={{ flexGrow: 1, width: 1.5, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.12)' }} />}
              </View>
              <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, paddingBottom: lastRow ? 0 : 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                  <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                    <Text numberOfLines={2} style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: isNow ? 'PlusJakartaSans_700Bold' : 'PlusJakartaSans_600SemiBold' }}>{x.title}</Text>
                    {x.sub ? <Text numberOfLines={2} style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: 'PlusJakartaSans_400Regular' }}>{x.sub}</Text> : null}
                  </View>
                  {tag ? <Pill label={tag.label} tone={tag.tone} height={22} /> : null}
                </View>
                {isNow && x.progress != null ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <View style={{ flexGrow: 1, height: 6, borderRadius: 3, backgroundColor: '#303036', overflow: 'hidden' }}>
                      <Anim k="jbar" style={{ width: `${Math.round(x.progress * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: C.lime }} />
                    </View>
                    <Text style={{ color: C.lime, fontSize: 10, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{`${x.minutesLeft} MIN LEFT`}</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
        {!rest.length ? <Text style={{ color: C.mid, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Nothing else planned today.</Text> : null}
      </View>
    </Anim>
  );
}

const SEASON = (day: string) => {
  const m = Number(day.slice(5, 7));
  return m === 12 || m <= 2 ? '冬' : m <= 5 ? '春' : m <= 8 ? '夏' : '秋';
};
const HAPPENING_MARK: Record<string, string> = { festival: '祭', closure: '休', crowds: '混', holiday: '祝', weather: '天' };

function Happening({ d, jp, onPress }: { d: D; jp: boolean; onPress: () => void }) {
  const e = d.happening!;
  const mark = jp ? HAPPENING_MARK[e.data.happening ?? ''] ?? SEASON(d.today) : e.title.slice(0, 1).toUpperCase();
  const note = e.data.notes?.split('\n').filter(Boolean).pop();
  return (
    <Anim k="jr" delay={230}>
      <Pressable accessibilityRole="button" onPress={onPress} style={[card(C.tile, 24, 14), { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: hexOf(d.there?.data.color, '#C99A6E'), alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Text style={{ color: C.ink, fontSize: 18, fontFamily: jp ? JP_SERIF : 'PlusJakartaSans_800ExtraBold', fontWeight: '800' }}>{mark}</Text>
        </View>
        <View style={{ flexGrow: 1, flexShrink: 1 }}>
          <CardHead title={e.title} sub={`happening ${e.data.stopId ? 'here' : 'on the trip'} today${note ? ` · ${note}` : ''}`} />
        </View>
      </Pressable>
    </Anim>
  );
}

function WeatherAfternoon({ d, now }: { d: D; now: number }) {
  const there = d.there ?? d.here;
  const n = stopNormals(there, d.today);
  if (!n || !there) return null;
  const min = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const hour = new Date(now).getHours();
  const sun = d.pin ? sunTimes(d.pin.lat, d.pin.lng, d.today) : null;
  const hours = hourlyNormals(n, hour, Math.max(4, Math.min(8, 24 - hour)));
  const skyColor = n.sky === 'snow' || n.sky === 'rain' ? '#6CC6FF' : n.sky === 'sun' ? '#F6B547' : C.white;
  const dark = (h: number) => (sun ? h * 60 >= sun.set || h * 60 < sun.rise : h >= 18 || h < 6);
  const neg = (x: number) => `${x}°`.replace('-', '−');
  return (
    <>
      <Anim k="jr" delay={290} style={[card(C.tile, 28), { gap: 12 }]}>
        <CardHead title={`Weather in ${there.title}`} sub={`${SKY_WORD[n.sky].toLowerCase()} is usual in ${monthWord(d.today)}`} right={<Text style={{ color: C.low, fontSize: 9, letterSpacing: 0.9, fontFamily: MONO }}>{`${monthWord(d.today).toUpperCase()} NORMALS`}</Text>} />
        <View style={{ padding: 18, backgroundColor: C.raised, borderRadius: 26 }}>
          <Text style={{ color: 'rgba(245,245,247,0.5)', fontSize: 20, lineHeight: 26, letterSpacing: -0.4, fontFamily: 'PlusJakartaSans_600SemiBold' }}>
            {'It’s about '}
            <Text style={{ color: C.white, fontFamily: 'PlusJakartaSans_700Bold' }}>{neg(Math.round(tempAt(n, min)))}</Text>
            {' now. '}
            <Text style={{ color: skyColor, fontFamily: 'PlusJakartaSans_700Bold' }}>{SKY_WORD[n.sky]}</Text>
            {' is usual this month, down to '}
            <Text style={{ color: C.white, fontFamily: 'PlusJakartaSans_700Bold' }}>{neg(n.lo)}</Text>
            {' tonight.'}
          </Text>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16 }}>
          {hours.map((x, i) => (
            <View key={x.hour} style={{ width: 54, flexShrink: 0, alignItems: 'center', gap: 5, paddingVertical: 10, borderRadius: 18, backgroundColor: i ? C.raised : C.lime }}>
              <Text style={{ color: i ? C.mid : 'rgba(11,11,13,0.62)', fontSize: 10, fontFamily: MONO }}>{i ? String(x.hour).padStart(2, '0') : 'NOW'}</Text>
              <SkyIcon sky={dark(x.hour) ? 'moon' : n.sky} color={i ? undefined : C.ink} />
              <Text style={{ color: i ? C.white : C.ink, fontSize: 15, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{neg(x.temp)}</Text>
            </View>
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <SkyIcon sky={n.sky} size={13} color={C.mid} />
            <Text style={{ color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_700Bold' }}>{`${neg(n.lo)} to ${neg(n.hi)}`}</Text>
          </View>
          {sun ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <SkyIcon sky="sun" size={13} color={C.mid} />
              <Text style={{ color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_700Bold' }}>{`sunset ${clock(sun.set)}`}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <SkyIcon sky="moon" size={13} color={C.mid} />
            <Text style={{ color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_700Bold' }}>{`${neg(n.lo)} overnight`}</Text>
          </View>
        </View>
      </Anim>
      {sun && min < sun.set ? <SunsetLight rise={sun.rise} set={sun.set} minute={min} place={there.title} /> : null}
    </>
  );
}

function SunsetLight({ rise, set, minute, place }: { rise: number; set: number; minute: number; place: string }) {
  const from = set - 40;
  const p = Math.max(0, Math.min(1, (minute - rise) / Math.max(1, set - rise)));
  // The arc: a quadratic from (6,62) over (155,-38.5) to (304,62).
  const x = (1 - p) * (1 - p) * 6 + 2 * (1 - p) * p * 155 + p * p * 304;
  const y = (1 - p) * (1 - p) * 62 + 2 * (1 - p) * p * -38.5 + p * p * 62;
  const len = 387.5;
  const to = from - minute;
  const starts = to > 0 ? `STARTS IN ${Math.floor(to / 60) ? `${Math.floor(to / 60)} H ` : ''}${to % 60} MIN` : 'ON NOW';
  return (
    <Anim k="jr" delay={350} style={{ gap: 6, padding: 16, backgroundColor: '#1E1C12', borderRadius: 26 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <Text style={{ color: C.white, fontSize: 24, letterSpacing: -0.5, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{`${clock(from)}–${clock(set)}`}</Text>
        <Text style={{ color: '#FFB547', fontSize: 13, lineHeight: 15, letterSpacing: 0.5, textAlign: 'right', fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{'SUNSET\nLIGHT'}</Text>
      </View>
      <View style={{ paddingTop: 8, paddingHorizontal: 4 }}>
        <Svg width="100%" height={70} viewBox="0 0 310 70">
          <Defs>
            <LinearGradient id="tdaw" x1="0" x2="1">
              <Stop offset="0" stopColor="#FFB547" stopOpacity={0.15} />
              <Stop offset="1" stopColor="#FFB547" />
            </LinearGradient>
          </Defs>
          <Path d="M 6 62 Q 155.0 -38.5 304 62" fill="none" stroke="rgba(245,245,247,0.14)" strokeWidth={10} strokeLinecap="round" />
          <Path d="M 6 62 Q 155.0 -38.5 304 62" fill="none" stroke="url(#tdaw)" strokeWidth={10} strokeLinecap="round" strokeDasharray={`${(p * len).toFixed(1)} ${len}`} />
          <Circle cx={x} cy={y} r={9} fill="#FFF8E0" />
        </Svg>
      </View>
      <Text numberOfLines={1} style={{ color: '#FFB547', fontSize: 13, letterSpacing: 0.5, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{`${starts} · ${place.toUpperCase()}`}</Text>
    </Anim>
  );
}

/* Bring and pack (JP-Parts 50): what to wear, carry and pack, from the month's weather and the plan. */
function BringPack({ d, ctx }: { d: D; ctx: LifeOSContext }) {
  const there = d.there ?? d.here;
  const next = d.tomorrow?.journey ? d.tomorrow.to : null;
  const cashToday = d.v.toPay.some((e) => /\bcash\b/i.test(e.data.payHow ?? '')) || walletOf(d.t).currency === 'JPY';
  const bp = bringAndPack({ here: there?.title ?? d.t.data.destination, normals: stopNormals(there, d.today), next: next ? { name: next.title, normals: stopNormals(next, d.tomorrow!.day) } : null, cashToday, cashSymbol: symOf(walletOf(d.t).currency).trim() });
  const packed = new Set((d.t.data.packed ?? []).map((x) => x.toLowerCase()));
  const extra = d.packing.items.filter((x) => !x.packed && !bp.tonight.some((t) => t.toLowerCase() === x.title.toLowerCase())).slice(0, 3).map((x) => x.title);
  const toggle = (label: string) => {
    const list = d.t.data.packed ?? [];
    const has = list.some((x) => x.toLowerCase() === label.toLowerCase());
    ctx.records.update<TripData>(d.t.id, { data: { packed: has ? list.filter((x) => x.toLowerCase() !== label.toLowerCase()) : [...list, label] } }, 'user');
  };
  const Lane = ({ title, items, grey = [] }: { title: string; items: string[]; grey?: string[] }) => (
    <View style={{ gap: 6 }}>
      <Label>{title}</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16 }}>
        {[...items.map((x) => ({ x, g: false })), ...grey.map((x) => ({ x, g: true }))].map(({ x, g }) => {
          const on = packed.has(x.toLowerCase());
          return (
            <Pressable key={x} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(x)} style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 6, height: 36, paddingLeft: on || !g ? 10 : 14, paddingRight: 14, borderRadius: 999, backgroundColor: on ? C.lime : g ? C.raised : 'transparent', borderWidth: on || g ? 0 : 1.5, borderColor: C.lime, borderStyle: 'dashed' }}>
              {on ? <Ico d={P.check} size={14} color={C.ink} /> : g ? null : <Ico d={P.plus} size={14} color={C.lime} />}
              <Text style={{ color: on ? C.ink : C.white, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{x}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
  return (
    <Anim k="jr" delay={410} style={[card(C.tile, 28), { gap: 14, overflow: 'visible' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(215,245,92,0.16)', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ico d={P.sparkle} size={15} color={C.lime} />
        </View>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: 'PlusJakartaSans_700Bold' }}>Bring and pack</Text>
          <Text style={{ color: C.mid, fontSize: 13, lineHeight: 18, fontFamily: 'PlusJakartaSans_400Regular' }}>{bp.why}</Text>
        </View>
      </View>
      <Lane title="WEAR FOR THE WALK" items={bp.wear} />
      <Lane title="IN THE DAY BAG" items={bp.bag} />
      {bp.tonightFor ? <Lane title={`PACK TONIGHT FOR ${bp.tonightFor.toUpperCase()}`} items={bp.tonight} grey={extra} /> : null}
    </Anim>
  );
}

/* Tomorrow (JP-Parts 51): where you go next, when you leave, its weather. */
function Tomorrow({ d, jp }: { d: D; jp: boolean }) {
  const router = useRouter();
  const tm = d.tomorrow!;
  const j = tm.journey;
  const dep = j ? departOf(j) : null;
  const leave = dep ? hm(dep) : null;
  const to = tm.to;
  const n = stopNormals(to ?? d.there, tm.day);
  const last = tm.day === d.t.data.endDate;
  const sub = j ? `${tm.from?.title ?? '?'} → ${to?.title ?? '?'}${j.data.takes ? ` · ≈ ${j.data.takes.replace(/^≈\s*/, '')}` : ''}${j.data.mode ? ` by ${j.data.mode.replace(/\s*\+\s*/, ' and ')}` : ''}` : last ? 'The last day · flying home' : `Another day in ${to?.title ?? d.there?.title ?? 'town'}`;
  const first = j ? stepsOfFirst(j) : null;
  const text = tm.plan ?? [first, j?.data.bookNote].filter(Boolean).join(' · ');
  const big = (s: ObjectRecord<StopData> | null | undefined, color: string) => (
    <Text numberOfLines={1} style={{ flexShrink: 1, color, fontSize: isLocal(s, jp) ? 22 : 18, fontFamily: isLocal(s, jp) ? JP_SANS : 'PlusJakartaSans_800ExtraBold', fontWeight: '900' }}>{localOf(s, jp)}</Text>
  );
  return (
    <Anim k="jr" delay={470}>
      <Pressable accessibilityRole="button" onPress={() => router.push(tripRoutes.day(d.t.id, tm.day))} style={[card(C.tile, 28), { gap: 10 }]}>
        <CardHead title={`Tomorrow · ${dLabel(tm.day)}`} sub={sub} right={leave ? <Pill label={`leave ${leave}`} /> : null} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {j && tm.from ? (
            <>
              {big(tm.from, C.white)}
              <Ico d={P.chevR} size={16} color={C.low} />
            </>
          ) : null}
          {to ? big(to, hexOf(to.data.color)) : null}
          <View style={{ flexGrow: 1 }} />
          {n ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <SkyIcon sky={n.sky} size={16} />
              <Text style={{ color: C.white, fontSize: 14, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{`${n.hi}° / ${n.lo}°`.replace(/-/g, '−')}</Text>
            </View>
          ) : null}
        </View>
        {text ? <Text numberOfLines={4} style={{ color: C.mid, fontSize: 13, lineHeight: 18, fontFamily: 'PlusJakartaSans_500Medium' }}>{text}</Text> : null}
      </Pressable>
    </Anim>
  );
}

function stepsOfFirst(j: ObjectRecord<TravelEvent>): string | null {
  const s = (j.data.steps ?? '').split('\n').map((x) => x.trim()).filter(Boolean)[0];
  return s ? s.replace(/^≈?\d{1,2}:\d{2}\s+/, '').split(/\s+\|\s+/)[0]! : null;
}
