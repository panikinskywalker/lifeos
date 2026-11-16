import React, { type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { tripPhase, tripsTo, type TripData } from '@modules/travel';
import { Chip28, datesLabel, Disc, plural, routes, Row, RowCard, SectionHead, whenShort } from './parts';
import { OverviewPage } from './jp/overview';
import { TodayPage } from './jp/today';
import { RecapPage } from './jp/recap';

/**
 * The Trip page (the whole record page, the trip template): before the trip
 * its Overview (JP-Overview), while away Today (JP-Today), after it the Recap
 * (JP-Recap). Each page fills the screen itself with the trip bar. Plus
 * *Trips here* on a Place's page.
 */

type Props = { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: ReactNode }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function TripPage({ entity, ctx }: Props) {
  const trip = useLive((os) => os.records.get<TripData>(entity.id), [entity.id, entity.version]);
  if (!trip) return null;
  const phase = tripPhase(trip.data);
  if (phase === 'away') return <TodayPage trip={trip} ctx={ctx} />;
  if (phase === 'back') return <RecapPage trip={trip} ctx={ctx} />;
  return <OverviewPage trip={trip} ctx={ctx} />;
}

/** Trips here, on a Place's page (the Trip's *to* Link). */
export function TripsHere({ entity }: Props) {
  const router = useRouter();
  const t = useTheme();
  const list = useLive((os) => tripsTo(os, entity.id), [entity.id]);
  if (!list.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Trips here" sub={plural(list.length, 'trip')} />
      <RowCard>
        {list.map((x) => {
          const when = whenShort(x.data);
          return <Row key={x.id} lead={<Disc icon="plane" color={t.tints.travel.ink} />} title={x.title} sub={datesLabel(x.data)} trailing={when ? <Chip28 label={when} /> : null} onPress={() => router.push(routes.trip(x.id) as never)} />;
        })}
      </RowCard>
    </View>
  );
}
