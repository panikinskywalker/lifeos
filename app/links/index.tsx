import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { mostLinked } from '@core/graph/read';
import { linkOverview } from '@core/graph/overview';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { linkColorForModule, tintForModule } from '@ui/theme/moduleTint';
import { EmptyState, RowItem, RowList, Screen, Section, Text, TextField } from '@ui/kit';
import { countUntil, LinkCloud, moduleName, TimeLapse } from '@ui/components/LinkCloud';

/**
 * Browse › Links (MODEL.md layer 5; the L6 artboard): find a record, then
 * everything linked as clouds by module (or placed freely with its links),
 * how many records and links, a time-lapse of them appearing in the order
 * they were filed, and the records that join up the most. Each record opens
 * its Links screen.
 */
export default function LinksEverything() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<'clusters' | 'free'>('clusters');
  const [module, setModule] = useState<string | null>(null);
  const o = useLive((x) => linkOverview(x, { points: 160 }), []);
  const rows = useLive((x) => mostLinked(x, 40), []);
  const first = o.recordTimes[0] ?? Date.now();
  const last = Math.max(Date.now(), o.recordTimes.at(-1) ?? 0);
  const [until, setUntil] = useState<number | null>(null);
  const cutoff = until ?? last;
  const hits = useLive((x) => (q.trim() ? x.records.search.search(q.trim(), { limit: 8 }).filter((h) => !x.registry.objects.get(h.object)?.hidden && h.object !== 'fact' && h.object !== 'dump') : []), [q]);
  const gutter = t.layout.gutter;
  const open = (id: string) => router.push(`/links/${id}` as never);
  const shownRows = useMemo(() => (module ? rows.filter((r) => r.module === module) : rows), [rows, module]);
  const pill = (text: string) => (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.07)', justifyContent: 'center' }}>
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary }}>{text}</Text>
    </View>
  );
  const chip = (key: string | null, text: string, color?: string) => {
    const on = module === key;
    return (
      <Pressable key={key ?? 'all'} onPress={() => setModule(key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: on ? t.c.fg.primary : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: on ? t.c.bg.ground : t.c.fg.secondary }}>{text}</Text>
      </Pressable>
    );
  };
  return (
    <Screen title="Links" subtitle="Browse › Links" onBack={() => (router.canGoBack() ? router.back() : router.replace('/browse'))}>
      <TextField label="Find a record" value={q} onChange={setQ} leading="search" placeholder="Karan, Toit, the Goa trip…" />
      {hits.length ? (
        <RowList>
          {hits.map((h) => {
            const def = os.registry.objects.get(h.object);
            return <RowItem key={h.id} icon={def?.icon ?? 'link'} tint={tintForModule(def?.module)} title={h.title} subtitle={def?.label} onPress={() => open(h.id)} />;
          })}
        </RowList>
      ) : null}
      {o.records ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
              {(['clusters', 'free'] as const).map((m) => (
                <Pressable key={m} onPress={() => setMode(m)} accessibilityRole="button" accessibilityState={{ selected: mode === m }} style={{ height: 30, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: mode === m ? t.c.fg.primary : 'transparent' }}>
                  <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: mode === m ? t.c.bg.ground : t.c.fg.secondary }}>{m === 'clusters' ? 'Clusters' : 'Free'}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 6 }}>
              {pill(`${countUntil(o.recordTimes, cutoff).toLocaleString('en-IN')} records`)}
              {pill(`${countUntil(o.linkTimes, cutoff).toLocaleString('en-IN')} links`)}
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -gutter }} contentContainerStyle={{ gap: 6, paddingHorizontal: gutter }}>
            {chip(null, 'All')}
            {o.modules.map((m) => chip(m.module, moduleName(m.module), linkColorForModule(m.module)))}
          </ScrollView>
          <View style={{ marginHorizontal: -gutter }}>
            <LinkCloud o={o} width={width} height={480} mode={mode} until={cutoff} module={module} onOpen={open} onModule={setModule} />
          </View>
          {o.recordTimes.length > 1 ? <TimeLapse first={first} last={last} value={cutoff} onChange={setUntil} /> : null}
          <Section title="Joins up the most" meta={module ? moduleName(module) : undefined}>
            <RowList>
              {shownRows.map((r) => {
                const def = os.registry.objects.get(r.type);
                return <RowItem key={r.id} icon={def?.icon ?? 'link'} tint={tintForModule(r.module ?? undefined)} title={r.title} subtitle={[def?.label, r.modules > 1 ? `across ${r.modules} modules` : null].filter(Boolean).join(' · ')} value={`${r.links}`} meta={r.links === 1 ? 'link' : 'links'} onPress={() => open(r.id)} />;
              })}
            </RowList>
          </Section>
        </>
      ) : (
        <EmptyState icon="link" line="Nothing is linked yet. Say who was there, where, or what it was for, and the links appear here." />
      )}
    </Screen>
  );
}
