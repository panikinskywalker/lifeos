import React from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { Icon, IconButton, Screen, Text } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import { folders, markFiled } from '@modules/documents';
import { documentsState } from './overview';
import { ActionPill, Card, EmptyCard, FoldersHero, FreshRow, Head, kindColor, Lined, NoteCard, plural, RenewRow } from './parts';

/**
 * Documents' home (NR-Documents-Home): search, your folders on a paper hero,
 * the three counts, Renew soon, New in your folders, By kind, and what stays
 * on the phone. It links to everything: search, the counts and By kind open
 * All documents.
 */

const PHONE_NOTE = 'Your files stay in your folders. LifeOS keeps a pointer and what you add: kind, expiry, links. The text inside a PDF is read on the phone and never leaves it.';
const LIST = '/module/documents/list';
const FOLDERS = '/module/documents/folders';
const NEW = '/entity/document/new';

function Count({ value, label, alert, onPress }: { value: number; label: string; alert?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${value} ${label}`} onPress={onPress} style={({ pressed }) => ({ flex: 1, minWidth: 0, padding: 14, gap: 4, borderRadius: 24, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.85 : 1 })}>
      <Text color={alert ? t.c.alert.coralText : 'primary'} style={{ fontSize: 26, lineHeight: 30, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500' }}>{label}</Text>
    </Pressable>
  );
}

export function DocumentsHome({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const s = useLive((os) => ({ ...documentsState(os), folders: folders(os) }), []);
  const go = (href: string) => router.push(href as never);
  const now = Date.now();
  const total = s.docs.length;
  const held = s.folders.length ? `${plural(s.folders.length, 'folder')} · nothing copied` : 'Nothing copied';
  const header = {
    title: 'Documents',
    subtitle: total ? [plural(total, 'document'), s.expired.length ? `${s.expired.length} expired` : null].filter(Boolean).join(' · ') : 'Nothing copied',
    onBack: () => (router.canGoBack() ? router.back() : router.replace('/browse' as never)),
    right: (
      <>
        <View>
          <IconButton icon="folder" filled accessibilityLabel={`Your folders${s.fresh.length ? `, ${s.fresh.length} new` : ''}`} onPress={() => go(FOLDERS)} />
          {s.fresh.length ? (
            <View pointerEvents="none" style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
              <Text color={t.c.accent.mustardInk} style={{ fontSize: 11, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{s.fresh.length}</Text>
            </View>
          ) : null}
        </View>
        <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} accessibilityLabel="Add document" onPress={() => go(NEW)} />
      </>
    ),
  };

  if (!total) {
    return (
      <Screen {...header} contentStyle={{ gap: 24 }}>
        <FoldersHero line={held} fresh={0} onPress={() => go(FOLDERS)} />
        <EmptyCard icon="folder" line="No documents yet. Pick the folders where your papers already are, or add one by hand.">
          <ActionPill title="Your folders" icon="folder" primary onPress={() => go(FOLDERS)} />
          <ActionPill title="Add document" icon="plus" onPress={() => go(NEW)} />
        </EmptyCard>
        <NoteCard icon="phone">{PHONE_NOTE}</NoteCard>
      </Screen>
    );
  }

  const renew = [...s.expired, ...s.soon];
  return (
    <Screen {...header} contentStyle={{ gap: 24 }}>
      <Pressable accessibilityRole="search" accessibilityLabel="Search documents" onPress={() => go(`${LIST}?search=1`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: t.c.line, opacity: pressed ? 0.85 : 1 })}>
        <Icon name="search" size={18} color={t.c.fg.secondary} />
        <Text numberOfLines={1} color="secondary" style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '500' }}>Title, number, issuer or text inside</Text>
      </Pressable>

      <FoldersHero line={held} fresh={s.fresh.length} onPress={() => go(FOLDERS)} />

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Count value={total} label="Documents" onPress={() => go(LIST)} />
        <Count value={s.soon.length} label="Expiring (90 d)" onPress={() => go(`${LIST}?filter=expiring`)} />
        <Count value={s.expired.length} label="Expired" alert={s.expired.length > 0} onPress={() => go(`${LIST}?filter=expiring`)} />
      </View>

      <View style={{ gap: 10 }}>
        <Head title="Renew soon" sub="Expired, then the next 90 days" action="Expiring soon" onAction={() => go(`${LIST}?filter=expiring`)} />
        {renew.length ? (
          <Card>
            <Lined>{renew.slice(0, 5).map((d) => <RenewRow key={d.id} ctx={ctx} d={d} now={now} />)}</Lined>
          </Card>
        ) : (
          <Card pad={16}><Text color="secondary" style={{ fontSize: 13, lineHeight: 17 }}>Nothing expires in the next 90 days.</Text></Card>
        )}
      </View>

      {s.fresh.length ? (
        <View style={{ gap: 10 }}>
          <Head title="New in your folders" sub="Found on the last rescan, waiting for a look" action={`All ${s.fresh.length}`} onAction={() => go(FOLDERS)} />
          <Card>
            <Lined>{s.fresh.slice(0, 4).map((d) => <FreshRow key={d.id} d={d} sub={d.data.kind && d.data.kind !== 'other' ? d.data.kind : 'not filed yet'} onFiled={() => markFiled(ctx, d.id)} />)}</Lined>
          </Card>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <Head title="By kind" />
        <Pressable accessibilityRole="button" accessibilityLabel={`What you keep: ${s.byKind.map((k) => `${k.value} ${k.label}`).join(', ')}. All documents`} onPress={() => go(LIST)} style={({ pressed }) => ({ padding: 18, gap: 12, borderRadius: 28, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.9 : 1 })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text variant="tileTitle">What you keep</Text>
              <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '500' }}>{plural(s.byKind.length, 'kind')}</Text>
            </View>
            <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.c.fg.primary, justifyContent: 'center' }}>
              <Text color={t.c.bg.ground} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{total}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 3 }}>
            {s.byKind.map((k) => <View key={k.kind} style={{ flexGrow: k.value, flexBasis: 5, height: 10, borderRadius: 5, backgroundColor: kindColor(k.kind, t) }} />)}
          </View>
          <View style={{ gap: 2 }}>
            {s.byKind.map((k, i) => (
              <View key={k.kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 26 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: kindColor(k.kind, t) }} />
                <Text numberOfLines={1} color={i < 4 ? 'primary' : 'secondary'} style={{ flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600' }}>{k.label}</Text>
                <Text color={i < 4 ? 'primary' : 'secondary'} style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{k.value}</Text>
              </View>
            ))}
          </View>
        </Pressable>
      </View>

      <NoteCard icon="phone">{PHONE_NOTE}</NoteCard>
    </Screen>
  );
}
