import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive, useOS } from '@ui/hooks';
import { tintForModule } from '@ui/theme/moduleTint';
import { EntityRow } from '@ui/components/EntityRow';
import { Chip, ChipRow, EmptyState, FilterChip, RowItem, RowList, Screen, Section, TextField } from '@ui/kit';

/** Global search across every record, plus quick-add actions and recent records. */
export default function SearchRoute() {
  const os = useOS();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [type, setType] = useState<string | null>(null);
  const query = q.trim();
  const hits = useLive((o) => (query ? o.records.search.search(query, { types: type ? [type] : undefined, limit: 50 }) : []), [query, type]);
  const recent = useLive((o) => o.records.recent(12), []);
  const tags = useLive((o) => o.tags.counts().slice(0, 12), []);
  const commands = os.registry.quickActions.filter((a) => !query || a.label.toLowerCase().includes(query.toLowerCase()));
  const typesInHits = [...new Set(hits.map((h) => h.object))];
  const run = (a: (typeof commands)[number]) => (a.route ? router.push(a.route as never) : a.run?.(os));
  return (
    <Screen title="Search" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
      <TextField value={q} onChange={setQ} leading="search" placeholder="Search records, people, things…" autoFocus autoCorrect={false} returnKeyType="search" />
      {query ? (
        <>
          {typesInHits.length > 1 || type ? (
            <ChipRow>
              <FilterChip label="All" selected={!type} onPress={() => setType(null)} />
              {typesInHits.map((ty) => (
                <FilterChip key={ty} label={os.registry.objects.get(ty)?.labelPlural ?? ty} selected={type === ty} onPress={() => setType(ty)} />
              ))}
            </ChipRow>
          ) : null}
          {commands.length && query.length >= 2 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {commands.slice(0, 6).map((a) => (
                <Chip key={a.id} label={`New ${a.label.toLowerCase()}`} icon={a.icon} onPress={() => run(a)} />
              ))}
            </View>
          ) : null}
          {hits.length ? (
            <Section title={`${hits.length} ${hits.length === 1 ? 'result' : 'results'}`}>
              <RowList>
                {hits.map((h) => {
                  if (h.object === 'fact') return <RowItem key={h.id} title={h.title} subtitle={`Memory${h.subtitle ? ` · about ${h.subtitle}` : ''}`} icon="sparkle" tint="memory" onPress={() => router.push({ pathname: '/memory', params: { q: h.title.split(' ').slice(0, 3).join(' ') } })} />;
                  const def = os.registry.objects.get(h.object);
                  return <RowItem key={h.id} title={h.title} subtitle={`${def?.label ?? h.object}${h.subtitle ? ` · ${h.subtitle}` : ''}`} icon={def?.icon} tint={tintForModule(def?.module)} onPress={() => router.push(`/entity/${h.object}/${h.id}`)} />;
                })}
              </RowList>
            </Section>
          ) : (
            <EmptyState icon="search" line={`Nothing matches “${query}”.`} />
          )}
        </>
      ) : (
        <>
          {os.registry.quickActions.length ? (
            <Section title="Quick add">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {os.registry.quickActions.map((a) => (
                  <Chip key={a.id} label={a.label} icon={a.icon} onPress={() => run(a)} />
                ))}
              </View>
            </Section>
          ) : null}
          {tags.length ? (
            <Section title="Tags" action="All" onAction={() => router.push('/tag')}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {tags.map((tag) => (
                  <Chip key={tag.id} label={`#${tag.name} · ${tag.count}`} onPress={() => router.push(`/tag/${encodeURIComponent(tag.name)}`)} />
                ))}
              </View>
            </Section>
          ) : null}
          {recent.length ? (
            <Section title="Recent">
              <RowList>
                {recent.map((e) => (
                  <EntityRow key={e.id} entity={e} showType />
                ))}
              </RowList>
            </Section>
          ) : (
            <EmptyState icon="clock" line="Records you open or change show up here." />
          )}
        </>
      )}
    </Screen>
  );
}
