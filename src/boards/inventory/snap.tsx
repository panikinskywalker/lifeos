import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { File } from 'expo-file-system';
import type { LifeOSContext } from '@core/registry/context';
import { askWithPhoto } from '@core/brain';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, IconButton, Screen, Sheet, Text, useToast } from '@ui/kit';
import { fonts } from '@ui/theme/tokens';
import { acceptFound, acceptMissing, buy, fixMissing, fridgeDiff, fridgeQuestion, keepFridgeDish, parseStockLine, undoFridge, type FridgeDiff, type StockUndo } from '@modules/inventory';
import { Card, Eyebrow, Hairline, HomeEmpty, Note, PillButton, RowButton, SectionHead } from './parts';

/**
 * Snap the fridge (NR-Home-Snap; docs/MODEL.md layer 8, *Slices 4 and 6*). The
 * frame and shutter, which opens the phone's camera; then the photo small at
 * the top and the differences in rows: not seen (Used up · It's there), found
 * (Add · Fix, which opens the name and size in case Claude read the label
 * wrong). Nothing changes until you tap. All right keeps the dish for Cook
 * tonight and closes. The photo goes to Claude only because you pressed the
 * button; LifeOS never saves it, and the camera's file is deleted when you
 * leave (or take another).
 */

type Phase = { at: 'ready' } | { at: 'reading'; uri: string } | { at: 'result'; uri: string; diff: FridgeDiff; when: number } | { at: 'failed'; uri?: string; why: string };
type Answer = { kind: 'missing' | 'found'; key: string; done: 'accepted' | 'fixed'; undo: StockUndo | null };

/** About 5 MB once decoded: the API's limit for one image. */
const MAX_BASE64 = 6_900_000;
const WHY: Record<string, string> = {
  'no key': 'Add your Claude key in You › Agent › Brain first.',
  'over budget': 'Today’s budget for Claude is used up. Try again tomorrow, or raise it in You › Agent › Brain.',
  off: 'The brain is off in You › Agent › Brain.',
  error: 'Claude didn’t answer. Nothing was changed; try again.',
};

const dropFile = (uri: string) => {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // The web build, or a file the picker already cleaned up.
  }
};

