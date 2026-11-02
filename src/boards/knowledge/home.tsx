import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ChipRow, EmptyState, FilterChip, IconButton, RowItem, RowList, Screen, Section, Segmented, Text, TextField } from '@ui/kit';
import { factGroups, noteSnippet, notes, NOTE_KINDS, searchBrain, type NoteData } from '@modules/knowledge';
import { AddFactSheet, FactRow, FactsList, useFactMenu } from './facts';

/**
 * The Second Brain (the knowledge board's home; R7f, a first pass from the kit
 * until the NR-Knowledge-* artboards, laid out as
 * docs/design/KNOWLEDGE-BRIEF.md screen 1): one search over Notes and Facts,
 * then Notes (pinned first, by kind) or Facts (by what they are about, and
 * what you call things). Memory opens the Facts half.
 */

export const KIND_ICON: Record<string, string> = { idea: 'bulb', journal: 'pen-line', meeting: 'people', reference: 'library', recipe: 'food', book: 'book' };

type Tab = 'notes' | 'facts';

export function NoteRow({ note }: { note: ObjectRecord<NoteData>; ctx?: LifeOSContext }) {
  const router = useRouter();
  return (
    <RowItem
      icon={KIND_ICON[note.data.kind ?? ''] ?? 'notebook'}
      tint="memory"
      title={note.title}
      subtitle={noteSnippet(note.data.body) || null}
      value={note.starred ? 'pinned' : null}
      valueTone="secondary"
      onPress={() => router.push(`/entity/note/${note.id}` as never)}
    />
  );
}

export function SecondBrain({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const [tab, setTab] = useState<Tab>(params.tab === 'facts' ? 'facts' : 'notes');
  const [q, setQ] = useState(params.q ?? '');
  const [kind, setKind] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const counts = useLive((os) => ({ notes: os.records.query('note', {}, { limit: 100000 }).filter((n) => !n.archived).length, facts: os.facts.list({ limit: 100000 }).length }), []);
  const list = useLive((os) => notes(os, { kind: kind ?? undefined }), [kind]);
  const kinds = useLive((os) => [...new Set(notes(os).map((n) => n.data.kind).filter((k): k is string => !!k))], []);
  const found = useLive((os) => searchBrain(os, q), [q]);
  const menu = useFactMenu(ctx);
  const query = q.trim();

  const add = () => (tab === 'facts' ? setAdding(true) : router.push('/entity/note/new' as never));
  const header = {
    title: 'Second Brain',
    subtitle: `${counts.notes} ${counts.notes === 1 ? 'note' : 'notes'} · ${counts.facts} ${counts.facts === 1 ? 'fact' : 'facts'}`,
    onBack: () => (router.canGoBack() ? router.back() : router.replace('/browse' as never)),
    right: <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel={tab === 'facts' ? 'Remember something' : 'New note'} onPress={add} />,
  };

  const pinned = list.filter((n) => n.starred);
  const rest = list.filter((n) => !n.starred);
  return (
    <Screen {...header} contentStyle={{ gap: 18 }}>
      <TextField value={q} onChange={setQ} leading="search" placeholder="Search notes and facts" autoCorrect={false} returnKeyType="search" />
      {query ? (
        found.notes.length || found.facts.length ? (
          <>
            {found.notes.length ? (
              <Section title="Notes" meta={String(found.notes.length)}>
                <RowList>
                  {found.notes.map((n) => (
                    <NoteRow key={n.id} note={n} ctx={ctx} />
                  ))}
                </RowList>
              </Section>
            ) : null}
            {found.facts.length ? (
              <Section title="Facts" meta={String(found.facts.length)}>
                <View style={{ gap: 8 }}>
                  {factGroups(ctx, found.facts).flatMap((g) => g.facts.map((f) => <FactRow key={f.id} fact={f} ctx={ctx} about={g.key === 'you' ? null : g.title} onMenu={menu.open} />))}
                </View>
              </Section>
            ) : null}
          </>
        ) : (
          <EmptyState icon="search" tint="memory" line={`Nothing about “${query}” in your notes or facts.`} bare />
        )
      ) : (
        <>
          <Segmented<Tab>
            options={[
              { value: 'notes', label: `Notes · ${counts.notes}` },
              { value: 'facts', label: `Facts · ${counts.facts}` },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === 'facts' ? (
            <FactsList ctx={ctx} onAdd={() => setAdding(true)} />
          ) : counts.notes === 0 ? (
            <EmptyState icon="notebook" tint="memory" title="No notes yet" line="Ideas, a journal, meeting notes, recipes. Put [[Name]] around a person, place or thing and the note shows up on their page." action="Write one" onAction={add} />
          ) : (
            <>
              {kinds.length > 1 ? (
                <ChipRow>
                  <FilterChip label="All" selected={!kind} onPress={() => setKind(null)} />
                  {NOTE_KINDS.filter((k) => kinds.includes(k.value)).map((k) => (
                    <FilterChip key={k.value} label={k.label} icon={KIND_ICON[k.value]} selected={kind === k.value} onPress={() => setKind(kind === k.value ? null : k.value)} />
                  ))}
                </ChipRow>
              ) : null}
              {pinned.length ? (
                <Section title="Pinned" meta={String(pinned.length)}>
                  <RowList>
                    {pinned.map((n) => (
                      <NoteRow key={n.id} note={n} ctx={ctx} />
                    ))}
                  </RowList>
                </Section>
              ) : null}
              <Section title={kind ? (NOTE_KINDS.find((k) => k.value === kind)?.label ?? 'Notes') : 'Latest'} meta={String(rest.length)}>
                {rest.length ? (
                  <RowList>
                    {rest.map((n) => (
                      <NoteRow key={n.id} note={n} ctx={ctx} />
                    ))}
                  </RowList>
                ) : (
                  <Text color="tertiary">Everything here is pinned.</Text>
                )}
              </Section>
            </>
          )}
        </>
      )}
      <AddFactSheet visible={adding} onClose={() => setAdding(false)} />
      {menu.sheets}
    </Screen>
  );
}

/** /board/knowledge/facts (and /memory): the Second Brain open on its Facts half. */
export function FactsScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  return <SecondBrain ctx={ctx} params={{ ...params, tab: 'facts' }} />;
}
