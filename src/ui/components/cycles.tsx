import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { format, formatDistanceToNowStrict } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { Cycle } from '@core/cycles/cycleRepo';
import { dateField, describeCycle, type CycleKind, type CycleUnit } from '@core/cycles/schedule';
import { logDone, undoLoggedDone, type UpkeepItem } from '@core/cycles/upkeep';
import { useLive, useOS } from '../hooks';
import { useTheme } from '../theme/ThemeProvider';
import { ActionSheet, Button, Chip, DateField, EmptyState, FormField, FilterChip, MoneyField, NumberField, ProgressBar, RowItem, RowList, Section, Segmented, Sheet, SwitchField, Text, TextField, useToast } from '../kit';

/** "4 d late", "Today", "in 3 d", "800 km left", "Snoozed". */
export function dueLabel(i: UpkeepItem): string {
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

const ownName = (i: UpkeepItem) => i.cycle.name === i.entity.title || i.entity.object === 'routine';

/** "Keep in touch · every 14 days · last 22 days ago" — the record is the title, the cycle leads the subtitle. */
export function subtitleFor(i: UpkeepItem): string {
  const last = i.cycle.lastDoneAt ? `last ${formatDistanceToNowStrict(i.cycle.lastDoneAt, { roundingMethod: 'floor' })} ago` : null;
  return [ownName(i) ? null : i.cycle.name, describeCycle(i.cycle), last].filter(Boolean).join(' · ');
}

export const titleFor = (i: UpkeepItem) => (ownName(i) ? i.entity.title : `${i.entity.title} · ${i.cycle.name}`);

/** Done with a cost (and odometer for meter cycles); the cost can be filed as an expense. */
export function DoneWithCostSheet({ item, onClose }: { item: UpkeepItem | null; onClose: () => void }) {
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
  const hasFinance = os.registry.objects.has('transaction');
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


const UNITS: CycleUnit[] = ['day', 'week', 'month', 'year'];

/** Add or edit a cycle on a record: how it repeats, when it's next due, what it usually costs. */
export function CycleSheet({ entity, cycle, visible, onClose }: { entity: ObjectRecord; cycle?: Cycle | null; visible: boolean; onClose: () => void }) {
  const os = useOS();
  const toast = useToast();
  const hasMeter = !!os.registry.objects.get(entity.object)?.meters?.length;
  const [name, setName] = useState('');
  const [kind, setKind] = useState<CycleKind>('interval');
  const [everyN, setEveryN] = useState(1);
  const [everyUnit, setEveryUnit] = useState<CycleUnit>('month');
  const [repeats, setRepeats] = useState(true);
  const [meterEvery, setMeterEvery] = useState<number | undefined>(undefined);
  const [due, setDue] = useState<string | number | undefined>(undefined);
  const [cost, setCost] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!visible) return;
    setName(cycle?.name ?? '');
    setKind(cycle?.kind ?? 'interval');
    setEveryN(cycle?.everyN ?? 1);
    setEveryUnit(cycle?.everyUnit ?? 'month');
    setRepeats(cycle ? cycle.everyN != null : true);
    setMeterEvery(cycle?.meterEvery ?? undefined);
    setDue(cycle?.nextDueAt ?? undefined);
    setCost(cycle?.costEstimate ?? undefined);
  }, [visible, cycle?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const usesTime = kind !== 'meter';
  const usesMeter = kind === 'meter' || kind === 'either';
  const periodic = usesTime && (kind !== 'fixed' || repeats);
  const dueAt = typeof due === 'number' ? due : dateField(due);
  const valid = name.trim().length > 0 && (!usesMeter || !!meterEvery) && (periodic || kind === 'meter' || dueAt != null);
  const save = () => {
    const rule = { name: name.trim(), kind, everyN: periodic ? everyN : null, everyUnit: periodic ? everyUnit : null, meterEvery: usesMeter ? meterEvery ?? null : null, meter: usesMeter ? 'odometer' : null, costEstimate: cost ?? null };
    if (cycle) {
      os.cycles.update(cycle.id, rule);
      if (dueAt !== cycle.nextDueAt) os.cycles.setNextDue(cycle.id, { nextDueAt: dueAt });
      toast.show({ message: `${rule.name} updated`, icon: 'check' });
    } else {
      const c = os.cycles.create({ entityId: entity.id, ...rule, nextDueAt: dueAt ?? null });
      toast.show({ message: `${rule.name} added`, icon: 'repeat', undo: () => os.cycles.remove(c.id) });
    }
    onClose();
  };
  const kinds: Array<{ value: CycleKind; label: string }> = [
    { value: 'interval', label: 'After done' },
    { value: 'fixed', label: 'On a date' },
    ...(hasMeter ? [{ value: 'meter' as const, label: 'By km' }, { value: 'either' as const, label: 'Time or km' }] : []),
  ];
  return (
    <Sheet visible={visible} onClose={onClose} title={cycle ? 'Edit cycle' : 'New cycle'} footer={<Button title={cycle ? 'Save' : 'Add cycle'} icon="check" block disabled={!valid} onPress={save} />}>
      <TextField label="What recurs" value={name} onChange={setName} placeholder="Service, wash, renew, call…" />
      <FormField label="Repeats">
        <Segmented value={kind} onChange={setKind} options={kinds} />
      </FormField>
      {kind === 'fixed' ? <SwitchField label="Repeats on a schedule" hint="Off for a one-off date, like a passport expiry" value={repeats} onChange={setRepeats} /> : null}
      {periodic ? (
        <FormField label="Every">
          <View style={{ gap: 10 }}>
            <NumberField value={everyN} onChange={(v) => setEveryN(Math.max(1, Math.round(v ?? 1)))} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {UNITS.map((u) => (
                <FilterChip key={u} label={`${u}${everyN === 1 ? '' : 's'}`} selected={everyUnit === u} onPress={() => setEveryUnit(u)} />
              ))}
            </View>
          </View>
        </FormField>
      ) : null}
      {usesMeter ? <NumberField label="Every (km)" unit="km" value={meterEvery} onChange={setMeterEvery} placeholder="10000" /> : null}
      {usesTime ? <DateField label={kind === 'fixed' && !repeats ? 'Date' : 'Next due'} value={due} onChange={setDue} hint={kind === 'interval' ? 'Leave empty to count from the next time it’s done' : undefined} /> : null}
      <MoneyField label="Usually costs" value={cost} onChange={setCost} hint="Shows in Upkeep’s “this month will cost”" />
    </Sheet>
  );
}

/** Record page › Cycles: each cycle with where it stands, its stats and recent history. */
export function CyclesSection({ entity }: { entity: ObjectRecord }) {
  const os = useOS();
  const toast = useToast();
  const def = os.registry.objects.get(entity.object);
  const items = useLive((o) => o.cycles.forEntity(entity.id).map((cycle) => ({ cycle, entity, def, status: o.cycles.status(cycle) })), [entity.id]);
  const [editing, setEditing] = useState<Cycle | null | 'new'>(null);
  const [active, setActive] = useState<UpkeepItem | null>(null);
  const [costFor, setCostFor] = useState<UpkeepItem | null>(null);
  const done = (i: UpkeepItem) => {
    const d = logDone(os, i.cycle.id);
    toast.show({ message: `${i.cycle.name} done`, icon: 'check', undo: () => undoLoggedDone(os, d) });
  };
  return (
    <Section title="Cycles" meta={items.length ? String(items.length) : undefined} action="Add" onAction={() => setEditing('new')}>
      {items.length === 0 ? (
        <EmptyState icon="repeat" tint="upkeep" line="Nothing recurring on this yet — a service, a wash, a renewal." action="Add a cycle" onAction={() => setEditing('new')} bare />
      ) : (
        <RowList>
          {items.map((i) => (
            <CycleCard key={i.cycle.id} item={i} onDone={() => done(i)} onMore={() => setActive(i)} />
          ))}
        </RowList>
      )}
      <ActionSheet
        visible={!!active}
        onClose={() => setActive(null)}
        title={active?.cycle.name}
        actions={
          active
            ? [
                { label: 'Done, with cost…', icon: 'cash' as const, onPress: () => setCostFor(active) },
                { label: 'Edit schedule', icon: 'edit' as const, onPress: () => setEditing(active.cycle) },
                { label: 'Snooze a day', icon: 'clock' as const, onPress: () => os.cycles.snooze(active.cycle.id, Date.now() + 86_400_000) },
                ...(active.cycle.everyN || active.cycle.meterEvery ? [{ label: 'Skip this one', icon: 'arrow-right' as const, onPress: () => os.cycles.skip(active.cycle.id) }] : []),
                {
                  label: 'Remove cycle',
                  icon: 'trash' as const,
                  destructive: true,
                  onPress: () => {
                    const id = active.cycle.id;
                    os.cycles.remove(id);
                    toast.show({ message: `${active.cycle.name} removed`, icon: 'trash', undo: () => os.cycles.restore(id) });
                  },
                },
              ]
            : []
        }
      />
      <CycleSheet entity={entity} cycle={editing === 'new' ? null : editing} visible={editing !== null} onClose={() => setEditing(null)} />
      <DoneWithCostSheet item={costFor} onClose={() => setCostFor(null)} />
    </Section>
  );
}

function CycleCard({ item, onDone, onMore }: { item: UpkeepItem; onDone: () => void; onMore: () => void }) {
  const os = useOS();
  const t = useTheme();
  const stats = useLive((o) => o.cycles.stats(item.cycle.id), [item.cycle.id]);
  const late = item.status.state === 'overdue';
  const line = [
    stats.count ? `Done ${stats.count}×` : 'Not logged yet',
    stats.avgIntervalDays ? `about every ${Math.round(stats.avgIntervalDays)} d` : null,
    stats.totalCost ? `${os.format.currency(stats.totalCost)} spent` : null,
    stats.onTimeRate != null && stats.count > 1 ? `${Math.round(stats.onTimeRate * 100)}% on time` : null,
  ].filter(Boolean).join(' · ');
  return (
    <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.tile, padding: 16, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="rowTitle" numberOfLines={1}>
            {item.cycle.name}
          </Text>
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {describeCycle(item.cycle)}
            {item.cycle.nextDueAt ? ` · next ${format(item.cycle.nextDueAt, 'EEE d MMM')}` : ''}
            {item.cycle.nextDueMeter ? ` · at ${item.cycle.nextDueMeter.toLocaleString('en-IN')} km` : ''}
          </Text>
        </View>
        {dueLabel(item) ? <Chip label={dueLabel(item)} small tone={late ? 'alert' : item.status.state === 'today' || item.status.state === 'soon' ? 'accent' : 'neutral'} /> : null}
      </View>
      {item.status.progress != null ? <ProgressBar value={item.status.progress} color={late ? t.c.alert.coral : t.tints.upkeep.ink} height={6} accessibilityLabel={`${Math.round(item.status.progress * 100)}% of the way to due`} /> : null}
      <Text variant="caption" color="secondary">
        {line}
      </Text>
      {stats.history.length ? (
        <RowList>
          {stats.history.slice(0, 3).map((h) => (
            <RowItem key={h.eventId} icon="check" iconTone="plain" title={format(h.at, 'EEE d MMM yyyy')} subtitle={[h.note, h.meter ? `${h.meter.toLocaleString('en-IN')} km` : null, h.late ? 'late' : null].filter(Boolean).join(' · ') || null} value={h.cost ? os.format.currency(h.cost) : null} />
          ))}
        </RowList>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {item.status.state !== 'unscheduled' || item.cycle.kind !== 'fixed' ? <Button title="Done" icon="check" size="sm" onPress={onDone} /> : null}
        <Button title="More" icon="more" size="sm" variant="secondary" onPress={onMore} />
      </View>
    </View>
  );
}

/** Log a meter reading (odometer); cycles on the record recompute from it. */
export function MeterSheet({ visible, onClose, entity, meter }: { visible: boolean; onClose: () => void; entity: ObjectRecord; meter: { meter: string; label: string; unit: string } }) {
  const os = useOS();
  const toast = useToast();
  const latest = useLive((o) => o.cycles.latestMeter(entity.id, meter.meter), [entity.id, meter.meter]);
  const [value, setValue] = useState<number | undefined>(undefined);
  const save = () => {
    const id = os.cycles.logMeter(entity.id, value!, { meter: meter.meter, unit: meter.unit, label: meter.label });
    onClose();
    setValue(undefined);
    toast.show({ message: `${meter.label} ${value!.toLocaleString('en-IN')} ${meter.unit}`, icon: 'gauge', undo: () => os.cycles.removeReading(id) });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={`Log ${meter.label.toLowerCase()}`} footer={<Button title="Save reading" icon="check" block disabled={value == null || value < 0} onPress={save} />}>
      <NumberField label={meter.label} value={value} onChange={setValue} unit={meter.unit} hint={latest != null ? `Last reading ${latest.toLocaleString('en-IN')} ${meter.unit}` : undefined} autoFocus />
    </Sheet>
  );
}
