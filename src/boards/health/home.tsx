import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { compareMetric, dailyRange, formatMetric, isoDay, metricSeries, type MetricId } from '@core/dashboard/metrics';
import { sourceState } from '@core/sources/deviceData';
import { healthToday, latestMeasurement } from '@modules/health';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { gradients } from '@ui/theme/tokens';
import { Button, IconButton, Screen, Text } from '@ui/kit';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { Bars, Caps, Disc, Group, Head, MissingCard, Note, Panel, Pill, Row, RowValue, SecHead, Spark, StatCell, StatRow, changeTone, kindIcon, pageFor, toneInk } from './parts';
import { dayWords, hoursMinutes, splitValue, workoutLine, workoutRows } from './data';

/**
 * The Health & Fitness home (NR-Health-Home, NR-Health-Empty): today's three
 * numbers, the week's steps, last night's sleep, heart and weight (each opens
 * its own page, as does screen time), the last 10 days of workouts. Empty,
 * it says what to turn on; during the first sync it draws placeholders.
 */

const DAY = 86_400_000;
const NEW_WORKOUT = '/entity/workout/new';
const SOURCES = '/settings/sources';

const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '');
const percent = (c: number | null) => (c == null ? null : `${signed(c)}${Math.abs(Math.round(c * 100))}%`);
const known = (xs: Array<number | null>) => xs.filter((v): v is number => v != null);

function syncedWords(at: number | null, now: number) {
  if (!at) return 'Not connected yet';
  const when = isoDay(at) === isoDay(now) ? new Date(at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?[ap]m$/i, '') : dayWords(isoDay(at));
  return `From Health Connect · synced ${when}`;
}

