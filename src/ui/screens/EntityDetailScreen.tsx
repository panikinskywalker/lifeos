import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import type { Entity, FieldDef } from '@core/domain/types';
import { describeRRule } from '@core/automation/recurrence';
import type { LifeOSContext } from '@core/registry/context';
import { useTheme } from '../theme/ThemeProvider';
import { tintForModule } from '../theme/moduleTint';
import type { TintKey } from '../theme/tokens';
import { ActionSheet, Button, Card, Chip, DateField, DetailRow, EmptyState, Field, FilterChip, IconButton, NumberField, RecordHeader, RowItem, RowList, Section, Sheet, Text, TextField, Timeline, useToast, type HeaderStat } from '../kit';
import { EntityPicker, TagChips, TagEditor } from '../components/fields';
import { useLive, useOS } from '../hooks';
import { persistAttachment } from '../lib/files';

type Panel = null | 'menu' | 'status' | 'remind' | 'attach' | 'link' | 'tags' | 'cover' | 'meter';

/**
 * Universal record page: tinted header with key stats, fields, module
 * sections, tags, relations, reminders, attachments, notes and the full
 * timeline. Modules add sections via manifest.detailSections.
 */
export function EntityDetailScreen({ id }: { id: string }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const entity = useLive((o) => o.entities.get(id), [id]);
  const tags = useLive((o) => o.tags.forEntity(id), [id]);
  const cover = useLive((o) => o.attachments.cover(id), [id]);
  const [panel, setPanel] = useState<Panel>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/browse'));
  if (!entity) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg.ground, paddingTop: insets.top + 48 }}>
        <EmptyState icon="trash" line="This record no longer exists. It may have been deleted." action="Go back" onAction={back} />
      </View>
    );
  }
  const def = os.registry.type(entity.type);
  const tint = tintForModule(def.module);
  const statusDef = def.statuses?.find((s) => s.value === entity.status);
  const sections = os.registry.detailSections.filter((s) => s.entityType === '*' || s.entityType === entity.type);
  const close = () => setPanel(null);

  const remove = () => {
    os.entities.delete(entity.id);
    back();
    toast.show({ message: `${def.label} deleted`, icon: 'trash', undo: () => os.entities.restore(entity.id) });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        <RecordHeader
          tint={tint}
          icon={def.icon}
          cover={cover?.uri}
          onCoverPress={() => setPanel('cover')}
          title={entity.title}
          subtitle={[def.label, entity.subtitle].filter(Boolean).join(' · ')}
          status={def.statuses?.length ? { label: statusDef?.label ?? 'No status', onPress: () => setPanel('status') } : undefined}
          stats={headerStats(os, entity, def.fields)}
          onBack={back}
          actions={
            <>
              <IconButton icon="star" accessibilityLabel={entity.starred ? 'Unstar' : 'Star'} filled={entity.starred ? t.c.accent.mustard : 'overlay'} onPress={() => os.entities.update(entity.id, { starred: !entity.starred })} />
              <IconButton icon="edit" accessibilityLabel="Edit record" filled="overlay" onPress={() => router.push(`/entity/${entity.type}/${entity.id}/edit`)} />
              <IconButton icon="more" accessibilityLabel="More" filled="overlay" onPress={() => setPanel('menu')} />
            </>
          }
        />

        <View style={{ paddingHorizontal: t.layout.gutter, paddingTop: 20, gap: 20 }}>
          {entity.archived ? <Chip label="Archived" icon="archive" tone="muted" /> : null}

          <DetailsCard entity={entity} fields={def.fields} />
          {sections.map((s) => {
            const C = s.component;
            return (
              <View key={s.key}>
                <C entity={entity} ctx={os} />
              </View>
            );
          })}
          {tags.length ? (
            <Section title="Tags" action="Edit" onAction={() => setPanel('tags')}>
              <TagChips tags={tags.map((x) => x.name)} module={def.module} onPress={(name) => router.push(`/tag/${encodeURIComponent(name)}`)} />
            </Section>
          ) : null}
          <RelationsCard entity={entity} onLink={() => setPanel('link')} />
          <RemindersCard entity={entity} tint={tint} />
          <AttachmentsCard entity={entity} />
          <NotesCard entity={entity} />
          <TimelineCard entity={entity} tint={tint} />
          <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
            Created {os.format.dateTime(entity.createdAt)} · updated {os.format.dateTime(entity.updatedAt)}
          </Text>
        </View>
      </ScrollView>

      <ActionSheet
        visible={panel === 'menu'}
        onClose={close}
        title={entity.title}
        actions={[
          ...(def.meters?.length ? [{ label: `Log ${def.meters[0]!.label.toLowerCase()}`, icon: 'gauge' as const, onPress: () => setPanel('meter') }] : []),
          { label: 'Remind me', icon: 'bell', onPress: () => setPanel('remind') },
          { label: cover ? 'Change cover photo' : 'Add cover photo', icon: 'image', onPress: () => setPanel('cover') },
          { label: 'Attach a photo or file', icon: 'paperclip', onPress: () => setPanel('attach') },
          { label: 'Link to…', icon: 'link', onPress: () => setPanel('link') },
          { label: tags.length ? 'Edit tags' : 'Add tags', icon: 'tag', onPress: () => setPanel('tags') },
          {
            label: 'Duplicate',
            icon: 'file',
            onPress: () => {
              const copy = os.entities.create({ type: entity.type, title: `${entity.title} (copy)`, data: entity.data, status: entity.status });
              router.push(`/entity/${copy.type}/${copy.id}`);
            },
          },
          { label: entity.archived ? 'Unarchive' : 'Archive', icon: 'archive', onPress: () => os.entities.update(entity.id, { archived: !entity.archived }) },
          { label: 'Delete', icon: 'trash', destructive: true, onPress: remove },
        ]}
      />
      {def.statuses?.length ? (
        <Sheet visible={panel === 'status'} onClose={close} title="Status">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {def.statuses.map((s) => (
              <FilterChip
                key={s.value}
                label={s.label}
                selected={s.value === entity.status}
                onPress={() => {
                  os.entities.setStatus(entity.id, s.value);
                  close();
                }}
              />
            ))}
          </View>
        </Sheet>
      ) : null}
      <Sheet visible={panel === 'tags'} onClose={close} title="Tags" footer={<Button title="Done" block onPress={close} />}>
        <TagEditor tags={tags.map((x) => x.name)} onChange={(names) => os.tags.set(entity.id, names)} />
      </Sheet>
      <ReminderSheet visible={panel === 'remind'} onClose={close} entity={entity} />
      {def.meters?.[0] ? <MeterSheet visible={panel === 'meter'} onClose={close} entity={entity} meter={def.meters[0]} /> : null}
      <AttachSheet visible={panel === 'attach'} onClose={close} entity={entity} />
      <CoverSheet visible={panel === 'cover'} onClose={close} entity={entity} hasCover={!!cover} />
      <LinkSheet visible={panel === 'link'} onClose={close} entity={entity} />
    </View>
  );
}

