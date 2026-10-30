import React, { useState } from 'react';
import { format } from 'date-fns';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import type { ObjectRecord, Field } from '@core/domain/types';
import { fieldType } from '@core/domain/fields';
import { describeRRule } from '@core/automation/recurrence';
import type { LifeOSContext } from '@core/registry/context';
import { useTheme } from '../theme/ThemeProvider';
import { tintForModule } from '../theme/moduleTint';
import type { TintKey } from '../theme/tokens';
import { ActionSheet, Button, Card, Chip, DateField, DetailRow, EmptyState, FormField, FilterChip, IconButton, RecordHeader, RowItem, RowList, Section, Sheet, Text, TextField, Timeline, useToast, type HeaderStat } from '../kit';
import { EntityPicker, TagChips, TagEditor } from '../components/fields';
import { useLive, useOS } from '../hooks';
import { persistAttachment } from '../lib/files';
import { CyclesSection, MeterSheet } from '../components/cycles';
import { backlinks } from '@core/links';
import { egoGraph, neighbours } from '@core/graph/read';
import { LinksView } from '../components/LinksView';

type Panel = null | 'menu' | 'status' | 'remind' | 'attach' | 'link' | 'tags' | 'cover' | 'meter';

/**
 * Universal record page: tinted header with key stats, fields, module
 * sections, tags, relations, reminders, attachments, notes and the full
 * timeline. Modules add sections via manifest.detailSections.
 */
/** `say` renders the "Tell me about …" bar (it lives in the app shell: voice + filing). */
export function RecordScreen({ id, say }: { id: string; say?: (entity: ObjectRecord) => React.ReactNode }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const entity = useLive((o) => o.records.get(id), [id]);
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
  const def = os.registry.object(entity.object);
  const tint = tintForModule(def.module);
  const statusDef = def.statuses?.find((s) => s.value === entity.status);
  const sections = os.registry.detailSections.filter((s) => s.entityType === '*' || s.entityType === entity.object);
  // A board may draw the whole header (Person · Profile); the first one wins.
  const hero = sections.find((s) => s.placement === 'hero');
  const page = sections.find((s) => s.placement === 'page');
  const controls = { back, edit: () => router.push(`/entity/${entity.object}/${entity.id}/edit`), more: () => setPanel('menu'), cover: () => setPanel('cover'), link: () => setPanel('link'), tags: () => setPanel('tags'), attach: () => setPanel('attach') };
  const close = () => setPanel(null);

  const remove = () => {
    os.records.delete(entity.id);
    back();
    toast.show({ message: `${def.label} deleted`, icon: 'trash', undo: () => os.records.restore(entity.id) });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} keyboardShouldPersistTaps="handled">
        {page ? (
          <page.component entity={entity} ctx={os} controls={controls} say={say ? say(entity) : null} />
        ) : null}
        {page ? null : hero ? (
          <hero.component entity={entity} ctx={os} controls={controls} />
        ) : (
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
                <IconButton icon="star" accessibilityLabel={entity.starred ? 'Unstar' : 'Star'} filled={entity.starred ? t.c.accent.mustard : 'overlay'} onPress={() => os.records.update(entity.id, { starred: !entity.starred })} />
                <IconButton icon="edit" accessibilityLabel="Edit record" filled="overlay" onPress={() => router.push(`/entity/${entity.object}/${entity.id}/edit`)} />
                <IconButton icon="more" accessibilityLabel="More" filled="overlay" onPress={() => setPanel('menu')} />
              </>
            }
          />
        )}

        {page ? null : <View style={{ paddingHorizontal: t.layout.gutter, paddingTop: 20, gap: 20 }}>
          {entity.archived ? <Chip label="Archived" icon="archive" tone="muted" /> : null}
          {say ? say(entity) : null}

          {sections.filter((s) => s.placement === 'top').map((s) => {
            const C = s.component;
            return (
              <View key={s.key}>
                <C entity={entity} ctx={os} />
              </View>
            );
          })}

          <DetailsCard entity={entity} fields={def.fields} />
          {sections.filter((s) => s.placement !== 'top' && s.placement !== 'hero').map((s) => {
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
          <CyclesSection entity={entity} />
          <RelationsCard entity={entity} onLink={() => setPanel('link')} />
          <GraphCard entity={entity} />
          <BacklinksCard entity={entity} />
          <DumpsCard entity={entity} />
          <RemindersCard entity={entity} tint={tint} />
          <AttachmentsCard entity={entity} />
          <FactsCard entity={entity} />
          <TimelineCard entity={entity} tint={tint} />
          <Text variant="caption" color="tertiary" style={{ textAlign: 'center' }}>
            Created {os.format.dateTime(entity.createdAt)} · updated {os.format.dateTime(entity.updatedAt)}
          </Text>
        </View>}
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
              const copy = os.records.create({ object: entity.object, title: `${entity.title} (copy)`, data: entity.data, status: entity.status });
              router.push(`/entity/${copy.object}/${copy.id}`);
            },
          },
          { label: entity.archived ? 'Unarchive' : 'Archive', icon: 'archive', onPress: () => os.records.update(entity.id, { archived: !entity.archived }) },
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
                  os.records.setStatus(entity.id, s.value);
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
function renderValue(os: LifeOSContext, entity: ObjectRecord, f: Field, v: unknown): { text: string; target?: ObjectRecord } {
  switch (f.type) {
    case 'money':
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
    case 'link': {
      const refs = os.records.getMany(Array.isArray(v) ? (v as string[]) : [String(v)]);
      return { text: refs.map((r) => r.title).join(', ') || '—', target: refs.length === 1 ? refs[0] : undefined };
    }
    default:
      // duration, contact, file, location, meter, text: the Field type registry formats it.
      return { text: fieldType(f.type).format(v, f, os.format) };
  }
}

const hasValue = (v: unknown) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);

