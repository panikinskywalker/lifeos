import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { isoOf } from '@core/habits/habits';
import type { TileDef, TileProps } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks, gradients } from '@ui/theme/tokens';
import { Icon, Text, Tile } from '@ui/kit';
import { DAY, doneShare, readToday, streakWord } from './parts';
import { HabitChecklist, HabitWeek } from './widgets';

/**
 * Today's Habits tile (NR-Habits-Tile): small opens the home, wide opens
 * today's tick off, with nothing to show it offers one way in. The older
 * looks (today list, this week) stay as You › Home screen options.
 */
function HabitsTile({ size, config }: TileProps) {
  const router = useRouter();
  const t = useTheme();
  const d = useLive((o) => {
    const v = readToday(o, Date.now());
    const week = Array.from({ length: 7 }, (_, i) => doneShare(v.active, isoOf(Date.now() - (6 - i) * DAY)));
    return { ...v, week };
  }, []);
  const home = () => router.push('/module/habits' as never);

  if (!d.all.length) {
    return (
      <Shell small={size === 'small'} onPress={() => router.push('/entity/habit/new' as never)}>
        <Text variant="metric">No habits yet</Text>
        <Text variant="labelMicro" color={t.c.accent.gold} style={{ lineHeight: 15 }}>Add one</Text>
      </Shell>
    );
  }
  if (config.style === 'list' || config.style === 'week') {
    return (
      <Tile size="2x1" tint="health" icon="flame" label="Habits" meta={config.style === 'week' ? 'this week' : 'today'} onPress={home}>
        {config.style === 'week' ? <HabitWeek /> : <HabitChecklist />}
      </Tile>
    );
  }

  const headline = d.today.length ? `${d.doneCount}/${d.today.length} today` : 'Nothing due';
  const big = <Text variant="stat" style={{ letterSpacing: -0.5 }} numberOfLines={1}>{headline}</Text>;
  if (size === 'small') {
    return (
      <Shell small onPress={home}>
        {big}
        {d.best ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="flame" size={14} color={blocks.orange} />
            <Text variant="labelMicro" color="secondary" numberOfLines={1} style={{ flex: 1, lineHeight: 15 }}>{streakWord(d.best.streak)} · {d.best.rec.title}</Text>
          </View>
        ) : null}
      </Shell>
    );
  }

  const open = d.today.filter((s) => !s.doneToday);
  const toGo = !d.today.length ? 'Nothing due today' : !open.length ? 'All done today' : open.length > 2 ? `${open.length} to go` : `${open.map((s) => s.rec.title).join(' and ')} to go`;
  return (
    <Shell onPress={() => router.push('/module/habits/tick' as never)}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}>{big}</View>
        <View accessibilityRole="image" accessibilityLabel="Share of habits done, last 7 days" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 40, flexShrink: 0 }}>
          {d.week.map((r, i) => <View key={i} style={{ width: 10, height: Math.max(4, Math.round(r * 40)), borderRadius: 5, backgroundColor: i === 6 ? t.c.accent.mustard : `${t.c.accent.mustard}99` }} />)}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View accessible accessibilityLabel={`${d.doneCount} done, ${open.length} to go`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {d.today.slice(0, 7).map((s) => <View key={s.rec.id} style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: s.doneToday ? t.c.accent.mustard : 'transparent', borderWidth: s.doneToday ? 0 : 1.5, borderColor: t.c.fg.tertiary }} />)}
        </View>
        <Text color="secondary" numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{toGo}</Text>
        {d.best ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <Icon name="flame" size={14} color={blocks.orange} />
            <Text variant="labelMicro" color="secondary">best {streakWord(d.best.streak)}</Text>
          </View>
        ) : null}
      </View>
    </Shell>
  );
}

/** The tile itself: HABITS and the module's dot on top, 167 high. */
function Shell({ small, onPress, children }: { small?: boolean; onPress: () => void; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Habits" onPress={onPress} style={({ pressed }) => ({ height: 167, width: small ? 167 : undefined, borderRadius: 24, padding: 16, backgroundColor: t.c.bg.tile, justifyContent: 'space-between', opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="labelCaps" color="secondary">HABITS</Text>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: gradients.health[0] }} />
      </View>
      {children}
    </Pressable>
  );
}

export const habitsTiles: TileDef[] = [
  {
    type: 'habits',
    board: 'habits',
    name: 'Habits',
    description: 'Done today, what’s left and the best streak',
    icon: 'flame',
    sizes: ['small', 'medium'],
    defaultSize: 'medium',
    configFields: [{ key: 'style', label: 'Look', type: 'select', options: [{ value: 'summary', label: 'Summary' }, { value: 'list', label: 'Today list' }, { value: 'week', label: 'This week' }] }],
    component: HabitsTile,
  },
];
