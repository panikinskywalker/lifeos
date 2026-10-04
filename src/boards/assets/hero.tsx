import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { DAY, describeCycle } from '@core/cycles/schedule';
import type { UpkeepItem } from '@core/cycles/upkeep';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { AttentionCard, Card, ProgressBar, QuickActions, RowItem, RowList, Section, StatTrio, Text, useToast } from '@ui/kit';
import { DoneWithCostSheet, dueLabel, MeterSheet } from '@ui/components/cycles';

const km = (n: number) => `${Math.round(n).toLocaleString('en-IN')}`;

/** Upkeep items (cycle + status) for one record. */
export function useRecordCycles(entity: ObjectRecord): UpkeepItem[] {
  const os = useOS();
  const def = os.registry.objects.get(entity.type);
  return useLive((o) => o.cycles.forEntity(entity.id).map((cycle) => ({ cycle, entity, def, status: o.cycles.status(cycle) })), [entity.id, entity.version]);
}

/** The cycle that most needs a look within `withinDays` (overdue first), optionally skipping some templates. */
export function mostUrgent(items: UpkeepItem[], withinDays: number, skip: string[] = []): UpkeepItem | null {
  const due = items.filter((i) => !skip.includes(i.cycle.template ?? '') && (i.status.state === 'overdue' || (i.status.daysLeft != null && i.status.daysLeft <= withinDays)));
  due.sort((a, b) => (a.status.daysLeft ?? -999) - (b.status.daysLeft ?? -999));
  return due[0] ?? null;
}

