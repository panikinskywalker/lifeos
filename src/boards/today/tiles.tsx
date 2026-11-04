import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { logDone, undoLoggedDone, upkeep, type Upkeep } from '@core/cycles/upkeep';
import { formatMetric, metricSeries, screenTopApps, upcoming } from '@core/dashboard/metrics';
import { doneToday, myDay, progress, setGoal, type DayItem, type GoalId, type Progress } from '@core/dashboard/day';
import type { LifeOSContext } from '@core/registry/context';
import type { TileDef, TileProps } from '@core/registry/types';
import { useDataVersion, useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { IconName } from '@ui/icons';
import type { TintKey } from '@ui/theme/tokens';
import { tintForModule } from '@ui/theme/moduleTint';
import { subtitleFor } from '@ui/components/cycles';
import { Button, Card, Checkbox, Chip, DeltaChip, Icon, IconButton, MiniBars, NumberField, Ring, RowItem, RowList, Sheet, Stat, Text, Tile, useToast } from '@ui/kit';
import { completeTask, undoComplete } from '@modules/projects/lib';
import { NeedsSource } from '../../screens/NeedsSource';
import { homeAreas } from '../../screens/homeLayout';
import { clock, DayStrip, daySentence, Face, MetricsGrid, SectionHead } from './parts';

/**
 * Today's own tiles (docs/MODEL.md layer 5): the ones over core (the day,
 * goals, Cycles, usage, trackers) or over every module at once (Areas).
 * Each reads core queries only; Today lays them out.
 */

const DAY = 86_400_000;
const fmtHours = (h: number) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, '0')}m`;

/** One upkeep pass per data change for every tile that needs it (Upcoming, Overdue, My day). */
let shared: { os: LifeOSContext; v: number; u: Upkeep } | null = null;
function useUpkeep(): Upkeep {
  const os = useOS();
  const v = useDataVersion();
  if (!shared || shared.os !== os || shared.v !== v) shared = { os, v, u: upkeep(os) };
  return shared.u;
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
            <Stat value={s.value != null ? formatMetric('screen', s.value, os.format.currency) : 'No data'} size="count" />
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

/** The next two weeks as row cards under a section header (NR-Today · Upkeep): a late one gets the coral pill, the rest their day. */
function UpcomingTile() {
  const router = useRouter();
  const u = useUpkeep();
  const all = useLive((o) => upcoming(o, 50, Date.now(), 14, u), [u]);
  const late = all.filter((i) => i.overdue).length;
  const week = all.filter((i) => !i.overdue && i.at < Date.now() + 7 * DAY).length;
  const line = [late ? `${late} late` : null, week ? `${week} this week` : null].filter(Boolean).join(' · ');
  const subOf = (i: (typeof all)[number]) => {
    const cycle = i.kind === 'due' ? u.items.find((x) => x.cycle.id === i.id) : null;
    return cycle ? subtitleFor(cycle) : i.kind === 'event' ? format(i.at, 'EEE d MMM') : i.kind === 'delivery' ? 'Delivery' : null;
  };
  return (
    <View style={{ gap: 8 }}>
      <SectionHead title="Upcoming" line={line || undefined} action="See all" onAction={() => router.navigate('/upkeep')} />
      {all.length ? (
        <RowList>
          {all.slice(0, 3).map((i) => (
            <RowItem
              key={i.id}
              icon={i.kind === 'event' ? 'calendar' : i.kind === 'delivery' ? 'box' : 'repeat'}
              tint={i.kind === 'event' ? 'tasks' : 'upkeep'}
              title={i.title}
              subtitle={subOf(i)}
              meta={i.overdue ? null : relDay(i.at)}
              trailing={i.overdue ? <View><Chip small tone="alert" label={`${Math.max(1, Math.round((Date.now() - i.at) / DAY))} d late`} /></View> : undefined}
              onPress={() => router.push(`/entity/${i.type}/${i.entityId}` as never)}
            />
          ))}
        </RowList>
      ) : (
        <Card>
          <Text variant="caption" color="secondary">Nothing due or planned in the next two weeks.</Text>
        </Card>
      )}
    </View>
  );
}

/** Small; alone on its row it draws 2×1 (short) instead of a full-width square. */
function OverdueTile({ size }: TileProps) {
  const router = useRouter();
  const u = useUpkeep();
  return (
    <Tile size={size === 'small' ? '1x1' : '2x1'} iconTone="alert" icon="alert" label="Overdue" onPress={() => router.navigate('/upkeep')}>
      <Stat value={String(u.overdue)} size="count" tone={u.overdue ? 'alert' : undefined} caption={u.overdue ? u.sections.overdue[0]!.entity.title + (u.overdue > 1 ? ` + ${u.overdue - 1} more` : '') : 'Nothing late'} />
    </Tile>
  );
}

function relDay(at: number): string {
  const d = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  return d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : d < 7 ? format(at, 'EEE') : format(at, 'd MMM');
}

const DAY_ICON: Record<DayItem['kind'], IconName> = { event: 'calendar', task: 'check-circle', due: 'repeat', delivery: 'box', reminder: 'bell', bill: 'receipt' };

/** One line of the checklist (NR-Today): a 26 tick, title over where, then one thing on the right. */
function DayRow({ item: i, now }: { item: DayItem; now: number }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const record = i.entityId ? os.records.get<{ completedAt?: number; phone?: string }>(i.entityId) : null;
  const cycleId = i.kind === 'due' ? i.id.replace(/^cycle:/, '') : null;
  const tick = () => {
    if (cycleId) {
      const d = logDone(os, cycleId);
      toast.show({ message: `${i.title} done`, icon: 'check', undo: () => undoLoggedDone(os, d) });
    } else if (record) {
      const r = completeTask(os, record as never, now);
      toast.show({ message: `${i.title} done`, icon: 'check', undo: () => undoComplete(os, record.id, r) });
    }
  };
  const undo = () => undoComplete(os, i.entityId!, { repeated: false });
  const doneAt = i.done && i.kind === 'task' ? record?.data.completedAt : undefined;
  const sub = doneAt ? `Done ${clock(doneAt)}` : i.sub;
  const person = !i.done && record && i.type === 'person';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
      {i.kind === 'task' || i.kind === 'due' ? (
        <Checkbox checked={i.done} onChange={i.done ? undo : tick} accessibilityLabel={`Done: ${i.title}`} />
      ) : i.done ? (
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={15} strokeWidth={3} color={t.c.accent.mustardInk} />
        </View>
      ) : (
        <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: i.late ? t.c.alert.coral : `${t.c.fg.primary}38`, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={DAY_ICON[i.kind]} size={13} color={i.late ? t.c.alert.coralText : t.c.fg.tertiary} />
        </View>
      )}
      <Pressable accessibilityRole="button" disabled={!i.entityId} onPress={() => router.push(`/entity/${i.type}/${i.entityId}` as never)} style={{ flex: 1, minWidth: 0, minHeight: 44, justifyContent: 'center', gap: 2, opacity: i.done ? 0.4 : 1 }}>
        <Text variant="rowTitle" numberOfLines={1} style={i.done ? { textDecorationLine: 'line-through' } : undefined}>{i.title}</Text>
        {sub ? <Text variant="caption" color={i.late ? t.c.alert.coralText : 'secondary'} numberOfLines={1}>{sub}</Text> : null}
      </Pressable>
      {person ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Face id={record.id} name={record.title} />
          {record.data.phone ? <IconButton icon="phone" size={36} filled accessibilityLabel={`Call ${record.title}`} onPress={() => void Linking.openURL(`tel:${record.data.phone}`)} /> : null}
        </View>
      ) : doneAt ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Undo: ${i.title}`} hitSlop={14} onPress={undo}>
          <Text variant="caption" color={t.c.accent.mustard} style={{ fontWeight: '700' }}>Undo</Text>
        </Pressable>
      ) : i.late ? (
        <View><Chip small tone="alert" label="late" /></View>
      ) : !i.allDay && !i.done ? (
        <View><Chip small tone="muted" label={clock(i.at)} /></View>
      ) : null}
    </View>
  );
}

