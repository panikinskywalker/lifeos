import React, { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import type { LifeOSContext } from '@core/registry/context';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Screen, Text, useToast } from '@ui/kit';
import { importTripApp, isTripAppSnapshot, type TripAppImport, type TripAppSnapshot } from '@modules/travel';
import { Caps, datesLabel, Note, plural, Row, RowCard } from './parts';

/**
 * Import a trip (the trip template, R7g): a trip app's export file, shared or
 * picked on the phone, brought in once (MODEL.md layer 2, *The Japan trip
 * comes from the Japan app's data*). Importing it again updates what it made.
 */

export const importRoute = '/module/travel/import';

export function ImportTripScreen({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const t = useTheme();
  const [snap, setSnap] = useState<TripAppSnapshot | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<TripAppImport | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/travel/index' as never));

  const pick = async () => {
    setError(null);
    setDone(null);
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', '*/*'], copyToCacheDirectory: true });
    if (r.canceled || !r.assets[0]) return;
    try {
      const a = r.assets[0];
      const text = Platform.OS === 'web' ? await (await fetch(a.uri)).text() : await new File(a.uri).text();
      const parsed = JSON.parse(text) as unknown;
      if (!isTripAppSnapshot(parsed)) return setError('That file isn’t a trip app’s export.');
      setSnap(parsed);
      setMe(parsed.meta.travellers?.[0] ?? null);
    } catch {
      setError('Couldn’t read that file.');
    }
  };
  const run = () => {
    if (!snap) return;
    try {
      const r = importTripApp(ctx, snap, { me: me ?? undefined });
      setDone(r);
      toast.show({ message: `${snap.destination} ${r.createdTrip ? 'imported' : 'updated'}`, icon: 'check' });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const count = (k: 'places' | 'bookings' | 'days' | 'expenses' | 'checklist' | 'alerts') => snap?.[k]?.length ?? 0;
  return (
    <Screen title="Import a trip" subtitle="From its own trip app" onBack={back} contentStyle={{ gap: 14 }}>
      <Note icon="download">Pick the trip app’s export file. LifeOS brings in the trip, its stops, stays, flights, day plans, expenses, checklist and notes; importing the same file again updates them. The file stays on this phone.</Note>
      <Button title={snap ? 'Pick another file' : 'Pick the file'} icon="folder" variant={snap ? 'secondary' : 'primary'} onPress={pick} />
      {error ? <Text style={{ color: t.c.alert.coralText, paddingHorizontal: 4 }}>{error}</Text> : null}
      {snap ? (
        <>
          <RowCard>
            <Row title={snap.destination} sub={datesLabel({ startDate: snap.meta.start, endDate: snap.meta.end })} />
            <Row title={plural(count('places'), 'place')} sub="Stops, ideas and airports" />
            <Row title={plural(count('bookings'), 'booking')} sub="Stays and flights, with what is paid" />
            {count('expenses') ? <Row title={plural(count('expenses'), 'expense')} sub="Into Settle up, split as they were" /> : null}
            {count('checklist') || count('alerts') ? <Row title={`${plural(count('checklist'), 'checklist item')} · ${plural(count('alerts'), 'note')}`} sub="Into Prep" /> : null}
            <Row title={plural(count('days'), 'day plan')} sub="Kept on the trip, day by day" />
          </RowCard>
          {snap.meta.travellers?.length ? (
            <View style={{ gap: 8 }}>
              <Caps>Which one is you?</Caps>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {snap.meta.travellers.map((p) => (
                  <Pressable key={p} accessibilityRole="button" accessibilityState={{ selected: me === p }} onPress={() => setMe(p)} style={{ height: 40, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: me === p ? t.c.accent.mustard : t.c.bg.tileRaised }}>
                    <Text style={{ fontSize: 15, fontWeight: '600', color: me === p ? t.c.fg.onAccent : t.c.fg.primary }}>{p}</Text>
                  </Pressable>
                ))}
              </View>
              <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>The others become People travelling with you.</Text>
            </View>
          ) : null}
          <Button title={done ? 'Import again' : `Import ${snap.destination}`} icon="check" onPress={run} />
        </>
      ) : null}
      {done ? (
        <View style={{ gap: 10 }}>
          <RowCard>
            <Row lines={3} title={done.createdTrip ? 'A new trip' : 'The trip, updated'} sub={[plural(done.stops, 'stop'), plural(done.stays, 'stay'), plural(done.flights, 'flight'), done.days ? plural(done.days, 'day plan') : null, done.bills ? plural(done.bills, 'expense') : null, done.tasks ? plural(done.tasks, 'checklist item') : null, done.notes ? plural(done.notes, 'note') : null].filter(Boolean).join(' · ')} />
          </RowCard>
          <Button title="Open the trip" icon="arrow-right" onPress={() => router.replace(`/entity/trip/${done.tripId}` as never)} />
        </View>
      ) : null}
    </Screen>
  );
}
