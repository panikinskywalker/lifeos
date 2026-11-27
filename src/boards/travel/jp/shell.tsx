import React, { createContext, useContext, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, Text, View, type ScrollViewProps } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ObjectRecord } from '@core/domain/types';
import type { TripData } from '@modules/travel';
import { Anim, JP_SANS, JP_SERIF, MONO } from './kit';

/**
 * Every trip screen's frame, as the *Trip template · Noir (Japan)* artboards
 * draw it (JP-Parts 01 to 03): the trip header (back to Travel, the trip and
 * its name in the place's script, search, the ₹ / local currency switch), the
 * stage stepper, and the trip bar (Overview · Plan · Bookings · Money · Prep
 * and the copilot button where Dump sits).
 */

export const C = {
  ink: '#0B0B0D',
  white: '#F5F5F7',
  tile: '#1A1A1E',
  raised: '#26262B',
  lime: '#D7F55C',
  coral: '#FF6B7A',
  vermilion: '#E8553A',
  amber: '#F6B547',
  mid: 'rgba(245,245,247,0.62)',
  low: 'rgba(245,245,247,0.42)',
  line: 'rgba(255,255,255,0.08)',
} as const;

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

const mod = (page: string, params: Record<string, string | undefined>) => ({ pathname: '/module/[id]/[page]', params: Object.fromEntries(Object.entries({ id: 'travel', page, ...params }).filter(([, v]) => v != null)) }) as never;
export const tripRoutes = {
  travel: '/module/travel/index' as never,
  overview: (tripId: string) => `/entity/trip/${tripId}` as never,
  plan: (tripId: string, view?: 'line' | 'days' | 'map') => mod('plan', { trip: tripId, view }),
  bookings: (tripId: string) => mod('bookings', { trip: tripId }),
  booking: (eventId: string) => mod('booking', { event: eventId }),
  stay: (eventId: string) => mod('stay', { event: eventId }),
  money: (tripId: string, tab?: 'budget' | 'settle') => mod('money', { trip: tripId, tab }),
  spend: (tripId: string) => mod('spend', { trip: tripId }),
  receipt: (tripId: string) => mod('receipt', { trip: tripId }),
  payback: (tripId: string, from?: string, to?: string, amount?: number) => mod('payback', { trip: tripId, from, to, amount: amount != null ? String(Math.round(amount)) : undefined }),
  bill: (billId: string) => mod('bill', { bill: billId }),
  prep: (tripId: string, tab?: 'checklist' | 'packing' | 'docs') => mod('prep', { trip: tripId, tab }),
  day: (tripId: string, day: string, tab?: string) => mod('day', { trip: tripId, day, tab }),
  stop: (stopId: string) => `/entity/stop/${stopId}` as never,
  search: (tripId: string) => mod('search', { trip: tripId }),
  copilot: (tripId: string, ask?: string) => mod('copilot', { trip: tripId, ask }),
  listen: (tripId: string) => mod('listen', { trip: tripId }),
  viewOnly: (tripId: string) => mod('viewonly', { trip: tripId }),
  import: '/module/travel/import' as never,
};

/* ------------------------------------------------------------------ */
/* ₹ / local currency switch (shared by every trip screen)             */
/* ------------------------------------------------------------------ */

let unit: 'inr' | 'local' = 'inr';
const subs = new Set<() => void>();
export function setMoneyUnit(u: 'inr' | 'local') {
  unit = u;
  subs.forEach((f) => f());
}
/** 'inr' or 'local': which currency the trip screens show money in. */
export function useMoneyUnit(): 'inr' | 'local' {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    () => unit,
    () => unit,
  );
}

const SYM: Record<string, string> = { JPY: '¥', INR: '₹', USD: '$', EUR: '€', GBP: '£', THB: '฿', SGD: 'S$', AED: 'AED ' };
export const symOf = (cur?: string) => SYM[cur ?? 'INR'] ?? `${cur} `;

