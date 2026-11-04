import React, { useMemo, useState } from 'react';
import { Pressable, TextInput, View, type KeyboardTypeOptions, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { RecordFormProps } from '@core/registry/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks, fontForWeight } from '@ui/theme/tokens';
import { ActionSheet, Button, Icon, Screen, Sheet, Text, TextField, useToast } from '@ui/kit';
import { EntityPicker } from '@ui/components/fields';
import { mentionsIn, NOTE_KINDS, noteTitle, type NoteData } from '@modules/knowledge';
import { Face, kindLook, KindPill, Label, LockLine, RecordDisc, RoundButton, SideScroll, TopBar } from './parts';
import { photoOf } from './read';

/**
 * The Note form (NR-Journal-Form; New and Edit): kind, title, the body with
 * [[ to link (a record, or a new one), then people, project, source and tags.
 * Save at the top and the bottom. Mention (MODEL.md, not on the artboard) picks
 * a record without typing.
 */

/** Objects a new record from [[ can be, in this order, when installed. */
const NEW_OBJECTS = ['person', 'place', 'project', 'org', 'trip', 'event'];
const OTHER_TAGS = 6;

/** A form input: 56 tall (or taller when multiline), 20 round, a hairline; white when focused. */
function Input({ label, value, onChange, placeholder, multiline, keyboardType, onSelect, autoFocus, right }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; keyboardType?: KeyboardTypeOptions; onSelect?: (s: { start: number; end: number }) => void; autoFocus?: boolean; right?: string }) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  const type: TextStyle = multiline ? { fontSize: 16, lineHeight: 25, fontFamily: fontForWeight(400) } : { fontSize: 16, fontFamily: fontForWeight(500) };
  return (
    <View style={{ gap: 8 }}>
      <FieldLabel right={right}>{label}</FieldLabel>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.c.fg.tertiary}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'url' ? 'none' : undefined}
        autoFocus={autoFocus}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onSelectionChange={onSelect ? (e) => onSelect(e.nativeEvent.selection) : undefined}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[type, { minHeight: multiline ? 240 : 56, paddingHorizontal: 18, paddingVertical: multiline ? 16 : 0, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: focus ? 1.5 : 1, borderColor: focus ? t.c.fg.primary : t.c.line, color: t.c.fg.primary }]}
      />
    </View>
  );
}

function FieldLabel({ children, right }: { children: string; right?: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 4 }}>
      <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>{children}</Text>
      {right ? <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary, fontVariant: ['tabular-nums'] }}>{right}</Text> : null}
    </View>
  );
}

function Hint({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary, paddingHorizontal: 4 }}>{children}</Text>;
}

/** A dashed pill: add something. */
function AddPill({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4} onPress={onPress} style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.fg.tertiary, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.7 : 1 })}>
      <Icon name="plus" size={13} color={t.c.fg.primary} />
      <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.primary }}>{label}</Text>
    </Pressable>
  );
}