/** Up to three header stats: money first, then summary fields, then the record's date. */
function headerStats(os: LifeOSContext, entity: ObjectRecord, fields: Field[]): HeaderStat[] {
  const picked = [...fields.filter((f) => f.type === 'money'), ...fields.filter((f) => f.summary && f.type !== 'money' && f.type !== 'longtext' && f.type !== 'link')].filter((f) => hasValue(entity.data[f.key]));
  const stats = picked.slice(0, 3).map((f) => ({ label: f.label.toLowerCase(), value: renderValue(os, entity, f, entity.data[f.key]).text }));
  if (stats.length < 3 && entity.occurredAt) stats.push({ label: 'date', value: os.format.date(entity.occurredAt, 'medium') });
  return stats.filter((s) => s.value.length <= 16);
}

function DetailsCard({ entity, fields }: { entity: ObjectRecord; fields: Field[] }) {
  const os = useOS();
  const router = useRouter();
  const custom = useLive((o) => o.customFields.forType(entity.object), [entity.object]);
  const all: Field[] = [...fields, ...custom.map((c) => ({ key: `custom_${c.key}`, label: c.label, type: c.fieldType, options: c.options.options }))];
  const rows = all.filter((f) => hasValue(entity.data[f.key]));
  if (!rows.length) return null;
  return (
    <Section title="Details">
      <Card>
        {rows.map((f, i) => {
          const r = renderValue(os, entity, f, entity.data[f.key]);
          return <DetailRow key={f.key} label={f.label} value={r.text} stacked={f.type === 'longtext' ? true : undefined} divider={i < rows.length - 1} onPress={r.target ? () => router.push(`/entity/${r.target!.object}/${r.target!.id}`) : undefined} />;
        })}
      </Card>
    </Section>
  );
}

/** Dumps that filed into this record, or that mention it by name (M4.4) — newest first, word for word. */
function DumpsCard({ entity }: { entity: ObjectRecord }) {
  const router = useRouter();
  const dumps = useLive(
    (o) => {
      const filed = o.dumps.forEntity(entity.id);
      const seen = new Set(filed.map((d) => d.id));
      const named =
        entity.title.trim().length >= 3
          ? o.records.search
              .search(`"${entity.title.replace(/"/g, '')}"`, { types: ['dump'], limit: 20 })
              .map((h) => o.dumps.get(h.id))
              .filter((d): d is NonNullable<typeof d> => !!d && !seen.has(d.id) && d.body.toLowerCase().includes(entity.title.toLowerCase()))
          : [];
      return [...filed, ...named].sort((a, b) => b.createdAt - a.createdAt);
    },
    [entity.id, entity.title],
  );
  if (!dumps.length) return null;
  return (
    <Section title="Dumps" meta={String(dumps.length)}>
      <RowList>
        {dumps.slice(0, 8).map((d) => (
          <RowItem key={d.id} icon="brain" tint="memory" title={d.body.trim().split('\n')[0]!} subtitle={format(new Date(d.createdAt), 'd MMM yyyy')} chevron onPress={() => router.push(`/dump/${d.id}` as never)} />
        ))}
      </RowList>
    </Section>
  );
}

