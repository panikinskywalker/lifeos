import React, { type ReactNode } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, Chip, DetailRow, ProgressBar, Section, Text, Timeline } from '@ui/kit';
import { PRIORITIES, REPEATS, dueCycle, overdueTasks, projectStatus, tasksOf, type EventData, type ProjectData, type TaskData } from '@modules/projects';
import { ACCENT, EventRow, Label, PageTitle, PageTop, TaskRow, dueWords, useTick } from './parts';

/**
 * The record pages Projects draws whole (placement 'page'; a first pass from
 * the kit until NR-Projects-Task, -Project and -Event): a Task, a Project
 * with its tasks, an Event with where and who.
 */

type PageProps = { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls; say?: ReactNode }; // eslint-disable-line @typescript-eslint/no-explicit-any

function Page({ controls, children, say }: { controls?: RecordControls; children: ReactNode; say?: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, gap: 16 }}>
      <PageTop controls={controls} />
      {children}
      {say}
    </View>
  );
}

/** Records linked to `id` by a word, as chips that open them. */
function LinkChips({ ctx, id, words, objects }: { ctx: LifeOSContext; id: string; words: string[]; objects?: string[] }) {
  const router = useRouter();
  const seen = new Set<string>();
  const list = words.flatMap((w) => ctx.links.forEntity(id, w)).filter((l) => (!objects || objects.includes(l.other.object)) && !seen.has(l.other.id) && seen.add(l.other.id));
  if (!list.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {list.map((l) => <Chip key={l.other.id} label={l.other.title} icon={l.other.object === 'person' ? 'user' : l.other.object === 'place' ? 'location' : 'folder'} onPress={() => router.push(`/entity/${l.other.object}/${l.other.id}` as never)} />)}
    </View>
  );
}

export function TaskPage({ entity, ctx, controls, say }: PageProps) {
  const t = useTheme();
  const router = useRouter();
  const tick = useTick(ctx);
  const id = entity.id as string;
  const d = useLive((os) => {
    const task = os.records.get<TaskData>(id);
    if (!task) return null;
    const cycle = dueCycle(os, id);
    const history = cycle ? os.cycles.stats(cycle.id).history.slice(0, 6) : [];
    return { task, project: task.data.projectId ? os.records.get(task.data.projectId) : null, late: overdueTasks(os).find((x) => x.id === id)?.daysLate ?? 0, history };
  }, [id]);
  if (!d) return null;
  const { task } = d;
  const done = task.status === 'done';
  const repeat = REPEATS.find((r) => r.value === task.data.repeat);
  const pr = PRIORITIES.find((p) => p.value === task.data.priority);
  return (
    <Page controls={controls} say={say}>
      <PageTitle eyebrow={d.project?.title ?? 'Task'} title={task.title} done={done} />
      <Button title={done ? 'Reopen' : repeat ? `Done · next ${repeat.label.toLowerCase().replace('every ', '')}` : 'Done'} icon={done ? 'undo' : 'check'} variant={done ? 'secondary' : 'primary'} onPress={() => tick(task)} />
      <Card>
        {task.data.dueDate ? <DetailRow label="Due" value={`${dueWords(task.data.dueDate)}${d.late ? ` · ${d.late} d late` : ''}`} valueColor={d.late && !done ? t.c.alert.coralText : undefined} /> : <DetailRow label="Due" value="No date" valueColor={t.c.fg.tertiary} onPress={controls?.edit} />}
        <DetailRow label="Repeats" value={repeat?.label ?? 'Never'} />
        <DetailRow label="Priority" value={pr?.label ?? 'Medium'} />
        {d.project ? <DetailRow label="Project" value={d.project.title} onPress={() => router.push(`/entity/project/${d.project!.id}` as never)} /> : null}
        {task.data.estimateMin ? <DetailRow label="Estimate" value={`${task.data.estimateMin} min`} /> : null}
        {task.data.completedAt ? <DetailRow label={repeat ? 'Last done' : 'Done on'} value={ctx.format.date(task.data.completedAt, 'medium')} divider={false} /> : null}
      </Card>
      <LinkChips ctx={ctx} id={id} words={['person', 'with']} objects={['person']} />
      {task.data.notes ? <Text style={{ fontSize: 15, lineHeight: 22, color: t.c.fg.secondary }}>{task.data.notes}</Text> : null}
      {d.history.length ? (
        <Section title="Done before">
          <Timeline entries={d.history.map((h) => ({ id: h.eventId, title: ctx.format.date(h.at, 'medium'), body: h.late ? 'late' : 'on time' }))} />
        </Section>
      ) : null}
    </Page>
  );
}

