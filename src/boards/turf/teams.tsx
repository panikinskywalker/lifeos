import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { sourceState } from '@core/sources/deviceData';
import { FORMATIONS, KIT_PRESETS, TURF_KEY, formationOf, isSending, kitsOf, pickCaptains, turfBase, turfPlayerId, saveTeams, setFormation, setKits, shuffleTeams, suggestTeams, rows as formationRows, type AppearanceData, type GameData, type Kit, type PlayerProfileData, type TeamSuggestion } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { displayFont, monoFonts } from '@ui/theme/tokens';
import { Button, EmptyState, FilterChip, Icon, Screen, Text, useToast } from '@ui/kit';
import { usePull } from './useTurfSync';
import { SearchBox, found } from './search';
import { BellButton } from './bell-button';

/**
 * Turf team screens: Pick teams, 1:1 with Turf web's PickTeams sheet
 * (app/ui/match-sheets.tsx: Suggest teams, Reshuffle, Random, Captains, kits,
 * the L / S side toggle, formations), and the parts the match uses: crests,
 * faces, the pitch with each side in its formation, the side lists.
 */

type Props = { ctx: LifeOSContext; params: Record<string, string> };

const GREEN = '#1F4D34';
const FACE_COLOURS = ['#D7F55C', '#F4A8CE', '#F6E27F', '#A9C4FF', '#6FD3C8', '#C9A7F5', '#E8DD7A', '#9FE0B5'];
const INK = '#0B0B0D';

const initials = (name: string) => {
  // Words with letters only ("Neel (guest)" → N, not "N(").
  const parts = name.trim().split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, '')).filter(Boolean).filter((w, i, all) => !(all.length > 1 && i === all.length - 1 && /^guest$/i.test(w)));
  return (parts.length > 1 ? parts[0]![0]! + parts[parts.length - 1]![0]! : (parts[0] ?? '?').slice(0, 1)).toUpperCase();
};
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const colourFor = (id: string) => FACE_COLOURS[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % FACE_COLOURS.length]!;

/** Bebas Neue text (team letters, names, numbers). */
export function Display({ children, size, color, style }: { children: React.ReactNode; size: number; color?: string; style?: object }) {
  return (
    <Text variant="body" color={color} style={[{ fontFamily: displayFont, fontSize: size, lineHeight: Math.round(size * 0.9), letterSpacing: +(size * 0.02).toFixed(1), textTransform: 'uppercase' }, style]}>
      {children}
    </Text>
  );
}

/** JetBrains Mono, 10/500 caps (+0.6): positions, counts, the legend. */
export function Mono({ children, color, size = 10, style }: { children: React.ReactNode; color?: string; size?: number; style?: object }) {
  return (
    <Text variant="mono" color={color ?? 'tertiary'} style={[{ fontSize: size, lineHeight: Math.round(size * 1.3), textTransform: 'uppercase' }, style]}>
      {children}
    </Text>
  );
}

/** A team's crest: a disc of the kit, a ground ring, the letter in the kit's colour on dark. */
export function Crest({ kit, size = 36 }: { kit: Kit; size?: number }) {
  const t = useTheme();
  const inner = Math.round(size * (size >= 60 ? 0.81 : 0.67));
  return (
    <View style={{ width: size + 8, height: size + 8, borderRadius: (size + 8) / 2, borderWidth: 1, borderColor: `${kit.hex}55`, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size + 6, height: size + 6, borderRadius: (size + 6) / 2, backgroundColor: t.c.bg.tile, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: kit.hex, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: t.c.bg.tile, alignItems: 'center', justifyContent: 'center' }}>
            <Display size={Math.round(size * 0.5)} color={kit.text} style={{ lineHeight: Math.round(size * 0.5) }}>
              {kit.letter}
            </Display>
          </View>
        </View>
      </View>
    </View>
  );
}

/** This phone's key for Turf web, read once: photos need it (they aren't public). */
let keyOnce: Promise<string | null> | null = null;
export function useTurfPhoto(path: string | null | undefined) {
  const os = useOS();
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    keyOnce ??= os.device?.secrets?.get(TURF_KEY).catch(() => null) ?? Promise.resolve(null);
    void keyOnce.then((k) => live && setKey(k));
    return () => {
      live = false;
    };
  }, [os, path]);
  const base = turfBase(os);
  return path && base && key ? { uri: `${base}${path}`, headers: { Authorization: `Bearer ${key}` } } : null;
}

