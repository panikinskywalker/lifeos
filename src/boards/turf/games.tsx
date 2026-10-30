import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Line, Path } from 'react-native-svg';
import type { ObjectRecord } from '@core/domain/types';
import { allAppearances, allGames, allVenues, kitsOf, owedOn, type AppearanceData, type GameData, type Kit } from '@modules/games';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts, monoFonts } from '@ui/theme/tokens';
import { Button, FilterChip, Icon, Screen, Segmented, Text } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Crest, Display, Face, Mono, SyncPill } from './teams';
import { Switcher } from './switcher';
import { NotConnected, type Props, useBack } from './common';

/**
 * Turf · Noir, Games (TF-MatchCentre, TF-MatchHistory): Match centre — the
 * season so far, what's booked as a wallet of match cards, the last 13 weeks,
 * a month calendar and the days and times you play — and Match history, the
 * played matches filtered paid / partial / unpaid and searched by venue or
 * player. A card at the front of the wallet opens its match; one behind it
 * comes to the front.
 */

const INK = '#0B0B0D';
const WHITE = '#F5F5F7';
const CHARCOAL = '#26262B';
const DIM = 'rgba(255,255,255,0.07)';
const HAIR = 'rgba(255,255,255,0.08)';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TERMS: Record<GameData['paymentTerms'], string> = { tentative: 'Dues paused', prepaid: 'Prepaid', advance_paid: 'Advance paid', postpaid: 'Postpaid' };

/* ---------- dates ---------- */

