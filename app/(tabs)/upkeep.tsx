import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { DAY } from '@core/cycles/schedule';
import { logDone, undoLoggedDone, upkeep, UPKEEP_FILTERS, weekPlan, weekStartOf, type UpkeepFilter, type UpkeepItem, type WeekEntry } from '@core/cycles/upkeep';
import { addPeriod, startOfDay } from '@core/cycles/schedule';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { tintForModule } from '@ui/theme/moduleTint';
import { DoneWithCostSheet, dueLabel, subtitleFor, titleFor } from '@ui/components/cycles';
import { ActionSheet, Button, Card, Chip, EmptyState, FilterChip, IconButton, ProgressBar, RowItem, RowList, Screen, Section, Segmented, StatTile, Text, useToast, WeekStrip, type WeekDay } from '@ui/kit';

const FILTERS: UpkeepFilter[] = ['All', ...(Object.keys(UPKEEP_FILTERS) as UpkeepFilter[])];
const SECTIONS = [
  ['overdue', 'Overdue'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['later', 'Later'],
] as const;

/** Upkeep (canvas 02, Stitch "Upkeep cycles") — every cycle by next due. */
export default function UpkeepTab() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<UpkeepFilter>('All');
  const [active, setActive] = useState<UpkeepItem | null>(null);
  const [costFor, setCostFor] = useState<UpkeepItem | null>(null);
  const [view, setView] = useState<'list' | 'week'>('list');
  const u = useLive((o) => upkeep(o, filter), [filter]);
  const all = useLive((o) => upkeep(o, 'All').items.length, []);

  const done = (i: UpkeepItem) => {
    const d = logDone(os, i.cycle.id);
    toast.show({ message: `${titleFor(i)} done`, icon: 'check', undo: () => undoLoggedDone(os, d) });
  };
  const snooze = (i: UpkeepItem, days: number) => {
    const prev = i.cycle.snoozedUntil;
    os.cycles.snooze(i.cycle.id, Date.now() + days * DAY);
    toast.show({ message: `Snoozed ${days === 1 ? 'a day' : `${days} days`}`, icon: 'clock', undo: () => void os.cycles.update(i.cycle.id, { snoozedUntil: prev }) });
  };
  const top = u.sections.overdue[0];

  return (
    <Screen tab title="Upkeep" subtitle={`${u.items.length} cycle${u.items.length === 1 ? '' : 's'}${u.overdue ? ` · ${u.overdue} overdue` : ''}`} right={<IconButton icon="plus" accessibilityLabel="New routine" filled onPress={() => router.push('/entity/routine/new')} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -t.layout.gutter }} contentInset={{ left: t.layout.gutter, right: t.layout.gutter }}>
        <View style={{ width: t.layout.gutter - 8 }} />
        {FILTERS.map((f) => (
          <FilterChip key={f} label={f} selected={filter === f} onPress={() => setFilter(f)} />
        ))}
        <View style={{ width: t.layout.gutter - 8 }} />
      </ScrollView>

      {all > 0 ? <Segmented value={view} onChange={setView} options={[{ value: 'list', label: 'By due date' }, { value: 'week', label: 'This week' }]} /> : null}

      {view === 'week' && all > 0 ? (
        <WeekView filter={filter} onDone={done} onOpen={setActive} />
      ) : all === 0 ? (
        <EmptyState icon="repeat" tint="upkeep" title="Nothing recurring yet" line="Add a vehicle, a subscription or a chore like laundry — each gets a cycle with when it was last done and when it’s due." action="Add a routine" onAction={() => router.push('/entity/routine/new')} />
      ) : u.items.length === 0 ? (
        <EmptyState icon="check" tint="upkeep" line={`No ${filter.toLowerCase()} cycles.`} bare />
      ) : (
        <>
          {top ? (
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.c.alert.coral }} />
                <Text variant="labelCaps" color={t.c.alert.coralText} style={{ flex: 1, textTransform: 'uppercase' }}>
                  Needs attention
                </Text>
                <Text variant="label" color="secondary">
                  {dueLabel(top)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="heading" numberOfLines={1}>
                    {top.entity.title}
                  </Text>
                  <Text variant="caption" color="secondary" numberOfLines={1}>
                    {subtitleFor(top)}
                  </Text>
                </View>
                <Button title="Done" icon="check" size="sm" onPress={() => done(top)} />
              </View>
              <ProgressBar value={1} color={t.c.alert.coral} accessibilityLabel="Overdue" />
            </Card>
          ) : null}

          {u.monthCost > 0 ? <StatTile size="2x1" tint="finance" icon="wallet" label="This month will cost" value={os.format.currency(u.monthCost)} caption={`${u.monthCostCount} paid cycle${u.monthCostCount === 1 ? '' : 's'} due by ${format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), 'd MMM')}`} /> : null}

          {SECTIONS.map(([key, label]) =>
            u.sections[key].length ? (
              <Section key={key} title={label} meta={`${u.sections[key].length}`}>
                <RowList>
                  {u.sections[key].map((i) => {
                    const late = i.status.state === 'overdue';
                    return (
                      <RowItem
                        key={i.cycle.id}
                        icon={i.def?.icon ?? 'repeat'}
                        tint={tintForModule(i.def?.module)}
                        title={i.entity.title}
                        subtitle={subtitleFor(i)}
                        value={dueLabel(i)}
                        valueTone={late ? 'alert' : i.status.state === 'today' ? 'default' : 'secondary'}
                        meta={i.cycle.nextDueAt ? format(i.cycle.nextDueAt, 'EEE d MMM') : null}
                        onDone={i.status.state === 'unscheduled' ? undefined : () => done(i)}
                        doneLabel={late || i.status.state === 'today' ? 'Done' : undefined}
                        onPress={() => setActive(i)}
                      />
                    );
                  })}
                </RowList>
              </Section>
            ) : null,
          )}
        </>
      )}

      <ActionSheet
        visible={!!active}
        onClose={() => setActive(null)}
        title={active ? titleFor(active) : undefined}
        actions={
          active
            ? [
                ...(active.status.state === 'unscheduled' ? [] : [{ label: 'Mark done', icon: 'check' as const, onPress: () => done(active) }]),
                { label: 'Done, with cost…', icon: 'cash' as const, onPress: () => setCostFor(active) },
                { label: 'Snooze a day', icon: 'clock' as const, onPress: () => snooze(active, 1) },
                { label: 'Snooze 3 days', icon: 'clock' as const, onPress: () => snooze(active, 3) },
                ...(active.cycle.everyN || active.cycle.meterEvery ? [{ label: 'Skip this one', icon: 'arrow-right' as const, onPress: () => { os.cycles.skip(active.cycle.id); toast.show({ message: 'Skipped', icon: 'arrow-right' }); } }] : []),
                { label: `Open ${active.def?.label.toLowerCase() ?? 'record'}`, icon: 'chevron-right' as const, onPress: () => router.push(`/entity/${active.entity.type}/${active.entity.id}`) },
              ]
            : []
        }
      />
      <DoneWithCostSheet item={costFor} onClose={() => setCostFor(null)} />
    </Screen>
  );
}

