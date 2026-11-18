import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { askWithPhoto, mediaTypeOf } from '@core/brain';
import { STATEMENT_MODEL } from '@core/ai/brainModel';
import type { BrainImage } from '@core/brain/model';
import { useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Sheet, Text, useToast } from '@ui/kit';
import { photoForClaude } from '@ui/photo';
import { proposeChanges, readStatement, statementAsk, type Proposal } from '@modules/finance/statementRead';

type Phase = { at: 'pick' } | { at: 'reading' } | { at: 'review'; proposals: Proposal[]; on: Record<string, boolean>; pick: Record<string, string> } | { at: 'failed'; why: string };

/** About 9 MB of base64: a long PDF statement still fits one request. */
const MAX_BASE64 = 9_000_000;
/** The API takes an image of at most 5 MB. */
const MAX_IMAGE_BASE64 = 6_900_000;

const WHY: Record<string, string> = {
  'no key': 'Reading a statement needs your Claude key in You › Agent › Brain.',
  'over budget': 'Today’s budget for Claude is used up. Try again tomorrow, or raise it in You › Agent › Brain.',
  off: 'The brain is off in You › Agent › Brain, so statements can’t be read.',
  error: 'Claude couldn’t read that. Try a clearer screenshot or the PDF.',
};

/**
 * Upload a statement (docs/MODEL.md, Upload a statement): a PDF or a screenshot
 * of a bank or card statement, or a fund or broker summary. Claude reads it once
 * because you pressed the button; the phone matches what was read to your
 * accounts and holdings and lists each change, ticked. Apply does the ticked
 * ones, with Undo for all of them.
 */