/** ₹2,35,500 (or ¥ when asked); compact gives ₹2.36L / ₹61.5k / ¥39,100. */
export function money(n: number, cur = 'INR', compact = false): string {
  const s = symOf(cur);
  const neg = n < 0 ? '−' : '';
  const a = Math.abs(n);
  if (compact && cur === 'INR') {
    if (a >= 100000) return `${neg}${s}${(a / 100000).toFixed(a >= 1000000 ? 1 : 2).replace(/\.?0+$/, '')}L`;
    if (a >= 1000) return `${neg}${s}${(a / 1000).toFixed(a >= 10000 ? 1 : 1).replace(/\.0$/, '')}k`;
  }
  if (compact && a >= 1000000) return `${neg}${s}${(a / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  return `${neg}${s}${Math.round(a).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US')}`;
}

/** A ₹ amount shown in the unit the switch says, using the trip's rate. */
export function useShow(trip: ObjectRecord<TripData> | null | undefined) {
  const u = useMoneyUnit();
  const local = trip?.data.localCurrency && trip.data.localCurrency !== 'INR' ? trip.data.localCurrency : null;
  const rate = trip?.data.fxRate;
  return (inr: number, compact = false) => (u === 'local' && local && rate ? money(inr / rate, local, compact) : money(inr, 'INR', compact));
}

/* ------------------------------------------------------------------ */
/* The trip's character: its name in the place's script                */
/* ------------------------------------------------------------------ */

const SCRIPT: Array<[RegExp, string]> = [
  [/japan/i, '日本'], [/tokyo/i, '東京'], [/kyoto/i, '京都'], [/osaka/i, '大阪'],
  [/korea|seoul/i, '한국'], [/china|beijing|shanghai/i, '中国'], [/thailand|bangkok/i, 'ไทย'], [/taiwan|taipei/i, '台灣'],
];
/** The destination in its own script (日本 for Japan), or null. */
export function scriptName(trip: Pick<ObjectRecord<TripData>, 'title' | 'data'>): string | null {
  const hay = `${trip.data.destination ?? ''} ${trip.title}`;
  return SCRIPT.find(([re]) => re.test(hay))?.[1] ?? null;
}
export const isJapan = (trip: Pick<ObjectRecord<TripData>, 'title' | 'data'>) => trip.data.look === 'japan' || /japan/i.test(`${trip.data.destination ?? ''} ${trip.title}`);

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

const Icon = ({ d, size = 18, color = C.white, children }: { d?: string[]; size?: number; color?: string; children?: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {d?.map((x) => <Path key={x} d={x} />)}
    {children}
  </Svg>
);

export function RoundButton({ label, onPress, children, size = 44, bg = C.raised }: { label: string; onPress?: () => void; children: React.ReactNode; size?: number; bg?: string }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      {children}
    </Pressable>
  );
}

/** The trip header: back to Travel, a mono label over the trip's name, search and ₹ / local. */
export function TripHeader({ trip, label, onBack, dot = C.vermilion, viewOnly }: { trip: ObjectRecord<TripData>; label: string; onBack?: () => void; dot?: string; viewOnly?: boolean }) {
  const router = useRouter();
  const u = useMoneyUnit();
  const local = trip.data.localCurrency && trip.data.localCurrency !== 'INR' ? trip.data.localCurrency : null;
  const script = scriptName(trip);
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace(tripRoutes.travel)));
  return (
    <Anim k="jr" delay={50} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 12, paddingBottom: 2 }}>
      <RoundButton label="Back" onPress={back}>
        <Icon d={['m12 19-7-7 7-7', 'M19 12H5']} />
      </RoundButton>
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
          <Text numberOfLines={1} style={{ flexShrink: 1, color: C.mid, fontSize: 10, letterSpacing: 1.5, fontFamily: MONO }}>{label.toUpperCase()}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, color: C.white, fontSize: 22, lineHeight: 26, letterSpacing: -0.4, fontFamily: 'PlusJakartaSans_700Bold' }}>{trip.data.destination || trip.title}</Text>
          {script ? <Text style={{ marginLeft: 4, color: C.mid, fontSize: 13, fontFamily: JP_SANS, fontWeight: '700' }}>{script}</Text> : null}
        </View>
      </View>
      {viewOnly ? null : (
        <RoundButton label="Search the trip" onPress={() => router.push(tripRoutes.search(trip.id))}>
          <Icon d={['m21 21-4.3-4.3']}>
            <Circle cx={11} cy={11} r={8} />
          </Icon>
        </RoundButton>
      )}
      {local ? (
        <View style={{ flexDirection: 'row', padding: 3, backgroundColor: C.raised, borderRadius: 999, flexShrink: 0 }}>
          {(['inr', 'local'] as const).map((x) => (
            <Pressable key={x} accessibilityRole="button" accessibilityLabel={x === 'inr' ? 'Show rupees' : `Show ${local}`} accessibilityState={{ selected: u === x }} onPress={() => setMoneyUnit(x)} style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: u === x ? C.white : 'transparent' }}>
              <Text style={{ color: u === x ? C.ink : C.mid, fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold' }}>{x === 'inr' ? '₹' : symOf(local).trim()}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Anim>
  );
}

/* ------------------------------------------------------------------ */
/* Stage stepper                                                       */
/* ------------------------------------------------------------------ */

export const STAGES = ['plan', 'book', 'prep', 'travel', 'home'] as const;
export type Stage = (typeof STAGES)[number];

/** Plan · Book · Prep · Travel · Home: done ones ticked, the current one pulsing. */
export function Stepper({ stage }: { stage: Stage }) {
  const at = STAGES.indexOf(stage);
  // Each step opens the section where that work is done (they look like buttons, so they are).
  const host = useContext(TripHostContext);
  const goes: Record<Stage, { tab: Section; params?: Record<string, string> }> = { plan: { tab: 'plan' }, book: { tab: 'bookings' }, prep: { tab: 'prep' }, travel: { tab: 'plan', params: { view: 'days' } }, home: { tab: 'money', params: { tab: 'settle' } } };
  return (
    <Anim k="jr" delay={110} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {STAGES.map((s, i) => (
        <React.Fragment key={s}>
          {i ? <View style={{ flexGrow: 1, height: 2, marginTop: 10, borderRadius: 1, backgroundColor: i <= at ? C.lime : 'rgba(245,245,247,0.16)' }} /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`${s[0]!.toUpperCase()}${s.slice(1)}${i < at ? ', done' : i === at ? ', now' : ''}`} disabled={!host} onPress={() => host?.show(goes[s].tab, goes[s].params)} hitSlop={8} style={({ pressed }) => ({ alignItems: 'center', gap: 5, width: 40, flexShrink: 0, opacity: pressed ? 0.6 : 1 })}>
            {i < at ? (
              <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' }}>
                <Icon d={['M20 6 9 17l-5-5']} size={12} color={C.ink} />
              </View>
            ) : i === at ? (
              <View style={{ width: 22, height: 22 }}>
                <Anim k="jpulse2" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: C.lime, borderRadius: 999 }} />
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 2, borderColor: C.lime, borderRadius: 999, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.lime }} />
                </View>
              </View>
            ) : (
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: 'rgba(245,245,247,0.28)' }} />
            )}
            <Text style={{ color: i <= at ? C.white : C.low, fontSize: 9, letterSpacing: 1, fontFamily: MONO }}>{s.toUpperCase()}</Text>
          </Pressable>
        </React.Fragment>
      ))}
    </Anim>
  );
}

