import { useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { linkColorForModule, shortNameForModule } from '@ui/theme/moduleTint';
import { EmptyState, Icon, IconButton, Screen, Text } from '@ui/kit';
import { LinkDisc, LinkMap, type MapLine } from '@ui/components/LinkMap';
import { LinkDetailSheet, type HeldLink } from '@ui/components/LinkSheets';
import { buildMap, LinksCard } from '@ui/components/LinksCard';

/**
 * Links (MODEL.md layer 5; the L1 and L2 artboards): the map around a record,
 * one hop or two, filtered by module. Tap a record to centre on it, hold to
 * open it, tap a line's word for where the link came from (L3). Under the
 * map, the record in the centre and its Links in full.
 */
export default function LinksScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [centre, setCentre] = useState(String(id));
  const [hops, setHops] = useState<1 | 2>(1);
  const [module, setModule] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [held, setHeld] = useState<HeldLink | null>(null);
  const all = useLive((o) => buildMap(o, centre, hops), [centre, hops]);
  const map = useLive((o) => (module ? buildMap(o, centre, hops, module) : null), [centre, hops, module]) ?? all;
  const e = useLive((o) => o.records.get(centre), [centre]);
  const start = useLive((o) => o.records.get(String(id)), [id]);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/links' as never));
  const open = (type: string, rid: string) => router.push(`/entity/${type}/${rid}` as never);
  const label = e ? (os.registry.objects.get(e.object)?.label ?? e.object) : '';
  const ring1 = all.nodes.filter((n) => n.hop === 1);
  const modules = [...new Set(ring1.map((n) => n.module ?? ''))].filter(Boolean);
  const toCheck = all.lines.filter((l) => l.guessed && (l.from === centre || l.to === centre)).length;
  const gutter = t.layout.gutter;
  const tapLine = (l: MapLine) => {
    setSelected(l.key);
    setHeld(l.meta as HeldLink);
  };
  const pill = (text: string, alert?: boolean) => (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: alert ? t.c.alert.coralFill : 'rgba(255,255,255,0.07)', justifyContent: 'center' }}>
      <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: alert ? t.c.alert.coralText : t.c.fg.secondary }}>{text}</Text>
    </View>
  );
  const chip = (key: string | null, text: string, color?: string) => {
    const on = module === key;
    return (
      <Pressable key={key ?? 'all'} onPress={() => setModule(key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: on ? t.c.fg.primary : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {color ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} /> : null}
        <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: on ? t.c.bg.ground : t.c.fg.secondary }}>{text}</Text>
      </Pressable>
    );
  };
  return (
    <Screen title="Links" subtitle={e ? `${e.title} · ${label}` : undefined} onBack={back} right={<IconButton icon="search" accessibilityLabel="Find a record" filled onPress={() => router.push('/links' as never)} />}>
      {!e ? (
        <EmptyState icon="link" line="That record is gone." />
      ) : (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: t.c.bg.tileRaised }}>
              {([1, 2] as const).map((h) => (
                <Pressable key={h} onPress={() => (setHops(h), setSelected(null))} accessibilityRole="button" accessibilityState={{ selected: hops === h }} style={{ height: 30, paddingHorizontal: 12, borderRadius: 999, justifyContent: 'center', backgroundColor: hops === h ? t.c.fg.primary : 'transparent' }}>
                  <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: hops === h ? t.c.bg.ground : t.c.fg.secondary }}>{h === 1 ? '1 hop' : '2 hops'}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ marginLeft: 'auto', flexDirection: 'row', gap: 6 }}>
              {pill(hops === 1 ? `${ring1.length} link${ring1.length === 1 ? '' : 's'}` : `${all.nodes.length} records`)}
              {toCheck ? pill(`${toCheck} to check`, true) : null}
            </View>
          </View>
          {modules.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -gutter }} contentContainerStyle={{ gap: 6, paddingHorizontal: gutter }}>
              {chip(null, 'All')}
              {modules.map((m) => chip(m, shortNameForModule(m, os.registry.modules.get(m)?.name ?? m), linkColorForModule(m)))}
            </ScrollView>
          ) : null}
          {map.centre && map.nodes.length ? (
            <View style={{ marginHorizontal: -gutter }}>
              <LinkMap
                width={width}
                height={hops === 1 ? 600 : 640}
                centre={map.centre}
                nodes={map.nodes}
                lines={map.lines}
                selected={selected}
                onTapNode={(n) => (n.hop === 0 ? null : (setCentre(n.id), setSelected(null)))}
                onHoldNode={(n) => open(n.type, n.id)}
                onTapLine={tapLine}
              />
            </View>
          ) : (
            <Text variant="body" color="secondary" style={{ paddingVertical: 24 }}>
              Nothing is linked to {e.title} yet. Say who was there, where, or what it was for, or add a link below.
            </Text>
          )}
          <View style={{ padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <LinkDisc node={{ id: e.id, type: e.object, title: e.title, module: os.registry.objects.get(e.object)?.module ?? null, photo: map.centre?.photo, icon: os.registry.objects.get(e.object)?.icon }} size={44} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '700', color: t.c.fg.primary }}>{e.title}</Text>
                <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{[label, e.subtitle].filter(Boolean).join(' · ')}</Text>
              </View>
              {centre === id ? (
                <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.accent.mustardInk }}>centre</Text>
                </View>
              ) : (
                <Pressable onPress={() => (setCentre(String(id)), setSelected(null))} accessibilityRole="button" style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center' }}>
                  <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.primary }}>Back to {start?.title ?? 'the start'}</Text>
                </Pressable>
              )}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable onPress={() => open(e.object, e.id)} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: 999, backgroundColor: pressed ? t.c.bg.pressed : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 })}>
                <Icon name="arrow-right" size={18} color={t.c.fg.primary} />
                <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.fg.primary }}>Open record</Text>
              </Pressable>
              <Pressable onPress={() => (setHops(hops === 1 ? 2 : 1), setSelected(null))} accessibilityRole="button" style={({ pressed }) => ({ flex: 1, height: 40, borderRadius: 999, backgroundColor: pressed ? t.c.bg.pressed : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 })}>
                <Icon name="link" size={18} color={t.c.fg.primary} />
                <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.fg.primary }}>{hops === 1 ? '2 hops' : '1 hop'}</Text>
              </Pressable>
            </View>
          </View>
          <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.tertiary }}>Tap a record to re-centre · hold to open it · tap a line for where it came from</Text>
          <LinksCard entity={e} full />
        </View>
      )}
      <LinkDetailSheet held={held} onClose={() => (setHeld(null), setSelected(null))} />
    </Screen>
  );
}
