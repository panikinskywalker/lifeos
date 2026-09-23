import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

/**
 * Titled card (radius 16) for record sections and settings groups. `flush`
 * drops the inner padding so RowItems can run edge to edge.
 */
export function SectionCard({ title, action, onAction, children, flush, style }: { title?: string; action?: string; onAction?: () => void; children: React.ReactNode; flush?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ gap: 8 }, style]}>
      {title || action ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 28, paddingHorizontal: 4 }}>
          <Text variant="label" color="secondary" style={{ flex: 1 }} accessibilityRole="header">
            {title ?? ''}
          </Text>
          {action ? (
            <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={12} onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text variant="label">{action}</Text>
              <Icon name="chevron-right" size={16} color={t.c.fg.primary} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.card, overflow: 'hidden', padding: flush ? 0 : 16, paddingVertical: flush ? 4 : 16 }}>{children}</View>
    </View>
  );
}
