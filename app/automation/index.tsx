import React from 'react';
import { View, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Card, GroupLabel, IconButton, Row, Screen, Text } from '@ui/components/primitives';
import { palette } from '@ui/theme/tokens';

export default function AutomationListRoute() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const rules = useLive((o) => o.automation.rules.all(), []);
  const runs = useLive((o) => o.automation.rules.runs(undefined, 15), []);
  const jobs = useLive((o) => o.scheduler.all().filter((j) => j.enabled), []);
  return (
    <Screen title="Automation" padded={false} right={<View style={{ flexDirection: 'row', gap: 6 }}><IconButton icon="plus" bg color={palette.purple} onPress={() => router.push('/automation/new')} /><IconButton icon="xmark" bg onPress={() => router.back()} /></View>}>
      <GroupLabel>Rules</GroupLabel>
      <Card padded={false} style={{ marginHorizontal: 16 }}>
        {rules.length === 0 ? (
          <Text color="tertiary" style={{ padding: 16 }}>No rules yet. Example: when a transaction over ₹5,000 is added, tag it "review" and remind me tomorrow.</Text>
        ) : (
          rules.map((r, i) => {
            const trig = os.registry.triggers.get(r.trigger.id);
            return (
              <Row key={r.id} title={r.name} subtitle={`${trig?.label ?? r.trigger.id} → ${r.actions.map((a) => os.registry.actions.get(a.id)?.label ?? a.id).join(', ')} · ran ${r.runCount}×`} icon="bolt" iconColor={r.enabled ? palette.purple : t.colors.gray} last={i === rules.length - 1} onPress={() => router.push(`/automation/${r.id}`)} right={<Switch value={r.enabled} onValueChange={(v) => os.automation.rules.setEnabled(r.id, v)} />} chevron={false} />
            );
          })
        )}
      </Card>
      <GroupLabel>Scheduled jobs</GroupLabel>
      <Card padded={false} style={{ marginHorizontal: 16 }}>
        {jobs.map((j, i) => (
          <Row key={j.id} title={j.kind} subtitle={`Next ${os.format.dateTime(j.nextAt)}${j.rrule ? ` · ${j.rrule}` : ''}`} icon="clock" iconColor={t.colors.gray} last={i === jobs.length - 1} chevron={false} />
        ))}
      </Card>
      <GroupLabel>Recent runs</GroupLabel>
      <Card padded={false} style={{ marginHorizontal: 16 }}>
        {runs.length === 0 ? <Text color="tertiary" style={{ padding: 16 }}>Nothing has run yet.</Text> : runs.map((run, i) => {
          const rule = rules.find((r) => r.id === run.ruleId);
          return <Row key={run.id} title={rule?.name ?? run.ruleId} subtitle={`${run.status} · ${os.format.dateTime(run.startedAt)} · ${run.log.map((l) => l.msg).join('; ').slice(0, 80)}`} icon={run.status === 'ok' ? 'checkmark.circle' : run.status === 'error' ? 'exclamationmark.triangle' : 'minus'} iconColor={run.status === 'ok' ? t.colors.success : run.status === 'error' ? t.colors.danger : t.colors.gray} last={i === runs.length - 1} chevron={false} />;
        })}
      </Card>
    </Screen>
  );
}
