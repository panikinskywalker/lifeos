import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ModuleManifest, WidgetDef, WidgetProps } from '@core/registry/types';
import { palette } from '@ui/theme/tokens';
import { useTheme } from '@ui/theme/ThemeProvider';
import { useLive, useOS } from '@ui/hooks';
import { Card, Chip, Icon, IconButton, Row, SectionHeader, Stat, Text } from '@ui/components/primitives';
import { EntityRow } from '@ui/components/EntityRow';
import { describeRRule } from '@core/automation/recurrence';

export { DashboardScreen } from './DashboardScreen';

function ActivityWidget({ size }: WidgetProps) {
  const os = useOS();
  const router = useRouter();
  const t = useTheme();
  const events = useLive((o) => o.entities.timeline.recent(size === 'small' ? 3 : size === 'medium' ? 6 : 12), [size]);
  return (
    <Card padded={false}>
      <View style={{ padding: 16, paddingBottom: 6 }}>
        <SectionHeader title="Activity" icon="clock" color={palette.gray} />
      </View>
      {events.length === 0 ? (
        <Text color="tertiary" style={{ padding: 16, paddingTop: 0 }}>
          Your timeline will appear here.
        </Text>
      ) : (
        events.map((e, i) => (
          <Row key={e.id} title={e.entityTitle} subtitle={`${e.title} · ${os.format.dateTime(e.occurredAt)}`} icon={os.registry.entityTypes.get(e.entityType)?.icon} iconColor={e.actor === 'automation' ? t.colors.accents.purple : os.registry.colorFor(e.entityType)} last={i === events.length - 1} onPress={() => router.push(`/entity/${e.entityType}/${e.entityId}`)} />
        ))
      )}
    </Card>
  );
}

function RemindersWidget({ size }: WidgetProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const reminders = useLive((o) => o.reminders.upcoming(size === 'small' ? 3 : 6), [size]);
  const overdue = reminders.filter((r) => (r.snoozedUntil ?? r.nextAt ?? r.dueAt) < Date.now()).length;
  return (
    <Card padded={false}>
      <View style={{ padding: 16, paddingBottom: 6 }}>
        <SectionHeader title="Reminders" icon="bell" color={palette.red} action="All" onAction={() => router.push('/reminders')} />
        {overdue ? (
          <Text variant="caption" color={t.colors.danger}>
            {overdue} overdue
          </Text>
        ) : null}
      </View>
      {reminders.length === 0 ? (
        <Text color="tertiary" style={{ padding: 16, paddingTop: 0 }}>
          Nothing scheduled.
        </Text>
      ) : (
        reminders.map((r, i) => {
          const at = r.snoozedUntil ?? r.nextAt ?? r.dueAt;
          return (
            <Row
              key={r.id}
              title={r.title}
              subtitle={`${os.format.dateTime(at)}${r.rrule ? ` · ${describeRRule(r.rrule)}` : ''}`}
              icon="bell"
              iconColor={at < Date.now() ? t.colors.danger : palette.red}
              last={i === reminders.length - 1}
              chevron={false}
              right={<IconButton icon="checkmark.circle" color={t.colors.success} onPress={() => os.reminders.complete(r.id)} />}
              onPress={r.entityId ? () => { const e = os.entities.get(r.entityId!); if (e) router.push(`/entity/${e.type}/${e.id}`); } : undefined}
            />
          );
        })
      )}
    </Card>
  );
}

function QuickAddWidget() {
  const os = useOS();
  const router = useRouter();
  const actions = os.registry.quickActions.filter((a) => a.global);
  return (
    <Card>
      <SectionHeader title="Quick add" icon="plus.circle.fill" color={palette.blue} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {actions.map((a) => (
          <Chip key={a.id} label={a.label} icon={a.icon} onPress={() => (a.route ? router.push(a.route as never) : a.run?.(os))} />
        ))}
      </View>
    </Card>
  );
}

function StarredWidget({ size }: WidgetProps) {
  const items = useLive((o) => o.entities.query(null, { filter: { and: [{ field: 'starred', op: 'eq', value: true }] }, sort: [{ field: 'updatedAt', dir: 'desc' }] }, { limit: size === 'small' ? 3 : 6 }), [size]);
  return (
    <Card padded={false}>
      <View style={{ padding: 16, paddingBottom: 4 }}>
        <SectionHeader title="Starred" icon="star.fill" color={palette.yellow} />
      </View>
      {items.length === 0 ? <Text color="tertiary" style={{ padding: 16, paddingTop: 0 }}>Star any record to pin it here.</Text> : items.map((e, i) => <EntityRow key={e.id} entity={e} showType last={i === items.length - 1} />)}
    </Card>
  );
}

function CountsWidget() {
  const os = useOS();
  const router = useRouter();
  const counts = useLive((o) => o.entities.countsByType(), []);
  const types = [...os.registry.entityTypes.values()].filter((t) => !t.hidden && counts[t.type]);
  return (
    <Card>
      <SectionHeader title="Your data" icon="cube" color={palette.gray} />
      {types.length === 0 ? (
        <Text color="tertiary">Nothing yet — add a record from any module.</Text>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {types.map((t) => (
            <View key={t.type} style={{ minWidth: 80 }}>
              <Stat value={String(counts[t.type])} label={t.labelPlural} small color={os.registry.colorFor(t.type)} />
            </View>
          ))}
        </View>
      )}
      <View style={{ height: 0 }}>
        <Icon name="circle" size={0} />
      </View>
      <Text variant="caption" color="tertiary" onPress={() => router.push('/almanac')} style={{ marginTop: 8 }}>
        Browse all modules →
      </Text>
    </Card>
  );
}

const widgets: WidgetDef[] = [
  { type: 'core.reminders', module: 'dashboard', name: 'Reminders', icon: 'bell', sizes: ['small', 'medium', 'large'], defaultSize: 'medium', component: RemindersWidget },
  { type: 'core.activity', module: 'dashboard', name: 'Recent activity', icon: 'clock', sizes: ['small', 'medium', 'large'], defaultSize: 'medium', component: ActivityWidget },
  { type: 'core.quickadd', module: 'dashboard', name: 'Quick add', icon: 'plus.circle.fill', sizes: ['medium'], defaultSize: 'medium', component: QuickAddWidget },
  { type: 'core.starred', module: 'dashboard', name: 'Starred', icon: 'star.fill', sizes: ['small', 'medium'], defaultSize: 'medium', component: StarredWidget },
  { type: 'core.counts', module: 'dashboard', name: 'Your data', icon: 'cube', sizes: ['medium'], defaultSize: 'medium', component: CountsWidget },
];

export const dashboardModule: ModuleManifest = {
  id: 'dashboard',
  name: 'Dashboard',
  version: '1.0.0',
  description: 'Configurable home screens built from widgets that every module contributes.',
  icon: 'square.grid.2x2',
  color: palette.gray,
  widgets,
  defaultWidgets: [{ type: 'core.quickadd' }, { type: 'core.reminders', size: 'medium' }, { type: 'core.activity', size: 'medium' }],
};
