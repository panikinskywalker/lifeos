import React, { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { askWithPhoto } from '@core/brain';
import { PHOTO_MODEL } from '@core/ai/brainModel';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { Icon, IconButton, Sheet, Text, useToast } from '@ui/kit';
import { billAsk, readBill, readSaid, saveQuick, type QuickPayment } from '@modules/finance/quickAdd';
import { categoryOf, type AccountData } from '@modules/finance/types';
import { catColor } from './parts';

type Phase = { at: 'pick' } | { at: 'reading' } | { at: 'review'; p: QuickPayment; account: string | 'cash' | null } | { at: 'failed'; why: string };

const MAX_BASE64 = 6_900_000;
const WHY: Record<string, string> = {
  'no key': 'Reading a bill needs your Claude key in You › Agent › Brain.',
  'over budget': 'Today’s budget for Claude is used up. Type it instead, or try tomorrow.',
  off: 'The brain is off in You › Agent › Brain, so bills can’t be read. Type it instead.',
  error: 'Claude couldn’t read that bill. Try again, or type it.',
};
const INK = '#0B0B0D';

const dropFile = (uri: string) => {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // The web build, or a file the picker already cleaned up.
  }
};

/**
 * The + in Money (docs/MODEL.md, Add a payment): snap or attach a bill, type
 * it, or say it ("₹640 at Shree Sagar, paid in cash"); then what was read,
 * Paid with (Cash, an account or card, or someone else paid) and Save, with
 * Undo. A bill's photo goes to Claude only because you pressed the button, and
 * is deleted from the phone once read.
 */
