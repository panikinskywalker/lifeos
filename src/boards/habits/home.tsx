import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, IconButton, Screen, Text } from '@ui/kit';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { Disc, doneShare, FatBar, heatColor, HeatGrid, longestRun, Metric, mondayOf, readToday, SectionHead, Slab, streakWord, TodayRow, weekDone, DAY, type HabitState } from './parts';

/**
 * Habits home (NR-Habits-Home, its empty state from NR-Habits-Empty): done
 * today and the best streak, today's list to tick, 12 weeks of days, this week
 * per habit, what's paused, and how a Dump ticks one.
 */
export function HabitsHome(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const now = Date.now();
  const d = useLive((o) => readToday(o, Date.now()), []);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/browse' as never));
  const add = () => router.push('/entity/habit/new' as never);
  const addButton = <IconButton icon="plus" accessibilityLabel="Add habit" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} onPress={add} />;

  if (!d.all.length) {
    return (
      <Screen title="Habits" subtitle="No habits yet" onBack={back} right={addButton} contentStyle={{ gap: 24 }}>
        <Slab radius={28} style={{ padding: 18, alignItems: 'center', gap: 10 }}>
          <View style={{ marginTop: 10 }}>
            <Disc icon="flame" size={56} iconSize={26} />
          </View>
          <Text variant="heading" style={{ textAlign: 'center' }}>No habits yet</Text>
          <Text variant="caption" color="secondary" style={{ textAlign: 'center', maxWidth: 270 }}>Add one, then tick it each day. Daily, weekday and times-a-week habits each keep their own streak.</Text>
          <Button title="Add a habit" icon="plus" size="sm" onPress={add} style={{ marginTop: 6, marginBottom: 4 }} />
        </Slab>
      </Screen>
    );
  }

  const left = d.today.length - d.doneCount;
  const monday = mondayOf(now);

  return (
    <Screen
      title="Habits"
      subtitle={`${d.active.length} ${d.active.length === 1 ? 'habit' : 'habits'} · ${d.doneCount} done today`}
      onBack={back}
      right={
        <>
          <ToCheckBell />
          {addButton}
        </>
      }
      contentStyle={{ gap: 24 }}
    >
      {d.active.length ? (
        <>
          <Slab style={{ padding: 16, flexDirection: 'row', gap: 12 }}>
            <Metric label="DONE TODAY" value={`${d.doneCount}/${d.today.length}`} sub={d.today.length ? (left ? `${left} to go` : 'all done') : null} />
            <Metric label="BEST STREAK" value={d.best ? streakWord(d.best.streak) : '0 d'} sub={d.best?.rec.title} />
          </Slab>

          <View style={{ gap: 10 }}>
            <SectionHead title="Today" sub={`${format(now, 'EEE d MMM')} · tap one to tick it`} action="Tick off" onAction={() => router.push('/module/habits/tick' as never)} />
            <Slab style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
              {d.today.length ? d.today.map((s) => <TodayRow key={s.rec.id} state={s} />) : <Text variant="caption" color="secondary" style={{ paddingVertical: 10 }}>Nothing due today.</Text>}
            </Slab>
          </View>

          <View style={{ gap: 10 }}>
            <SectionHead title="Last 12 weeks" sub="Brighter = more of your habits done that day" />
            <Slab radius={28} style={{ padding: 18, gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ gap: 5 }}>
                  {['M', '', 'W', '', 'F', '', 'S'].map((l, i) => (
                    <Text key={i} variant="labelCaps" color="tertiary" style={{ height: 18, lineHeight: 18, letterSpacing: 0 }}>{l}</Text>
                  ))}
                </View>
                <HeatGrid weeks={12} now={now} cell={18} gap={5} radius={5} label="Habits done each day, last 12 weeks" colorOf={(iso) => heatColor(t.c, doneShare(d.active, iso))} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Legend style={{ flex: 1 }}>{format(monday - 77 * DAY, 'd MMM')}</Legend>
                <Legend>Less</Legend>
                {[0, 1 / 3, 2 / 3, 1].map((r) => <View key={r} style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: heatColor(t.c, r) }} />)}
                <Legend>More</Legend>
                <Legend style={{ marginLeft: 10 }}>Today</Legend>
              </View>
            </Slab>
          </View>

          <View style={{ gap: 10 }}>
            <SectionHead title="This week" sub={`${format(monday, 'EEE d')} to ${format(monday + 6 * DAY, 'EEE d MMM')}`} action={`All ${d.all.length}`} onAction={() => router.push('/module/habits/all' as never)} />
            <Slab radius={28} style={{ padding: 18, gap: 18 }}>
              {d.active.map((s) => <WeekRow key={s.rec.id} state={s} now={now} onPress={() => router.push(`/entity/habit/${s.rec.id}` as never)} />)}
            </Slab>
          </View>
        </>
      ) : (
        <SectionHead title="Nothing active" sub="Every habit is paused" action={`All ${d.all.length}`} onAction={() => router.push('/module/habits/all' as never)} />
      )}

      {d.paused.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Paused" />
          {d.paused.map((s) => <PausedRow key={s.rec.id} state={s} pausedAt={os.records.timeline.forEntity(s.rec.id, 30).find((e) => e.kind === 'status' && e.meta.to === 'paused')?.occurredAt} onResume={() => os.records.setStatus(s.rec.id, 'active')} onOpen={() => router.push(`/entity/habit/${s.rec.id}` as never)} />)}
        </View>
      ) : null}

      <Slab style={{ padding: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <Disc icon="brain" />
        <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
          <Text variant="tileTitle" style={{ lineHeight: 20 }}>Say it in a Dump</Text>
          <Text variant="caption" color="secondary" style={{ lineHeight: 18 }}>“Did yoga this morning” or “went for a run yesterday” ticks the habit, with Undo in To check. Plans and misses don’t count. Check-ins stay on this phone.</Text>
        </View>
      </Slab>
    </Screen>
  );
}