/* ------------------------------------------------------------------ */
/* Trip bar                                                            */
/* ------------------------------------------------------------------ */

export type TripTab = 'overview' | 'plan' | 'bookings' | 'money' | 'prep' | null;
const TABS: Array<{ key: Exclude<TripTab, null>; label: string; short: string; icon: React.ReactNode | ((c: string) => React.ReactNode) }> = [
  { key: 'overview', short: 'Trip', label: 'Overview', icon: (c: string) => <Icon size={21} color={c} d={['m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z']}><Circle cx={12} cy={12} r={10} /></Icon> },
  { key: 'plan', short: 'Plan', label: 'Plan', icon: (c: string) => <Icon size={21} color={c} d={['M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z', 'M15 5.764v15', 'M9 3.236v15']} /> },
  { key: 'bookings', short: 'Bookings', label: 'Bookings', icon: (c: string) => <Icon size={21} color={c} d={['M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z', 'M13 5v2', 'M13 17v2', 'M13 11v2']} /> },
  { key: 'money', short: 'Money', label: 'Money', icon: (c: string) => <Icon size={21} color={c} d={['M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4']} /> },
  { key: 'prep', short: 'Prep', label: 'Prep', icon: (c: string) => <Icon size={21} color={c} d={['m3 17 2 2 4-4', 'm3 7 2 2 4-4', 'M13 6h8', 'M13 12h8', 'M13 18h8']} /> },
];

