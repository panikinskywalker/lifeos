import React, { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { z } from 'zod';
import type { ModuleManifest, WidgetDef, WidgetProps } from '@core/registry/types';
import type { Entity, EntityTypeDef } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { palette } from '@ui/theme/tokens';
import { useTheme } from '@ui/theme/ThemeProvider';
import { useLive } from '@ui/hooks';
import { Button, Card, Chip, Icon, IconButton, Input, Row, Screen, SectionHeader, Stat, Text } from '@ui/components/primitives';
import { ProgressBar, ProgressRing } from '@ui/components/charts';
import { EntityRow } from '@ui/components/EntityRow';

export const PROJECTS_COLOR = palette.blue;

/* ------------------------------------------------------------------ */
/* Entity types                                                        */
/* ------------------------------------------------------------------ */

const PRIORITIES = [{ value: 'low', label: 'Low', color: palette.gray }, { value: 'medium', label: 'Medium', color: palette.blue }, { value: 'high', label: 'High', color: palette.orange }, { value: 'urgent', label: 'Urgent', color: palette.red }];

export interface TaskData {
  notes?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  dueDate?: string;
  projectId?: string;
  goalId?: string;
  estimateMin?: number;
  completedAt?: number;
  personIds?: string[];
}

export const taskType: EntityTypeDef<TaskData> = {
  type: 'task',
  module: 'projects',
  label: 'Task',
  labelPlural: 'Tasks',
  icon: 'checkmark.circle',
  schema: z.object({ notes: z.string().optional(), priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'), dueDate: z.string().optional(), projectId: z.string().optional(), goalId: z.string().optional(), estimateMin: z.coerce.number().optional(), completedAt: z.number().optional(), personIds: z.array(z.string()).optional() }),
  fields: [
    { key: 'dueDate', label: 'Due', type: 'date', summary: true },
    { key: 'priority', label: 'Priority', type: 'select', defaultValue: 'medium', options: PRIORITIES },
    { key: 'projectId', label: 'Project', type: 'relation', relationTo: 'project', relationKind: 'project', summary: true },
    { key: 'goalId', label: 'Goal', type: 'relation', relationTo: 'goal', relationKind: 'goal', section: 'Links' },
    { key: 'personIds', label: 'People', type: 'relation', relationTo: 'person', relationKind: 'person', section: 'Links', defaultValue: [] },
    { key: 'estimateMin', label: 'Estimate (minutes)', type: 'number', section: 'Details' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  indexed: ['dueDate', 'projectId', 'priority'],
  occurredAtField: 'dueDate',
  statuses: [{ value: 'todo', label: 'To do' }, { value: 'doing', label: 'In progress', color: palette.orange }, { value: 'done', label: 'Done', color: palette.green }, { value: 'blocked', label: 'Blocked', color: palette.red }],
  searchText: (d) => d.notes ?? '',
  relations: [{ kind: 'project', label: 'Project', to: 'project', cardinality: 'one' }, { kind: 'goal', label: 'Goal', to: 'goal', cardinality: 'one' }],
  defaultViews: [
    { name: 'Today', icon: 'sun.max', isDefault: false, definition: { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.dueDate', op: 'lte', value: '__TODAY__' }] }, sort: [{ field: 'data.dueDate', dir: 'asc' }] } },
    { name: 'Upcoming', icon: 'calendar', definition: { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.dueDate', op: 'gt', value: '__TODAY__' }] }, sort: [{ field: 'data.dueDate', dir: 'asc' }], groupBy: 'day' } },
    { name: 'Board', icon: 'square.grid.2x2', definition: { layout: 'board', filter: { and: [{ field: 'status', op: 'neq', value: 'done' }] } } },
    { name: 'Done', definition: { filter: { and: [{ field: 'status', op: 'eq', value: 'done' }] }, sort: [{ field: 'updatedAt', dir: 'desc' }] } },
  ],
};

export interface ProjectData {
  description?: string;
  dueDate?: string;
  color?: string;
  area?: string;
}

export const projectType: EntityTypeDef<ProjectData> = {
  type: 'project',
  module: 'projects',
  label: 'Project',
  labelPlural: 'Projects',
  icon: 'folder',
  schema: z.object({ description: z.string().optional(), dueDate: z.string().optional(), color: z.string().optional(), area: z.string().optional() }),
  fields: [
    { key: 'description', label: 'Description', type: 'longtext' },
    { key: 'dueDate', label: 'Target date', type: 'date', summary: true },
    { key: 'area', label: 'Area', type: 'select', summary: true, options: [{ value: 'work', label: 'Work' }, { value: 'personal', label: 'Personal' }, { value: 'home', label: 'Home' }, { value: 'side', label: 'Side project' }, { value: 'learning', label: 'Learning' }] },
  ],
  statuses: [{ value: 'active', label: 'Active' }, { value: 'planning', label: 'Planning', color: palette.gray }, { value: 'on_hold', label: 'On hold', color: palette.orange }, { value: 'done', label: 'Done', color: palette.green }],
  searchText: (d) => d.description ?? '',
  relations: [{ kind: 'project', label: 'Tasks', to: 'task', cardinality: 'many' }, { kind: 'goal', label: 'Goal', to: 'goal', cardinality: 'one' }],
};

export interface GoalData {
  description?: string;
  targetDate?: string;
  targetValue?: number;
  currentValue?: number;
  unit?: string;
  area?: string;
}

export const goalType: EntityTypeDef<GoalData> = {
  type: 'goal',
  module: 'projects',
  label: 'Goal',
  labelPlural: 'Goals',
  icon: 'target',
  color: palette.indigo,
  schema: z.object({ description: z.string().optional(), targetDate: z.string().optional(), targetValue: z.coerce.number().optional(), currentValue: z.coerce.number().optional(), unit: z.string().optional(), area: z.string().optional() }),
  fields: [
    { key: 'description', label: 'Why this matters', type: 'longtext' },
    { key: 'targetDate', label: 'Target date', type: 'date', summary: true },
    { key: 'targetValue', label: 'Target value', type: 'number', section: 'Progress' },
    { key: 'currentValue', label: 'Current value', type: 'number', section: 'Progress' },
    { key: 'unit', label: 'Unit', type: 'text', placeholder: 'kg, ₹, books…', section: 'Progress' },
    { key: 'area', label: 'Area', type: 'select', options: [{ value: 'health', label: 'Health' }, { value: 'money', label: 'Money' }, { value: 'career', label: 'Career' }, { value: 'learning', label: 'Learning' }, { value: 'relationships', label: 'Relationships' }, { value: 'other', label: 'Other' }] },
  ],
  statuses: [{ value: 'active', label: 'Active' }, { value: 'achieved', label: 'Achieved', color: palette.green }, { value: 'dropped', label: 'Dropped', color: palette.gray }],
  occurredAtField: 'targetDate',
};

export interface EventData {
  startAt: number;
  endAt?: number;
  location?: string;
  notes?: string;
  allDay?: boolean;
  personIds?: string[];
  tripId?: string;
}

export const eventType: EntityTypeDef<EventData> = {
  type: 'event',
  module: 'projects',
  label: 'Event',
  labelPlural: 'Events',
  icon: 'calendar',
  color: palette.red,
  schema: z.object({ startAt: z.number(), endAt: z.number().optional(), location: z.string().optional(), notes: z.string().optional(), allDay: z.boolean().optional(), personIds: z.array(z.string()).optional(), tripId: z.string().optional() }),
  fields: [
    { key: 'startAt', label: 'Starts', type: 'datetime', required: true, defaultValue: () => Date.now() + 3600000 },
    { key: 'endAt', label: 'Ends', type: 'datetime' },
    { key: 'allDay', label: 'All day', type: 'boolean' },
    { key: 'location', label: 'Location', type: 'text', summary: true },
    { key: 'personIds', label: 'People', type: 'relation', relationTo: 'person', relationKind: 'person', section: 'Links', defaultValue: [] },
    { key: 'tripId', label: 'Trip', type: 'relation', relationTo: 'trip', relationKind: 'trip', section: 'Links' },
    { key: 'notes', label: 'Notes', type: 'longtext', section: 'Details' },
  ],
  occurredAtField: 'startAt',
  indexed: ['startAt'],
  searchText: (d) => [d.location, d.notes].filter(Boolean).join(' '),
  defaultViews: [{ name: 'Upcoming', definition: { filter: { and: [{ field: 'occurredAt', op: 'gte', value: '__TODAY__' }] }, sort: [{ field: 'occurredAt', dir: 'asc' }], groupBy: 'day' } }],
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const today = () => new Date().toISOString().slice(0, 10);

export function projectProgress(os: LifeOSContext, projectId: string) {
  const total = os.entities.count('task', { filter: { and: [{ field: 'data.projectId', op: 'eq', value: projectId }] } });
  const done = os.entities.count('task', { filter: { and: [{ field: 'data.projectId', op: 'eq', value: projectId }, { field: 'status', op: 'eq', value: 'done' }] } });
  return { total, done, progress: total ? done / total : 0 };
}

export function toggleTask(os: LifeOSContext, task: Entity<TaskData>) {
  const done = task.status === 'done';
  os.entities.update<TaskData>(task.id, { status: done ? 'todo' : 'done', data: { completedAt: done ? undefined : Date.now() } as Partial<TaskData> });
}

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

import { useOS } from '@ui/hooks';

export function TaskList({ tasks, showProject, empty }: { tasks: Entity<TaskData>[]; showProject?: boolean; empty?: string }) {
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
        const project = showProject && task.data.projectId ? os.entities.ref(task.data.projectId) : undefined;
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
    os.entities.create<TaskData>({ type: 'task', title: v, data: { priority: 'medium', projectId } });
    setText('');
  };
  return <Input value={text} onChangeText={setText} placeholder="Add a task…" onSubmitEditing={add} returnKeyType="done" blurOnSubmit={false} right={text ? <IconButton icon="plus.circle.fill" onPress={add} color={accent} /> : undefined} />;
}

/* ------------------------------------------------------------------ */
/* Module home                                                         */
/* ------------------------------------------------------------------ */

function ProjectsHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const data = useLive(
    (os) => ({
      todayTasks: os.entities.query<TaskData>('task', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.dueDate', op: 'lte', value: today() }] }, sort: [{ field: 'data.dueDate', dir: 'asc' }] }, { limit: 20 }),
      inbox: os.entities.query<TaskData>('task', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.dueDate', op: 'isNull' }, { field: 'data.projectId', op: 'isNull' }] } }, { limit: 10 }),
      projects: os.entities.query<ProjectData>('project', { filter: { and: [{ field: 'status', op: 'in', value: ['active', 'planning'] }] } }).map((p) => ({ p, ...projectProgress(os, p.id) })),
      goals: os.entities.query<GoalData>('goal', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }),
      events: os.entities.query<EventData>('event', { filter: { and: [{ field: 'occurredAt', op: 'gte', value: '__TODAY__' }] }, sort: [{ field: 'occurredAt', dir: 'asc' }] }, { limit: 5 }),
      doneToday: os.entities.count('task', { filter: { and: [{ field: 'status', op: 'eq', value: 'done' }, { field: 'updatedAt', op: 'gte', value: '__TODAY__' }] } }),
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

function ProjectSection({ entity }: { entity: Entity<any>; ctx: LifeOSContext }) {
  const router = useRouter();
  const tasks = useLive((os) => os.entities.query<TaskData>('task', { filter: { and: [{ field: 'data.projectId', op: 'eq', value: entity.id }] }, sort: [{ field: 'status', dir: 'desc' }, { field: 'data.dueDate', dir: 'asc' }] }), [entity.id]);
  const prog = useLive((os) => projectProgress(os, entity.id), [entity.id]);
  const spend = useLive((os) => os.entities.aggregate('transaction', { filter: { and: [{ field: 'data.projectId', op: 'eq', value: entity.id }, { field: 'data.kind', op: 'eq', value: 'expense' }] } }, { sum: ['data.amount'] })['sum_data.amount'], [entity.id]);
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

function GoalSection({ entity }: { entity: Entity<any>; ctx: LifeOSContext }) {
  const os = useOS();
  const g = entity as Entity<GoalData>;
  const prog = g.data.targetValue ? (g.data.currentValue ?? 0) / g.data.targetValue : null;
  const tasks = useLive((o) => o.entities.query<TaskData>('task', { filter: { and: [{ field: 'data.goalId', op: 'eq', value: entity.id }] } }), [entity.id]);
  const [val, setVal] = useState('');
  return (
    <View style={{ gap: 16 }}>
      {prog != null ? (
        <Card style={{ gap: 10 }}>
          <Stat value={`${g.data.currentValue ?? 0}`} unit={`/ ${g.data.targetValue} ${g.data.unit ?? ''}`} label="Progress" />
          <ProgressBar progress={prog} color={palette.indigo} height={12} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Input value={val} onChangeText={setVal} placeholder="Update current value" keyboardType="decimal-pad" style={{ flex: 1 }} />
            <Button title="Log" small color={palette.indigo} onPress={() => { const n = parseFloat(val); if (!Number.isNaN(n)) { os.entities.update<GoalData>(entity.id, { data: { currentValue: n } }); setVal(''); } }} />
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

function TodayWidget({ size }: WidgetProps) {
  const router = useRouter();
  const tasks = useLive((os) => os.entities.query<TaskData>('task', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.dueDate', op: 'lte', value: today() }] }, sort: [{ field: 'data.dueDate', dir: 'asc' }] }, { limit: size === 'small' ? 3 : size === 'medium' ? 5 : 10 }), [size]);
  const overdue = tasks.filter((x) => x.data.dueDate && x.data.dueDate < today()).length;
  return (
    <View>
      <Card padded={false}>
        <View style={{ padding: 16, paddingBottom: 6 }}>
          <SectionHeader title="Today" icon="checkmark.circle" color={PROJECTS_COLOR} action="All tasks" onAction={() => router.push('/entity/task')} />
          <Stat value={`${tasks.length}`} unit={tasks.length === 1 ? 'task' : 'tasks'} small />
          {overdue ? (
            <Text variant="caption" color={palette.red}>
              {overdue} overdue
            </Text>
          ) : null}
        </View>
        {size !== 'small' ? <View style={{ paddingHorizontal: 0 }}><TaskListInline tasks={tasks} /></View> : null}
      </Card>
    </View>
  );
}
function TaskListInline({ tasks }: { tasks: Entity<TaskData>[] }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  if (!tasks.length) return <Text color="tertiary" style={{ padding: 16, paddingTop: 4 }}>All clear.</Text>;
  return (
    <View>
      {tasks.map((task, i) => (
        <View key={task.id} style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 12 }}>
          <Pressable onPress={() => toggleTask(os, task)} hitSlop={10} style={{ padding: 6 }}>
            <Icon name="circle" size={22} color={t.colors.textTertiary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Row title={task.title} subtitle={task.data.dueDate ? os.format.date(task.data.dueDate, 'relative') : null} last={i === tasks.length - 1} chevron={false} onPress={() => router.push(`/entity/task/${task.id}`)} style={{ marginLeft: -12 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

function ProjectsWidget({ size }: WidgetProps) {
  const router = useRouter();
  const projects = useLive((os) => os.entities.query<ProjectData>('project', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }, { limit: size === 'small' ? 2 : 5 }).map((p) => ({ p, ...projectProgress(os, p.id) })), [size]);
  return (
    <Card onPress={() => router.push('/module/projects')}>
      <SectionHeader title="Projects" icon="folder" color={PROJECTS_COLOR} action="Open" />
      {projects.length === 0 ? (
        <Text color="tertiary">No active projects.</Text>
      ) : (
        <View style={{ gap: 10 }}>
          {projects.map(({ p, done, total, progress }) => (
            <View key={p.id} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="subhead" numberOfLines={1} style={{ flex: 1 }}>
                  {p.title}
                </Text>
                <Text variant="caption" color="secondary">
                  {done}/{total}
                </Text>
              </View>
              <ProgressBar progress={progress} color={PROJECTS_COLOR} height={6} />
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function GoalsWidget() {
  const router = useRouter();
  const goals = useLive((os) => os.entities.query<GoalData>('goal', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }, { limit: 4 }), []);
  return (
    <Card onPress={() => router.push('/entity/goal')}>
      <SectionHeader title="Goals" icon="target" color={palette.indigo} action="All" />
      {goals.length === 0 ? (
        <Text color="tertiary">Set a goal to track it here.</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {goals.map((g) => {
            const prog = g.data.targetValue ? (g.data.currentValue ?? 0) / g.data.targetValue : 0;
            return (
              <View key={g.id} style={{ alignItems: 'center', width: 72, gap: 4 }}>
                <ProgressRing progress={prog} size={56} stroke={7} color={palette.indigo}>
                  <Text variant="caption2">{Math.round(prog * 100)}%</Text>
                </ProgressRing>
                <Text variant="caption" numberOfLines={2} style={{ textAlign: 'center' }}>
                  {g.title}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const widgets: WidgetDef[] = [
  { type: 'projects.today', module: 'projects', name: 'Today\'s tasks', icon: 'checkmark.circle', sizes: ['small', 'medium', 'large'], defaultSize: 'medium', component: TodayWidget },
  { type: 'projects.projects', module: 'projects', name: 'Active projects', icon: 'folder', sizes: ['small', 'medium'], defaultSize: 'medium', component: ProjectsWidget },
  { type: 'projects.goals', module: 'projects', name: 'Goals', icon: 'target', sizes: ['medium', 'large'], defaultSize: 'medium', component: GoalsWidget },
];

/* ------------------------------------------------------------------ */
/* Manifest                                                            */
/* ------------------------------------------------------------------ */

export const projectsModule: ModuleManifest = {
  id: 'projects',
  name: 'Projects & Tasks',
  version: '1.0.0',
  description: 'Projects, tasks, goals and events. Everything else links to them.',
  icon: 'checkmark.circle',
  color: PROJECTS_COLOR,
  dependencies: ['crm', 'travel'],
  entityTypes: [projectType, taskType, goalType, eventType],
  screens: [{ key: 'index', title: 'Projects', component: ProjectsHome }],
  widgets,
  defaultWidgets: [{ type: 'projects.today', size: 'medium' }],
  quickActions: [
    { id: 'projects.addTask', label: 'Task', icon: 'checkmark.circle', route: '/entity/task/new', global: true },
    { id: 'projects.addEvent', label: 'Event', icon: 'calendar', route: '/entity/event/new', global: true },
    { id: 'projects.addProject', label: 'Project', icon: 'folder', route: '/entity/project/new' },
    { id: 'projects.addGoal', label: 'Goal', icon: 'target', route: '/entity/goal/new' },
  ],
  detailSections: [
    { entityType: 'project', key: 'projects.project', title: 'Tasks', component: ProjectSection, order: 10 },
    { entityType: 'goal', key: 'projects.goal', title: 'Progress', component: GoalSection, order: 10 },
  ],
  triggers: [
    {
      id: 'projects.task.completed', module: 'projects', label: 'Task completed', event: 'entity.status',
      toContext: (p) => {
        const e = p as { entity: Entity; to: string | null };
        if (e.entity.type !== 'task' || e.to !== 'done') return null;
        return { entity: e.entity, vars: { projectId: e.entity.data.projectId } };
      },
    },
  ],
  actions: [
    {
      id: 'projects.createTask', module: 'projects', label: 'Create task',
      configFields: [{ key: 'title', label: 'Title', type: 'text', required: true }, { key: 'inDays', label: 'Due in (days)', type: 'number' }, { key: 'priority', label: 'Priority', type: 'select', options: PRIORITIES }],
      run: async (cfg, ctx, os) => {
        const due = cfg.inDays != null && cfg.inDays !== '' ? new Date(Date.now() + Number(cfg.inDays) * 86400000).toISOString().slice(0, 10) : undefined;
        const task = os.entities.create<TaskData>({ type: 'task', title: String(cfg.title), data: { priority: (cfg.priority as TaskData['priority']) || 'medium', dueDate: due, projectId: ctx.entity?.type === 'project' ? ctx.entity.id : undefined } }, 'automation');
        if (ctx.entity && ctx.entity.type !== 'project') os.relations.link(task.id, ctx.entity.id, 'related', {}, 'automation');
        return task.title;
      },
    },
  ],
  aiTools: [
    {
      name: 'tasks_overview',
      description: 'Open tasks due today/overdue, upcoming tasks, active projects with progress, and active goals.',
      input: z.object({}),
      run: async (_i, os) => ({
        dueOrOverdue: os.entities.query<TaskData>('task', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.dueDate', op: 'lte', value: today() }] } }).map((x) => ({ id: x.id, title: x.title, due: x.data.dueDate, priority: x.data.priority, status: x.status })),
        upcoming: os.entities.query<TaskData>('task', { filter: { and: [{ field: 'status', op: 'neq', value: 'done' }, { field: 'data.dueDate', op: 'gt', value: today() }] }, sort: [{ field: 'data.dueDate', dir: 'asc' }] }, { limit: 15 }).map((x) => ({ id: x.id, title: x.title, due: x.data.dueDate })),
        projects: os.entities.query<ProjectData>('project', { filter: { and: [{ field: 'status', op: 'in', value: ['active', 'planning'] }] } }).map((p) => ({ id: p.id, title: p.title, status: p.status, ...projectProgress(os, p.id) })),
        goals: os.entities.query<GoalData>('goal', { filter: { and: [{ field: 'status', op: 'eq', value: 'active' }] } }).map((g) => ({ id: g.id, title: g.title, target: g.data.targetValue, current: g.data.currentValue, unit: g.data.unit, by: g.data.targetDate })),
      }),
    },
  ],
};
