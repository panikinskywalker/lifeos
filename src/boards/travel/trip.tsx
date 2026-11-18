import React, { useMemo, type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { tripPhase, tripsTo, type TripData } from '@modules/travel';
import { Chip28, datesLabel, Disc, plural, routes, Row, RowCard, SectionHead, whenShort } from './parts';
import { TripHost } from './jp/host';

/**
 * The Trip page (the whole record page, the trip template): before the trip
 * its Overview (JP-Overview), while away Today (JP-Today), after it the Recap
 * (JP-Recap). Each page fills the screen itself with the trip bar. Plus
 * *Trips here* on a Place's page.
 */

type Props = { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: ReactNode }; // eslint-disable-line @typescript-eslint/no-explicit-any

export function TripPage({ entity, ctx }: Props) {
  // The trip is one screen with real tabs (jp/host.tsx): Overview first.
  const href = useMemo(() => ({ pathname: '/entity/[type]/[id]', params: { type: 'trip', id: entity.id } }), [entity.id]);
  return <TripHost key={entity.id} tripId={entity.id} ctx={ctx} initial="overview" href={href} />;
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
