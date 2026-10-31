/** Goal's section, as it was: Goal is left untouched until it is decided (docs/MODEL.md layer 2, Agenda). */
import { useState } from 'react';
import { View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { palette } from '@ui/theme/tokens';
import { useTheme } from '@ui/theme/ThemeProvider';
import { useLive, useOS } from '@ui/hooks';
import { Button, Card, Icon, Input, Row, SectionHeader, Stat, Text } from '@ui/components/primitives';
import { ProgressBar } from '@ui/components/charts';
import { PRIORITIES, toggleTask, type TaskData, type GoalData } from '@modules/projects';

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
