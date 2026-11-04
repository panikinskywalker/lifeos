import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { Icon, Screen, Text } from '@ui/kit';
import { notes, NOTE_KINDS, noteTitle, searchBrain } from '@modules/knowledge';
import { ToCheckBell } from '../../screens/ToCheckBell';
import { FactLine, useFactMenu } from './facts';
import { DotChip, FaceStack, Hairline, JOURNAL_COLOR, kindLook, KindPill, Label, LockLine, MetricsCard, MonthBars, NoteRow, PillButton, RoundButton, RowCard, SearchBox, SectionHead, SideScroll, TopBar } from './parts';
import { factGuesses, firstName, kindLabel, linkedTo, monthCounts, newestFirst, noteAt, onThisDayNote, quoteOf, type Note } from './read';

/**
 * Journal's home (NR-Journal-Home; NR-Journal-Empty with no notes): one search
 * over notes and facts, the kinds, notes written by month, On this day, the
 * latest, facts. Pinned notes (MODEL.md, not on the artboard) get a block of
 * their own above Latest when there are any.
 */

const entries = (filter: string) => ({ pathname: '/board/[id]/[page]', params: { id: 'knowledge', page: 'entries', filter } }) as never;

const QUOTE = { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.4 } as const;

function OnThisDay({ note, ago }: { note: Note; ago: string }) {
  const t = useTheme();
  const router = useRouter();
  const ink = t.c.fg.onAccent;
  const links = useLive((os) => linkedTo(os, note.id), [note.id]);
  const line = [links.people.map((p) => firstName(p.name)).join(', '), ...links.places].filter(Boolean).join(' · ');
  const at = noteAt(note);
  const named = note.title !== noteTitle(note.data.body);
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="On this day" sub={`${format(at, 'd MMM yyyy')} · ${ago}`} />
      <Pressable accessibilityRole="button" accessibilityLabel={`On this day, ${ago}: ${note.title}`} onPress={() => router.push(`/entity/note/${note.id}` as never)} style={({ pressed }) => ({ padding: 18, gap: 12, borderRadius: 28, backgroundColor: blocks.lilac, opacity: pressed ? 0.9 : 1 })}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Label color={ink} style={{ flex: 1 }}>{`${kindLabel(note.data.kind)} · ${named ? note.title : format(at, 'yyyy')}`}</Label>
          <Icon name="chevron-right" size={18} color={ink} />
        </View>
        <Text numberOfLines={4} style={[QUOTE, { color: `${ink}99` }]}>
          <Text style={[QUOTE, { color: ink }]}>“</Text>
          {quoteOf(note.data.body).split(/\[\[|\]\]/).map((p, i) => (i % 2 ? <Text key={i} style={[QUOTE, { color: ink }]}>{p}</Text> : p))}
          <Text style={[QUOTE, { color: ink }]}>”</Text>
        </Text>
        {line ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {links.people.length ? <FaceStack people={links.people} size={26} ground={blocks.lilac} /> : null}
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '600', color: `${ink}B8` }}>{line}</Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/** NR-Journal-Empty's card and kinds; real users start here. */
function EmptyHome({ onWrite, onDump }: { onWrite: () => void; onDump: () => void }) {
  const t = useTheme();
  return (
    <>
      <View style={{ paddingVertical: 34, paddingHorizontal: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, alignItems: 'center', gap: 10 }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="notebook" size={26} color={JOURNAL_COLOR} />
        </View>
        <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary, textAlign: 'center' }}>No notes yet.</Text>
        <Text style={{ maxWidth: 270, fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, textAlign: 'center' }}>Write one here, or tell the Dump about your day and it files the entry, with its people and places linked.</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <PillButton primary title="Write a note" onPress={onWrite} />
          <PillButton title="Dump" icon="mic" onPress={onDump} />
        </View>
      </View>
      <View style={{ gap: 10 }}>
        <Label style={{ paddingHorizontal: 4 }}>Kinds you can keep</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {['journal', 'idea', 'meeting', 'reference', 'recipe', 'book'].map((k) => (
            <DotChip key={k} label={kindLabel(k)} color={kindLook(k).color} />
          ))}
        </View>
      </View>
    </>
  );
}

