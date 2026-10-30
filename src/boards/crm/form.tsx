import React, { useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, TextInput, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ObjectRecord } from '@core/domain/types';
import type { RecordFormProps } from '@core/registry/types';
import { addRelationship, BUILTIN_RELATIONSHIPS, birthdayIso, birthdayParts, customRelationships, nextBirthday, NO_YEAR, type PersonData } from '@modules/crm';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ChipsField, FilterChip, Icon, IconButton, OptionPills, Sheet, Text, Toggle, useToast } from '@ui/kit';
import { persistAttachment } from '@ui/lib/files';
import { fontForWeight } from '@ui/theme/tokens';
import { faceColor, initials } from './parts';

/**
 * The person form (NR-People-Form): photo, name, relationship (pills and
 * New…), phone, email, UPI IDs (chips), works at and lives in (your
 * Organisations and Places, or kept as typed), birthday (day and month; the
 * year only if you know it), likes, keep in touch and about. Save in the
 * header and at the bottom. The board's form override for Person, used by
 * New and Edit.
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** Keep in touch, as the form's pills say it; '' is off. */
const KEEP = [
  { value: '', label: 'Off' },
  { value: '7', label: 'Week' },
  { value: '14', label: '2 weeks' },
  { value: '30', label: 'Month' },
  { value: '91', label: '3 months' },
  { value: '182', label: '6 months' },
  { value: '365', label: 'Year' },
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UPI = /^[a-z0-9._-]{2,}@[a-z][a-z0-9]+$/i;
const LABEL: TextStyle = { fontSize: 13, lineHeight: 17, fontWeight: '600', paddingHorizontal: 4 };
/** 16/500 typed text (the face itself: Android ignores fontWeight on a custom family). */
const INPUT_TEXT: TextStyle = { fontSize: 16, lineHeight: 21, fontFamily: fontForWeight(500) };

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** A UPI ID needs a handle and a bank: “priya” → “needs an @ and a bank handle, like priya@okhdfc”. */
export function upiError(item: string): string | null {
  if (UPI.test(item)) return null;
  const local = (item.split('@')[0] || 'priya').replace(/\s+/g, '').toLowerCase();
  return `“${item}” needs an @ and a bank handle, like ${local}@okhdfc`;
}

/** An email that isn't one: “Missing “.com”?” when there's no dot after the @. */
export function emailError(v: string): string | null {
  const s = v.trim();
  if (!s || EMAIL.test(s)) return null;
  return s.includes('@') && !/@[^@]+\./.test(s) ? 'That doesn’t look like an email. Missing “.com”?' : 'That doesn’t look like an email.';
}

/** Label · control (13/600 secondary label above, 8 gap). */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8, minWidth: 0 }}>
      <Text color="secondary" style={LABEL}>
        {label}
      </Text>
      {children}
    </View>
  );
}

/** Noir input box: 56 high, radius 20, a hairline at rest, white on focus, coral on error. */
function Box({ focused, error, children, style }: { focused?: boolean; error?: boolean; children: React.ReactNode; style?: object }) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: error || focused ? 1.5 : 1, borderColor: error ? t.c.alert.coral : focused ? t.c.fg.primary : t.c.line }, style]}>
      {children}
    </View>
  );
}

