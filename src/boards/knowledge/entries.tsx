import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ActionSheet, Icon, Screen, Text } from '@ui/kit';
import { notes } from '@modules/knowledge';
import { FaceStack, Hairline, KindPill, kindLook, Label, PillButton, RoundButton, RowCard, SideScroll, TopBar } from './parts';
import { bodyLine, linkedTo, newestFirst, noteAt, type Note } from './read';

/**
 * Entries by month (NR-Journal-List): the latest two months open (five rows,
 * then "4 more"), then Earlier as months to open. Journal, Ideas, All notes,
 * With a person; Save view opens the Object's list, where views are made.
 */

type Filter = 'journal' | 'idea' | 'all' | 'people';
const WORDS: Record<Filter, { title: string; one: string; many: string }> = {
  journal: { title: 'Entries', one: 'entry', many: 'entries' },
  idea: { title: 'Ideas', one: 'idea', many: 'ideas' },
  all: { title: 'All notes', one: 'note', many: 'notes' },
  people: { title: 'With a person', one: 'note', many: 'notes' },
};
const SHOWN = 5;
const OPEN_MONTHS = 2;
const LISTED_MONTHS = 3;

function byMonth(list: Note[]) {
  const months = new Map<string, { key: string; label: string; notes: Note[] }>();
  for (const n of list) {
    const key = format(noteAt(n), 'yyyy-MM');
    if (!months.has(key)) months.set(key, { key, label: format(noteAt(n), 'MMMM yyyy'), notes: [] });
    months.get(key)!.notes.push(n);
  }
  return [...months.values()];
}

