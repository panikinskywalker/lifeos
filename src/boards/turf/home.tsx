import React, { useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import type { Filing } from '@core/repo/filingRepo';
import { allAppearances, allGames, allPlayers, isSending, kitsOf, lineup, matchTexts, rupees, turfBase, turfChanges, turfDues, type AppearanceData, type GameData, type Kit, type SmsAsk } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { displayFont, monoFonts } from '@ui/theme/tokens';
import { Icon, RowItem, RowList, Screen, Section, Text } from '@ui/kit';
import { usePull } from './useTurfSync';
import { Crest, Display, Face } from './teams';
import { Switcher, useCopyShare } from './switcher';
import { NotConnected, type Props, TINT, useBack } from './common';
import { CopyAllRow, Disc, DueRows, HeaderRight, PillButton, SectionHead, StatTile, TurfCard, day, todayIso } from './dues';
import { SmsAskCard, SmsPaidCard, SubmissionCard, answeredAsks } from './checkcards';

/**
 * Turf · Noir 1 · Home (TF-Home): the section switcher, money at a glance,
 * the next match as the lime poster, Turf's To check cards, recent games as
 * the wallet, who still owes, and what is still on its way to Turf web.
 */

const INK = '#0B0B0D';
const WHITE = '#F5F5F7';
const at = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cents = (rupeesAmount: number | undefined) => Math.round((rupeesAmount ?? 0) * 100);
const money = (rupeesAmount: number | undefined) => rupees(cents(rupeesAmount));

/* ------------------------------------------------------------------ */
/* Small facts about a game (as Turf web's app/ui/match.ts)            */
/* ------------------------------------------------------------------ */

const isUpcoming = (g: GameData, today = todayIso()) => g.date > today || (g.date === today && g.scoreA == null);
const winnerOf = (g: GameData): 'A' | 'B' | 'draw' | null => (g.scoreA == null || g.scoreB == null ? null : g.scoreA === g.scoreB ? 'draw' : g.scoreA > g.scoreB ? 'A' : 'B');

/** "Lime won · Full time", "Draw · Full time", "Played · no score". */
function stateLine(g: GameData, k: { A: Kit; B: Kit }) {
  const w = winnerOf(g);
  return w === 'draw' ? 'Draw · Full time' : w === 'A' ? `${k.A.name} won · Full time` : w === 'B' ? `${k.B.name} won · Full time` : 'Played · no score';
}

/** "20:00" → 08:00 · PM. */
function kickOff(time: string | undefined) {
  if (!time || !/^\d{1,2}:\d{2}/.test(time)) return { clock: '—', half: '' };
  const [h, m] = time.split(':').map(Number) as [number, number];
  return { clock: `${String(h % 12 || 12).padStart(2, '0')}:${String(m).padStart(2, '0')}`, half: h >= 12 ? 'PM' : 'AM' };
}

/** "Wings - Bishop Cotton" → ["Wings", "Bishop Cotton"]. */
function splitVenue(venue: string): [string, string | null] {
  const m = /^(.*?)\s+[-–·]\s+(.*)$/.exec(venue);
  return m ? [m[1]!, m[2]!] : [venue, null];
}

/** The area under a venue's name: from the name, else the Place's city. */
function areaOf(os: LifeOSContext, g: GameData): [string, string | null] {
  const [name, area] = splitVenue(g.venueName);
  if (area) return [name, area];
  const venue = g.venueId ? os.records.get<{ placeId?: string }>(g.venueId) : undefined;
  const place = venue?.data.placeId ? os.records.get<{ city?: string }>(venue.data.placeId) : undefined;
  return [name, place?.data.city ?? null];
}

const isPaid = (a: AppearanceData, g: GameData) => a.paid || a.personId === g.frontedById || (a.amountPaid ?? 0) >= a.share;

function scorers(apps: Array<{ appearance: ObjectRecord<AppearanceData>; name: string }>, team: 'A' | 'B') {
  const out = apps.filter((l) => l.appearance.data.team === team && l.appearance.data.goals > 0).map((l) => (l.appearance.data.goals > 1 ? `${l.name} ×${l.appearance.data.goals}` : l.name));
  const og = apps.filter((l) => l.appearance.data.team && l.appearance.data.team !== team).reduce((s, l) => s + (l.appearance.data.ownGoals ?? 0), 0);
  if (og) out.push(og > 1 ? `Own goal ×${og}` : 'Own goal');
  return out;
}

/** The match's link on Turf web, for the RSVP and result texts. */
const linkOf = (os: LifeOSContext, g: GameData) => {
  const base = turfBase(os);
  return base && g.shareSlug ? `${base}/match/${g.shareSlug}` : '';
};

/* ------------------------------------------------------------------ */
/* Faces                                                               */
/* ------------------------------------------------------------------ */

/** Overlapping faces, each in a 2px ring of the card colour, "+3" after the last. */
function Faces({ people, size, max, ring, more }: { people: Array<{ id: string; name: string }>; size: number; max: number; ring: string; more: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {people.slice(0, max).map((p, i) => (
        <View key={p.id} style={{ marginLeft: i ? -Math.round(size * 0.28) : 0, borderRadius: size / 2 + 2, borderWidth: 2, borderColor: ring }}>
          <Face id={p.id} name={p.name} size={size} />
        </View>
      ))}
      {people.length > max ? (
        <Text variant="labelMicro" color={more} style={{ marginLeft: 6 }}>
          +{people.length - max}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The next match: the lime poster                                     */
/* ------------------------------------------------------------------ */

function Poster() {
  const t = useTheme();
  const router = useRouter();
  const { share } = useCopyShare();
  const p = useLive((o) => {
    const today = todayIso();
    const games = allGames(o);
    const next = games.filter((g) => isUpcoming(g.data, today)).sort((a, b) => (a.data.date + (a.data.time ?? '')).localeCompare(b.data.date + (b.data.time ?? '')))[0];
    if (!next) {
      const last = games.find((g) => !isUpcoming(g.data, today));
      return { next: null, last: last ? { g: last.data, k: kitsOf(last.data) } : null } as const;
    }
    const people = lineup(o, next.id).filter((l) => l.appearance.data.attendance !== 'no_show');
    const texts = matchTexts(o, next.id, linkOf(o, next.data));
    return { next, last: null, people: people.map((l) => ({ id: l.appearance.data.personId, name: l.name })), area: areaOf(o, next.data), text: texts?.rsvp ?? texts?.details ?? null } as const;
  }, []);

  if (!p.next) {
    const l = p.last;
    return (
      <TurfCard padding={16} radius={28} gap={12}>
        <Display size={28}>No match booked</Display>
        {l ? (
          <Text variant="caption" color="secondary">
            Last: {day(l.g.date)} · {l.g.venueName}
            {winnerOf(l.g) ? ` · ${l.k.A.name} ${l.g.scoreA}–${l.g.scoreB} ${l.k.B.name}` : ''}
          </Text>
        ) : null}
        <PillButton title="Book one" icon="plus" tone="lime" onPress={() => router.push('/board/turf/match' as never)} />
      </TurfCard>
    );
  }
  const g = p.next.data;
  const k = kitsOf(g);
  const ko = kickOff(g.time);
  const [venue, area] = p.area!;
  const dim = 'rgba(11,11,13,0.6)';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Next match, ${day(g.date)}, ${venue}`} onPress={() => router.push(`/board/turf/game?game=${p.next!.id}` as never)} style={({ pressed }) => ({ padding: 16, gap: 12, borderRadius: 28, backgroundColor: t.c.accent.mustard, opacity: pressed ? 0.92 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Crest kit={k.A} size={36} />
          <Crest kit={k.B} size={36} />
        </View>
        <Display size={20} color={INK}>
          {day(g.date)}
        </Display>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <View>
          <Display size={44} color={INK} style={{ lineHeight: 40 }}>
            Matchday
          </Display>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Display size={64} color={INK} style={{ lineHeight: 60 }}>
              {ko.clock}
            </Display>
            <Display size={20} color={dim}>
              {ko.half}
            </Display>
          </View>
        </View>
        <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end', gap: 4 }}>
          <DisplayLines size={16} color={INK} lines={2} style={{ textAlign: 'right' }}>
            {venue}
          </DisplayLines>
          {area ? (
            <DisplayLines size={12} color={dim} style={{ textAlign: 'right' }}>
              {area}
            </DisplayLines>
          ) : null}
          <Display size={12} color={dim} style={{ textAlign: 'right' }}>
            {g.sideSize ? `${g.sideSize}-a-side · ` : ''}
            {p.people!.length} in / {g.expectedPlayers}
          </Display>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {p.people!.length ? (
          <Faces people={p.people!} size={26} max={5} ring={t.c.bg.tile} more={dim} />
        ) : (
          <Display size={12} color={dim}>
            No replies yet
          </Display>
        )}
        {p.text ? <PillButton title="RSVP link" icon="send" tone="dark" onPress={() => share(p.text!)} /> : null}
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Recent games: the wallet                                            */
/* ------------------------------------------------------------------ */

export const FRONT_H = 190;
export const BACK_H = 310;
export const PEEK = 52;

interface Palette {
  bg: string;
  fg: string;
  soft: string;
  chip: string;
  chipFg: string;
  chipLime: string;
  strip: string;
  ring: string;
  button: string;
  buttonFg: string;
  share: string;
  shareFg: string;
}

/** A played match wears the winner's kit; a draw (or no score) is charcoal. */
function paletteOf(g: GameData, k: { A: Kit; B: Kit }, c: { raised: string; pill: string; lime: string; fg: string; soft: string }): Palette {
  const { raised, pill, lime } = c;
  const w = winnerOf(g);
  const kit = w === 'A' ? k.A : w === 'B' ? k.B : null;
  if (kit) {
    const dark = kit.ink === 'dark';
    return { bg: kit.hex, fg: dark ? INK : WHITE, soft: dark ? 'rgba(11,11,13,0.62)' : 'rgba(245,245,247,0.72)', chip: dark ? INK : 'rgba(255,255,255,0.16)', chipFg: WHITE, chipLime: dark ? WHITE : lime, strip: dark ? 'rgba(11,11,13,0.85)' : 'rgba(0,0,0,0.45)', ring: dark ? 'rgba(11,11,13,0.14)' : 'rgba(255,255,255,0.16)', button: dark ? INK : WHITE, buttonFg: dark ? WHITE : INK, share: INK, shareFg: lime };
  }
  return { bg: raised, fg: c.fg, soft: c.soft, chip: pill, chipFg: c.soft, chipLime: lime, strip: 'rgba(255,255,255,0.08)', ring: pill, button: lime, buttonFg: INK, share: raised, shareFg: lime };
}

interface WalletGame {
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
  venue: string;
  area: string | null;
  text: string | null;
}

/** The last few played games, oldest first, as the wallet draws them. */
function walletGames(os: LifeOSContext, count = 3): WalletGame[] {
  const today = todayIso();
  const games = allGames(os);
  const numbers = new Map([...games].sort((a, b) => (a.data.date + (a.data.time ?? '')).localeCompare(b.data.date + (b.data.time ?? ''))).map((g, i) => [g.id, i + 1]));
  return games
    .filter((g) => !isUpcoming(g.data, today))
    .slice(0, count)
    .reverse()
    .map((rec) => {
      const g = rec.data;
      const apps = lineup(os, rec.id);
      const shares = apps.map((l) => cents(l.appearance.data.share));
      const motm = g.motmId ? apps.find((l) => l.appearance.data.personId === g.motmId) : undefined;
      const [venue, area] = areaOf(os, g);
      const texts = matchTexts(os, rec.id, linkOf(os, g));
      return {
        id: rec.id,
        g,
        number: numbers.get(rec.id) ?? 0,
        k: kitsOf(g),
        people: apps.map((l) => ({ id: l.appearance.data.personId, name: l.name })),
        paid: apps.filter((l) => isPaid(l.appearance.data, g)).length,
        total: apps.length,
        each: shares.length && shares.every((s) => s === shares[0]) ? shares[0]! : null,
        scorersA: scorers(apps, 'A'),
        scorersB: scorers(apps, 'B'),
        motm: motm ? { id: motm.appearance.data.personId, name: motm.name } : null,
        venue,
        area,
        text: texts?.result ?? null,
      };
    });
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** One line of JetBrains Mono caps (10/500, or 700), cut with an ellipsis. */
function MonoLine({ children, color, size = 10, bold, style }: { children: React.ReactNode; color: string; size?: number; bold?: boolean; style?: object }) {
  return (
    <Text variant="mono" color={color} numberOfLines={1} style={[{ fontSize: size, lineHeight: Math.round(size * 1.3), textTransform: 'uppercase' }, bold ? { fontFamily: monoFonts[700] } : null, style]}>
      {children}
    </Text>
  );
}

/** Bebas Neue, as Display, held to a number of lines. */
function DisplayLines({ children, size, color, lines = 1, style }: { children: React.ReactNode; size: number; color: string; lines?: number; style?: object }) {
  return (
    <Text variant="body" color={color} numberOfLines={lines} style={[{ fontFamily: displayFont, fontSize: size, lineHeight: Math.round(size * 0.95), letterSpacing: +(size * 0.02).toFixed(1), textTransform: 'uppercase' }, style]}>
      {children}
    </Text>
  );
}

/** A card's face at rest: the file tab, result and date, the small score, the money line, faces and paid count. */
function Front({ w, p, onOpen }: { w: WalletGame; p: Palette; onOpen: () => void }) {
  const t = useTheme();
  const unpaid = w.total - w.paid;
  const line = [money(w.g.totalCost), w.each !== null ? `${rupees(w.each)} each` : null, w.g.sideSize ? `${w.g.sideSize}-a-side` : null, unpaid ? `${unpaid} to collect` : 'Settled'].filter(Boolean).join(' · ');
  const allPaid = w.total > 0 && unpaid === 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Match ${pad2(w.number)}, ${stateLine(w.g, w.k)}, ${day(w.g.date)}`} onPress={onOpen} style={{ flex: 1 }}>
      <View style={{ height: 26, flexDirection: 'row' }}>
        <View style={{ width: 124, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: p.bg, justifyContent: 'center', paddingHorizontal: 16 }}>
          <MonoLine color={p.fg} bold>
            Match {pad2(w.number)}
          </MonoLine>
        </View>
        <View style={{ flex: 1, marginTop: 14, borderTopRightRadius: 14, backgroundColor: p.bg }} />
      </View>
      <View style={{ flex: 1, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, backgroundColor: p.bg, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, height: 18 }}>
          <MonoLine color={p.soft} bold style={{ flex: 1 }}>
            {stateLine(w.g, w.k)}
          </MonoLine>
          <MonoLine color={p.fg} bold>
            {day(w.g.date)}
          </MonoLine>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, height: 40 }}>
          <View style={{ width: 96, flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Display size={36} color={p.fg} style={{ lineHeight: 34 }}>
              {w.g.scoreA ?? '–'}
            </Display>
            <Display size={20} color={p.soft}>
              –
            </Display>
            <Display size={36} color={p.fg} style={{ lineHeight: 34 }}>
              {w.g.scoreB ?? '–'}
            </Display>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Crest kit={w.k.A} size={32} />
            <Display size={12} color={p.soft}>
              VS
            </Display>
            <Crest kit={w.k.B} size={32} />
          </View>
          <View style={{ width: 96, alignItems: 'flex-end' }}>
            <DisplayLines size={15} color={p.fg} style={{ textAlign: 'right' }}>
              {w.venue}
            </DisplayLines>
            {w.area ? (
              <MonoLine color={p.soft} size={9}>
                {w.area}
              </MonoLine>
            ) : null}
          </View>
        </View>
        <View style={{ height: 16, justifyContent: 'center' }}>
          <MonoLine color={p.soft}>{line}</MonoLine>
        </View>
        <View style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {w.people.length ? <Faces people={w.people} size={24} max={4} ring={t.c.bg.tile} more={p.soft} /> : null}
          <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: p.chip, justifyContent: 'center' }}>
            <Text variant="labelMicro" color={allPaid ? p.chipLime : p.chipFg}>
              {w.paid} of {w.total} paid
            </Text>
          </View>
          <View style={{ marginLeft: 'auto', width: 32, height: 32, borderRadius: 16, backgroundColor: p.ring, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron-right" size={16} color={p.fg} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** The flipped face: the strip with ×, crests and the big score, scorers, player of the match, Open and share. */
function Back({ w, p, onClose }: { w: WalletGame; p: Palette; onClose: () => void }) {
  const router = useRouter();
  const { share } = useCopyShare();
  const open = () => router.push(`/board/turf/game?game=${w.id}` as never);
  const side = (names: string[], kit: Kit, right: boolean) => (
    <View style={{ flex: 1, minWidth: 0, alignItems: right ? 'flex-end' : 'flex-start' }}>
      <MonoLine color={p.soft} size={9}>
        {kit.name}
      </MonoLine>
      {names.slice(0, 4).map((s) => (
        <View key={s} style={{ flexDirection: right ? 'row-reverse' : 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="target" size={12} color={p.soft} />
          <Text variant="labelMicro" color={p.soft} numberOfLines={1} style={{ lineHeight: 17, flexShrink: 1 }}>
            {s}
          </Text>
        </View>
      ))}
    </View>
  );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open match ${pad2(w.number)}`} onPress={open} style={{ flex: 1, borderRadius: 24, backgroundColor: p.bg, gap: 10, paddingBottom: 14, overflow: 'hidden' }}>
      <View style={{ marginTop: 14, height: 34, backgroundColor: p.strip, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 12 }}>
        <MonoLine color={WHITE} bold style={{ flex: 1 }}>
          {`Match ${pad2(w.number)} · ${day(w.g.date)} · ${w.venue}`}
        </MonoLine>
        <MonoLine color="rgba(255,255,255,0.7)" bold>
          FT
        </MonoLine>
        <Disc icon="x" label="Flip back" size={28} iconSize={14} bg="rgba(255,255,255,0.14)" color={WHITE} onPress={onClose} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <Crest kit={w.k.A} size={40} />
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Display size={72} color={p.fg} style={{ lineHeight: 64 }}>
            {w.g.scoreA ?? '–'}
          </Display>
          <Display size={36} color={p.soft}>
            –
          </Display>
          <Display size={72} color={p.fg} style={{ lineHeight: 64 }}>
            {w.g.scoreB ?? '–'}
          </Display>
        </View>
        <Crest kit={w.k.B} size={40} />
      </View>
      <Display size={13} color={p.soft} style={{ textAlign: 'center' }}>
        {stateLine(w.g, w.k)} · {w.paid} of {w.total} paid
      </Display>
      <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, overflow: 'hidden' }}>
        {side(w.scorersA, w.k.A, false)}
        {side(w.scorersB, w.k.B, true)}
      </View>
      <View style={{ marginTop: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}>
        {w.motm ? <Face id={w.motm.id} name={w.motm.name} size={28} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="labelMicro" color={p.fg} numberOfLines={1} style={{ fontWeight: '700' }}>
            {w.motm ? `POTM · ${w.motm.name}` : 'No player of the match'}
          </Text>
          <Text variant="labelCaps" color={p.soft} numberOfLines={1} style={{ letterSpacing: 0 }}>
            {money(w.g.totalCost)}
            {w.each !== null ? ` · ${rupees(w.each)} each` : ''}
          </Text>
        </View>
        <PillButton title="Open" height={36} bg={p.button} fg={p.buttonFg} onPress={open} />
        {w.text ? <Disc icon="send" label="Share the result" size={36} bg={p.share} color={p.shareFg} onPress={() => share(w.text!)} /> : null}
      </View>
    </Pressable>
  );
}

/**
 * Recent games as a wallet (TF-Home · Recent games): the cards overlap showing
 * their tab and first line; the newest lies open on its result face. Tap a card
 * to open it there, tap the open one to go to the match, × to close it.
 */
export function Wallet({ games }: { games: WalletGame[] }) {
  const t = useTheme();
  const [open, setOpen] = useState<string | null>(games.length ? games[games.length - 1]!.id : null);
  if (!games.length) return null;
  const placed: Array<{ w: WalletGame; top: number; flipped: boolean; z: number }> = [];
  games.forEach((w, i) => {
    const flipped = w.id === open;
    const prev = placed[placed.length - 1];
    const top = prev ? prev.top + (prev.flipped ? BACK_H + 12 : PEEK) : 0;
    placed.push({ w, top, flipped, z: flipped ? games.length + 1 : i + 1 });
  });
  const height = Math.max(...placed.map((c) => c.top + (c.flipped ? BACK_H : FRONT_H)));
  return (
    <View style={{ height }}>
      {placed.map(({ w, top, flipped, z }) => {
        const p = paletteOf(w.g, w.k, { raised: t.c.bg.tileRaised, pill: t.c.bg.dim, lime: t.c.accent.mustard, fg: t.c.fg.primary, soft: t.c.fg.secondary });
        return (
          <View
            key={w.id}
            style={[
              { position: 'absolute', left: 0, right: 0, top, height: flipped ? BACK_H : FRONT_H, zIndex: z, elevation: flipped ? 16 : 4 + z, shadowColor: '#000' },
              flipped ? { shadowOpacity: 0.55, shadowRadius: 24, shadowOffset: { width: 0, height: 24 }, borderRadius: 24 } : { shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: -6 } },
            ]}
          >
            {flipped ? <Back w={w} p={p} onClose={() => setOpen(null)} /> : <Front w={w} p={p} onOpen={() => setOpen(w.id)} />}
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* To check, on Home                                                   */
/* ------------------------------------------------------------------ */

const CARDS: Record<string, React.ComponentType<{ filing: Filing }>> = { 'turf-payment': SmsPaidCard, 'turf-payment-ask': SmsAskCard, 'turf-submission': SubmissionCard };
const HOME_CARDS = 2;

/** Turf's own To check items (and a Yes still sending), the first two as cards. */
function TurfToCheck() {
  const t = useTheme();
  const router = useRouter();
  const items = useLive((o) => {
    const sending = answeredAsks()
      .map((id) => o.filings.get(id))
      .filter((f): f is Filing => !!f && f.checked && !!(f.before as unknown as SmsAsk | null)?.appearanceIds?.some((a) => isSending(o, a)));
    return [...sending, ...o.filings.toCheck().filter((f) => CARDS[f.kind])];
  }, []);
  if (!items.length) return null;
  return (
    <>
      {items.slice(0, HOME_CARDS).map((f) => React.createElement(CARDS[f.kind]!, { key: f.id, filing: f }))}
      {items.length > HOME_CARDS ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/check' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4 }}>
          <Text variant="caption" color={t.c.accent.gold} style={{ fontWeight: '700' }}>
            {items.length - HOME_CARDS} more in To check
          </Text>
          <Icon name="chevron-right" size={14} color={t.c.accent.gold} />
        </Pressable>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Home                                                                */
/* ------------------------------------------------------------------ */

export function TurfHome(_props: Props) {
  const router = useRouter();
  const back = useBack();
  const { busy, pull } = usePull();
  const data = useLive((o) => {
    const games = allGames(o);
    if (!games.length && !allPlayers(o).length) return null;
    const today = todayIso();
    const played = games.filter((g) => !isUpcoming(g.data, today));
    const byId = new Map(games.map((g) => [g.id, g.data]));
    let collected = 0;
    let paidShares = 0;
    for (const a of allAppearances(o)) {
      const g = byId.get(a.data.gameId);
      if (!g) continue;
      const share = cents(a.data.share);
      const fronted = a.data.personId === g.frontedById;
      const paidIn = a.data.paid && !(a.data.amountPaid ?? 0) ? share : cents(a.data.amountPaid);
      collected += fronted ? share : Math.min(share, Math.max(0, paidIn));
      if (fronted || isPaid(a.data, g)) paidShares++;
    }
    const dates = games.map((g) => g.data.date).sort();
    const d = turfDues(o);
    return { total: games.length, played: played.length, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null, collected, paidShares, d, owing: d.people.filter((p) => p.direction !== 'owes_other'), wallet: walletGames(o) };
  }, []);

  let body: React.ReactNode;
  if (!data) body = <NotConnected />;
  else {
    const month = (iso: string) => format(at(iso), 'MMM');
    const span = data.first && data.last ? (month(data.first) === month(data.last) ? month(data.first) : `${month(data.first)} – ${month(data.last)}`) : 'none yet';
    body = (
      <>
        <SectionHead title="Money at a glance" meta="Season" />
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatTile label="Games · season" value={String(data.total)} sub={span} onPress={() => router.push('/board/turf/games' as never)} />
            <StatTile label="Collected" value={rupees(data.collected)} sub={plural(data.paidShares, 'share')} onPress={() => router.push('/board/turf/dues' as never)} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <StatTile label="Outstanding" value={rupees(data.d.owedToYou.totalCents)} sub={plural(data.d.owedToYou.people, 'person', 'people')} accent onPress={() => router.push('/board/turf/dues' as never)} />
            <StatTile label="Played" value={String(data.played)} sub={data.total ? `of ${data.total} · ${Math.round((data.played / data.total) * 100)}%` : null} onPress={() => router.push('/board/turf/games' as never)} />
          </View>
        </View>
        <SectionHead title="Next match" />
        <Poster />
        <TurfToCheck />
        {data.wallet.length ? (
          <>
            <SectionHead title="Recent games" action="All" onAction={() => router.push('/board/turf/games' as never)} />
            <Wallet key={data.wallet.map((w) => w.id).join()} games={data.wallet} />
          </>
        ) : null}
        <SectionHead title="Who still owes" action={data.owing.length ? `See all ${data.owing.length}` : undefined} onAction={() => router.push('/board/turf/dues' as never)} />
        <TurfCard gap={10}>
          {data.owing.length ? (
            <>
              <DueRows people={data.owing.slice(0, 4)} pull={pull} />
              <CopyAllRow height={40} />
            </>
          ) : (
            <Text variant="caption" color="secondary">
              Nobody owes anything. Every share is paid.
            </Text>
          )}
        </TurfCard>
        <TurfChanges />
      </>
    );
  }
  return (
    <Screen title="Turf" subtitle="Browse › Boards" onBack={back} right={<HeaderRight />} refreshControl={<RefreshControl refreshing={busy} onRefresh={() => void pull()} />}>
      <Switcher active="index" />
      {body}
    </Screen>
  );
}

export /** What waits for Turf web and what it refused, on Home; nothing when all is sent. */
function TurfChanges() {
  const os = useOS();
  const c = useLive((o) => ({ ...turfChanges(o), connected: !!turfBase(o) }), []);
  if (!c.sending.length && !c.refused.length) return null;
  return (
    <>
      {c.sending.length ? (
        <Section title="Sending" meta={!c.connected ? 'Turf web isn’t connected' : c.sending[0]!.error ? 'Waiting to connect' : undefined}>
          <RowList>
            {c.sending.map((i) => (
              <RowItem key={i.id} icon="refresh" tint={TINT} title={i.label} subtitle={i.error ?? (c.connected ? 'On its way to Turf web' : 'Waits here until you connect Turf web')} />
            ))}
          </RowList>
        </Section>
      ) : null}
      {c.refused.length ? (
        <Section title="Not sent" meta="Turf web said no">
          <RowList>
            {c.refused.map((i) => (
              <RowItem key={i.id} icon="warning" tint={TINT} title={i.label} subtitle={i.error} meta="Dismiss" metaTone="alert" onPress={() => os.outbox.dismiss(i.id)} />
            ))}
          </RowList>
        </Section>
      ) : null}
    </>
  );
}
