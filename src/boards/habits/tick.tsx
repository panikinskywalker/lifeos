import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { isoOf, toggleCheckIn } from '@core/habits/habits';
import type { LifeOSContext } from '@core/registry/context';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Screen, Text, useToast } from '@ui/kit';
import { Caps, FatBar, howOften, NoteCard, readToday, Rule, Slab, StreakMark, TickDisc, weekDone, type HabitState } from './parts';

/** Tick off today (NR-Habits-TickOff): how far along, one big tap per habit due, Undo on the toast, what isn't due today. */
export function TickOff(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const t = useTheme();
  const router = useRouter();
  const d = useLive((o) => readToday(o, Date.now()), []);
  const total = d.today.length;
  const allDone = total > 0 && d.doneCount === total;
  const notDue = d.active.filter((s) => !s.dueToday && !s.doneToday);
  return (
    <Screen title="Today’s habits" subtitle={`${format(Date.now(), 'EEE d MMM')} · one tap each`} onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/habits' as never))} contentStyle={{ gap: 24 }}>
      <Slab radius={28} style={{ padding: 18, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text variant="display">{d.doneCount}</Text>
          <Text variant="heading" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>of {total} done</Text>
        </View>
        <FatBar ratio={total ? d.doneCount / total : 0} floor={0.04} label={`${d.doneCount} of ${total} done`} />
        {allDone ? (
          <Text color={t.c.accent.gold} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>All done for today. Every streak carries on.</Text>
        ) : (
          <Text variant="caption" color="secondary">{total ? 'Tap again to undo. Missed a day? Fix it from the habit’s week.' : 'Nothing due today.'}</Text>
        )}
      </Slab>

      {total ? (
        <View style={{ gap: 10 }}>
          <View style={{ paddingTop: 6, paddingHorizontal: 4 }}>
            <Caps>HABITS · DUE TODAY</Caps>
          </View>
          <Slab style={{ paddingVertical: 6, paddingHorizontal: 14 }}>
            {d.today.map((s, i) => (
              <React.Fragment key={s.rec.id}>
                {i ? <Rule /> : null}
                <BigRow state={s} />
              </React.Fragment>
            ))}
          </Slab>
        </View>
      ) : null}

      {notDue.length ? <NoteCard icon="calendar">Not due today: {notDue.map((s) => `${s.rec.title} (${howOften(s.habit).toLowerCase()})`).join(', ')}</NoteCard> : null}
    </Screen>
  );
}

function BigRow({ state }: { state: HabitState }) {
  const os = useOS();
  const toast = useToast();
  const { rec, habit, done, doneToday, streak } = state;
  const sub = [habit.frequency === 'weekly' ? `${habit.perWeek} a week · ${weekDone(done)} of ${habit.perWeek} so far` : howOften(habit), rec.data.reminderTime].filter(Boolean).join(' · ');
  const flip = () => {
    const today = isoOf(Date.now());
    const on = toggleCheckIn(os, rec.id, today);
    toast.show({ message: `${rec.title}, ${on ? 'done' : 'not done'}`, icon: 'check', undo: () => void toggleCheckIn(os, rec.id, today) });
  };
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: doneToday }} accessibilityLabel={`${rec.title}, ${doneToday ? 'done today' : 'not done yet'}`} onPress={flip} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 76, opacity: pressed ? 0.7 : 1 })}>
      <TickDisc done={doneToday} size={48} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text variant="heading" numberOfLines={1} style={{ letterSpacing: 0 }}>{rec.title}</Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>{sub}</Text>
      </View>
      <StreakMark streak={streak} big />
    </Pressable>
  );
}
