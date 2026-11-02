import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { trackerSummary, trackers } from '@core/activity/trackers';
import type { TileDef, TileProps } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Text, Tile } from '@ui/kit';
import { ActivityRow } from './grid';

/** The Activity board's Today tile: one tracker at a time (swipe for the next), its last 18 weeks as a grid of days like GitHub's; tap for all of them. Two looks: one at a time or all stacked. */
function ActivityTodayTile({ config }: TileProps) {
  const router = useRouter();
  const t = useTheme();
  const rows = useLive((o) => trackers(o).filter((x) => !x.hidden).map((x) => trackerSummary(o, x, Date.now(), 26)), []);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const open = () => router.push('/board/activity' as never);
  if (config.style === 'all')
    return (
      <Tile size="2x1" tint="tasks" icon="grid" label="Activity" onPress={open}>
        <View style={{ gap: 22 }}>
          {rows.map((s) => (
            <ActivityRow key={s.tracker.id} s={s} onPress={() => router.push(`/board/activity/tracker?tracker=${s.tracker.id}` as never)} />
          ))}
        </View>
      </Tile>
    );
  return (
    <Tile size="2x1" tint="tasks" icon="grid" label="Activity" meta={rows.length > 1 ? `${page + 1} of ${rows.length}` : undefined} onPress={open}>
      {rows.length ? (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: 10 }}>
          {width > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
              onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
              scrollEventThrottle={64}
            >
              {rows.map((s) => (
                <View key={s.tracker.id} style={{ width }}>
                  <ActivityRow s={s} onPress={open} />
                </View>
              ))}
            </ScrollView>
          ) : null}
          {rows.length > 1 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }} accessibilityRole="adjustable" accessibilityLabel={`Tracker ${page + 1} of ${rows.length}`}>
              {rows.map((s, k) => (
                <View key={s.tracker.id} style={{ width: k === page ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: k === page ? t.c.fg.primary : t.c.fg.tertiary }} />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <Text variant="caption" color="secondary">No trackers yet. Tap to add one.</Text>
      )}
    </Tile>
  );
}

export const activityTiles: TileDef[] = [
  {
    type: 'activity',
    board: 'activity',
    name: 'Activity',
    description: 'GitHub-style grids: days worked, workouts, steps, your own trackers',
    icon: 'grid',
    sizes: ['medium'],
    defaultSize: 'medium',
    component: ActivityTodayTile,
    configFields: [{ key: 'style', label: 'Look', type: 'select', options: [{ value: 'swipe', label: 'One at a time' }, { value: 'all', label: 'All stacked' }] }],
  },
];
