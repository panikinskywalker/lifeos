import React, { Fragment, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { Icon, IconButton, ProgressBar, Text, useToast } from '@ui/kit';
import { agendaToday, completeTask, dueCycle, undoComplete, type AgendaEvent, type AgendaTask, type EventData, type TaskData } from '@modules/projects';

/**
 * Projects' parts (NR-Projects-Parts): the task row with its five states, the
 * event row (time leads today, the day leads otherwise), the now line, the
 * due word, the project card, the big button on a task and the toast after a
 * tick. Sizes and colours are the artboard's; every Projects screen draws from
 * here. Lilac is the Tasks colour from Browse.
 */

export const ACCENT = blocks.lilac;
const DAY = 86_400_000;
const REPEAT_WORDS: Record<string, string> = { day: 'Daily', week: 'Weekly', '2weeks': 'Every 2 weeks', month: 'Monthly', '3months': 'Every 3 months', year: 'Yearly' };
/** Face colours, the same per person as on People (NR-People-Parts). */
const FACE_COLORS = [blocks.pink, blocks.mint, blocks.lilac, blocks.sky, blocks.yellow, '#FFB1A1', '#FF8A6A', '#9FB8F7', '#DCEFC8', '#F2D7A0'];

const noonOf = (t: number) => new Date(t).setHours(12, 0, 0, 0);
export const ymd = (t: number) => format(t, 'yyyy-MM-dd');
export const dayDate = (day: string) => new Date(`${day.slice(0, 10)}T12:00:00`);
/** Whole days from today to a yyyy-MM-dd day: 0 today, -3 three days ago. */
export const daysTo = (day: string, now = Date.now()) => Math.round((dayDate(day).getTime() - noonOf(now)) / DAY);
/** "12 Dec". */
export const shortDay = (day: string) => format(dayDate(day), 'd MMM');

/** The due word: "today" · "tomorrow" · "Thu" (within the week) · "10 Nov". */
export function dueWords(day: string | undefined, now = Date.now()): string {
  if (!day) return '';
  const n = daysTo(day, now);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 1 && n < 7 ? format(dayDate(day), 'EEE') : shortDay(day);
}

/** A time as the event row shows it: `lead` "1:30", `full` "1:30 pm" (your time format decides). */
export function clock(ctx: LifeOSContext, at: number) {
  const full = ctx.format.time(at).toLowerCase();
  return { full, lead: full.replace(/\s?[ap]m$/, '') };
}

/** Tasks due today: the open ones, and those ticked today (a repeating one has moved on, so it says when next). */
export type DayTask = AgendaTask & { doneToday?: boolean };
export function dayTasks(os: LifeOSContext, now = Date.now()) {
  const today = ymd(now);
  const from = new Date(now).setHours(0, 0, 0, 0);
  const { events, tasks: open } = agendaToday(os, now);
  const row = (t: { id: string; title: string; data: TaskData; status?: string | null }): DayTask => ({ id: t.id, title: t.title, due: t.data.dueDate, priority: t.data.priority ?? 'medium', projectId: t.data.projectId, status: t.status ?? 'todo', daysLate: 0, repeat: t.data.repeat || undefined, doneToday: true });
  const once = os.records.query<TaskData>('task', { filter: { and: [{ field: 'status', op: 'eq', value: 'done' }, { field: 'data.completedAt', op: 'gte', value: from }] } }, { limit: 200 }).filter((t) => t.data.dueDate?.slice(0, 10) === today);
  const repeats = os.records.query<TaskData>('task', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.repeat', op: 'notNull' }] } }, { limit: 500 }).filter((t) => t.data.repeat && (t.data.dueDate?.slice(0, 10) ?? '') > today && (dueCycle(os, t.id)?.lastDoneAt ?? 0) >= from);
  return { events, open: open as DayTask[], done: [...once, ...repeats].map(row) };
}

/** Tick a task with Undo in the toast (a repeating one says when it is next due); untick a ticked one. */
export function useTick(ctx: LifeOSContext) {
  const toast = useToast();
  return (task: { id: string; doneToday?: boolean }) => {
    const rec = ctx.records.get<TaskData>(task.id);
    if (!rec) return;
    if (rec.status === 'done') return undoComplete(ctx, rec.id, { repeated: false });
    if (task.doneToday) {
      const cycle = dueCycle(ctx, rec.id);
      const last = cycle ? ctx.cycles.stats(cycle.id).history[0] : null;
      return last ? undoComplete(ctx, rec.id, { repeated: true, eventId: last.eventId }) : undefined;
    }
    const r = completeTask(ctx, rec);
    const next = r.repeated ? ctx.records.get<TaskData>(rec.id)?.data.dueDate : undefined;
    toast.show({ message: r.repeated ? `Done · next ${dueWords(next)}` : 'Done', icon: r.repeated ? 'repeat' : 'check', undo: () => undoComplete(ctx, rec.id, r) });
  };
}

/** 11/600 UPPERCASE tertiary (NR section label). */
export function Label({ children, color, style }: { children: ReactNode; color?: string; style?: object }) {
  const t = useTheme();
  return <Text style={[{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase', color: color ?? t.c.fg.tertiary }, style]}>{children}</Text>;
}

/** A section head: 17/600 title, an inline meta ("5 open"), a right word (coral count) or action ("+ Event", "All tasks >"). */
export function Head({ title, meta, right, rightColor, action, chevron, onAction }: { title: string; meta?: string; right?: string; rightColor?: string; action?: string; chevron?: boolean; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
      <Text accessibilityRole="header" numberOfLines={1} style={[{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary }, meta ? null : { flex: 1 }]}>{title}</Text>
      {meta ? <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '600', fontVariant: ['tabular-nums'], color: t.c.fg.secondary }}>{meta}</Text> : null}
      {right ? <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: rightColor ? '700' : '600', fontVariant: ['tabular-nums'], color: rightColor ?? t.c.fg.secondary }}>{right}</Text> : null}
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={14} onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: chevron ? 2 : 4, alignSelf: 'center' }}>
          {chevron ? null : <Icon name="plus" size={14} color={t.c.fg.secondary} />}
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>{action}</Text>
          {chevron ? <Icon name="chevron-right" size={14} color={t.c.fg.secondary} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/** A 1px hairline. */
export function Hair({ inset = 0 }: { inset?: number }) {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line, marginLeft: inset }} />;
}

