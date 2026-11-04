import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { TileDef } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { Icon, Text } from '@ui/kit';
import { notes } from '@modules/knowledge';
import { FaceStack, JOURNAL_COLOR, JOURNAL_DOT, Label } from './parts';
import { firstName, kindLabel, linkedTo, monthCounts, newestFirst, noteAt, onThisDayNote, quoteOf } from './read';

/**
 * Journal on Today (NR-Journal-Tile): the count and the latest (small 2 × 2,
 * wide 4 × 2 with the months and faces), opening Journal's home; and On this
 * day on lilac, opening that entry, only when a past year has one. The violet
 * dot is Journal's colour from Browse.
 */

const SMALL = { flex: 1, aspectRatio: 1 } as const;
const WIDE = { minHeight: 167 } as const;
const QUOTE = { fontSize: 19, lineHeight: 25, fontWeight: '600', letterSpacing: -0.3 } as const;

function Head({ label, dot, ink }: { label: string; dot: string; ink?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Label color={ink} style={{ flex: 1 }}>{label}</Label>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot }} />
    </View>
  );
}

/** Six months as small bars, this month lime. */
function MiniBars({ data }: { data: Array<{ value: number }> }) {
  const t = useTheme();
  const max = Math.max(1, ...data.map((m) => m.value));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 48 }} accessibilityRole="image" accessibilityLabel="Notes by month, last 6 months">
      {data.map((m, i) => {
        const h = m.value ? Math.max(6, (44 * m.value) / max) : 4;
        return <View key={i} style={{ width: 16, height: h, borderRadius: Math.min(5, h / 2), backgroundColor: i === data.length - 1 ? t.c.accent.mustard : t.dark ? '#FFFFFF1F' : t.c.bg.dim }} />;
      })}
    </View>
  );
}

function JournalTile({ wide }: { wide: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const all = useLive((os) => notes(os, { limit: 5000 }), []);
  const latest = newestFirst(all)[0];
  const faces = useLive((os) => (latest ? linkedTo(os, latest.id).people : []), [latest?.id]);
  const months = monthCounts(all);
  const line = latest ? `latest: ${latest.title}` : 'Write your first';
  const count = <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 30, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{`${all.length} ${all.length === 1 ? 'note' : 'notes'}`}</Text>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Journal, ${all.length} notes, ${line}`} onPress={() => router.push('/board/knowledge' as never)} style={({ pressed }) => [wide ? WIDE : SMALL, { padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, justifyContent: 'space-between', opacity: pressed ? 0.9 : 1 }]}>
      <Head label="Journal" dot={JOURNAL_DOT} />
      {wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            {count}
            <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{`${months.at(-1)?.value ?? 0} this month`}</Text>
          </View>
          <MiniBars data={months} />
        </View>
      ) : (
        count
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: wide ? 10 : 8 }}>
        <Icon name="notebook" size={14} color={JOURNAL_COLOR} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: wide ? 13 : 12, lineHeight: wide ? 17 : 15, fontWeight: '600', color: wide ? t.c.fg.primary : t.c.fg.secondary }}>{line}</Text>
        {wide && faces.length ? <FaceStack people={faces} ground={t.c.bg.tile} max={3} /> : null}
      </View>
    </Pressable>
  );
}

function OnThisDayTile({ wide }: { wide: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const ink = t.c.fg.onAccent;
  const day = useLive((os) => onThisDayNote(notes(os, { limit: 5000 })), []);
  const links = useLive((os) => (day ? linkedTo(os, day.note.id) : null), [day?.note.id]);
  if (!day) return null;
  const { note, ago } = day;
  const who = links?.people.map((p) => firstName(p.name)).join(', ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`On this day, ${ago}: ${note.title}`} onPress={() => router.push(`/entity/note/${note.id}` as never)} style={({ pressed }) => [wide ? WIDE : SMALL, { padding: 16, borderRadius: 24, backgroundColor: blocks.lilac, justifyContent: 'space-between', opacity: pressed ? 0.9 : 1 }]}>
      <Head label={wide ? `On this day · ${format(noteAt(note), 'd MMM yyyy')}` : 'On this day'} dot={ink} ink={ink} />
      {wide ? (
        <Text numberOfLines={2} style={[QUOTE, { color: `${ink}99` }]}>
          <Text style={[QUOTE, { color: ink }]}>“</Text>
          {quoteOf(note.data.body, 70).split(/\[\[|\]\]/).map((p, i) => (i % 2 ? <Text key={i} style={[QUOTE, { color: ink }]}>{p}</Text> : p))}
          <Text style={[QUOTE, { color: ink }]}>”</Text>
        </Text>
      ) : (
        <Text numberOfLines={3} style={{ fontSize: 18, lineHeight: 23, fontWeight: '600', letterSpacing: -0.3, color: ink }}>{note.title}</Text>
      )}
      {wide ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '600', color: `${ink}B8` }}>{[kindLabel(note.data.kind), ...(links?.places ?? [])].join(' · ')}</Text>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: ink }}>Read it</Text>
        </View>
      ) : (
        <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', color: `${ink}B8` }}>{[ago, who].filter(Boolean).join(' · ')}</Text>
      )}
    </Pressable>
  );
}

/** On this day is medium by default: a tile that may draw nothing must not leave half a row empty on Today. */
export const journalTiles: TileDef[] = [
  { type: 'journal', board: 'knowledge', name: 'Journal', description: 'How many notes, and the latest', icon: 'notebook', sizes: ['small', 'medium'], defaultSize: 'small', component: ({ size }) => <JournalTile wide={size !== 'small'} /> },
  { type: 'journal.onthisday', board: 'knowledge', name: 'Journal · On this day', description: 'What you wrote on this date in an earlier year', icon: 'history', sizes: ['small', 'medium'], defaultSize: 'medium', component: ({ size }) => <OnThisDayTile wide={size !== 'small'} /> },
];
