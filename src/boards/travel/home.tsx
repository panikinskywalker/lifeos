import React, { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { ActionSheet, useBottomBarInset, type BottomBarItem } from '@ui/kit';
import { Icon as UiIcon } from '@ui/icons';
import { homeDates, monoDates, travelHomeOf, tripDays, type NextTripCard, type TripRow } from '@modules/travel';
import { Anim, bgImage, JP_SERIF, MONO, Wave } from './jp/kit';
import { C, DotMatrix, Faces, isJapan, money, scriptName, tripRoutes, useShow } from './jp/shell';
import { routes } from './parts';

/**
 * The Travel home (JP-Travel, "Travel · all trips"; the board's index): the
 * next trip on its deep indigo card (its stage, the place in its script, the
 * dot-matrix countdown, what each person is projected to spend against the
 * budget), its most urgent note, the other trips coming up, Start a trip, the
 * trips you have been on with what they cost you, and the year in three
 * numbers, over the app's own bottom bar. With no trips, a calm start.
 */

/** The app's tabs (app/(tabs)/_layout.tsx), drawn as the artboard draws them. */
const TABS: BottomBarItem[] = [
  { key: 'index', label: 'Today', icon: 'sun' },
  { key: 'upkeep', label: 'Upkeep', icon: 'repeat' },
  { key: 'dump', label: 'Dump', icon: 'brain', primary: true },
  { key: 'browse', label: 'Browse', icon: 'grid' },
  { key: 'you', label: 'You', icon: 'user' },
];
const TAB_PATH: Record<string, string> = { index: '/', upkeep: '/upkeep', dump: '/dump', browse: '/browse', you: '/you' };

const SANS = 'PlusJakartaSans_500Medium';
const SEMI = 'PlusJakartaSans_600SemiBold';
const BOLD = 'PlusJakartaSans_700Bold';

const Icon = ({ d, size = 18, color = C.white, children }: { d?: string[]; size?: number; color?: string; children?: React.ReactNode }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {d?.map((x) => <Path key={x} d={x} />)}
    {children}
  </Svg>
);
const Chevron = () => <Icon d={['m9 18 6-6-6-6']} color={C.low} />;

function RoundButton({ label, onPress, bg, children }: { label: string; onPress: () => void; bg: string; children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
      {children}
    </Pressable>
  );
}

/** The bell: what was filed that you have not looked at; opens To check. */
function Bell() {
  const router = useRouter();
  const n = useLive((o) => o.filings.toCheckCount(), []);
  return (
    <View>
      <RoundButton label={n ? `To check, ${n} item${n === 1 ? '' : 's'}` : 'To check'} bg={C.raised} onPress={() => router.push('/check' as never)}>
        <Icon d={['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10.3 21a1.94 1.94 0 0 0 3.4 0']} />
      </RoundButton>
      {n ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.ink, fontSize: 10, fontFamily: BOLD }}>{n > 99 ? '99+' : n}</Text>
        </View>
      ) : null}
    </View>
  );
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <View style={{ paddingTop: 10, paddingHorizontal: 4, gap: 1 }}>
      <Text accessibilityRole="header" numberOfLines={1} style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: SEMI }}>{title}</Text>
      {sub ? <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: SANS }}>{sub}</Text> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* A trip's thumbnail: its cover, else a blurred photo-like gradient   */
/* ------------------------------------------------------------------ */

const PALETTES: Array<{ bg: [string, string, string]; glow: string[] }> = [
  { bg: ['#4A4A24', '#2C2C16', '#121208'], glow: ['#8A9A40', '#C8B050', '#F0E08A'] },
  { bg: ['#4A2A4E', '#2A1830', '#100A14'], glow: ['#8A60C0', '#E0709A', '#FFB08A'] },
  { bg: ['#1C3A5E', '#12263E', '#081220'], glow: ['#5A9AE0', '#9AD0FF', '#9AD0FF'] },
  { bg: ['#1E4A3A', '#12302A', '#081410'], glow: ['#4CC9A0', '#8FE0C0', '#D7F55C'] },
];
const hash = (s: string) => {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
};