export function JournalHome({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const [q, setQ] = useState(params.q ?? '');
  const [kind, setKind] = useState<string | null>(null);
  const now = Date.now();
  const all = useLive((os) => notes(os, { limit: 5000 }), []);
  const facts = useLive((os) => ({ total: os.facts.list({ limit: 100000 }).length, latest: os.facts.list({ limit: 4 }), guesses: factGuesses(os) }), []);
  const found = useLive((os) => searchBrain(os, q), [q]);
  const menu = useFactMenu(ctx);
  const query = q.trim();
  const months = monthCounts(all, now);
  const month = months.at(-1)?.value ?? 0;
  const day = onThisDayNote(all, now);
  const pinned = newestFirst(all.filter((n) => n.starred));
  const latest = newestFirst(all.filter((n) => !n.starred && (!kind || n.data.kind === kind))).slice(0, 5);
  const write = () => router.push('/entity/note/new' as never);
  const newNote = <RoundButton icon="plus" label="New note" lime onPress={write} />;

  const factsBlock = facts.total ? (
    <View style={{ gap: 10 }}>
      <SectionHead title="Facts" sub="One line each, by who they are about" action={`All ${facts.total}`} onAction={() => router.push('/board/knowledge/facts' as never)} />
      <RowCard>
        {facts.latest.map((f) => (
          <FactLine key={f.id} fact={f} ctx={ctx} guesses={facts.guesses} menu={menu} />
        ))}
      </RowCard>
    </View>
  ) : null;

  if (!all.length) {
    return (
      <Screen contentStyle={{ gap: 24 }}>
        <TopBar dot caption="0 notes" title="Journal" right={newNote} />
        <MetricsCard notes={0} month={0} quiet />
        <EmptyHome onWrite={write} onDump={() => router.push('/dump' as never)} />
        {factsBlock}
        <LockLine>What you write stays on this phone.</LockLine>
        {menu.sheets}
      </Screen>
    );
  }

  return (
    <Screen contentStyle={{ gap: 24 }}>
      <TopBar
        dot
        caption={`${all.length} ${all.length === 1 ? 'note' : 'notes'} · ${month} this month`}
        title="Journal"
        right={
          <>
            <ToCheckBell />
            {newNote}
          </>
        }
      />
      <SearchBox value={q} onChange={setQ} placeholder="Words, people or places" />
      {query ? (
        found.notes.length || found.facts.length ? (
          <>
            {found.notes.length ? (
              <View style={{ gap: 10 }}>
                <SectionHead title="Notes" sub={`${found.notes.length} found`} />
                <RowCard>
                  {found.notes.map((n) => (
                    <NoteRow key={n.id} note={n} now={now} />
                  ))}
                </RowCard>
              </View>
            ) : null}
            {found.facts.length ? (
              <View style={{ gap: 10 }}>
                <SectionHead title="Facts" sub={`${found.facts.length} found`} />
                <RowCard>
                  {found.facts.map((f) => (
                    <FactLine key={f.id} fact={f} ctx={ctx} guesses={facts.guesses} menu={menu} />
                  ))}
                </RowCard>
              </View>
            ) : null}
          </>
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary, paddingHorizontal: 4 }}>{`Nothing about “${query}” in your notes or facts.`}</Text>
        )
      ) : (
        <>
          <SideScroll>
            <KindPill label="All" selected={!kind} onPress={() => setKind(null)} />
            {NOTE_KINDS.map((k) => (
              <KindPill key={k.value} label={k.value === 'idea' ? 'Ideas' : k.label} color={kindLook(k.value).color} selected={kind === k.value} onPress={() => (k.value === 'journal' ? router.push(entries('journal')) : setKind(kind === k.value ? null : k.value))} />
            ))}
          </SideScroll>
          <MetricsCard notes={all.length} month={month}>
            <Hairline />
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>Written by month</Text>
              <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', color: t.c.fg.secondary }}>last 6 months</Text>
            </View>
            <MonthBars data={months} />
          </MetricsCard>
          {day ? <OnThisDay note={day.note} ago={day.ago} /> : null}
          {pinned.length ? (
            <View style={{ gap: 10 }}>
              <SectionHead title="Pinned" sub={`${pinned.length} kept on top`} />
              <RowCard>
                {pinned.map((n) => (
                  <NoteRow key={n.id} note={n} now={now} />
                ))}
              </RowCard>
            </View>
          ) : null}
          <View style={{ gap: 10 }}>
            <SectionHead title="Latest" sub={kind ? `${kindLabel(kind)}, newest first` : 'Every kind, newest first'} action="All notes" onAction={() => router.push(entries('all'))} />
            {latest.length ? (
              <RowCard>
                {latest.map((n) => (
                  <NoteRow key={n.id} note={n} now={now} />
                ))}
              </RowCard>
            ) : (
              <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary, paddingHorizontal: 4 }}>{kind ? `No ${kindLabel(kind).toLowerCase()} notes yet.` : 'Everything here is pinned.'}</Text>
            )}
          </View>
          {factsBlock}
        </>
      )}
      <LockLine>Notes and facts live on this phone. Search runs here too.</LockLine>
      {menu.sheets}
    </Screen>
  );
}
