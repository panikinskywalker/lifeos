import React, { useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, Text as RNText, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Rect, Line, Text as SvgText } from 'react-native-svg';
import type { LifeOSContext } from '@core/registry/context';
import { allAppearances, allGames, currentSeason, kitsOf, matchTexts, rupees, startedSeasons, turfBase, type AppearanceData, type GameData, type Kit } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { displayFont, fonts, monoFonts } from '@ui/theme/tokens';
import { ChipRow, FilterChip, Icon, Screen, Segmented } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Crest, Face, GoalBall, SyncPill } from './teams';
import { useCopyShare } from './switcher';
import { FlipCard } from './motion';
import { NotConnected, type Props, useBack } from './common';
import { SearchBox } from './search';
import { BellButton } from './bell-button';

/**
 * Games, 1:1 with Turf web's (app/ui/games.tsx, app/ui/wallet.tsx): the Match
 * centre (the season so far, what's booked as the wallet, activity, the month,
 * when you play) and the Match history (seasons, search, Today · Upcoming ·
 * Past, paid filters, every match as a card).
 */

/* ---------- Turf web's tokens and type (app/ui/theme.ts) ---------- */

const C = {
  card: '#1A1A1E',
  raised: '#26262B',
  ink: '#F5F5F7',
  ink62: 'rgba(245,245,247,0.62)',
  ink42: 'rgba(245,245,247,0.42)',
  ink22: 'rgba(245,245,247,0.22)',
  line: 'rgba(255,255,255,0.08)',
  pill: 'rgba(255,255,255,0.07)',
  lime: '#D7F55C',
  limeSoft: 'rgba(215,245,92,0.16)',
  dark: '#0B0B0D',
  dark62: 'rgba(11,11,13,0.62)',
};
const T = {
  caption: { fontFamily: fonts[400], fontSize: 13, lineHeight: 17, color: C.ink62 },
  faint: { fontFamily: fonts[400], fontSize: 13, lineHeight: 17, color: C.ink42 },
  label: { fontFamily: fonts[600], fontSize: 11, lineHeight: 14, color: C.ink42, letterSpacing: 0.9, textTransform: 'uppercase' },
  rowTitle: { fontFamily: fonts[600], fontSize: 16, lineHeight: 21, color: C.ink },
  rowSub: { fontFamily: fonts[400], fontSize: 13, lineHeight: 17, color: C.ink62 },
  cardTitle: { fontFamily: fonts[600], fontSize: 15, lineHeight: 19, color: C.ink },
  cardSub: { fontFamily: fonts[500], fontSize: 13, lineHeight: 17, color: C.ink62 },
  section: { fontFamily: fonts[600], fontSize: 17, lineHeight: 22, color: C.ink, letterSpacing: -0.2 },
} satisfies Record<string, TextStyle>;
const display = (size: number, color: string = C.ink, lh = Math.round(size * 0.9)): TextStyle => ({ fontFamily: displayFont, fontSize: size, lineHeight: lh, letterSpacing: Math.round(size * 0.02 * 10) / 10, color, textTransform: 'uppercase' });
const mono = (color: string = C.ink62, weight: 500 | 700 = 700, size = 10): TextStyle => ({ fontFamily: monoFonts[weight], fontSize: size, lineHeight: size + 3, textTransform: 'uppercase', letterSpacing: size * 0.06, color });
const Txt = ({ style, lines, children }: { style: TextStyle | TextStyle[]; lines?: number; children: React.ReactNode }) => (
  <RNText style={style} numberOfLines={lines}>
    {children}
  </RNText>
);

/* ---------- Turf web's dates and words (app/ui/format.ts, match.ts) ---------- */

