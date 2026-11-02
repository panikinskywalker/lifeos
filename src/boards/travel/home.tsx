import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, EmptyState, IconButton, RowItem, Screen, Section, Text } from '@ui/kit';
import { hasPacked, nextTrip, packingList, tripBookings, tripPhase, trips, tripSpend } from '@modules/travel';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { BookingRow, datesLabel, SpendBlock, TINT, whenLabel } from './parts';

/**
 * The Travel home (the board's index; a first pass from the kit until
 * NR-Travel-Home, laid out as docs/design/TRAVEL-BRIEF.md screen 1): the trip
 * you are on or the next one (when, spend vs budget, its flights and stays,
 * Pack), then the trips coming up, then the ones done with what each cost.
 */

export function TravelHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const d = useLive((os) => {
    const now = Date.now();
    const all = trips(os);
    const next = nextTrip(os, now);
    return {
      next: next ? { trip: next, spend: tripSpend(os, next, now), bookings: tripBookings(os, next.id), packed: hasPacked(os, next), line: packingList(os, next).line, away: tripPhase(next.data, now) === 'away' } : null,
      upcoming: all.filter((x) => x.id !== next?.id && tripPhase(x.data, now) !== 'back'),
      past: all
        .filter((x) => tripPhase(x.data, now) === 'back')
        .reverse()
        .slice(0, 10)
        .map((x) => ({ trip: x, spend: tripSpend(os, x, now) })),
      count: all.length,
    };
  }, []);
  const open = (id: string) => router.push(`/entity/trip/${id}` as never);
  const right = (
    <>
      <ToCheckBell />
      <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel="New trip" onPress={() => router.push('/entity/trip/new' as never)} />
    </>
  );
  const header = { title: 'Travel', subtitle: d.next ? `${d.next.trip.data.destination} ${whenLabel(d.next.trip.data) ?? ''}`.trim() : `${d.count} ${d.count === 1 ? 'trip' : 'trips'}`, right, onBack: () => (router.canGoBack() ? router.back() : router.replace('/browse' as never)) };

  if (!d.count) {
    return (
      <Screen {...header}>
        <EmptyState icon="plane" tint={TINT} title="No trips yet" line="Turn on Gmail in Data sources and your IndiGo, Air India, MakeMyTrip, Booking.com and Airbnb mails make trips on their own. Or plan one." action="Plan a trip" onAction={() => router.push('/entity/trip/new' as never)} />
      </Screen>
    );
  }

  return (
    <Screen {...header} contentStyle={{ gap: 14 }}>
      {d.next ? (
        <Section title={d.next.away ? 'Away now' : 'Next trip'}>
          <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 12 }}>
            <RowItem icon="plane" tint={TINT} title={d.next.trip.title} subtitle={datesLabel(d.next.trip.data)} value={whenLabel(d.next.trip.data)} chevron onPress={() => open(d.next!.trip.id)} />
            <SpendBlock s={d.next.spend} ctx={ctx} />
            {d.next.bookings.slice(0, 4).map((b) => <BookingRow key={b.id} b={b} onPress={() => router.push(`/entity/event/${b.id}` as never)} />)}
            {!d.next.away || !d.next.packed ? (
              <View style={{ gap: 6 }}>
                <Button title={d.next.packed ? 'Packing list' : 'Pack'} icon="bag" variant={d.next.packed ? 'secondary' : 'primary'} onPress={() => router.push({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'pack', trip: d.next!.trip.id } } as never)} />
                {!d.next.packed ? <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, paddingHorizontal: 4 }}>{d.next.line}</Text> : null}
              </View>
            ) : null}
          </View>
        </Section>
      ) : null}

      {d.upcoming.length ? (
        <Section title="Coming up" meta={String(d.upcoming.length)}>
          {d.upcoming.map((x) => <RowItem key={x.id} icon="plane" tint={TINT} title={x.title} subtitle={datesLabel(x.data)} value={whenLabel(x.data)} chevron onPress={() => open(x.id)} />)}
        </Section>
      ) : null}

      {d.past.length ? (
        <Section title="Been" meta={String(d.past.length)}>
          {d.past.map(({ trip, spend }) => (
            <RowItem key={trip.id} icon="plane" tint={TINT} title={trip.title} subtitle={datesLabel(trip.data)} value={ctx.format.currency(Math.round(spend.spent))} strong valueTone={spend.over ? 'alert' : 'default'} meta={spend.budget ? `of ${ctx.format.currency(spend.budget)}` : null} onPress={() => open(trip.id)} />
          ))}
        </Section>
      ) : null}
      <View style={{ height: 8 }} />
    </Screen>
  );
}
