import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordFormProps } from '@core/registry/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, Chip, IconButton, OptionPills, Screen, Section, Text, TextField, useToast } from '@ui/kit';
import { EntityPicker, FieldInput } from '@ui/components/fields';
import { mentionsIn, noteTitle, noteType, NOTE_KINDS, type Mention, type NoteData } from '@modules/knowledge';

/**
 * A Note's page and form (R7f; a first pass from the kit until the
 * NR-Knowledge-Note artboards). The body reads with its [[mentions]] as
 * links: a known one opens its record, an unknown one is faded and searches.
 */

/** Splits a line into text and [[mentions]]. */
function pieces(line: string): Array<{ text: string; mention?: string }> {
  const out: Array<{ text: string; mention?: string }> = [];
  let last = 0;
  for (const m of line.matchAll(/\[\[([^[\]\n]{1,80})\]\]/g)) {
    if (m.index! > last) out.push({ text: line.slice(last, m.index) });
    out.push({ text: m[1]!.trim(), mention: m[1]!.trim() });
    last = m.index! + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

/** The body, line by line: # headings, - bullets, [[mentions]] tappable. */
export function NoteText({ body, mentions, ctx }: { body: string; mentions: Mention[]; ctx: LifeOSContext }) {
  const t = useTheme();
  const router = useRouter();
  const byTitle = new Map(mentions.map((m) => [m.title, m.id]));
  const open = (title: string) => {
    const id = byTitle.get(title);
    const r = id ? ctx.records.get(id) : null;
    if (r) router.push(`/entity/${r.object}/${r.id}` as never);
    else router.push({ pathname: '/search', params: { q: title } } as never);
  };
  const lines = body.split('\n');
  return (
    <View style={{ gap: 6 }}>
      {lines.map((raw, i) => {
        if (!raw.trim()) return <View key={i} style={{ height: 6 }} />;
        const h = raw.match(/^\s*(#{1,3})\s+(.*)$/);
        const b = raw.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
        const line = h ? h[2]! : b ? b[1]! : raw;
        const text = (
          <Text selectable style={{ flex: b ? 1 : undefined, fontSize: h ? (h[1]!.length === 1 ? 20 : 17) : 16, lineHeight: h ? 26 : 23, fontWeight: h ? '700' : '400', color: t.c.fg.primary }}>
            {pieces(line).map((p, j) =>
              p.mention ? (
                <Text key={j} onPress={() => open(p.mention!)} style={{ color: byTitle.get(p.mention) ? t.tints.memory.ink : t.c.fg.tertiary, fontWeight: '600', textDecorationLine: byTitle.get(p.mention) ? 'none' : 'underline', textDecorationStyle: 'dotted' }}>
                  {p.text}
                </Text>
              ) : (
                <Text key={j}>{p.text}</Text>
              ),
            )}
          </Text>
        );
        return b ? (
          <View key={i} style={{ flexDirection: 'row', gap: 10, paddingLeft: 4 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 9, backgroundColor: t.c.fg.secondary }} />
            {text}
          </View>
        ) : (
          <View key={i}>{text}</View>
        );
      })}
    </View>
  );
}

/** The Note's record section (placement top; the Details card leaves the body to it). */
export function NoteBody({ entity, ctx }: { entity: ObjectRecord<NoteData>; ctx: LifeOSContext }) {
  const router = useRouter();
  const body = entity.data.body ?? '';
  const mentions = useLive((os) => mentionsIn(os, body, entity.id), [body, entity.id]);
  const unknown = mentions.filter((m) => !m.id);
  const kind = NOTE_KINDS.find((k) => k.value === entity.data.kind)?.label;
  return (
    <Card>
      <View style={{ gap: 14 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          {kind ? <Chip label={kind} tint="memory" small /> : null}
          {entity.starred ? <Chip label="Pinned" icon="pin" small /> : null}
          <Text variant="caption" color="tertiary">
            {ctx.format.date(entity.updatedAt, 'relative')} · {body.trim() ? body.trim().split(/\s+/).length : 0} words
          </Text>
        </View>
        {body.trim() ? <NoteText body={body} mentions={mentions} ctx={ctx} /> : <Text color="tertiary">Nothing written yet.</Text>}
        {unknown.length ? (
          <View style={{ gap: 6 }}>
            <Text variant="caption" color="tertiary">
              Not linked yet: no record has {unknown.length === 1 ? 'this name' : 'these names'}. Tap one to find it or make it.
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {unknown.map((m) => (
                <Chip key={m.title} label={m.title} icon="search" small onPress={() => router.push({ pathname: '/search', params: { q: m.title } } as never)} />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const linkFields = noteType.fields.filter((f) => f.section === 'Links');

/** The Note form: title (or the first line), kind, the body with Mention, then source, project and people. */
export function NoteForm({ id, initial, onSaved, linkTo }: RecordFormProps) {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const existing = id ? (os.records.get(id) as ObjectRecord<NoteData> | null) : null;
  const start: NoteData = existing?.data ?? { body: String(initial?.body ?? ''), kind: (initial?.kind as string) ?? undefined, personIds: (initial?.personIds as string[]) ?? [] };
  const [title, setTitle] = useState(existing && existing.title !== noteTitle(existing.data.body) && existing.title !== 'Note' ? existing.title : String(initial?.title ?? ''));
  const [d, setD] = useState<NoteData>(start);
  const [picking, setPicking] = useState(false);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/board/knowledge' as never));

  const mention = (rid: string) => {
    const r = os.records.get(rid);
    if (!r) return;
    const tag = `[[${r.title}]]`;
    const at = sel?.start ?? d.body.length;
    const before = d.body.slice(0, at);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    setD((x) => ({ ...x, body: `${before}${pad}${tag} ${x.body.slice(sel?.end ?? at)}` }));
  };

  const save = () => {
    if (!d.body.trim()) return;
    const data: NoteData = { ...d, body: d.body.replace(/\s+$/, ''), source: d.source?.trim() || undefined };
    try {
      const saved = (id ? os.records.update<NoteData>(id, { title: title.trim(), data }, 'user') : os.records.create<NoteData>({ object: 'note', title: title.trim() || undefined, data }, 'user')) as unknown as ObjectRecord;
      if (linkTo && !id) os.links.link(saved.id, linkTo.id, linkTo.kind);
      if (onSaved) onSaved(saved);
      else if (id) close();
      else router.replace(`/entity/note/${saved.id}` as never);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };

  return (
    <Screen title={id ? 'Edit note' : 'New note'} subtitle={id ? existing?.title : 'Second Brain'} onBack={close} right={<IconButton icon="check" filled accessibilityLabel="Save note" disabled={!d.body.trim()} onPress={save} />}>
      <TextField label="Title" value={title} onChange={setTitle} placeholder={noteTitle(d.body) || 'The first line, unless you name it'} />
      <OptionPills label="Kind" options={NOTE_KINDS} value={d.kind} onChange={(v) => setD((x) => ({ ...x, kind: v }))} />
      <TextField
        label="Note"
        required
        multiline
        value={d.body}
        onChange={(v) => setD((x) => ({ ...x, body: v }))}
        onSelectionChange={(e) => setSel(e.nativeEvent.selection)}
        placeholder={'Write anything.\n[[Name]] links a person, place or thing.'}
        autoFocus={!id}
        numberOfLines={10}
      />
      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        <Button title="Mention" icon="link" size="sm" variant="secondary" onPress={() => setPicking(true)} />
        <Text variant="caption" color="tertiary" style={{ flex: 1 }}>
          Or type [[ and a name. Each one links this note to that record.
        </Text>
      </View>
      <Section title="Links">
        <View style={{ gap: 12 }}>
          {linkFields.map((f) => (
            <FieldInput key={f.key} field={f} value={(d as Record<string, unknown>)[f.key]} onChange={(v) => setD((x) => ({ ...x, [f.key]: v }))} />
          ))}
        </View>
      </Section>
      <Button title={id ? 'Save changes' : 'Save note'} icon="check" size="lg" block disabled={!d.body.trim()} onPress={save} />
      <EntityPicker visible={picking} onClose={() => setPicking(false)} types={[]} title="Mention" exclude={id ? [id] : undefined} onSelect={(rid) => mention(rid)} />
    </Screen>
  );
}
