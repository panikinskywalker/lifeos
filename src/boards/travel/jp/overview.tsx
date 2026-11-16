import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import {
  checklistOf,
  COMING_LABEL,
  comingUpOf,
  durationWords,
  eventsOf,
  isoOf,
  kanjiNumber,
  lineMark,
  missingCheckIn,
  needsAttention,
  nightsOf,
  projectedOf,
  readyToFly,
  seatsOpenBoard,
  stageOfTrip,
  stampsOfTrip,
  stopsLineOf,
  stopsOf,
  tripBalances,
  tripBills,
  tripLedger,
  tripStays,
  wayThere,
  weatherOfStops,
  type ComingGroup,
  type ComingItem,
  type LineStop,
  type Sky,
  type StopData,
  type StopsLine,
  type TripData,
  type WayThere,
} from '@modules/travel';
import { Anim, bgImage, JP_SANS, JP_SERIF, MONO, MONO_MED, Wave } from './kit';
import { C, DotMatrix, FACE, Faces, isJapan, money, scriptName, Stepper, TripHeader, TripScreen, tripRoutes, useShow } from './shell';

/**
 * The trip page before the trip (JP-Overview): the stage, the hero with the
 * countdown, the way there as a boarding pass, the notes that need attention,
 * what is coming up until you fly, the seats-open board, the journey, the
 * stays as station boards, the map, money left and the stamps, the weather by
 * stop, events on the route, Ready to fly, your balance and the copilot.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const mon = (iso: string) => MONTHS[Number(iso.slice(5, 7)) - 1] ?? '';
/** "17 DEC" */
const dMon = (iso: string) => `${Number(iso.slice(8, 10))} ${mon(iso)}`;
/** "01 DEC" (the departure board) */
const ddMon = (iso: string) => `${iso.slice(8, 10)} ${mon(iso)}`;
/** "18 Dec" */
const dMonTitle = (iso: string) => `${Number(iso.slice(8, 10))} ${mon(iso).charAt(0)}${mon(iso).slice(1).toLowerCase()}`;
/** "DEC 17" */
const monD = (iso: string) => `${mon(iso)} ${iso.slice(8, 10)}`;
const noon = (day: string) => new Date(`${day}T12:00:00`).getTime();
const daysBetween = (a: string, b: string) => Math.round((noon(b) - noon(a)) / 86_400_000);
const addDays = (day: string, n: number) => isoOf(noon(day) + n * 86_400_000);

const STOP_HEX: Record<string, string> = { green: '#5FD08A', teal: '#4CC9D4', indigo: '#8C9DFF', persimmon: '#FF9A4D', wood: '#C99A6E', plum: '#E08BC8', crimson: '#FF6B7A', gold: '#F2C94C', sky: '#6CC6FF', slate: '#9FB0C8' };
const ORDER_HEX = ['#5FD08A', '#4CC9D4', '#8C9DFF', '#FF9A4D', '#C99A6E', '#E08BC8', '#9FB0C8', '#FF6B7A', '#6CC6FF', '#F2C94C'];
const hexOf = (color: string | null | undefined, i: number) => (color && (STOP_HEX[color] ?? (color.startsWith('#') ? color : null))) || ORDER_HEX[i % ORDER_HEX.length]!;

/** The tile size of a CSS background pattern (web; the phone draws the gradient once). */
const bgSize = (v: string) => (Platform.OS === 'web' ? { backgroundSize: v } : {}) as ViewStyle;

const CORAL = '#FF5C47';
const AMBER = '#FFB547';
const ORANGE = '#F26B2B';
const J = 'PlusJakartaSans_';

type Props = { trip: ObjectRecord<TripData>; ctx: LifeOSContext };

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

function Ico({ d, size = 16, color = C.white, width = 2, children }: { d?: string[]; size?: number; color?: string; width?: number; children?: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {d?.map((x) => <Path key={x} d={x} />)}
      {children}
    </Svg>
  );
}
const PLANE = 'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z';
const SPARK = 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z';
const CAL = ['M8 2v4', 'M16 2v4', 'M3 10h18'];
const Chevron = ({ color = C.mid, size = 13 }: { color?: string; size?: number }) => <Ico size={size} color={color} d={['m9 18 6-6-6-6']} />;
const Alert = ({ color, size = 16 }: { color: string; size?: number }) => (
  <Ico size={size} color={color} d={['M12 8v4', 'M12 16h.01']}>
    <Circle cx={12} cy={12} r={10} />
  </Ico>
);
function SkyIcon({ sky }: { sky: Sky }) {
  if (sky === 'snow') return <Ico size={18} color="#9AD0FF" d={['M2 12h20', 'M12 2v20', 'm20 16-4-4 4-4', 'm4 8 4 4-4 4', 'm16 4-4 4-4-4', 'm8 20 4-4 4 4']} />;
  if (sky === 'cloud') return <Ico size={18} color="#C9CCD6" d={['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z']} />;
  if (sky === 'rain') return <Ico size={18} color="#6CC6FF" d={['M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242', 'M16 14v6', 'M8 14v6', 'M12 16v6']} />;
  return (
    <Ico size={18} color="#F2C94C" d={['M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41']}>
      <Circle cx={12} cy={12} r={4} />
    </Ico>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/** A pill button in a section head ("All 22 notes", "Show more"). */
function Pill({ label, chevron, onPress, h = 28 }: { label: string; chevron?: boolean; onPress?: () => void; h?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={6} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 5, height: h, paddingHorizontal: 11, backgroundColor: C.raised, borderRadius: 999, opacity: pressed ? 0.8 : 1 })}>
      {chevron ? <Chevron /> : null}
      <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: `${J}600SemiBold` }}>{label}</Text>
    </Pressable>
  );
}

/** The artboard's section head: 17 px title, 13 px line, something on the right. */
function SecHead({ title, sub, right }: { title: string; sub?: string | null; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: `${J}600SemiBold` }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: `${J}500Medium` }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const Label = ({ children, color = C.low }: { children: React.ReactNode; color?: string }) => <Text style={{ color, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontFamily: `${J}600SemiBold` }}>{children}</Text>;
const Mono = ({ children, color = C.mid, size = 10, spacing = 0.9, align }: { children: React.ReactNode; color?: string; size?: number; spacing?: number; align?: 'right' | 'left' }) => (
  <Text numberOfLines={1} style={{ color, fontSize: size, letterSpacing: spacing, fontFamily: MONO, fontVariant: ['tabular-nums'], textAlign: align }}>{children}</Text>
);

const Card = ({ children, onPress, label, gap = 12, radius = 28 }: { children: React.ReactNode; onPress?: () => void; label?: string; gap?: number; radius?: number }) =>
  onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ gap, minWidth: 0, padding: 16, backgroundColor: C.tile, borderRadius: radius, overflow: 'hidden', opacity: pressed ? 0.92 : 1 })}>
      {children}
    </Pressable>
  ) : (
    <View style={{ gap, minWidth: 0, padding: 16, backgroundColor: C.tile, borderRadius: radius, overflow: 'hidden' }}>{children}</View>
  );

/** A width measured once laid out (for the SVGs that are drawn to it). */
function useWidth(initial: number): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(initial);
  return [w, (e) => {
    const x = Math.round(e.nativeEvent.layout.width);
    if (x > 0 && Math.abs(x - w) > 1) setW(x);
  }];
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

