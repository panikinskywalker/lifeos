import React from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { gradients } from '@ui/theme/tokens';
import { Icon, Text } from '@ui/kit';
import { peopleToCall, type PersonData } from '@modules/crm';
import { faceColor, FaceStack, initials } from './parts';

/**
 * People on Today (NR-People-Tile): small (2 × 2) or wide (4 × 2). "3 to
 * call", the most overdue with a lime-ringed face, and in the wide one the
 * faces to call and a birthday today. Both open the People home. The pink
 * dot is People's colour from Browse.
 */

const DAY = 86_400_000;
const INK = '#0B0B0D';
const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** A 28 face (10/700 initial), ringed lime on the tile when due. */
function Face28({ id, name, photo, ring, ground }: { id: string; name: string; photo?: string | null; ring?: boolean; ground: string }) {
  const t = useTheme();
  const face = (
    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: faceColor(id), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {photo ? <Image source={{ uri: photo }} style={{ width: 28, height: 28 }} contentFit="cover" /> : <Text style={{ fontSize: 10, lineHeight: 13, fontWeight: '700', color: INK }}>{initials(name, 1)}</Text>}
    </View>
  );
  return ring ? <View style={{ margin: -4, padding: 2, borderRadius: 18, borderWidth: 2, borderColor: t.c.accent.mustard, backgroundColor: ground }}>{face}</View> : face;
}

export function PeopleTodayTile({ wide }: { wide?: boolean } = {}) {
  const t = useTheme();
  const router = useRouter();
  const d = useLive((os) => {
    if (!os.registry.objects.has('person')) return null;
    const now = Date.now();
    const due = peopleToCall(os, { withinDays: 7, birthdayDays: 7, limit: 100 }, now);
    const photo = (id: string) => os.records.get<PersonData>(id)?.data.photo?.uri ?? null;
    const calls = due.filter((c) => c.reason === 'keep in touch').map((c) => ({ id: c.id, name: c.name, days: Math.round((c.dueAt - now) / DAY), photo: photo(c.id) }));
    const b = due.find((c) => c.reason === 'birthday');
    const bday = b ? { name: b.name, days: Math.max(0, Math.round((b.dueAt - now) / DAY)) } : null;
    return { calls, bday };
  }, []);
  if (!d) return null;

  const top = d.calls[0];
  const topLine = top ? `${first(top.name)} · ${top.days < 0 ? `${-top.days} d overdue` : top.days === 0 ? 'due today' : `in ${top.days} d`}` : d.bday ? null : 'No one overdue';
  const topColor = top ? (top.days < 0 ? t.c.alert.coralText : top.days === 0 ? t.c.accent.mustard : t.c.fg.secondary) : t.c.fg.secondary;
  const bdayLine = d.bday ? `${first(d.bday.name)} · ${d.bday.days === 0 ? 'today' : `in ${d.bday.days} d`}` : null;
  const headline = d.calls.length ? `${d.calls.length} to call` : 'All caught up';
  const ground = t.c.bg.tile;

  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.secondary }}>PEOPLE</Text>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: gradients.people[0] }} />
    </View>
  );
  const title = (
    <Text numberOfLines={wide ? 1 : 2} adjustsFontSizeToFit minimumFontScale={0.7} style={{ fontSize: 30, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary, flexShrink: 1 }}>
      {headline}
    </Text>
  );
  const topRow = top ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: wide ? 10 : 8, flex: wide ? 1 : undefined, minWidth: 0 }}>
      <Face28 id={top.id} name={top.name} photo={top.photo} ring={top.days <= 0} ground={ground} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: wide ? 13 : 12, lineHeight: wide ? 17 : 15, fontWeight: '600', color: topColor }}>{topLine}</Text>
    </View>
  ) : topLine ? (
    <Text numberOfLines={1} style={{ flex: wide ? 1 : undefined, fontSize: wide ? 13 : 12, lineHeight: wide ? 17 : 15, fontWeight: '600', color: topColor }}>{topLine}</Text>
  ) : null;
  const bdayTag = bdayLine ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
      <Icon name="cake" size={14} color={t.c.fg.secondary} />
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', color: t.c.fg.secondary }}>{bdayLine}</Text>
    </View>
  ) : null;

  const label = [`People, ${headline}`, topLine, bdayLine ? `birthday ${bdayLine}` : null].filter(Boolean).join(', ');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => router.push('/module/crm/index' as never)}
      style={({ pressed }) => [{ padding: 16, borderRadius: 24, backgroundColor: ground, justifyContent: 'space-between', opacity: pressed ? 0.9 : 1 }, wide ? { minHeight: 167 } : { flex: 1, aspectRatio: 1 }]}
    >
      {head}
      {wide ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            {title}
            {d.calls.length ? <FaceStack people={d.calls.map((c) => ({ id: c.id, name: c.name, photo: c.photo }))} size={32} ground={ground} max={3} /> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {topRow ?? <View style={{ flex: 1 }} />}
            {bdayTag}
          </View>
        </>
      ) : (
        <>
          {title}
          {topRow ?? bdayTag}
        </>
      )}
    </Pressable>
  );
}
