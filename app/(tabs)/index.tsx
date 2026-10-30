import React, { useEffect, useState } from 'react';
import { InteractionManager, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { upkeep, type Upkeep } from '@core/cycles/upkeep';
import { onThisDay } from '@core/almanac/almanac';
import { METRICS, formatMetric, metricSeries, screenTopApps, spendPace, upcoming, type MetricId } from '@core/dashboard/metrics';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { IconName } from '@ui/icons';
import { BentoGrid, Button, DeltaChip, Icon, IconButton, LineChart, MiniBars, NumberField, Ring, RowItem, RowList, Screen, Sheet, Stat, Text, Tile } from '@ui/kit';
import type { TintKey } from '@ui/theme/tokens';
import { ToCheckBell } from '../../src/screens/ToCheckBell';
import { TILES, homeLayout, homeAreas, tileStyle, type TileId } from '../../src/screens/homeLayout';
import { doneToday, myDay, progress, setGoal, type DayItem, type GoalId, type Progress } from '@core/dashboard/day';
import { tintForModule } from '@ui/theme/moduleTint';
import { activeHabits } from '@core/habits/habits';
import { trackerSummary, trackers } from '@core/activity/trackers';
import { ActivityRow } from '../../src/screens/ActivityGrid';
import { HabitChecklist, HabitWeek } from '@boards/habits';
import { TurfTodayTile } from '@boards/turf/today';
import { PeopleTodayTile } from '@boards/crm/tile';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const SOURCE_NAME = { health: 'Health Connect', usage: 'Screen time', money: 'Bank SMS' } as const;
const METRIC_LOOK: Partial<Record<MetricId, { icon: IconName; tint: TintKey }>> = {
  steps: { icon: 'shoe', tint: 'health' },
  sleep: { icon: 'moon', tint: 'memory' },
  screen: { icon: 'signal', tint: 'tasks' },
  spend: { icon: 'wallet', tint: 'finance' },
};

const fmtHours = (h: number) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;

/**
 * Today (PRODUCT v4 §1.1, M4.3): a dashboard of real data about you — steps,
 * sleep, screen time, spend pace, what's coming up, who to call. Every tile
 * opens a full chart. No placeholder numbers: a tile without data names the
 * source to turn on.
 */
export default function TodayTab() {
  const router = useRouter();
  const os = useOS();
  // Your layout (You › Home screen); re-read whenever settings change.
  const layout = useLive((o) => homeLayout(o), []);
  // Cold start: the first screenful now, the rest once it's on screen.
  const [rest, setRest] = useState(false);
  useEffect(() => {
    const h = InteractionManager.runAfterInteractions(() => setRest(true));
    return () => h.cancel();
  }, []);
  const shown = layout.filter((x) => !x.hidden);
  // One upkeep pass for every tile that needs it (Upcoming, People, Overdue).
  const u = useLive((o) => upkeep(o), []);

  // Pair 1×1 tiles into rows; wide tiles take a row of their own.
  const rows: TileId[][] = [];
  for (const { id } of shown) {
    const last = rows[rows.length - 1];
    if (!TILES[id].wide && last && last.length === 1 && !TILES[last[0]!].wide) last.push(id);
    else rows.push([id]);
  }

  return (
    <Screen
      tab
      compact
      title={greeting()}
      subtitle={format(new Date(), 'EEEE d MMM')}
      right={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <ToCheckBell />
          <IconButton icon="user-circle" accessibilityLabel="You" filled onPress={() => router.navigate('/you')} />
        </View>
      }
    >
      {(rest ? rows : rows.slice(0, 3)).map((r) => (r.length === 2 ? <BentoGrid key={r.join()}>{r.map((id) => <TodayTile key={id} id={id} u={u} />)}</BentoGrid> : <TodayTile key={r[0]} id={r[0]!} u={u} alone />))}
      <Pressable accessibilityRole="button" onPress={() => router.push('/settings/home' as never)} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 }}>
        <Icon name="edit" size={14} />
        <Text variant="caption" color="secondary">Choose what’s on Today</Text>
      </Pressable>
    </Screen>
  );
}