export function HealthHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const go = (to: string) => () => router.push(to as never);
  const f = (id: MetricId, v: number) => formatMetric(id, v, ctx.format.currency);

  const d = useLive((os) => {
    const now = Date.now();
    const week = (id: MetricId) => metricSeries(os, id, 'week', now);
    const all = workoutRows(os);
    const since = isoDay(now - 9 * DAY);
    const health = sourceState(os, 'health');
    const usage = sourceState(os, 'usage');
    const screenWeek = week('screen');
    const stepsWeek = week('steps');
    const sleepWeek = week('sleep');
    const restingWeek = week('resting_hr');
    const rateWeek = week('heart_rate');
    const weight = latestMeasurement(os, 'weight');
    return {
      now,
      today: healthToday(os, now),
      health,
      usage,
      steps: stepsWeek,
      stepsChange: compareMetric(os, 'steps', now).vsLast,
      sleep: sleepWeek,
      sleepCmp: compareMetric(os, 'sleep', now),
      resting: restingWeek,
      restingCmp: compareMetric(os, 'resting_hr', now),
      rate: rateWeek,
      screen: screenWeek,
      weight,
      weightLine: known(dailyRange(os, 'weight', 30, now).map((x) => x.value)),
      recent: all.filter((w) => w.date >= since),
      workouts: all.length,
      any: !!weight || all.length > 0 || [stepsWeek, sleepWeek, restingWeek, rateWeek, screenWeek].some((s) => s.daysWithData > 0) || os.records.count('measurement') > 0,
    };
  }, []);

  const addButton = <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel="Add workout" onPress={go(NEW_WORKOUT)} />;

  if (!d.any) {
    const firstSync = d.health.enabled && !d.health.lastSync && !d.health.error;
    return (
      <Screen contentStyle={{ gap: 24 }}>
        <Head dot sub={firstSync ? 'Reading from Health Connect' : 'Not connected yet'} title="Health & Fitness" right={addButton} />
        {firstSync ? <FirstSync /> : <EmptyHero onSources={go(SOURCES)} />}
        <View style={{ gap: 10 }}>
          <SecHead title="What it reads" sub="Each becomes a Measurement or a Workout" />
          <Group>
            <Row lead={<Disc icon="phone" color={gradients.health[0]} />} title="Health Connect" sub={<Text variant="caption" color="secondary">Steps, sleep, heart rate, weight and workouts from your watch or fitness app.</Text>} right={<Pill small label={d.health.enabled ? 'On' : 'Off'} tone={d.health.enabled ? 'good' : 'neutral'} />} onPress={go(SOURCES)} label="Health Connect, data sources" />
            <Row lead={<Disc icon="clock" color={gradients.health[0]} />} title="Usage access" sub={<Text variant="caption" color="secondary">Screen time a day, with the apps it went to.</Text>} right={<Pill small label={d.usage.enabled ? 'On' : 'Off'} tone={d.usage.enabled ? 'good' : 'neutral'} />} onPress={go(SOURCES)} label="Usage access, data sources" />
          </Group>
          <Note icon="lock">Readings are read on this phone and kept on it. No model looks at them and none go to To check: a reading becomes a record as it is.</Note>
        </View>
        <View style={{ padding: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text variant="caption" color="secondary" style={{ flex: 1, lineHeight: 18 }}>No workouts yet. They come in from Health Connect, or add one.</Text>
          <AddWorkout onPress={go(NEW_WORKOUT)} />
        </View>
      </Screen>
    );
  }

  const r = d.today.restingHr;
  const stepsHas = d.steps.daysWithData > 0;
  const sleepHas = d.sleep.daysWithData > 0;
  const stepsChip = percent(d.stepsChange);
  const sleepGap = d.sleepCmp.thisWeek != null && d.sleepCmp.lastWeek != null ? Math.round((d.sleepCmp.thisWeek - d.sleepCmp.lastWeek) * 60) : null;
  const restGap = d.restingCmp.thisWeek != null && d.restingCmp.lastWeek != null ? Math.round(d.restingCmp.thisWeek - d.restingCmp.lastWeek) : null;
  const lilac = t.tints.tasks.ink;
  const coral = t.c.alert.coralText;
  const quietSpark = t.c.fg.secondary;
  const restTone = changeTone(restGap, 'down');
  const restLine = known(d.resting.buckets.map((b) => b.value));
  const rateLine = known(d.rate.buckets.map((b) => b.value));
  const screenLine = known(d.screen.buckets.map((b) => b.value));
  const screenToday = d.today.screenHours;
  const rec = d.recent;

  return (
    <Screen contentStyle={{ gap: 24 }}>
      <Head dot sub={syncedWords(d.health.lastSync, d.now)} title="Health & Fitness" onTitlePress={go(SOURCES)} right={<><ToCheckBell />{addButton}</>} />

      <StatRow>
        <StatCell label="STEPS" value={d.today.steps != null ? f('steps', d.today.steps) : 'Not yet'} sub="today so far" dim={d.today.steps == null} />
        <StatCell label="SLEPT" value={d.today.sleep != null ? f('sleep', d.today.sleep) : 'Not yet'} sub="last night" dim={d.today.sleep == null} />
        <StatCell label="RESTING HR" value={r != null ? String(Math.round(r)) : 'Not yet'} unit={r != null ? 'bpm' : null} sub="today" dim={r == null} />
      </StatRow>

      <View style={{ gap: 10 }}>
        <SecHead title="Steps" sub="Last 7 days · today in lime" action="Chart" chevron onAction={go('/module/health/steps')} />
        {stepsHas ? (
          <Panel onPress={go('/module/health/steps')} label={`Steps this week, ${f('steps', d.steps.value ?? 0)}`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text variant="tileTitle">This week</Text>
                <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '500' }}>vs the 7 days before</Text>
              </View>
              {stepsChip ? <Pill label={stepsChip} tone={changeTone(d.stepsChange, 'up')} /> : null}
            </View>
            <BigNumber value={f('steps', d.steps.value ?? 0)} unit="steps" size={36} />
            <Bars values={d.steps.buckets.map((b) => b.value)} labels={d.steps.buckets.map((b) => b.label)} lit={d.steps.buckets.length - 1} dot labelSize={11} label="Steps, last 7 days" />
          </Panel>
        ) : (
          <MissingCard page={pageFor('steps')} />
        )}
      </View>

      <View style={{ gap: 10 }}>
        <SecHead title="Sleep" sub="Last 7 nights" action="Chart" chevron onAction={go('/module/health/sleep')} />
        {sleepHas ? (
          <Panel onPress={go('/module/health/sleep')} label={`Sleep, last night ${d.today.sleep != null ? f('sleep', d.today.sleep) : 'not yet'}`}>
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Disc icon="moon" size={32} color={lilac} />
                <Text color="secondary" numberOfLines={1} style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '500' }}>
                  {d.sleepCmp.thisWeek != null ? `weekly average ${f('sleep', d.sleepCmp.thisWeek)}` : 'last night'}
                </Text>
              </View>
              <BigNumber value={d.today.sleep != null ? f('sleep', d.today.sleep) : 'Not yet'} size={36} />
              {sleepGap != null ? <Pill label={`${signed(sleepGap)}${Math.abs(sleepGap)} min · weekly average vs last`} tone={changeTone(sleepGap, 'up')} style={{ alignSelf: 'flex-start' }} /> : null}
            </View>
            <Bars values={d.sleep.buckets.map((b) => b.value)} labels={d.sleep.buckets.map((b) => b.label)} lit={d.sleep.buckets.length - 1} height={92} litColor={lilac} barColor={`${lilac}47`} labelSize={11} label="Sleep, last 7 nights" />
          </Panel>
        ) : (
          <MissingCard page={pageFor('sleep')} />
        )}
      </View>

      <View style={{ gap: 10 }}>
        <SecHead title="Heart, weight and screen time" sub="Each opens its own chart" />
        <Group>
          <Row
            lead={<Disc icon="heart" color={coral} />}
            title="Resting heart rate"
            sub={restGap != null ? `${signed(restGap)}${Math.abs(restGap)} bpm · weekly average vs last` : restLine.length ? 'weekly average' : 'nothing yet'}
            subColor={restGap ? toneInk(t, restTone) : undefined}
            right={<>{r != null ? <RowValue>{f('resting_hr', r)}</RowValue> : null}<Spark values={restLine} color={restTone === 'neutral' ? quietSpark : toneInk(t, restTone)} /></>}
            onPress={go('/module/health/heart')}
          />
          <Row
            lead={<Disc icon="activity" color={coral} />}
            title="Heart rate"
            sub={d.today.heartRate != null ? 'today, average' : rateLine.length ? 'none today' : 'nothing yet'}
            right={<>{d.today.heartRate != null ? <RowValue>{f('heart_rate', d.today.heartRate)}</RowValue> : null}<Spark values={rateLine} color={quietSpark} dotColor={t.c.fg.primary} /></>}
            onPress={go('/module/health/heart')}
          />
          <Row
            lead={<Disc icon="scale" color={gradients.health[0]} />}
            title="Weight"
            sub={d.weight ? `latest · ${dayWords(d.weight.data.date)}` : 'nothing yet'}
            right={<>{d.weight ? <RowValue>{f('weight', d.weight.data.value)}</RowValue> : null}<Spark values={d.weightLine} color={quietSpark} dotColor={t.c.fg.primary} /></>}
            onPress={go('/module/health/weight')}
          />
          <Row
            lead={<Disc icon="signal" color={lilac} />}
            title="Screen time"
            sub={screenToday != null ? 'today' : screenLine.length ? 'none today' : 'nothing yet'}
            right={<>{screenToday != null ? <RowValue>{f('screen', screenToday)}</RowValue> : null}<Spark values={screenLine} color={quietSpark} dotColor={t.c.fg.primary} /></>}
            onPress={go('/module/health/screen')}
          />
        </Group>
      </View>

      <View style={{ gap: 10 }}>
        <SecHead title="Workouts" sub={rec.length ? `Last 10 days · ${rec.length} ${rec.length === 1 ? 'session' : 'sessions'} · ${hoursMinutes(rec.reduce((a, w) => a + w.minutes, 0))}` : 'Last 10 days'} action={d.workouts ? `All ${d.workouts}` : undefined} chevron onAction={go('/module/health/workouts')} />
        {rec.length ? (
          <Group>
            {rec.slice(0, 4).map((w) => (
              <Row key={w.id} minHeight={56} lead={<Disc icon={kindIcon(w.kind)} color={t.c.accent.mustard} />} title={w.title} sub={workoutLine(w, true)} right={<RowValue>{w.minutes} min</RowValue>} onPress={go(`/entity/workout/${w.id}`)} />
            ))}
          </Group>
        ) : (
          <View style={{ padding: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text variant="caption" color="secondary" style={{ flex: 1, lineHeight: 18 }}>{d.workouts ? 'None in the last 10 days. They come in from Health Connect, or add one.' : 'No workouts yet. They come in from Health Connect, or add one.'}</Text>
            <AddWorkout onPress={go(NEW_WORKOUT)} />
          </View>
        )}
      </View>

      <Note icon="lock">Read from Health Connect on this phone and kept here. Re-syncing updates a reading, never doubles it.</Note>
    </Screen>
  );
}

