import React from 'react';
import { ScrollView, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useBottomBarInset } from './BottomBar';
import { IconButton } from './Button';
import { Text } from './Text';

/**
 * Canvas screen header: optional round back button inline on the left, a
 * 30/800 title with a 14/600 subtitle under it, round actions on the right.
 */
export function ScreenHeader({ title, subtitle, eyebrow, onBack, right, compact }: { title: string; subtitle?: string | null; /** @deprecated use subtitle */ eyebrow?: string; onBack?: () => void; right?: React.ReactNode; /** 26px title, as Today's greeting */ compact?: boolean }) {
  const sub = subtitle ?? eyebrow;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {onBack ? <IconButton icon="chevron-left" accessibilityLabel="Back" filled onPress={onBack} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text variant="title" numberOfLines={2} accessibilityRole="header" style={compact ? { fontSize: 26, lineHeight: 29 } : undefined}>
          {title}
        </Text>
        {sub ? (
          <Text variant="caption" color="secondary" numberOfLines={1} style={{ fontSize: 14, lineHeight: 18 }}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>{right}</View> : null}
    </View>
  );
}

/**
 * Screen scaffold on the ground colour: safe-area top, the header, then blocks
 * 18 apart inside the 20 gutter. `tab` leaves room for the floating bottom bar.
 */
export function Screen({ title, subtitle, eyebrow, onBack, right, header, tab, scroll = true, children, contentStyle, compact, ...scrollProps }: Omit<ScrollViewProps, 'children'> & { title?: string; subtitle?: string | null; eyebrow?: string; onBack?: () => void; right?: React.ReactNode; header?: React.ReactNode; tab?: boolean; scroll?: boolean; children?: React.ReactNode; contentStyle?: StyleProp<ViewStyle>; compact?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const barInset = useBottomBarInset();
  const bottom = tab ? barInset : insets.bottom + 24;
  const head = title ? <ScreenHeader title={title} subtitle={subtitle ?? eyebrow} onBack={onBack} right={right} compact={compact} /> : null;
  const body = (
    <View style={[{ paddingHorizontal: t.layout.gutter, paddingTop: header ? 20 : insets.top + 12, gap: 18 }, contentStyle]}>
      {head}
      {children}
    </View>
  );
  if (!scroll) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
        {header}
        <View style={{ flex: 1, paddingBottom: bottom }}>{body}</View>
      </View>
    );
  }
  return (
    <ScrollView {...scrollProps} style={[{ flex: 1, backgroundColor: t.c.bg.ground }, scrollProps.style]} contentContainerStyle={{ paddingBottom: bottom }} keyboardShouldPersistTaps="handled">
      {header}
      {body}
    </ScrollView>
  );
}
