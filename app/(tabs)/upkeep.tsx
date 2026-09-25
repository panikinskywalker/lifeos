import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format, formatDistanceToNowStrict } from 'date-fns';
import { DAY, describeCycle } from '@core/cycles/schedule';
import { logDone, undoLoggedDone, upkeep, UPKEEP_FILTERS, type UpkeepFilter, type UpkeepItem } from '@core/cycles/upkeep';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { tintForModule } from '@ui/theme/moduleTint';
import { ActionSheet, Button, Card, Chip, EmptyState, FilterChip, IconButton, MoneyField, NumberField, ProgressBar, RowItem, RowList, Screen, Section, Sheet, StatTile, SwitchField, Text, TextField, useToast } from '@ui/kit';

const FILTERS: UpkeepFilter[] = ['All', ...(Object.keys(UPKEEP_FILTERS) as UpkeepFilter[])];
const SECTIONS = [
  ['overdue', 'Overdue'],
  ['week', 'This week'],
  ['month', 'This month'],
  ['later', 'Later'],
] as const;

/** "4 d late", "Today", "in 3 d", "800 km left", "Snoozed". */
function dueLabel(i: UpkeepItem): string {
  const { state, daysLeft, meterLeft } = i.status;
  const km = (n: number) => `${Math.abs(Math.round(n)).toLocaleString('en-IN')} km`;
  if (state === 'unscheduled') return 'Set date';
  if (state === 'snoozed') return 'Snoozed';
  if (meterLeft != null && meterLeft <= 0) return `${km(meterLeft)} over`;
  if (daysLeft != null && daysLeft < 0) return `${-daysLeft} d late`;
  if (daysLeft === 0) return 'Today';
  if (daysLeft != null && meterLeft != null) return daysLeft <= 60 ? `in ${daysLeft} d` : `${km(meterLeft)} left`;
  if (daysLeft != null) return daysLeft > 60 ? `in ${Math.round(daysLeft / 30)} mo` : `in ${daysLeft} d`;
  return meterLeft != null ? `${km(meterLeft)} left` : '';
}

const ownName = (i: UpkeepItem) => i.cycle.name === i.entity.title || i.entity.type === 'routine';

/** "Keep in touch · every 14 days · last 22 days ago" — the record is the title, the cycle leads the subtitle. */
function subtitleFor(i: UpkeepItem): string {
  const last = i.cycle.lastDoneAt ? `last ${formatDistanceToNowStrict(i.cycle.lastDoneAt, { roundingMethod: 'floor' })} ago` : null;
  return [ownName(i) ? null : i.cycle.name, describeCycle(i.cycle), last].filter(Boolean).join(' · ');
}

const titleFor = (i: UpkeepItem) => (ownName(i) ? i.entity.title : `${i.entity.title} · ${i.cycle.name}`);

/** Upkeep (canvas 02, Stitch "Upkeep cycles") — every cycle by next due. */
export default function UpkeepTab() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [filter, setFilter] = useState<UpkeepFilter>('All');
  const [active, setActive] = useState<UpkeepItem | null>(null);
  const [costFor, setCostFor] = useState<UpkeepItem | null>(null);
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

      {all === 0 ? (
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

/** Done with a cost (and odometer for meter cycles); the cost can be filed as an expense. */
function DoneWithCostSheet({ item, onClose }: { item: UpkeepItem | null; onClose: () => void }) {
  const os = useOS();
  const toast = useToast();
  const [cost, setCost] = useState<number | undefined>(undefined);
  const [note, setNote] = useState('');
  const [meter, setMeter] = useState<number | undefined>(undefined);
  const [asExpense, setAsExpense] = useState(true);
  const key = item?.cycle.id;
  React.useEffect(() => {
    setCost(item?.cycle.costEstimate ?? undefined);
    setNote('');
    setMeter(undefined);
    setAsExpense(true);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!item) return null;
  const hasFinance = os.registry.entityTypes.has('transaction');
  const save = () => {
    const d = logDone(os, item.cycle.id, { cost: cost ?? null, note: note.trim() || null, meter: meter ?? null, asExpense: hasFinance && asExpense });
    onClose();
    toast.show({ message: cost ? `${titleFor(item)} done · ${os.format.currency(cost)}` : `${titleFor(item)} done`, icon: 'check', undo: () => undoLoggedDone(os, d) });
  };
  return (
    <Sheet visible onClose={onClose} title={`${titleFor(item)} done`} footer={<Button title="Save" icon="check" block onPress={save} />}>
      <MoneyField label="Cost" value={cost} onChange={setCost} />
      {item.cycle.meter ? <NumberField label="Odometer" unit="km" value={meter} onChange={setMeter} hint="Optional — rolls the km side of the cycle" /> : null}
      <TextField label="Note" value={note} onChange={setNote} placeholder="Where, who, anything to remember" />
      {hasFinance && cost ? <SwitchField icon="receipt" label="Also add as an expense" hint="Filed under Finance, linked to this record" value={asExpense} onChange={setAsExpense} /> : null}
      {item.cycle.costEstimate ? (
        <View style={{ flexDirection: 'row' }}>
          <Chip label={`Usually ${os.format.currency(item.cycle.costEstimate)}`} small tone="muted" />
        </View>
      ) : null}
    </Sheet>
  );
}