/** A big number with its unit beside it. */
function BigNumber({ value, unit, size }: { value: string; unit?: string; size: number }) {
  const s = unit ? { num: value, unit } : splitValue(value);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: size, lineHeight: size + 1, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'], flexShrink: 1 }}>{s.num}</Text>
      {s.unit ? <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{s.unit}</Text> : null}
    </View>
  );
}

function AddWorkout({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Add workout" hitSlop={2} onPress={onPress} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Text variant="label" numberOfLines={1}>Add workout</Text>
    </Pressable>
  );
}

function EmptyHero({ onSources }: { onSources: () => void }) {
  const t = useTheme();
  return (
    <View style={{ paddingTop: 22, paddingHorizontal: 18, paddingBottom: 18, borderRadius: t.radius.tile, backgroundColor: t.c.bg.tile, alignItems: 'center', gap: 10 }}>
      <Disc icon="heart" size={56} color={t.c.accent.mustard} />
      <Text variant="heading" style={{ textAlign: 'center' }}>Nothing from Health Connect yet</Text>
      <Text variant="caption" color="secondary" style={{ textAlign: 'center', lineHeight: 18, maxWidth: 290 }}>Turn on Health Connect in Data sources, and make sure Samsung Health (or your watch’s app) shares its data with Health Connect.</Text>
      <Button title="Data sources" icon="signal" size="sm" onPress={onSources} style={{ alignSelf: 'center', marginTop: 6 }} />
    </View>
  );
}

