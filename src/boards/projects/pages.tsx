import React, { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { Icon, ProgressBar, Text, useToast } from '@ui/kit';
import { PRIORITIES, REPEATS, dueCycle, isOpen, projectStatus, projectType, tasksOf, type EventData, type ProjectData, type TaskData } from '@modules/projects';
import { ACCENT, BigButton, EventCard, Face, Fact, Facts, Hair, Head, Label, NoteBar, PageTitle, PageTop, RecordPill, Rows, TaskRow, clock, dayDate, daysTo, dueWords, personsOf, shortDay, useTick, type DayTask } from './parts';

/**
 * The record pages Projects draws whole (placement 'page'; NR-Projects-Task,
 * -Project, -Event and -States): a Task with its big Done button and what's
 * been done before, a Project with its progress, tasks, events and what's
 * done, an Event with when, where and who (a flight as its route).
 */

type PageProps = { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: ReactNode }; // eslint-disable-line @typescript-eslint/no-explicit-any

function Page({ controls, children, say, gap = 18 }: { controls?: RecordControls; children: ReactNode; say?: ReactNode; gap?: number }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, gap }}>
      <PageTop controls={controls} />
      {children}
      {say}
    </View>
  );
}

/** A labelled block: the small caps label, then what's under it. */
function Block({ label, gap = 10, children }: { label: string; gap?: number; children: ReactNode }) {
  return (
    <View style={{ gap }}>
      <Label style={{ paddingHorizontal: 4 }}>{label}</Label>
      {children}
    </View>
  );
}

function Notes({ children }: { children?: string }) {
  const t = useTheme();
  if (!children) return null;
  return (
    <Block label="Notes" gap={8}>
      <Text style={{ paddingHorizontal: 4, fontSize: 15, lineHeight: 22, color: t.c.fg.secondary }}>{children}</Text>
    </Block>
  );
}