/** Upkeep › This week (SCOPE C2): Mon–Sun strip, the chosen day's dues below; chores check off. */
function WeekView({ filter, onDone, onOpen }: { filter: UpkeepFilter; onDone: (i: UpkeepItem) => void; onOpen: (i: UpkeepItem) => void }) {
  const [weekStart, setWeekStart] = useState(() => weekStartOf(Date.now()));
  const today = startOfDay(Date.now());
  const [selected, setSelected] = useState(() => String(Math.min(6, Math.max(0, Math.round((today - weekStartOf(Date.now())) / DAY)))));
  const days = useLive((o) => weekPlan(o, weekStart, filter), [weekStart, filter]);
  const strip: WeekDay[] = days.map((entries, i) => {
    const at = addPeriod(weekStart, i, 'day');
    return {
      key: String(i),
      weekday: format(at, 'EEE'),
      date: new Date(at).getDate(),
      today: at === today,
      dues: entries.map((e) => ({ id: `${e.cycle.id}-${e.at}`, icon: (e.def?.icon ?? 'repeat') as never, tint: tintForModule(e.def?.module), overdue: e.status.state === 'overdue' && !e.projected, label: e.entity.title })),
    };
  });
  const day = Number(selected);
  const entries: WeekEntry[] = days[day] ?? [];
  const dayAt = addPeriod(weekStart, day, 'day');
  const thisWeek = weekStart === weekStartOf(Date.now());
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <IconButton icon="chevron-left" accessibilityLabel="Previous week" filled onPress={() => setWeekStart(addPeriod(weekStart, -7, 'day'))} />
        <Text variant="heading" style={{ flex: 1, textAlign: 'center' }}>
          {`${format(weekStart, 'd MMM')} – ${format(addPeriod(weekStart, 6, 'day'), 'd MMM')}`}
        </Text>
        {thisWeek ? null : <Chip label="This week" small onPress={() => setWeekStart(weekStartOf(Date.now()))} />}
        <IconButton icon="chevron-right" accessibilityLabel="Next week" filled onPress={() => setWeekStart(addPeriod(weekStart, 7, 'day'))} />
      </View>
      <WeekStrip days={strip} selected={selected} onSelect={setSelected} />
      <Section title={dayAt === today ? 'Today' : format(dayAt, 'EEEE d MMM')} meta={`${entries.length}`}>
        {entries.length ? (
          <RowList>
            {entries.map((e) => {
              const chore = e.entity.type === 'routine';
              const actionable = !e.projected && dayAt <= today + 7 * DAY;
              return (
                <RowItem
                  key={`${e.cycle.id}-${e.at}`}
                  icon={e.def?.icon ?? 'repeat'}
                  tint={tintForModule(e.def?.module)}
                  title={e.entity.title}
                  subtitle={e.projected ? 'Again, if the last one’s on time' : subtitleFor(e)}
                  value={e.projected ? null : dueLabel(e)}
                  valueTone={e.status.state === 'overdue' ? 'alert' : 'secondary'}
                  checked={chore && actionable ? false : undefined}
                  onToggle={chore && actionable ? () => onDone(e) : undefined}
                  onDone={!chore && actionable && e.status.state !== 'unscheduled' ? () => onDone(e) : undefined}
                  onPress={() => onOpen(e)}
                />
              );
            })}
          </RowList>
        ) : (
          <EmptyState icon="check" tint="upkeep" line="Nothing due this day." bare />
        )}
      </Section>
    </>
  );
}