/** The panel under the body while typing [[: matching records, then a new one. */
function LinkTo({ query, exclude, onPick, onNew }: { query: string; exclude?: string; onPick: (title: string) => void; onNew: (name: string) => void }) {
  const t = useTheme();
  const hits = useLive(
    (os) => {
      const found = query.trim() ? os.records.search.search(query.trim(), { limit: 10 }).map((h) => ({ id: h.id, object: h.object, title: h.title })) : os.records.query('person', { sort: [{ field: 'updatedAt', dir: 'desc' }] }, { limit: 3 }).map((r) => ({ id: r.id, object: r.object, title: r.title }));
      return found
        .filter((h) => h.object !== 'fact' && h.object !== 'dump' && h.id !== exclude)
        .slice(0, 3)
        .map((h) => {
          const r = os.records.get(h.id);
          return { ...h, sub: [os.registry.objects.get(h.object)?.label, r?.subtitle].filter(Boolean).join(' · '), photo: h.object === 'person' ? photoOf(os, h.id) : null };
        });
    },
    [query, exclude],
  );
  const name = query.trim();
  const rowStyle = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 10, borderRadius: 14 } as const;
  return (
    <View style={{ padding: 8, gap: 2, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 8 }}>
      <Label style={{ paddingTop: 8, paddingBottom: 4, paddingHorizontal: 10 }}>Link to</Label>
      {hits.map((h, i) => (
        <Pressable key={h.id} accessibilityRole="button" accessibilityLabel={`Link to ${h.title}`} onPress={() => onPick(h.title)} style={({ pressed }) => [rowStyle, { backgroundColor: pressed || i === 0 ? '#FFFFFF0F' : 'transparent' }]}>
          <RecordDisc id={h.id} object={h.object} title={h.title} photo={h.photo} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>{h.title}</Text>
            <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{h.sub}</Text>
          </View>
        </Pressable>
      ))}
      {name ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`New record ${name}`} onPress={() => onNew(name)} style={({ pressed }) => [rowStyle, { opacity: pressed ? 0.7 : 1 }]}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.c.bg.tile, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.fg.tertiary, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="plus" size={14} color={t.c.fg.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>{`New record “${name}…”`}</Text>
            <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>Pick its Object next</Text>
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

export function NoteForm({ id, initial, onSaved, linkTo }: RecordFormProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const existing = id ? (os.records.get(id) as ObjectRecord<NoteData> | null) : null;
  const start: NoteData = existing?.data ?? { body: String(initial?.body ?? ''), kind: (initial?.kind as string) ?? 'journal', personIds: (initial?.personIds as string[]) ?? [] };
  const [title, setTitle] = useState(existing && existing.title !== noteTitle(existing.data.body) && existing.title !== 'Note' ? existing.title : String(initial?.title ?? ''));
  const [d, setD] = useState<NoteData>(start);
  const [sel, setSel] = useState<{ start: number; end: number } | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>(() => (id ? os.tags.forEntity(id).map((x) => x.name) : []));
  const [picking, setPicking] = useState<null | 'mention' | 'person' | 'project'>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [addingTag, setAddingTag] = useState(false);
  const [tagText, setTagText] = useState('');
  const close = () => (router.canGoBack() ? router.back() : router.replace('/board/knowledge' as never));
  const [openedAt] = useState(() => existing?.createdAt ?? Date.now());

  const body = d.body;
  const set = (patch: Partial<NoteData>) => setD((x) => ({ ...x, ...patch }));

  // The [[ being typed, up to the cursor.
  const cursor = sel?.end ?? body.length;
  const typing = body.slice(0, cursor).match(/\[\[([^[\]\n]{0,40})$/);
  const replaceTyping = (name: string) => {
    if (!typing) return;
    const from = typing.index ?? cursor;
    const next = `${body.slice(0, from)}[[${name}]] ${body.slice(cursor)}`;
    const pos = from + name.length + 5;
    set({ body: next });
    setSel({ start: pos, end: pos });
  };

  /** Writes [[title]] at the cursor (Mention). */
  const mention = (rid: string) => {
    const r = os.records.get(rid);
    if (!r) return;
    const at = sel?.start ?? body.length;
    const before = body.slice(0, at);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    set({ body: `${before}${pad}[[${r.title}]] ${body.slice(sel?.end ?? at)}` });
    setSel(null);
  };

  /** A record from "New record": its title and the Object's required text Field. */
  const createFor = (object: string, name: string) => {
    try {
      const def = os.registry.object(object);
      const field = def.fields.find((f) => f.required && f.type === 'text');
      os.records.create({ object, title: name, data: field ? { [field.key]: name } : {} }, 'user');
      replaceTyping(name);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };

  // People: the ones you added, plus those mentioned in what you wrote, unless you took them off.
  const found = useLive((o) => mentionsIn(o, body, id).map((m) => (m.id ? o.records.get(m.id) : null)).filter((r) => r?.object === 'person').map((r) => r!.id), [body, id]);
  const peopleIds = useMemo(() => [...new Set([...(d.personIds ?? []), ...found])].filter((p) => !removed.includes(p)), [d.personIds, found, removed]);
  const people = useLive((o) => o.records.getMany(peopleIds).map((p) => ({ id: p.id, name: p.title, photo: photoOf(o, p.id) })), [peopleIds]);
  const project = useLive((o) => (d.projectId ? o.records.get(d.projectId) : null), [d.projectId]);
  const tagCounts = useLive((o) => o.tags.counts().map((x) => x.name), []);
  const tagChoices = [...new Set([...tags, ...tagCounts.slice(0, OTHER_TAGS)])];

  const canSave = !!body.trim();
  const save = () => {
    if (!canSave) return;
    const data: NoteData = { ...d, body: body.replace(/\s+$/, ''), source: d.source?.trim() || undefined, personIds: peopleIds };
    try {
      const saved = (id ? os.records.update<NoteData>(id, { title: title.trim(), data }, 'user') : os.records.create<NoteData>({ object: 'note', title: title.trim() || undefined, data }, 'user')) as unknown as ObjectRecord;
      os.tags.set(saved.id, tags);
      if (linkTo && !id) os.links.link(saved.id, linkTo.id, linkTo.kind);
      if (onSaved) onSaved(saved);
      else if (id) close();
      else router.replace(`/entity/note/${saved.id}` as never);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };

  const addTag = () => {
    const name = tagText.trim().toLowerCase();
    if (name && !tags.includes(name)) setTags((x) => [...x, name]);
    setTagText('');
    setAddingTag(false);
  };

  return (
    <Screen contentStyle={{ gap: 22 }}>
      <TopBar
        title={id ? 'Edit note' : 'New note'}
        onBack={close}
        backIcon="x"
        backLabel="Close"
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Save note" accessibilityState={{ disabled: !canSave }} disabled={!canSave} hitSlop={2} onPress={save} style={({ pressed }) => ({ height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center', opacity: !canSave ? 0.45 : pressed ? 0.85 : 1 })}>
            <Text style={{ fontSize: 13, lineHeight: 20, fontWeight: '700', color: t.c.fg.onAccent }}>Save</Text>
          </Pressable>
        }
      />

      <View style={{ gap: 8 }}>
        <FieldLabel>Kind</FieldLabel>
        <SideScroll>
          {NOTE_KINDS.map((k) => (
            <KindPill key={k.value} label={k.label} color={kindLook(k.value).color} selected={d.kind === k.value} onPress={() => set({ kind: d.kind === k.value ? undefined : k.value })} />
          ))}
        </SideScroll>
      </View>

      <View style={{ gap: 8 }}>
        <Input label="Title" value={title} onChange={setTitle} placeholder={noteTitle(body) || undefined} />
        <Hint>Leave it and the first line becomes the title.</Hint>
      </View>

      <View style={{ gap: 8 }}>
        <Input label="Note" multiline value={body} onChange={(v) => set({ body: v })} onSelect={setSel} placeholder={'Write anything.\n[[Name]] links a person, place or thing.'} autoFocus={!id} right={format(openedAt, 'EEE d MMM · h:mm a').replace(' AM', ' am').replace(' PM', ' pm')} />
        {typing ? <LinkTo query={typing[1]!} exclude={id} onPick={replaceTyping} onNew={setNewName} /> : null}
        <Hint>Write anything. Markdown-ish is fine. Type [[ to link a person, place or anything else.</Hint>
        <View style={{ flexDirection: 'row' }}>
          <AddPill label="Mention" onPress={() => setPicking('mention')} />
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <Label style={{ paddingHorizontal: 4 }}>Links</Label>
        <View style={{ gap: 8 }}>
          <FieldLabel>People</FieldLabel>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            {people.map((p) => (
              <View key={p.id} style={{ height: 36, paddingHorizontal: 4, borderRadius: 999, backgroundColor: t.dark ? '#FFFFFF14' : t.c.bg.dim, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Face id={p.id} name={p.name} photo={p.photo} size={28} />
                <Text numberOfLines={1} style={{ maxWidth: 160, fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.primary }}>{p.name}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${p.name}`}
                  hitSlop={8}
                  onPress={() => {
                    setRemoved((x) => [...x, p.id]);
                    set({ personIds: (d.personIds ?? []).filter((x) => x !== p.id) });
                  }}
                  style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.dark ? '#FFFFFF1A' : t.c.bg.dim, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="x" size={11} color={t.c.fg.primary} />
                </Pressable>
              </View>
            ))}
            <AddPill label="Person" onPress={() => setPicking('person')} />
          </View>
          <Hint>{found.length ? 'Found in what you wrote. Each note shows on their profile.' : 'Each note shows on their profile.'}</Hint>
        </View>

        <View style={{ gap: 8 }}>
          <FieldLabel>Project</FieldLabel>
          <Pressable accessibilityRole="button" accessibilityLabel={project ? `Project ${project.title}` : 'Pick a project'} onPress={() => setPicking('project')} style={({ pressed }) => ({ minHeight: 56, paddingLeft: 18, paddingRight: project ? 8 : 18, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line, flexDirection: 'row', alignItems: 'center', gap: 10, opacity: pressed ? 0.85 : 1 })}>
            <Icon name="folder" size={18} color={blocks.lilac} />
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '500', color: project ? t.c.fg.primary : t.c.fg.secondary }}>{project?.title ?? 'Pick a project'}</Text>
            {project ? <RoundButton icon="x" label="Remove the project" size={40} iconSize={14} onPress={() => set({ projectId: undefined })} /> : <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />}
          </Pressable>
        </View>

        <Input label="Source / URL" value={d.source ?? ''} onChange={(v) => set({ source: v })} placeholder="Where it came from, if anywhere" keyboardType="url" />
      </View>

      <View style={{ gap: 8 }}>
        <FieldLabel>Tags</FieldLabel>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {tagChoices.map((name) => {
            const on = tags.includes(name);
            return (
              <Pressable key={name} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected: on }} hitSlop={5} onPress={() => setTags((x) => (on ? x.filter((y) => y !== name) : [...x, name]))} style={({ pressed }) => ({ height: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: on ? t.c.fg.primary : t.c.bg.tileRaised, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
                <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: on ? t.c.bg.ground : t.c.fg.primary }}>{name}</Text>
              </Pressable>
            );
          })}
          <AddPill label="Tag" onPress={() => setAddingTag(true)} />
        </View>
      </View>

      <LockLine>Saved on this phone only.</LockLine>
      <Button title={id ? 'Save changes' : 'Save note'} size="lg" block disabled={!canSave} onPress={save} />

      <EntityPicker
        visible={!!picking}
        onClose={() => setPicking(null)}
        types={picking === 'person' ? ['person'] : picking === 'project' ? ['project'] : []}
        title={picking === 'person' ? 'Person' : picking === 'project' ? 'Project' : 'Mention'}
        exclude={id ? [id] : undefined}
        onSelect={(rid) => {
          if (picking === 'mention') mention(rid);
          if (picking === 'project') set({ projectId: rid });
          if (picking === 'person') {
            setRemoved((x) => x.filter((p) => p !== rid));
            set({ personIds: [...new Set([...(d.personIds ?? []), rid])] });
          }
          setPicking(null);
        }}
      />
      <ActionSheet
        visible={!!newName}
        onClose={() => setNewName(null)}
        title={`What is “${newName ?? ''}”?`}
        actions={NEW_OBJECTS.filter((o) => os.registry.objects.has(o)).map((o) => {
          const def = os.registry.object(o);
          return { label: def.label, icon: o === 'person' ? 'user' : o === 'place' ? 'location' : o === 'project' ? 'folder' : o === 'org' ? 'briefcase' : o === 'trip' ? 'plane' : 'calendar', onPress: () => createFor(o, newName!) };
        })}
      />
      <Sheet visible={addingTag} onClose={() => setAddingTag(false)} title="Tag" footer={<Button title="Add tag" block disabled={!tagText.trim()} onPress={addTag} />}>
        <TextField label="Tag" value={tagText} onChange={setTagText} placeholder="family" autoFocus onSubmitEditing={addTag} />
      </Sheet>
    </Screen>
  );
}