/** Today in time order: the day in a sentence over its ticks, then the checklist, all-day things first, a line at now. */
function MyDayTile() {
  const t = useTheme();
  const u = useUpkeep();
  const items = useLive((o) => myDay(o, Date.now(), u), [u]);
  const now = Date.now();
  const firstLater = items.findIndex((i) => !i.allDay && i.at > now);
  const shown = items.slice(0, 9);
  return (
    <View style={{ gap: 12 }}>
      <Card style={{ padding: 18, paddingVertical: 18, gap: 14 }}>
        <Text accessibilityRole="header" style={{ fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.4 }} color={`${t.c.fg.primary}80`}>
          {daySentence(items).map(([words, bright], k) => (
            <Text key={k} style={{ fontSize: 24, lineHeight: 30, fontWeight: '600', letterSpacing: -0.4 }} color={bright ? 'primary' : `${t.c.fg.primary}80`}>{words}</Text>
          ))}
        </Text>
        {items.length ? <DayStrip items={items} now={now} /> : null}
      </Card>
      {shown.length ? (
        <Card style={{ borderRadius: t.radius.card, padding: 14, paddingVertical: 14, gap: 8 }}>
          {shown.map((i, k) => (
            <React.Fragment key={i.id}>
              {k === firstLater ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.c.alert.coral }} />
                  <View style={{ flex: 1, height: 1.5, backgroundColor: t.c.alert.coral }} />
                  <Text variant="labelMicro" color={t.c.alert.coralText}>{clock(now)}</Text>
                </View>
              ) : k ? (
                <View style={{ height: 1, backgroundColor: t.c.line }} />
              ) : null}
              <DayRow item={i} now={now} />
            </React.Fragment>
          ))}
          {items.length > shown.length ? <Text variant="caption" color="secondary">+ {items.length - shown.length} more</Text> : null}
        </Card>
      ) : null}
    </View>
  );
}

