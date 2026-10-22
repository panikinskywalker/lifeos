import { useId } from 'react';
import { Linking, Pressable, Share, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { ObjectRecord } from '@core/domain/types';
import { mapsLink, PLACE_KINDS, type PlaceData } from '@modules/places';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Text, type IconName } from '@ui/kit';

/**
 * The places kit, drawn from the v3 Noir canvas (NR-KitRecords · Place · card,
 * NR-KitTrips · Header · a place and Map with the route; sizes and colours
 * copied from the artboards). The "photo" is the canvas's gradient art (a
 * base gradient, soft colour blobs, a shade at the foot), coloured by kind.
 */

const INK = '#0B0B0D';
const WHITE = '#F5F5F7';

type Art = { base: [string, string, string]; blobs: [string, string, string] };
/** Warm: the Place · card artboard. Night: Pills on a photo. Teal and green from DESIGN.md's gradients. */
const ART: Record<string, Art> = {
  warm: { base: ['#5A2E1E', '#3A1C14', '#160B08'], blobs: ['#F5C87A', '#D9602E', '#F0A050'] },
  night: { base: ['#2A2446', '#1A1630', '#0C0A16'], blobs: ['#C9A7F5', '#8E6CF0', '#A9C4FF'] },
  teal: { base: ['#16414C', '#0E2A32', '#061316'], blobs: ['#2E7F94', '#5FB7C8', '#8AD3DD'] },
  green: { base: ['#1A3A22', '#102617', '#07120A'], blobs: ['#3BA35E', '#D7F55C', '#9FE0B5'] },
};
const ART_FOR_KIND: Record<string, keyof typeof ART> = { restaurant: 'warm', shop: 'warm', stay: 'warm', city: 'teal', country: 'teal', area: 'teal', airport: 'teal', venue: 'green', gym: 'green' };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The kind's short name for pills: "Restaurant" for "Restaurant / café / bar". */
export const kindLabel = (kind: string | undefined) => PLACE_KINDS.find((k) => k.value === kind)?.label.split(' / ')[0] ?? 'Place';
export const kindIcon = (kind: string | undefined) => (PLACE_KINDS.find((k) => k.value === kind)?.icon ?? 'location') as IconName;

/** The canvas's gradient "photo": 12 soft blobs over a three-stop base, a shade at the foot. Same seed, same picture. */
export function PhotoArt({ seed, kind, height, radius }: { seed: string; kind?: string; height: number; radius: number }) {
  const art = ART[ART_FOR_KIND[kind ?? ''] ?? 'night']!;
  let h = hash(seed);
  const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0), (h % 1000) / 1000);
  // Gradient ids are document-wide on web: one per drawing, or a second card of the same Place paints nothing.
  const id = `pa${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // The artboard's blobs: 43–149 px across, mostly in the lower two thirds of a 150 photo, 37–76 % opacity.
  const blobs = Array.from({ length: 12 }, (_, i) => ({ cx: -10 + rnd() * 100, cy: 18 + rnd() * 30, r: 7 + rnd() * 18, o: 0.37 + rnd() * 0.39, c: i % 3 }));
  return (
    <View style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden' }} pointerEvents="none">
      <Svg width="100%" height={height} viewBox="0 0 100 50" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={art.base[0]} />
            <Stop offset="0.55" stopColor={art.base[1]} />
            <Stop offset="1" stopColor={art.base[2]} />
          </LinearGradient>
          {art.blobs.map((c, i) => (
            <RadialGradient key={c} id={`${id}r${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={c} stopOpacity={1} />
              <Stop offset="0.55" stopColor={c} stopOpacity={0.55} />
              <Stop offset="1" stopColor={c} stopOpacity={0} />
            </RadialGradient>
          ))}
          <LinearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.4" stopColor="#000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000" stopOpacity={0.35} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="50" fill={`url(#${id}b)`} />
        {blobs.map((b, i) => (
          <Circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill={`url(#${id}r${b.c})`} opacity={b.o} />
        ))}
        <Rect x="0" y="0" width="100" height="50" fill={`url(#${id}s)`} />
      </Svg>
    </View>
  );
}

/** A pill over a photo: rgba(22,22,26,0.62), 1px 10% edge, 30 tall, icon 14 + 12/700. */
export function PhotoPill({ icon, iconColor = WHITE, label }: { icon: IconName; iconColor?: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 30, paddingHorizontal: 10, borderRadius: 999, backgroundColor: 'rgba(22,22,26,0.62)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignSelf: 'flex-start' }}>
      <Icon name={icon} size={14} color={iconColor} />
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700' }} color={WHITE}>
        {label}
      </Text>
    </View>
  );
}

/**
 * Place · card (NR-KitRecords ref 5): a 28 card, padding 12, gap 10; the
 * 150 photo (radius 22) with a pill top left; name 17/700 with a white pill
 * beside it; one 13/400 line under.
 */
