import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import { KIT_PRESETS, createPlayer, duesTexts, editPlayer, faceStats, isDone, mePersonId, playerInputOf, ratingPlayer, rupees, setAvailability, squadData, squadRatings, statsFor, turfBase, turfDues, type AvailabilityInput, type GameData, type PlayerInput, type PlayerProfileData } from '@modules/games';
import { statsCardText } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { OnBlock, useTheme } from '@ui/theme/ThemeProvider';
import { blocks, displayFont, fonts, monoFonts } from '@ui/theme/tokens';
import { Button, DateField, EmptyState, FilterChip, Icon, IconButton, NumberField, Screen, Text, TextField, Toggle, useToast } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Face, SyncPill } from './teams';
import { CopyShare } from './switcher';
import { type Props, shortDay, useBack } from './common';
import { availabilityColour } from './players';

/**
 * Turf · Noir 6 Player profile (TF-Player), 6b the stats card (TF-StatsCard)
 * and the player form (no artboard: TF-VenueEdit's inputs, labels and chips).
 * Players are keyed by their Person; the screens take the Player profile
 * record's id.
 */

type Avail = PlayerProfileData['availability'];
type Period = NonNullable<PlayerProfileData['periods']>[number];

const STATUS: Array<{ value: Avail; label: string }> = [
  { value: 'AVL', label: 'Available' },
  { value: 'INJ', label: 'Injured' },
  { value: 'OOS', label: 'Out of station' },
];
const statusLabel = (a: Avail) => STATUS.find((s) => s.value === a)?.label ?? 'Available';
const WEEKLY: Array<{ value: NonNullable<PlayerProfileData['weekly']>; label: string }> = [
  { value: 'all_week', label: 'All week' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
];
const MODES: Array<{ value: NonNullable<PlayerProfileData['availabilityMode']>; label: string }> = [
  { value: 'regular', label: 'Regular' },
  { value: 'window_only', label: 'Only in windows' },
];

/** The six attributes as the chart and the card name them, in the artboard's order (clockwise from the top). */
const OUTFIELD: Array<[string, string]> = [['PAC', 'Pace'], ['PHY', 'Stamina'], ['DEF', 'Defending'], ['PAS', 'Passing'], ['DRI', 'Dribbling'], ['SHO', 'Shooting']];
const KEEPER: Array<[string, string]> = [['DIV', 'Diving'], ['HAN', 'Handling'], ['KIC', 'Kicking'], ['REF', 'Reflexes'], ['SPE', 'Speed'], ['POS', 'Positioning']];
const PROFILE_ATTRS: Array<[keyof PlayerProfileData, string]> = [['pace', 'Pace'], ['stamina', 'Stamina'], ['defending', 'Defending'], ['passing', 'Passing'], ['dribbling', 'Dribbling'], ['shooting', 'Shooting']];

const firstOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const day = (iso: string) => new Date(`${iso}T12:00:00`);
const today = () => format(new Date(), 'yyyy-MM-dd');

/** The six on the card's scale, labelled and in chart order. */
function attributesOf(p: PlayerProfileData) {
  const face = faceStats(ratingPlayer(p));
  const by = new Map(face.stats);
  return { keeper: face.keeper, stats: (face.keeper ? KEEPER : OUTFIELD).map(([k, label]) => ({ label, value: by.get(k) ?? 0 })) };
}

/** "ST · Poacher · right foot". */
function roleLine(p: PlayerProfileData) {
  const foot = p.preferredFoot?.trim().toLowerCase();
  return [p.position, p.speciality || p.playingStyle, foot ? (foot === 'both' ? 'both feet' : `${foot} foot`) : null].filter(Boolean).join(' · ');
}

/** Kit colours as written ("#A50044, #004D98", "Red / Navy"): swatches for what reads as a colour, the rest as words. */
function kitSwatches(text: string | undefined) {
  const swatches: string[] = [];
  const words: string[] = [];
  for (const raw of (text ?? '').split(/[,/&+]|\band\b/i)) {
    const v = raw.trim();
    if (!v) continue;
    if (/^#?[0-9a-f]{6}$/i.test(v)) swatches.push(v.startsWith('#') ? v : `#${v}`);
    else {
      const preset = KIT_PRESETS.find((k) => k.name.toLowerCase() === v.toLowerCase());
      if (preset) swatches.push(preset.hex);
      else words.push(v);
    }
  }
  return { swatches, words };
}

/** "2 – 9 Nov", "28 Oct – 3 Nov", "from 2 Nov". */
function rangeText(from: string, to?: string | null) {
  const a = day(from);
  if (!to) return `from ${format(a, 'd MMM')}`;
  const b = day(to);
  if (from === to) return format(a, 'd MMM');
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() ? `${format(a, 'd')} – ${format(b, 'd MMM')}` : `${format(a, 'd MMM')} – ${format(b, 'd MMM')}`;
}
const whenOf = (p: Period, now = today()) => (p.endsAt && p.endsAt < now ? 'past' : p.startsAt > now ? 'upcoming' : 'now');

function useProfile(id: string | undefined) {
  return useLive((o) => {
    const r = id ? o.records.get<PlayerProfileData>(id) : undefined;
    return r && r.object === 'player' && !r.archived ? (r as ObjectRecord<PlayerProfileData>) : null;
  }, [id]);
}

function Missing({ title }: { title: string }) {
  const back = useBack();
  return (
    <Screen title={title} subtitle="Turf › Players" onBack={back}>
      <EmptyState icon="user" line="That player isn’t here any more." />
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* The attributes chart                                                */
/* ------------------------------------------------------------------ */

const CX = 118;
const CY = 118;
const R = 90;
/** Label anchors from the artboard, clockwise from the top. */
const LABEL_AT: Array<[number, number]> = [[118, 14], [211.5, 68], [211.5, 176], [118, 230], [24.5, 176], [24.5, 68]];
const point = (i: number, v: number) => {
  const a = (-90 + i * 60) * (Math.PI / 180);
  return [CX + Math.cos(a) * R * v, CY + Math.sin(a) * R * v] as const;
};
const ring = (v: number) => Array.from({ length: 6 }, (_, i) => point(i, v).map((n) => n.toFixed(1)).join(',')).join(' ');

/** A hexagon of the six (out of 100), rings at a quarter each, the shape lime. */
function AttributesChart({ stats }: { stats: Array<{ label: string; value: number }> }) {
  const t = useTheme();
  const shape = stats.map((s, i) => point(i, Math.max(0, Math.min(100, s.value)) / 100));
  const pts = shape.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  return (
    <Svg width={236} height={246} viewBox="0 0 236 246" accessibilityLabel={stats.map((s) => `${s.label} ${s.value}`).join(', ')}>
      {[0.25, 0.5, 0.75, 1].map((v) => (
        <Polygon key={v} points={ring(v)} fill="none" stroke={t.c.fg.primary} strokeWidth={1} opacity={v === 1 ? 0.22 : 0.1} />
      ))}
      {stats.map((s, i) => {
        const [x, y] = point(i, 1);
        const [lx, ly] = LABEL_AT[i]!;
        return (
          <G key={s.label}>
            <Line x1={CX} y1={CY} x2={x} y2={y} stroke={t.c.fg.primary} strokeWidth={1} opacity={0.1} />
            <SvgText x={lx} y={ly} textAnchor="middle" fontSize={11} fontFamily={fonts[600]} fill={t.c.fg.secondary}>
              {s.label}
            </SvgText>
            <SvgText x={lx} y={ly + 14} textAnchor="middle" fontSize={11} fontFamily={fonts[700]} fill={t.c.fg.primary}>
              {String(s.value)}
            </SvgText>
          </G>
        );
      })}
      <Polygon points={pts} fill={t.c.accent.mustard} opacity={0.22} />
      <Polygon points={pts} fill="none" stroke={t.c.accent.mustard} strokeWidth={2.5} strokeLinejoin="round" />
      {shape.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={4} fill={t.c.accent.mustard} />
      ))}
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* 6 · Player profile                                                  */
/* ------------------------------------------------------------------ */

/** The warm backdrop where a photo goes (TF-Player's hero, without the blur). */
const BLOBS: Array<[number, number, number, string, number]> = [
  [-35, 543, 250, '#E0A98E', 0.44],
  [35, 208, 223, '#C98B74', 0.51],
  [94, 341, 228, '#E0A98E', 0.71],
  [214, 191, 132, '#C98B74', 0.61],
  [199, 797, 301, '#E0A98E', 0.74],
  [335, 252, 209, '#8A5A52', 0.69],
  [148, 556, 283, '#C98B74', 0.58],
];
function Backdrop() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <Svg width="100%" height={1180} viewBox="0 0 390 1180" preserveAspectRatio="xMidYMin slice">
        <Defs>
          <LinearGradient id="pl-bg" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#5A3A3C" />
            <Stop offset="0.55" stopColor="#2B1A1F" />
            <Stop offset="1" stopColor="#120C0E" />
          </LinearGradient>
          {['#E0A98E', '#C98B74', '#8A5A52'].map((c) => (
            <RadialGradient key={c} id={`pl-${c.slice(1)}`} cx="0.5" cy="0.5" r="0.5">
              <Stop offset="0" stopColor={c} stopOpacity={1} />
              <Stop offset="0.55" stopColor={c} stopOpacity={0.6} />
              <Stop offset="1" stopColor={c} stopOpacity={0} />
            </RadialGradient>
          ))}
          <RadialGradient id="pl-glow" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#FFD6BE" stopOpacity={0.55} />
            <Stop offset="1" stopColor="#FFD6BE" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="pl-shade" cx="0.5" cy="0.5" r="0.5">
            <Stop offset="0" stopColor="#000000" stopOpacity={0.35} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="pl-dim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.4" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.35} />
          </LinearGradient>
          <LinearGradient id="pl-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0B0B0D" stopOpacity={0} />
            <Stop offset="1" stopColor="#0B0B0D" stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={390} height={1180} fill="url(#pl-bg)" />
        <Ellipse cx={195} cy={507} rx={110} ry={320} fill="url(#pl-shade)" />
        <Circle cx={312} cy={78} r={117} fill="url(#pl-glow)" />
        {BLOBS.map(([x, y, s, c, op], i) => (
          <Circle key={i} cx={x + s / 2} cy={y + s / 2} r={s / 2} fill={`url(#pl-${c.slice(1)})`} opacity={op} />
        ))}
        <Rect x={0} y={0} width={390} height={1180} fill="url(#pl-dim)" />
        <Rect x={0} y={880} width={390} height={300} fill="url(#pl-fade)" />
      </Svg>
    </View>
  );
}

/** A round 40 button over the photo: a dark see-through disc with a light hairline. */
function GlassButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4} onPress={onPress} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#FFFFFF24', backgroundColor: '#16161A80', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
      <Icon name={icon} size={17} color="#F5F5F7" />
    </Pressable>
  );
}

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: bg }}>
      <Text variant="labelMicro" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const Hairline = () => {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line }} />;
};

