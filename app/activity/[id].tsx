import React from 'react';
import { Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { removeTracker, ruleText, trackerSummary, trackers } from '@core/activity/trackers';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { TintKey } from '@ui/theme/tokens';
import { Button, EmptyState, HeatMap, IconButton, RowItem, RowList, Screen, Section, StatTrio, Text } from '@ui/kit';

/** One tracker: half a year of days, this week / month, streaks, and the rules that decide a day. */
export default function TrackerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const s = useLive((o) => {
    const tr = trackers(o).find((x) => x.id === id);
    return tr ? trackerSummary(o, tr, Date.now(), 26) : null;
  }, [id]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/activity' as never));
  if (!s) return <Screen title="Tracker" onBack={back}><EmptyState icon="grid" line="That tracker is gone." /></Screen>;
  const tint = (t.tints[s.tracker.tint as TintKey] ? s.tracker.tint : 'tasks') as TintKey;
  const del = () => {
    const go = () => (removeTracker(os, s.tracker.id), back());
    if (Platform.OS === 'web') return go();
    Alert.alert(`Delete ${s.tracker.name}?`, 'Only the tracker goes — nothing it counted is touched.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: go }]);
  };
  return (
    <Screen title={s.tracker.name} subtitle={`${s.total} days in the last 6 months`} onBack={back} right={<IconButton icon="edit" accessibilityLabel="Edit tracker" filled onPress={() => router.push({ pathname: '/activity/edit', params: { id: s.tracker.id } } as never)} />}>
      <StatTrio stats={[{ label: 'This week', value: String(s.thisWeek) }, { label: 'This month', value: String(s.thisMonth) }, { label: 'Streak', value: `${s.streak} d`, caption: `longest ${s.longest} d`, tone: s.streak ? 'ok' : undefined }]} />
      <Section title="Last 26 weeks">
        <HeatMap days={s.days} color={t.tints[tint].ink} accessibilityLabel={`${s.tracker.name}, last 26 weeks`} />
      </Section>
      <Section title="A day counts when any of these happen">
        <RowList>
          {s.tracker.rules.map((r, i) => (
            <RowItem key={i} icon={r.kind === 'message' ? 'comment' : r.kind === 'payment' ? 'wallet' : r.kind === 'metric' ? 'activity' : r.kind === 'screen' ? 'signal' : r.kind === 'calendar' ? 'calendar' : r.kind === 'habit' ? 'flame' : 'file'} tint={tint} title={ruleText(r, os)} chevron={false} />
          ))}
        </RowList>
        {!s.tracker.rules.length ? <Text variant="caption" color="secondary">No rules yet — nothing counts.</Text> : null}
      </Section>
      <Button title="Edit rules" icon="edit" variant="secondary" onPress={() => router.push({ pathname: '/activity/edit', params: { id: s.tracker.id } } as never)} />
      <Button title="Delete tracker" icon="trash" variant="ghost" onPress={del} />
    </Screen>
  );
}
