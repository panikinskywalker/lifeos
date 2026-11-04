import React, { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ObjectRecord } from '@core/domain/types';
import type { RecordFormProps } from '@core/registry/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { Icon, IconButton, Sheet, Text, TextField, useToast } from '@ui/kit';
import { persistAttachment } from '@ui/lib/files';
import { daysToStart, norm, TRIP_STATUSES, tripDays, tripType, type TripData } from '@modules/travel';
import { dayLabel, faceColor, firstName, Note, plural, routes, whenShort, withLine } from './parts';

/**
 * The trip form (NR-Travel-Form): a cover photo, where to with the Place it
 * matches, start and end, purpose and status, then planning: budget, local
 * currency, who's travelling (a person or a whole group) and notes. Save in the
 * header and at the bottom. The board's form override for Trip, used by New and Edit.
 */

const optionsOf = (key: string) => tripType.fields.find((f) => f.key === key)?.options ?? [];
const INPUT: TextStyle = { fontSize: 16, lineHeight: 21, fontFamily: fontForWeight(500) };
const STRONG: TextStyle = { fontSize: 16, lineHeight: 21, fontFamily: fontForWeight(600) };
const LABEL: TextStyle = { fontSize: 13, lineHeight: 17, fontWeight: '600', paddingHorizontal: 4 };

/** 120000 → "1,20,000". */
function indian(n: number): string {
  const s = String(Math.round(n));
  if (s.length <= 3) return s;
  return `${s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${s.slice(-3)}`;
}

function Label({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={[LABEL, { color: t.c.fg.secondary }]}>{children}</Text>;
}

/** A 40-tall pill, white when picked. */
function Choice({ label, on, onPress, pad = 16 }: { label: string; on: boolean; onPress: () => void; pad?: number }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} hitSlop={2} style={{ height: 40, paddingHorizontal: pad, borderRadius: 999, backgroundColor: on ? t.c.fg.primary : t.c.bg.tileRaised, justifyContent: 'center' }}>
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: on ? t.c.bg.ground : t.c.fg.primary }}>{label}</Text>
    </Pressable>
  );
}

/** A 56-tall box: radius 20, a hairline at rest. */
function Box({ focused, children, pad = 18 }: { focused?: boolean; children: React.ReactNode; pad?: number }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingLeft: pad, paddingRight: pad, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: focused ? 1.5 : 1, borderColor: focused ? t.c.fg.primary : t.c.line }}>{children}</View>;
}

function DateBox({ label, value, onChange, min }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void; min?: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const date = value ? new Date(`${value}T12:00:00`) : null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const emit = (d: Date) => onChange(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
      <Label>{label}</Label>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value ? dayLabel(value) : 'not set'}`} onPress={() => setOpen(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingHorizontal: 14, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line }}>
        <Icon name="calendar" size={16} color={t.c.fg.secondary} />
        <Text numberOfLines={1} style={[STRONG, { flex: 1, color: value ? t.c.fg.primary : t.c.fg.tertiary }]}>{value ? dayLabel(value) : 'Not set'}</Text>
        {value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label.toLowerCase()}`} onPress={() => onChange(undefined)} hitSlop={12}>
            <Icon name="x" size={14} color={t.c.fg.tertiary} />
          </Pressable>
        ) : null}
      </Pressable>
      {open && Platform.OS === 'web' ? (
        <Sheet visible onClose={() => setOpen(false)} title={label}>
          <TextField value={value ?? ''} placeholder="YYYY-MM-DD" onChange={(s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime()) ? onChange(s) : undefined)} />
        </Sheet>
      ) : open ? (
        <DateTimePicker
          value={date ?? (min ? new Date(`${min}T12:00:00`) : new Date())}
          minimumDate={min ? new Date(`${min}T00:00:00`) : undefined}
          mode="date"
          themeVariant={t.dark ? 'dark' : 'light'}
          accentColor={t.c.accent.mustard}
          onChange={(ev, d) => {
            setOpen(false);
            if (ev.type === 'set' && d) emit(d);
          }}
        />
      ) : null}
    </View>
  );
}