export function TurfPlayer({ ctx, params }: Props) {
  const t = useTheme();
  const router = useRouter();
  const back = useBack();
  const insets = useSafeAreaInsets();
  const { busy, pull } = usePull();
  const profile = useProfile(params.player);
  const d = useLive(
    (o) => {
      if (!profile) return null;
      const pid = profile.data.personId;
      const me = mePersonId(o);
      const dues = turfDues(o).people.filter((p) => p.playerId === pid);
      return {
        stats: statsFor(o, pid),
        rating: squadRatings(o).players.get(pid) ?? null,
        me: pid === me,
        dues: dues.flatMap((p) => p.games.map((g) => ({ p, g, fronted: o.records.get<GameData>(g.gameId)?.data.frontedById ?? null }))),
        meId: me,
        reminder: duesTexts(o).reminder(pid),
        nameOf: (id: string | null) => (id ? o.records.get(id)?.title ?? null : null),
      };
    },
    [profile],
  );
  if (!profile || !d) return <Missing title="Player" />;
  const p = profile.data;
  const attrs = attributesOf(p);
  const missing = attrs.keeper ? (p.keeperRating == null ? ['Keeper rating'] : []) : PROFILE_ATTRS.filter(([k]) => p[k] == null).map(([, l]) => l);
  const decided = d.stats.wins + d.stats.draws + d.stats.losses;
  const [given, ...rest] = p.name.trim().split(/\s+/);
  const kit = kitSwatches(p.kitColors);
  const fanOf = [p.clubs, p.countries].filter(Boolean).join(', ');
  const extras = [p.boots ? `Boots: ${p.boots}` : null, p.favouritePlayer ? `Favourite player: ${p.favouritePlayer}` : null, p.startingLevel ? `Level: ${p.startingLevel}` : null].filter(Boolean).join(' · ');
  const periods = [...(p.periods ?? [])].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const f = (cents: number) => rupees(cents);

  const chips: Array<{ label: string; tone: 'lime' | 'white' | 'quiet' }> = [];
  if (p.position) chips.push({ label: `${p.position} · preferred`, tone: 'lime' });
  if (p.secondaryPosition) chips.push({ label: `${p.secondaryPosition} · second`, tone: 'white' });
  for (const c of (p.comfortable ?? '').split(',').map((x) => x.trim()).filter(Boolean)) if (c !== p.position && c !== p.secondaryPosition) chips.push({ label: `${c} · comfortable`, tone: 'white' });
  if (p.keeperWilling && p.position?.toUpperCase() !== 'GK') chips.push({ label: 'GK · emergency', tone: 'quiet' });
  if (p.guest) chips.push({ label: 'Guest', tone: 'quiet' });

  const stat = (value: string, label: string, i: number) => (
    <View key={label} style={{ flex: 1, minWidth: 0, gap: 2, paddingVertical: 2, paddingLeft: i ? 14 : 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: '#FFFFFF1F' }}>
      <Text variant="metric" numberOfLines={1}>
        {value}
      </Text>
      <Text variant="labelMicro" color="#FFFFFF99" numberOfLines={1} style={{ fontWeight: '500' }}>
        {label}
      </Text>
    </View>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.c.bg.ground }} contentContainerStyle={{ flexGrow: 1 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}>
      <View style={{ flexGrow: 1 }}>
        <Backdrop />
        <View style={{ paddingTop: insets.top + 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <GlassButton icon="chevron-left" label="Back" onPress={back} />
          <Text variant="label" style={{ flex: 1, textAlign: 'center' }}>
            Player
          </Text>
          <GlassButton icon="edit" label="Edit player" onPress={() => router.push(`/board/turf/player-edit?player=${profile.id}` as never)} />
          <GlassButton icon="send" label="Stats card" onPress={() => router.push(`/board/turf/card?player=${profile.id}` as never)} />
        </View>
        <View style={{ marginTop: 170, flexGrow: 1, paddingTop: 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 24, gap: 14, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#16161A9E', borderTopWidth: 1, borderTopColor: '#FFFFFF1F' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="body" style={{ fontSize: 36, lineHeight: 38, letterSpacing: -1, fontWeight: '600' }}>
                {rest.length ? `${given}\n${rest.join(' ')}` : given}
              </Text>
              <Text variant="caption" color="#FFFFFFB3">
                {[roleLine(p), d.me ? 'you' : null].filter(Boolean).join(' · ') || 'No position yet'}
              </Text>
            </View>
            {p.jersey ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="body" color={t.c.accent.mustard} style={{ fontSize: 44, lineHeight: 44, letterSpacing: -2, fontWeight: '800' }}>
                  {p.jersey}
                </Text>
                <Text variant="mono" color="tertiary" style={{ fontSize: 9, lineHeight: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  jersey
                </Text>
              </View>
            ) : null}
          </View>
          {chips.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {chips.map((c) => (
                <Pill key={c.label} label={c.label} bg={c.tone === 'lime' ? t.c.accent.mustard : c.tone === 'white' ? t.c.fg.primary : t.c.bg.dim} fg={c.tone === 'quiet' ? t.c.fg.secondary : t.c.bg.ground} />
              ))}
            </View>
          ) : null}
          <Hairline />

          <View style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="tileTitle">Attributes</Text>
                <Text variant="caption" color="secondary" style={{ fontWeight: '500' }}>
                  six, from the profile
                </Text>
              </View>
              {d.rating ? (
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                  <Text variant="body" style={{ fontSize: 26, lineHeight: 30, fontWeight: '800' }}>
                    {String(d.rating.overall)}
                  </Text>
                  <Text variant="caption" color="tertiary">
                    overall
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={{ alignItems: 'center' }}>
              <AttributesChart stats={attrs.stats} />
            </View>
            {missing.length ? (
              <Text variant="caption" color="tertiary">
                {missing.length === PROFILE_ATTRS.length ? 'No attributes on the profile yet' : `${missing.join(', ')} ${missing.length === 1 ? 'isn’t' : 'aren’t'} rated yet`} — shown 5 under the base overall; treat it as a guess.
              </Text>
            ) : null}
            {d.rating ? (
              <Text variant="caption" color="tertiary">
                {`Profile ${d.rating.base} · form ${d.rating.boost > 0 ? '+' : ''}${d.rating.boost} over ${plural(d.rating.matches, 'rated match', 'rated matches')}${d.rating.formScore !== null ? ` · last five ${d.rating.formScore.toFixed(1)}` : ''}${d.rating.provisional ? ' · provisional' : ''}`}
              </Text>
            ) : null}
          </View>
          <Hairline />

          <View style={{ flexDirection: 'row', gap: 14 }}>{[stat(String(d.stats.games), 'apps', 0), stat(String(d.stats.goals), 'goals', 1), stat(String(d.stats.assists), 'assists', 2)]}</View>
          <View style={{ flexDirection: 'row', gap: 14 }}>{[stat(String(d.stats.saves), 'saves', 0), stat(String(d.stats.wins), 'wins', 1), stat(decided ? `${Math.round((d.stats.wins / decided) * 100)}%` : '—', 'win rate', 2)]}</View>
          <Hairline />

          {kit.swatches.length || kit.words.length || fanOf ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text variant="caption" color="tertiary">
                Kit
              </Text>
              {kit.swatches.map((hex, i) => (
                <View key={`${hex}${i}`} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: hex, borderWidth: 1.5, borderColor: '#FFFFFF40' }} />
              ))}
              <Text variant="caption" color="secondary" style={{ flexShrink: 1 }}>
                {[kit.words.join(', '), fanOf].filter(Boolean).map((x, i) => (i || kit.swatches.length ? `· ${x}` : x)).join(' ') || ''}
              </Text>
            </View>
          ) : null}
          {extras ? (
            <Text variant="caption" color="secondary">
              {extras}
            </Text>
          ) : null}

          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: availabilityColour(p.availability, t) }} />
              <Text variant="caption" style={{ flex: 1, fontWeight: '600' }}>
                {[statusLabel(p.availability), WEEKLY.find((w) => w.value === (p.weekly ?? 'all_week'))!.label.toLowerCase(), p.availabilityMode === 'window_only' ? 'only in windows' : 'regular'].join(' · ')}
              </Text>
              {periods.length ? (
                <Text variant="caption" color="tertiary">
                  periods
                </Text>
              ) : null}
            </View>
            {periods.map((x, i) => (
              <View key={x.id ?? i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: availabilityColour(x.status, t) }} />
                <Text variant="caption" color="secondary" style={{ flex: 1 }}>
                  {[statusLabel(x.status), rangeText(x.startsAt, x.endsAt), x.note].filter(Boolean).join(' · ')}
                </Text>
                <Text variant="caption" color="tertiary">
                  {whenOf(x)}
                </Text>
              </View>
            ))}
          </View>
          <Hairline />

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 6, paddingHorizontal: 4 }}>
              <Text variant="heading">{d.me ? 'Your dues' : `${firstOf(p.name)}’s dues`}</Text>
              <Text variant="caption" color="secondary" style={{ fontWeight: '600' }}>
                {d.dues.length ? `${d.dues.length} open` : 'all paid'}
              </Text>
            </View>
            {d.dues.map(({ p: due, g, fronted }) => {
              const pill = due.direction === 'owes_you' ? { label: `owes you ${f(g.balanceCents)}`, bg: t.c.accent.mustardSoft, fg: t.c.accent.mustard } : due.direction === 'you_owe' ? { label: `you owe ${f(g.balanceCents)}`, bg: t.c.alert.coralFill, fg: t.c.alert.coralText } : { label: `owes ${due.creditorName ? firstOf(due.creditorName) : 'the fronter'} ${f(g.balanceCents)}`, bg: t.c.bg.dim, fg: t.c.fg.secondary };
              const who = fronted ? (fronted === d.meId ? 'you fronted' : `${d.nameOf(fronted) ?? 'someone'} fronted`) : null;
              return (
                <Pressable key={`${due.direction}${g.gameId}`} accessibilityRole="button" accessibilityLabel={`${shortDay(g.date)}, ${pill.label}`} onPress={() => router.push(`/board/turf/game?game=${g.gameId}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, opacity: pressed ? 0.75 : 1 })}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="activity" size={17} color={t.c.accent.mustard} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text variant="rowTitle" numberOfLines={1}>
                      {`${shortDay(g.date)} · ${g.venue}`}
                    </Text>
                    <Text variant="caption" color="secondary" numberOfLines={1}>
                      {[`${f(g.shareCents)} share`, g.paidCents ? `${f(g.paidCents)} paid` : null, who].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Pill label={pill.label} bg={pill.bg} fg={pill.fg} />
                </Pressable>
              );
            })}
            {d.dues.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                <Button title="Settle up" variant="secondary" size="sm" style={{ height: 40 }} onPress={() => router.push('/board/turf/dues' as never)} />
                <CopyShare text={d.reminder} what="Reminder copied" />
              </View>
            ) : (
              <Text variant="caption" color="tertiary" style={{ paddingHorizontal: 4 }}>
                Nothing open with {d.me ? 'you' : firstOf(p.name)}.
              </Text>
            )}
          </View>
          {p.notes ? (
            <>
              <Hairline />
              <Text variant="caption" color="secondary">
                {p.notes}
              </Text>
            </>
          ) : null}
          <Text variant="caption" color="tertiary">
            Spent on turf {ctx.format.currency(d.stats.paid)}
            {d.stats.unpaid ? ` · ${ctx.format.currency(d.stats.unpaid)} still open` : ''}
            {d.stats.lastPlayed ? ` · last played ${shortDay(d.stats.lastPlayed)}` : ''}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

/* ------------------------------------------------------------------ */
/* 6b · Stats card                                                     */
/* ------------------------------------------------------------------ */

type CardPeriod = 'season' | 'last' | 'all';
const CARD_PERIODS: Array<{ key: CardPeriod; label: string }> = [
  { key: 'season', label: 'Season' },
  { key: 'last', label: 'Last match' },
  { key: 'all', label: 'All time' },
];
const INK_60 = '#0B0B0D99';

export function TurfStatsCard({ params }: Props) {
  const back = useBack();
  const profile = useProfile(params.player);
  const [period, setPeriod] = useState<CardPeriod>('season');
  const d = useLive(
    (o) => {
      if (!profile) return null;
      const pid = profile.data.personId;
      const year = new Date().getFullYear();
      const done = squadData(o)
        .history.filter((g) => isDone(g))
        .sort((a, b) => b.date.localeCompare(a.date));
      const playedIn = (g: (typeof done)[number]) => g.participants.find((x) => x.playerId === pid && x.attendanceStatus !== 'no_show');
      const lastOwn = done.find((g) => playedIn(g));
      const games = period === 'season' ? done.filter((g) => g.date >= `${year}-01-01`) : period === 'last' ? (lastOwn ? [lastOwn] : []) : done;
      const tot = { apps: 0, goals: 0, assists: 0, saves: 0, wins: 0, draws: 0, losses: 0, potm: 0 };
      for (const g of games) {
        const me = playedIn(g);
        if (!me) continue;
        tot.apps += 1;
        tot.goals += me.goals ?? 0;
        tot.assists += me.assists ?? 0;
        tot.saves += me.saves ?? 0;
        if (g.motmPlayerId === pid) tot.potm += 1;
        if (!me.team || g.teamAScore === null || g.teamBScore === null) continue;
        const own = me.team === 'A' ? g.teamAScore : g.teamBScore;
        const against = me.team === 'A' ? g.teamBScore : g.teamAScore;
        if (own > against) tot.wins += 1;
        else if (own < against) tot.losses += 1;
        else tot.draws += 1;
      }
      const span = games.length ? [games[games.length - 1]!.date, games[0]!.date] : null;
      const months = span ? [...new Set(span.map((x) => format(day(x), 'MMM')))].join(' – ') : null;
      const venue = lastOwn ? o.records.get<GameData>(lastOwn.id)?.data.venueName ?? null : null;
      const foot =
        period === 'season'
          ? [`Season ${year}`, months, `${tot.apps} of ${games.length} played`].filter(Boolean).join(' · ')
          : period === 'last'
            ? lastOwn
              ? [`Last match · ${shortDay(lastOwn.date)}`, venue].filter(Boolean).join(' · ')
              : 'No match played yet'
            : [`All time`, span ? `since ${format(day(span[0]), 'MMM yyyy')}` : null, `${tot.apps} of ${games.length} played`].filter(Boolean).join(' · ');
      let host: string | null = null;
      try {
        const base = turfBase(o);
        host = base ? new URL(base).host : null;
      } catch {
        host = null;
      }
      return { tot, foot, host, overall: squadRatings(o).players.get(pid)?.overall ?? null };
    },
    [profile, period],
  );
  if (!profile || !d) return <Missing title="Stats card" />;
  const p = profile.data;
  const attrs = attributesOf(p);
  const line = [roleLine(p), d.overall !== null ? `overall ${d.overall}` : null].filter(Boolean).join(' · ');
  const share = () => {
    const text = `${statsCardText({ name: p.name, position: p.position ?? null, jerseyNumber: p.jersey ?? null }, d.tot)}\n\n_${d.foot}_`;
    void Share.share({ message: text }).catch(() => {});
  };
  const number = (v: number, label: string) => (
    <View key={label} style={{ flex: 1, minWidth: 0 }}>
      <Text variant="body" style={{ fontFamily: displayFont, fontSize: 36, lineHeight: 34, letterSpacing: 0.7 }}>
        {String(v)}
      </Text>
      <Text variant="labelCaps" color={INK_60} style={{ fontSize: 11, lineHeight: 14 }}>
        {label}
      </Text>
    </View>
  );

  return (
    <Screen title="Stats card" subtitle={`Player · ${p.name}`} onBack={back} right={<SyncPill />}>
      <View style={{ padding: 18, gap: 12, borderRadius: 28, backgroundColor: blocks.lime }}>
        <OnBlock>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Face id={p.personId} name={p.name} size={56} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="body" numberOfLines={1} style={{ fontFamily: displayFont, fontSize: 28, lineHeight: 25, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                {p.name}
              </Text>
              {line ? (
                <Text variant="labelMicro" color="#0B0B0D9E" numberOfLines={2} style={{ fontWeight: '700' }}>
                  {line}
                </Text>
              ) : null}
            </View>
            {p.jersey ? (
              <Text variant="body" style={{ fontFamily: displayFont, fontSize: 44, lineHeight: 40, letterSpacing: 0.9 }}>
                {p.jersey}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 6 }}>
            {number(d.tot.apps, 'APPS')}
            {number(d.tot.goals, 'GOALS')}
            {number(d.tot.assists, 'ASSISTS')}
            {number(d.tot.potm, 'POTM')}
          </View>
          <View style={{ gap: 6 }}>
            {attrs.stats.map((s) => (
              <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text variant="labelCaps" color={INK_60} numberOfLines={1} style={{ width: 64, fontSize: 11, lineHeight: 14 }}>
                  {s.label.toUpperCase()}
                </Text>
                <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: '#0B0B0D24', overflow: 'hidden' }}>
                  <View style={{ width: `${Math.max(0, Math.min(100, s.value))}%`, height: 6, borderRadius: 3, backgroundColor: '#0B0B0D' }} />
                </View>
                <Text variant="labelMicro" style={{ width: 24, textAlign: 'right', fontWeight: '800' }}>
                  {String(s.value)}
                </Text>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text variant="mono" color={INK_60} numberOfLines={1} style={{ flexShrink: 1, fontSize: 9, lineHeight: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              {d.foot}
            </Text>
            {d.host ? (
              <Text variant="mono" numberOfLines={1} style={{ fontFamily: monoFonts[700], fontSize: 9, lineHeight: 12, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {d.host}
              </Text>
            ) : null}
          </View>
        </OnBlock>
      </View>
      <Text variant="caption" color="tertiary">
        Share sends it as text, ready for WhatsApp: apps, goals, assists, the record and player of the match.
      </Text>
      <Button title="Share" icon="send" block style={{ height: 48 }} onPress={share} />
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        {CARD_PERIODS.map((x) => (
          <FilterChip key={x.key} label={x.label} selected={period === x.key} onPress={() => setPeriod(x.key)} />
        ))}
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Edit player                                                         */
/* ------------------------------------------------------------------ */

const POSITION_CODES = ['GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST', 'CF'];
const FEET = ['Right', 'Left', 'Both'];
const LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];
const ATTRS: Array<[keyof PlayerInput & ('pace' | 'stamina' | 'defending' | 'passing' | 'dribbling' | 'shooting'), string]> = [['pace', 'Pace'], ['stamina', 'Stamina'], ['defending', 'Defending'], ['passing', 'Passing'], ['dribbling', 'Dribbling'], ['shooting', 'Shooting']];

/** TF-VenueEdit's label: 15/600, white. */
function Label({ children, hint }: { children: string; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
      <Text variant="tileTitle" style={{ lineHeight: 20 }}>
        {children}
      </Text>
      {hint ? (
        <Text variant="caption" color="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Label hint={hint}>{label}</Label>
      {children}
    </View>
  );
}
function Chips({ options, value, onChange, multi }: { options: string[]; value: string[]; onChange: (v: string[]) => void; multi?: boolean }) {
  const all = [...options, ...value.filter((v) => !options.includes(v))];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {all.map((o) => {
        const on = value.includes(o);
        return <FilterChip key={o} label={o} selected={on} onPress={() => onChange(multi ? (on ? value.filter((x) => x !== o) : [...value, o]) : on ? [] : [o])} />;
      })}
    </View>
  );
}
/** 1–5 as five round 40 chips; tap the chosen one again to clear. */
function Rating({ label, value, onChange }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text variant="label" style={{ flex: 1 }}>
        {label}
      </Text>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value === n;
        return (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${label} ${n}`} accessibilityState={{ selected: on }} onPress={() => onChange(on ? undefined : n)} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.c.fg.primary : pressed ? t.c.bg.pressed : t.c.bg.tileRaised })}>
            <Text variant="label" color={on ? t.c.bg.ground : 'primary'}>
              {String(n)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Label>{label}</Label>
        {hint ? (
          <Text variant="caption" color="tertiary">
            {hint}
          </Text>
        ) : null}
      </View>
      <Toggle value={value} onChange={onChange} accessibilityLabel={label} />
    </View>
  );
}

type EditPeriod = { status: Avail; startsAt: string; endsAt: string; note: string };

export function TurfPlayerEdit({ params }: Props) {
  const t = useTheme();
  const os = useOS();
  const back = useBack();
  const toast = useToast();
  const { pull } = usePull();
  const id = params.player || undefined;
  const profile = useProfile(id);
  const start = useMemo(() => (id ? playerInputOf(os, id) : null) ?? { name: '' }, [os, id]);
  const startAvail = useMemo(
    () => ({
      mode: profile?.data.availabilityMode ?? 'regular',
      weekly: profile?.data.weekly ?? 'all_week',
      periods: (profile?.data.periods ?? []).map((x) => ({ status: x.status, startsAt: x.startsAt, endsAt: x.endsAt ?? '', note: x.note ?? '' })),
    }),
    // Only the profile it opened with: a sync while editing doesn't overwrite the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile?.id],
  );
  const [v, setV] = useState<PlayerInput>(start);
  const [mode, setMode] = useState<AvailabilityInput['mode']>(startAvail.mode);
  const [weekly, setWeekly] = useState<AvailabilityInput['weekly']>(startAvail.weekly);
  const [periods, setPeriods] = useState<EditPeriod[]>(startAvail.periods);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof PlayerInput>(k: K, value: PlayerInput[K]) => setV((x) => ({ ...x, [k]: value }));
  const str = (k: keyof PlayerInput) => (typeof v[k] === 'string' ? (v[k] as string) : '');
  const list = (s: string | undefined) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);

  if (id && !profile) return <Missing title="Edit player" />;

  const setPeriod = (i: number, patch: Partial<EditPeriod>) => setPeriods((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const save = () => {
    if (!v.name.trim()) return setError('Give them a name');
    setError(null);
    const avail: AvailabilityInput = { mode, weekly, periods: periods.map((p) => ({ status: p.status, startsAt: p.startsAt, endsAt: p.endsAt || null, note: p.note.trim() || null })) };
    const availChanged = JSON.stringify({ mode, weekly, periods }) !== JSON.stringify(startAvail);
    const changed = JSON.stringify(v) !== JSON.stringify(start);
    try {
      if (id) {
        if (changed) editPlayer(os, id, v);
        if (availChanged) setAvailability(os, id, avail);
        toast.show({ message: changed || availChanged ? `${v.name.trim()} saved · sending to Turf web` : 'Nothing changed', icon: 'check' });
      } else {
        const made = createPlayer(os, v);
        if (availChanged) setAvailability(os, made.profileId, avail);
        toast.show({ message: `${v.name.trim()} added · sending to Turf web`, icon: 'check' });
      }
      void pull(true);
      back();
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  const swatchOn = (name: string) => list(v.kitColors).some((x) => x.toLowerCase() === name.toLowerCase());
  const toggleSwatch = (name: string) => set('kitColors', (swatchOn(name) ? list(v.kitColors).filter((x) => x.toLowerCase() !== name.toLowerCase()) : [...list(v.kitColors), name]).join(', ') || undefined);

  return (
    <Screen title={id ? 'Edit player' : 'Add player'} subtitle="Turf › Players" onBack={back} right={<SyncPill />} contentStyle={{ gap: 14 }}>
      <Field label="Name">
        <TextField value={v.name} onChange={(s) => set('name', s)} placeholder="As the squad calls them" autoCapitalize="words" error={error ?? undefined} />
      </Field>
      <Field label="Phone">
        <TextField value={str('phone')} onChange={(s) => set('phone', s || undefined)} placeholder="For reminders on WhatsApp" keyboardType="phone-pad" leading="phone" />
      </Field>
      <Field label="Email">
        <TextField value={str('email')} onChange={(s) => set('email', s || undefined)} placeholder="Optional" keyboardType="email-address" autoCapitalize="none" />
      </Field>
      <Field label="UPI id">
        <TextField value={str('upi')} onChange={(s) => set('upi', s || undefined)} placeholder="name@bank" autoCapitalize="none" autoCorrect={false} leading="rupee" />
      </Field>
      <ToggleRow label="Guest" hint="Plays now and then; not in the Football group" value={!!v.guest} onChange={(b) => set('guest', b || undefined)} />

      <Field label="Position">
        <Chips options={POSITION_CODES} value={list(v.position)} onChange={(x) => set('position', x[0])} />
      </Field>
      <Field label="Second position">
        <Chips options={POSITION_CODES} value={list(v.secondaryPosition)} onChange={(x) => set('secondaryPosition', x[0])} />
      </Field>
      <Field label="Also plays" hint="any number">
        <Chips multi options={POSITION_CODES} value={list(v.comfortable)} onChange={(x) => set('comfortable', x.length ? x.join(', ') : undefined)} />
      </Field>
      <Field label="Foot">
        <Chips options={FEET} value={v.preferredFoot ? [v.preferredFoot] : []} onChange={(x) => set('preferredFoot', x[0])} />
      </Field>
      <Field label="Speciality">
        <TextField value={str('speciality')} onChange={(s) => set('speciality', s || undefined)} placeholder="Poacher, playmaker, wall…" />
      </Field>
      <Field label="Playing style">
        <TextField value={str('playingStyle')} onChange={(s) => set('playingStyle', s || undefined)} placeholder="How they play" />
      </Field>
      <Field label="Level">
        <Chips options={LEVELS} value={v.startingLevel ? [v.startingLevel] : []} onChange={(x) => set('startingLevel', x[0])} />
      </Field>
      <Field label="Ability" hint="0–99, the starting overall">
        <NumberField value={v.ability} onChange={(n) => set('ability', n === undefined ? undefined : Math.max(0, Math.min(99, Math.round(n))))} placeholder="Not set" />
      </Field>
      <Field label="Attributes" hint="1–5 each">
        <View style={{ gap: 8, padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          {ATTRS.map(([k, label]) => (
            <Rating key={k} label={label} value={v[k]} onChange={(n) => set(k, n)} />
          ))}
        </View>
      </Field>
      <ToggleRow label="Will play in goal" value={!!v.keeperWilling} onChange={(b) => set('keeperWilling', b || undefined)} />
      {v.keeperWilling ? (
        <Field label="Keeper rating" hint="0–10">
          <NumberField value={v.keeperRating} onChange={(n) => set('keeperRating', n === undefined ? undefined : Math.max(0, Math.min(10, n)))} placeholder="Not set" />
        </Field>
      ) : null}

      <Field label="Shirt number">
        <TextField value={str('jersey')} onChange={(s) => set('jersey', s || undefined)} placeholder="9" keyboardType="number-pad" />
      </Field>
      <Field label="Kit colours">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KIT_PRESETS.map((k) => {
            const on = swatchOn(k.name);
            return (
              <Pressable key={k.name} accessibilityRole="button" accessibilityLabel={k.name} accessibilityState={{ selected: on }} onPress={() => toggleSwatch(k.name)} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: on ? t.c.fg.primary : 'transparent' }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: k.hex, borderWidth: 1, borderColor: '#FFFFFF40' }} />
              </Pressable>
            );
          })}
        </View>
        <TextField value={str('kitColors')} onChange={(s) => set('kitColors', s || undefined)} placeholder="Or type them: #A50044, Navy" autoCapitalize="none" />
      </Field>
      <Field label="Boots">
        <TextField value={str('boots')} onChange={(s) => set('boots', s || undefined)} placeholder="Optional" />
      </Field>
      <Field label="Favourite player">
        <TextField value={str('favouritePlayer')} onChange={(s) => set('favouritePlayer', s || undefined)} placeholder="Optional" />
      </Field>
      <Field label="Clubs">
        <TextField value={str('clubs')} onChange={(s) => set('clubs', s || undefined)} placeholder="Barcelona, Mohun Bagan" />
      </Field>
      <Field label="Countries">
        <TextField value={str('countries')} onChange={(s) => set('countries', s || undefined)} placeholder="India, Argentina" />
      </Field>
      <Field label="Notes">
        <TextField value={str('notes')} onChange={(s) => set('notes', s || undefined)} placeholder="Anything the squad should know" multiline />
      </Field>

      <View style={{ gap: 14, paddingTop: 6 }}>
        <Text variant="heading">Availability</Text>
        <Field label="When they play">
          <Chips options={MODES.map((m) => m.label)} value={[MODES.find((m) => m.value === mode)!.label]} onChange={(x) => x[0] && setMode(MODES.find((m) => m.label === x[0])!.value)} />
        </Field>
        <Field label="Days">
          <Chips options={WEEKLY.map((w) => w.label)} value={[WEEKLY.find((w) => w.value === weekly)!.label]} onChange={(x) => x[0] && setWeekly(WEEKLY.find((w) => w.label === x[0])!.value)} />
        </Field>
        {periods.map((p, i) => (
          <View key={i} style={{ gap: 12, padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: availabilityColour(p.status, t) }} />
              <Text variant="tileTitle" style={{ flex: 1 }}>
                {p.startsAt ? `${statusLabel(p.status)} · ${rangeText(p.startsAt, p.endsAt || null)}` : 'New period'}
              </Text>
              <IconButton icon="trash" accessibilityLabel="Remove this period" size={36} onPress={() => setPeriods((ps) => ps.filter((_, k) => k !== i))} />
            </View>
            <Chips options={STATUS.map((s) => s.label)} value={[statusLabel(p.status)]} onChange={(x) => x[0] && setPeriod(i, { status: STATUS.find((s) => s.label === x[0])!.value })} />
            <DateField label="From" value={p.startsAt} quick={false} onChange={(x) => setPeriod(i, { startsAt: typeof x === 'string' ? x : '' })} />
            <DateField label="To" hint="Leave empty if it’s open-ended" value={p.endsAt} quick={false} onChange={(x) => setPeriod(i, { endsAt: typeof x === 'string' ? x : '' })} />
            <TextField value={p.note} onChange={(s) => setPeriod(i, { note: s })} placeholder="Note: ankle, Goa trip…" />
          </View>
        ))}
        <Button title="Add a period" icon="plus" variant="secondary" size="sm" onPress={() => setPeriods((ps) => [...ps, { status: 'INJ', startsAt: today(), endsAt: '', note: '' }])} />
      </View>

      <Button title={id ? 'Save player' : 'Add player'} icon="check" block onPress={save} />
      <Text variant="caption" color="tertiary">
        Saved here at once and sent to Turf web; it waits on this phone while you’re offline.
      </Text>
    </Screen>
  );
}