function Input({ value, onChange, placeholder, leading, error, keyboardType, autoFocus, onFocus, onBlur, trailing, autoCapitalize, accessibilityLabel }: { value: string; onChange: (s: string) => void; placeholder?: string; leading?: string; error?: string | null; keyboardType?: 'default' | 'phone-pad' | 'email-address'; autoFocus?: boolean; onFocus?: () => void; onBlur?: () => void; trailing?: React.ReactNode; autoCapitalize?: 'none' | 'words' | 'sentences'; accessibilityLabel: string }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Box focused={focused} error={!!error}>
        {leading ? <Icon name={leading} size={18} color={t.c.fg.secondary} style={{ flexShrink: 0 }} /> : null}
        <TextInput
          accessibilityLabel={accessibilityLabel}
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={t.c.fg.tertiary}
          selectionColor={t.c.accent.mustard}
          cursorColor={t.c.accent.mustard}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? (keyboardType === 'email-address' ? 'none' : 'sentences')}
          autoCorrect={keyboardType === 'default' || !keyboardType}
          autoFocus={autoFocus}
          onFocus={() => (setFocused(true), onFocus?.())}
          onBlur={() => (setFocused(false), onBlur?.())}
          style={[t.type.body as TextStyle, INPUT_TEXT, { flex: 1, minWidth: 0, color: t.c.fg.primary, paddingVertical: 14 }]}
        />
        {trailing}
      </Box>
      {error ? (
        <Text variant="caption" color={t.c.alert.coral} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A 28-high lime chip ("in Places"). */
function InChip({ label }: { label: string }) {
  return (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(215,245,92,0.16)', justifyContent: 'center' }}>
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#D7F55C' }}>{label}</Text>
    </View>
  );
}

/** A choice row in the suggestions card: a 36 disc, 16/600 over 13/400. */
function ChoiceRow({ icon, title, line, onPress }: { icon: string; title: string; line: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color={t.c.fg.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="rowTitle" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" color="secondary" numberOfLines={1}>
          {line}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Works at / Lives in: the typed name, matched against your records of
 * `object`. Pick one, keep it as typed (text only), or make a new record of
 * `kind`. Linked shows the lime "in …" chip.
 */
function RecordText({ label, object, kind, icon, inLabel, collection, text, linkedId, onText, onLink, placeholder }: { label: string; object: string; kind: string; icon: string; inLabel: string; collection: string; text: string; linkedId: string | undefined; onText: (s: string) => void; onLink: (id: string | undefined, title?: string) => void; placeholder: string }) {
  const os = useOS();
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const has = os.registry.objects.has(object);
  const linked = useLive((o) => (linkedId ? o.records.get(linkedId) : null), [linkedId]);
  const matches = useLive(
    (o) => {
      if (!has || !open || !text.trim()) return [];
      const n = norm(text);
      return o.records
        .query(object, {}, { limit: 2000 })
        .map((r) => ({ r, s: norm(r.title) === n ? 3 : norm(r.title).startsWith(n) ? 2 : norm(r.title).includes(n) ? 1 : 0 }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.r.title.localeCompare(b.r.title))
        .slice(0, 4)
        .map((x) => x.r);
    },
    [open, text, object],
  );
  const name = text.trim();
  const isLinked = !!linked && norm(linked.title) === norm(name);
  const exact = matches.find((m) => norm(m.title) === norm(name));
  const choose = (id: string | undefined, title?: string) => {
    onLink(id, title);
    setOpen(false);
    Keyboard.dismiss();
  };
  return (
    <Row label={label}>
      <View style={{ gap: 10, minWidth: 0 }}>
        <Input
          accessibilityLabel={label}
          value={text}
          onChange={(s) => {
            onText(s);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          leading={icon}
          autoCapitalize="words"
          trailing={isLinked ? <InChip label={inLabel} /> : null}
        />
        {has && open && name && !isLinked ? (
          <View style={{ padding: 12, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 8 }}>
            {matches.map((m, i) => (
              <React.Fragment key={m.id}>
                {i ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}
                <ChoiceRow icon={icon} title={m.title} line={`In your ${collection}`} onPress={() => choose(m.id, m.title)} />
              </React.Fragment>
            ))}
            {!exact ? (
              <>
                {matches.length ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}
                <ChoiceRow icon="edit" title={`Keep “${name}” as typed`} line={`${name}, not in your ${collection} yet`} onPress={() => choose(undefined)} />
                <View style={{ height: 1, backgroundColor: t.c.line }} />
                <ChoiceRow
                  icon="plus"
                  title={`New ${object === 'org' ? 'organisation' : 'place'}…`}
                  line={`Make ${name} a record you can open`}
                  onPress={() => {
                    const e = os.records.create({ object, title: name, data: { kind } }, 'user');
                    choose(e.id, e.title);
                  }}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </View>
    </Row>
  );
}

/** Birthday: day and month (a sheet), "I know the year" reveals the year. Stored with birthdayIso; no year is NO_YEAR. */
function BirthdayInput({ value, onChange }: { value: string | undefined; onChange: (v: string | undefined) => void }) {
  const t = useTheme();
  const parts = birthdayParts(value);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(parts?.month ?? 1);
  const [knowYear, setKnowYear] = useState(!!parts?.year);
  const [yearText, setYearText] = useState(parts?.year ? String(parts.year) : '');
  const year = /^\d{4}$/.test(yearText) && Number(yearText) > NO_YEAR && Number(yearText) <= new Date().getFullYear() ? Number(yearText) : null;
  const set = (m: number, d: number, y: number | null) => onChange(birthdayIso(m, d, knowYear ? y : null));
  const age = value && knowYear && year ? nextBirthday(value)?.age : null;
  return (
    <Row label="Birthday">
      <View style={{ gap: 8, minWidth: 0 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={parts ? `Birthday: ${parts.day} ${MONTHS[parts.month - 1]}` : 'Add a birthday'} onPress={() => (setMonth(parts?.month ?? 1), setOpen(true))}>
          <Box>
            <Icon name="cake" size={18} color={t.c.fg.secondary} />
            <Text numberOfLines={1} style={[INPUT_TEXT, { flex: 1, color: parts ? t.c.fg.primary : t.c.fg.tertiary }]}>
              {parts ? `${parts.day} ${MONTHS[parts.month - 1]}${knowYear && year ? ` ${year}` : ''}` : 'Day and month'}
            </Text>
            {parts ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Clear birthday" hitSlop={10} onPress={() => onChange(undefined)}>
                <Icon name="x-circle" size={18} color={t.c.fg.tertiary} />
              </Pressable>
            ) : null}
          </Box>
        </Pressable>
        {parts ? (
          <View style={{ padding: 14, borderRadius: 20, backgroundColor: t.c.bg.tile, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="rowTitle">I know the year</Text>
                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {knowYear ? (year ? `${year}${age != null ? ` · shows “turns ${age}”` : ''}` : 'Type the year they were born') : 'Off: People never shows an age'}
                </Text>
              </View>
              <Toggle
                accessibilityLabel="I know the year"
                value={knowYear}
                onChange={(on) => {
                  setKnowYear(on);
                  onChange(birthdayIso(parts.month, parts.day, on ? year : null));
                }}
              />
            </View>
            {knowYear ? (
              <Box>
                <TextInput
                  accessibilityLabel="Year"
                  value={yearText}
                  onChangeText={(s) => {
                    const v = s.replace(/\D/g, '').slice(0, 4);
                    setYearText(v);
                    const y = /^\d{4}$/.test(v) && Number(v) > NO_YEAR && Number(v) <= new Date().getFullYear() ? Number(v) : null;
                    onChange(birthdayIso(parts.month, parts.day, y));
                  }}
                  keyboardType="number-pad"
                  placeholder="1994"
                  placeholderTextColor={t.c.fg.tertiary}
                  selectionColor={t.c.accent.mustard}
                  cursorColor={t.c.accent.mustard}
                  style={[t.type.body as TextStyle, INPUT_TEXT, { flex: 1, color: t.c.fg.primary, paddingVertical: 14, fontVariant: ['tabular-nums'] }]}
                />
              </Box>
            ) : null}
          </View>
        ) : null}
      </View>
      <Sheet visible={open} onClose={() => setOpen(false)} title="Birthday">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }}>
          {MONTHS.map((m, i) => (
            <FilterChip key={m} label={m.slice(0, 3)} selected={month === i + 1} onPress={() => setMonth(i + 1)} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {Array.from({ length: DAYS_IN[month - 1]! }, (_, i) => i + 1).map((d) => {
            const sel = parts?.month === month && parts.day === d;
            return (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={`${d} ${MONTHS[month - 1]}`}
                accessibilityState={{ selected: sel }}
                onPress={() => {
                  set(month, d, year);
                  setOpen(false);
                }}
                style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? t.c.accent.mustard : pressed ? t.c.bg.pressed : t.c.bg.tileRaised })}
              >
                <Text variant="label" color={sel ? t.c.accent.mustardInk : undefined} style={{ fontVariant: ['tabular-nums'] }}>
                  {d}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </Row>
  );
}

/** A 40-high lime pill (header Save). */
function LimePill({ title, onPress, height = 40 }: { title: string; onPress: () => void; height?: number }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ height, paddingHorizontal: height > 44 ? 22 : 14, borderRadius: 999, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ fontSize: height > 44 ? 15 : 13, lineHeight: 20, fontWeight: '700', color: t.c.accent.mustardInk }}>{title}</Text>
    </Pressable>
  );
}

/** A 40-high raised pill with an icon (Pick a photo · Use contact’s photo). */
function RaisedPill({ title, icon, onPress }: { title: string; icon: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: pressed ? t.c.bg.pressed : t.c.bg.tileRaised, alignSelf: 'flex-start' })}>
      <Icon name={icon} size={16} color={t.c.fg.primary} />
      <Text variant="label" numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

export function PersonForm({ id, initial, onSaved, linkTo }: RecordFormProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const existing = useMemo(() => (id ? os.records.get<PersonData>(id) : null), [id, os]);
  const start = { ...(existing?.data ?? {}), ...(initial ?? {}) } as PersonData & { title?: string };
  const [name, setName] = useState<string>(existing?.title ?? (initial?.title as string | undefined) ?? '');
  const [d, setD] = useState<PersonData>(() => {
    const { title: _t, ...rest } = start;
    void _t;
    return rest;
  });
  const [nameFocus, setNameFocus] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string | null; upi?: string }>({});
  const [contactPhoto, setContactPhoto] = useState<string | null>(null);
  const set = <K extends keyof PersonData>(k: K, v: PersonData[K] | undefined) => setD((x) => ({ ...x, [k]: v }));

  const relationships = useLive((o) => [...BUILTIN_RELATIONSHIPS, ...customRelationships(o)], []);
  const added = useLive((o) => customRelationships(o), []);

  // The contact's own photo, when this person came from one and access is already given (never asks here).
  useEffect(() => {
    let live = true;
    const c = os.device?.contacts;
    if (!d.contactId || !c) return;
    void (async () => {
      try {
        if ((await c.access()) !== 'granted') return;
        const hit = (await c.read()).find((x) => x.id === d.contactId);
        if (live && hit?.photo && hit.photo !== d.photo?.uri) setContactPhoto(hit.photo);
      } catch {
        // Not readable: the button stays hidden.
      }
    })();
    return () => {
      live = false;
    };
  }, [d.contactId, os]);

  const pickPhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1] });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const file = a.fileName ?? `person-${Date.now()}.jpg`;
    const uri = await persistAttachment(a.uri, file);
    set('photo', { uri, name: file, mime: a.mimeType ?? 'image/jpeg' });
  };

  const first = firstName(name);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/entity/person'));
  const save = () => {
    const title = name.trim();
    const emailBad = d.email ? emailError(d.email) : null;
    const upiBad = (d.upi ?? '').split(',').map((x) => x.trim()).filter(Boolean).map(upiError).find(Boolean);
    const next = { name: title ? undefined : 'Add a name', email: emailBad, upi: upiBad ?? undefined };
    setErrors(next);
    if (!title || emailBad || upiBad) {
      toast.show({ message: !title ? 'Add a name first' : 'Check the highlighted field', icon: 'info' });
      return;
    }
    const clean = (s: string | undefined) => (s && s.trim() ? s.trim() : undefined);
    const data: Partial<PersonData> = {
      ...d,
      phone: clean(d.phone),
      email: clean(d.email),
      upi: clean(d.upi),
      company: clean(d.company),
      role: clean(d.role),
      city: clean(d.city),
      likes: clean(d.likes),
      notes: clean(d.notes),
      contactEvery: d.contactEvery || undefined,
      relationship: d.relationship || undefined,
      worksAtId: clean(d.company) ? d.worksAtId : undefined,
      livesInId: clean(d.city) ? d.livesInId : undefined,
    };
    try {
      const saved = (id ? os.records.update<PersonData>(id, { title, data }, 'user') : os.records.create<PersonData>({ object: 'person', title, data: data as PersonData }, 'user')) as unknown as ObjectRecord;
      if (linkTo && !id) os.links.link(saved.id, linkTo.id, linkTo.kind);
      if (onSaved) onSaved(saved);
      else if (id) close();
      else router.replace(`/entity/person/${saved.id}` as never);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };

  const photoUri = d.photo?.uri;
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 32, gap: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
          <IconButton icon="chevron-left" accessibilityLabel="Back" filled onPress={close} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            {id && existing ? (
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {existing.title}
              </Text>
            ) : null}
            <Text variant="title" numberOfLines={1} accessibilityRole="header">
              {id ? 'Edit person' : 'New person'}
            </Text>
          </View>
          <LimePill title="Save" onPress={save} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={photoUri ? 'Change photo' : 'Pick a photo'} onPress={() => void pickPhoto()}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={{ width: 88, height: 88, borderRadius: 44 }} contentFit="cover" accessibilityIgnoresInvertColors />
            ) : id && name.trim() ? (
              <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: faceColor(id), alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 30, lineHeight: 36, fontWeight: '700', color: '#0B0B0D' }}>{initials(name, 1)}</Text>
              </View>
            ) : (
              <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: t.c.bg.tileRaised, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(245,245,247,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="camera" size={26} color={t.c.fg.secondary} />
              </View>
            )}
          </Pressable>
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <RaisedPill title={photoUri ? 'Change photo' : 'Pick a photo'} icon="image" onPress={() => void pickPhoto()} />
            {contactPhoto ? <RaisedPill title="Use contact’s photo" icon="user-circle" onPress={() => (set('photo', { uri: contactPhoto, name: 'Contact photo' }), setContactPhoto(null))} /> : photoUri ? <RaisedPill title="Remove photo" icon="x" onPress={() => set('photo', undefined)} /> : null}
          </View>
        </View>

        <Row label="Name">
          <View style={{ gap: 6 }}>
            <Box focused={nameFocus} error={!!errors.name}>
              <TextInput
                accessibilityLabel="Name"
                value={name}
                onChangeText={(s) => {
                  setName(s);
                  if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
                }}
                placeholder="Their name"
                placeholderTextColor={t.c.fg.tertiary}
                selectionColor={t.c.accent.mustard}
                cursorColor={t.c.accent.mustard}
                autoCapitalize="words"
                autoFocus={!id && !name}
                onFocus={() => setNameFocus(true)}
                onBlur={() => setNameFocus(false)}
                style={[t.type.body as TextStyle, INPUT_TEXT, { flex: 1, minWidth: 0, color: t.c.fg.primary, paddingVertical: 14 }]}
              />
            </Box>
            {errors.name ? (
              <Text variant="caption" color={t.c.alert.coral}>
                {errors.name}
              </Text>
            ) : null}
          </View>
        </Row>

        <OptionPills
          label="Relationship"
          options={relationships.map((o) => ({ value: o.value, label: o.label }))}
          value={d.relationship}
          onChange={(v) => set('relationship', v)}
          onCreate={(label) => addRelationship(os, label)?.value ?? null}
          createPlaceholder="Neighbour, Mentor, Landlord"
          createHint={`Becomes a relationship you can pick for anyone.${added.length ? ` ${added[added.length - 1]!.label} was added this way.` : ''}`}
        />

        <Row label="Phone">
          <Input accessibilityLabel="Phone" value={d.phone ?? ''} onChange={(s) => set('phone', s)} placeholder="+91 98450 12345" leading="phone" keyboardType="phone-pad" />
        </Row>

        <Row label="Email">
          <Input
            accessibilityLabel="Email"
            value={d.email ?? ''}
            onChange={(s) => {
              set('email', s);
              if (errors.email && !emailError(s)) setErrors((e) => ({ ...e, email: null }));
            }}
            onBlur={() => setErrors((e) => ({ ...e, email: d.email ? emailError(d.email) : null }))}
            placeholder="name@example.com"
            leading="comment"
            keyboardType="email-address"
            error={errors.email}
          />
        </Row>

        <ChipsField
          label="UPI IDs"
          value={d.upi}
          onChange={(v) => {
            set('upi', v);
            if (errors.upi) setErrors((e) => ({ ...e, upi: undefined }));
          }}
          placeholder="Add a UPI ID"
          validate={upiError}
          error={errors.upi}
          layout="inline"
          mono
        />

        <RecordText
          label="Works at"
          object="org"
          kind="company"
          icon="briefcase"
          inLabel="in Organisations"
          collection="organisations"
          text={d.company ?? ''}
          linkedId={d.worksAtId}
          placeholder="Company"
          onText={(s) => setD((x) => ({ ...x, company: s, worksAtId: x.worksAtId && os.records.get(x.worksAtId) && norm(os.records.get(x.worksAtId)!.title) === norm(s) ? x.worksAtId : undefined }))}
          onLink={(wid, title) => setD((x) => ({ ...x, worksAtId: wid, company: title ?? x.company }))}
        />

        <Row label="Role">
          <Input accessibilityLabel="Role" value={d.role ?? ''} onChange={(s) => set('role', s)} placeholder="Product designer" />
        </Row>

        <RecordText
          label="Lives in"
          object="place"
          kind="city"
          icon="location"
          inLabel="in Places"
          collection="places"
          text={d.city ?? ''}
          linkedId={d.livesInId}
          placeholder="City"
          onText={(s) => setD((x) => ({ ...x, city: s, livesInId: x.livesInId && os.records.get(x.livesInId) && norm(os.records.get(x.livesInId)!.title) === norm(s) ? x.livesInId : undefined }))}
          onLink={(pid, title) => setD((x) => ({ ...x, livesInId: pid, city: title ?? x.city }))}
        />

        <BirthdayInput value={d.birthday} onChange={(v) => set('birthday', v)} />

        <ChipsField
          label="Likes"
          value={d.likes}
          onChange={(v) => set('likes', v)}
          placeholder="Add a like: food, hobby, team, brand"
          layout="below"
          leading="heart"
          hint={first ? `Gift ideas before ${first}’s birthday come from these.` : 'Gift ideas before their birthday come from these.'}
        />

        <Row label="Keep in touch">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginHorizontal: -t.layout.gutter, flexGrow: 0 }} contentContainerStyle={{ gap: 8, paddingHorizontal: t.layout.gutter }}>
            {KEEP.map((k) => (
              <FilterChip key={k.label} label={k.label} selected={(d.contactEvery ?? '') === k.value} onPress={() => set('contactEvery', k.value || undefined)} />
            ))}
          </ScrollView>
        </Row>

        <Row label="About">
          <TextInput
            accessibilityLabel="About"
            multiline
            value={d.notes ?? ''}
            onChangeText={(s) => set('notes', s)}
            placeholder={first ? `How you know ${first}, what to remember` : 'How you know them, what to remember'}
            placeholderTextColor={t.c.fg.tertiary}
            selectionColor={t.c.accent.mustard}
            cursorColor={t.c.accent.mustard}
            style={[t.type.body as TextStyle, { fontSize: 16, lineHeight: 23, fontFamily: fontForWeight(500), minHeight: 112, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line, color: t.c.fg.primary, textAlignVertical: 'top' }]}
          />
        </Row>

        <LimePill title={first ? `Save ${first}` : 'Save'} height={52} onPress={save} />
      </ScrollView>
    </View>
  );
}
