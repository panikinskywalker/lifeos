import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { TileDef, TileProps } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { IconButton, Text } from '@ui/kit';
import { Disc, Dot, LILAC, byLastRun, failedAt, failedRuns, isManual, plural, route, shortAt, useRunToast } from './parts';

const DAY = 86400000;
const WIDE = 167;

/** Automations on Today (NR-Automations-Tile): the week's runs and what stopped; small beside the run button, wide with the runs per day when alone. */
function AutomationsTile({ size }: TileProps) {
  const router = useRouter();
  const t = useTheme();
  const d = useLive((os) => ({ rules: os.automation.rules.all(), runs: os.automation.rules.runs(undefined, 200) }), []);
  const now = Date.now();
  const week = d.runs.filter((r) => r.startedAt > now - 7 * DAY && r.status !== 'skipped');
  const failed = [...failedRuns(d.runs).values()][0];
  const failedName = failed && d.rules.find((r) => r.id === failed.ruleId)?.name;
  const wide = size !== 'small';
  const on = d.rules.filter((r) => r.enabled).length;
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = new Date(now - (6 - i) * DAY).setHours(0, 0, 0, 0);
    return week.filter((r) => r.startedAt >= start && r.startedAt < start + DAY).length;
  });
  const top = Math.max(1, ...days);
  const last = week.find((r) => r.status === 'ok');
  const label = d.rules.length ? plural(week.length, 'run') : 'None yet';
  const sub = !d.rules.length ? 'Set one up' : wide ? `${on} on · last 7 days` : 'last 7 days';
  const bottom = failed && failedName ? (wide ? `${failedName} stopped at step ${failedAt(failed) + 1}` : `${failedName} failed`) : null;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`Automations: ${label}, ${sub}`} onPress={() => router.push('/board/automation' as never)} style={({ pressed }) => ({ flex: wide ? undefined : 1, height: wide ? WIDE : undefined, borderRadius: 24, backgroundColor: t.c.bg.tile, padding: 16, justifyContent: 'space-between', opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.secondary }}>AUTOMATIONS</Text>
        <Dot color={LILAC} size={10} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexShrink: 1 }}>
          <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 30, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{label}</Text>
          <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, fontWeight: '500', marginTop: 2, color: t.c.fg.secondary }}>{sub}</Text>
        </View>
        {wide ? (
          <View accessible accessibilityRole="image" accessibilityLabel={`Runs per day: ${days.join(', ')}`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 48 }}>
            {days.map((n, i) => <View key={i} style={{ width: 12, height: Math.max(4, Math.round((n / top) * 48)), borderRadius: 4, backgroundColor: i === 6 ? t.c.accent.mustard : n === top && n > 0 ? LILAC : t.c.bg.tileRaised }} />)}
          </View>
        ) : null}
      </View>
      {bottom || (wide && last) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: wide ? 10 : 6 }}>
          {bottom ? <Dot color={t.c.alert.coralText} /> : null}
          <Text numberOfLines={1} style={{ flex: 1, fontSize: wide ? 13 : 12, lineHeight: wide ? 17 : 15, fontWeight: '600', color: bottom ? t.c.alert.coralText : t.c.fg.secondary }}>{bottom ?? last?.steps[last.steps.length - 1]?.line ?? ''}</Text>
          {bottom && wide && last ? <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, fontWeight: '600', color: t.c.fg.secondary }}>{last.steps[last.steps.length - 1]?.line ?? ''}</Text> : null}
        </View>
      ) : !wide ? (
        <View style={{ height: 15 }} />
      ) : null}
    </Pressable>
  );
}

/** The run button on Today: one tap runs the manual automation you ran last and opens its run. With none, Add a button. */
function RunTile({ size, ctx }: TileProps) {
  const router = useRouter();
  const t = useTheme();
  const report = useRunToast(ctx);
  const d = useLive((os) => ({ rules: os.automation.rules.all(), runs: os.automation.rules.runs(undefined, 200) }), []);
  const rule = byLastRun(d.rules.filter((r) => r.enabled && isManual(r)), d.runs)[0];
  const fit = size === 'small' ? { flex: 1 } : { height: WIDE };
  if (!rule) {
    return (
      <Pressable accessibilityRole="button" onPress={() => router.push(route('edit'))} style={({ pressed }) => ({ ...fit, borderRadius: 24, backgroundColor: t.c.bg.tile, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.bg.pressed, padding: 16, justifyContent: 'space-between', opacity: pressed ? 0.8 : 1 })}>
        <Disc icon="plus" color={t.c.accent.gold} size={36} iconSize={16} />
        <View>
          <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '600' }}>Add a button</Text>
          <Text style={{ fontSize: 12, lineHeight: 16, marginTop: 2, color: t.c.fg.secondary }}>Any automation with a manual run</Text>
        </View>
      </Pressable>
    );
  }
  const ink = t.c.fg.onAccent;
  const run = async () => {
    const r = await ctx.automation.runManual(rule);
    report(rule.name, r);
    router.push(route('run', { run: r.id }));
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Run ${rule.name}`} onPress={() => void run()} style={({ pressed }) => ({ ...fit, borderRadius: 24, backgroundColor: LILAC, padding: 16, justifyContent: 'space-between', opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: ink }}>RUN</Text>
        <IconButton icon="bolt" filled={ink} color={LILAC} size={40} accessibilityLabel={`Run ${rule.name}`} onPress={() => void run()} />
      </View>
      <View>
        <Text numberOfLines={2} style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.4, color: ink }}>{rule.name}</Text>
        {rule.lastRunAt ? <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', marginTop: 4, color: ink }}>{`Last ran ${shortAt(rule.lastRunAt)}`}</Text> : null}
      </View>
    </Pressable>
  );
}

export const automationTiles: TileDef[] = [
  { type: 'automations', board: 'automation', name: 'Automations', description: 'Runs in the last 7 days and what stopped', icon: 'bolt', sizes: ['small', 'medium'], defaultSize: 'small', component: AutomationsTile },
  { type: 'automation.run', board: 'automation', name: 'Run an automation', description: 'One tap on the manual automation you ran last', icon: 'bolt', sizes: ['small', 'medium'], defaultSize: 'small', component: RunTile },
];