/** `alone`: the tile has the row to itself (a 1×1 whose neighbour is wide), so People draws its wide 4 × 2. */
function TodayTile({ id, u, alone }: { id: TileId; u: Upkeep; alone?: boolean }) {
  switch (id) {
    case 'steps':
    case 'sleep':
      return <MetricTile id={id} />;
    case 'screen':
      return <ScreenTile />;
    case 'spend':
      return <SpendTile />;
    case 'upcoming':
      return <UpcomingTile u={u} />;
    case 'people':
      return <PeopleTodayTile wide={alone} />;
    case 'overdue':
      return <OverdueTile u={u} />;
    case 'onthisday':
      return <OnThisDayTile />;
    case 'myday':
      return <MyDayTile u={u} />;
    case 'turf':
      return <TurfTodayTile />;
    case 'done':
      return <DoneTile />;
    case 'progress':
      return <ProgressTile />;
    case 'areas':
      return <AreasTile />;
    case 'habits':
      return <HabitsTile />;
    case 'activity':
      return <ActivityTile />;
  }
}

/** No data for this metric: name the source to turn on (never a fake zero). */
function NeedsSource({ id }: { id: MetricId }) {
  const router = useRouter();
  const src = METRICS[id].source;
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/settings/sources' as never)} style={{ gap: 4 }}>
      <Text variant="caption" color="secondary">No {METRICS[id].label.toLowerCase()} yet.</Text>
      <Text variant="label" color="primary">Turn on {SOURCE_NAME[src]} ›</Text>
    </Pressable>
  );
}

function MetricTile({ id }: { id: MetricId }) {
  const router = useRouter();
  const t = useTheme();
  const os = useOS();
  const s = useLive((o) => metricSeries(o, id, 'day'), [id]);
  const look = METRIC_LOOK[id]!;
  const has = s.buckets.some((b) => b.value != null);
  return (
    <Tile tint={look.tint} icon={look.icon} label={METRICS[id].label} meta={id === 'sleep' ? 'last night' : 'today'} onPress={() => router.push(`/metric/${id}` as never)}>
      {has ? (
        <View style={{ gap: 6 }}>
          <Stat value={s.value != null ? formatMetric(id, s.value, os.format.currency) : '—'} size="count" />
          <DeltaChip change={s.change} better={METRICS[id].better} vs="vs yesterday" />
          <MiniBars values={s.buckets.map((b) => b.value)} color={t.tints[look.tint].ink} accessibilityLabel={`${METRICS[id].label}, last 7 days`} />
        </View>
      ) : (
        <NeedsSource id={id} />
      )}
    </Tile>
  );
}

function ScreenTile() {
  const router = useRouter();
  const t = useTheme();
  const os = useOS();
  const s = useLive((o) => metricSeries(o, 'screen', 'day'), []);
  const apps = useLive((o) => screenTopApps(o, 'day', Date.now(), 3), []);
  const has = s.buckets.some((b) => b.value != null);
  return (
    <Tile size="2x1" tint="tasks" icon="signal" label="Screen time" meta="today" onPress={() => router.push('/metric/screen' as never)}>
      {has ? (
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-end' }}>
          <View style={{ flex: 1, gap: 6 }}>
            <Stat value={s.value != null ? formatMetric('screen', s.value, os.format.currency) : '—'} size="count" />
            <DeltaChip change={s.change} better="down" vs="vs yesterday" />
            {apps.map((a) => (
              <Text key={a.package} variant="caption" color="secondary" numberOfLines={1}>
                {a.label} · {fmtHours(a.ms / 3_600_000)}
              </Text>
            ))}
          </View>
          <View style={{ width: '42%' }}>
            <MiniBars values={s.buckets.map((b) => b.value)} color={t.tints.tasks.ink} height={70} accessibilityLabel="Screen time, last 7 days" />
          </View>
        </View>
      ) : (
        <NeedsSource id="screen" />
      )}
    </Tile>
  );
}

