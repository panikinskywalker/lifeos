import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, Text as RNText, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Defs, G, Path, Pattern, Rect, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ActionSheet, Icon, Text, useToast } from '@ui/kit';
import {
  addToLine,
  calendarCells,
  calendarDays,
  dayMonth,
  dayPlans,
  dayView,
  ensureStop,
  eventsOf,
  faresEach,
  fitMap,
  legChip,
  legMode,
  legTimes,
  monthsTitle,
  movingDays,
  moveStop,
  nearestOnLine,
  nightsOf,
  planLegs,
  planNormals,
  rateFor,
  saveStop,
  segmentsOf,
  setStopPosition,
  stationCode as stationCodeOf,
  statusOf,
  stayMoney,
  stepsOf,
  STOP_COLORS,
  stopMark,
  stopSpan,
  stopsOf,
  thingsOf,
  thingStatus,
  tightestMove,
  tripIcs,
  tripStays,
  tripTickets,
  type Night,
  type OutingData,
  type PlanLeg,
  type StopData,
  type TravelEvent,
  type TripData,
} from '@modules/travel';
import { plural, Row, RowCard, SectionHead } from './parts';
import { STOP_HEX, StopDisc, stopHex, openLink as openUrl } from './jp/planparts';
export { STOP_HEX, StopDisc, stopHex } from './jp/planparts';
import { C, TripBar, TripHeader, TripScreen, money, isJapan, tripRoutes, useShow } from './jp/shell';
import { Anim, bgImage, JP_SANS, JP_SERIF, MONO } from './jp/kit';
import { AddThingSheet, Chip, FieldInput, FieldLabel, Glyph, JPSheet, N, PillButton, SegPick, StatusPill, type GlyphName } from './things';

/**
 * Plan (the trip template; JP-Route, JP-Calendar, JP-Map): the line of stops
 * in order with their station names, nights, stays, weather and the legs
 * between them; the ideas off the line; the days as a calendar of nights with
 * the moving days and Add to my calendar; and the stops on the drawn map of
 * Japan with Add a place and Add thing to do. Also the station board and the
 * place sheet the stop and stay pages share (JP-Place, JP-Edit).
 */


type View3 = 'line' | 'days' | 'map';
export const planRoute = (tripId: string, view?: View3) => tripRoutes.plan(tripId, view);

const local = (s: Pick<ObjectRecord<StopData>, 'data'>, japan: boolean) => (japan && s.data.localName ? s.data.localName : null);


/* ------------------------------------------------------------------ */
/* The trip's plan, read once                                           */
/* ------------------------------------------------------------------ */

export interface PlanData {
  trip: ObjectRecord<TripData>;
  japan: boolean;
  line: ObjectRecord<StopData>[];
  ideas: ObjectRecord<StopData>[];
  airports: ObjectRecord<StopData>[];
  nights: Night[];
  legs: PlanLeg[];
  /** Stay Event id → its name. */
  stays: Map<string, string>;
  pins: Map<string, { lat: number; lng: number }>;
  plans: Map<string, string>;
  things: ObjectRecord<OutingData>[];
  events: ObjectRecord<OutingData>[];
  /** The stop you are at (or start at): its disc pulses. */
  currentId: string | null;
}

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function usePlanData(tripId: string): PlanData | null {
  return useLive(
    (os) => {
      const trip = os.records.get<TripData>(tripId);
      if (trip?.object !== 'trip') return null;
      const all = stopsOf(os, trip.id, ['stop', 'idea', 'airport']);
      const pins = new Map<string, { lat: number; lng: number }>();
      for (const s of all) {
        const c = s.data.placeId ? os.records.get<{ coordinates?: { lat: number; lng: number } }>(s.data.placeId)?.data.coordinates : undefined;
        if (c) pins.set(s.id, c);
      }
      const nights = nightsOf(os, trip);
      const stays = new Map<string, string>();
      for (const n of nights) if (n.stayId && !stays.has(n.stayId)) stays.set(n.stayId, os.records.get(n.stayId)?.title.replace(/^Stay · /, '') ?? '');
      const line = all.filter((s) => s.data.kind === 'stop');
      const today = isoToday();
      const tonight = nights.find((n) => n.day === today)?.stopId;
      const currentId = tonight ?? (trip.data.startDate && today < trip.data.startDate ? nights.find((n) => n.stopId)?.stopId ?? line[0]?.id ?? null : null);
      const things = thingsOf(os, trip.id);
      return { trip, japan: isJapan(trip), line, ideas: all.filter((s) => s.data.kind === 'idea'), airports: all.filter((s) => s.data.kind === 'airport'), nights, legs: planLegs(os, trip.id, line, nights), stays, pins, plans: dayPlans(os, trip.id), things: things.filter((t) => t.data.kind !== 'event'), events: eventsOf(os, trip), currentId };
    },
    [tripId],
  );
}

/** A ₹ amount's formatter for a sum in any currency the trip knows (the switch's unit). */
export function useCost(trip: ObjectRecord<TripData> | null | undefined) {
  const show = useShow(trip);
  return (n: number, cur?: string) => {
    const c = cur ?? trip?.data.localCurrency ?? 'INR';
    const r = trip ? rateFor(trip, c) : c === 'INR' ? 1 : null;
    return r ? show(n * r) : money(n, c);
  };
}

/* ------------------------------------------------------------------ */
/* The screen                                                           */
/* ------------------------------------------------------------------ */

export function PlanScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const [view, setView] = useState<View3>((['line', 'days', 'map'] as const).find((v) => v === params.view) ?? 'line');
  useEffect(() => {
    const v = (['line', 'days', 'map'] as const).find((x) => x === params.view);
    if (v) setView(v);
  }, [params.view]);
  const d = usePlanData(params.trip ?? '');
  if (!d) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
        <RNText style={{ color: C.mid, fontSize: 15, fontFamily: 'PlusJakartaSans_500Medium' }}>That trip isn’t here any more.</RNText>
        <PillButton label="All trips" grow={false} onPress={() => router.replace(tripRoutes.travel)} />
      </View>
    );
  }
  const pick = (v: View3) => {
    setView(v);
    router.setParams({ view: v });
  };
  const label = `PLAN · ${plural(d.line.length, 'STOP')}`;
  if (view === 'map') return <MapView d={d} ctx={ctx} label={label} onView={pick} />;
  return (
    <TripScreen tripId={d.trip.id} active="plan">
      <TripHeader trip={d.trip} label={label} />
      <PlanTabs value={view} onChange={pick} />
      {view === 'line' ? <LineView d={d} ctx={ctx} /> : <DaysView d={d} ctx={ctx} />}
    </TripScreen>
  );
}

function PlanTabs({ value, onChange }: { value: View3; onChange: (v: View3) => void }) {
  return <SegPick options={[{ value: 'map' as View3, label: 'Map' }, { value: 'line', label: 'Line' }, { value: 'days', label: 'Days' }]} value={value} onChange={onChange} height={32} track={N.tile} />;
}

/* ------------------------------------------------------------------ */
/* Line (JP-Route)                                                      */
/* ------------------------------------------------------------------ */

const SKY_ICON: Record<string, [GlyphName, string]> = { sun: ['sun', '#F2C94C'], snow: ['snow', '#9AD0FF'], cloud: ['cloud', 'rgba(245,245,247,0.62)'], rain: ['rain', '#9AD0FF'] };

