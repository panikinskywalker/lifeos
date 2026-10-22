import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { useLive } from '@ui/hooks';
import { Icon, Text, useToast } from '@ui/kit';
import { blocks, gradients } from '@ui/theme/tokens';
import { daysSince, type PersonData } from '@modules/crm';
import { balanceWith, settleUp, undoSettle } from '@modules/finance/split';
import { Avatar } from './avatar';

/**
 * Person · Profile (NR-KitRecords, ref 2): the photo edge to edge, a frosted
 * dark sheet with the name, three stats (last spoke · owes you · shared),
 * quiet action pills, Connections (the latest linked records, shared
 * expenses with Settle, notes), Photos and the Last note. The hero is Noir in
 * both themes: it sits on a photo, like a colour block. Sizes and colours are
 * the artboard's.
 */

const INK = '#F5F5F7';
const INK2 = 'rgba(245,245,247,0.62)';
const INK_STAT = 'rgba(255,255,255,0.6)';
const HAIR = 'rgba(255,255,255,0.08)';
const DISC = '#26262B';
const LIME = blocks.lime;

const ICON_FOR: Record<string, string> = { event: 'calendar', trip: 'plane', transaction: 'receipt', task: 'check', note: 'notebook', group: 'people', org: 'briefcase', place: 'map', debt: 'cash', appearance: 'activity', game: 'activity' };
const day = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
/** The parts of the profile that are not other people's connections. */
const STRUCTURAL = new Set(['works at', 'lives in', 'member']);

function Hairline() {
  return <View style={{ height: 1, backgroundColor: HAIR }} />;
}

function SectionHead({ title, meta, onPress }: { title: string; meta?: string; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingTop: 4 }} accessibilityRole={onPress ? 'button' : 'header'}>
      <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: INK }}>{title}</Text>
      {meta ? <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: INK2 }}>{meta}</Text> : null}
    </Pressable>
  );
}

function Row({ icon, title, sub, trailing, onPress }: { icon: string; title: string; sub?: string; trailing?: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 }} accessibilityRole="button" accessibilityLabel={sub ? `${title}, ${sub}` : title}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: DISC, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color={INK} />
      </View>
      <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: INK }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: INK2 }}>{sub}</Text> : null}
      </View>
      {trailing ?? <Icon name="chevron-right" size={18} color={INK2} />}
    </Pressable>
  );
}

function Stat({ value, label, first, tone }: { value: string; label: string; first?: boolean; tone?: string }) {
  return (
    <View style={{ flex: 1, gap: 2, minWidth: 0, paddingVertical: 2, paddingLeft: first ? 0 : 14, borderLeftWidth: first ? 0 : 1, borderLeftColor: 'rgba(255,255,255,0.12)' }}>
      <Text numberOfLines={1} style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.5, color: tone ?? INK }}>{value}</Text>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '500', color: INK_STAT }}>{label}</Text>
    </View>
  );
}

/** Quiet pills (NR-KitRecords · Tags): rgba white 0.08, 32 high. */
function Pill({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: pressed ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.08)' })}>
      <Icon name={icon} size={14} color={INK} />
      <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: INK }}>{label}</Text>
    </Pressable>
  );
}

function Backdrop({ photo, height }: { photo: string | null; height: number }) {
  const [from, to] = gradients.people;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}>
      {photo ? (
        <Image source={{ uri: photo }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} contentFit="cover" />
      ) : (
        <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="person-hero" x1="0.33" y1="0" x2="0.67" y2="1">
              <Stop offset="0" stopColor={from} />
              <Stop offset="1" stopColor={to} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#person-hero)" />
        </Svg>
      )}
      {/* The artboard's fade: clear at 40 %, 35 % black at the bottom, then into the ground. */}
      <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="person-fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.4" stopColor="#000000" stopOpacity={0} />
            <Stop offset="0.75" stopColor="#000000" stopOpacity={0.35} />
            <Stop offset="1" stopColor="#0B0B0D" stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#person-fade)" />
      </Svg>
    </View>
  );
}