function SpendTile() {
  const router = useRouter();
  const t = useTheme();
  const os = useOS();
  const p = useLive((o) => (o.registry.objects.has('transaction') ? spendPace(o) : null), []);
  if (!p) return null;
  const diff = p.usualByToday != null ? p.spent - p.usualByToday : null;
  // Noir: an orange colour block, black ink (NR-Today · "SPENT · SEP").
  const ink = t.dark ? t.c.bg.ground : t.tints.finance.ink;
  const series = [{ label: 'This month', color: ink, values: p.thisMonth }, ...(p.usual.length ? [{ label: 'Usual', color: t.dark ? `${ink}6B` : t.c.fg.tertiary, values: p.usual.slice(0, 31), dashed: true }] : [])];
  return (
    <Tile size="2x1" tint="finance" icon="wallet" filled={t.dark} caps={t.dark} label={t.dark ? `Spent · ${format(new Date(), 'MMM')}` : 'Spend this month'} meta={t.dark ? undefined : format(new Date(), 'MMM')} onPress={() => router.push('/spend' as never)}>
      {p.spent || p.usual.length ? (
        <View style={{ gap: 8 }}>
          {t.dark && diff != null ? (
            // On the colour block the number stays black; over / under usual is a black pill (lime under, coral over).
            <View style={{ alignSelf: 'flex-start', height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: t.c.bg.ground }}>
              <Text variant="labelMicro" color={diff > 0 ? t.c.alert.coral : t.c.accent.mustard}>
                {`${diff > 0 ? '+' : '−'}${os.format.currency(Math.abs(diff))} vs usual`}
              </Text>
            </View>
          ) : null}
          <Stat value={os.format.currency(p.spent)} size="count" caption={diff == null ? 'Your usual month shows after a month of data' : `${os.format.currency(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than usual by today${p.usualMonth ? ` · usual month ${os.format.currency(p.usualMonth)}` : ''}`} tone={!t.dark && diff != null && diff > 0 ? 'alert' : undefined} />
          <LineChart series={series} labels={Array.from({ length: Math.max(p.thisMonth.length, p.usual.length ? 31 : 0) }, (_, i) => (i % 7 === 0 ? String(i + 1) : ''))} height={90} minZero formatY={(n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)))} accessibilityLabel="Spend this month vs your usual month" />
        </View>
      ) : (
        <NeedsSource id="spend" />
      )}
    </Tile>
  );
}

function UpcomingTile({ u }: { u: Upkeep }) {
  const router = useRouter();
  const items = useLive((o) => upcoming(o, 5, Date.now(), 14, u), [u]);
  return (
    <Tile size="2x1" tint="upkeep" icon="calendar" label="Upcoming" meta="next 2 weeks" onPress={() => router.navigate('/upkeep')}>
      {items.length ? (
        <RowList>
          {items.map((i) => (
            <RowItem key={i.id} icon={i.kind === 'event' ? 'calendar' : i.kind === 'delivery' ? 'box' : 'repeat'} tint={i.kind === 'event' ? 'tasks' : 'upkeep'} title={i.title} value={i.overdue ? 'Late' : relDay(i.at)} valueTone={i.overdue ? 'alert' : 'secondary'} onPress={() => router.push(`/entity/${i.type}/${i.entityId}` as never)} />
          ))}
        </RowList>
      ) : (
        <Text variant="caption" color="secondary">Nothing due or planned in the next two weeks.</Text>
      )}
    </Tile>
  );
}

/** What happened on this date a month, six months and years ago — only when there's something. */
function OnThisDayTile() {
  const router = useRouter();
  const days = useLive((o) => onThisDay(o), []);
  if (!days.length) return null;
  const open = (i: (typeof days)[number]['items'][number]) => router.push((i.kind === 'dump' ? `/dump/${i.id}` : `/entity/${i.type}/${i.id}`) as never);
  return (
    <Tile size="2x1" tint="memory" icon="history" label="On this day" onPress={() => router.push({ pathname: '/almanac/time', params: { span: 'day', day: days[0]!.day } } as never)}>
      <RowList>
        {days.slice(0, 3).flatMap((d) =>
          d.items.slice(0, 2).map((i) => (
            <RowItem key={`${d.day}-${i.kind}-${i.id}`} icon={ON_THIS_DAY_ICON[i.kind]} tint="memory" title={i.title} value={d.ago} valueTone="secondary" onPress={() => open(i)} />
          )),
        )}
      </RowList>
    </Tile>
  );
}
const ON_THIS_DAY_ICON = { dump: 'brain', event: 'calendar', trip: 'plane', person: 'user', done: 'repeat', fact: 'sparkle' } as const;

