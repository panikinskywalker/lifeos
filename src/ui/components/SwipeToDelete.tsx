import React, { useRef } from 'react';
import { Pressable, View } from 'react-native';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../icons';
import { Text } from '../kit';

/**
 * Swipe a row left to reveal Delete (M4 polish). A long swipe deletes at
 * once; the caller shows the Undo toast, so nothing is lost by a slip.
 */
export function SwipeToDelete({ onDelete, children, label = 'Delete' }: { onDelete: () => void; children: React.ReactNode; label?: string }) {
  const t = useTheme();
  const ref = useRef<SwipeableMethods>(null);
  const del = () => {
    ref.current?.close();
    onDelete();
  };
  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={1.6}
      rightThreshold={44}
      overshootRight={false}
      onSwipeableWillOpen={(dir) => {
        if (dir === 'left') return;
      }}
      renderRightActions={() => (
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={del} style={{ width: 92, justifyContent: 'center', alignItems: 'center', backgroundColor: t.c.alert.coral, borderRadius: t.radius.tile, marginLeft: 8, gap: 2 }}>
          <Icon name="trash" size={18} color="#FFFFFF" />
          <Text variant="labelMicro" color="#FFFFFF" style={{ textTransform: 'uppercase' }}>
            {label}
          </Text>
        </Pressable>
      )}
    >
      <View>{children}</View>
    </ReanimatedSwipeable>
  );
}