export function PlaceCard({ place, badge, pill, line, onPress, style }: { place: ObjectRecord<PlaceData>; badge?: { icon: IconName; label: string; color?: string } | null; pill?: string | null; line?: string | null; onPress?: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const body = (
    <View style={[{ padding: 12, gap: 10, borderRadius: 28, backgroundColor: t.c.bg.tile }, style]}>
      <View style={{ height: 150, borderRadius: 22, overflow: 'hidden', padding: 12 }}>
        <PhotoArt seed={place.id} kind={place.data.kind} height={150} radius={22} />
        {badge ? <PhotoPill icon={badge.icon} iconColor={badge.color} label={badge.label} /> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', flexShrink: 1 }}>{place.title}</Text>
        {pill ? (
          <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.dark ? WHITE : t.c.fg.primary, justifyContent: 'center' }}>
            <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600' }} color={t.dark ? INK : t.c.bg.ground}>
              {pill}
            </Text>
          </View>
        ) : null}
      </View>
      {line ? (
        <Text variant="caption" color="secondary">
          {line}
        </Text>
      ) : null}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={place.title} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/**
 * Header · a place (NR-KitTrips ref 6): a 24 card, padding 10; a 40 lime
 * disc with the initial (14/700), the name 16/700 centred over where it is
 * (13/400), a 40 share button on raised.
 */
export function PlaceHeader({ title, sub, share }: { title: string; sub?: string | null; share?: string | null }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700' }} color={t.c.accent.mustardInk}>
          {title.trim().charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '700' }}>
          {title}
        </Text>
        {sub ? (
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {share ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Share ${title}`} onPress={() => void Share.share({ message: share })} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="share" size={17} color={t.c.fg.primary} />
        </Pressable>
      ) : (
        <View style={{ width: 40 }} />
      )}
    </View>
  );
}

/**
 * Map with the route (NR-KitTrips ref 1): a light 160 map (radius 28,
 * #E9ECEF) with faint roads, the route in orange from home to the pin, a
 * white distance pill top left and the place's name bottom left. Tap opens
 * it in your maps app. Drawn, not tiled: no network needed.
 */
export function PlaceMap({ place, km }: { place: ObjectRecord<PlaceData>; km?: number | null }) {
  const route = km != null;
  const pin = route ? { x: 219.8, y: 57.6 } : { x: 157, y: 72 };
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={`Open ${place.title} in Maps`} onPress={() => void Linking.openURL(mapsLink(place))} style={{ height: 160, borderRadius: 28, overflow: 'hidden', backgroundColor: '#E9ECEF' }}>
      <Svg width="100%" height={160} viewBox="0 0 314 160" preserveAspectRatio="xMidYMid slice">
        <Path d="M-10 99.2 C 94.2 80.0, 157.0 128.0, 324 88.0" fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={8} strokeLinecap="round" />
        <Path d="M109.9 -10 L 131.88 170" fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={6} strokeLinecap="round" />
        <Path d="M-10 40.0 L 324 48.0" fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={5} strokeLinecap="round" />
        <Path d="M219.8 -10 C 204.1 64.0, 266.9 96.0, 244.92 170" fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={5} strokeLinecap="round" />
        <Path d="M31.4 -10 L 62.8 170" fill="none" stroke="rgba(0,0,0,0.07)" strokeWidth={4} strokeLinecap="round" />
        {route ? (
          <>
            <Path d="M56.52 140.8 C 94.2 128.0, 100.48 80.0, 141.3 76.8 S 194.68 48.0, 219.8 57.6" fill="none" stroke="#F26B2B" strokeWidth={4} strokeLinecap="round" />
            <Circle cx={56.52} cy={140.8} r={7} fill={WHITE} stroke="#F26B2B" strokeWidth={3} />
          </>
        ) : null}
        <Circle cx={pin.x} cy={pin.y} r={14} fill="#F26B2B" opacity={0.25} />
        <Circle cx={pin.x} cy={pin.y} r={8} fill="#F26B2B" />
        <Circle cx={pin.x} cy={pin.y} r={3} fill={WHITE} />
      </Svg>
      {route ? (
        <View style={{ position: 'absolute', left: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: WHITE, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 6 }, elevation: 4 }}>
          <Icon name="home" size={14} color={INK} />
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700' }} color={INK}>
            {km! < 10 ? km!.toFixed(1) : Math.round(km!)}
          </Text>
          <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600' }} color="rgba(11,11,13,0.42)">
            km from home
          </Text>
        </View>
      ) : null}
      <View style={{ position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(11,11,13,0.72)' }}>
        <Icon name="location" size={14} color={WHITE} />
        <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600' }} color={WHITE}>
          {place.title}
        </Text>
      </View>
    </Pressable>
  );
}
