import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { saveTrackers, trackerSummary, trackers } from '@core/activity/trackers';
import { useLive, useOS } from '@ui/hooks';
import { Button, EmptyState, IconButton, RowList, Screen, Section, SwitchField, Text } from '@ui/kit';
import { ActivityRow } from './grid';

/** The Activity board's home (MODEL.md layer 3, *Activity*): every tracker's grid; new tracker; which show on Today, in what order. */
export function ActivityHome() {
  const os = useOS();
  const router = useRouter();
  const list = useLive((o) => trackers(o), []);
  const rows = useLive((o) => trackers(o).map((t) => trackerSummary(o, t)), []);
  const today = rows.filter((s) => s.days.filter((d) => d.value != null).at(-1)?.value === 1).length;
  const move = (i: number, by: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x!);
    saveTrackers(os, next);
  };
  return (
    <Screen title="Activity" subtitle={rows.length ? `${today} of ${rows.length} done today` : 'A square for every day something happened'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/browse'))}>
      <View style={{ gap: 20 }}>
        {rows.map((s) => (
          <ActivityRow key={s.tracker.id} s={s} onPress={() => router.push(`/board/activity/tracker?tracker=${s.tracker.id}` as never)} />
        ))}
      </View>
      {!rows.length ? <EmptyState icon="grid" line="No trackers yet. A tracker fills a square for every day something happened: a workout, a Zomato order, a day at work." /> : null}
      <Button title="New tracker" icon="plus" onPress={() => router.push('/board/activity/edit' as never)} />
      <Section title="On Today">
        <Text variant="caption" color="secondary">Choose which show on Today, and in what order.</Text>
        <RowList>
          {list.map((t, i) => (
            <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <SwitchField label={t.name} value={!t.hidden} onChange={(v) => saveTrackers(os, list.map((x) => (x.id === t.id ? { ...x, hidden: !v } : x)))} />
              </View>
              <IconButton icon="chevron-up" size={34} accessibilityLabel={`Move ${t.name} up`} disabled={i === 0} onPress={() => move(i, -1)} />
              <IconButton icon="chevron-down" size={34} accessibilityLabel={`Move ${t.name} down`} disabled={i === list.length - 1} onPress={() => move(i, 1)} />
            </View>
          ))}
        </RowList>
      </Section>
    </Screen>
  );
}
