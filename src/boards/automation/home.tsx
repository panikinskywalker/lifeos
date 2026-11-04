import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { AutomationRule, AutomationRun } from '@core/automation/engine';
import type { AutomationTemplate } from '@core/registry/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, IconButton, Screen, Text } from '@ui/kit';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { Block, Disc, Dot, Group, Hairline, LILAC, Pill, RunRow, RuleRow, SearchBox, StatusPill, Sub, TopBar, byLastRun, failedAt, failedRuns, isManual, longAt, manualPhrase, moduleWord, plural, route, runLine, runSource, stepName, triggerLabel, useModuleColor, useRunNow, useRunToast } from './parts';

const WEEK = 7 * 86400000;

/** The line under a rule on the home: what its last run did, else its trigger. */
const ruleLine = (ctx: LifeOSContext, rule: AutomationRule, runs: AutomationRun[]) => {
  const last = runs.find((r) => r.ruleId === rule.id);
  return last ? runLine(last) : triggerLabel(ctx, rule.trigger);
};

/**
 * The Automations home (NR-Automations-Home, and -Empty with no rules): what
 * needs you, the manual-run buttons, your automations, recent runs, templates.
 */
export function AutomationsHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const runNow = useRunNow(ctx);
  const report = useRunToast(ctx);
  const [q, setQ] = useState('');
  const d = useLive((os) => ({ rules: os.automation.rules.all(), runs: os.automation.rules.runs(undefined, 200), templates: os.automation.templates() }), []);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/browse' as never));
  const add = <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel="New automation" onPress={() => router.push(route('edit'))} />;

  if (!d.rules.length) return <Empty ctx={ctx} templates={d.templates} back={back} add={add} />;

  const on = d.rules.filter((r) => r.enabled).length;
  const rules = byLastRun(d.rules, d.runs);
  const manual = rules.filter((r) => r.enabled && isManual(r));
  const failed = [...failedRuns(d.runs).values()].filter((run) => d.rules.some((r) => r.id === run.ruleId));
  const nameOf = (id: string) => d.rules.find((r) => r.id === id)?.name ?? 'A deleted automation';
  const week = d.runs.filter((r) => r.startedAt > Date.now() - WEEK && r.status !== 'skipped');
  const weekFailed = week.filter((r) => r.status === 'error').length;
  const retry = async (run: AutomationRun) => {
    const next = await ctx.automation.retry(run.id);
    if (next) report(nameOf(run.ruleId), next);
  };
  const needle = q.trim().toLowerCase();
  const found = needle ? rules.filter((r) => [r.name, triggerLabel(ctx, r.trigger), ...r.steps.map((s) => stepName(ctx, s.action))].some((x) => x.toLowerCase().includes(needle))) : [];

  return (
    <Screen contentStyle={{ gap: 24 }}>
      <TopBar caption={`${plural(d.rules.length, 'automation')} · ${on} on`} dot={LILAC} title="Automations" onBack={back} right={<><ToCheckBell />{add}</>} />
      <SearchBox value={q} onChange={setQ} placeholder="Name, trigger or step" />

      {needle ? (
        found.length ? (
          <Group>
            {found.map((r, i) => (
              <View key={r.id} style={{ gap: 8 }}>
                {i ? <Hairline /> : null}
                <RuleRow rule={r} ctx={ctx} disc line={ruleLine(ctx, r, d.runs)} />
              </View>
            ))}
          </Group>
        ) : (
          <View style={{ paddingHorizontal: 4 }}><Sub lines={2}>Nothing has that name, trigger or step.</Sub></View>
        )
      ) : (
        <>
          {failed.length ? (
            <Block title="Needs you" line="A run that stopped part way">
              {failed.map((run) => <NeedsYou key={run.id} ctx={ctx} run={run} name={nameOf(run.ruleId)} onRetry={() => void retry(run)} />)}
            </Block>
          ) : null}

          <Block title="Run now" line="Also on Today, or say it in the Dump box">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
              {manual.map((r) => <RunTile key={r.id} rule={r} onRun={() => void runNow(r)} />)}
              <Pressable accessibilityRole="button" onPress={() => router.push(route('edit'))} style={({ pressed }) => ({ width: '48.6%', height: 150, borderRadius: 24, backgroundColor: t.c.bg.tile, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.bg.pressed, padding: 16, justifyContent: 'space-between', opacity: pressed ? 0.8 : 1 })}>
                <Disc icon="plus" color={t.c.accent.gold} size={36} iconSize={16} />
                <View>
                  <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '600' }}>Add a button</Text>
                  <Text style={{ fontSize: 12, lineHeight: 16, marginTop: 2, color: t.c.fg.secondary }}>Any automation with a manual run</Text>
                </View>
              </Pressable>
            </View>
          </Block>

          <Block title="Your automations" line="The dot is the module the trigger comes from" action={`All ${d.rules.length}`} chevron onAction={() => router.push(route('all'))}>
            <Group>
              {rules.slice(0, 5).map((r, i) => (
                <View key={r.id} style={{ gap: 8 }}>
                  {i ? <Hairline /> : null}
                  <RuleRow rule={r} ctx={ctx} disc line={ruleLine(ctx, r, d.runs)} />
                </View>
              ))}
            </Group>
          </Block>

          <Block title="Recent runs" line={`Last 7 days · ${plural(week.length, 'run')}${weekFailed ? `, ${weekFailed} failed` : ''}`}>
            {d.runs.length ? (
              <Group>
                {d.runs.slice(0, 4).map((run, i) => (
                  <View key={run.id} style={{ gap: 8 }}>
                    {i ? <Hairline /> : null}
                    <RunRow run={run} title={nameOf(run.ruleId)} line={runLine(run)} />
                  </View>
                ))}
              </Group>
            ) : (
              <View style={{ paddingHorizontal: 4 }}><Sub>Nothing has run yet.</Sub></View>
            )}
          </Block>

          {d.templates.length ? (
            <Block title="Templates" line="From your modules, ready to edit">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
                {d.templates.map((x) => <TemplateCard key={x.id} ctx={ctx} template={x} used={d.rules.some((r) => r.name === x.name)} />)}
              </ScrollView>
            </Block>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.c.bg.tile }}>
            <Icon name="lock" size={18} color={t.c.accent.gold} style={{ marginTop: 1 }} />
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: t.c.fg.secondary }}>
              Automations run on the phone. Only an <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '600' }}>Ask the model</Text> step sends anything out: that step’s own text, never raw SMS, listed in You › Sent to Claude.
            </Text>
          </View>
        </>
      )}
    </Screen>
  );
}

