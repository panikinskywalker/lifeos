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
import { AttentionCard, Card, Chip, ProgressBar, QuickActions, RowItem, RowList, Section, Segmented, StatTrio, Text, useToast } from '@ui/kit';
import { DoneWithCostSheet, dueLabel, MeterSheet } from '@ui/components/cycles';
import { CLOTHES_STATES, clothesStateOf, setClothesState, type AssetData, type ClothesState } from '@modules/assets';

const km = (n: number) => `${Math.round(n).toLocaleString('en-IN')}`;

/** Upkeep items (cycle + status) for one record. */
export function useRecordCycles(entity: ObjectRecord<any>): UpkeepItem[] { // eslint-disable-line @typescript-eslint/no-explicit-any
  const os = useOS();
  const def = os.registry.objects.get(entity.object);
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
 * The Asset page's sections (R7a; a first pass from the kit until the
 * NR-Assets-* artboards): a vehicle gets its km and next service, clothing
 * its state and space, anything else its warranty and service.
 */
export function AssetHero({ entity, ctx }: { entity: ObjectRecord<AssetData>; ctx: LifeOSContext }) {
  if (entity.data.category === 'vehicle') return <VehicleHero entity={entity} ctx={ctx} />;
  if (entity.data.category === 'clothing') return <ClothingCard entity={entity} />;
  return <ThingHero entity={entity} />;
}

/** Warranty as a bar from bought on to the end, with days left. */
function WarrantyCard({ entity }: { entity: ObjectRecord<AssetData> }) {
  const t = useTheme();
  const until = entity.data.warrantyUntil?.slice(0, 10);
  if (!until) return null;
  const end = new Date(`${until}T12:00:00`).getTime();
  const start = entity.data.purchaseDate ? new Date(`${entity.data.purchaseDate.slice(0, 10)}T12:00:00`).getTime() : null;
  const left = Math.round((end - Date.now()) / DAY);
  const meta = left < 0 ? `ended ${format(end, 'd MMM yyyy')}` : `${left} day${left === 1 ? '' : 's'} left`;
  return (
    <Card icon="shield" tint="upkeep" title="Warranty" meta={meta}>
      <Text variant="caption" color="secondary">
        {left < 0 ? 'Out of warranty' : `Until ${format(end, 'EEE d MMM yyyy')}`}
        {start ? ` · bought ${format(start, 'd MMM yyyy')}` : ''}
      </Text>
      {start && end > start ? <ProgressBar value={(Date.now() - start) / (end - start)} color={left >= 0 && left <= 30 ? t.c.alert.coral : t.tints.upkeep.ink} height={6} accessibilityLabel="Warranty used" /> : null}
    </Card>
  );
}

/** Service by months (and km for a vehicle): cadence, due, and Serviced. */
function ServiceCard({ item, onDone }: { item: UpkeepItem; onDone: () => void }) {
  return (
    <Card icon="wrench" tint="upkeep" title="Service" meta={dueLabel(item) || undefined}>
      <Text variant="caption" color="secondary">
        {describeCycle(item.cycle)}
        {item.cycle.lastDoneAt ? ` · last ${format(item.cycle.lastDoneAt, 'd MMM yyyy')}` : ''}
      </Text>
      {item.status.state === 'unscheduled' ? (
        <Text variant="caption" color="secondary">
          No service logged yet: record the last one to start the countdown.
        </Text>
      ) : null}
      <QuickActions actions={[{ label: 'Serviced', icon: 'check', onPress: onDone }]} gutter={0} />
    </Card>
  );
}

/** A device, an appliance, furniture: warranty and service (price and value are in the header). */
function ThingHero({ entity }: { entity: ObjectRecord<AssetData> }) {
  const router = useRouter();
  const items = useRecordCycles(entity);
  const [costFor, setCostFor] = useState<UpkeepItem | null>(null);
  const service = items.find((i) => i.cycle.template === 'asset.service') ?? null;
  return (
    <View style={{ gap: 16 }}>
      <WarrantyCard entity={entity} />
      {service ? <ServiceCard item={service} onDone={() => setCostFor(service)} /> : null}
      <QuickActions
        actions={[
          { label: 'Add receipt', icon: 'receipt', onPress: () => router.push({ pathname: '/entity/[type]/new', params: { type: 'document', assetId: entity.id, title: `${entity.title} receipt` } } as never) },
          { label: 'Add expense', icon: 'rupee', onPress: () => router.push('/entity/transaction/new') },
        ]}
      />
      <DoneWithCostSheet item={costFor} onClose={() => setCostFor(null)} />
    </View>
  );
}

