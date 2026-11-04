import React, { useState } from 'react';
import { format } from 'date-fns';
import { Platform, Pressable, ScrollView, TextInput, View, type TextStyle } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DAY, dateField } from '@core/cycles/schedule';
import type { Field } from '@core/domain/types';
import type { RecordFormProps } from '@core/registry/types';
import { EntityPicker, FieldInput } from '@ui/components/fields';
import { useLive, useOS } from '@ui/hooks';
import { Icon, IconButton, Sheet, Text, TextField } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks, fontForWeight, monoFonts } from '@ui/theme/tokens';
import { documentType, KIND_OPTIONS, type DocumentData } from '@modules/documents';
import { AddPill, Caps, ChoicePill, Disc, kindColor, longDay, NoteCard } from './parts';

/**
 * The Document form (NR-Documents-Form), for New and Edit: title, the kinds as
 * pills, reference number, issuer, the two dates with when Renew comes to
 * Upkeep, the links, notes. One made by hand is filed from the start.
 */

const LABEL: TextStyle = { fontSize: 13, lineHeight: 17, fontWeight: '600', paddingHorizontal: 4 };
const INPUT: TextStyle = { fontSize: 16, lineHeight: 21, fontFamily: fontForWeight(500) };
const LINK_FIELDS = documentType.fields.filter((f) => f.type === 'link');
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

function Label({ children }: { children: string }) {
  return <Text color="secondary" style={LABEL}>{children}</Text>;
}

function Input({ label, value, onChange, mono, autoFocus, multiline }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; autoFocus?: boolean; multiline?: boolean }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', minHeight: multiline ? 112 : 56, paddingHorizontal: 18, paddingVertical: multiline ? 16 : 0, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: focused ? 1.5 : 1, borderColor: focused ? t.c.fg.primary : t.c.line }}>
        <TextInput
          accessibilityLabel={label}
          value={value}
          onChangeText={onChange}
          autoFocus={autoFocus}
          multiline={multiline}
          autoCapitalize={mono ? 'characters' : 'sentences'}
          autoCorrect={!mono}
          placeholderTextColor={t.c.fg.tertiary}
          selectionColor={t.c.accent.mustard}
          cursorColor={t.c.accent.mustard}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[INPUT, mono ? { fontFamily: monoFonts[500], letterSpacing: 0.5 } : null, multiline ? { lineHeight: 23, textAlignVertical: 'top' } : { paddingVertical: 14 }, { flex: 1, minWidth: 0, color: t.c.fg.primary }]}
        />
      </View>
    </View>
  );
}

/** A date in half the width: the calendar, "22 Aug 2017", and a way to clear it. */
function DateBox({ label, value, onChange }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const date = value ? new Date(`${value}T12:00:00`) : null;
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
      <Label>{label}</Label>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? longDay(value) : 'not set'}`} onPress={() => setOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 14, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line }}>
        <Icon name="calendar" size={16} color={t.c.fg.secondary} />
        <Text numberOfLines={1} color={value ? 'primary' : 'tertiary'} style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{value ? longDay(value) : 'Not set'}</Text>
        {value ? <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={12} onPress={() => onChange(undefined)}><Icon name="x" size={14} color={t.c.fg.secondary} /></Pressable> : null}
      </Pressable>
      {open && Platform.OS === 'web' ? (
        <Sheet visible onClose={() => setOpen(false)} title={label}>
          <TextField value={value ?? ''} placeholder="YYYY-MM-DD" onChange={(s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? onChange(s) : undefined)} />
        </Sheet>
      ) : open ? (
        <DateTimePicker
          value={date ?? new Date()}
          mode="date"
          themeVariant={t.dark ? 'dark' : 'light'}
          accentColor={t.c.accent.mustard}
          onChange={(ev, d) => {
            setOpen(false);
            if (ev.type === 'set' && d) onChange(format(d, 'yyyy-MM-dd'));
          }}
        />
      ) : null}
    </View>
  );
}

/** A link Field: the record as a chip with a remove button, or a dashed "Link a trip". */
function LinkRow({ field, value, onChange }: { field: Field; value: string | undefined; onChange: (v: string | undefined) => void }) {
  const t = useTheme();
  const [picking, setPicking] = useState(false);
  const rec = useLive((o) => (value ? o.records.get(value) : null), [value]);
  const word = field.linkWord ?? field.key;
  return (
    <View style={{ gap: 8 }}>
      <Label>{field.label}</Label>
      {rec ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 40, paddingHorizontal: 4, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, alignSelf: 'flex-start', maxWidth: '100%' }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: blocks.pink, alignItems: 'center', justifyContent: 'center' }}>
            <Text color="#0B0B0D" style={{ fontSize: 12, lineHeight: 16, fontWeight: '700' }}>{rec.title.charAt(0).toUpperCase()}</Text>
          </View>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>{rec.title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${rec.title}`} hitSlop={6} onPress={() => onChange(undefined)} style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={14} color={t.c.fg.secondary} />
          </Pressable>
        </View>
      ) : (
        <AddPill label={`Link ${article(word)} ${word}`} onPress={() => setPicking(true)} />
      )}
      {picking ? (
        <EntityPicker
          visible
          onClose={() => setPicking(false)}
          types={[field.linkTo as string]}
          title={field.label}
          onSelect={(id) => {
            onChange(id);
            setPicking(false);
          }}
        />
      ) : null}
    </View>
  );
}