const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const at = (date: string) => new Date(`${date}T12:00:00Z`);
const todayIST = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
const addDays = (date: string, n: number) => new Date(at(date).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const weekdayIndex = (date: string) => at(date).getUTCDay();
const monthName = (date: string) => MO[at(date).getUTCMonth()]!;
const shortDay = (date: string) => `${WD[at(date).getUTCDay()]} ${at(date).getUTCDate()} ${monthName(date)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const rupeesOf = (amount: number) => rupees(Math.round(amount * 100));
const daysBetween = (a: string, b: string) => Math.round((at(b).getTime() - at(a).getTime()) / 86_400_000);
function relativeDay(date: string, today = todayIST()): string {
  const n = daysBetween(today, date);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}
function clock12(time: string | null | undefined, short = false): string {
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return '–';
  const [h = 0, m = 0] = time.split(':').map(Number);
  const half = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return short && m === 0 ? `${h12} ${half}` : `${h12}:${String(m).padStart(2, '0')} ${half}`;
}
function kickOff(time: string | null | undefined): { clock: string; half: string } {
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return { clock: '–', half: '' };
  const [h = 0, m = 0] = time.split(':').map(Number);
  return { clock: `${String(h % 12 === 0 ? 12 : h % 12).padStart(2, '0')}:${String(m).padStart(2, '0')}`, half: h >= 12 ? 'PM' : 'AM' };
}
/** "Wings - Bishop cotton" → ["Wings", "Bishop cotton"]; a plain name stays whole. */
function splitVenue(venue: string): [string, string | null] {
  const m = venue.match(/^(.*?)\s+[-–·]\s+(.*)$/);
  return m ? [m[1]!, m[2]!] : [venue, null];
}
const termsLabel = (terms: string) => (terms === 'prepaid' ? 'Prepaid' : terms === 'advance_paid' ? 'Advance paid' : terms === 'tentative' ? 'Tentative' : 'Postpaid');
const pad2 = (n: number) => String(n).padStart(2, '0');
function mode(values: number[]): number | null {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
}

/* ---------- a match, as Turf web's Game ---------- */

interface Match {
  id: string;
  g: GameData;
  number: number;
  k: { A: Kit; B: Kit };
  people: Array<{ id: string; name: string }>;
  paid: number;
  total: number;
  each: number | null;
  scorersA: string[];
  scorersB: string[];
  motm: { id: string; name: string } | null;
  collected: number;
  maybe: number;
}

/** Upcoming until 90 minutes after kick-off on the day (8 pm when no time is set), as Turf web's isUpcoming. */
function isUpcoming(g: GameData, now = Date.now()) {
  const today = todayIST();
  if (g.date > today) return true;
  if (g.date < today) return false;
  const ko = Date.parse(`${g.date}T${g.time && /^\d{2}:\d{2}/.test(g.time) ? g.time.slice(0, 5) : '20:00'}:00+05:30`);
  return g.scoreA == null || now < ko + 90 * 60_000;
}
const isTentative = (g: GameData) => g.paymentTerms === 'tentative';
const winnerOf = (g: GameData): 'A' | 'B' | 'draw' | null => (g.scoreA == null || g.scoreB == null ? null : g.scoreA === g.scoreB ? 'draw' : g.scoreA > g.scoreB ? 'A' : 'B');
function stateLine(m: Match): string {
  if (isUpcoming(m.g)) return `${isTentative(m.g) ? 'Tentative' : 'Kick-off'} · ${relativeDay(m.g.date)}`;
  const w = winnerOf(m.g);
  return w === 'draw' ? 'Draw · Full time' : w === 'A' ? `${m.k.A.name} won · Full time` : w === 'B' ? `${m.k.B.name} won · Full time` : 'Played · no score';
}
const payState = (m: Match): 'paid' | 'partial' | 'unpaid' => (m.paid >= m.total ? 'paid' : m.paid === 0 || m.paid === (m.g.frontedById ? 1 : 0) ? 'unpaid' : 'partial');
/** The colour a played match takes: the winner's kit, white for a draw, faint with no score. */
const colourOf = (m: Match) => {
  const w = winnerOf(m.g);
  return w === 'A' ? m.k.A.hex : w === 'B' ? m.k.B.hex : w === 'draw' ? C.ink : C.ink22;
};
const isPaid = (a: AppearanceData, g: GameData) => a.paid || a.personId === g.frontedById || (a.amountPaid ?? 0) >= a.share;

/** Every match, newest first, with what the cards and cards' backs show. */
function matchesOf(os: LifeOSContext): Match[] {
  const games = allGames(os);
  const byGame = new Map<string, AppearanceData[]>();
  for (const a of allAppearances(os)) byGame.set(a.data.gameId, [...(byGame.get(a.data.gameId) ?? []), a.data]);
  const names = new Map<string, string>();
  const nameOf = (id: string) => {
    if (!names.has(id)) names.set(id, os.records.get(id)?.title ?? 'Player');
    return names.get(id)!;
  };
  const numbers = new Map([...games].sort((a, b) => (a.data.date + (a.data.time ?? '')).localeCompare(b.data.date + (b.data.time ?? ''))).map((g, i) => [g.id, i + 1]));
  return games.map((rec) => {
    const g = rec.data;
    const apps = byGame.get(rec.id) ?? [];
    const shares = apps.map((a) => Math.round(a.share * 100));
    const scorers = (team: 'A' | 'B') => {
      const out = apps.filter((a) => a.team === team && a.goals > 0).map((a) => (a.goals > 1 ? `${nameOf(a.personId)} ×${a.goals}` : nameOf(a.personId)));
      const og = apps.filter((a) => a.team && a.team !== team).reduce((s, a) => s + (a.ownGoals ?? 0), 0);
      if (og) out.push(og > 1 ? `Own goal ×${og}` : 'Own goal');
      return out;
    };
    return {
      id: rec.id,
      g,
      number: numbers.get(rec.id) ?? 0,
      k: kitsOf(g),
      people: apps.map((a) => ({ id: a.personId, name: nameOf(a.personId) })),
      paid: apps.filter((a) => isPaid(a, g)).length,
      total: apps.length,
      each: shares.length && shares.every((s) => s === shares[0]) ? shares[0]! : null,
      scorersA: scorers('A'),
      scorersB: scorers('B'),
      motm: g.motmId ? { id: g.motmId, name: nameOf(g.motmId) } : null,
      collected: apps.reduce((s, a) => s + (a.personId === g.frontedById ? Math.round(a.share * 100) : Math.min(Math.round(a.share * 100), Math.max(0, Math.round((a.amountPaid ?? 0) * 100)))), 0),
      maybe: Object.values(g.rsvps ?? {}).filter((s) => s === 'maybe').length,
    };
  });
}

function seasonStats(matches: Match[]) {
  const played = matches.filter((m) => !isUpcoming(m.g));
  const goals = played.reduce((s, m) => s + (m.g.scoreA ?? 0) + (m.g.scoreB ?? 0), 0);
  const ordered = [...played].sort((a, b) => a.g.date.localeCompare(b.g.date));
  // Weeks running: consecutive weeks with a game, counting back from the latest.
  const weekKey = (date: string) => addDays(date, -((weekdayIndex(date) + 6) % 7));
  const weeks = new Set(ordered.map((m) => weekKey(m.g.date)));
  let streak = 0;
  if (ordered.length) for (let d = ordered[ordered.length - 1]!.g.date; weeks.has(weekKey(d)); d = addDays(d, -7)) streak += 1;
  return {
    played: played.length,
    total: matches.length,
    goals,
    streak,
    venues: new Set(matches.map((m) => m.g.venueId || m.g.venueName)).size,
    players: new Set(matches.flatMap((m) => m.people.map((p) => p.id))).size,
    collected: matches.reduce((s, m) => s + m.collected, 0),
    first: ordered[0]?.g.date ?? null,
    last: ordered[ordered.length - 1]?.g.date ?? null,
    usualDay: mode(ordered.map((m) => weekdayIndex(m.g.date))),
  };
}
const inSeason = (m: Match, s: { startsOn: string; endsOn: string | null } | null) => !s || (m.g.date >= s.startsOn && (!s.endsOn || m.g.date <= s.endsOn));

/* ---------- Turf web's parts ---------- */

function Card({ children, padding = 14, radius = 24, gap = 10, onPress }: { children: React.ReactNode; padding?: number; radius?: number; gap?: number; onPress?: () => void }) {
  const style = { padding, gap, borderRadius: radius, backgroundColor: C.card };
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.92 : 1 }]}>
      {children}
    </Pressable>
  ) : (
    <View style={style}>{children}</View>
  );
}
function CardHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Txt style={T.cardTitle} lines={1}>{title}</Txt>
        {sub ? <Txt style={T.cardSub} lines={1}>{sub}</Txt> : null}
      </View>
      {right ? <View style={{ marginLeft: 'auto', flexShrink: 0 }}>{right}</View> : null}
    </View>
  );
}
function Pill({ children, tone, icon }: { children: React.ReactNode; tone?: 'lime'; icon?: string }) {
  const fg = tone === 'lime' ? C.lime : C.ink62;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: tone === 'lime' ? C.limeSoft : C.pill, alignSelf: 'flex-start' }}>
      {icon ? <Icon name={icon} size={13} color={fg} /> : null}
      <Txt style={{ fontFamily: fonts[600], fontSize: 12, lineHeight: 16, color: fg }} lines={1}>{children}</Txt>
    </View>
  );
}
function SectionHead({ title, right }: { title: string; right?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 6, paddingHorizontal: 4 }}>
      <Txt style={T.section}>{title}</Txt>
      {right ? <Txt style={{ fontFamily: fonts[600], fontSize: 13, lineHeight: 17, color: C.ink62 }}>{right}</Txt> : null}
    </View>
  );
}
function LimeTabs<V extends string>({ options, value, onChange }: { options: Array<{ value: V; label: string }>; value: V; onChange: (v: V) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 6 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)} style={{ flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.lime : C.card }}>
            <Txt style={{ fontFamily: fonts[700], fontSize: 13, lineHeight: 17, color: on ? C.dark : C.ink62 }}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
function Chips<V extends string>({ options, value, onChange }: { options: Array<{ value: V; label: string }>; value: V; onChange: (v: V) => void }) {
  return (
    <ChipRow>
      {options.map((o) => (
        <FilterChip key={o.value} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </ChipRow>
  );
}
const Dot = ({ color, size = 10, ring, hollow }: { color?: string; size?: number; ring?: boolean; hollow?: string }) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hollow ? 'transparent' : color, borderWidth: hollow ? (size >= 10 ? 2 : 1.5) : ring ? 1.5 : 0, borderColor: hollow ?? 'rgba(255,255,255,0.25)' }} />
);
function Faces({ people, size = 26, max = 5, ring = C.card, moreColor = C.ink62 }: { people: Array<{ id: string; name: string }>; size?: number; max?: number; ring?: string; moreColor?: string }) {
  const shown = people.slice(0, max);
  const more = people.length - shown.length;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {shown.map((p, i) => (
        <View key={p.id} style={{ marginLeft: i ? -8 : 0, borderRadius: (size + 4) / 2, borderWidth: 2, borderColor: ring }}>
          <Face id={p.id} name={p.name} size={size} />
        </View>
      ))}
      {more > 0 ? <Txt style={{ marginLeft: 6, fontFamily: fonts[600], fontSize: 12, lineHeight: 16, color: moreColor }}>{`+${more}`}</Txt> : null}
    </View>
  );
}

/* ---------- the wallet (Turf web's app/ui/wallet.tsx) ---------- */

const FRONT_H = 190;
const BACK_H = 310;
const PEEK = 52;
type Palette = { bg: string; fg: string; soft: string; chip: string; chipFg: string; chipLime: string; strip: string; ring: string; button: string; buttonFg: string };

function palette(m: Match, highlight: boolean): Palette {
  const w = winnerOf(m.g);
  // The next match is lime (the design's matchday colour, whoever plays); a played one wears the winner's kit.
  const next = isUpcoming(m.g) && highlight;
  const kit = next ? { hex: C.lime, ink: 'dark' as const } : w === 'A' ? m.k.A : w === 'B' ? m.k.B : null;
  if (kit) {
    const dark = kit.ink === 'dark';
    return { bg: kit.hex, fg: dark ? C.dark : C.ink, soft: dark ? C.dark62 : 'rgba(245,245,247,0.72)', chip: dark ? C.dark : 'rgba(255,255,255,0.16)', chipFg: C.ink, chipLime: dark ? C.ink : C.lime, strip: dark ? 'rgba(11,11,13,0.85)' : 'rgba(0,0,0,0.45)', ring: dark ? 'rgba(11,11,13,0.14)' : 'rgba(255,255,255,0.16)', button: dark ? C.dark : C.ink, buttonFg: dark ? C.ink : C.dark };
  }
  return { bg: C.raised, fg: C.ink, soft: C.ink62, chip: C.pill, chipFg: C.ink62, chipLime: C.lime, strip: 'rgba(255,255,255,0.08)', ring: C.pill, button: C.lime, buttonFg: C.dark };
}

function Front({ m, p, onOpen }: { m: Match; p: Palette; onOpen: () => void }) {
  const g = m.g;
  const upcoming = isUpcoming(g);
  const unpaid = m.total - m.paid;
  const tail = upcoming ? (isTentative(g) ? 'Dues paused' : termsLabel(g.paymentTerms)) : unpaid ? `${unpaid} to collect` : 'Settled';
  const money = [rupeesOf(g.totalCost), m.each !== null ? `${rupees(m.each)} each` : null, g.sideSize ? `${g.sideSize}-a-side` : null, tail].filter(Boolean).join(' · ');
  const ko = kickOff(g.time);
  const [venueName, area] = splitVenue(g.venueName);
  const allPaid = !upcoming && unpaid === 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open match ${pad2(m.number)}`} onPress={onOpen} style={{ flex: 1 }}>
      <View style={{ height: 26, flexDirection: 'row' }}>
        <View style={{ width: 124, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: p.bg, justifyContent: 'center', paddingHorizontal: 16 }}>
          <Txt style={mono(p.fg)}>{`Match ${pad2(m.number)}`}</Txt>
        </View>
        <View style={{ flex: 1, marginTop: 14, borderTopRightRadius: 14, backgroundColor: p.bg }} />
      </View>
      <View style={{ flex: 1, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: p.bg, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 18 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt style={mono(p.soft)} lines={1}>{stateLine(m)}</Txt>
          </View>
          <Txt style={mono(p.fg)}>{shortDay(g.date)}</Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, height: 40 }}>
          <View style={{ width: 96 }}>
            {upcoming ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Txt style={display(36, p.fg, 34)}>{ko.clock}</Txt>
                <Txt style={display(14, p.soft)}>{ko.half}</Txt>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                <Txt style={display(36, p.fg, 34)}>{g.scoreA ?? '–'}</Txt>
                <Txt style={display(20, p.soft)}>–</Txt>
                <Txt style={display(36, p.fg, 34)}>{g.scoreB ?? '–'}</Txt>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Crest kit={m.k.A} size={32} />
            <Txt style={display(12, p.soft)}>VS</Txt>
            <Crest kit={m.k.B} size={32} />
          </View>
          <View style={{ width: 96, alignItems: 'flex-end', minWidth: 0 }}>
            <Txt style={display(15, p.fg)} lines={1}>{venueName}</Txt>
            {area ? <Txt style={mono(p.soft, 500, 9)} lines={1}>{area}</Txt> : null}
          </View>
        </View>
        <View style={{ height: 16, justifyContent: 'center' }}>
          <Txt style={mono(p.soft, 500)} lines={1}>{money}</Txt>
        </View>
        <View style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {m.people.length ? <Faces people={m.people} size={24} max={4} ring={C.card} moreColor={p.soft} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: upcoming && !m.people.length ? C.pill : p.chip }}>
            <Txt style={{ fontFamily: fonts[600], fontSize: 12, lineHeight: 16, color: allPaid ? p.chipLime : upcoming && !m.people.length ? C.ink62 : p.chipFg }}>
              {upcoming ? (m.people.length ? `${m.people.length} in · ${g.expectedPlayers ?? m.people.length}` : 'No replies yet') : `${m.paid} of ${m.total} paid`}
            </Txt>
          </View>
          <View style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 16, backgroundColor: p.ring, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron-right" size={16} color={p.fg} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function Back({ m, p, onClose }: { m: Match; p: Palette; onClose: () => void }) {
  const os = useOS();
  const router = useRouter();
  const { share } = useCopyShare();
  const g = m.g;
  const upcoming = isUpcoming(g);
  const [venueName, area] = splitVenue(g.venueName);
  const ko = kickOff(g.time);
  const base = turfBase(os);
  const link = base && g.shareSlug ? `${base}/match/${g.shareSlug}` : '';
  const send = () => {
    const texts = matchTexts(os, m.id, link);
    const text = upcoming ? texts?.rsvp ?? texts?.details : texts?.result;
    if (text) share(text);
  };
  const open = () => router.push(`/board/turf/game?game=${m.id}` as never);
  const wanted = g.expectedPlayers ?? m.people.length;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open match ${pad2(m.number)}`} onPress={open} style={{ flex: 1, borderRadius: 24, backgroundColor: p.bg, gap: 10, paddingBottom: 14, overflow: 'hidden' }}>
      <View style={{ marginTop: 14, height: 34, backgroundColor: p.strip, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt style={mono(C.ink)} lines={1}>{`Match ${pad2(m.number)} · ${shortDay(g.date)} · ${venueName}`}</Txt>
        </View>
        {!upcoming ? <Txt style={mono('rgba(255,255,255,0.7)')}>FT</Txt> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Flip back" onPress={onClose} hitSlop={6} style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="x" size={14} color={C.ink} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: upcoming ? 16 : 14 }}>
        <Crest kit={m.k.A} size={40} />
        {upcoming ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
            <Txt style={display(72, p.fg, 64)}>{ko.clock}</Txt>
            <Txt style={display(22, p.soft)}>{ko.half}</Txt>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Txt style={display(72, p.fg, 64)}>{g.scoreA ?? '–'}</Txt>
            <Txt style={display(36, p.soft)}>–</Txt>
            <Txt style={display(72, p.fg, 64)}>{g.scoreB ?? '–'}</Txt>
          </View>
        )}
        <Crest kit={m.k.B} size={40} />
      </View>
      <Txt style={[display(13, p.soft), { textAlign: 'center' }]}>{`${stateLine(m)} · ${upcoming ? (g.sideSize ? `${g.sideSize}-a-side` : `${wanted} wanted`) : `${m.paid} of ${m.total} paid`}`}</Txt>
      {upcoming ? (
        // A booked match: how full it is (count, bar, faces), then the ground and the money on one line.
        <View style={{ gap: 9, paddingTop: 2, paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
              <Txt style={display(28, p.fg, 26)}>{m.people.length}</Txt>
              <Txt style={display(15, p.soft)}>{`/ ${wanted} in`}</Txt>
            </View>
            <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: p.ring, overflow: 'hidden' }}>
              <View style={{ width: `${Math.min(100, (m.people.length / Math.max(1, wanted)) * 100)}%`, height: '100%', borderRadius: 3, backgroundColor: p.fg }} />
            </View>
            <Txt style={mono(p.soft, 700, 10)}>{m.people.length >= wanted ? 'Full' : `${wanted - m.people.length} to go`}</Txt>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 }}>
            {m.people.length ? <Faces people={m.people} size={26} max={8} ring={p.bg} moreColor={p.soft} /> : <Txt style={{ fontFamily: fonts[400], fontSize: 13, lineHeight: 17, color: p.soft }}>No replies yet: send the RSVP link</Txt>}
            {m.maybe ? <Txt style={{ marginLeft: 'auto', fontFamily: fonts[600], fontSize: 12, lineHeight: 16, color: p.soft }}>{`${m.maybe} maybe`}</Txt> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <Icon name="location" size={14} color={p.soft} />
            <Txt style={{ flexShrink: 1, fontFamily: fonts[400], fontSize: 13, lineHeight: 17, color: p.soft }} lines={1}>
              <RNText style={{ color: p.fg, fontFamily: fonts[700] }}>{venueName}</RNText>
              {[area, m.each !== null ? `${rupees(m.each)} each` : rupeesOf(g.totalCost), isTentative(g) ? 'dues paused' : termsLabel(g.paymentTerms).toLowerCase()].filter(Boolean).map((x) => ` · ${x}`).join('')}
            </Txt>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, overflow: 'hidden' }}>
          {(['A', 'B'] as const).map((side) => (
            <View key={side} style={{ flex: 1, minWidth: 0, alignItems: side === 'A' ? 'flex-start' : 'flex-end' }}>
              <Txt style={mono(p.soft, 500, 9)}>{m.k[side].name}</Txt>
              {(side === 'A' ? m.scorersA : m.scorersB).slice(0, 4).map((s) => (
                <View key={s} style={{ flexDirection: side === 'A' ? 'row' : 'row-reverse', alignItems: 'center', gap: 6 }}>
                  <GoalBall n={1} size={12} id={`${m.id}-${side}-${s}`} />
                  <Txt style={{ fontFamily: fonts[600], fontSize: 12, lineHeight: 17, color: p.soft }} lines={1}>{s}</Txt>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
      <View style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}>
        {upcoming ? (
          <Pressable accessibilityRole="link" onPress={open} style={{ flex: 1, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: p.button, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Txt style={{ fontFamily: fonts[700], fontSize: 15, lineHeight: 20, color: p.buttonFg }}>Open match</Txt>
            <Icon name="chevron-right" size={16} color={p.buttonFg} />
          </Pressable>
        ) : (
          <>
            {m.motm ? <Face id={m.motm.id} name={m.motm.name} size={28} /> : null}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt style={{ fontFamily: fonts[700], fontSize: 12, lineHeight: 16, color: p.fg }} lines={1}>{m.motm ? `POTM · ${m.motm.name}` : 'No player of the match'}</Txt>
              <Txt style={{ fontFamily: fonts[600], fontSize: 11, lineHeight: 14, color: p.soft }} lines={1}>{`${rupeesOf(g.totalCost)}${m.each !== null ? ` · ${rupees(m.each)} each` : ''}`}</Txt>
            </View>
          </>
        )}
        <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 6 }}>
          {upcoming ? (
            <>
              <Pressable accessibilityRole="button" onPress={send} style={{ height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: p.ring, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="link" size={16} color={p.fg} />
                <Txt style={{ fontFamily: fonts[700], fontSize: 14, lineHeight: 18, color: p.fg }}>RSVP link</Txt>
              </Pressable>
              {base && g.shareSlug ? (
                <Pressable accessibilityRole="link" accessibilityLabel="Add to calendar" onPress={() => void Linking.openURL(`${base}/api/public/match/${g.shareSlug}/calendar`)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: p.ring, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="calendar" size={17} color={p.fg} />
                </Pressable>
              ) : null}
            </>
          ) : (
            <>
              <Pressable accessibilityRole="link" onPress={open} style={{ height: 36, paddingHorizontal: 22, borderRadius: 999, backgroundColor: p.button, alignItems: 'center', justifyContent: 'center' }}>
                <Txt style={{ fontFamily: fonts[700], fontSize: 15, lineHeight: 20, color: p.buttonFg }}>Open</Txt>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={send} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: p.bg === C.raised ? C.raised : 'rgba(11,11,13,0.85)', borderWidth: p.bg === C.raised ? 1 : 0, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="send" size={16} color={C.ink} />
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** Oldest at the top, the latest open; tap one to flip it. Exported so Home can draw the same cards. */
export function MatchWallet({ matches, highlightNext = false }: { matches: Match[]; highlightNext?: boolean }) {
  const [open, setOpen] = useState<string | null>(matches.length ? matches[matches.length - 1]!.id : null);
  if (!matches.length) return null;
  // The open card sits where it is in the stack but grows to the back face; the open one is last so nothing hides it.
  const placed: Array<{ m: Match; top: number; flipped: boolean; z: number }> = [];
  matches.forEach((m, i) => {
    const flipped = m.id === open;
    const prev = placed[placed.length - 1];
    placed.push({ m, top: prev ? prev.top + (prev.flipped ? BACK_H + 12 : PEEK) : 0, flipped, z: flipped ? matches.length + 1 : i + 1 });
  });
  const height = Math.max(...placed.map((c) => c.top + (c.flipped ? BACK_H : FRONT_H)));
  return (
    <View style={{ height }}>
      {placed.map(({ m, top, flipped, z }, i) => {
        const p = palette(m, highlightNext && i === matches.length - 1);
        return (
          <FlipCard
            key={m.id}
            top={top}
            flipped={flipped}
            frontH={FRONT_H}
            backH={BACK_H}
            style={[{ zIndex: z, elevation: flipped ? 16 : 4 + z, shadowColor: '#000' }, flipped ? { shadowOpacity: 0.55, shadowRadius: 24, shadowOffset: { width: 0, height: 24 }, borderRadius: 24 } : { shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: -6 } }]}
            front={<Front m={m} p={p} onOpen={() => setOpen(m.id)} />}
            back={<Back m={m} p={p} onClose={() => setOpen(null)} />}
          />
        );
      })}
    </View>
  );
}

/* ---------- the screen ---------- */

type GamesView = 'centre' | 'history';

export function TurfGames(_props: Props) {
  const back = useBack();
  const { busy, pull } = usePull();
  const [view, setView] = useState<GamesView>('centre');
  const d = useLive((o) => ({ matches: matchesOf(o), seasons: startedSeasons(o) }), []);
  return (
    <Screen title="Turf" subtitle="Browse" onBack={back} right={<><SyncPill /><BellButton /></>} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}>
      <Segmented
        options={[
          { value: 'centre', label: 'Match centre' },
          { value: 'history', label: 'Match history' },
        ]}
        value={view}
        onChange={setView}
      />
      {!d.matches.length ? <NotConnected /> : view === 'history' ? <History matches={d.matches} seasons={d.seasons} /> : <Centre matches={d.matches} seasons={d.seasons} onSeason={() => setView('history')} />}
    </Screen>
  );
}

type Season = ReturnType<typeof startedSeasons>[number];

/* ---------- Match centre ---------- */

function Centre({ matches, seasons, onSeason }: { matches: Match[]; seasons: Season[]; onSeason: () => void }) {
  const router = useRouter();
  const season = currentSeason(seasons);
  const upcoming = matches.filter((m) => isUpcoming(m.g)).sort((a, b) => b.g.date.localeCompare(a.g.date) || (b.g.time ?? '').localeCompare(a.g.time ?? ''));
  return (
    <>
      <SeasonCard matches={season ? matches.filter((m) => inSeason(m, season)) : matches} name={season?.name} onPress={onSeason} />
      <SectionHead title="Upcoming" right={upcoming.length ? `${upcoming.length} booked` : undefined} />
      {upcoming.length ? (
        <MatchWallet key={upcoming.map((m) => m.id).join()} matches={upcoming} highlightNext />
      ) : (
        <Card padding={16} radius={28} gap={12}>
          <Txt style={display(28)}>Nothing booked</Txt>
          <Txt style={T.caption}>The next match goes here with its RSVP link and calendar invite.</Txt>
          <Pressable accessibilityRole="button" onPress={() => router.push('/board/turf/match' as never)} style={{ alignSelf: 'flex-start', height: 40, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.lime, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="plus" size={18} color={C.dark} />
            <Txt style={{ fontFamily: fonts[700], fontSize: 15, lineHeight: 20, color: C.dark }}>Book a match</Txt>
          </Pressable>
        </Card>
      )}
      <Activity matches={matches} />
      <MonthCard matches={matches} />
      <WhenYouPlay matches={matches} />
    </>
  );
}

function SeasonCard({ matches, name, onPress }: { matches: Match[]; name?: string; onPress: () => void }) {
  const s = seasonStats(matches);
  const span = s.first && s.last ? (monthName(s.first) === monthName(s.last) ? monthName(s.first) : `${monthName(s.first)} – ${monthName(s.last)}`) : 'no games yet';
  const dayName = DAY_NAMES[s.usualDay ?? 6];
  const numbers: Array<[string, string]> = [
    [String(s.played), 'Played'],
    [String(s.goals), 'Goals'],
    [s.played ? (s.goals / s.played).toFixed(1) : '–', 'Per match'],
  ];
  return (
    <Card padding={16} radius={28} gap={12} onPress={onPress}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Txt style={T.cardTitle}>{name || 'Season'}</Txt>
          <Txt style={T.cardSub} lines={1}>{`${span} · ${plural(s.total, 'match', 'matches')}`}</Txt>
        </View>
        {s.streak > 1 ? <Pill tone="lime" icon="flame">{`${s.streak} ${dayName}s running`}</Pill> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {numbers.map(([n, label], i) => (
          <React.Fragment key={label}>
            {i > 0 ? <View style={{ width: 1, height: 40, backgroundColor: C.line }} /> : null}
            <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
              <Txt style={display(48, i === 0 ? C.lime : C.ink, 44)}>{n}</Txt>
              <Txt style={T.label}>{label}</Txt>
            </View>
          </React.Fragment>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
        <Pill icon="location">{plural(s.venues, 'venue')}</Pill>
        <Pill icon="people">{plural(s.players, 'player')}</Pill>
        <Pill icon="rupee">{rupees(s.collected)}</Pill>
      </View>
    </Card>
  );
}

/** Lime at five strengths, faint to full: the matrix's scale. */
const HEAT = ['rgba(215,245,92,0.16)', 'rgba(215,245,92,0.34)', 'rgba(215,245,92,0.55)', 'rgba(215,245,92,0.78)', '#D7F55C'];
const EMPTY = 'rgba(255,255,255,0.05)';

/** The activity matrix: 13 weeks across, Monday to Sunday down. A day you played is lime, brighter the more goals went in;
 *  a booking has a lime ring; today is outlined. Tap a day to see its match. */
function Activity({ matches }: { matches: Match[] }) {
  const router = useRouter();
  const [w, setW] = useState(0);
  const today = todayIST();
  const monday = addDays(today, -((weekdayIndex(today) + 6) % 7));
  const start = addDays(monday, -12 * 7);
  const byDay = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) map.set(m.g.date, [...(map.get(m.g.date) ?? []), m]);
    return map;
  }, [matches]);
  const goalsOn = (day: Match[]) => day.reduce((n, m) => n + (m.g.scoreA ?? 0) + (m.g.scoreB ?? 0), 0);
  const inWindow = matches.filter((m) => m.g.date >= start && m.g.date <= today && !isUpcoming(m.g));
  const most = Math.max(1, ...[...new Set(inWindow.map((m) => m.g.date))].map((day) => goalsOn(byDay.get(day) ?? [])));
  const level = (day: Match[]) => {
    const n = goalsOn(day);
    return n === 0 ? 0 : Math.min(4, 1 + Math.floor((n / most) * 3.999));
  };
  const usual = seasonStats(matches).usualDay ?? 6;
  const usualDays = Array.from({ length: 13 }, (_, i) => addDays(start, i * 7 + ((usual + 6) % 7))).filter((day) => day <= today);
  const usualHit = usualDays.filter((day) => byDay.has(day)).length;
  const lastPlayed = [...inWindow].sort((a, b) => b.g.date.localeCompare(a.g.date))[0]?.g.date ?? null;
  const [picked, setPicked] = useState<string | null>(lastPlayed);
  const pickedGames = picked ? byDay.get(picked) ?? [] : [];
  // A month label over the first week that starts in that month.
  const monthAt = (i: number) => {
    const day = addDays(start, i * 7);
    return !i || monthName(addDays(start, (i - 1) * 7)) !== monthName(day) ? monthName(day) : '';
  };
  const cell = w ? (w - 14 - 13 * 4) / 13 : 0;
  const tiny = { fontFamily: fonts[600], fontSize: 10, lineHeight: 12 } as const;
  return (
    <Card padding={18} radius={28} gap={12}>
      <CardHead title="Activity" sub="last 13 weeks" right={<Pill tone="lime">{`${usualHit} of ${usualDays.length} ${DAY_NAMES[usual]}s`}</Pill>} />
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ gap: 4 }}>
        {cell > 0 ? (
          <>
            <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              <View style={{ width: 14 }} />
              {Array.from({ length: 13 }, (_, i) => (
                <View key={`m${i}`} style={{ width: cell, overflow: 'visible' }}>
                  <RNText numberOfLines={1} style={[tiny, { color: C.ink42, width: cell * 3 }]}>{monthAt(i)}</RNText>
                </View>
              ))}
            </View>
            {Array.from({ length: 7 }, (_, r) => (
              <View key={`r${r}`} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                <RNText style={[tiny, { width: 14, color: r === 5 ? C.lime : C.ink42 }]}>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][r]}</RNText>
                {Array.from({ length: 13 }, (_, c) => {
                  const date = addDays(start, c * 7 + r);
                  const day = byDay.get(date) ?? [];
                  const played = day.filter((m) => !isUpcoming(m.g));
                  const booked = day.some((m) => isUpcoming(m.g));
                  const on = picked === date;
                  const bg = played.length ? HEAT[level(played)] : date > today ? 'rgba(255,255,255,0.025)' : EMPTY;
                  const ring = booked ? { borderWidth: 2, borderColor: C.lime } : date === today ? { borderWidth: 1.5, borderColor: C.ink62 } : null;
                  return (
                    <Pressable key={date} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`${shortDay(date)}${played.length ? ` · ${played.map((m) => m.g.venueName).join(', ')}` : booked ? ' · booked' : ' · no game'}`} disabled={!day.length} onPress={() => setPicked(on ? null : date)} style={[{ width: cell, height: cell, borderRadius: 6, backgroundColor: bg }, ring]}>
                      {on ? <View pointerEvents="none" style={{ position: 'absolute', left: -2, top: -2, right: -2, bottom: -2, borderRadius: 8, borderWidth: 2, borderColor: C.ink }} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Txt style={T.faint}>Fewer goals</Txt>
        <View style={{ flexDirection: 'row', gap: 3 }}>
          {[EMPTY, ...HEAT].map((c, i) => (
            <View key={i} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: c }} />
          ))}
        </View>
        <Txt style={T.faint}>More</Txt>
        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 12, height: 12, borderRadius: 3, borderWidth: 2, borderColor: C.lime }} />
          <Txt style={T.faint}>booked</Txt>
        </View>
      </View>
      {pickedGames.length ? (
        <>
          <View style={{ height: 1, backgroundColor: C.line }} />
          {pickedGames.map((m) => {
            const scored = m.g.scoreA != null && m.g.scoreB != null;
            return (
              <Pressable key={m.id} accessibilityRole="link" onPress={() => router.push(`/board/turf/game?game=${m.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
                <View style={{ flexDirection: 'row' }}>
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: m.k.A.hex, borderWidth: 2, borderColor: C.card }} />
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: m.k.B.hex, marginLeft: -8, borderWidth: 2, borderColor: C.card }} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Txt style={T.rowTitle} lines={1}>{`${shortDay(m.g.date)} · ${m.g.venueName}`}</Txt>
                  <Txt style={T.rowSub} lines={1}>{`${isUpcoming(m.g) ? `booked · ${clock12(m.g.time)}` : scored ? `${m.k.A.name} ${m.g.scoreA}–${m.g.scoreB} ${m.k.B.name}` : 'no score logged'} · ${plural(m.people.length, 'player')}`}</Txt>
                </View>
                <Txt style={display(22, C.lime)}>{scored ? (m.g.scoreA ?? 0) + (m.g.scoreB ?? 0) : '–'}</Txt>
              </Pressable>
            );
          })}
        </>
      ) : null}
    </Card>
  );
}

