import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Polygon, Rect, Text as SvgText } from 'react-native-svg';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { sourceState } from '@core/sources/deviceData';
import { FORMATIONS, formationOf, isSending, kitsOf, rows as formationRows, saveTeams, setFormation, shuffleTeams, suggestTeams, type AppearanceData, type GameData, type Kit, type PlayerProfileData, type TeamSuggestion } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { displayFont, monoFonts } from '@ui/theme/tokens';
import { Button, ChipRow, EmptyState, FilterChip, Icon, Screen, Sheet, Text, useToast } from '@ui/kit';
import { usePull } from './useTurfSync';

/**
 * Turf · Noir team screens (Claude Design canvas, page *Turf · Noir*):
 * 4d Pick teams (TF-PickTeams) and the parts of 4b Team view (TF-MatchTeams):
 * crests, faces, the L / S side toggle, the pitch with each side in its
 * formation, the side lists. Sizes and colours are the artboards'.
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

/** A player's face: initials on their colour. */
export function Face({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colourFor(id), alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="labelMicro" color={INK} style={{ fontSize: Math.round(size * 0.37), lineHeight: Math.round(size * 0.5), fontWeight: '700' }}>
        {initials(name)}
      </Text>
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

export function TurfPickTeams({ ctx, params }: Props) {
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
    return { g, apps, players: pitchPlayers(o, gameId).filter((p) => !p.noShow) };
  }, [gameId]);
  const [draft, setDraft] = useState<Record<string, 'A' | 'B' | null> | null>(null);
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
  const keepers = d.players.filter((p) => p.inGoal || depthOf(p.position) === -1).length;
  const changed = d.apps.filter((a) => (a.data.team ?? null) !== (teams[a.id] ?? null)).length;
  const set = (id: string, side: 'A' | 'B') => setDraft({ ...teams, [id]: side });
  const balance = (reshuffle = false) => {
    const s = suggestTeams(os, d.g.id, reshuffle ? Math.random : undefined);
    if (!s) return toast.show({ message: 'Need at least two players', icon: 'info' });
    setSuggestion(s);
    setDraft({ ...teams, ...s.teams });
  };
  const shuffle = () => {
    const keepers = new Set(d.players.filter((p) => p.inGoal || depthOf(p.position) === -1).map((p) => p.personId));
    setSuggestion(null);
    setDraft({ ...teams, ...shuffleTeams(d.apps as Array<ObjectRecord<AppearanceData>>, (a) => keepers.has(a.personId)) });
  };
  const save = () => {
    try {
      const n = saveTeams(os, d.g.id, teams);
      toast.show({ message: n ? `Teams saved · ${n} change${n === 1 ? '' : 's'} sending to Turf web` : 'Nothing changed', icon: 'check' });
      if (n) void pull(true);
      back();
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
  return (
    <Screen title="Pick teams" subtitle={`Match · ${format(new Date(`${d.g.data.date}T12:00:00`), 'EEE d MMM')}`} onBack={back} right={<SyncPill />}>
      <View style={{ backgroundColor: t.c.bg.tile, borderRadius: 28, padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {sideHead('A')}
          {sideHead('B')}
        </View>
        <View style={{ flexDirection: 'row', gap: 3, height: 8 }}>
          {count('A') ? <View style={{ flex: count('A'), borderRadius: 4, backgroundColor: kits.A.hex }} /> : null}
          {count('B') ? <View style={{ flex: count('B'), borderRadius: 4, backgroundColor: kits.B.hex }} /> : null}
          {unassigned ? <View style={{ flex: unassigned, borderRadius: 4, backgroundColor: t.c.bg.dim }} /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text variant="caption" color="secondary" style={{ flex: 1 }}>
            {suggestion ? `Balanced · ${suggestion.result.balance.shareA}% v ${suggestion.result.balance.shareB}%` : unassigned ? `${unassigned} still to assign · tap ${kits.A.letter} or ${kits.B.letter} on a player` : 'Everyone has a side'}
          </Text>
          <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: t.c.bg.dim }}>
            <Text variant="labelMicro" color="secondary">{`${d.apps.length} in`}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title="Shuffle" icon="repeat" variant="secondary" size="sm" style={{ height: 40, paddingHorizontal: 16 }} onPress={shuffle} />
          <Button title={suggestion ? 'Reshuffle' : 'Balance by rating'} icon="scale" variant="secondary" size="sm" style={{ height: 40, paddingHorizontal: 16 }} onPress={() => balance(!!suggestion)} />
        </View>
        {suggestion ? (
          <View style={{ gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.c.line }}>
            {suggestion.result.explanation.map((line) => (
              <View key={line} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                <Icon name="check" size={12} color={t.c.accent.mustard} />
                <Text variant="caption" color="tertiary" style={{ flex: 1, fontSize: 12, lineHeight: 16 }}>
                  {line}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ backgroundColor: t.c.bg.tile, borderRadius: 24, padding: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text variant="tileTitle" style={{ flex: 1 }}>
            Players in this match
          </Text>
          <Mono>{keepers ? `${keepers} keeper${keepers === 1 ? '' : 's'}` : 'no keeper'}</Mono>
        </View>
        {d.apps.map((a, i) => {
          const p = nameFor(a.id);
          const side = teams[a.id] ?? null;
          const where = [p?.position, side ? kits[side].name : 'not assigned'].filter(Boolean).join(' · ');
          return (
            <View key={a.id} style={{ gap: 8 }}>
              {i ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Face id={a.data.personId} name={p?.name ?? '?'} size={32} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="tileTitle" numberOfLines={1} style={{ fontWeight: '700' }}>
                    {p?.name ?? 'Player'}
                  </Text>
                  <Text variant="caption" color={side ? 'tertiary' : t.c.alert.coralText} numberOfLines={1}>
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

      <View style={{ backgroundColor: t.c.bg.tile, borderRadius: 24, padding: 14, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
          <Text variant="tileTitle">Formation</Text>
          <Text variant="caption" color="tertiary">
            tap to change
          </Text>
        </View>
        {(['A', 'B'] as const).map((side, i) => (
          <View key={side} style={{ gap: 8 }}>
            {i ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`${kits[side].name} formation`} onPress={() => setShape(side)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Crest kit={kits[side]} size={32} />
              <View style={{ flex: 1 }}>
                <Text variant="tileTitle" style={{ fontWeight: '700' }}>
                  {kits[side].name}
                </Text>
                <Text variant="caption" color="tertiary">
                  {d.g.data.sideSize ? `${d.g.data.sideSize}-a-side` : 'Any size'}
                </Text>
              </View>
              <Display size={20} color={kits[side].text}>
                {formationOf(d.g.data, side) ?? '—'}
              </Display>
              <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
            </Pressable>
          </View>
        ))}
      </View>

      <Button title={changed ? `Save teams · ${changed} change${changed === 1 ? '' : 's'}` : 'Save teams'} icon="check" block disabled={!changed} onPress={save} />
      <Text variant="caption" color="tertiary">
        Captains are picked in Log stats. Shown here at once and sent to Turf web; they wait on this phone while you’re offline.
      </Text>

      <Sheet
        visible={!!shape}
        onClose={() => setShape(null)}
        title="Formation"
        footer={shape ? <Button title={`Done · ${kits[shape].name} ${formationOf(d.g.data, shape) ?? ''}`.trim()} icon="check" block onPress={() => setShape(null)} /> : undefined}
      >
        {/* 4e Formation (TF-Formations): the side, its shape as mini pitches, the pitch with everyone slotted in. A tap sets the shape and sends it. */}
        {shape
          ? (() => {
              const size = d.g.data.sideSize ?? null;
              const NAMES: Record<string, [string, string]> = {
                '2-3-1': ['Classic', 'Most common · width from the three'],
                '3-2-1': ['Christmas tree', 'Back three · narrow and solid'],
                '2-1-2-1': ['Diamond', 'A holder and a ten · two wide'],
                '3-1-2': ['Front-foot', 'Two up top · one pivot'],
                '2-2-2': ['Pairs', 'Simple · easy to hold'],
                '1-3-2': ['Press', 'All-out · one at the back'],
              };
              const words = (n: number) => ['', 'one', 'two', 'three', 'four', 'five'][n] ?? String(n);
              const describe = (f: string) => {
                const r = formationRows(f);
                return [`${words(r[0]!)} at the back`, r.length > 2 ? `${words(r.slice(1, -1).reduce((x, y) => x + y, 0))} in midfield` : null, `${words(r[r.length - 1]!)} up top`].filter(Boolean).join(' · ');
              };
              const groups = size && FORMATIONS[size] ? [[size, FORMATIONS[size]!] as const] : (Object.entries(FORMATIONS).map(([n, fs]) => [Number(n), fs] as const));
              const tile = (f: string) => {
                const on = formationOf(d.g.data, shape) === f;
                const r = formationRows(f);
                const line = on ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.14)';
                const dot = on ? kits[shape].hex : 'rgba(245,245,247,0.62)';
                const y = (i: number) => (r.length === 1 ? 32 : 48.8 - (i * 34) / (r.length - 1));
                return (
                  <Pressable
                    key={f}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${f}${NAMES[f] ? `, ${NAMES[f]![0]}` : ''}`}
                    onPress={() => {
                      try {
                        if (setFormation(os, d.g.id, shape, f)) void pull(true);
                      } catch (e) {
                        toast.show({ message: (e as Error).message, icon: 'info' });
                      }
                    }}
                    style={{ width: 98, gap: 6 }}
                  >
                    <View style={{ borderRadius: 12, borderWidth: 2, borderColor: on ? kits[shape].hex : 'transparent', margin: -2 }}>
                      <Svg width={98} height={74} viewBox="0 0 98 74">
                        <Rect x={0} y={0} width={98} height={74} rx={10} fill={on ? '#23563A' : t.c.bg.tileRaised} />
                        <Rect x={6} y={-8} width={86} height={76} rx={3} fill="none" stroke={line} strokeWidth={1} />
                        <Rect x={27} y={54} width={44} height={14} fill="none" stroke={line} strokeWidth={1} />
                        <Path d="M6 5.92 A43.0 5.92 0 0 0 92 5.92" fill="none" stroke={line} strokeWidth={1} />
                        <Circle cx={49} cy={65.1} r={3.5} fill={dot} />
                        {r.map((n, i) => Array.from({ length: n }, (_, k) => <Circle key={`${i}-${k}`} cx={49 + (k - (n - 1) / 2) * (n === 2 ? 39.2 : 82 / n)} cy={y(i)} r={3.5} fill={dot} />))}
                      </Svg>
                    </View>
                    <View>
                      <Display size={18} color={on ? kits[shape].text : undefined} style={{ lineHeight: 18 }}>
                        {f}
                      </Display>
                      {NAMES[f] ? (
                        <Text variant="labelMicro" color="secondary" style={{ fontSize: 11, lineHeight: 14, fontWeight: '700' }}>
                          {NAMES[f]![0]}
                        </Text>
                      ) : null}
                      <Text variant="caption" color="tertiary" style={{ fontSize: 10, lineHeight: 13 }}>
                        {NAMES[f]?.[1] ?? describe(f)}
                      </Text>
                    </View>
                  </Pressable>
                );
              };
              return (
                <>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {(['A', 'B'] as const).map((side) => (
                      <Pressable key={side} accessibilityRole="tab" accessibilityState={{ selected: shape === side }} onPress={() => setShape(side)} style={{ flex: 1, height: 40, borderRadius: 999, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: shape === side ? t.c.accent.mustard : t.c.bg.tileRaised }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: kits[side].hex, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' }} />
                        <Text variant="label" color={shape === side ? t.c.accent.mustardInk : 'secondary'} style={{ fontSize: 13, lineHeight: 17, fontWeight: '700' }}>
                          {`${kits[side].name} · ${formationOf(d.g.data, side) ?? '—'}`}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={{ gap: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                      <Text variant="tileTitle" style={{ lineHeight: 20 }}>{`Shape for ${kits[shape].name}`}</Text>
                      <Text variant="caption" color="tertiary" numberOfLines={1} style={{ marginLeft: 'auto', flexShrink: 1 }}>
                        {[size ? `${size}-a-side` : 'Any size', d.g.data.venueName].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    {groups.map(([n, fs]) => (
                      <View key={n} style={{ gap: 10 }}>
                        {groups.length > 1 ? <Mono>{`${n}s · ${n - 1} outfield`}</Mono> : null}
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 14 }}>{fs.map(tile)}</View>
                      </View>
                    ))}
                  </View>
                  <View style={{ gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text variant="tileTitle">On the pitch</Text>
                        <Text variant="caption" color="secondary" style={{ fontWeight: '500' }}>
                          {[format(new Date(`${d.g.data.date}T12:00:00`), 'EEE d MMM'), d.g.data.scoreA != null && d.g.data.scoreB != null ? `${d.g.data.scoreA} – ${d.g.data.scoreB}` : null].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      {(['A', 'B'] as const).map((side) => (
                        <View key={side} style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: side === shape ? t.c.accent.mustardSoft : t.c.bg.dim }}>
                          <Text variant="labelMicro" color={side === shape ? t.c.accent.mustard : 'secondary'}>{`${kits[side].name} ${formationOf(d.g.data, side) ?? '—'}`}</Text>
                        </View>
                      ))}
                    </View>
                    <Pitch game={d.g.data} players={d.players.map((p) => ({ ...p, team: teams[p.id] ?? null }))} />
                    <Text variant="caption" color="tertiary">
                      Outfield rows from the back; the keeper isn’t counted. Players slot in by their preferred position.
                    </Text>
                  </View>
                </>
              );
            })()
          : null}
      </Sheet>
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