/** Display text for a field value, plus a target when it points at another record. */
function renderValue(os: LifeOSContext, entity: Entity, f: FieldDef, v: unknown): { text: string; target?: Entity } {
  switch (f.type) {
    case 'currency':
      return { text: os.format.currency(Number(v), (entity.data.currency as string) || undefined) };
    case 'number':
      // Years read as 2022, not 2,022.
      return { text: /year/i.test(f.key) ? String(v) : os.format.number(Number(v), 2) };
    case 'boolean':
      return { text: v ? 'Yes' : 'No' };
    case 'date':
      return { text: os.format.date(String(v)) };
    case 'datetime':
      return { text: os.format.dateTime(Number(v)) };
    case 'select':
      return { text: f.options?.find((x) => x.value === v)?.label ?? String(v) };
    case 'multiselect':
      return { text: (v as string[]).map((x) => f.options?.find((o) => o.value === x)?.label ?? x).join(', ') };
    case 'relation': {
      const refs = os.entities.getMany(Array.isArray(v) ? (v as string[]) : [String(v)]);
      return { text: refs.map((r) => r.title).join(', ') || '—', target: refs.length === 1 ? refs[0] : undefined };
    }
    case 'json':
      return { text: typeof v === 'string' ? v : JSON.stringify(v) };
    default:
      return { text: String(v) };
  }
}

