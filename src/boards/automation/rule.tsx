import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AutomationRun, RuleStep } from '@core/automation/engine';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ActionSheet, EmptyState, Icon, IconButton, Screen, Text } from '@ui/kit';
import { Block, BlockToggle, Caps, Disc, Dot, Group, Hairline, LILAC, Mono, Pill, RunRow, Sub, TokenText, TopBar, confirmDelete, failedAt, isManual, longAt, manualPhrase, moduleWord, plural, route, runSource, runsWithoutRecord, seconds, stepName, stepText, triggerIcon, triggerLabel, triggerModule, useModuleColor, useRunNow, TRIGGER_COPY } from './parts';

const OPS: Record<string, string> = { eq: 'is', neq: 'is not', gt: 'is more than', gte: 'is at least', lt: 'is less than', lte: 'is at most', contains: 'contains', isNull: 'is empty', notNull: 'is not empty', in: 'is one of', notIn: 'is none of' };

/** "Stopped at step 3 of 5 · by hand" · "5 of 5 · 6.2 s · by hand" · "Conditions not met". */
export function runSummary(run: AutomationRun, total: number): string {
  if (run.status === 'skipped') return 'Conditions not met';
  const n = Math.max(total, run.steps.length);
  const f = failedAt(run);
  const head = f >= 0 ? `Stopped at step ${f + 1} of ${n}` : `${run.steps.filter((s) => s.status === 'done' || s.status === 'undone').length} of ${n}`;
  const took = run.finishedAt && f < 0 ? ` · ${seconds(run.finishedAt - run.startedAt)}` : '';
  return `${head}${took} · ${runSource(run)}`;
}

/**
 * An automation (?rule=<id>, NR-Automations-Record): the lilac block with its
 * switch and Run now, the numbers, what starts it, its steps in order, its
 * runs, and what it has made.
 */
