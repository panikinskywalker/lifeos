import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { AutomationRun, RuleStep, StepRun } from '@core/automation/engine';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { EmptyState, Icon, Screen, Text, useToast } from '@ui/kit';
import { Caps, Disc, Dot, Hairline, LILAC, Mono, Pill, Sub, TopBar, failedAt, longAt, moduleWord, plural, route, runSource, seconds, stepName, stepText, tokenLabel, tokensIn, useModuleColor } from './parts';

const plain = (v: unknown) => (v == null || v === '' ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const entries = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => [k, plain(v)] as const).filter(([, v]) => v);
/** Claude was never reached: no key, or over the day's budget (a network error may have reached it). */
const notSent = (s: StepRun) => s.action === 'core.askModel' && s.output.asked !== true && /no Claude key|budget/.test(s.line);

/**
 * One run (?run=<id>, NR-Automations-RunLog): how far it got, what started
 * it, each step with what went in and came out, the steps it never reached,
 * and the log. Undo (last step first, where the action can be undone) and Run
 * again from the start.
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
      <Screen contentStyle={{ gap: 20 }}>
        <TopBar title="Run" onBack={back} />
        <EmptyState icon="history" tint="tasks" line="This run is no longer in the log (the last 200 are kept)." />
      </Screen>
    );
  }
  const notRun = (rule?.steps ?? []).filter((s) => !run.steps.some((x) => x.key === s.key));
  const allSteps: Array<Pick<RuleStep, 'key'>> = rule?.steps ?? run.steps;
  const undoable = run.steps.filter((x) => x.status === 'done' && x.canUndo);
  const kept = run.steps.filter((x) => x.status === 'done' && !x.canUndo);
  const record = run.about?.entityId ? ctx.records.get(run.about.entityId) : undefined;
  const f = failedAt(run);
  const stopped = run.steps.findIndex((s) => s.status === 'stopped');
  const ran = run.steps.filter((s) => s.status === 'done').length;
  const failedN = run.steps.filter((s) => s.status === 'failed').length;
  const took = run.finishedAt ? seconds(run.finishedAt - run.startedAt) : null;
  const claude = run.steps.some(notSent) ? 'nothing was sent to Claude' : run.steps.some((s) => s.output.asked === true) ? 'sent to Claude' : null;
  const head =
    f >= 0 ? { title: `Stopped at step ${f + 1}`, icon: 'warning', color: t.c.alert.coralText, bg: t.c.alert.coralFill }
    : run.status === 'skipped' ? { title: 'Skipped', icon: 'filter', color: t.c.fg.secondary, bg: t.c.bg.tileRaised }
    : run.status === 'undone' ? { title: 'Undone', icon: 'undo', color: t.c.fg.secondary, bg: t.c.bg.tileRaised }
    : stopped >= 0 ? { title: `Ended quietly at step ${stopped + 1}`, icon: 'check', color: t.c.accent.gold, bg: t.c.ok.sageFill }
    : { title: `Ran ${plural(ran, 'step')}`, icon: 'check', color: t.c.accent.gold, bg: t.c.ok.sageFill };

  const undo = async () => {
    setBusy(true);
    const r = await ctx.automation.undoRun(run.id);
    setBusy(false);
    toast.show({ message: `Undid ${plural(r.undone, 'step')}${r.kept.length ? `; kept ${r.kept.join(', ')}` : ''}`, icon: 'undo' });
  };
  const again = async () => {
    setBusy(true);
    const next = await ctx.automation.retry(run.id);
    setBusy(false);
    if (next) router.replace(route('run', { run: next.id }));
  };

  const logLines: Array<{ text: string; alert?: boolean }> = [
    { text: `${format(run.startedAt, 'HH:mm:ss')} · started · ${runSource(run)}` },
    ...run.log.map((l) => ({ text: `${format(l.at, 'HH:mm:ss')} · ${l.msg}`, alert: l.level === 'error' })),
    ...run.steps.map((s, i) => ({ text: `${format(s.at, 'HH:mm:ss')} · step ${i + 1} · ${s.status === 'failed' ? 'failed · ' : ''}${s.line}`, alert: s.status === 'failed' })),
    ...(notRun.length && run.status !== 'skipped' ? [{ text: `stopped · ${plural(notRun.length, 'step')} not run` }] : []),
  ];

  return (
    <Screen contentStyle={{ gap: 20 }}>
      <TopBar caption={`${longAt(run.startedAt)} · ${runSource(run)}`} title={`${rule?.name ?? 'A deleted automation'} · run`} onBack={back} />

      <View style={{ padding: 18, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Disc icon={head.icon} color={head.color} bg={head.bg} size={44} iconSize={20} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4 }}>{head.title}</Text>
            <Sub lines={2}>{[took, claude].filter(Boolean).join(' · ') || runSource(run)}</Sub>
          </View>
        </View>
        {run.steps.length + notRun.length ? (
          <>
            <View accessibilityLabel={`${ran} steps ran, ${failedN} failed, ${notRun.length} not run`} style={{ flexDirection: 'row', gap: 4 }}>
              {run.steps.map((s) => <View key={s.key} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: s.status === 'failed' ? t.c.alert.coral : s.status === 'done' ? t.c.accent.mustard : t.c.fg.tertiary }} />)}
              {notRun.map((s) => <View key={s.key} style={{ flex: 1, height: 8, borderRadius: 4, backgroundColor: t.c.bg.tileRaised }} />)}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary }}>{ran} ran</Text>
              {failedN ? <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.alert.coralText }}>{failedN} failed</Text> : null}
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary }}>{notRun.length} not run</Text>
            </View>
          </>
        ) : null}
        {run.status === 'error' && rule ? <Pill title="Run again from the start" icon="refresh" kind="primary" disabled={busy} onPress={() => void again()} /> : null}
        {undoable.length ? <Pill title={`Undo this run (${plural(undoable.length, 'step')})`} icon="undo" disabled={busy} onPress={() => void undo()} /> : null}
        {undoable.length && kept.length ? <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary, textAlign: 'center' }}>Stays as it is: {kept.map((x) => stepName(ctx, x.action)).join(', ')}.</Text> : null}
      </View>

      <View style={{ gap: 10 }}>
        <Caps style={{ paddingHorizontal: 4 }}>Started by</Caps>
        <Pressable disabled={!record} accessibilityRole={record ? 'link' : undefined} onPress={() => record && router.push(`/entity/${record.object}/${record.id}` as never)} style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {run.about?.manual ? <Disc icon="bolt" color={t.c.fg.onAccent} bg={LILAC} iconSize={16} /> : <Disc icon={record ? ctx.registry.objects.get(record.object)?.icon ?? 'link' : 'link'} color={t.c.fg.primary} />}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{run.about?.manual ? `Manual run · ${runSource(run)}` : record?.title ?? run.about?.title ?? 'Its trigger'}</Text>
            {run.about?.manual && run.about.vars?.said ? <Mono>{`said = ${plain(run.about.vars.said)}`}</Mono> : record ? <Mono>{ctx.registry.objects.get(record.object)?.label ?? record.object}</Mono> : null}
          </View>
          {record ? <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} /> : null}
        </Pressable>
      </View>

      {run.steps.length + notRun.length ? (
        <View style={{ gap: 10 }}>
          <Caps style={{ paddingHorizontal: 4 }}>Steps · what went in, what came out</Caps>
          <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
            {run.steps.map((s, i) => <RanStep key={s.key} ctx={ctx} run={run} step={s} index={i} last={i === run.steps.length - 1 && !notRun.length} />)}
            {notRun.map((s, i) => <NotRunStep key={s.key} ctx={ctx} step={s} index={run.steps.length + i} steps={allSteps} last={i === notRun.length - 1} />)}
          </View>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <Caps style={{ paddingHorizontal: 4 }}>The log</Caps>
        <View style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.c.bg.tile, gap: 6 }}>
          {logLines.map((l, i) => <Mono key={i} size={11} color={l.alert ? t.c.alert.coralText : undefined}>{l.text}</Mono>)}
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 4 }}>
        <Icon name="lock" size={16} color={t.c.fg.secondary} />
        <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: t.c.fg.secondary }}>Runs are kept on the phone. When an Ask the model step does send, its text shows here and in You › Sent to Claude.</Text>
      </View>
    </Screen>
  );
}

function Rail({ last }: { last: boolean }) {
  const t = useTheme();
  return last ? null : <View style={{ width: 2, flex: 1, backgroundColor: t.c.line, marginVertical: 4 }} />;
}

/** A step that ran: its status disc, how long, and the slab of what went in and came out. */
function RanStep({ ctx, run, step, index, last }: { ctx: LifeOSContext; run: AutomationRun; step: StepRun; index: number; last: boolean }) {
  const router = useRouter();
  const t = useTheme();
  const color = useModuleColor();
  const def = ctx.registry.actions.get(step.action);
  const name = stepName(ctx, step.action);
  const failed = step.status === 'failed';
  const input = entries(step.input);
  const output = entries(step.output).filter(([k]) => k !== 'asked');
  const next = run.steps[index + 1]?.at ?? run.finishedAt;
  const disc = failed ? { icon: 'x', bg: t.c.alert.coral, fg: t.c.alert.coralInk } : step.status === 'done' ? { icon: 'check', bg: t.c.accent.mustard, fg: t.c.accent.mustardInk } : step.status === 'undone' ? { icon: 'undo', bg: t.c.bg.tileRaised, fg: t.c.fg.secondary } : { icon: 'minus', bg: t.c.bg.tileRaised, fg: t.c.fg.secondary };
  const askModel = step.action === 'core.askModel';
  const module = def?.module && def.module !== 'core' ? moduleWord(ctx, def.module) : null;
  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      <View style={{ alignItems: 'center' }}>
        <Disc icon={disc.icon} color={disc.fg} bg={disc.bg} size={28} iconSize={14} />
        <Rail last={last} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 8, paddingBottom: last ? 0 : 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{`${index + 1} · ${name}`}</Text>
          {next ? <Mono size={11}>{seconds(next - step.at)}</Mono> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {askModel ? <Icon name="sparkle" size={12} color={LILAC} /> : <Dot color={color(def?.module)} />}
          <Caps>{askModel ? 'Claude · Ask the model' : module ? `${name} · ${module}` : step.status === 'undone' ? 'Undone' : step.status === 'stopped' ? 'Ended the run here' : name}</Caps>
        </View>
        <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.c.bg.tileRaised, gap: 6 }}>
          {input.length ? (
            <>
              <Mono size={10} style={{ letterSpacing: 0.6 }}>{failed && askModel ? 'IN · WOULD HAVE SENT' : 'IN'}</Mono>
              {input.map(([k, v]) => <Pair key={k} name={k} value={v} alone={input.length === 1} />)}
              <Hairline />
            </>
          ) : null}
          {failed ? (
            <>
              <Mono size={10} color={t.c.alert.coralText} style={{ letterSpacing: 0.6 }}>ERROR</Mono>
              <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.alert.coralText }}>{step.line}</Text>
              {notSent(step) ? (
                <Pressable accessibilityRole="link" hitSlop={14} onPress={() => router.push('/settings/brain' as never)} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600' }}>Change it in You › Agent</Text>
                  <Icon name="chevron-right" size={14} color={t.c.fg.secondary} />
                </Pressable>
              ) : null}
            </>
          ) : output.length === 1 ? (
            <>
              <Mono size={10} color={LILAC} style={{ letterSpacing: 0.6 }}>{`OUT · ${output[0]![0].toUpperCase()}`}</Mono>
              <Text style={output[0]![1].length < 24 ? { fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.5 } : { fontSize: 13, lineHeight: 18 }}>{output[0]![1]}</Text>
            </>
          ) : output.length ? (
            <>
              <Mono size={10} color={LILAC} style={{ letterSpacing: 0.6 }}>OUT</Mono>
              {output.map(([k, v]) => <Pair key={k} name={k} value={v} />)}
            </>
          ) : (
            <Text style={{ fontSize: 13, lineHeight: 18 }}>{step.line}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

function Pair({ name, value, alone }: { name: string; value: string; alone?: boolean }) {
  const t = useTheme();
  if (alone) return <Text style={{ fontSize: 13, lineHeight: 18 }}>{value}</Text>;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{name}</Text>
      <Text numberOfLines={3} style={{ flexShrink: 1, fontSize: 13, lineHeight: 17, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

/** A step it never reached: dashed disc, what it would have used. */
function NotRunStep({ ctx, step, index, steps, last }: { ctx: LifeOSContext; step: RuleStep; index: number; steps: Array<Pick<RuleStep, 'key'>>; last: boolean }) {
  const t = useTheme();
  const text = stepText(step);
  const uses = text ? tokensIn(text).filter((p) => p.startsWith('steps.')).map((p) => tokenLabel(p, steps)) : [];
  return (
    <View style={{ flexDirection: 'row', gap: 14 }}>
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: t.c.bg.pressed }} />
        <Rail last={last} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4, paddingBottom: last ? 0 : 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.secondary }}>{`${index + 1} · ${stepName(ctx, step.action)}`}</Text>
          <Text style={{ fontSize: 12, color: t.c.fg.secondary }}>Not run</Text>
        </View>
        {uses.length ? <Sub lines={2}>{`Would use ${uses.join(', ')}`}</Sub> : text ? <Sub lines={2}>{text}</Sub> : null}
      </View>
    </View>
  );
}