const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

/** Up to three header stats: money first, then summary fields, then the record's date. */
function headerStats(os: LifeOSContext, entity: Entity, fields: FieldDef[]): HeaderStat[] {
  const picked = [...fields.filter((f) => f.type === 'currency'), ...fields.filter((f) => f.summary && f.type !== 'currency' && f.type !== 'longtext' && f.type !== 'relation')].filter((f) => hasValue(entity.data[f.key]));
  const stats = picked.slice(0, 3).map((f) => ({ label: f.label.toLowerCase(), value: renderValue(os, entity, f, entity.data[f.key]).text }));
  if (stats.length < 3 && entity.occurredAt) stats.push({ label: 'date', value: os.format.date(entity.occurredAt, 'medium') });
  return stats.filter((s) => s.value.length <= 16);
}

function DetailsCard({ entity, fields }: { entity: Entity; fields: FieldDef[] }) {
  const os = useOS();
  const router = useRouter();
  const custom = useLive((o) => o.customFields.forType(entity.type), [entity.type]);
  const all: FieldDef[] = [...fields, ...custom.map((c) => ({ key: `custom_${c.key}`, label: c.label, type: c.fieldType, options: c.options.options }))];
  const rows = all.filter((f) => hasValue(entity.data[f.key]));
  if (!rows.length) return null;
  return (
    <Section title="Details">
      <Card>
        {rows.map((f, i) => {
          const r = renderValue(os, entity, f, entity.data[f.key]);
          return <DetailRow key={f.key} label={f.label} value={r.text} stacked={f.type === 'longtext' ? true : undefined} divider={i < rows.length - 1} onPress={r.target ? () => router.push(`/entity/${r.target!.type}/${r.target!.id}`) : undefined} />;
        })}
      </Card>
    </Section>
  );
}

function RelationsCard({ entity, onLink }: { entity: Entity; onLink: () => void }) {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const rels = useLive((o) => o.relations.forEntity(entity.id), [entity.id]);
  if (!rels.length) return null;
  const def = os.registry.type(entity.type);
  const kindLabel = (k: string) => def.relations?.find((r) => r.kind === k)?.label ?? k.charAt(0).toUpperCase() + k.slice(1);
  return (
    <Section title="Related" action="Link" onAction={onLink}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {rels.map((r) => {
          const d = os.registry.entityTypes.get(r.other.type);
          const kind = r.relation.kind;
          return (
            <Chip
              key={r.relation.id}
              label={kind === 'related' ? r.other.title : `${r.other.title} · ${kindLabel(kind).toLowerCase()}`}
              icon={d?.icon}
              onPress={() => router.push(`/entity/${r.other.type}/${r.other.id}`)}
              onLongPress={() => {
                os.relations.unlink(entity.id, r.other.id, kind);
                toast.show({ message: `Unlinked ${r.other.title}`, icon: 'link', undo: () => void os.relations.link(entity.id, r.other.id, kind) });
              }}
            />
          );
        })}
      </View>
    </Section>
  );
}