export function OverviewPage({ trip }: Props) {
  const router = useRouter();
  const show = useShow(trip);
  const japan = isJapan(trip);
  const d = useLive(
    (os) => {
      const t = os.records.get<TripData>(trip.id) ?? trip;
      const now = Date.now();
      const today = isoOf(now);
      const nights = nightsOf(os, t);
      const line = stopsLineOf(os, t, nights);
      const way = wayThere(os, t);
      const stops = stopsOf(os, t.id, ['stop', 'idea']);
      const coordsOf = (s: ObjectRecord<StopData>) => (s.data.placeId ? os.records.get<{ coordinates?: { lat: number; lng: number } }>(s.data.placeId)?.data.coordinates ?? null : null);
      const stopById = new Map(stops.map((s) => [s.id, s]));
      const colorIndex = new Map(line.stops.map((s, i) => [s.stopId, i]));
      const people = (t.data.personIds ?? []).map((id) => ({ id, name: os.records.get(id)?.title ?? 'Someone' }));
      const ledger = tripLedger(os, t, now);
      const bal = tripBalances(os, t);
      const mine = bal.debts.filter((x) => x.from === 'me' || x.to === 'me').sort((a, b) => b.amount - a.amount)[0] ?? null;
      const events = eventsOf(os, t).map((e) => {
        const s = e.data.stopId ? stopById.get(e.data.stopId) : null;
        return { id: e.id, title: e.title, day: e.data.day ?? null, until: e.data.until ?? null, note: e.data.quietest ?? e.data.notes ?? null, stop: s ? { title: s.title, localName: s.data.localName ?? null, color: hexOf(s.data.color, colorIndex.get(s.id) ?? 0) } : null };
      });
      return {
        t,
        now,
        today,
        stage: stageOfTrip(os, t, now),
        line,
        way,
        attention: needsAttention(os, t.id),
        coming: comingUpOf(os, t, now),
        seats: seatsOpenBoard(os, t, now),
        stamps: stampsOfTrip(line, now),
        weather: weatherOfStops(line, t),
        events,
        ready: readyToFly(checklistOf(os, t.id), now),
        nextDue: checklistOf(os, t.id).find((x) => x.status !== 'done' && x.data.dueDate && x.data.dueDate >= today) ?? null,
        people,
        mine: projectedOf(ledger, 'me'),
        hasLedger: ledger.length > 0,
        debt: mine ? { owe: mine.from === 'me', other: mine.from === 'me' ? mine.to : mine.from, amount: mine.amount } : null,
        hasBills: tripBills(os, t.id).length > 0,
        missingTimes: missingCheckIn(tripStays(os, t.id)).length,
        stayIds: new Set(tripStays(os, t.id).map((e) => e.id)),
        pins: line.stops.map((s, i) => ({ s, i, c: stopById.get(s.stopId) ? coordsOf(stopById.get(s.stopId)!) : null })),
        ideas: stops.filter((s) => s.data.kind === 'idea').map((s) => ({ title: s.title, localName: s.data.localName ?? null, c: coordsOf(s) })).filter((x) => x.c),
      };
    },
    [trip.id, trip.version],
  );
  const t = d.t;
  const go = (r: never) => router.push(r);
  const fly = d.way ? isoOf(d.way.departAt) : t.data.startDate ?? null;
  const toFly = fly ? daysBetween(d.today, fly) : null;
  const nameOf = (party: string) => (party === 'me' ? 'You' : d.people.find((p) => p.id === party)?.name ?? 'Someone');
  const partyIndex = (party: string) => (party === 'me' ? 0 : d.people.findIndex((p) => p.id === party) + 1);
  const dates = t.data.startDate ? `${dMon(t.data.startDate)}${t.data.endDate ? ` – ${dMon(t.data.endDate)}` : ''}` : 'NO DATES YET';

  return (
    <TripScreen tripId={t.id} active="overview">
      <TripHeader trip={t} label={dates} />
      <Stepper stage={d.stage} />
      <Hero trip={t} japan={japan} d={d} toFly={toFly} onDays={() => go(tripRoutes.plan(t.id, 'days'))} onPreview={() => go(tripRoutes.viewOnly(t.id))} />
      {d.way ? <Ticket way={d.way} toFly={toFly} onPress={() => go(tripRoutes.booking(d.way!.eventId))} /> : null}
      {d.attention.rows.length ? (
        <Anim k="jr" delay={290} style={{ gap: 10, minWidth: 0 }}>
          <SecHead title="Needs attention" sub={[d.attention.critical ? `${d.attention.critical} critical` : null, d.attention.heads ? `${d.attention.heads} heads-up` : null].filter(Boolean).join(' · ')} right={<Pill chevron label={`All ${d.attention.all} notes`} onPress={() => go(tripRoutes.prep(t.id))} />} />
          <View style={{ gap: 8 }}>
            {d.attention.rows.slice(0, 3).map((r) => (
              <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={r.title} onPress={() => go(`/entity/task/${r.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, backgroundColor: r.level === 'critical' ? 'rgba(255,92,71,0.18)' : 'rgba(255,181,71,0.12)', borderRadius: 20, opacity: pressed ? 0.85 : 1 })}>
                <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: r.level === 'critical' ? CORAL : AMBER, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Alert color={C.ink} />
                </View>
                <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                  <Text style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: `${J}700Bold` }}>{r.title}</Text>
                  {r.body ? <Text numberOfLines={3} style={{ marginTop: 2, color: C.mid, fontSize: 13, lineHeight: 18, fontFamily: `${J}400Regular` }}>{r.body}</Text> : null}
                </View>
              </Pressable>
            ))}
          </View>
        </Anim>
      ) : null}
      {d.coming ? <ComingUpCard coming={d.coming} stayIds={d.stayIds} onOpen={(i) => go(i.kind === 'task' ? (`/entity/task/${i.id}` as never) : (i.kind === 'cancel' || i.kind === 'charge') && d.stayIds.has(i.id) ? tripRoutes.stay(i.id) : tripRoutes.booking(i.id))} /> : null}
      {d.seats.length ? <SeatsBoard rows={d.seats} today={d.today} onOpen={(id) => go(tripRoutes.booking(id))} /> : null}
      {d.line.stops.length ? <JourneyCard line={d.line} japan={japan} end={t.data.endDate ?? null} onPress={() => go(tripRoutes.plan(t.id, 'line'))} /> : null}
      {d.line.stops.some((s) => s.nights > 0) ? <Stays stops={d.line.stops.filter((s) => s.nights > 0)} japan={japan} onOpen={(id) => go(tripRoutes.stop(id))} /> : null}
      {d.pins.filter((p) => p.c).length >= 2 ? <MapCard pins={d.pins} ideas={d.ideas} japan={japan} onPress={() => go(tripRoutes.plan(t.id, 'map'))} /> : null}
      <Anim k="jr" delay={650} style={{ flexDirection: 'row', gap: 12 }}>
        {t.data.budget || d.hasLedger ? <LeftEach budget={t.data.budget ?? null} mine={d.mine} show={show} onPress={() => go(tripRoutes.money(t.id, 'budget'))} /> : null}
        {japan && d.stamps.stops.length ? <StampsCard stamps={d.stamps} /> : null}
      </Anim>
      {d.weather.length ? (
        <Anim k="jr" delay={710} style={{ gap: 8, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Label>WEATHER BY STOP</Label>
            <View style={{ flexGrow: 1 }} />
            <Mono size={9} spacing={0.5} color={C.low}>{`${mon(t.data.startDate ?? d.today)} NORMALS`}</Mono>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20 }}>
            {d.weather.map(({ stop, normals }) => (
              <Pressable key={stop.stopId} accessibilityRole="button" accessibilityLabel={`${stop.title}: ${normals.hi}° high, ${normals.lo}° low`} onPress={() => go(tripRoutes.stop(stop.stopId))} style={{ alignItems: 'center', flexShrink: 0, gap: 5, width: 66, paddingVertical: 10, paddingHorizontal: 6, backgroundColor: C.tile, borderRadius: 18 }}>
                <Text style={{ color: C.white, fontSize: 12, fontFamily: japan && stop.localName ? JP_SANS : `${J}800ExtraBold`, fontWeight: japan && stop.localName ? '900' : undefined }}>{lineMark(stop, japan)}</Text>
                <SkyIcon sky={normals.sky} />
                <Text style={{ color: C.white, fontSize: 13, fontFamily: `${J}800ExtraBold`, fontVariant: ['tabular-nums'] }}>{`${normals.hi}°`}</Text>
                <Text style={{ color: C.low, fontSize: 11, fontFamily: `${J}600SemiBold`, fontVariant: ['tabular-nums'] }}>{`${normals.lo < 0 ? '−' : ''}${Math.abs(normals.lo)}°`}</Text>
              </Pressable>
            ))}
            <View style={{ width: 14, flexShrink: 0 }} />
          </ScrollView>
        </Anim>
      ) : null}
      {d.events.length ? <OnRoute events={d.events} japan={japan} wide={japan ? [...(scriptName(t) ?? '')][0] ?? null : null} onOpen={(id) => go(`/entity/outing/${id}` as never)} /> : null}
      {d.ready.total ? <ReadyCard ready={d.ready} toFly={toFly} next={d.nextDue ? { title: d.nextDue.title, day: d.nextDue.data.dueDate! } : null} onPress={() => go(tripRoutes.prep(t.id))} /> : null}
      {d.people.length ? (
        <Anim k="jr" delay={890} style={{ minWidth: 0 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Settle up" onPress={() => go(tripRoutes.money(t.id, 'settle'))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: C.tile, borderRadius: 24, opacity: pressed ? 0.9 : 1 })}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: FACE[(d.debt ? partyIndex(d.debt.other) : 1) % FACE.length], alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Text style={{ color: C.ink, fontSize: 14, fontFamily: `${J}700Bold` }}>{(d.debt ? nameOf(d.debt.other) : d.people[0]!.name).slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: `${J}600SemiBold`, fontVariant: ['tabular-nums'] }}>
                {d.debt ? (d.debt.owe ? `You owe ${show(d.debt.amount)}` : `${nameOf(d.debt.other).split(' ')[0]} owes you ${show(d.debt.amount)}`) : 'All square'}
              </Text>
              <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: `${J}500Medium` }}>
                {d.debt ? (d.debt.owe ? `to ${nameOf(d.debt.other).split(' ')[0]} · paid ahead for you` : 'you paid ahead') : d.hasBills ? 'nobody owes anybody' : 'no shared spends yet'}
              </Text>
            </View>
            <Chevron size={18} color={C.low} />
          </Pressable>
        </Anim>
      ) : null}
      <Anim k="jr" delay={950} style={{ gap: 8, minWidth: 0 }}>
        <Label>ASK THE COPILOT</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 20 }}>
          {['What’s most urgent before we fly?', d.people.length ? 'Who owes whom right now?' : null, 'Log an expense', d.missingTimes ? 'Find missing check-in times in my email' : null, 'What now? Plan the next few hours']
            .filter((q): q is string => !!q)
            .map((q) => (
              <Pressable key={q} accessibilityRole="button" accessibilityLabel={q} onPress={() => go(tripRoutes.copilot(t.id, q))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 6, height: 38, paddingHorizontal: 14, backgroundColor: C.raised, borderRadius: 999, opacity: pressed ? 0.85 : 1 })}>
                <Ico size={13} color={C.lime} d={[SPARK]} />
                <Text style={{ color: C.white, fontSize: 13, fontFamily: `${J}600SemiBold` }}>{q}</Text>
              </Pressable>
            ))}
          <View style={{ width: 14, flexShrink: 0 }} />
        </ScrollView>
      </Anim>
    </TripScreen>
  );
}

type Data = { line: StopsLine; way: WayThere | null; people: Array<{ id: string; name: string }> };

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero({ trip, japan, d, toFly, onDays, onPreview }: { trip: ObjectRecord<TripData>; japan: boolean; d: Data; toFly: number | null; onDays: () => void; onPreview: () => void }) {
  const script = scriptName(trip);
  const first = d.line.stops[0];
  const last = d.line.stops[d.line.stops.length - 1];
  const route = [d.way?.fromCity, [first?.title, last && last.stopId !== first?.stopId ? last.title : null].filter(Boolean).join(' · ')].filter(Boolean).join(' ⇄ ').toUpperCase();
  const s = trip.data.startDate;
  const e = trip.data.endDate;
  const count = toFly == null ? null : toFly <= 0 ? 'TODAY' : `${toFly} ${toFly === 1 ? 'DAY' : 'DAYS'}`;
  // The board's gap is unlit dots, not nothing (a no-break space has no glyph, so it is drawn dim).
  const board = count?.replace(/ /g, '\u00A0') ?? null;
  const way = d.way;
  const flyLine = way ? ['until you fly', way.flightNos[0], `${[way.fromCity, way.from.terminal].filter(Boolean).join(' ')}, ${way.departs}`].filter(Boolean).join(' · ') : s ? `until you go · ${dMonTitle(s)}` : 'add dates to start the countdown';
  return (
    <Anim k="jr" delay={170} style={{ minWidth: 0 }}>
      <View style={[bgImage('linear-gradient(170deg,#24306A 0%,#141A3C 50%,#0D0F1E 100%)'), { padding: 20, paddingBottom: 60, borderRadius: 32, overflow: 'hidden', backgroundColor: '#141A3C' }]}>
        <View pointerEvents="none" style={[bgImage('radial-gradient(closest-side, rgba(232,85,58,0.55), rgba(232,85,58,0.18) 60%, rgba(232,85,58,0) 100%)'), { position: 'absolute', width: 220, height: 220, top: -30, right: -40, borderRadius: 110 }]} />
        {japan ? (
          <View pointerEvents="none" style={{ position: 'absolute', height: 60, left: 0, right: 0, bottom: 0 }}>
            <Wave />
          </View>
        ) : null}
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: 'rgba(255,255,255,0.7)', fontSize: 10, letterSpacing: 2, fontFamily: MONO }}>{route || (trip.data.destination ?? trip.title).toUpperCase()}</Text>
            <Faces names={['You', ...d.people.map((p) => p.name)]} size={26} ring="#151B38" />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8, marginTop: 14 }}>
            <View style={{ flexShrink: 1, minWidth: 0 }}>
              {script ? (
                <Text style={{ color: C.white, fontSize: 88, lineHeight: 88, letterSpacing: 4, fontFamily: JP_SERIF, fontWeight: '800' }}>{script}</Text>
              ) : (
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: C.white, fontSize: 56, lineHeight: 64, letterSpacing: -1.5, fontFamily: `${J}800ExtraBold` }}>{trip.data.destination || trip.title}</Text>
              )}
              {s ? <Text style={{ marginTop: 8, color: C.white, fontSize: 12, letterSpacing: 6, fontFamily: MONO }}>{`${monD(s)}${e ? ` – ${monD(e)}` : ''}`}</Text> : null}
            </View>
            {d.line.nights ? <NightsStamp nights={d.line.nights} rooms={d.line.rooms} japan={japan} /> : null}
          </View>
          <View style={{ gap: 8, marginTop: 18 }}>
            {count && board ? <DotMatrix text={board} pitch={5} label={`${count} until you fly`} /> : null}
            <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.72)', fontSize: 13, fontFamily: `${J}600SemiBold` }}>{flyLine}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, zIndex: 1 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Day by day" onPress={onDays} style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexGrow: 120, flexShrink: 1, flexBasis: 0, gap: 7, height: 48, minWidth: 0, paddingHorizontal: 8, backgroundColor: C.lime, borderRadius: 999, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              <Ico size={17} color={C.ink} d={CAL}>
                <Rect width={18} height={18} x={3} y={4} rx={2} />
              </Ico>
              <Text numberOfLines={1} style={{ color: C.ink, fontSize: 15, lineHeight: 20, fontFamily: `${J}600SemiBold` }}>Day by day</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Preview view-only" onPress={onPreview} style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexGrow: 190, flexShrink: 1, flexBasis: 0, gap: 7, height: 48, minWidth: 0, paddingHorizontal: 8, backgroundColor: 'rgba(22,22,26,0.5)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', borderRadius: 999, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              <Ico size={17} color={C.lime} d={['M20 21a8 8 0 0 0-16 0']}>
                <Circle cx={12} cy={8} r={4} />
              </Ico>
              <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: `${J}600SemiBold` }}>Preview view-only</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Anim>
  );
}

/** NIGHTS 20 十室: the vermilion hanko pressed in (Japan); a plain disc elsewhere. */
function NightsStamp({ nights, rooms, japan }: { nights: number; rooms: number; japan: boolean }) {
  const inner = (
    <>
      <Text style={{ color: '#FBF3E6', fontSize: 9, letterSpacing: 2, fontFamily: MONO }}>NIGHTS</Text>
      <Text style={{ color: '#FBF3E6', fontSize: 32, lineHeight: 34, letterSpacing: -1, fontFamily: `${J}800ExtraBold`, fontVariant: ['tabular-nums'] }}>{nights}</Text>
      {rooms ? <Text style={{ color: '#FBF3E6', fontSize: 12, lineHeight: 14, letterSpacing: japan ? 4 : 1, fontFamily: japan ? JP_SERIF : MONO, fontWeight: japan ? '800' : undefined }}>{japan ? `${kanjiNumber(rooms)}室` : `${rooms} STAYS`}</Text> : null}
    </>
  );
  if (!japan) return <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: C.vermilion, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{inner}</View>;
  return (
    <Anim k="jstamp" style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: C.vermilion, alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'inset 0 0 0 4px #E8553A, inset 0 0 0 6px rgba(251,243,230,0.7)', transform: [{ rotate: '-8deg' }] }}>
      {inner}
    </Anim>
  );
}

/* ------------------------------------------------------------------ */
/* Boarding pass                                                       */
/* ------------------------------------------------------------------ */

function Ticket({ way, toFly, onPress }: { way: NonNullable<ReturnType<typeof wayThere>>; toFly: number | null; onPress: () => void }) {
  const day = isoOf(way.departAt);
  const [w, onLayout] = useWidth(120);
  const mid = [way.minutes != null ? durationWords(way.minutes) : null, way.via.length ? `VIA ${way.via.join(', ').toUpperCase()}` : 'NON-STOP'].filter(Boolean).join(' · ');
  return (
    <Anim k="jr" delay={230} style={{ minWidth: 0 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Flight ${way.from.code ?? way.fromCity} to ${way.to.code ?? way.toCity}`} onPress={onPress} style={({ pressed }) => [bgImage('linear-gradient(135deg,#3A3060 0%,#24203C 60%,#1A1A1E 100%)'), { gap: 12, padding: 16, borderRadius: 26, backgroundColor: '#24203C', opacity: pressed ? 0.92 : 1 }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Mono spacing={0.6}>{`DEPART ${way.departs}${way.fromZone ? ` ${way.fromZone}` : ''}`}</Mono>
          {way.lands ? <Mono spacing={0.6}>{`ARRIVE ${way.lands}${way.toZone ? ` ${way.toZone}` : ''}`}</Mono> : null}
        </View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <View style={{ flexShrink: 0 }}>
            <Text style={{ color: C.white, fontSize: 30, lineHeight: 32, letterSpacing: 0.5, fontFamily: `${J}800ExtraBold` }}>{way.from.code ?? way.fromCity.slice(0, 3).toUpperCase()}</Text>
            <Mono>{way.fromCity.toUpperCase()}</Mono>
          </View>
          <View style={{ alignItems: 'center', gap: 4, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
            <View onLayout={onLayout} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' }}>
              <Svg width={Math.max(0, (w - 30) / 2)} height={4}>
                <Line x1={1} y1={2} x2={Math.max(0, (w - 30) / 2) - 1} y2={2} stroke="rgba(245,245,247,0.3)" strokeWidth={2} strokeDasharray="0.1 5" strokeLinecap="round" />
              </Svg>
              <Ico size={18} color={C.white} d={[PLANE]} />
              <Svg width={Math.max(0, (w - 30) / 2)} height={4}>
                <Line x1={1} y1={2} x2={Math.max(0, (w - 30) / 2) - 1} y2={2} stroke="rgba(245,245,247,0.3)" strokeWidth={2} strokeDasharray="0.1 5" strokeLinecap="round" />
              </Svg>
            </View>
            <Mono>{mid}</Mono>
          </View>
          <View style={{ flexShrink: 0, alignItems: 'flex-end' }}>
            <Text style={{ color: C.white, fontSize: 30, lineHeight: 32, letterSpacing: 0.5, textAlign: 'right', fontFamily: `${J}800ExtraBold` }}>{way.to.code ?? way.toCity.slice(0, 3).toUpperCase()}</Text>
            <Mono align="right">{way.toCity.toUpperCase()}</Mono>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <Mono color={C.lime} spacing={1}>{`${dMon(day)}${toFly != null && toFly > 0 ? ` · IN ${toFly} ${toFly === 1 ? 'DAY' : 'DAYS'}` : toFly === 0 ? ' · TODAY' : ''}`}</Mono>
          <Mono color={C.white} spacing={0.6}>{[way.flightNos[0], way.from.terminal].filter(Boolean).join(' · ')}</Mono>
        </View>
      </Pressable>
    </Anim>
  );
}

/* ------------------------------------------------------------------ */
/* Coming up                                                           */
/* ------------------------------------------------------------------ */

type ChipKey = ComingGroup | 'deadlines';
const CHIP_LABEL: Record<ChipKey, string> = { ...COMING_LABEL, deadlines: 'Deadlines' };

function ComingUpCard({ coming, onOpen }: { coming: NonNullable<ReturnType<typeof comingUpOf>>; stayIds: Set<string>; onOpen: (i: ComingItem) => void }) {
  const keys = (['action', 'heads', 'know', 'deadlines'] as ChipKey[]).filter((k) => coming.counts[k] > 0);
  const [sel, setSel] = useState<ChipKey>(keys[0] ?? 'action');
  const [more, setMore] = useState(false);
  const [w, onLayout] = useWidth(318);
  const inGroup = (i: ComingItem) => (sel === 'deadlines' ? i.kind === 'seats' || i.kind === 'cancel' || i.kind === 'charge' : i.group === sel);
  const flight = coming.items.find((i) => i.kind === 'flight');
  const mine = coming.items.filter(inGroup);
  const shown = more ? mine : mine.slice(0, 3);
  const list = flight && !shown.includes(flight) ? [...shown, flight] : shown;
  const span = Math.max(1, coming.days);
  const xOf = (day: string) => Math.min(1, Math.max(0, daysBetween(coming.today, day) / span)) * w;
  const P = 14; // room for the ends that hang over the line
  const seats = coming.rail.filter((r) => r.kind === 'seats');
  const cancels = coming.rail.filter((r) => r.kind === 'cancel');
  const midDay = addDays(coming.today, Math.round(span / 2));
  const amountOf = (i: ComingItem) => (i.amount ? money(i.amount.value, i.amount.currency) : null);
  const subOf = (i: ComingItem) => (i.kind === 'flight' ? i.sub : [COMING_LABEL[i.group], [amountOf(i), i.sub].filter(Boolean).join(' ')].filter(Boolean).join(' · '));
  return (
    <Anim k="jr" delay={350} style={{ minWidth: 0 }}>
      <View style={{ gap: 12, padding: 16, backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' }}>
        <SecHead title="Coming up" sub={coming.days > 0 ? `the next ${coming.days} ${coming.days === 1 ? 'day' : 'days'}, until you fly` : 'today, you fly'} right={mine.length > 3 ? <Pill label={more ? 'Show less' : 'Show more'} onPress={() => setMore(!more)} /> : null} />
        {keys.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16 }}>
            {keys.map((k) => {
              const on = k === sel;
              return (
                <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${CHIP_LABEL[k]}, ${coming.counts[k]}`} onPress={() => { setSel(k); setMore(false); }} style={{ flexShrink: 0, height: 34, paddingHorizontal: 16, borderRadius: 999, backgroundColor: on ? C.white : C.raised, justifyContent: 'center' }}>
                  <Text numberOfLines={1} style={{ color: on ? C.ink : C.white, fontSize: 14, lineHeight: 18, fontFamily: `${J}600SemiBold` }}>{`${CHIP_LABEL[k]} · ${coming.counts[k]}`}</Text>
                </Pressable>
              );
            })}
            <View style={{ width: 10, flexShrink: 0 }} />
          </ScrollView>
        ) : null}
        <View onLayout={onLayout} style={{ height: 72 }}>
          <Svg width={w + P * 2} height={72} style={{ marginLeft: -P }}>
            <G transform={`translate(${P},0)`}>
              <Line x1={0} x2={w} y1={40} y2={40} stroke="rgba(245,245,247,0.18)" strokeWidth={2} />
              <Line x1={0} x2={6} y1={40} y2={40} stroke={C.lime} strokeWidth={2} />
              {seats.map((r, i) => (
                <G key={`s${i}`}>
                  <Line x1={xOf(r.day)} x2={xOf(r.day)} y1={22} y2={40} stroke={C.lime} strokeWidth={1.5} />
                  <Circle cx={xOf(r.day)} cy={18} r={5} fill={C.lime} />
                </G>
              ))}
              {cancels.map((r, i) => (
                <G key={`c${i}`}>
                  <Line x1={xOf(r.day)} x2={xOf(r.day)} y1={40} y2={56} stroke={CORAL} strokeWidth={1.5} />
                  <Rect x={xOf(r.day) - 5} y={56} width={10} height={10} rx={2} transform={`rotate(45 ${xOf(r.day)} 61)`} fill={CORAL} />
                </G>
              ))}
              <Circle cx={0} cy={40} r={6} fill={C.ink} stroke={C.lime} strokeWidth={3} />
              <G transform={`translate(${w - 10},30)`}>
                <Circle cx={10} cy={10} r={13} fill={C.white} />
                <G transform="translate(3,3) scale(0.58)">
                  <Path d={PLANE} fill="none" stroke={C.ink} strokeWidth={2.4} strokeLinejoin="round" />
                </G>
              </G>
            </G>
          </Svg>
        </View>
        <View style={{ height: 14 }}>
          <View style={{ position: 'absolute', left: 0, top: 0 }}>
            <Mono color={C.lime}>TODAY</Mono>
          </View>
          {span >= 6 ? (
            <View style={{ position: 'absolute', left: '50%', top: 0 }}>
              <Mono color={C.low}>{dMon(midDay)}</Mono>
            </View>
          ) : null}
          <View style={{ position: 'absolute', right: 0, top: 0 }}>
            <Mono color={C.white}>{`FLY ${dMon(coming.until)}`}</Mono>
          </View>
        </View>
        {seats.length || cancels.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {seats.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.lime }} />
                <Text style={{ color: C.mid, fontSize: 12, fontFamily: `${J}600SemiBold` }}>{`${seats.length} seat ${seats.length === 1 ? 'opening' : 'openings'}`}</Text>
              </View>
            ) : null}
            {cancels.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: CORAL, transform: [{ rotate: '45deg' }] }} />
                <Text style={{ color: C.mid, fontSize: 12, fontFamily: `${J}600SemiBold` }}>{`${cancels.length} free-cancel ${cancels.length === 1 ? 'end' : 'ends'}`}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        <View>
          {list.map((i, n) => {
            const firstRow = n === 0;
            const lastRow = n === list.length - 1;
            return (
              <Pressable key={`${i.kind}${i.id}${i.day}`} accessibilityRole="button" accessibilityLabel={i.title} onPress={() => onOpen(i)} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, opacity: pressed ? 0.8 : 1 })}>
                <View style={{ width: 58, paddingTop: 1, flexShrink: 0 }}>
                  <Text style={{ color: firstRow ? C.lime : C.white, fontSize: 12, lineHeight: 18, fontFamily: MONO, fontVariant: ['tabular-nums'] }}>{dMon(i.day)}</Text>
                </View>
                <View style={{ alignItems: 'center', width: 18, paddingTop: 4, flexShrink: 0 }}>
                  {firstRow ? (
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(215,245,92,0.25)', alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.lime }} />
                    </View>
                  ) : (
                    <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: C.mid }} />
                  )}
                  {lastRow ? null : <View style={{ flexGrow: 1, width: 1.5, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.12)' }} />}
                </View>
                <View style={{ flexGrow: 1, flexShrink: 1, gap: 2, minWidth: 0, paddingBottom: lastRow ? 0 : 18 }}>
                  <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: `${J}600SemiBold` }}>{i.title}</Text>
                  {subOf(i) ? <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: `${J}500Medium` }}>{subOf(i)}</Text> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Anim>
  );
}

/* ------------------------------------------------------------------ */
/* Seats open: the platform departure board                            */
/* ------------------------------------------------------------------ */

function SeatsBoard({ rows, today, onOpen }: { rows: ReturnType<typeof seatsOpenBoard>; today: string; onOpen: (id: string) => void }) {
  return (
    <Anim k="jr" delay={410} style={{ minWidth: 0 }}>
      <View style={[bgImage('radial-gradient(rgba(255,181,71,0.05) 1px, transparent 1px)'), bgSize('4px 4px'), { backgroundColor: '#070708', borderWidth: 1, borderColor: '#1E1E22', borderRadius: 24, overflow: 'hidden' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,181,71,0.18)' }}>
          <Text style={{ color: AMBER, fontSize: 12, letterSpacing: 2, fontFamily: JP_SANS, fontWeight: '900' }}>発車</Text>
          <Text style={{ color: AMBER, fontSize: 12, letterSpacing: 3, fontFamily: MONO }}>SEATS OPEN</Text>
          <View style={{ marginLeft: 'auto', flexDirection: 'row' }}>
            <Text style={{ color: C.lime, fontSize: 11, fontFamily: MONO }}>{`NOW ${dMon(today)}`}</Text>
            <Anim k="jblink">
              <Text style={{ color: C.lime, fontSize: 11, fontFamily: MONO }}>_</Text>
            </Anim>
          </View>
        </View>
        {rows.map((r, i) => {
          const next = i === 0;
          return (
            <Anim key={r.id} k="jflip" delay={250 + i * 90} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: 'rgba(255,181,71,0.08)' }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${r.name}, seats open ${dMon(r.opens)}`} onPress={() => onOpen(r.id)} style={({ pressed }) => ({ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 9, paddingHorizontal: 14, opacity: pressed ? 0.8 : 1 })}>
                <View style={{ width: 64, flexShrink: 0 }}>
                  <Text style={{ color: next ? C.lime : AMBER, fontSize: 12, letterSpacing: 1, fontFamily: MONO }}>{ddMon(r.opens)}</Text>
                </View>
                <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: AMBER, fontSize: 12, letterSpacing: 0.5, fontFamily: MONO }}>{r.name.toUpperCase()}</Text>
                  <Text numberOfLines={1} style={{ color: 'rgba(255,181,71,0.6)', fontSize: 10, fontFamily: MONO_MED }}>{`${r.from} → ${r.to} · ${dMon(r.day)}`.toUpperCase()}</Text>
                </View>
                <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6, flexShrink: 0, backgroundColor: next ? C.lime : 'transparent', borderWidth: next ? 0 : 1, borderColor: 'rgba(255,181,71,0.4)' }}>
                  <Text numberOfLines={1} style={{ color: next ? C.ink : AMBER, fontSize: 11, fontFamily: MONO }}>{r.inDays <= 0 ? 'TODAY' : `IN ${r.inDays} D`}</Text>
                </View>
              </Pressable>
            </Anim>
          );
        })}
      </View>
    </Anim>
  );
}

/* ------------------------------------------------------------------ */
/* The journey                                                         */
/* ------------------------------------------------------------------ */

function JourneyCard({ line, japan, end, onPress }: { line: ReturnType<typeof stopsLineOf>; japan: boolean; end: string | null; onPress: () => void }) {
  const [w, onLayout] = useWidth(318);
  const stops = line.stops;
  const weights = stops.map((s) => (stops.some((x) => !x.nights) ? 1 : s.nights));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const gap = 2;
  const per = (w - gap * (stops.length - 1)) / total;
  let x = 0;
  const segs = stops.map((s, i) => {
    const seg = { s, i, x, width: Math.max(8, weights[i]! * per) };
    x += seg.width + gap;
    return seg;
  });
  const name = (s: LineStop) => (japan && s.localName ? s.localName : s.title);
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  const font = japan ? JP_SANS : `${J}700Bold`;
  const nameStyle = { color: C.white, fontSize: 15, fontFamily: japan && first.localName ? JP_SANS : `${J}800ExtraBold`, fontWeight: (japan && first.localName ? '900' : undefined) as '900' | undefined };
  return (
    <Anim k="jr" delay={470} style={{ minWidth: 0 }}>
      <Card onPress={onPress} label="The journey, every stop" gap={14}>
        <SecHead title="The journey" sub={[`${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}`, line.nights ? `${line.nights} ${line.nights === 1 ? 'night' : 'nights'}` : null, line.moves ? `${line.moves} ${line.moves === 1 ? 'move' : 'moves'}` : null].filter(Boolean).join(' · ')} right={<Pill chevron label="Every stop" onPress={onPress} />} />
        <View onLayout={onLayout} style={{ height: 50 }}>
          <Svg width={w} height={50}>
            {segs.map(({ s, i, x: sx, width }) => {
              const c = hexOf(s.color, i);
              return (
                <G key={`${s.stopId}${i}`}>
                  <Rect x={sx} y={18} width={width} height={8} rx={4} fill={c} />
                  <Circle cx={sx + 4} cy={22} r={5} fill={C.ink} stroke={c} strokeWidth={2.5} />
                </G>
              );
            })}
            {segs.map(({ s, i, x: sx }) => {
              const isLast = i === segs.length - 1 && segs.length > 1;
              return (
                <SvgText key={`t${s.stopId}${i}`} x={isLast ? w : sx} y={i % 2 ? 44 : 10} textAnchor={isLast ? 'end' : 'start'} fontFamily={font} fontSize={10} fontWeight="700" fill={C.white}>
                  {name(s)}
                </SvgText>
              );
            })}
          </Svg>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexShrink: 1 }}>
            <Mono color={C.low}>FROM</Mono>
            <Text numberOfLines={1} style={nameStyle}>
              {`${name(first)} `}
              {first.from ? <Text style={{ color: C.mid, fontSize: 12, fontFamily: `${J}600SemiBold`, fontWeight: undefined }}>{dMonTitle(first.from)}</Text> : null}
            </Text>
          </View>
          <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
            <Mono color={C.low} align="right">TO</Mono>
            <Text numberOfLines={1} style={[nameStyle, { textAlign: 'right' }]}>
              {end ? <Text style={{ color: C.mid, fontSize: 12, fontFamily: `${J}600SemiBold`, fontWeight: undefined }}>{dMonTitle(end)}</Text> : null}
              {` ${name(last)}`}
            </Text>
          </View>
        </View>
      </Card>
    </Anim>
  );
}

/* ------------------------------------------------------------------ */
/* Stays as station boards (ekimeiban)                                 */
/* ------------------------------------------------------------------ */

function Stays({ stops, japan, onOpen }: { stops: LineStop[]; japan: boolean; onOpen: (stopId: string) => void }) {
  const [page, setPage] = useState(0);
  return (
    <Anim k="jr" delay={530} style={{ gap: 10, minWidth: 0 }}>
      <SecHead title="Stays" sub={`${stops.length} ${stops.length === 1 ? 'stop' : 'stops'}, as station boards`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEventThrottle={32} onScroll={(e) => setPage(Math.min(stops.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / 140))))} style={{ marginHorizontal: -20 }} contentContainerStyle={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20 }}>
        {stops.map((s, i) => {
          const local = japan && s.localName ? s.localName : null;
          return (
            <Anim key={`${s.stopId}${i}`} k="jr" delay={200 + i * 40} style={{ width: 132, flexShrink: 0 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${s.title}, ${s.nights} nights`} onPress={() => onOpen(s.stopId)} style={({ pressed }) => ({ backgroundColor: C.white, borderRadius: 20, overflow: 'hidden', opacity: pressed ? 0.9 : 1 })}>
                <View style={{ paddingTop: 10, paddingHorizontal: 10, paddingBottom: 8 }}>
                  {local ? (
                    <>
                      <Text numberOfLines={1} style={{ color: C.ink, fontSize: [...local].length > 2 ? 17 : 22, lineHeight: 26, letterSpacing: 2, textAlign: 'center', fontFamily: JP_SANS, fontWeight: '900' }}>{local}</Text>
                      <Text numberOfLines={1} style={{ color: C.ink, fontSize: 11, textAlign: 'center', fontFamily: `${J}800ExtraBold` }}>{s.title}</Text>
                    </>
                  ) : (
                    <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: C.ink, fontSize: 17, lineHeight: 26, textAlign: 'center', fontFamily: `${J}800ExtraBold`, marginBottom: 14 }}>{s.title}</Text>
                  )}
                </View>
                <View style={{ height: 8, backgroundColor: hexOf(s.color, i) }} />
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 7, paddingHorizontal: 10, paddingBottom: 9 }}>
                  <Text style={{ color: 'rgba(11,11,13,0.62)', fontSize: 10, fontFamily: MONO }}>{s.from ? dMon(s.from) : ''}</Text>
                  <Text style={{ color: C.ink, fontSize: 10, fontFamily: MONO }}>{`${s.nights}N`}</Text>
                </View>
              </Pressable>
            </Anim>
          );
        })}
        <View style={{ width: 12, flexShrink: 0 }} />
      </ScrollView>
      {stops.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5 }}>
          {stops.map((s, i) => <View key={`${s.stopId}${i}`} style={{ width: i === page ? 18 : 5, height: 5, borderRadius: 3, backgroundColor: i === page ? C.lime : 'rgba(245,245,247,0.25)' }} />)}
        </View>
      ) : null}
    </Anim>
  );
}

/* ------------------------------------------------------------------ */
/* The map                                                             */
/* ------------------------------------------------------------------ */

type LatLng = { lat: number; lng: number };

/** Japan's main islands (central Honshu to Kyushu's edge), lon/lat in hundredths, each ring's first point whole and the rest as steps. */
function japanRings(): LatLng[][] {
  return JAPAN.split('|').map((ring) => {
    let x = 0;
    let y = 0;
    return ring.split(' ').map((p, i) => {
      const [a, b] = p.split(',').map(Number) as [number, number];
      x = i ? x + a : a;
      y = i ? y + b : b;
      return { lng: x / 100, lat: y / 100 };
    });
  });
}

/** A map label with an ink halo under it (the stroke drawn first, the fill over it). */
function Halo({ x, y, anchor = 'start', font, size, weight, fill, children }: { x: number; y: number; anchor?: 'start' | 'middle' | 'end'; font: string | undefined; size: number; weight: '500' | '700'; fill: string; children: string }) {
  return (
    <>
      <SvgText x={x} y={y} textAnchor={anchor} fontFamily={font} fontSize={size} fontWeight={weight} fill={C.ink} stroke={C.ink} strokeWidth={3} strokeLinejoin="round">
        {children}
      </SvgText>
      <SvgText x={x} y={y} textAnchor={anchor} fontFamily={font} fontSize={size} fontWeight={weight} fill={fill}>
        {children}
      </SvgText>
    </>
  );
}

function MapCard({ pins, ideas, japan, onPress }: { pins: Array<{ s: LineStop; i: number; c: LatLng | null }>; ideas: Array<{ title: string; localName: string | null; c: LatLng | null }>; japan: boolean; onPress: () => void }) {
  const [w, onLayout] = useWidth(350);
  const H = 300;
  const placed = pins.filter((p): p is { s: LineStop; i: number; c: LatLng } => !!p.c);
  const all = [...placed.map((p) => p.c), ...ideas.map((x) => x.c!)];
  const proj = useMemo(() => {
    const lats = all.map((c) => c.lat);
    const lngs = all.map((c) => c.lng);
    const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    const k = Math.cos((((la0 + la1) / 2) * Math.PI) / 180);
    const pad = { l: 30, r: 40, t: 36, b: 40 };
    const s = Math.min((w - pad.l - pad.r) / Math.max(0.05, (lo1 - lo0) * k), (H - pad.t - pad.b) / Math.max(0.05, la1 - la0));
    const ox = pad.l + (w - pad.l - pad.r - (lo1 - lo0) * k * s) / 2;
    const oy = pad.t + (H - pad.t - pad.b - (la1 - la0) * s) / 2;
    return (c: LatLng) => ({ x: ox + (c.lng - lo0) * k * s, y: oy + (la1 - c.lat) * s });
  }, [w, JSON.stringify(all)]); // eslint-disable-line react-hooks/exhaustive-deps
  const land = useMemo(() => (japan ? japanRings().map((r) => `M${r.map((c) => { const p = proj(c); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; }).join('L')}Z`) : []), [japan, proj]);
  const name = (s: { title: string; localName: string | null }) => (japan && s.localName ? s.localName : s.title);
  const font = japan ? JP_SANS : `${J}700Bold`;
  return (
    <Anim k="jr" delay={590} style={{ minWidth: 0 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open map and places" onPress={onPress} onLayout={onLayout} style={{ borderRadius: 28, overflow: 'hidden' }}>
        <View style={[bgImage('radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)'), bgSize('16px 16px'), { height: H, backgroundColor: C.ink, overflow: 'hidden' }]}>
          <Svg width={w} height={H}>
            {land.map((d, i) => <Path key={i} d={d} fill="#202028" stroke="#33333C" strokeWidth={1} strokeLinejoin="round" />)}
            {placed.slice(1).map((p, n) => {
              const a = proj(placed[n]!.c);
              const b = proj(p.c);
              return <Path key={`l${n}`} d={`M${a.x} ${a.y} L${b.x} ${b.y}`} stroke={hexOf(p.s.color, p.i)} strokeWidth={3} strokeLinecap="round" fill="none" />;
            })}
            {ideas.map((x, n) => {
              const p = proj(x.c!);
              return (
                <G key={`i${n}`}>
                  <Circle cx={p.x} cy={p.y} r={4} fill="none" stroke="rgba(245,245,247,0.45)" strokeWidth={1.5} strokeDasharray="2 2" />
                  <Halo x={p.x + 8} y={p.y + 4} font={font} size={9} weight="500" fill="rgba(245,245,247,0.45)">
                    {name(x)}
                  </Halo>
                </G>
              );
            })}
            {placed.map((p, n) => {
              const c = hexOf(p.s.color, p.i);
              const q = proj(p.c);
              const first = n === 0;
              const right = q.x > w - 70;
              const prev = n ? proj(placed[n - 1]!.c) : null;
              const crowded = !!prev && Math.hypot(prev.x - q.x, prev.y - q.y) < 24;
              return (
                <G key={`p${n}`}>
                  {first ? <Circle cx={q.x} cy={q.y} r={9} fill={c} opacity={0.5} /> : null}
                  <Circle cx={q.x} cy={q.y} r={first ? 7 : 5} fill={C.ink} stroke={c} strokeWidth={3} />
                  <Halo x={first ? q.x : right ? q.x - 10 : q.x + 10} y={first ? q.y - 12 : crowded ? q.y + 16 : q.y + 4} anchor={first ? 'middle' : right ? 'end' : 'start'} font={font} size={10} weight="700" fill={C.white}>
                    {name(p.s)}
                  </Halo>
                </G>
              );
            })}
          </Svg>
        </View>
        <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 11, backgroundColor: 'rgba(11,11,13,0.66)', borderRadius: 999 }}>
          <Ico size={13} d={['M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z', 'M15 5.764v15', 'M9 3.236v15']} />
          <Text style={{ color: C.white, fontSize: 12, lineHeight: 16, fontFamily: `${J}600SemiBold` }}>Open map and places</Text>
        </View>
        <View style={{ position: 'absolute', right: 12, bottom: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(11,11,13,0.72)', alignItems: 'center', justifyContent: 'center' }}>
          <Ico size={16} d={['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7']} />
        </View>
      </Pressable>
    </Anim>
  );
}

/* ------------------------------------------------------------------ */
/* Money left and the stamps                                           */
/* ------------------------------------------------------------------ */

function LeftEach({ budget, mine, show, onPress }: { budget: number | null; mine: { paid: number; booked: number; estimate: number; total: number }; show: (inr: number, compact?: boolean) => string; onPress: () => void }) {
  const left = budget != null ? budget - mine.total : null;
  const over = left != null && left < 0;
  const parts = [mine.paid, mine.booked, mine.estimate, left != null && left > 0 ? left : 0];
  const sum = parts.reduce((a, b) => a + b, 0) || 1;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Budget" onPress={onPress} style={({ pressed }) => ({ gap: 10, minWidth: 0, padding: 16, backgroundColor: ORANGE, borderRadius: 28, overflow: 'hidden', flexGrow: 1, flexShrink: 1, flexBasis: 0, opacity: pressed ? 0.92 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Label color={C.ink}>{left == null ? 'YOUR SHARE' : over ? 'OVER EACH' : 'LEFT EACH'}</Label>
        <View style={{ flexGrow: 1 }} />
        <Ico color={C.ink} d={['M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4']} />
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: C.ink, fontSize: 28, lineHeight: 30, letterSpacing: -1, fontFamily: `${J}700Bold`, fontVariant: ['tabular-nums'] }}>{show(left == null ? mine.total : Math.abs(left), true)}</Text>
      <View style={{ flexDirection: 'row', gap: 3, height: 8 }}>
        {parts.map((v, i) =>
          v > 0 ? (
            i < 3 ? (
              <Anim key={i} k="jbar" delay={i * 250} style={{ flexGrow: v / sum, flexShrink: 1, flexBasis: 0, backgroundColor: ['#0B0B0D', 'rgba(11,11,13,0.55)', 'rgba(11,11,13,0.3)'][i], borderRadius: 4 }} />
            ) : (
              <View key={i} style={{ flexGrow: v / sum, flexShrink: 1, flexBasis: 0, backgroundColor: 'rgba(11,11,13,0.12)', borderRadius: 4 }} />
            )
          ) : null,
        )}
      </View>
      <Text numberOfLines={2} style={{ color: 'rgba(11,11,13,0.62)', fontSize: 12, lineHeight: 15, fontFamily: `${J}700Bold`, fontVariant: ['tabular-nums'] }}>{budget != null ? `${show(mine.total, true)} of ${show(budget, true)} projected` : 'projected · no budget set'}</Text>
    </Pressable>
  );
}

function StampsCard({ stamps }: { stamps: ReturnType<typeof stampsOfTrip> }) {
  const rows: Array<typeof stamps.stops> = [];
  for (let i = 0; i < stamps.stops.length; i += 5) rows.push(stamps.stops.slice(i, i + 5));
  const first = stamps.first;
  return (
    <View style={{ gap: 10, minWidth: 0, padding: 16, backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden', flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Label>STAMPS</Label>
        <View style={{ flexGrow: 1 }} />
        <Mono color={C.white} size={11}>{`${stamps.got}/${stamps.stops.length}`}</Mono>
      </View>
      <View style={{ gap: 6 }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 4 }}>
            {row.map((s, i) => {
              const c = hexOf(s.color, r * 5 + i);
              const mark = lineMark(s, true);
              if (s.got)
                return (
                  <View key={s.stopId} style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: c, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] }}>
                    <Text style={{ color: C.ink, fontSize: 9, lineHeight: 11, fontFamily: JP_SERIF, fontWeight: '800' }}>{mark}</Text>
                  </View>
                );
              if (s.next)
                return (
                  <View key={s.stopId} style={{ width: 22, height: 22 }}>
                    <Anim k="jpulse2" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: c, borderRadius: 999 }} />
                    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: c, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: c, fontSize: 9, lineHeight: 11, fontFamily: JP_SERIF, fontWeight: '800' }}>{mark}</Text>
                    </View>
                  </View>
                );
              return (
                <View key={s.stopId} style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: 'rgba(245,245,247,0.28)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: 'rgba(245,245,247,0.24)', fontSize: 9, lineHeight: 11, fontFamily: JP_SERIF, fontWeight: '800' }}>{mark}</Text>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      {first ? (
        <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, lineHeight: 15, fontFamily: `${J}600SemiBold` }}>
          {'first: '}
          <Text style={{ color: C.white, fontFamily: first.localName ? JP_SANS : `${J}700Bold`, fontWeight: first.localName ? '600' : undefined }}>{first.localName ?? first.title}</Text>
          {first.from ? ` · ${dMonTitle(first.from)}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* On your route                                                       */
/* ------------------------------------------------------------------ */

type RouteEvent = { id: string; title: string; day: string | null; until: string | null; note: string | null; stop: { title: string; localName: string | null; color: string } | null };

function OnRoute({ events, japan, wide, onOpen }: { events: RouteEvent[]; japan: boolean; wide: string | null; onOpen: (id: string) => void }) {
  const when = (e: RouteEvent) => {
    if (!e.day) return '';
    if (!e.until || e.until === e.day) return dMon(e.day);
    return e.day.slice(5, 7) === e.until.slice(5, 7) ? `${Number(e.day.slice(8))}–${dMon(e.until)}` : `${dMon(e.day)}–${dMon(e.until)}`;
  };
  const short = (s: string | null) => {
    const x = (s ?? '').split(/[.;\n]/)[0]!.trim();
    return x && x.length <= 34 ? x : null;
  };
  return (
    <Anim k="jr" delay={770} style={{ minWidth: 0 }}>
      <Card gap={10}>
        <SecHead title="On your route" sub="what’s on while you’re there" right={<View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: C.raised, justifyContent: 'center' }}><Text style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: `${J}600SemiBold`, fontVariant: ['tabular-nums'] }}>{events.length}</Text></View>} />
        <View style={{ gap: 4 }}>
          {events.slice(0, 5).map((e) => {
            const mark = e.stop ? lineMark(e.stop, japan) : (wide ?? '•');
            const where = e.stop?.title ?? 'Everywhere';
            const note = short(e.note);
            const sub = note && note.toLowerCase() !== where.toLowerCase() ? `${where} · ${note}` : where;
            return (
              <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={e.title} onPress={() => onOpen(e.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, opacity: pressed ? 0.8 : 1 })}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: e.stop?.color ?? C.raised, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Text style={{ color: e.stop ? C.ink : C.white, fontSize: 18, fontFamily: japan && (e.stop?.localName || !e.stop) ? JP_SERIF : `${J}800ExtraBold`, fontWeight: japan && (e.stop?.localName || !e.stop) ? '800' : undefined }}>{mark}</Text>
                </View>
                <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, lineHeight: 20, letterSpacing: -0.2, fontFamily: `${J}600SemiBold` }}>{e.title}</Text>
                  <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: `${J}500Medium` }}>{sub}</Text>
                </View>
                <View style={{ flexShrink: 0 }}>
                  <Mono size={10} spacing={0.5}>{when(e)}</Mono>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </Anim>
  );
}

/* ------------------------------------------------------------------ */
/* Ready to fly                                                        */
/* ------------------------------------------------------------------ */

const SECTION_ROW: Record<string, { label: string; color: string }> = { documents: { label: 'Documents', color: '#A9C4FF' }, money: { label: 'Money', color: ORANGE }, 'to-do': { label: 'To-do', color: '#5FD08A' }, packing: { label: 'Packing', color: '#F4A8CE' } };

function ReadyCard({ ready, toFly, next, onPress }: { ready: ReturnType<typeof readyToFly>; toFly: number | null; next: { title: string; day: string } | null; onPress: () => void }) {
  const pct = Math.round(ready.share * 100);
  const extra = ready.overdue ? `${ready.overdue} overdue` : next ? `next: ${next.title}${next.day ? `, ${dMonTitle(next.day)}` : ''}` : ready.done === ready.total ? 'all done' : null;
  return (
    <Anim k="jr" delay={830} style={{ minWidth: 0 }}>
      <Card onPress={onPress} label="Ready to fly, open Prep">
        <SecHead title="Ready to fly?" sub={[`${pct}%`, extra].filter(Boolean).join(' · ')} right={<Pill chevron label="Prep" onPress={onPress} />} />
        <View style={{ height: 28 }}>
          <View style={[bgImage('repeating-linear-gradient(90deg, rgba(245,245,247,0.28) 0 1.5px, transparent 1.5px 5px)'), { position: 'absolute', height: 18, top: 5, left: 0, right: 0, borderRadius: 18 }]} />
          <Anim k="jbar" style={[bgImage('linear-gradient(90deg, #D7F55C10 0%, #D7F55CAA 45%, #D7F55C 100%)'), { position: 'absolute', width: `${Math.max(6, pct)}%`, height: 18, top: 5, left: 0, borderRadius: 18, boxShadow: '0 0 18px #D7F55C88, 0 0 4px #D7F55C' }]} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ico size={13} color={C.lime} d={['m3 17 2 2 4-4', 'm3 7 2 2 4-4', 'M13 6h8', 'M13 12h8', 'M13 18h8']} />
            <Text style={{ color: C.mid, fontSize: 12, fontFamily: `${J}700Bold`, fontVariant: ['tabular-nums'] }}>{`${ready.done} done`}</Text>
          </View>
          {ready.overdue || ready.dueToday ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Alert size={13} color="#FF8A7A" />
              <Text style={{ color: C.mid, fontSize: 12, fontFamily: `${J}700Bold`, fontVariant: ['tabular-nums'] }}>{ready.overdue ? `${ready.overdue} overdue` : `${ready.dueToday} due today`}</Text>
            </View>
          ) : null}
          {toFly != null && toFly >= 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ico size={13} color={C.mid} d={CAL}>
                <Rect width={18} height={18} x={3} y={4} rx={2} />
              </Ico>
              <Text style={{ color: C.mid, fontSize: 12, fontFamily: `${J}700Bold`, fontVariant: ['tabular-nums'] }}>{`${toFly} ${toFly === 1 ? 'day' : 'days'}`}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ gap: 2 }}>
          {ready.bySection.map((s) => {
            const row = SECTION_ROW[s.section] ?? { label: s.section.replace(/^\w/, (c) => c.toUpperCase()), color: AMBER };
            const segs = Math.max(1, Math.min(s.total, 24));
            const lit = Math.round((s.done / Math.max(1, s.total)) * segs);
            return (
              <View key={s.section} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 28 }}>
                <View style={{ width: 96, flexShrink: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.white, fontSize: 14, fontFamily: `${J}600SemiBold` }}>{row.label}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 2, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
                  {Array.from({ length: segs }, (_, i) => (
                    <Anim key={i} k="jr" delay={200 + i * 20} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 8, borderRadius: 2, backgroundColor: i < lit ? row.color : C.raised }} />
                  ))}
                </View>
                <View style={{ width: 34, flexShrink: 0 }}>
                  <Mono size={11} spacing={0.5} align="right">{`${s.done}/${s.total}`}</Mono>
                </View>
              </View>
            );
          })}
        </View>
      </Card>
    </Anim>
  );
}