function OverdueTile({ u }: { u: Upkeep }) {
  const router = useRouter();
  return (
    <Tile iconTone="alert" icon="alert" label="Overdue" onPress={() => router.navigate('/upkeep')}>
      <Stat value={String(u.overdue)} size="count" tone={u.overdue ? 'alert' : undefined} caption={u.overdue ? u.sections.overdue[0]!.entity.title + (u.overdue > 1 ? ` + ${u.overdue - 1} more` : '') : 'Nothing late'} />
    </Tile>
  );
}

function relDay(at: number): string {
  const d = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 7 ? format(at, 'EEE') : format(at, 'd MMM');
}

/* ------------------------------------------------------------------ */
/* At a glance: my day, done today, progress, areas                    */
/* ------------------------------------------------------------------ */

const DAY_ICON: Record<DayItem['kind'], IconName> = { event: 'calendar', task: 'check-circle', due: 'repeat', delivery: 'box', reminder: 'bell', bill: 'receipt' };

/** Today in time order: all-day things first, then the timed ones, a line at now. */
function MyDayTile({ u }: { u: Upkeep }) {
  const router = useRouter();
  const t = useTheme();
  const items = useLive((o) => myDay(o, Date.now(), u), [u]);
  const now = Date.now();
  const firstLater = items.findIndex((i) => !i.allDay && i.at > now);
  const shown = items.slice(0, 9);
  return (
    <Tile size="2x1" tint="tasks" icon="calendar" label="My day" meta={items.length ? `${items.filter((i) => !i.done).length} left` : undefined}>
      {shown.length ? (
        <View style={{ gap: 2 }}>
          {shown.map((i, k) => (
            <React.Fragment key={i.id}>
              {k === firstLater ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginVertical: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.c.alert.coral }} />
                  <View style={{ flex: 1, height: 1.5, backgroundColor: t.c.alert.coral }} />
                  <Text variant="labelMicro" color={t.c.alert.coralText}>{format(now, 'h:mm a')}</Text>
                </View>
              ) : null}
              {t.dark ? (
                // Noir checklist (NR-Today): a 26 tick, title 16/600 over where, the time as a quiet pill; hairlines between.
                <Pressable accessibilityRole="button" disabled={!i.entityId} onPress={() => i.entityId && router.push(`/entity/${i.type}/${i.entityId}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, borderTopWidth: k === 0 || k === firstLater ? 0 : 1, borderTopColor: t.c.line }}>
                  {i.done ? (
                    <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.c.ok.sage, alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="check" size={15} strokeWidth={3} color={t.c.ok.sageInk} />
                    </View>
                  ) : (
                    <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: i.late ? t.c.alert.coral : '#F5F5F738', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={DAY_ICON[i.kind]} size={13} color={i.late ? t.c.alert.coralText : t.c.fg.tertiary} />
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0, gap: 2, opacity: i.done ? 0.4 : 1 }}>
                    <Text variant="rowTitle" numberOfLines={1}>{i.title}</Text>
                    {i.sub ? <Text variant="caption" color={i.late ? t.c.alert.coralText : 'secondary'} numberOfLines={1}>{i.sub}</Text> : null}
                  </View>
                  <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, justifyContent: 'center', backgroundColor: i.late ? t.c.alert.coralFill : t.c.bg.dim }}>
                    <Text variant="labelMicro" color={i.late ? t.c.alert.coralText : 'secondary'} style={{ fontVariant: ['tabular-nums'] }}>{i.late ? 'late' : i.allDay ? 'today' : format(i.at, 'h:mm a')}</Text>
                  </View>
                </Pressable>
              ) : (
                <Pressable accessibilityRole="button" disabled={!i.entityId} onPress={() => i.entityId && router.push(`/entity/${i.type}/${i.entityId}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, opacity: i.done ? 0.5 : 1 }}>
                  <Text variant="caption" color="secondary" style={{ width: 54, fontVariant: ['tabular-nums'] }}>{i.allDay ? 'Today' : format(i.at, 'h:mm a')}</Text>
                  <Icon name={DAY_ICON[i.kind]} size={16} color={i.late ? t.c.alert.coralText : t.c.fg.secondary} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="label" numberOfLines={1} style={i.done ? { textDecorationLine: 'line-through' } : undefined}>{i.title}</Text>
                    {i.sub ? <Text variant="caption" color={i.late ? t.c.alert.coralText : 'secondary'} numberOfLines={1}>{i.sub}</Text> : null}
                  </View>
                </Pressable>
              )}
            </React.Fragment>
          ))}
          {items.length > shown.length ? <Text variant="caption" color="secondary">+ {items.length - shown.length} more</Text> : null}
        </View>
      ) : (
        <Text variant="caption" color="secondary">Nothing on today — no events, tasks or things due.</Text>
      )}
    </Tile>
  );
}

