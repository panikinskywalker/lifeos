import { useEffect, useMemo, useState } from 'react';
import { FlatList, Linking, Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { DeviceContact } from '@core/registry/context';
import { phoneKey } from '@core/identity';
import { importContacts, personForContact, type PersonData } from '@modules/crm';
import { useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { Icon, IconButton, ScreenHeader, Text, useToast } from '@ui/kit';
import { Chip28, faceColor, initials, Label } from '@boards/crm/parts';

/**
 * Pick contacts (NR-People-Contacts; crm's contacts source since R2) — never
 * the whole phonebook. Before access: a card that says so, and Allow
 * contacts. Then search, tick and Add: the people you call often first (from
 * the call log, when it can be read), then everyone. Someone already in
 * People is marked, and ticking them only fills what's missing.
 */

const DAY = 86_400_000;
type Phase = 'loading' | 'ask' | 'denied' | 'unavailable' | 'ready';
const GAP_WORDS: Array<[keyof PersonData, (c: DeviceContact) => unknown, string]> = [
  ['phone', (c) => c.phones[0], 'phone'],
  ['email', (c) => c.emails[0], 'email'],
  ['birthday', (c) => (c.birthday?.day ? c.birthday : null), 'birthday'],
  ['photo', (c) => c.photo, 'photo'],
  ['company', (c) => c.company, 'company'],
  ['role', (c) => c.jobTitle, 'role'],
];

export default function ContactsPicker() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const bridge = os.device?.contacts;
  const [phase, setPhase] = useState<Phase>('loading');
  const [all, setAll] = useState<DeviceContact[]>([]);
  const [calls, setCalls] = useState<Map<string, number> | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!bridge) return setPhase('unavailable');
    try {
      const list = await bridge.read();
      if (!list.length) return setPhase((await bridge.access()) === 'granted' ? 'ready' : 'denied');
      setAll(list);
      setPhase('ready');
    } catch {
      setPhase('denied');
    }
  };

  useEffect(() => {
    if (!bridge) return setPhase('unavailable');
    bridge
      .access()
      .then((a) => (a === 'granted' ? load() : setPhase(a === 'unavailable' ? 'unavailable' : 'ask')))
      .catch(() => setPhase('ask'));
    // Calls in the last 30 days, per number (never asks: no call log, no suggestions).
    const log = os.device?.callLog;
    if (log)
      void log
        .access()
        .then(async (a) => {
          if (a !== 'granted') return;
          const n = new Map<string, number>();
          for (const c of await log.read(Date.now() - 30 * DAY, 2000)) {
            if (c.type === 'missed') continue;
            const k = phoneKey(c.number);
            if (k.length >= 8) n.set(k, (n.get(k) ?? 0) + 1);
          }
          setCalls(n);
        })
        .catch(() => undefined);
  }, []);

  // Who is already in People, and what ticking them would add.
  const known = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of all) {
      const id = personForContact(os, c);
      if (!id) continue;
      const p = os.records.get<PersonData>(id);
      const cur = (p?.data ?? {}) as Record<string, unknown>;
      m.set(c.id, GAP_WORDS.filter(([k, from]) => (cur[k] == null || cur[k] === '') && from(c)).map(([, , w]) => w));
    }
    return m;
  }, [all, os]);
  const suggested = useMemo(() => {
    if (!calls?.size) return [];
    return all
      .map((c) => ({ c, n: Math.max(0, ...c.phones.map((p) => calls.get(phoneKey(p)) ?? 0)) }))
      .filter((x) => x.n >= 2)
      .sort((a, b) => b.n - a.n)
      .slice(0, 6)
      .map((x) => x.c);
  }, [all, calls]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const digits = s.replace(/\D/g, '');
    return all.filter((c) => !s || c.name.toLowerCase().includes(s) || (digits.length >= 3 && c.phones.some((p) => p.replace(/\D/g, '').includes(digits))) || c.emails.some((e) => e.toLowerCase().includes(s)));
  }, [all, q]);

  const toggle = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const add = () => {
    const r = importContacts(os, all.filter((c) => picked.has(c.id)));
    toast.show({ message: `${r.created ? `Added ${r.created}` : ''}${r.created && r.updated ? ' · ' : ''}${r.updated ? `Filled in ${r.updated}` : ''}` || 'Nothing new', icon: 'people' });
    router.back();
  };

  const line = (c: DeviceContact) => {
    const gaps = known.get(c.id);
    if (gaps) return gaps.length ? `Only fills gaps: adds ${gaps.join(', ')}` : 'Already in People';
    return [c.phones[0] ?? c.emails[0], c.photo ? 'photo' : null].filter(Boolean).join(' · ') || 'No number or email';
  };
  const row = (c: DeviceContact, i: number, n: number) => {
    const on = picked.has(c.id);
    return (
      <View key={c.id} style={{ backgroundColor: t.c.bg.tile, paddingHorizontal: 14, paddingTop: i === 0 ? 14 : 0, paddingBottom: i === n - 1 ? 14 : 0, borderTopLeftRadius: i === 0 ? 24 : 0, borderTopRightRadius: i === 0 ? 24 : 0, borderBottomLeftRadius: i === n - 1 ? 24 : 0, borderBottomRightRadius: i === n - 1 ? 24 : 0 }}>
        {i > 0 ? <View style={{ height: 1, backgroundColor: t.c.line, marginBottom: 4 }} /> : null}
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={`${c.name}. ${line(c)}`} onPress={() => toggle(c.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, marginBottom: i === n - 1 ? 0 : 4, opacity: pressed ? 0.75 : 1 })}>
          {on ? (
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="check" size={16} color={t.c.accent.mustardInk} strokeWidth={2.6} />
            </View>
          ) : (
            <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, borderColor: 'rgba(245,245,247,0.22)' }} />
          )}
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: faceColor(c.id), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {c.photo ? <Image source={{ uri: c.photo }} style={{ width: 40, height: 40 }} contentFit="cover" accessibilityIgnoresInvertColors /> : <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: '#0B0B0D' }}>{initials(c.name, 1)}</Text>}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text variant="rowTitle" numberOfLines={1}>
              {c.name}
            </Text>
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {line(c)}
            </Text>
          </View>
          {known.has(c.id) ? <Chip28 label="In People" /> : null}
        </Pressable>
      </View>
    );
  };

  const header = (
    <ScreenHeader
      title="Pick contacts"
      subtitle={phase === 'ready' ? (picked.size ? `${picked.size} ticked` : `${all.length} on your phone`) : 'You › Data sources › Contacts'}
      onBack={() => router.back()}
      right={
        picked.size ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Add ${picked.size}`} onPress={add} style={({ pressed }) => ({ height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ fontSize: 13, lineHeight: 20, fontWeight: '700', color: t.c.accent.mustardInk }}>Add {picked.size}</Text>
          </Pressable>
        ) : undefined
      }
    />
  );

  if (phase !== 'ready') {
    const card =
      phase === 'loading'
        ? null
        : phase === 'ask'
          ? { title: 'Pick who to add', line: 'LifeOS only reads the contacts you tick. It never copies your whole phonebook.', button: 'Allow contacts', onPress: () => void load() }
          : phase === 'denied'
            ? { title: 'Contacts are off', line: 'Allow contacts for LifeOS in your phone’s settings, then come back. Nothing is added until you tick someone.', button: 'Open settings', onPress: () => void Linking.openSettings() }
            : { title: 'No contacts here', line: 'Picking contacts works in the app on your phone.', button: null, onPress: () => undefined };
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg.ground, paddingTop: insets.top + 4, paddingHorizontal: t.layout.gutter, gap: 10 }}>
        {header}
        {card ? (
          <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile }}>
            <View style={{ alignItems: 'center', gap: 10, paddingTop: 10, paddingBottom: 4 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="people" size={26} color={t.c.accent.mustard} />
              </View>
              <Text variant="heading" style={{ textAlign: 'center' }}>
                {card.title}
              </Text>
              <Text variant="caption" color="secondary" style={{ textAlign: 'center', maxWidth: 270 }}>
                {card.line}
              </Text>
              {card.button ? (
                <Pressable accessibilityRole="button" accessibilityLabel={card.button} onPress={card.onPress} style={({ pressed }) => ({ marginTop: 6, height: 44, paddingHorizontal: 22, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                  <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.accent.mustardInk }}>{card.button}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  const searching = !!q.trim();
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <FlatList
        data={shown}
        keyExtractor={(c) => c.id}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={24}
        contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 32 }}
        ListHeaderComponent={
          <View style={{ gap: 18, paddingBottom: 10 }}>
            {header}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingLeft: 18, paddingRight: 6, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: t.c.line }}>
              <Icon name="search" size={18} color={t.c.fg.secondary} />
              <TextInput accessibilityLabel="Search your contacts" value={q} onChangeText={setQ} placeholder="Search your contacts" placeholderTextColor={t.c.fg.tertiary} selectionColor={t.c.accent.mustard} cursorColor={t.c.accent.mustard} autoCorrect={false} style={{ flex: 1, color: t.c.fg.primary, fontFamily: fontForWeight(500), fontSize: 16, lineHeight: 21, paddingVertical: 12 }} />
              {q ? <IconButton icon="x" size={36} accessibilityLabel="Clear search" onPress={() => setQ('')} /> : null}
            </View>
            <Text variant="caption" color="secondary">
              Ticking someone already in People only fills what’s missing. Nothing else is imported.
            </Text>
            {suggested.length && !searching ? (
              <View style={{ gap: 10 }}>
                <Label>Suggested · you call them often</Label>
                <View>{suggested.map((c, i) => row(c, i, suggested.length))}</View>
              </View>
            ) : null}
            {shown.length ? <Label>{searching ? `${shown.length} found` : 'All contacts'}</Label> : <Text variant="body" color="secondary" style={{ textAlign: 'center', paddingVertical: 24 }}>{searching ? `No contact matches “${q.trim()}”` : 'No contacts on this phone'}</Text>}
          </View>
        }
        renderItem={({ item, index }) => row(item, index, shown.length)}
      />
    </View>
  );
}
