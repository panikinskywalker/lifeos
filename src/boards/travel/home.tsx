import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Rect } from 'react-native-svg';
import { answerNudge } from '@core/brain/runner';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks, gradients } from '@ui/theme/tokens';
import { Button, Icon, niceMax, ProgressBar, Screen, Text, type IconName } from '@ui/kit';
import { hasPacked, nextTrip, packingList, tripBookings, tripDays, tripPhase, trips, tripSpend } from '@modules/travel';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { AddTrip, bookedWords, CARD_GLOWS, Chip28, companions, dayLabel, datesLabel, Disc, GlassPill, INK, Note, onPhoto, PillButton, plural, Row, RowCard, routes, SectionHead, SerifName, slashDates, StatCard, TripPhoto, weekdayLong, whenShort, WHITE, withLine } from './parts';

/**
 * The Travel home (NR-Travel-Home, the board's index; NR-Travel-Empty with no
 * trips): the next trip on its photo, the year in two numbers, Before you go
 * (Pack, then what the brain filed for this trip), Coming up, Budget used,
 * and what each trip this year cost.
 */

const DAY = 86_400_000;
const FRIDGE = /\b(use|eat|cook|fridge|finish)\b/i;
const ORDER = /\b(order|grocer|skip|pause|deliver)/i;
const PEOPLE = /\b(tell|squad|match|team|message)\b/i;

/** The icon and colour a line from Claude's list reads as. */
function lineLook(line: string): { icon: IconName; color: string } {
  if (FRIDGE.test(line)) return { icon: 'fridge', color: blocks.mint };
  if (ORDER.test(line)) return { icon: 'cart', color: blocks.yellow };
  if (PEOPLE.test(line)) return { icon: 'people', color: blocks.sky };
  return { icon: 'check-circle', color: blocks.lilac };
}