/** What you've done so far today, as the metrics row: money, body, habits, tasks, upkeep, dumps. */
function DoneTile() {
  const os = useOS();
  const d = useLive((o) => doneToday(o), []);
  const slept = useLive((o) => (o.registry.objects.has('measurement') ? metricSeries(o, 'sleep', 'day').value : null), []);
  const count = (label: string, n: number, unit?: string) => (n ? [{ label, value: String(n), unit }] : []);
  return (
    <MetricsGrid
      stats={[
        { label: 'Spent', value: os.format.currency(d.spent) },
        ...(d.steps != null ? [{ label: 'Steps', value: Math.round(d.steps).toLocaleString('en-IN') }] : []),
        ...(slept != null ? [{ label: 'Slept', value: fmtHours(slept) }] : []),
        ...(d.received ? [{ label: 'Came in', value: os.format.currency(d.received) }] : []),
        ...count('Workouts', d.workouts, d.workoutMin ? `${Math.round(d.workoutMin)} min` : undefined),
        ...count('Habits', d.habitsDone),
        ...count('Tasks', d.tasksDone),
        ...count('Upkeep', d.upkeepDone),
        ...count('Dumps', d.dumps),
      ]}
    />
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

/** Rings against goals learned from your last 30 days; tap one to set your own goal. Two looks: rows or rings. */
function ProgressTile({ config }: TileProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const rings = useLive((o) => progress(o), []);
  const [editing, setEditing] = useState<Progress | null>(null);
  const [value, setValue] = useState<number | undefined>(undefined);
  const fmt = (p: Progress, v: number) => (p.id === 'spend' ? os.format.currency(v) : p.unit === 'h' ? fmtHours(v) : Math.round(v).toLocaleString('en-IN'));
  if (!rings.length) return null;
  const tap = (p: Progress) => {
    const look = RING_LOOK[p.id];
    if (look?.route) router.push(look.route as never);
    else (setEditing(p), setValue(p.target ?? undefined));
  };
  return (
    <Tile size="2x1" tint="health" icon="target" label="Progress" meta="vs your goals">
      {config.style === 'rings' ? (
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
                <Text variant="label" numberOfLines={1}>{p.value != null ? fmt(p, p.value) : 'No data'}</Text>
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
            const of = p.label === 'Tasks this week' ? `of ${p.target} tasks` : p.label === 'Habits' ? `of ${p.target} habits` : p.target != null ? `of ${fmt(p, p.target)}` : 'no goal yet';
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
                    {p.value != null ? fmt(p, p.value) : 'No data'} <Text variant="caption" color="secondary">{of}</Text>
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
              {editing.goalSource === 'history' ? 'Learned from your last 30 days, a little better than your usual. Set your own and it stays.' : editing.goalSource === 'you' ? 'Your own goal.' : 'A starting point until there’s a month of history to learn from.'}
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

/** One card per part of life: its number, a line, a 7-point trend; tap for the module's overview. */
function AreasTile() {
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
          <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${c.name}: ${c.card.headline}`} onPress={() => router.push(`/module/${c.id}` as never)} style={({ pressed }) => ({ flexBasis: '46%', flexGrow: 1, borderRadius: t.radius.tile, backgroundColor: t.c.bg.tile, padding: 16, gap: 6, opacity: pressed ? 0.85 : 1 })}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.tints[tint].ink }} />
              <Text variant="labelCaps" color="secondary" numberOfLines={1} style={{ flex: 1, textTransform: 'uppercase' }}>{c.name}</Text>
            </View>
            <Text variant="stat" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} color={c.card.alert ? t.c.alert.coralText : 'primary'} style={{ fontSize: 22, lineHeight: 26, letterSpacing: -0.5 }}>{c.card.headline}</Text>
            {c.card.sub ? <Text variant="caption" color="secondary" numberOfLines={2}>{c.card.sub}</Text> : null}
            {c.card.series?.some((v) => v != null && v > 0) ? <MiniBars values={c.card.series} height={28} color={t.tints[tint].ink} accessibilityLabel={`${c.name} trend`} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const wide = { sizes: ['medium'], defaultSize: 'medium' } as const;
const tile = (type: string, name: string, description: string, icon: string, component: TileDef['component'], more: Partial<TileDef> = {}): TileDef => ({ type, board: 'today', name, description, icon, sizes: [...wide.sizes], defaultSize: wide.defaultSize, component, ...more });
const looks = (options: Array<{ value: string; label: string }>): Pick<TileDef, 'configFields'> => ({ configFields: [{ key: 'style', label: 'Look', type: 'select', options }] });

export const todayTiles: TileDef[] = [
  tile('myday', 'My day', 'Today in time order: events, tasks, things due, deliveries', 'calendar', MyDayTile),
  tile('progress', 'Progress', 'Rings: steps, sleep, screen time, habits, tasks, spend vs your goals', 'target', ProgressTile, looks([{ value: 'rows', label: 'Rows' }, { value: 'rings', label: 'Rings' }])),
  tile('done', 'Done today', 'What you’ve spent, logged and ticked off so far', 'check', DoneTile),
  tile('areas', 'Areas', 'A card per part of life with its number and trend', 'grid', AreasTile),
  tile('upcoming', 'Upcoming', 'The next two weeks', 'calendar', UpcomingTile),
  tile('screen', 'Screen time', 'Today, top apps, 7 days', 'signal', ScreenTile),
  tile('overdue', 'Overdue', 'Upkeep that’s late', 'alert', OverdueTile, { sizes: ['small', 'medium'], defaultSize: 'small' }),
];
