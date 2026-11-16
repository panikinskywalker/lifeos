import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { EmptyState, Screen, useToast } from '@ui/kit';
import { flightTrips, missingCheckIn, moneyOf, overlappingStays, statusOf, stayMoney, stopsOf, tripFlights, tripOthers, tripStays, tripTickets, type FlightTrip, type StopData, type TravelEvent, type TripData } from '@modules/travel';
import { firstName, shortDay, shortIso, timeOf } from './parts';
import { C, FACE, isJapan, TripHeader, TripScreen, tripRoutes } from './jp/shell';
import { Anim, MONO } from './jp/kit';
import { AskRow, Btn, CardHead, Chip, Ico, LedBoard, Line, P, PayChip, RoundIcon, StopMark, T, Tile, useAmt } from './jp/bookparts';

/**
 * Bookings (the trip template; JP-Bookings): the next flight on the platform
 * board, the flights as one boarding pass with each person's fare, the
 * airports you land at and leave from, every stay with what is paid and still
 * to pay, tours and passes, what needs you (stays booked twice for a night,
 * cancelled ones), and the copilot's questions. Each opens the booking's page.
 */

export { amount, approxInr, bookingRoute, bookingsRoute, dayOfAt, openUrl, PayChip } from './jp/bookparts';

/* ------------------------------------------------------------------ */
/* The screen                                                          */
/* ------------------------------------------------------------------ */

const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const capsDay = (at: number) => `${new Date(at).getDate()} ${MON[new Date(at).getMonth()]}`;
const shortCity = (s: string) => s.replace(/\b(international|intl\.?|airport)\b/gi, '').trim();

