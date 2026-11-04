import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line } from 'react-native-svg';
import { Image } from 'expo-image';
import { format } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { linkGroups, type LinkItem } from '@core/graph/read';
import { DUMP_DAYS } from '@core/repo/dumpRepo';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ActionSheet, Icon, RowItem, RowList, Sheet, Text, useToast } from '@ui/kit';
import { mentionsIn, type Mention } from '@modules/knowledge';
import { DotChip, Hairline, inkOf, JOURNAL_COLOR, kindLook, Label, Mono, RecordDisc, RoundButton, SectionHead, SideScroll, ToCheckPill } from './parts';
import { aboutOf, kindLabel, noteAt, photoOf, type Note } from './read';

/**
 * A Note's page (NR-Journal-Entry; the whole record page): kind and when, the
 * big title, how it came in, the body with its [[mentions]] as Links, the
 * actions, Links by word with a small map (it opens the shared /links), the
 * facts from it, tags, the timeline, Details and the Say bar. Reminders,
 * attachments and a cover the More menu added show when there are any.
 */

const SAID: Record<string, string> = { voice: 'spoken', typed: 'typed', share: 'shared' };
const DAY = 86_400_000;
/** "Mon 8:10" this week, else "4 Oct". */
const shortWhen = (at: number, now = Date.now()) => (now - at < 6 * DAY ? format(at, 'EEE h:mm') : format(at, 'd MMM'));

