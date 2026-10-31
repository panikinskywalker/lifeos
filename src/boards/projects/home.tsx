import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { EmptyState, IconButton, Screen, Section, Text } from '@ui/kit';
import { agendaToday, overdueTasks, projectStatus, upcomingTasks, type ProjectData } from '@modules/projects';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { ACCENT, EventRow, ProjectCard, TaskRow, useTick } from './parts';

/**
 * The Projects home (the board's index; a first pass from the kit until the
 * NR-Projects-Home artboard, laid out as docs/design/PROJECTS-BRIEF.md
 * screen 1): Today (events in time order, then tasks due today), Overdue
 * (longest late first), Projects with their progress, and Coming up.
 */

export function ProjectsHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const tick = useTick(ctx);

  const d = useLive((os) => {
    const now = Date.now();
    const projects = os.records
      .query<ProjectData>('project', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }] } }, { limit: 100 })
      .map((p) => projectStatus(os, p, now))
      .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || b.overdue.length - a.overdue.length || (a.target ?? '9').localeCompare(b.target ?? '9'));
    return { now, today: agendaToday(os, now), overdue: overdueTasks(os, now), upcoming: upcomingTasks(os, now, 6), projects, any: os.records.count('task') + os.records.count('project') + os.records.count('event') };
  }, []);

  const day = new Date(d.now).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const counts = [`${d.today.events.length + d.today.tasks.length} today`, d.overdue.length ? `${d.overdue.length} overdue` : null].filter(Boolean).join(' · ');
  const right = (
    <>
      <ToCheckBell />
      <IconButton icon="plus" filled={ACCENT} color={t.c.fg.onAccent} accessibilityLabel="New task" onPress={() => router.push('/entity/task/new' as never)} />
    </>
  );
  const header = { title: 'Projects', subtitle: `${day} · ${counts}`, right, onBack: () => (router.canGoBack() ? router.back() : router.replace('/browse' as never)) };

  if (!d.any) {
    return (
      <Screen {...header}>
        <EmptyState icon="check-circle" tint="tasks" title="Nothing to do yet" line="Add a task, or turn on the calendar in Data sources and your events come in on their own." action="New task" onAction={() => router.push('/entity/task/new' as never)} />
      </Screen>
    );
  }

  return (
    <Screen {...header} contentStyle={{ gap: 14 }}>
      <Section title="Today" action="Event" onAction={() => router.push('/entity/event/new' as never)}>
        {d.today.events.map((ev) => <EventRow key={ev.id} ev={ev} ctx={ctx} />)}
        {d.today.tasks.map((x) => <TaskRow key={x.id} task={x} ctx={ctx} project onTick={tick} />)}
        {!d.today.events.length && !d.today.tasks.length ? <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, paddingHorizontal: 4 }}>Nothing on today.</Text> : null}
      </Section>

      {d.overdue.length ? (
        <Section title="Overdue" meta={String(d.overdue.length)}>
          {d.overdue.slice(0, 8).map((x) => <TaskRow key={x.id} task={x} ctx={ctx} project onTick={tick} />)}
        </Section>
      ) : null}

      <Section title="Projects" action="New" onAction={() => router.push('/entity/project/new' as never)}>
        {d.projects.length ? (
          d.projects.map((p) => <ProjectCard key={p.id} title={p.title} status={p.status} done={p.done} total={p.total} next={p.next?.title} overdue={p.overdue.length} target={p.target} onPress={() => router.push(`/entity/project/${p.id}` as never)} />)
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, paddingHorizontal: 4 }}>A project is a set of tasks with an aim: a flat move, a trip to plan.</Text>
        )}
      </Section>

      {d.upcoming.length ? (
        <Section title="Coming up" action="All tasks" onAction={() => router.push('/entity/task' as never)}>
          {d.upcoming.map((x) => <TaskRow key={x.id} task={x} ctx={ctx} project onTick={tick} />)}
        </Section>
      ) : null}
      <View style={{ height: 8 }} />
    </Screen>
  );
}
