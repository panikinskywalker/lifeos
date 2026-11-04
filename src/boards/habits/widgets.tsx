import { Pressable, View } from 'react-native';
import { format } from 'date-fns';
import { activeHabits, doneDays, dueOn, isoOf, toggleCheckIn } from '@core/habits/habits';
import { useTheme } from '@ui/theme/ThemeProvider';
import { useLive, useOS } from '@ui/hooks';
import { Icon, Text } from '@ui/kit';
import { DAY, mondayOf, readToday, TodayRow } from './parts';

/**
 * This week, Monday to Sunday (the tile's "This week" look): a row per habit,
 * a circle per day: ticked when done, joined to the next when you kept it
 * going, faint on days it isn't due, empty for days still to come. Tap any
 * past day to fix it.
 */
export function HabitWeek({ limit = 8 }: { limit?: number }) {
  const os = useOS();
  const t = useTheme();
  const today = isoOf(Date.now());
  const monday = mondayOf(Date.now());
  const week = Array.from({ length: 7 }, (_, i) => isoOf(monday + i * DAY));
  const rows = useLive((o) => activeHabits(o).map((h) => ({ h, done: doneDays(o, h.id, week[0]!) })), []);
  const size = 24;
  const gap = 4;
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="caption" color="secondary" style={{ flex: 1 }} numberOfLines={1}>
          {format(monday, 'd MMM')} to {format(monday + 6 * DAY, 'd MMM')}
        </Text>
        <View style={{ flexDirection: 'row', gap }}>
          {week.map((d) => (
            <Text key={d} variant="labelMicro" color={d === today ? 'primary' : 'secondary'} style={{ width: size, textAlign: 'center' }}>
              {format(new Date(`${d}T12:00:00`), 'EEEEE')}
            </Text>
          ))}
        </View>
      </View>
      {rows.slice(0, limit).map(({ h, done }) => (
        <View key={h.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text variant="label" style={{ flex: 1 }} numberOfLines={1}>{h.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {week.map((d, i) => {
              const on = done.has(d);
              const future = d > today;
              const joined = on && i < 6 && done.has(week[i + 1]!);
              return (
                <View key={d} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on, disabled: future }}
                    accessibilityLabel={`${h.title}, ${d}`}
                    disabled={future}
                    hitSlop={10}
                    onPress={() => toggleCheckIn(os, h.id, d)}
                    style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.c.accent.mustard : future ? 'transparent' : t.c.bg.tileRaised, borderWidth: future ? 1.5 : 0, borderColor: t.c.fg.tertiary, opacity: dueOn(h, d) || on ? 1 : 0.4 }}
                  >
                    {on ? <Icon name="check" size={14} color={t.c.accent.mustardInk} /> : null}
                  </Pressable>
                  {i < 6 ? <View style={{ width: gap, height: 3, backgroundColor: joined ? t.c.accent.mustard : 'transparent' }} /> : null}
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Today's habits, each a tap to tick, with its streak (the tile's "Today list" look). */
export function HabitChecklist({ limit = 8 }: { limit?: number }) {
  const rows = useLive((o) => readToday(o, Date.now()).today, []);
  if (!rows.length) return <Text variant="caption" color="secondary">Nothing due today.</Text>;
  return (
    <View>
      {rows.slice(0, limit).map((s) => <TodayRow key={s.rec.id} state={s} />)}
    </View>
  );
}