/** The trip bar, floating at the bottom: five sections and the copilot. */
export function TripBar({ tripId, active }: { tripId: string; active: TripTab }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const host = useContext(TripHostContext);
  // Real tabs: inside the trip, a tap shows that section in place; from a stop, a day or a booking, it goes back to the trip on that section.
  const go = (k: Exclude<TripTab, null>) => {
    if (host && host.tripId === tripId) return host.show(k);
    if (k === active) return;
    goTrip(router, k === 'overview' ? tripRoutes.overview(tripId) : k === 'plan' ? tripRoutes.plan(tripId) : k === 'bookings' ? tripRoutes.bookings(tripId) : k === 'money' ? tripRoutes.money(tripId) : tripRoutes.prep(tripId));
  };
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: Math.max(20, insets.bottom + 8), paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'center', gap: 3, padding: 5, backgroundColor: C.tile, borderWidth: 1, borderColor: C.line, borderRadius: 999, boxShadow: '0 12px 30px rgba(0,0,0,0.5)' }}>
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <Pressable key={t.key} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: on }} onPress={() => go(t.key)} style={({ pressed }) => ({ width: 50, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: on ? C.lime : 'transparent', transform: [{ scale: pressed ? 0.94 : 1 }] })}>
              {typeof t.icon === 'function' ? t.icon(on ? C.ink : C.mid) : t.icon}
              {/* The word under each icon: the sections are found by name, not guessed from a glyph. */}
              <Text numberOfLines={1} style={{ color: on ? C.ink : C.mid, fontSize: 9.5, lineHeight: 12, letterSpacing: -0.1, fontFamily: 'PlusJakartaSans_700Bold' }}>{t.short}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Ask the trip copilot" onPress={() => router.push(tripRoutes.copilot(tripId))} style={({ pressed }) => ({ width: 62, height: 62, borderRadius: 31, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(215,245,92,0.25)', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <Icon size={26} color={C.ink} d={['M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z']} />
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The trip's host: the five sections as real tabs                      */
/* ------------------------------------------------------------------ */

export type Section = Exclude<TripTab, null>;
export interface TripHostApi {
  tripId: string;
  tab: Section;
  /** Show a section in place (with its own params, e.g. Money's settle tab). */
  show: (tab: Section, params?: Record<string, string>) => void;
}
export const TripHostContext = createContext<TripHostApi | null>(null);

/** The host that is on screen now (registered by the host while it has focus). */
let focusedHost: TripHostApi | null = null;
/** A section to show when the trip's host comes back on screen (set from a stop, a day, a booking). */
let pendingSection: { tripId: string; tab: Section; params?: Record<string, string> } | null = null;
let hostHref: Record<string, unknown> | null = null;
export function registerFocusedHost(api: TripHostApi | null, href?: Record<string, unknown>) {
  focusedHost = api;
  if (api && href) hostHref = { ...href, tripId: api.tripId };
}
/** The trip's host left the stack: nothing to go back to any more. */
export function forgetHost(tripId: string) {
  if (hostHref?.tripId === tripId) hostHref = null;
  if (focusedHost?.tripId === tripId) focusedHost = null;
}
export function takePendingSection(tripId: string) {
  const p = pendingSection && pendingSection.tripId === tripId ? pendingSection : null;
  pendingSection = null;
  return p;
}

const SECTION_PAGES: Record<string, Section> = { plan: 'plan', bookings: 'bookings', money: 'money', prep: 'prep' };
/** Which trip section a route is, if any. */
export function sectionOf(route: unknown): { tripId: string; tab: Section; params: Record<string, string> } | null {
  if (typeof route === 'string') {
    const m = /^\/entity\/trip\/([^/?]+)$/.exec(route);
    return m ? { tripId: m[1]!, tab: 'overview', params: {} } : null;
  }
  const r = route as { pathname?: string; params?: Record<string, string | undefined> } | null;
  const page = r?.params?.page;
  if (r?.pathname === '/module/[id]/[page]' && r.params?.id === 'travel' && page && SECTION_PAGES[page] && r.params.trip) {
    const { id: _i, page: _p, trip, ...rest } = r.params;
    return { tripId: trip, tab: SECTION_PAGES[page]!, params: Object.fromEntries(Object.entries(rest).filter(([, v]) => v != null)) as Record<string, string> };
  }
  return null;
}

/**
 * Go to a trip route the way tabs work: a section of the trip on screen is
 * shown in place; from a stop, a day or a booking over the trip, it goes back to
 * the trip on that section; anything else is pushed.
 */
export function goTrip(router: { push: (r: never) => void; navigate?: (r: never) => void; dismissTo?: (r: never) => void }, route: unknown) {
  const sec = sectionOf(route);
  if (sec && focusedHost && focusedHost.tripId === sec.tripId) return focusedHost.show(sec.tab, sec.params);
  if (sec && hostHref && hostHref.tripId === sec.tripId) {
    pendingSection = { tripId: sec.tripId, tab: sec.tab, params: sec.params };
    const { tripId: _t, ...href } = hostHref;
    if (router.dismissTo) return router.dismissTo(href as never);
    if (router.navigate) return router.navigate(href as never);
  }
  router.push(route as never);
}