/** Splits a line into text and [[mentions]]. */
function pieces(line: string): Array<{ text: string; mention?: string }> {
  const out: Array<{ text: string; mention?: string }> = [];
  let last = 0;
  for (const m of line.matchAll(/\[\[([^[\]\n]{1,80})\]\]/g)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    out.push({ text: m[1]!.trim(), mention: m[1]!.trim() });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

/** The body, line by line: # headings, - bullets, [[mentions]] underlined in their record's colour; a dashed one is not a record yet (or is a guess). */
function NoteText({ body, mentions, ctx, guesses }: { body: string; mentions: Mention[]; ctx: LifeOSContext; guesses: Set<string> }) {
  const t = useTheme();
  const router = useRouter();
  const byTitle = new Map(mentions.map((m) => [m.title, m.id]));
  const open = (title: string) => {
    const id = byTitle.get(title);
    const r = id ? ctx.records.get(id) : null;
    if (r) router.push(`/entity/${r.object}/${r.id}` as never);
    else router.push({ pathname: '/search', params: { q: title } } as never);
  };
  const lines = body.split('\n').filter((l) => l.trim());
  const quiet = `${t.c.fg.primary}DB`;
  return (
    <View style={{ gap: 14 }}>
      {lines.map((raw, i) => {
        const h = raw.match(/^\s*(#{1,3})\s+(.*)$/);
        const b = raw.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
        const line = h ? h[2]! : b ? b[1]! : raw;
        const type = { fontSize: h ? (h[1]!.length === 1 ? 20 : 17) : 16, lineHeight: 26 };
        const ink = h ? t.c.fg.primary : quiet;
        const text = (
          <Text selectable style={[type, { flex: b ? 1 : undefined, fontWeight: h ? '700' : '400', color: ink }]}>
            {pieces(line).map((p, j) => {
              if (!p.mention) return <Text key={j} style={[type, { fontWeight: h ? '700' : '400', color: ink }]}>{p.text}</Text>;
              const id = byTitle.get(p.mention);
              const r = id ? ctx.records.get(id) : null;
              const dashed = !r || guesses.has(r.id);
              return (
                <Text key={j} accessibilityRole="link" onPress={() => open(p.mention!)} style={[type, { color: t.c.fg.primary, fontWeight: '600', textDecorationLine: 'underline', textDecorationStyle: dashed ? 'dashed' : 'solid', textDecorationColor: dashed ? t.c.alert.coralText : inkOf(r!.object, r!.id) }]}>
                  {p.text}
                </Text>
              );
            })}
          </Text>
        );
        return b ? (
          <View key={i} style={{ flexDirection: 'row', gap: 10, paddingLeft: 4 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 11, backgroundColor: t.c.fg.secondary }} />
            {text}
          </View>
        ) : (
          <View key={i}>{text}</View>
        );
      })}
    </View>
  );
}

/** A 40-tall action chip with a lime icon. */
function ActionChip({ label, icon, on, onPress }: { label: string; icon: string; on?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4} onPress={onPress} style={({ pressed }) => ({ height: 40, paddingLeft: 12, paddingRight: 14, borderRadius: 999, backgroundColor: on ? t.c.fg.primary : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.85 : 1 })}>
      <Icon name={icon} size={15} color={on ? t.c.bg.ground : t.c.accent.mustard} />
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: on ? t.c.bg.ground : t.c.fg.primary }}>{label}</Text>
    </Pressable>
  );
}

interface LinkRow {
  key: string;
  id: string;
  object: string;
  title: string;
  sub: string;
  photo?: string | null;
  guess?: boolean;
  /** Removable by hand (a mention follows the text). */
  item?: LinkItem;
  /** "filed from": opens the dump. */
  dumpId?: string;
}

/** Everything the page reads about a note's Links, by word. */
function readLinks(os: LifeOSContext, note: Note) {
  const dumps = os.dumps.forEntity(note.id);
  const filings = dumps.flatMap((d) => os.filings.forDump(d.id));
  const open = filings.filter((f) => f.flag && !f.checked && !f.undone);
  const guessLinks = new Map(open.filter((f) => f.relationId).map((f) => [f.relationId!, f.flag!]));
  const guessRecords = new Map(open.filter((f) => f.entityId && f.entityId !== note.id).map((f) => [f.entityId!, f.flag!]));
  const row = (i: { id: string; type: string; title: string; linkId: string; at?: number | null }, item?: LinkItem): LinkRow => {
    const r = os.records.get(i.id);
    const def = os.registry.objects.get(i.type);
    const flag = guessLinks.get(i.linkId) ?? guessRecords.get(i.id);
    const sub = flag ?? ([r?.subtitle || def?.label, i.at ? os.format.date(i.at, 'short') : null].filter(Boolean).join(' · '));
    return { key: i.linkId, id: i.id, object: i.type, title: flag ? `${i.title}?` : i.title, sub, photo: i.type === 'person' ? photoOf(os, i.id) : null, guess: !!flag, item };
  };
  const groups: Array<{ word: string; rows: LinkRow[] }> = linkGroups(os, note.id).map((g) => ({ word: g.word, rows: g.items.map((i) => row(i, i)) }));
  const seen = new Set(groups.flatMap((g) => g.rows.map((x) => x.id)));
  const mentions = os.links.forEntity(note.id, 'mention').filter((l) => !seen.has(l.other.id));
  const words: Array<['out' | 'in', string]> = [['out', 'mentions'], ['in', 'mentioned in']];
  for (const [direction, word] of words) {
    const rows = mentions.filter((l) => l.direction === direction).map((l) => row({ id: l.other.id, type: l.other.object, title: l.other.title, linkId: l.relation.id }));
    if (rows.length) groups.push({ word, rows });
  }
  const nodes = [...new Map(groups.flatMap((g) => g.rows).map((x) => [x.id, x])).values()];
  if (dumps.length) {
    groups.push({
      word: 'filed from',
      rows: dumps.map((d) => {
        const keptTill = d.createdAt + DUMP_DAYS * DAY;
        return { key: d.id, id: d.id, object: 'dump', title: dumps.length === 1 ? '1 dump' : d.body.trim().split('\n')[0]!, sub: [SAID[d.source] ?? d.source, format(d.createdAt, 'EEE h:mm a').toLowerCase().replace(/^./, (c) => c.toUpperCase()), keptTill > Date.now() ? `kept till ${format(keptTill, 'd MMM')}` : null].filter(Boolean).join(' · '), dumpId: d.id };
      }),
    });
  }
  const count = groups.reduce((n, g) => n + g.rows.length, 0);
  // Facts this note gave, or that are about it.
  const fromFilings = filings.filter((f) => f.factId && !f.undone).map((f) => os.facts.get(f.factId!)).filter((f) => !!f);
  const named = os.facts.list({ limit: 5000 }).filter((f) => f.sourceRef === note.id || f.subjectId === note.id);
  const facts = [...new Map([...fromFilings, ...named].filter((f) => f.active).map((f) => [f.id, f])).values()];
  return { groups, nodes, count, dump: dumps[0] ?? null, facts, guesses: new Set(guessRecords.keys()) };
}

/** The small map: the note in the middle, up to eight Links round it. Tapping it opens /links. */
function LinksMap({ nodes, onPress }: { nodes: LinkRow[]; onPress: () => void }) {
  const t = useTheme();
  const [w, setW] = useState(322);
  const H = 180;
  const cx = w / 2;
  const cy = 88;
  const shown = nodes.slice(0, 8);
  const at = shown.map((n, i) => {
    const a = (-150 * Math.PI) / 180 + (i * 2 * Math.PI) / shown.length;
    return { n, x: cx + (w / 2 - 34) * Math.cos(a), y: cy + 66 * Math.sin(a) };
  });
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open Links" onPress={onPress} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={({ pressed }) => ({ height: H, borderRadius: 22, backgroundColor: t.c.bg.ground, overflow: 'hidden', opacity: pressed ? 0.9 : 1 })}>
      <Svg width={w} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
        {at.map(({ n, x, y }) => (
          <Line key={n.key} x1={cx} y1={cy} x2={x} y2={y} stroke={n.guess ? t.c.alert.coralText : t.dark ? '#FFFFFF29' : t.c.rail} strokeWidth={1.5} strokeDasharray={n.guess ? '4 4' : undefined} />
        ))}
      </Svg>
      {at.map(({ n, x, y }) => (
        <View key={n.key} style={{ position: 'absolute', left: x - 14, top: y - 14 }}>
          <RecordDisc id={n.id} object={n.object} title={n.title} photo={n.photo} size={28} guess={n.guess} />
        </View>
      ))}
      <View style={{ position: 'absolute', left: cx - 20, top: cy - 20, width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, borderWidth: 2, borderColor: JOURNAL_COLOR, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="notebook" size={18} color={JOURNAL_COLOR} />
      </View>
      <View style={{ position: 'absolute', left: 12, bottom: 10 }}>
        <Mono>1 hop</Mono>
      </View>
      <View style={{ position: 'absolute', right: 10, bottom: 10, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center' }}>
        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.onAccent }}>Open Links</Text>
      </View>
    </Pressable>
  );
}

function LinkLine({ row, onHold }: { row: LinkRow; onHold: (r: LinkRow) => void }) {
  const t = useTheme();
  const router = useRouter();
  const open = () => router.push((row.dumpId ? `/dump/${row.dumpId}` : `/entity/${row.object}/${row.id}`) as never);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${row.title}, ${row.sub}`} onPress={open} onLongPress={row.item ? () => onHold(row) : undefined} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, opacity: pressed ? 0.7 : 1 })}>
      {row.dumpId ? (
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, borderWidth: 1.5, borderColor: JOURNAL_COLOR, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="brain" size={15} color={JOURNAL_COLOR} />
        </View>
      ) : (
        <RecordDisc id={row.id} object={row.object} title={row.title} photo={row.photo} guess={row.guess} />
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: t.c.fg.primary }}>{row.title}</Text>
        {row.sub ? <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{row.sub}</Text> : null}
      </View>
      {row.guess ? <ToCheckPill /> : <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />}
    </Pressable>
  );
}

/** The Links card: count, Link, the map, then a mono word beside its rows. Hold a Link to remove it. */
function LinksCard({ note, links, ctx, controls }: { note: Note; links: ReturnType<typeof readLinks>; ctx: LifeOSContext; controls?: RecordControls }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [held, setHeld] = useState<LinkRow | null>(null);
  const openLinks = (id = note.id) => router.push(`/links/${id}` as never);
  const remove = (i: LinkItem) => {
    ctx.links.remove(i.linkId);
    toast.show({ message: `Removed the link to ${i.title}`, icon: 'link', undo: () => void ctx.links.link(i.fromId, i.toId, i.kind) });
  };
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 4, paddingHorizontal: 4 }}>
        <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary }}>Links</Text>
        <Text accessibilityRole="link" onPress={() => openLinks()} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>All</Text>
      </View>
      <View style={{ padding: 14, gap: 12, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>Links</Text>
            <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', color: t.c.fg.secondary }}>{links.count ? `${links.count} · grouped by link word` : 'Nothing linked yet'}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Link" hitSlop={4} onPress={controls?.link} style={({ pressed }) => ({ height: 36, paddingHorizontal: 18, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: pressed ? 0.85 : 1 })}>
            <Icon name="plus" size={18} color={t.c.fg.primary} />
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.fg.primary }}>Link</Text>
          </Pressable>
        </View>
        {links.nodes.length >= 2 ? <LinksMap nodes={links.nodes} onPress={() => openLinks()} /> : null}
        {links.groups.map((g, i) => (
          <React.Fragment key={g.word}>
            {i ? <Hairline /> : null}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 66, paddingTop: 13 }}>
                <Mono>{g.word}</Mono>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {g.rows.map((r) => (
                  <LinkLine key={r.key} row={r} onHold={setHeld} />
                ))}
              </View>
            </View>
          </React.Fragment>
        ))}
      </View>
      <ActionSheet
        visible={!!held}
        onClose={() => setHeld(null)}
        title={held?.title}
        actions={
          held?.item
            ? [
                { label: 'Open', icon: 'arrow-right', onPress: () => router.push(`/entity/${held.object}/${held.id}` as never) },
                { label: 'Show in Links', icon: 'link', onPress: () => openLinks(held.id) },
                { label: 'Remove link', icon: 'trash', destructive: true, onPress: () => remove(held.item!) },
              ]
            : []
        }
      />
    </>
  );
}

function DetailLine({ label, value, onPress }: { label: string; value?: string | null; onPress?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 28 }}>
      <Text style={{ fontSize: 14, lineHeight: 18, color: t.c.fg.secondary }}>{label}</Text>
      <Text numberOfLines={2} onPress={onPress} accessibilityRole={onPress ? 'link' : undefined} style={{ flexShrink: 1, textAlign: 'right', fontSize: 14, lineHeight: 18, fontWeight: '600', color: value ? t.c.fg.primary : t.c.fg.secondary }}>{value || 'None'}</Text>
    </View>
  );
}

export function NotePage({ entity, ctx, controls, say }: { entity: Note; ctx: LifeOSContext; controls?: RecordControls; say?: React.ReactNode }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [telling, setTelling] = useState(false);
  const [allEvents, setAllEvents] = useState(false);
  const body = entity.data.body ?? '';
  const mentions = useLive((os) => mentionsIn(os, body, entity.id), [body, entity.id]);
  const links = useLive((os) => readLinks(os, entity), [entity.id]);
  const tags = useLive((os) => {
    const counts = new Map(os.tags.counts().map((x) => [x.name, x.count]));
    return os.tags.forEntity(entity.id).map((x) => ({ name: x.name, count: counts.get(x.name) ?? 0 }));
  }, [entity.id]);
  const events = useLive((os) => os.records.timeline.forEntity(entity.id, 60), [entity.id]);
  const reminders = useLive((os) => os.reminders.forEntity(entity.id).filter((r) => !r.doneAt), [entity.id]);
  const files = useLive((os) => os.attachments.forEntity(entity.id), [entity.id]);
  const cover = files.find((a) => a.kind === 'cover');
  const kind = kindLabel(entity.data.kind);
  const look = kindLook(entity.data.kind);
  const at = noteAt(entity);
  const edited = entity.updatedAt - entity.createdAt > 60_000 ? `edited ${format(entity.updatedAt, 'EEE h:mm a').replace(' AM', ' am').replace(' PM', ' pm')}` : null;
  const how = links.dump ? `Filed from ${links.dump.source === 'voice' ? 'a spoken' : links.dump.source === 'share' ? 'a shared' : 'a typed'} dump` : null;
  const line = [how, edited].filter(Boolean).join(' · ');
  const project = entity.data.projectId ? ctx.records.get(entity.data.projectId) : null;
  const people = ctx.records.getMany(entity.data.personIds ?? []).map((p) => p.title);
  const source = entity.data.source?.trim();
  const anyMention = mentions.length > 0;
  const anyDashed = mentions.some((m) => !m.id || links.guesses.has(m.id));
  const shownEvents = allEvents ? events : events.slice(0, 6);

  return (
    <View style={{ paddingHorizontal: t.layout.gutter, paddingTop: insets.top + 16, gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <RoundButton icon="chevron-left" label="Back" onPress={controls?.back} />
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.fg.secondary }}>{entity.data.kind ? `Note · ${kind}` : 'Note'}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Edit" onPress={controls?.edit} style={({ pressed }) => ({ height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.fg.primary, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: t.c.bg.ground }}>Edit</Text>
          </Pressable>
          <RoundButton icon="more" label="More" onPress={controls?.more} />
        </View>
      </View>

      {cover ? (
        <Pressable accessibilityRole="imagebutton" accessibilityLabel="Cover photo" onPress={controls?.cover}>
          <Image source={{ uri: cover.uri }} style={{ width: '100%', aspectRatio: 16 / 10, borderRadius: 24, backgroundColor: t.c.bg.tile }} contentFit="cover" />
        </Pressable>
      ) : null}

      <View style={{ gap: 12, paddingTop: 8, paddingHorizontal: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {entity.data.kind ? <DotChip label={kind} color={look.color} /> : null}
          {entity.archived ? <DotChip label="Archived" color={t.c.fg.tertiary} /> : null}
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{format(at, 'EEEE d MMM yyyy · h:mm a').replace(' AM', ' am').replace(' PM', ' pm')}</Text>
        </View>
        <Text selectable accessibilityRole="header" style={{ fontSize: 40, lineHeight: 44, fontWeight: '600', letterSpacing: -1, color: t.c.fg.primary }}>{entity.title}</Text>
        {line ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name={links.dump?.source === 'voice' ? 'mic' : links.dump ? 'brain' : 'edit'} size={14} color={JOURNAL_COLOR} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '500', color: t.c.fg.secondary }}>{line}</Text>
          </View>
        ) : null}
      </View>

      <View style={{ padding: 20, gap: 14, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
        {body.trim() ? <NoteText body={body} mentions={mentions} ctx={ctx} guesses={links.guesses} /> : <Text style={{ fontSize: 16, lineHeight: 26, color: t.c.fg.secondary }}>Nothing written yet.</Text>}
        {anyMention ? (
          <>
            <Hairline />
            <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{anyDashed ? 'Underlined words are Links. A dashed one has no record yet or is a guess: tap to find it.' : 'Underlined words are Links.'}</Text>
          </>
        ) : null}
      </View>

      <SideScroll>
        {say ? <ActionChip label="Tell me about this" icon="mic" onPress={() => setTelling(true)} /> : null}
        <ActionChip label="Add a link" icon="link" onPress={() => controls?.link()} />
        <ActionChip label="Tag" icon="tag" onPress={() => controls?.tags()} />
        <ActionChip
          label={entity.starred ? 'Pinned' : 'Pin'}
          icon="pin"
          on={entity.starred}
          onPress={() => {
            ctx.records.update(entity.id, { starred: !entity.starred });
            toast.show({ message: entity.starred ? 'Unpinned' : 'Pinned', icon: 'pin' });
          }}
        />
      </SideScroll>

      <LinksCard note={entity} links={links} ctx={ctx} controls={controls} />

      {links.facts.length ? (
        <View style={{ padding: 16, gap: 12, borderRadius: 24, backgroundColor: t.c.bg.tileRaised }}>
          <Label>{`Facts from this entry · ${links.facts.length}`}</Label>
          {links.facts.map((f) => {
            const about = aboutOf(ctx, f);
            return (
              <View key={f.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <View style={{ marginTop: 1 }}>
                  {about.record ? <RecordDisc id={about.record.id} object={about.record.object} title={about.record.title} photo={photoOf(ctx, about.record.id)} size={22} /> : <Icon name="sparkle" size={18} color={JOURNAL_COLOR} />}
                </View>
                <Text selectable style={{ flex: 1, fontSize: 15, lineHeight: 22, fontWeight: '500', color: t.c.fg.primary }}>{f.text.replace(/\[\[|\]\]/g, '')}</Text>
              </View>
            );
          })}
          <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>Each one also shows on the record it is about.</Text>
        </View>
      ) : null}

      {tags.length ? (
        <View style={{ gap: 10 }}>
          <Label style={{ paddingHorizontal: 4 }}>Tags</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tags.map((x) => (
              <Pressable key={x.name} accessibilityRole="link" accessibilityLabel={`Tag ${x.name}, ${x.count}`} hitSlop={5} onPress={() => router.push(`/tag/${encodeURIComponent(x.name)}` as never)} style={({ pressed }) => ({ height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.8 : 1 })}>
                <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.primary }}>{x.name}</Text>
                <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{x.count}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {reminders.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Reminders" />
          <RowList>
            {reminders.map((r) => (
              <RowItem key={r.id} icon="bell" tint="memory" title={r.title} subtitle={ctx.format.dateTime(r.snoozedUntil ?? r.nextAt ?? r.dueAt)} onDone={() => ctx.reminders.complete(r.id)} onLongPress={() => ctx.reminders.remove(r.id)} />
            ))}
          </RowList>
        </View>
      ) : null}

      {files.some((a) => a.kind !== 'cover') ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Attachments" />
          <RowList>
            {files.filter((a) => a.kind !== 'cover').map((a) => (
              <RowItem key={a.id} icon={a.kind === 'image' ? 'image' : 'file'} tint="documents" title={a.name} onPress={() => void Linking.openURL(a.uri).catch(() => {})} onLongPress={() => ctx.attachments.remove(a.id)} />
            ))}
          </RowList>
        </View>
      ) : null}

      {events.length ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 4, paddingHorizontal: 4 }}>
            <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary }}>Timeline</Text>
            <Text accessibilityRole={events.length > 6 ? 'button' : undefined} onPress={events.length > 6 ? () => setAllEvents((a) => !a) : undefined} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>{events.length > 6 ? (allEvents ? 'Fewer' : `All ${events.length} events`) : `${events.length} ${events.length === 1 ? 'event' : 'events'}`}</Text>
          </View>
          <View style={{ padding: 16, gap: 14, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
            {shownEvents.map((e, i) => (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 5, backgroundColor: i ? t.c.fg.tertiary : t.c.accent.mustard }} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>{e.title}</Text>
                  {e.body ? <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{e.body}</Text> : null}
                </View>
                <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{shortWhen(e.occurredAt)}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <View style={{ padding: 16, gap: 12, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label>Details</Label>
          <Text accessibilityRole="button" onPress={controls?.edit} suppressHighlighting style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>Edit</Text>
        </View>
        <DetailLine label="Kind" value={entity.data.kind ? kind : null} />
        <Hairline />
        <DetailLine label="Project" value={project?.title} onPress={project ? () => router.push(`/entity/project/${project.id}` as never) : undefined} />
        <Hairline />
        <DetailLine label="People" value={people.join(', ')} />
        <Hairline />
        <DetailLine label="Source / URL" value={source} onPress={source && /^https?:\/\//.test(source) ? () => void Linking.openURL(source).catch(() => {}) : undefined} />
      </View>

      {say}

      <Sheet visible={telling} onClose={() => setTelling(false)} title={`Tell me about ${entity.title}`}>
        {say}
      </Sheet>
    </View>
  );
}