export function RulePage({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const runNow = useRunNow(ctx);
  const color = useModuleColor();
  const [more, setMore] = useState(false);
  const id = params.rule ?? '';
  const d = useLive((os) => ({ rule: os.automation.rules.get(id), runs: os.automation.rules.runs(id, 200) }), [id]);
  const back = () => (router.canGoBack() ? router.back() : router.replace(route('index')));
  const rule = d.rule;
  if (!rule) {
    return (
      <Screen contentStyle={{ gap: 20 }}>
        <TopBar title="Automation" onBack={back} />
        <EmptyState icon="bolt" tint="tasks" line="This automation was deleted." />
      </Screen>
    );
  }
  const ink = t.c.fg.onAccent;
  const real = d.runs.filter((r) => r.status !== 'skipped');
  const failedCount = real.filter((r) => r.status === 'error').length;
  const latest = real[0];
  const failedKey = latest?.status === 'error' ? latest.steps[failedAt(latest)] : undefined;
  const edit = () => router.push(route('edit', { rule: rule.id }));
  const remove = () => confirmDelete(rule.name, () => {
    ctx.automation.rules.remove(rule.id);
    router.replace(route('index'));
  });
  const duplicate = () => {
    const copy = ctx.automation.rules.save({ name: `${rule.name} copy`, enabled: false, trigger: rule.trigger, conditions: rule.conditions, steps: rule.steps });
    router.replace(route('rule', { rule: copy.id }));
  };
  // Records its runs left: a step's output id that is a record.
  const made = d.runs.flatMap((run) => run.steps.flatMap((s) => (s.status === 'done' && typeof s.output.id === 'string' ? [ctx.records.get(s.output.id)] : []))).filter((r) => !!r).slice(0, 2);
  const sentence = `${triggerLabel(ctx, rule.trigger)}. Then: ${rule.steps.map((s) => stepName(ctx, s.action).toLowerCase()).join(', ') || 'nothing yet'}.`;
  const module = triggerModule(ctx, rule.trigger);

  return (
    <Screen contentStyle={{ gap: 20 }}>
      <TopBar onBack={back} right={<><IconButton icon="edit" filled accessibilityLabel="Edit" onPress={edit} /><IconButton icon="more" filled accessibilityLabel="More" onPress={() => setMore(true)} /></>} />

      <View style={{ padding: 20, borderRadius: 28, backgroundColor: LILAC, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase', color: ink }}>{`Automation · ${isManual(rule) ? 'Manual run' : moduleWord(ctx, module) || 'Trigger'} · ${plural(rule.steps.length, 'step')}`}</Text>
          <BlockToggle value={rule.enabled} onChange={(v) => ctx.automation.rules.setEnabled(rule.id, v)} accessibilityLabel={`${rule.name} on`} />
        </View>
        <View>
          <Text accessibilityRole="header" style={{ fontSize: 34, lineHeight: 38, fontWeight: '700', letterSpacing: -1, color: ink }}>{rule.name}</Text>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '500', marginTop: 6, color: ink }}>{sentence}</Text>
        </View>
        {runsWithoutRecord(rule) ? <Pill title="Run now" icon="bolt" bg={ink} ink={t.c.fg.primary} iconColor={t.c.accent.gold} onPress={() => void runNow(rule)} /> : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[{ label: 'Runs', n: real.length }, { label: 'Ran', n: real.length - failedCount, color: t.c.accent.gold }, { label: 'Failed', n: failedCount, color: t.c.alert.coralText }].map((x) => (
          <View key={x.label} style={{ flex: 1, padding: 14, borderRadius: 20, backgroundColor: t.c.bg.tile, gap: 4 }}>
            <Caps>{x.label}</Caps>
            <Text style={{ fontSize: 30, lineHeight: 32, fontWeight: '700', letterSpacing: -1.5, color: x.color ?? t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{x.n}</Text>
          </View>
        ))}
      </View>

      <Block title="Starts from" line={isManual(rule) ? 'A manual run: you start it, two ways' : rule.conditions.length ? 'Its trigger, and what must be true' : 'Its trigger, every time'}>
        <Group>
          {isManual(rule) ? (
            <>
              <StartRow icon="bolt" title="Button on Automations" line="Under Run now" color={t.c.accent.gold} />
              <Hairline />
              <StartRow icon="mic" title="Say it in the Dump box" line={manualPhrase(rule)} color={t.c.accent.gold} action="Edit" onAction={edit} />
            </>
          ) : (
            <StartRow icon={triggerIcon(ctx, rule.trigger)} title={triggerLabel(ctx, rule.trigger)} line={TRIGGER_COPY[rule.trigger.id]?.line ?? ctx.registry.triggers.get(rule.trigger.id)?.description ?? ''} color={color(module)} />
          )}
          {rule.conditions.map((c, i) => (
            <View key={i} style={{ gap: 8 }}>
              <Hairline />
              <StartRow icon="filter" title={`${c.field.replace(/^(data|vars)\./, '')} ${OPS[c.op] ?? c.op}${c.value == null || c.value === '' ? '' : ` ${String(c.value)}`}`} line="Only if" color={t.c.accent.gold} />
            </View>
          ))}
        </Group>
      </Block>

      <Block title="Steps" line="Each step can use what the ones before it made" action="Edit" onAction={edit}>
        <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
          {rule.steps.map((s, i) => <StepLine key={s.key} ctx={ctx} step={s} index={i} steps={rule.steps} last={i === rule.steps.length - 1} failed={failedKey?.key === s.key ? `Failed ${longAt(latest!.startedAt)}: ${failedKey.line}` : undefined} />)}
          {rule.steps.length ? null : <Sub>No steps yet.</Sub>}
        </View>
      </Block>

      <Block title="Runs" line="Open one for every step’s input and output">
        {d.runs.length ? (
          <Group>
            {d.runs.slice(0, 10).map((run, i) => (
              <View key={run.id} style={{ gap: 8 }}>
                {i ? <Hairline /> : null}
                <RunRow run={run} title={longAt(run.startedAt)} line={runSummary(run, rule.steps.length)} chevron />
              </View>
            ))}
          </Group>
        ) : (
          <View style={{ paddingHorizontal: 4 }}><Sub>It hasn’t run yet.</Sub></View>
        )}
      </Block>

      {made.length ? (
        <Block title="Made by it" line="Records its runs left">
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {made.map((r) => (
              <Pressable key={r.id} accessibilityRole="link" onPress={() => router.push(`/entity/${r.object}/${r.id}` as never)} style={({ pressed }) => ({ flex: 1, minWidth: 0, padding: 14, borderRadius: 20, backgroundColor: t.c.bg.tile, gap: 6, opacity: pressed ? 0.8 : 1 })}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Dot color={color(ctx.registry.objects.get(r.object)?.module)} />
                  <Caps>{ctx.registry.objects.get(r.object)?.label ?? r.object}</Caps>
                </View>
                <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{r.title}</Text>
                {r.subtitle ? <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary }}>{r.subtitle}</Text> : null}
              </Pressable>
            ))}
          </View>
        </Block>
      ) : null}

      <Pill title="Delete automation" kind="danger" onPress={remove} />
      <ActionSheet visible={more} onClose={() => setMore(false)} title={rule.name} actions={[{ label: 'Make a copy', icon: 'plus-circle', onPress: duplicate }, { label: 'Delete automation', icon: 'trash', destructive: true, onPress: remove }]} />
    </Screen>
  );
}

function StartRow({ icon, title, line, color, action, onAction }: { icon: string; title: string; line: string; color: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52 }}>
      <Disc icon={icon} color={color} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600' }}>{title}</Text>
        {line ? <Sub lines={2}>{line}</Sub> : null}
      </View>
      {action ? (
        <Pressable accessibilityRole="button" hitSlop={14} onPress={onAction}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: t.c.fg.secondary }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A step on the rail: numbered disc, where it comes from, what it does, what it gives. */
function StepLine({ ctx, step, index, steps, last, failed }: { ctx: LifeOSContext; step: RuleStep; index: number; steps: RuleStep[]; last: boolean; failed?: string }) {
  const t = useTheme();
  const color = useModuleColor();
  const def = ctx.registry.actions.get(step.action);
  const name = stepName(ctx, step.action);
  const gives = (def?.outputs ?? []).filter((o) => o !== 'id');
  const text = stepText(step);
  const module = def?.module;
  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: failed ? t.c.alert.coralFill : t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Mono color={failed ? t.c.alert.coralText : t.c.fg.primary}>{index + 1}</Mono>
        </View>
        {last ? null : <View style={{ width: 2, flex: 1, backgroundColor: t.c.line, marginVertical: 4 }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4, paddingBottom: last ? 0 : 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {step.action === 'core.askModel' ? <Icon name="sparkle" size={12} color={LILAC} /> : step.action === 'core.notify' ? <Icon name="bell" size={12} color={t.c.fg.secondary} /> : <Dot color={color(module)} />}
          <Caps>{module && module !== 'core' ? `${name} · ${moduleWord(ctx, module)}` : name}</Caps>
        </View>
        <TokenText value={text || name} steps={steps} strong lineHeight={20} />
        {gives.length ? (
          <View style={{ alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8, backgroundColor: t.c.bg.tileRaised }}>
            <Mono color={LILAC}>{`gives ${gives.join(', ')}`}</Mono>
          </View>
        ) : null}
        {failed ? <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.alert.coralText }}>{failed}</Text> : null}
      </View>
    </View>
  );
}