/** Notes that [[link]] here and facts about this record (M3 second brain). */
function BacklinksCard({ entity }: { entity: ObjectRecord }) {
  const os = useOS();
  const router = useRouter();
  const notes = useLive((o) => backlinks(o, entity.id), [entity.id]);
  if (!notes.length) return null;
  return (
    <Section title="Mentioned in" meta={String(notes.length)}>
      <RowList>
        {notes.map((n) => {
          const d = os.registry.objects.get(n.object);
          const body = String((n.data as Record<string, unknown>).body ?? n.subtitle ?? '').replace(/\[\[|\]\]/g, '');
          return <RowItem key={n.id} icon={d?.icon ?? 'file'} tint={tintForModule(d?.module)} title={n.title} subtitle={body.slice(0, 90) || d?.label} onPress={() => router.push(`/entity/${n.object}/${n.id}`)} />;
        })}
      </RowList>
    </Section>
  );
}

/** Links card (docs/MODEL.md §5): everything linked, grouped by link word; events dated, with who/where. */
function RelationsCard({ entity, onLink }: { entity: ObjectRecord; onLink: () => void }) {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  // Incoming [[mentions]] have their own section (Mentioned in).
  const items = useLive((o) => neighbours(o, entity.id, { limit: 60 }).filter((n) => n.kind !== 'mention'), [entity.id]);
  if (!items.length) return null;
  const def = os.registry.object(entity.object);
  const groups: Array<{ label: string; items: typeof items }> = [];
  for (const n of items) {
    const label = def.links?.find((r) => r.kind === n.kind)?.label ?? n.label;
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(n);
    else groups.push({ label, items: [n] });
  }
  const unlink = (n: (typeof items)[number]) => {
    os.links.unlink(entity.id, n.id, n.kind);
    toast.show({ message: `Unlinked ${n.title}`, icon: 'link', undo: () => void os.links.link(entity.id, n.id, n.kind) });
  };
  return (
    <Section title="Links" meta={String(items.length)} action="Link" onAction={onLink}>
      <View style={{ gap: 12 }}>
        {groups.map((g) => (
          <View key={g.label} style={{ gap: 6 }}>
            <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>
              {g.label}
              {g.items.every((n) => n.type === 'transaction') && g.items.length > 1 ? ` · ${g.items.length} · ${os.format.currency(g.items.reduce((sum, n) => sum + ((os.records.get(n.id)?.data as { amount?: number })?.amount ?? 0), 0))}` : ''}
            </Text>
            {g.items.some((n) => n.at) ? (
              <RowList>
                {g.items.map((n) => (
                  <RowItem
                    key={`${n.kind}${n.id}`}
                    icon={os.registry.objects.get(n.type)?.icon}
                    tint={tintForModule(os.registry.objects.get(n.type)?.module)}
                    title={n.title}
                    subtitle={n.type === 'transaction' ? (n.at ? os.format.date(n.at) : null) : n.context}
                    meta={n.type === 'transaction' ? undefined : n.at ? os.format.date(n.at) : undefined}
                    value={n.type === 'transaction' ? txAmount(os, n.id) : undefined}
                    onPress={() => router.push(`/entity/${n.type}/${n.id}`)}
                    onLongPress={() => unlink(n)}
                  />
                ))}
              </RowList>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {g.items.map((n) => (
                  <Chip key={`${n.kind}${n.id}`} label={n.title} icon={os.registry.objects.get(n.type)?.icon} onPress={() => router.push(`/entity/${n.type}/${n.id}`)} onLongPress={() => unlink(n)} />
                ))}
              </View>
            )}
          </View>
        ))}
      </View>
      <Text variant="caption" color="tertiary" style={{ marginTop: 8 }}>
        Long-press to unlink.
      </Text>
    </Section>
  );
}

function txAmount(os: LifeOSContext, id: string): string | undefined {
  const d = os.records.get(id)?.data as { amount?: number; kind?: string } | undefined;
  if (d?.amount == null) return undefined;
  return `${d.kind === 'income' ? '+' : d.kind === 'expense' ? '−' : ''}${os.format.currency(d.amount)}`;
}

/** A link the app guessed ("We think JOHN D is John Doe"): confirm it, or say it's someone else. */

/** A small graph of what's linked to this record; opens the full graph view. */
function GraphCard({ entity }: { entity: ObjectRecord }) {
  const router = useRouter();
  const g = useLive((o) => egoGraph(o, entity.id, { hops: 1, limit: 14 }), [entity.id]);
  if (g.nodes.length < 3) return null;
  const explore = () => router.push(`/links/${entity.id}` as never);
  return (
    <Section title="Around this record" meta={`${g.nodes.length - 1} linked`} action="Explore" onAction={explore}>
      <LinksView nodes={g.nodes} edges={g.edges} height={240} labels={false} onSelect={explore} onOpen={(n) => router.push(`/entity/${n.type}/${n.id}` as never)} />
    </Section>
  );
}

