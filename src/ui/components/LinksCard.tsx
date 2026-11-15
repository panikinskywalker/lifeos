import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { egoGraph, linkGroups, type LinkItem } from '@core/graph/read';
import { viewLinks } from '@core/graph/view';
import { Icon } from '../icons';
import { Text } from '../kit';
import { useLive, useOS } from '../hooks';
import { useTheme } from '../theme/ThemeProvider';
import { monoFonts } from '../theme/tokens';
import { LinkDisc, LinkMap, type MapLine, type MapNode } from './LinkMap';
import { AddLinkSheet, LinkDetailSheet, type HeldLink } from './LinkSheets';

export { AddLinkSheet as LinkSheet } from './LinkSheets';

const MONO = monoFonts[700];
const PER_GROUP = 4;

const photoOf = (os: LifeOSContext, id: string) => {
  const r = os.records.get(id);
  return r?.object === 'person' ? ((r.data as { photo?: { uri?: string } }).photo?.uri ?? null) : null;
};

/**
 * The Links map's records and lines around a record (L1, L2, L4's small map),
 * from core's network (faces folded in, meetings as one line). `module`
 * keeps only that module's records; one hop shows "+3" for links further out.
 */
export function buildMap(os: LifeOSContext, id: string, hops: 1 | 2, module?: string | null): { centre: MapNode | null; nodes: MapNode[]; lines: MapLine[] } {
  const g = egoGraph(os, id, { hops, limit: hops === 1 ? 13 : 30 });
  const node = (n: (typeof g.nodes)[number], guessed = false): MapNode => {
    const def = os.registry.objects.get(n.type);
    return { id: n.id, type: n.type, title: n.title, module: n.module, hop: n.hop, sub: def?.label ?? n.type, photo: photoOf(os, n.id), icon: def?.icon, guessed, more: hops === 1 && n.hop === 1 ? Math.max(0, viewLinks(os, n.id).length - 1) : 0 };
  };
  const c = g.nodes.find((n) => n.hop === 0);
  if (!c) return { centre: null, nodes: [], lines: [] };
  const guessedTo = new Set(g.edges.filter((e) => e.guessed).flatMap((e) => [e.from === id ? e.to : e.to === id ? e.from : '']));
  let nodes = g.nodes.filter((n) => n.hop > 0).map((n) => node(n, n.hop === 1 && guessedTo.has(n.id)));
  if (module) {
    const ring1 = new Set(nodes.filter((n) => n.hop === 1 && n.module === module).map((n) => n.id));
    nodes = nodes.filter((n) => (n.hop === 1 ? ring1.has(n.id) : n.module === module || g.edges.some((e) => (e.from === n.id && ring1.has(e.to)) || (e.to === n.id && ring1.has(e.from)))));
  }
  const keep = new Set([c.id, ...nodes.map((n) => n.id)]);
  const hop = new Map(g.nodes.map((n) => [n.id, n.hop]));
  const lines = g.edges
    .filter((e) => keep.has(e.from) && keep.has(e.to))
    .map((e) => {
      // Read from the nearer record, as its line's word is.
      const [near, far] = (hop.get(e.from) ?? 0) <= (hop.get(e.to) ?? 0) ? [e.from, e.to] : [e.to, e.from];
      const meta: HeldLink = { fromId: near, otherId: far, word: e.word ?? e.kind, guessed: !!e.guessed, ref: e.ref ?? null, via: e.via ? { id: e.via.id, type: e.via.object, title: e.via.title } : null };
      return { key: e.ref?.linkId ?? `${e.from}|${e.to}`, from: e.from, to: e.to, word: e.word, guessed: e.guessed, meta };
    });
  return { centre: node(c), nodes, lines };
}

/** The held row or line, as the link sheet wants it. */
export const heldFrom = (fromId: string, i: Pick<LinkItem, 'id' | 'guessed' | 'via' | 'linkId' | 'fromId' | 'toId' | 'kind' | 'removable'>, word: string): HeldLink => ({
  fromId,
  otherId: i.id,
  word,
  guessed: i.guessed,
  ref: i.removable ? { linkId: i.linkId, fromId: i.fromId, toId: i.toId, kind: i.kind } : null,
  via: i.via,
});

/**
 * The Links card (MODEL.md layer 5; the L4 artboard): on every record. A
 * small map of what is around it (Open Links), then every link grouped by its
 * word in a left column, each row in its module's colour; guessed ones say
 * "to check". Tap opens the record; hold shows where the link came from and
 * lets you change or remove it (L3). Link adds one (L5). `full` (the Links
 * screen) shows every row and no map.
 */
