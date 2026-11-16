import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { Button, EmptyState, Icon, IconButton, Screen, Segmented, Sheet, Text, TextField, useToast } from '@ui/kit';
import { addToLine, dayPlans, statusOf, stayMoney, tripStays, tripTickets, ensureStop, moveStop, movingDays, nightsOf, segmentsOf, stopMark, stopSpan, stopsOf, tripIcs, type Night, type StopData, type TripData } from '@modules/travel';
import { Caps, datesLabel, dayLabel, Note, plural, Row, RowCard, SectionHead, WHITE } from './parts';
import { dayRoute } from './day';
import { amount, bookingsRoute } from './bookings';

/**
 * Plan (the trip template, R7g slice 1; JP-Map, JP-Route, JP-Calendar): the
 * line of stops in order with their nights and stays, ideas off the line, the
 * days as a calendar with each night's stop and the moving days, and the
 * stops on a drawn map. A first pass from the JP-* artboards.
 */

/** The line's colours on Noir (JP-Parts). */
export const STOP_HEX: Record<string, string> = { green: '#5FD08A', teal: '#4CC9D4', indigo: '#8C9DFF', persimmon: '#FF9A4D', wood: '#C99A6E', plum: '#E08BC8', crimson: '#FF6B7A', gold: '#F2C94C', sky: '#6CC6FF', slate: '#95A1B2' };
const INK = '#0B0B0D';
const CORAL = '#FF6B7A';
export const stopHex = (s: Pick<ObjectRecord<StopData>, 'data'>) => STOP_HEX[s.data.color ?? 'slate'] ?? STOP_HEX.slate!;

/** Common places the add form offers (the Japan app's list): name, local name, pin. */
const PRESETS: Record<string, Array<[string, string, number, number]>> = {
  japan: [
    ['Tokyo', '東京', 35.6812, 139.7671], ['Yokohama', '横浜', 35.4437, 139.638], ['Kamakura', '鎌倉', 35.3192, 139.5467], ['Hakone', '箱根', 35.2324, 139.1069],
    ['Nikko', '日光', 36.7199, 139.6982], ['Kawaguchiko', '河口湖', 35.4983, 138.769], ['Karuizawa', '軽井沢', 36.3484, 138.597], ['Nagano', '長野', 36.6485, 138.195],
    ['Matsumoto', '松本', 36.2381, 137.972], ['Takayama', '高山', 36.1461, 137.2522], ['Shirakawa-go', '白川郷', 36.2578, 136.906], ['Kanazawa', '金沢', 36.5613, 136.6562],
    ['Tsumago', '妻籠', 35.5777, 137.5976], ['Nagoya', '名古屋', 35.1815, 136.9066], ['Ise', '伊勢', 34.4875, 136.7254], ['Kyoto', '京都', 35.0116, 135.7681],
    ['Nara', '奈良', 34.6851, 135.8048], ['Osaka', '大阪', 34.6937, 135.5023], ['Kobe', '神戸', 34.6901, 135.1955], ['Koyasan', '高野山', 34.213, 135.5857],
    ['Himeji', '姫路', 34.8394, 134.6939], ['Hiroshima', '広島', 34.3853, 132.4553], ['Miyajima', '宮島', 34.296, 132.3198],
  ],
};

export const planRoute = (tripId: string, view?: View3) => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'plan', trip: tripId, ...(view ? { view } : {}) } });
type View3 = 'line' | 'days' | 'map';

/** A stop's disc: its mark on its colour (dashed for an idea). */
export function StopDisc({ stop, look, size = 40 }: { stop: Pick<ObjectRecord<StopData>, 'title' | 'data'>; look?: string; size?: number }) {
  const c = stopHex(stop);
  const idea = stop.data.kind === 'idea';
  const mark = stopMark(stop, look);
  const serif = look === 'japan' && !!stop.data.localName;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: idea ? 'transparent' : c, borderWidth: idea ? 2 : 0, borderStyle: 'dashed', borderColor: c, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text style={{ fontSize: size * (serif ? 0.46 : 0.4), lineHeight: size * 0.6, fontWeight: '800', color: idea ? c : INK, fontFamily: serif ? Platform.select({ ios: 'Hiragino Mincho ProN', android: 'serif', default: "'Shippori Mincho B1', serif" }) : undefined }}>{mark}</Text>
    </View>
  );
}

