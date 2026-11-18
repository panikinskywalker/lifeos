import React, { useState } from 'react';
import { Image, Linking, Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { ObjectRecord } from '@core/domain/types';
import { allGames, allVenues, turfVenueId, type VenueData } from '@modules/games';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Screen, Text } from '@ui/kit';
import { usePull } from './useTurfSync';
import { NotConnectedCard, SyncBanners, TurfSyncPill, useTurfStatus } from './states';
import { useBack, type Props } from './common';
import { PillButton } from './dues';
import { SearchBox, found } from './search';
import { useTurfPhoto } from './teams';
import { BellButton } from './bell-button';

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


/* ------------------------------------------------------------------ */
/* The screen                                                          */
/* ------------------------------------------------------------------ */

interface VenueRow {
  v: ObjectRecord<VenueData>;
  area: string | null;
  games: number;
}

/** Turf web's splitVenue: "Wings - Bishop cotton" is the ground Wings in the area Bishop cotton. */
const splitVenue = (name: string): [string, string | null] => {
  const m = name.match(/^(.*?)\s+[-–·]\s+(.*)$/);
  return m ? [m[1]!, m[2]!] : [name, null];
};
/** Turf web's four backdrops, by place in the list. */
const GREENS: Array<[string, string, string]> = [
  ['#3C6B45', '#1E3F2A', '#0C1A12'],
  ['#2A2446', '#1A1630', '#0C0A16'],
  ['#5A3A3C', '#2B1A1F', '#120C0E'],
  ['#24445C', '#142A3A', '#0A141C'],
];
const INK = '#F5F5F7';
const INK62 = 'rgba(245,245,247,0.62)';

export function TurfVenues({ ctx }: Props) {
  const router = useRouter();
  const t = useTheme();
  const back = useBack();
  const { busy, pull } = usePull();
  const status = useTurfStatus();
  const venues = useLive((o) => {
    const games = allGames(o);
    return allVenues(o)
      .map((v): VenueRow => ({ v, area: splitVenue(v.data.name)[1], games: games.filter((g) => g.data.venueId === v.id).length }))
      .sort((x, y) => y.games - x.games || x.v.data.name.localeCompare(y.v.data.name));
  }, []);
  const open = (id?: string) => router.push((id ? `/board/turf/venue?venue=${id}` : '/board/turf/venue') as never);
  const [q, setQ] = useState('');
  return (
    <Screen title="Turf" subtitle="Browse" onBack={back} right={<><TurfSyncPill busy={busy} /><BellButton /></>} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}>
      <SyncBanners onRetry={() => void pull()} />
      {!venues.length && status.kind === 'off' ? (
        <NotConnectedCard />
      ) : (
        <>
          {venues.length ? <SearchBox value={q} onChange={setQ} placeholder="Search venues" /> : null}
          {venues
            .filter((row) => found(q, row.v.data.name, row.v.data.notes))
            .map((row, i) => (
              <VenueCard key={row.v.id} row={row} index={i} money={ctx.format.currency} onEdit={() => open(row.v.id)} />
            ))}
          {!venues.length ? (
            <View style={{ padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
              <Text variant="caption" color="secondary">
                No venues yet. Add the grounds you play at and new matches fill in from them.
              </Text>
            </View>
          ) : null}
        </>
      )}
      <PillButton title="Add venue" icon="plus" height={48} style={{ alignSelf: 'stretch' }} onPress={() => open()} />
    </Screen>
  );
}

/** One of the four facts: icon, value, what it is. */
function Fact({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 2 }}>
      <Icon name={icon} size={20} color={INK62} />
      <Text variant="label" color={INK} numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', textAlign: 'center' }}>
        {value}
      </Text>
      <Text variant="label" color={INK62} style={{ fontSize: 11, lineHeight: 14, fontWeight: '500' }}>
        {label}
      </Text>
    </View>
  );
}

/** A ground, as Turf web's VenueCard: backdrop or photo, area (or games played), Edit; name and Maps; format, usual, kick-off, terms; notes. */
function VenueCard({ row, index, money, onEdit }: { row: VenueRow; index: number; money: (n: number) => string; onEdit: () => void }) {
  const t = useTheme();
  const { v } = row;
  const d = v.data;
  const [name] = splitVenue(d.name);
  const maps = d.mapsLink && /^https?:\/\//i.test(d.mapsLink) ? d.mapsLink : null;
  const turfId = turfVenueId(d);
  const photo = useTurfPhoto(d.photoPath && turfId ? `/api/venues/${encodeURIComponent(turfId)}/photo?v=${encodeURIComponent(d.photoPath)}` : null);
  const [failed, setFailed] = useState(false);
  const green = GREENS[index % GREENS.length]!;
  const rule = <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.10)' }} />;
  return (
    <View style={{ padding: 12, gap: 10, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
      <View style={{ height: 140, borderRadius: 22, overflow: 'hidden' }}>
        <Svg style={{ position: 'absolute', left: 0, top: 0 }} width="100%" height="100%">
          <Defs>
            <LinearGradient id={`venue${index}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={green[0]} />
              <Stop offset="0.55" stopColor={green[1]} />
              <Stop offset="1" stopColor={green[2]} />
            </LinearGradient>
            <LinearGradient id={`venueShade${index}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0.4" stopColor="#000" stopOpacity={0} />
              <Stop offset="1" stopColor="#000" stopOpacity={0.35} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#venue${index})`} />
        </Svg>
        {photo && !failed ? <Image source={photo} onError={() => setFailed(true)} resizeMode="cover" accessibilityIgnoresInvertColors style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }} /> : null}
        <Svg style={{ position: 'absolute', left: 0, top: 0 }} width="100%" height="100%" pointerEvents="none">
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#venueShade${index})`} />
        </Svg>
        <View style={{ position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 8, height: 30, paddingHorizontal: 10, borderRadius: 999, backgroundColor: onPhoto.chip, borderWidth: 1, borderColor: onPhoto.rim }}>
          <Icon name="location" size={14} color={INK} />
          <Text variant="label" color={INK} numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', maxWidth: 220 }}>
            {row.area || `${row.games} ${row.games === 1 ? 'game' : 'games'}`}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit" hitSlop={5} onPress={onEdit} style={{ position: 'absolute', right: 12, top: 12, width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: onPhoto.buttonRim, backgroundColor: onPhoto.button, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="edit" size={15} color={INK} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <Text variant="rowTitle" color={INK} style={{ flex: 1, fontSize: 18, lineHeight: 22, fontWeight: '700' }}>
          {name}
        </Text>
        {maps ? (
          <Pressable accessibilityRole="link" accessibilityLabel="Open in Maps" hitSlop={4} onPress={() => void Linking.openURL(maps).catch(() => {})} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="share" size={16} color={INK} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row' }}>
        <Fact icon="people" value={d.sideSize ? `${d.sideSize}-a-side` : '–'} label="format" />
        {rule}
        <Fact icon="rupee" value={d.defaultCost ? money(d.defaultCost) : '–'} label="usual" />
        {rule}
        <Fact icon="clock" value={kickOff(d.defaultTime) ?? '–'} label="kick-off" />
        {rule}
        <Fact icon="cash" value={TERMS.find((x) => x.value === d.paymentTerms)?.label ?? 'Postpaid'} label="terms" />
      </View>
      {d.notes ? (
        <Text variant="caption" color="secondary">
          {d.notes}
        </Text>
      ) : null}
    </View>
  );
}