/** A trip screen: the page scrolls under the header; the trip bar floats at the bottom. */
export function TripScreen({ tripId, active, children, scroll = true, bar: wantBar = true, contentGap = 12, scrollProps }: { tripId: string; active: TripTab; children: React.ReactNode; scroll?: boolean; bar?: boolean; contentGap?: number; scrollProps?: ScrollViewProps }) {
  const insets = useSafeAreaInsets();
  // Inside the trip's host the bar is the host's own, drawn once over every section.
  const host = useContext(TripHostContext);
  const inHost = !!host && host.tripId === tripId;
  const bar = wantBar && !inHost;
  const pad0 = wantBar;
  const pad = { paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: pad0 ? 130 + insets.bottom : 28 + insets.bottom, gap: contentGap };
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      {scroll ? (
        <ScrollView {...scrollProps} contentContainerStyle={pad} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
      {bar ? <TripBar tripId={tripId} active={active} /> : null}
    </View>
  );
}

/** The trip that a trip screen's `trip` param names, or null. */
export function useTripParam(params: Record<string, string>, read: (id: string) => ObjectRecord<TripData> | null) {
  return read(params.trip ?? '');
}

/* ------------------------------------------------------------------ */
/* Dot-matrix display (the platform LED board)                          */
/* ------------------------------------------------------------------ */

// 5 x 7 glyphs, rows top to bottom, '1' lit.
const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '10001', '11001', '10101', '10011', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '10001', '01010', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

/**
 * Text drawn as the platform LED board does: a 5 x 7 dot per glyph, unlit dots
 * faint. `pitch` is the dot spacing (5 in the Overview's countdown).
 */
export function DotMatrix({ text, color = C.lime, pitch = 5, dim = 0.12, label }: { text: string; color?: string; pitch?: number; dim?: number; label?: string }) {
  const chars = text.toUpperCase().split('');
  const r = pitch * 0.36;
  const cols = chars.length * 6 - 1;
  const w = cols * pitch;
  const h = 7 * pitch;
  return (
    <View accessible accessibilityLabel={label ?? text} style={{ width: w, height: h }}>
      <Svg width={w} height={h}>
        {chars.map((ch, i) => {
          const g = GLYPHS[ch] ?? GLYPHS[' ']!;
          return g.flatMap((row, y) => row.split('').map((b, x) => <Circle key={`${i}-${x}-${y}`} cx={(i * 6 + x) * pitch + pitch / 2} cy={y * pitch + pitch / 2} r={r} fill={color} opacity={b === '1' ? 1 : ch === ' ' ? 0 : dim} />));
        })}
      </Svg>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

/** A section title with its quiet line under it (the artboards' 18 px title, 13 px sub). */
export function Head({ title, sub, right }: { title: string; sub?: string | null; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 4, marginTop: 8 }}>
      <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
        <Text style={{ color: C.white, fontSize: 18, lineHeight: 22, letterSpacing: -0.2, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: 'PlusJakartaSans_500Medium' }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}

/** A mono caps label (10 px, 1.5 tracking). */
export function Caps({ children, color = C.mid, size = 10 }: { children: React.ReactNode; color?: string; size?: number }) {
  return <Text style={{ color, fontSize: size, letterSpacing: 1.5, fontFamily: MONO, fontVariant: ['tabular-nums'] }}>{children}</Text>;
}

/** Mincho text in the place's script (station names, the hero kanji). */
export function Mincho({ children, size, color = C.white }: { children: React.ReactNode; size: number; color?: string }) {
  return <Text style={{ color, fontSize: size, lineHeight: Math.round(size * 1.1), fontFamily: JP_SERIF, fontWeight: '800' }}>{children}</Text>;
}

/** Faces: a coloured initial per person (You lime, others by order). */
export const FACE = ['#D7F55C', '#A8C8FF', '#F2A7D0', '#FFB27A', '#8FE0C0', '#C9B2FF'];
export function Faces({ names, size = 26, ring = '#1E2050' }: { names: string[]; size?: number; ring?: string }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      {names.map((n, i) => (
        <View key={`${n}${i}`} style={{ width: size, height: size, borderRadius: size / 2, marginLeft: i ? -size * 0.27 : 0, backgroundColor: FACE[i % FACE.length], borderWidth: 2, borderColor: ring, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.ink, fontSize: size * 0.36, fontFamily: 'PlusJakartaSans_700Bold' }}>{n.slice(0, 1).toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}
