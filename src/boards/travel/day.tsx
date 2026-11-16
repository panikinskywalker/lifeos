import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { EmptyState, Screen } from '@ui/kit';
import { connectionMargin, dayPlans, dayView, flightTrips, happeningOn, longLeg, moneyOf, nightsOf, stayNights, stepsOf, thingStatus, type FlightTrip, type OutingData, type StopData, type ThingStatus, type TravelEvent, type TripData } from '@modules/travel';
import { shortDay, shortIso, timeOf } from './parts';
import { stopColor as stopHex } from './jp/bookparts';
import { Btn, CardHead, type Shape, Chip, Ico, Line, Lines, modeIcon, openUrl, P, PayChip, RoundIcon, T, Tile, useAmt } from './jp/bookparts';
import { C, isJapan, RoundButton, TripScreen, tripRoutes } from './jp/shell';
import { Anim, JP_SANS, JP_SERIF, MONO } from './jp/kit';

/**
 * A day of the trip (the trip template; JP-Day, JP-DayTravel): the day's
 * tabs with the days before and after. Overview has where you wake and where
 * you sleep as station tickets, the journey (leave by, arrive, the fare, the
 * last connection), what is happening on the route, what to pay today and
 * tonight's stay with the day's plans. Itinerary is the day in time order,
 * Stay & pay the stays checking in and out, and Travel the journey in full:
 * the long leg, what to book ahead, step by step, the route notes and the
 * links to book.
 */

type Tab = 'overview' | 'itinerary' | 'stay' | 'travel';
const TABS: Array<[Tab, string]> = [['overview', 'Overview'], ['itinerary', 'Itinerary'], ['stay', 'Stay & pay'], ['travel', 'Travel']];
export const dayRoute = (tripId: string, day: string, tab?: Tab) => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: 'day', trip: tripId, day, ...(tab ? { tab } : {}) } });

