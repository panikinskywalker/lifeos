import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, EmptyState, IconButton, RowItem, RowList, Screen, Section, Text, Toggle } from '@ui/kit';
import { RunRow, TINT, route, runsWithoutRecord, triggerWords, useRunNow } from './parts';

const OPS: Record<string, string> = { eq: 'is', neq: 'is not', gt: 'more than', gte: 'at least', lt: 'less than', lte: 'at most', contains: 'contains', isNull: 'is empty', notNull: 'is not empty', in: 'is one of', notIn: 'is none of' };

/** One setting in words: "tag: review" (long text cut). */
const said = (cfg: Record<string, unknown>) =>
  Object.entries(cfg)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${k}: ${String(typeof v === 'object' ? JSON.stringify(v) : v).replace(/\s+/g, ' ').slice(0, 60)}`)
    .join(' · ');

/**
 * A rule (?rule=<id>): when, if, its steps in order with their keys, on / off,
 * Run now (for a rule that needs no record), Edit, and its runs.
 */
export function RulePage({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const runNow = useRunNow(ctx);
  const id = params.rule ?? '';
  const d = useLive((os) => ({ rule: os.automation.rules.get(id), runs: os.automation.rules.runs(id, 30) }), [id]);
  const back = () => (router.canGoBack() ? router.back() : router.replace(route('index')));
  const rule = d.rule;
  if (!rule) {
    return (
      <Screen title="Automation" onBack={back}>
        <EmptyState icon="bolt" tint={TINT} line="This automation was deleted." />
      </Screen>
    );
  }
  const right = <IconButton icon="edit" filled accessibilityLabel="Edit" onPress={() => router.push(route('edit', { rule: rule.id }))} />;
  return (
    <Screen title={rule.name} subtitle={triggerWords(ctx, rule)} onBack={back} right={right} contentStyle={{ gap: 14 }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text style={{ flex: 1, fontSize: 15, color: t.c.fg.primary }}>{rule.enabled ? 'On' : 'Off'}{rule.runCount ? ` · ran ${rule.runCount}×` : ''}</Text>
          <Toggle value={rule.enabled} onChange={(v) => ctx.automation.rules.setEnabled(rule.id, v)} accessibilityLabel="On" />
        </View>
        {runsWithoutRecord(rule) ? <Button title="Run now" icon="bolt" block onPress={() => void runNow(rule)} style={{ marginTop: 12 }} /> : null}
      </Card>

      {rule.conditions.length ? (
        <Section title="Only if">
          <RowList>
            {rule.conditions.map((c, i) => <RowItem key={i} icon="filter" tint={TINT} title={`${c.field} ${OPS[c.op] ?? c.op}${c.value == null || c.value === '' ? '' : ` ${String(c.value)}`}`} />)}
          </RowList>
        </Section>
      ) : null}

      <Section title="Steps" meta={`${rule.steps.length}`}>
        <RowList>
          {rule.steps.map((s, i) => {
            const def = ctx.registry.actions.get(s.action);
            return <RowItem key={s.key} icon={s.action === 'core.askModel' ? 'brain' : 'bolt'} tint={TINT} title={`${i + 1}. ${def?.label ?? s.action}`} subtitle={said(s.config) || null} meta={s.key} />;
          })}
        </RowList>
      </Section>

      <Section title="Runs">
        {d.runs.length ? <RowList>{d.runs.map((run) => <RunRow key={run.id} ctx={ctx} run={run} />)}</RowList> : <Text style={{ fontSize: 13, color: t.c.fg.secondary, paddingHorizontal: 4 }}>It hasn’t run yet.</Text>}
      </Section>
      <View style={{ height: 8 }} />
    </Screen>
  );
}
