import React from 'react';
import { Text, View } from 'react-native';
import type { LifeOSContext } from '@core/registry/context';
import type { TripData } from '@modules/travel';
import { useLive } from '@ui/hooks';
import { C } from './shell';
import { TodayPage } from './today';
import { RecapPage } from './recap';

/**
 * Dev preview: a trip page as it looks at another moment
 * (`/module/travel/jpphase?trip=<id>&at=<local ISO time>&view=today|recap`;
 * the route's own `page` segment shadows a `page` query, so `view` names the page).
 * Removed before shipping.
 */
export function PhasePreviewScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const trip = useLive((os) => {
    const t = os.records.get<TripData>(params.trip ?? '');
    return t?.object === 'trip' ? t : null;
  }, [params.trip]);
  const at = params.at ? new Date(params.at).getTime() : NaN;
  if (!trip || Number.isNaN(at)) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, padding: 24, justifyContent: 'center' }}>
        <Text style={{ color: C.white, fontSize: 15, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{!trip ? 'No such trip.' : 'Give a time: ?at=2026-12-24T08:30:00'}</Text>
      </View>
    );
  }
  return (params.view ?? params.page) === 'recap' ? <RecapPage trip={trip} ctx={ctx} now={at} /> : <TodayPage trip={trip} ctx={ctx} now={at} />;
}