function LinkSheet({ visible, onClose, entity }: { visible: boolean; onClose: () => void; entity: Entity }) {
  const os = useOS();
  const toast = useToast();
  const [kind, setKind] = useState('related');
  const [picking, setPicking] = useState(false);
  const def = os.registry.type(entity.type);
  const kinds = [...new Set(['related', ...(def.relations?.map((r) => r.kind) ?? [])])];
  const kindLabel = (k: string) => def.relations?.find((r) => r.kind === k)?.label ?? k.charAt(0).toUpperCase() + k.slice(1);
  return (
    <>
      <Sheet visible={visible && !picking} onClose={onClose} title="Link to…" footer={<Button title="Choose record" icon="search" block onPress={() => setPicking(true)} />}>
        <Field label="Link as">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {kinds.map((k) => (
              <FilterChip key={k} label={kindLabel(k)} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
        </Field>
        <TextField label="Or a custom kind" value={kinds.includes(kind) ? '' : kind} onChange={(v) => setKind(v || 'related')} placeholder="e.g. vendor, gift for" />
      </Sheet>
      <EntityPicker
        visible={visible && picking}
        onClose={() => setPicking(false)}
        types={[]}
        exclude={[entity.id]}
        onSelect={(otherId) => {
          os.relations.link(entity.id, otherId, kind || 'related');
          setPicking(false);
          onClose();
          toast.show({ message: `Linked as ${kindLabel(kind).toLowerCase()}`, icon: 'link', undo: () => os.relations.unlink(entity.id, otherId, kind || 'related') });
        }}
      />
    </>
  );
}

function RemindersCard({ entity, tint }: { entity: Entity; tint: TintKey }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const active = useLive((o) => o.reminders.forEntity(entity.id), [entity.id]).filter((r) => !r.doneAt);
  if (!active.length) return null;
  return (
    <Section title="Reminders">
      <RowList>
      {active.map((r) => {
        const at = r.snoozedUntil ?? r.nextAt ?? r.dueAt;
        return (
          <RowItem
            key={r.id}
            icon="bell"
            tint={tint}
            title={r.title}
            subtitle={`${os.format.dateTime(at)} · ${describeRRule(r.rrule)}`}
            meta={at < Date.now() ? 'overdue' : undefined}
            metaTone="alert"
            iconTone={at < Date.now() ? 'alert' : 'accent'}
            onDone={() => {
              os.reminders.complete(r.id);
              toast.show({ message: r.rrule ? 'Done · rolled to the next one' : 'Reminder done', icon: 'check' });
            }}
            doneLabel={at < Date.now() ? 'Done' : undefined}
            onLongPress={() => os.reminders.remove(r.id)}
          />
        );
      })}
      </RowList>
    </Section>
  );
}

const REPEATS: Array<[string | null, string]> = [
  [null, 'Once'],
  ['FREQ=DAILY;INTERVAL=1', 'Daily'],
  ['FREQ=WEEKLY;INTERVAL=1', 'Weekly'],
  ['FREQ=MONTHLY;INTERVAL=1', 'Monthly'],
  ['FREQ=YEARLY;INTERVAL=1', 'Yearly'],
];

/** Log a meter reading (odometer); cycles on the record recompute from it. */
function MeterSheet({ visible, onClose, entity, meter }: { visible: boolean; onClose: () => void; entity: Entity; meter: { meter: string; label: string; unit: string } }) {
  const os = useOS();
  const toast = useToast();
  const latest = useLive((o) => o.cycles.latestMeter(entity.id, meter.meter), [entity.id, meter.meter]);
  const [value, setValue] = useState<number | undefined>(undefined);
  const save = () => {
    const id = os.cycles.logMeter(entity.id, value!, { meter: meter.meter, unit: meter.unit, label: meter.label });
    onClose();
    setValue(undefined);
    toast.show({ message: `${meter.label} ${value!.toLocaleString('en-IN')} ${meter.unit}`, icon: 'gauge', undo: () => os.cycles.removeReading(id) });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={`Log ${meter.label.toLowerCase()}`} footer={<Button title="Save reading" icon="check" block disabled={value == null || value < 0} onPress={save} />}>
      <NumberField label={meter.label} value={value} onChange={setValue} unit={meter.unit} hint={latest != null ? `Last reading ${latest.toLocaleString('en-IN')} ${meter.unit}` : undefined} autoFocus />
    </Sheet>
  );
}

function ReminderSheet({ visible, onClose, entity }: { visible: boolean; onClose: () => void; entity: Entity }) {
  const os = useOS();
  const toast = useToast();
  const [title, setTitle] = useState(`Follow up: ${entity.title}`);
  const [due, setDue] = useState<number | undefined>(() => Date.now() + 86400000);
  const [rrule, setRrule] = useState<string | null>(null);
  const save = () => {
    const r = os.reminders.create({ entityId: entity.id, title, dueAt: due!, rrule });
    onClose();
    toast.show({ message: `Reminder set for ${os.format.dateTime(due!)}`, icon: 'bell', undo: () => os.reminders.remove(r.id) });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Remind me" footer={<Button title="Save reminder" block disabled={!title || !due} onPress={save} />}>
      <TextField label="What" value={title} onChange={setTitle} />
      <DateField label="When" withTime value={due} onChange={(v) => setDue(typeof v === 'number' ? v : v ? new Date(v).getTime() : undefined)} />
      <Field label="Repeat">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {REPEATS.map(([v, l]) => (
            <FilterChip key={l} label={l} selected={rrule === v} onPress={() => setRrule(v)} />
          ))}
        </View>
      </Field>
    </Sheet>
  );
}

function AttachmentsCard({ entity }: { entity: Entity }) {
  const os = useOS();
  const t = useTheme();
  const items = useLive((o) => o.attachments.forEntity(entity.id), [entity.id]);
  const shown = items.filter((a) => a.kind !== 'cover');
  if (!shown.length) return null;
  const images = shown.filter((a) => a.kind === 'image' || a.kind === 'receipt' || a.mime?.startsWith('image/'));
  const files = shown.filter((a) => !images.includes(a));
  return (
    <Section title="Attachments" meta={String(shown.length)}>
      {images.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -t.layout.gutter }} contentContainerStyle={{ paddingHorizontal: t.layout.gutter, gap: 8 }}>
          {images.map((a) => (
            <Pressable key={a.id} accessibilityRole="imagebutton" accessibilityLabel={a.name} onLongPress={() => os.attachments.remove(a.id)} onPress={() => Linking.openURL(a.uri).catch(() => {})}>
              <Image source={{ uri: a.uri }} style={{ width: 104, height: 104, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile }} contentFit="cover" />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <RowList>
        {files.map((a) => (
          <RowItem key={a.id} icon="file" tint="documents" title={a.name} subtitle={[a.mime, a.size ? `${Math.round(a.size / 1024)} KB` : null].filter(Boolean).join(' · ')} onPress={() => Linking.openURL(a.uri).catch(() => {})} onLongPress={() => os.attachments.remove(a.id)} />
        ))}
      </RowList>
    </Section>
  );
}

function AttachSheet({ visible, onClose, entity }: { visible: boolean; onClose: () => void; entity: Entity }) {
  const os = useOS();
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
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title="Attach"
      actions={[
        { label: 'Take photo', icon: 'camera', onPress: () => void pickImage(true) },
        { label: 'Choose photo', icon: 'image', onPress: () => void pickImage(false) },
        { label: 'Choose file', icon: 'file', onPress: () => void pickDoc() },
      ]}
    />
  );
}

/** Cover photo (Stitch photo header): take, choose, or remove with Undo. Cropped to the header's 16:10. */
function CoverSheet({ visible, onClose, entity, hasCover }: { visible: boolean; onClose: () => void; entity: Entity; hasCover: boolean }) {
  const os = useOS();
  const toast = useToast();
  const pick = async (camera: boolean) => {
    const opts: ImagePicker.ImagePickerOptions = { quality: 0.8, mediaTypes: ['images'], allowsEditing: true, aspect: [16, 10] };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const name = a.fileName ?? `cover-${Date.now()}.jpg`;
    const uri = await persistAttachment(a.uri, name);
    os.attachments.setCover({ entityId: entity.id, name, mime: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? null, uri });
  };
  const remove = () => {
    const c = os.attachments.cover(entity.id);
    if (!c) return;
    os.attachments.remove(c.id);
    toast.show({ message: 'Cover photo removed', icon: 'trash', undo: () => void os.attachments.setCover({ entityId: c.entityId, name: c.name, mime: c.mime, size: c.size, uri: c.uri }) });
  };
  return (
    <ActionSheet
      visible={visible}
      onClose={onClose}
      title="Cover photo"
      actions={[
        { label: 'Take photo', icon: 'camera', onPress: () => void pick(true) },
        { label: 'Choose photo', icon: 'image', onPress: () => void pick(false) },
        ...(hasCover ? [{ label: 'Remove cover photo', icon: 'trash' as const, destructive: true, onPress: remove }] : []),
      ]}
    />
  );
}

function NotesCard({ entity }: { entity: Entity }) {
  const os = useOS();
  const t = useTheme();
  const comments = useLive((o) => o.comments.forEntity(entity.id), [entity.id]);
  const [text, setText] = useState('');
  const send = () => {
    if (!text.trim()) return;
    os.comments.add(entity.id, text.trim());
    setText('');
  };
  return (
    <Card icon="book" tint="memory" title="Notes" meta={comments.length ? `${comments.length}` : undefined}>
      <View style={{ gap: 12 }}>
        {comments.map((c) => (
          <Pressable key={c.id} accessibilityHint="Long-press to delete" onLongPress={() => os.comments.remove(c.id)} style={{ gap: 2 }}>
            <Text variant="body" selectable style={{ lineHeight: 21 }}>
              {c.body}
            </Text>
            <Text variant="caption" color="tertiary">
              {c.author === 'user' ? 'You' : c.author === 'assistant' ? 'Agent' : 'Automation'} · {os.format.dateTime(c.createdAt)}
            </Text>
          </Pressable>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <TextField value={text} onChange={setText} placeholder="Add a note…" multiline compact />
          </View>
          <IconButton icon="arrow-up" accessibilityLabel="Add note" filled={text.trim() ? t.c.accent.mustard : true} color={text.trim() ? t.c.accent.mustardInk : t.c.fg.tertiary} disabled={!text.trim()} onPress={send} size={44} style={{ marginBottom: 4 }} />
        </View>
      </View>
    </Card>
  );
}

function TimelineCard({ entity, tint }: { entity: Entity; tint: TintKey }) {
  const os = useOS();
  const t = useTheme();
  const events = useLive((o) => o.entities.timeline.forEntity(entity.id, 60), [entity.id]);
  const [all, setAll] = useState(false);
  if (!events.length) return null;
  const shown = all ? events : events.slice(0, 6);
  const dot = (actor: string) => (actor === 'assistant' ? t.tints.memory.ink : actor === 'automation' ? t.tints.tasks.ink : t.tints[tint].ink);
  return (
    <Section title="Recent" meta="timeline" action={events.length > 6 ? (all ? 'Less' : `All ${events.length}`) : undefined} onAction={() => setAll((a) => !a)}>
      <Card>
        <Timeline
          entries={shown.map((e) => ({
            id: e.id,
            title: e.title,
            body: [os.format.dateTime(e.occurredAt), e.body].filter(Boolean).join(' · '),
            meta: e.actor === 'assistant' ? 'agent' : e.actor === 'automation' ? 'automation' : undefined,
            value: typeof (e.meta as { cost?: number })?.cost === 'number' ? os.format.currency((e.meta as { cost: number }).cost) : undefined,
            color: dot(e.actor),
          }))}
        />
      </Card>
    </Section>
  );
}
