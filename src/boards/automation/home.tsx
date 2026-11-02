import React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { MANUAL_TRIGGER } from '@core/automation/engine';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { EmptyState, IconButton, RowItem, RowList, Screen, Section, Text, Toggle } from '@ui/kit';
import { RunRow, TINT, route, triggerWords, useRunNow } from './parts';

/**
 * The Automations home (the board's index; a first pass from the kit until
 * NR-Automations-Home): Run by hand (a button per manual rule), Rules (on /
 * off), Templates, Recent runs (skipped ones only counted), Reminders.
 */
export function AutomationsHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const runNow = useRunNow(ctx);
  const d = useLive((os) => {
    const rules = os.automation.rules.all();
    const runs = os.automation.rules.runs(undefined, 60);
    return { rules, runs: runs.filter((r) => r.status !== 'skipped').slice(0, 12), skipped: runs.filter((r) => r.status === 'skipped').length, templates: os.automation.templates() };
  }, []);
  const manual = d.rules.filter((r) => r.enabled && r.trigger.id === MANUAL_TRIGGER);
  const on = d.rules.filter((r) => r.enabled).length;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/browse' as never));
  const right = <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel="New automation" onPress={() => router.push(route('edit'))} />;

  return (
    <Screen title="Automations" subtitle={d.rules.length ? `${d.rules.length} rules · ${on} on` : 'What LifeOS does on its own'} onBack={back} right={right} contentStyle={{ gap: 14 }}>
      {manual.length ? (
        <Section title="Run by hand" meta="or say “run …” in Talk">
          <RowList>
            {manual.map((r) => (
              <RowItem key={r.id} icon="bolt" tint={TINT} title={r.name} subtitle={`${r.steps.length} step${r.steps.length === 1 ? '' : 's'}`} doneLabel="Run" onDone={() => void runNow(r)} onPress={() => router.push(route('rule', { rule: r.id }))} />
            ))}
          </RowList>
        </Section>
      ) : null}

      <Section title="Rules" action="New" onAction={() => router.push(route('edit'))}>
        {d.rules.length ? (
          <RowList>
            {d.rules.map((r) => (
              <RowItem
                key={r.id}
                icon="bolt"
                tint={TINT}
                iconTone={r.enabled ? undefined : 'plain'}
                title={r.name}
                subtitle={`${triggerWords(ctx, r)} · ${r.steps.length} step${r.steps.length === 1 ? '' : 's'}`}
                meta={r.runCount ? `ran ${r.runCount}×` : null}
                trailing={<Toggle value={r.enabled} onChange={(v) => ctx.automation.rules.setEnabled(r.id, v)} accessibilityLabel={`${r.name} on`} />}
                onPress={() => router.push(route('rule', { rule: r.id }))}
              />
            ))}
          </RowList>
        ) : (
          <EmptyState bare icon="bolt" tint={TINT} title="No automations yet" line="Start from a template below, or make one: when something happens, do a few steps in order." />
        )}
      </Section>

      <Section title="Templates" meta="nothing runs until you save">
        <RowList>
          {d.templates.map((x) => (
            <RowItem key={x.id} icon="sparkle" tint={TINT} title={x.name} subtitle={x.description} onPress={() => router.push(route('edit', { template: x.id }))} />
          ))}
        </RowList>
      </Section>

      <Section title="Recent runs" meta={d.skipped ? `${d.skipped} skipped` : undefined}>
        {d.runs.length ? (
          <RowList>{d.runs.map((run) => <RunRow key={run.id} ctx={ctx} run={run} name />)}</RowList>
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, paddingHorizontal: 4 }}>Nothing has run yet.</Text>
        )}
      </Section>

      <RowList>
        <RowItem icon="bell" tint={TINT} title="Reminders" subtitle="Everything scheduled" onPress={() => router.push('/reminders' as never)} />
      </RowList>
      <View style={{ height: 8 }} />
    </Screen>
  );
}
