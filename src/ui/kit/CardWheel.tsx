import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Text } from './Text';

export interface WheelCard {
  key: string;
  title: string;
  /** Top right: the kind ("Bank", "You owe"). */
  corner?: string;
  amount: string;
  /** Bottom right ("•••• 1234"). */
  tail?: string;
  /** A small line on the card in front ("bank said, 14 Nov"). */
  note?: string;
  /** What to use it for ("Amazon, Flipkart"), under the name on the card in front. */
  use?: string;
  /** A card that needs you (a late bill) wears coral whatever its face. */
  alert?: boolean;
}

const CARD_H = 204;
/** How far apart the cards sit as the wheel turns: what shows of each card behind. */
const STEP = 46;
const SHOWN = 4;
const SPRING = { useNativeDriver: true, friction: 6, tension: 140 } as const;

/** Each card's face: its colour, the colour of its pattern, and its ink. */
const FACES: Array<{ bg: string; art: string; ink: string }> = [
  { bg: '#E9E5DC', art: '#E0592C', ink: '#0B0B0D' },
  { bg: '#D7F55C', art: '#2F6B3A', ink: '#0B0B0D' },
  { bg: '#A9C4FF', art: '#1A3FA8', ink: '#0B0B0D' },
  { bg: '#F4A8CE', art: '#B4266E', ink: '#0B0B0D' },
  { bg: '#F6E27F', art: '#E08A1E', ink: '#0B0B0D' },
  { bg: '#C9A7F5', art: '#4C2A99', ink: '#0B0B0D' },
  { bg: '#9FE0B5', art: '#0F6B5A', ink: '#0B0B0D' },
  { bg: '#2A2A30', art: '#D7F55C', ink: '#F5F5F7' },
  { bg: '#F26B2B', art: '#7A1E10', ink: '#0B0B0D' },
  { bg: '#D9CBB4', art: '#3B3B42', ink: '#0B0B0D' },
];
const ALERT = { bg: '#FF8A7A', art: '#8A1A12', ink: '#0B0B0D' };
const ARTS = 8;

