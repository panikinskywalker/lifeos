import React, { type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, IconButton, Screen, Text } from '@ui/kit';
import { overdueTasks, projectStatus, projectType, upcomingTasks, type ProjectData } from '@modules/projects';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { ACCENT, EventCard, Hair, Head, Label, NoteCard, ProjectCard, Rows, TaskRow, dayTasks, useTick } from './parts';

/**
 * The Projects home (the board's index, NR-Projects-Home and -States): Today
 * (calendar, then what's due), Overdue (longest late first; past 8, a compact
 * list and a link to all), Projects with their progress, and Coming up.
 */

const STATUS_RANK: Record<string, number> = { active: 0, planning: 1, on_hold: 2 };
const AREAS = projectType.fields.find((f) => f.key === 'area')?.options ?? [];
const MAX_OVERDUE = 8;

/** The top bar: back, the day and counts over the 22 title (overdue in coral), then what's on the right. */
function HomeTop({ line, late, right, onBack }: { line: string; late?: number; right: ReactNode; onBack: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <IconButton icon="chevron-left" accessibilityLabel="Back" filled onPress={onBack} />
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], color: t.c.fg.secondary }}>
          {line}
          {late ? ' · ' : ''}
          {late ? <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.alert.coralText }}>{`${late} overdue`}</Text> : null}
        </Text>
        <Text variant="title" accessibilityRole="header" numberOfLines={1} style={{ fontSize: 22, lineHeight: 25, fontWeight: '700', letterSpacing: -0.5 }}>Projects</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{right}</View>
    </View>
  );
}

/** A 48 button in the empty card. */
function EmptyButton({ title, icon, primary, onPress }: { title: string; icon: string; primary?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ height: 48, alignSelf: 'stretch', borderRadius: 999, backgroundColor: primary ? t.c.accent.mustard : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
      <Icon name={icon} size={16} strokeWidth={primary ? 2.5 : 2} color={primary ? t.c.accent.mustardInk : t.c.accent.mustard} />
      <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: primary ? '700' : '600', color: primary ? t.c.accent.mustardInk : t.c.fg.primary }}>{title}</Text>
    </Pressable>
  );
}

/** Nothing yet: the lilac disc, New task, Turn on the calendar, what it reads. */
function EmptyCard() {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ borderRadius: 28, backgroundColor: t.c.bg.tile, paddingVertical: 28, paddingHorizontal: 22, alignItems: 'center', gap: 14 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="check-circle" size={28} color={t.c.fg.onAccent} />
      </View>
      <Text accessibilityRole="header" style={{ fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3, color: t.c.fg.primary }}>Nothing to do yet</Text>
      <Text style={{ fontSize: 15, lineHeight: 21, textAlign: 'center', color: t.c.fg.secondary }}>Add a task, or turn on the calendar in Data sources and your events come in on their own.</Text>
      <View style={{ alignSelf: 'stretch', gap: 8, paddingTop: 4 }}>
        <EmptyButton title="New task" icon="plus" primary onPress={() => router.push('/entity/task/new' as never)} />
        <EmptyButton title="Turn on the calendar" icon="calendar" onPress={() => router.push('/settings/sources' as never)} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingTop: 4 }}>
        <Icon name="lock" size={14} color={t.c.fg.secondary} style={{ marginTop: 2 }} />
        <Text style={{ flex: 1, fontSize: 12, lineHeight: 16, color: t.c.fg.secondary }}>Reads a month back and two months ahead from the phone’s calendar. The same meeting in four accounts comes in once. It stays on this phone.</Text>
      </View>
    </View>
  );
}

/** A quiet pill to a whole list, at the foot of Home. */
function ListLink({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={label} hitSlop={6} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 2, height: 32, paddingLeft: 12, paddingRight: 8, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>{label}</Text>
      <Icon name="chevron-right" size={14} color={t.c.fg.secondary} />
    </Pressable>
  );
}