/** What you've done so far today: money, body, habits, tasks, upkeep, dumps. */
function DoneTile() {
  const os = useOS();
  const d = useLive((o) => doneToday(o), []);
  const parts: Array<[IconName, string, string]> = [
    ['wallet', os.format.currency(d.spent), d.payments ? `spent · ${d.payments} payment${d.payments === 1 ? '' : 's'}` : 'spent'],
    ...(d.received ? ([['cash', os.format.currency(d.received), 'came in']] as Array<[IconName, string, string]>) : []),
    ...(d.steps != null ? ([['shoe', Math.round(d.steps).toLocaleString('en-IN'), 'steps']] as Array<[IconName, string, string]>) : []),
    ...(d.workouts ? ([['activity', `${d.workouts}`, `workout${d.workouts === 1 ? '' : 's'} · ${Math.round(d.workoutMin)} min`]] as Array<[IconName, string, string]>) : []),
    ...(d.habitsDone ? ([['flame', `${d.habitsDone}`, `habit${d.habitsDone === 1 ? '' : 's'} ticked`]] as Array<[IconName, string, string]>) : []),
    ...(d.tasksDone ? ([['check-circle', `${d.tasksDone}`, `task${d.tasksDone === 1 ? '' : 's'} done`]] as Array<[IconName, string, string]>) : []),
    ...(d.upkeepDone ? ([['repeat', `${d.upkeepDone}`, 'upkeep done']] as Array<[IconName, string, string]>) : []),
    ...(d.dumps ? ([['brain', `${d.dumps}`, `dump${d.dumps === 1 ? '' : 's'}`]] as Array<[IconName, string, string]>) : []),
  ];
  const t = useTheme();
  return (
    <Tile size="2x1" tint="upkeep" icon="check" label="Done today">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, columnGap: 10 }}>
        {parts.map(([icon, value, label]) => (
          <View key={label} style={{ flexBasis: '46%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name={icon} size={16} color={t.c.fg.secondary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="rowTitle" numberOfLines={1}>{value}</Text>
              <Text variant="caption" color="secondary" numberOfLines={1}>{label}</Text>
            </View>
          </View>
        ))}
      </View>
    </Tile>
  );
}

const RING_LOOK: Record<string, { icon: IconName; tint: TintKey; route?: string }> = {
  steps: { icon: 'shoe', tint: 'health' },
  sleep: { icon: 'moon', tint: 'memory' },
  screen: { icon: 'signal', tint: 'tasks' },
  habits: { icon: 'flame', tint: 'health', route: '/module/habits' },
  tasks: { icon: 'check-circle', tint: 'tasks', route: '/module/projects' },
  spend: { icon: 'wallet', tint: 'finance' },
};