const isoOf = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const todayIso = () => isoOf(new Date());
const dateOf = (iso: string) => new Date(`${iso}T12:00:00`);
const daysBetween = (a: string, b: string) => Math.round((dateOf(b).getTime() - dateOf(a).getTime()) / 86_400_000);
/** Monday 0 … Sunday 6. */
const weekday = (iso: string) => (dateOf(iso).getDay() + 6) % 7;
const cardDay = (iso: string) => dateOf(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
const minutesOf = (time?: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(time ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const clock = (mins: number) => {
  const h = Math.floor(mins / 60) % 24;
  return { hhmm: `${String(h % 12 || 12).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`, ampm: h < 12 ? 'AM' : 'PM', short: `${h % 12 || 12}:${String(mins % 60).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`, hour: `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}` };
};
const monthRange = (dates: string[]) => {
  if (!dates.length) return '';
  const sorted = [...dates].sort();
  const a = MONTHS[Number(sorted[0]!.slice(5, 7)) - 1];
  const b = MONTHS[Number(sorted[sorted.length - 1]!.slice(5, 7)) - 1];
  return a === b ? a! : `${a} – ${b}`;
};
const mode = <T,>(xs: T[]): T | undefined => {
  const n = new Map<T, number>();
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---------- the data ---------- */

type Result = 'A' | 'B' | 'D' | null;
interface MatchRow {
  game: ObjectRecord<GameData>;
  number: number;
  kits: { A: Kit; B: Kit };
  apps: Array<ObjectRecord<AppearanceData>>;
  names: string[];
  faces: Array<{ id: string; name: string }>;
  venue: string;
  area: string | null;
  each: number;
  outstanding: number;
  paidCount: number;
  money: 'paid' | 'partial' | 'unpaid';
  result: Result;
  rsvpIn: number;
}

const resultOf = (g: GameData): Result => (g.scoreA == null || g.scoreB == null ? null : g.scoreA > g.scoreB ? 'A' : g.scoreA < g.scoreB ? 'B' : 'D');

function useMatches() {
  return useLive((o) => {
    const games = allGames(o);
    const apps = allAppearances(o);
    const byGame = new Map<string, Array<ObjectRecord<AppearanceData>>>();
    for (const a of apps) byGame.set(a.data.gameId, [...(byGame.get(a.data.gameId) ?? []), a]);
    const venues = new Map(allVenues(o).map((v) => [v.id, { name: v.data.name, area: v.data.placeId ? o.records.get(v.data.placeId)?.subtitle ?? null : null }]));
    const nameCache = new Map<string, string>();
    const nameOf = (id: string) => {
      if (!nameCache.has(id)) nameCache.set(id, o.records.get(id)?.title ?? 'Player');
      return nameCache.get(id)!;
    };
    const order = [...games].sort((a, b) => (a.data.date + (a.data.time ?? '')).localeCompare(b.data.date + (b.data.time ?? '')));
    const numberOf = new Map(order.map((g, i) => [g.id, i + 1]));
    const rows: MatchRow[] = order.map((g) => {
      const mine = byGame.get(g.id) ?? [];
      const outstanding = mine.reduce((s, a) => s + owedOn(a.data), 0);
      const others = mine.filter((a) => a.data.personId !== g.data.frontedById);
      const anyPaid = others.some((a) => (a.data.amountPaid ?? 0) > 0 || a.data.paid);
      const v = g.data.venueId ? venues.get(g.data.venueId) : undefined;
      return {
        game: g,
        number: numberOf.get(g.id)!,
        kits: kitsOf(g.data),
        apps: mine,
        names: mine.map((a) => nameOf(a.data.personId)),
        faces: mine.slice(0, 4).map((a) => ({ id: a.data.personId, name: nameOf(a.data.personId) })),
        venue: v?.name ?? g.data.venueName,
        area: v?.area ?? null,
        each: mine[0]?.data.share ?? (g.data.expectedPlayers ? g.data.totalCost / g.data.expectedPlayers : 0),
        outstanding,
        paidCount: mine.filter((a) => owedOn(a.data) === 0).length,
        money: outstanding === 0 ? 'paid' : anyPaid ? 'partial' : 'unpaid',
        result: resultOf(g.data),
        rsvpIn: Object.values(g.data.rsvps ?? {}).filter((r) => r === 'in').length,
      };
    });
    return { rows, players: apps.length };
  }, []);
}

/* ---------- the screen ---------- */

export function TurfGames({ ctx }: Props) {
  const back = useBack();
  const { busy, pull } = usePull();
  const [view, setView] = useState<'centre' | 'history'>('centre');
  const { rows } = useMatches();
  const f = ctx.format.currency;
  return (
    <Screen title="Turf" subtitle="Browse › Boards" onBack={back} right={<SyncPill />} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}>
      <Switcher active="games" />
      <Segmented
        options={[
          { value: 'centre', label: 'Match centre' },
          { value: 'history', label: 'Match history' },
        ]}
        value={view}
        onChange={setView}
      />
      {!rows.length ? <NotConnected /> : view === 'centre' ? <MatchCentre rows={rows} f={f} /> : <MatchHistory rows={rows} f={f} />}
    </Screen>
  );
}

type Money = (n: number) => string;

/* ------------------------------------------------------------------ */
/* 2a · Match centre                                                   */
/* ------------------------------------------------------------------ */

function MatchCentre({ rows, f }: { rows: MatchRow[]; f: Money }) {
  const router = useRouter();
  const today = todayIso();
  const upcoming = rows.filter((r) => r.game.data.date >= today && r.result === null);
  const played = rows.filter((r) => r.game.data.date <= today && !upcoming.includes(r));
  const year = today.slice(0, 4);
  const thisYear = played.filter((r) => r.game.data.date.startsWith(year));
  const season = thisYear.length ? thisYear : played;
  const kits = (rows[rows.length - 1] ?? rows[0])!.kits;
  // The wallet: furthest booking at the back, the next one at the front.
  const wallet = [...upcoming].reverse();
  return (
    <>
      {season.length ? <SeasonCard rows={season} kits={kits} f={f} /> : null}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 6, paddingHorizontal: 4 }}>
        <Text variant="heading">Upcoming</Text>
        <Text variant="caption" color="secondary" style={{ fontWeight: '600' }}>
          {upcoming.length ? `${upcoming.length} booked` : 'Nothing booked'}
        </Text>
      </View>
      {wallet.length ? (
        <Wallet rows={wallet} f={f} lead onOpen={(id) => router.push(`/board/turf/game?game=${id}` as never)} />
      ) : (
        <Card>
          <Text variant="caption" color="secondary">
            No match booked yet.
          </Text>
          <Button title="New match" icon="plus" size="sm" onPress={() => router.push('/board/turf/match' as never)} />
        </Card>
      )}
      <ActivityCard rows={rows} kits={kits} />
      <CalendarCard rows={rows} kits={kits} />
      {season.length ? <WhenCard rows={season} /> : null}
    </>
  );
}

function Card({ children, padding = 18, gap = 12 }: { children: React.ReactNode; padding?: number; gap?: number }) {
  const t = useTheme();
  return <View style={{ padding, gap, borderRadius: 28, backgroundColor: t.c.bg.tile }}>{children}</View>;
}

function CardHead({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="tileTitle">{title}</Text>
        {sub ? (
          <Text variant="caption" color="secondary" numberOfLines={1} style={{ fontWeight: '500' }}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** A 28 status pill: quiet (7% white), lime (soft lime), or ink on a colour card. */
function Pill({ label, icon, tone = 'quiet' }: { label: string; icon?: string; tone?: 'quiet' | 'lime' | 'ink' | 'white' }) {
  const t = useTheme();
  const [bg, fg] = { quiet: [DIM, t.c.fg.secondary], lime: [t.c.accent.mustardSoft, t.c.accent.mustard], ink: [INK, WHITE], white: [WHITE, INK] }[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: bg, alignSelf: 'flex-start' }}>
      {icon ? <Icon name={icon} size={13} color={fg} /> : null}
      <Text variant="labelMicro" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Legend({ items }: { items: Array<{ color?: string; ring?: string; label: string }> }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 }}>
      {items.map((it) => (
        <View key={it.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: it.color ?? 'transparent', borderWidth: it.ring ? 2 : 1.5, borderColor: it.ring ?? 'rgba(255,255,255,0.25)' }} />
          <Text variant="caption" color="tertiary">
            {it.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const resultColour = (r: Result, kits: { A: Kit; B: Kit }) => (r === 'A' ? kits.A.hex : r === 'B' ? kits.B.hex : r === 'D' ? WHITE : null);

/** The season so far: wins each side and draws, the last six, the goals, venues, players and spend. */
function SeasonCard({ rows, kits, f }: { rows: MatchRow[]; kits: { A: Kit; B: Kit }; f: Money }) {
  const router = useRouter();
  const scored = rows.filter((r) => r.result);
  const won = { A: scored.filter((r) => r.result === 'A').length, D: scored.filter((r) => r.result === 'D').length, B: scored.filter((r) => r.result === 'B').length };
  const goals = scored.reduce((s, r) => ({ a: s.a + (r.game.data.scoreA ?? 0), b: s.b + (r.game.data.scoreB ?? 0) }), { a: 0, b: 0 });
  const lastSix = scored.slice(-6);
  const venues = new Set(rows.map((r) => r.venue)).size;
  const players = new Set(rows.flatMap((r) => r.apps.map((a) => a.data.personId))).size;
  const spend = rows.reduce((s, r) => s + r.game.data.totalCost, 0);
  const streak = weeklyStreak(rows.map((r) => r.game.data.date));
  const big = (n: number, label: string, color: string) => (
    <View style={{ gap: 2 }}>
      <Display size={48} color={color} style={{ lineHeight: 44, letterSpacing: 1 }}>
        {String(n)}
      </Display>
      <Text variant="labelCaps" color="tertiary">
        {label.toUpperCase()}
      </Text>
    </View>
  );
  const divider = <View style={{ width: 1, height: 40, backgroundColor: HAIR }} />;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Leaders" onPress={() => router.push('/board/turf/leaders' as never)}>
      <Card padding={16}>
        <CardHead title="Season" sub={`${monthRange(rows.map((r) => r.game.data.date))} · ${plural(rows.length, 'match', 'matches')}`} right={streak.n >= 2 ? <Pill tone="lime" icon="flame" label={`${streak.n} ${streak.day}s running`} /> : null} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {big(won.A, `${kits.A.name} won`, kits.A.text)}
          {divider}
          {big(won.D, 'Draws', WHITE)}
          {divider}
          {big(won.B, `${kits.B.name} won`, kits.B.text)}
        </View>
        {scored.length ? (
          <View style={{ flexDirection: 'row', gap: 3, height: 8 }}>
            {won.A ? <View style={{ flex: won.A, borderRadius: 4, backgroundColor: kits.A.hex }} /> : null}
            {won.D ? <View style={{ flex: won.D, borderRadius: 4, backgroundColor: WHITE }} /> : null}
            {won.B ? <View style={{ flex: won.B, borderRadius: 4, backgroundColor: kits.B.hex }} /> : null}
          </View>
        ) : null}
        {lastSix.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="caption" color="tertiary">
              {lastSix.length === 6 ? 'Last six' : `Last ${lastSix.length}`}
            </Text>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {lastSix.map((r) => (
                <View key={r.game.id} style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: resultColour(r.result, r.kits)! }} />
              ))}
            </View>
            <Text variant="caption" color="tertiary" style={{ marginLeft: 'auto' }}>
              {`${goals.a} – ${goals.b} goals`}
            </Text>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Pill icon="location" label={plural(venues, 'venue')} />
          <Pill icon="people" label={plural(players, 'player')} />
          <Pill icon="rupee" label={f(spend)} />
        </View>
      </Card>
    </Pressable>
  );
}

/** Weeks in a row, back from the latest, with a match on the day you usually play. */
function weeklyStreak(dates: string[]): { n: number; day: string } {
  const day = mode(dates.map(weekday));
  if (day == null) return { n: 0, day: '' };
  const on = new Set(dates.filter((d) => weekday(d) === day));
  const latest = [...on].sort().pop();
  let n = 0;
  for (let d = latest; d && on.has(d); d = isoOf(new Date(dateOf(d).getTime() - 7 * 86_400_000))) n++;
  return { n, day: WEEKDAYS[day]! };
}

/* ---------- the wallet of match cards ---------- */

const PEEK = 52;
const CARD_H = 190;
const LIFT = 12;

/** Cards stacked 52 apart; the one at the front stands clear by 12 and shows whole. */
function Wallet({ rows, f, lead, onOpen }: { rows: MatchRow[]; f: Money; lead?: boolean; onOpen: (gameId: string) => void }) {
  const [front, setFront] = useState<string | null>(null);
  const picked = rows.findIndex((r) => r.game.id === front);
  const sel = picked >= 0 ? picked : rows.length - 1;
  const tops: number[] = [];
  rows.forEach((_, i) => tops.push(i === 0 ? 0 : tops[i - 1]! + (i - 1 === sel ? CARD_H + LIFT : PEEK) + (i === sel ? LIFT : 0)));
  const height = tops[rows.length - 1]! + CARD_H;
  return (
    <View style={{ height }}>
      {rows.map((r, i) => (
        <Pressable
          key={r.game.id}
          accessibilityRole="button"
          accessibilityLabel={i === sel ? `Open match ${r.number}` : `Match ${r.number}`}
          onPress={() => (i === sel ? onOpen(r.game.id) : setFront(r.game.id))}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: tops[i],
            height: CARD_H,
            zIndex: i + 1,
            elevation: i + 1,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: i === sel ? 24 : -6 },
            shadowOpacity: i === sel ? 0.55 : 0.35,
            shadowRadius: i === sel ? 24 : 7,
          }}
        >
          <MatchCard r={r} f={f} highlight={!!lead && i === rows.length - 1} />
        </Pressable>
      ))}
    </View>
  );
}

/** The front of a match card (TF-MatchCentre / TF-MatchHistory): a tab, kick-off or score, the crests, the venue, the money, who's in. */
function MatchCard({ r, f, highlight }: { r: MatchRow; f: Money; highlight?: boolean }) {
  const g = r.game.data;
  const today = todayIso();
  const upcoming = r.result === null && g.date >= today;
  const colour = upcoming ? (highlight ? '#D7F55C' : null) : r.result === 'A' ? r.kits.A.hex : r.result === 'B' ? r.kits.B.hex : null;
  const darkInk = colour ? (upcoming ? true : r.result === 'A' ? r.kits.A.ink === 'dark' : r.kits.B.ink === 'dark') : false;
  const bg = colour ?? CHARCOAL;
  const ink = darkInk ? INK : WHITE;
  const soft = darkInk ? 'rgba(11,11,13,0.62)' : 'rgba(245,245,247,0.62)';
  const days = daysBetween(today, g.date);
  const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
  const status = upcoming
    ? `${g.paymentTerms === 'tentative' ? 'Tentative' : 'Kick-off'} · ${when}`
    : r.result === 'D'
      ? 'Draw · Full time'
      : r.result
        ? `${r.kits[r.result].name} won · Full time`
        : 'No score yet';
  const mins = minutesOf(g.time);
  const after = upcoming ? TERMS[g.paymentTerms] : r.outstanding ? `${r.apps.length - r.paidCount} to collect` : r.apps.length ? 'Settled' : null;
  const money = [f(g.totalCost), r.each ? `${f(r.each)} each` : null, g.sideSize ? `${g.sideSize}-a-side` : null, after].filter(Boolean).join(' · ');
  const pill = upcoming ? (r.rsvpIn || r.apps.length ? `${r.rsvpIn || r.apps.length} in · ${g.expectedPlayers || r.apps.length}` : 'No replies yet') : r.apps.length ? `${r.paidCount} of ${r.apps.length} paid` : 'No players';
  const allPaid = !upcoming && r.apps.length > 0 && r.paidCount === r.apps.length;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: 26, flexDirection: 'row' }}>
        <View style={{ width: 124, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: bg, justifyContent: 'center', paddingHorizontal: 16 }}>
          <Mono color={ink} style={{ fontFamily: monoFonts[700] }}>{`Match ${String(r.number).padStart(2, '0')}`}</Mono>
        </View>
        <View style={{ flex: 1, marginTop: 14, borderTopRightRadius: 14, backgroundColor: bg }} />
      </View>
      <View style={{ flex: 1, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: bg, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 14, gap: 12 }}>
        <View style={{ height: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Mono color={soft} style={{ fontFamily: monoFonts[700], flexShrink: 1 }}>
            {status}
          </Mono>
          <Mono color={ink} style={{ fontFamily: monoFonts[700] }}>
            {cardDay(g.date)}
          </Mono>
        </View>
        <View style={{ height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ width: 96, flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            {upcoming ? (
              mins != null ? (
                <>
                  <Display size={36} color={ink} style={{ lineHeight: 34 }}>
                    {clock(mins).hhmm}
                  </Display>
                  <Display size={14} color={soft}>
                    {clock(mins).ampm}
                  </Display>
                </>
              ) : (
                <Display size={20} color={soft}>
                  Time tbc
                </Display>
              )
            ) : (
              <>
                <Display size={36} color={ink} style={{ lineHeight: 34 }}>
                  {g.scoreA != null ? String(g.scoreA) : '–'}
                </Display>
                <Display size={20} color={soft}>
                  –
                </Display>
                <Display size={36} color={ink} style={{ lineHeight: 34 }}>
                  {g.scoreB != null ? String(g.scoreB) : '–'}
                </Display>
              </>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Crest kit={r.kits.A} size={32} />
            <Display size={12} color={soft}>
              VS
            </Display>
            <Crest kit={r.kits.B} size={32} />
          </View>
          <View style={{ width: 96, alignItems: 'flex-end' }}>
            <Display size={15} color={ink} style={{ lineHeight: 15 }}>
              {r.venue}
            </Display>
            {r.area ? (
              <Mono color={soft} size={9} style={{ letterSpacing: 0.5 }}>
                {r.area}
              </Mono>
            ) : null}
          </View>
        </View>
        <View style={{ height: 16, justifyContent: 'center' }}>
          <Mono color={soft} style={{ flexShrink: 1 }}>
            {money}
          </Mono>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {r.faces.length ? (
            <View style={{ flexDirection: 'row' }}>
              {r.faces.map((p, i) => (
                <View key={p.id} style={{ marginLeft: i ? -6 : 0, borderRadius: 14, borderWidth: 2, borderColor: '#1A1A1E' }}>
                  <Face id={p.id} name={p.name} size={24} />
                </View>
              ))}
            </View>
          ) : null}
          <Pill label={pill} tone={colour ? 'ink' : allPaid ? 'lime' : 'quiet'} />
          <View style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 16, backgroundColor: colour ? 'rgba(11,11,13,0.14)' : DIM, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron-right" size={16} color={ink} />
          </View>
        </View>
      </View>
    </View>
  );
}

/* ---------- the last 13 weeks ---------- */

const CELL = 18;
const PITCH_GAP = 22;

/** 13 columns of weeks, Monday at the top; a match day in the winner's colour (white for a draw), today ringed. */
function ActivityCard({ rows, kits }: { rows: MatchRow[]; kits: { A: Kit; B: Kit } }) {
  const today = todayIso();
  const monday = isoOf(new Date(dateOf(today).getTime() - weekday(today) * 86_400_000));
  const start = isoOf(new Date(dateOf(monday).getTime() - 12 * 7 * 86_400_000));
  const byDay = new Map<string, MatchRow>();
  for (const r of rows) if (r.game.data.date >= start && r.game.data.date <= isoOf(new Date(dateOf(monday).getTime() + 6 * 86_400_000))) byDay.set(r.game.data.date, r);
  const usual = mode([...byDay.keys()].filter((d) => d <= today).map(weekday));
  const weeksOn = usual == null ? 0 : new Set([...byDay.keys()].filter((d) => d <= today && weekday(d) === usual).map((d) => daysBetween(start, d) / 7 | 0)).size;
  const width = 13 * CELL + 12 * (PITCH_GAP - CELL);
  const cells: React.ReactNode[] = [];
  for (let w = 0; w < 13; w++) {
    for (let d = 0; d < 7; d++) {
      const iso = isoOf(new Date(dateOf(start).getTime() + (w * 7 + d) * 86_400_000));
      const r = byDay.get(iso);
      const fill = r ? resultColour(r.result, r.kits) : null;
      const future = iso > today;
      cells.push(
        <View
          key={iso}
          style={{
            position: 'absolute',
            left: w * PITCH_GAP,
            top: d * PITCH_GAP,
            width: CELL,
            height: CELL,
            borderRadius: 5.4,
            backgroundColor: fill ?? (r ? 'rgba(245,245,247,0.4)' : 'rgba(245,245,247,0.1)'),
            borderWidth: r && future ? 2 : 0,
            borderColor: '#D7F55C',
          }}
        />,
      );
      if (iso === today) cells.push(<View key="today" style={{ position: 'absolute', left: w * PITCH_GAP - 1.5, top: d * PITCH_GAP - 1.5, width: 21, height: 21, borderRadius: 7.2, borderWidth: 1.5, borderColor: WHITE }} />);
    }
  }
  return (
    <Card>
      <CardHead title="Activity" sub="last 13 weeks" right={usual != null ? <Pill tone="lime" label={`${weeksOn} of 13 ${WEEKDAYS[usual]}s`} /> : null} />
      <View style={{ alignItems: 'center' }}>
        <View style={{ width, height: 7 * CELL + 6 * (PITCH_GAP - CELL) }}>{cells}</View>
        <View style={{ width, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          <Text variant="caption" color="tertiary">
            {MONTHS[Number(start.slice(5, 7)) - 1]}
          </Text>
          <Text variant="caption" color="tertiary">
            {MONTHS[Number(monday.slice(5, 7)) - 1]}
          </Text>
        </View>
      </View>
      <Legend items={[{ color: kits.A.hex, label: `${kits.A.name} won` }, { color: kits.B.hex, label: `${kits.B.name} won` }, { color: WHITE, label: 'draw' }]} />
    </Card>
  );
}

/* ---------- a month ---------- */

function CalendarCard({ rows, kits }: { rows: MatchRow[]; kits: { A: Kit; B: Kit } }) {
  const t = useTheme();
  const router = useRouter();
  const today = todayIso();
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const byDay = useMemo(() => new Map(rows.map((r) => [r.game.data.date, r])), [rows]);
  const first = `${month.y}-${String(month.m + 1).padStart(2, '0')}-01`;
  const lead = weekday(first);
  const days = new Date(month.y, month.m + 1, 0).getDate();
  const cells: Array<string | null> = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${first.slice(0, 8)}${String(i + 1).padStart(2, '0')}`)];
  while (cells.length % 7) cells.push(null);
  const step = (by: number) => setMonth((x) => ({ y: x.y + Math.floor((x.m + by) / 12), m: (((x.m + by) % 12) + 12) % 12 }));
  const nav = (icon: string, label: string, by: number) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => step(by)} hitSlop={6} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: CHARCOAL, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={13} color={WHITE} />
    </Pressable>
  );
  const cell = (iso: string | null, i: number) => {
    if (!iso) return <View key={`b${i}`} style={{ flex: 1, height: 34 }} />;
    const r = byDay.get(iso);
    const fill = r ? resultColour(r.result, r.kits) : null;
    const booked = !!r && !fill && iso >= today;
    const isToday = iso === today;
    return (
      <Pressable key={iso} accessibilityRole={r ? 'button' : undefined} accessibilityLabel={r ? `Match on ${cardDay(iso)}` : cardDay(iso)} disabled={!r} onPress={() => r && router.push(`/board/turf/game?game=${r.game.id}` as never)} style={{ flex: 1, alignItems: 'center' }}>
        <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: fill ?? (r && !booked ? 'rgba(245,245,247,0.4)' : 'transparent'), borderWidth: booked ? 2 : isToday && !fill ? 1.5 : 0, borderColor: booked ? '#D7F55C' : 'rgba(245,245,247,0.42)' }}>
          <Text variant="caption" color={fill || (r && !booked) ? INK : booked || isToday ? WHITE : 'secondary'} style={{ fontWeight: fill || booked ? '700' : '600' }}>
            {String(Number(iso.slice(8)))}
          </Text>
        </View>
      </Pressable>
    );
  };
  return (
    <Card>
      <CardHead
        title={LONG_MONTHS[month.m]!}
        sub={String(month.y)}
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
            <Text key={i} variant="labelCaps" color="tertiary" style={{ flex: 1, textAlign: 'center', letterSpacing: 0 }}>
              {d}
            </Text>
          ))}
        </View>
        {Array.from({ length: cells.length / 7 }, (_, w) => (
          <View key={w} style={{ flexDirection: 'row' }}>
            {cells.slice(w * 7, w * 7 + 7).map((c, i) => cell(c, w * 7 + i))}
          </View>
        ))}
      </View>
      <Legend items={[{ color: kits.A.hex, label: `${kits.A.name} won` }, { color: kits.B.hex, label: `${kits.B.name} won` }, { color: WHITE, label: 'draw' }, { ring: t.c.accent.mustard, label: 'booked' }]} />
    </Card>
  );
}

/* ---------- day of the week and kick-off ---------- */

const RULER_FROM = 18 * 60;
const RULER_TO = 23 * 60;

function WhenCard({ rows }: { rows: MatchRow[] }) {
  const [w, setW] = useState(0);
  const counts = Array.from({ length: 7 }, (_, d) => rows.filter((r) => weekday(r.game.data.date) === d).length);
  const top = Math.max(...counts);
  const times = rows.map((r) => minutesOf(r.game.data.time)).filter((m): m is number => m != null);
  const usual = mode(times);
  const lo = times.length ? Math.max(RULER_FROM, Math.min(...times)) : null;
  const hi = times.length ? Math.min(RULER_TO, Math.max(...times)) : null;
  const byVenue = [...new Set(rows.map((r) => r.venue))]
    .map((v) => ({ v, n: rows.filter((r) => r.venue === v).length, at: mode(rows.filter((r) => r.venue === v).map((r) => minutesOf(r.game.data.time)).filter((m): m is number => m != null)) }))
    .filter((x) => x.at != null)
    .sort((a, b) => b.n - a.n)
    .slice(0, 3);
  const ticks = (RULER_TO - RULER_FROM) / 12;
  const x = (mins: number) => ((mins - RULER_FROM) / (RULER_TO - RULER_FROM)) * w;
  return (
    <Card>
      <CardHead title="When you play" sub="this season" />
      <View style={{ flexDirection: 'row', gap: 10, height: 104, alignItems: 'flex-end' }}>
        {counts.map((n, d) => {
          const most = n === top && n > 0;
          return (
            <View key={d} style={{ flex: 1, alignItems: 'center', gap: 0 }}>
              {n ? (
                <Text variant="mono" color={most ? WHITE : 'secondary'} style={{ fontFamily: monoFonts[700], fontSize: 11, lineHeight: 14, marginBottom: 3 }}>
                  {String(n)}
                </Text>
              ) : null}
              <View style={{ alignSelf: 'stretch', height: n ? Math.max(10, Math.round((n / top) * 68)) : 4, borderRadius: n ? 10 : 2, backgroundColor: most ? '#D7F55C' : n ? CHARCOAL : DIM, marginBottom: n ? 0 : 3 }} />
              <Text variant="labelCaps" color={most ? WHITE : 'tertiary'} style={{ letterSpacing: 0, marginTop: 4 }}>
                {'MTWTFSS'[d]}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={{ height: 1, backgroundColor: HAIR }} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text variant="caption" color="tertiary" style={{ flex: 1 }}>
          Usual kick-off
        </Text>
        <Text variant="label" style={{ fontWeight: '700' }}>
          {usual != null ? clock(usual).short : 'Not set'}
        </Text>
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w ? (
          <Svg width={w} height={34} viewBox={`0 0 ${w} 34`}>
            {Array.from({ length: ticks + 1 }, (_, i) => {
              const mins = RULER_FROM + i * 12;
              const hour = i % 5 === 0;
              const on = lo != null && hi != null && mins >= lo && mins <= hi;
              return <Line key={i} x1={x(mins)} x2={x(mins)} y1={hour ? 4 : 7} y2={hour ? 18 : 15} stroke={on ? '#D7F55C' : WHITE} strokeWidth={on ? 2 : 1.5} opacity={on ? 1 : hour ? 0.6 : 0.28} strokeLinecap="round" />;
            })}
            {usual != null && usual >= RULER_FROM && usual <= RULER_TO ? <Path d={`M${x(usual) - 5} 28 L${x(usual) + 5} 28 L${x(usual)} 22 Z`} fill="#D7F55C" /> : null}
          </Svg>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -2 }}>
          {['6 pm', '7', '8', '9', '10', '11 pm'].map((l) => (
            <Text key={l} variant="labelCaps" color="tertiary" style={{ letterSpacing: 0 }}>
              {l}
            </Text>
          ))}
        </View>
      </View>
      {byVenue.length ? (
        <Text variant="caption" color="tertiary">
          {byVenue.map((b) => `${clock(b.at!).hour} at ${b.v}`).join(' · ')}
        </Text>
      ) : null}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 2b · Match history                                                  */
/* ------------------------------------------------------------------ */

const PAGE = 6;

function MatchHistory({ rows, f }: { rows: MatchRow[]; f: Money }) {
  const t = useTheme();
  const router = useRouter();
  const [when, setWhen] = useState<'today' | 'upcoming' | 'past'>('past');
  const [money, setMoney] = useState<'all' | MatchRow['money']>('all');
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE);
  const today = todayIso();
  const query = q.trim().toLowerCase();
  const list = rows.filter((r) => {
    const d = r.game.data.date;
    if (when === 'today' ? d !== today : when === 'upcoming' ? d <= today : d >= today) return false;
    if (money !== 'all' && (r.money !== money || !r.apps.length)) return false;
    return !query || r.venue.toLowerCase().includes(query) || r.names.some((n) => n.toLowerCase().includes(query));
  });
  const page = list.slice(-shown);
  const older = list.length - page.length;
  const kits = (rows[rows.length - 1] ?? rows[0])!.kits;
  const pill = (key: typeof when, label: string) => (
    <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: when === key }} onPress={() => (setWhen(key), setShown(PAGE))} style={{ flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: when === key ? t.c.accent.mustard : t.c.bg.tile }}>
      <Text variant="label" color={when === key ? t.c.accent.mustardInk : 'secondary'} style={{ fontSize: 13, lineHeight: 17, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: HAIR }}>
        <Icon name="search" size={18} color={t.c.fg.tertiary} />
        <TextInput value={q} onChangeText={(v) => (setQ(v), setShown(PAGE))} placeholder="Venue or player" placeholderTextColor={t.c.fg.tertiary} style={{ flex: 1, height: 48, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 15 }} accessibilityLabel="Search venue or player" returnKeyType="search" />
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {pill('today', 'Today')}
        {pill('upcoming', 'Upcoming')}
        {pill('past', 'Past')}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {(['all', 'paid', 'partial', 'unpaid'] as const).map((m) => (
          <FilterChip key={m} label={m[0]!.toUpperCase() + m.slice(1)} selected={money === m} onPress={() => (setMoney(m), setShown(PAGE))} />
        ))}
      </View>
      <Text variant="caption" color="tertiary">
        {`Tap a card to bring it forward, again to open it · ${kits.A.name.toLowerCase()} = ${kits.A.name} won, ${kits.B.name.toLowerCase()} = ${kits.B.name} won, grey = draw`}
      </Text>
      {page.length ? (
        <Wallet key={`${when}-${money}-${query}-${shown}`} rows={page} f={f} onOpen={(id) => router.push(`/board/turf/game?game=${id}` as never)} />
      ) : (
        <Card>
          <Text variant="caption" color="secondary">
            {query ? `No match with “${q.trim()}”.` : when === 'today' ? 'No match today.' : when === 'upcoming' ? 'Nothing booked.' : 'No matches here.'}
          </Text>
        </Card>
      )}
      {list.length ? (
        <Pressable accessibilityRole={older ? 'button' : undefined} disabled={!older} onPress={() => setShown((n) => n + PAGE)}>
          <Text variant="caption" color="tertiary">
            {[plural(list.length, 'game'), monthRange(list.map((r) => r.game.data.date)), older ? `${older} older · show ${Math.min(PAGE, older)} more` : null].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}
