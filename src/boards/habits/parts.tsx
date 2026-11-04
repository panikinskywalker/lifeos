import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { doneDays, dueOn, isoOf, streakOf, toggleCheckIn, type Habit } from '@core/habits/habits';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { HabitData } from '@modules/habits';
import { useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks, type Colors } from '@ui/theme/tokens';
import { Icon, ProgressBar, Text } from '@ui/kit';

/**
 * Habits' shared parts (NR-Habits-*): what every screen reads about a habit,
 * the section head, slabs, discs, pills, the tick disc, the Today row and the
 * grid of days.
 */

export const DAY = 86_400_000;
export type HabitRecord = ObjectRecord<HabitData>;
export type Streak = { count: number; unit: 'day' | 'week' };

export function toHabit(rec: HabitRecord): Habit {
  const frequency = rec.data.frequency ?? 'daily';
  return { id: rec.id, title: rec.title, frequency, perWeek: rec.data.targetPerWeek ?? (frequency === 'weekdays' ? 5 : frequency === 'weekly' ? 1 : 7) };
}

export interface HabitState {
  rec: HabitRecord;
  habit: Habit;
  paused: boolean;
  done: Set<string>;
  doneToday: boolean;
  dueToday: boolean;
  streak: Streak;
}

/** Every habit as added, with its check-ins and streak. */
export function readHabits(os: LifeOSContext, now = Date.now()): HabitState[] {
  const today = isoOf(now);
  return os.records.query<HabitData>('habit', { sort: [{ field: 'createdAt', dir: 'asc' }] }, { limit: 200 }).map((rec) => {
    const habit = toHabit(rec);
    const done = doneDays(os, rec.id, '0000-01-01');
    return { rec, habit, paused: rec.status === 'paused', done, doneToday: done.has(today), dueToday: dueOn(habit, today), streak: streakOf(habit, done, now) };
  });
}

/** Today's picture: the active habits, the ones on today's list (due, or ticked anyway), the best streak. */
export function readToday(os: LifeOSContext, now = Date.now()) {
  const all = readHabits(os, now);
  const active = all.filter((s) => !s.paused);
  const today = active.filter((s) => s.dueToday || s.doneToday);
  const days = (s: Streak) => (s.unit === 'week' ? s.count * 7 : s.count);
  const best = active.reduce<HabitState | null>((b, s) => (s.streak.count && (!b || days(s.streak) > days(b.streak)) ? s : b), null);
  return { all, active, paused: all.filter((s) => s.paused), today, doneCount: today.filter((s) => s.doneToday).length, best };
}

/** How much of what was due that day got done. */
export function doneShare(habits: HabitState[], iso: string): number {
  const due = habits.filter((s) => dueOn(s.habit, iso));
  return due.length ? due.filter((s) => s.done.has(iso)).length / due.length : 0;
}

export const streakWord = (s: Streak) => `${s.count} ${s.unit === 'week' ? 'wk' : 'd'}`;

export function howOften(h: Habit): string {
  if (h.frequency === 'weekly') return h.perWeek === 1 ? 'Once a week' : `${h.perWeek} times a week`;
  return h.frequency === 'weekdays' ? 'Weekdays' : 'Every day';
}

/** Noon on this week's Monday. */
export function mondayOf(t: number): number {
  const d = new Date(t);
  d.setHours(12, 0, 0, 0);
  return d.getTime() - ((d.getDay() + 6) % 7) * DAY;
}

/** Check-ins this week so far. */
export function weekDone(done: Set<string>, now = Date.now()): number {
  const monday = mondayOf(now);
  return Array.from({ length: 7 }, (_, i) => isoOf(monday + i * DAY)).filter((d) => done.has(d)).length;
}

/** The longest run ever in these check-ins: due days in a row, or weeks that met the target. */
export function longestRun(h: Habit, done: Set<string>): Streak {
  const unit = h.frequency === 'weekly' ? 'week' : 'day';
  const sorted = [...done].sort();
  if (!sorted.length) return { count: 0, unit };
  const noon = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
  const last = noon(sorted[sorted.length - 1]!);
  let best = 0;
  let run = 0;
  if (unit === 'week') {
    for (let m = mondayOf(noon(sorted[0]!)); m <= last; m += 7 * DAY) {
      run = weekDone(done, m) >= h.perWeek ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return { count: best, unit };
  }
  for (let t = noon(sorted[0]!); t <= last; t += DAY) {
    const d = isoOf(t);
    if (!dueOn(h, d)) continue;
    run = done.has(d) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { count: best, unit };
}

/** The first day of a running day streak. */
export function streakSince(h: Habit, done: Set<string>, count: number, now = Date.now()): number | null {
  if (!count) return null;
  let t = new Date(`${isoOf(now)}T12:00:00`).getTime();
  if (!done.has(isoOf(t))) t -= DAY;
  let left = count;
  let first = t;
  for (let guard = 0; left > 0 && guard < 3660; guard++, t -= DAY) {
    if (dueOn(h, isoOf(t))) {
      first = t;
      left--;
    }
  }
  return first;
}

/** Heat shades: none, then the accent at 30, 60, 80 and 100 %. */
export function heatColor(c: Colors, ratio: number): string {
  if (ratio <= 0) return `${c.fg.primary}1A`;
  if (ratio <= 1 / 3) return `${c.accent.mustard}4D`;
  if (ratio <= 2 / 3) return `${c.accent.mustard}99`;
  return ratio < 1 ? `${c.accent.mustard}CC` : c.accent.mustard;
}

/** Monday-aligned weeks of days ending this week: days to come outlined, today ringed. */
export function HeatGrid({ weeks, now, colorOf, cell, gap, radius, label }: { weeks: number; now: number; colorOf: (iso: string) => string; cell: number; gap: number; radius: number; label: string }) {
  const t = useTheme();
  const today = isoOf(now);
  const start = mondayOf(now) - (weeks - 1) * 7 * DAY;
  return (
    <View accessibilityRole="image" accessibilityLabel={label} style={{ flex: 1, flexDirection: 'row', gap }}>
      {Array.from({ length: weeks }, (_, w) => (
        <View key={w} style={{ flex: 1, gap }}>
          {Array.from({ length: 7 }, (_, d) => {
            const iso = isoOf(start + (w * 7 + d) * DAY);
            const future = iso > today;
            return <View key={iso} style={{ height: cell, borderRadius: radius, backgroundColor: future ? 'transparent' : colorOf(iso), borderWidth: future ? 1 : 0, borderColor: t.c.line, boxShadow: iso === today ? `0 0 0 1.5px ${t.c.fg.primary}` : undefined }} />;
          })}
        </View>
      ))}
    </View>
  );
}

/** A section head: 17/600 over a 13/400 line, a quiet link on the right. */
export function SectionHead({ title, sub, action, chevron = true, onAction }: { title: string; sub?: string; action?: string; chevron?: boolean; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="heading" accessibilityRole="header">{title}</Text>
        {sub ? <Text variant="caption" color="secondary">{sub}</Text> : null}
      </View>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={14} onPress={onAction} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 2, opacity: pressed ? 0.7 : 1 })}>
          <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{action}</Text>
          {chevron ? <Icon name="chevron-right" size={14} color={t.c.fg.secondary} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/** The card every block sits on. */
export function Slab({ radius = 24, style, children }: { radius?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.c.bg.tile, borderRadius: radius, minWidth: 0 }, style]}>{children}</View>;
}