/** A small stable number from the card's key, for its face, pattern and how crooked it sits. */
function seed(key: string): number {
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Cards on a wheel (docs/MODEL.md, Money redesign: Accounts and cards;
 * Rutvij's reference, 16 Nov). The card in focus is full size in the middle;
 * the others stack behind it, their tops above and their amounts below,
 * smaller, tilted away and a little crooked, like a real pile on the iOS time
 * picker. Every card has its own colour and pattern. Scrolling turns the wheel
 * and snaps card by card with a tick; cards fan in when the screen opens and
 * give under your finger; tap a card behind to bring it forward, the front one
 * to open it.
 */
export function CardWheel({ cards, onOpen, onFocus, initial = 0 }: { cards: WheelCard[]; onOpen: (key: string) => void; onFocus?: (key: string) => void; initial?: number }) {
  const y = useRef(new Animated.Value(initial * STEP)).current;
  const scroll = useRef<ScrollView>(null);
  const [front, setFront] = useState(initial);
  const [width, setWidth] = useState(350);
  const placed = useRef(false);
  const height = CARD_H + 2 * SHOWN * STEP;
  const top = (height - CARD_H) / 2;

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
    useNativeDriver: true,
    listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.max(0, Math.min(cards.length - 1, Math.round(e.nativeEvent.contentOffset.y / STEP)));
      if (i !== front) {
        setFront(i);
        void Haptics.selectionAsync().catch(() => {});
        onFocus?.(cards[i]!.key);
      }
    },
  });
  const goTo = (i: number) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    scroll.current?.scrollTo({ y: i * STEP, animated: true });
  };

  return (
    <View
      style={{ height }}
      onLayout={(e) => {
        setWidth(e.nativeEvent.layout.width);
        // Android ignores contentOffset: start on the card asked for once laid out.
        if (!placed.current) {
          placed.current = true;
          requestAnimationFrame(() => scroll.current?.scrollTo({ y: initial * STEP, animated: false }));
        }
      }}
    >
      <Animated.ScrollView ref={scroll} nestedScrollEnabled showsVerticalScrollIndicator={false} snapToInterval={STEP} decelerationRate="fast" contentOffset={{ x: 0, y: initial * STEP }} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={{ height: (cards.length - 1) * STEP + height }}>
        {cards.map((c, i) => (
          <WheelSlot key={c.key} card={c} index={i} y={y} top={top} width={width} isFront={i === front} depth={Math.abs(i - front)} onPress={() => (i === front ? onOpen(c.key) : goTo(i))} />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

function WheelSlot({ card: c, index: i, y, top, width, isFront, depth, onPress }: { card: WheelCard; index: number; y: Animated.Value; top: number; width: number; isFront: boolean; depth: number; onPress: () => void }) {
  const s = seed(c.key);
  const face = c.alert ? ALERT : FACES[s % FACES.length]!;
  // Fan in when the screen opens, a few at a time.
  const appear = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 420, delay: Math.min(depth, 6) * 45, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Where this card sits from the front, in cards: negative above, positive below.
  const d = Animated.divide(Animated.subtract(i * STEP, y), STEP);
  const range = [-SHOWN - 1, -2, -1, 0, 1, 2, SHOWN + 1];
  const scale = Animated.multiply(d.interpolate({ inputRange: range, outputRange: [0.74, 0.86, 0.93, 1, 0.93, 0.86, 0.74], extrapolate: 'clamp' }), press);
  const rotateX = d.interpolate({ inputRange: [-SHOWN - 1, 0, SHOWN + 1], outputRange: ['38deg', '0deg', '-38deg'], extrapolate: 'clamp' });
  // A little crooked behind, straight in front.
  const tilt = ((s % 7) - 3) * 0.7;
  const rotateZ = d.interpolate({ inputRange: [-2, -1, 0, 1, 2], outputRange: [`${tilt}deg`, `${tilt}deg`, '0deg', `${tilt}deg`, `${tilt}deg`], extrapolate: 'clamp' });
  const shift = ((Math.floor(s / 7) % 9) - 4) * 2.5;
  const translateX = d.interpolate({ inputRange: [-2, -1, 0, 1, 2], outputRange: [shift, shift, 0, shift, shift], extrapolate: 'clamp' });
  const opacity = Animated.multiply(d.interpolate({ inputRange: [-SHOWN - 1, -SHOWN, SHOWN, SHOWN + 1], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }), appear);
  const translateY = appear.interpolate({ inputRange: [0, 1], outputRange: [40, 0] });
  const muted = face.ink === '#0B0B0D' ? 'rgba(11,11,13,0.62)' : 'rgba(245,245,247,0.7)';
  const [whole, paise] = c.amount.split('.');
  const [first, ...rest] = c.title.split(' ');
  return (
    <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: top + i * STEP, height: CARD_H, zIndex: 100 - depth, elevation: 100 - depth, opacity, transform: [{ perspective: 900 }, { translateY }, { translateX }, { rotateX }, { rotateZ }, { scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${c.title}${c.tail ? `, ${c.tail}` : ''}, ${c.amount}${c.use ? `, use for ${c.use}` : ''}${isFront ? '. Opens it' : '. Brings it to the front'}`}
        onPressIn={() => Animated.spring(press, { ...SPRING, toValue: 0.965 }).start()}
        onPressOut={() => Animated.spring(press, { ...SPRING, toValue: 1 }).start()}
        onPress={() => {
          if (isFront) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onPress();
        }}
        style={{ flex: 1, borderRadius: 26, backgroundColor: face.bg, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } }}
      >
        <Art kind={c.alert ? 0 : Math.floor(s / 63) % ARTS} color={face.art} width={width} />
        <View style={{ flex: 1, paddingHorizontal: 18, paddingVertical: 14, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, lineHeight: 21, letterSpacing: -0.4, color: face.ink }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: face.ink }}>{first}</Text>
              {rest.length ? <Text style={{ fontSize: 17, fontWeight: '400', color: face.ink }}>{` ${rest.join(' ')}`}</Text> : null}
            </Text>
            {c.corner ? <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: muted }}>{c.corner}</Text> : null}
          </View>
          {isFront && c.use ? <Text numberOfLines={1} style={{ marginTop: -8, fontSize: 13, lineHeight: 17, fontWeight: '600', color: muted }}>{`Use for ${c.use}`}</Text> : null}
          {isFront && c.note ? <Text style={{ alignSelf: 'flex-start', fontSize: 12, lineHeight: 16, fontWeight: '700', color: face.ink, backgroundColor: face.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' }}>{c.note}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ flex: 1, letterSpacing: -1.4, color: face.ink, fontVariant: ['tabular-nums'] }}>
              <Text style={{ fontSize: 38, lineHeight: 42, fontWeight: '700', color: face.ink }}>{whole}</Text>
              {paise ? <Text style={{ fontSize: 17, fontWeight: '600', color: face.ink }}>{`.${paise}`}</Text> : null}
            </Text>
            {c.tail ? <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: muted, fontVariant: ['tabular-nums'], letterSpacing: 0.5 }}>{c.tail}</Text> : null}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** One of eight bold patterns across a card, in the card's art colour. */
function Art({ kind, color, width: w }: { kind: number; color: string; width: number }) {
  const h = CARD_H;
  const r = h * 0.3;
  const cy = h * 0.5;
  let shapes: React.ReactNode = null;
  switch (kind) {
    case 0: // three rounds, half, half and whole (the reference)
      shapes = (
        <>
          <Path d={`M${w * 0.42} ${cy - r} A ${r} ${r} 0 0 0 ${w * 0.42} ${cy + r} Z`} fill={color} />
          <Path d={`M${w * 0.58} ${cy - r} A ${r} ${r} 0 0 0 ${w * 0.58} ${cy + r} Z`} fill={color} opacity={0.85} />
          <Circle cx={w * 0.58 + r} cy={cy} r={r} fill={color} />
        </>
      );
      break;
    case 1: // diagonal stripes
      shapes = (
        <>
          {Array.from({ length: 9 }, (_, k) => (
            <Rect key={k} x={w * 0.35 + k * 26} y={-40} width={11} height={h + 80} fill={color} opacity={0.18 + (k % 3) * 0.2} transform={`rotate(24 ${w * 0.35 + k * 26} ${h / 2})`} />
          ))}
        </>
      );
      break;
    case 2: // rings from the corner
      shapes = (
        <>
          {[1, 0.78, 0.56, 0.34].map((f, k) => (
            <Circle key={k} cx={w * 0.92} cy={h * 0.95} r={h * 0.9 * f} fill="none" stroke={color} strokeWidth={14} opacity={0.35 + k * 0.18} />
          ))}
        </>
      );
      break;
    case 3: // quarter rounds in a grid
      shapes = (
        <>
          {Array.from({ length: 6 }, (_, k) => {
            const x = w * 0.46 + (k % 3) * 56;
            const yy = h * 0.22 + Math.floor(k / 3) * 56;
            const rot = (k * 90) % 360;
            return <Path key={k} d={`M${x} ${yy} h56 a56 56 0 0 1 -56 56 Z`} fill={color} opacity={k % 2 ? 0.55 : 1} transform={`rotate(${rot} ${x + 28} ${yy + 28})`} />;
          })}
        </>
      );
      break;
    case 4: // a field of dots, bigger to the right
      shapes = (
        <>
          {Array.from({ length: 60 }, (_, k) => {
            const col = k % 12;
            const row = Math.floor(k / 12);
            return <Circle key={k} cx={w * 0.38 + col * 18} cy={h * 0.2 + row * 24} r={1.5 + col * 0.45} fill={color} />;
          })}
        </>
      );
      break;
    case 5: // waves
      shapes = (
        <>
          {[0, 1, 2].map((k) => (
            <Path key={k} d={`M0 ${h * 0.5 + k * 22} C ${w * 0.25} ${h * 0.2 + k * 22}, ${w * 0.5} ${h * 0.8 + k * 22}, ${w} ${h * 0.4 + k * 22} V ${h} H 0 Z`} fill={color} opacity={0.25 + k * 0.25} />
          ))}
        </>
      );
      break;
    case 6: // a mountain and its sun
      shapes = (
        <>
          <Circle cx={w * 0.72} cy={h * 0.38} r={h * 0.18} fill={color} opacity={0.5} />
          <Path d={`M${w * 0.3} ${h} L${w * 0.58} ${h * 0.42} L${w * 0.75} ${h * 0.7} L${w * 0.86} ${h * 0.55} L${w * 1.05} ${h} Z`} fill={color} />
        </>
      );
      break;
    default: // a half sun of rays
      shapes = (
        <>
          {Array.from({ length: 9 }, (_, k) => {
            const a = Math.PI + (k / 8) * Math.PI;
            const x2 = w * 0.75 + Math.cos(a) * h * 0.95;
            const y2 = h * 1.02 + Math.sin(a) * h * 0.95;
            return <Path key={k} d={`M${w * 0.75} ${h * 1.02} L${x2} ${y2}`} stroke={color} strokeWidth={16} strokeLinecap="round" opacity={0.3 + (k % 3) * 0.25} />;
          })}
          <Circle cx={w * 0.75} cy={h * 1.02} r={h * 0.28} fill={color} />
        </>
      );
  }
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}>
      <Svg width={w} height={h}>{shapes}</Svg>
    </View>
  );
}
