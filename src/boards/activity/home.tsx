import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { saveTrackers, trackerSummary, trackers } from '@core/activity/trackers';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { EmptyState, Icon, IconButton, Screen, Text, Toggle } from '@ui/kit';
import { SortableList } from '@ui/components/SortableList';
import { ActivityRow, doneToday, TrackerDisc, trackerColor } from './grid';

const ROW = 56;

/**
 * The Activity board's home (MODEL.md layer 3, *Activity*; the A1 artboard):
 * how many trackers counted today, every tracker as a card (tap for it), New
 * tracker, and On Today: which trackers the Today tile shows, in what order
 * (hold the grip to reorder; a hidden tracker still counts).
 */
export function ActivityHome() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const list = useLive((o) => trackers(o), []);
  const rows = useLive((o) => trackers(o).map((x) => trackerSummary(o, x)), []);
  const today = rows.filter(doneToday).length;
  const pill = (text: string, on?: boolean) => (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: on ? 'rgba(215,245,92,0.16)' : 'rgba(255,255,255,0.07)', justifyContent: 'center' }}>
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: on ? t.c.accent.mustard : t.c.fg.secondary }}>{text}</Text>
    </View>
  );
  return (
    <Screen title="Activity" subtitle="Browse › Boards" onBack={() => (router.canGoBack() ? router.back() : router.replace('/browse'))} right={<IconButton icon="plus" accessibilityLabel="New tracker" filled onPress={() => router.push('/board/activity/edit' as never)} />}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {rows.length ? pill(`${today} of ${rows.length} done today`, true) : null}
        {pill('a square for every day something happened')}
      </View>
      {rows.length ? (
        <View style={{ gap: 12 }}>
          {rows.map((s) => (
            <ActivityRow key={s.tracker.id} s={s} card onPress={() => router.push(`/board/activity/tracker?tracker=${s.tracker.id}` as never)} />
          ))}
        </View>
      ) : (
        <EmptyState icon="grid" line="No trackers yet. A tracker fills a square for every day something happened: a workout, a Zomato order, a day at work." />
      )}
      <Pressable onPress={() => router.push('/board/activity/edit' as never)} accessibilityRole="button" style={({ pressed }) => ({ height: 48, borderRadius: 999, backgroundColor: pressed ? t.c.bg.pressed : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 })}>
        <Icon name="plus" size={18} color={t.c.fg.primary} />
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.fg.primary }}>New tracker</Text>
      </Pressable>
      {list.length ? (
        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 10, paddingHorizontal: 4 }}>
            <Text accessibilityRole="header" style={{ flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', color: t.c.fg.primary }}>On Today</Text>
            <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>which show, in what order</Text>
          </View>
          <View style={{ padding: 16, paddingTop: 8, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 4 }}>
            <SortableList
              data={list}
              rowHeight={ROW}
              onReorder={(ids) => saveTrackers(os, ids.map((id) => list.find((x) => x.id === id)!).filter(Boolean))}
              renderItem={(x, dragging) => (
                <View style={{ height: ROW, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: dragging ? 0.8 : 1 }}>
                  <Icon name="list" size={18} color={t.c.fg.tertiary} />
                  <TrackerDisc icon={x.icon} color={trackerColor(x.tint)} size={28} />
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>{x.name}</Text>
                  <Toggle value={!x.hidden} accessibilityLabel={`Show ${x.name} on Today`} onChange={(v) => saveTrackers(os, list.map((y) => (y.id === x.id ? { ...y, hidden: !v } : y)))} />
                </View>
              )}
            />
            <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>Hold the grip to reorder. Hidden trackers still count; they just stay off Today.</Text>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}
