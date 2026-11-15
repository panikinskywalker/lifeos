import React, { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg';
import { Image } from 'expo-image';
import { Icon } from '../icons';
import { Text } from '../kit';
import { useTheme } from '../theme/ThemeProvider';
import { monoFonts } from '../theme/tokens';
import { linkColorForModule } from '../theme/moduleTint';

/**
 * The Links map (the NR Links artboards: L1 one hop, L2 two hops, L4's small
 * map, L7 the parts). The record you are on sits in the middle with a lime
 * ring; what it links to stands round it in a ring, each in its module's
 * colour, the link word on a pill along its line. Two hops: the first ring
 * moves in and shrinks, the second ring is smaller and quieter, its words
 * shown only when a line is tapped. A guessed link is dashed with a "?".
 * Still by default (no pulse, no halo).
 */

export interface MapNode {
  id: string;
  type: string;
  title: string;
  module: string | null;
  hop: number;
  /** The mono line under the name ("Organisation", "Group · 16"). */
  sub?: string | null;
  photo?: string | null;
  /** Links further out ("+3"). */
  more?: number;
  guessed?: boolean;
  icon?: string;
}
export interface MapLine {
  key: string;
  from: string;
  to: string;
  word?: string;
  guessed?: boolean;
  /** Whatever the screen needs to act on a tapped line (the link sheet's record). */
  meta?: unknown;
}

const FACE_COLORS = ['#F4A8CE', '#9FE0B5', '#C9A7F5', '#A9C4FF', '#F6E27F', '#FFB1A1', '#FF8A6A', '#9FB8F7', '#DCEFC8', '#F2D7A0'];
const LIME = '#D7F55C';
const CORAL = '#FF8A7A';
const MONO = monoFonts[700];

export function faceColorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FACE_COLORS[h % FACE_COLORS.length]!;
}
export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter((w) => /\p{L}|\p{N}/u.test(w))
    .slice(0, 2)
    .map((w) => w.match(/\p{L}|\p{N}/u)![0]!.toUpperCase())
    .join('') || '?';

/** A record as a disc: a person's face (photo or initials), else its Object's icon in its module colour. */
export function LinkDisc({ node, size, ring }: { node: Pick<MapNode, 'id' | 'type' | 'title' | 'module' | 'photo' | 'icon'>; size: number; ring?: boolean }) {
  const t = useTheme();
  const color = linkColorForModule(node.module);
  const person = node.type === 'person';
  const inner = ring ? size - 8 : size;
  const disc = person ? (
    <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: faceColorFor(node.id), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {node.photo ? (
        <Image source={{ uri: node.photo }} style={{ width: inner, height: inner }} contentFit="cover" accessibilityIgnoresInvertColors />
      ) : (
        <Text style={{ fontSize: Math.max(8, Math.round(inner * 0.36)), lineHeight: Math.max(10, Math.round(inner * 0.46)), fontWeight: '700', color: '#0B0B0D' }}>{initialsOf(node.title)}</Text>
      )}
    </View>
  ) : (
    <View style={{ width: inner, height: inner, borderRadius: inner / 2, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={(node.icon ?? 'link') as never} size={Math.max(10, Math.round(inner * 0.45))} color={color} />
    </View>
  );
  if (!ring) return disc;
  return <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>{disc}</View>;
}

interface Placed {
  node: MapNode;
  x: number;
  y: number;
  size: number;
  angle: number;
}

/** Rings round the centre: the first evenly round an ellipse (grouped by module, so colours sit together), the second fanned out beside the record it hangs from. */
function layout(width: number, height: number, centre: MapNode, nodes: MapNode[], lines: MapLine[], mini: boolean): Map<string, Placed> {
  const cx = width / 2;
  const cy = height / 2;
  const two = nodes.some((n) => n.hop === 2);
  const out = new Map<string, Placed>();
  out.set(centre.id, { node: centre, x: cx, y: cy, size: mini ? 40 : 76, angle: 0 });
  const ring1 = nodes.filter((n) => n.hop === 1).sort((a, b) => (a.module ?? '').localeCompare(b.module ?? '') || a.title.localeCompare(b.title));
  const s1 = mini ? 28 : two ? 40 : 52;
  const edge = mini ? 22 : 62;
  const rx1 = (width / 2 - edge) * (two ? 0.7 : 1);
  const ry1 = (height / 2 - (mini ? 36 : 72)) * (two ? 0.56 : 1);
  ring1.forEach((n, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, ring1.length);
    out.set(n.id, { node: n, x: cx + rx1 * Math.cos(a), y: cy + ry1 * Math.sin(a), size: s1, angle: a });
  });
  const ring2 = nodes.filter((n) => n.hop === 2);
  if (ring2.length) {
    const parentOf = (id: string) => {
      for (const l of lines) {
        const other = l.from === id ? l.to : l.to === id ? l.from : null;
        if (other && out.get(other)?.node.hop === 1) return other;
      }
      return null;
    };
    const byParent = new Map<string, MapNode[]>();
    for (const n of ring2) {
      const p = parentOf(n.id) ?? ring1[0]?.id ?? centre.id;
      byParent.set(p, [...(byParent.get(p) ?? []), n]);
    }
    const slice = (2 * Math.PI) / Math.max(1, ring1.length);
    const rx2 = width / 2 - 36;
    const ry2 = height / 2 - 40;
    for (const [p, kids] of byParent) {
      const base = out.get(p)?.angle ?? 0;
      kids.forEach((n, k) => {
        const a = base + (kids.length === 1 ? 0 : (k / (kids.length - 1) - 0.5) * slice * 0.8);
        out.set(n.id, { node: n, x: cx + rx2 * Math.cos(a), y: cy + ry2 * Math.sin(a), size: 28, angle: a });
      });
    }
  }
  return out;
}

/** A line with a slight bend, from the edge of one disc to the edge of the other; the point and angle for its word. */
function curve(a: Placed, b: Placed) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const ra = a.size / 2 + 4;
  const rb = b.size / 2 + 4;
  const x1 = a.x + ux * ra;
  const y1 = a.y + uy * ra;
  const x2 = b.x - ux * rb;
  const y2 = b.y - uy * rb;
  const bend = len * 0.08;
  const qx = (x1 + x2) / 2 - uy * bend;
  const qy = (y1 + y2) / 2 + ux * bend;
  const tt = 0.55;
  const px = (1 - tt) ** 2 * x1 + 2 * (1 - tt) * tt * qx + tt ** 2 * x2;
  const py = (1 - tt) ** 2 * y1 + 2 * (1 - tt) * tt * qy + tt ** 2 * y2;
  let deg = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return { d: `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${qx.toFixed(1)} ${qy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`, px, py, deg };
}

