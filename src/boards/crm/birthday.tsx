import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { Icon, Text } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { birthdayParts, giftIdeasKey, listItems, wishKey, type PersonData } from '@modules/crm';
import { Face, faceColor, initials } from './parts';

/**
 * Birthdays (NR-People-Parts · BIRTHDAY A, B, C): the card on the day, the
 * coming-up row, and the wish. Gift ideas and the drafted wish come from the
 * brain (MODEL layer 8, not built): until then they are slots that show the
 * person's Likes as the source, an empty wish box and the send buttons.
 */

const INK = '#0B0B0D';
const LIME = blocks.lime;
const LIME_SOFT = 'rgba(215,245,92,0.16)';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const firstName = (title: string) => title.trim().split(/\s+/)[0] ?? title;
const digits = (phone: string | undefined) => (phone ?? '').replace(/\D/g, '');

/**
 * Days to the next birthday (0 on the day) and the age it brings (null
 * without a year). Counted on calendar days, so the day itself is 0, not 365.
 */
export function birthdayIn(iso: string | undefined, now = Date.now()): { days: number; age: number | null; date: Date } | null {
  const b = birthdayParts(iso);
  if (!b) return null;
  const today = new Date(now);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let next = new Date(start.getFullYear(), b.month - 1, b.day);
  if (next < start) next = new Date(start.getFullYear() + 1, b.month - 1, b.day);
  const days = Math.round((next.getTime() - start.getTime()) / 86400000);
  return { days, age: b.year ? next.getFullYear() - b.year : null, date: next };
}

/** "Sun 25 Oct". */
export const weekdayDay = (d: Date) => `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

/** Open WhatsApp to their number with a text; the web link when the app is not there. */
export async function openWhatsApp(phone: string | undefined, text = '') {
  const n = digits(phone);
  if (!n) return;
  const q = encodeURIComponent(text);
  try {
    await Linking.openURL(`whatsapp://send?phone=${n}&text=${q}`);
  } catch {
    await Linking.openURL(`https://wa.me/${n}?text=${q}`);
  }
}

function relationshipLabel(ctx: LifeOSContext, value: string | undefined): string | null {
  if (!value) return null;
  const f = ctx.registry.objects.get('person')?.fields.find((x) => x.key === 'relationship');
  return f?.options?.find((o) => o.value === value)?.label ?? value;
}

/** A 44 face with the lime ring (2 of card, 2 of lime). */
function RingedFace44({ person, ground }: { person: ObjectRecord<PersonData>; ground: string }) {
  const photo = person.data.photo?.uri;
  return (
    <View style={{ padding: 2, borderRadius: 26, borderWidth: 2, borderColor: LIME, backgroundColor: ground }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: faceColor(person.id), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {photo ? <Image source={{ uri: photo }} style={{ width: 44, height: 44 }} contentFit="cover" /> : <Text style={{ fontSize: 16, lineHeight: 20, fontWeight: '700', color: INK }}>{initials(person.title, 1)}</Text>}
      </View>
    </View>
  );
}

function Pill24({ label, icon, lime }: { label: string; icon?: string; lime?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 24, paddingHorizontal: 9, borderRadius: 999, backgroundColor: lime ? LIME_SOFT : t.c.bg.tileRaised, flexShrink: 0 }}>
      {icon ? <Icon name={icon} size={13} color={lime ? LIME : t.c.fg.secondary} /> : null}
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: lime ? LIME : t.c.fg.secondary }}>{label}</Text>
    </View>
  );
}

function BigButton({ label, icon, onPress, lime, style }: { label: string; icon: string; onPress: () => void; lime?: boolean; style?: object }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [{ flex: 1, minWidth: 0, height: 46, borderRadius: 999, backgroundColor: lime ? LIME : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14, opacity: pressed ? 0.85 : 1 }, style]}>
      <Icon name={icon} size={18} color={lime ? INK : t.c.fg.primary} />
      <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: lime ? INK : t.c.fg.primary }}>{label}</Text>
    </Pressable>
  );
}

/** Gift ideas Claude gave for these Likes (the learned store, MODEL layer 8), or undefined. */
export function useGiftIdeas(person: ObjectRecord<PersonData>): string[] | undefined {
  return useLive((os) => {
    const key = giftIdeasKey(person);
    const v = key ? os.brain.learned.get<string[]>(key) : undefined;
    return Array.isArray(v) && v.length ? v : undefined;
  }, [person.id, person.data.likes]);
}

/**
 * Gift ideas · from their likes (layer 8 slot): one card per Like, then the
 * quiet line saying ideas arrive with the brain. `card` is the colour the
 * cards sit on (raised on a tile, white 7 % on the profile sheet).
 */
