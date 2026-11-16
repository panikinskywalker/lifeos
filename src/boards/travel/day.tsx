import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, EmptyState, Icon, Screen, Segmented, Text } from '@ui/kit';
import { dayPlans, dayView, moneyOf, nightsOf, stepsOf, type StopData, type TravelEvent, type TripData } from '@modules/travel';
import { dayLabel, Note, Row, RowCard, SectionHead, timeOf } from './parts';
import { amount, approxInr, bookingRoute, openUrl, PayChip } from './bookings';
import { StopDisc } from './plan';
import { HappeningToday } from './things';

/**
 * A day of the trip (the trip template, R7g slice 2; JP-Day, JP-DayTravel):
 * Overview (where from and to, the journey's leave-by and arrival, the last
 * connection, what to pay, tonight), Itinerary (the day's plan and times),
 * Stay & pay, and Travel (the journey step by step, its links to book).
 */

type Tab = 'overview' | 'itinerary' | 'stay' | 'travel';
export const dayRoute = (tripId: string, day: string, tab?: Tab) => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'day', trip: tripId, day, ...(tab ? { tab } : {}) } });

export function DayScreen({ params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const [tab, setTab] = useState<Tab>((['overview', 'itinerary', 'stay', 'travel'] as const).find((x) => x === params.tab) ?? 'overview');
  const d = useLive(
    (os) => {
      const trip = os.records.get<TripData>(params.trip ?? '');
      if (trip?.object !== 'trip' || !params.day) return null;
      const nights = nightsOf(os, trip);
      const v = dayView(os, trip, params.day, nights);
      const stop = (id: string | null | undefined) => (id ? os.records.get<StopData>(id) ?? null : null);
      const days = [...nights.map((n) => n.day), ...(trip.data.endDate ? [trip.data.endDate] : [])];
      return { trip, v, here: stop(v.stopId), from: stop(v.fromStopId), plan: dayPlans(os, trip.id).get(params.day) ?? null, days, stopOf: stop };
    },
    [params.trip, params.day],
  );
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/travel/index' as never));
  if (!d) {
    return (
      <Screen title="A day" onBack={back}>
        <EmptyState icon="calendar" tint="travel" line="That day isn’t on the trip." />
      </Screen>
    );
  }
  const { v, trip } = d;
  const look = trip.data.look;
  const moving = !!d.from && !!d.here && d.from.id !== d.here.id;
  const i = d.days.indexOf(v.day);
  const go = (day: string) => router.replace(dayRoute(trip.id, day, tab) as never);
  const journey = v.journeys[0];
  const rate = trip.data.fxRate;
  const title = moving ? `${d.from!.title} → ${d.here!.title}` : d.here?.title ?? (v.night?.kind === 'air' ? 'On the plane' : v.day === trip.data.endDate ? 'Fly home' : 'No bed booked');
  const open = (e: ObjectRecord<TravelEvent>) => router.push(bookingRoute(e.id) as never);

  return (
    <Screen title={title} subtitle={`DAY ${String(v.index).padStart(2, '0')} · ${dayLabel(v.day).toUpperCase()}`} onBack={back} contentStyle={{ gap: 12 }}>
      <Segmented options={[{ value: 'overview', label: 'Overview' }, { value: 'itinerary', label: 'Itinerary' }, { value: 'stay', label: 'Stay & pay' }, { value: 'travel', label: 'Travel' }]} value={tab} onChange={setTab} />

      {tab === 'overview' ? (
        <>
          {d.from || d.here ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
              {moving ? <StopDisc stop={d.from!} look={look} /> : null}
              {moving ? <Icon name="arrow-right" size={18} color={t.c.fg.secondary} /> : null}
              {d.here ? <StopDisc stop={d.here} look={look} /> : null}
              <Text variant="rowTitle" style={{ flex: 1 }} numberOfLines={1}>{moving ? 'Moving day' : d.here ? `A day in ${d.here.title}` : title}</Text>
            </View>
          ) : null}
          {journey ? <JourneyCard e={journey} onPress={() => setTab('travel')} /> : null}
          {journey?.data.lastConnection ? <Note icon="alert" iconColor="#FF6B7A">{`Last connection: ${journey.data.lastConnection}`}</Note> : null}
          <HappeningToday trip={trip} day={v.day} stopId={v.stopId} />
          {v.toPay.length ? (
            <View style={{ gap: 10 }}>
              <SectionHead title="To pay today" sub={v.toPay.some((e) => /cash/i.test(e.data.payHow ?? '')) ? 'cash only for some' : null} />
              <RowCard>
                {v.toPay.map((e) => {
                  const m = moneyOf(e);
                  return <Row key={e.id} title={e.title.replace(/^Stay · /, '')} sub={[e.data.payHow, approxInr(m.toPay, m.currency, rate)].filter(Boolean).join(' · ') || null} trailing={<Text style={{ fontSize: 15, fontWeight: '700' }}>{amount(m.toPay, m.currency)}</Text>} onPress={() => open(e)} />;
                })}
              </RowCard>
            </View>
          ) : null}
          {v.checkIns[0] ? (
            <View style={{ gap: 10 }}>
              <SectionHead title="Tonight" />
              <RowCard>
                <Row title={v.checkIns[0].title.replace(/^Stay · /, '')} sub={v.checkIns[0].data.checkIn ? `check in ${v.checkIns[0].data.checkIn}` : 'check-in time missing'} trailing={<PayChip e={v.checkIns[0]} />} onPress={() => open(v.checkIns[0]!)} />
              </RowCard>
            </View>
          ) : null}
          {d.plan ? <Text style={{ fontSize: 15, lineHeight: 22, paddingHorizontal: 4 }}>{d.plan}</Text> : null}
        </>
      ) : null}

      {tab === 'itinerary' ? (
        <>
          <RowCard>
            {v.flights.map((f) => <Row key={f.id} lead={<Text style={{ width: 52, fontWeight: '700' }}>{f.data.allDay ? '' : timeOf(f.data.startAt!)}</Text>} title={f.title} sub={f.data.flightNo ?? null} onPress={() => router.push(`/entity/event/${f.id}` as never)} />)}
            {v.checkOuts.map((e) => <Row key={`o-${e.id}`} lead={<Text style={{ width: 52, fontWeight: '700' }}>{/\d{1,2}:\d{2}/.exec(e.data.checkOut ?? '')?.[0] ?? ''}</Text>} title={`Check out · ${e.title.replace(/^Stay · /, '')}`} sub={e.data.checkOut ?? null} onPress={() => open(e)} />)}
            {journey ? stepsOf(journey).map((s, k) => <Row key={`s-${k}`} lines={2} lead={<Text style={{ width: 52, fontWeight: '700' }}>{s.time ?? ''}</Text>} title={s.what} sub={s.note} />) : null}
            {v.checkIns.map((e) => <Row key={`i-${e.id}`} lead={<Text style={{ width: 52, fontWeight: '700' }}>{/\d{1,2}:\d{2}/.exec(e.data.checkIn ?? '')?.[0] ?? ''}</Text>} title={`Check in · ${e.title.replace(/^Stay · /, '')}`} sub={e.data.checkIn ?? 'time missing'} onPress={() => open(e)} />)}
            {!v.flights.length && !v.checkOuts.length && !journey && !v.checkIns.length ? <Text variant="caption" color="secondary" style={{ paddingVertical: 10 }}>Nothing booked for this day.</Text> : null}
          </RowCard>
          {d.plan ? (
            <View style={{ gap: 10 }}>
              <SectionHead title="Your plan" />
              <Text style={{ fontSize: 15, lineHeight: 22, paddingHorizontal: 4 }}>{d.plan}</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {tab === 'stay' ? (
        <>
          {[...v.checkIns, ...v.checkOuts.filter((e) => !v.checkIns.includes(e))].map((e) => {
            const m = moneyOf(e);
            const inn = v.checkIns.includes(e);
            return (
              <View key={e.id} style={{ gap: 10 }}>
                <SectionHead title={inn ? 'Tonight' : 'Checking out'} />
                <RowCard>
                  <Row title={e.title.replace(/^Stay · /, '')} sub={inn ? (e.data.checkIn ? `check in ${e.data.checkIn}` : 'check-in time missing') : (e.data.checkOut ?? null)} trailing={<PayChip e={e} />} onPress={() => open(e)} />
                  {inn && m.total != null ? <Row title={m.toPay > 0.5 ? `${amount(m.toPay, m.currency)} to pay` : 'Paid'} sub={[e.data.payHow, approxInr(m.toPay, m.currency, rate)].filter(Boolean).join(' · ') || null} /> : null}
                  {inn && e.data.access ? <Row lines={3} title="Getting there" sub={e.data.access} /> : null}
                </RowCard>
              </View>
            );
          })}
          {!v.checkIns.length && !v.checkOuts.length ? <Note icon="moon">{v.night?.stayId ? 'Staying put: no check-in or check-out today.' : 'No stay checks in or out today.'}</Note> : null}
        </>
      ) : null}

      {tab === 'travel' ? (
        journey ? (
          <>
            <JourneyCard e={journey} />
            {journey.data.bookNote || journey.data.book?.length ? (
              <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 10 }}>
                <Text variant="labelCaps" color="secondary">BOOK AHEAD</Text>
                {journey.data.bookNote ? <Text style={{ fontSize: 15, lineHeight: 21 }}>{journey.data.bookNote}</Text> : null}
                {(journey.data.book ?? []).map((b) => <Button key={b.url} title={b.label} icon="link" onPress={() => openUrl(b.url)} />)}
              </View>
            ) : null}
            {journey.data.lastConnection ? <Note icon="alert" iconColor="#FF6B7A">{`Last connection: ${journey.data.lastConnection}`}</Note> : null}
            {journey.data.steps ? (
              <View style={{ gap: 10 }}>
                <SectionHead title="Step by step" sub="Times estimated · check the night before" />
                <RowCard>{stepsOf(journey).map((s, k) => <Row key={k} lines={2} lead={<Text style={{ width: 52, fontWeight: '700' }}>{s.time ?? ''}</Text>} title={s.what} sub={s.note} />)}</RowCard>
              </View>
            ) : null}
            {journey.data.notes ? <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4, lineHeight: 18 }}>{journey.data.notes}</Text> : null}
          </>
        ) : (
          <Note icon="map">{v.flights.length ? 'A flying day: the flights are under Itinerary.' : 'No journey today.'}</Note>
        )
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, paddingTop: 4 }}>
        <Button title={i > 0 ? dayLabel(d.days[i - 1]!) : 'First day'} icon="chevron-left" variant="secondary" size="sm" disabled={i <= 0} onPress={() => go(d.days[i - 1]!)} style={{ flex: 1 }} />
        <Button title={i >= 0 && i < d.days.length - 1 ? dayLabel(d.days[i + 1]!) : 'Last day'} icon="chevron-right" variant="secondary" size="sm" disabled={i < 0 || i >= d.days.length - 1} onPress={() => go(d.days[i + 1]!)} style={{ flex: 1 }} />
      </View>
    </Screen>
  );
}

function JourneyCard({ e, onPress }: { e: ObjectRecord<TravelEvent>; onPress?: () => void }) {
  const t = useTheme();
  const cell = (label: string, value: string) => (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: t.c.fg.tertiary }}>{label}</Text>
      <Text style={{ fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
  const body = (
    <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 10 }}>
      <Text variant="labelCaps" color="secondary">THE JOURNEY · {[e.data.mode, e.data.takes].filter(Boolean).join(' · ').toUpperCase()}</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {cell('LEAVE BY', e.data.allDay ? '–' : timeOf(e.data.startAt!))}
        {cell('ARRIVE', e.data.endAt ? `≈${timeOf(e.data.endAt)}` : '–')}
        {cell(e.data.estimate ? 'EACH · EST.' : 'EACH', e.data.fare != null ? amount(e.data.fare, e.data.currency ?? 'JPY') : '–')}
      </View>
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel="The journey, step by step" onPress={onPress}>{body}</Pressable> : body;
}