/** The card a list of task rows sits in (24, tight on the tick side), with hairlines from past the tick. */
export function Rows({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const t = useTheme();
  const list = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ borderRadius: 24, backgroundColor: t.c.bg.tile, paddingVertical: 4, paddingLeft: 6, paddingRight: 16 }}>
      {list.map((c, i) => (
        <Fragment key={i}>
          {i ? <Hair inset={50} /> : null}
          {c}
        </Fragment>
      ))}
      {footer}
    </View>
  );
}

/** A quiet one-liner in a card ("Nothing on today."). */
export function NoteCard({ icon, children }: { icon: string; children: string }) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: 24, backgroundColor: t.c.bg.tile, paddingVertical: 18, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Icon name={icon} size={18} color={ACCENT} />
      <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, color: t.c.fg.secondary }}>{children}</Text>
    </View>
  );
}

/** The 44 target around the 26 tick: open, late (coral ring), blocked (dashed), done (lime). */
function Tick({ title, done, late, blocked, onPress }: { title: string; done: boolean; late: boolean; blocked: boolean; onPress: () => void }) {
  const t = useTheme();
  const press = () => {
    if (Platform.OS !== 'web') void Haptics.selectionAsync().catch(() => {});
    onPress();
  };
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={`${done ? 'Untick' : 'Tick'} ${title}${blocked ? ', blocked' : ''}`} accessibilityState={{ checked: done }} onPress={press} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {done ? (
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={15} strokeWidth={3} color={t.c.accent.mustardInk} />
        </View>
      ) : (
        <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderStyle: blocked ? 'dashed' : 'solid', borderColor: late ? t.c.alert.coralText : `${t.c.fg.primary}52`, alignItems: 'center', justifyContent: 'center' }}>
          {blocked ? <Icon name="x-circle" size={14} color={t.c.fg.secondary} /> : null}
        </View>
      )}
    </Pressable>
  );
}

