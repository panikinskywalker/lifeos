import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, View } from 'react-native';
import Svg, { Circle, Defs, Line, Path, Pattern, Rect } from 'react-native-svg';
import type { LinkOverview } from '@core/graph/overview';
import { Text } from '../kit';
import { useTheme } from '../theme/ThemeProvider';
import { monoFonts } from '../theme/tokens';
import { linkColorForModule } from '../theme/moduleTint';
import { LinkDisc } from './LinkMap';

const MONO = monoFonts[700];
const LIME = '#D7F55C';
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** How many of a sorted list are at or before `t`. */
export function countUntil(sorted: number[], t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Everything linked (the L6 artboard): each module a cloud of its records in
 * its colour, labelled with how many; the best-linked record in the middle
 * with lines out to each cloud's best record (Clusters), or every record
 * placed freely with the links between them (Free). `until` hides what was
 * filed later (the time-lapse); `module` lifts one cloud. Tap a record for
 * its Links; tap a cloud's name to pick that module.
 */
export function LinkCloud({ o, width, height, mode, until, module, onOpen, onModule }: { o: LinkOverview; width: number; height: number; mode: 'clusters' | 'free'; until: number; module: string | null; onOpen: (id: string) => void; onModule: (m: string | null) => void }) {
  const t = useTheme();
  const cx = width / 2;
  const cy = height / 2;
  const mods = o.modules.slice(0, 8);
  const pts = o.points.filter((p) => p.at <= until);
  const place = useMemo(() => {
    const out = new Map<string, { x: number; y: number; module: string }>();
    const centres = new Map<string, { x: number; y: number; a: number }>();
    mods.forEach((m, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, mods.length);
      centres.set(m.module, { x: cx + (width / 2 - 70) * Math.cos(a), y: cy + (height / 2 - 70) * Math.sin(a), a });
    });
    const byModule = new Map<string, typeof o.points>();
    for (const p of o.points) byModule.set(p.module, [...(byModule.get(p.module) ?? []), p]);
    for (const [m, list] of byModule) {
      const c = centres.get(m) ?? { x: cx, y: cy, a: 0 };
      list.forEach((p, k) => {
        if (mode === 'clusters') {
          const r = 9 * Math.sqrt(k + 1);
          out.set(p.id, { x: c.x + r * Math.cos(k * GOLDEN), y: c.y + r * Math.sin(k * GOLDEN), module: m });
        } else {
          // Free: spread over the whole map, leaning towards its module's side.
          const idx = o.points.indexOf(p);
          const r = Math.min(width, height) * 0.46 * Math.sqrt((idx + 1) / o.points.length);
          const x = cx + r * Math.cos(idx * GOLDEN);
          const y = cy + r * Math.sin(idx * GOLDEN) * (height / width);
          out.set(p.id, { x: x * 0.7 + c.x * 0.3, y: y * 0.7 + c.y * 0.3, module: m });
        }
      });
    }
    return { out, centres };
  }, [o, width, height, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const hub = pts[0];
  const shownIds = new Set(pts.map((p) => p.id));
  const dim = (m: string) => (module && module !== m ? 0.2 : 1);
  return (
    <View style={{ width, height, overflow: 'hidden' }} accessibilityLabel={`Everything linked: ${pts.length} records shown`}>
      <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
        <Defs>
          <Pattern id="cloudDots" width={22} height={22} patternUnits="userSpaceOnUse">
            <Circle cx={11} cy={11} r={1} fill={t.dark ? '#FFFFFF' : '#000000'} fillOpacity={0.07} />
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#cloudDots)" />
        {mode === 'free'
          ? o.edges
              .filter((e) => shownIds.has(e.from) && shownIds.has(e.to) && e.at <= until)
              .map((e, i) => {
                const a = place.out.get(e.from);
                const b = place.out.get(e.to);
                return a && b ? <Line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={t.c.fg.primary} strokeOpacity={0.14} strokeWidth={1} /> : null;
              })
          : hub
            ? mods.map((m) => {
                const best = m.top.find((x) => shownIds.has(x.id) && x.id !== hub.id);
                const a = place.out.get(hub.id);
                const b = best ? place.out.get(best.id) : undefined;
                if (!a || !b) return null;
                const qx = (a.x + b.x) / 2 - (b.y - a.y) * 0.12;
                const qy = (a.y + b.y) / 2 + (b.x - a.x) * 0.12;
                return <Path key={m.module} d={`M ${a.x} ${a.y} Q ${qx} ${qy} ${b.x} ${b.y}`} fill="none" stroke={linkColorForModule(m.module)} strokeWidth={1.4} strokeOpacity={0.9 * dim(m.module)} />;
              })
            : null}
        {pts.map((p) => {
          const at = place.out.get(p.id);
          if (!at) return null;
          const r = mode === 'free' ? 3 + Math.min(5, p.links / 2) : 5;
          return <Circle key={p.id} cx={at.x} cy={at.y} r={r} fill={linkColorForModule(p.module)} opacity={dim(p.module)} />;
        })}
      </Svg>
      {pts.map((p) => {
        const at = place.out.get(p.id);
        if (!at) return null;
        return <Pressable key={`h${p.id}`} onPress={() => onOpen(p.id)} accessibilityRole="button" accessibilityLabel={p.title} style={{ position: 'absolute', left: at.x - 11, top: at.y - 11, width: 22, height: 22 }} />;
      })}
      {mode === 'clusters'
        ? mods.map((m) => {
            const c = place.centres.get(m.module);
            if (!c) return null;
            const n = countUntil(m.times, until);
            const top = c.y < cy;
            return (
              <Pressable key={`m${m.module}`} onPress={() => onModule(module === m.module ? null : m.module)} accessibilityRole="button" accessibilityLabel={`${m.module}: ${n} records`} style={{ position: 'absolute', left: c.x - 70, width: 140, alignItems: 'center', ...(top ? { top: Math.max(4, c.y - 58) } : { top: Math.min(height - 20, c.y + 42) }), opacity: dim(m.module) }}>
                <Text numberOfLines={1} style={{ fontFamily: MONO, fontSize: 10, lineHeight: 13, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: linkColorForModule(m.module) }}>
                  {moduleName(m.module)} · {n.toLocaleString('en-IN')}
                </Text>
              </Pressable>
            );
          })
        : pts.slice(0, 8).map((p) => {
            const at = place.out.get(p.id);
            if (!at) return null;
            return (
              <Text key={`t${p.id}`} pointerEvents="none" numberOfLines={1} style={{ position: 'absolute', left: at.x - 50, top: at.y + 9, width: 100, textAlign: 'center', fontSize: 10, lineHeight: 13, fontWeight: '600', color: t.c.fg.secondary }}>
                {p.title}
              </Text>
            );
          })}
      {mode === 'clusters' && hub
        ? (() => {
            const at = place.out.get(hub.id);
            if (!at) return null;
            return (
              <Pressable onPress={() => onOpen(hub.id)} accessibilityRole="button" accessibilityLabel={`${hub.title}, the most linked`} style={{ position: 'absolute', left: at.x - 60, top: at.y - 40, width: 120, alignItems: 'center', gap: 4, zIndex: 3 }}>
                <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '800', color: t.c.fg.primary }}>{hub.title}</Text>
                <View style={{ borderRadius: 22, borderWidth: 2, borderColor: LIME, padding: 2, backgroundColor: t.c.bg.ground }}>
                  <LinkDisc node={{ id: hub.id, type: hub.type, title: hub.title, module: hub.module }} size={36} />
                </View>
              </Pressable>
            );
          })()
        : null}
    </View>
  );
}

