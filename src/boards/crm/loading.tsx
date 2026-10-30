import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@ui/theme/ThemeProvider';
import { FilterChip, Icon, IconButton, ScreenHeader, Text } from '@ui/kit';

/**
 * Loading (NR-People-Loading, Parts G6): bones of white 7 % with a sweep of
 * light across them every 1.6 s (none with Reduce motion). The People home
 * keeps its header, search and filters real and shows its sections in bones;
 * a person is the photo in shimmer under the sheet's bones.
 */

const Sweep = createContext<Animated.Value | null>(null);

function useSweep(): Animated.Value {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (!live || reduce) return;
      loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.linear, useNativeDriver: true }));
      loop.start();
    });
    return () => {
      live = false;
      loop?.stop();
    };
  }, [v]);
  return v;
}

/** One bone: a quiet block; the sweep crosses it left to right. */
export function Bone({ w, h, r = 4, style }: { w: DimensionValue; h: DimensionValue; r?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const sweep = useContext(Sweep);
  const [width, setWidth] = useState(0);
  return (
    <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))} style={[{ width: w, height: h, borderRadius: r, backgroundColor: t.dark ? 'rgba(255,255,255,0.07)' : t.c.bg.dim, overflow: 'hidden', flexShrink: 0 }, style]}>
      {sweep && width ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width, transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-width, width] }) }] }}>
          <Svg width={width} height="100%">
            <Defs>
              <LinearGradient id="pshim" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.07} />
                <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#pshim)" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** G6 · loading rows: a card of face-and-two-lines rows with a chip, hairlines between. */
export function LoadingRows({ widths = [[170, 114], [130, 74], [150, 94]], minHeight = 56 }: { widths?: Array<[number, number]>; minHeight?: number }) {
  const t = useTheme();
  return (
    <View style={{ padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 8 }}>
      {widths.map(([a, b], i) => (
        <React.Fragment key={i}>
          {i ? <View style={{ height: 1, backgroundColor: t.c.line }} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight }}>
            <Bone w={40} h={40} r={20} />
            <View style={{ flex: 1, gap: 8 }}>
              <Bone w={a} h={14} style={{ maxWidth: '100%' }} />
              <Bone w={b} h={10} style={{ maxWidth: '100%' }} />
            </View>
            <Bone w={56} h={28} r={999} />
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

function Heading({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary, paddingTop: 6, paddingHorizontal: 4 }}>{children}</Text>;
}

/** The People home while it loads: "Loading…", the search and filters, the Due strip, Call or message and Birthdays in bones. */
export function PeopleHomeLoading() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const sweep = useSweep();
  return (
    <Sweep.Provider value={sweep}>
      <View accessibilityLabel="Loading people" accessibilityState={{ busy: true }} style={{ flex: 1, backgroundColor: t.c.bg.ground, paddingTop: insets.top + 16, paddingHorizontal: t.layout.gutter, gap: 24 }}>
        <ScreenHeader
          title="People"
          subtitle="Loading…"
          right={
            <>
              <IconButton icon="bell" filled accessibilityLabel="To check" disabled />
              <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel="Add a person" disabled />
            </>
          }
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: t.c.line }}>
          <Icon name="search" size={18} color={t.c.fg.tertiary} />
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '500', color: t.c.fg.tertiary }}>Name, company, city or UPI ID</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, overflow: 'hidden', marginHorizontal: -t.layout.gutter, paddingHorizontal: t.layout.gutter }}>
          <FilterChip label="Everyone" selected />
          <FilterChip label="Family" />
          <FilterChip label="Friends" />
          <FilterChip label="Work" />
        </View>
        <View style={{ gap: 10 }}>
          <Heading>Due</Heading>
          <View style={{ flexDirection: 'row', gap: 6, overflow: 'hidden' }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={{ width: 56, alignItems: 'center', gap: 8 }}>
                <Bone w={56} h={56} r={28} />
                <Bone w={36} h={8} />
              </View>
            ))}
          </View>
        </View>
        <View style={{ gap: 10 }}>
          <Heading>Call or message</Heading>
          <LoadingRows />
        </View>
        <View style={{ gap: 10 }}>
          <Heading>Birthdays coming up</Heading>
          <LoadingRows widths={[[140, 84], [180, 124]]} />
        </View>
      </View>
    </Sweep.Provider>
  );
}

/** A person while they load: the photo in shimmer, the sheet over it with the name, the three facts, the action pills and two rows in bones. */
export function PersonLoading({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const sweep = useSweep();
  const row = (a: number, b: number) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
      <Bone w={40} h={40} r={20} />
      <View style={{ flex: 1, gap: 8 }}>
        <Bone w={a} h={14} />
        <Bone w={b} h={10} />
      </View>
      <Bone w={56} h={28} r={999} />
    </View>
  );
  return (
    <Sweep.Provider value={sweep}>
      <View accessibilityLabel="Loading" accessibilityState={{ busy: true }} style={[{ flex: 1, overflow: 'hidden', backgroundColor: t.c.bg.tile }, style]}>
        <Bone w="100%" h="100%" r={0} style={{ position: 'absolute', top: 0, left: 0 }} />
        <View style={{ position: 'absolute', left: 0, right: 0, top: 220, bottom: 0, paddingVertical: 22, paddingHorizontal: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: t.c.bg.ground, gap: 14 }}>
          <Bone w={200} h={36} r={6} />
          <Bone w={140} h={36} r={6} />
          <View style={{ flexDirection: 'row', gap: 14 }}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={{ flex: 1 }}>
                <Bone w="100%" h={44} r={6} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Bone w={80} h={40} r={999} />
            <Bone w={100} h={40} r={999} />
            <Bone w={70} h={40} r={999} />
          </View>
          {row(170, 114)}
          {row(130, 74)}
        </View>
      </View>
    </Sweep.Provider>
  );
}
