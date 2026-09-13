import React, { useCallback, useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Long-press-and-drag reorderable list with fixed row height. Used for the
 * dashboard's edit mode (like iOS Health › Edit Favourites). Uniform heights
 * keep the maths trivial and the gesture reliable on both platforms.
 */
export function SortableList<T extends { id: string }>({ data, rowHeight, renderItem, onReorder, style }: { data: T[]; rowHeight: number; renderItem: (item: T, dragging: boolean) => React.ReactNode; onReorder: (ids: string[]) => void; style?: StyleProp<ViewStyle> }) {
  const positions = useSharedValue<Record<string, number>>(Object.fromEntries(data.map((d, i) => [d.id, i])));
  useEffect(() => {
    positions.value = Object.fromEntries(data.map((d, i) => [d.id, i]));
  }, [data, positions]);

  const commit = useCallback(
    (pos: Record<string, number>) => {
      const ids = Object.entries(pos)
        .sort((a, b) => a[1] - b[1])
        .map(([id]) => id);
      onReorder(ids);
    },
    [onReorder],
  );

  return (
    <View style={[{ height: data.length * rowHeight }, style]}>
      {data.map((item) => (
        <SortableRow key={item.id} id={item.id} count={data.length} rowHeight={rowHeight} positions={positions} commit={commit}>
          {(dragging) => renderItem(item, dragging)}
        </SortableRow>
      ))}
    </View>
  );
}

function SortableRow({ id, count, rowHeight, positions, commit, children }: { id: string; count: number; rowHeight: number; positions: SharedValue<Record<string, number>>; commit: (pos: Record<string, number>) => void; children: (dragging: boolean) => React.ReactNode }) {
  const y = useSharedValue(positions.value[id] * rowHeight);
  const dragging = useSharedValue(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const startY = useSharedValue(0);

  useEffect(() => {
    if (!dragging.value) y.value = withTiming(positions.value[id] * rowHeight, { duration: 180 });
  });

  const haptic = () => {
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const gesture = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      dragging.value = true;
      startY.value = y.value;
      runOnJS(setIsDragging)(true);
      runOnJS(haptic)();
    })
    .onUpdate((e) => {
      y.value = startY.value + e.translationY;
      const newIndex = Math.max(0, Math.min(count - 1, Math.round(y.value / rowHeight)));
      const cur = positions.value[id];
      if (newIndex !== cur) {
        const next = { ...positions.value };
        for (const k of Object.keys(next)) {
          if (k === id) continue;
          if (cur < newIndex && next[k] > cur && next[k] <= newIndex) next[k] -= 1;
          else if (cur > newIndex && next[k] >= newIndex && next[k] < cur) next[k] += 1;
        }
        next[id] = newIndex;
        positions.value = next;
      }
    })
    .onFinalize(() => {
      dragging.value = false;
      y.value = withSpring(positions.value[id] * rowHeight, { damping: 20, stiffness: 200 });
      runOnJS(setIsDragging)(false);
      runOnJS(commit)(positions.value);
    });

  const animStyle = useAnimatedStyle(() => {
    const target = positions.value[id] * rowHeight;
    return {
      position: 'absolute',
      left: 0,
      right: 0,
      height: rowHeight,
      top: 0,
      zIndex: dragging.value ? 100 : 1,
      transform: [{ translateY: dragging.value ? y.value : withTiming(target, { duration: 180 }) }, { scale: withTiming(dragging.value ? 1.03 : 1, { duration: 120 }) }],
      shadowOpacity: withTiming(dragging.value ? 0.18 : 0, { duration: 120 }),
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: dragging.value ? 6 : 0,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={animStyle}>{children(isDragging)}</Animated.View>
    </GestureDetector>
  );
}