const WEEK = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const capsDate = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return `${WEEK[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
};
const nameOf = (e: { title: string }) => e.title.replace(/^(Stay|Ticket) · /, '');
const clock = (s?: string) => /\d{1,2}:\d{2}/.exec(s ?? '')?.[0] ?? null;

export function DayScreen({ params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(TABS.find(([x]) => x === params.tab)?.[0] ?? 'overview');
  const d = useLive(
    (os) => {
      const trip = os.records.get<TripData>(params.trip ?? '');
      if (trip?.object !== 'trip' || !params.day) return null;
      const nights = nightsOf(os, trip);
      const v = dayView(os, trip, params.day, nights);
      const stop = (id: string | null | undefined) => (id ? os.records.get<StopData>(id) ?? null : null);
      const days = [...nights.map((n) => n.day), ...(trip.data.endDate && !nights.some((n) => n.day === trip.data.endDate) ? [trip.data.endDate] : [])];
      const stopOn = (day: string) => stop(nights.find((n) => n.day === day)?.stopId)?.title ?? null;
      const tonight = v.checkIns[0] ?? (v.night?.stayId ? os.records.get<TravelEvent>(v.night.stayId) ?? null : null);
      const happening = happeningOn(os, trip, v.day, v.stopId);
      const people = (e: ObjectRecord<TravelEvent>) => (e.data.personIds?.length ?? 0) + 1;
      return { trip, v, nights, here: stop(v.stopId), from: stop(v.fromStopId), plan: dayPlans(os, trip.id).get(params.day) ?? null, days, stopOn, tonight, happening, people, stopOf: stop };
    },
    [params.trip, params.day],
  );
  const amt = useAmt(d?.trip);
  const back = () => (router.canGoBack() ? router.back() : router.replace(tripRoutes.travel));
  if (!d) {
    return (
      <Screen title="A day" onBack={back}>
        <EmptyState icon="calendar" tint="travel" line="That day isn’t on the trip." />
      </Screen>
    );
  }
  const { v, trip } = d;
  const japan = isJapan(trip);
  const look = japan ? 'japan' : trip.data.look;
  const journey = v.journeys[0] ?? null;
  const from = journey?.data.fromStopId ? d.stopOf(journey.data.fromStopId) : d.from;
  const to = journey?.data.toStopId ? d.stopOf(journey.data.toStopId) : d.here;
  const moving = !!from && !!to && from.id !== to.id;
  const ways = flightTrips(v.flights);
  const i = d.days.indexOf(v.day);
  const prev = i > 0 ? d.days[i - 1]! : null;
  const next = i >= 0 && i < d.days.length - 1 ? d.days[i + 1]! : null;
  const go = (day: string) => router.replace(dayRoute(trip.id, day, tab) as never);
  const open = (e: ObjectRecord<TravelEvent>) => router.push(tripRoutes.booking(e.id));
  const flightTitle = ways[0] ? `${ways[0].from.city.split(/\s+/)[0]} → ${ways[ways.length - 1]!.to.city.split(/\s+/)[0]}` : null;
  const title = moving ? `${from!.title} → ${to!.title}` : flightTitle ?? d.here?.title ?? (v.night?.kind === 'air' ? 'On the plane' : v.day === trip.data.endDate ? 'Home' : 'No bed booked');
  const local = trip.data.localCurrency ?? 'INR';
  const things = d.happening.planned;

  const stepsAll = journey ? stepsOf(journey) : [];
  const stayLine = (e: ObjectRecord<TravelEvent>) => [nameOf(e), e.data.checkIn ? `check in ${e.data.checkIn.replace(/^from\s+/i, '')}` : null].filter(Boolean).join(' · ');

  /* ---------------- pieces used on more than one tab ---------------- */

  const toPayTile = (delay: number) =>
    v.toPay.length ? (
      <Anim k="jr" delay={delay} style={{ minWidth: 0 }}>
        <Tile>
          <CardHead title="To pay today" sub={v.toPay.some((e) => /cash/i.test(e.data.payHow ?? '')) ? (v.toPay.every((e) => /cash/i.test(e.data.payHow ?? '')) ? 'cash only' : 'cash for some') : 'at check-in'} right={<Chip label={String(v.toPay.length)} h={28} />} />
          {v.toPay.map((e) => {
            const m = moneyOf(e);
            const n = d.people(e);
            return (
              <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={`${nameOf(e)}, to pay`} onPress={() => open(e)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <View style={{ justifyContent: 'center', alignItems: 'center', flexShrink: 0, width: 40, height: 40, backgroundColor: C.raised, borderRadius: 20 }}>
                  <Ico p={m.currency === 'JPY' ? P.yen! : P.coins!} size={18} color="#F26B2B" />
                </View>
                <View style={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
                  <Text style={T.title} numberOfLines={1}>{nameOf(e)}</Text>
                  <Text style={T.sub} numberOfLines={1}>{[e.data.payHow?.split(/[.;]/)[0]?.trim().toLowerCase(), amt.alt(m.toPay, m.currency), n > 1 ? `${amt.fmt(m.toPay / n, m.currency)} each` : null].filter(Boolean).join(' · ')}</Text>
                </View>
                <Text style={{ color: C.white, fontSize: 16, lineHeight: 21, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold', flexShrink: 0 }} numberOfLines={1}>{amt.fmt(m.toPay, m.currency)}</Text>
              </Pressable>
            );
          })}
        </Tile>
      </Anim>
    ) : null;

  const thingRows = things.map((x) => (
    <Line
      key={x.id}
      icon={KIND_ICON[x.data.kind] ?? P.star}
      color={KIND_COLOR[x.data.kind] ?? C.mid}
      title={x.title}
      sub={[x.data.cost != null ? (x.data.cost === 0 ? 'free' : `${amt.fmt(x.data.cost, local)} each`) : null, x.data.notes?.split('\n')[0] ?? (x.data.quietest ? `quietest ${x.data.quietest.replace(/^\w/, (c) => c.toLowerCase())}` : null)].filter(Boolean).join(' · ') || null}
      right={<ThingChip s={thingStatus(x)} />}
      onPress={() => router.push(`/entity/outing/${x.id}` as never)}
    />
  ));

  const navButtons = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
      {prev ? <DayButton day={prev} stop={d.stopOn(prev)} dir="prev" onPress={() => go(prev)} /> : <View style={{ flexGrow: 1, flexBasis: 0 }} />}
      {next ? <DayButton day={next} stop={d.stopOn(next)} dir="next" onPress={() => go(next)} /> : <View style={{ flexGrow: 1, flexBasis: 0 }} />}
    </View>
  );

  return (
    <TripScreen tripId={trip.id} active="plan">
      <Anim k="jr" delay={50} style={{ minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 4 }}>
          <RoundButton label="Back" onPress={back}>
            <Ico p={P.back!} size={18} />
          </RoundButton>
          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
            <Text style={{ color: C.mid, fontSize: 10, letterSpacing: 2, fontVariant: ['tabular-nums'], fontFamily: MONO }} numberOfLines={1}>{`DAY ${String(v.index).padStart(2, '0')} · ${capsDate(v.day)}`}</Text>
            <Text style={{ color: C.white, fontSize: 20, lineHeight: 24, fontFamily: 'PlusJakartaSans_700Bold' }} numberOfLines={1}>{title}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <RoundButton label="Previous day" size={40} onPress={prev ? () => go(prev) : undefined}>
              <Ico p={P.back!} size={16} color={prev ? C.white : C.low} />
            </RoundButton>
            <RoundButton label="Next day" size={40} onPress={next ? () => go(next) : undefined}>
              <Ico p={P.chevron!} size={16} color={next ? C.white : C.low} />
            </RoundButton>
          </View>
        </View>
        <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: 4, padding: 4, backgroundColor: C.tile, borderRadius: 999, overflow: 'hidden' }}>
          {TABS.map(([k, label]) => (
            <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: tab === k }} onPress={() => setTab(k)} style={{ justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 36, backgroundColor: tab === k ? C.white : 'transparent', borderRadius: 18 }}>
              <Text style={{ color: tab === k ? C.ink : C.mid, fontSize: 13, fontFamily: 'PlusJakartaSans_700Bold' }} numberOfLines={1}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Anim>

      {tab === 'overview' ? (
        <>
          {from || to ? (
            <Anim k="jr" delay={110} style={{ minWidth: 0 }}>
              <StationCards from={moving ? from : null} to={moving ? to! : (to ?? from)!} look={look} mode={journey?.data.mode} onOpen={(s) => router.push(tripRoutes.stop(s.id))} />
            </Anim>
          ) : null}

          {journey ? (
            <Anim k="jr" delay={170} style={{ minWidth: 0 }}>
              <Tile gap={12} onPress={() => setTab('travel')} label="The journey: see the travel">
                <CardHead title="The journey" sub={[journey.data.mode, journey.data.book?.[0] ? journey.data.book[0].label.replace(/^\w/, (c) => c.toLowerCase()) : journey.data.takes ? `≈ ${journey.data.takes}` : null].filter(Boolean).join(' · ')} right={<Chip label="Travel" icon={P.chevron} h={28} />} />
                <JourneyStats e={journey} raised amt={amt} local={local} />
                {journey.data.lastConnection ? (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                    <View style={{ flexShrink: 0, paddingTop: 1.5 }}><Ico p={P.bus!} size={15} color="#FF8A7A" /></View>
                    <Text style={{ flexShrink: 1, color: '#FF8A7A', fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{/^last/i.test(journey.data.lastConnection) ? journey.data.lastConnection : `Last connection: ${journey.data.lastConnection}`}</Text>
                  </View>
                ) : null}
              </Tile>
            </Anim>
          ) : ways.length ? (
            <Anim k="jr" delay={170} style={{ minWidth: 0 }}>
              <FlightsTile ways={ways} onOpen={(id) => router.push(`/entity/event/${id}` as never)} />
            </Anim>
          ) : null}

          {d.happening.events.length ? (
            <Anim k="jr" delay={230} style={{ minWidth: 0 }}>
              <Tile gap={6}>
                <CardHead title="Happening today" sub={d.happening.events.some((e) => e.data.stopId) ? 'on your route' : 'across the country'} />
                {d.happening.events.map((e) => (
                  <Pressable key={e.id} accessibilityRole="button" accessibilityLabel={e.title} onPress={() => router.push(`/entity/outing/${e.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0, minHeight: 50 }}>
                    <HappeningMark e={e} day={v.day} japan={japan} stop={d.stopOf(e.data.stopId ?? v.stopId)} />
                    <View style={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
                      <Text style={T.rowTitle} numberOfLines={1}>{e.title}</Text>
                      <Text style={T.sub} numberOfLines={1}>{[d.stopOf(e.data.stopId)?.title, e.data.notes?.split('\n')[0]].filter(Boolean).join(' · ') || (e.data.until && e.data.until !== e.data.day ? `until ${shortIso(e.data.until)}` : 'today')}</Text>
                    </View>
                  </Pressable>
                ))}
              </Tile>
            </Anim>
          ) : null}

          {toPayTile(290)}

          {d.tonight || things.length ? (
            <Anim k="jr" delay={350} style={{ minWidth: 0 }}>
              <Tile gap={6}>
                <CardHead title="Tonight" sub={d.tonight ? (v.checkIns.includes(d.tonight) ? stayLine(d.tonight) : `${nameOf(d.tonight)} · night ${nightIndex(d.nights, v.day, d.tonight.id)} of ${stayNights(d.tonight)}`) : 'no bed booked'} right={<Chip label="Stay & pay" icon={P.chevron} h={28} onPress={() => setTab('stay')} />} />
                {thingRows}
              </Tile>
            </Anim>
          ) : null}

          {d.plan ? (
            <Anim k="jr" delay={380} style={{ minWidth: 0 }}>
              <Tile gap={8}>
                <CardHead title="The plan" sub="from the trip notes" />
                <Text style={{ color: C.mid, fontSize: 14, lineHeight: 20, fontFamily: 'PlusJakartaSans_500Medium' }}>{d.plan}</Text>
              </Tile>
            </Anim>
          ) : null}

          {!journey && !ways.length && !d.happening.events.length && !v.toPay.length && !d.tonight && !things.length && !d.plan ? (
            <Tile>
              <CardHead title="A free day" sub="nothing booked or planned yet" />
            </Tile>
          ) : null}

          <Anim k="jr" delay={410} style={{ minWidth: 0 }}>{navButtons}</Anim>
        </>
      ) : null}

      {tab === 'itinerary' ? (
        <>
          <Anim k="jr" delay={110} style={{ minWidth: 0 }}>
            <Tile gap={12}>
              <CardHead title="The day" sub={stepsAll.length ? 'times estimated · check the night before' : 'in time order'} />
              {(() => {
                const items: StepItem[] = [
                  ...ways.flatMap((w) => w.legs.map((l) => ({ time: l.e.data.allDay ? null : timeOf(l.departAt), what: `${l.from.code ?? l.from.city} → ${l.to.code ?? l.to.city}`, note: [l.e.data.flightNo, l.landAt ? `lands ${timeOf(l.landAt)}` : null].filter(Boolean).join(' · ') || null, onPress: () => router.push(`/entity/event/${l.e.id}` as never) }))),
                  ...v.checkOuts.filter((e) => !stepsAll.length || !stepsAll.some((s) => /check.?out/i.test(s.what))).map((e) => ({ time: clock(e.data.checkOut), what: `Check out · ${nameOf(e)}`, note: e.data.checkOut ?? null, onPress: () => open(e) })),
                  ...stepsAll.map((s) => ({ time: s.time, what: s.what, note: s.note, onPress: undefined })),
                  ...v.checkIns.filter((e) => !stepsAll.length || !stepsAll.some((s) => /check.?in/i.test(s.what))).map((e) => ({ time: clock(e.data.checkIn), what: `Check in · ${nameOf(e)}`, note: e.data.checkIn ?? 'time missing', onPress: () => open(e) })),
                  ...things.map((x) => ({ time: null, what: x.title, note: STATUS_WORD[thingStatus(x)], onPress: () => router.push(`/entity/outing/${x.id}` as never) })),
                ];
                return items.length ? <Steps items={items} /> : <Text style={T.sub}>Nothing booked or planned for this day.</Text>;
              })()}
            </Tile>
          </Anim>
          {d.happening.events.length ? (
            <Anim k="jr" delay={170} style={{ minWidth: 0 }}>
              <Tile gap={6}>
                <CardHead title="Happening today" sub="on your route" />
                <Lines>{d.happening.events.map((e) => <Line key={e.id} lead={<HappeningMark e={e} day={v.day} japan={japan} stop={d.stopOf(e.data.stopId ?? v.stopId)} />} title={e.title} sub={e.data.notes?.split('\n')[0] ?? null} onPress={() => router.push(`/entity/outing/${e.id}` as never)} />)}</Lines>
              </Tile>
            </Anim>
          ) : null}
          {d.plan ? (
            <Anim k="jr" delay={230} style={{ minWidth: 0 }}>
              <Tile gap={8}>
                <CardHead title="Your plan" sub="from the trip notes" />
                <Text style={{ color: C.mid, fontSize: 14, lineHeight: 20, fontFamily: 'PlusJakartaSans_500Medium' }}>{d.plan}</Text>
              </Tile>
            </Anim>
          ) : null}
          <Anim k="jr" delay={290} style={{ minWidth: 0 }}>{navButtons}</Anim>
        </>
      ) : null}

      {tab === 'stay' ? (
        <>
          {d.tonight ? (
            <Anim k="jr" delay={110} style={{ minWidth: 0 }}>
              <StayTile e={d.tonight} title={v.checkIns.includes(d.tonight) ? 'Tonight' : 'Staying put'} sub={v.checkIns.includes(d.tonight) ? `checking in · ${stayNights(d.tonight)} ${stayNights(d.tonight) === 1 ? 'night' : 'nights'}` : `night ${nightIndex(d.nights, v.day, d.tonight.id)} of ${stayNights(d.tonight)}`} amt={amt} people={d.people(d.tonight)} onOpen={() => open(d.tonight!)} />
            </Anim>
          ) : (
            <Tile>
              <CardHead title="Tonight" sub={v.night?.kind === 'air' ? 'on the plane' : 'no bed booked for tonight'} />
            </Tile>
          )}
          {toPayTile(170)}
          {v.checkOuts.length ? (
            <Anim k="jr" delay={230} style={{ minWidth: 0 }}>
              <Tile gap={4}>
                <CardHead title="Checking out" sub={v.checkOuts.length === 1 ? 'this morning' : `${v.checkOuts.length} stays`} />
                <Lines>{v.checkOuts.map((e) => <Line key={e.id} icon={P.home} title={nameOf(e)} sub={e.data.checkOut ?? 'check-out time not known'} right={<PayChip e={e} />} onPress={() => open(e)} />)}</Lines>
              </Tile>
            </Anim>
          ) : null}
          {things.some((x) => x.data.cost) ? (
            <Anim k="jr" delay={290} style={{ minWidth: 0 }}>
              <Tile gap={4}>
                <CardHead title="Plans with a cost" sub="each" />
                <Lines>{thingRows.filter((_, k) => things[k]!.data.cost)}</Lines>
              </Tile>
            </Anim>
          ) : null}
          <Anim k="jr" delay={350} style={{ minWidth: 0 }}>{navButtons}</Anim>
        </>
      ) : null}

      {tab === 'travel' ? (
        journey ? (
          <JourneyBody e={journey} trip={trip} from={from} to={to} checkOut={v.checkOuts[0] ?? null} checkIn={v.checkIns[0] ?? null} amt={amt} />
        ) : (
          <>
            {ways.length ? (
              <Anim k="jr" delay={110} style={{ minWidth: 0 }}>
                <FlightsTile ways={ways} onOpen={(id) => router.push(`/entity/event/${id}` as never)} />
              </Anim>
            ) : (
              <Tile>
                <CardHead title="No journey today" sub={d.here ? `a day in ${d.here.title}` : 'nothing to travel'} />
              </Tile>
            )}
            <Anim k="jr" delay={170} style={{ minWidth: 0 }}>{navButtons}</Anim>
          </>
        )
      ) : null}
    </TripScreen>
  );
}

