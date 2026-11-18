import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { tripPhase, type TripData } from '@modules/travel';
import { BookingsScreen } from '../bookings';
import { MoneyScreen } from '../money';
import { PlanScreen } from '../plan';
import { PrepScreen } from '../prep';
import { OverviewPage } from './overview';
import { RecapPage } from './recap';
import { TodayPage } from './today';
import { C, forgetHost, registerFocusedHost, takePendingSection, TripBar, TripHostContext, type Section, type TripHostApi } from './shell';

/**
 * The trip as one screen with real tabs (ADHOC 18 Nov, "it still works like a
 * slideshow"): Overview, Plan, Bookings, Money and Prep live side by side in
 * this one screen and the trip bar is drawn once over them. A tap shows the
 * section in place: nothing navigates, a section opened once stays alive (its
 * scroll and state kept), and it fades in over 140 ms. Links between sections
 * switch the tab here too (`goTrip`); a stop, a day or a booking still opens on
 * top, and its trip bar comes back here on the section asked for.
 */

const native = Platform.OS !== 'web';

function OverviewSection({ tripId, ctx }: { tripId: string; ctx: LifeOSContext }) {
  const trip = useLive((os) => os.records.get<TripData>(tripId), [tripId]);
  if (!trip || trip.object !== 'trip') return null;
  const phase = tripPhase(trip.data);
  if (phase === 'away') return <TodayPage trip={trip} ctx={ctx} />;
  if (phase === 'back') return <RecapPage trip={trip} ctx={ctx} />;
  return <OverviewPage trip={trip} ctx={ctx} />;
}

function Pane({ on, children }: { on: boolean; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    if (on) {
      v.setValue(0);
      Animated.timing(v, { toValue: 1, duration: 140, useNativeDriver: native }).start();
    }
  }, [on, v]);
  return (
    <Animated.View pointerEvents={on ? 'auto' : 'none'} style={[StyleSheet.absoluteFill, { opacity: v, display: on ? 'flex' : 'none' }]}>
      {children}
    </Animated.View>
  );
}

export function TripHost({ tripId, ctx, initial = 'overview', initialParams = {}, href }: { tripId: string; ctx: LifeOSContext; initial?: Section; initialParams?: Record<string, string>; href: Record<string, unknown> }) {
  const [tab, setTab] = useState<Section>(initial);
  // Each section's params and a key that changes when they do (so Money opens on Settle up when asked).
  const [state, setState] = useState<Record<string, { params: Record<string, string>; key: number }>>({ [initial]: { params: initialParams, key: 0 } });
  const show = useCallback((next: Section, params?: Record<string, string>) => {
    setState((s) => {
      const cur = s[next];
      const changed = params && Object.keys(params).length && JSON.stringify(params) !== JSON.stringify(cur?.params ?? {});
      if (cur && !changed) return s;
      return { ...s, [next]: { params: params ?? cur?.params ?? {}, key: (cur?.key ?? 0) + (changed ? 1 : 0) } };
    });
    setTab(next);
  }, []);
  const api = useMemo<TripHostApi>(() => ({ tripId, tab, show }), [tripId, tab, show]);
  useFocusEffect(
    useCallback(() => {
      registerFocusedHost(api, href);
      const p = takePendingSection(tripId);
      if (p) show(p.tab, p.params);
      return () => registerFocusedHost(null);
    }, [api, href, tripId, show]),
  );
  useEffect(() => () => forgetHost(tripId), [tripId]);

  const render = (s: Section, params: Record<string, string>) => {
    const p = { trip: tripId, ...params };
    if (s === 'overview') return <OverviewSection tripId={tripId} ctx={ctx} />;
    if (s === 'plan') return <PlanScreen ctx={ctx} params={p} />;
    if (s === 'bookings') return <BookingsScreen ctx={ctx} params={p} />;
    if (s === 'money') return <MoneyScreen ctx={ctx} params={p} />;
    return <PrepScreen ctx={ctx} params={p} />;
  };

  return (
    <TripHostContext.Provider value={api}>
      <View style={{ flex: 1, backgroundColor: C.ink }}>
        {(Object.keys(state) as Section[]).map((s) => (
          <Pane key={`${s}:${state[s]!.key}`} on={s === tab}>
            {render(s, state[s]!.params)}
          </Pane>
        ))}
        <TripBar tripId={tripId} active={tab} />
      </View>
    </TripHostContext.Provider>
  );
}

/** A section's route (/module/travel/plan?trip=…) opens the trip's host on that section. */
export function sectionRoute(section: Exclude<Section, 'overview'>) {
  return function SectionRoute({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
    const { trip = '', via: _via, ...rest } = params;
    const href = useMemo(() => ({ pathname: '/module/[id]/[page]', params: { id: 'travel', page: section, trip } }), [trip]);
    return <TripHost key={trip} tripId={trip} ctx={ctx} initial={section} initialParams={rest} href={href} />;
  };
}