/** The legend's "winner's kit" dot: the kits round the dial (Turf web's conic gradient). */
function KitsDot() {
  const colours = ['#D7F55C', '#A9C4FF', '#F4A8CE', '#F5F5F7', '#202421'];
  const r = 5;
  const slice = (i: number) => {
    const a0 = (i / colours.length) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / colours.length) * 2 * Math.PI - Math.PI / 2;
    return `M${r} ${r} L${r + r * Math.cos(a0)} ${r + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${r + r * Math.cos(a1)} ${r + r * Math.sin(a1)} Z`;
  };
  return (
    <View style={{ width: 10, height: 10, borderRadius: 5, overflow: 'hidden', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' }}>
      <Svg width={10} height={10} viewBox="0 0 10 10" style={{ position: 'absolute', left: -1.5, top: -1.5 }}>
        {colours.map((c, i) => (
          <Path key={c} d={slice(i)} fill={c} />
        ))}
      </Svg>
    </View>
  );
}

function Legend({ booked }: { booked: boolean }) {
  const item = (dot: React.ReactNode, label: string) => (
    <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {dot}
      <Txt style={T.faint}>{label}</Txt>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
      {item(<KitsDot />, 'winner’s kit')}
      {item(<Dot color={C.ink} ring />, 'draw')}
      {item(<Dot color={C.ink22} ring />, 'no score')}
      {booked ? item(<Dot hollow={C.lime} />, 'booked') : null}
    </View>
  );
}

function MonthCard({ matches }: { matches: Match[] }) {
  const router = useRouter();
  const today = todayIST();
  const [month, setMonth] = useState(today.slice(0, 7));
  const first = `${month}-01`;
  const y = Number(month.slice(0, 4));
  const mo = Number(month.slice(5, 7));
  const daysIn = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = (weekdayIndex(first) + 6) % 7;
  const byDay = new Map(matches.map((m) => [m.g.date, m]));
  const shift = (n: number) => setMonth(new Date(Date.UTC(y, mo - 1 + n, 1)).toISOString().slice(0, 7));
  const nav = (icon: string, label: string, n: number) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => shift(n)} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={14} color={C.ink} />
    </Pressable>
  );
  const cells: Array<string | null> = [...Array<null>(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  return (
    <Card padding={18} radius={28} gap={12}>
      <CardHead
        title={MONTHS_LONG[mo - 1]!}
        sub={String(y)}
        right={
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {nav('chevron-left', 'Previous month', -1)}
            {nav('chevron-right', 'Next month', 1)}
          </View>
        }
      />
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row' }}>
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <Txt key={i} style={[T.label, { flex: 1, textAlign: 'center' }]}>{d}</Txt>
          ))}
        </View>
        {Array.from({ length: cells.length / 7 }, (_, row) => (
          <View key={row} style={{ flexDirection: 'row' }}>
            {cells.slice(row * 7, row * 7 + 7).map((date, i) => {
              if (!date) return <View key={`b${row}-${i}`} style={{ flex: 1, height: 34 }} />;
              const m = byDay.get(date);
              const upcoming = m ? isUpcoming(m.g) : false;
              const r = m && !upcoming ? winnerOf(m.g) : null;
              const isToday = date === today;
              const circle = (
                <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: m && !upcoming ? colourOf(m) : 'transparent', borderWidth: upcoming ? 2 : isToday ? 1.5 : 0, borderColor: upcoming ? C.lime : C.ink42 }}>
                  <Txt style={{ fontFamily: fonts[r || upcoming || isToday ? 700 : 600], fontSize: 13, lineHeight: 17, color: r ? C.dark : isToday || upcoming ? C.ink : C.ink62 }}>{Number(date.slice(8))}</Txt>
                </View>
              );
              return m ? (
                <Pressable key={date} accessibilityRole="link" accessibilityLabel={`Match on ${shortDay(date)}`} onPress={() => router.push(`/board/turf/game?game=${m.id}` as never)} style={{ flex: 1, alignItems: 'center' }}>
                  {circle}
                </Pressable>
              ) : (
                <View key={date} style={{ flex: 1, alignItems: 'center' }}>
                  {circle}
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <Legend booked />
    </Card>
  );
}

/** When you play: matches by weekday, then the usual kick-off on a 6–11 pm ruler. */
function WhenYouPlay({ matches }: { matches: Match[] }) {
  const [w, setW] = useState(0);
  const played = matches.filter((m) => !isUpcoming(m.g));
  const perDay = [1, 2, 3, 4, 5, 6, 0].map((d) => played.filter((m) => weekdayIndex(m.g.date) === d).length);
  const max = Math.max(1, ...perDay);
  const minutes = played.map((m) => (/^\d{1,2}:\d{2}/.test(m.g.time ?? '') ? Number(m.g.time!.split(':')[0]) * 60 + Number(m.g.time!.split(':')[1]!.slice(0, 2)) : null)).filter((x): x is number => x !== null);
  const counts = new Map<number, number>();
  for (const x of minutes) counts.set(x, (counts.get(x) ?? 0) + 1);
  const usual = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
  const usualTime = usual === null ? null : `${String(Math.floor(usual / 60)).padStart(2, '0')}:${String(usual % 60).padStart(2, '0')}`;
  const venueTimes = [...new Map(played.map((m) => [m.g.venueId || m.g.venueName, m])).values()]
    .map((m) => {
      const byTime = new Map<string, number>();
      for (const x of played.filter((x) => (x.g.venueId || x.g.venueName) === (m.g.venueId || m.g.venueName) && x.g.time)) byTime.set(x.g.time!, (byTime.get(x.g.time!) ?? 0) + 1);
      const best = [...byTime.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      return best ? `${clock12(best, true)} at ${m.g.venueName.split(/\s+[-–·]\s+/)[0]}` : null;
    })
    .filter(Boolean)
    .slice(0, 3);
  // Weekday bars on 318 × 104, the busiest day lime and full height, others a grey pill, none a hairline.
  const W = 318;
  const col = 36.9;
  const stepX = (W - col) / 6;
  const base = 84;
  const full = 68;
  // The ruler: 6 pm to 11 pm, five ticks an hour; kick-offs outside it don't draw on it.
  const lo = 18;
  const hi = 23;
  const ticks = (hi - lo) * 5;
  const xAt = (x: number) => ((x - lo * 60) / ((hi - lo) * 60)) * W;
  const inside = minutes.filter((x) => x >= lo * 60 && x <= hi * 60);
  const firstK = inside.length ? Math.min(...inside) : null;
  const lastK = inside.length ? Math.max(...inside) : null;
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const hourLabel = (h: number, i: number) => {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return i === 0 || i === hours.length - 1 ? `${h12} pm` : String(h12);
  };
  return (
    <Card padding={18} radius={28} gap={12}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ gap: 10, minWidth: 0 }}>
        <CardHead title="When you play" sub="this season" />
        {w ? (
          <Svg width={w} height={(w * 104) / W} viewBox={`0 0 ${W} 104`} accessibilityLabel="Matches by weekday">
            {perDay.map((n, i) => {
              const x = i * stepX;
              const mid = x + col / 2;
              const top = n === max;
              const h = n ? (top ? full : Math.max(10, (n / max) * full)) : 4;
              return (
                <React.Fragment key={i}>
                  <Rect x={x} y={base - h} width={col} height={h} rx={n ? Math.min(10, h) : 2} fill={n ? (top ? C.lime : C.raised) : C.pill} />
                  {n > 0 ? (
                    <SvgText x={mid} y={base - h - 5} textAnchor="middle" fontSize={11} fontWeight="700" fill={top ? C.ink : C.ink62} fontFamily={monoFonts[700]}>
                      {String(n)}
                    </SvgText>
                  ) : null}
                  <SvgText x={mid} y={102} textAnchor="middle" fontSize={11} fontWeight="600" fill={top && n ? C.ink : C.ink42} fontFamily={fonts[600]}>
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'][i]}
                  </SvgText>
                </React.Fragment>
              );
            })}
          </Svg>
        ) : null}
        <View style={{ height: 1, backgroundColor: C.line }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Txt style={T.faint}>Usual kick-off</Txt>
          <Txt style={{ marginLeft: 'auto', fontFamily: fonts[700], fontSize: 14, lineHeight: 18, color: C.ink }}>{usualTime ? clock12(usualTime) : '–'}</Txt>
        </View>
        {w ? (
          <Svg width={w} height={(w * 34) / W} viewBox={`0 0 ${W} 34`} accessibilityLabel={usualTime ? `Usual kick-off ${clock12(usualTime)}` : 'Kick-off times'}>
            {Array.from({ length: ticks + 1 }, (_, i) => {
              const x = (i / ticks) * W;
              const hour = i % 5 === 0;
              const minute = lo * 60 + i * 12;
              const lit = firstK !== null && lastK !== null && minute >= firstK - 6 && minute <= lastK + 6;
              return <Line key={i} x1={x} x2={x} y1={hour ? 4 : 7} y2={hour ? 18 : 15} stroke={lit ? C.lime : C.ink} strokeWidth={lit ? 2 : 1.5} opacity={lit ? 1 : hour ? 0.6 : 0.28} strokeLinecap="round" />;
            })}
            {usual !== null && usual >= lo * 60 && usual <= hi * 60 ? <Path d={`M${xAt(usual) - 5} 28 L${xAt(usual) + 5} 28 L${xAt(usual)} 22 Z`} fill={C.lime} /> : null}
          </Svg>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 }}>
          {hours.map((h, i) => (
            <Txt key={h} style={{ fontFamily: fonts[600], fontSize: 11, lineHeight: 14, color: C.ink42 }}>{hourLabel(h, i)}</Txt>
          ))}
        </View>
        {venueTimes.length ? <Txt style={T.faint}>{venueTimes.join(' · ')}</Txt> : null}
      </View>
    </Card>
  );
}

/* ---------- Match history ---------- */

type When = 'today' | 'upcoming' | 'past';
type Pay = 'all' | 'paid' | 'partial' | 'unpaid';

function History({ matches, seasons }: { matches: Match[]; seasons: Season[] }) {
  // Seasons named on Turf web, the current one first; All time shows every match.
  const current = currentSeason(seasons);
  const [seasonId, setSeasonId] = useState<string>(current?.id ?? 'all');
  const season = seasons.find((s) => s.id === seasonId) ?? null;
  const games = useMemo(() => matches.filter((m) => inSeason(m, season)), [matches, season]);
  const [q, setQ] = useState('');
  const [when, setWhen] = useState<When>('past');
  const [pay, setPay] = useState<Pay>('all');
  const today = todayIST();
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return games
      .filter((m) => (when === 'today' ? m.g.date === today : when === 'upcoming' ? isUpcoming(m.g) && m.g.date !== today : !isUpcoming(m.g)))
      .filter((m) => pay === 'all' || isUpcoming(m.g) || payState(m) === pay)
      .filter((m) => !needle || m.g.venueName.toLowerCase().includes(needle) || m.people.some((p) => p.name.toLowerCase().includes(needle)))
      .sort((a, b) => (when === 'past' ? a.g.date.localeCompare(b.g.date) : b.g.date.localeCompare(a.g.date)));
  }, [games, q, when, pay, today]);
  const counts = { today: games.filter((m) => m.g.date === today).length, upcoming: games.filter((m) => isUpcoming(m.g) && m.g.date !== today).length, past: games.filter((m) => !isUpcoming(m.g)).length };
  return (
    <>
      {seasons.length ? <Chips<string> value={seasonId} onChange={setSeasonId} options={[...seasons.map((s) => ({ value: s.id, label: s.id === current?.id ? `${s.name} · now` : s.name })), { value: 'all', label: 'All time' }]} /> : null}
      <SearchBox value={q} onChange={setQ} placeholder="Venue or player" />
      <LimeTabs<When>
        value={when}
        onChange={setWhen}
        options={[
          { value: 'today', label: 'Today' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'past', label: 'Past' },
        ]}
      />
      {when === 'past' ? (
        <Chips<Pay>
          value={pay}
          onChange={setPay}
          options={[
            { value: 'all', label: 'All' },
            { value: 'paid', label: 'Paid' },
            { value: 'partial', label: 'Partial' },
            { value: 'unpaid', label: 'Unpaid' },
          ]}
        />
      ) : null}
      <Txt style={T.faint}>{`Tap a card to flip it · the winner’s kit colours the card · charcoal is a draw or no score${when !== 'past' ? ` · ${counts[when]} ${when}` : ''}`}</Txt>
      {shown.length ? (
        <MatchWallet key={`${when}-${pay}-${seasonId}-${shown.map((m) => m.id).join()}`} matches={shown} highlightNext={when !== 'past'} />
      ) : (
        <Card>
          <Txt style={T.caption}>{when === 'today' ? 'No match today.' : when === 'upcoming' ? 'Nothing booked yet.' : q ? 'Nothing matches that.' : 'No games here.'}</Txt>
        </Card>
      )}
      {when === 'past' && shown.length ? (
        <Txt style={[T.faint, { textAlign: 'center' }]}>{`${plural(shown.length, 'match', 'matches')}${season ? ` in ${season.name}` : ''}${pay !== 'all' ? ` · ${pay}` : ''} · ${plural(games.filter((m) => isTentative(m.g)).length, 'tentative')}`}</Txt>
      ) : null}
    </>
  );
}
