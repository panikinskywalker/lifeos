import React, { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { IconButton, ProgressBar, RowItem, Text, useToast } from '@ui/kit';
import { completeTask, undoComplete, type AgendaEvent, type AgendaTask, type TaskData } from '@modules/projects';

/**
 * Projects' parts, a first pass from the kit (NR-KitComponents rows, chips,
 * the 22 progress bar) until the NR-Projects-Parts artboard: the task row
 * with its tick, the event row with its time, the project card, the page's
 * top bar and the small label. Lilac is the Tasks disc in Noir.
 */

export const ACCENT = blocks.lilac;
const REPEAT_WORDS: Record<string, string> = { day: 'daily', week: 'weekly', '2weeks': 'every 2 wk', month: 'monthly', '3months': 'every 3 mo', year: 'yearly' };

/** "today" · "tomorrow" · "Thu" (this week) · "4 Nov". */
export function dueWords(day: string | undefined, now = Date.now()): string {
  if (!day) return '';
  const d = new Date(`${day.slice(0, 10)}T12:00:00`);
  const n = Math.round((d.getTime() - new Date(new Date(now).setHours(12, 0, 0, 0)).getTime()) / 86_400_000);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1 && n < 7) return d.toLocaleDateString('en-GB', { weekday: 'short' });
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** Tick a task with Undo in the toast (a repeating one says when it is next due). */
export function useTick(ctx: LifeOSContext) {
  const toast = useToast();
  return (task: { id: string }) => {
    const rec = ctx.records.get<TaskData>(task.id);
    if (!rec) return;
    if (rec.status === 'done') return undoComplete(ctx, rec.id, { repeated: false });
    const r = completeTask(ctx, rec);
    const next = r.repeated ? ctx.records.get<TaskData>(rec.id)?.data.dueDate : undefined;
    toast.show({ message: r.repeated ? `Done · next ${dueWords(next)}` : 'Done', icon: 'check', undo: () => undoComplete(ctx, rec.id, r) });
  };
}

/** A task: tick, title, due (late in alert) · repeats · project. */
export function TaskRow({ task, ctx, project, onTick }: { task: AgendaTask; ctx: LifeOSContext; project?: boolean; onTick: (t: AgendaTask) => void }) {
  const router = useRouter();
  const done = task.status === 'done';
  const p = project && task.projectId ? ctx.records.get(task.projectId)?.title : null;
  const sub = [task.priority === 'urgent' || task.priority === 'high' ? task.priority : null, task.repeat ? REPEAT_WORDS[task.repeat] : null, p].filter(Boolean).join(' · ');
  return (
    <RowItem
      title={task.title}
      subtitle={sub || null}
      value={done ? null : task.daysLate ? `${task.daysLate} d late` : task.due ? dueWords(task.due) : null}
      valueTone={task.daysLate ? 'alert' : 'secondary'}
      checked={done}
      onToggle={() => onTick(task)}
      onPress={() => router.push(`/entity/task/${task.id}` as never)}
    />
  );
}

/** An event: its time (or all day), title, kind · location. */
export function EventRow({ ev, ctx }: { ev: AgendaEvent; ctx: LifeOSContext }) {
  const router = useRouter();
  const kind = ev.kind && ev.kind !== 'event' ? ev.kind.charAt(0).toUpperCase() + ev.kind.slice(1) : null;
  return (
    <RowItem
      icon="calendar"
      tint="tasks"
      title={ev.title}
      subtitle={[kind, ev.location?.split(',')[0]].filter(Boolean).join(' · ') || null}
      value={ev.allDay ? 'All day' : ctx.format.time(ev.start)}
      meta={!ev.allDay && ev.end ? ctx.format.time(ev.end) : null}
      onPress={() => router.push(`/entity/event/${ev.id}` as never)}
    />
  );
}

/** A project: name, status, the progress bar, "3 of 8 · next: Book movers", overdue in alert. */
export function ProjectCard({ title, status, done, total, next, overdue, target, onPress }: { title: string; status: string; done: number; total: number; next?: string | null; overdue: number; target?: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${done} of ${total} tasks done`} onPress={onPress} style={({ pressed }) => ({ backgroundColor: pressed ? t.c.bg.pressed : t.c.bg.tile, borderRadius: t.radius.tile, padding: 16, gap: 10 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', color: t.c.fg.primary }}>{title}</Text>
        {status !== 'active' ? <Label>{status.replace('_', ' ')}</Label> : target ? <Label>{`by ${dueWords(target)}`}</Label> : null}
      </View>
      <ProgressBar value={total ? done / total : 0} color={ACCENT} height={10} accessibilityLabel={`${done} of ${total} tasks done`} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>
          {[`${done} of ${total}`, next ? `next: ${next}` : null].filter(Boolean).join(' · ')}
        </Text>
        {overdue ? <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.alert.coralText }}>{`${overdue} late`}</Text> : null}
      </View>
    </Pressable>
  );
}

/** 11/600 UPPERCASE tertiary (NR section label). */
export function Label({ children, color }: { children: ReactNode; color?: string }) {
  const t = useTheme();
  return <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase', color: color ?? t.c.fg.tertiary }}>{children}</Text>;
}

/** A record page's top bar: back, then edit and more. */
export function PageTop({ controls }: { controls?: RecordControls }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <IconButton icon="chevron-left" accessibilityLabel="Back" filled onPress={controls?.back} />
      <View style={{ flex: 1 }} />
      <IconButton icon="edit" accessibilityLabel="Edit" filled onPress={controls?.edit} />
      <IconButton icon="more" accessibilityLabel="More" filled onPress={controls?.more} />
    </View>
  );
}

/** A page title: 30/700 with an eyebrow above. */
export function PageTitle({ eyebrow, title, done }: { eyebrow?: string | null; title: string; done?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      {eyebrow ? <Label color={ACCENT}>{eyebrow}</Label> : null}
      <Text accessibilityRole="header" style={{ fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6, color: done ? t.c.fg.secondary : t.c.fg.primary, textDecorationLine: done ? 'line-through' : 'none' }}>{title}</Text>
    </View>
  );
}