export function Rule() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line }} />;
}

export function Caps({ children, color = 'tertiary' }: { children: React.ReactNode; color?: string }) {
  return <Text variant="labelCaps" color={color}>{children}</Text>;
}

/** A round raised disc holding an icon. */
export function Disc({ icon, color, size = 40, iconSize = 18 }: { icon: string; color?: string; size?: number; iconSize?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name={icon} size={iconSize} color={color ?? t.c.accent.gold} />
    </View>
  );
}

/** A 28-high pill: lime when it's today's, quiet otherwise. */
export function Pill({ label, lime }: { label: string; lime?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: lime ? t.c.accent.mustardSoft : t.c.bg.tileRaised, flexShrink: 0 }}>
      <Text variant="labelMicro" color={lime ? t.c.accent.gold : 'secondary'} numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{label}</Text>
    </View>
  );
}

/** One number in a metrics row: caps label, 22/700 value, an optional quiet word beside it. */
export function Metric({ label, value, sub, valueColor }: { label: string; value: string; sub?: string | null; valueColor?: string }) {
  return (
    <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
      <Caps>{label}</Caps>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
        <Text variant="metric" color={valueColor} style={{ flexShrink: 0 }}>{value}</Text>
        {sub ? <Text variant="caption" color="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>{sub}</Text> : null}
      </View>
    </View>
  );
}

/** The tick: a lime disc with a check, or an empty ring. */
export function TickDisc({ done, size = 28 }: { done: boolean; size?: number }) {
  const t = useTheme();
  const big = size >= 40;
  if (!done) return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: big ? 2 : 1.5, borderColor: t.c.fg.tertiary, flexShrink: 0 }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: big && t.dark ? `0 10px 30px ${t.c.accent.mustard}40` : undefined }}>
      <Icon name="check" size={big ? 22 : 15} strokeWidth={2.6} color={t.c.accent.mustardInk} />
    </View>
  );
}

/** A flame and the streak; nothing while there's no streak. */
export function StreakMark({ streak, big }: { streak: Streak; big?: boolean }) {
  if (!streak.count) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <Icon name="flame" size={big ? 16 : 14} color={blocks.orange} />
      <Text color={big ? 'primary' : 'secondary'} style={{ fontSize: big ? 14 : 13, lineHeight: big ? 18 : 17, fontWeight: big ? '700' : '600', fontVariant: ['tabular-nums'] }}>{streakWord(streak)}</Text>
    </View>
  );
}

/** A row on today's list: tap to tick. */
export function TodayRow({ state }: { state: HabitState }) {
  const os = useOS();
  const { rec, doneToday, streak } = state;
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: doneToday }} accessibilityLabel={`${rec.title}, ${doneToday ? 'done today' : 'not done yet'}${streak.count ? `, streak ${streakWord(streak)}` : ''}`} onPress={() => toggleCheckIn(os, rec.id, isoOf(Date.now()))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, opacity: pressed ? 0.7 : 1 })}>
      <TickDisc done={doneToday} />
      <Text variant="rowTitle" color={doneToday ? 'secondary' : 'primary'} numberOfLines={1} style={{ flex: 1, minWidth: 0, textDecorationLine: doneToday ? 'line-through' : 'none' }}>{rec.title}</Text>
      <StreakMark streak={streak} />
    </Pressable>
  );
}

/** The 22-tall bar; a sliver shows for anything above nothing. */
export function FatBar({ ratio, floor = 0.08, label }: { ratio: number; floor?: number; label?: string }) {
  return <ProgressBar value={ratio > 0 ? Math.max(ratio, floor) : 0} height={22} accessibilityLabel={label} />;
}

/** The small print card: a disc-less icon and a quiet line. */
export function NoteCard({ icon, children }: { icon: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Slab style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
      <Icon name={icon} size={18} color={t.c.fg.secondary} style={{ flexShrink: 0 }} />
      <Text variant="caption" color="secondary" style={{ flex: 1, minWidth: 0 }}>{children}</Text>
    </Slab>
  );
}