export function GiftIdeasSlot({ person, card, onEditLikes }: { person: ObjectRecord<PersonData>; card?: string; onEditLikes: () => void }) {
  const t = useTheme();
  const likes = listItems(person.data.likes);
  const first = firstName(person.title);
  const ideas = useGiftIdeas(person);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.tertiary }}>{`GIFT IDEAS · FROM ${first.toUpperCase()}’S LIKES`}</Text>
        <Pressable onPress={onEditLikes} accessibilityRole="button" hitSlop={8}>
          <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '600', color: t.c.fg.secondary }}>{likes.length ? 'Edit likes' : 'Add likes'}</Text>
        </Pressable>
      </View>
      {likes.length ? (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
            {(ideas ?? likes).map((x) => (
              <View key={x} style={{ width: 150, padding: 12, borderRadius: 16, backgroundColor: card ?? t.c.bg.tileRaised, gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Icon name={ideas ? 'gift' : 'heart'} size={12} color={t.c.fg.secondary} />
                  <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: t.c.fg.secondary }}>{ideas ? 'Idea' : 'Likes'}</Text>
                </View>
                <Text numberOfLines={2} style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.fg.primary }}>{x}</Text>
              </View>
            ))}
          </ScrollView>
          <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: t.c.fg.tertiary }}>{ideas ? `From ${likes.join(', ')}, by Claude` : `Gift ideas from ${first}’s likes come with the brain’s pass in the two weeks before`}</Text>
        </>
      ) : (
        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: t.c.fg.tertiary }}>No likes saved, so no gift ideas</Text>
      )}
    </View>
  );
}

/** BIRTHDAY · A · today: the ringed face, "turns 84", gift ideas from their likes, Send a message · Send a gift. */
export function BirthdayTodayCard({ person, ctx }: { person: ObjectRecord<PersonData>; ctx: LifeOSContext }) {
  const t = useTheme();
  const router = useRouter();
  const b = birthdayIn(person.data.birthday);
  const sub = [relationshipLabel(ctx, person.data.relationship), person.data.city].filter(Boolean).join(' · ');
  const open = () => router.push(`/entity/person/${person.id}`);
  const edit = () => router.push(`/entity/person/${person.id}/edit`);
  const hasPhone = !!digits(person.data.phone);
  return (
    <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14, overflow: 'hidden' }}>
      <Pressable onPress={open} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <RingedFace44 person={person} ground={t.c.bg.tile} />
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2, color: t.c.fg.primary }}>{b?.age != null ? `${person.title} turns ${b.age}` : `${person.title}’s birthday`}</Text>
          {sub ? <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{sub}</Text> : null}
        </View>
        <Pill24 label="Today" icon="cake" lime />
      </Pressable>
      <GiftIdeasSlot person={person} onEditLikes={edit} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {hasPhone ? <BigButton label="Send a message" icon="comment" lime onPress={() => void openWhatsApp(person.data.phone)} /> : <BigButton label="Add phone" icon="phone" lime onPress={edit} />}
        <BigButton label="Send a gift" icon="gift" onPress={open} />
      </View>
    </View>
  );
}

