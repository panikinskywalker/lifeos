import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, Chip, DetailRow, EmptyState, RowItem, RowList, Screen, Section, Text, useToast } from '@ui/kit';
import { STATUS, STEP_STATUS, TINT, route } from './parts';

const plain = (v: unknown) => (v == null || v === '' ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/**
 * One run (?run=<id>): what started it, then each step with what went in,
 * what came out, its line and status; Undo (last step first, where the
 * action can be undone; the rest listed) and Run again for a failed run.
 */
export function RunPage({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const id = params.run ?? '';
  const run = useLive((os) => os.automation.rules.run(id), [id]);
  const rule = useLive((os) => (run ? os.automation.rules.get(run.ruleId) : undefined), [run?.ruleId]);
  const back = () => (router.canGoBack() ? router.back() : router.replace(route('index')));
  if (!run) {
    return (
      <Screen title="Run" onBack={back}>
        <EmptyState icon="history" tint={TINT} line="This run is no longer in the log (the last 200 are kept)." />
      </Screen>
    );
  }
  const s = STATUS[run.status] ?? STATUS.ok!;
  const when = new Date(run.startedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const undoable = run.steps.filter((x) => x.status === 'done' && x.canUndo);
  const kept = run.steps.filter((x) => x.status === 'done' && !x.canUndo);
  const record = run.about?.entityId ? ctx.records.get(run.about.entityId) : undefined;

  const undo = async () => {
    setBusy(true);
    const r = await ctx.automation.undoRun(run.id);
    setBusy(false);
    toast.show({ message: `Undid ${r.undone} step${r.undone === 1 ? '' : 's'}${r.kept.length ? `; kept ${r.kept.join(', ')}` : ''}`, icon: 'undo' });
  };
  const again = async () => {
    setBusy(true);
    const next = await ctx.automation.retry(run.id);
    setBusy(false);
    if (next) router.replace(route('run', { run: next.id }));
  };

  return (
    <Screen title={rule?.name ?? 'Run'} subtitle={`${when} · ${s.label}`} onBack={back} contentStyle={{ gap: 14 }}>
      <RowList>
        <RowItem
          icon={run.about?.manual ? 'bolt' : 'link'}
          tint={TINT}
          title={run.about?.manual ? 'Run by hand' : record?.title ?? run.about?.title ?? 'Started by a trigger'}
          subtitle={run.about?.manual ? (run.about.vars?.said ? `“${plain(run.about.vars.said)}”` : 'Its button or Run now') : record ? ctx.registry.objects.get(record.object)?.label ?? null : null}
          onPress={record ? () => router.push(`/entity/${record.object}/${record.id}` as never) : rule ? () => router.push(route('rule', { rule: rule.id })) : undefined}
        />
      </RowList>

      {run.log.length ? (
        <Card>
          {run.log.map((l, i) => <Text key={i} style={{ fontSize: 13, lineHeight: 18, color: l.level === 'error' ? t.c.alert.coralText : t.c.fg.secondary }}>{l.msg}</Text>)}
        </Card>
      ) : null}

      {run.steps.map((step, i) => {
        const def = ctx.registry.actions.get(step.action);
        const input = Object.entries(step.input).filter(([, v]) => plain(v));
        const output = Object.entries(step.output).filter(([, v]) => plain(v));
        return (
          <Section key={step.key} title={`${i + 1}. ${step.label}`} meta={step.key}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Chip small label={STEP_STATUS[step.status]} tone={step.status === 'failed' ? 'alert' : step.status === 'done' ? 'ok' : 'neutral'} />
                {step.status === 'done' && !step.canUndo ? <Text style={{ fontSize: 12, color: t.c.fg.tertiary }}>{def?.undo ? 'nothing to undo' : 'can’t be undone'}</Text> : null}
              </View>
              <Text style={{ fontSize: 15, lineHeight: 21, color: step.status === 'failed' ? t.c.alert.coralText : t.c.fg.primary }}>{step.line}</Text>
              {input.length ? <Text style={{ fontSize: 12, color: t.c.fg.tertiary, marginTop: 12 }}>WENT IN</Text> : null}
              {input.map(([k, v]) => <DetailRow key={`i${k}`} label={k} value={plain(v)} />)}
              {output.length ? <Text style={{ fontSize: 12, color: t.c.fg.tertiary, marginTop: 12 }}>CAME OUT · {`{{steps.${step.key}.…}}`}</Text> : null}
              {output.map(([k, v]) => <DetailRow key={`o${k}`} label={k} value={plain(v)} />)}
            </Card>
          </Section>
        );
      })}

      {undoable.length ? <Button title={`Undo this run (${undoable.length} step${undoable.length === 1 ? '' : 's'})`} icon="undo" variant="secondary" block loading={busy} onPress={() => void undo()} /> : null}
      {undoable.length && kept.length ? <Text style={{ fontSize: 12, lineHeight: 17, color: t.c.fg.tertiary, paddingHorizontal: 4 }}>Stays as it is: {kept.map((x) => x.label).join(', ')}.</Text> : null}
      {run.status === 'error' && rule ? <Button title="Run again" icon="refresh" block loading={busy} onPress={() => void again()} /> : null}
      <View style={{ height: 8 }} />
    </Screen>
  );
}