/**
 * The second line of a task row. A priority word only when high or urgent;
 * then, on Home, its repeat and project (or its note and estimate); on a
 * project's page, who with, the estimate or the note; "No date" if nothing else.
 */
function TaskLine({ task, ctx, inProject, done }: { task: DayTask; ctx: LifeOSContext; inProject?: boolean; done: boolean }) {
  const t = useTheme();
  const rec = ctx.records.get<TaskData>(task.id);
  const repeat = task.repeat ? REPEAT_WORDS[task.repeat] : null;
  const style = { fontSize: 13, lineHeight: 17, color: t.c.fg.secondary };
  let line: string;
  let word: { text: string; color: string } | null = null;
  if (done) {
    const at = rec?.data.completedAt;
    line = repeat && task.doneToday ? `${repeat} · next ${dueWords(rec?.data.dueDate)}` : at && ymd(at) === ymd(Date.now()) ? 'Done today' : at ? `Done ${format(at, 'd MMM')}` : 'Done';
  } else {
    word = task.status === 'blocked' ? { text: 'Blocked', color: t.c.fg.primary } : task.priority === 'urgent' ? { text: 'Urgent', color: t.c.alert.coralText } : task.priority === 'high' ? { text: 'High', color: t.c.fg.primary } : null;
    const note = rec?.data.notes?.split('\n')[0]?.trim();
    const estimate = rec?.data.estimateMin ? `${rec.data.estimateMin} min` : null;
    const project = task.projectId ? ctx.records.get(task.projectId)?.title : null;
    const person = inProject ? personsOf(ctx, task.id)[0]?.title.split(' ')[0] : null;
    const rest = inProject ? [repeat, person ? `with ${person}` : null, estimate, note] : project ? [repeat, project] : [repeat, note, estimate];
    line = rest.filter(Boolean).slice(0, word ? 1 : 2).join(' · ');
    if (!line && !word && inProject && !task.due) line = 'No date';
  }
  if (!line && !word) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 }}>
      {repeat ? <Icon name="repeat" size={12} color={t.c.fg.secondary} /> : null}
      <Text numberOfLines={1} style={[style, { flexShrink: 1 }]}>
        {word ? <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: word.color }}>{word.text}</Text> : null}
        {word && line ? ' · ' : ''}
        {line}
      </Text>
    </View>
  );
}

/** A task: tick · title · second line · due word. `compact` is the long-overdue list: one line, 52 tall. */
export function TaskRow({ task, ctx, inProject, compact, minHeight = 60, onTick }: { task: DayTask; ctx: LifeOSContext; inProject?: boolean; compact?: boolean; minHeight?: number; onTick: (t: DayTask) => void }) {
  const t = useTheme();
  const router = useRouter();
  const done = task.status === 'done' || !!task.doneToday;
  const blocked = !done && task.status === 'blocked';
  const late = !done && task.daysLate > 0;
  const word = done ? null : late ? `${task.daysLate} d late` : task.due ? dueWords(task.due) : null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: compact ? 52 : minHeight }}>
      <Tick title={task.title} done={done} late={late} blocked={blocked} onPress={() => onTick(task)} />
      <Pressable accessibilityRole="button" accessibilityLabel={[task.title, word].filter(Boolean).join(', ')} onPress={() => router.push(`/entity/task/${task.id}` as never)} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.7 : 1 })}>
        <View style={{ flex: 1, minWidth: 0, gap: 2, opacity: done ? 0.45 : 1 }}>
          <Text numberOfLines={1} style={{ fontSize: compact ? 15 : 16, lineHeight: compact ? 20 : 21, fontWeight: '600', color: blocked ? t.c.fg.secondary : t.c.fg.primary, textDecorationLine: done ? 'line-through' : 'none' }}>{task.title}</Text>
          {compact ? null : <TaskLine task={task} ctx={ctx} inProject={inProject} done={done} />}
        </View>
        {word ? <Text style={{ flexShrink: 0, fontSize: 13, lineHeight: 17, fontWeight: late ? '700' : '600', fontVariant: ['tabular-nums'], color: late ? t.c.alert.coralText : t.c.fg.secondary }}>{word}</Text> : null}
      </Pressable>
    </View>
  );
}