/** BIRTHDAY · B · coming up: face, name, "in 2 d" (lime inside 3 days) and the date, Message and Gift ideas (badge = their likes). */
export function BirthdayRow({ person, days, ctx }: { person: ObjectRecord<PersonData>; days: number; ctx: LifeOSContext }) {
  const t = useTheme();
  const router = useRouter();
  const b = birthdayIn(person.data.birthday);
  const likes = listItems(person.data.likes);
  const open = () => router.push(`/entity/person/${person.id}`);
  const edit = () => router.push(`/entity/person/${person.id}/edit`);
  const soon = days <= 3;
  const date = b ? weekdayDay(b.date) : '';
  const turns = b?.age != null ? `turns ${b.age}` : '';
  const disc = (icon: string, label: string, onPress: () => void, badge?: number) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: pressed ? t.c.bg.pressed : t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' })}>
      <Icon name={icon} size={18} color={LIME} />
      {badge ? (
        <View style={{ position: 'absolute', top: -5, right: -5, minWidth: 22, height: 22, paddingHorizontal: 5, borderRadius: 11, borderWidth: 2, borderColor: t.c.bg.tile, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 10, lineHeight: 14, fontWeight: '700', color: INK }}>{String(badge)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
  void ctx;
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 }}>
        <Pressable onPress={open} accessibilityRole="button" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, minWidth: 0 }}>
          <Face id={person.id} name={person.title} photo={person.data.photo?.uri} size={40} />
          <View style={{ flex: 1, gap: 4, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{person.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <Pill24 label={days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} d`} lime={soon} />
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{[date, turns].filter(Boolean).join(' · ')}</Text>
            </View>
          </View>
        </Pressable>
        {digits(person.data.phone) ? disc('comment', `Message ${firstName(person.title)}`, () => void openWhatsApp(person.data.phone)) : null}
        {disc('gift', `Gift ideas for ${firstName(person.title)}`, likes.length ? open : edit, likes.length || undefined)}
      </View>
      {likes.length ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 2, paddingBottom: 4, paddingLeft: 54 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '500', color: t.c.fg.tertiary }}>No likes saved, so no gift ideas</Text>
          <Pressable onPress={edit} accessibilityRole="button" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="plus" size={13} color={LIME} />
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: LIME }}>Add likes</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const MOODS = ['Simple', 'Funny', 'Warm'] as const;

/**
 * BIRTHDAY · C · the wish (layer 8 slot): mood pills, the wish Claude drafted
 * at the pass on the day or the day before (yours to edit), Send on WhatsApp ·
 * Call instead, what happened last year, and gift ideas from their likes.
 */
export function WishCard({ person, ctx }: { person: ObjectRecord<PersonData>; ctx: LifeOSContext }) {
  const t = useTheme();
  const router = useRouter();
  const [mood, setMood] = useState<(typeof MOODS)[number]>('Warm');
  const [text, setText] = useState('');
  const first = firstName(person.title);
  const likes = listItems(person.data.likes);
  const ideas = useGiftIdeas(person);
  // The wish Claude drafted at the pass on the day or the day before (the learned store); yours to edit.
  const drafted = useLive((os) => {
    const key = wishKey(person);
    return key ? os.brain.learned.get<string>(key) : undefined;
  }, [person.id, person.data.birthday]);
  useEffect(() => {
    if (drafted) setText((cur) => cur || drafted);
  }, [drafted]);
  const phone = digits(person.data.phone);
  const edit = () => router.push(`/entity/person/${person.id}/edit`);
  const lastYear = useLive(
    (os) => {
      const b = birthdayParts(person.data.birthday);
      if (!b) return null;
      const y = new Date().getFullYear() - 1;
      const from = new Date(y, b.month - 1, b.day).getTime();
      const to = from + 86400000;
      const ev = os.records.timeline.forEntity(person.id, 500).find((e) => e.occurredAt >= from && e.occurredAt < to && !['created', 'updated', 'status'].includes(e.kind));
      if (ev) return `${ev.title} · ${ctx.format.time(ev.occurredAt)}`;
      const linked = os.links
        .forEntity(person.id)
        .map((l) => os.records.get(l.other.id))
        .find((r) => r && r.occurredAt != null && r.occurredAt >= from && r.occurredAt < to);
      return linked ? linked.title : null;
    },
    [person.id, person.data.birthday],
  );
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.tertiary }}>{`WISH ${first.toUpperCase()}`}</Text>
        <Text style={{ marginLeft: 'auto', fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>edit before sending</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
        {MOODS.map((m) => (
          <Pressable key={m} onPress={() => setMood(m)} accessibilityRole="button" accessibilityState={{ selected: mood === m }} style={{ flex: 1, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: mood === m ? t.c.fg.primary : 'transparent' }}>
            <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: mood === m ? t.c.bg.ground : t.c.fg.secondary }}>{m}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        placeholder="Claude drafts a wish on the day"
        placeholderTextColor={t.c.fg.tertiary}
        style={{ minHeight: 76, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomRightRadius: 20, borderBottomLeftRadius: 6, backgroundColor: t.c.bg.tileRaised, fontSize: 16, lineHeight: 23, fontWeight: '500', color: t.c.fg.primary, textAlignVertical: 'top' }}
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {phone ? (
          <>
            <BigButton label="Send on WhatsApp" icon="send" lime onPress={() => void openWhatsApp(person.data.phone, text)} style={{ height: 44 }} />
            <BigButton label="Call instead" icon="phone" onPress={() => void Linking.openURL(`tel:${person.data.phone!.replace(/[^+\d]/g, '')}`)} style={{ height: 44 }} />
          </>
        ) : (
          <BigButton label={`Add ${first}’s phone`} icon="phone" onPress={edit} style={{ height: 44 }} />
        )}
      </View>
      <View style={{ height: 1, backgroundColor: t.c.line }} />
      {lastYear ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="history" size={18} color={t.c.fg.primary} />
          </View>
          <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>Last year</Text>
            <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{lastYear}</Text>
          </View>
        </View>
      ) : null}
      <Pressable onPress={edit} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="gift" size={18} color={t.c.fg.primary} />
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{ideas ? `Gift ideas for ${first}` : `Gift ideas from ${first}’s likes`}</Text>
          <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{ideas ? ideas.join(' · ') : likes.length ? likes.join(' · ') : 'No likes saved yet · Add likes'}</Text>
        </View>
        <Icon name="chevron-right" size={18} color={t.c.fg.secondary} />
      </Pressable>
    </View>
  );
}