export function DocumentForm({ id, initial, onSaved, linkTo }: RecordFormProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const existing = useLive((o) => (id ? o.records.get<DocumentData>(id) : null), [id]);
  const custom = useLive((o) => o.customFields.forType('document'), []);
  const [title, setTitle] = useState(existing?.title ?? (initial?.title as string) ?? '');
  const [data, setData] = useState<Record<string, unknown>>(() => ({ kind: 'other', ...(existing?.data ?? {}), ...(initial ?? {}) }));
  const [error, setError] = useState<string | null>(null);
  const set = (key: string) => (v: unknown) => setData((d) => ({ ...d, [key]: v }));
  const text = (key: string) => (data[key] as string | undefined) ?? '';
  const name = title.trim();
  const close = () => (router.canGoBack() ? router.back() : router.replace('/module/documents' as never));

  // What the Object's own Cycle will say: the notice, and the day it comes to Upkeep.
  const expires = data.expiresOn as string | undefined;
  const cycle = expires ? documentType.cycleTemplates?.(data as unknown as DocumentData)?.[0] : undefined;
  const lead = cycle?.leadDays ?? 30;
  const due = expires ? dateField(expires) : null;
  const comes = due != null ? due - lead * DAY : null;

  const save = () => {
    if (!name) return setError('Give it a title.');
    setError(null);
    try {
      const clean = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v === '' ? undefined : v]));
      const saved = id ? os.records.update(id, { title: name, data: clean }) : os.records.create({ object: 'document', title: name, status: 'filed', data: clean });
      if (linkTo && !id) os.links.link(saved.id, linkTo.id, linkTo.kind);
      if (onSaved) onSaved(saved);
      else if (id) close();
      else router.replace(`/entity/document/${saved.id}` as never);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top, paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 32, gap: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
          <IconButton icon="x" filled accessibilityLabel="Close" onPress={close} />
          <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>{id ? 'Edit document' : 'New document'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Save" onPress={save} hitSlop={2} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Text color={t.c.accent.mustardInk} style={{ fontSize: 13, lineHeight: 17, fontWeight: '700' }}>Save</Text>
          </Pressable>
        </View>

        <Input label="Title" value={title} onChange={setTitle} autoFocus={!id && !title} />

        <View style={{ gap: 8 }}>
          <Label>Type</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {KIND_OPTIONS.map((o) => <ChoicePill key={o.value} label={o.label} dot={kindColor(o.value, t)} selected={data.kind === o.value} onPress={() => set('kind')(o.value)} />)}
          </View>
        </View>

        <Input label="Reference number" value={text('number')} onChange={set('number')} mono />
        <Input label="Issuer" value={text('issuer')} onChange={set('issuer')} />

        <View style={{ gap: 12 }}>
          <View style={{ paddingTop: 6 }}><Caps>Validity</Caps></View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <DateBox label="Issued" value={data.issuedOn as string | undefined} onChange={set('issuedOn')} />
            <DateBox label="Expires" value={expires} onChange={set('expiresOn')} />
          </View>
          {comes != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, backgroundColor: t.c.bg.tile }}>
              <Disc icon="refresh" color={t.c.accent.gold} size={36} />
              <Text color="secondary" style={{ flex: 1, fontSize: 13, lineHeight: 18 }}>
                <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '600' }}>Renew</Text>
                {`${comes > Date.now() ? ` comes to Upkeep on ${format(comes, 'd MMM yyyy')}` : ' goes on Upkeep once saved'}, ${lead} days before. An ID gets 180 days’ notice; the rest 30.`}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={{ gap: 12 }}>
          <View style={{ paddingTop: 6 }}><Caps>Links</Caps></View>
          {LINK_FIELDS.map((f) => <LinkRow key={f.key} field={f} value={data[f.key] as string | undefined} onChange={set(f.key)} />)}
        </View>

        <View style={{ gap: 12 }}>
          <View style={{ paddingTop: 6 }}><Caps>Details</Caps></View>
          <Input label="Notes" value={text('notes')} onChange={set('notes')} multiline />
          {custom.map((c) => {
            const key = `custom_${c.key}`;
            return <FieldInput key={key} field={{ key, label: c.label, type: c.fieldType, options: c.options.options }} value={data[key]} onChange={set(key)} />;
          })}
        </View>

        {existing?.data.file ? null : <NoteCard icon="folder">Made by hand, so it is filed. Its scan lives in your folders: save the file there and it shows up as its own Document.</NoteCard>}

        {error ? <Text color={t.c.alert.coralText} variant="caption" accessibilityLiveRegion="polite">{error}</Text> : null}

        <Pressable accessibilityRole="button" onPress={save} style={({ pressed }) => ({ height: 52, borderRadius: 999, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, opacity: pressed ? 0.85 : 1 })}>
          <Text numberOfLines={1} color={t.c.accent.mustardInk} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700' }}>{name ? `Save ${name}` : 'Save document'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
