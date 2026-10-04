import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { OverviewBlock, ValueFormat } from '@core/dashboard/overview';
import { useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { TintKey } from '@ui/theme/tokens';
import { ColumnChart, HeatMap, ProgressBar, RowItem, RowList, Section, StackedBar, StatTrio, Text } from '@ui/kit';

const compact = (n: number) => (n >= 100000 ? `${(n / 100000).toFixed(n >= 1000000 ? 0 : 1)}L` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

export function formatValue(v: number, f: ValueFormat | undefined, currency: (n: number) => string): string {
  if (f === 'money') return currency(v);
  if (f === 'hours') return `${Math.floor(v)}h ${String(Math.round((v % 1) * 60)).padStart(2, '0')}m`;
  if (f === 'percent') return `${Math.round(v * 100)}%`;
  return Math.round(v).toLocaleString('en-IN');
}

/** A module's overview, drawn: stats, charts, progress, lists that open their records. */
export function OverviewBlocks({ blocks, tint }: { blocks: OverviewBlock[]; tint: TintKey }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const ink = t.tints[tint].ink;
  const open = (type?: string, id?: string) => (type && id ? router.push(`/entity/${type}/${id}` as never) : undefined);
  return (
    <View style={{ gap: 18 }}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'stats': {
            // Three to a row reads best; more wrap into a second row.
            const rows: (typeof b.items)[] = [];
            for (let k = 0; k < b.items.length; k += 3) rows.push(b.items.slice(k, k + 3));
            return (
              <View key={i} style={{ gap: 10 }}>
                {rows.map((r, k) => (
                  <StatTrio key={k} stats={r.map((s) => ({ label: s.label, value: s.value, caption: s.sub ?? undefined, tone: s.tone }))} />
                ))}
              </View>
            );
          }
          case 'bars':
            return (
              <Section key={i} title={b.title}>
                <ColumnChart series={[{ label: b.title, color: ink, values: b.values }]} labels={b.labels} highlight={b.values.length - 1} height={150} formatY={(n) => (b.format === 'money' ? `₹${compact(n)}` : compact(n))} accessibilityLabel={`${b.title}: ${b.values.map((v, k) => `${b.labels[k]} ${formatValue(v, b.format, os.format.currency)}`).join(', ')}`} />
                {b.note ? <Text variant="caption" color="secondary">{b.note}</Text> : null}
              </Section>
            );
          case 'breakdown': {
            const palette = t.c.chart;
            return (
              <Section key={i} title={b.title}>
                <StackedBar parts={b.parts.map((p, k) => ({ label: p.label, value: p.value, color: t.paletteColor(p.color) ?? palette[k % palette.length]!, display: formatValue(p.value, b.format, os.format.currency) }))} />
              </Section>
            );
          }
          case 'progress':
            return (
              <Section key={i} title={b.title}>
                <View style={{ gap: 14 }}>
                  {b.items.map((p, k) => (
                    <Pressable key={k} accessibilityRole={p.entityId ? 'button' : undefined} disabled={!p.entityId} onPress={() => open(p.type, p.entityId)} style={{ gap: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                        <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{p.label}</Text>
                        <Text variant="caption" color={p.over ? t.c.alert.coralText : 'secondary'}>{p.sub ?? `${Math.round(p.ratio * 100)}%`}</Text>
                      </View>
                      <ProgressBar value={p.ratio} color={p.over ? t.c.alert.coral : ink} accessibilityLabel={`${p.label} ${Math.round(p.ratio * 100)}%`} />
                    </Pressable>
                  ))}
                </View>
              </Section>
            );
          case 'list':
            return (
              <Section key={i} title={b.title} action={b.more?.label} onAction={b.more ? () => router.push(`/entity/${b.more!.type}` as never) : undefined}>
                {b.items.length ? (
                  <RowList>
                    {b.items.map((r, k) => (
                      <RowItem key={`${r.entityId ?? ''}${k}`} title={r.title} subtitle={r.sub ?? undefined} value={r.value ?? undefined} valueTone={r.tone === 'alert' ? 'alert' : 'default'} meta={undefined} chevron={!!r.entityId} onPress={r.entityId ? () => open(r.type, r.entityId) : undefined} />
                    ))}
                  </RowList>
                ) : (
                  <Text variant="caption" color="secondary">{b.empty ?? 'Nothing here yet.'}</Text>
                )}
              </Section>
            );
          case 'heat':
            return (
              <Section key={i} title={b.title}>
                <HeatMap days={b.days} color={ink} accessibilityLabel={b.title} />
              </Section>
            );
        }
      })}
    </View>
  );
}
