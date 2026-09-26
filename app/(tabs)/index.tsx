import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { upkeep } from '@core/cycles/upkeep';
import { METRICS, formatMetric, metricSeries, peopleToCall, screenTopApps, spendPace, upcoming, type MetricId } from '@core/dashboard/metrics';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { IconName } from '@ui/icons';
import { BentoGrid, DeltaChip, Icon, IconButton, LineChart, MiniBars, RowItem, RowList, Screen, Sheet, Stat, SwitchField, Text, Tile } from '@ui/kit';
import type { TintKey } from '@ui/theme/tokens';
import { ToCheckBell } from '../../src/screens/ToCheckBell';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

type TileId = 'steps' | 'sleep' | 'screen' | 'spend' | 'upcoming' | 'people' | 'overdue';
const TILES: Record<TileId, { label: string; wide: boolean }> = {
  steps: { label: 'Steps', wide: false },
  sleep: { label: 'Sleep', wide: false },
  screen: { label: 'Screen time', wide: true },
  spend: { label: 'Spend this month', wide: true },
  upcoming: { label: 'Upcoming', wide: true },
  people: { label: 'People to call', wide: false },
  overdue: { label: 'Overdue', wide: false },
};
const DEFAULT: Array<{ id: TileId; hidden?: boolean }> = (['steps', 'sleep', 'screen', 'spend', 'upcoming', 'people', 'overdue'] as TileId[]).map((id) => ({ id }));
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
  const [editing, setEditing] = useState(false);
  const [layout, setLayout] = useState<Array<{ id: TileId; hidden?: boolean }>>(() => {
    const saved = os.settings.get<Array<{ id: TileId; hidden?: boolean }>>('today.tiles', []);
    const known = saved.filter((x) => TILES[x.id]);
    return [...known, ...DEFAULT.filter((d) => !known.some((k) => k.id === d.id))];
  });
  const save = (next: typeof layout) => {
    setLayout(next);
    os.settings.set('today.tiles', next);
  };
  const shown = layout.filter((x) => !x.hidden);

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
      {rows.map((r) => (r.length === 2 ? <BentoGrid key={r.join()}>{r.map((id) => <TodayTile key={id} id={id} />)}</BentoGrid> : <TodayTile key={r[0]} id={r[0]!} />))}
      <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, padding: 10 }}>
        <Icon name="edit" size={14} />
        <Text variant="caption" color="secondary">Edit tiles</Text>
      </Pressable>
      <Sheet visible={editing} onClose={() => setEditing(false)} title="Today's tiles">
        <RowList>
          {layout.map((x, i) => (
            <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <SwitchField label={TILES[x.id].label} value={!x.hidden} onChange={(v) => save(layout.map((y) => (y.id === x.id ? { ...y, hidden: !v } : y)))} />
              </View>
              <IconButton icon="chevron-up" size={34} accessibilityLabel={`Move ${TILES[x.id].label} up`} disabled={i === 0} onPress={() => save(layout.map((y, j) => (j === i - 1 ? layout[i]! : j === i ? layout[i - 1]! : y)))} />
              <IconButton icon="chevron-down" size={34} accessibilityLabel={`Move ${TILES[x.id].label} down`} disabled={i === layout.length - 1} onPress={() => save(layout.map((y, j) => (j === i + 1 ? layout[i]! : j === i ? layout[i + 1]! : y)))} />
            </View>
          ))}
        </RowList>
      </Sheet>
    </Screen>
  );
}

function TodayTile({ id }: { id: TileId }) {
  switch (id) {
    case 'steps':
    case 'sleep':
      return <MetricTile id={id} />;
    case 'screen':
      return <ScreenTile />;
    case 'spend':
      return <SpendTile />;
    case 'upcoming':
      return <UpcomingTile />;
    case 'people':
      return <PeopleTile />;
    case 'overdue':
      return <OverdueTile />;
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
  const p = useLive((o) => (o.registry.entityTypes.has('transaction') ? spendPace(o) : null), []);
  if (!p) return null;
  const diff = p.usualByToday != null ? p.spent - p.usualByToday : null;
  const series = [{ label: 'This month', color: t.tints.finance.ink, values: p.thisMonth }, ...(p.usual.length ? [{ label: 'Usual', color: t.c.fg.tertiary, values: p.usual.slice(0, 31), dashed: true }] : [])];
  return (
    <Tile size="2x1" tint="finance" icon="wallet" label="Spend this month" meta={format(new Date(), 'MMM')} onPress={() => router.push('/spend' as never)}>
      {p.spent || p.usual.length ? (
        <View style={{ gap: 8 }}>
          <Stat value={os.format.currency(p.spent)} size="count" caption={diff == null ? 'Your usual month shows after a month of data' : `${os.format.currency(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than usual by today${p.usualMonth ? ` · usual month ${os.format.currency(p.usualMonth)}` : ''}`} tone={diff != null && diff > 0 ? 'alert' : undefined} />
          <LineChart series={series} labels={Array.from({ length: Math.max(p.thisMonth.length, p.usual.length ? 31 : 0) }, (_, i) => (i % 7 === 0 ? String(i + 1) : ''))} height={90} minZero formatY={(n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)))} accessibilityLabel="Spend this month vs your usual month" />
        </View>
      ) : (
        <NeedsSource id="spend" />
      )}
    </Tile>
  );
}

function UpcomingTile() {
  const router = useRouter();
  const items = useLive((o) => upcoming(o, 5), []);
  return (
    <Tile size="2x1" tint="upkeep" icon="calendar" label="Upcoming" meta="next 2 weeks" onPress={() => router.navigate('/upkeep')}>
      {items.length ? (
        <RowList>
          {items.map((i) => (
            <RowItem key={i.id} icon={i.kind === 'event' ? 'calendar' : 'repeat'} tint={i.kind === 'event' ? 'tasks' : 'upkeep'} title={i.title} value={i.overdue ? 'Late' : relDay(i.at)} valueTone={i.overdue ? 'alert' : 'secondary'} onPress={() => router.push(`/entity/${i.type}/${i.entityId}` as never)} />
          ))}
        </RowList>
      ) : (
        <Text variant="caption" color="secondary">Nothing due or planned in the next two weeks.</Text>
      )}
    </Tile>
  );
}

function PeopleTile() {
  const router = useRouter();
  const people = useLive((o) => peopleToCall(o, 3), []);
  return (
    <Tile tint="people" icon="people" label="People" meta="to call">
      {people.length ? (
        <View style={{ gap: 6 }}>
          {people.map((p) => (
            <Pressable key={p.entityId} accessibilityRole="button" onPress={() => router.push(`/entity/person/${p.entityId}` as never)}>
              <Text variant="label" numberOfLines={1}>{p.title}</Text>
              <Text variant="caption" color={p.late ? 'alert' : 'secondary'} numberOfLines={1}>{p.why}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text variant="caption" color="secondary">No one due. Set “keep in touch” on a person to see them here.</Text>
      )}
    </Tile>
  );
}

function OverdueTile() {
  const router = useRouter();
  const u = useLive((o) => upkeep(o), []);
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