function Legend({ children, style }: { children: React.ReactNode; style?: { flex?: number; marginLeft?: number } }) {
  return <Text color="secondary" style={[{ fontSize: 12, lineHeight: 15, fontWeight: '500' }, style]}>{children}</Text>;
}

function WeekRow({ state, now, onPress }: { state: HabitState; now: number; onPress: () => void }) {
  const { rec, habit, done, streak } = state;
  const n = weekDone(done, now);
  const sub = `${n} of ${habit.perWeek} · streak ${streakWord(streak)}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${rec.title}, ${sub}`} onPress={onPress} style={({ pressed }) => ({ gap: 8, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
        <Text variant="tileTitle" numberOfLines={1} style={{ flex: 1, minWidth: 0 }}>{rec.title}</Text>
        <Text color="secondary" numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{sub}</Text>
      </View>
      <FatBar ratio={n / habit.perWeek} />
    </Pressable>
  );
}

function PausedRow({ state, pausedAt, onResume, onOpen }: { state: HabitState; pausedAt?: number; onResume: () => void; onOpen: () => void }) {
  const t = useTheme();
  const best = longestRun(state.habit, state.done);
  const line = [pausedAt ? `Paused ${format(pausedAt, 'd MMM')}` : 'Paused', best.count ? `best streak ${streakWord(best)}` : null].filter(Boolean).join(' · ');
  return (
    <Slab style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${state.rec.title}, ${line}`} onPress={onOpen} style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14, opacity: pressed ? 0.7 : 1 })}>
        <Disc icon="pause" color={t.c.fg.secondary} />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text variant="rowTitle" numberOfLines={1}>{state.rec.title}</Text>
          <Text variant="caption" color="secondary" numberOfLines={1}>{line}</Text>
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Resume ${state.rec.title}`} hitSlop={4} onPress={onResume} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center', flexShrink: 0, opacity: pressed ? 0.7 : 1 })}>
        <Text variant="label">Resume</Text>
      </Pressable>
    </Slab>
  );
}
