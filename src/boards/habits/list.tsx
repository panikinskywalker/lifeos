import React, { useState } from 'react';
import { Pressable, TextInput, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { ActionSheet, ChipRow, FilterChip, Icon, IconButton, Screen, Text } from '@ui/kit';
import { Disc, howOften, Pill, readToday, Rule, SectionHead, Slab, streakWord, type HabitState } from './parts';

type Filter = 'all' | 'active' | 'paused';
type Sort = 'added' | 'name' | 'streak';
const SORTS: Array<{ value: Sort; label: string }> = [{ value: 'added', label: 'As added' }, { value: 'name', label: 'Name' }, { value: 'streak', label: 'Longest streak' }];
const sorted = (rows: HabitState[], sort: Sort) => (sort === 'added' ? rows : [...rows].sort((a, b) => (sort === 'name' ? a.rec.title.localeCompare(b.rec.title) : b.streak.count * (b.streak.unit === 'week' ? 7 : 1) - a.streak.count * (a.streak.unit === 'week' ? 7 : 1))));

/** All habits (NR-Habits-List): find, filter, sort; active and paused in their groups, the pill is the streak. */
export function AllHabits(_: { ctx: LifeOSContext; params: Record<string, string> }) {
  const t = useTheme();
  const router = useRouter();
  const d = useLive((o) => readToday(o, Date.now()), []);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('added');
  const [sorting, setSorting] = useState(false);
  const [find, setFind] = useState('');
  const q = find.trim().toLowerCase();
  const pick = (rows: HabitState[]) => sorted(q ? rows.filter((s) => s.rec.title.toLowerCase().includes(q)) : rows, sort);
  const active = filter === 'paused' ? [] : pick(d.active);
  const paused = filter === 'active' ? [] : pick(d.paused);
  return (
    <Screen
      title="All habits"
      subtitle={`Habits · ${d.all.length} ${d.all.length === 1 ? 'record' : 'records'}`}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/habits' as never))}
      right={
        <>
          <IconButton icon="sort" accessibilityLabel="Sort" filled onPress={() => setSorting(true)} />
          <IconButton icon="plus" accessibilityLabel="Add habit" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} onPress={() => router.push('/entity/habit/new' as never)} />
        </>
      }
      contentStyle={{ gap: 24 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: t.c.line }}>
        <Icon name="search" size={18} color={t.c.fg.tertiary} />
        <TextInput accessibilityLabel="Find a habit" placeholder="Find a habit" value={find} onChangeText={setFind} placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} style={[t.type.body as TextStyle, { flex: 1, minWidth: 0, fontSize: 16, lineHeight: 21, fontFamily: fontForWeight(500), color: t.c.fg.primary, paddingVertical: 12 }]} />
      </View>

      <ChipRow>
        <FilterChip label={`All ${d.all.length}`} selected={filter === 'all'} onPress={() => setFilter('all')} />
        <FilterChip label={`Habits ${d.active.length}`} selected={filter === 'active'} onPress={() => setFilter('active')} />
        <FilterChip label={`Paused ${d.paused.length}`} selected={filter === 'paused'} onPress={() => setFilter('paused')} />
      </ChipRow>

      {active.length ? <Group title="Habits" sub={`${d.active.length} active · ${d.doneCount} done today`} rows={active} /> : null}
      {paused.length ? <Group title="Paused" sub="Not counted in today or streaks" rows={paused} /> : null}
      {!active.length && !paused.length ? <Text variant="caption" color="secondary" style={{ textAlign: 'center' }}>{q ? `No habit called “${find.trim()}”.` : 'Nothing here.'}</Text> : null}

      <Text variant="caption" color="tertiary" style={{ textAlign: 'center', paddingHorizontal: 12 }}>The pill is the streak: days in a row, or weeks that met the target. Weekday habits skip weekends.</Text>

      <ActionSheet visible={sorting} onClose={() => setSorting(false)} title="Sort" actions={SORTS.map((s) => ({ label: s.label, icon: s.value === sort ? 'check' : 'circle', onPress: () => setSort(s.value) }))} />
    </Screen>
  );
}

function Group({ title, sub, rows }: { title: string; sub: string; rows: HabitState[] }) {
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title={title} sub={sub} />
      <Slab style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
        {rows.map((s, i) => (
          <React.Fragment key={s.rec.id}>
            {i ? <Rule /> : null}
            <HabitRow state={s} />
          </React.Fragment>
        ))}
      </Slab>
    </View>
  );
}

function HabitRow({ state }: { state: HabitState }) {
  const t = useTheme();
  const router = useRouter();
  const { rec, habit, paused, doneToday, streak } = state;
  const sub = [howOften(habit), rec.data.reminderTime].filter(Boolean).join(' · ');
  const pill = paused ? 'paused' : streakWord(streak);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${rec.title}, ${sub}, ${pill}`} onPress={() => router.push(`/entity/habit/${rec.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, opacity: pressed ? 0.7 : 1 })}>
      <Disc icon="flame" color={paused ? t.c.fg.secondary : undefined} />
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text variant="rowTitle" numberOfLines={1}>{rec.title}</Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>{sub}</Text>
      </View>
      <Pill label={pill} lime={!paused && doneToday} />
    </Pressable>
  );
}