export function ProjectsHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const t = useTheme();
  const router = useRouter();
  const tick = useTick(ctx);

  const d = useLive((os) => {
    const now = Date.now();
    const projects = os.records
      .query<ProjectData>('project', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }] } }, { limit: 100 })
      .map((p) => ({ ...projectStatus(os, p, now), area: AREAS.find((a) => a.value === p.data.area)?.label }))
      .sort((a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) || b.overdue.length - a.overdue.length || (a.target ?? '9').localeCompare(b.target ?? '9'));
    return { now, day: dayTasks(os, now), overdue: overdueTasks(os, now), upcoming: upcomingTasks(os, now, 3), projects, any: os.records.count('task') + os.records.count('project') + os.records.count('event') };
  }, []);

  const { events, open, done } = d.day;
  const due = [...open, ...done];
  const line = `${format(d.now, 'EEE d MMM')} · ${events.length + due.length} today`;
  const onBack = () => (router.canGoBack() ? router.back() : router.replace('/browse' as never));
  const plus = <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel="New task" onPress={() => router.push('/entity/task/new' as never)} />;

  if (!d.any) {
    return (
      <Screen contentStyle={{ gap: 16 }}>
        <HomeTop line={line} right={plus} onBack={onBack} />
        <EmptyCard />
      </Screen>
    );
  }

  const many = d.overdue.length > MAX_OVERDUE;
  return (
    <Screen contentStyle={{ gap: 24 }}>
      <HomeTop line={line} late={d.overdue.length} onBack={onBack} right={<><ToCheckBell />{plus}</>} />

      <View style={{ gap: 10 }}>
        <Head title="Today" action="Event" onAction={() => router.push('/entity/event/new' as never)} />
        {events.length ? <Label style={{ paddingHorizontal: 4 }}>{`Calendar · ${events.length}`}</Label> : null}
        {events.length ? <EventCard events={events} ctx={ctx} now={d.now} today /> : null}
        {due.length ? <Label style={{ paddingHorizontal: 4, paddingTop: events.length ? 6 : 0 }}>{`Due today · ${due.length}`}</Label> : null}
        {due.length ? <Rows>{due.map((x) => <TaskRow key={x.id} task={x} ctx={ctx} onTick={tick} />)}</Rows> : null}
        {!events.length && !due.length ? <NoteCard icon="sun">Nothing on today.</NoteCard> : null}
      </View>

      {d.overdue.length ? (
        <View style={{ gap: 10 }}>
          <Head title="Overdue" right={String(d.overdue.length)} rightColor={t.c.alert.coralText} />
          <Rows
            footer={
              many ? (
                <>
                  <Hair />
                  <Pressable accessibilityRole="link" accessibilityLabel={`All ${d.overdue.length} overdue`} onPress={() => router.push('/module/projects/overdue' as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 48, opacity: pressed ? 0.7 : 1 })}>
                    <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.fg.secondary }}>{`All ${d.overdue.length} overdue`}</Text>
                    <Icon name="chevron-right" size={14} color={t.c.fg.secondary} />
                  </Pressable>
                </>
              ) : null
            }
          >
            {d.overdue.slice(0, MAX_OVERDUE).map((x) => <TaskRow key={x.id} task={x} ctx={ctx} compact={many} onTick={tick} />)}
          </Rows>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <Head title="Projects" action="New" onAction={() => router.push('/entity/project/new' as never)} />
        {d.projects.length ? (
          d.projects.map((p) => <ProjectCard key={p.id} title={p.title} status={p.status} area={p.area} done={p.done} total={p.total} next={p.next?.title} overdue={p.overdue.length} target={p.target} onPress={() => router.push(`/entity/project/${p.id}` as never)} />)
        ) : (
          <NoteCard icon="folder">A project is a set of tasks with an aim: a flat move, a trip to plan.</NoteCard>
        )}
      </View>

      <View style={{ gap: 10 }}>
        <Head title="Coming up" action="All tasks" chevron onAction={() => router.push('/entity/task' as never)} />
        {d.upcoming.length ? <Rows>{d.upcoming.map((x) => <TaskRow key={x.id} task={x} ctx={ctx} onTick={tick} />)}</Rows> : <NoteCard icon="calendar">Nothing else with a date.</NoteCard>}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
        <ListLink label="All events" onPress={() => router.push('/entity/event' as never)} />
        <ListLink label="All projects" onPress={() => router.push('/entity/project' as never)} />
      </View>
    </Screen>
  );
}

/** Every overdue task, the longest late first (from "All 14 overdue"). */
export function OverdueScreen({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const tick = useTick(ctx);
  const overdue = useLive((os) => overdueTasks(os), []);
  return (
    <Screen title="Overdue" subtitle={`${overdue.length} late`} onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/projects' as never))}>
      {overdue.length ? <Rows>{overdue.map((x) => <TaskRow key={x.id} task={x} ctx={ctx} onTick={tick} />)}</Rows> : <NoteCard icon="check-circle">Nothing overdue.</NoteCard>}
    </Screen>
  );
}