export function FridgeSnap({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ at: 'ready' });
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  /** Found, being fixed: the name as Claude read it, and what you've made of it. */
  const [fixing, setFixing] = useState<{ name: string; text: string } | null>(null);
  const uriRef = useRef<string | null>(null);
  useEffect(() => () => void (uriRef.current && dropFile(uriRef.current)), []);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/inventory/index' as never));
  const q = fridgeQuestion(ctx);

  const snap = async () => {
    if (!q) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setPhase({ at: 'failed', why: 'LifeOS needs the camera for this. Allow it in Android’s settings.' });
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.4, base64: true, exif: false });
    const a = r.canceled ? null : r.assets[0];
    if (!a?.base64) return;
    if (uriRef.current) dropFile(uriRef.current);
    uriRef.current = a.uri;
    if (a.base64.length > MAX_BASE64) return setPhase({ at: 'failed', uri: a.uri, why: 'That photo is too big to send. Try again from a little further back.' });
    setAnswers({});
    setPhase({ at: 'reading', uri: a.uri });
    const model = (await ctx.device?.brain?.model()) ?? null;
    const mediaType = a.mimeType === 'image/png' || a.mimeType === 'image/webp' ? a.mimeType : 'image/jpeg';
    const res = await askWithPhoto(ctx, model, { ...q.ask, image: { mediaType, data: a.base64 } });
    if (!res.ok) return setPhase({ at: 'failed', uri: a.uri, why: WHY[res.note] ?? WHY.error! });
    setPhase({ at: 'result', uri: a.uri, diff: fridgeDiff(ctx, q.spaceId, res.answer), when: Date.now() });
  };

  const answer = (kind: Answer['kind'], key: string, done: Answer['done'], run: () => StockUndo | null, message: string) => {
    const prev = answers[key];
    if (prev?.undo) undoFridge(ctx, prev.undo);
    if (prev?.done === done) return setAnswers(({ [key]: _, ...rest }) => rest);
    const undo = run();
    setAnswers((s) => ({ ...s, [key]: { kind, key, done, undo } }));
    toast.show({ message, icon: 'check' });
  };

  const close = (diff?: FridgeDiff) => {
    if (diff?.dish && keepFridgeDish(ctx, diff.dish)) toast.show({ message: `Cook tonight: ${diff.dish.split(/:\s*/)[0]}`, icon: 'food' });
    if (uriRef.current) dropFile(uriRef.current);
    uriRef.current = null;
    back();
  };

  if (!q) return <Screen title="Snap the fridge" onBack={back}><HomeEmpty title="No Fridge on Home" line="Add a space called Fridge to compare it with a photo." /></Screen>;

  const pillsToCheck = (q.ask.record.in_the_fridge as string[]).length;
  const head = (run: () => void, sub: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <IconButton icon="x" accessibilityLabel="Close" filled onPress={run} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{sub}</Text>
        <Text accessibilityRole="header" style={{ fontSize: 22, lineHeight: 25, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary }}>Snap the fridge</Text>
      </View>
    </View>
  );
  const toCheck = `Fridge · ${pillsToCheck} ${pillsToCheck === 1 ? 'pill' : 'pills'} to check`;
  const thumb = (uri: string) => <Image source={{ uri }} style={{ width: 96, height: 72, borderRadius: 16, backgroundColor: t.c.bg.tileRaised }} contentFit="cover" accessibilityLabel="Your fridge photo, small" />;
  const privacy = (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 20, backgroundColor: t.c.bg.tile }}>
      <Icon name="shield" size={16} color={t.c.accent.mustard} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: t.c.fg.secondary }}>
        This photo goes to Claude only because you pressed the button, with the names of your Fridge pills. Claude doesn’t keep it, and it stays on your phone only until you close this. It shows in You › Agent › Brain › Sent to Claude.
      </Text>
    </View>
  );

  if (phase.at === 'ready') {
    const corner = (place: object) => <View style={[{ position: 'absolute', width: 36, height: 36, borderColor: t.c.accent.mustard }, place]} />;
    return (
      <Screen contentStyle={{ gap: 16 }}>
        {head(back, toCheck)}
        <View style={{ height: 470, borderRadius: 28, backgroundColor: t.c.bg.tile, borderWidth: 1, borderColor: t.c.line, alignItems: 'center', justifyContent: 'center', gap: 10, overflow: 'hidden' }}>
          {corner({ left: 24, top: 24, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 14 })}
          {corner({ right: 24, top: 24, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 14 })}
          {corner({ left: 24, bottom: 24, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 14 })}
          {corner({ right: 24, bottom: 24, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 14 })}
          <Icon name="fridge" size={36} color={t.c.fg.secondary} />
          <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.fg.secondary }}>Fit the shelves in the frame</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Take the photo" onPress={() => void snap()} style={({ pressed }) => ({ alignSelf: 'center', width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
          <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: t.c.accent.mustard }} />
        </Pressable>
        {privacy}
      </Screen>
    );
  }

  if (phase.at === 'reading')
    return (
      <Screen contentStyle={{ gap: 16 }}>
        {head(back, toCheck)}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {thumb(phase.uri)}
          <ActivityIndicator color={t.c.accent.mustard} />
          <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, color: t.c.fg.secondary }}>Claude is looking…</Text>
        </View>
        {privacy}
      </Screen>
    );

  if (phase.at === 'failed')
    return (
      <Screen contentStyle={{ gap: 16 }}>
        {head(() => close(), 'Fridge')}
        {phase.uri ? thumb(phase.uri) : null}
        <HomeEmpty icon="info" title="Nothing changed" line={phase.why}>
          <PillButton title="Try again" height={44} onPress={() => void snap()} />
        </HomeEmpty>
      </Screen>
    );

  const { diff } = phase;
  const none = !diff.missing.length && !diff.found.length;
  const count = diff.missing.length + diff.found.length;
  const seen = pillsToCheck - diff.missing.length;
  /** A row: the pill, then its two answers, or what you said and a way back. */
  const row = (key: string, pill: React.ReactNode, buttons: React.ReactNode, said: Record<Answer['done'], string>, undoIt: () => void) => {
    const done = answers[key]?.done;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48 }}>
        <View style={{ flexShrink: 1 }}>{pill}</View>
        <View style={{ flex: 1 }} />
        {done ? (
          <>
            <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary }}>{said[done]}</Text>
            <RowButton title="Undo" kind="text" onPress={undoIt} />
          </>
        ) : (
          buttons
        )}
      </View>
    );
  };
  return (
    <Screen contentStyle={{ gap: 14 }}>
      {head(() => close(diff), 'Fridge')}
      <Hairline />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {thumb(phase.uri)}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary }}>{none ? 'Matches Home' : `${count} ${count === 1 ? 'difference' : 'differences'}`}</Text>
          <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{`${seen} of ${pillsToCheck} pills seen · ${ctx.format.time(phase.when).toLowerCase()}`}</Text>
        </View>
      </View>
      {none ? <Text style={{ fontSize: 15, lineHeight: 20, color: t.c.fg.secondary }}>Everything on Home’s list is there, and nothing new.</Text> : null}
      {diff.missing.length ? (
        <>
          <SectionHead title="Not seen" sub="In your pills, not in the photo" />
          <Card pad={14} gap={8}>
            {diff.missing.map((m, i) => (
              <React.Fragment key={m.stockId}>
                {i ? <Hairline /> : null}
                {row(
                  m.stockId,
                  <View style={{ height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.18)', justifyContent: 'center' }}>
                    <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>{m.title}</Text>
                  </View>,
                  <>
                    <RowButton title="Used up" kind="lime" onPress={() => answer('missing', m.stockId, 'accepted', () => acceptMissing(ctx, m.stockId), `${m.title}: used up`)} />
                    <RowButton title="It’s there" onPress={() => answer('missing', m.stockId, 'fixed', () => fixMissing(ctx, m.stockId), `${m.title}: still there`)} />
                  </>,
                  { accepted: 'used up', fixed: 'still there' },
                  () => answer('missing', m.stockId, answers[m.stockId]!.done, () => null, `${m.title}: as it was`),
                )}
              </React.Fragment>
            ))}
          </Card>
        </>
      ) : null}
      {diff.found.length ? (
        <>
          <SectionHead title="Found" sub="In the photo, not in your pills" />
          <Card pad={14} gap={8}>
            {diff.found.map((name, i) => (
              <React.Fragment key={name}>
                {i ? <Hairline /> : null}
                {row(
                  name,
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.accent.mustard }}>
                    <Icon name="plus" size={14} color={t.c.accent.mustard} />
                    <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.accent.gold }}>{name}</Text>
                  </View>,
                  <>
                    <RowButton title="Add" kind="lime" onPress={() => answer('found', name, 'accepted', () => acceptFound(ctx, name, q.spaceId), `${name}: in the Fridge`)} />
                    <RowButton title="Fix" onPress={() => setFixing({ name, text: name })} />
                  </>,
                  { accepted: 'added', fixed: 'left out' },
                  () => answer('found', name, answers[name]!.done, () => null, `${name}: as it was`),
                )}
              </React.Fragment>
            ))}
          </Card>
        </>
      ) : null}
      {diff.dish ? (
        <Card gap={6}>
          <Eyebrow>Cook tonight</Eyebrow>
          <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: t.c.fg.primary }}>{diff.dish}</Text>
        </Card>
      ) : null}
      {count ? <Note>Fix opens the name and size, in case Claude read the label wrong. Nothing changes until you tap.</Note> : null}
      <PillButton title="All right" icon="check" height={52} style={{ marginTop: 4 }} onPress={() => close(diff)} />
      <PillButton title="Take another" icon="camera" raised onPress={() => void snap()} />

      <Sheet
        visible={!!fixing}
        onClose={() => setFixing(null)}
        title="Fix what Claude read"
        footer={
          <View style={{ gap: 8 }}>
            <PillButton
              title="Add this"
              height={52}
              disabled={!fixing?.text.trim()}
              onPress={() => {
                if (!fixing) return;
                const [thing] = parseStockLine(fixing.text);
                if (thing) answer('found', fixing.name, 'accepted', () => buy(ctx, { name: thing.name, size: thing.size, quantity: thing.quantity, spaceId: q.spaceId, source: 'you' }), `${thing.name}: in the Fridge`);
                setFixing(null);
              }}
            />
            <PillButton
              title="It’s not there"
              raised
              onPress={() => {
                if (fixing) answer('found', fixing.name, 'fixed', () => null, `${fixing.name}: left out`);
                setFixing(null);
              }}
            />
          </View>
        }
      >
        <TextInput
          value={fixing?.text ?? ''}
          onChangeText={(text) => setFixing((f) => (f ? { ...f, text } : f))}
          placeholder="Amul curd 400 g"
          placeholderTextColor={t.c.fg.tertiary}
          selectionColor={t.c.accent.mustard}
          autoFocus
          accessibilityLabel="Name and size"
          style={{ minHeight: 52, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1.5, borderColor: t.c.fg.primary, backgroundColor: t.c.bg.tileRaised, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 17 }}
        />
      </Sheet>
    </Screen>
  );
}