/** Clothing: its state (clean · in the wash · packed) and the space it's kept in. */
function ClothingCard({ entity }: { entity: ObjectRecord<AssetData> }) {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const state = clothesStateOf(entity.data);
  const space = useLive((o) => (entity.data.spaceId ? o.records.get(entity.data.spaceId) : null), [entity.data.spaceId]);
  const set = (s: ClothesState) => {
    if (s === state) return;
    const undo = setClothesState(os, entity.id, s);
    toast.show({ message: `${entity.title}: ${CLOTHES_STATES.find((x) => x.value === s)!.label.toLowerCase()}`, icon: 'shirt', undo });
  };
  return (
    <Card icon="shirt" tint="upkeep" title="Clothes" meta={space ? `Kept in ${space.title}` : 'Kept nowhere yet'}>
      <Segmented<ClothesState> options={CLOTHES_STATES} value={state} onChange={set} />
      {space ? (
        <View style={{ flexDirection: 'row' }}>
          <Chip label={space.title} icon="home" onPress={() => router.push({ pathname: '/module/[id]/[page]', params: { id: 'inventory', page: 'space', space: space.id } } as never)} />
        </View>
      ) : null}
    </Card>
  );
}

/**
 * Vehicle (Stitch "Record · Vehicle"): odometer / insurance / spend trio,
 * service cadence on both clocks (km and months), what needs attention,
 * quick actions, the warranty and the service log.
 */
function VehicleHero({ entity, ctx }: { entity: ObjectRecord<AssetData>; ctx: LifeOSContext }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const items = useRecordCycles(entity);
  const [meter, setMeter] = useState(false);
  const [costFor, setCostFor] = useState<UpkeepItem | null>(null);
  const year = new Date().getFullYear();
  const readings = useLive((o) => o.cycles.readings(entity.id, 'odometer', 200), [entity.id]);
  const spend = useLive((o) => o.records.aggregate('transaction', { filter: { and: [{ field: 'relation.asset', op: 'relatedTo', value: entity.id }, { field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: `${year}-01-01` }] } }, { sum: ['data.amount'], count: true }), [entity.id]);
  const done = useLive((o) => o.records.timeline.forEntity(entity.id, 200).filter((e) => e.kind === 'cycle.done'), [entity.id]);

  const latest = readings[0]?.value ?? null;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const before = readings.find((r) => r.readAt < monthStart)?.value ?? null;
  const thisMonth = latest != null && before != null ? latest - before : null;
  const service = items.find((i) => i.cycle.template === 'asset.service') ?? null;
  const insurance = items.find((i) => i.cycle.template === 'vehicle.insurance' || /insurance/i.test(i.cycle.name)) ?? null;
  const urgent = mostUrgent(items, 30, ['asset.service']) ?? (service && (service.status.state === 'overdue' || service.status.state === 'soon') ? service : null);

  return (
    <View style={{ gap: 16 }}>
      <StatTrio
        stats={[
          { label: 'Odometer', value: latest != null ? km(latest) : '–', unit: latest != null ? 'km' : undefined, caption: thisMonth ? `+${km(thisMonth)} this month` : latest == null ? 'Tap to log' : `read ${format(readings[0]!.readAt, 'd MMM')}`, tone: thisMonth ? 'ok' : undefined, onPress: () => setMeter(true) },
          insurance ? { label: 'Insurance', value: insurance.status.daysLeft != null ? String(Math.max(0, insurance.status.daysLeft)) : '–', unit: 'days', caption: insurance.cycle.nextDueAt ? `Exp ${format(insurance.cycle.nextDueAt, 'd MMM')}` : undefined, tone: insurance.status.daysLeft != null && insurance.status.daysLeft <= 30 ? 'alert' : undefined } : { label: 'Cycles', value: String(items.length), caption: 'tracked' },
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
              No service logged yet: record the last one to start the countdown.
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
          primary={{ label: urgent.cycle.template === 'asset.service' ? 'Serviced' : urgent.cycle.template === 'asset.warranty' ? 'Noted' : 'Renewed', icon: 'check', onPress: () => setCostFor(urgent) }}
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

      <WarrantyCard entity={entity} />

      {done.length ? (
        <Section title="Service & upkeep log" meta={`${done.length}`}>
          <RowList>
            {done.slice(0, 6).map((e) => (
              <RowItem key={e.id} icon="check" tint="upkeep" title={e.title.replace(/ done$/, '')} subtitle={[format(e.occurredAt, 'EEE d MMM yyyy'), e.meta.meter ? `${km(Number(e.meta.meter))} km` : null, e.body].filter(Boolean).join(' · ')} value={e.meta.cost ? ctx.format.currency(Number(e.meta.cost)) : null} strong />
            ))}
          </RowList>
        </Section>
      ) : null}

      <MeterSheet visible={meter} onClose={() => setMeter(false)} entity={entity as unknown as ObjectRecord} meter={{ meter: 'odometer', label: 'Odometer', unit: 'km' }} />
      <DoneWithCostSheet item={costFor} onClose={() => setCostFor(null)} />
    </View>
  );
}
