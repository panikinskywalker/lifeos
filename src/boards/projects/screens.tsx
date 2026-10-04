import { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { palette } from '@ui/theme/tokens';
import { useTheme } from '@ui/theme/ThemeProvider';
import { useLive, useOS } from '@ui/hooks';
import { Button, Card, Chip, Icon, IconButton, Input, Row, Screen, SectionHeader, Stat, Text } from '@ui/components/primitives';
import { ProgressBar, ProgressRing } from '@ui/components/charts';
import { PRIORITIES, projectProgress, toggleTask, type TaskData, type ProjectData, type GoalData, type EventData } from '@modules/projects';

const PROJECTS_COLOR = palette.blue;
const today = () => new Date().toISOString().slice(0, 10);

export function TaskList({ tasks, showProject, empty }: { tasks: ObjectRecord<TaskData>[]; showProject?: boolean; empty?: string }) {
  const t = useTheme();
  const router = useRouter();
  const os = useOS();
  if (!tasks.length)
    return (
      <Card>
        <Text color="tertiary">{empty ?? 'Nothing here.'}</Text>
      </Card>
    );
  return (
    <Card padded={false}>
      {tasks.map((task, i) => {
        const done = task.status === 'done';
        const pr = PRIORITIES.find((p) => p.value === task.data.priority);
        const overdue = !done && task.data.dueDate && task.data.dueDate < today();
        const project = showProject && task.data.projectId ? os.records.ref(task.data.projectId) : undefined;
        const sub = [project?.title, task.data.dueDate ? os.format.date(task.data.dueDate, 'relative') : null].filter(Boolean).join(' · ');
        return (
          <View key={task.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 12, opacity: done ? 0.55 : 1 }}>
              <Pressable onPress={() => toggleTask(os, task)} hitSlop={10} style={{ padding: 6 }}>
                <Icon name={done ? 'checkmark.circle' : 'circle'} size={24} color={done ? t.colors.success : pr?.color ?? t.colors.textTertiary} />
              </Pressable>
              <View style={{ flex: 1 }}>
                <Row title={task.title} subtitle={sub || null} last={i === tasks.length - 1} chevron={false} onPress={() => router.push(`/entity/task/${task.id}`)} style={{ marginLeft: -12 }} right={overdue ? <Icon name="exclamationmark.triangle" size={14} color={t.colors.danger} /> : null} />
              </View>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function QuickAdd({ projectId, accent }: { projectId?: string; accent: string }) {
  const os = useOS();
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (!v) return;
    os.records.create<TaskData>({ type: 'task', title: v, data: { priority: 'medium', projectId } });
    setText('');
  };
  return <Input value={text} onChangeText={setText} placeholder="Add a task…" onSubmitEditing={add} returnKeyType="done" blurOnSubmit={false} right={text ? <IconButton icon="plus.circle.fill" onPress={add} color={accent} /> : undefined} />;
}

/* ------------------------------------------------------------------ */
/* Module home                                                         */
/* ------------------------------------------------------------------ */

export function ProjectsHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const data = useLive(
    (os) => ({
      todayTasks: os.records.query<TaskData>('task', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.dueDate', op: 'lte', value: today() }] }, sort: [{ field: 'data.dueDate', dir: 'asc' }] }, { limit: 20 }),
      inbox: os.records.query<TaskData>('task', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.dueDate', op: 'isNull' }, { field: 'data.projectId', op: 'isNull' }] } }, { limit: 10 }),
      projects: os.records.query<ProjectData>('project', { filter: { and: [{ field: 'status', op: 'in', value: ['active', 'planning'] }] } }).map((p) => ({ p, ...projectProgress(os, p.id) })),
      goals: os.records.query<GoalData>('goal', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }),
      events: os.records.query<EventData>('event', { filter: { and: [{ field: 'occurredAt', op: 'gte', value: '__TODAY__' }] }, sort: [{ field: 'occurredAt', dir: 'asc' }] }, { limit: 5 }),
      doneToday: os.records.count('task', { filter: { and: [{ field: 'status', op: 'eq', value: 'done' }, { field: 'updatedAt', op: 'gte', value: '__TODAY__' }] } }),
    }),
    [],
  );
  return (
    <Screen title="Projects" right={<IconButton icon="plus" bg color={PROJECTS_COLOR} onPress={() => router.push('/entity/project/new')} />}>
      <View style={{ gap: 16 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          <Chip label="Tasks" icon="checkmark.circle" color={PROJECTS_COLOR} onPress={() => router.push('/entity/task')} />
          <Chip label="Projects" icon="folder" color={PROJECTS_COLOR} onPress={() => router.push('/entity/project')} />
          <Chip label="Goals" icon="target" color={palette.indigo} onPress={() => router.push('/entity/goal')} />
          <Chip label="Events" icon="calendar" color={palette.red} onPress={() => router.push('/entity/event')} />
        </ScrollView>

        <View>
          <SectionHeader title="Today" icon="sun.max" color={PROJECTS_COLOR} action={`${data.doneToday} done`} />
          <View style={{ gap: 8 }}>
            <TaskList tasks={data.todayTasks} showProject empty="Nothing due today. Add one below." />
            <QuickAdd accent={PROJECTS_COLOR} />
          </View>
        </View>

        {data.events.length ? (
          <View>
            <SectionHeader title="Upcoming events" icon="calendar" color={palette.red} action="All" onAction={() => router.push('/entity/event')} />
            <Card padded={false}>
              {data.events.map((e, i) => (
                <Row key={e.id} title={e.title} subtitle={`${ctx.format.dateTime(e.data.startAt)}${e.data.location ? ` · ${e.data.location}` : ''}`} icon="calendar" iconColor={palette.red} last={i === data.events.length - 1} onPress={() => router.push(`/entity/event/${e.id}`)} />
              ))}
            </Card>
          </View>
        ) : null}

        <View>
          <SectionHeader title="Projects" icon="folder" color={PROJECTS_COLOR} action="All" onAction={() => router.push('/entity/project')} />
          {data.projects.length === 0 ? (
            <Card>
              <Text color="tertiary">No active projects. Create one to group tasks and link transactions, notes and people to it.</Text>
            </Card>
          ) : (
            <View style={{ gap: 8 }}>
              {data.projects.map(({ p, total, done, progress }) => (
                <Card key={p.id} onPress={() => router.push(`/entity/project/${p.id}`)} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <ProgressRing progress={progress} size={40} stroke={5} color={PROJECTS_COLOR}>
                      <Text variant="caption2">{Math.round(progress * 100)}%</Text>
                    </ProgressRing>
                    <View style={{ flex: 1 }}>
                      <Text variant="headline" numberOfLines={1}>
                        {p.title}
                      </Text>
                      <Text variant="footnote" color="secondary">
                        {done}/{total} tasks{p.data.dueDate ? ` · due ${ctx.format.date(p.data.dueDate, 'short')}` : ''}
                      </Text>
                    </View>
                    <Icon name="chevron.right" size={16} color={t.colors.textTertiary} />
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>

        {data.inbox.length ? (
          <View>
            <SectionHeader title="Inbox" icon="tray" color={PROJECTS_COLOR} />
            <TaskList tasks={data.inbox} />
          </View>
        ) : null}

        {data.goals.length ? (
          <View>
            <SectionHeader title="Goals" icon="target" color={palette.indigo} action="All" onAction={() => router.push('/entity/goal')} />
            <Card padded={false}>
              {data.goals.map((g, i) => {
                const prog = g.data.targetValue ? (g.data.currentValue ?? 0) / g.data.targetValue : null;
                return (
                  <Row key={g.id} title={g.title} subtitle={g.data.targetDate ? `by ${ctx.format.date(g.data.targetDate, 'short')}` : undefined} icon="target" iconColor={palette.indigo} last={i === data.goals.length - 1} onPress={() => router.push(`/entity/goal/${g.id}`)} value={prog != null ? `${Math.round(prog * 100)}%` : undefined}>
                    {prog != null ? <View style={{ marginTop: 6 }}><ProgressBar progress={prog} color={palette.indigo} height={5} /></View> : null}
                  </Row>
                );
              })}
            </Card>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Detail sections                                                     */
/* ------------------------------------------------------------------ */

export function ProjectSection({ entity }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) {
  const router = useRouter();
  const tasks = useLive((os) => os.records.query<TaskData>('task', { filter: { and: [{ field: 'data.projectId', op: 'eq', value: entity.id }] }, sort: [{ field: 'status', dir: 'desc' }, { field: 'data.dueDate', dir: 'asc' }] }), [entity.id]);
  const prog = useLive((os) => projectProgress(os, entity.id), [entity.id]);
  const spend = useLive((os) => os.records.aggregate('transaction', { filter: { and: [{ field: 'data.projectId', op: 'eq', value: entity.id }, { field: 'data.kind', op: 'eq', value: 'expense' }] } }, { sum: ['data.amount'] })['sum_data.amount'], [entity.id]);
  const os = useOS();
  const open = tasks.filter((x) => x.status !== 'done');
  const done = tasks.filter((x) => x.status === 'done');
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <ProgressRing progress={prog.progress} size={64} stroke={8} color={PROJECTS_COLOR}>
          <Text variant="caption" style={{ fontWeight: '700' }}>
            {Math.round(prog.progress * 100)}%
          </Text>
        </ProgressRing>
        <View style={{ flex: 1 }}>
          <Stat value={`${prog.done}`} unit={`of ${prog.total} tasks`} small />
          {spend > 0 ? (
            <Text variant="footnote" color="secondary">
              {os.format.currency(spend)} spent on this project
            </Text>
          ) : null}
        </View>
      </Card>
      <View>
        <SectionHeader title="Tasks" icon="checkmark.circle" color={PROJECTS_COLOR} action="Board" onAction={() => router.push({ pathname: '/entity/[type]', params: { type: 'task', projectId: entity.id } })} />
        <View style={{ gap: 8 }}>
          <TaskList tasks={open} empty="No open tasks." />
          <QuickAdd projectId={entity.id} accent={PROJECTS_COLOR} />
          {done.length ? <TaskList tasks={done} /> : null}
        </View>
      </View>
    </View>
  );
}

export function GoalSection({ entity }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) {
  const os = useOS();
  const g = entity as ObjectRecord<GoalData>;
  const prog = g.data.targetValue ? (g.data.currentValue ?? 0) / g.data.targetValue : null;
  const tasks = useLive((o) => o.records.query<TaskData>('task', { filter: { and: [{ field: 'data.goalId', op: 'eq', value: entity.id }] } }), [entity.id]);
  const [val, setVal] = useState('');
  return (
    <View style={{ gap: 16 }}>
      {prog != null ? (
        <Card style={{ gap: 10 }}>
          <Stat value={`${g.data.currentValue ?? 0}`} unit={`/ ${g.data.targetValue} ${g.data.unit ?? ''}`} label="Progress" />
          <ProgressBar progress={prog} color={palette.indigo} height={12} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Input value={val} onChangeText={setVal} placeholder="Update current value" keyboardType="decimal-pad" style={{ flex: 1 }} />
            <Button title="Log" small color={palette.indigo} onPress={() => { const n = parseFloat(val); if (!Number.isNaN(n)) { os.records.update<GoalData>(entity.id, { data: { currentValue: n } }); setVal(''); } }} />
          </View>
        </Card>
      ) : null}
      {tasks.length ? (
        <View>
          <SectionHeader title="Tasks toward this goal" icon="checkmark.circle" color={PROJECTS_COLOR} />
          <TaskList tasks={tasks} showProject />
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Widgets                                                             */
/* ------------------------------------------------------------------ */





/* ------------------------------------------------------------------ */
/* Manifest                                                            */
/* ------------------------------------------------------------------ */

