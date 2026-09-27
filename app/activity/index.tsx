import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { saveTrackers, trackerSummary, trackers } from '@core/activity/trackers';
import { useLive, useOS } from '@ui/hooks';
import { Button, IconButton, RowList, Screen, Section, SwitchField, Text } from '@ui/kit';
import { ActivityRow } from '../../src/screens/ActivityGrid';

/** Activity: your trackers — show / hide on Today, reorder, add your own. */
export default function ActivityScreen() {
  const os = useOS();
  const router = useRouter();
  const list = useLive((o) => trackers(o), []);
  const rows = useLive((o) => trackers(o).map((t) => trackerSummary(o, t)), []);
  const move = (i: number, by: number) => {
    const next = [...list];
    const [x] = next.splice(i, 1);
    next.splice(i + by, 0, x!);
    saveTrackers(os, next);
  };
  return (
    <Screen title="Activity" subtitle="A square for every day something happened" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
      <View style={{ gap: 20 }}>
        {rows.map((s) => (
          <ActivityRow key={s.tracker.id} s={s} onPress={() => router.push(`/activity/${s.tracker.id}` as never)} />
        ))}
      </View>
      <Button title="New tracker" icon="plus" onPress={() => router.push('/activity/edit' as never)} />
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