export function TripForm({ id, initial, onSaved, linkTo }: RecordFormProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const existing = id ? os.records.get<TripData>(id) : null;
  const [d, setD] = useState<Partial<TripData>>(() => ({ ...(initial as Partial<TripData> | undefined), ...(existing?.data ?? {}) }));
  const [status, setStatus] = useState<string>(existing?.status ?? (initial?.status as string | undefined) ?? 'planning');
  const [cover, setCover] = useState<{ uri: string; name: string; mime: string; size: number | null } | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [who, setWho] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof TripData>(k: K, v: TripData[K] | undefined) => setD((x) => ({ ...x, [k]: v }));
  const shownCover = cover?.uri ?? (id ? os.attachments.cover(id)?.uri ?? null : null);

  const data = useLive((o) => {
    const has = (x: string) => o.registry.objects.has(x);
    return {
      places: has('place') ? o.records.query<{ parentId?: string; kind?: string }>('place', {}, { limit: 5000 }).filter((p) => !p.archived).map((p) => ({ id: p.id, title: p.title, parent: p.data.parentId ? o.records.get(p.data.parentId)?.title ?? null : null })) : [],
      people: has('person') ? o.records.query('person', {}, { limit: 5000 }).filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.title })).sort((a, b) => a.name.localeCompare(b.name)) : [],
      groups: has('group') ? o.records.query<{ kind?: string; memberIds?: string[] }>('group', {}, { limit: 500 }).filter((g) => !g.archived).map((g) => ({ id: g.id, name: g.title, kind: g.data.kind, members: g.data.memberIds ?? [] })) : [],
    };
  }, []);

  /* Where to: the Place the name matches, picked or kept as typed. */
  const typed = norm(d.destination ?? '');
  const matches = useMemo(() => (typed ? data.places.filter((p) => norm(p.title).startsWith(typed) || norm(p.title.split(',')[0]!) === typed).slice(0, 3) : []), [data.places, typed]);
  const linked = data.places.find((p) => p.id === d.placeId);

  /* Who's travelling. */
  const q = who.trim().toLowerCase();
  const results = q
    ? [...data.groups.filter((g) => g.name.toLowerCase().includes(q)).sort((a, b) => Number(b.kind === 'trip') - Number(a.kind === 'trip')).map((g) => ({ key: g.id, title: g.name, line: `Group · ${plural(g.members.length, 'person', 'people')} and you`, onPress: () => addGroup(g.id) })), ...data.people.filter((p) => p.name.toLowerCase().includes(q) && !(d.personIds ?? []).includes(p.id)).map((p) => ({ key: p.id, title: p.name, line: 'Person', onPress: () => addPerson(p.id) }))].slice(0, 6)
    : [];
  function addPerson(pid: string) {
    set('personIds', [...(d.personIds ?? []), pid]);
    setPicked(null);
    setWho('');
  }
  function addGroup(gid: string) {
    const g = data.groups.find((x) => x.id === gid);
    if (!g) return;
    set('personIds', [...new Set([...(d.personIds ?? []), ...g.members])]);
    setPicked(`Picked ${g.name}: ${plural(g.members.length, 'person', 'people')} and you`);
    setWho('');
  }
  const named = (d.personIds ?? []).map((pid) => ({ id: pid, name: data.people.find((p) => p.id === pid)?.name ?? '' })).filter((p) => p.name);

  const pickCover = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
    const a = r.canceled ? null : r.assets[0];
    if (!a) return;
    const name = a.fileName ?? `trip-${Date.now()}.jpg`;
    setCover({ uri: await persistAttachment(a.uri, name), name, mime: a.mimeType ?? 'image/jpeg', size: a.fileSize ?? null });
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace(routes.home as never));
  const save = () => {
    const destination = d.destination?.trim();
    if (!destination) {
      setError('Add where to');
      toast.show({ message: 'Add where to first', icon: 'info' });
      return;
    }
    if (d.startDate && d.endDate && d.endDate < d.startDate) {
      toast.show({ message: 'The trip ends before it starts', icon: 'info' });
      return;
    }
    const next: Partial<TripData> = { ...d, destination, notes: d.notes?.trim() || undefined };
    try {
      const saved = (id ? os.records.update<TripData>(id, { data: next, status }, 'user') : os.records.create<TripData>({ object: 'trip', data: next as TripData, status }, 'user')) as unknown as ObjectRecord;
      if (linkTo && !id) os.links.link(saved.id, linkTo.id, linkTo.kind);
      if (cover) os.attachments.setCover({ entityId: saved.id, name: cover.name, mime: cover.mime, size: cover.size, uri: cover.uri });
      if (onSaved) onSaved(saved);
      else if (id) close();
      else router.replace(routes.trip(saved.id) as never);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };

  const days = tripDays({ startDate: d.startDate, endDate: d.endDate });
  const when = d.startDate && (daysToStart({ startDate: d.startDate }) ?? 0) > 0 ? whenShort({ startDate: d.startDate, endDate: d.endDate }) : null;
  const span = [days ? plural(days, 'day') : null, when].filter(Boolean).join(' · ');

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.c.bg.ground }} contentContainerStyle={{ paddingHorizontal: t.layout.gutter, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32, gap: 22 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <IconButton icon="x" accessibilityLabel="Close" filled onPress={close} />
        <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>{id ? 'Edit trip' : 'New trip'}</Text>
        <Pressable accessibilityRole="button" onPress={save} hitSlop={4} style={({ pressed }) => ({ height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: t.c.fg.onAccent }}>Save</Text>
        </Pressable>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ width: 88, height: 88, borderRadius: 24, backgroundColor: t.c.bg.tileRaised, borderWidth: shownCover ? 0 : 1.5, borderStyle: 'dashed', borderColor: 'rgba(245,245,247,0.22)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {shownCover ? <Image source={{ uri: shownCover }} style={{ width: 88, height: 88 }} contentFit="cover" accessibilityIgnoresInvertColors /> : <Icon name="image" size={26} color={t.c.fg.secondary} />}
        </View>
        <View style={{ gap: 6, alignItems: 'flex-start' }}>
          <Pressable accessibilityRole="button" onPress={() => void pickCover()} hitSlop={2} style={{ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center' }}>
            <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600' }}>{shownCover ? 'Change the cover photo' : 'Pick a cover photo'}</Text>
          </Pressable>
          <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary, paddingHorizontal: 4 }}>Stays on this phone</Text>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', paddingHorizontal: 4 }}>Where to?</Text>
        <Box focused={focus === 'dest'}>
          <TextInput value={d.destination ?? ''} onChangeText={(v) => (setError(null), setD((x) => ({ ...x, destination: v, placeId: undefined })))} onFocus={() => setFocus('dest')} onBlur={() => setFocus(null)} placeholder="Tokyo, Goa, …" placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} cursorColor={t.c.accent.mustard} accessibilityLabel="Where to" style={[INPUT, { flex: 1, minWidth: 0, color: t.c.fg.primary, paddingVertical: 14 }]} />
        </Box>
        {error ? <Text variant="caption" color={t.c.alert.coralText} style={{ paddingHorizontal: 4 }}>{error}</Text> : null}
        {matches.length || linked ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {(linked && !matches.some((m) => m.id === linked.id) ? [linked, ...matches] : matches).map((p) => {
              const on = d.placeId === p.id;
              return (
                <Pressable key={p.id} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => set('placeId', p.id)} hitSlop={4} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingLeft: 10, paddingRight: 12, borderRadius: 999, backgroundColor: on ? t.c.fg.primary : t.c.bg.tileRaised, maxWidth: '100%' }}>
                  <Icon name="location" size={13} color={on ? t.c.bg.ground : t.c.fg.primary} />
                  <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: on ? t.c.bg.ground : t.c.fg.primary, flexShrink: 1 }}>{p.title}{p.parent ? ` · Place in ${p.parent}` : ' · Place'}</Text>
                </Pressable>
              );
            })}
            <Pressable accessibilityRole="button" accessibilityState={{ selected: !d.placeId }} onPress={() => set('placeId', undefined)} hitSlop={4} style={{ height: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: !d.placeId ? t.c.fg.primary : t.c.bg.tileRaised, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: !d.placeId ? t.c.bg.ground : t.c.fg.primary }}>Keep as typed</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <DateBox label="Start" value={d.startDate} onChange={(v) => setD((x) => ({ ...x, startDate: v, endDate: v && x.endDate && x.endDate < v ? v : x.endDate }))} />
          <DateBox label="End" value={d.endDate} min={d.startDate} onChange={(v) => set('endDate', v)} />
        </View>
        {span ? <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>{span}</Text> : null}
      </View>

      <View style={{ gap: 8 }}>
        <Label>Purpose</Label>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {optionsOf('purpose').map((o) => <Choice key={o.value} label={o.label} on={d.purpose === o.value} onPress={() => set('purpose', d.purpose === o.value ? undefined : o.value)} />)}
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Label>Status</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginHorizontal: -t.layout.gutter }} contentContainerStyle={{ gap: 8, paddingHorizontal: t.layout.gutter }} keyboardShouldPersistTaps="handled">
          {TRIP_STATUSES.map((s) => <Choice key={s.value} label={s.label} on={status === s.value} onPress={() => setStatus(s.value)} />)}
        </ScrollView>
      </View>

      <View style={{ height: 1, backgroundColor: t.c.line }} />
      <Text variant="labelCaps" color="secondary" accessibilityRole="header" style={{ paddingHorizontal: 4 }}>PLANNING</Text>

      <View style={{ gap: 8 }}>
        <Label>Budget</Label>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingLeft: 14, paddingRight: 10, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.c.bg.dim, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="rupee" size={15} color={t.c.fg.primary} />
          </View>
          <TextInput value={d.budget ? indian(d.budget) : ''} onChangeText={(v) => set('budget', Number(v.replace(/\D/g, '')) || undefined)} keyboardType="number-pad" placeholder="0" placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} accessibilityLabel="Budget in rupees" style={[STRONG, { flex: 1, minWidth: 0, color: t.c.fg.primary, paddingVertical: 14, fontVariant: ['tabular-nums'] }]} />
          <View style={{ height: 36, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>INR</Text>
          </View>
        </View>
      </View>

      <View style={{ gap: 8 }}>
        <Label>Local currency</Label>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {optionsOf('localCurrency').map((o) => <Choice key={o.value} pad={14} label={o.label} on={d.localCurrency === o.value} onPress={() => set('localCurrency', d.localCurrency === o.value ? undefined : o.value)} />)}
        </View>
        <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>New expenses on this trip start in it</Text>
      </View>

      <View style={{ gap: 10 }}>
        <Label>Travelling with</Label>
        <Box>
          <Icon name="search" size={18} color={t.c.fg.secondary} />
          <TextInput value={who} onChangeText={setWho} placeholder="Search people or a group" placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} autoCorrect={false} accessibilityLabel="Search people or a group" style={[INPUT, { flex: 1, minWidth: 0, color: t.c.fg.primary, paddingVertical: 14 }]} />
        </Box>
        {results.length ? (
          <View style={{ padding: 8, borderRadius: 20, backgroundColor: t.c.bg.tile, gap: 2 }}>
            {results.map((r) => (
              <Pressable key={r.key} accessibilityRole="button" accessibilityLabel={`Add ${r.title}`} onPress={r.onPress} style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 10, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                <Text variant="rowTitle" numberOfLines={1}>{r.title}</Text>
                <Text variant="caption" color="secondary" numberOfLines={1}>{r.line}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {named.length ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {named.map((p) => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Remove ${p.name}`} onPress={() => set('personIds', (d.personIds ?? []).filter((x) => x !== p.id))} hitSlop={5} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingLeft: 9, paddingRight: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: faceColor(p.id) }} />
                <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{firstName(p.name)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {picked ? <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>{picked}</Text> : named.length ? <Text variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>{withLine(named.map((p) => ({ ...p, photo: null, data: {} })))} and you. Tap a name to take them off.</Text> : null}
      </View>

      <View style={{ gap: 8 }}>
        <Label>Notes</Label>
        <TextInput value={d.notes ?? ''} onChangeText={(v) => set('notes', v)} multiline placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} accessibilityLabel="Notes" textAlignVertical="top" style={[INPUT, { lineHeight: 23, minHeight: 112, paddingVertical: 16, paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line, color: t.c.fg.primary }]} />
      </View>

      <Pressable accessibilityRole="button" onPress={save} style={({ pressed }) => ({ height: 52, borderRadius: 999, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.fg.onAccent }}>Save trip</Text>
      </Pressable>

      {id ? null : <Note icon="brain" iconColor={t.c.accent.gold}>Or tell the Dump: “plan Goa 20 to 24 Dec with the Goa group, ₹1.2L, book flights and a villa”. It makes the trip and a to-do for each thing to book.</Note>}
    </ScrollView>
  );
}
