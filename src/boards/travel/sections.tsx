import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Entity } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { Card, Row, SectionHeader, Stat, Text } from '@ui/components/primitives';
import { ProgressBar, StackedBar } from '@ui/components/charts';
import { EntityRow } from '@ui/components/EntityRow';
import { categoryOf } from '@modules/finance/types';
import { type TripData } from '@modules/travel';
import { palette } from '@ui/theme/tokens';

const TRAVEL_COLOR = palette.cyan;

export function TripSection({ entity, ctx }: { entity: Entity<any>; ctx: LifeOSContext }) {
  const router = useRouter();
  const trip = entity as Entity<TripData>;
  const data = useLive(
    (os) => {
      const filter = { and: [{ field: 'data.tripId', op: 'eq' as const, value: entity.id }, { field: 'data.kind', op: 'eq' as const, value: 'expense' }] };
      return {
        total: os.entities.aggregate('transaction', { filter }, { sum: ['data.amount'], count: true }),
        byCat: os.entities.groupBy('transaction', { filter }, 'data.category', { sum: ['data.amount'] }),
        recent: os.entities.query('transaction', { filter, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 6 }),
        docs: os.relations.forEntity(entity.id, 'trip').filter((r) => r.other.type === 'document' || r.other.type === 'event'),
      };
    },
    [entity.id],
  );
  const spent = data.total['sum_data.amount'];
  const days = trip.data.startDate && trip.data.endDate ? Math.round((new Date(trip.data.endDate).getTime() - new Date(trip.data.startDate).getTime()) / 86400000) + 1 : null;
  const until = trip.data.startDate ? Math.ceil((new Date(trip.data.startDate).getTime() - Date.now()) / 86400000) : null;
  return (
    <View style={{ gap: 16 }}>
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Stat value={ctx.format.currency(spent)} label={trip.data.budget ? `of ${ctx.format.currency(trip.data.budget)} budget` : `${data.total.count} expenses`} small />
          </View>
          {until != null && until > 0 ? (
            <View style={{ flex: 1 }}>
              <Stat value={`${until}`} unit="days" label="Until departure" small />
            </View>
          ) : days ? (
            <View style={{ flex: 1 }}>
              <Stat value={`${days}`} unit="days" label="Duration" small />
            </View>
          ) : null}
        </View>
        {trip.data.budget ? <ProgressBar progress={spent / trip.data.budget} color={TRAVEL_COLOR} /> : null}
        {data.byCat.length ? <StackedBar parts={data.byCat.map((c) => ({ value: c.values['sum_data.amount'], color: categoryOf(c.key ?? 'other').color ?? TRAVEL_COLOR }))} height={8} /> : null}
        {days && spent && until != null && until <= 0 ? (
          <Text variant="caption" color="secondary">
            {ctx.format.currency(spent / days)} per day
          </Text>
        ) : null}
      </Card>
      <View>
        <SectionHeader title="Expenses" icon="banknote" color={palette.green} action="Add" onAction={() => router.push({ pathname: '/entity/[type]/new', params: { type: 'transaction', tripId: entity.id, currency: trip.data.localCurrency ?? '' } })} />
        <Card padded={false}>
          {data.recent.length === 0 ? <Text color="tertiary" style={{ padding: 16 }}>No expenses linked yet. New transactions with this trip selected show up here.</Text> : data.recent.map((e, i) => <EntityRow key={e.id} entity={e} last={i === data.recent.length - 1} />)}
        </Card>
      </View>
      {data.docs.length ? (
        <View>
          <SectionHeader title="Bookings & documents" icon="doc" color={TRAVEL_COLOR} />
          <Card padded={false}>
            {data.docs.map((r, i) => (
              <Row key={r.relation.id} title={r.other.title} subtitle={ctx.registry.entityTypes.get(r.other.type)?.label} icon={ctx.registry.entityTypes.get(r.other.type)?.icon} iconColor={ctx.registry.colorFor(r.other.type)} last={i === data.docs.length - 1} onPress={() => router.push(`/entity/${r.other.type}/${r.other.id}`)} />
            ))}
          </Card>
        </View>
      ) : null}
    </View>
  );
}

