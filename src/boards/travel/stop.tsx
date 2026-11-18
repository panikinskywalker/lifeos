// own-glyphs: this screen draws the trip template's inline icons (JP-Parts), not the kit's icon set.
import React, { useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { RecordControls } from '@core/registry/types';
import type { ObjectRecord as Rec } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useToast } from '@ui/kit';
import { addToLine, CROWD_HOURS, crowdBars, dayMonth, legMode, legTimes, nightsOf, planLegs, quietestThing, quietHours, stopsOf, stopSpan, thingsAt, type StopData, type TripData } from '@modules/travel';
import { C, RoundButton, TripScreen, isJapan, tripRoutes, goTrip } from './jp/shell';
import { Anim, MONO, JP_SANS } from './jp/kit';
import { openLink, stopHex } from './jp/planparts';
import { PlaceSheet, StationBoard, useCost } from './plan';
import { CardHead, Chip, CrowdMeter, Glyph, N, PillButton, StopEvents, ThingsSection } from './things';

/**
 * A stop's page (the trip template; JP-Place): its station board with the
 * stops either side, what it is with its nights and stay, the legs getting
 * here and moving on (each opens its day's journey), its things to do, a
 * bookable activity through the copilot, the quietest time to visit, the
 * events on its dates, Google Maps. The pencil opens the place sheet (JP-Edit).
 */