/** An entry: its day large, title, two lines of it, then who and where. */
function EntryRow({ note }: { note: Note }) {
  const t = useTheme();
  const router = useRouter();
  const links = useLive((os) => linkedTo(os, note.id), [note.id]);
  const line = bodyLine(note);
  const at = noteAt(note);
  const where = [...links.places.slice(0, 2), ...links.others.slice(0, 1)].join(' · ') || (links.people.length === 1 ? links.people[0]!.name : '');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${format(at, 'EEEE d MMMM')}: ${note.title}`} onPress={() => router.push(`/entity/note/${note.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'flex-start', gap: 14, minHeight: 64, paddingVertical: 4, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 44, alignItems: 'center', paddingTop: 2 }}>
        <Text style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{format(at, 'd')}</Text>
        <Label>{format(at, 'EEE')}</Label>
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{note.title}</Text>
        {line ? <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary }}>{line}</Text> : null}
        {links.people.length || where ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {links.people.length ? <FaceStack people={links.people} ground={t.c.bg.tile} /> : null}
            {where ? <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary }}>{where}</Text> : null}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function MonthRow({ label, count, open, onPress }: { label: string; count: number; open?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}, ${count}`} accessibilityState={{ expanded: !!open }} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48, opacity: pressed ? 0.7 : 1 })}>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{label}</Text>
      <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{count}</Text>
      <Icon name={open ? 'chevron-down' : 'chevron-right'} size={18} color={t.c.fg.tertiary} />
    </Pressable>
  );
}

export function EntriesScreen({ params }: { params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const [filter, setFilter] = useState<Filter>(params.filter && params.filter in WORDS ? (params.filter as Filter) : 'journal');
  const [oldest, setOldest] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [everyMonth, setEveryMonth] = useState(false);
  const list = useLive(
    (os) => {
      const all = notes(os, { limit: 5000 });
      if (filter === 'people') return all.filter((n) => os.links.forEntity(n.id).some((l) => l.other.object === 'person'));
      return filter === 'all' ? all : all.filter((n) => n.data.kind === filter);
    },
    [filter],
  );
  const sorted = newestFirst(list);
  const months = byMonth(oldest ? sorted.reverse() : sorted);
  const rest = months.slice(OPEN_MONTHS);
  const listed = everyMonth ? rest : rest.slice(0, LISTED_MONTHS);
  const folded = everyMonth ? [] : rest.slice(LISTED_MONTHS);
  const words = WORDS[filter];
  const toggle = (key: string) => setOpen((o) => ({ ...o, [key]: !o[key] }));
  const write = () => router.push({ pathname: '/entity/note/new', params: filter === 'idea' ? { kind: 'idea' } : { kind: 'journal' } } as never);

  return (
    <Screen contentStyle={{ gap: 22 }}>
      <TopBar
        caption={`${list.length} ${list.length === 1 ? words.one : words.many} · ${oldest ? 'oldest' : 'newest'} first`}
        title={words.title}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/board/knowledge' as never))}
        right={
          <>
            <RoundButton icon="sort" label="Sort" onPress={() => setSorting(true)} />
            <RoundButton icon="plus" label={`New ${words.one}`} lime onPress={write} />
          </>
        }
      />
      <SideScroll>
        <KindPill label="Journal" icon="notebook" color={kindLook('journal').color} selected={filter === 'journal'} onPress={() => setFilter('journal')} />
        <KindPill label="Ideas" icon="bulb" color={kindLook('idea').color} selected={filter === 'idea'} onPress={() => setFilter('idea')} />
        <KindPill label="All notes" selected={filter === 'all'} onPress={() => setFilter('all')} />
        <KindPill label="With a person" selected={filter === 'people'} onPress={() => setFilter('people')} />
        <KindPill label="Save view" icon="plus" dashed onPress={() => router.push('/entity/note' as never)} />
      </SideScroll>

      {!list.length ? (
        <View style={{ paddingVertical: 28, paddingHorizontal: 18, borderRadius: 24, backgroundColor: t.c.bg.tile, alignItems: 'center', gap: 12 }}>
          <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, textAlign: 'center' }}>{filter === 'people' ? 'No note is linked to a person yet.' : `No ${words.many} yet.`}</Text>
          <PillButton primary title="Write one" onPress={write} />
        </View>
      ) : null}

      {months.slice(0, OPEN_MONTHS).map((m) => {
        const more = m.notes.length - SHOWN;
        return (
          <View key={m.key} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 4 }}>
              <Label style={{ flex: 1 }}>{m.label}</Label>
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{m.notes.length}</Text>
            </View>
            <RowCard>
              {(open[m.key] ? m.notes : m.notes.slice(0, SHOWN)).map((n) => (
                <EntryRow key={n.id} note={n} />
              ))}
              {more > 0 && !open[m.key] ? (
                <Pressable accessibilityRole="button" onPress={() => toggle(m.key)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.fg.secondary }}>{`${more} more in ${m.label.split(' ')[0]}`}</Text>
                  <Icon name="chevron-down" size={14} color={t.c.fg.secondary} />
                </Pressable>
              ) : null}
            </RowCard>
          </View>
        );
      })}

      {rest.length ? (
        <View style={{ gap: 10 }}>
          <Label style={{ paddingHorizontal: 4 }}>{oldest ? 'Later' : 'Earlier'}</Label>
          <View style={{ padding: 14, gap: 8, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
            {listed.map((m, i) => (
              <React.Fragment key={m.key}>
                {i ? <Hairline /> : null}
                <MonthRow label={m.label} count={m.notes.length} open={!!open[m.key]} onPress={() => toggle(m.key)} />
                {open[m.key] ? m.notes.map((n) => <EntryRow key={n.id} note={n} />) : null}
              </React.Fragment>
            ))}
            {folded.length ? (
              <>
                <Hairline />
                <MonthRow label={`${oldest ? 'After' : 'Before'} ${listed.at(-1)!.label.split(' ')[0]}`} count={folded.reduce((s, m) => s + m.notes.length, 0)} onPress={() => setEveryMonth(true)} />
              </>
            ) : null}
          </View>
        </View>
      ) : null}

      <ActionSheet
        visible={sorting}
        onClose={() => setSorting(false)}
        title="Sort"
        actions={[
          { label: 'Newest first', icon: oldest ? 'sort' : 'check', onPress: () => setOldest(false) },
          { label: 'Oldest first', icon: oldest ? 'check' : 'sort', onPress: () => setOldest(true) },
        ]}
      />
    </Screen>
  );
}
