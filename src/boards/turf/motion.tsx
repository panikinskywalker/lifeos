import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Turf's small motions, from Turf web (turf-web/app/noir.css, globals.css):
 * the next match's pulse, the podium rising in, a tick that pops, a card that
 * slides and flips. One place, so every Turf screen moves the same way.
 */

/** A live dot with a ring that spreads and fades, over and over (match-next-pulse). */
export function Pulse({ color, size = 8 }: { color: string; size?: number }) {
  const ring = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [ring]);
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: ring.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0, 0] }), transform: [{ scale: ring.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 2.75, 2.75] }) }] }} />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />
    </View>
  );
}

/** Rises 18 and fades in once, after `delay` (cyberPodiumRise). */
export function RiseIn({ delay = 0, style, children }: { delay?: number; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 520, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, delay]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>{children}</Animated.View>;
}

/** Pops to 1.13 and back when `on` turns true (matchCheck). */
export function Pop({ on, style, children }: { on: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const s = useRef(new Animated.Value(1)).current;
  const was = useRef(on);
  useEffect(() => {
    if (on && !was.current) Animated.sequence([Animated.timing(s, { toValue: 1.13, duration: 110, useNativeDriver: true }), Animated.spring(s, { toValue: 1, damping: 9, stiffness: 260, useNativeDriver: true })]).start();
    was.current = on;
  }, [on, s]);
  return <Animated.View style={[style, { transform: [{ scale: s }] }]}>{children}</Animated.View>;
}

/**
 * A wallet card that slides to `top` and flips between its two faces (noir-wc /
 * noir-wi: .46s slide, .56s flip), growing from `frontH` to `backH` as it turns.
 */
export function FlipCard({ top, flipped, frontH, backH, style, front, back }: { top: number; flipped: boolean; frontH: number; backH: number; style?: StyleProp<ViewStyle>; front: React.ReactNode; back: React.ReactNode }) {
  const y = useRef(new Animated.Value(top)).current;
  const f = useRef(new Animated.Value(flipped ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(y, { toValue: top, duration: 460, easing: Easing.bezier(0.2, 0.8, 0.2, 1), useNativeDriver: false }).start();
  }, [top, y]);
  useEffect(() => {
    Animated.timing(f, { toValue: flipped ? 1 : 0, duration: 560, easing: Easing.bezier(0.3, 0.7, 0.2, 1), useNativeDriver: false }).start();
  }, [flipped, f]);
  const face = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backfaceVisibility: 'hidden' } as const;
  return (
    <Animated.View style={[style, { position: 'absolute', left: 0, right: 0, top: y, height: f.interpolate({ inputRange: [0, 1], outputRange: [frontH, backH] }) }]}>
      <Animated.View pointerEvents={flipped ? 'none' : 'auto'} style={[face, { transform: [{ perspective: 1400 }, { rotateY: f.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) }] }]}>
        {front}
      </Animated.View>
      <Animated.View pointerEvents={flipped ? 'auto' : 'none'} style={[face, { transform: [{ perspective: 1400 }, { rotateY: f.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] }) }] }]}>
        {back}
      </Animated.View>
    </Animated.View>
  );
}