/** A run that stopped part way: where, why, Run again and See the run. */
function NeedsYou({ ctx, run, name, onRetry }: { ctx: LifeOSContext; run: AutomationRun; name: string; onRetry: () => void }) {
  const router = useRouter();
  const t = useTheme();
  const f = failedAt(run);
  const step = run.steps[f];
  const total = ctx.automation.rules.get(run.ruleId)?.steps.length ?? run.steps.length;
  const kept = run.steps.filter((s) => s.status === 'done').length;
  const line = step?.line ?? run.log[run.log.length - 1]?.msg ?? 'It stopped.';
  return (
    <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Disc icon="warning" color={t.c.alert.coralText} bg={t.c.alert.coralFill} size={44} iconSize={20} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 }}>{name}</Text>
          <Sub>{`${longAt(run.startedAt)} · ${runSource(run)}`}</Sub>
        </View>
        <StatusPill status="error" />
      </View>
      <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, gap: 4 }}>
        {step ? <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase', color: t.c.fg.tertiary }}>{`Step ${f + 1} of ${total} · ${stepName(ctx, step.action)}`}</Text> : null}
        <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: '500' }}>{line}{kept ? ` ${kept === 1 ? 'Step 1 is' : `Steps 1 to ${kept} are`} kept.` : ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pill title="Run again" icon="refresh" kind="primary" height={46} flex onPress={onRetry} />
        <Pill title="See the run" height={46} flex onPress={() => router.push(route('run', { run: run.id }))} />
      </View>
    </View>
  );
}