const nightIndex = (nights: Array<{ day: string; stayId: string | null }>, day: string, stayId: string) => nights.filter((n) => n.stayId === stayId && n.day <= day).length || 1;

/* ------------------------------------------------------------------ */
/* Pieces (the journey ones are shared with a booking's page)          */
/* ------------------------------------------------------------------ */

type Amt = ReturnType<typeof useAmt>;

const KIND_ICON: Record<string, Shape[] | undefined> = { eat: P.utensils, see: P.pin, do: P.star, relax: P.waves, shop: P.bag, event: P.sparkle };
const KIND_COLOR: Record<string, string> = { eat: '#F26B2B', see: '#A9C4FF', do: '#F6E27F', relax: '#4CC9D4', shop: '#E08BC8', event: C.lime };
const STATUS_WORD: Record<ThingStatus, string> = { idea: 'Idea', want: 'Want to', planned: 'Planned', done: 'Done' };

function ThingChip({ s }: { s: ThingStatus }) {
  return <Chip label={STATUS_WORD[s]} tone={s === 'planned' ? 'lime' : s === 'want' ? 'yellow' : 'raised'} />;
}

/** The day before or after: "← 25 Dec · Suzaka". */
function DayButton({ day, stop, dir, onPress }: { day: string; stop: string | null; dir: 'prev' | 'next'; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${dir === 'prev' ? 'Previous' : 'Next'} day, ${shortIso(day)}`} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 8, height: 46, minWidth: 0, paddingHorizontal: 20, backgroundColor: C.raised, borderRadius: 999, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      {dir === 'prev' ? <Ico p={P.back!} size={17} color={C.lime} /> : null}
      <Text style={{ flexShrink: 1, color: C.white, fontSize: 13, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }} numberOfLines={1}>{[shortIso(day), stop].filter(Boolean).join(' · ')}</Text>
    </Pressable>
  );
}

/** Where you wake and where you sleep, as white station tickets (kanji above the name in Japan), the way between. */
export function StationCards({ from, to, look, mode, onOpen }: { from: ObjectRecord<StopData> | null; to: ObjectRecord<StopData>; look?: string; mode?: string; onOpen?: (s: ObjectRecord<StopData>) => void }) {
  const card = (s: ObjectRecord<StopData>) => {
    const kanji = look === 'japan' && s.data.localName ? s.data.localName : null;
    return (
      <Pressable key={s.id} accessibilityRole="button" accessibilityLabel={s.title} onPress={onOpen ? () => onOpen(s) : undefined} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, backgroundColor: C.white, borderRadius: 20, overflow: 'hidden' }}>
        <View style={{ paddingTop: 12, paddingHorizontal: 12, paddingBottom: 8 }}>
          {kanji ? <Text style={{ color: C.ink, fontSize: 28, lineHeight: 32, letterSpacing: 3, textAlign: 'center', fontFamily: JP_SANS, fontWeight: '900' }} numberOfLines={1}>{kanji}</Text> : null}
          <Text style={{ color: C.ink, fontSize: kanji ? 12 : 22, lineHeight: kanji ? 16 : 32, textAlign: 'center', fontFamily: 'PlusJakartaSans_800ExtraBold' }} numberOfLines={1}>{s.title}</Text>
        </View>
        <View style={{ height: 10, backgroundColor: stopHex(s) }} />
      </Pressable>
    );
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {from ? card(from) : null}
      {from ? (
        <View style={{ justifyContent: 'center', alignItems: 'center', flexShrink: 0, width: 36, height: 36, backgroundColor: C.lime, borderRadius: 18 }}>
          <Ico p={modeIcon(mode)} size={18} color={C.ink} />
        </View>
      ) : null}
      {card(to)}
    </View>
  );
}

/** LEAVE BY · ARRIVE · EACH, the journey's three numbers. */
export function JourneyStats({ e, raised, amt, local, fareLabel = 'EACH' }: { e: ObjectRecord<TravelEvent>; raised?: boolean; amt: Amt; local: string; fareLabel?: string }) {
  const cell = (label: string, value: string) => (
    <View key={label} style={{ flexDirection: 'column', gap: 4, minWidth: 0, flexGrow: 1, flexShrink: 1, flexBasis: 0 }}>
      <Text style={T.caps}>{label}</Text>
      <Text style={{ color: C.white, fontSize: 22, lineHeight: 26, letterSpacing: -0.5, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 12, padding: 16, backgroundColor: raised ? C.raised : C.tile, borderRadius: 24 }}>
      {cell('LEAVE BY', e.data.allDay || !e.data.startAt ? '–' : timeOf(e.data.startAt))}
      {cell('ARRIVE', e.data.endAt ? `≈${timeOf(e.data.endAt)}` : '–')}
      {cell(fareLabel, e.data.fare != null ? `${e.data.estimate ? '≈' : ''}${amt.fmt(e.data.fare, e.data.currency ?? local)}` : '–')}
    </View>
  );
}

interface StepItem {
  time: string | null;
  what: string;
  note: string | null;
  onPress?: () => void;
}

/** Times down the left, a dot on a line, what happens: the first one lit. */
export function Steps({ items }: { items: StepItem[] }) {
  return (
    <View style={{ flexDirection: 'column', minWidth: 0 }}>
      {items.map((s, k) => {
        const first = k === 0;
        const last = k === items.length - 1;
        const body = (
          <>
            <View style={{ flexShrink: 0, width: 58, paddingTop: 1 }}>
              <Text style={{ color: first ? C.lime : C.white, fontSize: 12, lineHeight: 18, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{s.time ?? ''}</Text>
            </View>
            <View style={{ flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 18, paddingTop: 4 }}>
              {first ? (
                <View style={{ justifyContent: 'center', alignItems: 'center', width: 18, height: 18, backgroundColor: 'rgba(215,245,92,0.25)', borderRadius: 9 }}>
                  <View style={{ width: 10, height: 10, backgroundColor: C.lime, borderRadius: 5 }} />
                </View>
              ) : (
                <View style={{ width: 10, height: 10, borderWidth: 1.5, borderColor: C.mid, borderRadius: 5 }} />
              )}
              {last ? null : <View style={{ flexGrow: 1, width: 1.5, marginTop: 4, backgroundColor: 'rgba(255,255,255,0.12)' }} />}
            </View>
            <View style={{ flexDirection: 'column', flexGrow: 1, flexShrink: 1, gap: 2, minWidth: 0, paddingBottom: last ? 0 : 18 }}>
              <Text style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }} numberOfLines={1}>{s.what}</Text>
              {s.note ? <Text style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: 'PlusJakartaSans_500Medium' }} numberOfLines={1}>{s.note}</Text> : null}
            </View>
          </>
        );
        return s.onPress ? (
          <Pressable key={k} accessibilityRole="button" accessibilityLabel={s.what} onPress={s.onPress} style={{ flexDirection: 'row', gap: 12, minWidth: 0 }}>{body}</Pressable>
        ) : (
          <View key={k} style={{ flexDirection: 'row', gap: 12, minWidth: 0 }}>{body}</View>
        );
      })}
    </View>
  );
}

/** A day's or a booking's flights, leg by leg. */
function FlightsTile({ ways, onOpen }: { ways: FlightTrip[]; onOpen: (id: string) => void }) {
  return (
    <Tile gap={4}>
      <CardHead title={ways.flatMap((w) => w.legs).length > 1 ? 'The flights' : 'The flight'} sub={ways.map((w) => `${w.from.city} → ${w.to.city}${w.via.length ? ` via ${w.via.join(', ')}` : ''}`).join(' · ')} />
      <Lines>
        {ways.flatMap((w) => w.legs).map((l) => (
          <Line key={l.e.id} icon={P.plane} color={C.lime} title={`${l.from.code ?? l.from.city} → ${l.to.code ?? l.to.city}`} sub={[l.e.data.flightNo, l.e.data.allDay ? null : `leaves ${timeOf(l.departAt)}`, l.landAt ? `lands ${timeOf(l.landAt)}${new Date(l.landAt).getDate() !== new Date(l.departAt).getDate() ? ` · ${shortDay(l.landAt)}` : ''}` : null].filter(Boolean).join(' · ')} onPress={() => onOpen(l.e.id)} />
        ))}
      </Lines>
    </Tile>
  );
}

/** The tile on an event: the season's or the kind's kanji on the stop's colour (an icon outside Japan). */
function HappeningMark({ e, day, japan, stop }: { e: ObjectRecord<OutingData>; day: string; japan: boolean; stop: ObjectRecord<StopData> | null }) {
  const m = new Date(`${day}T12:00:00`).getMonth();
  const season = m <= 1 || m === 11 ? '冬' : m <= 4 ? '春' : m <= 7 ? '夏' : '秋';
  const kanji = ({ festival: '祭', seasonal: season, closure: '休', crowds: '混', holiday: '祝', weather: m <= 1 || m === 11 ? '雪' : '雨' } as Record<string, string>)[e.data.happening ?? 'seasonal'] ?? season;
  const icon = ({ festival: P.sparkle, closure: P.lock, crowds: P.user, holiday: P.calendar, weather: P.waves } as Record<string, Shape[] | undefined>)[e.data.happening ?? ''] ?? P.leaf!;
  return (
    <View style={{ justifyContent: 'center', alignItems: 'center', flexShrink: 0, width: 40, height: 40, backgroundColor: stop ? stopHex(stop) : C.raised, borderRadius: 12 }}>
      {japan ? <Text style={{ color: C.ink, fontSize: 18, fontFamily: JP_SERIF, fontWeight: '800' }}>{kanji}</Text> : <Ico p={icon} size={18} color={stop ? C.ink : C.lime} />}
    </View>
  );
}

/** Tonight's stay: what is left to pay and how, check-in, getting there. */
function StayTile({ e, title, sub, amt, people, onOpen }: { e: ObjectRecord<TravelEvent>; title: string; sub: string; amt: Amt; people: number; onOpen: () => void }) {
  const m = moneyOf(e);
  return (
    <Tile gap={4}>
      <CardHead title={title} sub={sub} right={<Chip label="Booking" icon={P.chevron} h={28} onPress={onOpen} />} />
      <Lines>
        <Line icon={P.bed} color="#C99A6E" title={nameOf(e)} sub={e.data.location ?? null} right={<PayChip e={e} h={24} />} onPress={onOpen} />
        {m.total != null ? <Line icon={m.currency === 'JPY' ? P.yen : P.coins} color="#F26B2B" title={m.toPay > 0.5 ? `${amt.fmt(m.toPay, m.currency)} to pay` : 'Paid'} sub={[amt.alt(m.toPay > 0.5 ? m.toPay : m.total, m.currency), people > 1 && m.toPay > 0.5 ? `${amt.fmt(m.toPay / people, m.currency)} each` : null, e.data.payHow].filter(Boolean).join(' · ') || null} lines={2} /> : null}
        <Line icon={P.clock} color="#4CC9D4" title="Check-in" sub={e.data.checkIn ?? 'time missing · ask the copilot to look in your mail'} />
        {e.data.checkOut ? <Line icon={P.clock} color="#4CC9D4" title="Check-out" sub={e.data.checkOut} /> : null}
        {e.data.access ? <Line icon={P.pin2} color="#5FD08A" title="Getting there" sub={e.data.access} lines={3} /> : null}
      </Lines>
    </Tile>
  );
}

/** The journey in full (a day's Travel tab and a journey's booking page). */
export function JourneyBody({ e, trip, from, to, checkOut, checkIn, amt, showStats = true }: { e: ObjectRecord<TravelEvent>; trip: ObjectRecord<TripData>; from: ObjectRecord<StopData> | null; to: ObjectRecord<StopData> | null; checkOut: ObjectRecord<TravelEvent> | null; checkIn: ObjectRecord<TravelEvent> | null; amt: Amt; showStats?: boolean }) {
  const router = useRouter();
  const local = trip.data.localCurrency ?? 'INR';
  const leg = longLeg(e);
  const steps = stepsOf(e);
  const margin = connectionMargin(e);
  const seatsIn = e.data.seatsOpenAt ? Math.ceil((e.data.seatsOpenAt - Date.now()) / 86_400_000) : null;
  const booked = e.data.plan === 'booked';
  const book = e.data.book ?? [];
  const directions = `https://www.google.com/maps/dir/?api=1&travelmode=transit&origin=${encodeURIComponent(from?.title ?? e.title.split(' → ')[0] ?? '')}&destination=${encodeURIComponent(to?.title ?? e.title.split(' → ')[1] ?? '')}`;
  const timeBox = (t: string, label: string) => (
    <View style={{ alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: 0, gap: 2, minWidth: 0, paddingVertical: 12, paddingHorizontal: 8, borderWidth: 1.5, borderColor: 'rgba(245,245,247,0.18)', borderRadius: 20 }}>
      <Text style={{ color: C.white, fontSize: 34, lineHeight: 38, letterSpacing: -1, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{t}</Text>
      <Text style={{ color: C.low, fontSize: 9, letterSpacing: 1, fontVariant: ['tabular-nums'], fontFamily: MONO }} numberOfLines={1}>{label.toUpperCase()}</Text>
    </View>
  );
  const rows = [
    checkOut ? <Line key="out" icon={P.home} title={`Check out · ${nameOf(checkOut)}`} sub={checkOut.data.checkOut ?? (e.data.startAt && !e.data.allDay ? `by ${timeOf(e.data.startAt)}` : 'time not known')} minHeight={50} onPress={() => router.push(tripRoutes.booking(checkOut.id))} /> : null,
    checkIn ? <Line key="in" icon={P.bed} color={checkIn.data.stopId && to ? stopHex(to) : '#C99A6E'} title={`Check in · ${nameOf(checkIn)}`} sub={checkIn.data.checkIn ?? 'check-in time missing'} minHeight={50} onPress={() => router.push(tripRoutes.booking(checkIn.id))} /> : null,
    e.data.bookNote || book.length ? <Line key="book" icon={P.ticket} color={C.lime} title={booked ? 'Booked' : `Book ahead${book[0] ? ` · ${book[0].label.replace(/^(reserve|book)\s+(the\s+)?/i, '')}` : ''}`} sub={e.data.bookNote ?? null} minHeight={50} right={booked ? <Chip label="booked" tone="lime" /> : seatsIn != null && seatsIn > 0 ? <Chip label={`in ${seatsIn} d`} tone="lime" /> : seatsIn != null ? <Chip label="open now" tone="yellow" /> : null} onPress={book[0] ? () => openUrl(book[0]!.url) : undefined} /> : null,
    e.data.lastConnection ? <Line key="last" icon={P.bus} color="#FF5C47" title="Last connection" sub={e.data.lastConnection.replace(/^last connection[:\s]*/i, '')} minHeight={50} right={margin != null && margin <= 240 ? <Chip label="tight" tone="coral" /> : margin != null ? <Chip label={`${Math.floor(margin / 60)} h spare`} /> : null} /> : null,
  ].filter(Boolean);

  return (
    <>
      {showStats ? (
        <Anim k="jr" delay={110} style={{ minWidth: 0 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="The journey's page" onPress={() => router.push(tripRoutes.booking(e.id))}>
            <JourneyStats e={e} amt={amt} local={local} fareLabel="FARE EACH" />
          </Pressable>
        </Anim>
      ) : null}
      {leg ? (
        <Anim k="jr" delay={170} style={{ minWidth: 0 }}>
          <Tile gap={10}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <Text style={[T.caps, { flexShrink: 1 }]} numberOfLines={1}>{`THE LONG LEG · ${leg.what.toUpperCase()}`}</Text>
              <Text style={{ color: C.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold', flexShrink: 0 }} numberOfLines={1}>{[`≈ ${leg.minutes >= 90 ? `${Math.round(leg.minutes / 60)} h` : `${leg.minutes} min`}`, book.length && !booked ? 'reserve' : booked ? 'booked' : null].filter(Boolean).join(' · ')}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {timeBox(leg.leave, leg.from ?? 'leave')}
              <View style={{ justifyContent: 'center', alignItems: 'center', flexShrink: 0, width: 28, height: 28, marginHorizontal: -10, zIndex: 1, backgroundColor: C.lime, borderWidth: 4, borderColor: C.tile, borderRadius: 14 }}>
                <Ico p={P.chevron!} size={14} color={C.ink} />
              </View>
              {timeBox(leg.arrive, `${leg.to ?? 'arrive'} · est.`)}
            </View>
          </Tile>
        </Anim>
      ) : null}
      {rows.length ? (
        <Anim k="jr" delay={230} style={{ minWidth: 0 }}>
          <Tile r={24} pad={14} gap={8}>
            <Lines>{rows}</Lines>
          </Tile>
        </Anim>
      ) : null}
      {steps.length ? (
        <Anim k="jr" delay={290} style={{ minWidth: 0 }}>
          <Tile gap={12}>
            <CardHead title="Step by step" sub="times estimated · check the night before" />
            <Steps items={steps.map((s) => ({ ...s, time: s.time }))} />
          </Tile>
        </Anim>
      ) : null}
      {e.data.notes ? (
        <Anim k="jr" delay={350} style={{ minWidth: 0 }}>
          <Tile r={24} gap={8}>
            <CardHead title="Route notes" sub="from the trip notes" />
            <Text style={{ color: C.mid, fontSize: 14, lineHeight: 20, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_500Medium' }}>{e.data.notes}</Text>
          </Tile>
        </Anim>
      ) : null}
      {book.length > 1 ? (
        <Anim k="jr" delay={380} style={{ minWidth: 0 }}>
          <Tile r={24} pad={14} gap={4}>
            <Text style={[T.caps, { paddingHorizontal: 2, paddingTop: 2 }]}>LINKS TO BOOK</Text>
            <Lines>{book.map((b) => <Line key={b.url} icon={P.link} color="#6CC6FF" title={b.label} sub={b.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]} onPress={() => openUrl(b.url)} />)}</Lines>
          </Tile>
        </Anim>
      ) : null}
      <Anim k="jr" delay={410} style={{ minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {book[0] && !booked ? <Btn title={book[0].label} icon={P.ticket} onPress={() => openUrl(book[0]!.url)} /> : <Btn title="Open the route" icon={P.external} onPress={() => openUrl(directions)} />}
          <RoundIcon icon={P.pencil!} label="Edit the journey" onPress={() => router.push(`/entity/event/${e.id}/edit` as never)} />
          {book[0] && !booked ? <RoundIcon icon={P.external!} label="Route planner" onPress={() => openUrl(directions)} /> : null}
        </View>
      </Anim>
    </>
  );
}