/** The first sync's placeholders: nothing here is a number. */
function FirstSync() {
  const t = useTheme();
  const slab = t.c.bg.tileRaised;
  const block = (width: number | `${number}%`, height: number, radius: number) => <View style={{ width, height, borderRadius: radius, backgroundColor: slab }} />;
  return (
    <View style={{ gap: 10 }} accessibilityState={{ busy: true }} accessibilityLabel="Reading from Health Connect">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
        <Caps>FIRST SYNC</Caps>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <ActivityIndicator size="small" color={t.c.accent.mustard} />
          <Text variant="labelMicro" color="secondary">Reading from Health Connect</Text>
        </View>
      </View>
      <View style={{ padding: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, flexDirection: 'row', gap: 12 }}>
        {[72, 72, 56].map((w, i) => (
          <View key={i} style={{ flex: 1, gap: 8 }}>
            {block(44, 10, 5)}
            {block(w, 22, 8)}
          </View>
        ))}
      </View>
      <View style={{ padding: 18, borderRadius: t.radius.tile, backgroundColor: t.c.bg.tile, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 8 }}>
            {block(90, 14, 7)}
            {block(140, 30, 10)}
          </View>
          {block(56, 28, 14)}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 110 }}>
          {[60, 82, 50, 96, 48, 72, 68].map((h, i) => (
            <View key={i} style={{ flex: 1, height: `${h}%`, borderRadius: 10, backgroundColor: slab }} />
          ))}
        </View>
      </View>
    </View>
  );
}
