import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { EmptyState, Icon, Screen, Text } from '@ui/kit';
import { missingCheckIn, moneyOf, payWord, statusOf, stayMoney, stopsOf, tripFlights, tripOthers, tripStays, tripTickets, type TravelEvent, type TripData } from '@modules/travel';
import { datesLabel, dayOf, Note, plural, Row, RowCard, SectionHead, timeOf, WHITE } from './parts';
import { StopDisc } from './plan';

/**
 * Bookings (the trip template, R7g slice 2; JP-Bookings): the flights with
 * each person's ticket, the airports, every stay with what is paid and still
 * to pay (planned and cancelled ones marked), the stays missing a check-in
 * time, and tours, passes and others. Each opens the booking's page.
 */

const SYM: Record<string, string> = { JPY: '¥', INR: '₹', USD: 'US$', EUR: '€', GBP: '£' };
/** "¥61,339", "₹52,463": whole amounts in the booking's currency. */
export const amount = (n: number, cur = 'INR') => `${SYM[cur] ?? `${cur} `}${Math.round(n).toLocaleString(cur === 'INR' ? 'en-IN' : 'en-US')}`;
/** "≈ ₹21,180" from another currency, at the trip's rate. */
export const approxInr = (n: number, cur: string, rate?: number) => (cur === 'INR' ? null : rate ? `≈ ${amount(n * rate, 'INR')}` : null);
export const bookingRoute = (id: string) => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'booking', event: id } });
export const bookingsRoute = (tripId: string) => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'bookings', trip: tripId } });

/** The chip on a booking row: To pay / Part paid / Paid / Planned / Cancelled. */
export function PayChip({ e }: { e: ObjectRecord<TravelEvent> }) {
  const t = useTheme();
  const w = payWord(e);
  const tone = w === 'Paid' || w === 'Confirmed' ? ['rgba(215,245,92,0.16)', '#D7F55C'] : w === 'Part paid' || w === 'Pending' ? ['rgba(246,226,127,0.16)', '#F6E27F'] : w === 'Cancelled' ? ['transparent', t.c.fg.tertiary] : w === 'Planned' ? ['transparent', '#F6E27F'] : [t.c.bg.tileRaised, t.c.fg.secondary];
  return (
    <View style={{ height: 22, paddingHorizontal: 9, borderRadius: 999, backgroundColor: tone[0], borderWidth: w === 'Planned' || w === 'Cancelled' ? 1 : 0, borderStyle: 'dashed', borderColor: tone[1], justifyContent: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: tone[1] }}>{w}</Text>
    </View>
  );
}

