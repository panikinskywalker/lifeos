import React, { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DAILY_TRIGGER, type AutomationRule } from '@core/automation/engine';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { IconButton, Screen, Text } from '@ui/kit';
import { Caps, Dot, Group, Hairline, LILAC, RuleRow, Sub, TopBar, byLastRun, failedAt, failedRuns, isManual, plural, route, shortAt, triggerLabel, triggerModule, useModuleColor, useRunNow } from './parts';

type Filter = 'all' | 'on' | 'off' | 'manual' | 'failed';

/** All automations (NR-Automations-List): filters, then grouped by what starts them. */
export function AllAutomations({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const color = useModuleColor();
  const runNow = useRunNow(ctx);
  const [filter, setFilter] = useState<Filter>('all');
  const d = useLive((os) => ({ rules: os.automation.rules.all(), runs: os.automation.rules.runs(undefined, 200) }), []);
  const back = () => (router.canGoBack() ? router.back() : router.replace(route('index')));
  const failed = failedRuns(d.runs);
  const rules = byLastRun(d.rules, d.runs);
  const counts: Record<Filter, number> = { all: rules.length, on: rules.filter((r) => r.enabled).length, off: rules.filter((r) => !r.enabled).length, manual: rules.filter(isManual).length, failed: rules.filter((r) => failed.has(r.id)).length };
  const passes = (r: AutomationRule) => (filter === 'all' ? true : filter === 'on' ? r.enabled : filter === 'off' ? !r.enabled : filter === 'manual' ? isManual(r) : failed.has(r.id));
  const shown = rules.filter(passes);

  const groups: Array<{ label: string; dot: string; rules: AutomationRule[] }> = [
    { label: 'Manual run', dot: LILAC, rules: shown.filter(isManual) },
    { label: 'When money changes', dot: color('finance'), rules: shown.filter((r) => !isManual(r) && triggerModule(ctx, r.trigger) === 'finance') },
    { label: 'At a time', dot: t.tints.upkeep.ink, rules: shown.filter((r) => r.trigger.id === DAILY_TRIGGER) },
    { label: 'When a record or cycle changes', dot: t.c.fg.tertiary, rules: shown.filter((r) => !isManual(r) && r.trigger.id !== DAILY_TRIGGER && triggerModule(ctx, r.trigger) !== 'finance') },
  ];
  const lineOf = (r: AutomationRule) => {
    const runs = r.runCount ? `ran ${plural(r.runCount, 'time')}` : 'never ran';
    const off = !r.enabled ? ` · off since ${shortAt(r.updatedAt)}` : '';
    return `${isManual(r) ? 'Manual' : triggerLabel(ctx, r.trigger)} · ${plural(r.steps.length, 'step')} · ${runs}${off}`;
  };

  return (
    <Screen contentStyle={{ gap: 20 }}>
      <TopBar caption={`${rules.length} · ${counts.on} on · sorted by last run`} title="All automations" onBack={back} right={<IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel="New automation" onPress={() => router.push(route('edit'))} />} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
        {(['all', 'on', 'off', 'manual', 'failed'] as const).map((f) => {
          if (f === 'failed' && !counts.failed) return null;
          const sel = filter === f;
          const alert = f === 'failed' && !sel;
          return (
            <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: sel }} hitSlop={4} onPress={() => setFilter(f)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: sel ? t.c.fg.primary : t.c.bg.tileRaised }}>
              {f === 'failed' ? <Dot color={sel ? t.c.bg.ground : t.c.alert.coralText} /> : null}
              <Text style={{ fontSize: 14, fontWeight: '600', color: sel ? t.c.bg.ground : alert ? t.c.alert.coralText : t.c.fg.primary }}>{`${f[0]!.toUpperCase()}${f.slice(1)} ${counts[f]}`}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {shown.length ? (
        groups.filter((g) => g.rules.length).map((g) => (
          <View key={g.label} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
              <Dot color={g.dot} />
              <Caps>{g.label}</Caps>
            </View>
            <Group>
              {g.rules.map((r, i) => {
                const f = failed.get(r.id);
                const step = f ? failedAt(f) + 1 : 0;
                return (
                  <View key={r.id} style={{ gap: 8 }}>
                    {i ? <Hairline /> : null}
                    <RuleRow
                      rule={r}
                      ctx={ctx}
                      line={lineOf(r)}
                      pill={f ? `Failed ${shortAt(f.startedAt)}${step ? ` at step ${step}` : ''}` : undefined}
                      minHeight={isManual(r) ? 64 : 56}
                      right={isManual(r) && r.enabled ? <IconButton icon="bolt" filled color={t.c.accent.gold} accessibilityLabel={`Run ${r.name} now`} onPress={() => void runNow(r)} /> : undefined}
                    />
                  </View>
                );
              })}
            </Group>
          </View>
        ))
      ) : (
        <View style={{ paddingHorizontal: 4 }}><Sub lines={2}>{rules.length ? 'None here.' : 'No automations yet.'}</Sub></View>
      )}

      <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, paddingHorizontal: 4 }}>An automation that is off keeps its runs. Turn it on again and it starts from the next trigger, not the ones it missed.</Text>
    </Screen>
  );
}