export function TravelHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const [, bump] = useState(0);
  const d = useLive((os) => {
    const now = Date.now();
    const all = trips(os);
    const year = String(new Date(now).getFullYear());
    const thisYear = all.filter((x) => x.data.startDate?.startsWith(year));
    const spendOf = new Map(thisYear.map((x) => [x.id, tripSpend(os, x, now)]));
    const spent = (id: string) => spendOf.get(id)?.spent ?? 0;
    const next = nextTrip(os, now);
    const done = thisYear.filter((x) => tripPhase(x.data, now) === 'back');
    const ahead = thisYear.filter((x) => tripPhase(x.data, now) !== 'back');
    const budgeted = [...ahead, ...[...done].reverse()].filter((x) => x.data.budget);
    let hero = null;
    if (next) {
      const bookings = tripBookings(os, next.id);
      const list = packingList(os, next);
      const nudges = (os.brain?.nudges.since(now - 14 * DAY) ?? []).filter((n) => {
        const p = (n.payload ?? {}) as { tripId?: string; eventId?: string; what?: string };
        return n.module === 'travel' && n.state === 'open' && p.what !== 'pack' && p.what !== 'back' && (p.tripId === next.id || bookings.some((b) => b.id === p.eventId));
      });
      const learned = os.brain?.learned.get<string[] | string>(`travel:beforelist:${next.id}:${next.data.startDate}`);
      hero = {
        trip: next,
        cover: os.attachments.cover(next.id)?.uri ?? null,
        bookings,
        people: companions(os, next),
        packed: hasPacked(os, next),
        days: tripDays(next.data) ?? list.days,
        packLine: list.line.split(' · ').pop() ?? '',
        away: tripPhase(next.data, now) === 'away',
        flight: bookings.find((b) => b.kind === 'flight' && b.startAt > now) ?? null,
        nudges,
        lines: Array.isArray(learned) ? learned : learned ? [learned] : [],
      };
    }
    return {
      count: all.length,
      year,
      hero,
      total: thisYear.length,
      doneCount: done.length,
      aheadCount: ahead.length,
      spentAll: thisYear.reduce((n, x) => n + spent(x.id), 0),
      coming: all
        .filter((x) => x.data.startDate && tripPhase(x.data, now) !== 'back')
        .slice(0, 4)
        .map((x) => ({ trip: x, people: companions(os, x), when: whenShort(x.data, now) })),
      budget: budgeted.map((x) => ({ id: x.id, title: x.title, budget: x.data.budget!, spent: spent(x.id) })),
      costs: done.slice(-6).map((x) => ({ id: x.id, label: x.data.destination, spent: spent(x.id) })),
    };
  }, []);
  const money = (n: number) => ctx.format.currency(Math.round(n));
  const open = (id: string) => router.push(routes.trip(id) as never);
  const add = () => router.push(routes.newTrip as never);
  const hero = d.hero;
  const when = hero ? whenShort(hero.trip.data) : null;
  const caption = `${hero ? `${hero.trip.data.destination} ${when ?? ''}`.trim() : 'No trip planned'} · ${plural(d.total, 'trip')} this year`;

  const top = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 0 }}>
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text variant="caption" color="secondary" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{caption}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="title" accessibilityRole="header">Travel</Text>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: gradients.travel[0] }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {d.count ? <ToCheckBell /> : null}
        <AddTrip onPress={add} />
      </View>
    </View>
  );

  if (!d.count) {
    return (
      <Screen contentStyle={{ gap: 24 }}>
        {top}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatCard label="NEXT TRIP" value="·" quiet />
          <StatCard label={`SPENT IN ${d.year}`} value={money(0)} />
        </View>
        <View style={{ paddingVertical: 28, paddingHorizontal: 22, borderRadius: 28, backgroundColor: t.c.bg.tile, alignItems: 'center', gap: 16 }}>
          <Tickets />
          <Text accessibilityRole="header" style={{ fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' }}>No trips planned</Text>
          <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '500', color: t.c.fg.secondary, textAlign: 'center' }}>Tickets from Gmail and dumps add them. A flight to Goa makes “Trip to Goa” and files the ticket in it.</Text>
          <View style={{ alignSelf: 'stretch', gap: 8, paddingTop: 4 }}>
            <Button title="Add a trip" icon="plus" block onPress={add} />
            <Pressable accessibilityRole="button" onPress={() => router.push('/settings/email' as never)} style={({ pressed }) => ({ height: 52, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
              <Icon name="inbox" size={17} color={t.c.accent.gold} />
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>Connect Gmail</Text>
            </Pressable>
          </View>
        </View>
        <View style={{ gap: 10 }}>
          <Text variant="labelCaps" color="secondary" accessibilityRole="header" style={{ paddingHorizontal: 4 }}>OR SAY IT IN THE DUMP</Text>
          <View style={{ gap: 8 }}>
            {['“Plan Kyoto in late December with Priya, ₹2L budget”', '“Goa 20 to 24 Dec with the Goa group, book flights and a villa”'].map((line) => (
              <View key={line} style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.c.bg.tile }}>
                <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '500' }}>{line}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, paddingHorizontal: 4 }}>Each makes the trip, with a to-do for every thing to book.</Text>
        </View>
        <Note icon="lock">Booking mails are read on this phone. LifeOS keeps the flight or the stay and the mail’s subject line, nothing more.</Note>
      </Screen>
    );
  }

  /** Claude's lines you have ticked, kept per trip. */
  const doneKey = hero ? `travel.beforeDone.${hero.trip.id}` : '';
  const ticked = hero ? ctx.settings.get<string[]>(doneKey, []) : [];
  const tick = (line: string) => {
    ctx.settings.set(doneKey, [...ticked, line]);
    bump((n) => n + 1);
  };
  const act = (id: string) => {
    const r = answerNudge(ctx, id, 'yes');
    if (r?.open) {
      if (/^[a-z]+:/i.test(r.open)) void Linking.openURL(r.open);
      else router.push(r.open as never);
    }
  };
  const lines = hero ? hero.lines.filter((l) => !ticked.includes(l)) : [];
  const nudges = hero ? hero.nudges.filter((n) => !(lines.length && (n.payload as { what?: string }).what === 'before')) : [];
  const showPack = !!hero && !hero.away && !hero.packed;
  const showBefore = !!hero && !hero.away && (showPack || lines.length > 0 || nudges.length > 0);

  return (
    <Screen contentStyle={{ gap: 24 }}>
      {top}

      {hero ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${hero.away ? 'Away now' : 'Next trip'}: ${hero.trip.data.destination}, ${datesLabel(hero.trip.data)}`} onPress={() => open(hero.trip.id)} style={({ pressed }) => ({ height: 184, borderRadius: 24, overflow: 'hidden', padding: 12, opacity: pressed ? 0.92 : 1 })}>
          <TripPhoto uri={hero.cover} glows={CARD_GLOWS} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            {hero.trip.data.startDate ? <Chip28 tone="lime" label={dayLabel(hero.trip.data.startDate)} /> : <View />}
            {hero.people.length ? <GlassPill icon="people" label={`${hero.people.length + 1} going`} /> : null}
          </View>
          <View style={{ marginTop: 'auto', gap: 2 }}>
            <Text style={onPhoto.caps}>{hero.away ? 'AWAY NOW' : 'NEXT TRIP'}{when ? ` · ${when.toUpperCase()}` : ''}</Text>
            <SerifName size={40}>{hero.trip.data.destination}</SerifName>
            <Text numberOfLines={1} style={onPhoto.line}>{[datesLabel(hero.trip.data), bookedWords(hero.bookings)].filter(Boolean).join(' · ')}</Text>
          </View>
        </Pressable>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <StatCard label={`TRIPS IN ${d.year}`} value={String(d.total)} line={`${d.doneCount} done · ${d.aheadCount} coming up`} />
        <StatCard label={`SPENT IN ${d.year}`} value={money(d.spentAll)} line="payments linked to trips" />
      </View>

      {showBefore && hero ? (
        <View style={{ gap: 10, minWidth: 0 }}>
          <SectionHead
            title="Before you go"
            sub={hero.flight ? `You fly to ${hero.trip.data.destination} on ${weekdayLong(hero.flight.startAt)}` : `${hero.trip.data.destination} ${when ?? ''}`.trim()}
            right={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 24, paddingHorizontal: 9, borderRadius: 999, backgroundColor: t.c.accent.mustardSoft }}>
                <Icon name="sparkle" size={12} color={t.c.accent.gold} />
                <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.accent.gold }}>LifeOS</Text>
              </View>
            }
          />
          <RowCard>
            {showPack ? <Row lead={<Disc icon="bag" color={t.tints.travel.ink} />} title={`Pack for ${plural(hero.days, 'day')}`} sub={hero.packLine} trailing={<PillButton title="Pack" tone="lime" onPress={() => router.push(routes.pack(hero.trip.id) as never)} />} /> : null}
            {nudges.map((n) => (
              <Row key={n.id} lead={<Disc icon={(n.payload as { what?: string }).what === 'checkin' ? 'plane' : 'check-circle'} color={t.tints.travel.ink} />} title={n.line} lines={2} trailing={n.yes ? <PillButton title={n.yes} onPress={() => act(n.id)} /> : null} />
            ))}
            {lines.map((line) => {
              const look = lineLook(line);
              return <Row key={line} lead={<Disc icon={look.icon} color={look.color} />} title={line} lines={2} trailing={<Tick label={line} onPress={() => tick(line)} />} />;
            })}
            {hero.lines.length ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 2, paddingTop: 4, paddingBottom: 2 }}>
                <Icon name="lock" size={14} color={t.c.fg.secondary} />
                <Text style={{ flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '500', color: t.c.fg.secondary }}>Claude saw the trip and what else is coming up. Never your mail.</Text>
              </View>
            ) : null}
          </RowCard>
        </View>
      ) : null}

      <View style={{ gap: 10, minWidth: 0 }}>
        <SectionHead title="Coming up" sub="Tickets from Gmail and dumps add them" action="All trips" chevron onAction={() => router.push(routes.all as never)} />
        <RowCard>
          {d.coming.length ? (
            d.coming.map(({ trip, people, when: w }) => (
              <Row key={trip.id} lead={<Disc icon="plane" color={t.tints.travel.ink} />} title={trip.title} sub={[slashDates(trip.data), withLine(people)].filter(Boolean).join(' · ')} trailing={w ? <Chip28 tone={trip.id === hero?.trip.id ? 'soft' : 'quiet'} label={w} /> : null} onPress={() => open(trip.id)} />
            ))
          ) : (
            <Row lead={<Disc icon="plane" color={t.tints.travel.ink} />} title="No trips planned" sub="Add one, or tell the Dump" onPress={add} />
          )}
        </RowCard>
      </View>

      {d.budget.length ? (
        <View style={{ gap: 10, minWidth: 0 }}>
          <SectionHead title="Budget used" sub="What each trip cost against its budget" />
          <View style={{ padding: 18, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 18 }}>
            {d.budget.map((b) => {
              const over = b.spent > b.budget;
              return (
                <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`${b.title}, ${money(b.spent)} of ${money(b.budget)}${over ? ', over' : ''}`} onPress={() => open(b.id)} style={({ pressed }) => ({ gap: 8, minHeight: 44, justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, lineHeight: 19, fontWeight: '600' }}>{b.title}</Text>
                    <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: over ? '600' : '500', color: over ? t.c.alert.coralText : t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{money(b.spent)} of {money(b.budget)}{over ? ' · over' : ''}</Text>
                  </View>
                  <ProgressBar value={b.spent / b.budget} height={10} color={over ? t.c.alert.coralText : t.c.accent.mustard} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {d.costs.length ? <CostBlock year={d.year} costs={d.costs} total={money(d.costs.reduce((n, c) => n + c.spent, 0))} onOpen={open} /> : null}
      <View style={{ height: 8 }} />
    </Screen>
  );
}

function Tick({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Done: ${label}`} onPress={onPress} hitSlop={2} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: pressed ? 0.75 : 1 })}>
      <Icon name="check" size={18} color={t.c.accent.gold} />
    </Pressable>
  );
}