/** The line as a strip: a bar per stop as long as its nights, its disc, its name above or below. */
function LineStrip({ d }: { d: PlanData }) {
  const [w, setW] = useState(318);
  const spans = d.line.map((s) => stopSpan(d.nights, s.id)?.nights ?? 0);
  const units = spans.reduce((a, n) => a + Math.max(n, 0.6), 0) || 1;
  const gap = 2;
  const unit = (w - gap * Math.max(0, d.line.length - 1)) / units;
  let x = 0;
  const bars = d.line.map((s, i) => {
    const bw = Math.max(spans[i]!, 0.6) * unit;
    const b = { s, x, w: bw };
    x += bw + gap;
    return b;
  });
  return (
    <View onLayout={(e) => setW(Math.max(100, e.nativeEvent.layout.width))}>
      <Svg width={w} height={50} viewBox={`0 0 ${w} 50`} accessibilityLabel={`The line: ${d.line.map((s) => s.title).join(', ')}`}>
        {bars.map(({ s, x: bx, w: bw }) => (
          <G key={s.id}>
            <Rect x={bx} y={18} width={bw} height={8} rx={4} fill={stopHex(s)} />
            <Circle cx={bx + 4} cy={22} r={5} fill={C.ink} stroke={stopHex(s)} strokeWidth={2.5} />
          </G>
        ))}
        {bars.map(({ s, x: bx }, i) => {
          const last = i === bars.length - 1 && bars.length > 1;
          const name = local(s, d.japan) ?? s.title.split(/[\s,]/)[0]!;
          return (
            <SvgText key={`t${s.id}`} x={last ? w : bx} y={i % 2 ? 44 : 10} textAnchor={last ? 'end' : 'start'} fontFamily={d.japan && s.data.localName ? JP_SANS : 'PlusJakartaSans_700Bold'} fontSize={10} fontWeight="700" fill={C.white}>
              {name}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

function LineView({ d, ctx }: { d: PlanData; ctx: LifeOSContext }) {
  const router = useRouter();
  const toast = useToast();
  const cost = useCost(d.trip);
  const [acting, setActing] = useState<ObjectRecord<StopData> | null>(null);
  const nights = d.nights.filter((n) => n.kind === 'stay').length;
  const moves = movingDays(d.nights).length;
  const fares = Object.entries(faresEach(d.legs));
  const open = (id: string) => router.push(tripRoutes.stop(id));
  const move = (s: ObjectRecord<StopData>, dir: -1 | 1) => {
    const undo = moveStop(ctx, s.id, dir);
    if (undo) toast.show({ message: `${s.title} moved ${dir < 0 ? 'earlier' : 'later'}`, icon: 'transfer', undo });
  };
  const idx = acting ? d.line.findIndex((s) => s.id === acting.id) : -1;
  return (
    <>
      <Anim k="jr" delay={150} style={{ gap: 10, padding: 16, backgroundColor: N.tile, borderRadius: 28, overflow: 'hidden' }}>
        {d.line.length ? <LineStrip d={d} /> : <RNText style={{ color: N.mid, fontSize: 13, fontFamily: 'PlusJakartaSans_500Medium' }}>No stops yet. Add the places you’ll sleep in from the map.</RNText>}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <RNText style={{ color: N.white, fontSize: 10, letterSpacing: 0.6, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{`${plural(nights, 'NIGHT')} · ${plural(moves, 'MOVE')}`}</RNText>
          {fares.length ? <RNText numberOfLines={1} style={{ flexShrink: 1, color: N.mid, fontSize: 10, letterSpacing: 0.6, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{`FARES ${fares.map(([c, n]) => cost(n, c)).join(' + ')} EACH`}</RNText> : null}
        </View>
      </Anim>

      <View>
        {d.line.map((s, i) => {
          const span = stopSpan(d.nights, s.id);
          const c = stopHex(s);
          const prevC = i ? stopHex(d.line[i - 1]!) : null;
          const stays = [...new Set(d.nights.filter((n) => n.stopId === s.id && n.stayId).map((n) => d.stays.get(n.stayId!)!))].filter(Boolean);
          const w = planNormals(s, span?.from);
          const leg = d.legs[i];
          const next = d.line[i + 1];
          const pulse = s.id === d.currentId;
          return (
            <React.Fragment key={s.id}>
              <Anim k="jr" delay={100 + i * 50} style={{ flexDirection: 'row', alignItems: 'stretch', gap: 14, minHeight: 76 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, width: 34 }}>
                  {prevC ? <View style={{ position: 'absolute', width: 6, top: 0, height: '50%', left: 14, backgroundColor: prevC }} /> : null}
                  {next ? <View style={{ position: 'absolute', width: 6, top: '50%', bottom: 0, left: 14, backgroundColor: c }} /> : null}
                  <View style={{ width: 34, height: 34, zIndex: 1 }}>
                    {pulse ? <Anim k="jpulse2" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c, borderRadius: 999 }} /> : null}
                    <View style={{ position: 'absolute', top: 0, left: 0, width: 34, height: 34, borderRadius: 17, backgroundColor: N.white, boxShadow: `0 0 0 4px ${c}`, alignItems: 'center', justifyContent: 'center' }}>
                      <RNText style={{ color: N.ink, fontSize: 12, fontFamily: MONO }}>{String(i + 1).padStart(2, '0')}</RNText>
                    </View>
                  </View>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`${s.title}, open. Hold to move it`} onPress={() => open(s.id)} onLongPress={() => setActing(s)} delayLongPress={350} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1, gap: 12, minWidth: 0, paddingVertical: 12, paddingHorizontal: 14, marginVertical: 0, backgroundColor: N.tile, borderRadius: 20, opacity: pressed ? 0.85 : 1 })}>
                  <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                    <RNText numberOfLines={1} style={{ color: N.white }}>
                      {local(s, d.japan) ? <RNText style={{ fontSize: 20, lineHeight: 24, fontFamily: JP_SANS, fontWeight: '900' }}>{`${s.data.localName}  `}</RNText> : null}
                      <RNText style={{ fontSize: local(s, d.japan) ? 14 : 18, fontFamily: 'PlusJakartaSans_700Bold' }}>{s.title}</RNText>
                    </RNText>
                    <RNText numberOfLines={1} style={{ marginTop: 2, color: N.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' }}>{[span ? `${dayMonth(span.from)} – ${dayMonth(span.to)}` : 'no nights here yet', ...stays].join(' · ')}</RNText>
                  </View>
                  <View style={{ alignItems: 'flex-end', flexShrink: 0, gap: 5 }}>
                    <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 12, justifyContent: 'center', backgroundColor: span ? c : 'transparent', borderWidth: span ? 0 : 1.5, borderColor: 'rgba(245,245,247,0.28)' }}>
                      <RNText style={{ color: span ? N.ink : N.mid, fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{span ? plural(span.nights, 'night') : 'no nights'}</RNText>
                    </View>
                    {w ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Glyph name={SKY_ICON[w.sky]![0]} size={12} color={SKY_ICON[w.sky]![1]} />
                        <RNText style={{ color: N.mid, fontSize: 11, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{`${w.hi}° / ${w.lo}°`}</RNText>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              </Anim>
              {leg && next ? <LegRow leg={leg} from={c} to={stopHex(next)} tripId={d.trip.id} /> : null}
            </React.Fragment>
          );
        })}
      </View>

      {d.ideas.length ? (
        <View style={{ gap: 10, minWidth: 0 }}>
          <View style={{ gap: 1 }}>
            <RNText style={{ color: N.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Ideas, not on the line</RNText>
            <RNText style={{ color: N.mid, fontSize: 13, lineHeight: 17, fontFamily: 'PlusJakartaSans_500Medium' }}>{plural(d.ideas.length, 'maybe')}</RNText>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
            {d.ideas.map((s) => {
              const pin = d.pins.get(s.id);
              const near = pin ? nearestOnLine(pin, d.line.map((x) => ({ id: x.id, pin: d.pins.get(x.id) }))) : null;
              const nearStop = near ? d.line.find((x) => x.id === near.id) : null;
              return (
                <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={`${s.title}, an idea`} onPress={() => open(s.id)} style={{ width: 220, flexShrink: 0, gap: 8, padding: 14, borderWidth: 1.5, borderColor: 'rgba(245,245,247,0.24)', borderStyle: 'dashed', borderRadius: 22 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <StopDisc stop={s} look={d.trip.data.look ?? (d.japan ? 'japan' : undefined)} size={38} />
                    <View style={{ flexShrink: 1, minWidth: 0 }}>
                      {local(s, d.japan) ? <RNText numberOfLines={1} style={{ color: N.white, fontSize: 16, lineHeight: 20, fontFamily: JP_SANS, fontWeight: '900' }}>{s.data.localName}</RNText> : null}
                      <RNText numberOfLines={1} style={{ color: local(s, d.japan) ? N.mid : N.white, fontSize: local(s, d.japan) ? 12 : 16, fontFamily: 'PlusJakartaSans_700Bold' }}>{s.title}</RNText>
                    </View>
                  </View>
                  {s.data.about ? <RNText numberOfLines={3} style={{ color: N.mid, fontSize: 13, lineHeight: 18, fontFamily: 'PlusJakartaSans_400Regular' }}>{s.data.about}</RNText> : null}
                  {nearStop ? <View style={{ alignSelf: 'flex-start' }}><Chip label={`near ${nearStop.title} · ${Math.round(near!.km)} km`} height={24} /></View> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel={`Add ${s.title} to the line`} hitSlop={6} onPress={() => toast.show({ message: `${s.title} is on the line`, icon: 'check', undo: addToLine(ctx, s.id) })} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 'auto' }}>
                    <Glyph name="plus" size={14} color={N.lime} />
                    <RNText style={{ color: N.lime, fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold' }}>Add to the line</RNText>
                  </Pressable>
                </Pressable>
              );
            })}
            <View style={{ width: 12 }} />
          </ScrollView>
        </View>
      ) : null}

      <ActionSheet
        visible={!!acting}
        onClose={() => setActing(null)}
        title={acting?.title}
        actions={
          acting
            ? [
                ...(idx > 0 ? [{ label: `Swap with ${d.line[idx - 1]!.title}`, icon: 'chevron-up' as const, onPress: () => move(acting, -1) }] : []),
                ...(idx >= 0 && idx < d.line.length - 1 ? [{ label: `Swap with ${d.line[idx + 1]!.title}`, icon: 'chevron-down' as const, onPress: () => move(acting, 1) }] : []),
                { label: 'Open', icon: 'arrow-right' as const, onPress: () => open(acting.id) },
              ]
            : []
        }
      />
    </>
  );
}

const CHIP_LOOK: Record<string, [string, string]> = { seats: [N.limeSoft, N.lime], open: ['rgba(255,107,122,0.16)', C.coral], booked: [N.limeSoft, N.lime], none: [N.raised, N.mid] };

/** The leg between two stops: the rail fading from one colour to the next, how you go, when, and what to know about booking. */
function LegRow({ leg, from, to, tripId }: { leg: PlanLeg; from: string; to: string; tripId: string }) {
  const router = useRouter();
  const chip = legChip(leg.journey);
  const [bg, fg] = CHIP_LOOK[chip.kind]!;
  const text = leg.journey ? legTimes(leg.journey) || dayMonth(leg.day ?? '') : leg.day ? dayMonth(leg.day) : '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 14, minHeight: 44 }}>
      <View style={{ width: 34, flexShrink: 0 }}>
        <View style={[bgImage(`linear-gradient(180deg,${from},${to})`), { position: 'absolute', width: 6, top: 0, bottom: 0, left: 14 }]} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`The journey${leg.day ? ` on ${dayMonth(leg.day)}` : ''}`} disabled={!leg.day} onPress={() => leg.day && router.push(tripRoutes.day(tripId, leg.day, 'travel'))} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0, paddingVertical: 4 }}>
        <Glyph name={legMode(leg.journey) === 'bus' ? 'bus' : legMode(leg.journey) === 'plane' ? 'plane' : 'train'} size={15} color={N.mid} />
        {text ? <RNText numberOfLines={1} style={{ flexShrink: 1, color: N.mid, fontSize: 11, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{text}</RNText> : null}
        <View style={{ height: 22, paddingHorizontal: 9, borderRadius: 999, backgroundColor: bg, justifyContent: 'center', flexShrink: 0 }}>
          <RNText numberOfLines={1} style={{ color: fg, fontSize: 11, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{chip.label}</RNText>
        </View>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Days (JP-Calendar)                                                   */
/* ------------------------------------------------------------------ */

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DOW3 = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const dowOf = (day: string) => DOW3[new Date(`${day}T12:00:00`).getDay()]!;

async function shareIcs(ctx: LifeOSContext, trip: ObjectRecord<TripData>, fail: () => void) {
  const text = tripIcs(ctx, trip);
  const name = `${trip.title.replace(/[^\w-]+/g, '-').toLowerCase()}.ics`;
  try {
    if (Platform.OS === 'web') {
      const doc = (globalThis as { document?: { createElement(t: string): { href: string; download: string; click(): void } } }).document;
      const url = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
      const a = doc?.createElement('a');
      if (a) {
        a.href = url;
        a.download = name;
        a.click();
      }
      return;
    }
    const f = new File(Paths.cache, name);
    f.write(text);
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(f.uri, { mimeType: 'text/calendar', dialogTitle: 'Add the trip to your calendar' });
  } catch {
    fail();
  }
}

function DaysView({ d, ctx }: { d: PlanData; ctx: LifeOSContext }) {
  const router = useRouter();
  const toast = useToast();
  const cost = useCost(d.trip);
  const { startDate, endDate } = d.trip.data;
  const byId = useMemo(() => new Map([...d.line, ...d.ideas, ...d.airports].map((s) => [s.id, s])), [d]);
  const moves = movingDays(d.nights);
  const tight = tightestMove(d.legs);
  const today = isoToday();
  const [sel, setSel] = useState<string | null>(null);
  if (!startDate || !endDate) {
    return <RNText style={{ color: N.mid, fontSize: 14, lineHeight: 20, paddingHorizontal: 4, fontFamily: 'PlusJakartaSans_500Medium' }}>Give the trip its dates and each night shows here with its stop.</RNText>;
  }
  const days = calendarDays(startDate, endDate);
  const cells = calendarCells(days, d.nights, endDate);
  const selected = sel ?? (today >= startDate && today <= endDate ? today : tight?.day ?? moves[0]?.day ?? startDate);
  const totalDays = d.nights.length + 1;
  const air = d.nights.filter((n) => n.kind === 'air');
  const gaps = d.nights.filter((n) => n.kind === 'gap');
  const segs = segmentsOf(d.nights).filter((g) => g.kind !== 'air');
  const legOn = (day: string) => d.legs.find((l) => l.day === day) ?? null;
  const ask = (q: string) => router.push(tripRoutes.copilot(d.trip.id, q));
  const mark = (s: ObjectRecord<StopData> | undefined) => (s ? (d.japan && s.data.localName ? stopMark(s, 'japan') : stopMark(s)) : '');

  // The free days: not moving, with their own plan first (all of them when none has one).
  const still = d.nights.map((n) => n.day).filter((day) => !moves.some((m) => m.day === day));
  const withPlan = still.filter((day) => d.plans.has(day));
  const dayList = withPlan.length ? withPlan : still;

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
          <RNText numberOfLines={1} style={{ color: N.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{monthsTitle(d.trip.data)}</RNText>
          <RNText numberOfLines={1} style={{ color: N.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_500Medium' }}>{`${plural(totalDays, 'day')} · ${plural(moves.length, 'moving day')}`}</RNText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Add to my calendar" onPress={() => shareIcs(ctx, d.trip, () => toast.show({ message: 'Couldn’t make the calendar file', icon: 'alert' }))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 38, paddingHorizontal: 14, backgroundColor: N.raised, borderRadius: 999, opacity: pressed ? 0.8 : 1 })}>
          <Glyph name="calendar" size={17} color={N.lime} />
          <RNText style={{ color: N.white, fontSize: 13, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Add to my calendar</RNText>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row' }}>
          {DOW.map((x, i) => (
            <View key={i} style={{ flex: 1, paddingBottom: 6 }}>
              <RNText style={{ color: N.low, fontSize: 10, textAlign: 'center', fontFamily: MONO }}>{x}</RNText>
            </View>
          ))}
      </View>
        <View style={{ borderRadius: 18, overflow: 'hidden', gap: 2 }}>
          {Array.from({ length: cells.length / 7 }, (_, w) => (
            <View key={w} style={{ flexDirection: 'row', gap: 2 }}>
              {cells.slice(w * 7, w * 7 + 7).map((cell, k) => {
                const s = cell.stopId ? byId.get(cell.stopId) : undefined;
                const c = s ? stopHex(s) : null;
                const on = cell.day === selected;
                const label = `${dayMonth(cell.day)}${s ? `, ${s.title}` : cell.kind === 'air' ? ', on the plane' : cell.kind === 'gap' ? ', no bed booked' : cell.kind === 'home' ? ', fly home' : ''}${cell.moving ? ', moving day' : ''}`;
                return (
                  <Pressable key={cell.day} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: on }} disabled={!cell.inTrip} onPress={() => setSel(cell.day)} style={{ flex: 1, minWidth: 0, height: 64, paddingTop: 6, gap: 6, backgroundColor: cell.inTrip ? N.tile : '#121215', boxShadow: on ? `inset 0 0 0 2px ${N.lime}` : undefined }}>
                    <RNText style={{ paddingLeft: 6, color: cell.inTrip ? N.white : 'rgba(245,245,247,0.22)', fontSize: 14, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{Number(cell.day.slice(8))}</RNText>
                    {cell.moving ? (
                      <View style={{ position: 'absolute', top: 6, right: 5 }}>
                        <Glyph name={legMode(legOn(cell.day)?.journey ?? null) === 'bus' ? 'bus' : 'train'} size={11} color={N.lime} />
                      </View>
                    ) : null}
                    {cell.kind === 'stay' && c ? (
                      <Anim k="jbar" delay={200 + (w * 7 + k) * 10} style={{ height: 18, flexDirection: 'row', alignItems: 'center', paddingLeft: 5, backgroundColor: c, marginLeft: cell.starts ? 4 : 0, marginRight: cell.ends ? 4 : 0, borderTopLeftRadius: cell.starts ? 6 : 0, borderBottomLeftRadius: cell.starts ? 6 : 0, borderTopRightRadius: cell.ends ? 6 : 0, borderBottomRightRadius: cell.ends ? 6 : 0 }}>
                        {cell.starts ? <RNText numberOfLines={1} style={{ color: N.ink, fontSize: 11, fontFamily: d.japan && s?.data.localName ? JP_SANS : 'PlusJakartaSans_800ExtraBold', fontWeight: '900' }}>{mark(s)}</RNText> : null}
                      </Anim>
                    ) : cell.kind === 'air' || cell.kind === 'home' ? (
                      <View style={{ height: 18, marginHorizontal: 4, borderRadius: 6, backgroundColor: N.bar, alignItems: 'center', justifyContent: 'center' }}>
                        <Glyph name="plane" size={11} color={N.mid} />
                      </View>
                    ) : cell.kind === 'gap' ? (
                      <View style={{ height: 18, marginHorizontal: 4, borderRadius: 6, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#FF5C47' }} />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 14, paddingHorizontal: 20, alignItems: 'center' }}>
        {air.length ? (
          <Legend swatch={<View style={{ width: 18, height: 12, borderRadius: 4, backgroundColor: N.bar, alignItems: 'center', justifyContent: 'center' }}><Glyph name="plane" size={8} color={N.mid} /></View>} label={`Overnight flight · ${air.map((n) => dayMonth(n.day)).join(', ')}`} />
        ) : null}
        <Legend swatch={<View style={{ width: 18, height: 12, borderRadius: 4, backgroundColor: N.bar }} />} label={`Fly home · ${dayMonth(endDate)}`} />
        <Legend swatch={<Glyph name="train" size={12} color={N.lime} />} label={`Moving day · ${moves.length}`} />
        <Legend swatch={<View style={{ width: 18, height: 12, borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#FF5C47' }} />} label={`No bed booked · ${gaps.length ? gaps.length : 'none'}`} />
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}>
        {tight?.day ? (
          <Pressable accessibilityRole="button" onPress={() => setSel(tight.day)} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: 16, backgroundColor: N.raised, borderRadius: 999 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF5C47' }} />
            <RNText style={{ color: N.white, fontSize: 14, lineHeight: 18, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{`Tightest travel day · ${dayMonth(tight.day)}`}</RNText>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" onPress={() => ask('Move something on the plan')} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: 16, backgroundColor: N.raised, borderRadius: 999 }}>
          <Glyph name="swap" size={15} />
          <RNText style={{ color: N.white, fontSize: 14, lineHeight: 18, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Move something</RNText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => ask('Plan our free days')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, backgroundColor: N.raised, borderRadius: 999 }}>
          <Glyph name="sparkle" size={13} color={N.lime} />
          <RNText style={{ color: N.white, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Plan our free days</RNText>
        </Pressable>
        <View style={{ width: 14 }} />
      </ScrollView>

      {segs.length ? (
        <View style={{ gap: 8 }}>
          <RNText style={{ color: N.low, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontFamily: 'PlusJakartaSans_600SemiBold' }}>WHERE WE’RE STAYING</RNText>
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {segs.map((g) => {
              const s = g.stopId ? byId.get(g.stopId) : undefined;
              const c = s ? stopHex(s) : null;
              return (
                <Pressable key={g.from} accessibilityRole="button" accessibilityLabel={`${s?.title ?? (g.kind === 'air' ? 'On the plane' : 'No bed booked')}, ${plural(g.nights, 'night')}`} onPress={() => (g.stayId ? router.push(tripRoutes.stay(g.stayId)) : g.kind === 'gap' ? router.push(tripRoutes.bookings(d.trip.id)) : undefined)} style={{ flexGrow: g.nights, flexShrink: 1, flexBasis: 0, minWidth: 0, height: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c ?? (g.kind === 'air' ? N.bar : 'transparent'), borderWidth: g.kind === 'gap' ? 1.5 : 0, borderStyle: 'dashed', borderColor: '#FF5C47' }}>
                  {s ? <RNText numberOfLines={1} style={{ color: N.ink, fontSize: 13, lineHeight: 15, fontFamily: d.japan && s.data.localName ? JP_SANS : 'PlusJakartaSans_800ExtraBold', fontWeight: '900' }}>{mark(s)}</RNText> : g.kind === 'air' ? <Glyph name="plane" size={12} color={N.mid} /> : null}
                  <RNText style={{ color: c ? 'rgba(11,11,13,0.62)' : N.mid, fontSize: 9, fontFamily: MONO }}>{`${g.nights}N`}</RNText>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <DayCard d={d} day={selected} byId={byId} cost={cost} />

      {dayList.length ? (
        <>
          <ListHead title="Day by day" sub={plural(totalDays, 'day')} />
          <ListCard>
            {dayList.map((day, i) => {
              const n = d.nights.find((x) => x.day === day);
              const s = n?.stopId ? byId.get(n.stopId) : undefined;
              const plan = d.plans.get(day);
              return (
                <ListRow key={day} first={i === 0} onPress={() => router.push(tripRoutes.day(d.trip.id, day))} lead={<DateLead day={day} />} title={s?.title ?? (n?.kind === 'air' ? 'On the plane' : 'No bed booked')} sub={plan ? plan.split('\n')[0]! : 'Free day'} chevron />
              );
            })}
          </ListCard>
        </>
      ) : null}

      {moves.length ? (
        <>
          <ListHead title="Moving days" sub={plural(moves.length, 'journey')} />
          <ListCard>
            {moves.map((m, i) => {
              const a = byId.get(m.fromStopId), b = byId.get(m.toStopId);
              const leg = legOn(m.day);
              const j = leg?.journey ?? null;
              const chip = legChip(j);
              const [bg, fg] = CHIP_LOOK[chip.kind]!;
              const leave = j && !j.data.allDay && j.data.startAt ? `leave ${legTimes({ data: { ...j.data, endAt: undefined, takes: undefined } })}` : null;
              return (
                <ListRow
                  key={m.day}
                  first={i === 0}
                  onPress={() => router.push(tripRoutes.day(d.trip.id, m.day, 'travel'))}
                  lead={<View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: N.raised, alignItems: 'center', justifyContent: 'center' }}><Glyph name={legMode(j) === 'bus' ? 'bus' : 'train'} size={16} color={N.mid} /></View>}
                  title={`${a?.title ?? '?'} → ${b?.title ?? '?'}`}
                  sub={[dayMonth(m.day), leave, j?.data.takes?.replace(/^≈\s*/, '')].filter(Boolean).join(' · ')}
                  trailing={<View style={{ height: 22, paddingHorizontal: 9, borderRadius: 999, backgroundColor: bg, justifyContent: 'center' }}><RNText numberOfLines={1} style={{ color: fg, fontSize: 11, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{chip.label}</RNText></View>}
                />
              );
            })}
          </ListCard>
        </>
      ) : null}
    </>
  );
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 }}>
      {swatch}
      <RNText style={{ color: N.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{label}</RNText>
    </View>
  );
}

function DateLead({ day, big }: { day: string; big?: boolean }) {
  return (
    <View style={{ width: big ? 46 : 40, flexShrink: 0 }}>
      <RNText style={{ color: N.white, fontSize: big ? 24 : 18, lineHeight: big ? 26 : 20, textAlign: 'center', fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{Number(day.slice(8))}</RNText>
      <RNText style={{ color: N.mid, fontSize: big ? 10 : 9, letterSpacing: 0.9, textAlign: 'center', fontFamily: MONO }}>{dowOf(day)}</RNText>
    </View>
  );
}

function ListHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ paddingTop: 10, paddingHorizontal: 4, gap: 1 }}>
      <RNText numberOfLines={1} style={{ color: N.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{title}</RNText>
      {sub ? <RNText numberOfLines={1} style={{ color: N.mid, fontSize: 13, lineHeight: 17, fontFamily: 'PlusJakartaSans_500Medium' }}>{sub}</RNText> : null}
    </View>
  );
}

export function ListCard({ children }: { children: React.ReactNode }) {
  return <View style={{ padding: 14, backgroundColor: N.tile, borderRadius: 24, overflow: 'hidden', gap: 8 }}>{children}</View>;
}

export function ListRow({ lead, title, sub, trailing, chevron, onPress, first, subLines = 1 }: { lead?: React.ReactNode; title: string; sub?: string | null; trailing?: React.ReactNode; chevron?: boolean; onPress?: () => void; first?: boolean; subLines?: number }) {
  return (
    <>
      {first ? null : <View style={{ height: 1, backgroundColor: N.line }} />}
      <Pressable accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={title} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, minWidth: 0, opacity: pressed ? 0.8 : 1 })}>
        {lead}
        <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
          <RNText numberOfLines={1} style={{ color: N.white, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{title}</RNText>
          {sub ? <RNText numberOfLines={subLines} style={{ color: N.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_500Medium' }}>{sub}</RNText> : null}
        </View>
        {trailing}
        {chevron ? <Glyph name="chevron" size={16} color={N.low} /> : null}
      </Pressable>
    </>
  );
}

/** The chosen day: where you are or how you move, and its steps. */
function DayCard({ d, day, byId, cost }: { d: PlanData; day: string; byId: Map<string, ObjectRecord<StopData>>; cost: (n: number, cur?: string) => string }) {
  const router = useRouter();
  const v = useLive((os) => dayView(os, d.trip, day, d.nights), [d.trip.id, day, d.nights]);
  const move = movingDays(d.nights).find((m) => m.day === day);
  const leg = d.legs.find((l) => l.day === day);
  const j = leg?.journey ?? v.journeys[0] ?? null;
  const n = d.nights.find((x) => x.day === day);
  const s = n?.stopId ? byId.get(n.stopId) : undefined;
  const plan = d.plans.get(day);
  const title = move ? `${byId.get(move.fromStopId)?.title ?? '?'} → ${byId.get(move.toStopId)?.title ?? '?'}` : day === d.trip.data.endDate ? 'Fly home' : s?.title ?? (n?.kind === 'air' ? 'On the plane' : 'No bed booked');
  const stayName = (e: ObjectRecord<TravelEvent>) => e.title.replace(/^Stay · /, '');
  const sub = move ? ['moving day', j?.data.mode ? j.data.mode.replace('+', 'and') : null, j?.data.fare != null ? `${cost(j.data.fare, j.data.currency)} each` : null].filter(Boolean).join(' · ') : plan ? plan.split('\n')[0]! : n?.stayId ? d.stays.get(n.stayId) ?? '' : '';
  type Step = { time: string | null; what: string; note: string | null };
  let steps: Step[] = j?.data.steps ? stepsOf(j) : [];
  if (!steps.length) {
    steps = [
      ...v.checkOuts.map((e) => ({ time: /\d{1,2}:\d{2}/.exec(e.data.checkOut ?? '')?.[0] ?? null, what: `Check out of ${stayName(e)}`, note: e.data.checkOut ? `by ${e.data.checkOut}` : null })),
      ...v.flights.map((e) => ({ time: e.data.allDay || !e.data.startAt ? null : legTimes({ data: { ...e.data, endAt: undefined, takes: undefined } }), what: e.title, note: e.data.location ?? null })),
      ...v.journeys.map((e) => ({ time: e.data.allDay || !e.data.startAt ? null : legTimes({ data: { ...e.data, endAt: undefined, takes: undefined } }), what: e.title, note: [e.data.mode, e.data.takes?.replace(/^≈\s*/, '')].filter(Boolean).join(' · ') || null })),
      ...v.checkIns.map((e) => ({ time: /\d{1,2}:\d{2}/.exec(e.data.checkIn ?? '')?.[0] ?? null, what: `Check in · ${stayName(e)}`, note: e.data.checkIn ?? null })),
    ];
  }
  if (!steps.length && plan) steps = plan.split('\n').filter(Boolean).slice(0, 4).map((l) => ({ time: null, what: l, note: null }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${dayMonth(day)}: ${title}. Open the day`} onPress={() => router.push(tripRoutes.day(d.trip.id, day, move ? 'travel' : undefined))} style={{ gap: 12, padding: 16, backgroundColor: N.tile, borderRadius: 28, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <DateLead day={day} big />
        <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
          <RNText numberOfLines={1} style={{ color: N.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{title}</RNText>
          {sub ? <RNText numberOfLines={1} style={{ color: N.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_500Medium' }}>{sub}</RNText> : null}
        </View>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: N.raised, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name="chevron" size={18} />
        </View>
      </View>
      {steps.length ? (
        <View>
          {steps.map((st, i) => {
            const last = i === steps.length - 1;
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 12, minWidth: 0 }}>
                <View style={{ width: 58, paddingTop: 1, flexShrink: 0 }}>
                  <RNText style={{ color: N.white, fontSize: 12, lineHeight: 18, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{st.time ?? ''}</RNText>
                </View>
                <View style={{ width: 18, alignItems: 'center', paddingTop: 4, flexShrink: 0 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: N.mid }} />
                  {last ? null : <View style={{ flexGrow: 1, width: 1.5, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.12)' }} />}
                </View>
                <View style={{ flexGrow: 1, flexShrink: 1, gap: 2, minWidth: 0, paddingBottom: last ? 0 : 18 }}>
                  <RNText numberOfLines={1} style={{ color: N.white, fontSize: 15, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{st.what}</RNText>
                  {st.note ? <RNText numberOfLines={1} style={{ color: N.mid, fontSize: 13, lineHeight: 17, fontFamily: 'PlusJakartaSans_500Medium' }}>{st.note}</RNText> : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Map (JP-Map)                                                         */
/* ------------------------------------------------------------------ */

type Layer = 'stops' | 'ideas' | 'things' | 'events';
type Picked = { kind: 'stop'; s: ObjectRecord<StopData> } | { kind: 'thing'; t: ObjectRecord<OutingData> };

const directions = (p: { lat: number; lng: number } | undefined, name: string) => openUrl(p ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`);

/** An outlined label (the artboards' paint-order stroke): the ink stroke first, the fill over it. */
function MapLabel({ x, y, anchor, children, size = 12, color = C.white, weight = '700', font }: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; children: string; size?: number; color?: string; weight?: '500' | '700'; font?: string }) {
  return (
    <>
      <SvgText x={x} y={y} textAnchor={anchor} fontFamily={font} fontSize={size} fontWeight={weight} fill={C.ink} stroke={C.ink} strokeWidth={3} strokeLinejoin="round">{children}</SvgText>
      <SvgText x={x} y={y} textAnchor={anchor} fontFamily={font} fontSize={size} fontWeight={weight} fill={color}>{children}</SvgText>
    </>
  );
}

/** The train running along the line, leg by leg. */
function Runner({ pts }: { pts: Array<{ x: number; y: number }> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (pts.length < 2) return;
    const l = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400 * (pts.length - 1), easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }));
    const t = setTimeout(() => l.start(), 900);
    return () => {
      clearTimeout(t);
      l.stop();
    };
  }, [pts.length, v]);
  if (pts.length < 2) return null;
  const input = pts.map((_, i) => i / (pts.length - 1));
  return (
    <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: 12, height: 12, marginLeft: -6, marginTop: -6, borderRadius: 6, backgroundColor: N.lime, boxShadow: '0 0 0 4px rgba(215,245,92,0.25),0 0 16px rgba(215,245,92,0.6)', transform: [{ translateX: v.interpolate({ inputRange: input, outputRange: pts.map((p) => p.x) }) }, { translateY: v.interpolate({ inputRange: input, outputRange: pts.map((p) => p.y) }) }] }} />
  );
}

function MapView({ d, ctx, label, onView }: { d: PlanData; ctx: LifeOSContext; label: string; onView: (v: View3) => void }) {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const { width: W, height: H } = useWindowDimensions();
  const [layer, setLayer] = useState<Layer>('stops');
  const [pickedId, setPickedId] = useState<string | null>(d.currentId ?? d.line[0]?.id ?? null);
  const [panelH, setPanelH] = useState(300);
  const [headH, setHeadH] = useState(150);
  const [adding, setAdding] = useState(false);
  const [addingThing, setAddingThing] = useState(false);
  const look = d.japan ? 'japan' : d.trip.data.look;
  const stopsById = new Map([...d.line, ...d.ideas, ...d.airports].map((s) => [s.id, s]));
  const thingPin = useLive((os) => {
    const m = new Map<string, { lat: number; lng: number }>();
    for (const t of [...d.things, ...d.events]) {
      const c = t.data.placeId ? os.records.get<{ coordinates?: { lat: number; lng: number } }>(t.data.placeId)?.data.coordinates : undefined;
      const p = c ?? (t.data.stopId ? d.pins.get(t.data.stopId) : undefined);
      if (p) m.set(t.id, p);
    }
    return m;
  }, [d]);

  const linePins = d.line.filter((s) => d.pins.has(s.id));
  const fitPins = [...linePins, ...d.ideas.filter((s) => d.pins.has(s.id))].map((s) => d.pins.get(s.id)!);
  const top = headH + 50;
  const bottom = H - panelH - 8;
  const fit = fitMap(fitPins.length ? fitPins : [{ lat: 36.2, lng: 138.25 }], { x: 28, y: top, w: Math.max(80, W - 68), h: Math.max(80, bottom - top) }, fitPins.length > 1 ? 1.4 : 0.5);
  const xy = (p: { lat: number; lng: number }) => fit.at(p);
  const linePts = linePins.map((s) => xy(d.pins.get(s.id)!));

  const items: Picked[] = layer === 'stops' ? d.line.map((s) => ({ kind: 'stop', s })) : layer === 'ideas' ? [...d.ideas, ...d.airports].map((s) => ({ kind: 'stop', s })) : (layer === 'things' ? d.things : d.events).map((t) => ({ kind: 'thing', t }));
  const idOf = (p: Picked) => (p.kind === 'stop' ? p.s.id : p.t.id);
  const picked: Picked | null = (() => {
    const s = pickedId ? stopsById.get(pickedId) : undefined;
    if (s) return { kind: 'stop', s };
    const t = pickedId ? [...d.things, ...d.events].find((x) => x.id === pickedId) : undefined;
    return t ? { kind: 'thing', t } : null;
  })();
  const pickedStop = picked?.kind === 'stop' ? picked.s : picked?.kind === 'thing' && picked.t.data.stopId ? stopsById.get(picked.t.data.stopId) ?? null : null;

  const counts: Record<Layer, number> = { stops: d.line.length, ideas: d.ideas.length, things: d.things.length, events: d.events.length };
  const CHIPS: Array<[Layer, GlyphName, string]> = [['stops', 'pin', 'Stops'], ['ideas', 'sparkle', 'Ideas'], ['things', 'star', 'Things'], ['events', 'calendar', 'Events']];

  const labelFor = (s: ObjectRecord<StopData>) => (d.japan && s.data.localName ? s.data.localName : s.title);
  // Each label where it fits: right, left, above or below its pin, clear of the pins and the labels placed before it.
  const placed: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
  const labels = linePts.map((p, i) => {
    const s = linePins[i]!;
    const text = labelFor(s);
    const w = d.japan && s.data.localName ? text.length * 12 : text.length * 6.8;
    const cands: Array<{ x: number; y: number; anchor: 'start' | 'middle' | 'end'; x0: number }> = [
      { x: p.x + 10, y: p.y + 4, anchor: 'start', x0: p.x + 10 },
      { x: p.x - 10, y: p.y + 4, anchor: 'end', x0: p.x - 10 - w },
      { x: p.x + 10, y: p.y - 8, anchor: 'start', x0: p.x + 10 },
      { x: p.x + 10, y: p.y + 16, anchor: 'start', x0: p.x + 10 },
      { x: p.x, y: p.y - 12, anchor: 'middle', x0: p.x - w / 2 },
      { x: p.x, y: p.y + 22, anchor: 'middle', x0: p.x - w / 2 },
    ];
    const box = (c: (typeof cands)[number]) => ({ x0: c.x0, x1: c.x0 + w, y0: c.y - 11, y1: c.y + 2 });
    const hits = (b: ReturnType<typeof box>) => b.x0 < 4 || b.x1 > W - 4 || placed.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) || linePts.some((q) => q.x > b.x0 - 5 && q.x < b.x1 + 5 && q.y > b.y0 - 5 && q.y < b.y1 + 5);
    const c = cands.find((x) => !hits(box(x))) ?? cands[0]!;
    placed.push(box(c));
    return c;
  });
  const labelPos = (_p: { x: number; y: number }, i: number) => labels[i]!;

  return (
    <View style={{ flex: 1, backgroundColor: C.ink, overflow: 'hidden' }}>
      <Svg width={W} height={H} style={{ position: 'absolute', top: 0, left: 0 }} accessibilityLabel={`Map of ${d.trip.title}: ${d.line.map((s) => s.title).join(', ')}`}>
        <Defs>
          <Pattern id="jpdots" width={14} height={14} patternUnits="userSpaceOnUse">
            <Circle cx={7} cy={7} r={1} fill="rgba(255,255,255,0.06)" />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill="url(#jpdots)" />
        {d.japan ? (
          <G transform={`translate(${fit.tx},${fit.ty}) scale(${fit.scale})`}>
            {JAPAN_LAND.map((p, i) => <Path key={i} d={p} fill="#202028" stroke="#33333C" strokeWidth={1 / fit.scale} strokeLinejoin="round" />)}
          </G>
        ) : null}
        {linePts.slice(1).map((b, i) => {
          const a = linePts[i]!;
          return <Path key={`l${i}`} d={`M${a.x} ${a.y} L${b.x} ${b.y}`} stroke={stopHex(linePins[i + 1]!)} strokeWidth={3} strokeLinecap="round" fill="none" />;
        })}
        {[...d.ideas, ...(layer === 'ideas' ? d.airports : [])].filter((s) => d.pins.has(s.id)).map((s) => {
          const p = xy(d.pins.get(s.id)!);
          const hi = layer === 'ideas' || pickedId === s.id;
          return (
            <G key={s.id} onPress={() => setPickedId(s.id)}>
              <Circle cx={p.x} cy={p.y} r={hi ? 5 : 4} fill="none" stroke={hi ? C.white : 'rgba(245,245,247,0.45)'} strokeWidth={1.5} strokeDasharray={s.data.kind === 'idea' ? '2 2' : undefined} />
              <MapLabel x={p.x + 8} y={p.y + 4} anchor="start" size={9} weight="500" color={hi ? C.white : 'rgba(245,245,247,0.45)'} font={d.japan && s.data.localName ? JP_SANS : 'PlusJakartaSans_500Medium'}>{labelFor(s)}</MapLabel>
            </G>
          );
        })}
        {layer === 'things' || layer === 'events'
          ? (layer === 'things' ? d.things : d.events).filter((t) => thingPin.has(t.id)).map((t) => {
              const p = xy(thingPin.get(t.id)!);
              return <Circle key={t.id} cx={p.x} cy={p.y} r={pickedId === t.id ? 5 : 3} fill={layer === 'things' ? N.lime : C.amber} opacity={pickedId === t.id ? 1 : 0.7} onPress={() => setPickedId(t.id)} />;
            })
          : null}
        {linePins.map((s, i) => {
          const p = linePts[i]!;
          const on = pickedStop?.id === s.id;
          const lp = labelPos(p, i);
          return (
            <G key={s.id} onPress={() => setPickedId(s.id)}>
              {on ? <Circle cx={p.x} cy={p.y} r={9} fill={stopHex(s)} opacity={0.5} /> : null}
              <Circle cx={p.x} cy={p.y} r={on ? 7 : 5} fill={C.ink} stroke={stopHex(s)} strokeWidth={3} />
              <MapLabel x={lp.x} y={lp.y} anchor={lp.anchor} font={d.japan && s.data.localName ? JP_SANS : 'PlusJakartaSans_700Bold'}>{labelFor(s)}</MapLabel>
            </G>
          );
        })}
      </Svg>
      <Runner pts={linePts} />
      {!fitPins.length ? (
        <View style={{ position: 'absolute', left: 40, right: 40, top: top + 40, alignItems: 'center' }}>
          <RNText style={{ color: N.mid, fontSize: 14, lineHeight: 20, textAlign: 'center', fontFamily: 'PlusJakartaSans_500Medium' }}>Stops with a pin show here. Add a place with its latitude and longitude.</RNText>
        </View>
      ) : null}

      <View onLayout={(e) => setHeadH(e.nativeEvent.layout.height)} style={[bgImage('linear-gradient(180deg,#0B0B0D 0%,#0B0B0D 80%,rgba(11,11,13,0) 100%)'), { position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top, paddingHorizontal: 20, paddingBottom: 18, gap: 10 }]}>
        <TripHeader trip={d.trip} label={label} />
        <SegPick options={[{ value: 'map' as View3, label: 'Map' }, { value: 'line', label: 'Line' }, { value: 'days', label: 'Days' }]} value="map" onChange={onView} height={32} track={N.tile} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}>
          {CHIPS.map(([k, icon, word]) => {
            const on = k === layer;
            return (
              <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setLayer(k)} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 34, paddingHorizontal: 16, borderRadius: 999, backgroundColor: on ? C.white : N.raised }}>
                <Glyph name={icon} size={15} color={on ? C.ink : C.white} />
                <RNText style={{ color: on ? C.ink : C.white, fontSize: 14, lineHeight: 18, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{`${word} · ${counts[k]}`}</RNText>
              </Pressable>
            );
          })}
          <View style={{ width: 14 }} />
        </ScrollView>
      </View>

      <View style={{ position: 'absolute', top: headH + 36, left: 20, gap: 6, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: 'rgba(26,26,30,0.92)', borderRadius: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2.5, borderColor: C.white }} />
          <RNText style={{ color: N.mid, fontSize: 11, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Stop</RNText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderStyle: 'dashed', borderColor: N.mid }} />
          <RNText style={{ color: N.mid, fontSize: 11, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Idea, not on the line</RNText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: N.lime }} />
          <RNText style={{ color: N.mid, fontSize: 11, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Train or bus</RNText>
        </View>
      </View>

      <View style={{ position: 'absolute', right: 20, bottom: panelH + 17, alignItems: 'flex-end', gap: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, backgroundColor: C.white, borderRadius: 20 }}>
          <Glyph name="plus" size={15} color={C.ink} />
          <RNText style={{ color: C.ink, fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold' }}>Add a place</RNText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setAddingThing(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, backgroundColor: N.raised, borderRadius: 20 }}>
          <Glyph name="star" size={15} color={N.lime} />
          <RNText style={{ color: C.white, fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold' }}>Add thing to do</RNText>
        </Pressable>
      </View>

      <View onLayout={(e) => setPanelH(e.nativeEvent.layout.height)} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, gap: 14, paddingTop: 10, paddingBottom: 104 + insets.bottom, backgroundColor: N.tile, borderTopLeftRadius: 28, borderTopRightRadius: 28, boxShadow: '0 -12px 32px rgba(0,0,0,0.5)' }}>
        <View style={{ alignSelf: 'center', width: 36, height: 5, backgroundColor: 'rgba(245,245,247,0.25)', borderRadius: 3 }} />
        {picked ? <MapPanel d={d} picked={picked} stop={pickedStop} look={look} ctx={ctx} onAdded={() => toast.show({ message: 'On the line', icon: 'check' })} /> : <View style={{ paddingHorizontal: 20 }}><RNText style={{ color: N.mid, fontSize: 14, fontFamily: 'PlusJakartaSans_500Medium' }}>Tap a stop on the map.</RNText></View>}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
          {items.map((p) => {
            const id = idOf(p);
            const on = id === pickedId;
            if (p.kind === 'stop') {
              const c = stopHex(p.s);
              const idea = p.s.data.kind !== 'stop';
              return (
                <Pressable key={id} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={p.s.title} onPress={() => setPickedId(id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingLeft: 5, paddingRight: 14, borderRadius: 999, backgroundColor: on ? c : N.raised, borderWidth: idea && !on ? 1 : 0, borderStyle: 'dashed', borderColor: 'rgba(245,245,247,0.3)' }}>
                  <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: on ? C.ink : idea ? 'transparent' : c, alignItems: 'center', justifyContent: 'center' }}>
                    <RNText numberOfLines={1} style={{ color: on ? c : idea ? N.mid : C.ink, fontSize: 13, fontFamily: d.japan && p.s.data.localName ? JP_SANS : 'PlusJakartaSans_800ExtraBold', fontWeight: '900' }}>{stopMark(p.s, look)}</RNText>
                  </View>
                  <RNText style={{ color: on ? C.ink : C.white, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{p.s.title}</RNText>
                </Pressable>
              );
            }
            return <Chip key={id} label={p.t.title} height={40} bg={on ? C.white : N.raised} color={on ? C.ink : C.white} onPress={() => setPickedId(id)} />;
          })}
          {!items.length ? <RNText style={{ color: N.mid, fontSize: 13, fontFamily: 'PlusJakartaSans_500Medium' }}>{layer === 'ideas' ? 'No ideas yet: Add a place as an idea.' : `No ${layer} yet.`}</RNText> : null}
        </ScrollView>
      </View>

      <TripBar tripId={d.trip.id} active="plan" />
      <PlaceSheet visible={adding} onClose={() => setAdding(false)} ctx={ctx} trip={d.trip} stop={null} line={d.line} />
      <AddThingSheet visible={addingThing} onClose={() => setAddingThing(false)} ctx={ctx} tripId={d.trip.id} stops={d.line} stopId={pickedStop?.data.kind === 'stop' ? pickedStop.id : d.line[0]?.id} />
    </View>
  );
}


function MapPanel({ d, picked, stop, look, ctx, onAdded }: { d: PlanData; picked: Picked; stop: ObjectRecord<StopData> | null; look?: string; ctx: LifeOSContext; onAdded: () => void }) {
  const router = useRouter();
  const toast = useToast();
  if (picked.kind === 'stop') {
    const s = picked.s;
    const c = stopHex(s);
    const span = stopSpan(d.nights, s.id);
    const n = d.things.filter((t) => t.data.stopId === s.id).length;
    const idea = s.data.kind !== 'stop';
    const sub = idea ? [s.data.kind === 'idea' ? 'idea, not on the line' : 'airport', s.data.about].filter(Boolean).join(' · ') : [span ? `${dayMonth(span.from)} – ${dayMonth(span.to)}` : 'no nights yet', span ? plural(span.nights, 'night') : null, plural(n, 'thing to do', 'things to do')].filter(Boolean).join(' · ');
    return (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20 }}>
          <View style={{ width: 52, height: 52, flexShrink: 0 }}>
            <Anim k="jpulse2" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: c, borderRadius: 999 }} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: c, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
              <RNText style={{ color: c, fontSize: 22, fontFamily: d.japan && s.data.localName ? JP_SERIF : 'PlusJakartaSans_800ExtraBold', fontWeight: '800' }}>{stopMark(s, look)}</RNText>
            </View>
          </View>
          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
            <RNText numberOfLines={1} style={{ color: C.white }}>
              {local(s, d.japan) ? <RNText style={{ fontSize: 24, fontFamily: JP_SANS, fontWeight: '900' }}>{`${s.data.localName}  `}</RNText> : null}
              <RNText style={{ fontSize: local(s, d.japan) ? 16 : 22, fontFamily: 'PlusJakartaSans_700Bold' }}>{s.title}</RNText>
            </RNText>
            <RNText numberOfLines={1} style={{ color: N.mid, fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' }}>{sub}</RNText>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20 }}>
          <PillButton label="Open place" icon="pin" kind="lime" height={46} onPress={() => router.push(tripRoutes.stop(s.id))} />
          {idea ? (
            <PillButton label="Add to the line" icon="plus" height={46} onPress={() => { toast.show({ message: `${s.title} is on the line`, icon: 'check', undo: addToLine(ctx, s.id) }); onAdded(); }} />
          ) : (
            <PillButton label="Directions" icon="nav" height={46} onPress={() => directions(d.pins.get(s.id), s.title)} />
          )}
        </View>
      </>
    );
  }
  const t = picked.t;
  const ev = t.data.kind === 'event';
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20 }}>
        <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, gap: 2 }}>
          <RNText numberOfLines={1} style={{ color: C.white, fontSize: 20, fontFamily: 'PlusJakartaSans_700Bold' }}>{t.title}</RNText>
          <RNText numberOfLines={1} style={{ color: N.mid, fontSize: 13, fontFamily: 'PlusJakartaSans_400Regular' }}>{[stop?.title ?? (ev ? 'on the route' : null), ev ? (t.data.day ? `${dayMonth(t.data.day)}${t.data.until && t.data.until !== t.data.day ? ` – ${dayMonth(t.data.until)}` : ''}` : null) : t.data.kind, t.data.notes?.split('\n')[0]].filter(Boolean).join(' · ')}</RNText>
        </View>
        {ev ? null : <StatusPill s={thingStatus(t)} />}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20 }}>
        <PillButton label={stop ? 'Open place' : 'Open'} icon="pin" kind="lime" height={46} onPress={() => router.push(stop ? tripRoutes.stop(stop.id) : (`/entity/outing/${t.id}` as never))} />
        <PillButton label="Google Maps" icon="external" height={46} onPress={() => openUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${t.title} ${stop?.title ?? ''}`)}`)} />
      </View>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* The station board (JP-Place, JP-Stay)                                */
/* ------------------------------------------------------------------ */

/** A stop's station sign: its code badge, its name in the place's script and in English, the line's colour band, the stops either side. */
export function StationBoard({ stop, index, japan, prev, next, onPrev, onNext, onPress }: { stop: ObjectRecord<StopData>; index: number | null; japan: boolean; prev?: ObjectRecord<StopData> | null; next?: ObjectRecord<StopData> | null; onPrev?: () => void; onNext?: () => void; onPress?: () => void }) {
  const c = stopHex(stop);
  const kanji = japan ? stop.data.localName : null;
  const code = stationCodeOf(stop.title);
  const side = (s: ObjectRecord<StopData> | null | undefined, end: boolean, go?: () => void) =>
    s ? (
      <Pressable accessibilityRole="button" accessibilityLabel={`${end ? 'Next' : 'Previous'} stop, ${s.title}`} onPress={go} hitSlop={6} style={{ alignItems: end ? 'flex-end' : 'flex-start', minWidth: 0, flexShrink: 1 }}>
        {japan && s.data.localName ? <RNText numberOfLines={1} style={{ color: C.ink, fontSize: 12, fontFamily: JP_SANS, fontWeight: '700' }}>{s.data.localName}</RNText> : null}
        <RNText numberOfLines={1} style={{ color: japan && s.data.localName ? 'rgba(11,11,13,0.62)' : C.ink, fontSize: japan && s.data.localName ? 10 : 12, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{s.title}</RNText>
      </Pressable>
    ) : (
      <View />
    );
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} disabled={!onPress} onPress={onPress} style={{ alignSelf: 'stretch', backgroundColor: C.white, borderRadius: 24, boxShadow: '0 18px 40px rgba(0,0,0,0.45)', overflow: 'hidden' }}>
      {japan ? (
        <View style={{ position: 'absolute', top: 16, left: 16, width: 46, height: 52, borderWidth: 3, borderColor: c, borderRadius: 10, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
          <RNText style={{ color: 'rgba(11,11,13,0.62)', fontSize: 10, lineHeight: 11, fontFamily: MONO }}>JP</RNText>
          <RNText style={{ color: C.ink, fontSize: 18, lineHeight: 18, fontFamily: MONO }}>{index != null ? String(index + 1).padStart(2, '0') : '··'}</RNText>
          <RNText style={{ color: 'rgba(11,11,13,0.62)', fontSize: 8, lineHeight: 10, letterSpacing: 0.5, fontFamily: MONO }}>{code}</RNText>
        </View>
      ) : null}
      <View style={{ alignItems: 'center', paddingTop: 22, paddingHorizontal: japan ? 66 : 16, paddingBottom: 12 }}>
        {kanji ? (
          <RNText numberOfLines={1} adjustsFontSizeToFit style={{ marginLeft: 6, color: C.ink, fontSize: 54, lineHeight: 64, letterSpacing: 6, fontFamily: JP_SANS, fontWeight: '900' }}>{kanji}</RNText>
        ) : (
          <RNText numberOfLines={1} adjustsFontSizeToFit style={{ color: C.ink, fontSize: 40, lineHeight: 48, letterSpacing: 1, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{stop.title}</RNText>
        )}
        {kanji ? <RNText numberOfLines={1} style={{ marginTop: 2, color: C.ink, fontSize: 17, letterSpacing: 1, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{stop.title}</RNText> : null}
      </View>
      <View style={{ height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, backgroundColor: c }}>
        <RNText style={{ color: C.ink, fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold' }}>{prev ? '←' : ''}</RNText>
        <View style={{ position: 'absolute', top: -1, left: '50%', marginLeft: -9, width: 0, height: 0, borderTopWidth: 9, borderTopColor: C.white, borderLeftWidth: 9, borderLeftColor: 'transparent', borderRightWidth: 9, borderRightColor: 'transparent' }} />
        <RNText style={{ color: C.ink, fontSize: 11, fontFamily: 'PlusJakartaSans_700Bold' }}>{next ? '→' : ''}</RNText>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 12, minHeight: 44 }}>
        {side(prev, false, onPrev)}
        {side(next, true, onNext)}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* The place sheet (JP-Edit)                                            */
/* ------------------------------------------------------------------ */

const KINDS: Array<{ value: StopData['kind']; label: string }> = [{ value: 'stop', label: 'Stop' }, { value: 'idea', label: 'Idea' }, { value: 'airport', label: 'Airport' }];
const KIND_WORD: Record<string, string> = { stop: 'STOP', idea: 'IDEA', airport: 'AIRPORT' };

/** Edit a stop, or add a place (stop == null): name, local name, kind, its place on the line, colour, pin, about. */
export function PlaceSheet({ visible, onClose, ctx, trip, stop, line, onDeleted }: { visible: boolean; onClose: () => void; ctx: LifeOSContext; trip: ObjectRecord<TripData>; stop: ObjectRecord<StopData> | null; line: ObjectRecord<StopData>[]; onDeleted?: () => void }) {
  const toast = useToast();
  const japan = isJapan(trip);
  const pin = useLive((os) => (stop?.data.placeId ? os.records.get<{ coordinates?: { lat: number; lng: number } }>(stop.data.placeId)?.data.coordinates ?? null : null), [stop?.id, stop?.data.placeId, visible]);
  const others = line.filter((s) => s.id !== stop?.id);
  const at = stop ? line.findIndex((s) => s.id === stop.id) : -1;
  const [name, setName] = useState('');
  const [localName, setLocal] = useState('');
  const [kind, setKind] = useState<StopData['kind']>('stop');
  const [pos, setPos] = useState(0);
  const [color, setColor] = useState<string>('green');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [about, setAbout] = useState('');
  const [ordering, setOrdering] = useState(false);
  useEffect(() => {
    if (!visible) return;
    const used = new Set([...line].map((s) => s.data.color));
    setName(stop?.title ?? '');
    setLocal(stop?.data.localName ?? '');
    setKind(stop?.data.kind ?? 'stop');
    setPos(at >= 0 ? at : others.length);
    setColor(stop?.data.color ?? STOP_COLORS.find((c) => !used.has(c)) ?? 'green');
    setLat(pin ? String(pin.lat) : '');
    setLng(pin ? String(pin.lng) : '');
    setAbout(stop?.data.about ?? '');
    setOrdering(false);
  }, [visible, stop?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const posLabel = (p: number) => (p === 0 ? 'First · stop 1' : `After ${others[p - 1]?.title ?? '?'} · stop ${p + 1}`);
  const coords = () => {
    const a = Number(lat.replace(',', '.')), b = Number(lng.replace(',', '.'));
    return lat.trim() && lng.trim() && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null;
  };
  const save = () => {
    if (!name.trim()) return;
    const c = coords();
    if (!stop) {
      const { stop: made, created } = ensureStop(ctx, trip.id, name, { kind, localName: localName.trim() || undefined, color, about: about.trim() || undefined, coordinates: c ?? undefined });
      if (created && kind === 'stop' && pos < others.length) setStopPosition(ctx, made.id, pos);
      toast.show({ message: created ? `${made.title} added${kind === 'idea' ? ' as an idea' : kind === 'stop' ? ' to the line' : ''}` : `${made.title} is already here`, icon: 'check', undo: created ? () => ctx.records.delete(made.id, 'user') : undefined });
      onClose();
      return;
    }
    const undoSave = saveStop(ctx, stop.id, { title: name, localName, kind, color, about, coordinates: c });
    const undoPos = kind === 'stop' && pos !== at ? setStopPosition(ctx, stop.id, pos) : null;
    toast.show({ message: `${name.trim()} saved`, icon: 'check', undo: () => { undoPos?.(); undoSave(); } });
    onClose();
  };
  const remove = () => {
    if (!stop) return;
    ctx.records.delete(stop.id, 'user');
    toast.show({ message: `${stop.title} deleted`, icon: 'trash', undo: () => ctx.records.restore(stop.id, 'user') });
    onClose();
    onDeleted?.();
  };
  const eyebrow = stop ? `EDIT PLACE${stop.data.kind !== kind ? ` · ${KIND_WORD[stop.data.kind]} → ${KIND_WORD[kind]}` : ''}` : 'ADD A PLACE';
  return (
    <JPSheet
      visible={visible}
      onClose={onClose}
      eyebrow={eyebrow}
      title={[name.trim() || (stop ? stop.title : 'A new place'), localName.trim()].filter(Boolean).join(' ')}
      footer={
        <>
          {stop ? <PillButton label="Delete" icon="trash" kind="outline" grow={false} onPress={remove} /> : null}
          <PillButton label="Cancel" onPress={onClose} />
          <PillButton label="Save" icon="check" kind="lime" onPress={save} />
        </>
      }
    >
      <FieldInput label="Name" value={name} onChange={setName} placeholder="Takayama" />
      <FieldInput label={japan ? 'Name in Japanese' : 'Local name'} value={localName} onChange={setLocal} placeholder={japan ? '高山' : ''} />
      <View style={{ gap: 6 }}>
        <FieldLabel>Kind</FieldLabel>
        <SegPick options={KINDS} value={kind} onChange={setKind} />
      </View>
      {kind === 'stop' ? (
        <View style={{ gap: 6 }}>
          <FieldLabel>Order</FieldLabel>
          <Pressable accessibilityRole="button" accessibilityLabel={`Order: ${posLabel(pos)}`} accessibilityState={{ expanded: ordering }} onPress={() => setOrdering((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 50, paddingHorizontal: 16, backgroundColor: N.raised, borderRadius: 16 }}>
            <RNText numberOfLines={1} style={{ flexGrow: 1, flexShrink: 1, color: C.white, fontSize: 15, fontFamily: 'PlusJakartaSans_500Medium' }}>{posLabel(pos)}</RNText>
            <Glyph name="down" size={16} color={N.mid} />
          </Pressable>
          {ordering ? (
            <View style={{ backgroundColor: N.raised, borderRadius: 16, paddingVertical: 4 }}>
              {Array.from({ length: others.length + 1 }, (_, p) => (
                <Pressable key={p} accessibilityRole="button" accessibilityState={{ selected: p === pos }} onPress={() => { setPos(p); setOrdering(false); }} style={{ flexDirection: 'row', alignItems: 'center', height: 42, paddingHorizontal: 16, gap: 10 }}>
                  <RNText style={{ flexGrow: 1, color: p === pos ? N.lime : C.white, fontSize: 14, fontFamily: 'PlusJakartaSans_500Medium' }}>{posLabel(p)}</RNText>
                  {p === pos ? <Glyph name="check" size={15} color={N.lime} /> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        <FieldLabel>Line colour</FieldLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingVertical: 5 }}>
          {STOP_COLORS.map((k) => (
            <Pressable key={k} accessibilityRole="button" accessibilityLabel={`Colour ${k}`} accessibilityState={{ selected: k === color }} onPress={() => setColor(k)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: STOP_HEX[k], boxShadow: k === color ? `0 0 0 3px ${N.tile},0 0 0 5px ${N.lime}` : undefined }} />
          ))}
        </ScrollView>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <FieldInput half label="Latitude" value={lat} onChange={setLat} keyboardType="numbers-and-punctuation" placeholder="36.1461" />
        <FieldInput half label="Longitude" value={lng} onChange={setLng} keyboardType="numbers-and-punctuation" placeholder="137.2522" />
      </View>
      <FieldInput label="About" value={about} onChange={setAbout} long placeholder="What it is, why you’re going" />
    </JPSheet>
  );
}

/* ------------------------------------------------------------------ */
/* The line on the trip page                                            */
/* ------------------------------------------------------------------ */

/** The trip page's card: its stops as discs in order, with nights, and the way into Plan. */
export function LineCard({ tripId }: { tripId: string }) {
  const router = useRouter();
  const t = useTheme();
  const d = usePlanData(tripId);
  const b = useLive((os) => {
    const stays = tripStays(os, tripId);
    return { stays: stays.filter((e) => statusOf(e) !== 'cancelled').length, tickets: tripTickets(os, tripId).length, toPay: stayMoney(stays).toPay };
  }, [tripId]);
  if (!d) return null;
  const nights = d.nights.filter((n) => n.kind === 'stay').length;
  const moves = movingDays(d.nights).length;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="The line" sub={d.line.length ? [plural(d.line.length, 'stop'), nights ? plural(nights, 'night') : null, moves ? plural(moves, 'move') : null].filter(Boolean).join(' · ') : 'Where you’ll sleep, in order'} action="Plan" chevron onAction={() => router.push(planRoute(tripId))} />
      <Pressable accessibilityRole="button" accessibilityLabel="Open the plan" onPress={() => router.push(planRoute(tripId))} style={{ padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
        {d.line.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ alignItems: 'flex-start', gap: 0 }}>
            {d.line.map((s, i) => {
              const span = stopSpan(d.nights, s.id);
              return (
                <View key={s.id} style={{ width: 72, alignItems: 'center', gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
                    <View style={{ flex: 1, height: 3, backgroundColor: i ? stopHex(d.line[i - 1]!) : 'transparent' }} />
                    <StopDisc stop={s} look={d.trip.data.look} size={34} />
                    <View style={{ flex: 1, height: 3, backgroundColor: i < d.line.length - 1 ? stopHex(s) : 'transparent' }} />
                  </View>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: '600' }}>{s.title}</Text>
                  <Text style={{ fontSize: 11, color: t.c.fg.secondary }}>{span ? `${span.nights}N` : '–'}</Text>
                </View>
              );
            })}
          </ScrollView>
        ) : (
          <Text variant="caption" color="secondary">Add the stops of the trip: each one gets its nights from the stays booked there.</Text>
        )}
      </Pressable>
      {b.stays + b.tickets ? (
        <RowCard>
          <Row lead={<Icon name="bag" size={18} color={t.c.fg.secondary} />} title="Bookings" sub={[plural(b.stays, 'stay'), b.tickets ? plural(b.tickets, 'ticket') : null, ...Object.entries(b.toPay).filter(([, n]) => n > 0.5).map(([cur, n]) => `${money(n, cur)} to pay`)].filter(Boolean).join(' · ')} trailing={<Icon name="chevron-right" size={18} color={t.c.fg.secondary} />} onPress={() => router.push(tripRoutes.bookings(tripId))} />
        </RowCard>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The land, as the map artboard draws it (its own projection: mapX, mapY) */
/* ------------------------------------------------------------------ */

const JAPAN_LAND: string[] = [
  'M1211 -16 1201 -15 1201 1 1191 -1 1189 1 1194 4 1184 3 1179 -2 1179 -15 1163 -21 1152 -17 1150 -20 1151 -25 1142 -29 1139 -26 1130 -27 1124 -31 1126 -35 1124 -43 1137 -43 1143 -47 1143 -50 1211 -50 1209 -33Z',
  'M1123 -20 1123 -6 1127 -2 1119 9 1110 7 1102 10 1095 4 1086 7 1079 -5 1078 -2 1072 -2 1069 -4 1063 -1 1059 -5 1054 -4 1050 -9 1046 -8 1039 -16 1042 -39 1047 -43 1047 -46 1044 -47 1045 -50 1143 -50 1143 -47 1137 -43 1124 -43 1125 -24Z',
  'M1013 143 1007 148 990 143 986 144 989 135 988 131 990 126 986 114 989 106 984 99 981 101 977 94 983 86 986 76 986 69 981 65 985 59 1003 55 1008 57 1012 48 1030 50 1033 48 1028 25 1038 19 1038 15 1042 8 1054 -3 1050 -9 1046 -8 1050 -9 1054 -4 1059 -5 1063 -1 1069 -4 1072 -2 1078 -2 1079 -5 1086 7 1095 4 1103 11 1110 7 1119 9 1127 -2 1123 -6 1125 -30 1134 -25 1139 -26 1142 -29 1151 -25 1150 -20 1152 -17 1163 -21 1166 -18 1169 -19 1171 -17 1176 -17 1179 -15 1179 -2 1184 3 1194 4 1189 1 1191 -1 1201 1 1201 -15 1211 -16 1215 -5 1219 -4 1222 9 1226 53 1225 81 1222 92 1223 95 1224 94 1221 98 1220 115 1218 121 1218 134 1210 144 1207 143 1196 149 1193 157 1170 150 1166 143 1163 148 1166 155 1159 157 1149 168 1146 163 1138 160 1136 153 1131 151 1127 145 1120 143 1121 129 1115 130 1114 123 1106 116 1082 108 1070 109 1063 114 1064 119 1058 118 1055 122 1044 124 1043 127 1038 128 1036 131 1032 131 1026 137 1016 139 1015 142Z',
  'M1115 321 1107 324 1104 319 1097 318 1080 308 1079 304 1072 300 1060 282 1057 285 1052 284 1046 265 1052 266 1064 259 1068 248 1072 246 1076 249 1076 243 1083 241 1084 236 1086 238 1094 237 1097 232 1101 234 1105 230 1108 233 1113 232 1118 216 1122 214 1117 186 1127 181 1122 173 1122 145 1127 145 1131 151 1136 153 1138 160 1146 163 1149 168 1159 157 1166 155 1163 148 1166 143 1170 150 1193 157 1195 162 1190 164 1187 170 1183 190 1169 218 1168 226 1171 228 1168 228 1169 232 1171 236 1166 248 1163 249 1162 257 1169 284 1181 309 1178 312 1176 310 1177 316 1179 318 1178 313 1182 311 1201 340 1197 341 1187 334 1181 325 1172 322 1167 314 1156 305 1152 310 1154 314 1149 311 1136 315 1130 321 1125 319 1120 322Z',
  'M1051 264 1043 265 1043 261 1039 257 1040 255 1038 254 1030 255 1025 252 1017 254 1010 247 1011 243 1004 238 1003 236 1009 223 1013 222 1011 216 1013 208 1019 203 1017 199 1008 200 999 194 1000 185 1004 176 1002 171 1009 162 1001 158 1002 154 1010 146 1012 146 1016 139 1026 137 1032 131 1036 131 1038 128 1043 127 1044 124 1055 122 1058 118 1064 119 1063 114 1070 109 1082 108 1100 113 1114 123 1115 130 1121 129 1120 142 1123 145 1121 147 1123 163 1122 173 1127 181 1117 186 1122 214 1118 216 1115 230 1112 233 1105 230 1101 234 1097 232 1094 237 1086 238 1084 236 1083 241 1076 243 1076 249 1072 246 1068 248 1064 259 1052 266Z',
  'M932 292 923 293 917 301 906 294 908 279 902 276 899 271 901 269 903 272 907 270 902 253 909 249 908 232 901 229 893 232 889 230 884 232 883 230 876 227 879 200 883 194 892 191 893 189 891 185 917 177 919 173 927 176 932 172 931 164 936 165 946 161 945 153 952 152 951 137 961 136 967 130 968 124 979 135 979 140 985 140 987 145 990 143 1007 148 1001 158 1009 162 1002 171 1004 176 1000 185 999 194 1008 200 1017 199 1019 203 1013 208 1011 216 1013 222 1009 223 1003 236 1017 254 1025 252 1030 255 1038 254 1040 255 1039 257 1044 264 1038 268 1033 264 1016 267 1003 257 998 261 995 258 987 258 972 252 964 266 961 277 956 277 953 280 950 278 946 284 935 288Z',
  'M1033 335 1028 339 1028 336 1024 337 1027 334 1027 330 1021 335 1007 337 1004 333 998 332 994 325 981 325 963 319 958 315 941 325 935 320 930 321 926 315 920 314 920 309 917 301 923 293 932 292 937 286 948 283 950 278 953 280 956 277 961 277 964 266 972 252 987 258 995 258 998 261 1003 257 1016 267 1033 264 1038 268 1043 263 1047 267 1052 284 1058 284 1064 293 1065 303 1074 321 1074 334 1071 334 1071 332 1065 332 1064 329 1061 330 1057 328 1055 330 1055 334 1042 331 1038 337Z',
  'M1064 472 1056 468 1055 466 1068 463 1068 458 1063 455 1066 454 1064 450 1067 448 1064 445 1066 441 1064 433 1070 424 1067 414 1059 410 1064 410 1066 407 1064 406 1066 403 1069 404 1067 401 1074 403 1073 402 1077 398 1074 395 1075 391 1081 390 1081 388 1082 390 1084 389 1083 386 1085 384 1086 388 1089 384 1091 386 1089 383 1092 381 1091 380 1096 373 1100 375 1100 372 1103 372 1100 370 1105 369 1099 369 1099 366 1103 368 1103 365 1100 365 1101 363 1099 362 1099 365 1090 355 1086 355 1088 354 1086 354 1086 349 1079 352 1081 353 1077 355 1080 357 1074 359 1074 361 1071 360 1073 352 1077 348 1072 337 1074 321 1065 303 1064 293 1058 282 1061 284 1072 300 1079 304 1080 308 1097 318 1104 319 1108 324 1125 319 1130 321 1136 315 1149 311 1154 314 1152 310 1156 305 1167 314 1172 322 1181 325 1187 334 1197 341 1202 341 1203 345 1203 349 1198 346 1175 350 1152 370 1145 381 1140 394 1140 407 1143 412 1140 429 1132 435 1131 439 1129 440 1127 437 1126 440 1122 439 1114 444 1113 441 1104 443 1099 451 1085 460 1083 471 1078 476 1073 478 1064 476Z',
  'M971 592 973 584 978 585 978 590 974 593ZM988 567 989 558 993 554 991 570ZM1015 362 1022 368 1020 370 1020 366 1017 369 1020 374 1018 380 1008 367 992 362 987 363 984 356 979 357 977 353 958 345 953 336 948 320 958 315 963 319 981 325 992 325 997 328 998 332 1004 333 1007 337 1021 335 1027 330 1027 334 1024 337 1028 336 1028 339 1033 335 1038 337 1042 331 1053 334 1057 328 1061 330 1064 329 1065 332 1071 332 1071 334 1074 334 1072 337 1077 348 1073 352 1072 357 1062 357 1061 360 1058 358 1061 356 1058 357 1060 355 1058 356 1057 354 1054 366 1056 370 1059 369 1062 374 1060 376 1056 373 1048 374 1043 366 1025 357 1021 363 1016 360ZM1035 638 1039 643 1038 646 1032 644 1032 642ZM1019 614 1018 610 1021 603 1027 603 1030 606 1030 612 1026 615ZM1008 513 1002 507 1003 494 1011 497 1014 503 1014 512ZM1066 774 1059 770 1058 766 1053 761 1054 757 1058 757 1064 763 1067 763 1069 769 1067 770ZM1057 367 1055 368 1055 361 1058 366Z',
  'M974 436 976 439 959 437 952 423 958 408 955 397 944 396 947 389 959 384 961 379 966 378 970 374 972 370 971 355 972 352 977 353 979 357 984 356 989 364 992 362 1008 367 1017 380 1019 380 1018 368 1020 367 1020 370 1022 368 1015 362 1016 360 1021 363 1025 357 1043 366 1048 374 1056 373 1061 377 1058 379 1055 375 1057 378 1055 376 1052 380 1051 378 1052 380 1051 381 1051 379 1048 383 1046 381 1046 385 1039 386 1039 388 1045 388 1045 392 1047 390 1044 396 1039 395 1041 396 1038 397 1042 401 1042 406 1038 408 1043 408 1039 414 1043 416 1044 413 1047 418 1054 420 1050 422 1051 427 1042 432 1045 439 1036 439 1036 435 1038 435 1035 430 1038 427 1032 420 1031 414 1026 412 1018 413 1018 411 1013 410 999 411 983 416 975 422 973 432ZM1052 381 1054 384 1050 386 1048 384Z',
  'M944 155 946 161 936 165 931 164 932 172 927 176 919 173 915 177 911 171 915 166 913 163 914 157 901 148 900 136 898 130 892 128 875 134 868 147 862 148 861 159 858 160 856 155 851 155 844 159 838 158 830 167 823 162 827 154 824 150 805 148 806 156 800 165 791 172 787 162 784 143 778 142 774 137 810 124 829 112 836 105 842 107 855 103 856 99 856 103 880 80 894 72 904 53 922 33 931 1 938 -7 964 -26 986 -33 1004 -50 1045 -50 1044 -47 1047 -46 1047 -43 1042 -39 1039 -16 1046 -8 1050 -9 1054 -3 1042 8 1038 15 1038 19 1028 25 1033 48 1030 50 1012 48 1008 57 1003 55 985 59 981 65 986 69 986 76 983 86 977 94 981 101 984 99 989 106 986 114 990 126 987 143 985 140 979 140 978 134 968 124 967 130 961 136 951 137 952 152 946 151ZM856 -1 851 -2 850 -5 859 -9 860 -20 868 -28 862 -35 859 -34 856 -28 853 -30 852 -37 854 -39 856 -50 880 -50 881 -47 886 -44 897 -48 898 -47 889 -20 871 -6 863 -4Z',
  'M700 235 697 244 686 254 684 253 686 247 683 242 678 239 673 242 673 238 672 241 668 242 667 248 662 250 661 242 664 240 659 228 663 226 663 215 666 208 662 205 661 196 666 188 662 180 670 174 671 160 676 146 681 142 686 143 688 139 695 139 697 140 693 144 694 146 688 155 691 161 701 169 705 170 702 172 704 173 708 173 706 170 714 174 730 174 734 173 742 166 745 154 744 151 748 145 774 137 778 142 784 143 787 162 791 172 790 201 781 206 781 210 784 210 783 213 776 218 774 229 770 230 768 234 764 235 758 229 751 231 744 228 742 223 731 229 731 222 724 224 722 223 717 228 715 224 711 224 702 236Z',
  'M619 276 616 276 611 270 603 270 601 261 592 255 590 250 597 241 603 238 612 230 633 202 646 183 656 161 659 133 656 132 653 124 654 111 651 109 648 111 646 109 647 99 655 86 653 79 657 73 669 67 676 66 680 68 694 62 709 50 726 45 733 45 736 50 735 52 738 58 724 62 722 71 723 75 725 74 723 77 725 78 721 84 710 82 710 84 703 87 699 97 693 100 694 101 691 103 683 98 685 94 682 96 680 95 681 97 677 97 680 100 678 100 673 110 676 111 676 115 671 116 673 119 671 122 681 119 686 126 690 124 694 116 697 116 697 139 688 139 686 143 684 141 676 146 671 160 670 174 662 180 666 188 661 197 662 205 666 208 663 215 663 226 659 229 664 240 661 242 662 250 670 258 663 270 659 272 660 277 657 284 645 288 644 284 631 274 624 274 622 272ZM682 115 677 108 680 110 680 112 682 109 687 110 685 108 691 111 694 106 697 109 696 113 689 114 683 118Z',
  'M529 399 525 404 517 406 510 402 495 400 494 393 490 392 485 386 488 382 484 376 486 373 489 371 487 376 488 375 488 377 492 375 491 372 493 372 492 380 495 382 512 373 513 376 508 377 510 379 508 382 502 382 520 383 526 374 520 377 520 374 516 372 519 369 524 370 525 373 526 371 530 376 535 374 531 369 536 370 538 365 532 357 537 358 539 363 554 359 552 355 553 346 551 347 551 344 559 337 563 349 560 351 563 354 567 354 570 335 556 317 557 309 552 302 559 293 561 283 570 273 572 265 574 267 574 257 580 257 590 250 592 255 601 261 602 268 605 271 611 270 618 276 622 272 624 274 630 273 644 284 645 288 657 284 658 288 654 290 654 299 657 300 657 306 662 307 661 311 665 313 667 324 664 324 662 332 653 330 645 334 643 330 640 334 637 332 633 335 627 333 624 340 622 335 615 336 607 332 601 335 600 345 594 354 582 347 577 348 575 353 581 365 580 370 572 367 571 376 568 374 566 376 561 376 558 382 555 382 549 377 543 396 539 397 538 395 533 394 532 399Z',
  'M893 407 890 411 893 429 888 434 875 429 870 410 866 408 859 412 853 401 857 396 855 388 858 378 853 358 848 352 846 346 854 338 847 332 854 318 860 322 872 303 881 306 881 312 885 316 888 316 890 311 901 312 904 314 903 319 912 320 914 315 919 314 926 315 930 321 935 320 941 325 948 322 958 345 972 352 971 355 973 361 972 370 966 378 961 379 959 384 947 389 944 396 938 400 936 398 932 401 913 404 910 397 903 398 900 389 893 395Z',
  'M775 428 766 429 762 420 765 416 764 411 770 407 769 400 766 397 774 396 768 389 774 385 774 379 766 373 766 367 761 367 758 363 762 356 756 350 751 338 743 335 740 331 735 332 733 329 740 316 747 314 753 316 762 302 769 296 771 286 763 281 763 276 769 270 766 262 776 249 775 242 768 238 768 234 770 230 774 229 779 215 783 213 784 210 781 210 781 206 789 202 790 175 800 165 806 156 805 148 824 150 827 154 823 162 830 167 838 158 844 159 851 155 856 155 859 160 862 157 862 148 868 147 875 134 891 129 898 130 900 136 901 148 914 158 913 163 915 166 911 171 915 177 903 182 894 183 891 185 893 189 892 191 883 194 876 213 876 227 883 230 884 232 889 230 893 232 901 229 908 232 909 249 902 253 907 270 903 272 901 269 899 271 902 276 908 279 906 294 917 301 920 309 919 314 914 315 912 320 905 320 903 318 904 314 901 312 890 311 888 316 883 315 882 308 872 303 860 322 854 318 847 332 854 338 846 346 851 357 850 363 848 368 844 367 841 371 844 373 841 380 844 381 843 387 838 389 843 397 841 401 834 407 830 406 825 413 813 417 812 420 808 420 805 426 793 429 791 426 777 425Z',
  'M646 431 646 440 643 435 643 438 639 437 628 420 616 426 607 422 610 420 612 401 616 398 612 394 613 386 608 382 610 376 606 371 603 374 599 373 600 361 595 361 594 355 600 345 601 335 607 332 615 336 622 335 624 340 627 333 633 335 637 332 640 334 643 330 645 334 653 330 662 332 664 324 667 324 665 313 661 311 662 307 657 306 657 300 654 299 654 290 658 288 657 284 661 275 659 272 663 270 670 258 662 250 667 248 668 242 672 241 673 238 673 242 678 239 683 242 686 247 684 253 686 254 697 244 698 238 702 236 711 224 715 224 717 228 722 223 724 224 727 222 732 223 731 229 742 223 744 228 751 231 757 229 761 234 768 234 768 238 775 242 776 249 766 262 769 270 763 276 763 281 771 286 769 296 762 302 753 316 747 314 740 316 733 329 735 332 740 331 743 335 751 338 756 350 762 356 758 363 761 367 766 367 766 373 774 379 774 385 768 389 774 397 766 397 769 400 770 408 764 411 764 416 759 416 747 425 745 423 741 423 741 419 736 420 736 417 731 414 714 420 712 416 703 413 701 414 699 407 696 407 696 402 687 396 689 393 686 393 679 400 668 404 659 402 647 422 648 429Z',
  'M851 524 853 526 848 526 831 519 831 517 830 518 817 516 796 519 788 515 789 517 768 514 754 514 753 502 756 489 768 486 769 482 775 479 778 470 784 466 785 456 792 449 793 445 796 444 795 440 800 437 796 432 800 427 805 426 807 421 812 420 813 417 825 413 830 406 834 407 841 401 843 397 838 389 843 387 844 381 841 380 844 373 841 371 844 367 848 368 850 359 853 358 858 378 855 388 857 396 853 400 856 403 856 408 860 412 866 408 870 410 875 429 881 433 888 434 893 429 890 411 893 408 893 395 900 389 903 398 910 397 913 404 932 401 936 398 938 400 944 396 955 397 958 408 952 423 959 437 970 439 964 452 968 454 968 460 966 461 968 466 974 469 975 472 974 479 966 486 961 499 955 503 952 512 953 517 949 518 950 514 948 514 942 522 934 526 926 520 927 515 920 512 920 506 925 502 922 491 925 485 923 480 927 476 924 468 926 459 927 457 940 459 943 454 940 454 932 444 913 438 915 440 896 445 893 453 888 456 889 464 889 459 893 459 891 464 870 475 866 483 867 489 861 497 862 499 852 507 848 520Z',
  'M685 504 686 511 680 510 668 500 672 488 668 480 666 480 666 467 669 460 672 460 670 459 676 447 672 446 669 456 670 448 666 449 668 456 665 457 666 453 663 453 663 457 661 456 662 459 659 458 656 448 646 440 647 422 659 402 668 404 679 400 685 397 685 393 689 393 687 396 696 402 696 407 699 407 701 414 703 413 712 416 714 420 731 414 736 417 736 420 741 419 741 423 745 423 747 425 759 416 765 415 762 420 766 429 775 428 780 424 791 426 793 429 801 427 796 432 800 437 795 440 796 444 785 456 784 466 778 470 775 479 769 482 768 486 756 489 754 492 754 514 709 528 692 530 700 516 706 521 708 519 707 517 720 514 722 509 724 511 728 505 730 506 730 511 728 514 730 514 733 510 731 510 731 506 736 506 732 505 734 497 729 492 723 493 718 490 712 500 712 496 693 498 689 491 683 490 688 479 688 468 685 482 682 481 682 484 680 483 678 499ZM664 488 663 482 666 486Z',
  'M559 667 549 665 549 661 538 652 538 645 539 642 540 645 543 644 541 637 543 638 543 635 548 636 546 635 548 632 553 634 554 628 557 630 559 628 556 622 560 617 571 618 569 609 573 609 570 604 572 597 570 591 574 582 570 574 574 572 566 559 570 553 584 551 588 543 586 538 579 539 578 533 572 535 564 529 567 520 562 516 566 518 568 514 564 509 566 506 561 501 560 496 569 492 568 488 574 484 568 481 572 477 574 480 581 480 590 485 606 477 607 471 612 465 613 454 616 451 615 440 617 435 611 431 614 424 616 426 628 420 639 437 643 438 643 435 656 448 660 458 656 456 644 463 641 470 646 472 643 472 640 483 628 502 627 513 631 515 627 524 642 528 645 533 660 541 665 541 665 545 667 541 670 547 674 546 673 554 676 550 680 551 678 562 675 560 671 564 665 564 667 566 669 563 670 565 672 564 672 568 678 564 674 569 676 578 672 579 670 583 659 581 657 579 661 578 668 581 672 579 669 578 668 579 668 576 672 577 667 574 670 572 664 573 664 570 662 573 665 575 662 576 658 572 658 576 653 574 648 577 650 570 651 572 654 568 649 567 648 571 649 567 645 567 646 570 642 573 647 572 637 581 633 578 636 577 636 575 630 577 630 582 629 578 627 581 628 579 624 578 626 584 624 581 624 584 621 584 625 586 621 587 619 585 619 581 616 583 617 587 610 590 610 587 608 588 605 592 604 589 600 591 602 591 601 594 594 597 595 604 599 604 597 609 596 607 593 610 593 606 590 607 593 602 587 606 588 609 584 610 585 612 590 613 590 616 595 619 589 620 593 622 591 623 593 627 589 627 591 625 585 623 586 625 583 627 587 627 588 631 586 634 584 631 581 632 583 635 581 636 577 634 577 639 574 641 573 639 564 653ZM675 546 673 544 678 542 677 544ZM670 541 676 536 677 539Z',
  'M613 461 606 477 590 485 581 480 574 480 572 477 568 481 574 484 568 488 569 492 561 495 558 494 561 490 558 487 550 486 549 479 544 482 539 479 541 470 537 463 534 463 535 458 533 454 535 452 538 436 534 426 539 416 535 417 532 410 526 406 533 394 538 395 539 397 543 396 549 377 555 382 558 382 561 376 566 376 568 374 571 376 572 367 580 370 581 365 575 353 577 348 582 347 594 354 595 361 600 361 599 373 603 374 606 371 610 376 608 382 613 386 612 394 616 398 612 401 610 420 607 422 612 426 611 431 617 435 615 440 616 451 613 454Z',
  'M523 493 510 473 504 473 506 466 500 466 498 472 501 472 502 474 496 475 493 471 488 470 489 463 475 460 473 453 478 447 476 441 470 440 470 437 462 438 463 434 461 433 455 433 452 436 449 434 451 429 445 425 446 419 439 418 433 423 432 419 426 418 424 414 415 411 416 395 419 395 423 399 431 395 429 381 430 379 429 374 415 378 413 373 405 366 408 361 407 355 416 356 422 349 427 349 432 346 436 341 454 335 465 349 465 354 463 352 460 353 450 369 450 374 458 364 458 369 461 370 457 370 457 374 463 378 468 378 466 388 470 381 477 384 477 378 470 380 470 372 481 370 482 366 486 364 484 369 489 371 484 376 488 380 485 386 490 392 494 393 495 400 510 402 517 406 526 404 535 417 538 415 534 426 538 436 535 452 533 454 535 458 534 463 537 463 541 470 539 479 544 482 549 479 550 486 558 487 561 491 558 494 562 497 561 501 564 504 561 509 555 508 554 503 547 504 547 501 543 509 537 509 525 506 521 498Z',
  'M452 576 439 579 437 572 453 567 471 550 473 545 474 546 475 537 476 541 483 534 479 532 478 526 480 531 481 528 484 532 484 529 486 529 481 527 481 525 484 526 481 523 484 524 484 519 480 518 481 511 478 511 486 505 480 491 484 478 482 479 480 476 486 473 470 467 472 458 468 456 472 453 475 456 475 460 489 463 488 470 493 471 496 475 502 474 501 472 498 472 500 466 506 466 504 473 510 473 523 494 521 498 519 497 518 506 514 510 511 525 515 529 511 535 514 538 515 545 516 550 513 554 514 558 500 563 492 569 489 564 477 570 469 569 463 574 462 572 452 573ZM460 552 455 556 455 554 451 554 456 550 458 551 455 553 458 551ZM482 534 480 538 477 536 479 534 480 536ZM480 521 482 519 483 522 478 521Z',
  'M353 520 354 515 358 515 358 519 355 518ZM364 517 359 514 364 513ZM352 499 349 500 346 506 343 506 339 502 340 504 334 506 334 504 336 499 334 494 330 489 327 490 325 486 327 480 331 476 326 470 330 462 327 458 334 455 334 448 338 447 340 438 346 437 346 431 343 430 342 426 345 422 353 423 360 417 360 404 354 400 355 392 350 390 349 380 346 378 348 370 341 362 349 361 350 358 352 359 363 353 366 356 371 354 374 358 380 353 380 356 383 353 385 355 386 353 392 354 393 352 394 354 398 353 403 357 406 354 408 361 405 366 413 373 415 378 429 374 431 395 423 399 419 395 416 395 414 410 424 414 426 418 432 419 433 423 439 418 446 419 445 425 451 429 449 434 452 436 455 433 461 433 463 434 462 438 470 437 470 440 476 441 477 449 474 454 471 453 468 456 472 458 470 467 486 473 480 476 482 479 484 478 480 491 486 505 476 513 474 514 478 510 474 513 469 506 464 507 463 509 449 513 449 518 432 522 420 519 404 507 401 509 399 503 398 505 390 499 383 497 380 499 380 496 378 499 379 496 377 499 376 498 377 497 374 496 374 499 372 497 368 501 368 498 367 500 362 497 355 501 354 492 352 501ZM399 590 389 592 389 589 385 587 388 582 379 584 381 581 379 575 383 570 389 570 398 550 421 526 425 525 428 530 410 556 411 567 418 580 404 586ZM451 514 454 513 457 518 451 517ZM462 510 463 513 458 514 458 511Z',
  'M547 626 543 632 545 636 543 635 543 638 539 635 539 641 542 642 540 645 537 639 532 638 525 641 516 638 506 643 507 639 504 637 506 630 509 630 509 624 504 621 501 613 496 610 503 599 510 592 510 588 518 589 521 586 519 580 514 578 511 561 514 558 513 554 516 550 514 538 511 535 515 529 511 525 514 510 518 506 519 497 525 506 537 509 543 509 547 501 547 504 554 503 555 508 559 509 564 504 566 508 564 509 568 514 566 518 562 516 567 520 564 529 572 535 578 533 579 539 586 538 588 543 584 551 570 553 566 559 574 572 570 574 574 582 570 591 572 597 570 604 573 609 569 609 571 618 560 617 555 624 549 626Z',
  'M449 651 444 641 440 640 432 642 432 638 436 637 434 634 440 629 435 630 433 626 444 622 443 620 448 617 442 612 435 611 440 603 444 605 441 601 447 601 452 598 449 599 448 593 448 594 443 592 443 586 438 585 442 586 440 584 433 580 434 574 438 573 439 579 445 579 452 576 452 573 462 572 463 574 469 569 477 570 489 564 492 569 501 562 511 561 514 578 519 580 521 586 518 589 510 588 507 597 503 599 501 604 497 606 496 610 503 615 504 621 507 621 509 625 509 630 506 630 504 638 507 639 506 643 516 638 525 641 532 638 537 639 538 652 549 661 549 665 559 667 554 674 554 679 549 680 551 683 547 686 552 687 552 690 547 690 543 693 547 693 541 698 530 702 528 708 530 711 526 713 524 710 527 708 525 705 518 706 517 703 512 704 508 701 503 703 500 700 492 698 489 694 484 694 484 692 476 688 477 680 468 675 469 671 472 671 472 674 474 673 478 667 471 666 471 663 468 664 466 659 456 658 456 655 452 653ZM535 710 530 708 532 705 539 707 534 709ZM543 640 543 644 540 645 539 635 542 642ZM552 625 558 621 559 628 557 630 554 628 553 634 548 632 547 636 543 631 546 627Z',
  'M238 406 233 422 226 424 229 432 226 430 219 434 212 432 213 443 202 446 199 445 195 452 192 449 177 450 179 439 185 434 180 426 200 418 198 410 202 401 202 396 199 391 189 383 185 376 190 372 194 372 192 375 197 383 211 388 216 387 218 381 234 375 262 380 283 378 293 374 294 377 302 377 325 372 331 366 341 362 348 370 346 378 349 380 350 390 355 392 354 400 360 404 360 417 353 423 349 424 344 421 334 429 329 430 326 427 315 434 312 430 313 424 310 423 312 420 310 416 305 412 293 412 294 405 283 407 282 412 274 414 274 417 269 421 265 414 258 410 249 410 245 407Z',
  'M31 548 25 556 28 563 21 573 16 568 11 573 2 574 -3 569 -5 564 -1 552 -14 553 -13 546 -18 542 -13 537 -13 532 -10 530 -11 524 -14 523 -15 513 -7 514 6 509 9 505 8 501 19 495 27 486 28 483 31 481 34 482 35 476 41 469 58 456 68 452 70 446 72 447 72 445 78 441 77 438 82 431 110 415 116 401 116 396 109 394 110 391 118 390 117 388 126 389 123 385 141 378 155 378 155 373 163 374 163 371 167 370 166 368 172 368 171 363 179 371 180 369 185 370 185 367 187 369 188 367 202 369 186 375 189 383 200 392 202 396 202 401 198 410 200 418 180 426 185 434 179 439 178 449 172 448 164 450 158 445 152 449 142 445 136 452 138 454 125 465 126 468 117 470 110 477 119 481 121 486 119 487 117 486 114 489 108 487 98 495 87 494 84 491 79 497 76 494 71 496 68 494 66 498 58 493 56 502 44 509 48 513 43 520 43 529 31 542 36 548ZM167 298 160 298 159 293 169 297 167 300ZM168 293 170 287 168 282 170 280 171 283 172 279 177 280 175 285 179 286 174 286 175 288 172 287 174 288 171 290ZM159 292 152 288 156 280 160 281 161 276 166 278 168 275 171 276 168 280 164 281 167 284 165 288 160 286 160 281 156 285ZM192 270 190 271 192 268 183 264 183 251 186 253 185 249 190 246 189 245 194 245 197 241 210 254 208 265 204 266 205 262 204 265 200 266 204 266 204 271 197 270 196 268 196 271 192 272Z',
  'M228 560 233 559 231 562 233 564 232 564ZM231 548 224 540 229 550 222 552 223 548 220 549 218 533 210 523 213 515 210 513 207 505 209 493 203 488 198 477 202 461 195 453 198 450 198 445 202 446 213 443 211 434 213 432 218 434 226 430 229 432 226 424 233 422 238 406 249 410 258 410 265 414 269 421 274 417 274 414 282 412 283 407 294 405 293 412 305 412 310 416 312 420 310 423 313 424 312 430 315 434 326 427 329 430 334 429 341 422 345 421 342 428 346 431 346 438 340 438 338 447 334 448 334 455 327 458 330 462 326 470 331 476 327 480 325 486 327 490 330 489 334 494 336 499 334 504 334 506 328 504 324 508 316 503 316 505 319 506 318 507 320 507 318 509 323 508 324 510 317 518 314 518 317 521 314 524 311 523 308 528 300 529 300 525 298 527 291 524 285 526 286 529 296 527 298 530 296 534 292 535 292 540 289 537 286 538 287 543 284 545 283 550 270 546 266 549 268 554 264 553 257 538 257 542 254 543 258 547 252 546 252 536 249 539 250 541 247 539 238 544 238 547ZM332 508 328 508 331 505 338 509 334 510Z',
  'M100 610 97 606 88 609 87 604 93 601 92 595 96 590 100 594 96 598 99 600 100 598 98 605 103 602 104 606 102 604ZM77 595 81 595 81 598 78 598ZM85 598 87 593 84 591 83 595 76 581 82 581 89 589 89 583 84 582 86 580 84 577 89 577 90 575 92 579 89 594 91 600 83 602ZM56 585 59 589 54 590 52 589 54 586 46 585 43 569 41 570 36 565 37 552 34 543 31 542 43 529 43 520 48 513 44 509 56 502 58 493 66 498 68 494 71 496 76 494 79 497 84 491 87 494 98 495 108 487 114 489 117 486 119 487 121 486 119 481 110 477 117 470 126 468 125 465 138 454 136 452 144 444 152 449 158 445 164 450 174 448 178 451 192 449 202 461 198 469 200 472 199 479 209 493 207 505 210 513 213 515 210 523 219 538 218 551 213 546 213 549 217 552 210 555 208 563 198 561 196 558 192 560 195 556 192 552 190 556 175 561 170 559 170 567 164 569 153 568 149 570 148 569 139 576 137 572 134 572 131 578 126 577 126 581 129 582 127 584 120 584 117 589 114 588 112 590 106 586 102 591 98 592 97 587 100 584 95 581 92 569 97 566 95 564 87 566 87 564 86 567 76 564 75 566 74 565 57 581ZM61 582 70 573 72 575 72 579 63 585ZM82 574 85 570 85 575ZM133 598 134 594 139 591 142 594 135 598ZM122 595 118 593 120 590 127 592 128 594 124 597 124 595ZM112 594 116 590 116 595ZM140 589 138 584 144 583 144 581 146 583 149 577 151 578 148 585 149 588ZM171 573 178 572 179 576 172 581 168 579ZM181 575 177 570 179 565 183 566 183 569 185 568 187 571 185 578ZM169 569 170 574 167 572ZM173 570 174 565 176 569 174 572 172 570ZM202 564 204 563 204 566 199 568 198 566 201 563ZM183 564 182 559 190 557 187 565Z',
  'M-39 537 -33 529 -32 524 -26 522 -28 521 -26 516 -22 516 -20 520 -18 514 -15 513 -14 523 -11 524 -10 530 -13 532 -13 537 -18 542 -13 546 -14 553 -1 552 -5 561 -3 569 2 574 11 573 16 568 21 573 28 563 26 554 30 548 36 548 37 552 36 565 41 570 43 569 46 585 54 586 52 590 59 590 57 593 60 595 57 602 53 603 55 622 51 629 42 630 47 647 46 649 42 649 42 642 32 637 34 635 30 638 24 634 22 636 22 632 8 624 8 622 4 621 -1 625 3 626 1 628 -5 626 3 619 0 616 -2 618 0 613 -7 615 -6 612 -8 611 -14 615 -22 615 -25 619 -27 616 -34 623 -39 622 -40 619ZM22 655 26 658 20 659 21 657ZM31 655 37 650 36 645 42 650 38 651 33 657ZM1 632 3 629 3 631 6 630 8 624 10 627 4 633ZM-32 624 -29 619 -26 620 -29 624ZM-14 621 -11 617 -12 622 -9 625 -11 624ZM46 666 46 660 47 666 43 668ZM55 658 53 654 49 654 56 652 63 657 60 660 58 657ZM53 642 50 640 50 634 51 630 53 631 55 628 64 630 70 638 80 634 82 630 89 631 80 637 76 637 76 644 70 645 71 641 64 638 62 640 64 643 56 643 54 645Z',
  'M345 677 340 682 343 683 340 688 336 689 340 690 333 690 334 695 329 693 317 692 312 682 316 679 315 673 300 672 301 666 296 650 291 651 290 648 287 649 284 655 280 656 275 654 270 647 258 649 247 644 251 636 249 634 251 631 249 620 255 619 262 610 268 611 268 608 272 606 284 604 285 608 291 611 298 604 308 604 311 596 315 594 326 593 331 596 337 595 338 593 347 597 350 589 359 586 368 587 367 585 370 584 369 590 377 594 372 603 370 621 373 623 372 625 376 621 386 634 381 642 378 641 375 645 378 644 377 648 387 647 382 650 391 649 377 658 374 657 372 660 369 659 367 665 366 663 360 670 346 678ZM370 589 373 590 374 585 377 584 375 593 370 590ZM370 584 373 582 374 584 370 588Z',
  'M254 620 249 620 238 616 243 611 245 592 233 581 237 581 242 585 248 583 248 587 257 580 256 578 262 576 260 574 262 576 263 573 264 575 264 573 269 571 268 566 271 565 269 568 273 565 269 569 274 570 278 561 281 562 282 560 292 566 300 567 301 564 301 567 304 561 308 565 308 559 310 559 313 561 314 570 317 569 316 566 320 566 320 563 323 568 325 566 327 569 325 573 327 577 332 578 337 582 342 581 346 585 350 589 349 595 346 597 338 593 337 595 331 596 326 593 315 594 311 596 308 604 298 604 291 611 288 611 284 604 272 606 268 608 268 611 263 610 256 616ZM250 563 254 558 256 563 252 566 250 565ZM259 559 265 560 259 563ZM288 549 288 546 289 546 293 550 291 551ZM297 545 303 542 306 544 302 549ZM338 533 340 532 338 535 340 537 337 553 334 549 329 551 330 548 334 549 331 546 327 548 323 556 322 545 318 545 312 549 313 543 316 544 312 542 315 538 316 540 327 534 338 532Z',
  'M76 709 72 705 73 707 69 707 68 710 66 706 64 711 51 716 47 722 40 724 41 720 28 727 42 715 44 718 45 715 48 716 47 712 50 714 50 711 56 711 58 708 61 710 61 706 82 695 90 684 104 678 113 671 119 661 117 653 122 644 119 642 121 637 126 637 128 623 141 613 149 612 149 605 145 604 149 604 151 600 163 614 168 627 171 632 175 632 175 635 176 632 177 634 186 633 193 630 193 626 194 628 196 627 195 625 202 624 204 626 204 624 206 626 214 624 227 627 238 616 248 618 250 621 249 625 251 631 249 634 251 636 247 642 236 644 232 641 225 650 206 649 202 652 196 650 191 657 185 656 175 672 175 677 169 678 170 685 165 690 168 695 161 705 153 708 139 706 134 709 141 723 145 726 146 731 132 738 129 749 125 750 119 760 111 752 109 753 110 761 114 764 114 773 118 786 113 794 106 795 104 792 106 790 99 790 102 793 95 790 94 791 96 792 92 795 96 795 92 797 88 791 93 789 89 786 92 784 92 787 100 788 94 785 92 779 91 780 90 774 86 774 86 776 81 773 81 777 79 780 77 778 81 770 84 773 86 771 91 773 90 768 88 770 90 766 86 762 89 763 93 761 85 760 84 755 88 754 82 749 80 749 87 748 88 753 90 752 91 756 92 752 95 755 94 751 91 751 94 748 101 746 96 742 98 739 94 741 90 738 89 741 90 736 96 732 93 732 92 730 86 733 84 731 82 734 76 731 76 728 82 725 80 725 82 721 77 724 77 721 79 718 77 716 82 711 77 712 82 708 78 709 78 706ZM114 638 120 634 116 638 118 642 115 643ZM98 624 102 624 98 629ZM103 628 113 620 110 627 112 630 106 632ZM162 602 162 598 165 598 162 594 164 591 168 592 170 595 174 594 172 597 164 605 161 605ZM152 590 153 587 158 586 158 581 154 580 158 578 157 576 162 575 167 581 167 587 154 592ZM170 592 166 589 168 585 173 584 173 587 178 587 175 590 176 591 172 590ZM179 578 181 581 177 584 177 580ZM186 580 190 576 190 578 186 584Z',
  'M160 797 121 797 120 793 113 794 118 786 114 773 114 764 110 761 108 755 111 752 119 760 125 750 129 749 132 738 145 732 146 728 141 723 134 709 139 706 153 708 161 705 168 695 165 690 170 685 169 678 175 677 175 672 185 656 191 657 196 650 202 652 206 649 225 650 233 641 236 644 247 642 249 645 258 649 270 647 275 654 280 656 290 648 291 651 296 650 299 658 301 669 300 672 315 673 316 679 312 682 317 692 332 694 320 719 315 743 310 735 306 735 305 730 297 723 296 716 286 712 283 704 261 700 256 696 239 699 234 702 234 694 232 700 235 703 216 712 212 711 213 713 206 716 213 716 214 712 220 713 220 715 213 719 205 718 201 725 202 722 198 721 200 720 198 717 198 720 193 724 194 728 190 730 194 732 191 735 194 741 191 750 187 753 189 757 185 755 182 758 178 766 173 770 172 778 164 776 161 779 158 789Z',
  'M27 772 23 774 17 773 12 783 21 790 21 788 23 787 24 791 27 788 27 792 31 791 31 789 37 790 38 792 30 792 28 796 24 794 24 797 -40 797 -40 731 -38 739 -28 743 -22 738 -17 740 -16 737 -6 744 -6 742 -3 742 -4 743 10 742 9 741 14 739 10 744 9 750 0 762 6 763 9 761 15 762 7 767 8 769 15 769 17 771 19 766 19 770 23 772 25 767 27 766 26 769ZM-40 724 -40 675 -36 675 -37 673 -30 674 -29 672 -18 676 -7 696 -10 703 -8 708 -13 717 -23 715 -20 721 -27 723 -28 727 -33 726 -35 723ZM-22 667 -18 664 -13 666 -18 668ZM15 784 16 780 19 779 16 785Z',
];