export function whenText(i: UpkeepItem): string {
  const d = i.status.daysLeft;
  const date = i.cycle.nextDueAt ? ` · ${format(i.cycle.nextDueAt, 'EEE d MMM')}` : '';
  if (d == null) return dueLabel(i);
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue${date}`;
  if (d === 0) return `Due today${date}`;
  return `Due in ${d} day${d === 1 ? '' : 's'}${date}`;
}

/**
 * Vehicle (Stitch "Record · Vehicle"): odometer / insurance / spend trio,
 * service cadence on both clocks, what needs attention, quick actions and
 * the service log.
 */
export function VehicleHero({ entity, ctx }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const items = useRecordCycles(entity);
  const [meter, setMeter] = useState(false);
  const [costFor, setCostFor] = useState<UpkeepItem | null>(null);
  const year = new Date().getFullYear();
  const readings = useLive((o) => o.cycles.readings(entity.id, 'odometer', 200), [entity.id]);
  const spend = useLive((o) => o.records.aggregate('transaction', { filter: { and: [{ field: 'relation.vehicle', op: 'relatedTo', value: entity.id }, { field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: `${year}-01-01` }] } }, { sum: ['data.amount'], count: true }), [entity.id]);
  const done = useLive((o) => o.records.timeline.forEntity(entity.id, 200).filter((e) => e.kind === 'cycle.done'), [entity.id]);

  const latest = readings[0]?.value ?? null;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const before = readings.find((r) => r.readAt < monthStart)?.value ?? null;
  const thisMonth = latest != null && before != null ? latest - before : null;
  const service = items.find((i) => i.cycle.template === 'vehicle.service') ?? null;
  const insurance = items.find((i) => i.cycle.template === 'vehicle.insurance') ?? null;
  const urgent = mostUrgent(items, 30, ['vehicle.service']) ?? (service && (service.status.state === 'overdue' || service.status.state === 'soon') ? service : null);

  return (
    <View style={{ gap: 16 }}>
      <StatTrio
        stats={[
          { label: 'Odometer', value: latest != null ? km(latest) : '—', unit: latest != null ? 'km' : undefined, caption: thisMonth ? `+${km(thisMonth)} this month` : latest == null ? 'Tap to log' : `read ${format(readings[0]!.readAt, 'd MMM')}`, tone: thisMonth ? 'ok' : undefined, onPress: () => setMeter(true) },
          insurance ? { label: 'Insurance', value: insurance.status.daysLeft != null ? String(Math.max(0, insurance.status.daysLeft)) : '—', unit: 'days', caption: insurance.cycle.nextDueAt ? `Exp ${format(insurance.cycle.nextDueAt, 'd MMM')}` : undefined, tone: insurance.status.daysLeft != null && insurance.status.daysLeft <= 30 ? 'alert' : undefined } : { label: 'Cycles', value: String(items.length), caption: 'tracked' },
          { label: `${year} spend`, value: ctx.format.currency(spend['sum_data.amount'] ?? 0), caption: `YTD · ${spend.count}`, onPress: () => router.push('/entity/transaction') },
        ]}
      />

      {service ? (
        <Card icon="wrench" tint="upkeep" title="Service cadence" meta={dueLabel(service) || undefined}>
          <Text variant="caption" color="secondary">
            {describeCycle(service.cycle)}
            {service.cycle.lastDoneAt ? ` · last ${format(service.cycle.lastDoneAt, 'd MMM yyyy')}` : ''}
          </Text>
          {service.cycle.nextDueAt && service.cycle.lastDoneAt ? (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>Time</Text>
                <Text variant="labelMicro" color="secondary">
                  {Math.max(0, Math.round((Date.now() - service.cycle.lastDoneAt) / DAY))} of {Math.round((service.cycle.nextDueAt - service.cycle.lastDoneAt) / DAY)} days
                </Text>
              </View>
              <ProgressBar value={(Date.now() - service.cycle.lastDoneAt) / (service.cycle.nextDueAt - service.cycle.lastDoneAt)} color={t.tints.upkeep.ink} height={6} accessibilityLabel="Time since last service" />
            </View>
          ) : null}
          {service.cycle.nextDueMeter != null && service.cycle.meterEvery && latest != null ? (
            <View style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>Distance</Text>
                <Text variant="labelMicro" color="secondary">
                  {km(Math.max(0, service.cycle.meterEvery - (service.cycle.nextDueMeter - latest)))} of {km(service.cycle.meterEvery)} km
                </Text>
              </View>
              <ProgressBar value={1 - (service.cycle.nextDueMeter - latest) / service.cycle.meterEvery} color={service.status.meterLeft != null && service.status.meterLeft <= 0 ? t.c.alert.coral : t.c.accent.gold} height={6} accessibilityLabel="Distance since last service" />
            </View>
          ) : null}
          {service.status.state === 'unscheduled' ? (
            <Text variant="caption" color="secondary">
              No service logged yet — record the last one to start the countdown.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {urgent ? (
        <AttentionCard
          urgent={urgent.status.state === 'overdue' || (urgent.status.daysLeft != null && urgent.status.daysLeft <= 7)}
          title={urgent.cycle.name}
          meta={whenText(urgent)}
          estimate={urgent.cycle.costEstimate ? ctx.format.currency(urgent.cycle.costEstimate) : undefined}
          primary={{ label: urgent.cycle.template === 'vehicle.service' ? 'Serviced' : 'Renewed', icon: 'check', onPress: () => setCostFor(urgent) }}
          secondary={{
            label: 'Snooze',
            icon: 'clock',
            onPress: () => {
              const prev = urgent.cycle.snoozedUntil;
              ctx.cycles.snooze(urgent.cycle.id, Date.now() + 3 * DAY);
              toast.show({ message: 'Snoozed 3 days', icon: 'clock', undo: () => void ctx.cycles.update(urgent.cycle.id, { snoozedUntil: prev }) });
            },
          }}
        />
      ) : null}

      <QuickActions
        actions={[
          { label: 'Log odometer', icon: 'gauge', onPress: () => setMeter(true) },
          ...(service ? [{ label: 'Record service', icon: 'wrench' as const, onPress: () => setCostFor(service) }] : []),
          { label: 'Add expense', icon: 'receipt', onPress: () => router.push('/entity/transaction/new') },
          { label: 'Add document', icon: 'file', onPress: () => router.push('/entity/document/new') },
        ]}
      />

      {done.length ? (
        <Section title="Service & upkeep log" meta={`${done.length}`}>
          <RowList>
            {done.slice(0, 6).map((e) => (
              <RowItem key={e.id} icon="check" tint="upkeep" title={e.title.replace(/ done$/, '')} subtitle={[format(e.occurredAt, 'EEE d MMM yyyy'), e.meta.meter ? `${km(Number(e.meta.meter))} km` : null, e.body].filter(Boolean).join(' · ')} value={e.meta.cost ? ctx.format.currency(Number(e.meta.cost)) : null} strong />
            ))}
          </RowList>
        </Section>
      ) : null}

      <MeterSheet visible={meter} onClose={() => setMeter(false)} entity={entity} meter={{ meter: 'odometer', label: 'Odometer', unit: 'km' }} />
      <DoneWithCostSheet item={costFor} onClose={() => setCostFor(null)} />
    </View>
  );
}