export function PersonProfile({ entity, ctx, controls }: { entity: ObjectRecord<any>; ctx: LifeOSContext; controls?: RecordControls }) {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const p = entity as ObjectRecord<PersonData>;
  const view = useLive(
    (os) => {
      const links = os.links.forEntity(entity.id);
      const others = links.filter((l) => !STRUCTURAL.has(l.relation.kind));
      const recent = others
        .map((l) => os.records.get(l.other.id))
        .filter((r): r is ObjectRecord => !!r && !['person', 'debt'].includes(r.object))
        .sort((a, b) => (b.occurredAt ?? b.createdAt) - (a.occurredAt ?? a.createdAt))
        .slice(0, 3);
      const facts = os.facts.list({ subjectId: entity.id, limit: 200 });
      const photos = os.attachments.forEntity(entity.id).filter((a) => a.kind === 'image' || (a.mime ?? '').startsWith('image/'));
      const cover = os.attachments.cover(entity.id);
      const balance = os.registry.objects.has('debt') ? balanceWith(os, entity.id) : 0;
      return { shared: new Set(others.map((l) => l.other.id)).size, recent, facts, photos, cover: cover?.uri ?? null, balance };
    },
    [entity.id, entity.version],
  );
  const words = entity.title.trim().split(/\s+/);
  const first = words[0] ?? entity.title;
  const last = words.slice(1).join(' ');
  const photo = p.data.photo?.uri ?? view.cover;
  const ago = daysSince(p.data.lastContactAt);
  const contact = ctx.cycles.forEntity(entity.id).find((c) => c.template === 'person.contact' && c.enabled);
  const overdue = !!contact && ctx.cycles.status(contact).state === 'overdue';
  const tel = p.data.phone?.replace(/[^+\d]/g, '');
  const top = insets.top + 16;
  const bandHeight = top + 40 + 200 + 120;

  const logContact = () => {
    const prev = p.data.lastContactAt;
    ctx.records.update<PersonData>(entity.id, { data: { lastContactAt: new Date().toISOString().slice(0, 10) } });
    toast.show({ message: `Logged contact with ${first}`, icon: 'check', undo: () => void ctx.records.update<PersonData>(entity.id, { data: { lastContactAt: prev } }) });
  };
  const settle = () => {
    const amount = Math.abs(view.balance);
    const s = settleUp(ctx, entity.id);
    toast.show({ message: `Settled ${ctx.format.currency(amount)} with ${first}`, icon: 'check', undo: () => undoSettle(ctx, s) });
  };
  const lastFact = view.facts[0];
  const money = view.balance > 0 ? { value: ctx.format.currency(view.balance), label: 'owes you' } : view.balance < 0 ? { value: ctx.format.currency(-view.balance), label: 'you owe' } : { value: '—', label: 'settled' };

  return (
    <View style={{ backgroundColor: '#0B0B0D' }}>
      <Backdrop photo={photo} height={bandHeight} />
      <View style={{ paddingTop: top, paddingHorizontal: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={controls?.back} accessibilityRole="button" accessibilityLabel="Back" style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(22,22,26,0.5)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="chevron-left" size={20} color={INK} />
          </Pressable>
          <Pressable onPress={controls?.more} onLongPress={controls?.cover} accessibilityRole="button" accessibilityLabel="More">
            <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: INK }}>@{first.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')}</Text>
          </Pressable>
          <Pressable onPress={controls?.edit} accessibilityRole="button" accessibilityLabel="Edit" style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: INK, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: '#0B0B0D' }}>Edit</Text>
          </Pressable>
        </View>
      </View>

      <View style={{ marginTop: 200, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 20, gap: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: 'rgba(22,22,26,0.62)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' }}>
        <Text accessibilityRole="header" style={{ fontSize: 40, lineHeight: 42, fontWeight: '600', letterSpacing: -1, color: INK }}>
          {last ? `${first}\n${last}` : first}
        </Text>
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <Stat first value={ago == null ? '—' : ago === 0 ? 'today' : `${ago} d`} label={overdue ? 'last spoke · due' : 'last spoke'} tone={overdue ? blocks.lime : undefined} />
          <Stat value={money.value} label={money.label} />
          <Stat value={String(view.shared)} label="shared" />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {tel ? <Pill label="Call" icon="phone" onPress={() => void Linking.openURL(`tel:${tel}`)} /> : null}
          {tel ? <Pill label="Message" icon="comment" onPress={() => void Linking.openURL(`sms:${tel}`)} /> : null}
          {p.data.email ? <Pill label="Mail" icon="send" onPress={() => void Linking.openURL(`mailto:${p.data.email}`)} /> : null}
          <Pill label="Log contact" icon="check" onPress={logContact} />
          <Pill label="Add IOU" icon="cash" onPress={() => router.push('/entity/debt/new')} />
          <Pill label="Add expense" icon="receipt" onPress={() => router.push('/entity/transaction/new')} />
        </ScrollView>

        <Hairline />
        <SectionHead title="Connections" meta={view.shared ? 'All' : undefined} onPress={view.shared ? () => router.push(`/links/${entity.id}`) : undefined} />
        <View style={{ gap: 8 }}>
          {view.recent.map((r) => (
            <View key={r.id} style={{ gap: 8 }}>
              <Row icon={ICON_FOR[r.object] ?? 'doc'} title={r.title} sub={[ctx.registry.objects.get(r.object)?.label, r.subtitle, day(r.occurredAt ?? r.createdAt)].filter(Boolean).join(' · ')} onPress={() => router.push(`/entity/${r.object}/${r.id}`)} />
              <Hairline />
            </View>
          ))}
          <Row
            icon="wallet"
            title="Shared expenses"
            sub={view.balance > 0 ? `${first} owes ${ctx.format.currency(view.balance)}` : view.balance < 0 ? `You owe ${ctx.format.currency(-view.balance)}` : 'All settled'}
            onPress={() => router.push({ pathname: '/entity/[type]', params: { type: 'transaction', personId: entity.id } })}
            trailing={
              view.balance !== 0 ? (
                <Pressable onPress={settle} accessibilityRole="button" accessibilityLabel={`Settle with ${first}`} style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: '#0B0B0D' }}>Settle</Text>
                </Pressable>
              ) : undefined
            }
          />
          <Hairline />
          <Row icon="notebook" title="Notes" sub={view.facts.length ? `${view.facts.length} about ${first} · last ${day(view.facts[0]!.statedAt)}` : `Nothing noted about ${first} yet`} onPress={() => router.push('/memory')} />
        </View>

        {view.photos.length ? (
          <>
            <Hairline />
            <SectionHead title="Photos" meta={String(view.photos.length)} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
              {view.photos.slice(0, 12).map((a) => (
                <Image key={a.id} source={{ uri: a.uri }} style={{ width: 84, height: 84, borderRadius: 16 }} contentFit="cover" accessibilityLabel={a.name} />
              ))}
            </ScrollView>
          </>
        ) : null}

        {lastFact ? (
          <>
            <Hairline />
            <SectionHead title="Last note" />
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <Avatar id={entity.id} name={first} photo={null} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 15, lineHeight: 22, color: INK }}>“{lastFact.text}”</Text>
                <Text style={{ marginTop: 4, fontSize: 12, lineHeight: 16, fontWeight: '500', color: 'rgba(255,255,255,0.55)' }}>
                  via {lastFact.source === 'dump' ? 'Dump' : lastFact.source === 'talk' ? 'Talk' : 'you'} · {day(lastFact.statedAt)}
                </Text>
              </View>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}
