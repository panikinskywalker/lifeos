import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from 'd3-force';
import type { GraphEdge, GraphNode } from '@core/graph/read';
import { edgeLabel } from '@core/graph/edges';
import { useTheme } from '../theme/ThemeProvider';
import { tintForModule } from '../theme/moduleTint';

type SimNode = GraphNode & SimulationNodeDatum;
type SimLink = SimulationLinkDatum<SimNode> & { kind: string; fromId: string; toId: string };

const RADIUS = [24, 17, 11];

/** Text with a halo in the card colour, so labels stay readable over lines. */
function Label({ halo, ...p }: React.ComponentProps<typeof SvgText> & { halo: string }) {
  return (
    <>
      <SvgText {...p} fill={halo} stroke={halo} strokeWidth={3} strokeLinejoin="round" />
      <SvgText {...p} />
    </>
  );
}
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Force layout, run to rest up front (≤ 40 nodes: a few ms), centre pinned at 0,0. */
function layout(nodes: GraphNode[], edges: GraphEdge[]) {
  const sim: SimNode[] = nodes.map((n) => ({ ...n, ...(n.hop === 0 ? { fx: 0, fy: 0 } : {}) }));
  const links: SimLink[] = edges.map((e) => ({ source: e.from, target: e.to, kind: e.kind, fromId: e.from, toId: e.to }));
  const s = forceSimulation(sim)
    .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance((l) => (Math.max((l.source as SimNode).hop, (l.target as SimNode).hop) === 1 ? 90 : 70)).strength(0.7))
    .force('charge', forceManyBody().strength(-260))
    .force('collide', forceCollide<SimNode>((d) => RADIUS[d.hop]! + 18))
    .force('x', forceX(0).strength(0.04))
    .force('y', forceY(0).strength(0.04))
    .stop();
  for (let i = 0; i < 300; i++) s.tick();
  return { sim, links };
}

/**
 * The graph around a record (docs/GRAPH.md §5): the record in the middle,
 * what's linked to it around, their links further out. Tinted by module;
 * link words on the centre's lines. Tap a node to re-centre, long-press to
 * open it.
 */
export function GraphView({ nodes, edges, height = 360, onSelect, onOpen, labels = true }: { nodes: GraphNode[]; edges: GraphEdge[]; height?: number; onSelect?: (id: string) => void; onOpen?: (n: GraphNode) => void; labels?: boolean }) {
  const t = useTheme();
  const { sim, links } = useMemo(() => layout(nodes, edges), [nodes, edges]);
  const centre = nodes.find((n) => n.hop === 0);
  if (!centre) return null;
  const pad = 56;
  const xs = sim.map((n) => n.x ?? 0);
  const ys = sim.map((n) => n.y ?? 0);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(Math.max(...xs) + pad - minX, 200);
  const h = Math.max(Math.max(...ys) + pad - minY, 160);
  const byId = new Map(sim.map((n) => [n.id, n]));
  return (
    <View style={{ height, borderRadius: 24, backgroundColor: t.c.bg.container, overflow: 'hidden' }} accessibilityLabel={`Graph around ${centre.title}: ${nodes.length - 1} linked`}>
      <Svg width="100%" height="100%" viewBox={`${minX} ${minY} ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
        {links.map((l, i) => {
          const a = byId.get(l.fromId);
          const b = byId.get(l.toId);
          if (!a || !b) return null;
          const touchesCentre = a.hop === 0 || b.hop === 0;
          return (
            <G key={`e${i}`}>
              <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={touchesCentre ? t.c.fg.tertiary : t.c.line} strokeWidth={touchesCentre ? 1.5 : 1} />
              {labels && touchesCentre ? (
                <Label halo={t.c.bg.container} x={((a.x ?? 0) + (b.x ?? 0)) / 2} y={((a.y ?? 0) + (b.y ?? 0)) / 2 + 3} fontSize={9} fill={t.c.fg.secondary} textAnchor="middle" fontFamily={t.type.labelMicro.fontFamily}>
                  {edgeLabel(l.kind, a.hop === 0 ? 'out' : 'in').toLowerCase()}
                </Label>
              ) : null}
            </G>
          );
        })}
        {sim.map((n) => {
          const tint = t.tints[tintForModule(n.module ?? undefined)];
          const r = RADIUS[n.hop] ?? 10;
          return (
            <G key={n.id} onPress={onSelect ? () => onSelect(n.id) : undefined} onLongPress={onOpen ? () => onOpen(n) : undefined}>
              <Circle cx={n.x} cy={n.y} r={r + 10} fill="transparent" />
              <Circle cx={n.x} cy={n.y} r={r} fill={n.hop === 0 ? t.c.accent.mustard : tint.fill} stroke={n.hop === 0 ? t.c.accent.mustardInk : tint.ink} strokeWidth={n.hop === 0 ? 2 : 1} />
              <SvgText x={n.x} y={(n.y ?? 0) + 4} fontSize={n.hop === 0 ? 13 : 10} fontWeight="700" fill={n.hop === 0 ? t.c.accent.mustardInk : tint.ink} textAnchor="middle" fontFamily={t.type.label.fontFamily}>
                {n.title.trim().charAt(0).toUpperCase()}
              </SvgText>
              {labels || n.hop < 2 ? (
                <Label halo={t.c.bg.container} x={n.x} y={(n.y ?? 0) + r + 13} fontSize={n.hop === 0 ? 12 : 10} fontWeight={n.hop === 0 ? '700' : '600'} fill={n.hop === 2 ? t.c.fg.secondary : t.c.fg.primary} textAnchor="middle" fontFamily={t.type.label.fontFamily}>
                  {clip(n.title, n.hop === 0 ? 22 : 16)}
                </Label>
              ) : null}
            </G>
          );
        })}
      </Svg>
    </View>
  );
}
