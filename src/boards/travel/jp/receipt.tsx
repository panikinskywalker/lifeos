import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { LifeOSContext } from '@core/registry/context';
import { askWithPhoto } from '@core/brain';
import type { Party } from '@core/money/split';
import { useToast } from '@ui/kit';
import { makeBill, parseReceipt, receiptQuestion, receiptShares, type ReceiptRead } from '@modules/finance';
import { rateFor, tripParties } from '@modules/travel';
import { Anim, JP_SANS } from './kit';
import { C, isJapan, money, tripRoutes } from './shell';
import { F, Face, faceColor, Ic, Label, today, useNames, useTrip } from '../money';
import { SheetFrame } from './spend';

/**
 * Split a receipt, drawn to JP-Receipt: a photo you take on purpose goes to
 * Claude (askWithPhoto with receiptQuestion), comes back as its lines
 * (parseReceipt), and you tap faces to say who had each; a line nobody tapped
 * is shared by all (receiptShares). Saved to Settle up as one Bill, split
 * exactly, with the lines kept as its notes and the photo as its receipt.
 */

const MAX_BASE64 = 4_500_000;

export function ReceiptScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const trip = useTrip(params.trip);
  const names = useNames(trip);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<ReceiptRead | null>(null);
  const [photo, setPhoto] = useState<{ uri: string; mime?: string } | null>(null);
  const [who, setWho] = useState<string[][]>([]);
  const [payer, setPayer] = useState<Party>('me');
  const close = () => (router.canGoBack() ? router.back() : trip ? router.replace(tripRoutes.money(trip.id, 'settle')) : router.replace(tripRoutes.travel));
  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.mid, fontSize: 15, fontFamily: F.s }}>That trip isn’t here any more.</Text>
      </View>
    );
  }
  const parties = tripParties(trip);
  const n = (p: Party) => names[p] ?? 'Someone';
  const pick = async (camera: boolean) => {
    setError(null);
    try {
      // The photo library needs no permission (Android's photo picker); only the camera asks.
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) return setError('LifeOS needs the camera for this. Allow it in Android’s settings.');
      }
      const r = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5, base64: true, exif: false }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.5, base64: true, exif: false });
      const a = r.canceled ? null : r.assets[0];
      if (!a?.base64) return;
      if (a.base64.length > MAX_BASE64) return setError('That photo is too big to send. Try again a little further back.');
      setPhoto({ uri: a.uri, mime: a.mimeType ?? undefined });
      setBusy(true);
      const model = (await ctx.device?.brain?.model()) ?? null;
      const res = await askWithPhoto(ctx, model, { ...receiptQuestion(parties.map(n)), image: { mediaType: a.mimeType === 'image/png' || a.mimeType === 'image/webp' ? a.mimeType : 'image/jpeg', data: a.base64 } });
      if (!res.ok) return setError(res.note === 'no key' || res.note === 'off' ? 'Reading a receipt needs the brain on, with a key (You › Agent).' : res.note === 'over budget' ? 'Over today’s brain budget; try tomorrow or raise it in You › Agent.' : `Couldn’t read that receipt${res.error ? ` (${res.error.slice(0, 160)})` : ''}. Try again, or log it by hand.`);
      const rr = parseReceipt(res.answer);
      if (!rr) return setError('That doesn’t look like a receipt.');
      setRead(rr);
      setWho(rr.items.map(() => []));
    } catch (e) {
      setError(`Couldn’t open the camera or your photos (${(e as Error).message?.slice(0, 120) ?? 'unknown'}).`);
    } finally {
      setBusy(false);
    }
  };
  const tap = (i: number, p: string) => setWho((w) => w.map((x, k) => (k !== i ? x : x.includes(p) ? x.filter((y) => y !== p) : [...x, p])));
  const shares = read ? receiptShares(read.items, who, parties) : {};
  const total = read ? read.items.reduce((s, i) => s + i.price, 0) : 0;
  const save = () => {
    if (!read) return;
    const rate = rateFor(trip, read.currency);
    const notes = read.items.map((it, i) => `${it.name}${it.en ? ` (${it.en})` : ''}${it.qty > 1 ? ` ×${it.qty}` : ''} · ${money(it.price, read.currency)} · ${(who[i]?.length ? who[i]! : parties).map(n).join(', ')}`).join('\n');
    const b = makeBill(ctx, read.shop ?? 'A receipt', { amount: total, currency: read.currency, rate: rate ?? undefined, date: today(), category: 'food', split: { payers: { [payer]: total }, method: 'exact', shares }, tripId: trip.id, groupId: trip.data.groupId, notes, receipt: photo ? { uri: photo.uri, name: read.shop, mime: photo.mime } : undefined });
    toast.show({ message: `${Object.keys(shares).length} shares saved to Settle up`, icon: 'check', undo: () => ctx.records.delete(b.id, 'user') });
    close();
  };
  const cyclePayer = () => setPayer(parties[(parties.indexOf(payer) + 1) % parties.length]!);
  return (
    <SheetFrame
      trip={trip}
      title="Split a receipt"
      onClose={close}
      right={
        <Pressable accessibilityRole="button" accessibilityLabel={read ? 'Pick another photo' : 'From your photos'} onPress={() => pick(false)} style={{ justifyContent: 'center', alignItems: 'center', width: 40, height: 40, backgroundColor: C.raised, borderRadius: 20 }}>
          <ImageIcon />
        </Pressable>
      }
    >
      <View style={{ height: 150, backgroundColor: '#3A332A', borderRadius: 24, overflow: 'hidden' }}>
        {photo ? (
          <Image source={{ uri: photo.uri }} resizeMode="cover" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0.85 }} />
        ) : (
          <View style={{ gap: 6, width: 150, height: 170, top: 16, alignSelf: 'center', padding: 12, position: 'absolute', backgroundColor: '#F6F1E7', borderRadius: 4, boxShadow: '0 10px 24px rgba(0,0,0,0.5)', transform: [{ rotate: '-4deg' }] }}>
            <Text style={{ color: C.ink, fontSize: 11, textAlign: 'center', fontFamily: isJapan(trip) ? JP_SANS : F.x, fontWeight: '900' }}>{isJapan(trip) ? 'レシート' : 'RECEIPT'}</Text>
            {[60, 44, 52, 38, 48, 30].map((w) => (
              <View key={w} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View style={{ width: `${w}%`, height: 4, marginTop: 3, backgroundColor: 'rgba(11,11,13,0.35)', borderRadius: 2 }} />
                <View style={{ width: '18%', height: 4, marginTop: 3, backgroundColor: 'rgba(11,11,13,0.5)', borderRadius: 2 }} />
              </View>
            ))}
          </View>
        )}
        <View style={{ bottom: 12, left: 12, right: 12, position: 'absolute', flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          {busy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 30, paddingHorizontal: 11, backgroundColor: 'rgba(11,11,13,0.66)', borderRadius: 999 }}>
              <ActivityIndicator size="small" color={C.lime} />
              <Text style={{ color: C.white, fontSize: 12, fontFamily: F.s }}>Reading the receipt…</Text>
            </View>
          ) : read ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 11, backgroundColor: 'rgba(11,11,13,0.66)', borderRadius: 999 }}>
              <Ic n="spark" size={13} />
              <Text style={{ color: C.white, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: F.s }}>{`Read ${read.items.length} ${read.items.length === 1 ? 'item' : 'items'} · ${money(total, read.currency)}`}</Text>
            </View>
          ) : (
            <>
              <Pressable accessibilityRole="button" onPress={() => pick(true)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 13, backgroundColor: C.lime, borderRadius: 999, opacity: pressed ? 0.85 : 1 })}>
                <CameraIcon />
                <Text style={{ color: C.ink, fontSize: 13, fontFamily: F.b }}>Take a photo</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => pick(false)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 13, backgroundColor: 'rgba(11,11,13,0.66)', borderRadius: 999, opacity: pressed ? 0.85 : 1 })}>
                <Text style={{ color: C.white, fontSize: 13, fontFamily: F.s }}>From photos</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {!read ? (
        <Text style={{ color: C.mid, fontSize: 13, lineHeight: 18, fontFamily: F.r }}>The photo goes to Claude only because you pressed this, and isn’t kept there. Its lines come back for you to tap who had each; a line nobody tapped is shared by all.</Text>
      ) : (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={`Paid by ${n(payer)}; tap to change`} onPress={cyclePayer} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Label>{`TAP FACES TO ASSIGN · PAID BY ${n(payer).toUpperCase()}`}</Label>
          </Pressable>
          <View>
            {read.items.map((it, i) => (
              <Anim key={i} k="jr" delay={i * 50} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, borderTopWidth: 1, borderTopColor: C.line }}>
                <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: C.white, fontSize: 14, fontFamily: F.s }}>{`${it.en ?? it.name}${it.qty > 1 ? ` ×${it.qty}` : ''}`}</Text>
                  <Text numberOfLines={1} style={{ color: C.mid, fontSize: 12, fontVariant: ['tabular-nums'], fontFamily: F.r }}>{[money(it.price, read.currency), (who[i]?.length ?? 0) > 1 ? `${money(it.price / who[i]!.length, read.currency)} each` : null, it.en ? it.name : null].filter(Boolean).join(' · ')}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  {parties.map((p) => {
                    const on = who[i]?.includes(p);
                    return (
                      <Pressable key={p} accessibilityRole="checkbox" accessibilityState={{ checked: !!on }} accessibilityLabel={`${n(p)} had ${it.en ?? it.name}`} onPress={() => tap(i, p)} hitSlop={2} style={{ justifyContent: 'center', alignItems: 'center', width: 30, height: 30, backgroundColor: on ? faceColor(parties, p) : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: 'rgba(245,245,247,0.25)', borderStyle: 'dashed', borderRadius: 15 }}>
                        <Text style={{ color: on ? C.ink : MUTED, fontSize: 11, fontFamily: F.x }}>{n(p).slice(0, 1).toUpperCase()}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Anim>
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {parties.map((p) => (
              <View key={p} style={{ flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1, flexBasis: parties.length > 3 ? '30%' : 0, gap: 8, minWidth: 0, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: C.raised, borderRadius: 16 }}>
                <Face name={n(p)} color={faceColor(parties, p)} size={26} font={9} />
                <View style={{ minWidth: 0, flexShrink: 1 }}>
                  <Text numberOfLines={1} style={{ color: C.white, fontSize: 12, fontFamily: F.s }}>{n(p)}</Text>
                  <Text numberOfLines={1} style={{ color: C.white, fontSize: 13, fontVariant: ['tabular-nums'], fontFamily: F.b }}>{money(shares[p] ?? 0, read.currency)}</Text>
                </View>
              </View>
            ))}
          </View>
          <Pressable accessibilityRole="button" onPress={save} style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, height: 52, backgroundColor: C.lime, borderRadius: 999, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <Ic n="check" size={17} color={C.ink} />
            <Text style={{ color: C.ink, fontSize: 16, lineHeight: 20, fontFamily: F.s }}>{`Save · ${Object.keys(shares).length} ${Object.keys(shares).length === 1 ? 'share' : 'shares'} to Settle up`}</Text>
          </Pressable>
        </>
      )}
      {error ? <Text style={{ color: C.coral, fontSize: 13, textAlign: 'center', fontFamily: F.s }}>{error}</Text> : null}
    </SheetFrame>
  );
}

const MUTED = 'rgba(245,245,247,0.42)';

const ImageIcon = () => (
  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Rect width={18} height={18} x={3} y={3} rx={2} ry={2} />
    <Circle cx={9} cy={9} r={2} />
    <Path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </Svg>
);
const CameraIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <Circle cx={12} cy={13} r={3} />
  </Svg>
);
