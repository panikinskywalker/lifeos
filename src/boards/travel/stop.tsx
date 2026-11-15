import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { RecordControls } from '@core/registry/types';
import type { ObjectRecord as Rec } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Icon, IconButton, Screen, Text, useToast } from '@ui/kit';
import { addToLine, nightsOf, stopSpan, stopsOf, type StopData, type TripData } from '@modules/travel';
import { datesLabel, plural, Row, RowCard, SectionHead } from './parts';
import { planRoute, StopDisc, stopHex } from './plan';

/**
 * A stop's page (the trip template, R7g slice 1; JP-Place): its mark and
 * names, prev / next along the line, what it is, its nights and stays, the
 * stops either side, its Place. Things to do and the legs' journeys come with
 * the next slices.
 */

type Props = { entity: Rec<any>; ctx: LifeOSContext; controls?: RecordControls }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function StopPage({ entity, ctx, controls }: Props) {
  const router = useRouter();
  const toast = useToast();
  const t = useTheme();
  const d = useLive(
    (os) => {
      const stop = os.records.get<StopData>(entity.id);
      if (!stop?.data.tripId) return null;
      const trip = os.records.get<TripData>(stop.data.tripId);
      if (!trip) return null;
      const line = stopsOf(os, trip.id);
      const nights = nightsOf(os, trip);
      const stays = [...new Set(nights.filter((n) => n.stopId === stop.id && n.stayId).map((n) => n.stayId!))].map((id) => os.records.get<{ startAt?: number; endAt?: number }>(id)!).filter(Boolean);
      const place = stop.data.placeId ? os.records.get(stop.data.placeId) : null;
      return { stop, trip, line, span: stopSpan(nights, stop.id), stays, place };
    },
    [entity.id, entity.version],
  );
  if (!d) return null;
  const { stop, trip, line } = d;
  const i = line.findIndex((s) => s.id === stop.id);
  const prev = i > 0 ? line[i - 1] : undefined;
  const next = i >= 0 && i < line.length - 1 ? line[i + 1] : undefined;
  const look = trip.data.look;
  const go = (id: string) => router.replace(`/entity/stop/${id}` as never);
  const back = () => (controls ? controls.back() : router.back());
  const c = stopHex(stop);
  const eyebrow = stop.data.kind === 'stop' && i >= 0 ? `STOP ${i + 1} OF ${line.length}` : stop.data.kind === 'idea' ? 'IDEA · NOT ON THE LINE' : 'AIRPORT';
  return (
    <Screen title={stop.title} subtitle={eyebrow} onBack={back} right={controls ? <IconButton icon="edit" accessibilityLabel="Edit the stop" onPress={controls.edit} /> : undefined} contentStyle={{ gap: 14 }}>
      <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: '#F5F5F7' }}>
        <View style={{ alignItems: 'center', paddingTop: 22, paddingBottom: 12, gap: 2 }}>
          {look === 'japan' && stop.data.localName ? <Text style={{ fontSize: 48, lineHeight: 56, fontWeight: '900', letterSpacing: 6, color: '#0B0B0D' }}>{stop.data.localName}</Text> : <StopDisc stop={stop} look={look} size={64} />}
          <Text style={{ fontSize: 17, fontWeight: '800', letterSpacing: 1, color: '#0B0B0D' }}>{stop.title}</Text>
        </View>
        <View style={{ height: 30, backgroundColor: c, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0B0B0D' }}>{prev ? `← ${prev.title}` : ''}</Text>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0B0B0D' }}>{next ? `${next.title} →` : ''}</Text>
        </View>
      </View>
      {stop.data.kind === 'stop' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title="Previous" icon="chevron-left" variant="secondary" size="sm" disabled={!prev} onPress={() => prev && go(prev.id)} style={{ flex: 1 }} />
          <Button title="Next" icon="chevron-right" variant="secondary" size="sm" disabled={!next} onPress={() => next && go(next.id)} style={{ flex: 1 }} />
        </View>
      ) : (
        <Button title="Add to the line" icon="plus" onPress={() => toast.show({ message: `${stop.title} is on the line`, icon: 'check', undo: addToLine(ctx, stop.id) })} />
      )}
      {stop.data.about ? <Text style={{ fontSize: 15, lineHeight: 22, paddingHorizontal: 4 }}>{stop.data.about}</Text> : null}

      <View style={{ gap: 10 }}>
        <SectionHead title="Nights here" sub={d.span ? `${datesLabel({ startDate: d.span.from, endDate: d.span.to })} · ${plural(d.span.nights, 'night')}` : 'None booked yet'} />
        <RowCard>
          {d.stays.length ? (
            d.stays.map((s) => <Row key={s.id} lead={<Icon name="moon" size={18} color={c} />} title={s.title.replace(/^Stay · /, '')} sub={s.data.startAt ? datesLabel({ startDate: isoDay(s.data.startAt), endDate: s.data.endAt ? isoDay(s.data.endAt) : undefined }) : null} onPress={() => router.push(`/entity/event/${s.id}` as never)} />)
          ) : (
            <Text variant="caption" color="secondary" style={{ paddingVertical: 10 }}>A stay booked here (from mail or by hand) gives the stop its nights.</Text>
          )}
        </RowCard>
      </View>

      {prev || next ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Getting here and moving on" sub="The stops either side" />
          <RowCard>
            {prev ? <Row lead={<StopDisc stop={prev} look={look} />} title={`From ${prev.title}`} onPress={() => go(prev.id)} /> : null}
            {next ? <Row lead={<StopDisc stop={next} look={look} />} title={`On to ${next.title}`} onPress={() => go(next.id)} /> : null}
          </RowCard>
        </View>
      ) : null}

      <RowCard>
        <Row lead={<Icon name="plane" size={18} color={t.c.fg.secondary} />} title={trip.title} sub="The trip" onPress={() => router.push(`/entity/trip/${trip.id}` as never)} />
        <Row lead={<Icon name="map" size={18} color={t.c.fg.secondary} />} title="The line" sub="Map · Line · Days" onPress={() => router.push(planRoute(trip.id) as never)} />
        {d.place ? <Row lead={<Icon name="location" size={18} color={t.c.fg.secondary} />} title={d.place.title} sub="Its Place: the pin and what’s around" onPress={() => router.push(`/entity/place/${d.place!.id}` as never)} /> : null}
      </RowCard>
    </Screen>
  );
}

const isoDay = (at: number) => {
  const x = new Date(at);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