export function LinksCard({ entity, full = false }: { entity: ObjectRecord; full?: boolean }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [held, setHeld] = useState<HeldLink | null>(null);
  const [w, setW] = useState(0);
  const groups = useLive((o) => linkGroups(o, entity.id), [entity.id]);
  const map = useLive((o) => (full ? null : buildMap(o, entity.id, 1)), [entity.id, full]);
  const count = groups.reduce((n, g) => n + g.items.length, 0);
  const open = (i: LinkItem) => router.push(`/entity/${i.type}/${i.id}` as never);
  const openLinks = () => router.push(`/links/${entity.id}` as never);
  const money = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${os.format.currency(Math.abs(n))}`;
  const line = (i: LinkItem) => {
    const def = os.registry.objects.get(i.type);
    return [i.amount != null ? money(i.amount) : null, i.context ?? i.subtitle ?? def?.label, i.at && !i.via ? os.format.date(i.at) : null].filter(Boolean).join(' · ');
  };
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ padding: 14, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text accessibilityRole="header" numberOfLines={1} style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>Links</Text>
          <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', color: t.c.fg.secondary }}>{count ? `${count} · grouped by link word` : `Nothing linked to ${entity.title} yet`}</Text>
        </View>
        <Pressable onPress={() => setAdding(true)} accessibilityRole="button" accessibilityLabel={`Link ${entity.title} to a record`} style={({ pressed }) => ({ height: 36, paddingHorizontal: 22, borderRadius: 999, backgroundColor: pressed ? t.c.bg.pressed : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', gap: 8 })}>
          <Icon name="link" size={16} color={t.c.fg.primary} />
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.fg.primary }}>Link</Text>
        </Pressable>
      </View>
      {map?.centre && map.nodes.length >= 2 && w > 28 ? (
        <Pressable onPress={openLinks} accessibilityRole="button" accessibilityLabel="Open Links" style={{ borderRadius: 22, backgroundColor: t.c.bg.ground, overflow: 'hidden' }}>
          <LinkMap width={w - 28} height={170} centre={map.centre} nodes={map.nodes} lines={map.lines} mini onTapNode={openLinks} />
          <View pointerEvents="none" style={{ position: 'absolute', left: 12, bottom: 16 }}>
            <Text style={{ fontFamily: MONO, fontSize: 9, lineHeight: 12, letterSpacing: 0.5, color: t.c.fg.tertiary, textTransform: 'uppercase' }}>Around this record · 1 hop</Text>
          </View>
          <View pointerEvents="none" style={{ position: 'absolute', right: 10, bottom: 10, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.accent.mustardInk }}>Open Links</Text>
          </View>
        </Pressable>
      ) : null}
      {groups.map((g, gi) => {
        const shown = full ? g.items : g.items.slice(0, PER_GROUP);
        return (
          <View key={g.word} style={{ gap: 12 }}>
            {gi ? <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)' }} /> : null}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {/* The design's 66 is too narrow for one long word (ORGANISATIONS); 84 keeps every word whole. */}
              <View style={{ width: 84, paddingTop: 12 }}>
                <Text numberOfLines={2} style={{ fontFamily: MONO, fontSize: 9, lineHeight: 12, letterSpacing: 0.5, color: t.c.fg.tertiary, textTransform: 'uppercase' }}>{g.word}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                {shown.map((i) => (
                  <Pressable
                    key={i.linkId}
                    onPress={() => open(i)}
                    onLongPress={() => setHeld(heldFrom(entity.id, i, g.word))}
                    accessibilityRole="button"
                    accessibilityLabel={`${g.word} ${i.title}${i.guessed ? ', to check' : ''}`}
                    accessibilityHint="Hold for where it came from"
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, opacity: pressed ? 0.7 : i.guessed ? 0.85 : 1 })}
                  >
                    <LinkDisc node={{ id: i.id, type: i.type, title: i.title, module: i.module, photo: photoOf(os, i.id), icon: os.registry.objects.get(i.type)?.icon }} size={34} ring />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: t.c.fg.primary }}>{i.title}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.tertiary }}>{line(i)}</Text>
                    </View>
                    {i.guessed ? (
                      <View style={{ height: 24, paddingHorizontal: 9, borderRadius: 999, backgroundColor: t.c.alert.coralFill, justifyContent: 'center' }}>
                        <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', color: t.c.alert.coralText }}>to check</Text>
                      </View>
                    ) : (
                      <Icon name="chevron-right" size={16} color={t.c.fg.tertiary} />
                    )}
                  </Pressable>
                ))}
                {shown.length < g.items.length ? (
                  <Pressable onPress={openLinks} accessibilityRole="button" style={{ minHeight: 32, justifyContent: 'center' }}>
                    <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>{g.items.length - shown.length} more</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        );
      })}
      {count ? <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>Tap to open · hold for where it came from, or to remove it</Text> : null}
      <LinkDetailSheet held={held} onClose={() => setHeld(null)} />
      <AddLinkSheet visible={adding} onClose={() => setAdding(false)} entity={entity} />
    </View>
  );
}