function LinkSheet({ visible, onClose, entity }: { visible: boolean; onClose: () => void; entity: ObjectRecord }) {
  const os = useOS();
  const toast = useToast();
  const [kind, setKind] = useState('related');
  const [picking, setPicking] = useState(false);
  const def = os.registry.object(entity.object);
  const kinds = [...new Set(['related', ...(def.links?.map((r) => r.kind) ?? [])])];
  const kindLabel = (k: string) => def.links?.find((r) => r.kind === k)?.label ?? k.charAt(0).toUpperCase() + k.slice(1);
  return (
    <>
      <Sheet visible={visible && !picking} onClose={onClose} title="Link to…" footer={<Button title="Choose record" icon="search" block onPress={() => setPicking(true)} />}>
        <FormField label="Link as">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {kinds.map((k) => (
              <FilterChip key={k} label={kindLabel(k)} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
        </FormField>
        <TextField label="Or a custom kind" value={kinds.includes(kind) ? '' : kind} onChange={(v) => setKind(v || 'related')} placeholder="e.g. vendor, gift for" />
      </Sheet>
      <EntityPicker
        visible={visible && picking}
        onClose={() => setPicking(false)}
        types={[]}
        exclude={[entity.id]}
        onSelect={(otherId) => {
          os.links.link(entity.id, otherId, kind || 'related');
          setPicking(false);
          onClose();
          toast.show({ message: `Linked as ${kindLabel(kind).toLowerCase()}`, icon: 'link', undo: () => os.links.unlink(entity.id, otherId, kind || 'related') });
        }}
      />
    </>
  );
}

function RemindersCard({ entity, tint }: { entity: ObjectRecord; tint: TintKey }) {
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

function ReminderSheet({ visible, onClose, entity }: { visible: boolean; onClose: () => void; entity: ObjectRecord }) {
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
      <FormField label="Repeat">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {REPEATS.map(([v, l]) => (
            <FilterChip key={l} label={l} selected={rrule === v} onPress={() => setRrule(v)} />
          ))}
        </View>
      </FormField>
    </Sheet>
  );
}

function AttachmentsCard({ entity }: { entity: ObjectRecord }) {
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

function AttachSheet({ visible, onClose, entity }: { visible: boolean; onClose: () => void; entity: ObjectRecord }) {
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
    os.attachments.add({ entityId: entity.id, name, mime: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? null, uri, kind: entity.object === 'transaction' ? 'receipt' : 'image' });
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
function CoverSheet({ visible, onClose, entity, hasCover }: { visible: boolean; onClose: () => void; entity: ObjectRecord; hasCover: boolean }) {
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

function FactsCard({ entity }: { entity: ObjectRecord }) {
  const os = useOS();
  const t = useTheme();
  const facts = useLive((o) => o.facts.list({ subjectId: entity.id, limit: 50 }), [entity.id]);
  const [text, setText] = useState('');
  const send = () => {
    if (!text.trim()) return;
    os.facts.add({ text: text.trim(), subjectId: entity.id, source: 'user' });
    setText('');
  };
  const who = (s: string) => (s === 'user' ? 'You' : s === 'talk' || s === 'dump' ? 'Agent' : s === 'automation' ? 'Automation' : s === 'notification' ? 'A message' : s === 'correction' ? 'A correction' : s === 'notion' ? 'Notion' : 'A note');
  return (
    <Card icon="sparkle" tint="memory" title="Facts" meta={facts.length ? `${facts.length}` : undefined}>
      <View style={{ gap: 12 }}>
        {facts.map((f) => (
          <Pressable key={f.id} accessibilityHint="Long-press to forget" onLongPress={() => os.facts.forget(f.id)} style={{ gap: 2 }}>
            <Text variant="body" selectable style={{ lineHeight: 21 }}>
              {f.text.replace(/\[\[|\]\]/g, '')}
            </Text>
            <Text variant="caption" color="tertiary">
              {who(f.source)} · {os.format.dateTime(f.statedAt)}
            </Text>
          </Pressable>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <TextField value={text} onChange={setText} placeholder="Add a fact about this…" multiline compact />
          </View>
          <IconButton icon="arrow-up" accessibilityLabel="Add fact" filled={text.trim() ? t.c.accent.mustard : true} color={text.trim() ? t.c.accent.mustardInk : t.c.fg.tertiary} disabled={!text.trim()} onPress={send} />
        </View>
      </View>
    </Card>
  );
}

function TimelineCard({ entity, tint }: { entity: ObjectRecord; tint: TintKey }) {
  const os = useOS();
  const t = useTheme();
  const events = useLive((o) => o.records.timeline.forEntity(entity.id, 60), [entity.id]);
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
