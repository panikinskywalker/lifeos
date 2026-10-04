import { View } from 'react-native';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Section, StatTrio, Text, RowList } from '@ui/kit';
import { Sparkline } from '@ui/components/charts';
import { RecordRow } from '@ui/components/RecordRow';
import type { InvestmentData } from '@modules/finance/types';

/** An Investment's page (R1): what went in, what it is worth now and the gain, the value's history from its meter readings, SIP and maturity, its transactions. */
export function InvestmentHero({ entity, ctx }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) {
  const t = useTheme();
  const inv = entity as ObjectRecord<InvestmentData>;
  const d = inv.data;
  const value = d.currentValue ?? d.invested;
  const gain = d.currentValue != null ? d.currentValue - d.invested : null;
  const history = useLive((os) => os.cycles.readings(entity.id, 'value', 60).map((r) => r.value).reverse(), [entity.id, entity.version]);
  const txns = useLive((os) => os.records.query('transaction', { filter: { and: [{ field: 'data.investmentId', op: 'eq', value: entity.id }] }, sort: [{ field: 'data.date', dir: 'desc' }] }, { limit: 12 }), [entity.id]);
  const money = (n: number) => ctx.format.currency(n, d.currency);
  return (
    <View style={{ gap: 16 }}>
      <StatTrio
        stats={[
          { label: 'Invested', value: money(d.invested) },
          { label: 'Now', value: money(value), caption: d.currentValue == null ? 'no value yet' : undefined },
          { label: 'Gain', value: gain == null ? '—' : `${gain >= 0 ? '+' : '−'}${money(Math.abs(gain))}`, caption: gain != null && d.invested ? `${((gain / d.invested) * 100).toFixed(1)}%` : undefined, tone: gain == null ? undefined : gain >= 0 ? 'ok' : 'alert' },
        ]}
      />
      {history.length > 1 ? (
        <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.tile, padding: 14, gap: 6 }}>
          <Text variant="labelCaps" color="secondary">Value over time</Text>
          <Sparkline values={history} height={56} color={t.tints.finance.ink} />
        </View>
      ) : null}
      {d.sip || d.maturesOn ? (
        <Text variant="caption" color="secondary">
          {[d.sip ? `SIP ${money(d.sip)} a month${d.sipDay ? ` on the ${d.sipDay}` : ''}` : null, d.maturesOn ? `Matures ${ctx.format.date(d.maturesOn, 'medium')}` : null].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
      {txns.length ? (
        <Section title="Transactions" meta={String(txns.length)}>
          <RowList>
            {txns.map((x) => (
              <RecordRow key={x.id} entity={x} />
            ))}
          </RowList>
        </Section>
      ) : null}
    </View>
  );
}