export function BookingsScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const d = useLive(
    (os) => {
      const trip = os.records.get<TripData>(params.trip ?? '');
      if (trip?.object !== 'trip') return null;
      const all = stopsOf(os, trip.id, ['stop', 'idea', 'airport']);
      const name = (who?: string) => (!who ? null : who === 'me' ? 'You' : os.records.get(who)?.title ?? null);
      const tickets = tripTickets(os, trip.id)
        .filter((e) => statusOf(e) !== 'cancelled')
        .map((e) => ({ e, who: (e.data.personIds ?? []).map((id) => name(id)).filter((x): x is string => !!x)[0] ?? 'You', payer: name(e.data.paidBy) }));
      return { trip, stops: new Map(all.map((s) => [s.id, s])), airports: all.filter((s) => s.data.kind === 'airport'), stays: tripStays(os, trip.id), tickets, flights: tripFlights(os, trip.id), others: tripOthers(os, trip.id) };
    },
    [params.trip],
  );
  const amt = useAmt(d?.trip);
  const back = () => (router.canGoBack() ? router.back() : router.replace(tripRoutes.travel));
  if (!d) {
    return (
      <Screen title="Bookings" onBack={back}>
        <EmptyState icon="plane" tint="travel" line="That trip isn’t here any more." />
      </Screen>
    );
  }
  const { trip } = d;
  const look = isJapan(trip) ? 'japan' : trip.data.look;
  const open = (id: string) => router.push(tripRoutes.booking(id));
  const listed = d.stays.filter((e) => statusOf(e) !== 'cancelled');
  const cancelled = [...d.stays, ...d.others].filter((e) => statusOf(e) === 'cancelled');
  const confirmed = listed.filter((e) => statusOf(e) === 'confirmed').length;
  const missing = missingCheckIn(listed);
  const overlaps = overlappingStays(d.stays);
  const ways = flightTrips(d.flights);
  const now = Date.now();
  const next = ways.find((w) => w.departAt >= now - 3_600_000) ?? null;
  const going = ways[0] ?? null;
  const home = ways.length > 1 ? ways[ways.length - 1]! : null;
  const asks = [missing.length ? 'Find missing check-in times' : null, 'What’s still to pay?', 'Cancellation deadlines'].filter((x): x is string => !!x);

  // What is left to pay at the stays, in ₹ when every currency converts (else the main one as it is).
  const sm = stayMoney(d.stays);
  const curs = [...new Set([...Object.keys(sm.toPay), ...Object.keys(sm.paid)])];
  const allInr = curs.every((c) => amt.toInr(1, c) != null);
  const sum = (m: Record<string, number>) => (allInr ? curs.reduce((n, c) => n + amt.toInr(m[c] ?? 0, c)!, 0) : (m[curs[0] ?? 'INR'] ?? 0));
  const stayCur = allInr ? 'INR' : (curs[0] ?? 'INR');
  const toPay = sum(sm.toPay);
  const paid = sum(sm.paid);

  const cancel = (e: ObjectRecord<TravelEvent>) => {
    const prev = e.data.booking;
    ctx.records.update<TravelEvent>(e.id, { data: { booking: 'cancelled' } }, 'user');
    toast.show({ message: `${e.title.replace(/^Stay · /, '')}: cancelled`, icon: 'check', undo: () => void ctx.records.update<TravelEvent>(e.id, { data: { booking: prev } }, 'user') });
  };
  const needs = overlaps.length + cancelled.length;

  return (
    <TripScreen tripId={trip.id} active="bookings">
      <TripHeader trip={trip} label="Bookings" />
      <Anim k="jr" delay={110} style={{ minWidth: 0 }}>
        <AskRow tripId={trip.id} asks={asks} />
      </Anim>

      {next ? <NextFlight w={next} delay={170} onPress={() => router.push(`/entity/event/${next.legs[0]!.e.id}` as never)} /> : null}

      {ways.length || d.tickets.length ? (
        <Anim k="jr" delay={230} style={{ minWidth: 0 }}>
          <View style={{ backgroundColor: C.tile, borderRadius: 28, overflow: 'hidden' }}>
            <View style={{ flexDirection: 'column', gap: 18, padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <Text style={T.caps} numberOfLines={1}>{['FLIGHTS', d.flights.find((f) => f.data.airline)?.data.airline?.toUpperCase()].filter(Boolean).join(' · ')}</Text>
                <View style={{ flexGrow: 1 }} />
                {ways.length ? (
                  <Anim k="jstamp" style={{ paddingVertical: 2, paddingHorizontal: 8, borderWidth: 2, borderColor: C.lime, borderRadius: 8, transform: [{ rotate: '-6deg' }] }}>
                    <Text style={{ color: C.lime, fontSize: 11, letterSpacing: 2, fontFamily: MONO }}>{d.flights.every((f) => statusOf(f) === 'confirmed') ? 'CONFIRMED' : 'PENDING'}</Text>
                  </Anim>
                ) : null}
              </View>
              {ways.map((w) => <PassLeg key={w.legs[0]!.e.id} w={w} onPress={() => router.push(`/entity/event/${w.legs[0]!.e.id}` as never)} />)}
            </View>
            {d.tickets.length ? (
              <>
                <View style={{ height: 0, marginHorizontal: 16, borderTopWidth: 2, borderTopColor: 'rgba(255,255,255,0.14)', borderStyle: 'dashed' }} />
                <View style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, flexDirection: 'row', flexWrap: 'wrap', rowGap: 10, columnGap: 8 }}>
                  {d.tickets.map(({ e, who }, i) => (
                    <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`${who}'s ticket`} onPress={() => open(e.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 96, flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
                      <View style={{ justifyContent: 'center', alignItems: 'center', flexShrink: 0, width: 26, height: 26, backgroundColor: FACE[i % FACE.length], borderRadius: 13 }}>
                        <Text style={{ color: C.ink, fontSize: 9, lineHeight: 11, fontFamily: 'PlusJakartaSans_700Bold' }}>{who.slice(0, 1).toUpperCase()}</Text>
                      </View>
                      <View style={{ minWidth: 0, flexShrink: 1 }}>
                        <Text style={{ color: C.white, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold' }} numberOfLines={1}>{firstName(who)}</Text>
                        <Text style={T.mono} numberOfLines={1}>{e.data.cost != null ? amt.fmt(e.data.cost, e.data.currency ?? 'INR') : '–'}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
                  {(() => {
                    const payers = [...new Set(d.tickets.map((x) => x.payer).filter((x): x is string => !!x).map(firstName))];
                    const left = d.tickets.reduce((n, x) => n + moneyOf(x.e).toPay, 0);
                    const label = [payers.length ? `Paid by ${payers.join(', ')}` : null, left > 0.5 ? `${amt.fmt(left, d.tickets[0]!.e.data.currency ?? 'INR')} to pay` : 'nothing to pay'].filter(Boolean).join(' · ');
                    return <View style={{ flexShrink: 1 }}><Chip label={label} tone={left > 0.5 ? 'amber' : 'lime'} icon={left > 0.5 ? P.alert : P.check} h={26} /></View>;
                  })()}
                  <View style={{ flexGrow: 1 }} />
                  {d.tickets.some((x) => x.e.data.reference) ? <Chip label="Ref hidden" icon={P.eyeOff} h={26} onPress={() => open(d.tickets.find((x) => x.e.data.reference)!.e.id)} a11y="Open the ticket to see its reference" /> : null}
                </View>
              </>
            ) : null}
          </View>
        </Anim>
      ) : null}

      {going || home ? (
        <Anim k="jr" delay={290} style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8, minWidth: 0 }}>
          {going ? <AirportCard label="ARRIVE" w={going} end="to" airports={d.airports} onOpen={(id) => router.push(id.startsWith('stop:') ? tripRoutes.stop(id.slice(5)) : (`/entity/event/${id}` as never))} /> : null}
          {home ? <AirportCard label="DEPART" w={home} end="from" airports={d.airports} onOpen={(id) => router.push(id.startsWith('stop:') ? tripRoutes.stop(id.slice(5)) : (`/entity/event/${id}` as never))} /> : null}
        </Anim>
      ) : null}

      <Tile>
        <CardHead title="Stays" sub={listed.length ? [`${confirmed} confirmed`, listed.length - confirmed ? `${listed.length - confirmed} not yet` : null, missing.length ? `${missing.length} without a check-in time` : null].filter(Boolean).join(' · ') : 'none yet'} />
        {curs.length ? (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, minWidth: 0 }}>
              <View style={{ flexDirection: 'column', gap: 4, minWidth: 0, flexShrink: 1 }}>
                <Text style={T.caps}>TO PAY AT THE STAYS</Text>
                <Text style={{ color: C.white, fontSize: 30, lineHeight: 31, letterSpacing: -1, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }} numberOfLines={1}>{amt.fmt(toPay, stayCur)}</Text>
              </View>
              <View style={{ flexGrow: 1 }} />
              <View style={{ flexDirection: 'column', alignItems: 'flex-end', minWidth: 0 }}>
                {amt.alt(toPay, stayCur) ? <Text style={{ color: C.white, fontSize: 14, lineHeight: 18, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{amt.alt(toPay, stayCur)}</Text> : null}
                <Text style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_500Medium' }}>{paid + toPay > 0 ? `${Math.round((paid / (paid + toPay)) * 100)}% paid` : ''}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              <Anim k="jbar" style={{ flexGrow: Math.max(0.015, paid / Math.max(1, paid + toPay)), flexShrink: 1, flexBasis: 0, height: 8, backgroundColor: C.lime, borderRadius: 8 }} />
              <View style={{ flexGrow: Math.max(0.015, toPay / Math.max(1, paid + toPay)), flexShrink: 1, flexBasis: 0, height: 8, backgroundColor: '#303036', borderRadius: 8 }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
              <Text style={[T.mono, { color: C.lime }]}>PAID {amt.fmt(paid, stayCur)}</Text>
              <Text style={T.mono}>UNPAID {amt.fmt(toPay, stayCur)}</Text>
            </View>
          </>
        ) : null}
      </Tile>

      {listed.length ? (
        <View style={{ flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {listed.map((e, i) => {
            const stop = e.data.stopId ? d.stops.get(e.data.stopId) : undefined;
            const m = moneyOf(e);
            const planned = statusOf(e) === 'planned';
            return (
              <Anim key={e.id} k="jr" delay={200 + i * 40} style={{ minWidth: 0 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={e.title.replace(/^Stay · /, '')} onPress={() => open(e.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: C.tile, borderRadius: 22, opacity: pressed ? 0.8 : planned ? 0.72 : 1 })}>
                  {stop ? <StopMark stop={stop} look={look} /> : <View style={{ justifyContent: 'center', alignItems: 'center', width: 44, height: 44, borderRadius: 22, backgroundColor: C.raised }}><Ico p={P.bed!} size={18} color={C.mid} /></View>}
                  <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                    <Text style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }} numberOfLines={1}>{e.title.replace(/^Stay · /, '')}</Text>
                    <Text style={{ color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' }} numberOfLines={1}>
                      {`${shortDay(e.data.startAt!)}${e.data.endAt ? `–${shortDay(e.data.endAt)}` : ''} · `}
                      {e.data.checkIn?.trim() ? `check-in ${/^\d/.test(e.data.checkIn) ? `from ${e.data.checkIn}` : e.data.checkIn}` : <Text style={{ color: '#FFB547' }}>check-in time missing</Text>}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, gap: 4 }}>
                    {m.total != null ? <Text style={{ color: C.white, fontSize: 15, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{amt.fmt(m.toPay > 0.5 ? m.toPay : m.total, m.currency)}</Text> : null}
                    <PayChip e={e} />
                  </View>
                </Pressable>
              </Anim>
            );
          })}
        </View>
      ) : null}

      <View style={{ flexDirection: 'column', gap: 12, padding: 16, borderWidth: 1.5, borderColor: 'rgba(245,245,247,0.2)', borderStyle: 'dashed', borderRadius: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ justifyContent: 'center', alignItems: 'center', flexShrink: 0, width: 40, height: 40, backgroundColor: C.raised, borderRadius: 20 }}>
            <Ico p={P.ticket!} size={18} color={C.mid} />
          </View>
          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
            <Text style={{ color: C.white, fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Tours, passes and other</Text>
            <Text style={{ color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' }}>{d.others.length ? `${d.others.length} ${d.others.length === 1 ? 'booking' : 'bookings'}` : 'none yet · rail passes, tours, tickets'}</Text>
          </View>
          <Chip label="Add" icon={P.plus} h={32} onPress={() => router.push({ pathname: '/entity/[type]/new', params: { type: 'event', kind: 'activity', tripId: trip.id } } as never)} a11y="Add a tour, pass or ticket" />
        </View>
        {d.others.filter((e) => statusOf(e) !== 'cancelled').map((e) => (
          <Line key={e.id} icon={P.ticket} color={C.lime} title={e.title} sub={[shortDay(e.data.startAt!), e.data.cost != null ? amt.fmt(moneyOf(e).toPay > 0.5 ? moneyOf(e).toPay : e.data.cost, moneyOf(e).currency) : null].filter(Boolean).join(' · ')} right={<PayChip e={e} />} onPress={() => open(e.id)} />
        ))}
      </View>

      {needs ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 10, paddingHorizontal: 4 }}>
            <View style={{ flexDirection: 'column', flexGrow: 1, gap: 1, minWidth: 0 }}>
              <Text style={T.title}>Needs you</Text>
              <Text style={T.sub}>{needs}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'column', gap: 8 }}>
            {overlaps.map((o) => (
              <View key={o.cancel.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: 'rgba(255,92,71,0.18)', borderRadius: 22 }}>
                <Ico p={P.alert!} size={18} color="#FF8A7A" />
                <Pressable accessibilityRole="button" accessibilityLabel={o.cancel.title} onPress={() => open(o.cancel.id)} style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                  <Text style={{ color: C.white, fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold' }} numberOfLines={1}>{`Cancel ${o.cancel.title.replace(/^Stay · /, '')}`}</Text>
                  <Text style={{ color: '#FF8A7A', fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' }} numberOfLines={2}>{[`same night as ${o.keep.title.replace(/^Stay · /, '')}`, o.freeUntil ? `free until ${shortIso(o.freeUntil)}` : null].filter(Boolean).join(' · ')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Cancel ${o.cancel.title}`} onPress={() => cancel(o.cancel)} style={({ pressed }) => ({ justifyContent: 'center', alignItems: 'center', flexShrink: 0, height: 36, paddingHorizontal: 14, backgroundColor: C.white, borderRadius: 999, transform: [{ scale: pressed ? 0.96 : 1 }] })}>
                  <Text style={{ color: C.ink, fontSize: 13, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Cancel</Text>
                </Pressable>
              </View>
            ))}
            {cancelled.map((e) => {
              const m = moneyOf(e);
              const covers = (e.data.personIds?.length ?? 0) + 1;
              const base = m.paid > 0.5 ? m.paid : m.total;
              return (
                <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={e.title} onPress={() => open(e.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: C.tile, borderRadius: 22, opacity: pressed ? 0.8 : 1 })}>
                  <Ico p={P.x!} size={16} color={C.mid} />
                  <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                    <Text style={{ color: C.mid, fontSize: 14, fontFamily: 'PlusJakartaSans_600SemiBold', textDecorationLine: 'line-through' }} numberOfLines={1}>{e.title.replace(/^Stay · /, '')}</Text>
                    <Text style={{ color: C.low, fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' }} numberOfLines={2}>{['cancelled', (e.data.notes ?? '').split('\n').find((l) => l.trim() && !l.startsWith('Paid: '))].filter(Boolean).join(' · ')}</Text>
                  </View>
                  {base != null && base > 0.5 ? <Chip label={covers > 1 ? `${amt.fmt(base / covers, m.currency)} each` : amt.fmt(base, m.currency)} /> : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Btn title="Add booking" icon={P.plus} onPress={() => router.push({ pathname: '/entity/[type]/new', params: { type: 'event', kind: 'stay', tripId: trip.id } } as never)} />
        <RoundIcon icon={P.mail!} label="Forward a booking mail" onPress={() => router.push(tripRoutes.copilot(trip.id, 'Add a booking from my mail'))} />
      </View>
    </TripScreen>
  );
}

/** The next flight on the platform board: where to (lime), the day, the time. */
function NextFlight({ w, delay, onPress }: { w: FlightTrip; delay: number; onPress: () => void }) {
  const city = (shortCity(w.to.city).split(/\s+/)[0] || w.to.code || '').replace(/[^A-Za-z0-9 ]/g, '');
  return (
    <Anim k="jr" delay={delay} style={{ minWidth: 0 }}>
      <Tile r={26} onPress={onPress} label="The next flight">
        <View>
          <Text style={{ color: C.white, fontSize: 18, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>Next flight</Text>
          <Text style={{ color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' }} numberOfLines={1}>{[`${shortCity(w.from.city) || w.from.code} → ${shortCity(w.to.city) || w.to.code}`, w.legs.length > 1 ? `via ${w.legs.slice(1).map((l) => shortCity(l.from.city) || l.from.code).join(', ')}` : null, w.flightNos[0]].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={{ flexDirection: 'column', gap: 6 }}>
          <LedBoard text={city} color={C.lime} />
          <LedBoard text={capsDay(w.departAt)} />
          {w.legs[0]!.e.data.allDay ? null : <LedBoard text={timeOf(w.departAt)} />}
        </View>
      </Tile>
    </Anim>
  );
}

/** One way on the boarding pass: BOM, its day and time; the flights and where you change; HND. */
function PassLeg({ w, onPress }: { w: FlightTrip; onPress: () => void }) {
  const when = (at: number | null, allDay?: boolean) => (at == null ? '' : `${capsDay(at)}${allDay ? '' : ` ${timeOf(at)}`}`);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${w.from.code ?? w.from.city} to ${w.to.code ?? w.to.city}`} onPress={onPress} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <View style={{ flexShrink: 0 }}>
        <Text style={{ color: C.white, fontSize: 30, lineHeight: 34, letterSpacing: 1, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{w.from.code ?? w.from.city.slice(0, 3).toUpperCase()}</Text>
        <Text style={T.mono}>{when(w.departAt, w.legs[0]!.e.data.allDay)}</Text>
      </View>
      <View style={{ flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
        <Text style={[T.mono, { color: C.white }]} numberOfLines={1}>{w.flightNos.join(' · ')}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, width: '100%' }}>
          <View style={{ flexGrow: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' }} />
          <Ico p={P.plane!} size={14} color={C.lime} />
          <View style={{ flexGrow: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.2)' }} />
        </View>
        <Text style={[T.mono, { color: C.low }]} numberOfLines={1}>{w.via.length ? `via ${w.via.join(', ')}` : 'direct'}</Text>
      </View>
      <View style={{ flexShrink: 0 }}>
        <Text style={{ color: C.white, fontSize: 30, lineHeight: 34, letterSpacing: 1, textAlign: 'right', fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{w.to.code ?? w.to.city.slice(0, 3).toUpperCase()}</Text>
        <Text style={[T.mono, { textAlign: 'right' }]}>{when(w.landAt)}</Text>
      </View>
    </Pressable>
  );
}

/** The airport you land at (ARRIVE) or leave from (DEPART): its code and terminal, when, which flight. */
function AirportCard({ label, w, end, airports, onOpen }: { label: string; w: FlightTrip; end: 'to' | 'from'; airports: ObjectRecord<StopData>[]; onOpen: (id: string) => void }) {
  const leg = end === 'to' ? w.legs[w.legs.length - 1]! : w.legs[0]!;
  const a = end === 'to' ? leg.to : leg.from;
  const at = end === 'to' ? leg.landAt : leg.departAt;
  const stop = airports.find((s) => (a.code && (s.data.about ?? '').includes(leg.e.data.flightNo ?? '\u0000')) || (shortCity(s.title).split(/\s+/)[0] && a.city.toLowerCase().includes(shortCity(s.title).split(/\s+/)[0]!.toLowerCase())));
  const place = stop ? shortCity(stop.title) : shortCity(a.city);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label.toLowerCase()} ${a.code ?? a.city}`} onPress={() => onOpen(stop ? `stop:${stop.id}` : leg.e.id)} style={({ pressed }) => ({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 8, minWidth: 0, padding: 14, backgroundColor: C.tile, borderRadius: 24, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <Text style={{ color: C.low, fontSize: 9, letterSpacing: 1, fontFamily: MONO }}>{label}</Text>
        <View style={{ flexGrow: 1 }} />
        <Ico p={P.plane!} size={14} color={C.lime} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={{ color: C.white, fontSize: 28, lineHeight: 30, letterSpacing: 1, fontFamily: 'PlusJakartaSans_800ExtraBold' }}>{a.code ?? a.city.slice(0, 3).toUpperCase()}</Text>
        {a.terminal ? <Text style={{ color: C.lime, fontSize: 12, fontFamily: MONO }}>{a.terminal}</Text> : null}
      </View>
      <Text style={{ color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' }} numberOfLines={1}>{`${place} · ${end === 'to' ? 'arrival' : 'departure'}`}</Text>
      <Text style={{ color: C.white, fontSize: 13, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }} numberOfLines={1}>{[at != null ? `${shortDay(at)}${leg.e.data.allDay && end === 'from' ? '' : ` ${timeOf(at)}`}` : null, leg.e.data.flightNo].filter(Boolean).join(' · ')}</Text>
    </Pressable>
  );
}
