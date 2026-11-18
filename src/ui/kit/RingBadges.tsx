import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../icons';
import { Text } from './Text';
import { mixColor, ringSegments } from './layout';

export interface RingPart {
  key: string;
  label: string;
  value: number;
  color: string;
  icon?: string;
  onPress?: () => void;
}

/**
 * The kit's "Ring with badges · the big one" (NR-KitCharts, ref 8): a 256
 * ring of round-capped arcs, each part's icon inside its own segment, the
 * total in the middle, an optional action under it, and the breakdown that
 * expands below (icon disc, name, share, a bar, the amount).
 */
export function RingBadges({ parts, total, caption, format, action, open: initiallyOpen = true, accessibilityLabel }: { parts: RingPart[]; total: string; caption: string; format: (n: number) => string; action?: { label: string; onPress: () => void }; open?: boolean; accessibilityLabel?: string }) {
  const t = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const live = parts.filter((p) => p.value > 0);
  const sum = live.reduce((a, p) => a + p.value, 0) || 1;
  const ring = ringSegments(live.map((p) => p.value));
  const disc = (c: string) => mixColor(c, t.c.bg.tile, 0.28);
  return (
    <View style={{ padding: 16, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 12 }}>
      <View accessible accessibilityRole="image" accessibilityLabel={accessibilityLabel ?? `${total} ${caption}`} style={{ width: ring.size, height: ring.size, alignSelf: 'center' }}>
        <Svg width={ring.size} height={ring.size} style={{ position: 'absolute' }}>
          {ring.segments.map((s) => (
            <Path key={live[s.index]!.key} d={s.d} stroke={live[s.index]!.color} strokeWidth={ring.stroke} strokeLinecap="round" fill="none" />
          ))}
        </Svg>
        {ring.segments.map((s) => {
          const p = live[s.index]!;
          return p.icon ? (
            <View key={`i-${p.key}`} pointerEvents="none" style={{ position: 'absolute', left: s.icon.x - 8.5, top: s.icon.y - 8.5, width: 17, height: 17 }}>
              <Icon name={p.icon} size={17} color={mixColor(p.color, '#000000', 0.38)} />
            </View>
          ) : null;
        })}
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 46, lineHeight: 47, fontWeight: '700', letterSpacing: -1.5, fontVariant: ['tabular-nums'], maxWidth: 150 }}>{total}</Text>
          <Text color="secondary" style={{ fontSize: 13, lineHeight: 17 }}>{caption}</Text>
        </View>
      </View>
      {action ? (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={({ pressed }) => ({ height: 44, paddingHorizontal: 22, borderRadius: 999, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.accent.mustardInk }}>{action.label}</Text>
          </Pressable>
        </View>
      ) : null}
      <View style={{ height: 1, backgroundColor: t.c.line }} />
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Breakdown, ${live.length} categories`} onPress={() => setOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>Breakdown</Text>
          <Text color="tertiary" style={{ fontSize: 13, lineHeight: 17 }}>{live.length} {live.length === 1 ? 'category' : 'categories'}</Text>
        </View>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron-down" size={18} color={t.c.fg.primary} />
        </View>
      </Pressable>
      {open ? (
        <View style={{ gap: 4 }}>
          {live.map((p) => {
            const share = p.value / sum;
            const row = (
              <>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: disc(p.color), alignItems: 'center', justifyContent: 'center' }}>
                  {p.icon ? <Icon name={p.icon} size={17} color={p.color} /> : null}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{p.label}</Text>
                    <Text color="tertiary" style={{ fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'] }}>{Math.round(share * 100)}%</Text>
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: t.c.ringTrack, overflow: 'hidden' }}>
                    <View style={{ width: `${Math.max(2, share * 100)}%`, height: '100%', borderRadius: 4, backgroundColor: p.color }} />
                  </View>
                </View>
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ width: 72, textAlign: 'right', fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{format(p.value)}</Text>
              </>
            );
            const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, minHeight: 48 };
            return p.onPress ? (
              <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={`${p.label}, ${format(p.value)}, ${Math.round(share * 100)}%`} onPress={p.onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]}>
                {row}
              </Pressable>
            ) : (
              <View key={p.key} style={style}>
                {row}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
