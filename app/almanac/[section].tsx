import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { almanacSections, type SectionId } from '@core/almanac/almanac';
import { METRICS, formatMetric, metricSeries } from '@core/dashboard/metrics';
import { useLive, useOS } from '@ui/hooks';
import type { TintKey } from '@ui/theme/tokens';
import { EmptyState, RowItem, RowList, Screen, Section } from '@ui/kit';
import { EntityRow } from '@ui/components/EntityRow';

const METRIC_ICON = { steps: 'shoe', sleep: 'moon', heart_rate: 'heart', resting_hr: 'heart', weight: 'scale', screen: 'signal', spend: 'wallet' } as const;

/** One Almanac section: its record types with counts (Body adds its metrics, Mind its dumps and memory), then what changed lately. */
export default function AlmanacSection() {
  const { section } = useLocalSearchParams<{ section: SectionId }>();
  const os = useOS();
  const router = useRouter();
  const s = useLive((o) => almanacSections(o).find((x) => x.id === section), [section]);
  const metrics = useLive((o) => (s?.metrics ?? []).map((id) => ({ id, week: metricSeries(o, id, 'week') })), [s?.metrics?.join()]);
  const dumps = useLive((o) => (section === 'mind' ? (o.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM dumps`)?.n ?? 0) : 0), [section]);
  const facts = useLive((o) => (section === 'mind' ? o.facts.list({ limit: 100000 }).length : 0), [section]);
  const recent = useLive((o) => (s?.rows.length ? o.entities.recent(8, s.rows.map((r) => r.type)) : []), [s?.rows.map((r) => r.type).join()]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/almanac'));
  if (!s) return <Screen title="Almanac" onBack={back}><EmptyState icon="library" line="No such section." /></Screen>;
  const tint = s.tint as TintKey;
  const nothing = !s.rows.length && !metrics.length && !dumps && !facts;
  return (
    <Screen title={s.label} subtitle={s.line} onBack={back}>
      {nothing ? <EmptyState icon={s.icon} tint={tint} line="Nothing here yet — the modules for this part of life aren’t on." /> : null}
      {metrics.length ? (
        <Section title="Measures">
          <RowList>
            {metrics.map(({ id, week }) => (
              <RowItem
                key={id}
                icon={METRIC_ICON[id]}
                tint={tint}
                title={METRICS[id].label}
                subtitle={week.value != null ? (METRICS[id].agg === 'sum' ? 'this week' : METRICS[id].agg === 'avg' ? 'a day, this week' : 'latest') : 'no data yet'}
                value={week.value != null ? formatMetric(id, week.value, os.format.currency) : '—'}
                valueTone={week.value != null ? 'default' : 'secondary'}
                chevron
                onPress={() => router.push(`/metric/${id}` as never)}
              />
            ))}
          </RowList>
        </Section>
      ) : null}
      {section === 'mind' ? (
        <Section title="What you’ve said">
          <RowList>
            <RowItem icon="brain" tint={tint} title="Dumps" subtitle="Everything you’ve dumped, word for word" value={String(dumps)} chevron onPress={() => router.push('/almanac/dumps' as never)} />
            <RowItem icon="sparkle" tint={tint} title="Facts" subtitle="One-line things it remembers, by who they’re about" value={String(facts)} chevron onPress={() => router.push('/memory')} />
          </RowList>
        </Section>
      ) : null}
      {s.rows.length ? (
        <Section title="Records">
          <RowList>
            {s.rows.map((r) => (
              <RowItem key={r.type} icon={r.icon} tint={tint} title={r.label} value={r.count.toLocaleString('en-IN')} valueTone={r.count ? 'default' : 'secondary'} chevron onPress={() => router.push(`/entity/${r.type}` as never)} />
            ))}
          </RowList>
        </Section>
      ) : null}
      {recent.length ? (
        <Section title="Recently changed">
          <RowList>
            {recent.map((e) => (
              <EntityRow key={e.id} entity={e} showType />
            ))}
          </RowList>
        </Section>
      ) : null}
    </Screen>
  );
}