type Props = { entity: Rec<any>; ctx: LifeOSContext; controls?: RecordControls }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function StopPage({ entity, ctx, controls }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const d = useLive(
    (os) => {
      const stop = os.records.get<StopData>(entity.id);
      if (!stop?.data.tripId) return null;
      const trip = os.records.get<TripData>(stop.data.tripId);
      if (!trip) return null;
      const line = stopsOf(os, trip.id);
      const nights = nightsOf(os, trip);
      const stays = [...new Set(nights.filter((n) => n.stopId === stop.id && n.stayId).map((n) => n.stayId!))].map((id) => os.records.get(id)).filter((x): x is Rec => !!x);
      const pin = stop.data.placeId ? os.records.get<{ coordinates?: { lat: number; lng: number } }>(stop.data.placeId)?.data.coordinates ?? null : null;
      const i = line.findIndex((s) => s.id === stop.id);
      const legs = planLegs(os, trip.id, line, nights);
      return { stop, trip, line, i, span: stopSpan(nights, stop.id), stays, pin, before: i > 0 ? legs[i - 1] ?? null : null, after: i >= 0 ? legs[i] ?? null : null, things: thingsAt(os, stop) };
    },
    [entity.id, entity.version],
  );
  const cost = useCost(d?.trip);
  if (!d) return <View style={{ flex: 1, backgroundColor: C.ink }} />;
  const { stop, trip, line, i } = d;
  const japan = isJapan(trip);
  const prev = i > 0 ? line[i - 1] : null;
  const next = i >= 0 && i < line.length - 1 ? line[i + 1] : null;
  const go = (id: string) => router.replace(tripRoutes.stop(id));
  const back = () => (controls ? controls.back() : router.canGoBack() ? router.back() : goTrip(router, tripRoutes.plan(trip.id)));
  const c = stopHex(stop);
  const eyebrow = stop.data.kind === 'stop' && i >= 0 ? `PLACE · STOP ${i + 1} OF ${line.length}` : stop.data.kind === 'idea' ? 'PLACE · IDEA, NOT ON THE LINE' : 'PLACE · AIRPORT';
  const where = d.pin ? `${d.pin.lat},${d.pin.lng}` : `${stop.title} ${trip.data.destination ?? ''}`;
  const quiet = quietestThing(d.things);
  const stayName = (s: Rec) => s.title.replace(/^Stay · /, '');

  return (
    <TripScreen tripId={trip.id} active="plan">
      <Anim k="jr" delay={50} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 4 }}>
        <RoundButton label="Back" onPress={back}>
          <Glyph name="back" size={18} />
        </RoundButton>
        <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
          <RNText numberOfLines={1} style={{ color: N.mid, fontSize: 10, letterSpacing: 2, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{eyebrow}</RNText>
          <RNText numberOfLines={1} style={{ color: C.white, fontSize: 20, lineHeight: 24, fontFamily: 'PlusJakartaSans_700Bold' }}>{[stop.title, japan ? stop.data.localName : null].filter(Boolean).join(' ')}</RNText>
        </View>
        <RoundButton label="Edit place" onPress={() => setEditing(true)}>
          <Glyph name="pencil" size={18} />
        </RoundButton>
      </Anim>

      <Anim k="jr" delay={110}>
        <StationBoard stop={stop} index={i >= 0 ? i : null} japan={japan} prev={prev} next={next} onPrev={() => prev && go(prev.id)} onNext={() => next && go(next.id)} />
      </Anim>

      <Anim k="jr" delay={170} style={{ gap: 10, padding: 16, backgroundColor: N.tile, borderRadius: 24, overflow: 'hidden' }}>
        {stop.data.about ? <RNText style={{ color: N.mid, fontSize: 14, lineHeight: 20, fontFamily: 'PlusJakartaSans_500Medium' }}>{stop.data.about}</RNText> : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          {d.span ? (
            <>
              <Chip icon="calendar" label={rangeLabel(d.span.from, d.span.to)} />
              <Chip icon="bed" label={`${d.span.nights} ${d.span.nights === 1 ? 'night' : 'nights'}`} />
            </>
          ) : (
            <Chip icon="bed" label={stop.data.kind === 'stop' ? 'no nights booked here yet' : 'not on the line'} />
          )}
          {d.stays.map((s) => <Chip key={s.id} label={stayName(s)} onPress={() => router.push(tripRoutes.stay(s.id))} a11y={`The stay, ${stayName(s)}`} />)}
        </View>
        {stop.data.kind !== 'stop' ? (
          <View style={{ flexDirection: 'row' }}>
            <PillButton label="Add to the line" icon="plus" kind="lime" height={46} onPress={() => toast.show({ message: `${stop.title} is on the line`, icon: 'check', undo: addToLine(ctx, stop.id) })} />
          </View>
        ) : null}
      </Anim>

      {prev || next ? (
        <Anim k="jr" delay={230} style={{ gap: 12, padding: 16, backgroundColor: N.tile, borderRadius: 28, overflow: 'hidden' }}>
          <CardHead title="Getting here and moving on" sub="the legs either side" />
          <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 8 }}>
            {prev ? <LegCard eyebrow={`FROM ${prev.title.toUpperCase()}`} from={prev} to={stop} leg={d.before} japan={japan} cost={cost} onPress={() => d.before?.day && router.push(tripRoutes.day(trip.id, d.before.day, 'travel'))} /> : null}
            {next ? <LegCard eyebrow={`ON TO ${next.title.toUpperCase()}`} from={stop} to={next} leg={d.after} japan={japan} cost={cost} onPress={() => d.after?.day && router.push(tripRoutes.day(trip.id, d.after.day, 'travel'))} /> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {prev ? <PillButton label={prev.title} icon="back" height={40} onPress={() => go(prev.id)} a11y={`Previous stop, ${prev.title}`} /> : null}
            {next ? <PillButton label={next.title} height={40} onPress={() => go(next.id)} a11y={`Next stop, ${next.title}`} /> : null}
          </View>
        </Anim>
      ) : null}

      <Anim k="jr" delay={290}>
        <ThingsSection stop={stop} ctx={ctx} cost={(n) => cost(n)} stops={line.length ? line : [stop]} />
      </Anim>

      {d.span ? (
        <Anim k="jr" delay={350}>
          <Pressable accessibilityRole="button" onPress={() => router.push(tripRoutes.copilot(trip.id, `Find a bookable activity in ${stop.title} for ${dayMonth(d.span!.from)}`))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: N.tile, borderRadius: 24, opacity: pressed ? 0.85 : 1 })}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: N.limeSoft, alignItems: 'center', justifyContent: 'center' }}>
              <Glyph name="sparkle" size={18} color={N.lime} />
            </View>
            <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
              <RNText style={{ color: C.white, fontSize: 15, fontFamily: 'PlusJakartaSans_700Bold' }}>Find a bookable activity</RNText>
              <RNText numberOfLines={1} style={{ color: N.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_400Regular' }}>{`live on Booking.com, for ${dayMonth(d.span.from)}`}</RNText>
            </View>
            <Glyph name="chevron" size={18} color={N.low} />
          </Pressable>
        </Anim>
      ) : null}

      {quiet ? (
        <Anim k="jr" delay={410}>
          <QuietCard title={quiet.title} crowd={quiet.data.crowd} quietest={quiet.data.quietest!} />
        </Anim>
      ) : null}

      <Anim k="jr" delay={470}>
        <StopEvents stop={stop} ctx={ctx} color={c} japan={japan} />
      </Anim>

      <Anim k="jr" delay={530} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <PillButton label="Show on Google Maps" icon="map" kind="lime" onPress={() => openLink(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`)} />
        <PillButton icon="nav" a11y="Directions" grow={false} onPress={() => openLink(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}`)} />
      </Anim>

      <PlaceSheet visible={editing} onClose={() => setEditing(false)} ctx={ctx} trip={trip} stop={stop} line={line} onDeleted={() => goTrip(router, tripRoutes.plan(trip.id))} />
    </TripScreen>
  );
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "26–27 Dec", or across months "31 Dec – 3 Jan". */
function rangeLabel(from: string, to: string) {
  const m = (x: string) => MON[Number(x.slice(5, 7)) - 1];
  const dd = (x: string) => Number(x.slice(8, 10));
  return m(from) === m(to) ? `${dd(from)}–${dd(to)} ${m(to)}` : `${dd(from)} ${m(from)} – ${dd(to)} ${m(to)}`;
}