/** People linked to a record (with, person). */
export function personsOf(ctx: LifeOSContext, id: string) {
  const seen = new Set<string>();
  return ['with', 'person'].flatMap((w) => ctx.links.forEntity(id, w)).map((l) => l.other).filter((o) => o.object === 'person' && !seen.has(o.id) && seen.add(o.id));
}

/** A person's round face: their photo, or their initial on their colour. */
export function Face({ ctx, id, name, size = 28 }: { ctx: LifeOSContext; id: string; name: string; size?: 24 | 28 }) {
  const t = useTheme();
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const photo = ctx.records.get<{ photo?: { uri?: string } }>(id)?.data.photo?.uri;
  const initial = name.trim().match(/\p{L}|\p{N}/u)?.[0]?.toUpperCase() ?? '?';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: FACE_COLORS[h % FACE_COLORS.length], alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
      {photo ? <Image source={{ uri: photo }} style={{ width: size, height: size }} contentFit="cover" /> : <Text style={{ fontSize: size === 28 ? 11 : 9, lineHeight: size === 28 ? 14 : 12, fontWeight: '700', color: t.c.fg.onAccent }}>{initial}</Text>}
    </View>
  );
}

/** The row's second line: kind and place, or kind, airline and flight number. */
function eventLine(ev: AgendaEvent, rec?: { airline?: string; flightNo?: string }) {
  const kind = ev.kind && ev.kind !== 'event' ? ev.kind.charAt(0).toUpperCase() + ev.kind.slice(1) : null;
  if (rec?.airline || rec?.flightNo) return [kind, rec.airline, rec.flightNo].filter(Boolean).join(' · ');
  const parts = ev.location?.split(',').map((x) => x.trim()).filter(Boolean) ?? [];
  const place = parts.length > 1 && !kind ? `${parts[0]} · ${parts[parts.length - 1]}` : parts[0];
  return [kind, place].filter(Boolean).join(' · ') || null;
}

/** An event: time leads today (a past one fades to 55%); on another day the day leads, the time under it. No tick: an event happens. */
export function EventRow({ ev, ctx, now, today, minHeight = 58 }: { ev: AgendaEvent; ctx: LifeOSContext; now: number; today?: boolean; minHeight?: number }) {
  const t = useTheme();
  const router = useRouter();
  const past = !!today && !ev.allDay && (ev.end ?? ev.start) < now;
  const person = personsOf(ctx, ev.id)[0];
  const sub = eventLine(ev, ctx.records.get<EventData>(ev.id)?.data);
  const start = clock(ctx, ev.start);
  const day = dueWords(ymd(ev.start), now);
  const lead = (text: string, color?: string) => <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'], color: color ?? t.c.fg.primary }}>{text}</Text>;
  const under = (text: string) => <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, fontWeight: '500', fontVariant: ['tabular-nums'], color: t.c.fg.secondary }}>{text}</Text>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[ev.title, ev.allDay ? 'all day' : start.full, sub].filter(Boolean).join(', ')} onPress={() => router.push(`/entity/event/${ev.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight, opacity: pressed ? 0.7 : past ? 0.55 : 1 })}>
      <View style={{ width: 64, flexShrink: 0, gap: 1 }}>
        {today ? (
          ev.allDay ? (
            <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: ACCENT }}>All day</Text>
          ) : ev.end ? (
            <>
              {lead(start.lead)}
              {under(clock(ctx, ev.end).full)}
            </>
          ) : (
            lead(start.full)
          )
        ) : (
          <>
            {lead(day, day === 'today' || day === 'tomorrow' ? ACCENT : undefined)}
            {under(ev.allDay ? 'All day' : start.full)}
          </>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{ev.title}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{sub}</Text> : null}
      </View>
      {person ? <Face ctx={ctx} id={person.id} name={person.title} /> : null}
    </Pressable>
  );
}

/** Where you are in today's events: the time and a lime line. */
function NowLine({ ctx, now }: { ctx: LifeOSContext; now: number }) {
  const t = useTheme();
  const { full, lead } = clock(ctx, now);
  return (
    <View accessible accessibilityLabel={`Now, ${full}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 22 }}>
      <Text style={{ width: 56, fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.9, fontVariant: ['tabular-nums'], color: t.c.accent.mustard }}>{lead}</Text>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.c.accent.mustard }} />
      <View style={{ flex: 1, height: 1.5, backgroundColor: t.c.accent.mustard, opacity: 0.6 }} />
    </View>
  );
}