function Thumb({ name, uri }: { name: string; uri: string | null }) {
  if (uri) return <Image source={{ uri }} style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0 }} accessibilityIgnoresInvertColors />;
  let h = hash(name);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0), (h % 1000) / 1000);
  const p = PALETTES[hash(name) % PALETTES.length]!;
  const blobs = Array.from({ length: 6 }, (_, i) => ({ size: 8 + Math.round(rnd() * 24), top: -6 + Math.round(rnd() * 40), left: -10 + Math.round(rnd() * 96), color: p.glow[i % p.glow.length]!, o: 0.4 + rnd() * 0.32 }));
  return (
    <View style={{ width: 44, height: 44, borderRadius: 14, overflow: 'hidden', flexShrink: 0 }}>
      <View style={[bgImage(`linear-gradient(180deg, ${p.bg[0]} 0%, ${p.bg[1]} 55%, ${p.bg[2]} 100%)`), { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }]} />
      {blobs.map((b, i) => (
        <View key={i} style={[bgImage(`radial-gradient(closest-side, ${b.color} 0%, ${b.color} 55%, rgba(0,0,0,0) 100%)`), { position: 'absolute', width: b.size, height: b.size, top: b.top, left: `${b.left}%`, borderRadius: b.size / 2, opacity: b.o, filter: 'blur(5px)' } as never]} />
      ))}
    </View>
  );
}

function TripRowView({ row, right, sub, onPress }: { row: TripRow; right: React.ReactNode; sub: string; onPress: () => void }) {
  const cover = useLive((o) => o.attachments.cover(row.trip.id)?.uri ?? null, [row.trip.id]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${row.trip.title}, ${sub}`} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0, minHeight: 56, opacity: pressed ? 0.75 : 1 })}>
      <Thumb name={row.trip.title} uri={cover} />
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: C.white, fontSize: 16, lineHeight: 21, letterSpacing: -0.2, fontFamily: SEMI }}>{row.trip.data.destination || row.trip.title}</Text>
        <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: SANS }}>{sub}</Text>
      </View>
      {right}
    </Pressable>
  );
}

const Card = ({ children, gap = 8 }: { children: React.ReactNode; gap?: number }) => <View style={{ padding: 14, backgroundColor: C.tile, borderRadius: 24, overflow: 'hidden', gap }}>{children}</View>;
const Hair = () => <View style={{ height: 1, backgroundColor: C.line }} />;
const Pill = ({ label }: { label: string }) => (
  <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 999, backgroundColor: C.raised, justifyContent: 'center', flexShrink: 0 }}>
    <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: SEMI }}>{label}</Text>
  </View>
);

/* ------------------------------------------------------------------ */
/* The next trip's card                                                */
/* ------------------------------------------------------------------ */

/** The next trip's card; without `onPress` it is only shown (the view-only trip). */
export function NextCard({ card, people, onPress, label }: { card: NextTripCard; people: string[]; onPress?: () => void; label?: string }) {
  const show = useShow(card.trip);
  const { trip } = card;
  const script = scriptName(trip);
  const name = trip.data.destination || trip.title;
  const away = card.stage === 'travel';
  const board = away ? `D${card.dayOf ?? 1}` : card.days != null ? `${Math.min(card.days, 999)}D` : '';
  const share = card.budget ? Math.min(1, card.projectedEach / card.budget) : 0;
  const over = !!card.budget && card.projectedEach > card.budget;
  return (
    <Anim k="jr" delay={50} style={{ minWidth: 0 }}>
      <Pressable
        accessibilityRole={onPress ? 'button' : 'summary'}
        disabled={!onPress}
        accessibilityLabel={`${away ? 'Away now' : 'Next trip'}: ${name}, ${monoDates(trip.data).toLowerCase()}, ${card.stage}`}
        onPress={onPress}
        style={({ pressed }) => [bgImage('linear-gradient(170deg,#24306A 0%,#141A3C 55%,#0D0F1E 100%)'), { backgroundColor: '#141A3C', gap: 12, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 52, borderRadius: 32, overflow: 'hidden', opacity: pressed ? 0.92 : 1 }]}
      >
        {isJapan(trip) ? (
          <Anim k="jwave" pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 52 }}>
            <View style={{ height: 24, overflow: 'hidden' }}>
              <Wave />
            </View>
          </Anim>
        ) : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ height: 26, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center' }}>
            <Text numberOfLines={1} style={{ color: C.white, fontSize: 12, lineHeight: 16, fontFamily: SEMI }}>{label ?? (away ? 'Away now' : 'Next trip')} · {card.stage}</Text>
          </View>
          <Faces names={people} ring="#151B38" />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            {script ? (
              <>
                <Text style={{ color: C.white, fontSize: 56, lineHeight: 58, letterSpacing: 3, fontFamily: JP_SERIF, fontWeight: '800' }}>{script}</Text>
                <Text numberOfLines={1} style={{ marginTop: 2, color: C.white, fontSize: 20, fontFamily: BOLD }}>{name}</Text>
              </>
            ) : (
              <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6} style={{ color: C.white, fontSize: 44, lineHeight: 48, letterSpacing: -1, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{name}</Text>
            )}
            <Text numberOfLines={1} style={{ marginTop: 4, color: 'rgba(255,255,255,0.75)', fontSize: 11, letterSpacing: 3, fontFamily: MONO }}>{monoDates(trip.data)}</Text>
          </View>
          {board ? <DotMatrix text={board} pitch={4.2} label={away ? `Day ${card.dayOf}` : `${card.days} days to go`} /> : null}
        </View>
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ flexShrink: 1, color: C.white, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: BOLD }}>{show(card.projectedEach, true)} projected each</Text>
            <View style={{ flexGrow: 1 }} />
            {card.budget ? <Text style={{ color: over ? C.coral : 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: SEMI }}>of {show(card.budget, true)}</Text> : null}
          </View>
          {card.budget ? (
            <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.16)', overflow: 'hidden' }}>
              <Anim k="jbar" style={{ width: `${Math.round(share * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: over ? C.coral : C.lime }} />
            </View>
          ) : null}
        </View>
      </Pressable>
    </Anim>
  );
}

