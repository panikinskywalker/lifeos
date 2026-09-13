import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Card, Chip, Input, Row, Screen, Text, GroupLabel } from '@ui/components/primitives';
import { EntityRow } from '@ui/components/EntityRow';

/** Global search across every record, plus a command palette of actions. */
export default function SearchTab() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [type, setType] = useState<string | null>(null);
  const hits = useLive((o) => (q.trim() ? o.entities.search.search(q, { types: type ? [type] : undefined, limit: 50 }) : []), [q, type]);
  const recent = useLive((o) => o.entities.recent(12), []);
  const tags = useLive((o) => o.tags.counts().slice(0, 12), []);
  const commands = [...os.registry.quickActions].filter((a) => !q.trim() || a.label.toLowerCase().includes(q.toLowerCase()));
  const typesInHits = [...new Set(hits.map((h) => h.type))];
  return (
    <Screen title="Search" padded={false}>
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        <Input value={q} onChangeText={setQ} placeholder="Search everything" autoCorrect={false} returnKeyType="search" clearButtonMode="while-editing" />
        {q.trim() && typesInHits.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            <Chip label="All" selected={!type} onPress={() => setType(null)} />
            {typesInHits.map((ty) => (
              <Chip key={ty} label={os.registry.entityTypes.get(ty)?.labelPlural ?? ty} selected={type === ty} color={os.registry.colorFor(ty)} onPress={() => setType(ty)} />
            ))}
          </ScrollView>
        ) : null}
      </View>
      {q.trim() ? (
        <>
          {commands.length && q.trim().length >= 2 ? (
            <>
              <GroupLabel>Actions</GroupLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16 }}>
                {commands.slice(0, 6).map((a) => (
                  <Chip key={a.id} label={`New ${a.label}`} icon={a.icon} onPress={() => (a.route ? router.push(a.route as never) : a.run?.(os))} />
                ))}
              </View>
            </>
          ) : null}
          <GroupLabel>{hits.length ? `${hits.length} results` : 'No results'}</GroupLabel>
          <Card padded={false} style={{ marginHorizontal: 16 }}>
            {hits.map((h, i) => {
              const def = os.registry.entityTypes.get(h.type);
              return <Row key={h.id} title={h.title} subtitle={`${def?.label ?? h.type}${h.subtitle ? ` · ${h.subtitle}` : ''}`} icon={def?.icon} iconColor={os.registry.colorFor(h.type)} last={i === hits.length - 1} onPress={() => router.push(`/entity/${h.type}/${h.id}`)} />;
            })}
          </Card>
        </>
      ) : (
        <>
          <GroupLabel>Quick add</GroupLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16 }}>
            {os.registry.quickActions.map((a) => (
              <Chip key={a.id} label={a.label} icon={a.icon} onPress={() => (a.route ? router.push(a.route as never) : a.run?.(os))} />
            ))}
          </View>
          {tags.length ? (
            <>
              <GroupLabel>Tags</GroupLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16 }}>
                {tags.map((tag) => (
                  <Chip key={tag.id} label={`#${tag.name} · ${tag.count}`} color={t.colors.accents.yellow} onPress={() => router.push(`/tag/${encodeURIComponent(tag.name)}`)} />
                ))}
              </View>
            </>
          ) : null}
          <GroupLabel>Recent</GroupLabel>
          <Card padded={false} style={{ marginHorizontal: 16 }}>
            {recent.length === 0 ? <Text color="tertiary" style={{ padding: 16 }}>Records you touch show up here.</Text> : recent.map((e, i) => <EntityRow key={e.id} entity={e} showType last={i === recent.length - 1} />)}
          </Card>
        </>
      )}
    </Screen>
  );
}
