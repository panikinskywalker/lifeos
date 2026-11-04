import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { isoDay } from '@core/dashboard/metrics';
import { WORKOUT_KINDS } from '@modules/health';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ChipRow, FilterChip, Icon, IconButton, Screen, Text } from '@ui/kit';
import { Box, Caps, Disc, Group, Head, Pill, Row, RowValue, StatCell, StatRow, WideButton, kindIcon } from './parts';
import { hoursMinutes, shortDay, workoutLine, workoutRows, type WorkoutRow } from './data';

/**
 * Workouts (NR-Health-Workouts): search, a chip per type with its count,
 * sessions, time and distance for what is showing, then the last 7 days and
 * the earlier months, newest first, with where a hand-added one came from.
 */

const PAGE = 8;
const DAY = 86_400_000;
const NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const kindLabel = (kind: string) => WORKOUT_KINDS.find((k) => k.value === kind)?.label ?? 'Other';

function grouped(rows: WorkoutRow[], now: number, newest: boolean) {
  if (!newest) return [{ label: 'OLDEST FIRST', rows }];
  const week = isoDay(now - 6 * DAY);
  const year = new Date(now).getFullYear();
  const groups: Array<{ label: string; rows: WorkoutRow[] }> = [];
  for (const w of rows) {
    const [y, m] = w.date.split('-').map(Number);
    const label = w.date >= week ? 'LAST 7 DAYS' : `EARLIER IN ${NAMES[m! - 1]}${y === year ? '' : ` ${y}`}`;
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.rows.push(w);
    else groups.push({ label, rows: [w] });
  }
  return groups;
}

export function WorkoutsScreen() {
  const router = useRouter();
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [newest, setNewest] = useState(true);
  const [count, setCount] = useState(PAGE);
  const all = useLive((os) => workoutRows(os), []);
  const now = Date.now();
  const add = () => router.push('/entity/workout/new' as never);

  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of all) m.set(w.kind, (m.get(w.kind) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hit = all.filter((w) => (!kind || w.kind === kind) && (!q || [w.title, kindLabel(w.kind), w.place, w.notes].some((s) => s?.toLowerCase().includes(q))));
    return newest ? hit : [...hit].reverse();
  }, [all, query, kind, newest]);

  const minutes = rows.reduce((a, w) => a + w.minutes, 0);
  const km = Math.round(rows.reduce((a, w) => a + (w.km ?? 0), 0) * 10) / 10;
  const shown = rows.slice(0, count);
  const left = rows.length - shown.length;
  const earliest = all[all.length - 1]?.date;
  const reset = () => setCount(PAGE);

  return (
    <Screen contentStyle={{ gap: 24 }}>
      <Head
        sub={all.length && earliest ? `Health & Fitness · ${all.length} since ${shortDay(earliest)}` : 'Health & Fitness'}
        title="Workouts"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/health' as never))}
        right={<IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel="Add workout" onPress={add} />}
      />

      <Box label="Search workouts" value={query} onChange={(s) => { setQuery(s); reset(); }} placeholder="Type, place or note" leading="search" height={48} radius={16} />

      {all.length ? (
        <ChipRow>
          <FilterChip label={`All ${all.length}`} selected={!kind} onPress={() => { setKind(null); reset(); }} />
          {kinds.map(([k, n]) => (
            <FilterChip key={k} label={`${kindLabel(k)} ${n}`} selected={kind === k} onPress={() => { setKind(k); reset(); }} />
          ))}
        </ChipRow>
      ) : null}

      <StatRow>
        <StatCell label="SESSIONS" value={String(rows.length)} />
        <StatCell label="TIME" value={hoursMinutes(minutes)} />
        <StatCell label="DISTANCE" value={String(km)} unit="km" />
      </StatRow>

      {shown.length ? (
        grouped(shown, now, newest).map((g, i) => (
          <View key={g.label} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, minHeight: i === 0 ? 32 : undefined }}>
              <Caps>{g.label}</Caps>
              {i === 0 ? (
                <Pressable accessibilityRole="button" accessibilityLabel={newest ? 'Newest first; show oldest first' : 'Oldest first; show newest first'} hitSlop={8} onPress={() => setNewest((n) => !n)} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 32 }}>
                  <Icon name="sort" size={14} color={t.c.fg.secondary} />
                  <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{newest ? 'Newest' : 'Oldest'}</Text>
                </Pressable>
              ) : null}
            </View>
            <Group>
              {g.rows.map((w) => <WorkoutItem key={w.id} w={w} onPress={() => router.push(`/entity/workout/${w.id}` as never)} />)}
            </Group>
          </View>
        ))
      ) : (
        <View style={{ padding: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, gap: 12 }}>
          <Text variant="caption" color="secondary" style={{ lineHeight: 18 }}>{all.length ? 'No workouts match that.' : 'No workouts yet. They come in from Health Connect, or add one.'}</Text>
          {all.length ? null : <WideButton title="Add workout" icon="plus" onPress={add} />}
        </View>
      )}

      {left > 0 ? <WideButton title={`Show ${Math.min(5, left)} more`} onPress={() => setCount((c) => c + 5)} /> : null}
    </Screen>
  );
}

function WorkoutItem({ w, onPress }: { w: WorkoutRow; onPress: () => void }) {
  const t = useTheme();
  const badge = w.origin.kind === 'you' ? 'added by you' : w.origin.kind === 'dump' ? 'from a Dump' : null;
  return (
    <Row
      minHeight={56}
      lead={<Disc icon={kindIcon(w.kind)} color={t.c.accent.mustard} />}
      title={w.title}
      sub={
        badge ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <Text variant="caption" color="secondary" numberOfLines={1} style={{ flexShrink: 1, fontVariant: ['tabular-nums'] }}>{workoutLine(w)}</Text>
            <Pill small label={badge} style={{ height: 22, paddingHorizontal: 8 }} />
          </View>
        ) : (
          workoutLine(w)
        )
      }
      right={<RowValue>{w.minutes} min</RowValue>}
      onPress={onPress}
      label={`${w.title}, ${workoutLine(w)}, ${w.minutes} minutes`}
    />
  );
}