export function ProjectPage({ entity, ctx, controls, say }: PageProps) {
  const t = useTheme();
  const router = useRouter();
  const tick = useTick(ctx);
  const id = entity.id as string;
  const d = useLive((os) => {
    const p = os.records.get<ProjectData>(id);
    if (!p) return null;
    const s = projectStatus(os, p);
    const done = tasksOf(os, id).filter((x) => x.status === 'done').slice(0, 5).map((x) => ({ id: x.id, title: x.title, due: x.data.dueDate, priority: x.data.priority, status: 'done', daysLate: 0 }));
    const open = tasksOf(os, id).filter((x) => x.status !== 'done').map((x) => s.overdue.find((o) => o.id === x.id) ?? { id: x.id, title: x.title, due: x.data.dueDate, priority: x.data.priority, status: x.status ?? 'todo', daysLate: 0, repeat: x.data.repeat });
    return { s, done, open: open.sort((a, b) => b.daysLate - a.daysLate || (a.due ?? '9').localeCompare(b.due ?? '9')) };
  }, [id]);
  if (!d) return null;
  const { s } = d;
  const addTask = () => router.push({ pathname: '/entity/[type]/new', params: { type: 'task', projectId: id } } as never);
  return (
    <Page controls={controls} say={say}>
      <PageTitle eyebrow={s.status.replace('_', ' ')} title={s.title} />
      {s.aim ? <Text style={{ fontSize: 15, lineHeight: 22, color: t.c.fg.secondary }}>{s.aim}</Text> : null}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ fontSize: 34, lineHeight: 38, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'], color: t.c.fg.primary }}>{`${s.done}/${s.total}`}</Text>
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>tasks done</Text>
          {s.target ? <Label>{`by ${dueWords(s.target)}`}</Label> : null}
        </View>
        <ProgressBar value={s.progress} color={ACCENT} height={22} accessibilityLabel={`${Math.round(s.progress * 100)}% done`} />
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {s.overdue.length ? <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.alert.coralText }}>{`${s.overdue.length} overdue`}</Text> : null}
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{s.next ? `Next: ${s.next.title}` : s.open ? '' : 'Nothing left to do'}</Text>
          {s.spend ? <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.primary }}>{`${ctx.format.currency(s.spend)} spent`}</Text> : null}
        </View>
      </Card>
      <Section title="Tasks" meta={d.open.length ? String(d.open.length) : undefined} action="Add" onAction={addTask}>
        {d.open.length ? d.open.map((x) => <TaskRow key={x.id} task={x} ctx={ctx} onTick={tick} />) : <Button title="Add a task" icon="plus" variant="secondary" size="sm" onPress={addTask} />}
      </Section>
      {s.events.length ? (
        <Section title="Events">
          {s.events.map((ev) => <EventRow key={ev.id} ev={ev} ctx={ctx} />)}
        </Section>
      ) : null}
      {d.done.length ? (
        <Section title="Done" meta={String(s.done)}>
          {d.done.map((x) => <TaskRow key={x.id} task={x} ctx={ctx} onTick={tick} />)}
        </Section>
      ) : null}
    </Page>
  );
}

export function EventPage({ entity, ctx, controls, say }: PageProps) {
  const t = useTheme();
  const router = useRouter();
  const id = entity.id as string;
  const d = useLive((os) => {
    const e = os.records.get<EventData>(id);
    if (!e) return null;
    return { e, project: e.data.projectId ? os.records.get(e.data.projectId) : null };
  }, [id]);
  if (!d) return null;
  const { e } = d;
  const kind = e.data.kind && e.data.kind !== 'event' ? e.data.kind : null;
  const day = new Date(e.data.startAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const time = e.data.allDay ? 'All day' : [ctx.format.time(e.data.startAt), e.data.endAt ? ctx.format.time(e.data.endAt) : null].filter(Boolean).join(' – ');
  const past = (e.data.endAt ?? e.data.startAt) < Date.now();
  return (
    <Page controls={controls} say={say}>
      <PageTitle eyebrow={[kind, e.data.source === 'calendar' ? 'calendar' : null].filter(Boolean).join(' · ') || 'Event'} title={e.title} />
      <Card>
        <Text style={{ fontSize: 22, lineHeight: 28, fontWeight: '700', color: past ? t.c.fg.secondary : t.c.fg.primary }}>{time}</Text>
        <Text style={{ fontSize: 15, lineHeight: 20, color: t.c.fg.secondary }}>{`${day} · ${ctx.format.date(e.data.startAt, 'relative')}`}</Text>
      </Card>
      {e.data.location ? (
        <View style={{ gap: 8 }}>
          <Label>Where</Label>
          <Text style={{ fontSize: 15, lineHeight: 20, color: t.c.fg.primary }}>{e.data.location}</Text>
          <LinkChips ctx={ctx} id={id} words={['at']} objects={['place']} />
        </View>
      ) : null}
      <View style={{ gap: 8 }}>
        <LinkChips ctx={ctx} id={id} words={['with', 'person']} objects={['person']} />
      </View>
      <Card>
        {d.project ? <DetailRow label="Project" value={d.project.title} onPress={() => router.push(`/entity/project/${d.project!.id}` as never)} /> : <DetailRow label="Project" value="None" valueColor={t.c.fg.tertiary} onPress={controls?.edit} />}
        {e.data.airline || e.data.flightNo ? <DetailRow label="Flight" value={[e.data.airline, e.data.flightNo].filter(Boolean).join(' ')} /> : null}
        {e.data.cost ? <DetailRow label="Cost" value={ctx.format.currency(e.data.cost)} /> : null}
        {e.data.calendars?.length ? <DetailRow label="Calendar" value={e.data.calendars.join(', ')} divider={false} /> : null}
      </Card>
      {e.data.notes ? <Text style={{ fontSize: 15, lineHeight: 22, color: t.c.fg.secondary }}>{e.data.notes}</Text> : null}
    </Page>
  );
}