export function AddSheet({ visible, onClose, onUpload }: { visible: boolean; onClose: () => void; /** Opens Upload a statement (balances, card bills and funds from a PDF or screenshot). */ onUpload?: () => void }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>({ at: 'pick' });
  const [said, setSaid] = useState('');
  const accounts = useLive((o) => o.records.query<AccountData>('account', {}, { limit: 50 }).filter((a) => a.data.kind !== 'investment' && a.data.kind !== 'loan'), []);
  const close = () => {
    setPhase({ at: 'pick' });
    setSaid('');
    onClose();
  };
  const accountFor = (p: QuickPayment): string | 'cash' | null => {
    if (p.paidWith === 'cash') return 'cash';
    if (p.paidWith === 'upi') return accounts.find((a) => a.data.kind === 'bank')?.id ?? null;
    if (p.paidWith === 'card') return accounts.find((a) => a.data.kind === 'credit')?.id ?? null;
    return null;
  };
  const fromSaid = () => {
    const p = readSaid(os, said);
    if (!p) return setPhase({ at: 'failed', why: 'I couldn’t find an amount in that. Try “₹640 at Shree Sagar, paid in cash”.' });
    setPhase({ at: 'review', p, account: accountFor(p) });
  };
  const fromPhoto = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return setPhase({ at: 'failed', why: camera ? 'LifeOS needs the camera for this. Allow it in Android’s settings.' : 'LifeOS needs your photos for this. Allow it in Android’s settings.' });
    const r = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5, base64: true, exif: false }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true, exif: false });
    const a = r.canceled ? null : r.assets[0];
    if (!a?.base64) return;
    if (a.base64.length > MAX_BASE64) {
      if (camera) dropFile(a.uri);
      return setPhase({ at: 'failed', why: 'That photo is too big to send. Try a closer one.' });
    }
    setPhase({ at: 'reading' });
    const model = (await os.device?.brain?.model(PHOTO_MODEL)) ?? null;
    const mediaType = a.mimeType === 'image/png' || a.mimeType === 'image/webp' ? a.mimeType : 'image/jpeg';
    const res = await askWithPhoto(os, model, { ...billAsk(), image: { mediaType, data: a.base64 } });
    if (camera) dropFile(a.uri);
    if (!res.ok) return setPhase({ at: 'failed', why: WHY[res.note] ?? WHY.error! });
    const p = readBill(os, res.answer);
    if (!p) return setPhase({ at: 'failed', why: 'That doesn’t look like a bill. Try again, or type it.' });
    setPhase({ at: 'review', p, account: null });
  };
  const save = () => {
    if (phase.at !== 'review') return;
    const { id, undo } = saveQuick(os, phase.p, phase.account);
    const split = phase.p.splitWith;
    toast.show({ message: `Saved · ${os.format.currency(phase.p.amount)}${phase.p.payee ? ` at ${phase.p.payee}` : ''}`, icon: 'check', undo });
    close();
    // Who shares it is set on its page, where Split is.
    if (split.length) router.push(`/entity/transaction/${id}` as never);
  };

  const big = (label: string, icon: string, onPress: () => void, lime?: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flex: 1, height: 96, borderRadius: 24, backgroundColor: lime ? t.c.accent.mustard : t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.85 : 1 })}>
      <Icon name={icon} size={24} color={lime ? t.c.accent.mustardInk : t.c.fg.primary} />
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: lime ? '700' : '600', color: lime ? t.c.accent.mustardInk : t.c.fg.primary }}>{label}</Text>
    </Pressable>
  );

  return (
    <Sheet visible={visible} onClose={close} title="Add a payment">
      {phase.at === 'pick' ? (
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {big('Snap a bill', 'camera', () => void fromPhoto(true), true)}
            {big('Attach', 'paperclip', () => void fromPhoto(false))}
            {big('Type it', 'edit', () => { close(); router.push('/entity/transaction/new' as never); })}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingLeft: 18, paddingRight: 6, borderRadius: 999, backgroundColor: t.c.bg.ground, borderWidth: 1, borderColor: t.c.line }}>
            <TextInput accessibilityLabel="Say it in words" value={said} onChangeText={setSaid} onSubmitEditing={fromSaid} returnKeyType="done" placeholder="₹640 at Shree Sagar, paid in cash" placeholderTextColor={t.c.fg.secondary} style={{ flex: 1, minWidth: 0, color: t.c.fg.primary, fontSize: 15 }} />
            <IconButton icon="arrow-up" accessibilityLabel="Read it" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} disabled={!said.trim()} onPress={fromSaid} />
          </View>
          {onUpload ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Upload a statement instead" onPress={() => { close(); onUpload(); }} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.line, opacity: pressed ? 0.8 : 1 })}>
              <Icon name="file" size={18} color={t.c.accent.gold} />
              <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '600' }}>Upload a statement: balances, card bills and funds</Text>
            </Pressable>
          ) : null}
          <Text color="secondary" style={{ fontSize: 12, lineHeight: 17 }}>A bill you snap goes to Claude once, to be read, because you pressed the button. The photo is then deleted from the phone.</Text>
        </View>
      ) : null}

      {phase.at === 'reading' ? (
        <View style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
          <ActivityIndicator color={t.c.accent.mustard} />
          <Text color="secondary">Reading the bill…</Text>
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
        <View style={{ gap: 16 }}>
          <View style={{ padding: 18, borderRadius: 28, backgroundColor: blocks.orange, gap: 8 }}>
            <TextInput accessibilityLabel="Paid to" value={phase.p.payee} onChangeText={(v) => setPhase({ ...phase, p: { ...phase.p, payee: v } })} placeholder="Paid to" placeholderTextColor="rgba(11,11,13,0.5)" style={{ fontSize: 15, fontWeight: '700', color: INK, padding: 0 }} />
            <Text style={{ fontSize: 44, lineHeight: 48, fontWeight: '700', letterSpacing: -1.6, color: INK, fontVariant: ['tabular-nums'] }}>{`−${os.format.currency(phase.p.amount)}`}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: INK }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catColor(phase.p.category, t) }} />
                <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#F5F5F7' }}>{categoryOf(phase.p.category).label}</Text>
              </View>
              <Text style={{ fontSize: 13, lineHeight: 17, color: 'rgba(11,11,13,0.7)' }}>{phase.p.date}</Text>
            </View>
            {phase.p.items.length ? <Text style={{ fontSize: 13, lineHeight: 18, color: 'rgba(11,11,13,0.75)' }}>{[phase.p.items.join(', '), phase.p.tax ? `tax ${os.format.currency(phase.p.tax)}` : ''].filter(Boolean).join(' · ')}</Text> : null}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600' }}>Paid with</Text>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[{ id: 'cash' as const, label: 'Cash' }, ...accounts.filter((a) => a.data.kind !== 'cash').map((a) => ({ id: a.id, label: a.title })), { id: null, label: 'Someone else paid' }].map((o) => {
                const on = phase.account === o.id;
                return (
                  <Pressable key={o.id ?? 'someone'} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={o.label} onPress={() => setPhase({ ...phase, account: o.id })} style={{ height: 44, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? t.c.accent.mustard : t.c.bg.tileRaised }}>
                    <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: on ? '700' : '600', color: on ? t.c.accent.mustardInk : t.c.fg.primary }}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {phase.p.splitWith.length ? <Text color="secondary" style={{ fontSize: 13, lineHeight: 18 }}>{`Shared with ${phase.p.splitWith.join(', ')}: its page opens after saving, to split it.`}</Text> : null}
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Save" onPress={save} style={({ pressed }) => ({ height: 52, borderRadius: 999, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', color: t.c.accent.mustardInk }}>Save</Text>
          </Pressable>
        </View>
      ) : null}
    </Sheet>
  );
}
