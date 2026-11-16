import React, { useState } from 'react';
import { Image, Pressable, ScrollView, Share, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import {
  checklistOf, isoOf, keepOf, movesOf, nightsOf, packedClothes, packingList, projectedOf, sectionsOf, SECTION_LABEL, setKeep, settledOf, spentByStop, stampsOf, stopsOf, toTheWash, tripLedger, tripParties, tripSteps, type KeepKey, type TripData,
} from '@modules/travel';
import { useLive } from '@ui/hooks';
import { useToast } from '@ui/kit';
import { Anim, bgImage, JP_SERIF, MONO } from './kit';
import { C, Faces, isJapan, scriptName, TripHeader, TripScreen, tripRoutes, useShow } from './shell';
import { CardHead, dLabel, hexOf, Ico, Label, P, Pill, StampDisc, useClock } from './today';

/**
 * The trip page after you are back (JP-Recap; JP-Parts 17 to 19): the stamp
 * book with the DONE hanko, nights, stops and moves, what you spent against
 * the budget and by stop, the steps walked (Health's), settled up, back home
 * (packed clothes to the wash), and what carries into the next trip.
 */

export function RecapPage({ trip, ctx, now: fixed }: { trip: ObjectRecord<TripData>; ctx: LifeOSContext; now?: number }) {
  const now = useClock(fixed);
  const day = isoOf(now);
  const d = useLive(
    (os) => {
      const t = os.records.get<TripData>(trip.id) ?? trip;
      const nights = nightsOf(os, t);
      const items = tripLedger(os, t, new Date(`${day}T12:00:00`).getTime());
      const names = (id: string) => (id === 'me' ? 'You' : os.records.get(id)?.title ?? 'Someone');
      const tasks = checklistOf(os, t.id);
      return {
        t,
        nights,
        stamps: stampsOf(os, t, day, nights),
        stops: stopsOf(os, t.id),
        spent: projectedOf(items, 'me'),
        byStop: spentByStop(os, t, items, 'me', nights).filter((s) => s.nights > 0),
        steps: tripSteps(os, t, nights),
        settled: settledOf(os, t),
        parties: tripParties(t).map(names),
        packed: packedClothes(os, t.id),
        packing: packingList(os, t),
        tasks,
        sections: sectionsOf(tasks).map((g) => SECTION_LABEL[g.section] ?? g.section),
        stopTitle: (id: string | null) => (id ? os.records.get(id)?.title ?? null : null),
      };
    },
    [trip.id, day],
  );
  const jp = isJapan(d.t);
  return (
    <TripScreen tripId={trip.id} active="overview">
      <TripHeader trip={d.t} label={`Home · ${dLabel(day, false)}`} />
      <DoneStepper />
      {jp && d.stamps.length ? <StampBook d={d} /> : null}
      <Anim k="jr" delay={230} style={{ flexDirection: 'row', gap: 12, padding: 16, backgroundColor: C.tile, borderRadius: 24 }}>
        {[['NIGHTS', d.nights.length], ['STOPS', d.stops.length], ['MOVES', movesOf(d.nights)]].map(([l, v]) => (
          <View key={l} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 4 }}>
            <Label>{l}</Label>
            <Text style={{ color: C.white, fontSize: 22, lineHeight: 26, letterSpacing: -0.5, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{String(v)}</Text>
          </View>
        ))}
      </Anim>
      <SpentEach d={d} />
      {d.byStop.length ? <ByStop d={d} jp={jp} /> : null}
      <Walked d={d} />
      <PhotoAndSteps d={d} />
      <SettledCard d={d} />
      {d.packed.length ? <BackHome d={d} ctx={ctx} /> : null}
      <KeepCard d={d} ctx={ctx} />
      <ShareRow d={d} />
    </TripScreen>
  );
}

type D = {
  t: ObjectRecord<TripData>;
  nights: ReturnType<typeof nightsOf>;
  stamps: ReturnType<typeof stampsOf>;
  stops: ReturnType<typeof stopsOf>;
  spent: ReturnType<typeof projectedOf>;
  byStop: ReturnType<typeof spentByStop>;
  steps: ReturnType<typeof tripSteps>;
  settled: ReturnType<typeof settledOf>;
  parties: string[];
  packed: Array<{ id: string; title: string }>;
  packing: ReturnType<typeof packingList>;
  tasks: ReturnType<typeof checklistOf>;
  sections: string[];
  stopTitle: (id: string | null) => string | null;
};

/** Plan · Book · Prep · Travel · Home, every one done. */
function DoneStepper() {
  const stages = ['PLAN', 'BOOK', 'PREP', 'TRAVEL', 'HOME'];
  return (
    <Anim k="jr" delay={110} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
      {stages.map((s, i) => (
        <React.Fragment key={s}>
          {i ? <View style={{ flexGrow: 1, height: 2, marginTop: 10, borderRadius: 1, backgroundColor: C.lime }} /> : null}
          <View style={{ width: 40, flexShrink: 0, alignItems: 'center', gap: 5 }}>
            <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' }}>
              <Ico d={P.check} size={12} color={C.ink} />
            </View>
            <Text style={{ color: C.white, fontSize: 9, letterSpacing: 1, fontFamily: MONO }}>{s}</Text>
          </View>
        </React.Fragment>
      ))}
    </Anim>
  );
}

/* The stamp book (JP-Parts 17): every stop's eki stamp and the DONE hanko. */
function StampBook({ d }: { d: D }) {
  const router = useRouter();
  const got = d.stamps.filter((s) => s.collected).length;
  const rows: Array<typeof d.stamps> = [];
  for (let i = 0; i < d.stamps.length; i += 5) rows.push(d.stamps.slice(i, i + 5));
  const lastGot = [...d.stamps].reverse().find((s) => s.collected);
  const { startDate: s, endDate: e } = d.t.data;
  const year = (x: string) => x.slice(0, 4);
  const dates = s && e ? `${dLabel(s, false)} ${year(s)} – ${dLabel(e, false)} ${year(e)}` : '';
  return (
    <Anim k="jr" delay={170} style={{ gap: 14, padding: 18, backgroundColor: '#F3EBDD', borderRadius: 32, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={{ color: 'rgba(11,11,13,0.62)', fontSize: 10, letterSpacing: 1.5, fontFamily: MONO }}>STAMP BOOK · 駅スタンプ</Text>
        <View style={{ flexGrow: 1 }} />
        <Text style={{ color: C.ink, fontSize: 12, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{`${got}/${d.stamps.length}`}</Text>
      </View>
      <View style={{ gap: 12 }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            {row.map((st) => {
              const disc = <StampDisc mark={st.mark} color={hexOf(st.color)} faded={!st.collected} />;
              return (
                <Pressable key={st.stop.id} accessibilityRole="button" accessibilityLabel={`${st.stop.title}${st.collected ? ', collected' : ''}`} onPress={() => router.push(tripRoutes.stop(st.stop.id))} style={{ width: 52 }}>
                  {st === lastGot ? <Anim k="jstamp">{disc}</Anim> : disc}
                </Pressable>
              );
            })}
            {row.length < 5 ? Array.from({ length: 5 - row.length }, (_, i) => <View key={`f${i}`} style={{ width: 52 }} />) : null}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: C.ink, fontSize: 40, lineHeight: 44, letterSpacing: 2, fontFamily: JP_SERIF, fontWeight: '800' }}>{scriptName(d.t) ?? d.t.data.destination}</Text>
          <Text style={{ color: 'rgba(11,11,13,0.62)', fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold' }}>{dates}</Text>
        </View>
        {got === d.stamps.length ? (
          <Anim k="jstamp" style={{ width: 76, height: 76, borderRadius: 38, flexShrink: 0, backgroundColor: C.vermilion, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }], boxShadow: `inset 0 0 0 4px ${C.vermilion}, inset 0 0 0 6px rgba(251,243,230,0.7)` }}>
            <Text style={{ color: '#FBF3E6', fontSize: 9, letterSpacing: 2, fontFamily: MONO }}>DONE</Text>
            <Text style={{ color: '#FBF3E6', fontSize: 27, lineHeight: 28, letterSpacing: -1, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{String(d.nights.length)}</Text>
            <Text style={{ color: '#FBF3E6', fontSize: 12, letterSpacing: 4, fontFamily: JP_SERIF, fontWeight: '800' }}>完</Text>
          </Anim>
        ) : null}
      </View>
    </Anim>
  );
}

/* Spent each against the budget, with the bar. */
function SpentEach({ d }: { d: D }) {
  const router = useRouter();
  const show = useShow(d.t);
  const spent = d.spent.total;
  const cap = d.t.data.budget ?? 0;
  const share = cap ? Math.min(1, spent / cap) : 1;
  const top = [...d.byStop].sort((a, b) => b.perDay - a.perDay)[0];
  const over = cap && spent > cap;
  return (
    <Anim k="jr" delay={290}>
      <Pressable accessibilityRole="button" onPress={() => router.push(tripRoutes.money(d.t.id))} style={{ gap: 10, padding: 16, backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Label>SPENT EACH</Label>
          <View style={{ flexGrow: 1 }} />
          {cap ? <Pill label={over ? 'over budget' : 'under budget'} tone={over ? 'coral' : 'lime'} height={24} /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 12 }}>
          <Text style={{ color: C.white, fontSize: 34, lineHeight: 35, letterSpacing: -1, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{show(spent)}</Text>
          <View style={{ flexGrow: 1 }} />
          {cap ? <Text style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{`of ${show(cap, true)}`}</Text> : null}
        </View>
        <View style={{ height: 28 }}>
          <View style={[bgImage('repeating-linear-gradient(90deg, rgba(245,245,247,0.28) 0 1.5px, transparent 1.5px 5px)'), { position: 'absolute', top: 5, left: 0, right: 0, height: 18, borderRadius: 18 }]} />
          <Anim k="jbar" style={[bgImage(`linear-gradient(90deg, ${over ? '#FF6B7A' : '#D7F55C'}10 0%, ${over ? '#FF6B7A' : '#D7F55C'}AA 45%, ${over ? '#FF6B7A' : '#D7F55C'} 100%)`), { position: 'absolute', top: 5, left: 0, width: `${Math.round(share * 100)}%`, height: 18, borderRadius: 18, boxShadow: `0 0 18px ${over ? '#FF6B7A' : '#D7F55C'}88, 0 0 4px ${over ? '#FF6B7A' : '#D7F55C'}` }]} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ color: C.white, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{cap ? `${show(Math.abs(cap - spent))} ${over ? 'over' : 'left'}` : 'No budget set'}</Text>
          <View style={{ flexGrow: 1 }} />
          {top && top.perDay > 0 ? <Text numberOfLines={1} style={{ flexShrink: 1, color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{`${top.title} cost the most a day`}</Text> : null}
        </View>
      </Pressable>
    </Anim>
  );
}

/* Spent a day, by stop: a bar a stop, the dearest lit. */
function ByStop({ d, jp }: { d: D; jp: boolean }) {
  const show = useShow(d.t);
  const [w, setW] = useState(318);
  const list = d.byStop;
  const max = Math.max(1, ...list.map((s) => s.perDay));
  const topI = list.findIndex((s) => s.perDay === max);
  const H = 190;
  const base = 170;
  const span = 152;
  const step = [1000, 2000, 5000, 10000, 20000, 50000].find((s) => max / s <= 3) ?? 100000;
  const grid = [step, step * 2, step * 3].filter((g) => g < max * 1.05);
  const left = 30;
  const slot = (w - left) / list.length;
  const bw = Math.min(26, slot * 0.73);
  const y = (v: number) => base - (v / max) * span;
  return (
    <Anim k="jr" delay={350} style={{ gap: 10, padding: 16, backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' }}>
      <CardHead title="Spent a day, by stop" sub="each · stays and spends on its nights" right={list[topI] && max > 1 ? <Pill label={`${list[topI]!.title} the most`} tone="grey" /> : null} />
      <View onLayout={(e) => setW(Math.max(120, e.nativeEvent.layout.width))}>
        <Svg width={w} height={H} viewBox={`0 0 ${w} ${H}`}>
          {grid.map((g) => (
            <G key={g}>
              <Line x1={left} x2={w} y1={y(g)} y2={y(g)} stroke="rgba(255,255,255,0.05)" />
              <SvgText x={0} y={y(g) + 3} fontFamily="JetBrainsMono_500Medium" fontSize={9} fill="rgba(245,245,247,0.42)">{show(g, true).replace(/\.0(?=k)/, '')}</SvgText>
            </G>
          ))}
          {list.map((s, i) => {
            const x = left + i * slot + (slot - bw) / 2;
            const top = i === topI && max > 1;
            const h = Math.max(bw, (s.perDay / max) * span);
            return (
              <G key={s.stopId}>
                <Rect x={x} y={base - h} width={bw} height={h} rx={bw / 2} fill={top ? C.lime : '#2A2A30'} />
                <SvgText x={x + bw / 2} y={186} textAnchor="middle" fontFamily={jp ? undefined : 'PlusJakartaSans_600SemiBold'} fontSize={10} fontWeight="600" fill={top ? C.white : C.low}>{jp ? s.mark : s.title.slice(0, 3)}</SvgText>
                {top ? (
                  <G>
                    <Rect x={Math.min(w - 60, Math.max(0, x + bw / 2 - 30))} y={Math.max(0, base - h - 26)} width={60} height={20} rx={10} fill={C.white} />
                    <SvgText x={Math.min(w - 30, Math.max(30, x + bw / 2))} y={Math.max(0, base - h - 26) + 14} textAnchor="middle" fontFamily="PlusJakartaSans_800ExtraBold" fontSize={11} fontWeight="800" fill={C.ink}>{show(s.perDay, true)}</SvgText>
                  </G>
                ) : null}
              </G>
            );
          })}
        </Svg>
      </View>
    </Anim>
  );
}

const compactN = (n: number) => (n >= 100000 ? `${(n / 1000).toFixed(0)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)));

/* Walked (Health's steps over the trip): day, week or the whole trip. */
function Walked({ d }: { d: D }) {
  const [unit, setUnit] = useState<'D' | 'W' | 'T'>('T');
  const s = d.steps;
  const value = s ? (unit === 'D' ? s.perDay : unit === 'W' ? s.perDay * 7 : s.total) : null;
  const top = s ? d.stopTitle(s.topStopId) : null;
  return (
    <Anim k="jr" delay={410} style={{ gap: 12, padding: 16, backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' }}>
      <View pointerEvents="none" style={[bgImage('radial-gradient(closest-side, #D7F55C88, #D7F55C22 60%, transparent)'), { position: 'absolute', top: 30, left: -90, width: 260, height: 150, borderRadius: 75, opacity: s ? 1 : 0.4 }]} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Label>WALKED</Label>
        <View style={{ flexDirection: 'row', gap: 2, padding: 3, backgroundColor: C.raised, borderRadius: 999 }}>
          {(['D', 'W', 'T'] as const).map((k) => (
            <Pressable key={k} accessibilityRole="button" accessibilityLabel={k === 'D' ? 'A day' : k === 'W' ? 'A week' : 'The whole trip'} accessibilityState={{ selected: unit === k }} onPress={() => setUnit(k)} style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: unit === k ? C.white : 'transparent' }}>
              <Text style={{ color: unit === k ? C.ink : C.mid, fontSize: 11, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{k}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View>
        <Anim k="jroll" key={unit}>
          <Text style={{ color: C.white, fontSize: 52, lineHeight: 54, letterSpacing: -2, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{value != null ? Math.round(value).toLocaleString('en-IN') : '–'}</Text>
        </Anim>
        <Text style={{ color: C.mid, fontSize: 14, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{s ? (unit === 'D' ? 'steps a day' : unit === 'W' ? 'steps a week' : 'steps on the trip') : 'steps show up here from Health'}</Text>
      </View>
      {s ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[[`${Math.round(s.total * 0.00075)}`, 'km', 'walked'], [compactN(s.perDay), '', 'a day'], [top ?? '–', '', 'most steps']].map(([v, u, l]) => (
            <View key={l} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: C.white, fontSize: 22, letterSpacing: -0.5, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>
                {v}
                {u ? <Text style={{ color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_700Bold' }}>{u}</Text> : null}
              </Text>
              <Text style={{ color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' }}>{l}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Anim>
  );
}

/* The stop's poster (or its art) beside the steps a day. */
function PhotoAndSteps({ d }: { d: D }) {
  const router = useRouter();
  const longest = [...d.byStop].sort((a, b) => b.nights - a.nights || b.perDay - a.perDay)[0];
  const stop = d.stops.find((s) => s.data.poster?.uri) ?? d.stops.find((s) => s.id === longest?.stopId) ?? d.stops[0];
  if (!stop) return null;
  const s = d.steps;
  const vals = s?.days.map((x) => x.steps) ?? [];
  const mx = Math.max(1, ...vals);
  const mn = Math.min(...vals, mx);
  const pts = vals.map((v, i) => [vals.length > 1 ? (i / (vals.length - 1)) * 150 : 75, 62 - ((v - mn) / Math.max(1, mx - mn)) * 54] as [number, number]);
  const path = pts.length > 1 ? pts.reduce((acc, [x, y], i) => (i ? `${acc} C ${((pts[i - 1]![0] + x) / 2).toFixed(1)} ${pts[i - 1]![1].toFixed(1)}, ${((pts[i - 1]![0] + x) / 2).toFixed(1)} ${y.toFixed(1)}, ${x.toFixed(1)} ${y.toFixed(1)}` : `M${x.toFixed(1)} ${y.toFixed(1)}`), '') : 'M0 62 L 150 62';
  const blobs: Array<[number, number, number, string, number]> = [[94, 29, 74, '#9AD0FF', 0.72], [60, 81, -7, '#9AD0FF', 0.74], [135, 52, 69, '#5A9AE0', 0.65], [138, -36, 58, '#9AD0FF', 0.49], [115, 127, 27, '#9AD0FF', 0.69], [97, 90, 37, '#F0C890', 0.56], [85, 46, 29, '#9AD0FF', 0.69]];
  return (
    <Anim k="jr" delay={470} style={{ flexDirection: 'row', gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${stop.title}`} onPress={() => router.push(tripRoutes.stop(stop.id))} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, height: 190, borderRadius: 26, overflow: 'hidden' }}>
        {stop.data.poster?.uri ? (
          <Image source={{ uri: stop.data.poster.uri }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} resizeMode="cover" />
        ) : (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
            <View style={[bgImage('linear-gradient(180deg, #1C3A5E 0%, #12263E 55%, #081220 100%)'), { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]} />
            {blobs.map(([size, top, left, c, o], i) => (
              <View key={i} style={[bgImage(`radial-gradient(closest-side, ${c} 0%, ${c} 55%, rgba(0,0,0,0) 100%)`), { position: 'absolute', width: size, height: size, top, left: `${left}%`, borderRadius: size / 2, opacity: o, filter: `blur(${Math.round(size / 6)}px)` } as never]} />
            ))}
          </View>
        )}
        <View style={[bgImage('linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.35) 100%)'), { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }]} />
        <View style={{ position: 'absolute', top: 10, left: 10, width: 36, height: 36, borderRadius: 18, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' }}>
          <Ico d={['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z']} size={15} color={C.ink} />
        </View>
        <Text numberOfLines={1} style={{ position: 'absolute', top: 18, left: 54, right: 12, textAlign: 'right', color: C.white, fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold' }}>{stop.title}</Text>
        <View style={{ position: 'absolute', left: 10, bottom: 10 }}>
          <Pill label={stop.data.poster?.uri ? 'your poster' : longest ? `${longest.nights} night${longest.nights === 1 ? '' : 's'} here` : 'add a poster'} tone="grey" height={28} />
        </View>
      </Pressable>
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 2, paddingTop: 14, paddingHorizontal: 14, backgroundColor: C.tile, borderRadius: 26, overflow: 'hidden' }}>
        <Text style={{ color: C.white, fontSize: 26, letterSpacing: -0.5, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{s ? compactN(s.perDay) : '–'}</Text>
        <Text style={{ color: C.mid, fontSize: 10, letterSpacing: 0.6, fontFamily: MONO }}>STEPS A DAY</Text>
        <View style={{ marginTop: 6, marginHorizontal: -14 }}>
          <Svg width="100%" height={70} viewBox="0 0 150 70" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="rcas" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={C.lime} stopOpacity={s ? 0.45 : 0.12} />
                <Stop offset="1" stopColor={C.lime} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Path d={`${path} L 150 70 L 0 70 Z`} fill="url(#rcas)" />
            <Path d={path} fill="none" stroke={s ? C.lime : 'rgba(245,245,247,0.2)'} strokeWidth={2.5} />
          </Svg>
        </View>
      </View>
    </Anim>
  );
}

function SettledCard({ d }: { d: D }) {
  const router = useRouter();
  const show = useShow(d.t);
  const s = d.settled;
  const sub = s.settled ? `${s.paybacks} payback${s.paybacks === 1 ? '' : 's'} recorded${s.lastPayback ? ` · ${dLabel(s.lastPayback, false)}` : ''}` : `${s.debts.length} payback${s.debts.length === 1 ? '' : 's'} to go · ${show(s.debts.reduce((a, x) => a + x.amount, 0))}`;
  return (
    <Anim k="jr" delay={530}>
      <Pressable accessibilityRole="button" onPress={() => router.push(tripRoutes.money(d.t.id, 'settle'))} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, backgroundColor: C.tile, borderRadius: 24 }}>
        <Faces names={d.parties} size={34} ring={C.tile} />
        <View style={{ flexGrow: 1, flexShrink: 1 }}>
          <CardHead title={s.settled ? 'All settled up' : 'Not settled yet'} sub={sub} />
        </View>
        {s.settled ? <Ico d={P.check} size={20} color={C.lime} /> : <Ico d={P.chevR} size={20} color={C.mid} />}
      </Pressable>
    </Anim>
  );
}

/* Back home (JP-Parts 18): what is still packed goes in the wash; tap one to keep it in the bag. */
function BackHome({ d, ctx }: { d: D; ctx: LifeOSContext }) {
  const toast = useToast();
  const [keep, setKeepIds] = useState<Set<string>>(new Set());
  const [later, setLater] = useState(false);
  if (later) return null;
  const wash = d.packed.filter((c) => !keep.has(c.id));
  const go = () => {
    if (!wash.length) return;
    const undo = toTheWash(ctx, wash.map((c) => c.id));
    toast.show({ message: `${wash.length} in the wash`, icon: 'shirt', undo });
  };
  return (
    <Anim k="jr" delay={590} style={{ gap: 12, padding: 16, backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
          <Ico d={['M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z']} size={18} color="#9AD0FF" />
        </View>
        <View style={{ flexGrow: 1, flexShrink: 1 }}>
          <CardHead title={`Back from ${d.t.data.destination}?`} sub={`${d.packed.length} thing${d.packed.length === 1 ? ' is' : 's are'} still packed`} />
        </View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16 }}>
        {d.packed.map((c) => {
          const toWash = !keep.has(c.id);
          return (
            <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${c.title}: ${toWash ? 'to the wash' : 'stays in the bag'}`} onPress={() => setKeepIds((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 6, height: 36, paddingLeft: 10, paddingRight: 14, borderRadius: 999, backgroundColor: toWash ? '#9AD0FF' : C.lime }}>
              {toWash ? <Ico d={['m17 2 4 4-4 4', 'M3 11v-1a4 4 0 0 1 4-4h14', 'm7 22-4-4 4-4', 'M21 13v1a4 4 0 0 1-4 4H3']} size={13} color={C.ink} /> : <Ico d={P.check} size={14} color={C.ink} />}
              <Text style={{ color: C.ink, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{c.title}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" disabled={!wash.length} onPress={go} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 44, borderRadius: 999, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center', opacity: wash.length ? 1 : 0.4 }}>
          <Text style={{ color: C.ink, fontSize: 15, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{wash.length === d.packed.length ? 'To the wash' : `${wash.length} to the wash`}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => setLater(true)} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 44, borderRadius: 999, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Later</Text>
        </Pressable>
      </View>
    </Anim>
  );
}

/* Keep for the next trip (JP-Parts 19): what carries into the template. */
function KeepCard({ d, ctx }: { d: D; ctx: LifeOSContext }) {
  const toast = useToast();
  const k = keepOf(d.t);
  const items = d.packing.items.length + d.packing.clothes.filter((c) => c.packedHere).length;
  const rows: Array<{ key: KeepKey; title: string; sub: string; color: string; icon: string[] }> = [
    { key: 'packing', title: 'Packing list', sub: `${items} item${items === 1 ? '' : 's'}${d.packing.climate !== 'city' ? ` · ${d.packing.climate}` : ''}`, color: C.lime, icon: ['m3 17 2 2 4-4', 'm3 7 2 2 4-4', 'M13 6h8', 'M13 12h8', 'M13 18h8'] },
    { key: 'todo', title: 'To-do list', sub: `${d.tasks.length} item${d.tasks.length === 1 ? '' : 's'}${d.sections.length ? ` · ${d.sections.slice(0, 3).join(', ').toLowerCase()}` : ''}`, color: '#A9C4FF', icon: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M10 9H8', 'M16 13H8', 'M16 17H8'] },
    { key: 'group', title: 'The group', sub: d.parties.join(', '), color: '#F4A8CE', icon: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'] },
  ];
  return (
    <Anim k="jr" delay={650} style={{ gap: 6, padding: 16, backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' }}>
      <CardHead title="Keep for the next trip" sub="what carries into the template" />
      {rows.map((r) => {
        const on = k[r.key];
        return (
          <Pressable key={r.key} accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={r.title} onPress={() => { const undo = setKeep(ctx, d.t.id, r.key, !on); toast.show({ message: `${r.title} ${on ? 'left out' : 'kept'}`, icon: 'check', undo }); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ico d={r.icon} size={16} color={r.color}>{r.key === 'group' ? <Circle cx={9} cy={7} r={4} /> : null}</Ico>
            </View>
            <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ color: C.white, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{r.title}</Text>
              <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: 'PlusJakartaSans_500Medium' }}>{r.sub}</Text>
            </View>
            <View style={{ width: 50, height: 30, padding: 3, borderRadius: 999, backgroundColor: on ? C.lime : C.raised, flexDirection: 'row', justifyContent: on ? 'flex-end' : 'flex-start', alignItems: 'center', flexShrink: 0 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: on ? C.ink : 'rgba(245,245,247,0.5)' }} />
            </View>
          </Pressable>
        );
      })}
    </Anim>
  );
}

function ShareRow({ d }: { d: D }) {
  const router = useRouter();
  const got = d.stamps.filter((s) => s.collected);
  const summary = [`${d.t.data.destination}${scriptName(d.t) ? ` ${scriptName(d.t)}` : ''}`, d.t.data.startDate && d.t.data.endDate ? `${dLabel(d.t.data.startDate, false)} – ${dLabel(d.t.data.endDate, false)}` : null, `${d.nights.length} nights · ${d.stops.length} stops · ${movesOf(d.nights)} moves`, got.length ? got.map((s) => s.stop.title).join(' → ') : null].filter(Boolean).join('\n');
  return (
    <Anim k="jr" delay={710} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Pressable accessibilityRole="button" onPress={() => router.push(tripRoutes.viewOnly(d.t.id))} style={({ pressed }) => ({ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 52, borderRadius: 999, backgroundColor: C.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.85 : 1 })}>
        <Ico d={['M12 2v13', 'm16 6-4-4-4 4', 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8']} size={17} color={C.ink} />
        <Text style={{ color: C.ink, fontSize: 16, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Share the trip</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Share the trip's card" onPress={() => void Share.share({ message: summary })} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
        <Ico d={['m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21']} size={18} color={C.lime}>
          <Rect width={18} height={18} x={3} y={3} rx={2} ry={2} />
          <Path d="M9 9m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0" />
        </Ico>
      </Pressable>
    </Anim>
  );
}