const NOTE_LOOK: Record<string, { disc: string; bg: string }> = {
  urgent: { disc: '#FF5C47', bg: 'rgba(255,92,71,0.18)' },
  high: { disc: C.amber, bg: 'rgba(246,181,71,0.16)' },
};

function NoteStrip({ card, onPress }: { card: NextTripCard; onPress: () => void }) {
  const note = card.note!;
  const look = NOTE_LOOK[note.priority] ?? { disc: C.raised, bg: C.tile };
  const sub = card.moreNotes ? `and ${card.moreNotes} more` : note.body;
  const plain = !NOTE_LOOK[note.priority];
  return (
    <Anim k="jr" delay={110}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${note.title}${sub ? `, ${sub}` : ''}`} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 22, backgroundColor: look.bg, opacity: pressed ? 0.8 : 1 })}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: look.disc, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} color={plain ? C.white : C.ink} d={['M12 8v4', 'M12 16h.01']}>
            <Circle cx={12} cy={12} r={10} />
          </Icon>
        </View>
        <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: C.white, fontSize: 15, fontFamily: BOLD }}>{note.title}</Text>
          {sub ? <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' }}>{sub}</Text> : null}
        </View>
        <Chevron />
      </Pressable>
    </Anim>
  );
}

function StartTrip({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Start a trip" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 24, backgroundColor: C.tile, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon d={['M5 12h14', 'M12 5v14']} color={C.lime} />
      </View>
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: SEMI }}>Start a trip</Text>
        <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: SANS }}>stops, people, dates · the same five sections</Text>
      </View>
      <Chevron />
    </Pressable>
  );
}

function YearTile({ year, trips, nights, spent }: { year: number; trips: number; nights: number; spent: number }) {
  const cell = (label: string, value: string) => (
    <View key={label} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 4, minWidth: 0 }}>
      <Text style={{ color: C.low, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontFamily: SEMI }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ color: C.white, fontSize: 22, lineHeight: 26, letterSpacing: -0.5, fontVariant: ['tabular-nums'], fontFamily: BOLD }}>{value}</Text>
    </View>
  );
  return (
    <View accessible accessibilityLabel={`${year}: ${trips} trips, ${nights} nights, ${money(spent)} spent`} style={{ flexDirection: 'row', gap: 12, padding: 16, borderRadius: 24, backgroundColor: C.tile }}>
      {cell(`TRIPS · ${year}`, String(trips))}
      {cell('NIGHTS', String(nights))}
      {cell('SPENT', money(spent, 'INR', true))}
    </View>
  );
}

/** The app's bottom bar as the artboard draws it: the tab pill at the left edge, the Dump disc at the right. */
function NavBar({ active, onPress }: { active: string; onPress: (key: string) => void }) {
  const insets = useSafeAreaInsets();
  const action = TABS.find((t) => t.primary)!;
  return (
    <View accessibilityRole="tablist" pointerEvents="box-none" style={{ position: 'absolute', left: 20, right: 20, bottom: insets.bottom + 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 6, borderRadius: 999, backgroundColor: C.tile, borderWidth: 1, borderColor: C.line }}>
        {TABS.filter((t) => !t.primary).map((t) => {
          const on = t.key === active;
          return (
            <Pressable key={t.key} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected: on }} onPress={() => onPress(t.key)} style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.lime : pressed ? C.raised : 'transparent' })}>
              <UiIcon name={t.icon} size={22} color={on ? C.ink : C.mid} />
            </Pressable>
          );
        })}
      </View>
      <Pressable accessibilityRole="tab" accessibilityLabel="Dump, tell or ask" onPress={() => onPress(action.key)} style={({ pressed }) => ({ width: 64, height: 64, borderRadius: 32, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 30px rgba(215,245,92,0.25)', transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <UiIcon name={action.icon} size={28} color={C.ink} />
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The screen                                                          */
/* ------------------------------------------------------------------ */

export function TravelHome(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const barInset = useBottomBarInset();
  const [adding, setAdding] = useState(false);
  const d = useLive((os) => {
    const data = travelHomeOf(os);
    const people = data.next ? ['You', ...(data.next.trip.data.personIds ?? []).map((id) => os.records.get(id)?.title ?? '?')] : [];
    return { ...data, people };
  }, []);
  const now = Date.now();
  const open = (id: string) => router.push(tripRoutes.overview(id));
  const newTrip = () => router.push(routes.newTrip as never);
  const importTrip = () => router.push(tripRoutes.import);
  const next = d.next;
  const nextName = next ? next.trip.data.destination || next.trip.title : '';
  const caption = !next
    ? d.count
      ? `${d.count} ${d.count === 1 ? 'trip' : 'trips'} · none coming up`
      : 'No trips yet'
    : next.stage === 'travel'
      ? `${nextName}, day ${next.dayOf} of ${tripDays(next.trip.data) ?? '?'}`
      : next.days === 0
        ? `${nextName} today`
        : next.days === 1
          ? `${nextName} tomorrow`
          : `${nextName} in ${next.days} days`;

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: barInset + 8, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 4 }}>
          <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: SANS }}>{caption}</Text>
            <Text accessibilityRole="header" style={{ color: C.white, fontSize: 28, lineHeight: 32, letterSpacing: -0.6, fontFamily: BOLD }}>Travel</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexShrink: 0 }}>
            <Bell />
            <RoundButton label="New trip or import a trip" bg={C.lime} onPress={() => setAdding(true)}>
              <Icon d={['M5 12h14', 'M12 5v14']} color={C.ink} />
            </RoundButton>
          </View>
        </View>

        {!d.count ? (
          <Anim k="jr" delay={50} style={{ padding: 22, paddingTop: 26, borderRadius: 32, backgroundColor: C.tile, gap: 14, overflow: 'hidden' }}>
            <Text style={{ color: C.mid, fontSize: 10, letterSpacing: 1.5, fontFamily: MONO }}>NO TRIPS YET</Text>
            <Text accessibilityRole="header" style={{ color: C.white, fontSize: 26, lineHeight: 30, letterSpacing: -0.5, fontFamily: BOLD }}>Where to next?</Text>
            <Text style={{ color: C.mid, fontSize: 14, lineHeight: 20, fontFamily: SANS }}>Start a trip with its stops, people and dates, or import one you planned in the trip app. Tickets from Gmail and dumps add bookings to it.</Text>
            <View style={{ gap: 8, paddingTop: 6 }}>
              <Pressable accessibilityRole="button" onPress={newTrip} style={({ pressed }) => ({ height: 52, borderRadius: 999, backgroundColor: C.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.85 : 1 })}>
                <Icon d={['M5 12h14', 'M12 5v14']} color={C.ink} />
                <Text style={{ color: C.ink, fontSize: 15, fontFamily: BOLD }}>Start a trip</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={importTrip} style={({ pressed }) => ({ height: 52, borderRadius: 999, backgroundColor: C.raised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.85 : 1 })}>
                <Icon d={['M12 15V3', 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5']} color={C.lime} />
                <Text style={{ color: C.white, fontSize: 15, fontFamily: SEMI }}>Import a trip</Text>
              </Pressable>
            </View>
          </Anim>
        ) : null}

        {next ? <NextCard card={next} people={d.people} onPress={() => open(next.trip.id)} /> : null}
        {next?.note ? <NoteStrip card={next} onPress={() => open(next.trip.id)} /> : null}

        {d.count ? (
          <>
            {d.coming.length ? (
              <>
                <SectionTitle title="Coming up" />
                <Card>
                  {d.coming.map((r, i) => (
                    <React.Fragment key={r.trip.id}>
                      {i ? <Hair /> : null}
                      <TripRowView row={r} sub={[homeDates(r.trip.data, now), r.stay, r.people > 1 ? `${r.people} people` : null].filter(Boolean).join(' · ')} right={<Pill label={r.days != null ? (r.days === 1 ? 'tomorrow' : `in ${r.days} d`) : r.trip.data.startDate ? 'now' : 'no dates'} />} onPress={() => open(r.trip.id)} />
                    </React.Fragment>
                  ))}
                </Card>
              </>
            ) : null}
            <StartTrip onPress={newTrip} />
            {d.been.length ? (
              <>
                <SectionTitle title="Been" sub="newest first" />
                <Card>
                  {d.been.map((r, i) => (
                    <React.Fragment key={r.trip.id}>
                      {i ? <Hair /> : null}
                      <TripRowView row={r} sub={[homeDates(r.trip.data, now), r.people > 1 ? `${r.people} people` : 'just you'].join(' · ')} right={<Text numberOfLines={1} style={{ color: C.white, fontSize: 16, lineHeight: 21, fontVariant: ['tabular-nums'], fontFamily: BOLD, flexShrink: 0 }}>{r.spent ? money(r.spent) : '·'}</Text>} onPress={() => open(r.trip.id)} />
                    </React.Fragment>
                  ))}
                </Card>
              </>
            ) : null}
            <YearTile {...d.year} />
          </>
        ) : null}
      </ScrollView>
      <NavBar active="browse" onPress={(k) => router.navigate(TAB_PATH[k] as never)} />
      <ActionSheet
        visible={adding}
        onClose={() => setAdding(false)}
        title="Add a trip"
        actions={[
          { label: 'New trip', icon: 'plus', onPress: newTrip },
          { label: 'Import a trip', icon: 'download', onPress: importTrip },
        ]}
      />
    </View>
  );
}
