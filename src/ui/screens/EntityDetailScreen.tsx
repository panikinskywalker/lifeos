import React, { useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import type { Entity, FieldDef } from '@core/domain/types';
import { describeRRule } from '@core/automation/recurrence';
import { useTheme } from '../theme/ThemeProvider';
import { Badge, Button, Card, Chip, Divider, EmptyState, GroupLabel, Icon, IconButton, Input, Row, Screen, SectionHeader, Text } from '../components/primitives';
import { ActionSheet, Sheet } from '../components/Sheet';
import { EntityPicker, TagEditor, DateField } from '../components/fields';
import { useLive, useOS } from '../hooks';
import { persistAttachment } from '../lib/files';

/**
 * Universal record page: fields, relations, tags, reminders, attachments,
 * comments and the full timeline. Modules add sections via
 * manifest.detailSections without touching this file.
 */
export function EntityDetailScreen({ id }: { id: string }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const entity = useLive((o) => o.entities.get(id), [id]);
  const [menu, setMenu] = useState(false);
  if (!entity) return <EmptyState icon="trash" title="Record not found" body="It may have been deleted." action="Go back" onAction={() => router.back()} />;
  const def = os.registry.type(entity.type);
  const accent = os.registry.colorFor(entity.type) ?? t.colors.tint;
  const module = os.registry.modules.get(def.module);
  const statusDef = def.statuses?.find((s) => s.value === entity.status);
  const sections = os.registry.detailSections.filter((s) => s.entityType === '*' || s.entityType === entity.type);

  const remove = () => {
    const doIt = () => {
      os.entities.delete(entity.id);
      router.back();
    };
    if (Platform.OS === 'web') doIt();
    else Alert.alert(`Delete ${def.label.toLowerCase()}?`, 'You can restore it from Settings › Data for 30 days.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: doIt }]);
  };

  return (
    <Screen padded={false} largeTitle={false}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingTop: 8, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <IconButton icon="chevron.left" bg onPress={() => router.back()} />
          <View style={{ flex: 1 }} />
          <IconButton icon={entity.starred ? 'star.fill' : 'star'} bg color={entity.starred ? t.colors.accents.yellow : t.colors.textSecondary} onPress={() => os.entities.update(entity.id, { starred: !entity.starred })} />
          <IconButton icon="pencil" bg onPress={() => router.push(`/entity/${entity.type}/${entity.id}/edit`)} />
          <IconButton icon="ellipsis" bg onPress={() => setMenu(true)} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={def.icon} size={14} color={accent} />
          <Text variant="footnote" color={accent} style={{ fontWeight: '600' }}>
            {def.label.toUpperCase()}
          </Text>
          {module ? (
            <Text variant="footnote" color="tertiary">
              · {module.name}
            </Text>
          ) : null}
        </View>
        <Text variant="title1">{entity.title}</Text>
        {entity.subtitle ? (
          <Text variant="body" color="secondary">
            {entity.subtitle}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {def.statuses?.length ? <StatusPicker entity={entity} accent={accent} /> : null}
          {entity.occurredAt ? <Badge label={os.format.date(entity.occurredAt, 'medium')} /> : null}
          {entity.archived ? <Badge label="Archived" /> : null}
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 16 }}>
        <FieldsCard entity={entity} fields={def.fields} accent={accent} />
        {sections.map((s) => {
          const C = s.component;
          return (
            <View key={s.key}>
              <C entity={entity} ctx={os} />
            </View>
          );
        })}
        <TagsCard entity={entity} accent={accent} />
        <RelationsCard entity={entity} accent={accent} />
        <RemindersCard entity={entity} accent={accent} />
        <AttachmentsCard entity={entity} accent={accent} />
        <CommentsCard entity={entity} accent={accent} />
        <TimelineCard entity={entity} accent={accent} />
        <Text variant="caption" color="tertiary" style={{ textAlign: 'center', paddingVertical: 8 }}>
          Created {os.format.dateTime(entity.createdAt)} · Updated {os.format.dateTime(entity.updatedAt)} · v{entity.version}
        </Text>
      </View>

      <ActionSheet
        visible={menu}
        onClose={() => setMenu(false)}
        title={entity.title}
        actions={[
          { label: 'Edit', icon: 'pencil', onPress: () => router.push(`/entity/${entity.type}/${entity.id}/edit`) },
          { label: 'Duplicate', icon: 'doc', onPress: () => {
            const copy = os.entities.create({ type: entity.type, title: `${entity.title} (copy)`, data: entity.data, status: entity.status });
            router.push(`/entity/${copy.type}/${copy.id}`);
          } },
          { label: entity.archived ? 'Unarchive' : 'Archive', icon: 'archivebox', onPress: () => os.entities.update(entity.id, { archived: !entity.archived }) },
          { label: 'Delete', destructive: true, onPress: remove },
        ]}
      />
    </Screen>
  );
}

function StatusPicker({ entity, accent }: { entity: Entity; accent: string }) {
  const os = useOS();
  const def = os.registry.type(entity.type);
  const [open, setOpen] = useState(false);
  const cur = def.statuses?.find((s) => s.value === entity.status);
  return (
    <>
      <Chip label={cur?.label ?? 'No status'} selected color={cur?.color ?? accent} onPress={() => setOpen(true)} icon="chevron.down" />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Status">
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {def.statuses!.map((s) => (
            <Chip
              key={s.value}
              label={s.label}
              selected={s.value === entity.status}
              color={s.color ?? accent}
              onPress={() => {
                os.entities.setStatus(entity.id, s.value);
                setOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </>
  );
}

function FieldsCard({ entity, fields, accent }: { entity: Entity; fields: FieldDef[]; accent: string }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const custom = useLive((o) => o.customFields.forType(entity.type), [entity.type]);
  const all: FieldDef[] = [...fields, ...custom.map((c) => ({ key: `custom_${c.key}`, label: c.label, type: c.fieldType, options: c.options.options }))];
  const rows = all
    .map((f) => ({ f, v: entity.data[f.key] }))
    .filter(({ v }) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0));
  if (!rows.length) return null;
  const render = (f: FieldDef, v: unknown): { text: string; onPress?: () => void; color?: string } => {
    switch (f.type) {
      case 'currency':
        return { text: os.format.currency(Number(v), (entity.data.currency as string) || undefined) };
      case 'number':
        return { text: os.format.number(Number(v), 2) };
      case 'boolean':
        return { text: v ? 'Yes' : 'No' };
      case 'date':
        return { text: os.format.date(String(v)) };
      case 'datetime':
        return { text: os.format.dateTime(Number(v)) };
      case 'select': {
        const o = f.options?.find((x) => x.value === v);
        return { text: o?.label ?? String(v), color: o?.color };
      }
      case 'multiselect':
        return { text: (v as string[]).map((x) => f.options?.find((o) => o.value === x)?.label ?? x).join(', ') };
      case 'relation': {
        const ids = Array.isArray(v) ? (v as string[]) : [String(v)];
        const refs = os.entities.getMany(ids);
        return { text: refs.map((r) => r.title).join(', ') || '—', onPress: refs.length === 1 ? () => router.push(`/entity/${refs[0].type}/${refs[0].id}`) : undefined, color: t.colors.tint };
      }
      case 'json':
        return { text: typeof v === 'string' ? v : JSON.stringify(v) };
      default:
        return { text: String(v) };
    }
  };
  return (
    <Card padded={false}>
      {rows.map(({ f, v }, i) => {
        const r = render(f, v);
        const long = f.type === 'longtext' || r.text.length > 40;
        return (
          <Pressable key={f.key} onPress={r.onPress} disabled={!r.onPress}>
            <View style={{ paddingHorizontal: 16, paddingVertical: 10, flexDirection: long ? 'column' : 'row', gap: long ? 4 : 12, alignItems: long ? 'stretch' : 'center' }}>
              <Text variant="subhead" color="secondary" style={{ flexShrink: 0 }}>
                {f.label}
              </Text>
              <Text variant="body" color={r.color} style={{ flex: long ? undefined : 1, textAlign: long ? 'left' : 'right' }} selectable>
                {r.text}
              </Text>
            </View>
            {i < rows.length - 1 ? <Divider inset={16} /> : null}
          </Pressable>
        );
      })}
    </Card>
  );
}

function TagsCard({ entity, accent }: { entity: Entity; accent: string }) {
  const os = useOS();
  const router = useRouter();
  const tags = useLive((o) => o.tags.forEntity(entity.id), [entity.id]);
  const [edit, setEdit] = useState(false);
  return (
    <View>
      <SectionHeader title="Tags" icon="tag" color={accent} action={edit ? 'Done' : 'Edit'} onAction={() => setEdit((e) => !e)} />
      <Card>
        {edit ? (
          <TagEditor tags={tags.map((x) => x.name)} onChange={(names) => os.tags.set(entity.id, names)} accent={accent} />
        ) : tags.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {tags.map((tag) => (
              <Chip key={tag.id} label={`#${tag.name}`} color={tag.color ?? accent} onPress={() => router.push(`/tag/${encodeURIComponent(tag.name)}`)} />
            ))}
          </View>
        ) : (
          <Text color="tertiary">No tags</Text>
        )}
      </Card>
    </View>
  );
}

function RelationsCard({ entity, accent }: { entity: Entity; accent: string }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const rels = useLive((o) => o.relations.forEntity(entity.id), [entity.id]);
  const [pick, setPick] = useState(false);
  const [kind, setKind] = useState('related');
  const def = os.registry.type(entity.type);
  const kinds = [...new Set(['related', ...(def.relations?.map((r) => r.kind) ?? []), ...rels.map((r) => r.relation.kind)])];
  const grouped = new Map<string, typeof rels>();
  for (const r of rels) {
    const k = r.relation.kind;
    if (!grouped.has(k)) grouped.set(k, []);
    grouped.get(k)!.push(r);
  }
  const kindLabel = (k: string) => def.relations?.find((r) => r.kind === k)?.label ?? k.charAt(0).toUpperCase() + k.slice(1);
  return (
    <View>
      <SectionHeader title="Related" icon="link" color={accent} action="Link" onAction={() => setPick(true)} />
      {rels.length ? (
        [...grouped.entries()].map(([k, items]) => (
          <View key={k} style={{ marginBottom: 10 }}>
            <Text variant="footnote" color="secondary" style={{ marginBottom: 4, marginLeft: 4 }}>
              {kindLabel(k)}
            </Text>
            <Card padded={false}>
              {items.map((r, i) => {
                const d = os.registry.entityTypes.get(r.other.type);
                return (
                  <Row
                    key={r.relation.id}
                    title={r.other.title}
                    subtitle={d?.label}
                    icon={d?.icon}
                    iconColor={os.registry.colorFor(r.other.type)}
                    last={i === items.length - 1}
                    onPress={() => router.push(`/entity/${r.other.type}/${r.other.id}`)}
                    onLongPress={() => os.relations.unlink(entity.id, r.other.id, r.relation.kind)}
                  />
                );
              })}
            </Card>
          </View>
        ))
      ) : (
        <Card>
          <Text color="tertiary">Not linked to anything yet. Link people, trips, projects, accounts…</Text>
        </Card>
      )}
      <Sheet visible={pick} onClose={() => setPick(false)} title="Link as…">
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {kinds.map((k) => (
              <Chip key={k} label={kindLabel(k)} selected={kind === k} onPress={() => setKind(k)} color={accent} />
            ))}
          </ScrollView>
          <Input placeholder="Or type a custom kind" value={kinds.includes(kind) ? '' : kind} onChangeText={setKind} />
          <PickInline onPick={(id) => { os.relations.link(entity.id, id, kind || 'related'); setPick(false); }} exclude={[entity.id]} />
        </View>
      </Sheet>
      {/* keep t referenced for potential theming */}
      <View style={{ height: 0, backgroundColor: t.colors.background }} />
    </View>
  );
}

function PickInline({ onPick, exclude }: { onPick: (id: string) => void; exclude: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button title="Choose record" variant="secondary" icon="magnifyingglass" onPress={() => setOpen(true)} />
      <EntityPicker visible={open} onClose={() => setOpen(false)} types={[]} exclude={exclude} onSelect={(id) => { setOpen(false); onPick(id); }} />
    </>
  );
}

function RemindersCard({ entity, accent }: { entity: Entity; accent: string }) {
  const os = useOS();
  const t = useTheme();
  const reminders = useLive((o) => o.reminders.forEntity(entity.id), [entity.id]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState<number | undefined>(undefined);
  const [rrule, setRrule] = useState<string | null>(null);
  const active = reminders.filter((r) => !r.doneAt);
  return (
    <View>
      <SectionHeader title="Reminders" icon="bell" color={accent} action="Add" onAction={() => { setTitle(`Follow up: ${entity.title}`); setDue(Date.now() + 86400000); setOpen(true); }} />
      {active.length ? (
        <Card padded={false}>
          {active.map((r, i) => (
            <Row
              key={r.id}
              title={r.title}
              subtitle={`${os.format.dateTime(r.snoozedUntil ?? r.nextAt ?? r.dueAt)} · ${describeRRule(r.rrule)}`}
              icon="bell"
              iconColor={(r.nextAt ?? r.dueAt) < Date.now() ? t.colors.danger : accent}
              last={i === active.length - 1}
              chevron={false}
              right={<IconButton icon="checkmark.circle" onPress={() => os.reminders.complete(r.id)} color={t.colors.success} />}
              onLongPress={() => os.reminders.remove(r.id)}
            />
          ))}
        </Card>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title="New reminder">
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          <Input value={title} onChangeText={setTitle} placeholder="Reminder" autoFocus />
          <DateField field={{ key: 'due', label: 'When', type: 'datetime' }} value={due} onChange={(v) => setDue(v as number | undefined)} />
          <Text variant="footnote" color="secondary">
            Repeat
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[[null, 'Once'], ['FREQ=DAILY;INTERVAL=1', 'Daily'], ['FREQ=WEEKLY;INTERVAL=1', 'Weekly'], ['FREQ=MONTHLY;INTERVAL=1', 'Monthly'], ['FREQ=YEARLY;INTERVAL=1', 'Yearly']].map(([v, l]) => (
              <Chip key={l} label={l!} selected={rrule === v} onPress={() => setRrule(v)} color={accent} />
            ))}
          </View>
          <Button title="Save reminder" color={accent} disabled={!title || !due} onPress={() => { os.reminders.create({ entityId: entity.id, title, dueAt: due!, rrule }); setOpen(false); }} />
        </View>
      </Sheet>
    </View>
  );
}

function AttachmentsCard({ entity, accent }: { entity: Entity; accent: string }) {
  const os = useOS();
  const t = useTheme();
  const items = useLive((o) => o.attachments.forEntity(entity.id), [entity.id]);
  const [menu, setMenu] = useState(false);
  const pickDoc = async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const uri = await persistAttachment(a.uri, a.name);
    os.attachments.add({ entityId: entity.id, name: a.name, mime: a.mimeType ?? null, size: a.size ?? null, uri, kind: a.mimeType?.startsWith('image/') ? 'image' : 'file' });
  };
  const pickImage = async (camera: boolean) => {
    const r = camera ? await ImagePicker.launchCameraAsync({ quality: 0.8 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images'] });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const name = a.fileName ?? `photo-${Date.now()}.jpg`;
    const uri = await persistAttachment(a.uri, name);
    os.attachments.add({ entityId: entity.id, name, mime: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? null, uri, kind: entity.type === 'transaction' ? 'receipt' : 'image' });
  };
  const images = items.filter((a) => a.kind === 'image' || a.kind === 'receipt' || a.mime?.startsWith('image/'));
  const files = items.filter((a) => !images.includes(a));
  return (
    <View>
      <SectionHeader title="Attachments" icon="paperclip" color={accent} action="Add" onAction={() => setMenu(true)} />
      {items.length ? (
        <Card padded={false}>
          {images.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8 }}>
              {images.map((a) => (
                <Pressable key={a.id} onLongPress={() => os.attachments.remove(a.id)} onPress={() => Linking.openURL(a.uri).catch(() => {})}>
                  <Image source={{ uri: a.uri }} style={{ width: 96, height: 96, borderRadius: 10, backgroundColor: t.colors.fillSecondary }} contentFit="cover" />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {files.map((a, i) => (
            <Row key={a.id} title={a.name} subtitle={[a.mime, a.size ? `${Math.round(a.size / 1024)} KB` : null].filter(Boolean).join(' · ')} icon="doc" iconColor={accent} last={i === files.length - 1} onPress={() => Linking.openURL(a.uri).catch(() => {})} onLongPress={() => os.attachments.remove(a.id)} />
          ))}
        </Card>
      ) : null}
      <ActionSheet visible={menu} onClose={() => setMenu(false)} title="Attach" actions={[
        { label: 'Take photo', onPress: () => void pickImage(true) },
        { label: 'Choose photo', onPress: () => void pickImage(false) },
        { label: 'Choose file', onPress: () => void pickDoc() },
      ]} />
    </View>
  );
}

function CommentsCard({ entity, accent }: { entity: Entity; accent: string }) {
  const os = useOS();
  const t = useTheme();
  const comments = useLive((o) => o.comments.forEntity(entity.id), [entity.id]);
  const [text, setText] = useState('');
  return (
    <View>
      <SectionHeader title="Notes & comments" icon="bubble.left" color={accent} />
      <Card style={{ gap: 10 }}>
        {comments.map((c) => (
          <Pressable key={c.id} onLongPress={() => os.comments.remove(c.id)} style={{ gap: 2 }}>
            <Text variant="body">{c.body}</Text>
            <Text variant="caption" color="tertiary">
              {c.author === 'user' ? 'You' : c.author} · {os.format.dateTime(c.createdAt)}
            </Text>
          </Pressable>
        ))}
        <Input value={text} onChangeText={setText} placeholder="Add a note…" multiline right={text.trim() ? <IconButton icon="arrow.up.circle.fill" onPress={() => { os.comments.add(entity.id, text.trim()); setText(''); }} color={accent} /> : undefined} style={{ minHeight: 44 }} />
      </Card>
      <View style={{ height: 0, backgroundColor: t.colors.background }} />
    </View>
  );
}

function TimelineCard({ entity, accent }: { entity: Entity; accent: string }) {
  const os = useOS();
  const t = useTheme();
  const events = useLive((o) => o.entities.timeline.forEntity(entity.id, 60), [entity.id]);
  const [all, setAll] = useState(false);
  const shown = all ? events : events.slice(0, 6);
  const iconFor = (k: string) => ({ created: 'plus.circle.fill', updated: 'pencil', status: 'flag', comment: 'bubble.left', attachment: 'paperclip', relation: 'link', reminder: 'bell', tag: 'tag' })[k] ?? 'circle.fill';
  return (
    <View>
      <SectionHeader title="Timeline" icon="clock" color={accent} action={events.length > 6 ? (all ? 'Less' : `All ${events.length}`) : undefined} onAction={() => setAll((a) => !a)} />
      <Card padded={false}>
        {shown.map((e, i) => (
          <View key={e.id} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10 }}>
            <View style={{ alignItems: 'center', width: 20 }}>
              <Icon name={iconFor(e.kind)} size={16} color={e.actor === 'automation' ? t.colors.accents.purple : e.actor === 'assistant' ? t.colors.accents.indigo : accent} />
              {i < shown.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: t.colors.separator, marginTop: 4 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: 4 }}>
              <Text variant="subhead">{e.title}</Text>
              {e.body ? (
                <Text variant="footnote" color="secondary" numberOfLines={3}>
                  {e.body}
                </Text>
              ) : null}
              <Text variant="caption" color="tertiary">
                {os.format.dateTime(e.occurredAt)}
                {e.actor !== 'user' ? ` · ${e.actor}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

// re-export for modules that want to compose the standard blocks
export { GroupLabel };