/** A leg's card: where from and to (in the place's script), the day and times, the fare each. */
function LegCard({ eyebrow, from, to, leg, japan, cost, onPress }: { eyebrow: string; from: Rec<StopData>; to: Rec<StopData>; leg: ReturnType<typeof planLegs>[number] | null; japan: boolean; cost: (n: number, cur?: string) => string; onPress: () => void }) {
  const j = leg?.journey ?? null;
  const name = (s: Rec<StopData>) => (japan && s.data.localName ? s.data.localName : s.title);
  const when = [leg?.day ? dayMonth(leg.day) : null, j ? legTimes({ data: { ...j.data, takes: undefined } }) : null].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${from.title} to ${to.title}${leg?.day ? `, ${dayMonth(leg.day)}` : ''}`} disabled={!leg?.day} onPress={onPress} style={({ pressed }) => ({ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, gap: 6, padding: 12, backgroundColor: N.raised, borderRadius: 20, opacity: pressed ? 0.85 : 1 })}>
      <RNText numberOfLines={1} style={{ color: N.low, fontSize: 9, letterSpacing: 1, fontFamily: MONO }}>{eyebrow}</RNText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <RNText numberOfLines={1} style={{ flexShrink: 1, color: C.white, fontSize: 15, fontFamily: japan && from.data.localName ? JP_SANS : 'PlusJakartaSans_800ExtraBold', fontWeight: '900' }}>{name(from)}</RNText>
        <Glyph name={legMode(j) === 'bus' ? 'bus' : legMode(j) === 'plane' ? 'plane' : 'train'} size={13} color={N.mid} />
        <RNText numberOfLines={1} style={{ flexShrink: 1, color: C.white, fontSize: 15, fontFamily: japan && to.data.localName ? JP_SANS : 'PlusJakartaSans_800ExtraBold', fontWeight: '900' }}>{name(to)}</RNText>
      </View>
      <RNText numberOfLines={1} style={{ color: N.mid, fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{when || 'no journey yet'}</RNText>
      {j?.data.fare != null ? <RNText numberOfLines={1} style={{ color: C.white, fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_700Bold' }}>{`${cost(j.data.fare, j.data.currency)} each`}</RNText> : null}
    </Pressable>
  );
}

/** The quietest time to visit: a typical day's crowd by the hour, the quiet hours lit. */
function QuietCard({ title, crowd, quietest }: { title: string; crowd?: number; quietest: string }) {
  const bars = crowdBars(crowd);
  const quiet = new Set(quietHours(quietest) ?? []);
  const firstQuiet = CROWD_HOURS.find((h) => quiet.has(h) && h > 12);
  const labels = [8, 12, firstQuiet ?? null, 19].filter((h): h is number => h != null);
  return (
    <View style={{ gap: 10, padding: 16, backgroundColor: N.tile, borderRadius: 28, overflow: 'hidden' }}>
      <CardHead title="Quietest time to visit" sub={`${title} · ${quietest.replace(/^\w/, (x) => x.toLowerCase())}`} right={crowd ? <CrowdMeter n={crowd} /> : undefined} />
      <View accessibilityLabel={`A typical day at ${title}: quietest ${quietest}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 56 }}>
        {bars.map((v, k) => (
          <View key={k} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: '100%', justifyContent: 'flex-end' }}>
            <Anim k="jrise" delay={k * 30} style={{ height: `${Math.round(v * 100)}%`, borderRadius: 4, backgroundColor: quiet.has(CROWD_HOURS[k]!) ? N.lime : N.bar }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {CROWD_HOURS.map((h) => (
          <View key={h} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, alignItems: 'center' }}>
            {labels.includes(h) ? <RNText style={{ color: h === firstQuiet ? N.lime : N.low, fontSize: 10, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{String(h).padStart(2, '0')}</RNText> : null}
          </View>
        ))}
      </View>
    </View>
  );
}