export function UploadSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ at: 'pick' });
  // Each opening starts fresh: a reading left from before (the app went away mid-way) never waits behind its Apply (17 Nov).
  useEffect(() => {
    if (visible) setPhase({ at: 'pick' });
  }, [visible]);
  const close = () => {
    setPhase({ at: 'pick' });
    onClose();
  };

  const read = async (file: { uri: string; mimeType?: string | null; base64?: string | null }) => {
    setPhase({ at: 'reading' });
    let data = file.base64 ?? null;
    try {
      data ??= await new File(file.uri).base64();
    } catch {
      return setPhase({ at: 'failed', why: 'LifeOS couldn’t open that file.' });
    }
    // The type comes from the file's own first bytes: a picker can say PNG for a screenshot it has turned into JPEG.
    const mediaType = mediaTypeOf(data) ?? (file.mimeType === 'application/pdf' ? 'application/pdf' : 'image/jpeg');
    const limit = mediaType === 'application/pdf' ? MAX_BASE64 : MAX_IMAGE_BASE64;
    if (data.length > limit) return setPhase({ at: 'failed', why: mediaType === 'application/pdf' ? 'That PDF is too big to send. Try the statement for one month.' : 'That image is too big to send. Crop it to the part with the balances, or take a smaller screenshot.' });
    const model = (await os.device?.brain?.model(STATEMENT_MODEL)) ?? null;
    const res = await askWithPhoto(os, model, { ...statementAsk(), image: { mediaType, data } });
    if (!res.ok) return setPhase({ at: 'failed', why: `${WHY[res.note] ?? WHY.error!}${res.note === 'error' && res.error ? ` (${res.error.slice(0, 160)})` : ''}` });
    const proposals = proposeChanges(os, readStatement(res.answer));
    if (!proposals.length) {
      // Say what was read, so a screen with only returns or percentages is told apart from one Claude could not read.
      const raw = (res.answer ?? {}) as { accounts?: unknown[]; holdings?: unknown[]; subscriptions?: unknown[] };
      const n = (x?: unknown[]) => (Array.isArray(x) ? x.length : 0);
      const seen = [[n(raw.accounts), 'account'], [n(raw.holdings), 'fund'], [n(raw.subscriptions), 'subscription']].filter(([c]) => (c as number) > 0).map(([c, w]) => `${c} ${w}${c === 1 ? '' : 's'}`);
      return setPhase({ at: 'failed', why: seen.length ? `Claude read ${seen.join(', ')}, but none had a rupee figure to update (a value, an amount invested, a SIP or a balance). Try the screen that shows current values or the SIP amounts.` : 'Claude found no balance, card bill, fund, SIP or subscription in that. Try the holdings or SIPs screen of your fund app, or the CAMS / KFintech statement PDF.' });
    }
    // One that could be several accounts waits, unticked, until you pick which.
    setPhase({ at: 'review', proposals, on: Object.fromEntries(proposals.map((p) => [p.id, !p.choices])), pick: {} });
  };
  const fromFiles = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
    const a = r.canceled ? null : r.assets[0];
    if (a) await read({ uri: a.uri, mimeType: a.mimeType });
  };
  const fromPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setPhase({ at: 'failed', why: 'LifeOS needs your photos for this. Allow it in Android’s settings.' });
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6, base64: true, exif: false });
    const a = r.canceled ? null : r.assets[0];
    if (!a) return;
    // A long screenshot can be over Claude's 8,000 px limit: shrunk first (src/ui/photo.ts).
    const shrunk = await photoForClaude(a).catch(() => null);
    if (!shrunk) return setPhase({ at: 'failed', why: 'Couldn’t make that screenshot small enough to send. Try another.' });
    await read({ uri: a.uri, mimeType: shrunk.mimeType, base64: shrunk.base64 });
  };
  const apply = () => {
    if (phase.at !== 'review') return;
    const chosen = phase.proposals.filter((p) => phase.on[p.id]);
    const undos = chosen.map((p) => p.apply(phase.pick[p.id]));
    toast.show({ message: `Updated ${chosen.length} thing${chosen.length === 1 ? '' : 's'} from the statement`, icon: 'check', undo: () => undos.forEach((u) => u()) });
    close();
  };

  const option = (label: string, sub: string, icon: string, onPress: () => void, lime?: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 24, backgroundColor: lime ? t.c.accent.mustard : t.c.bg.tileRaised, opacity: pressed ? 0.85 : 1 })}>
      <Icon name={icon} size={22} color={lime ? t.c.accent.mustardInk : t.c.fg.primary} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: lime ? t.c.accent.mustardInk : t.c.fg.primary }}>{label}</Text>
        <Text style={{ fontSize: 13, lineHeight: 17, color: lime ? 'rgba(11,11,13,0.7)' : t.c.fg.secondary }}>{sub}</Text>
      </View>
    </Pressable>
  );

  return (
    <Sheet visible={visible} onClose={close} title="Upload a statement">
      {phase.at === 'pick' ? (
        <View style={{ gap: 12 }}>
          {option('A PDF or file', 'a bank, card or loan statement, or the CAMS / KFintech CAS for all your funds', 'file', () => void fromFiles(), true)}
          {option('A screenshot', 'your bank or card app, a fund app’s holdings or SIPs screen, or your subscriptions', 'image', () => void fromPhotos())}
          <Text color="secondary" style={{ fontSize: 12, lineHeight: 17 }}>It goes to Claude once, to be read, because you pressed the button. You see every change before anything is updated.</Text>
        </View>
      ) : null}
      {phase.at === 'reading' ? (
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
          <ActivityIndicator color={t.c.accent.mustard} />
          <Text color="secondary">Reading it…</Text>
        </View>
      ) : null}
      {phase.at === 'failed' ? (
        <View style={{ gap: 14 }}>
          <Text style={{ fontSize: 15, lineHeight: 21 }}>{phase.why}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={() => setPhase({ at: 'pick' })} style={{ height: 48, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700' }}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
      {phase.at === 'review' ? (
        <View style={{ gap: 12 }}>
          <Text color="secondary" style={{ fontSize: 13, lineHeight: 18 }}>{`What the statement says. Untick anything that's wrong.`}</Text>
          {phase.proposals.map((p) => {
            const on = phase.on[p.id];
            const waiting = !!p.choices && !phase.pick[p.id];
            return (
              <View key={p.id} style={{ padding: 14, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, gap: 10 }}>
                <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: waiting }} disabled={waiting} accessibilityLabel={`${p.label}, ${p.detail}`} onPress={() => setPhase({ ...phase, on: { ...phase.on, [p.id]: !on } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.c.accent.mustard : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: t.c.fg.secondary, opacity: waiting ? 0.4 : 1 }}>
                    {on ? <Icon name="check" size={15} color={t.c.accent.mustardInk} /> : null}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: '600' }}>{p.label}</Text>
                    <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{p.detail}</Text>
                  </View>
                </Pressable>
                {p.choices ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 38 }}>
                    {p.choices.map((c) => {
                      const picked = phase.pick[p.id] === c.id;
                      return (
                        <Pressable key={c.id} accessibilityRole="radio" accessibilityState={{ selected: picked }} accessibilityLabel={c.label} onPress={() => setPhase({ ...phase, pick: { ...phase.pick, [p.id]: c.id }, on: { ...phase.on, [p.id]: true } })} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: picked ? t.c.accent.mustard : t.c.bg.tile }}>
                          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: picked ? t.c.accent.mustardInk : t.c.fg.primary }}>{c.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            );
          })}
          <Pressable accessibilityRole="button" accessibilityLabel="Apply" disabled={!Object.values(phase.on).some(Boolean)} onPress={apply} style={({ pressed }) => ({ height: 52, borderRadius: 999, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center', opacity: pressed || !Object.values(phase.on).some(Boolean) ? 0.6 : 1 })}>
            <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', color: t.c.accent.mustardInk }}>{`Apply ${Object.values(phase.on).filter(Boolean).length}`}</Text>
          </Pressable>
        </View>
      ) : null}
    </Sheet>
  );
}