/** Central and western Japan's coast (from the JP-Overview artboard's map), simplified: see japanRings. */
const JAPAN =
  '14093,3794 -7,-1 -1,-10 -7,1 2,-3 -7,1 -4,3 0,8 -12,3 -8,-2 -1,5 -7,3 -9,-2 -4,2 0,8 9,0 5,5 51,0|14027,3796 -1,-9 4,-3 -6,-6 -12,-1 -7,4 -6,-2 -6,8 -12,-3 -3,3 -4,-1 -8,4 -3,6 3,12 3,2 -1,5 74,0 -5,-5 -9,0|13944,3696 -5,-4 -16,3 2,23 -8,8 6,11 -3,7 2,3 18,2 3,5 16,0 -4,14 8,4 3,7 8,6 -3,4 -3,-1 13,-4 12,3 6,-8 6,2 7,-4 12,1 6,6 -4,3 2,15 7,-3 6,3 7,-3 1,-5 8,2 9,-2 3,-1 0,-8 4,-3 7,-1 -2,3 7,-1 1,10 4,1 9,-8 5,-35 -6,-50 -5,-6 -11,-3 -3,-5 -17,5 -3,4 -2,-3 2,-5 -13,-8 -22,16 1,8 -5,0 -6,8 -18,5 -9,-1 -5,-3 0,-3 -15,-3|14021,3586 -6,-2 -21,10 -15,16 -6,-1 -4,11 13,4 3,7 6,-1 6,8 22,3 7,11 -4,17 7,3 -3,5 0,18 20,-15 13,8 -2,5 2,3 3,-4 17,-5 2,-3 -6,-5 -3,-12 -11,-18 2,-11 -7,-12 5,-17 9,-15 -4,-1 2,-4 1,-1 -1,3 3,1 14,-18 -10,4 -24,18 -1,-6 -4,2 -14,-6|13972,3621 -6,0 -4,6 -16,0 -9,10 7,10 0,8 4,4 -15,5 4,11 -2,3 6,6 -6,2 1,3 10,9 32,13 4,-1 0,3 5,3 9,1 18,-5 6,-8 5,0 1,-27 3,-5 -7,-3 4,-17 -7,-12 -6,2 -16,-4 -6,-8 -6,1 -3,-7|13883,3604 -8,-1 -4,-5 -8,5 1,9 -6,5 6,0 -4,11 5,2 0,11 -19,0 -6,3 0,9 6,11 7,2 -2,4 22,7 6,-2 4,3 -1,5 11,1 -1,5 6,1 -1,9 8,1 5,7 14,-13 15,-2 -4,-6 6,-2 -6,-6 2,-3 -4,-11 15,-5 -4,-4 0,-8 -7,-10 9,-10 16,0 5,-6 -4,-2 -4,2 -13,-2 -10,6 -4,-2 -19,5 -9,-15 -8,-1|13959,3578 -7,-2 2,4 -15,-4 -10,7 -27,7 -13,-6 -16,6 -2,8 4,5 8,1 13,8 8,1 9,15 19,-5 4,2 10,-6 13,2 4,-2 3,3 7,-13 5,0 4,-6 8,-17 -1,-8 -12,3 -3,-3 -8,2 -4,-4|13982,3493 -7,4 10,2 0,3 -4,2 3,4 -2,9 5,6 -3,6 -6,2 6,2 1,4 5,-2 1,8 11,3 4,8 4,-1 2,2 -3,1 4,0 -4,1 3,2 -13,6 -1,4 -5,-2 1,-3 -7,-2 5,7 -4,7 2,10 -12,24 16,-16 22,-10 16,2 14,6 4,-2 1,6 24,-18 11,-4 1,-5 -4,2 -17,-3 -17,-12 -9,-15 2,-11 -3,-10 -6,-6 -21,-3 -14,-10 -5,-10 -9,-1|13945,3561 6,-4 -4,0 1,-7 -8,8 -16,2 -2,4 -19,8 -8,15 7,3 26,-6 11,-8 15,4 -2,-4 3,-1 11,5 8,-2 3,3 10,-2 5,-10 -4,-5 -8,-2 -3,3 -3,-6 5,-2 0,-5 -9,1 -3,6 -14,5 -3,-4|13948,3406 2,7 6,-2 -3,-6|13940,3468 -5,4 1,8 9,-6 -1,-6|13984,3307 -9,6 0,5 10,-4|13914,3516 2,-2 -13,1 -5,8 4,10 -2,6 -8,1 2,4 17,9 2,14 12,-7 15,-2 7,-8 0,7 4,0 -6,4 5,-1 3,4 14,-5 3,-6 10,-2 -5,2 2,-2 -14,-5 6,-2 -7,-5 4,-2 0,-3 -4,-1 4,-1 -3,-3 12,-4 -3,-1 1,-3 -7,-3 2,-5 -7,1 -1,5 3,2 -6,8 -13,2 -23,-4 -6,-3|13892,3688 1,-4 -11,-1 1,-5 -4,-3 -6,2 -3,-2 -3,4 2,8 -10,6 0,7 -7,5 -13,-4 -5,-8 -4,0 -1,-7 -8,2 -10,-2 -6,-5 -5,3 3,5 -2,3 -14,1 1,-5 -12,-10 -5,18 -8,3 28,9 19,11 15,1 29,19 21,24 7,20 25,16 16,5 14,11 31,0 1,-5 -3,-2 -3,-15 11,-8 -8,-6 -3,-7 -8,-4 4,-14 -16,0 -3,-5 -18,-2 -2,-3 3,-7 -6,-11 8,-8 -1,-23 -6,3 -8,9 -5,-7 -8,-1 1,-9|13825,3784 -4,2 6,3 1,7 6,5 -4,4 -4,-4 -3,1 2,12 19,1 4,-4 9,1 -7,-16 -14,-9|13708,3639 -11,-11 -2,7 -8,-1 0,3 -4,-6 -4,-1 2,6 -4,7 3,2 2,11 -4,7 4,5 -3,5 6,4 5,17 14,4 -6,-10 3,-3 10,-8 19,0 9,5 4,12 20,5 8,-3 5,-18 -1,-18 -6,-3 2,-5 -6,-2 -2,-7 -7,-4 -5,4 -10,0 -2,3 -8,-3 0,4 -10,-4 -5,3|13646,3614 -12,3 -1,6 -9,7 18,12 15,17 18,26 2,17 -5,5 1,8 -6,2 6,14 -1,4 12,7 8,0 23,11 18,3 3,-8 -10,-2 -1,-13 -10,0 -14,-13 -6,4 1,1 -4,0 -5,-9 3,-1 -4,-6 8,1 3,-4 9,6 0,-14 -16,-4 -5,-17 -6,-4 3,-5 -4,-6 4,-6 -5,-13 4,-7 -2,-6 6,-5 -8,-9 -2,-7 -9,-2 -10,8|13694,3713 -4,4 2,-2 5,2 4,-2 3,4 1,-2 -3,-4 -7,-2|13579,3538 -9,-4 -17,4 -8,14 6,3 0,-5 5,-1 10,5 -3,-6 -5,1 14,-1 4,5 -4,-1 -3,3 2,1 9,-4 3,1 -3,4 4,-1 2,3 -5,5 6,-4 11,3 -3,9 7,4 1,-8 4,-2 3,11 -11,12 -3,9 15,23 2,-2 -1,6 12,5 9,-7 3,-6 5,0 5,-3 9,1 11,-8 9,2 -2,-10 6,-4 4,-9 -4,-6 -27,-1 -1,-4 -13,4 -5,-2 -5,-12 -13,4 2,-13 -6,2 -1,-6 -7,1 -5,-5 -4,4 -5,-12 -8,1|13853,3533 -2,-2 2,-11 -4,-4 -9,4 -4,11 -8,-1 -5,7 4,14 -9,20 6,4 -5,4 5,9 4,-2 9,11 7,-2 3,-6 12,3 2,-5 7,0 5,4 16,-7 5,1 9,-13 10,-5 -2,-14 -17,-9 -2,-4 -24,-5 -2,4 -5,0 -3,5 -5,-3|13764,3520 -6,-1 -3,6 1,6 4,2 -2,7 5,0 -4,4 4,3 0,3 -12,10 3,5 -8,11 -13,5 5,8 10,0 11,12 2,7 -6,3 0,3 4,3 -2,5 8,9 -6,8 8,12 4,1 -2,5 6,3 0,16 13,12 -1,5 14,-1 2,-3 -3,-5 5,-3 6,5 10,2 6,-3 3,8 4,0 5,8 18,3 2,-11 10,-7 -2,-7 3,-4 -16,-4 -3,-1 2,-4 -7,-2 -6,-11 0,-9 6,-3 19,0 0,-11 -5,-2 4,-11 -6,0 6,-5 -1,-9 8,-5 2,-7 -11,-4 -3,5 -14,-2 0,4 -8,3 -9,-11 -4,2 -5,-9 5,-4 -6,-4 4,-7 -1,-4 -7,-5 2,-8 -4,-3 2,-7 -25,-12 -2,-4 -9,-1 -10,3|13667,3518 0,-5 -2,3 -3,-1 -9,10 -9,-4 -6,3 3,13 3,2 -5,9 1,5 -3,3 -5,-2 0,7 -4,2 5,14 5,2 13,-4 1,4 27,1 4,6 -4,9 -6,4 0,6 3,2 1,9 8,9 -6,5 4,1 4,6 0,-3 8,1 2,-7 19,18 5,-3 10,4 0,-4 8,3 2,-3 18,-4 6,-8 -8,-9 2,-5 -4,-3 0,-3 6,-3 -2,-7 -11,-12 -10,0 -5,-8 13,-5 8,-11 -3,-5 12,-10 0,-3 -4,-3 4,-5 -5,1 2,-7 -17,-11 -12,7 -12,-4 -3,3 -8,1 -3,7 -8,6 -14,-7 -6,1 -9,-12|13821,3461 -25,5 -16,-2 -32,3 0,7 2,9 9,2 12,12 1,6 11,12 -3,3 3,3 31,16 -2,7 4,3 -2,8 5,2 1,6 3,0 4,-12 -4,-14 2,-4 4,-3 7,1 4,-11 4,-3 5,-1 4,4 -2,11 2,10 5,3 3,-5 5,0 2,-4 32,4 2,-6 -4,-10 5,-8 8,-1 -4,-9 3,-1 0,-7 5,-4 -10,-16 -5,-3 -1,-8 -4,1 -11,-7 -10,9 4,6 -3,7 3,3 -2,3 3,2 -3,6 2,5 11,0 2,3 -8,6 -15,4 -12,-4 -7,-7 1,-5 0,3 3,0 -2,-3 -15,-7 -6,-14 -8,-6 -3,-6|13696,3473 1,-4 -4,1 -9,6 3,7 -5,5 0,8 5,4 2,9 -2,0 -2,-6 0,5 -3,0 2,-5 -4,2 -1,-4 -12,12 1,11 9,12 6,-1 16,7 -1,-2 7,-4 3,-7 8,-1 3,-3 12,4 12,-7 14,6 -2,-3 3,-6 10,4 16,-2 -4,-3 3,-3 -4,-2 1,-3 -8,-7 -1,-6 -7,-8 -15,-8 -1,-14 -46,-9 5,8 5,-3 16,10 0,-5 3,0 0,4 4,1 -3,0 1,5 -3,3 -8,1 -5,-6 0,2 -14,-1 -8,5 3,14 -7,-19|13601,3373 -7,2 -8,8 -1,4 5,1 -1,5 12,4 1,7 8,-1 -1,17 4,5 -4,5 4,2 -6,7 3,5 11,1 2,4 -1,4 -5,-1 -1,4 -5,-2 -6,4 2,5 -3,3 5,1 -7,12 7,2 4,5 -5,1 3,3 14,-5 12,5 7,16 1,10 -4,2 0,3 12,4 9,-10 3,1 10,-8 2,-6 -12,-3 -2,-4 4,-2 -14,-18 -1,-7 4,-1 -3,-6 11,-2 18,-11 1,3 5,-4 0,-4 4,2 -1,-7 -10,-1 5,-3 5,3 -3,-3 2,-6 -5,-3 -8,1 9,1 -3,0 4,2 -4,1 2,1 -4,2 -2,-4 -3,3 0,-3 -7,0 4,5 -7,1 1,-2 -3,-2 4,1 -8,-6 -3,2 2,2 -4,-2 0,-3 -5,3 2,-4 -4,0 3,-1 -3,-1 -1,4 -3,-1 1,-3 -13,-2 -4,-3 1,-5 3,0 -2,-3 -5,1 2,3 -7,-5 8,-5 -4,-1 3,-4 -6,3 -2,-3 4,-3 -5,-3 -3,2 0,-4 -6,-2|13642,3500 -5,-10 -12,-5 -14,5 -3,-3 5,-1 -4,-5 -6,-2 -3,5 -5,1 -1,4 -4,-2 -3,2 1,5 -5,5 -2,5 5,12 -3,6 3,6 -3,-1 -6,8 4,6 8,-1 5,12 4,-4 5,5 7,-1 1,6 6,-2 -2,13 13,-3 1,-4 3,-1 0,-7 5,2 3,-3 -1,-5 5,-9 -3,-2 -3,-13 7,-8|13574,3480 -10,13 -4,-1 1,5 -4,0 -1,-4 2,-1 -4,-1 -6,4 1,4 -11,2 1,11 -11,2 -1,3 -8,0 -3,9 -9,-3 -14,8 0,9 6,-2 6,2 -1,10 0,4 -11,-3 -8,7 2,7 6,0 16,9 13,4 9,-9 -12,-12 0,-4 6,7 2,-4 -3,-3 9,-2 -1,-6 3,4 5,-2 0,4 -6,-1 0,5 12,5 -1,-4 4,-1 -4,-3 2,-2 -1,-4 7,-4 0,-4 24,-3 6,-8 3,1 -3,-6 3,-6 -5,-12 2,-5 5,-5 -1,-5 3,-2 4,2 1,-4 5,-1 6,-10 -3,-4 -11,5 -3,-4 -4,-1 -9,3 -3,4|13520,3429 -9,-2 -2,5 13,3 13,10 3,8 1,-3 5,5 -4,5 2,-3 5,1 -5,1 3,5 -4,1 1,4 -2,0 6,4 -4,9 2,7 -2,2 5,2 -13,3 1,6 -2,1 3,2 2,-4 11,-2 -1,-4 6,-4 4,1 -2,1 1,4 4,0 -1,-5 4,1 11,-13 -4,-2 -6,-17 3,-3 -3,-4 3,-5 0,-9 -17,-6 -3,2|13445,3476 -4,-3 -5,2 -4,-3 0,8 -7,5 4,5 -4,4 4,5 -2,3 5,2 5,10 4,1 -3,6 13,6 0,8 -4,2 1,5 -4,2 -3,7 1,5 -5,5 17,6 8,-3 4,2 20,0 -1,-8 8,-7 11,3 1,-14 -6,-2 -6,2 -1,-9 15,-8 9,3 5,-10 6,1 1,-3 11,-2 1,-5 -7,-4 2,-1 -1,-6 13,-3 -5,-2 2,-2 -2,-7 4,-7 -1,-3 -7,-5 2,3 -3,-2 -3,4 -5,0 -11,-4 0,-3 -12,-3 -23,8 -9,7 -8,2 -9,-3 -4,2 -6,-3 0,6|13481,3421 -8,-2 -3,3 2,4 -6,-2 -1,6 8,3 7,12 20,16 3,-3 -14,-16 0,-7 6,-8|13593,3399 -4,-4 2,-2 -5,0 1,-6 -6,4 -19,-3 -2,4 4,8 -10,8 11,14 8,1 -6,5 -2,10 4,7 -4,9 3,4 -3,3 6,17 5,-5 9,-3 4,1 3,4 9,-4 5,3 3,-7 -5,-1 3,-3 -2,-5 6,-4 5,2 1,-4 5,1 1,-4 -2,-4 -11,-1 -3,-5 6,-7 -4,-2 4,-5 -4,-5 1,-17 -8,1|13519,3383 -5,6 -8,0 1,5 4,3 -4,1 10,6 -9,4 4,4 2,0 -2,2 9,2 -15,11 1,4 8,-3 6,3 8,-1 5,4 14,2 3,-2 14,4 2,-10 6,-5 -8,-1 -10,-12 -1,-2 10,-9 -4,-8 2,-3 7,3 16,-1 1,-7 8,-8 7,-2 -3,-7 -4,-1 1,-2 -2,-1 3,-3 -16,-8 0,-5 -4,-1 0,5 -31,6 -6,4 0,5 -6,3 7,5|13596,3399 4,3 1,-5 -3,0 -1,-3 -7,-1 1,5|13360,3534 -4,-10 -6,-2 2,-4 -12,0 0,-7 -10,-1 -3,-5 -13,2 1,7 4,3 -4,4 16,5 -2,6 3,8 -10,8 -2,4 3,3 3,0 -2,-2 5,-5 10,-3 18,8 20,-3 24,3 7,-1 17,3 12,6 5,-5 -1,-5 3,-7 4,-2 -1,-5 4,-2 0,-8 -5,-4 -7,2 -7,-5 -6,1 -9,-4 -3,10 -13,3 0,5 -8,-2 -10,-9 -9,8|13204,3446 -5,-5 2,-4 -5,-6 -4,3 -10,-4 -6,7 3,7 -9,0 -3,6 6,8 -4,10 15,3 2,4 8,4 7,7 4,1 6,8 20,10 11,14 21,9 4,9 -4,6 12,1 -2,3 13,4 10,0 1,3 13,3 -1,3 6,-4 17,0 -12,-3 2,-5 10,-8 -3,-8 2,-6 -16,-5 4,-4 -4,-3 -1,-7 -27,3 -12,-14 -12,-6 7,-2 0,-4 -9,0 -7,-5 -11,3 -3,-4 -16,2 -2,-5 -9,-4 3,-3 -4,-10 -7,-5 -1,-3 3,-3|13300,3604 -5,2 3,5 11,3 -5,-3 0,-5 -4,5 -2,-3|13325,3618 -7,3 0,8 10,6 10,-8 -1,-6 -3,-1 0,2 -3,-2 3,-3|13354,3446 -5,5 4,-6 -8,1 0,9 -7,7 2,5 -4,6 2,7 -9,10 3,10 -5,5 2,5 11,1 1,7 11,0 -2,4 6,2 4,10 14,-2 9,-8 10,9 8,2 0,-5 13,-3 3,-10 23,7 -2,-4 3,-6 -4,0 -5,-10 -5,-2 2,-3 -4,-5 4,-4 -4,-5 7,-5 0,-8 -14,2 6,-4 -12,-11 -18,1 11,-2 -5,-7 -4,1 -3,-7 -10,2 -2,-1 1,-3 -3,1 -5,8 -2,-2 2,-3 -4,1 0,6 -2,-3 -2,1|13256,3409 -11,1 5,4 3,6 3,-2 -4,-2 4,-1 -2,-4 5,1|13244,3415 1,4 -2,-1 -6,8 5,0 5,-5 0,4 -4,1 0,3 5,1 1,-15 -6,-2|13222,3424 2,-3 -3,0 -1,2 -6,1 -1,9 -6,3 1,8 -4,6 8,8 4,10 -3,3 9,4 2,5 16,-2 3,4 11,-3 7,5 9,0 0,4 -7,2 12,6 14,14 6,-3 4,3 4,-4 22,1 7,-7 -2,-11 8,-9 -2,-7 4,-6 -2,-5 7,-9 -1,-8 -3,3 3,-4 -5,-2 -2,-5 -12,2 2,2 -2,3 -2,-3 -15,-1 0,-5 -4,-2 -13,1 -6,-5 -4,3 -3,-4 -3,0 1,-4 -12,-4 -4,3 -6,-3 2,4 -5,2 -2,8 4,2 -15,0|13150,3453 6,8 4,1 0,4 5,-2 4,4 4,-10 -6,-8 3,-6 9,0 -3,-7 6,-7 10,4 4,-3 5,6 -1,6 7,4 0,-11 6,-3 1,-9 11,-3 0,-6 -5,-3 1,-11 -3,-4 -6,-1 4,-11 -4,-1 0,4 -6,5 -9,-1 -11,9 -7,-2 2,-2 -5,1 6,5 -4,1 2,2 -5,-1 -1,3 -13,-5 -2,2 -8,-4|13220,3389 -3,5 4,3 7,-1 5,-5 8,5 6,-1 -10,-3 0,-5 -4,0 1,2 -6,2 0,-3 -7,-1|13440,3367 -7,-7 3,-1 -5,0 0,-3 -12,2 -4,6 3,2 -1,3 -11,1 -3,14 -7,0 -5,-4 -7,5 -18,3 2,14 17,9 9,1 6,-4 5,4 7,0 5,6 18,1 7,-3 2,5 15,3 -1,-3 6,-3 -5,-16 2,-3 2,3 8,-9 -8,-6 12,-3|13371,3402 -11,3 3,3 2,12 -9,6 11,-1 0,-3 16,10 -1,3 4,1 -3,-3 5,1 2,4 18,-3 1,4 3,-3 2,4 2,-7 5,4 6,-3 -1,-6 12,-2 6,-5 -3,-5 -6,3 -18,-1 -5,-6 -7,0 -5,-4 -6,4 -9,-1|13435,3456 -1,-13 -6,2 3,1 -1,2 -7,-6 0,6 -9,-1 4,2 -2,1 1,3|13237,3348 -7,1 -15,-10 -5,-1 1,3 -10,-5 11,8 4,-1 0,3 10,1 0,2 16,7 6,7 17,8 5,6 -2,5 4,5 -2,2 5,3 1,8 16,7 1,4 -4,1 5,3 18,-22 20,7 19,-2 9,7 8,-4 1,-9 -3,-3 -11,0 -5,-5 -22,0 -4,-5 -5,1 -7,-13 -4,0 -3,-8 1,-3 -5,-6 -20,-2 9,-14 -11,-5 -2,-6 -8,-7 -7,4 7,-20 -4,-5 -5,-1 0,4 -9,0 -1,-3 3,-1 -4,-1 -3,4 4,1 -3,2 3,1 -1,-2 6,0 -7,5 0,4 -7,0 0,-3 -3,0 3,5 7,-2 -3,7 5,0 -6,1 -1,3 3,0 -6,4 6,0 2,-4 3,0 -2,3 2,1 5,1 -4,3 2,2 -7,-1 5,5 -15,1 5,3 0,3 -4,-2 0,2 3,6 -3,0 4,2|13302,3413 1,7 8,-2 -8,-7|13294,3421 5,2 -3,4 2,2 4,1 4,-4 -1,-4|13301,3293 -30,0 0,3 -6,-1 4,5 -3,13 -5,6 2,2 6,-5 8,7 2,6 10,4 -8,15 20,2 5,6 -1,3 3,8 4,0 7,13 5,-1 4,5 22,0 6,5 28,-4 7,-5 7,5 5,-1 3,-5 0,-9 11,-1 1,-3 -3,-2 4,-6 12,-1 -10,-16 -3,-15 -25,24 -20,5 -17,-3 0,5 -1,-4 2,-2 -22,-8 7,3 4,-2 -12,-2 -2,-5 -3,5 -6,-8 3,-1 -2,-1 2,-4 -5,-8 1,-2 -5,-1 -8,-12 -8,-1|13200,3309 -7,-1 -4,-6 7,-5 4,2 0,-3 8,1 -7,-3 -51,-1 0,41 1,-5 8,-2 9,3 8,-4 14,3 -10,-14 10,1 -4,-6 7,-1 1,3 3,-3 3,3|13150,3338 0,30 8,2 8,-2 8,-11 0,-9 -4,-6 -7,2 2,-4 -6,-3';