export function LinkMap({
  width,
  height,
  centre,
  nodes,
  lines,
  mini = false,
  selected,
  onTapNode,
  onHoldNode,
  onTapLine,
}: {
  width: number;
  height: number;
  centre: MapNode;
  nodes: MapNode[];
  lines: MapLine[];
  mini?: boolean;
  /** The line tapped: lime and thicker, everything else drops to 20%. */
  selected?: string | null;
  onTapNode?: (n: MapNode) => void;
  onHoldNode?: (n: MapNode) => void;
  onTapLine?: (l: MapLine) => void;
}) {
  const t = useTheme();
  const placed = useMemo(() => layout(width, height, centre, nodes, lines, mini), [width, height, centre, nodes, lines, mini]);
  const drawn = lines
    .map((l) => {
      const a = placed.get(l.from);
      const b = placed.get(l.to);
      if (!a || !b) return null;
      const far = a.node.hop > b.node.hop ? a : b;
      const near = far === a ? b : a;
      return { l, c: curve(near, far), far, hop: far.node.hop };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const dim = (key: string) => (selected && selected !== key ? 0.2 : 1);
  const label = (p: Placed) => {
    if (mini || p.node.hop === 0) return null;
    const above = p.y < height / 2 - 10 && p.node.hop === 1;
    const style = { position: 'absolute' as const, left: p.x - 50, width: 100, alignItems: 'center' as const, ...(above ? { top: p.y - p.size / 2 - 32 } : { top: p.y + p.size / 2 + 6 }) };
    return (
      <View key={`l${p.node.id}`} pointerEvents="none" style={{ ...style, opacity: selected ? 0.6 : 1 }}>
        <Text numberOfLines={1} style={{ fontSize: p.node.hop === 1 ? 12 : 10, lineHeight: p.node.hop === 1 ? 15 : 12, fontWeight: p.node.hop === 1 ? '700' : '600', color: p.node.hop === 1 ? t.c.fg.primary : t.c.fg.secondary, textAlign: 'center' }}>
          {p.node.title}
        </Text>
        {p.node.hop === 1 && p.node.sub ? (
          <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 8, lineHeight: 10, letterSpacing: 0.5, color: t.c.fg.tertiary, textTransform: 'uppercase', textAlign: 'center' }}>
            {p.node.sub}
          </Text>
        ) : null}
      </View>
    );
  };
  return (
    <View style={{ width, height, overflow: 'hidden' }} accessibilityLabel={`Links around ${centre.title}: ${nodes.length} records`}>
      <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
        {mini ? null : (
          <>
            <Defs>
              <Pattern id="dots" width={22} height={22} patternUnits="userSpaceOnUse">
                <Circle cx={11} cy={11} r={1} fill={t.dark ? '#FFFFFF' : '#000000'} fillOpacity={0.07} />
              </Pattern>
            </Defs>
            <Rect x={0} y={0} width={width} height={height} fill="url(#dots)" />
            <Circle cx={width / 2} cy={height / 2} r={62} fill="none" stroke={LIME} strokeOpacity={0.1} strokeWidth={1} />
            <Circle cx={width / 2} cy={height / 2} r={86} fill="none" stroke={LIME} strokeOpacity={0.05} strokeWidth={1} />
          </>
        )}
        {drawn.map(({ l, c, far, hop }) => {
          const sel = selected === l.key;
          const color = sel ? LIME : linkColorForModule(far.node.module);
          return (
            <Path
              key={l.key}
              d={c.d}
              fill="none"
              stroke={color}
              strokeWidth={sel ? 2.4 : hop === 2 ? 1.2 : 1.6}
              strokeOpacity={(hop === 2 && !sel ? 0.5 : 0.75) * dim(l.key)}
              strokeDasharray={hop === 2 && !sel ? '2 4' : l.guessed ? '4 4' : undefined}
              strokeLinecap="round"
            />
          );
        })}
      </Svg>
      {mini
        ? null
        : drawn
            .filter(({ l, hop }) => l.word && (hop === 1 || selected === l.key))
            .map(({ l, c }) => (
              <Pressable
                key={`w${l.key}`}
                onPress={onTapLine ? () => onTapLine(l) : undefined}
                accessibilityRole="button"
                accessibilityLabel={`${l.word}${l.guessed ? ', to check' : ''}: where it came from`}
                hitSlop={8}
                style={{ position: 'absolute', left: c.px - 60, top: c.py - 10, width: 120, alignItems: 'center', zIndex: 2, opacity: dim(l.key), transform: [{ rotate: `${c.deg.toFixed(1)}deg` }] }}
              >
                <View style={{ height: 20, paddingHorizontal: 8, borderRadius: 999, backgroundColor: t.c.bg.ground, borderWidth: 1, borderStyle: l.guessed ? 'dashed' : 'solid', borderColor: selected === l.key ? LIME : 'rgba(245,245,247,0.22)', justifyContent: 'center' }}>
                  <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 9, lineHeight: 12, letterSpacing: 0.6, textTransform: 'uppercase', color: l.guessed ? t.c.fg.tertiary : t.c.fg.secondary }}>
                    {l.guessed ? `${l.word}?` : l.word}
                  </Text>
                </View>
              </Pressable>
            ))}
      {[...placed.values()].map((p) => label(p))}
      {[...placed.values()].map((p) => {
        const centreDisc = p.node.hop === 0;
        return (
          <Pressable
            key={p.node.id}
            onPress={onTapNode ? () => onTapNode(p.node) : undefined}
            onLongPress={onHoldNode ? () => onHoldNode(p.node) : undefined}
            accessibilityRole="button"
            accessibilityLabel={`${p.node.title}${p.node.guessed ? ', guessed' : ''}`}
            accessibilityHint={centreDisc ? undefined : 'Tap to centre on it, hold to open it'}
            style={{ position: 'absolute', left: p.x - p.size / 2, top: p.y - p.size / 2, width: p.size, height: p.size, zIndex: 3, opacity: selected ? 0.85 : 1 }}
          >
            {centreDisc ? (
              <View style={{ width: p.size, height: p.size, borderRadius: p.size / 2, borderWidth: 3, borderColor: LIME, alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.bg.ground }}>
                <LinkDisc node={p.node} size={p.size - 10} />
              </View>
            ) : (
              <View style={{ width: p.size, height: p.size, borderRadius: p.size / 2, borderWidth: 2, borderStyle: p.node.guessed ? 'dashed' : 'solid', borderColor: p.node.hop === 2 ? `${linkColorForModule(p.node.module)}88` : linkColorForModule(p.node.module), alignItems: 'center', justifyContent: 'center', backgroundColor: t.c.bg.ground }}>
                <LinkDisc node={p.node} size={p.size - 6} />
              </View>
            )}
            {!mini && p.node.more ? (
              <View pointerEvents="none" style={{ position: 'absolute', right: -8, top: -6, height: 18, paddingHorizontal: 6, borderRadius: 9, backgroundColor: t.c.fg.primary, justifyContent: 'center' }}>
                <Text style={{ fontSize: 10, lineHeight: 13, fontWeight: '800', color: t.c.bg.ground }}>+{p.node.more}</Text>
              </View>
            ) : null}
            {p.node.guessed ? (
              <View pointerEvents="none" style={{ position: 'absolute', left: -8, top: -6, width: 18, height: 18, borderRadius: 9, backgroundColor: CORAL, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '800', color: '#0B0B0D' }}>?</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