/** A player's face: their Turf web photo when there is one (and it loads), else initials on their colour. */
export function Face({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  const path = useLive((o) => {
    const p = o.records.query<PlayerProfileData>('player', { filter: { and: [{ field: 'data.personId', op: 'eq', value: id }] } }, { limit: 1 })[0];
    const turfId = p ? turfPlayerId(p.data) : null;
    return p?.data.photoPath && turfId ? `/api/players/${encodeURIComponent(turfId)}/photo?v=${encodeURIComponent(p.data.photoPath)}` : null;
  }, [id]);
  const photo = useTurfPhoto(path);
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: colourFor(id), alignItems: 'center', justifyContent: 'center' }}>
      {photo && !failed ? (
        <Image source={photo} onError={() => setFailed(true)} resizeMode="cover" accessibilityIgnoresInvertColors style={{ width: size, height: size }} />
      ) : (
        <Text variant="labelMicro" color={INK} style={{ fontSize: Math.round(size * 0.37), lineHeight: Math.round(size * 0.5), fontWeight: '700' }}>
          {initials(name)}
        </Text>
      )}
    </View>
  );
}

/** The L / S toggle: a charcoal pill of two 40×30 halves, the chosen one in its kit; a coral ring while unassigned. */
function SideToggle({ value, kits, onChange }: { value: 'A' | 'B' | null; kits: { A: Kit; B: Kit }; onChange: (v: 'A' | 'B') => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, borderWidth: value ? 0 : 1.5, borderColor: '#FF5C4780' }}>
      {(['A', 'B'] as const).map((side) => {
        const on = value === side;
        return (
          <Pressable key={side} accessibilityRole="button" accessibilityLabel={`${kits[side].name}`} accessibilityState={{ selected: on }} onPress={() => onChange(side)} style={{ width: 40, height: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? kits[side].hex : 'transparent' }}>
            <Display size={15} color={on ? (kits[side].ink === 'dark' ? INK : '#F5F5F7') : t.c.fg.tertiary} style={{ lineHeight: 30 }}>
              {kits[side].letter}
            </Display>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "Synced 9:40" — a quiet pill with a lime dot (coral when the last sync failed). */
export function SyncPill() {
  const t = useTheme();
  const st = useLive((o) => sourceState(o, 'turf'), []);
  if (!st.lastSync && !st.error) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.c.bg.dim }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: st.error ? t.c.alert.coral : t.c.accent.mustard }} />
      <Text variant="labelMicro" color="tertiary" style={{ fontSize: 11, lineHeight: 14 }}>
        {st.error ? 'Not synced' : `Synced ${format(st.lastSync!, 'H:mm')}`}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The pitch                                                           */
/* ------------------------------------------------------------------ */

export const PITCH_W = 318;
export const PITCH_H = 440;

/** How deep a position plays (Turf web's pitch): keeper −1, defence 0 … forwards 4. */
export function depthOf(position: string | null | undefined): number {
  const p = (position || '').toUpperCase();
  if (p === 'GK') return -1;
  if (/CB|LB|RB|WB|DEF|SW/.test(p)) return 0;
  if (/CDM|DM/.test(p)) return 1;
  if (/CM|LM|RM|MID/.test(p)) return 2;
  if (/CAM|AM|LW|RW|WING/.test(p)) return 3;
  if (/ST|CF|FW|FWD/.test(p)) return 4;
  return 2;
}

export interface PitchPlayer {
  id: string;
  personId: string;
  name: string;
  team: 'A' | 'B' | null;
  position: string | null;
  inGoal: boolean;
  goals: number;
  noShow: boolean;
}
type Slot = { p: PitchPlayer; x: number; y: number; team: 'A' | 'B'; keeper: boolean; captain: boolean };

function guessFormation(n: number): string {
  if (n <= 0) return '1';
  if (n <= 3) return Array(n).fill('1').join('-');
  const d = Math.max(1, Math.round(n * 0.4));
  const f = Math.max(1, Math.round(n * 0.2));
  const m = Math.max(1, n - d - f);
  return `${d}-${m}-${f}`;
}

/** Where everyone stands, for one team, from its formation (Turf web's `layout`, as is). */
export function pitchLayout(g: GameData, players: PitchPlayer[], team: 'A' | 'B'): Slot[] {
  const side = players.filter((p) => p.team === team && !p.noShow);
  if (!side.length) return [];
  const shape = formationOf(g, team) || guessFormation(side.length - 1);
  const rows = formationRows(shape);
  const byDepth = [...side].sort((a, b) => depthOf(a.position) - depthOf(b.position));
  const keeper = side.find((p) => p.inGoal || depthOf(p.position) === -1) || (side.length > 1 ? byDepth[0]! : null);
  const outfield = byDepth.filter((p) => p !== keeper);
  const slots: Slot[] = [];
  const captainId = team === 'A' ? g.captainAId : g.captainBId;
  const held = rows.reduce((a, b) => a + b, 0);
  const extraRows = Math.ceil(Math.max(0, outfield.length - held) / Math.max(1, Math.max(...rows)));
  const rowCount = 1 + rows.length + extraRows;
  const step = Math.min(55, 165 / Math.max(1, rowCount - 1));
  const yAt = (i: number) => Math.round(team === 'A' ? 2 + i * step : 390 - i * step);
  const place = (p: PitchPlayer, rowIndex: number, k: number, n: number) => {
    const spread = Math.min(128, 290 / Math.max(1, n));
    slots.push({ p, x: Math.round(133 + (k - (n - 1) / 2) * spread), y: yAt(rowIndex), team, keeper: rowIndex === 0, captain: p.personId === captainId });
  };
  if (keeper) place(keeper, 0, 0, 1);
  let i = 0;
  rows.forEach((n, r) => {
    const members = outfield.slice(i, i + n);
    i += n;
    members.forEach((p, k) => place(p, r + 1, k, members.length));
  });
  const rest = outfield.slice(i);
  const width = Math.max(1, ...rows);
  for (let r = 0; r * width < rest.length; r += 1) {
    const chunk = rest.slice(r * width, (r + 1) * width);
    chunk.forEach((p, k) => place(p, rows.length + 1 + r, k, chunk.length));
  }
  return slots;
}

const PANELS = ['8.5,-4.9 12.7,-1.9 11.1,3.1 5.9,3.1 4.3,-1.9', '21.3,4.3 19.7,9.3 14.5,9.3 12.9,4.3 17.1,1.3', '16.4,19.4 11.2,19.4 9.6,14.4 13.8,11.4 18.0,14.4', '0.6,19.4 -1.0,14.4 3.2,11.4 7.4,14.4 5.8,19.4', '-4.3,4.3 -0.1,1.3 4.1,4.3 2.5,9.3 -2.7,9.3'];

/** Goals scored: a football with the number in its white middle (the design's 17px ball). */
export function GoalBall({ n, size, id }: { n: number; size: number; id: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 17 17" accessibilityLabel={`${n} ${n === 1 ? 'goal' : 'goals'}`}>
      <Defs>
        <ClipPath id={`ball-${id}`}>
          <Circle cx="8.5" cy="8.5" r="8" />
        </ClipPath>
      </Defs>
      <Circle cx="8.5" cy="8.5" r="8" fill="#F5F5F7" />
      <G clipPath={`url(#ball-${id})`}>
        {PANELS.map((points) => (
          <Polygon key={points} points={points} fill={INK} opacity={0.9} />
        ))}
      </G>
      <Circle cx="8.5" cy="8.5" r="7.75" fill="none" stroke={INK} strokeWidth={1} />
      <Circle cx="8.5" cy="8.5" r="4.25" fill="#F5F5F7" />
      <SvgText x="8.5" y="11.4" textAnchor="middle" fontSize={n > 9 ? 6.5 : 8} fontWeight="800" fill={INK}>
        {String(n)}
      </SvgText>
    </Svg>
  );
}

/** A 16 round badge on a face (the captain's C, the keeper's glove, the star). */
function Badge({ place, scale, background, children }: { place: { left?: number; right?: number; top?: number; bottom?: number }; scale: number; background: string; children: React.ReactNode }) {
  const at = Object.fromEntries(Object.entries(place).map(([k, v]) => [k, v * scale]));
  return <View style={{ position: 'absolute', ...at, width: 20 * scale, height: 20 * scale, borderRadius: 10 * scale, backgroundColor: background, borderWidth: 2 * scale, borderColor: GREEN, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}

function Glove({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 11V6a2 2 0 0 0-4 0v1M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8" />
      <Path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </Svg>
  );
}

function StarGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </Svg>
  );
}

/** The pitch (318×440, scaled to fit): Lime at the top attacking down, Sky at the bottom; faces in kit rings with goals, star, C and glove. */
export function Pitch({ game, players }: { game: GameData; players: PitchPlayer[] }) {
  const [width, setWidth] = useState(0);
  const scale = width ? Math.min(1, width / PITCH_W) : 1;
  const kits = kitsOf(game);
  const slots = [...pitchLayout(game, players, 'A'), ...pitchLayout(game, players, 'B')];
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%', alignItems: 'center' }}>
      {width ? (
        <View style={{ width: PITCH_W * scale, height: PITCH_H * scale }}>
          <Svg width={PITCH_W * scale} height={PITCH_H * scale} viewBox={`0 0 ${PITCH_W} ${PITCH_H}`} style={{ position: 'absolute', top: 0, left: 0 }}>
            <Rect x={0} y={0} width={PITCH_W} height={PITCH_H} rx={22} fill={GREEN} />
            {Array.from({ length: 8 }, (_, i) => (
              <Rect key={i} x={0} y={i * 55} width={PITCH_W} height={55} fill={i % 2 ? 'rgba(255,255,255,0.03)' : 'transparent'} />
            ))}
            <G stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} fill="none">
              <Rect x={10} y={10} width={PITCH_W - 20} height={PITCH_H - 20} rx={14} />
              <Line x1={10} y1={PITCH_H / 2} x2={PITCH_W - 10} y2={PITCH_H / 2} />
              <Circle cx={PITCH_W / 2} cy={PITCH_H / 2} r={34} />
              <Rect x={79} y={10} width={160} height={54} />
              <Rect x={79} y={PITCH_H - 64} width={160} height={54} />
              <Rect x={119} y={10} width={80} height={22} />
              <Rect x={119} y={PITCH_H - 32} width={80} height={22} />
            </G>
            <Circle cx={PITCH_W / 2} cy={PITCH_H / 2} r={2.5} fill="rgba(255,255,255,0.5)" />
          </Svg>
          {slots.map((s) => {
            const kit = kits[s.team];
            const ink = kit.ink === 'dark' ? INK : '#F5F5F7';
            return (
              <View key={s.p.id} style={{ position: 'absolute', left: s.x * scale, top: s.y * scale, width: 52 * scale, alignItems: 'center', gap: 2 * scale }}>
                <View>
                  <Face id={s.p.personId} name={s.p.name} size={Math.round(32 * scale)} />
                  <View pointerEvents="none" style={{ position: 'absolute', top: -3 * scale, left: -3 * scale, right: -3 * scale, bottom: -3 * scale, borderRadius: 999, borderWidth: 2 * scale, borderColor: kit.hex }} />
                  {s.keeper ? (
                    <Badge scale={scale} place={{ left: -8, top: -6 }} background={kit.hex}>
                      <Glove size={9 * scale} color={ink} />
                    </Badge>
                  ) : null}
                  {game.motmId === s.p.personId ? (
                    <Badge scale={scale} place={s.keeper ? { left: -8, bottom: -4 } : { left: -8, top: -6 }} background="#D7F55C">
                      <StarGlyph size={9 * scale} />
                    </Badge>
                  ) : null}
                  {s.captain ? (
                    <Badge scale={scale} place={{ right: -7, bottom: -4 }} background={kit.hex}>
                      <Text variant="labelMicro" color={ink} style={{ fontSize: 9 * scale, lineHeight: 12 * scale, fontWeight: '800' }}>
                        C
                      </Text>
                    </Badge>
                  ) : null}
                  {s.p.goals > 0 ? (
                    <View style={{ position: 'absolute', right: -7 * scale, top: -6 * scale }}>
                      <GoalBall n={s.p.goals} size={17 * scale} id={s.p.id} />
                    </View>
                  ) : null}
                </View>
                <Text variant="labelMicro" numberOfLines={1} style={{ fontSize: 10 * scale, lineHeight: 12 * scale, fontWeight: '700', maxWidth: 60 * scale, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 2, textShadowOffset: { width: 0, height: 1 } }}>
                  {firstName(s.p.name)}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

/** The players of a match for the pitch and lists. */
export function pitchPlayers(os: LifeOSContext, gameId: string): PitchPlayer[] {
  const profiles = os.records.query<PlayerProfileData>('player', {}, { limit: 100_000 });
  const byPerson = new Map(profiles.map((p) => [p.data.personId, p.data]));
  return os.records
    .query<AppearanceData>('appearance', { filter: { and: [{ field: 'data.gameId', op: 'eq', value: gameId }] } }, { limit: 500 })
    .filter((a) => !a.archived)
    .map((a) => ({ id: a.id, personId: a.data.personId, name: byPerson.get(a.data.personId)?.name ?? os.records.get(a.data.personId)?.title ?? 'Player', team: a.data.team ?? null, position: a.data.position ?? byPerson.get(a.data.personId)?.position ?? null, inGoal: !!a.data.inGoal, goals: a.data.goals ?? 0, noShow: a.data.attendance === 'no_show' }));
}

/* ------------------------------------------------------------------ */
/* 4d · Pick teams                                                     */
/* ------------------------------------------------------------------ */

export function TurfPickTeams({ params }: Props) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { pull } = usePull();
  const back = () => (router.canGoBack() ? router.back() : router.replace('/board/turf/games' as never));
  const gameId = params.game ?? '';
  const d = useLive((o) => {
    const g = o.records.get<GameData>(gameId);
    if (!g || g.object !== 'game') return null;
    const apps = o.records.query<AppearanceData>('appearance', { filter: { and: [{ field: 'data.gameId', op: 'eq', value: gameId }] } }, { limit: 500 }).filter((a) => !a.archived && a.data.attendance !== 'no_show');
    const players = pitchPlayers(o, gameId).filter((p) => !p.noShow);
    // Turf web's player ids (kit wishes are kept by them), from each share's key.
    const turfName = new Map(apps.map((a) => [a.data.sourceKey?.split(':').pop() ?? '', players.find((p) => p.id === a.id)?.name ?? 'Player']));
    const keepersWilling = new Set(o.records.query<PlayerProfileData>('player', {}, { limit: 100_000 }).filter((p) => p.data.keeperWilling).map((p) => p.data.personId));
    return { g, apps, players, turfName, keepersWilling };
  }, [gameId]);
  const [draft, setDraft] = useState<Record<string, 'A' | 'B' | null> | null>(null);
  const [q, setQ] = useState('');
  const [suggestion, setSuggestion] = useState<TeamSuggestion | null>(null);
  const [shape, setShape] = useState<'A' | 'B' | null>(null);
  const teams = useMemo(() => draft ?? Object.fromEntries((d?.apps ?? []).map((a) => [a.id, a.data.team ?? null])), [draft, d]);
  if (!d) {
    return (
      <Screen title="Pick teams" onBack={back}>
        <EmptyState icon="target" line="That match isn’t here any more." />
      </Screen>
    );
  }
  const kits = kitsOf(d.g.data);
  const count = (side: 'A' | 'B') => Object.values(teams).filter((x) => x === side).length;
  const unassigned = d.apps.length - count('A') - count('B');
  const keepers = d.players.filter((p) => depthOf(p.position) === -1 || d.keepersWilling.has(p.personId)).length;
  const changed = d.apps.filter((a) => (a.data.team ?? null) !== (teams[a.id] ?? null)).length;
  const set = (id: string, side: 'A' | 'B') => setDraft({ ...teams, [id]: teams[id] === side ? null : side });
  // Suggest teams (docs/RATINGS.md): Turf web's generator; Reshuffle picks another split just as fair.
  const suggest = (reshuffle = false) => {
    const s = suggestTeams(os, d.g.id, reshuffle ? Math.random : undefined);
    if (!s) return toast.show({ message: 'Need at least two players', icon: 'info' });
    setSuggestion(s);
    setDraft({ ...teams, ...s.teams });
    toast.show({ message: `${reshuffle ? 'Reshuffled' : 'Suggested'} · ${s.result.balance.shareA}% v ${s.result.balance.shareB}%`, icon: 'check' });
  };
  const random = () => {
    const gks = new Set(d.players.filter((p) => depthOf(p.position) === -1).map((p) => p.personId));
    setSuggestion(null);
    setDraft({ ...teams, ...shuffleTeams(d.apps as Array<ObjectRecord<AppearanceData>>, (a) => gks.has(a.personId)) });
    toast.show({ message: 'Shuffled', icon: 'check' });
  };
  const saveDraft = () => {
    const n = saveTeams(os, d.g.id, teams);
    setDraft(null);
    return n;
  };
  // Captains: last match's player of the match, else a regular who hasn't led lately (on the sides as they stand).
  const captains = () => {
    try {
      if (changed) saveDraft();
      const r = pickCaptains(os, d.g.id);
      const name = (id?: string) => firstName(d.players.find((p) => p.personId === id)?.name ?? '?');
      toast.show({ message: [r.A ? `${kits.A.name}: ${name(r.A.personId)} (${r.A.why})` : null, r.B ? `${kits.B.name}: ${name(r.B.personId)} (${r.B.why})` : null].filter(Boolean).join(' · ') || 'Pick the sides first', icon: 'check' });
      void pull(true);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  const save = () => {
    try {
      const n = saveDraft();
      toast.show({ message: n ? `Teams saved · ${n} change${n === 1 ? '' : 's'} sending to Turf web` : 'Nothing changed', icon: 'check' });
      if (n) void pull(true);
      back();
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  const kitTo = (side: 'A' | 'B', hex: string) => {
    try {
      if (setKits(os, d.g.id, side === 'A' ? hex : kits.A.hex, side === 'B' ? hex : kits.B.hex)) void pull(true);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  const shapeTo = (side: 'A' | 'B', f: string) => {
    try {
      if (setFormation(os, d.g.id, side, f)) void pull(true);
      setShape(null);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };
  const sideHead = (side: 'A' | 'B') => (
    <View style={{ flexDirection: side === 'A' ? 'row' : 'row-reverse', alignItems: 'center', gap: 8 }}>
      <Crest kit={kits[side]} size={36} />
      <Display size={18}>{kits[side].name}</Display>
      <Display size={28} color={kits[side].text}>
        {count(side)}
      </Display>
    </View>
  );
  const nameFor = (id: string) => d.players.find((p) => p.id === id);
  const divider = <View style={{ height: 1, backgroundColor: t.c.line }} />;
  const field = (label: string, right: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Text variant="label" style={{ fontSize: 14, fontWeight: '700' }}>{label}</Text>
      <Text variant="caption" color="tertiary" style={{ marginLeft: 'auto' }}>{right}</Text>
    </View>
  );
  const asked = (shade: 'dark' | 'light') => Object.entries(d.g.data.kitPicks ?? {}).filter(([, v]) => v === shade).map(([id]) => firstName(d.turfName.get(id) ?? '?'));
  const dark = asked('dark');
  const light = asked('light');
  const shapes = d.g.data.sideSize && FORMATIONS[d.g.data.sideSize] ? FORMATIONS[d.g.data.sideSize]! : Object.values(FORMATIONS).flat();
  const card = { backgroundColor: t.c.bg.tile, borderRadius: 24, padding: 14, gap: 8 } as const;
  return (
    <Screen title="Pick teams" subtitle={changed ? `${changed} to save · tap ${kits.A.letter} or ${kits.B.letter} on a player` : `tap ${kits.A.letter} or ${kits.B.letter} on a player`} onBack={back} right={<><SyncPill /><BellButton /></>}>
      <View style={{ backgroundColor: t.c.bg.tile, borderRadius: 28, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {sideHead('A')}
          {sideHead('B')}
        </View>
        <View style={{ flexDirection: 'row', gap: 3, height: 8 }}>
          {count('A') ? <View style={{ flex: count('A'), borderRadius: 4, backgroundColor: kits.A.hex }} /> : null}
          {count('B') ? <View style={{ flex: count('B'), borderRadius: 4, backgroundColor: kits.B.hex }} /> : null}
          {unassigned ? <View style={{ flex: unassigned, borderRadius: 4, backgroundColor: t.c.bg.tileRaised }} /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text variant="caption" color="secondary" style={{ flex: 1 }}>
            {unassigned ? `${unassigned} still to assign · tap ${kits.A.letter} or ${kits.B.letter} on a player` : 'Everyone has a side'}
          </Text>
          <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: t.c.bg.tileRaised }}>
            <Text variant="labelMicro" color="secondary">{`${d.apps.length} in`}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title="Suggest teams" icon="sparkles" variant="secondary" size="sm" style={{ height: 40, paddingHorizontal: 16 }} onPress={() => suggest()} />
          {suggestion ? <Button title="Reshuffle" icon="refresh" variant="secondary" size="sm" style={{ height: 40, paddingHorizontal: 16 }} onPress={() => suggest(true)} /> : null}
          <Button title="Random" icon="repeat" variant="secondary" size="sm" style={{ height: 40, paddingHorizontal: 16 }} onPress={random} />
          {count('A') && count('B') ? <Button title="Captains" icon="flag" variant="secondary" size="sm" style={{ height: 40, paddingHorizontal: 16 }} onPress={captains} /> : null}
        </View>
        {suggestion ? (
          <View style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.c.line }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Display size={22} color={kits.A.text}>{`${suggestion.result.balance.shareA}%`}</Display>
              <View style={{ flex: 1, flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 }}>
                <View style={{ flex: suggestion.result.balance.shareA, backgroundColor: kits.A.hex }} />
                <View style={{ flex: suggestion.result.balance.shareB, backgroundColor: kits.B.hex }} />
              </View>
              <Display size={22} color={kits.B.text}>{`${suggestion.result.balance.shareB}%`}</Display>
            </View>
            {suggestion.result.explanation.map((line) => (
              <View key={line} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                <Icon name="check" size={12} color={t.c.accent.mustard} />
                <Text variant="caption" color="tertiary" style={{ flex: 1 }}>{line}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      <Text variant="caption" color="tertiary">
        Suggest teams tries every split: keepers split, the two strongest apart, the sides’ average overall as close as it gets, then positions; “play well with”, side and kit wishes break ties. Captains: last match’s player of the match, else a regular who hasn’t led lately.
      </Text>

      <View style={{ ...card, gap: 10 }}>
        {field('Kits', `${kits.A.name} v ${kits.B.name}`)}
        {dark.length || light.length ? (
          <View style={{ gap: 4 }}>
            <Text variant="caption" color="tertiary">Players asked for</Text>
            {dark.length ? <Text variant="caption" color="secondary"><Text variant="caption" style={{ fontWeight: '700' }}>{`Dark · ${dark.length}`}</Text>{` ${dark.join(', ')}`}</Text> : null}
            {light.length ? <Text variant="caption" color="secondary"><Text variant="caption" style={{ fontWeight: '700' }}>{`Light · ${light.length}`}</Text>{` ${light.join(', ')}`}</Text> : null}
          </View>
        ) : null}
        {(['A', 'B'] as const).map((side) => (
          <View key={side} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Crest kit={kits[side]} size={32} />
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {KIT_PRESETS.map((k) => {
                const on = k.hex.toLowerCase() === kits[side].hex.toLowerCase();
                return (
                  <Pressable key={k.hex} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`Team ${side} kit ${k.name}`} onPress={() => kitTo(side, k.hex)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: k.hex, borderWidth: on ? 2 : 1, borderColor: on ? t.c.bg.tile : 'rgba(255,255,255,0.18)' }}>
                    {on ? <View pointerEvents="none" style={{ position: 'absolute', top: -4, left: -4, width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: '#F5F5F7' }} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      <View style={card}>
        {d.apps.length > 8 ? <SearchBox value={q} onChange={setQ} placeholder="Search players" /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text variant="label" style={{ fontSize: 14, fontWeight: '700' }}>Players in this match</Text>
          <Mono style={{ marginLeft: 'auto' }}>{`${keepers} ${keepers === 1 ? 'keeper' : 'keepers'}${keepers >= 2 ? ' · 1 each' : ''}`}</Mono>
        </View>
        {d.apps.filter((a) => found(q, nameFor(a.id)?.name)).map((a, i) => {
          const p = nameFor(a.id);
          const side = teams[a.id] ?? null;
          const where = [p?.position, side ? kits[side].name : 'not assigned'].filter(Boolean).join(' · ');
          return (
            <View key={a.id} style={{ gap: 8 }}>
              {i ? divider : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46 }}>
                <Face id={a.data.personId} name={p?.name ?? '?'} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="tileTitle" numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700' }}>
                    {p?.name ?? 'Player'}
                  </Text>
                  <Text variant="caption" color={side ? 'tertiary' : t.c.alert.coralText} numberOfLines={1} style={{ fontSize: 13, lineHeight: 17 }}>
                    {where}
                    {isSending(os, a.id) ? ' · sending…' : ''}
                  </Text>
                </View>
                <SideToggle value={side} kits={kits} onChange={(v) => set(a.id, v)} />
              </View>
            </View>
          );
        })}
      </View>

      <View style={card}>
        {field('Formation', 'tap to change')}
        {(['A', 'B'] as const).map((side, i) => {
          const current = formationOf(d.g.data, side);
          return (
            <View key={side} style={{ gap: 8 }}>
              {i ? divider : null}
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: shape === side }} accessibilityLabel={`${kits[side].name} formation`} onPress={() => setShape(shape === side ? null : side)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
                <Crest kit={kits[side]} size={32} />
                <View style={{ flex: 1 }}>
                  <Text variant="tileTitle" style={{ fontSize: 15, lineHeight: 20, fontWeight: '700' }}>{kits[side].name}</Text>
                  <Text variant="caption" color="tertiary">{d.g.data.sideSize ? `${d.g.data.sideSize}-a-side` : 'any size'}</Text>
                </View>
                <Display size={20} color={kits[side].text}>{current ?? '–'}</Display>
                <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
              </Pressable>
              {shape === side ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {shapes.map((f) => (
                    <FilterChip key={f} label={f} selected={current === f} onPress={() => shapeTo(side, f)} />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <Button title={changed ? `Save teams · ${changed} change${changed === 1 ? '' : 's'}` : 'Save teams'} icon="check" block onPress={save} />
      <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
        Captains: the Captains button above, or by hand in Log stats. Every change is in the audit log with Undo.
      </Text>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* 4b · Team view: the side lists under the pitch                      */
/* ------------------------------------------------------------------ */

const statLine = (a: AppearanceData) => [a.goals ? `${a.goals}G` : null, a.assists ? `${a.assists}A` : null, a.inGoal && a.saves ? `${a.saves}S` : null].filter(Boolean).join(' ');

export function SideLists({ game, apps, names, onOpen }: { game: GameData; apps: Array<ObjectRecord<AppearanceData>>; names: Map<string, string>; onOpen: (appearanceId: string) => void }) {
  const t = useTheme();
  const kits = kitsOf(game);
  const column = (side: 'A' | 'B') => {
    const list = apps.filter((a) => a.data.team === side && a.data.attendance !== 'no_show');
    const captain = side === 'A' ? game.captainAId : game.captainBId;
    return (
      <View style={{ flex: 1, gap: 6, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: kits[side].hex, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="tileTitle" style={{ fontWeight: '700' }}>
              {kits[side].name}
            </Text>
            {captain ? (
              <Text variant="caption" color="tertiary" numberOfLines={1}>
                {`C · ${firstName(names.get(captain) ?? '')}`}
              </Text>
            ) : null}
          </View>
        </View>
        {list.map((a) => (
          <Pressable key={a.id} accessibilityRole="button" onPress={() => onOpen(a.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Face id={a.data.personId} name={names.get(a.data.personId) ?? '?'} size={28} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="caption" numberOfLines={1} style={{ fontWeight: '600', lineHeight: 16 }}>
                {firstName(names.get(a.data.personId) ?? 'Player')}
              </Text>
              <Mono size={9}>{a.data.inGoal ? 'GK' : a.data.position ?? ''}</Mono>
            </View>
            <Text variant="mono" color="secondary" style={{ fontFamily: monoFonts[700], letterSpacing: 0.6 }}>
              {statLine(a.data)}
            </Text>
          </Pressable>
        ))}
      </View>
    );
  };
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {column('A')}
        <View style={{ width: 1, backgroundColor: t.c.line }} />
        {column('B')}
      </View>
      <View style={{ height: 1, backgroundColor: t.c.line }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Mono>G goals · A assists · S saves</Mono>
      </View>
    </View>
  );
}
