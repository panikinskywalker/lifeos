import React from 'react';
import { Linking, Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { ObjectRecord } from '@core/domain/types';
import { allGames, allVenues, type VenueData } from '@modules/games';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, EmptyState, Icon, Screen, Text } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Switcher } from './switcher';
import { NotConnectedCard, SyncBanners, TurfSyncPill, useTurfStatus } from './states';
import { shortDay, useBack, type Props } from './common';

/**
 * Turf · Noir 7 Venues (TF-Venues): your turfs with their defaults — a card
 * per venue with its picture, name, Maps, the four defaults (format, usual
 * cost, kick-off, terms), how often you play there and the notes.
 */

/* ------------------------------------------------------------------ */
/* The venue picture (no photos in the sync yet: the artboard's art)   */
/* ------------------------------------------------------------------ */

/** Turf at dusk (green): soft lit patches over a green fall-off. [left %, top, w, h, colour, opacity, rotation, blur] */
const GRASS: Array<[number, number, number, number, string, number, number, number]> = [
  [-5, 96, 254, 97, '#8CC283', 0.29, 67, 21],
  [-14, 84, 266, 101, '#DCEFC8', 0.47, 138, 22],
  [29, 81, 211, 80, '#B9DDA3', 0.57, 120, 17],
  [43, 113, 250, 95, '#DCEFC8', 0.29, 3, 20],
  [7, 64, 189, 72, '#DCEFC8', 0.3, 10, 15],
  [-4, 116, 192, 73, '#8CC283', 0.35, 161, 16],
  [26, 33, 224, 85, '#DCEFC8', 0.54, 83, 18],
  [64, 94, 321, 122, '#B9DDA3', 0.52, 75, 26],
  [-5, 54, 188, 71, '#DCEFC8', 0.5, 51, 15],
  [77, 50, 295, 112, '#8CC283', 0.5, 122, 24],
  [9, 136, 211, 80, '#8CC283', 0.34, 139, 17],
  [-6, 35, 342, 130, '#DCEFC8', 0.59, 170, 28],
  [56, 135, 322, 122, '#DCEFC8', 0.42, 164, 26],
  [53, 73, 236, 90, '#DCEFC8', 0.31, 46, 19],
];

/** A floodlit night (violet): city lights. [left %, top, size, colour, opacity] */
const LIGHTS: Array<[number, number, number, string, number]> = [
  [0, 106, 22, '#9FB8F7', 0.86], [25, 63, 34, '#9FB8F7', 0.9], [18, 112, 17, '#F6D08A', 0.74], [44, 74, 30, '#9FB8F7', 0.66], [41, 65, 23, '#F08A4B', 0.77],
  [23, 89, 22, '#F2B24C', 0.92], [54, 79, 21, '#9FB8F7', 0.67], [7, 66, 14, '#F6D08A', 0.64], [59, 88, 17, '#9FB8F7', 0.65], [74, 124, 14, '#F2B24C', 0.85],
  [24, 101, 41, '#F08A4B', 0.94], [47, 77, 13, '#F08A4B', 0.98], [38, 131, 24, '#F08A4B', 0.96], [15, 138, 22, '#F6D08A', 0.74], [87, 68, 20, '#F2B24C', 0.95],
  [91, 129, 15, '#F2B24C', 0.91], [-13, 120, 23, '#F08A4B', 0.64], [-5, 76, 25, '#F08A4B', 0.55], [10, 119, 12, '#F6D08A', 0.73], [42, 101, 15, '#F6D08A', 0.6],
  [84, 89, 28, '#F08A4B', 0.77], [27, 95, 41, '#F08A4B', 0.91], [68, 86, 44, '#F08A4B', 0.9], [44, 66, 45, '#F08A4B', 0.58], [-5, 124, 46, '#F2B24C', 0.82],
  [83, 71, 42, '#F6D08A', 0.79],
];

const FALL = { grass: ['#3C6B45', '#1E3F2A', '#0C1A12'], night: ['#2A2446', '#1A1630', '#0C0A16'] } as const;

/** Which of the two pictures a venue gets: fixed by its id, so it never changes. */
export const lookOf = (id: string | null | undefined): 'grass' | 'night' => (id ? [...id].reduce((s, c) => s + c.charCodeAt(0), 0) % 2 : 0) === 0 ? 'grass' : 'night';

/**
 * The picture behind a venue (TF-Venues, TF-VenueEdit): a vertical fall-off,
 * blurred patches (radial fades stand in for CSS blur) and a darkening at the
 * foot. Drawn in a `w × h` box and sliced to fill.
 */
