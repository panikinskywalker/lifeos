import React, { useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, Share, Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import { KIT_PRESETS, allAppearances, createPlayer, currentSeason, duesTexts, isUpcomingGame, markPaid, moreOf, owedOn, payPart, playerPositionCode, profileGames, profileOf, squadMax, startedSeasons, editPlayer, faceStats, isDone, mePersonId, playerInputOf, ratingPlayer, rupees, setAvailability, squadData, squadRatings, turfBase, turfDues, type AvailabilityInput, type GameData, type PlayerInput, type PlayerProfileData } from '@modules/games';
import { statsCardText } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { OnBlock, useTheme } from '@ui/theme/ThemeProvider';
import { blocks, displayFont, fonts, monoFonts } from '@ui/theme/tokens';
import { Button, ChipRow, DateField, EmptyState, FilterChip, Icon, IconButton, NumberField, Screen, Text, TextField, Toggle, useToast } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Face, SyncPill, useTurfPhoto } from './teams';
import { SearchBox, found } from './search';
import { CopyShare } from './switcher';
import { type Props, shortDay, useBack } from './common';
import { availabilityColour } from './players';
import { BellButton } from './bell-button';

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

/** "2 – 9 Nov", "28 Oct – 3 Nov", "from 2 Nov". */
function rangeText(from: string, to?: string | null) {
  const a = day(from);
  if (!to) return `from ${format(a, 'd MMM')}`;
  const b = day(to);
  if (from === to) return format(a, 'd MMM');
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() ? `${format(a, 'd')} – ${format(b, 'd MMM')}` : `${format(a, 'd MMM')} – ${format(b, 'd MMM')}`;
}

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
/** A round 40 button over the photo: a dark see-through disc with a light hairline. */
function GlassButton({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4} onPress={onPress} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#FFFFFF24', backgroundColor: '#16161A80', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
      <Icon name={icon} size={17} color="#F5F5F7" />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* 6 · Player profile, 1:1 with Turf web's (app/ui/player.tsx,        */
/* profile-page.tsx): hero, then Overview · Matches · Stats · Dues     */
/* ------------------------------------------------------------------ */

const W = {
  lime: '#D7F55C', limeSoft: 'rgba(215,245,92,0.16)', ink: '#F5F5F7', ink62: 'rgba(245,245,247,0.62)', ink42: 'rgba(245,245,247,0.42)', ink22: 'rgba(245,245,247,0.22)',
  line: 'rgba(255,255,255,0.08)', pill: 'rgba(255,255,255,0.07)', card: '#1A1A1E', raised: '#26262B', dark: '#0B0B0D',
  coral: '#FF5C47', coralSoft: 'rgba(255,92,71,0.18)', coralInk: '#FF8A7A', sky: '#A9C4FF', sun: '#F6E27F', mint: '#9BE7C4', sand: '#F3D98B',
};
const BAND_BG = { lime: W.lime, mint: W.mint, sand: W.sand, coral: W.coralInk };
const bandOf = (r: number): keyof typeof BAND_BG => (r >= 8 ? 'lime' : r >= 7 ? 'mint' : r >= 6 ? 'sand' : 'coral');
const OUT_TONE: Record<'W' | 'D' | 'L', string> = { W: W.lime, D: W.ink62, L: W.coralInk };
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MO3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))} ${MO3[Number(iso.slice(5, 7)) - 1]}`;

/** Turf web's text styles (T.*) and mono / Bebas. */
function Tx({ children, size = 13, weight = 400, lh, color = W.ink, style, lines }: { children: React.ReactNode; size?: number; weight?: 400 | 500 | 600 | 700 | 800; lh?: number; color?: string; style?: object; lines?: number }) {
  return (
    <RNText numberOfLines={lines} style={[{ fontFamily: fonts[weight as 400 | 500 | 600 | 700] ?? fonts[700], fontWeight: weight === 800 ? '800' : undefined, fontSize: size, lineHeight: lh ?? Math.round(size * 1.3), color }, style]}>
      {children}
    </RNText>
  );
}
const Faint = ({ children, style, lines }: { children: React.ReactNode; style?: object; lines?: number }) => <Tx color={W.ink42} lh={17} style={style} lines={lines}>{children}</Tx>;
const CardTitle = ({ children }: { children: React.ReactNode }) => <Tx size={15} weight={600} lh={19}>{children}</Tx>;
const Section = ({ children }: { children: React.ReactNode }) => <Tx size={17} weight={600} lh={22} style={{ letterSpacing: -0.2 }}>{children}</Tx>;
function MonoT({ children, color = W.ink42, weight = 500, size = 9, style }: { children: React.ReactNode; color?: string; weight?: 500 | 700; size?: number; style?: object }) {
  return <RNText style={[{ fontFamily: monoFonts[weight], fontSize: size, lineHeight: size + 3, letterSpacing: size * 0.06, textTransform: 'uppercase', color }, style]}>{children}</RNText>;
}
function Disp({ children, size, color = W.ink, lh }: { children: React.ReactNode; size: number; color?: string; lh?: number }) {
  return <RNText numberOfLines={1} style={{ fontFamily: displayFont, fontSize: size, lineHeight: lh ?? Math.round(size * 0.9), letterSpacing: Math.round(size * 0.02 * 10) / 10, color, textTransform: 'uppercase' }}>{children}</RNText>;
}
function WCard({ children, padding = 14, gap = 0, style }: { children: React.ReactNode; padding?: number | [number, number]; gap?: number; style?: object }) {
  const [v, h] = Array.isArray(padding) ? padding : [padding, padding];
  return <View style={[{ paddingVertical: v, paddingHorizontal: h, gap, borderRadius: 24, backgroundColor: W.card, overflow: 'hidden' }, style]}>{children}</View>;
}
type Tone = 'plain' | 'lime' | 'limeSolid' | 'coral' | 'white' | 'dark' | 'sky';
function WPill({ children, tone = 'plain' }: { children: React.ReactNode; tone?: Tone }) {
  const [bg, fg] = tone === 'lime' ? [W.limeSoft, W.lime] : tone === 'limeSolid' ? [W.lime, W.dark] : tone === 'coral' ? [W.coralSoft, W.coralInk] : tone === 'white' ? [W.ink, W.dark] : tone === 'dark' ? [W.dark, W.ink] : tone === 'sky' ? ['rgba(169,196,255,0.16)', W.sky] : [W.pill, W.ink62];
  return (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: bg, justifyContent: 'center', flexShrink: 0 }}>
      <Tx size={12} weight={600} lh={16} color={fg} lines={1}>{children}</Tx>
    </View>
  );
}
const Divider = () => <View style={{ height: 1, backgroundColor: W.line }} />;

function MiniToggle<V extends string>({ value, onChange, options }: { value: V; onChange: (v: V) => void; options: Array<{ value: V; label: string }> }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: W.raised, alignSelf: 'flex-start' }}>
      {options.map((o) => (
        <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: o.value === value }} onPress={() => onChange(o.value)} style={{ height: 28, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: o.value === value ? W.ink : 'transparent' }}>
          <Tx size={12} weight={700} lh={16} color={o.value === value ? W.dark : W.ink62}>{o.label}</Tx>
        </Pressable>
      ))}
    </View>
  );
}
function RatingChip({ r, size = 'md', star }: { r: number; size?: 'sm' | 'md'; star?: boolean }) {
  return (
    <View style={{ minWidth: size === 'sm' ? 34 : 40, height: size === 'sm' ? 22 : 26, paddingHorizontal: 7, borderRadius: 8, backgroundColor: BAND_BG[bandOf(r)], alignItems: 'center', justifyContent: 'center' }}>
      <Tx size={size === 'sm' ? 12 : 14} weight={800} lh={size === 'sm' ? 16 : 18} color={W.dark}>{r.toFixed(1)}</Tx>
      {star ? (
        <View style={{ position: 'absolute', top: -7, right: -6, width: 14, height: 14, borderRadius: 7, backgroundColor: W.ink, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="star" size={8} color={W.dark} />
        </View>
      ) : null}
    </View>
  );
}
function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 2, paddingTop: 12, paddingHorizontal: 12, paddingBottom: 11, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.06)' }}>
      <MonoT>{label}</MonoT>
      <Tx size={value.length > 5 ? 20 : 26} weight={800} lh={30} color={tone ?? W.ink} lines={1} style={{ letterSpacing: -0.8 }}>{value}</Tx>
      {sub ? <Faint>{sub}</Faint> : null}
    </View>
  );
}
function LimeTabs<V extends string>({ options, value, onChange }: { options: Array<{ value: V; label: string }>; value: V; onChange: (v: V) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {options.map((o) => (
        <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: o.value === value }} onPress={() => onChange(o.value)} style={{ flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: o.value === value ? W.lime : W.card }}>
          <Tx size={13} weight={700} lh={17} color={o.value === value ? W.dark : W.ink62}>{o.label}</Tx>
        </Pressable>
      ))}
    </View>
  );
}

/** Turf web's Radar: the six from the profile (1 to 5, shown out of 100), clockwise from Pace. */
const RADAR: Array<[keyof PlayerProfileData, string]> = [['pace', 'Pace'], ['shooting', 'Shooting'], ['passing', 'Passing'], ['dribbling', 'Dribbling'], ['defending', 'Defending'], ['stamina', 'Stamina']];
function Radar({ player }: { player: PlayerProfileData }) {
  const width = 300, size = 236, cx = width / 2, cy = size / 2, r = 76;
  const values = RADAR.map(([k]) => { const v = player[k] as number | undefined; return v == null ? null : Math.round(v * 20); });
  const pts = values.map((v, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 3; const s = (v ?? 0) / 100; return [cx + Math.cos(a) * r * s, cy + Math.sin(a) * r * s] as const; });
  const ring = (k: number) => Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 3; return `${cx + Math.cos(a) * r * k},${cy + Math.sin(a) * r * k}`; }).join(' ');
  return (
    <Svg width={width} height={size} viewBox={`0 0 ${width} ${size}`}>
      {[1, 0.75, 0.5, 0.25].map((k) => <Polygon key={k} points={ring(k)} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={1} />)}
      {Array.from({ length: 6 }, (_, i) => { const a = -Math.PI / 2 + (i * Math.PI) / 3; return <Line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * r} y2={cy + Math.sin(a) * r} stroke="rgba(255,255,255,0.08)" />; })}
      <Polygon points={pts.map((p) => p.join(',')).join(' ')} fill="rgba(215,245,92,0.22)" stroke={W.lime} strokeWidth={2} strokeLinejoin="round" />
      {pts.map((p, i) => <Circle key={i} cx={p[0]} cy={p[1]} r={3} fill={W.lime} />)}
      {RADAR.map(([, label], i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 3; const lx = cx + Math.cos(a) * (r + 24); const ly = cy + Math.sin(a) * (r + 20);
        const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
        return (
          <G key={label}>
            <SvgText x={lx} y={ly - 2} textAnchor={anchor} fontSize={10} fontWeight="600" fill={W.ink42}>{label}</SvgText>
            <SvgText x={lx} y={ly + 11} textAnchor={anchor} fontSize={12} fontWeight="800" fill={W.ink}>{values[i] ?? '–'}</SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function ProfileHero({ p, turfId, overall, delta, onBack, onShare, onEdit }: { p: PlayerProfileData; turfId: string | null; overall: number | null; delta: number | null; onBack: () => void; onShare: () => void; onEdit: () => void }) {
  const insets = useSafeAreaInsets();
  const photo = useTurfPhoto(p.photoPath && turfId ? `/api/players/${encodeURIComponent(turfId)}/photo?v=${encodeURIComponent(p.photoPath)}` : null);
  const [failed, setFailed] = useState(false);
  const has = !!photo && !failed;
  const [first, ...rest] = p.name.trim().split(/\s+/);
  const code = playerPositionCode(p.position);
  const role = [code === 'FWD' ? 'ST' : code, p.playingStyle].filter(Boolean).join(' · ');
  return (
    <View style={{ minHeight: has ? 500 : 360, marginHorizontal: -20, paddingTop: insets.top + 16, paddingHorizontal: 20, paddingBottom: 20, justifyContent: 'space-between', overflow: 'hidden' }}>
      <Svg style={{ position: 'absolute', left: 0, top: 0 }} width="100%" height="100%">
        <Defs><LinearGradient id="heroBg" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#5A3A3C" /><Stop offset="0.6" stopColor="#2B1A1F" /><Stop offset="1" stopColor="#0B0B0D" /></LinearGradient></Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroBg)" />
      </Svg>
      {photo && !failed ? <Image source={photo} onError={() => setFailed(true)} resizeMode="cover" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }} /> : null}
      <Svg style={{ position: 'absolute', left: 0, top: 0 }} width="100%" height="100%">
        <Defs>
          {has ? (
            <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#0B0B0D" stopOpacity={0.45} /><Stop offset="0.18" stopColor="#0B0B0D" stopOpacity={0} /><Stop offset="0.52" stopColor="#0B0B0D" stopOpacity={0} /><Stop offset="0.76" stopColor="#0B0B0D" stopOpacity={0.75} /><Stop offset="1" stopColor="#0B0B0D" stopOpacity={1} /></LinearGradient>
          ) : (
            <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#0B0B0D" stopOpacity={0.25} /><Stop offset="0.4" stopColor="#0B0B0D" stopOpacity={0.2} /><Stop offset="1" stopColor="#0B0B0D" stopOpacity={1} /></LinearGradient>
          )}
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroFade)" />
        {p.jersey ? (
          <SvgText x={has ? '96%' : '97%'} y={has ? '96%' : 250} textAnchor="end" fontFamily={displayFont} fontSize={has ? 140 : 220} fill="none" stroke={W.lime} strokeWidth={2} opacity={has ? 0.85 : 0.9}>
            {p.jersey}
          </SvgText>
        ) : null}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <GlassButton icon="chevron-left" label="Back" onPress={onBack} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <GlassButton icon="send" label="Share profile" onPress={onShare} />
          <GlassButton icon="edit" label="Edit player" onPress={onEdit} />
        </View>
      </View>
      <View style={{ gap: 12, marginTop: 120, paddingRight: has && p.jersey ? 110 : 0 }}>
        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
          {role ? <WPill tone="limeSolid">{role}</WPill> : null}
          {p.jersey ? <WPill tone="white">{`#${p.jersey}`}</WPill> : null}
          {overall !== null ? <WPill tone={has ? 'dark' : 'plain'}>{`Overall ${overall}${delta ? ` ${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}` : ''}`}</WPill> : null}
        </View>
        <RNText style={{ fontFamily: displayFont, fontSize: 64, lineHeight: 56, color: W.ink, textTransform: 'uppercase', letterSpacing: 1.3, textShadowColor: has ? 'rgba(0,0,0,0.45)' : undefined, textShadowRadius: has ? 18 : 0 }}>
          {rest.length ? `${first}\n${rest.join(' ')}` : first}
        </RNText>
      </View>
    </View>
  );
}