/** A manual run on lilac: the tile opens it, the round button runs it. */
function RunTile({ rule, onRun }: { rule: AutomationRule; onRun: () => void }) {
  const router = useRouter();
  const t = useTheme();
  const ink = t.c.fg.onAccent;
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(route('rule', { rule: rule.id }))} style={({ pressed }) => ({ width: '48.6%', height: 150, borderRadius: 24, backgroundColor: LILAC, padding: 16, justifyContent: 'space-between', opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: ink }}>MANUAL</Text>
        <IconButton icon="bolt" size={36} filled={ink} color={LILAC} accessibilityLabel={`Run ${rule.name} now`} onPress={onRun} />
      </View>
      <View>
        <Text numberOfLines={2} style={{ fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.4, color: ink }}>{rule.name}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', marginTop: 4, color: ink }}>{manualPhrase(rule)}</Text>
      </View>
    </Pressable>
  );
}

function TemplateCard({ ctx, template, used }: { ctx: LifeOSContext; template: AutomationTemplate; used: boolean }) {
  const router = useRouter();
  const t = useTheme();
  const color = useModuleColor();
  return (
    <View style={{ width: 170, padding: 14, borderRadius: 20, backgroundColor: t.c.bg.tile, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Dot color={color(template.module)} />
        <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, textTransform: 'uppercase', color: t.c.fg.secondary }}>{moduleWord(ctx, template.module)}</Text>
      </View>
      <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{template.name}</Text>
      <Text numberOfLines={4} style={{ flex: 1, fontSize: 12, lineHeight: 16, color: t.c.fg.secondary }}>{template.description}</Text>
      {used ? (
        <View style={{ marginTop: 4, height: 36, borderRadius: 999, backgroundColor: t.c.ok.sageFill, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: t.c.ok.sageText }}>In use</Text>
        </View>
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={`Use ${template.name}`} hitSlop={4} onPress={() => router.push(route('edit', { template: template.id }))} style={({ pressed }) => ({ marginTop: 4, height: 36, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
          <Text style={{ fontSize: 13, fontWeight: '600' }}>Use</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Nothing set up yet (NR-Automations-Empty): when, if, then in a sentence, Build your own, the templates. */
function Empty({ ctx, templates, back, add }: { ctx: LifeOSContext; templates: AutomationTemplate[]; back: () => void; add: React.ReactNode }) {
  const router = useRouter();
  const t = useTheme();
  const color = useModuleColor();
  return (
    <Screen contentStyle={{ gap: 20 }}>
      <TopBar caption="Nothing set up yet" dot={LILAC} title="Automations" onBack={back} right={add} />
      <View style={{ paddingVertical: 22, paddingHorizontal: 20, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 16 }}>
        <Disc icon="bolt" color={LILAC} size={56} iconSize={24} />
        <View>
          <Text style={{ fontSize: 22, lineHeight: 27, fontWeight: '700', letterSpacing: -0.4 }}>Nothing runs on its own yet</Text>
          <Text style={{ fontSize: 15, lineHeight: 21, marginTop: 6, color: t.c.fg.secondary }}>An automation is a when, an if and a then. For example: when a transaction over ₹5,000 is added, tag it review and remind me tomorrow.</Text>
        </View>
        <View style={{ gap: 8 }}>
          <Pill title="Build your own" kind="primary" onPress={() => router.push(route('edit'))} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.c.bg.tileRaised }}>
            <Icon name="mic" size={18} color={t.c.accent.gold} />
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: t.c.fg.secondary }}>
              Or say it in the Dump box: <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '600' }}>“tag anything over ₹5,000 for review”</Text>. You see it before it is saved.
            </Text>
          </View>
        </View>
      </View>
      {templates.length ? (
        <Block title="Start from a template" line="From the modules you use">
          <Group>
            {templates.map((x, i) => (
              <View key={x.id} style={{ gap: 8 }}>
                {i ? <Hairline /> : null}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 }}>
                  <Disc icon={ctx.registry.modules.get(x.module ?? '')?.icon ?? 'bolt'} color={color(x.module)} />
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600' }}>{x.name}</Text>
                    <Sub lines={2}>{`${moduleWord(ctx, x.module)} · ${x.description}`}</Sub>
                  </View>
                  <Pill title="Use" height={44} size={14} onPress={() => router.push(route('edit', { template: x.id }))} />
                </View>
              </View>
            ))}
          </Group>
        </Block>
      ) : null}
    </Screen>
  );
}