export function VenuePhoto({ id, look, w, h }: { id: string; look: 'grass' | 'night'; w: number; h: number }) {
  const [a, b, c] = FALL[look];
  const k = `vp-${id.replace(/[^A-Za-z0-9]/g, '')}-${look}`;
  return (
    <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice">
      <Defs>
        <LinearGradient id={`${k}-fall`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={a} />
          <Stop offset="0.55" stopColor={b} />
          <Stop offset="1" stopColor={c} />
        </LinearGradient>
        <LinearGradient id={`${k}-foot`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0.4" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.35} />
        </LinearGradient>
        {look === 'grass'
          ? GRASS.map(([, , , , col, op], i) => (
              <RadialGradient key={i} id={`${k}-${i}`} cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={col} stopOpacity={op} />
                <Stop offset="0.35" stopColor={col} stopOpacity={op * 0.85} />
                <Stop offset="1" stopColor={col} stopOpacity={0} />
              </RadialGradient>
            ))
          : LIGHTS.map(([, , , col, op], i) => (
              <RadialGradient key={i} id={`${k}-${i}`} cx="0.5" cy="0.5" r="0.5">
                <Stop offset="0" stopColor={col} stopOpacity={op} />
                <Stop offset="0.55" stopColor={col} stopOpacity={op} />
                <Stop offset="1" stopColor={col} stopOpacity={0} />
              </RadialGradient>
            ))}
      </Defs>
      <Rect x={0} y={0} width={w} height={h} fill={`url(#${k}-fall)`} />
      {look === 'grass'
        ? GRASS.map(([left, top, ew, eh, , , rot, blur], i) => {
            const cx = (left / 100) * w + ew / 2;
            const cy = top + eh / 2;
            return <Ellipse key={i} cx={cx} cy={cy} rx={ew / 2 + blur * 1.5} ry={eh / 2 + blur * 1.5} fill={`url(#${k}-${i})`} transform={`rotate(${rot} ${cx} ${cy})`} />;
          })
        : LIGHTS.map(([left, top, size], i) => <Ellipse key={i} cx={(left / 100) * w + size / 2} cy={top + size / 2} rx={size / 2} ry={size / 2} fill={`url(#${k}-${i})`} />)}
      <Rect x={0} y={0} width={w} height={h} fill={`url(#${k}-foot)`} />
    </Svg>
  );
}

/** A chip or round button over the picture: charcoal at 62 % / 50 % with a faint rim (no glass in RN). */
export const onPhoto = { chip: 'rgba(22,22,26,0.62)', button: 'rgba(22,22,26,0.5)', rim: 'rgba(255,255,255,0.10)', buttonRim: 'rgba(255,255,255,0.14)' } as const;

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

/** Turf web's terms in the artboard's words (Postpaid, not "Pay after"). */
export const TERMS: Array<{ value: VenueData['paymentTerms']; label: string }> = [
  { value: 'tentative', label: 'Tentative' },
  { value: 'prepaid', label: 'Prepaid' },
  { value: 'advance_paid', label: 'Advance paid' },
  { value: 'postpaid', label: 'Postpaid' },
];

/** "20:00" → "8:00 pm"; anything else as it is. */
export function kickOff(time: string | undefined | null): string | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return time;
  const h = Number(m[1]);
  return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'am' : 'pm'}`;
}

/** Where a venue is, from its Place: the area or city, when it has one. */
function areaOf(place: { data?: { city?: string; address?: string } } | null | undefined) {
  return place?.data?.city?.trim() || place?.data?.address?.split(',')[0]?.trim() || null;
}

const today = () => new Date().toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* The screen                                                          */
/* ------------------------------------------------------------------ */

interface VenueRow {
  v: ObjectRecord<VenueData>;
  area: string | null;
  games: number;
  last: string | null;
  next: string | null;
}

export function TurfVenues({ ctx }: Props) {
  const router = useRouter();
  const back = useBack();
  const { busy, pull } = usePull();
  const status = useTurfStatus();
  const venues = useLive((o) => {
    const games = allGames(o);
    const now = today();
    return allVenues(o)
      .map((v): VenueRow => {
        const here = games.filter((g) => g.data.venueId === v.id);
        const place = v.data.placeId ? o.records.get<{ city?: string; address?: string }>(v.data.placeId) : null;
        return { v, area: areaOf(place), games: here.filter((g) => g.data.date <= now).length, last: here.find((g) => g.data.date <= now)?.data.date ?? null, next: [...here].reverse().find((g) => g.data.date > now)?.data.date ?? null };
      })
      .sort((x, y) => y.games - x.games || x.v.title.localeCompare(y.v.title));
  }, []);
  const open = (id?: string) => router.push((id ? `/board/turf/venue?venue=${id}` : '/board/turf/venue') as never);
  return (
    <Screen title="Turf" subtitle="Browse › Boards" onBack={back} right={<TurfSyncPill busy={busy} />} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}>
      <Switcher active="venues" />
      <SyncBanners onRetry={() => void pull()} />
      {!venues.length && status.kind === 'off' ? (
        <NotConnectedCard />
      ) : !venues.length ? (
        <EmptyState icon="location" line="No venues yet. Add the turfs you play at, with their usual format, cost and kick-off." />
      ) : (
        venues.map((row) => <VenueCard key={row.v.id} row={row} money={ctx.format.currency} onOpen={() => open(row.v.id)} />)
      )}
      <Button title="Add venue" icon="plus" variant="secondary" block style={{ height: 48 }} onPress={() => open()} />
    </Screen>
  );
}

function VenueCard({ row, money, onOpen }: { row: VenueRow; money: (n: number) => string; onOpen: () => void }) {
  const t = useTheme();
  const { v } = row;
  const d = v.data;
  const maps = d.mapsLink && /^https?:\/\//i.test(d.mapsLink) ? d.mapsLink : null;
  const played = row.games ? `${row.games} game${row.games === 1 ? '' : 's'} here · last ${shortDay(row.last!)}` : row.next ? `First game here ${shortDay(row.next)}` : 'No games here yet';
  const tiles: Array<{ icon: string; value: string | null; label: string }> = [
    { icon: 'people', value: d.sideSize ? `${d.sideSize}-a-side` : null, label: 'format' },
    { icon: 'rupee', value: d.defaultCost ? money(d.defaultCost) : null, label: 'usual' },
    { icon: 'clock', value: kickOff(d.defaultTime), label: 'kick-off' },
    { icon: 'wallet', value: TERMS.find((x) => x.value === d.paymentTerms)?.label ?? null, label: 'terms' },
  ];
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${d.name}, edit`} onPress={onOpen} style={({ pressed }) => ({ padding: 12, gap: 10, borderRadius: 28, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.9 : 1 })}>
      <View style={{ height: 140, borderRadius: 22, overflow: 'hidden' }}>
        <VenuePhoto id={v.id} look={lookOf(v.id)} w={326} h={140} />
        {row.area ? (
          <View style={{ position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 8, height: 30, paddingHorizontal: 10, borderRadius: 999, backgroundColor: onPhoto.chip, borderWidth: 1, borderColor: onPhoto.rim }}>
            <Icon name="location" size={14} color="#F5F5F7" />
            <Text variant="labelMicro" color="#F5F5F7" numberOfLines={1} style={{ fontWeight: '700', maxWidth: 200 }}>
              {row.area}
            </Text>
          </View>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Edit" hitSlop={5} onPress={onOpen} style={{ position: 'absolute', right: 12, top: 12, width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: onPhoto.buttonRim, backgroundColor: onPhoto.button, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="edit" size={14} color="#F5F5F7" />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="rowTitle" numberOfLines={2} style={{ fontSize: 18, lineHeight: 22, fontWeight: '700' }}>
            {d.name}
          </Text>
          <Text variant="caption" color="tertiary" numberOfLines={1}>
            {played}
          </Text>
        </View>
        {maps ? (
          <Pressable accessibilityRole="link" accessibilityLabel="Open in Maps" hitSlop={4} onPress={() => void Linking.openURL(maps).catch(() => {})} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="location" size={15} color={t.c.fg.primary} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {tiles.map((x, i) => (
          <View key={x.label} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 2, borderLeftWidth: i ? 1 : 0, borderLeftColor: t.dark ? 'rgba(255,255,255,0.10)' : t.c.line }}>
            <Icon name={x.icon} size={20} color={x.value ? t.c.fg.primary : t.c.fg.tertiary} />
            <Text variant="labelMicro" color={x.value ? 'primary' : 'tertiary'} numberOfLines={1} style={{ textAlign: 'center' }}>
              {x.value ?? 'Not set'}
            </Text>
            <Text variant="labelMicro" color="secondary" style={{ fontSize: 11, lineHeight: 14, fontWeight: '500' }}>
              {x.label}
            </Text>
          </View>
        ))}
      </View>
      {d.notes ? (
        <Text variant="caption" color="secondary">
          {d.notes}
        </Text>
      ) : null}
    </Pressable>
  );
}