interface PlanData {
  trip: ObjectRecord<TripData>;
  line: ObjectRecord<StopData>[];
  ideas: ObjectRecord<StopData>[];
  airports: ObjectRecord<StopData>[];
  nights: Night[];
  stays: Map<string, string>;
  plans: Map<string, string>;
  pins: Map<string, { lat: number; lng: number }>;
}

function usePlan(tripId: string): PlanData | null {
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
      return { trip, line: all.filter((s) => s.data.kind === 'stop'), ideas: all.filter((s) => s.data.kind === 'idea'), airports: all.filter((s) => s.data.kind === 'airport'), nights, stays, plans: dayPlans(os, trip.id), pins };
    },
    [tripId],
  );
}

export function PlanScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const [view, setView] = useState<View3>((['line', 'days', 'map'] as const).find((v) => v === params.view) ?? 'line');
  const d = usePlan(params.trip ?? '');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/travel/index' as never));
  if (!d) {
    return (
      <Screen title="Plan" onBack={back}>
        <EmptyState icon="map" tint="travel" line="That trip isn’t here any more." />
      </Screen>
    );
  }
  const stayNights = d.nights.filter((n) => n.kind === 'stay').length;
  const moves = movingDays(d.nights).length;
  return (
    <Screen title={`Plan · ${d.trip.title}`} subtitle={[plural(d.line.length, 'stop'), stayNights ? plural(stayNights, 'night') : null, moves ? plural(moves, 'move') : null].filter(Boolean).join(' · ')} onBack={back} contentStyle={{ gap: 14 }}>
      <Segmented options={[{ value: 'map', label: 'Map' }, { value: 'line', label: 'Line' }, { value: 'days', label: 'Days' }]} value={view} onChange={setView} />
      {view === 'line' ? <LineView d={d} ctx={ctx} /> : view === 'days' ? <DaysView d={d} ctx={ctx} /> : <MapView d={d} />}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Line                                                                 */
/* ------------------------------------------------------------------ */

function LineView({ d, ctx }: { d: PlanData; ctx: LifeOSContext }) {
  const router = useRouter();
  const toast = useToast();
  const t = useTheme();
  const [adding, setAdding] = useState(false);
  const look = d.trip.data.look;
  const gaps = segmentsOf(d.nights).filter((g) => g.kind === 'gap');
  const open = (id: string) => router.push(`/entity/stop/${id}` as never);
  const move = (s: ObjectRecord<StopData>, dir: -1 | 1) => {
    const undo = moveStop(ctx, s.id, dir);
    if (undo) toast.show({ message: `${s.title} moved ${dir < 0 ? 'up' : 'down'}`, icon: 'transfer', undo });
  };
  return (
    <View style={{ gap: 14 }}>
      {gaps.length ? (
        <Note icon="alert" iconColor={CORAL}>
          {`No bed booked: ${gaps.map((g) => `${datesLabel({ startDate: g.from, endDate: g.nights > 1 ? addDay(g.to, -1) : undefined })} (${plural(g.nights, 'night')})`).join(', ')}.`}
        </Note>
      ) : null}
      <View style={{ gap: 8 }}>
        {d.line.map((s, i) => {
          const span = stopSpan(d.nights, s.id);
          const stays = [...new Set(d.nights.filter((n) => n.stopId === s.id && n.stayId).map((n) => d.stays.get(n.stayId!)!))].filter(Boolean);
          return (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${s.title}, open`} onPress={() => open(s.id)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Text style={{ fontSize: 10, lineHeight: 12, fontWeight: '700', color: t.c.fg.tertiary, fontVariant: ['tabular-nums'] }}>{String(i + 1).padStart(2, '0')}</Text>
                  <StopDisc stop={s} look={look} />
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="rowTitle" numberOfLines={1}>{[s.data.localName && look === 'japan' ? s.data.localName : null, s.title].filter(Boolean).join(' ')}</Text>
                  <Text variant="caption" color="secondary" numberOfLines={1}>{span ? `${datesLabel({ startDate: span.from, endDate: span.to })} · ${plural(span.nights, 'night')}` : 'No nights booked here yet'}</Text>
                  {stays.length ? <Text variant="caption" color="secondary" numberOfLines={1}>{stays.join(' · ')}</Text> : null}
                </View>
              </Pressable>
              <View style={{ gap: 4 }}>
                <IconButton icon="chevron-up" size={32} accessibilityLabel={`Move ${s.title} up`} disabled={i === 0} onPress={() => move(s, -1)} />
                <IconButton icon="chevron-down" size={32} accessibilityLabel={`Move ${s.title} down`} disabled={i === d.line.length - 1} onPress={() => move(s, 1)} />
              </View>
            </View>
          );
        })}
        {!d.line.length ? <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>No stops yet. Add the places you’ll sleep in, in order.</Text> : null}
      </View>
      <Button title="Add a stop" icon="plus" variant="secondary" onPress={() => setAdding(true)} />

      {d.ideas.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Ideas, not on the line" sub={plural(d.ideas.length, 'maybe')} />
          {d.ideas.map((s) => (
            <View key={s.id} style={{ gap: 10, padding: 14, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(245,245,247,0.22)' }}>
              <Row lead={<StopDisc stop={s} look={look} />} title={[look === 'japan' ? s.data.localName : null, s.title].filter(Boolean).join(' ')} sub={s.data.about ?? null} lines={1} onPress={() => open(s.id)} />
              <Button title="Add to the line" size="sm" variant="secondary" onPress={() => toast.show({ message: `${s.title} is on the line`, icon: 'check', undo: addToLine(ctx, s.id) })} />
            </View>
          ))}
        </View>
      ) : null}
      <AddStop visible={adding} onClose={() => setAdding(false)} ctx={ctx} trip={d.trip} have={new Set([...d.line, ...d.ideas, ...d.airports].map((s) => s.title.toLowerCase()))} />
    </View>
  );
}

const addDay = (day: string, n: number) => {
  const x = new Date(`${day}T12:00:00`);
  x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

function AddStop({ visible, onClose, ctx, trip, have }: { visible: boolean; onClose: () => void; ctx: LifeOSContext; trip: ObjectRecord<TripData>; have: Set<string> }) {
  const toast = useToast();
  const t = useTheme();
  const [name, setName] = useState('');
  const [idea, setIdea] = useState(false);
  const presets = (PRESETS[trip.data.look ?? ''] ?? []).filter(([n]) => !have.has(n.toLowerCase()));
  const add = (n: string, local?: string, lat?: number, lng?: number) => {
    if (!n.trim()) return;
    const { stop, created } = ensureStop(ctx, trip.id, n, { kind: idea ? 'idea' : 'stop', localName: local, coordinates: lat != null && lng != null ? { lat, lng } : undefined });
    toast.show({ message: created ? `${stop.title} added${idea ? ' as an idea' : ' to the line'}` : `${stop.title} is already here`, icon: 'check', undo: created ? () => ctx.records.delete(stop.id, 'user') : undefined });
    setName('');
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add a stop">
      <View style={{ gap: 14 }}>
        <TextField label="Name" value={name} onChange={setName} placeholder="Takayama" returnKeyType="done" onSubmitEditing={() => add(name)} />
        <Segmented options={[{ value: 'stop', label: 'On the line' }, { value: 'idea', label: 'An idea' }]} value={idea ? 'idea' : 'stop'} onChange={(v) => setIdea(v === 'idea')} />
        <Button title="Add" icon="plus" onPress={() => add(name)} disabled={!name.trim()} />
        {presets.length ? (
          <View style={{ gap: 8 }}>
            <Caps>Common places</Caps>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {presets.map(([n, local, lat, lng]) => (
                <Pressable key={n} accessibilityRole="button" accessibilityLabel={`Add ${n}`} onPress={() => add(n, local, lat, lng)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.7 : 1 })}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: t.c.fg.secondary }}>{local}</Text>
                  <Text style={{ fontSize: 14, fontWeight: '600' }}>{n}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Days                                                                 */
/* ------------------------------------------------------------------ */

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function DaysView({ d, ctx }: { d: PlanData; ctx: LifeOSContext }) {
  const router = useRouter();
  const toast = useToast();
  const t = useTheme();
  const look = d.trip.data.look;
  const byId = useMemo(() => new Map([...d.line, ...d.ideas, ...d.airports].map((s) => [s.id, s])), [d]);
  const night = useMemo(() => new Map(d.nights.map((n) => [n.day, n])), [d.nights]);
  const moves = movingDays(d.nights);
  const { startDate, endDate } = d.trip.data;
  if (!startDate || !endDate) return <Note icon="calendar">Give the trip its dates and each night shows here with its stop.</Note>;

  // Whole weeks, Monday first, from the trip's first to its last day.
  const first = new Date(`${startDate}T12:00:00`);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const cells: string[] = [];
  for (let x = new Date(first); ; x.setDate(x.getDate() + 1)) {
    const day = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    cells.push(day);
    if (day >= endDate && cells.length % 7 === 0) break;
  }
  const shareIcs = async () => {
    const text = tripIcs(ctx, d.trip);
    const name = `${d.trip.title.replace(/[^\w-]+/g, '-').toLowerCase()}.ics`;
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
      toast.show({ message: 'Couldn’t make the calendar file', icon: 'alert' });
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <View style={{ padding: 12, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 6 }}>
        <View style={{ flexDirection: 'row' }}>
          {DOW.map((x, i) => (
            <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: t.c.fg.tertiary }}>{x}</Text>
          ))}
        </View>
        {Array.from({ length: cells.length / 7 }, (_, w) => (
          <View key={w} style={{ flexDirection: 'row', gap: 0 }}>
            {cells.slice(w * 7, w * 7 + 7).map((day) => {
              const inTrip = day >= startDate && day <= endDate;
              const n = night.get(day);
              const s = n?.stopId ? byId.get(n.stopId) : undefined;
              const dd = Number(day.slice(8));
              const moving = moves.some((m) => m.day === day);
              return (
                <View key={day} accessibilityLabel={`${dayLabel(day)}${s ? `, ${s.title}` : n?.kind === 'air' ? ', on the plane' : n?.kind === 'gap' ? ', no bed booked' : ''}`} style={{ flex: 1, height: 58, alignItems: 'center', gap: 3, opacity: inTrip ? 1 : 0.3 }}>
                  <Text style={{ fontSize: 13, lineHeight: 16, fontWeight: moving ? '800' : '600', color: moving ? WHITE : t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{dd === 1 ? `${dd} ${MONTHS[Number(day.slice(5, 7)) - 1]}` : dd}</Text>
                  {s ? <StopDisc stop={s} look={look} size={26} /> : n?.kind === 'air' ? <Icon name="plane" size={16} color={t.c.fg.secondary} /> : n?.kind === 'gap' ? <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed', borderColor: CORAL }} /> : null}
                </View>
              );
            })}
          </View>
        ))}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingTop: 6 }}>
          <Legend icon="plane" label="On the plane" />
          <Legend dashed label={`No bed booked · ${d.nights.filter((x) => x.kind === 'gap').length}`} />
          <Legend bold label={`Moving day · ${moves.length}`} />
        </View>
      </View>
      <Button title="Add to my calendar" icon="calendar" variant="secondary" onPress={shareIcs} />

      {moves.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Moving days" sub={plural(moves.length, 'journey')} />
          <RowCard>
            {moves.map((m) => {
              const a = byId.get(m.fromStopId), b = byId.get(m.toStopId);
              return <Row key={m.day} lead={b ? <StopDisc stop={b} look={look} /> : undefined} title={`${a?.title ?? '?'} → ${b?.title ?? '?'}`} sub={dayLabel(m.day)} onPress={() => router.push(dayRoute(d.trip.id, m.day, 'travel') as never)} />;
            })}
          </RowCard>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHead title="Day by day" sub={plural(d.nights.length + 1, 'day')} />
        <RowCard>
          {[...d.nights.map((n) => n.day), endDate].map((day) => {
            const n = night.get(day);
            const s = n?.stopId ? byId.get(n.stopId) : undefined;
            const plan = d.plans.get(day);
            return <Row key={day} minHeight={52} lines={2} onPress={() => router.push(dayRoute(d.trip.id, day) as never)} lead={<View style={{ width: 40, alignItems: 'center' }}><Text style={{ fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{day.slice(8)}</Text><Text style={{ fontSize: 10, fontWeight: '700', color: t.c.fg.tertiary }}>{dayLabel(day).slice(0, 3).toUpperCase()}</Text></View>} title={s?.title ?? (n?.kind === 'air' ? 'On the plane' : day === endDate ? 'Fly home' : 'No bed booked')} sub={plan ? plan.split('\n')[0]! : null} />;
          })}
        </RowCard>
      </View>
    </View>
  );
}

function Legend({ icon, dashed, bold, label }: { icon?: 'plane'; dashed?: boolean; bold?: boolean; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon ? <Icon name={icon} size={13} color={t.c.fg.secondary} /> : dashed ? <View style={{ width: 13, height: 13, borderRadius: 7, borderWidth: 1.5, borderStyle: 'dashed', borderColor: CORAL }} /> : bold ? <Text style={{ fontSize: 12, fontWeight: '800' }}>26</Text> : null}
      <Text style={{ fontSize: 12, color: t.c.fg.secondary }}>{label}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Map (drawn, as Places draws maps until a provider is chosen)         */
/* ------------------------------------------------------------------ */

function MapView({ d }: { d: PlanData }) {
  const router = useRouter();
  const t = useTheme();
  const look = d.trip.data.look;
  const shown = [...d.line, ...d.airports, ...d.ideas].filter((s) => d.pins.has(s.id));
  if (!shown.length) return <Note icon="map">Stops with a pin show here: give a stop’s Place its pin, or add it from the common places.</Note>;
  const W = 350, H = 380, P = 34;
  const pts = shown.map((s) => d.pins.get(s.id)!);
  const lat0 = Math.min(...pts.map((p) => p.lat)), lat1 = Math.max(...pts.map((p) => p.lat));
  const lng0 = Math.min(...pts.map((p) => p.lng)), lng1 = Math.max(...pts.map((p) => p.lng));
  const k = Math.cos(((lat0 + lat1) / 2) * (Math.PI / 180));
  const sx = (W - 2 * P) / Math.max(0.05, (lng1 - lng0) * k), sy = (H - 2 * P) / Math.max(0.05, lat1 - lat0);
  const sc = Math.min(sx, sy);
  const ox = (W - (lng1 - lng0) * k * sc) / 2, oy = (H - (lat1 - lat0) * sc) / 2;
  const xy = (p: { lat: number; lng: number }) => ({ x: ox + (p.lng - lng0) * k * sc, y: H - (oy + (p.lat - lat0) * sc) });
  const line = d.line.filter((s) => d.pins.has(s.id));
  return (
    <View style={{ gap: 12 }}>
      <View style={{ borderRadius: 28, overflow: 'hidden', backgroundColor: t.c.bg.tile }}>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} accessibilityLabel={`Map of ${d.trip.title}: ${line.map((s) => s.title).join(', ')}`}>
          {line.slice(1).map((s, i) => {
            const a = xy(d.pins.get(line[i]!.id)!), b = xy(d.pins.get(s.id)!);
            return <SvgLine key={s.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={stopHex(line[i]!)} strokeWidth={4} strokeLinecap="round" />;
          })}
          {shown.map((s) => {
            const p = xy(d.pins.get(s.id)!);
            const idea = s.data.kind !== 'stop';
            return <Circle key={s.id} cx={p.x} cy={p.y} r={idea ? 6 : 10} fill={idea ? t.c.bg.tile : stopHex(s)} stroke={stopHex(s)} strokeWidth={2} strokeDasharray={s.data.kind === 'idea' ? '3 3' : undefined} onPress={() => router.push(`/entity/stop/${s.id}` as never)} />;
          })}
          {/* Only the line is labelled, alternately above and below, so stops close together stay readable. */}
          {line.map((s, i) => {
            const p = xy(d.pins.get(s.id)!);
            const right = p.x < W - 90;
            return (
              <SvgText key={`l-${s.id}`} x={right ? p.x + 13 : p.x - 13} y={i % 2 ? p.y + 17 : p.y - 9} textAnchor={right ? 'start' : 'end'} fontSize={11} fontWeight="700" fontFamily={fonts[700]} fill={WHITE}>
                {s.title}
              </SvgText>
            );
          })}
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingHorizontal: 4 }}>
        <Text style={{ fontSize: 12, color: t.c.fg.secondary }}>● Stop</Text>
        <Text style={{ fontSize: 12, color: t.c.fg.secondary }}>◌ Idea, not on the line</Text>
        <Text style={{ fontSize: 12, color: t.c.fg.secondary }}>○ Airport</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {line.map((s) => (
          <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={s.title} onPress={() => router.push(`/entity/stop/${s.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingLeft: 4, paddingRight: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
            <StopDisc stop={s} look={look} size={32} />
            <Text style={{ fontSize: 14, fontWeight: '600' }}>{s.title}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The line on the trip page                                            */
/* ------------------------------------------------------------------ */

/** The trip page's card: its stops as discs in order, with nights, and the way into Plan. */
export function LineCard({ tripId }: { tripId: string }) {
  const router = useRouter();
  const t = useTheme();
  const d = usePlan(tripId);
  const b = useLive((os) => {
    const stays = tripStays(os, tripId);
    return { stays: stays.filter((e) => statusOf(e) !== 'cancelled').length, tickets: tripTickets(os, tripId).length, toPay: stayMoney(stays).toPay };
  }, [tripId]);
  if (!d) return null;
  const nights = d.nights.filter((n) => n.kind === 'stay').length;
  const moves = movingDays(d.nights).length;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="The line" sub={d.line.length ? [plural(d.line.length, 'stop'), nights ? plural(nights, 'night') : null, moves ? plural(moves, 'move') : null].filter(Boolean).join(' · ') : 'Where you’ll sleep, in order'} action="Plan" chevron onAction={() => router.push(planRoute(tripId) as never)} />
      <Pressable accessibilityRole="button" accessibilityLabel="Open the plan" onPress={() => router.push(planRoute(tripId) as never)} style={{ padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
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
          <Row lead={<Icon name="bag" size={18} color={t.c.fg.secondary} />} title="Bookings" sub={[plural(b.stays, 'stay'), b.tickets ? plural(b.tickets, 'ticket') : null, ...Object.entries(b.toPay).filter(([, n]) => n > 0.5).map(([cur, n]) => `${amount(n, cur)} to pay`)].filter(Boolean).join(' · ')} trailing={<Icon name="chevron-right" size={18} color={t.c.fg.secondary} />} onPress={() => router.push(bookingsRoute(tripId) as never)} />
        </RowCard>
      ) : null}
    </View>
  );
}
