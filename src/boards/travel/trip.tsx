import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Chip, RowItem, Section, Text, useToast } from '@ui/kit';
import { addToTrip, backHome, hasPacked, packingList, spentWhileAway, stillPacked, tripBookings, tripDays, tripPhase, tripSpend, tripsTo, type TripData } from '@modules/travel';
import { BookingRow, datesLabel, Hint, SpendBlock, TINT, whenLabel } from './parts';

/**
 * The Trip page (R7d; a first pass until NR-Travel-Trip): on top, when and
 * how long, spend vs budget and the way into packing; below, its flights and
 * stays, its expenses, and spends from those days to add. Plus *Trips here*
 * on a Place's page. All read through Links.
 */

type Props = { entity: ObjectRecord<any>; ctx: LifeOSContext }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function TripHero({ entity, ctx }: Props) {
  const router = useRouter();
  const toast = useToast();
  const t = useTheme();
  const d = useLive(
    (os) => {
      const trip = os.records.get<TripData>(entity.id);
      if (!trip) return null;
      return { trip, spend: tripSpend(os, trip), packed: hasPacked(os, trip), still: stillPacked(os, trip.id), line: packingList(os, trip).line, place: trip.data.placeId ? os.records.get(trip.data.placeId)?.title ?? null : null };
    },
    [entity.id, entity.version],
  );
  if (!d) return null;
  const { trip } = d;
  const phase = tripPhase(trip.data);
  const days = tripDays(trip.data);
  const when = whenLabel(trip.data);
  const unpack = () => {
    const r = backHome(ctx, trip.id);
    toast.show({ message: `${r.count} in the wash`, icon: 'drop', undo: r.undo });
  };
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        <Chip label={datesLabel(trip.data)} icon="calendar" tint={TINT} />
        {days ? <Chip label={`${days} ${days === 1 ? 'day' : 'days'}`} /> : null}
        {when ? <Chip label={when} tone={phase === 'away' ? 'accent' : 'neutral'} /> : null}
        {d.place ? <Chip label={d.place} icon="location" onPress={() => router.push(`/entity/place/${trip.data.placeId}` as never)} /> : null}
      </View>
      <SpendBlock s={d.spend} ctx={ctx} />
      {phase === 'back' && d.still ? (
        <Button title={`Back home: ${d.still} to the wash`} icon="drop" variant="secondary" onPress={unpack} />
      ) : phase !== 'back' ? (
        <Button title={d.packed ? 'Packing list' : 'Pack'} icon="bag" variant={d.packed ? 'secondary' : 'primary'} onPress={() => router.push({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'pack', trip: trip.id } } as never)} />
      ) : null}
      {phase !== 'back' && !d.packed ? <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, paddingHorizontal: 4 }}>{d.line}</Text> : null}
    </View>
  );
}

export function TripBody({ entity, ctx }: Props) {
  const router = useRouter();
  const toast = useToast();
  const d = useLive(
    (os) => {
      const trip = os.records.get<TripData>(entity.id);
      if (!trip) return null;
      return { trip, bookings: tripBookings(os, trip.id), spend: tripSpend(os, trip), loose: spentWhileAway(os, trip) };
    },
    [entity.id, entity.version],
  );
  if (!d) return null;
  const money = (n: number) => ctx.format.currency(n);
  const open = (id: string, object: string) => router.push(`/entity/${object}/${id}` as never);
  const add = (id: string, title: string) => toast.show({ message: `${title} added to ${d.trip.title}`, icon: 'check', undo: addToTrip(ctx, d.trip.id, id) });
  return (
    <View style={{ gap: 14 }}>
      <Section title="Flights and stays" meta={d.bookings.length ? String(d.bookings.length) : undefined}>
        {d.bookings.length ? d.bookings.map((b) => <BookingRow key={b.id} b={b} onPress={() => open(b.id, 'event')} />) : <Hint>Booking mails from IndiGo, Air India, MakeMyTrip, Booking.com and Airbnb land here on their own.</Hint>}
      </Section>
      <Section title="Expenses" meta={d.spend.count ? money(d.spend.spent) : undefined} action="Add" onAction={() => router.push({ pathname: '/entity/[type]/new', params: { type: 'transaction', tripId: d.trip.id, currency: d.trip.data.localCurrency ?? '' } } as never)}>
        {d.spend.items.length ? (
          d.spend.items.slice(0, 12).map((x) => <RowItem key={x.id} icon="receipt" tint="finance" title={x.title} subtitle={x.data.category ?? null} value={money(x.data.amount ?? 0)} strong meta={x.data.date ? datesLabel({ startDate: x.data.date }) : null} onPress={() => open(x.id, 'transaction')} />)
        ) : (
          <Hint>Nothing on this trip yet. A fare from a booking mail counts on its own; add the rest here.</Hint>
        )}
      </Section>
      {d.loose.length ? (
        <Section title="Spent on those days" meta={String(d.loose.length)}>
          <Hint>On no trip yet. Add the ones that were this trip.</Hint>
          {d.loose.slice(0, 10).map((x) => (
            <RowItem key={x.id} icon="receipt" tint="finance" title={x.title} subtitle={x.data.date ? datesLabel({ startDate: x.data.date }) : null} value={money(x.data.amount ?? 0)} trailing={<Button title="Add" size="sm" variant="secondary" onPress={() => add(x.id, x.title)} />} />
          ))}
        </Section>
      ) : null}
    </View>
  );
}

/** Trips here, on a Place's page (the Trip's *to* Link). */
export function TripsHere({ entity }: Props) {
  const router = useRouter();
  const list = useLive((os) => tripsTo(os, entity.id), [entity.id]);
  if (!list.length) return null;
  return (
    <Section title="Trips here" meta={String(list.length)}>
      {list.map((x) => (
        <RowItem key={x.id} icon="plane" tint={TINT} title={x.title} subtitle={datesLabel(x.data)} meta={whenLabel(x.data)} chevron onPress={() => router.push(`/entity/trip/${x.id}` as never)} />
      ))}
    </Section>
  );
}