type ProfileTab = 'overview' | 'matches' | 'stats' | 'dues';
type Scope = 'season' | 'all';

export function TurfPlayer({ params }: Props) {
  const router = useRouter();
  const back = useBack();
  const { busy, pull } = usePull();
  const profile = useProfile(params.player);
  const os = useOS();
  const toast = useToast();
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [scopeChoice, setScope] = useState<Scope | null>(null);
  const [perGame, setPerGame] = useState(false);
  const [traitGroup, setTraitGroup] = useState<'squad' | 'position'>('squad');
  const [matchFilter, setMatchFilter] = useState('all');
  const [matchQuery, setMatchQuery] = useState('');
  const [part, setPart] = useState<number | undefined>(undefined);

  const d = useLive(
    (o) => {
      if (!profile) return null;
      const pid = profile.data.personId;
      const dues = turfDues(o);
      const person = o.records.get<{ phone?: string; email?: string; upi?: string }>(pid);
      const partnerKeys = new Set((profile.data.partners ?? []).map((id) => `turf:players:${id}`));
      const all = o.records.query<PlayerProfileData>('player', {}, { limit: 100_000 });
      // Their shares, for money (the fronter's own share counts as paid; tentative matches don't count).
      const shares = allAppearances(o).filter((a) => a.data.personId === pid).flatMap((a) => {
        const g = o.records.get<GameData>(a.data.gameId);
        if (!g || g.data.paymentTerms === 'tentative') return [];
        const share = Math.round((a.data.share ?? 0) * 100);
        return [{ date: g.data.date, share, put: g.data.frontedById === pid ? share : Math.min(share, Math.round((a.data.amountPaid ?? 0) * 100)) }];
      });
      return {
        pg: profileGames(o),
        seasons: startedSeasons(o),
        open: dues.people.filter((x) => x.playerId === pid && x.direction === 'owes_you'),
        credit: dues.credits.find((c) => c.playerId === pid)?.creditCents ?? 0,
        reminder: duesTexts(o).reminder(pid),
        me: mePersonId(o),
        person: person?.data ?? {},
        picks: all.filter((x) => partnerKeys.has(x.data.sourceKey ?? '')).map((x) => ({ id: x.id, name: x.data.name })),
        profileOfPerson: new Map(all.map((x) => [x.data.personId, x.id])),
        shares,
      };
    },
    [profile],
  );
  const season = d ? currentSeason(d.seasons) : null;
  const scope: Scope = scopeChoice ?? (season ? 'season' : 'all');
  const computed = useMemo(() => {
    if (!profile || !d) return null;
    const player = d.pg.players.find((x) => x.id === profile.data.personId);
    if (!player) return null;
    const games = scope === 'season' && season ? d.pg.games.filter((g) => g.date >= season.startsOn && (!season.endsOn || g.date <= season.endsOn)) : d.pg.games;
    return {
      player, games,
      profile: profileOf(player, d.pg.players, games, d.seasons),
      more: moreOf(player, d.pg.players, games, d.pg.games),
      allProfile: profileOf(player, d.pg.players, d.pg.games, d.seasons),
    };
  }, [profile, d, scope, season]);

  if (!profile || !d || !computed) return <Missing title="Player" />;
  const p = profile.data;
  const { player, games, profile: pr, more, allProfile } = computed;
  const turfId = p.sourceKey?.replace('turf:players:', '') ?? null;
  const done = games.filter((g) => !isUpcomingGame(g));
  const regulars = d.pg.players.filter((x) => done.filter((g) => g.participants.some((y) => y.playerId === x.id && y.attendanceStatus !== 'no_show')).length >= 3).length;
  const firstEver = allProfile.firstGame;
  const joined = firstEver ? `${MO3[Number(firstEver.slice(5, 7)) - 1]} ${firstEver.slice(0, 4)}` : null;
  const scopeTitle = scope === 'season' && season ? season.name : 'All time';
  const scopeSub = scope === 'season' && season ? `since ${dayMonth(season.startsOn)} · ${pr.apps} of ${done.length} games` : firstEver ? `since ${dayMonth(firstEver)} · ${pr.apps} of ${done.length} games` : 'no matches yet';
  const openPeople = d.open;
  const owed = openPeople.reduce((s, x) => s + x.totalCents, 0);
  const openGames = openPeople.reduce((s, x) => s + x.games.length, 0);
  const scoped = d.shares.filter((s) => games.some((g) => g.date === s.date));
  const spent = scoped.reduce((s, x) => s + x.put, 0);
  const shareCount = scoped.length;
  const shareCents = scoped.reduce((s, x) => s + x.share, 0);
  const paidFull = scoped.filter((x) => x.put >= x.share).length;
  const openApps = () => {
    const ids = new Set(openPeople.flatMap((x) => x.games.map((g) => g.gameId)));
    return allAppearances(os).filter((a) => a.data.personId === p.personId && ids.has(a.data.gameId) && owedOn(a.data) > 0).sort((a, b) => a.data.gameDate.localeCompare(b.data.gameDate));
  };
  // Everything open, or with an amount, a part payment (oldest games first; anything over waits as credit).
  const settle = (amount?: number) => {
    try {
      const apps = openApps();
      if (amount) payPart(os, apps.map((a) => a.id), amount);
      else for (const a of apps) markPaid(os, a.id);
      setPart(undefined);
      toast.show({ message: `${firstOf(p.name)} ${amount ? 'paid' : 'marked paid ·'} ${rupees((amount ? amount * 100 : owed))} · sending`, icon: 'check' });
      void pull(true);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  const openPlayer = (personId: string) => {
    const id = d.profileOfPerson.get(personId);
    if (id) router.push(`/board/turf/player?player=${id}` as never);
  };
  const openGame = (gameId: string) => router.push(`/board/turf/game?game=${gameId}` as never);
  const keeper = p.keeperWilling === true ? ((p.keeperRating ?? 0) >= 4 ? 'Happily' : 'If I must') : p.keeperWilling === false ? 'Never' : '–';
  const firstNight = more.nights.at(-1)?.date;
  const decided = pr.wins + pr.draws + pr.losses;
  const now = p.availability;
  const today = format(new Date(), 'yyyy-MM-dd');
  const t = more.turnout;
  const per = (v: number) => (perGame && pr.apps ? v / pr.apps : v);
  const fmt = (v: number) => (perGame ? per(v).toFixed(2) : String(v));
  const aGame = (v: number) => (pr.apps ? `${(v / pr.apps).toFixed(2)} a game` : undefined);
  const max = squadMax(done);

  const statGroup = (title: string, sub: string | undefined, lines: Array<{ label: string; value: number; display?: string; sub?: string; max?: number; tone?: string }>) => (
    <WCard key={title}>
      <View style={{ marginBottom: 6 }}><CardTitle>{title}</CardTitle>{sub ? <Faint>{sub}</Faint> : null}</View>
      {lines.map((l, i) => (
        <View key={l.label} style={{ paddingTop: 10, paddingBottom: 8, borderTopWidth: i ? 1 : 0, borderTopColor: W.line, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Tx size={15} weight={600} lh={21} style={{ flex: 1 }}>{l.label}</Tx>
            {l.sub ? <Faint>{l.sub}</Faint> : null}
            <View style={{ minWidth: 30, alignItems: 'flex-end' }}><Disp size={26}>{l.display ?? String(l.value)}</Disp></View>
          </View>
          {l.max !== undefined && l.max > 0 ? <View style={{ height: 4, borderRadius: 2, backgroundColor: W.pill, overflow: 'hidden' }}><View style={{ width: `${Math.min(100, (l.value / l.max) * 100)}%`, height: '100%', backgroundColor: l.tone ?? W.lime }} /></View> : null}
        </View>
      ))}
    </WCard>
  );
  const linesCard = (title: string, lines: typeof pr.months) =>
    lines.length ? (
      <WCard gap={8}>
        <CardTitle>{title}</CardTitle>
        <View style={{ flexDirection: 'row' }}>
          {['', 'Apps', 'Goals', 'Assists', 'W-D-L'].map((h, i) => <View key={h || 'label'} style={{ flex: i ? 1 : 1.4, alignItems: i ? 'flex-end' : 'flex-start' }}><MonoT>{h}</MonoT></View>)}
        </View>
        {lines.map((m) => (
          <View key={m.month} style={{ flexDirection: 'row', alignItems: 'baseline' }}>
            <View style={{ flex: 1.4, minWidth: 0 }}><Tx color={W.ink} lh={17} lines={1}>{m.label}</Tx></View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}><Tx color={W.ink62} lh={17}>{String(m.apps)}</Tx></View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}><Tx color={m.goals ? W.lime : W.ink42} lh={17}>{String(m.goals)}</Tx></View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}><Tx color={m.assists ? W.sky : W.ink42} lh={17}>{String(m.assists)}</Tx></View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}><Tx color={W.ink62} lh={17}>{`${m.wins}-${m.draws}-${m.losses}`}</Tx></View>
          </View>
        ))}
      </WCard>
    ) : null;

  // ---- Overview pieces ----
  const formLast = more.nights.slice(0, 5).reverse();
  const formScore = formLast.length >= 3 ? Math.round((formLast.reduce((s, n) => s + n.rating, 0) / formLast.length) * 10 + 1e-9) / 10 : null;
  const traits = traitGroup === 'squad' ? more.traits.squad : more.traits.position;
  const rated = (['pace', 'shooting', 'passing', 'dribbling', 'defending', 'stamina'] as const).filter((k) => p[k] != null).length;
  const series = more.overall.series;
  const zoneName: Record<string, string> = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'ST' };
  const zoneX: Record<string, number> = { GK: 9, DEF: 30, MID: 52, FWD: 78 };
  const code = playerPositionCode(p.position);
  const comfortable = [p.secondaryPosition, ...(p.comfortable ?? '').split(',')].map((x) => playerPositionCode(x?.trim())).filter((c, i, a): c is NonNullable<typeof c> => !!c && c !== code && a.indexOf(c) === i);
  const periods = [...(p.periods ?? [])].sort((a, b) => b.startsAt.localeCompare(a.startsAt)).slice(0, 3);
  const about: Array<[string, string | undefined]> = [['Speciality', p.speciality], ['Boots', p.boots], ['Favourite player', p.favouritePlayer], ['Clubs', p.clubs], ['Countries', p.countries]];
  const colours = (p.kitColors ?? '').split(/[,/ ]+/).filter((c) => /^#[0-9a-f]{3,8}$/i.test(c)).slice(0, 3);

  const rivalRow = (r: NonNullable<typeof more.hardest>, against: boolean) => (
    <Pressable key={`${against}${r.id}`} accessibilityRole="link" onPress={() => openPlayer(r.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Face id={r.id} name={r.name} size={36} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Tx size={15} weight={600} lh={21} lines={1}>{r.name}</Tx>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: W.pill, overflow: 'hidden' }}><View style={{ width: `${r.winRate}%`, height: '100%', backgroundColor: against ? W.coral : W.lime }} /></View>
          <Faint style={{ fontSize: 11 }}>{`${r.games} ${against ? 'against' : 'together'}`}</Faint>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Tx size={16} weight={800} lh={20} color={against ? W.coralInk : W.lime}>{`${r.winRate}%`}</Tx>
        <MonoT size={8}>won</MonoT>
      </View>
    </Pressable>
  );

  // ---- Matches ----
  const venues = [...new Set(more.nights.map((n) => n.venue))].slice(0, 4);
  const shownNights = more.nights.filter((n) => (matchFilter === 'all' || (matchFilter === 'won' ? n.outcome === 'W' : matchFilter === 'potm' ? n.potm : n.venue === matchFilter)) && found(matchQuery, n.venue, shortDay(n.date)));
  const byMonth = new Map<string, typeof shownNights>();
  for (const n of shownNights) byMonth.set(n.date.slice(0, 7), [...(byMonth.get(n.date.slice(0, 7)) ?? []), n]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: W.dark }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 12 }} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}>
      <ProfileHero p={p} turfId={turfId} overall={more.overall.now ?? pr.rating.value} delta={more.overall.delta} onBack={back} onShare={() => router.push(`/board/turf/card?player=${profile.id}` as never)} onEdit={() => router.push(`/board/turf/player-edit?player=${profile.id}` as never)} />
      <LimeTabs<ProfileTab> value={tab} onChange={setTab} options={[{ value: 'overview', label: 'Overview' }, { value: 'matches', label: 'Matches' }, { value: 'stats', label: 'Stats' }, { value: 'dues', label: 'Dues' }]} />

      {tab === 'overview' ? (
        <>
          <WCard padding={[14, 16]}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14 }}>
              {([
                ['Jersey', p.jersey ? `#${p.jersey}` : '–'],
                ['Foot', p.preferredFoot || '–'],
                ['Style', p.playingStyle || '–'],
                ['Keeps goal', keeper],
                ['Joined', firstNight ? `${MO3[Number(firstNight.slice(5, 7)) - 1]} ${firstNight.slice(0, 4)}` : '–'],
                ['Plays', p.weekly === 'weekends' ? 'Weekends' : p.weekly === 'weekdays' ? 'Weekdays' : 'All week'],
              ] as Array<[string, string]>).map(([l, v]) => (
                <View key={l} style={{ width: '33.33%', paddingRight: 10, minWidth: 0 }}>
                  <MonoT>{l}</MonoT>
                  <Tx size={15} weight={600} style={{ marginTop: 3 }} lines={1}>{v}</Tx>
                </View>
              ))}
            </View>
          </WCard>

          <WCard gap={12}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}><CardTitle>{scopeTitle}</CardTitle><Faint>{scopeSub}</Faint></View>
              {season ? <MiniToggle<Scope> value={scope} onChange={setScope} options={[{ value: 'season', label: 'Season' }, { value: 'all', label: 'All time' }]} /> : null}
            </View>
            <View style={{ flexDirection: 'row' }}>
              {([[pr.apps, 'Apps'], [pr.goals, 'Goals'], [pr.assists, 'Assists'], [pr.potm, 'POTM']] as Array<[number, string]>).map(([v, l], i) => (
                <View key={l} style={{ flex: 1, alignItems: 'center', borderLeftWidth: i ? 1 : 0, borderLeftColor: W.line }}>
                  <Disp size={40} lh={40}>{String(v)}</Disp>
                  <MonoT>{l}</MonoT>
                </View>
              ))}
            </View>
            {decided > 0 ? (
              <>
                <View style={{ flexDirection: 'row', gap: 3, height: 6 }}>
                  <View style={{ flex: pr.wins, backgroundColor: W.lime, borderRadius: 3 }} />
                  <View style={{ flex: pr.draws, backgroundColor: W.ink42, borderRadius: 3 }} />
                  <View style={{ flex: pr.losses, backgroundColor: W.coral, borderRadius: 3 }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Faint>{`${pr.wins} won · ${pr.draws} drawn · ${pr.losses} lost`}</Faint>
                  <Faint>{`${pr.winRate}% win rate`}</Faint>
                </View>
              </>
            ) : null}
          </WCard>

          {formLast.length ? (
            <WCard gap={12}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1 }}><CardTitle>Form</CardTitle><Faint>{`last ${plural(formLast.length, 'match', 'matches')} · match rating${more.avgRating !== null ? ` · ${more.avgRating.toFixed(1)} on average` : ''}`}</Faint></View>
                {formScore !== null ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><MonoT>Form</MonoT><RatingChip r={formScore} /></View> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {formLast.map((n) => (
                  <View key={n.gameId} style={{ flex: 1, alignItems: 'center', gap: 4, minWidth: 0, opacity: n.partial ? 0.6 : 1 }}>
                    <RatingChip r={n.rating} size="sm" star={n.potm} />
                    <Tx size={11} weight={800} lh={14} color={n.outcome ? OUT_TONE[n.outcome] : W.ink42}>{n.outcome || '–'}</Tx>
                    <MonoT size={8}>{dayMonth(n.date)}</MonoT>
                  </View>
                ))}
                {Array.from({ length: 5 - formLast.length }, (_, i) => <View key={`e${i}`} style={{ flex: 1 }} />)}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                {(['lime', 'mint', 'sand', 'coral'] as const).map((b, i) => <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: BAND_BG[b] }} /><Faint>{['8+', '7s', '6s', 'under 6'][i]}</Faint></View>)}
              </View>
              {formLast.some((n) => n.partial) ? <Faint>Faded: no score was logged, so the result doesn’t count in that rating.</Faint> : null}
              <Faint>A match rating starts at 6.0; goals, assists, saves, the result, a clean sheet, player of the match and best on your team move it. You can set one by hand in the match (it then says “edited”).</Faint>
            </WCard>
          ) : null}

          {more.traits.squad.length ? (
            <WCard gap={14}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ flex: 1 }}><CardTitle>Player traits</CardTitle><Faint>{`against the ${traitGroup === 'squad' ? `${regulars} regulars` : more.traits.positionLabel.toLowerCase()}`}</Faint></View>
                <MiniToggle<'squad' | 'position'> value={traitGroup} onChange={setTraitGroup} options={[{ value: 'squad', label: 'Squad' }, { value: 'position', label: more.traits.positionLabel }]} />
              </View>
              {traits.map((tr) => {
                const pct = tr.top === null ? 0 : Math.max(4, 100 - tr.top);
                return (
                  <View key={tr.key} style={{ gap: 5 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                      <Tx size={15} weight={600} lh={21} style={{ flex: 1 }}>{tr.label}</Tx>
                      <Tx size={16} weight={800} lh={20}>{tr.display}</Tx>
                      <View style={{ width: 56, alignItems: 'flex-end' }}><MonoT weight={700} color={tr.top !== null && tr.top <= 25 ? W.lime : W.ink42}>{tr.top === null ? '–' : tr.key === 'defending' && tr.rank ? `${tr.rank}${tr.rank === 1 ? 'ST' : tr.rank === 2 ? 'ND' : tr.rank === 3 ? 'RD' : 'TH'}` : `TOP ${tr.top}%`}</MonoT></View>
                    </View>
                    <View style={{ height: 5, borderRadius: 3, backgroundColor: W.pill, overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: '100%', backgroundColor: tr.key === 'defending' ? W.coral : W.lime }} /></View>
                    {tr.note ? <Faint>{tr.note}</Faint> : null}
                  </View>
                );
              })}
            </WCard>
          ) : null}

          <WCard gap={8}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}><CardTitle>Attributes</CardTitle><Faint>rated by the squad</Faint></View>
              {pr.rating.value !== null ? <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}><Disp size={44} color={W.lime}>{String(pr.rating.value)}</Disp><MonoT>Overall</MonoT></View> : null}
            </View>
            <View style={{ alignItems: 'center' }}><Radar player={p} /></View>
            <View style={{ gap: 4 }}>
              <View style={{ height: 5, borderRadius: 3, backgroundColor: W.pill, overflow: 'hidden' }}><View style={{ width: `${pr.rating.confidence}%`, height: '100%', backgroundColor: W.lime }} /></View>
              <Faint>{`${pr.rating.level} · ${pr.rating.confidenceLabel.toLowerCase()} · from ${plural(pr.apps, 'match', 'matches')} and the profile`}</Faint>
            </View>
            {rated < 6 ? <Faint>{rated ? `${6 - rated} attribute${6 - rated === 1 ? '' : 's'} not rated yet, so treat the shape as a guess.` : 'No attributes rated yet.'}</Faint> : null}
            {pr.rating.missing.length ? <Faint>{`For a surer rating, add ${pr.rating.missing.slice(0, 4).join(', ')}${pr.rating.missing.length > 4 ? ` and ${pr.rating.missing.length - 4} more` : ''} in Edit player.`}</Faint> : null}
          </WCard>

          {series.length >= 2 ? (() => {
            const w = 320, h = 120, pad = 14;
            const lo = Math.min(...series.map((s) => s.value)) - 3, hi = Math.max(...series.map((s) => s.value)) + 3;
            const x = (i: number) => pad + (i * (w - pad * 2)) / (series.length - 1);
            const y = (v: number) => h - 18 - ((v - lo) / Math.max(1, hi - lo)) * (h - 40);
            const path = series.map((s, i) => `${i ? 'L' : 'M'}${x(i)},${y(s.value)}`).join(' ');
            const last = series[series.length - 1]!;
            return (
              <WCard gap={8}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}><CardTitle>Overall over time</CardTitle><Faint>{joined ? `since they joined · ${joined}` : 'month by month'}</Faint></View>
                  {more.overall.delta ? <WPill tone={more.overall.delta > 0 ? 'lime' : 'coral'}>{`${more.overall.delta > 0 ? '▲' : '▼'}${Math.abs(more.overall.delta)} since ${more.overall.since}`}</WPill> : null}
                </View>
                <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
                  <Path d={`${path} L${x(series.length - 1)},${h - 18} L${x(0)},${h - 18} Z`} fill="rgba(215,245,92,0.10)" />
                  <Path d={path} fill="none" stroke={W.lime} strokeWidth={2.5} strokeLinejoin="round" />
                  {series.map((s, i) => <Circle key={i} cx={x(i)} cy={y(s.value)} r={i === series.length - 1 ? 5 : 3} fill={i === series.length - 1 ? W.lime : W.card} stroke={W.lime} strokeWidth={2} />)}
                  <Rect x={x(series.length - 1) - 16} y={y(last.value) - 28} width={32} height={20} rx={10} fill={W.ink} />
                  <SvgText x={x(series.length - 1)} y={y(last.value) - 14} textAnchor="middle" fontSize={12} fontWeight="800" fill={W.dark}>{String(last.value)}</SvgText>
                  {series.map((s, i) => <SvgText key={`l${i}`} x={x(i)} y={h - 3} textAnchor="middle" fontSize={9} fill={W.ink42}>{s.label}</SvgText>)}
                </Svg>
                <Faint>Moves with the squad’s ratings and their nights; a new player’s number settles after about ten matches.</Faint>
              </WCard>
            );
          })() : null}

          {more.zones.length ? (
            <WCard gap={10}>
              <View><CardTitle>Where they play</CardTitle><Faint>{more.zones.map((z) => `${zoneName[z.zone]} ${z.zone === more.zones[0]!.zone ? 'mostly' : 'sometimes'}`).slice(0, 2).join(' · ')}</Faint></View>
              <View style={{ height: 150, borderRadius: 16, backgroundColor: '#1F4D2B', overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.18)' }}>
                <View style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, borderLeftWidth: 1.5, borderLeftColor: 'rgba(255,255,255,0.2)' }} />
                <View style={{ position: 'absolute', left: '50%', top: '50%', width: 50, height: 50, marginLeft: -25, marginTop: -25, borderRadius: 25, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)' }} />
                <View style={{ position: 'absolute', left: 0, top: '28%', bottom: '28%', width: '12%', borderWidth: 1.5, borderLeftWidth: 0, borderColor: 'rgba(255,255,255,0.2)' }} />
                <View style={{ position: 'absolute', right: 0, top: '28%', bottom: '28%', width: '12%', borderWidth: 1.5, borderRightWidth: 0, borderColor: 'rgba(255,255,255,0.2)' }} />
                <Svg style={{ position: 'absolute', left: 0, top: 0 }} width="100%" height="100%">
                  <Defs>
                    {more.zones.map((z) => (
                      <RadialGradient key={z.zone} id={`zone${z.zone}`} cx="50%" cy="50%" r="50%">
                        <Stop offset="0" stopColor={W.lime} stopOpacity={0.25 + z.share / 200} />
                        <Stop offset="0.7" stopColor={W.lime} stopOpacity={0} />
                      </RadialGradient>
                    ))}
                  </Defs>
                  {more.zones.map((z) => <Circle key={z.zone} cx={`${zoneX[z.zone]}%`} cy="50%" r={(40 + z.share * 0.9) / 2} fill={`url(#zone${z.zone})`} />)}
                </Svg>
                {more.zones.map((z) => (
                  <View key={z.zone} style={{ position: 'absolute', left: `${zoneX[z.zone]}%`, top: '50%', transform: [{ translateX: -40 }, { translateY: -10 }], width: 80, alignItems: 'center' }}>
                    <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: z.zone === more.zones[0]!.zone ? W.lime : W.dark }}>
                      <Tx size={11} weight={800} lh={14} color={z.zone === more.zones[0]!.zone ? W.dark : W.ink}>{`${zoneName[z.zone]} · ${z.zone === 'GK' ? plural(z.games, 'game') : `${z.share}%`}`}</Tx>
                    </View>
                  </View>
                ))}
                <View style={{ position: 'absolute', right: 8, bottom: 6 }}><MonoT size={8} color="rgba(255,255,255,0.5)">Attacking →</MonoT></View>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {code ? <WPill tone="limeSolid">{`${zoneName[code]} · preferred`}</WPill> : null}
                {comfortable.map((c) => <WPill key={c} tone="white">{`${zoneName[c]} · comfortable`}</WPill>)}
                {p.keeperWilling && code !== 'GK' ? <WPill>{`GK · ${(p.keeperRating ?? 0) >= 4 ? 'happily' : 'emergency'}`}</WPill> : null}
              </View>
            </WCard>
          ) : null}

          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}><View style={{ flex: 1 }}><Section>Trophy case</Section></View><Faint>{`${more.trophies.filter((x) => x.unlocked).length} of ${more.trophies.length}`}</Faint></View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {more.trophies.slice(0, 6).map((tr) => (
                <View key={tr.key} style={{ width: '31.5%', gap: 8, padding: 12, borderRadius: 20, backgroundColor: W.card, borderWidth: tr.unlocked ? 0 : 1.5, borderStyle: 'dashed', borderColor: W.ink22, opacity: tr.unlocked ? 1 : 0.75 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tr.unlocked ? W.lime : W.raised, alignItems: 'center', justifyContent: 'center' }}><Icon name={tr.icon} size={16} color={tr.unlocked ? W.dark : W.ink42} /></View>
                    <Disp size={26} color={tr.unlocked ? W.ink : W.ink42}>{tr.value}</Disp>
                  </View>
                  <View style={{ minWidth: 0 }}>
                    <Tx size={13} weight={700} lh={17} lines={1}>{tr.label}</Tx>
                    <Faint style={{ fontSize: 11 }} lines={1}>{tr.sub}</Faint>
                  </View>
                  {tr.progress !== undefined ? <View style={{ height: 4, borderRadius: 2, backgroundColor: W.pill, overflow: 'hidden' }}><View style={{ width: `${Math.round(tr.progress * 100)}%`, height: '100%', backgroundColor: W.ink42 }} /></View> : null}
                </View>
              ))}
            </View>
          </View>

          {more.partners.length || more.hardest ? (
            <View style={{ gap: 10 }}>
              <Section>Plays best with</Section>
              <WCard gap={14}>
                {more.partners.map((r) => rivalRow(r, false))}
                {more.hardest ? (
                  <>
                    <MonoT>Hardest to beat</MonoT>
                    {rivalRow(more.hardest, true)}
                  </>
                ) : null}
              </WCard>
            </View>
          ) : null}

          {d.picks.length ? (
            <WCard gap={6}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}><View style={{ flex: 1 }}><CardTitle>Plays well with</CardTitle></View><Faint>their picks · used by Suggest teams</Faint></View>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>{d.picks.map((x) => <WPill key={x.id} tone="lime">{x.name}</WPill>)}</View>
            </WCard>
          ) : null}

          <WCard gap={8}>
            <View><CardTitle>Availability</CardTitle><Faint>{`${p.weekly === 'weekends' ? 'Weekends' : p.weekly === 'weekdays' ? 'Weekdays' : 'All week'} · ${p.availabilityMode === 'window_only' ? 'when free' : 'regular'} · ${now === 'INJ' ? 'injured now' : now === 'OOS' ? 'away now' : 'available now'}`}</Faint></View>
            {periods.map((x, i) => (
              <View key={x.id ?? i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: x.status === 'INJ' ? W.coral : W.ink42 }} />
                <Tx color={W.ink62} lh={17} lines={1} style={{ flex: 1 }}>{`${x.status === 'INJ' ? 'Injured' : x.status === 'OOS' ? 'Out of station' : 'Available'} · ${rangeText(x.startsAt, x.endsAt)}${x.note ? ` · ${x.note}` : ''}`}</Tx>
                <WPill>{x.startsAt > today ? 'upcoming' : x.endsAt && x.endsAt < today ? 'past' : 'now'}</WPill>
              </View>
            ))}
          </WCard>

          {about.some(([, v]) => v) || colours.length ? (
            <WCard gap={4}>
              <View style={{ marginBottom: 4 }}><CardTitle>About</CardTitle></View>
              {about.filter(([, v]) => v).map(([l, v]) => (
                <View key={l} style={{ flexDirection: 'row', gap: 12, minHeight: 26, alignItems: 'baseline' }}>
                  <Faint style={{ width: 120 }}>{l}</Faint>
                  <Tx color={W.ink} lh={17} style={{ flex: 1 }}>{v}</Tx>
                </View>
              ))}
              {colours.length ? (
                <View style={{ flexDirection: 'row', gap: 12, minHeight: 26, alignItems: 'center' }}>
                  <Faint style={{ width: 120 }}>Kit colours</Faint>
                  <View style={{ flexDirection: 'row', gap: 6 }}>{colours.map((c) => <View key={c} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: c, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' }} />)}</View>
                </View>
              ) : null}
            </WCard>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Edit player" icon="edit" variant="secondary" style={{ flex: 1, height: 48 }} onPress={() => router.push(`/board/turf/player-edit?player=${profile.id}` as never)} />
            <Button title="Stats card" icon="send" variant="secondary" style={{ flex: 1, height: 48 }} onPress={() => router.push(`/board/turf/card?player=${profile.id}` as never)} />
          </View>
        </>
      ) : null}

      {tab === 'matches' ? (
        <>
          <WCard padding={[14, 16]}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}><MonoT>Played</MonoT><Disp size={30}>{String(more.nights.length)}</Disp></View>
              <View style={{ flex: 1 }}><MonoT>Missed</MonoT><Disp size={30} color={W.ink42}>{String(more.missed)}</Disp></View>
              <View style={{ flex: 1, gap: 2 }}><MonoT>Avg rating</MonoT>{more.avgRating !== null ? <View style={{ alignSelf: 'flex-start' }}><RatingChip r={more.avgRating} /></View> : <Tx>–</Tx>}</View>
              <View style={{ flex: 1, gap: 2 }}><MonoT>Best</MonoT>{more.best !== null ? <View style={{ alignSelf: 'flex-start' }}><RatingChip r={more.best} /></View> : <Tx>–</Tx>}</View>
            </View>
          </WCard>
          <SearchBox value={matchQuery} onChange={setMatchQuery} placeholder="Search grounds or dates" />
          <ChipRow>
            {[{ value: 'all', label: 'All' }, { value: 'won', label: 'Won' }, { value: 'potm', label: 'POTM' }, ...venues.map((v) => ({ value: v, label: v.split(/\s+[-–·]\s+/)[0] ?? v }))].map((o) => (
              <FilterChip key={o.value} label={o.label} selected={matchFilter === o.value} onPress={() => setMatchFilter(o.value)} />
            ))}
          </ChipRow>
          {[...byMonth.entries()].map(([month, ns]) => (
            <View key={month} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}><View style={{ flex: 1 }}><Section>{MONTHS_LONG[Number(month.slice(5)) - 1]}</Section></View><Faint>{plural(ns.length, 'game')}</Faint></View>
              <WCard padding={[4, 16]}>
                {ns.map((n, i) => {
                  const bits = [n.goals ? plural(n.goals, 'goal') : null, n.assists ? plural(n.assists, 'assist') : null, n.inGoal ? `in goal · ${plural(n.saves, 'save')}` : null, n.ownGoals ? plural(n.ownGoals, 'own goal') : null, n.potm ? 'POTM' : null, n.captain ? 'captain' : null].filter(Boolean).join(' · ') || 'played';
                  return (
                    <View key={n.gameId}>
                      {i > 0 ? <Divider /> : null}
                      <Pressable accessibilityRole="link" onPress={() => openGame(n.gameId)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 }}>
                        <View style={{ width: 34, alignItems: 'center' }}><Disp size={26} lh={24}>{String(Number(n.date.slice(8, 10)))}</Disp><MonoT size={8}>{MO3[Number(n.date.slice(5, 7)) - 1]}</MonoT></View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: n.kit.hex, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' }} />
                            <Tx size={15} weight={600} lh={21} lines={1} style={{ flexShrink: 1 }}>{n.venue}</Tx>
                            {n.outcome ? <Tx size={13} weight={800} lh={17} color={OUT_TONE[n.outcome]}>{`${n.outcome} ${n.for}–${n.against}`}</Tx> : null}
                          </View>
                          <Tx color={W.ink62} lh={17} lines={1}>{`${bits}${n.edited ? ' · rating edited' : ''}`}</Tx>
                        </View>
                        <RatingChip r={n.rating} />
                      </Pressable>
                    </View>
                  );
                })}
              </WCard>
            </View>
          ))}
          {!shownNights.length ? <WCard><Tx color={W.ink62} lh={17}>No matches here.</Tx></WCard> : null}
          <Faint style={{ textAlign: 'center' }}>Tap a night for the match · ratings in colour: 8+ lime, 7s mint, 6s sand, under 6 coral</Faint>
        </>
      ) : null}

      {tab === 'stats' ? (
        <>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            {season ? <MiniToggle<Scope> value={scope} onChange={setScope} options={[{ value: 'season', label: season.name }, { value: 'all', label: 'All time' }]} /> : <View />}
            <MiniToggle<'total' | 'per'> value={perGame ? 'per' : 'total'} onChange={(v) => setPerGame(v === 'per')} options={[{ value: 'total', label: 'Total' }, { value: 'per', label: 'Per game' }]} />
          </View>
          <Faint>Counted from the stats logged each match · the bar is where they sit in the squad</Faint>
          {statGroup('Scoring', 'goals and own goals', [
            { label: 'Goals', value: pr.goals, display: fmt(pr.goals), sub: perGame ? undefined : aGame(pr.goals), max: max.goals },
            { label: 'Hat-tricks', value: more.hatTricks, max: max.hatTricks },
            { label: 'Most in a game', value: more.mostInGame?.goals ?? 0, sub: more.mostInGame ? dayMonth(more.mostInGame.date) : undefined },
            { label: 'Own goals', value: more.ownGoals },
          ])}
          {statGroup('Creating', undefined, [
            { label: 'Assists', value: pr.assists, display: fmt(pr.assists), sub: perGame ? undefined : aGame(pr.assists), max: max.assists },
            { label: 'Goals + assists', value: pr.goals + pr.assists, display: fmt(pr.goals + pr.assists), sub: perGame ? undefined : aGame(pr.goals + pr.assists), max: max.ga },
          ])}
          {statGroup('Team', undefined, [
            { label: 'Won', value: pr.wins, sub: `of ${pr.apps}`, max: pr.apps, tone: W.sun },
            { label: 'Drawn', value: pr.draws },
            { label: 'Lost', value: pr.losses },
            { label: 'Player of the match', value: pr.potm, sub: pr.potm ? `1 in ${Math.round(pr.apps / pr.potm)}` : undefined, max: max.potm },
            { label: 'Captain', value: more.captain },
          ])}
          {pr.keeperApps > 0 ? statGroup('In goal', pr.keeperApps < 3 ? 'now and then' : undefined, [
            { label: 'Games in goal', value: pr.keeperApps },
            { label: 'Saves', value: pr.saves, sub: `${(pr.saves / pr.keeperApps).toFixed(1)} a game in goal`, max: max.saves, tone: W.coral },
            { label: 'Clean sheets', value: pr.cleanSheets },
          ]) : null}
          {statGroup('Turning up', t.saidYes ? 'said yes, then came' : 'since RSVPs started', [
            { label: 'Said yes', value: t.saidYes },
            { label: 'Played', value: t.played, sub: t.saidYes ? `${Math.round((Math.min(t.played, t.saidYes) / t.saidYes) * 100)}%` : undefined, max: Math.max(t.saidYes, t.played) },
            { label: 'Late', value: t.late },
            { label: 'No-show', value: t.noShow, max: Math.max(1, t.played), tone: t.noShow ? W.coral : W.lime },
          ])}
          <WCard>
            <View style={{ marginBottom: 6 }}><CardTitle>Money</CardTitle><Faint>only you see this</Faint></View>
            {([['Shares', `${shareCount} matches`, rupees(shareCents)], ['Paid in full', `of ${shareCount}`, String(paidFull)], ['Open now', openPeople[0]?.games[0] ? shortDay(openPeople[0].games[0].date) : '', owed ? rupees(owed) : '–']] as Array<[string, string, string]>).map(([l, sub, v], i) => (
              <View key={l} style={{ paddingTop: 10, paddingBottom: 8, borderTopWidth: i ? 1 : 0, borderTopColor: W.line, flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Tx size={15} weight={600} lh={21} style={{ flex: 1 }}>{l}</Tx>
                <Faint>{sub}</Faint>
                <Disp size={26} color={l === 'Open now' && owed ? W.coralInk : W.ink}>{v}</Disp>
              </View>
            ))}
          </WCard>
          {pr.bests.length ? (
            <WCard gap={8}>
              <CardTitle>Bests</CardTitle>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {pr.bests.map((b) => <View key={b.label} style={{ width: '48.5%' }}><Tile label={b.label} value={b.value} sub={b.sub} /></View>)}
              </View>
            </WCard>
          ) : null}
          {linesCard('Season by season', allProfile.seasons)}
          {linesCard('Month by month', pr.months)}
        </>
      ) : null}

      {tab === 'dues' ? (
        <>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Tile label={owed ? 'Owes you' : 'Dues'} value={owed ? rupees(owed) : 'Clear'} tone={owed ? W.coralInk : W.lime} sub={owed ? plural(openGames, 'match', 'matches') : 'settled'} />
            <Tile label="Total spent" value={rupees(spent)} sub={pr.apps ? `${rupees(Math.round(spent / Math.max(1, shareCount)))} a match` : undefined} />
            <Tile label="Credit" value={d.credit ? `+${rupees(d.credit)}` : '–'} tone={d.credit ? W.sky : W.ink42} sub={d.credit ? 'off their next' : 'none held'} />
          </View>
          <WCard gap={8}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 6, paddingHorizontal: 4 }}>
              <Section>{p.personId === d.me ? 'Your dues' : 'Open'}</Section>
              <Tx size={13} weight={600} color={W.ink62}>{openPeople.length ? `${openGames} open` : 'clear'}</Tx>
            </View>
            {openPeople.flatMap((x) => x.games.map((g) => {
              const credit = Math.min(g.creditCents ?? 0, g.paidCents);
              const cash = g.paidCents - credit;
              return (
                <Pressable key={g.gameId} accessibilityRole="link" onPress={() => openGame(g.gameId)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: W.raised, alignItems: 'center', justifyContent: 'center' }}><Icon name="wallet" size={17} color={W.ink} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Tx size={16} weight={600} lh={21} lines={1}>{`${shortDay(g.date)} · ${g.venue}`}</Tx>
                    <Tx color={W.ink62} lh={17} lines={1}>{`${rupees(g.shareCents)} share${cash > 0 ? ` · ${rupees(cash)} paid` : ''}${credit > 0 ? ` · ${rupees(credit)} credit used` : ''}`}</Tx>
                  </View>
                  <WPill tone="coral">{rupees(g.balanceCents)}</WPill>
                </Pressable>
              );
            }))}
            {!openPeople.length ? <Tx color={W.ink62} lh={17}>Nothing open.</Tx> : null}
            {openPeople.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
                <View style={{ flex: 1 }}><NumberField label={`Part of ${rupees(owed)}, oldest first`} value={part} onChange={setPart} unit="₹" /></View>
                <Button title="Record" variant="secondary" size="sm" style={{ height: 44 }} disabled={!(part && part > 0)} onPress={() => part && settle(part)} />
              </View>
            ) : null}
            {openPeople.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                <Button title="Settle up" variant="secondary" size="sm" style={{ height: 40 }} onPress={() => settle()} />
                <CopyShare text={d.reminder} what={`Reminder for ${firstOf(p.name)} copied`} />
              </View>
            ) : null}
          </WCard>
          <WCard gap={4}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 }}><View style={{ flex: 1 }}><CardTitle>Contact and notes</CardTitle></View><Faint>only you</Faint></View>
            {([['Phone', d.person.phone], ['UPI / payment ID', d.person.upi], ['Email', d.person.email], ['Notes', p.notes]] as Array<[string, string | undefined]>).map(([l, v]) => (
              <View key={l} style={{ flexDirection: 'row', gap: 12, minHeight: 26, alignItems: 'baseline' }}>
                <Faint style={{ width: 120 }}>{l}</Faint>
                <Tx color={W.ink} lh={17} style={{ flex: 1 }}>{v || '–'}</Tx>
              </View>
            ))}
          </WCard>
        </>
      ) : null}
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
    <Screen title="Stats card" subtitle={`Player · ${p.name}`} onBack={back} right={<><SyncPill /><BellButton /></>}>
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
    <Screen title={id ? 'Edit player' : 'Add player'} subtitle="Turf › Players" onBack={back} right={<><SyncPill /><BellButton /></>} contentStyle={{ gap: 14 }}>
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
