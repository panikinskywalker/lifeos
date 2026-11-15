import React, { useRef, useState } from 'react';
import { Animated, Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Text } from './Text';

export interface WheelCard {
  key: string;
  /** The card's colour; everything on it is ink. */
  color: string;
  title: string;
  /** Top right: the kind, or the last digits. */
  corner?: string;
  amount: string;
  /** Bottom right, after the amount ("•••• 1234"). */
  tail?: string;
  /** A small line under the title on the card in front ("bank said, 14 Nov"). */
  note?: string;
}

const INK = '#0B0B0D';
const CARD_H = 200;
/** How far apart the cards sit as the wheel turns: what shows of each card behind. */
const STEP = 46;
const SHOWN = 4;

/**
 * Cards on a wheel (docs/MODEL.md, Money redesign: Accounts and cards; Rutvij's
 * reference, 16 Nov): the card in focus full size in the middle, the others
 * stacked behind it, their tops above and their amounts below, smaller and
 * tilted away the further they are, like the iOS time picker. Scrolling turns
 * the wheel and it snaps card by card with a tick; tap a card behind to bring
 * it to the front, tap the front one to open it.
 */
export function CardWheel({ cards, onOpen, onFocus, initial = 0 }: { cards: WheelCard[]; onOpen: (key: string) => void; onFocus?: (key: string) => void; initial?: number }) {
  const y = useRef(new Animated.Value(initial * STEP)).current;
  const scroll = useRef<ScrollView>(null);
  const [front, setFront] = useState(initial);
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
  const goTo = (i: number) => scroll.current?.scrollTo({ y: i * STEP, animated: true });

  return (
    <View style={{ height }}>
      <Animated.ScrollView
        ref={scroll}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={STEP}
        decelerationRate="fast"
        contentOffset={{ x: 0, y: initial * STEP }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ height: (cards.length - 1) * STEP + height }}
      >
        {cards.map((c, i) => {
          // Where this card sits from the front, in cards: negative above, positive below.
          const d = Animated.divide(Animated.subtract(i * STEP, y), STEP);
          const range = [-SHOWN - 1, -2, -1, 0, 1, 2, SHOWN + 1];
          const scale = d.interpolate({ inputRange: range, outputRange: [0.74, 0.86, 0.93, 1, 0.93, 0.86, 0.74], extrapolate: 'clamp' });
          const rotateX = d.interpolate({ inputRange: [-SHOWN - 1, 0, SHOWN + 1], outputRange: ['38deg', '0deg', '-38deg'], extrapolate: 'clamp' });
          const opacity = d.interpolate({ inputRange: [-SHOWN - 1, -SHOWN, SHOWN, SHOWN + 1], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' });
          const isFront = i === front;
          return (
            <Animated.View key={c.key} style={{ position: 'absolute', left: 0, right: 0, top: top + i * STEP, height: CARD_H, zIndex: 100 - Math.abs(i - front), elevation: 100 - Math.abs(i - front), opacity, transform: [{ perspective: 900 }, { rotateX }, { scale }] }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`${c.title}${c.tail ? `, ${c.tail}` : ''}, ${c.amount}${isFront ? '. Opens it' : '. Brings it to the front'}`} onPress={() => (isFront ? onOpen(c.key) : goTo(i))} style={{ flex: 1, borderRadius: 26, backgroundColor: c.color, paddingHorizontal: 18, paddingVertical: 14, justifyContent: 'space-between', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } }}>
                <Art />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, lineHeight: 20, fontWeight: '700', letterSpacing: -0.3, color: INK }}>{c.title}</Text>
                  {c.corner ? <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: 'rgba(11,11,13,0.7)' }}>{c.corner}</Text> : null}
                </View>
                {isFront && c.note ? <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: 'rgba(11,11,13,0.7)', marginTop: -36 }}>{c.note}</Text> : null}
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ flex: 1, fontSize: 34, lineHeight: 38, fontWeight: '700', letterSpacing: -1.2, color: INK, fontVariant: ['tabular-nums'] }}>{c.amount}</Text>
                  {c.tail ? <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: '600', color: 'rgba(11,11,13,0.7)', fontVariant: ['tabular-nums'] }}>{c.tail}</Text> : null}
                </View>
              </Pressable>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

/** The bold shapes across each card, as in the reference: three rounds in a darker shade of the card. */
function Art() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 30, bottom: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: 92, height: 92, borderTopLeftRadius: 46, borderBottomLeftRadius: 46, backgroundColor: 'rgba(11,11,13,0.12)' }} />
      <View style={{ width: 92, height: 92, borderTopLeftRadius: 46, borderBottomLeftRadius: 46, backgroundColor: 'rgba(11,11,13,0.18)' }} />
      <View style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: 'rgba(11,11,13,0.24)' }} />
    </View>
  );
}
