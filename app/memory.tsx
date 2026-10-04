import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { formatDistanceToNowStrict } from 'date-fns';
import type { Fact } from '@core/repo/factRepo';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ActionSheet, Button, Chip, EmptyState, IconButton, Screen, Section, Sheet, Text, TextField, useToast } from '@ui/kit';
import { EntityPicker } from '@ui/components/fields';

const SOURCE: Record<Fact['source'], string> = { talk: 'from Talk', notification: 'from a notification', note: 'from a note', correction: 'a correction', user: 'added by you', dump: 'from a dump' };

/** Browse › Memory (M3): everything the agent remembers, by who or what it's about. Forget anything. */
export default function MemoryScreen() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ q?: string }>();
  const [q, setQ] = useState(params.q ?? '');
  const [active, setActive] = useState<Fact | null>(null);
  const [adding, setAdding] = useState(false);
  const all = useLive((o) => o.facts.list({ limit: 1000 }), []);
  const shown = useLive((o) => (q.trim() ? o.facts.search(q, 100) : o.facts.list({ limit: 1000 })), [q]);
  const groups = useMemo(() => {
    const by = new Map<string, { title: string; entityId?: string; facts: Fact[] }>();
    for (const f of shown) {
      const e = f.subjectId ? os.records.get(f.subjectId) : null;
      const key = e ? e.id : f.subjectKey ?? 'general';
      const title = e ? e.title : f.subjectKey?.startsWith('name:') ? f.subjectKey.slice(5).replace(/^\w/, (c) => c.toUpperCase()) : 'About you';
      if (!by.has(key)) by.set(key, { title, entityId: e?.id, facts: [] });
      by.get(key)!.facts.push(f);
    }
    return [...by.values()].sort((a, b) => (a.title === 'About you' ? -1 : b.title === 'About you' ? 1 : b.facts.length - a.facts.length));
  }, [shown, os]);
  const forget = (f: Fact) => {
    os.facts.forget(f.id);
    toast.show({ message: 'Forgotten', icon: 'trash', undo: () => os.facts.restore(f.id) });
  };
  return (
    <Screen title="Memory" subtitle={`${all.length} thing${all.length === 1 ? '' : 's'} you’ve told me`} onBack={() => (router.canGoBack() ? router.back() : router.replace('/browse'))} right={<IconButton icon="plus" accessibilityLabel="Add a fact" filled onPress={() => setAdding(true)} />}>
      <TextField value={q} onChange={setQ} placeholder="Search memory" leading="search" />
      {all.length === 0 ? (
        <EmptyState icon="sparkle" tint="memory" title="Nothing remembered yet" line="Tell Talk things worth keeping — “Dad hates surprises”, “the landlord is Suresh, rent on the 5th” — and they’ll live here." action="Add one yourself" onAction={() => setAdding(true)} />
      ) : shown.length === 0 ? (
        <EmptyState icon="search" tint="memory" line={`Nothing about “${q}”.`} bare />
      ) : (
        groups.map((g) => (
          <Section key={g.title} title={g.title} meta={`${g.facts.length}`} action={g.entityId ? 'Open' : undefined} onAction={g.entityId ? () => router.push(`/entity/${os.records.get(g.entityId!)!.object}/${g.entityId}` as never) : undefined}>
            <View style={{ gap: 8 }}>
              {g.facts.map((f) => (
                <View key={f.id} style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.card, padding: 14, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, marginTop: 8, backgroundColor: t.tints.memory.ink }} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="body">{f.text}</Text>
                    <Text variant="caption" color="secondary">
                      {Date.now() - f.statedAt < 60_000 ? 'just now' : formatDistanceToNowStrict(f.statedAt, { addSuffix: true })} · {SOURCE[f.source]}
                    </Text>
                  </View>
                  <IconButton icon="more" accessibilityLabel={`Options for: ${f.text}`} size={32} onPress={() => setActive(f)} />
                </View>
              ))}
            </View>
          </Section>
        ))
      )}
      <ActionSheet
        visible={!!active}
        onClose={() => setActive(null)}
        title={active?.text}
        actions={active ? [...(active.subjectId ? [{ label: 'Open what it’s about', icon: 'chevron-right' as const, onPress: () => { const e = os.records.get(active.subjectId!); if (e) router.push(`/entity/${e.object}/${e.id}` as never); } }] : []), { label: 'Forget this', icon: 'trash' as const, destructive: true, onPress: () => forget(active) }] : []}
      />
      <AddFactSheet visible={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}

function AddFactSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const os = useOS();
  const toast = useToast();
  const [text, setText] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const save = () => {
    const f = os.facts.add({ text, subjectId: subject, source: 'user' });
    setText('');
    setSubject(null);
    onClose();
    toast.show({ message: 'Remembered', icon: 'sparkle', undo: () => os.facts.forget(f.id) });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Remember something" footer={<Button title="Remember" icon="check" block disabled={text.trim().length < 3} onPress={save} />}>
      <TextField label="What" value={text} onChange={setText} placeholder="Dad hates surprises" multiline />
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {subject ? <Chip label={`About ${os.records.get(subject)?.title ?? ''}`} icon="x" onPress={() => setSubject(null)} /> : <Chip label="About a person or thing" icon="plus" onPress={() => setPicking(true)} />}
      </View>
      <EntityPicker visible={picking} onClose={() => setPicking(false)} types={[...os.registry.objects.keys()]} title="About" onSelect={(id) => setSubject(id)} />
    </Sheet>
  );
}