/** Rings against goals learned from your last 30 days; tap one to set your own goal. */
function ProgressTile() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const rings = useLive((o) => progress(o), []);
  const [editing, setEditing] = useState<Progress | null>(null);
  const [value, setValue] = useState<number | undefined>(undefined);
  const fmt = (p: Progress, v: number) => (p.id === 'spend' ? os.format.currency(v) : p.unit === 'h' ? fmtHours(v) : Math.round(v).toLocaleString('en-IN'));
  const style = useLive((o) => tileStyle(o, 'progress'), []);
  if (!rings.length) return null;
  const tap = (p: Progress) => {
    const look = RING_LOOK[p.id];
    if (look?.route) router.push(look.route as never);
    else (setEditing(p), setValue(p.target ?? undefined));
  };
  return (
    <Tile size="2x1" tint="health" icon="target" label="Progress" meta="vs your goals">
      {style === 'rings' ? (
        // Rings side by side; more than fit scroll sideways, so there are never gaps.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 18, paddingRight: 4 }}>
          {rings.map((p) => {
            const look = RING_LOOK[p.id] ?? { icon: 'target', tint: 'tasks' as TintKey };
            const color = p.better === 'down' && (p.ratio ?? 0) > 1 ? t.c.alert.coral : t.tints[look.tint].ink;
            return (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`${p.label}: ${p.value != null ? fmt(p, p.value) : 'no data'}`} onPress={() => tap(p)} style={{ alignItems: 'center', gap: 6, width: 76 }}>
                <Ring progress={Math.min(1, p.ratio ?? 0)} size={68} stroke={8} color={color}>
                  <Icon name={look.icon} size={18} color={color} />
                </Ring>
                <Text variant="label" numberOfLines={1}>{p.value != null ? fmt(p, p.value) : '—'}</Text>
                <Text variant="caption" color="secondary" numberOfLines={1}>{p.label === 'Tasks this week' ? 'Tasks' : p.label === 'Spend this month' ? 'Spend' : p.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
      <View style={{ gap: 14 }}>
        {rings.map((p) => {
          const look = RING_LOOK[p.id] ?? { icon: 'target', tint: 'tasks' as TintKey };
          const bad = p.better === 'down' && (p.ratio ?? 0) > 1;
          const color = bad ? t.c.alert.coral : t.tints[look.tint].ink;
          const of = p.label === 'Tasks this week' ? `of ${p.target} tasks` : p.label === 'Habits' ? `of ${p.target} habits` : `of ${p.target != null ? fmt(p, p.target) : '—'}`;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityLabel={`${p.label}: ${p.value != null ? fmt(p, p.value) : 'no data'} ${of}`}
              onPress={() => tap(p)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.8 : 1 })}
            >
              <Ring progress={Math.min(1, p.ratio ?? 0)} size={46} stroke={6} color={color}>
                <Icon name={look.icon} size={16} color={color} />
              </Ring>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="caption" color="secondary" numberOfLines={1}>{p.label}</Text>
                <Text variant="rowTitle" numberOfLines={1}>
                  {p.value != null ? fmt(p, p.value) : '—'} <Text variant="caption" color="secondary">{of}</Text>
                </Text>
              </View>
              {p.week.some((v) => v != null && v > 0) ? (
                <View style={{ width: 84 }}>
                  <MiniBars values={p.week} height={30} color={color} accessibilityLabel={`${p.label}, last 7 days`} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
      )}
      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing ? `${editing.label} goal` : ''}>
        {editing ? (
          <View style={{ gap: 12 }}>
            <Text variant="caption" color="secondary">
              {editing.goalSource === 'history' ? 'Learned from your last 30 days — a little better than your usual. Set your own and it stays.' : editing.goalSource === 'you' ? 'Your own goal.' : 'A starting point until there’s a month of history to learn from.'}
            </Text>
            <NumberField label={editing.id === 'spend' ? 'Per month (₹)' : editing.unit === 'h' ? 'Hours a day' : 'Per day'} value={value} onChange={setValue} />
            <Button title="Save goal" icon="check" disabled={!value} onPress={() => (setGoal(os, editing.id as GoalId, value ?? null), setEditing(null))} />
            {editing.goalSource === 'you' ? <Button title="Learn it from my history again" variant="secondary" icon="refresh" onPress={() => (setGoal(os, editing.id as GoalId, null), setEditing(null))} /> : null}
          </View>
        ) : null}
      </Sheet>
    </Tile>
  );
}

/** Activity: one tracker at a time (swipe for the next), its last 18 weeks as a grid of days like GitHub's; tap for all of them. */
function ActivityTile() {
  const router = useRouter();
  const t = useTheme();
  const rows = useLive((o) => trackers(o).filter((x) => !x.hidden).map((x) => trackerSummary(o, x, Date.now(), 26)), []);
  const [width, setWidth] = useState(0);
  const [page, setPage] = useState(0);
  const style = useLive((o) => tileStyle(o, 'activity'), []);
  const open = () => router.push('/activity' as never);
  if (style === 'all')
    return (
      <Tile size="2x1" tint="tasks" icon="grid" label="Activity" onPress={open}>
        <View style={{ gap: 22 }}>
          {rows.map((s) => (
            <ActivityRow key={s.tracker.id} s={s} onPress={() => router.push(`/activity/${s.tracker.id}` as never)} />
          ))}
        </View>
      </Tile>
    );
  return (
    <Tile size="2x1" tint="tasks" icon="grid" label="Activity" meta={rows.length > 1 ? `${page + 1} of ${rows.length}` : undefined} onPress={open}>
      {rows.length ? (
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ gap: 10 }}>
          {width > 0 ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
              onScroll={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
              scrollEventThrottle={64}
            >
              {rows.map((s) => (
                <View key={s.tracker.id} style={{ width }}>
                  <ActivityRow s={s} onPress={open} />
                </View>
              ))}
            </ScrollView>
          ) : null}
          {rows.length > 1 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }} accessibilityRole="adjustable" accessibilityLabel={`Tracker ${page + 1} of ${rows.length}`}>
              {rows.map((s, k) => (
                <View key={s.tracker.id} style={{ width: k === page ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: k === page ? t.c.fg.primary : t.c.fg.tertiary }} />
              ))}
            </View>
          ) : null}
        </View>
      ) : (
        <Text variant="caption" color="secondary">No trackers — tap to add one.</Text>
      )}
    </Tile>
  );
}

