import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { Sheet, useToast } from '@ui/kit';
import { addThing, markOfflineSaved, offlineSheet, searchTrip, stopsOf, tripIcs, type SearchHit, type TripData } from '@modules/travel';
import { C, tripRoutes } from './shell';
import { MONO } from './kit';

/**
 * Search the trip (JP-Search): the box with the trip's records matching as you
 * type (stops, stays, journeys, things to do, the checklist, expenses, papers),
 * then the actions (add an expense, a to-do, a thing to do; the trip to your
 * calendar; an offline copy) and the views, each a tap away. Also the trip
 * template's small icon set, shared by Prep and the copilot.
 */

/* ------------------------------------------------------------------ */
/* Icons (lucide, as the artboards draw them)                           */
/* ------------------------------------------------------------------ */

type Shape = { p?: string[]; c?: Array<[number, number, number]>; r?: Array<[number, number, number, number, number]>; l?: Array<[number, number, number, number]> };
export const ICONS = {
  search: { c: [[11, 11, 8]], p: ['m21 21-4.3-4.3'] },
  back: { p: ['m12 19-7-7 7-7', 'M19 12H5'] },
  chevron: { p: ['m9 18 6-6-6-6'] },
  chevronLeft: { p: ['m15 18-6-6 6-6'] },
  pin: { p: ['M20 10c0 4.99-5.23 9.81-7.35 11.5a1 1 0 0 1-1.3 0C9.23 19.81 4 14.99 4 10a8 8 0 0 1 16 0Z'], c: [[12, 10, 3]] },
  bed: { p: ['M2 4v16', 'M2 8h18a2 2 0 0 1 2 2v10', 'M2 17h20', 'M6 8v9'] },
  calendar: { p: ['M8 2v4', 'M16 2v4', 'M3 10h18'], r: [[3, 4, 18, 18, 2]] },
  route: { c: [[6, 19, 3], [18, 5, 3]], p: ['M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15'] },
  check: { p: ['M20 6 9 17l-5-5'] },
  plus: { p: ['M5 12h14', 'M12 5v14'] },
  star: { p: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'] },
  download: { p: ['M12 15V3', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5'] },
  compass: { c: [[12, 12, 10]], p: ['m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z'] },
  map: { p: ['M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z', 'M15 5.764v15', 'M9 3.236v15'] },
  wallet: { p: ['M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1', 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4'] },
  ticket: { p: ['M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z', 'M13 5v2', 'M13 17v2', 'M13 11v2'] },
  people: { p: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'], c: [[9, 7, 4]] },
  todo: { p: ['m3 17 2 2 4-4', 'm3 7 2 2 4-4', 'M13 6h8', 'M13 12h8', 'M13 18h8'] },
  file: { p: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M10 9H8', 'M16 13H8', 'M16 17H8'] },
  book: { p: ['M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20'] },
  plane: { p: ['M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'] },
  shield: { p: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'] },
  qr: { r: [[3, 3, 5, 5, 1], [16, 3, 5, 5, 1], [3, 16, 5, 5, 1]], p: ['M21 16h-3a2 2 0 0 0-2 2v3', 'M21 21v.01', 'M12 7v3a2 2 0 0 1-2 2H7', 'M3 12h.01', 'M12 3h.01', 'M12 16v.01', 'M16 12h1', 'M21 12v.01', 'M12 21v-1'] },
  eyeOff: { p: ['M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49', 'M14.084 14.158a3 3 0 0 1-4.242-4.242', 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143', 'm2 2 20 20'] },
  trash: { p: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'] },
  globe: { c: [[12, 12, 10]], p: ['M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'] },
  phone: { p: ['M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z'] },
  sparkle: { p: ['M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z'] },
  x: { p: ['M18 6 6 18', 'm6 6 12 12'] },
  alert: { c: [[12, 12, 10]], p: ['M12 8v4', 'M12 16h.01'] },
  mic: { p: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z', 'M19 10v2a7 7 0 0 1-14 0v-2'], l: [[12, 19, 12, 22]] },
  send: { p: ['M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z', 'm21.854 2.147-10.94 10.939'] },
  mail: { r: [[2, 4, 20, 16, 2]], p: ['m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'] },
  receipt: { p: ['M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z', 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8', 'M12 17.5v-11'] },
  bag: { p: ['M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z', 'M3 6h18', 'M16 10a4 4 0 0 1-8 0'] },
} satisfies Record<string, Shape>;
export type IcoName = keyof typeof ICONS;

/** A line icon from the artboards' set. */
export function Ico({ name, size = 16, color = C.white, width = 2 }: { name: IcoName; size?: number; color?: string; width?: number }) {
  const s = ICONS[name] as Shape;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {s.c?.map(([cx, cy, r]) => <Circle key={`c${cx}${cy}`} cx={cx} cy={cy} r={r} />)}
      {s.r?.map(([x, y, w, h, rx]) => <Rect key={`r${x}${y}`} x={x} y={y} width={w} height={h} rx={rx} />)}
      {s.l?.map(([x1, y1, x2, y2]) => <Line key={`l${x1}${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} />)}
      {s.p?.map((d) => <Path key={d} d={d} />)}
    </Svg>
  );
}

/** Save a text file: a download on the web, the share sheet on the phone. */
export async function shareText(name: string, text: string, mime: string, title: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    const doc = (globalThis as { document?: { createElement(t: string): { href: string; download: string; click(): void } } }).document;
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const a = doc?.createElement('a');
    if (!a) return false;
    a.href = url;
    a.download = name;
    a.click();
    return true;
  }
  const f = new File(Paths.cache, name);
  f.write(text);
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(f.uri, { mimeType: mime, dialogTitle: title });
  return true;
}

const fileName = (title: string, ext: string) => `${title.replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'trip'}.${ext}`;

/** The trip to your calendar, as an .ics file. */
export async function shareTripIcs(ctx: LifeOSContext, trip: ObjectRecord<TripData>) {
  return shareText(fileName(trip.title, 'ics'), tripIcs(ctx, trip), 'text/calendar', 'Add the trip to your calendar');
}

/** The offline copy (bookings, tickets, addresses, the plan) as a text file; remembers when. */
export async function saveOfflineCopy(ctx: LifeOSContext, trip: ObjectRecord<TripData>) {
  const ok = await shareText(fileName(trip.title, 'txt'), offlineSheet(ctx, trip), 'text/plain', 'Save an offline copy');
  if (ok) markOfflineSaved(ctx, trip.id);
  return ok;
}

/* ------------------------------------------------------------------ */
/* Pieces                                                               */
/* ------------------------------------------------------------------ */

const KIND_ICON: Record<SearchHit['kind'], { icon: IcoName; color: string }> = {
  stop: { icon: 'pin', color: '#C99A6E' },
  stay: { icon: 'bed', color: '#F2C94C' },
  journey: { icon: 'calendar', color: '#A9C4FF' },
  flight: { icon: 'plane', color: '#A9C4FF' },
  booking: { icon: 'ticket', color: '#A9C4FF' },
  thing: { icon: 'route', color: '#5FD08A' },
  event: { icon: 'star', color: '#F4A8CE' },
  task: { icon: 'check', color: C.lime },
  note: { icon: 'alert', color: C.amber },
  bill: { icon: 'wallet', color: '#FFB27A' },
  document: { icon: 'file', color: '#A9C4FF' },
};

export function GroupLabel({ children }: { children: React.ReactNode }) {
  return <Text style={{ color: C.low, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{children}</Text>;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ padding: 10, backgroundColor: C.tile, borderRadius: 22, overflow: 'hidden' }}>
      <View style={{ gap: 2 }}>
        {React.Children.toArray(children)
          .filter(Boolean)
          .map((ch, i) => (
            <React.Fragment key={i}>
              {i ? <View style={{ height: 1, backgroundColor: C.line }} /> : null}
              {ch}
            </React.Fragment>
          ))}
      </View>
    </View>
  );
}

function Line1({ icon, color, title, sub, trailing, onPress }: { icon: IcoName; color: string; title: React.ReactNode; sub?: string | null; trailing?: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 46, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Ico name={icon} size={15} color={color} />
      </View>
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: C.white, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_500Medium' }}>{sub}</Text> : null}
      </View>
      {trailing ?? <Ico name="chevron" size={16} color={C.low} />}
    </Pressable>
  );
}

const Key = ({ k }: { k: string }) => <Text style={{ color: C.low, fontSize: 11, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{k}</Text>;

function Marked({ title, match }: { title: string; match: [number, number] | null }) {
  if (!match) return <>{title}</>;
  return (
    <>
      {title.slice(0, match[0])}
      <Text style={{ color: C.lime }}>{title.slice(match[0], match[1])}</Text>
      {title.slice(match[1])}
    </>
  );
}

const mod = (page: string, params: Record<string, string>) => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page, ...params } }) as never;

/* ------------------------------------------------------------------ */
/* The screen                                                           */
/* ------------------------------------------------------------------ */

export function SearchScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState(params.q ?? '');
  const [adding, setAdding] = useState(false);
  const [more, setMore] = useState(false);
  const trip = useLive((os) => {
    const x = os.records.get<TripData>(params.trip ?? '');
    return x?.object === 'trip' ? x : null;
  }, [params.trip]);
  const hits = useLive((os) => (trip && q.trim() ? searchTrip(os, trip, q) : []), [trip?.id, trip?.version, q]);
  const back = () => (router.canGoBack() ? router.back() : router.replace(trip ? tripRoutes.overview(trip.id) : tripRoutes.travel));
  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, padding: 20, paddingTop: insets.top + 20 }}>
        <Text style={{ color: C.mid, fontSize: 15, fontFamily: 'PlusJakartaSans_500Medium' }}>That trip isn’t here any more.</Text>
      </View>
    );
  }
  const go = (h: SearchHit) => {
    const t = h.target;
    const r = t.to === 'stop' ? tripRoutes.stop(t.id) : t.to === 'stay' ? tripRoutes.stay(t.id) : t.to === 'booking' ? tripRoutes.booking(t.id) : t.to === 'bill' ? tripRoutes.bill(t.id) : t.to === 'task' ? (`/entity/task/${t.id}` as never) : t.to === 'document' ? (`/entity/document/${t.id}` as never) : (`/entity/outing/${t.id}` as never);
    router.push(r);
  };
  const ics = async () => {
    if (!(await shareTripIcs(ctx, trip).catch(() => false))) toast.show({ message: 'Couldn’t make the calendar file', icon: 'alert' });
  };
  const offline = async () => {
    if (await saveOfflineCopy(ctx, trip).catch(() => false)) toast.show({ message: 'Offline copy saved', icon: 'check' });
    else toast.show({ message: 'Couldn’t save the offline copy', icon: 'alert' });
  };
  const views: Array<{ icon: IcoName; title: string; go: () => void }> = [
    { icon: 'compass', title: 'Overview', go: () => router.push(tripRoutes.overview(trip.id)) },
    { icon: 'map', title: 'Map and places', go: () => router.push(tripRoutes.plan(trip.id, 'map')) },
    { icon: 'calendar', title: 'Calendar', go: () => router.push(tripRoutes.plan(trip.id, 'days')) },
    { icon: 'wallet', title: 'Money', go: () => router.push(tripRoutes.money(trip.id)) },
    { icon: 'ticket', title: 'Bookings', go: () => router.push(tripRoutes.bookings(trip.id)) },
    { icon: 'people', title: 'Settle up', go: () => router.push(tripRoutes.money(trip.id, 'settle')) },
    { icon: 'todo', title: 'To-do', go: () => router.push(tripRoutes.prep(trip.id)) },
  ];
  const typed = q.trim().toLowerCase();
  const shownViews = views;
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 28, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1, gap: 10, height: 52, paddingHorizontal: 18, backgroundColor: C.tile, borderWidth: 1.5, borderColor: C.white, borderRadius: 999 }}>
            <Ico name="search" size={18} color={C.low} />
            <TextInput
              autoFocus
              value={q}
              onChangeText={(v) => {
                setQ(v);
                setMore(false);
              }}
              placeholder={`Search ${trip.data.destination || trip.title}`}
              placeholderTextColor={C.low}
              selectionColor={C.lime}
              cursorColor={C.lime}
              returnKeyType="search"
              onSubmitEditing={() => hits[0] && go(hits[0])}
              accessibilityLabel="Search the trip"
              style={[{ flexGrow: 1, flexShrink: 1, minWidth: 0, color: C.white, fontSize: 16, lineHeight: 21, fontFamily: 'PlusJakartaSans_500Medium', paddingVertical: 0 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
            />
            {Platform.OS === 'web' ? (
              <View style={{ paddingVertical: 2, paddingHorizontal: 6, borderWidth: 1, borderColor: C.line, borderRadius: 6 }}>
                <Text style={{ color: C.low, fontSize: 11, fontFamily: MONO }}>⌘K</Text>
              </View>
            ) : null}
          </View>
          <Pressable accessibilityRole="button" onPress={back} hitSlop={8}>
            <Text style={{ color: C.mid, fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Cancel</Text>
          </Pressable>
        </View>

        {typed ? (
          <View style={{ gap: 8 }}>
            <GroupLabel>IN THIS TRIP · {hits.length}</GroupLabel>
            {hits.length ? (
              <Card>
                {(more ? hits : hits.slice(0, 6)).map((h) => (
                  <Line1 key={`${h.kind}${h.id}`} icon={KIND_ICON[h.kind].icon} color={KIND_ICON[h.kind].color} title={<Marked title={h.title} match={h.match} />} sub={h.sub} onPress={() => go(h)} />
                ))}
                {hits.length > 6 && !more ? <Line1 icon="search" color={C.mid} title={`Show all ${hits.length}`} onPress={() => setMore(true)} /> : null}
              </Card>
            ) : (
              <View style={{ padding: 16, backgroundColor: C.tile, borderRadius: 22 }}>
                <Text style={{ color: C.mid, fontSize: 14, lineHeight: 20, fontFamily: 'PlusJakartaSans_500Medium' }}>Nothing on this trip matches “{q.trim()}”. Ask the copilot instead.</Text>
                <Pressable accessibilityRole="button" onPress={() => router.push(tripRoutes.copilot(trip.id, q.trim()))} style={{ marginTop: 10, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.raised }}>
                  <Ico name="sparkle" size={13} color={C.lime} />
                  <Text style={{ color: C.white, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Ask about “{q.trim().slice(0, 24)}”</Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <GroupLabel>ACTIONS</GroupLabel>
          <Card>
            <Line1 icon="plus" color={C.lime} title="Add an expense" trailing={<Key k="E" />} onPress={() => router.push(tripRoutes.spend(trip.id))} />
            <Line1 icon="plus" color={C.lime} title="Add a to-do" trailing={<Key k="T" />} onPress={() => router.push(mod('prep', { trip: trip.id, add: '1' }))} />
            <Line1 icon="star" color={C.lime} title="Add a thing to do" onPress={() => setAdding(true)} />
            <Line1 icon="calendar" color={C.lime} title="Add the trip to my calendar" sub=".ics" onPress={ics} />
            <Line1 icon="download" color={C.lime} title="Save an offline copy" onPress={offline} />
          </Card>
        </View>

        {shownViews.length ? (
          <View style={{ gap: 8 }}>
            <GroupLabel>VIEWS</GroupLabel>
            <Card>
              {shownViews.map((v) => (
                <Line1 key={v.title} icon={v.icon} color={C.white} title={v.title} onPress={v.go} />
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>
      <AddThingSheet ctx={ctx} tripId={trip.id} visible={adding} onClose={() => setAdding(false)} initial={q.trim()} />
    </View>
  );
}

/** Add a thing to do: what, and at which stop. */
export function AddThingSheet({ ctx, tripId, visible, onClose, initial = '' }: { ctx: LifeOSContext; tripId: string; visible: boolean; onClose: () => void; initial?: string }) {
  const toast = useToast();
  const [title, setTitle] = useState(initial);
  const [stop, setStop] = useState<string | null>(null);
  const stops = useLive((os) => stopsOf(os, tripId), [tripId]);
  const pills = useMemo(() => stops.map((s) => ({ id: s.id, title: s.title })), [stops]);
  const save = () => {
    if (!title.trim()) return;
    const t = addThing(ctx, tripId, title, { kind: 'do', stopId: stop ?? undefined, status: 'want' });
    toast.show({ message: `${t.title} added`, icon: 'check', undo: () => ctx.records.delete(t.id) });
    setTitle('');
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add a thing to do">
      <View style={{ gap: 12 }}>
        <TextInput value={title} onChangeText={setTitle} placeholder="Nakasendo walk" placeholderTextColor={C.low} autoFocus onSubmitEditing={save} style={{ height: 52, borderRadius: 999, paddingHorizontal: 18, backgroundColor: C.raised, color: C.white, fontSize: 16, fontFamily: 'PlusJakartaSans_500Medium' }} />
        {pills.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {pills.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityState={{ selected: stop === p.id }} onPress={() => setStop((s) => (s === p.id ? null : p.id))} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: stop === p.id ? C.white : C.raised }}>
                <Text style={{ color: stop === p.id ? C.ink : C.white, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{p.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
        <Pressable accessibilityRole="button" onPress={save} style={{ height: 50, borderRadius: 999, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
          <Ico name="plus" size={17} color={C.ink} />
          <Text style={{ color: C.ink, fontSize: 16, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Add to the trip</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}
