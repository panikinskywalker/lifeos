import React, { useState } from 'react';
import { Pressable, ScrollView, TextInput, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { Icon, IconButton, Screen, Text } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { KIND_OPTIONS } from '@modules/documents';
import { documentsState, kindLabel } from './overview';
import { ActionPill, Caps, Card, ChoicePill, DocRow, EmptyCard, kindColor, Lined, type Doc } from './parts';

/**
 * All documents (NR-Documents-List): search (it reads the text inside PDFs),
 * the filters, your three biggest kinds open and the rest folded into a list
 * of kinds. A filter or a search shows one plain list. Opened with `filter`
 * (expiring, new or a kind) or `search` from Home.
 */

const INPUT: TextStyle = { fontSize: 16, lineHeight: 21, fontFamily: fontForWeight(500) };

/** New first, then what expires soonest, then no expiry. */
const order = (a: Doc, b: Doc) => Number(b.status === 'new') - Number(a.status === 'new') || (a.data.expiresOn ?? '9999').localeCompare(b.data.expiresOn ?? '9999') || a.title.localeCompare(b.title);

function GroupLabel({ title, dot }: { title: string; dot?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, paddingRight: 4 }}>
      <View style={{ flex: 1 }}><Caps>{title}</Caps></View>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
    </View>
  );
}

export function DocumentsList({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const [filter, setFilter] = useState(params.filter ?? 'all');
  const [q, setQ] = useState('');
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const s = useLive((os) => {
    const state = documentsState(os);
    const term = q.trim();
    return { ...state, hits: term ? new Set(os.records.search.search(term, { types: ['document'], limit: 500 }).map((h) => h.id)) : null };
  }, [q]);
  const now = Date.now();

  const pool = filter === 'expiring' ? [...s.expired, ...s.soon] : filter === 'new' ? s.fresh : filter === 'all' ? s.docs : s.docs.filter((d) => (d.data.kind ?? 'other') === filter);
  const found = s.hits ? pool.filter((d) => s.hits!.has(d.id)) : pool;
  const plain = !!s.hits || filter !== 'all';
  const label = s.hits ? 'Results' : filter === 'expiring' ? 'Expiring soon' : filter === 'new' ? 'New in your folders' : kindLabel(filter);

  // Your three biggest kinds open, in the form's order; the rest by how many.
  const rank = (kind: string) => KIND_OPTIONS.findIndex((o) => o.value === kind);
  const open = s.byKind.slice(0, 3).sort((a, b) => rank(a.kind) - rank(b.kind));
  const rest = s.byKind.slice(3);
  const inKind = (kind: string) => s.docs.filter((d) => (d.data.kind ?? 'other') === kind).sort(order);
  const nothing = s.hits ? `Nothing matches “${q.trim()}”.` : filter === 'expiring' ? 'Nothing expires in the next 90 days.' : filter === 'new' ? 'Nothing new in your folders.' : `No ${kindLabel(filter)} yet.`;

  return (
    <Screen
      title="All documents"
      subtitle={`${s.docs.length} · by kind`}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/documents' as never))}
      right={<IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} accessibilityLabel="Add document" onPress={() => router.push('/entity/document/new' as never)} />}
      contentStyle={{ gap: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ gap: 8 }}>
        <Caps>Search</Caps>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: t.c.line }}>
          <Icon name="search" size={18} color={t.c.fg.secondary} />
          <TextInput accessibilityLabel="Search documents" autoFocus={params.search === '1'} value={q} onChangeText={setQ} placeholder="Title, number, issuer or text inside" placeholderTextColor={t.c.fg.secondary} selectionColor={t.c.accent.mustard} cursorColor={t.c.accent.mustard} returnKeyType="search" style={[INPUT, { flex: 1, minWidth: 0, color: t.c.fg.primary, paddingVertical: 12 }]} />
          {q ? <IconButton icon="x" size={28} color={t.c.fg.secondary} accessibilityLabel="Clear search" onPress={() => setQ('')} /> : null}
        </View>
        <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, paddingHorizontal: 4 }}>Search reads the text inside your PDFs too. That text stays on the phone.</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -t.layout.gutter, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: t.layout.gutter }}>
        <ChoicePill label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <ChoicePill label="Expiring soon" icon="alert" iconColor={t.c.alert.coralText} selected={filter === 'expiring'} onPress={() => setFilter('expiring')} />
        <ChoicePill label="New in your folders" icon="folder" iconColor={t.tints.documents.ink} selected={filter === 'new'} onPress={() => setFilter('new')} />
        {KIND_OPTIONS.filter((o) => s.byKind.some((k) => k.kind === o.value)).map((o) => <ChoicePill key={o.value} label={o.label} selected={filter === o.value} onPress={() => setFilter(o.value)} />)}
      </ScrollView>

      {!s.docs.length ? (
        <EmptyCard icon="folder" line="No documents yet. Pick the folders where your papers already are, or add one by hand.">
          <ActionPill title="Your folders" icon="folder" primary onPress={() => router.push('/module/documents/folders' as never)} />
        </EmptyCard>
      ) : plain ? (
        <View style={{ gap: 10 }}>
          <GroupLabel title={`${label} · ${found.length}`} dot={filter !== 'all' && filter !== 'expiring' && filter !== 'new' ? kindColor(filter, t) : undefined} />
          {found.length ? (
            <Card>
              <Lined>{(filter === 'expiring' ? found : [...found].sort(order)).map((d) => <DocRow key={d.id} ctx={ctx} d={d} now={now} />)}</Lined>
            </Card>
          ) : (
            <Card pad={16}><Text color="secondary" style={{ fontSize: 13, lineHeight: 17 }}>{nothing}</Text></Card>
          )}
        </View>
      ) : (
        <>
          {open.map((k) => {
            const docs = inKind(k.kind);
            const fold = docs.length > 5 && !opened[k.kind];
            return (
              <View key={k.kind} style={{ gap: 10 }}>
                <GroupLabel title={`${k.label} · ${k.value}`} dot={kindColor(k.kind, t)} />
                <Card>
                  <Lined>
                    {[
                      ...(fold ? docs.slice(0, 3) : docs).map((d) => <DocRow key={d.id} ctx={ctx} d={d} now={now} />),
                      ...(fold ? [
                        <Pressable key="more" accessibilityRole="button" onPress={() => setOpened((o) => ({ ...o, [k.kind]: true }))} style={({ pressed }) => ({ height: 44, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                          <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600' }}>Show {docs.length - 3} more</Text>
                        </Pressable>,
                      ] : []),
                    ]}
                  </Lined>
                </Card>
              </View>
            );
          })}
          {rest.length ? (
            <View style={{ gap: 10 }}>
              <GroupLabel title={`The rest · ${rest.reduce((n, k) => n + k.value, 0)}`} />
              <Card>
                <Lined>
                  {rest.map((k) => (
                    <Pressable key={k.kind} accessibilityRole="button" accessibilityLabel={`${k.label}, ${k.value}`} onPress={() => setFilter(k.kind)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, opacity: pressed ? 0.75 : 1 })}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: kindColor(k.kind, t) }} />
                      <Text variant="rowTitle" numberOfLines={1} style={{ flex: 1 }}>{k.label}</Text>
                      <Text color="secondary" style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{k.value}</Text>
                      <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
                    </Pressable>
                  ))}
                </Lined>
              </Card>
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}