/** Today's habits: tap to tick; only when you track some. */
function HabitsTile() {
  const router = useRouter();
  const n = useLive((o) => activeHabits(o).length, []);
  const style = useLive((o) => tileStyle(o, 'habits'), []);
  if (!n) return null;
  return (
    <Tile size="2x1" tint="health" icon="flame" label="Habits" meta={style === 'week' ? 'this week' : 'today'} onPress={() => router.push('/module/habits' as never)}>
      {style === 'week' ? <HabitWeek /> : <HabitChecklist />}
    </Tile>
  );
}

/** One card per part of life: its number, a line, a 7-point trend; tap for the module's overview. */
function AreasTile() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const cards = useLive(
    (o) =>
      homeAreas(o)
        .map((id) => {
          const m = o.registry.modules.get(id);
          const card = o.registry.overviewFor(id)?.(o, Date.now(), { cardOnly: true }).card;
          return m && card ? { id, name: m.name, icon: m.icon, card } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x),
    [],
  );
  if (!cards.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {cards.map((c) => {
        const tint = tintForModule(c.id);
        return (
          <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${c.name}: ${c.card.headline}`} onPress={() => router.push(`/module/${c.id}` as never)} style={({ pressed }) => ({ flexBasis: '46%', flexGrow: 1, borderRadius: t.radius.tile, backgroundColor: t.tints[tint].fill, padding: 14, gap: 6, opacity: pressed ? 0.85 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={c.icon} size={14} color={t.tints[tint].ink} />
              <Text variant="labelCaps" color={t.tints[tint].ink} numberOfLines={1} style={{ letterSpacing: 0, flex: 1 }}>{c.name}</Text>
            </View>
            <Text variant="rowTitle" numberOfLines={1} color={c.card.alert ? t.c.alert.coralText : 'primary'}>{c.card.headline}</Text>
            {c.card.sub ? <Text variant="caption" color="secondary" numberOfLines={2}>{c.card.sub}</Text> : null}
            {c.card.series?.some((v) => v != null && v > 0) ? <MiniBars values={c.card.series} height={28} color={t.tints[tint].ink} accessibilityLabel={`${c.name} trend`} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