const NAMES: Record<string, string> = { crm: 'People', finance: 'Money', places: 'Places', projects: 'Events', travel: 'Trips', games: 'Turf', health: 'Body', habits: 'Habits', assets: 'Things', inventory: 'Home', deliveries: 'Deliveries', documents: 'Documents', knowledge: 'Notes' };
export const moduleName = (m: string) => NAMES[m] ?? m.charAt(0).toUpperCase() + m.slice(1);

/**
 * The time-lapse (L6): Play runs from the first record filed to today in
 * four seconds; drag the bar to any moment. Shows the month at the handle.
 */
export function TimeLapse({ first, last, value, onChange }: { first: number; last: number; value: number; onChange: (t: number) => void }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const [playing, setPlaying] = useState(false);
  const span = Math.max(1, last - first);
  const frac = Math.min(1, Math.max(0, (value - first) / span));
  const wRef = useRef(0);
  wRef.current = w;
  const startFrac = useRef(0);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          setPlaying(false);
          startFrac.current = wRef.current ? e.nativeEvent.locationX / wRef.current : 0;
          onChange(first + span * Math.min(1, Math.max(0, startFrac.current)));
        },
        onPanResponderMove: (_, g) => {
          const f = startFrac.current + (wRef.current ? g.dx / wRef.current : 0);
          onChange(first + span * Math.min(1, Math.max(0, f)));
        },
      }),
    [first, span, onChange],
  );
  useEffect(() => {
    if (!playing) return;
    const from = frac >= 1 ? 0 : frac;
    const t0 = Date.now();
    let raf = 0;
    const step = () => {
      const f = Math.min(1, from + (Date.now() - t0) / 4000);
      onChange(first + span * f);
      if (f < 1) raf = requestAnimationFrame(step);
      else setPlaying(false);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps
  const month = (ms: number) => new Date(ms).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  return (
    <View style={{ padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 15, lineHeight: 19, fontWeight: '600', color: t.c.fg.primary }}>Time-lapse</Text>
          <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '500', color: t.c.fg.secondary }}>records appear in the order they were filed</Text>
        </View>
        <Pressable onPress={() => setPlaying(!playing)} accessibilityRole="button" accessibilityLabel={playing ? 'Pause' : 'Play'} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: LIME, alignItems: 'center', justifyContent: 'center' }}>
          <Svg width={16} height={16} viewBox="0 0 16 16">
            {playing ? (
              <>
                <Rect x={3} y={2} width={3.5} height={12} rx={1} fill="#0B0B0D" />
                <Rect x={9.5} y={2} width={3.5} height={12} rx={1} fill="#0B0B0D" />
              </>
            ) : (
              <Path d="M4 2.5 L13.5 8 L4 13.5 Z" fill="#0B0B0D" />
            )}
          </Svg>
        </Pressable>
      </View>
      <View {...responder.panHandlers} onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 26, justifyContent: 'center' }} accessibilityRole="adjustable" accessibilityLabel={`Up to ${month(value)}`}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.07)' }}>
          <View style={{ width: `${frac * 100}%`, height: 6, borderRadius: 3, backgroundColor: LIME }} />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', left: frac * w - 8, top: 5, width: 16, height: 16, borderRadius: 8, backgroundColor: t.c.fg.primary }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>{month(first)}</Text>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 16, fontWeight: '700', color: t.c.fg.primary }}>{frac >= 1 ? 'today' : month(value)}</Text>
        <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>today</Text>
      </View>
    </View>
  );
}