/** People linked to a record, as pills with their faces. */
function People({ ctx, id, label, note }: { ctx: LifeOSContext; id: string; label: string; note?: string | null }) {
  const t = useTheme();
  const router = useRouter();
  const people = personsOf(ctx, id);
  if (!people.length) return null;
  return (
    <Block label={label}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {people.map((p) => <RecordPill key={p.id} label={p.title} leading={<Face ctx={ctx} id={p.id} name={p.title} />} onPress={() => router.push(`/entity/person/${p.id}` as never)} />)}
      </View>
      {note ? <Text style={{ paddingHorizontal: 4, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{note}</Text> : null}
    </Block>
  );
}

/** What the button says it will do for a repeating task. */
const NEXT_WORDS: Record<string, string> = { day: 'tomorrow', week: 'next week', '2weeks': 'in 2 weeks', month: 'next month', '3months': 'in 3 months', year: 'next year' };

export function TaskPage({ entity, ctx, controls, say }: PageProps) {
  const t = useTheme();
  const router = useRouter();
  const tick = useTick(ctx);
  const id = entity.id as string;
  const d = useLive((os) => {
    const task = os.records.get<TaskData>(id);
    if (!task) return null;
    const cycle = dueCycle(os, id);
    return { task, cycle, project: task.data.projectId ? os.records.get(task.data.projectId) : null, history: cycle ? os.cycles.stats(cycle.id).history : [] };
  }, [id]);
  if (!d) return null;
  const { task, project } = d;
  const done = task.status === 'done';
  const due = task.data.dueDate;
  const repeat = REPEATS.find((r) => r.value === task.data.repeat);
  const pr = PRIORITIES.find((p) => p.value === task.data.priority) ?? PRIORITIES[1]!;
  const dot = { low: t.c.fg.tertiary, medium: blocks.sky, high: blocks.orange, urgent: t.c.alert.coralText }[pr.value];
  const n = due ? daysTo(due) : 0;
  const late = !done && due && n < 0 ? -n : 0;
  const dueText = !due ? 'No date' : done ? format(dayDate(due), 'EEE d MMM') : n === 0 ? 'today' : n === 1 ? 'tomorrow' : `${format(dayDate(due), 'EEE d MMM')}${late ? ` · ${late} d late` : ''}`;
  const lastDone = repeat ? d.cycle?.lastDoneAt : task.data.completedAt;
  const onTime = d.history.filter((h) => !h.late).length;
  return (
    <Page controls={controls} say={say}>
      <PageTitle eyebrow={project?.title ?? 'Task'} onEyebrow={project ? () => router.push(`/entity/project/${project.id}` as never) : undefined} title={task.title} done={done} />
      {done ? <BigButton title="Reopen" icon="undo" secondary onPress={() => tick(task)} /> : <BigButton title={repeat ? `Done · ${NEXT_WORDS[repeat.value]}` : 'Done'} icon="check" onPress={() => tick(task)} />}
      <Facts>
        <Fact label="Due" value={dueText} color={!due ? t.c.fg.tertiary : late ? t.c.alert.coralText : !done && n === 0 ? t.c.accent.mustard : undefined} />
        <Fact label="Repeats" value={repeat?.label ?? 'Never'}>
          {repeat ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="repeat" size={14} color={ACCENT} />
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>{repeat.label}</Text>
            </View>
          ) : undefined}
        </Fact>
        <Fact label="Priority" value={pr.label}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>{pr.label}</Text>
          </View>
        </Fact>
        {project ? <Fact label="Project" value={project.title} onPress={() => router.push(`/entity/project/${project.id}` as never)} /> : null}
        {task.data.estimateMin ? <Fact label="Estimate" value={`${task.data.estimateMin} min`} /> : null}
        {lastDone ? <Fact label={repeat ? 'Last done' : 'Done on'} value={format(lastDone, 'd MMM yyyy')} /> : null}
      </Facts>
      <People ctx={ctx} id={id} label="People" />
      <Notes>{task.data.notes}</Notes>
      {!done && !repeat && due && d.cycle ? <NoteBar icon="repeat" color={ACCENT}>{`Its Due is a Cycle, so it is in Upkeep too${late ? `, overdue there by ${late} d` : ''}.`}</NoteBar> : null}
      {repeat && d.history.length ? (
        <View style={{ gap: 10 }}>
          <Head title="Done before" right={`${onTime} of ${d.history.length} on time`} />
          <View style={{ borderRadius: 24, backgroundColor: t.c.bg.tile, paddingVertical: 10, paddingHorizontal: 16 }}>
            {d.history.slice(0, 6).map((h) => (
              <View key={h.eventId} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: h.late ? t.c.alert.coralText : t.c.accent.mustard }} />
                <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'], color: t.c.fg.primary }}>{format(h.at, 'd MMM yyyy')}</Text>
                <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: h.late ? '600' : '400', color: h.late ? t.c.alert.coralText : t.c.fg.secondary }}>{h.late ? 'late' : 'on time'}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </Page>
  );
}

/** A slab in the progress card: label, value, one small line. */
function Slab({ label, value, sub, color, small, onPress }: { label: string; value: string; sub: string; color?: string; small?: boolean; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole={onPress ? 'link' : undefined} accessibilityLabel={`${label}: ${value}, ${sub}`} disabled={!onPress} onPress={onPress} style={({ pressed }) => ({ flex: 1, minWidth: 0, gap: 4, padding: 12, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
      <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase', color: t.c.fg.secondary }}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit={!small} minimumFontScale={0.7} style={{ fontSize: small ? 15 : 20, lineHeight: 24, fontWeight: '700', fontVariant: ['tabular-nums'], color: color ?? t.c.fg.primary }}>{value}</Text>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, color: t.c.fg.secondary }}>{sub}</Text>
    </Pressable>
  );
}

export function ProjectPage({ entity, ctx, controls, say }: PageProps) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const tick = useTick(ctx);
  const id = entity.id as string;
  const d = useLive((os) => {
    const p = os.records.get<ProjectData>(id);
    if (!p) return null;
    const now = Date.now();
    const s = projectStatus(os, p, now);
    const tasks = tasksOf(os, id);
    const row = (x: (typeof tasks)[number]): DayTask => ({ id: x.id, title: x.title, due: x.data.dueDate, priority: x.data.priority ?? 'medium', projectId: id, status: x.status ?? 'todo', daysLate: x.data.dueDate ? Math.max(0, -daysTo(x.data.dueDate, now)) : 0, repeat: x.data.repeat || undefined });
    const done = tasks.filter((x) => x.status === 'done').sort((a, b) => (a.data.completedAt ?? 0) - (b.data.completedAt ?? 0)).map(row);
    const open = tasks.filter(isOpen).map(row).sort((a, b) => b.daysLate - a.daysLate || (a.due ?? '9').localeCompare(b.due ?? '9'));
    return { now, s, done, open, area: projectType.fields.find((f) => f.key === 'area')?.options?.find((a) => a.value === p.data.area)?.label };
  }, [id]);
  if (!d) return null;
  const { s } = d;
  const status = projectType.statuses?.find((x) => x.value === s.status)?.label ?? s.status;
  const addTask = () => router.push({ pathname: '/entity/[type]/new', params: { type: 'task', projectId: id } } as never);
  const left = s.target ? daysTo(s.target, d.now) : null;
  const target = s.target ? [`by ${shortDay(s.target)}`, left == null ? null : left > 0 ? `${left} d left` : left < 0 ? `${-left} d past` : 'today'].filter(Boolean).join(' · ') : null;
  const allDone = s.total > 0 && s.open === 0;
  const firstLate = s.overdue[0];
  const spent = s.spend ? ctx.format.currency(s.spend) : null;
  const markDone = () => {
    const was = s.status;
    ctx.records.update(id, { status: 'done' });
    toast.show({ message: 'Project done', icon: 'check', undo: () => void ctx.records.update(id, { status: was }) });
  };
  return (
    <Page controls={controls} say={say} gap={20}>
      <View style={{ gap: 8 }}>
        <PageTitle eyebrow={[status, d.area].filter(Boolean).join(' · ')} title={s.title} />
        {s.aim ? <Text style={{ paddingHorizontal: 4, fontSize: 15, lineHeight: 22, color: t.c.fg.secondary }}>{s.aim}</Text> : null}
      </View>

      <View style={{ borderRadius: 28, backgroundColor: t.c.bg.tile, padding: 18, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ fontSize: 34, lineHeight: 38, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'], color: t.c.fg.primary }}>{`${s.done}/${s.total}`}</Text>
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>tasks done</Text>
          {target ? <Label>{target}</Label> : null}
        </View>
        <ProgressBar value={s.progress} color={ACCENT} height={22} accessibilityLabel={`${Math.round(s.progress * 100)}% done`} />
        {allDone ? (
          <>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>Nothing left to do</Text>
              {spent ? <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', fontVariant: ['tabular-nums'], color: t.c.fg.primary }}>{`${spent} spent`}</Text> : null}
            </View>
            {s.status !== 'done' ? <BigButton title="Mark the project done" icon="check" secondary height={48} onPress={markDone} /> : null}
          </>
        ) : firstLate || s.next || spent ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {firstLate ? <Slab label="Overdue" value={String(s.overdue.length)} sub={firstLate.title} color={t.c.alert.coralText} onPress={() => router.push(`/entity/task/${firstLate.id}` as never)} /> : null}
            {s.next ? <Slab label="Next" value={s.next.title} sub={s.next.due ? dueWords(s.next.due, d.now) : 'No date'} small onPress={() => router.push(`/entity/task/${s.next!.id}` as never)} /> : null}
            {spent ? <Slab label="Spent" value={spent} sub="from Money" /> : null}
          </View>
        ) : null}
      </View>

      <View style={{ gap: 10 }}>
        <Head title="Tasks" meta={d.open.length ? `${d.open.length} open` : undefined} action="Add" onAction={addTask} />
        <Rows
          footer={
            <>
              {d.open.length ? <Hair inset={50} /> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`Add a task to ${s.title}`} onPress={addTask} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderStyle: 'dashed', borderColor: `${t.c.fg.primary}52`, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="plus" size={14} strokeWidth={2.5} color={t.c.accent.mustard} />
                  </View>
                </View>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.accent.mustard }}>{`Add a task to ${s.title}`}</Text>
              </Pressable>
            </>
          }
        >
          {d.open.map((x) => <TaskRow key={x.id} task={x} ctx={ctx} inProject onTick={tick} />)}
        </Rows>
      </View>

      {s.events.length ? (
        <View style={{ gap: 10 }}>
          <Head title="Events" />
          <EventCard events={s.events} ctx={ctx} now={d.now} minHeight={60} />
        </View>
      ) : null}

      {d.done.length ? (
        <View style={{ gap: 10 }}>
          <Head title="Done" meta={String(d.done.length)} />
          <Rows>{d.done.map((x) => <TaskRow key={x.id} task={x} ctx={ctx} inProject minHeight={56} onTick={tick} />)}</Rows>
        </View>
      ) : null}
    </Page>
  );
}

/** A flight's two ends and the dashed line with the plane, when the record has its route ("BLR → GOI"). */
function FlightRoute({ from, to, start, end }: { from: string; to: string; start: string; end?: string }) {
  const t = useTheme();
  const dash = <View style={{ flex: 1, height: 1.5, borderWidth: 0.75, borderStyle: 'dashed', borderColor: `${t.c.fg.primary}38` }} />;
  const end_ = (code: string, time?: string, right?: boolean) => (
    <View style={{ gap: 2, maxWidth: '40%', alignItems: right ? 'flex-end' : 'flex-start' }}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={{ fontSize: 34, lineHeight: 38, fontWeight: '700', letterSpacing: -1, color: t.c.fg.primary }}>{code}</Text>
      {time ? <Text style={{ fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], color: t.c.fg.secondary }}>{time}</Text> : null}
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {end_(from, start)}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {dash}
        <Icon name="plane" size={20} color={ACCENT} style={{ transform: [{ rotate: '45deg' }] }} />
        {dash}
      </View>
      {end_(to, end, true)}
    </View>
  );
}

/** "in 7 days" · "today" · "tomorrow" · "2 days ago". */
const distance = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 0 ? `in ${n} days` : `${-n} days ago`);
const hoursOf = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return [m >= 60 ? `${Math.floor(m / 60)} h` : null, m % 60 ? `${m % 60} min` : null].filter(Boolean).join(' ');
};

export function EventPage({ entity, ctx, controls, say }: PageProps) {
  const t = useTheme();
  const router = useRouter();
  const id = entity.id as string;
  const d = useLive((os) => {
    const e = os.records.get<EventData>(id);
    if (!e) return null;
    return { e, project: e.data.projectId ? os.records.get(e.data.projectId) : null, trip: e.data.tripId ? os.records.get(e.data.tripId) : null, places: os.links.forEntity(id, 'at').map((l) => l.other).filter((o) => o.object === 'place') };
  }, [id]);
  if (!d) return null;
  const { e, project, trip, places } = d;
  const { startAt, endAt, allDay, kind: rawKind, source, calendars, location, airline, flightNo, cost, notes } = e.data;
  const flight = rawKind === 'flight';
  const kind = rawKind && rawKind !== 'event' ? rawKind : 'event';
  const fromCalendar = source === 'calendar';
  const start = clock(ctx, startAt);
  const end = endAt ? clock(ctx, endAt) : null;
  const sameHalf = end && start.full.slice(-2) === end.full.slice(-2);
  const time = allDay ? 'All day' : end ? `${sameHalf ? start.lead : start.full} – ${end.full}` : start.full;
  const n = daysTo(format(startAt, 'yyyy-MM-dd'));
  const dayLine = (
    <>
      {format(startAt, 'EEEE d MMMM')}
      {' · '}
      <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: n >= 0 ? t.c.accent.mustard : t.c.fg.secondary }}>{distance(n)}</Text>
    </>
  );
  const route = flight ? location?.split(/\s*→\s*/) : null;
  const hasRoute = route?.length === 2;
  const flightName = [airline, flightNo].filter(Boolean).join(' ');
  return (
    <Page controls={controls} say={say}>
      <PageTitle icon={flight ? 'plane' : 'calendar'} eyebrow={[kind, fromCalendar ? 'from your calendar' : null].filter(Boolean).join(' · ')} title={e.title} />

      {hasRoute ? (
        <View style={{ borderRadius: 28, backgroundColor: t.c.bg.tile, padding: 18, gap: 14 }}>
          <FlightRoute from={route![0]!} to={route![1]!} start={allDay ? '' : start.full} end={end?.full} />
          <Hair />
          <View style={{ gap: 2 }}>
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>{dayLine}</Text>
            {flightName || endAt ? <Text style={{ fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], color: t.c.fg.secondary }}>{[flightName, endAt ? hoursOf(endAt - startAt) : null].filter(Boolean).join(' · ')}</Text> : null}
          </View>
        </View>
      ) : (
        <View style={{ borderRadius: 24, backgroundColor: t.c.bg.tile, padding: 18, gap: 4 }}>
          <Label>When</Label>
          <Text style={{ fontSize: 28, lineHeight: 34, fontWeight: '700', letterSpacing: -0.6, fontVariant: ['tabular-nums'], color: t.c.fg.primary }}>{time}</Text>
          <Text style={{ fontSize: 15, lineHeight: 20, color: t.c.fg.secondary }}>{dayLine}</Text>
        </View>
      )}

      {(location && !hasRoute) || places.length ? (
        <Block label="Where">
          {location && !hasRoute ? <Text style={{ paddingHorizontal: 4, fontSize: 15, lineHeight: 20, color: t.c.fg.primary }}>{location}</Text> : null}
          {places.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {places.map((p) => <RecordPill key={p.id} label={p.title} leading={<View style={{ paddingLeft: 4 }}><Icon name="location" size={16} color={t.c.accent.mustard} /></View>} onPress={() => router.push(`/entity/place/${p.id}` as never)} />)}
            </View>
          ) : null}
        </Block>
      ) : null}

      <People ctx={ctx} id={id} label="With" note={fromCalendar ? 'From the invite. Once it has happened, it counts as you spoke.' : null} />

      <Facts>
        {project ? <Fact label="Project" value={project.title} onPress={() => router.push(`/entity/project/${project.id}` as never)} /> : <Fact label="Project" value="None" color={t.c.fg.tertiary} onPress={controls?.edit} />}
        {trip ? <Fact label="Trip" value={trip.title} onPress={() => router.push(`/entity/trip/${trip.id}` as never)} /> : null}
        {flightName ? <Fact label="Flight" value={flightName} /> : null}
        {cost ? <Fact label="Cost" value={ctx.format.currency(cost)} /> : null}
        {calendars?.length ? <Fact label="Calendars" value={calendars.join(', ')} /> : null}
      </Facts>

      <Notes>{notes}</Notes>

      {fromCalendar && (calendars?.length ?? 0) > 1 ? <NoteBar icon="lock">{`On ${calendars!.length} of your calendars, shown once. Read from the phone’s calendar; it stays on this phone.`}</NoteBar> : null}
    </Page>
  );
}
