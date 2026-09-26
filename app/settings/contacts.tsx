import { useEffect, useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { importContacts, personForContact, type DeviceContact } from '@core/sources/phone';
import { useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Checkbox, EmptyState, Icon, IconButton, ScreenHeader, Text, useToast } from '@ui/kit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { loadDeviceContacts } from '../../src/platform/phoneSources';

/**
 * Pick contacts to add to People (M4.2b) — never the whole phonebook.
 * Search, tick, add. People already in LifeOS are marked and get their
 * missing phone / email / birthday filled if you tick them.
 */
export default function ContactsPicker() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [all, setAll] = useState<DeviceContact[] | null>(null);
  const [denied, setDenied] = useState(false);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDeviceContacts()
      .then((c) => (c.length ? setAll(c) : (setDenied(true), setAll([]))))
      .catch(() => (setDenied(true), setAll([])));
  }, []);
  const known = useMemo(() => new Set((all ?? []).filter((c) => personForContact(os, c)).map((c) => c.id)), [all, os]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (all ?? []).filter((c) => !s || c.name.toLowerCase().includes(s) || c.phones.some((p) => p.replace(/\D/g, '').includes(s.replace(/\D/g, '') || '\0')));
  }, [all, q]);
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const add = () => {
    const r = importContacts(os, (all ?? []).filter((c) => picked.has(c.id)));
    toast.show({ message: `${r.created ? `Added ${r.created}` : ''}${r.created && r.updated ? ' · ' : ''}${r.updated ? `Filled in ${r.updated}` : ''}` || 'Nothing new', icon: 'people' });
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, gap: 12, paddingBottom: 8 }}>
        <ScreenHeader title="Pick contacts" subtitle={all ? `${picked.size} picked · ${all.length} on your phone` : 'Reading your contacts…'} onBack={() => router.back()} right={picked.size ? <Button title={`Add ${picked.size}`} size="sm" icon="check" onPress={add} /> : undefined} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.c.bg.tile, borderRadius: t.radius.card, paddingHorizontal: 14, height: 46 }}>
          <Icon name="search" size={16} color={t.c.fg.secondary} />
          <TextInput value={q} onChangeText={setQ} placeholder="Search name or number" placeholderTextColor={t.c.fg.tertiary} style={{ flex: 1, color: t.c.fg.primary, fontFamily: t.type.body.fontFamily, fontSize: 15 }} autoCorrect={false} />
          {q ? <IconButton icon="x" size={32} accessibilityLabel="Clear search" onPress={() => setQ('')} /> : null}
        </View>
      </View>
      {denied ? (
        <View style={{ padding: t.layout.gutter }}>
          <EmptyState icon="people" line="LifeOS needs permission to read your contacts to show them here. Nothing is added until you pick." />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 32 }}
          initialNumToRender={30}
          renderItem={({ item: c }) => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
              <Checkbox checked={picked.has(c.id)} onChange={() => toggle(c.id)} accessibilityLabel={`Pick ${c.name}`} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="rowTitle" numberOfLines={1}>
                  {c.name}
                </Text>
                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {[c.phones[0], c.emails[0], c.company].filter(Boolean).join(' · ') || 'No details'}
                </Text>
              </View>
              {known.has(c.id) ? (
                <Text variant="labelMicro" color={t.c.ok.sageText} style={{ textTransform: 'uppercase' }}>
                  In LifeOS
                </Text>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}