export function BookingsScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const [showCancelled, setShowCancelled] = useState(false);
  const d = useLive(
    (os) => {
      const trip = os.records.get<TripData>(params.trip ?? '');
      if (trip?.object !== 'trip') return null;
      const stops = new Map(stopsOf(os, trip.id, ['stop', 'idea', 'airport']).map((s) => [s.id, s]));
      const stays = tripStays(os, trip.id);
      const people = (ids?: string[]) => (ids ?? []).map((id) => os.records.get(id)?.title ?? '').filter(Boolean);
      const name = (who?: string) => (!who ? null : who === 'me' ? 'You' : os.records.get(who)?.title ?? null);
      return { trip, stops, stays, tickets: tripTickets(os, trip.id).map((e) => ({ e, who: people(e.data.personIds)[0] ?? 'You', payer: name(e.data.paidBy) })), flights: tripFlights(os, trip.id), others: tripOthers(os, trip.id), airports: [...stops.values()].filter((s) => s.data.kind === 'airport') };
    },
    [params.trip],
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/travel/index' as never));
  if (!d) {
    return (
      <Screen title="Bookings" onBack={back}>
        <EmptyState icon="plane" tint="travel" line="That trip isn’t here any more." />
      </Screen>
    );
  }
  const look = d.trip.data.look;
  const rate = d.trip.data.fxRate;
  const live = d.stays.filter((e) => statusOf(e) !== 'cancelled');
  const cancelled = d.stays.filter((e) => statusOf(e) === 'cancelled');
  const money = stayMoney(d.stays);
  const missing = missingCheckIn(d.stays);
  const open = (id: string) => router.push(bookingRoute(id) as never);
  const out = d.flights.filter((f, i) => i < d.flights.length / 2);
  const home = d.flights.filter((f, i) => i >= d.flights.length / 2);
  return (
    <Screen title="Bookings" subtitle={`${d.trip.title} · ${plural(live.length, 'stay')}${d.flights.length ? ` · ${plural(d.flights.length, 'flight')}` : ''}`} onBack={back} contentStyle={{ gap: 16 }}>
      {d.flights.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Flights" sub={[d.flights[0]!.data.airline, 'confirmed'].filter(Boolean).join(' · ')} />
          <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: t.c.bg.tile }}>
            {[out, home].filter((x) => x.length).map((legs, k) => (
              <View key={k} style={{ padding: 16, gap: 8, borderTopWidth: k ? 1 : 0, borderStyle: 'dashed', borderColor: 'rgba(245,245,247,0.18)' }}>
                <Text variant="labelCaps" color="secondary">{k ? 'COMING HOME' : 'GOING'} · {dayOf(legs[0]!.data.startAt!).toUpperCase()}</Text>
                {legs.map((f) => (
                  <Pressable key={f.id} accessibilityRole="button" accessibilityLabel={f.title} onPress={() => router.push(`/entity/event/${f.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: 1 }}>{f.title.replace(/^Flight /, '').replace(' → ', '  ✈  ')}</Text>
                    <View style={{ flex: 1 }} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{[f.data.flightNo, f.data.allDay ? null : timeOf(f.data.startAt!)].filter(Boolean).join(' · ')}</Text>
                  </Pressable>
                ))}
              </View>
            ))}
            {d.tickets.length ? (
              <View style={{ padding: 16, gap: 10, borderTopWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(245,245,247,0.18)' }}>
                {d.tickets.map(({ e, who }) => (
                  <Row key={e.id} minHeight={40} title={who} sub={e.data.reference ? 'Ref hidden · tap to open' : null} trailing={<Text style={{ fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{e.data.cost != null ? amount(e.data.cost, e.data.currency) : ''}</Text>} onPress={() => open(e.id)} />
                ))}
                <Text variant="caption" color="secondary">{(() => {
                  const payers = [...new Set(d.tickets.map((x) => x.payer).filter(Boolean))];
                  const left = d.tickets.reduce((n, x) => n + moneyOf(x.e).toPay, 0);
                  return [payers.length ? `Paid by ${payers.join(', ')}` : null, left > 0.5 ? `${amount(left, d.tickets[0]!.e.data.currency)} to pay` : 'nothing to pay'].filter(Boolean).join(' · ');
                })()}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {d.airports.length ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {d.airports.map((a) => (
            <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={a.title} onPress={() => router.push(`/entity/stop/${a.id}` as never)} style={{ flex: 1, padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 4 }}>
              <Text variant="labelCaps" color="secondary">AIRPORT</Text>
              <Text style={{ fontSize: 16, fontWeight: '700' }} numberOfLines={1}>{a.title}</Text>
              {a.data.about ? <Text variant="caption" color="secondary" numberOfLines={2}>{a.data.about}</Text> : null}
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <SectionHead title="Stays" sub={[`${live.length} booked`, missing.length ? `${missing.length} without a check-in time` : null].filter(Boolean).join(' · ')} />
        {Object.keys(money.toPay).length ? (
          <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 6 }}>
            <Text variant="labelCaps" color="secondary">TO PAY AT THE STAYS</Text>
            {Object.entries(money.toPay).map(([cur, n]) => (
              <View key={cur} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
                <Text style={{ fontSize: 30, fontWeight: '700', letterSpacing: -1, fontVariant: ['tabular-nums'] }}>{amount(n, cur)}</Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: t.c.fg.secondary }}>{approxInr(n, cur, rate) ?? ''}</Text>
              </View>
            ))}
            <Text variant="caption" color="secondary">{Object.entries(money.paid).filter(([, n]) => n > 0.5).map(([cur, n]) => `Paid ${amount(n, cur)}`).join(' · ') || 'Nothing paid yet'}</Text>
          </View>
        ) : null}
        {live.map((e) => {
          const stop = e.data.stopId ? d.stops.get(e.data.stopId) : undefined;
          const m = moneyOf(e);
          return (
            <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={e.title} onPress={() => open(e.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, padding: 12, borderRadius: 22, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.8 : statusOf(e) === 'planned' ? 0.75 : 1 })}>
              {stop ? <StopDisc stop={stop} look={look} size={44} /> : <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}><Icon name="moon" size={18} color={WHITE} /></View>}
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="rowTitle" numberOfLines={1}>{e.title.replace(/^Stay · /, '')}</Text>
                <Text variant="caption" color={e.data.checkIn ? 'secondary' : '#F6E27F'} numberOfLines={1}>{datesLabel({ startDate: day(e.data.startAt), endDate: e.data.endAt ? day(e.data.endAt) : undefined })} · {e.data.checkIn ? `check-in ${e.data.checkIn}` : 'check-in time missing'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                {m.total != null ? <Text style={{ fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{amount(m.toPay > 0.5 ? m.toPay : m.total, m.currency)}</Text> : null}
                <PayChip e={e} />
              </View>
            </Pressable>
          );
        })}
        {!live.length ? <Note icon="moon">Stays from booking mail, the import or by hand show here with what’s left to pay.</Note> : null}
      </View>

      <View style={{ gap: 10 }}>
        <SectionHead title="Tours, passes and other" sub={d.others.length ? plural(d.others.length, 'booking') : 'none yet · rail passes, tours, tickets'} action="Add" onAction={() => router.push({ pathname: '/entity/[type]/new', params: { type: 'event', kind: 'activity', tripId: d.trip.id } } as never)} />
        {d.others.length ? (
          <RowCard>
            {d.others.map((e) => <Row key={e.id} title={e.title} sub={datesLabel({ startDate: day(e.data.startAt) })} trailing={<PayChip e={e} />} onPress={() => open(e.id)} />)}
          </RowCard>
        ) : null}
      </View>

      {cancelled.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Cancelled" sub={plural(cancelled.length, 'booking')} action={showCancelled ? 'Hide' : 'Show'} onAction={() => setShowCancelled((x) => !x)} />
          {showCancelled ? (
            <RowCard>
              {cancelled.map((e) => <Row key={e.id} title={e.title.replace(/^Stay · /, '')} sub={(e.data.notes ?? '').split('\n')[0] || datesLabel({ startDate: day(e.data.startAt) })} trailing={<PayChip e={e} />} onPress={() => open(e.id)} />)}
            </RowCard>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const day = (at?: number) => {
  if (!at) return undefined;
  const x = new Date(at);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
export { day as dayOfAt };

/** Open a link the app can't show itself. */
export const openUrl = (url?: string) => (url ? Linking.openURL(url).catch(() => undefined) : undefined);
