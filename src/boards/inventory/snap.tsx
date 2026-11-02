import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { File } from 'expo-file-system';
import type { LifeOSContext } from '@core/registry/context';
import { askWithPhoto } from '@core/brain';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Icon, Screen, Text, useToast } from '@ui/kit';
import { acceptFound, acceptMissing, fixMissing, fridgeDiff, fridgeQuestion, keepFridgeDish, undoFridge, type FridgeDiff, type StockUndo } from '@modules/inventory';
import { Card, HomeEmpty, PillCloud, PlainPill, SectionHead } from './parts';

/**
 * Snap the fridge (HOME-BRIEF screen 5; docs/MODEL.md layer 8, *Slices 4 and
 * 6*; a first pass from the kit until NR-Home-Snap). The camera, then the
 * photo small at the top and the differences as pills: tap to accept (not
 * seen: used up · found: into the Fridge), hold to fix (still there · not
 * there). All right keeps the dish for Cook tonight and closes. The photo
 * goes to Claude only because you pressed the button; LifeOS never saves it,
 * and the camera's file is deleted when you leave (or take another).
 */

type Phase = { at: 'ready' } | { at: 'reading'; uri: string } | { at: 'result'; uri: string; diff: FridgeDiff } | { at: 'failed'; uri?: string; why: string };
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
    setPhase({ at: 'result', uri: a.uri, diff: fridgeDiff(ctx, q.spaceId, res.answer) });
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

  const preview = (uri: string) => <Image source={{ uri }} style={{ width: '100%', height: 160, borderRadius: 20, backgroundColor: t.c.bg.tile }} contentFit="cover" accessibilityLabel="Your photo of the fridge" />;
  const privacy = (
    <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Icon name="lock" size={16} color={t.c.fg.tertiary} />
      <Text style={{ flex: 1, fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>
        The photo goes to Claude only because you pressed the button, with the names of what’s in the Fridge. It’s read once and not kept: not by LifeOS, not in the log. You › Agent › Brain › Sent to Claude shows it left.
      </Text>
    </View>
  );

  if (phase.at === 'ready')
    return (
      <Screen title="Snap the fridge" subtitle={`${(q.ask.record.in_the_fridge as string[]).length} things on Home’s list`} onBack={back} contentStyle={{ gap: 18 }}>
        <Card gap={12}>
          <Icon name="camera" size={28} color={t.c.accent.mustard} />
          <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: t.c.fg.primary }}>Open the fridge, take one photo</Text>
          <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>Claude compares it with the pills: what it can’t see, what’s new. You decide each one.</Text>
          <Button title="Open the camera" icon="camera" onPress={() => void snap()} />
        </Card>
        {privacy}
      </Screen>
    );

  if (phase.at === 'reading')
    return (
      <Screen title="Snap the fridge" onBack={back} contentStyle={{ gap: 18 }}>
        {preview(phase.uri)}
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <ActivityIndicator color={t.c.accent.mustard} />
          <Text style={{ fontSize: 15, lineHeight: 20, color: t.c.fg.secondary }}>Claude is looking…</Text>
        </View>
        {privacy}
      </Screen>
    );

  if (phase.at === 'failed')
    return (
      <Screen title="Snap the fridge" onBack={() => close()} contentStyle={{ gap: 18 }}>
        {phase.uri ? preview(phase.uri) : null}
        <HomeEmpty icon="info" title="Nothing changed" line={phase.why}>
          <Button title="Try again" size="sm" onPress={() => void snap()} />
        </HomeEmpty>
      </Screen>
    );

  const { diff } = phase;
  const state = (key: string) => answers[key]?.done;
  const sub = (key: string, accepted: string, fixed: string) => (state(key) === 'accepted' ? accepted : state(key) === 'fixed' ? fixed : null);
  const none = !diff.missing.length && !diff.found.length;
  return (
    <Screen title="Snap the fridge" subtitle={none ? 'Matches Home' : `${diff.missing.length + diff.found.length} differences`} onBack={() => close(diff)} contentStyle={{ gap: 18 }}>
      {preview(phase.uri)}
      {none ? <Text style={{ fontSize: 15, lineHeight: 20, color: t.c.fg.secondary }}>Everything on Home’s list is there, and nothing new.</Text> : null}
      {diff.missing.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Not seen" sub="Tap: used up · hold: still there" />
          <PillCloud>
            {diff.missing.map((m) => (
              <PlainPill
                key={m.stockId}
                title={m.title}
                sub={sub(m.stockId, 'used up', 'still there')}
                suggested={!state(m.stockId)}
                onPress={() => answer('missing', m.stockId, 'accepted', () => acceptMissing(ctx, m.stockId), `${m.title}: used up`)}
                onLongPress={() => answer('missing', m.stockId, 'fixed', () => fixMissing(ctx, m.stockId), `${m.title}: still there`)}
              />
            ))}
          </PillCloud>
        </View>
      ) : null}
      {diff.found.length ? (
        <View style={{ gap: 10 }}>
          <SectionHead title="Found" sub="Tap: add to the Fridge · hold: not there" />
          <PillCloud>
            {diff.found.map((name) => (
              <PlainPill
                key={name}
                title={name}
                sub={sub(name, 'added', 'not there')}
                suggested={!state(name)}
                onPress={() => answer('found', name, 'accepted', () => acceptFound(ctx, name, q.spaceId), `${name}: in the Fridge`)}
                onLongPress={() => answer('found', name, 'fixed', () => null, `${name}: left out`)}
              />
            ))}
          </PillCloud>
        </View>
      ) : null}
      {diff.dish ? (
        <Card gap={6}>
          <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.tertiary }}>COOK TONIGHT</Text>
          <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', color: t.c.fg.primary }}>{diff.dish}</Text>
        </Card>
      ) : null}
      <Button title="All right" icon="check" onPress={() => close(diff)} />
      <Button title="Take another" icon="camera" variant="secondary" size="sm" onPress={() => void snap()} />
      {privacy}
    </Screen>
  );
}