/** Two tickets, one tilted over the other. */
function Tickets() {
  const t = useTheme();
  return (
    <View accessible={false} style={{ width: 120, height: 92 }}>
      <View style={{ position: 'absolute', left: 8, top: 16, width: 76, height: 62, borderRadius: 12, backgroundColor: t.c.bg.tileRaised, transform: [{ rotate: '-8deg' }] }} />
      <View style={{ position: 'absolute', left: 36, top: 6, width: 76, height: 62, borderRadius: 12, backgroundColor: WHITE, transform: [{ rotate: '6deg' }], padding: 9, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: gradients.travel[0] }} />
          <View style={{ height: 4, flex: 1, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.14)' }} />
        </View>
        <View style={{ height: 3, width: '80%', borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.14)' }} />
        <View style={{ marginTop: 'auto', opacity: 0.6 }}>
          <Svg width="100%" height={10}>
            {Array.from({ length: 15 }, (_, i) => <Rect key={i} x={i * 4} y={0} width={2} height={10} fill={INK} />)}
          </Svg>
        </View>
      </View>
    </View>
  );
}

const CHART = 150;
const k = (n: number) => (n >= 100_000 ? `${+(n / 100_000).toFixed(1)}L` : n >= 1000 ? `${+(n / 1000).toFixed(1)}k` : String(n));

/** The orange block: what each trip this year cost, the latest bar in white. */
function CostBlock({ year, costs, total, onOpen }: { year: string; costs: Array<{ id: string; label: string; spent: number }>; total: string; onOpen: (id: string) => void }) {
  const top = niceMax(Math.max(...costs.map((c) => c.spent), 1));
  const faint = 'rgba(11,11,13,0.62)';
  const label = { fontSize: 10, lineHeight: 13, fontWeight: '600' } as const;
  return (
    <View style={{ padding: 16, borderRadius: 28, backgroundColor: blocks.orange, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text variant="labelCaps" color={INK} numberOfLines={1} accessibilityRole="header" style={{ flex: 1 }}>TRIPS IN {year} · WHAT EACH COST</Text>
        <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: INK, justifyContent: 'center' }}>
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: WHITE }}>{costs.length} done</Text>
        </View>
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 38, lineHeight: 39, fontWeight: '700', letterSpacing: -1.5, color: INK, fontVariant: ['tabular-nums'] }}>{total}</Text>
      <View style={{ flexDirection: 'row' }} accessibilityRole="image" accessibilityLabel={costs.map((c) => `${c.label} ${Math.round(c.spent)} rupees`).join(', ')}>
        <View style={{ width: 28, height: CHART }}>
          <Text style={[label, { color: faint, position: 'absolute', top: -6 }]}>{k(top)}</Text>
          <Text style={[label, { color: faint, position: 'absolute', top: CHART / 2 - 6 }]}>{k(top / 2)}</Text>
          <Text style={[label, { color: faint, position: 'absolute', bottom: -6 }]}>0</Text>
        </View>
        <View style={{ flex: 1, flexDirection: 'row', gap: costs.length > 4 ? 8 : 16 }}>
          {costs.map((c, i) => {
            const last = i === costs.length - 1;
            return (
              <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`Open ${c.label}`} onPress={() => onOpen(c.id)} style={{ flex: 1, minWidth: 0, gap: 6, alignItems: 'center' }}>
                <View style={{ alignSelf: 'stretch', height: CHART, borderRadius: 12, backgroundColor: 'rgba(11,11,13,0.18)', justifyContent: 'flex-end' }}>
                  <View style={{ height: Math.max(c.spent ? 6 : 0, (c.spent / top) * CHART), borderRadius: 12, backgroundColor: last ? WHITE : INK }} />
                </View>
                <Text numberOfLines={1} style={[label, { color: last ? INK : 'rgba(11,11,13,0.72)' }]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}
