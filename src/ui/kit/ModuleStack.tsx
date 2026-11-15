import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { Text } from './Text';
import { DotNumber } from './KitCharts';

export interface StackItem {
  key: string;
  title: string;
  /** Under the title on the open card ("Pune in 41 days"). */
  line?: string;
  /** In dot numerals on the open card ("41 DAYS"). */
  headline?: string;
  icon: IconName | (string & {});
  tint: TintKey;
  onPress: () => void;
}

const CARD = 170;
const STRIP = 54;
const SPRING = { damping: 18, stiffness: 180, mass: 0.9, useNativeDriver: true } as const;

/** A 160° module gradient behind a card (NR-KitComponents · Module stack). Sized in numbers: Android's svg left "100%" short of the card. */
function Gradient({ id, from, to, width, height }: { id: string; from: string; to: string; width: number; height: number }) {
  return (
    <Svg style={{ position: 'absolute', top: 0, left: 0 }} width={width} height={height}>
      <Defs>
        <LinearGradient id={id} x1="0.33" y1="0" x2="0.67" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

/** One card: it springs down when a card above it opens, squeezes a little under the finger, and fades its dots in when it opens. */
function Card({ it, i, open, isOpen, last, width, onPress }: { it: StackItem; i: number; open: number; isOpen: boolean; last: boolean; width: number; onPress: () => void }) {
  const t = useTheme();
  const shift = useRef(new Animated.Value(i > open ? CARD - STRIP : 0)).current;
  const press = useRef(new Animated.Value(1)).current;
  // The last card is never covered, so it always shows its line and number.
  const shown = isOpen || last;
  const reveal = useRef(new Animated.Value(shown ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(shift, { toValue: i > open ? CARD - STRIP : 0, ...SPRING }).start();
  }, [open, i, shift]);
  useEffect(() => {
    Animated.timing(reveal, { toValue: shown ? 1 : 0, duration: shown ? 360 : 120, delay: shown ? 120 : 0, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [shown, reveal]);
  const squeeze = (to: number) => Animated.spring(press, { toValue: to, damping: 20, stiffness: 400, mass: 0.6, useNativeDriver: true }).start();
  const [from, to] = t.gradients[it.tint];
  const inner = width - 32;
  const cols = it.headline ? it.headline.length * 6 - 1 : 0;
  const pitch = cols ? Math.min(7.5, inner / cols) : 7.5;
  return (
    <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: i * STRIP, height: CARD, transform: [{ translateY: shift }, { scale: press }], shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 6 + i, borderRadius: t.radius.tile }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={isOpen ? `${it.title}${it.line ? `, ${it.line}` : ''}. Open` : `${it.title}. Show`}
        onPressIn={() => squeeze(0.975)}
        onPressOut={() => squeeze(1)}
        onPress={onPress}
        style={{ flex: 1, borderRadius: t.radius.tile, overflow: 'hidden', padding: 16 }}
      >
        <Gradient id={`stack-${it.key}`} from={from} to={to} width={width} height={CARD} />
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="tileTitle" color="#F5F5F7" numberOfLines={1}>
              {it.title}
            </Text>
            {it.line ? (
              <Animated.View style={{ opacity: reveal }}>
                <Text variant="caption" color="#F5F5F79E" numberOfLines={1} style={{ fontWeight: '500' }}>
                  {it.line}
                </Text>
              </Animated.View>
            ) : null}
          </View>
          <Icon name={isOpen ? 'chevron-right' : it.icon} size={20} color="#F5F5F7" />
        </View>
        {it.headline ? (
          <Animated.View style={{ alignItems: 'center', paddingTop: 12, opacity: reveal, transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
            <DotNumber text={it.headline} pitch={pitch} color="#F5F5F7" />
          </Animated.View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

/**
 * Noir module stack (Browse, NR-KitComponents): each module a gradient card,
 * 28 corners, overlapping so each shows a 54 strip with its name. One card is
 * open, showing its line and a headline in dot numerals (the last card, never
 * covered, always shows them). Tap a strip and it
 * springs open in place (the cards below slide down); tap the open card to go in.
 */
export function ModuleStack({ items }: { items: StackItem[] }) {
  const [open, setOpen] = useState(items.length - 1);
  const [width, setWidth] = useState(340);
  const at = Math.min(open, items.length - 1);
  // Taller while a card above the last is open: the cards below it slide down, and the page moves with them.
  const target = items.length ? CARD + (items.length - 1) * STRIP + (at < items.length - 1 ? CARD - STRIP : 0) : 0;
  const height = useRef(new Animated.Value(target)).current;
  useEffect(() => {
    Animated.spring(height, { toValue: target, ...SPRING, useNativeDriver: false }).start();
  }, [target, height]);
  return (
    <Animated.View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {items.map((it, i) => (
        <Card
          key={it.key}
          it={it}
          i={i}
          open={at}
          isOpen={i === at}
          last={i === items.length - 1}
          width={width}
          onPress={() => {
            if (i === at) return it.onPress();
            void Haptics.selectionAsync().catch(() => {});
            setOpen(i);
          }}
        />
      ))}
    </Animated.View>
  );
}