/** A card of event rows; `today` draws the now line before the next timed event. */
export function EventCard({ events, ctx, now, today, minHeight }: { events: AgendaEvent[]; ctx: LifeOSContext; now: number; today?: boolean; minHeight?: number }) {
  const t = useTheme();
  const timed = events.some((e) => !e.allDay);
  const next = events.findIndex((e) => !e.allDay && e.start > now);
  const at = !today || !timed ? -1 : next < 0 ? events.length : next;
  return (
    <View style={{ borderRadius: 24, backgroundColor: t.c.bg.tile, paddingVertical: 6, paddingHorizontal: 16 }}>
      {events.map((ev, i) => (
        <Fragment key={ev.id}>
          {i === at ? <NowLine ctx={ctx} now={now} /> : i ? <Hair /> : null}
          <EventRow ev={ev} ctx={ctx} now={now} today={today} minHeight={minHeight} />
        </Fragment>
      ))}
      {at === events.length ? <NowLine ctx={ctx} now={now} /> : null}
    </View>
  );
}

/** A project: name, target (active) or status pill (planning, on hold; on hold dims), the bar, "3 of 8 · next: Pack books", late in coral. */
export function ProjectCard({ title, status, area, done, total, next, overdue, target, onPress }: { title: string; status: string; area?: string | null; done: number; total: number; next?: string | null; overdue: number; target?: string; onPress: () => void }) {
  const t = useTheme();
  const hold = status === 'on_hold';
  const pill = status === 'planning' ? ['Planning', target ? shortDay(target) : null].filter(Boolean).join(' · ') : hold ? 'On hold' : null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}, ${pill ? `${pill}, ` : ''}${done} of ${total} tasks done`} onPress={onPress} style={({ pressed }) => ({ backgroundColor: t.c.bg.tile, borderRadius: 24, padding: 16, gap: 10, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Text numberOfLines={2} style={{ flex: 1, fontSize: 17, lineHeight: 22, fontWeight: '600', color: hold ? t.c.fg.secondary : t.c.fg.primary }}>{title}</Text>
        {pill ? (
          <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary }}>{pill}</Text>
          </View>
        ) : target ? (
          <Label style={{ lineHeight: 22 }}>{`by ${shortDay(target)}`}</Label>
        ) : area ? (
          <Label style={{ lineHeight: 22 }}>{area}</Label>
        ) : null}
      </View>
      <ProgressBar value={total ? done / total : 0} color={hold ? `${ACCENT}73` : ACCENT} height={10} accessibilityLabel={`${done} of ${total} tasks done`} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', fontVariant: ['tabular-nums'], color: hold ? t.c.fg.secondary : t.c.fg.primary }}>{`${done} of ${total}`}</Text>
          {next ? ` · next: ${next}` : ''}
        </Text>
        {overdue ? <Text style={{ flexShrink: 0, fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.alert.coralText }}>{`${overdue} late`}</Text> : null}
      </View>
    </Pressable>
  );
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

/** A page title: an eyebrow (lilac, may open something, may carry an icon) over 30/700; it wraps in full. */
export function PageTitle({ eyebrow, icon, onEyebrow, title, done }: { eyebrow: string; icon?: string; onEyebrow?: () => void; title: string; done?: boolean }) {
  const t = useTheme();
  const label = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {icon ? <Icon name={icon} size={12} color={ACCENT} /> : null}
      <Label color={ACCENT}>{eyebrow}</Label>
    </View>
  );
  return (
    <View style={{ gap: 6, paddingTop: 4, paddingHorizontal: 4 }}>
      {onEyebrow ? <Pressable accessibilityRole="link" accessibilityLabel={eyebrow} hitSlop={14} onPress={onEyebrow} style={{ alignSelf: 'flex-start' }}>{label}</Pressable> : label}
      <Text accessibilityRole="header" style={{ fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6, color: done ? t.c.fg.secondary : t.c.fg.primary, textDecorationLine: done ? 'line-through' : 'none' }}>{title}</Text>
    </View>
  );
}

/** The big button on a task: lime "Done" (or "Done · next month"), raised "Reopen". `height` 48 inside a card. */
export function BigButton({ title, icon, secondary, height = 52, onPress }: { title: string; icon: string; secondary?: boolean; height?: number; onPress: () => void }) {
  const t = useTheme();
  const big = height === 52;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ height, borderRadius: 999, backgroundColor: secondary ? t.c.bg.tileRaised : t.c.accent.mustard, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
      <Icon name={icon} size={big ? 18 : 16} strokeWidth={2.5} color={secondary ? t.c.accent.mustard : t.c.accent.mustardInk} />
      <Text style={{ fontSize: big ? 16 : 15, lineHeight: 20, fontWeight: secondary ? '600' : '700', color: secondary ? t.c.fg.primary : t.c.accent.mustardInk }}>{title}</Text>
    </Pressable>
  );
}

/** The facts card on a record (24). */
export function Facts({ children }: { children: ReactNode }) {
  const t = useTheme();
  const list = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={{ borderRadius: 24, backgroundColor: t.c.bg.tile, paddingVertical: 4, paddingHorizontal: 16 }}>
      {list.map((c, i) => (
        <Fragment key={i}>
          {i ? <Hair /> : null}
          {c}
        </Fragment>
      ))}
    </View>
  );
}

/** A label and its value, 52 tall; `onPress` adds the chevron. `value` may be drawn by `children` (a dot, an icon). */
export function Fact({ label, value, color, onPress, children }: { label: string; value?: string; color?: string; onPress?: () => void; children?: ReactNode }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'link' : undefined} accessibilityLabel={value ? `${label}: ${value}` : label} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, opacity: pressed ? 0.7 : 1 })}>
      <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, color: t.c.fg.secondary }}>{label}</Text>
      {children ?? <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'], color: color ?? t.c.fg.primary }}>{value}</Text>}
      {onPress ? <Icon name="chevron-right" size={16} color={t.c.fg.tertiary} /> : null}
    </Pressable>
  );
}

/** A 40 pill to a record: a person's face or a place's pin, then the name. */
export function RecordPill({ label, onPress, leading }: { label: string; onPress: () => void; leading: ReactNode }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} hitSlop={4} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingLeft: 6, paddingRight: 14, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
      {leading}
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.fg.primary }}>{label}</Text>
    </Pressable>
  );
}

/** A small note in a card, its icon on the left (radius 20). */
export function NoteBar({ icon, color, children }: { icon: string; color?: string; children: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20, backgroundColor: t.c.bg.tile }}>
      <Icon name={icon} size={16} color={color ?? t.c.fg.secondary} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{children}</Text>
    </View>
  );
}
