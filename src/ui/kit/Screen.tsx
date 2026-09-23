import React from 'react';
import { ScrollView, View, type ScrollViewProps, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { useBottomBarInset } from './BottomBar';
import { IconButton } from './Button';
import { Text } from './Text';

/** Large screen title with an optional back button, caption above and actions at the right. */
export function ScreenHeader({ title, eyebrow, onBack, right }: { title: string; eyebrow?: string; onBack?: () => void; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ paddingHorizontal: t.layout.gutter, paddingTop: 8, paddingBottom: 12, gap: 4 }}>
      {onBack ? (
        <View style={{ marginLeft: -12, marginBottom: 4 }}>
          <IconButton icon="chevron-left" accessibilityLabel="Back" onPress={onBack} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flex: 1 }}>
          {eyebrow ? (
            <Text variant="label" color="secondary">
              {eyebrow}
            </Text>
          ) : null}
          <Text variant="title" numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
        </View>
        {right ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: -4 }}>{right}</View> : null}
      </View>
    </View>
  );
}

/**
 * Screen scaffold on the ground colour: safe-area top, ScreenHeader, gutter,
 * 16 px rhythm between blocks. `tab` leaves room for the floating bottom bar.
 */
export function Screen({ title, eyebrow, onBack, right, header, tab, scroll = true, children, contentStyle, ...scrollProps }: Omit<ScrollViewProps, 'children'> & { title?: string; eyebrow?: string; onBack?: () => void; right?: React.ReactNode; header?: React.ReactNode; tab?: boolean; scroll?: boolean; children?: React.ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const barInset = useBottomBarInset();
  const bottom = tab ? barInset : insets.bottom + 24;
  const head = header ?? (title ? <ScreenHeader title={title} eyebrow={eyebrow} onBack={onBack} right={right} /> : null);
  const body = <View style={[{ paddingHorizontal: t.layout.gutter, gap: 16 }, contentStyle]}>{children}</View>;
  if (!scroll) {
    return (
      <View style={{ flex: 1, backgroundColor: t.c.bg.ground, paddingTop: header ? 0 : insets.top }}>
        {head}
        <View style={{ flex: 1, paddingBottom: bottom }}>{body}</View>
      </View>
    );
  }
  return (
    <ScrollView {...scrollProps} style={[{ flex: 1, backgroundColor: t.c.bg.ground }, scrollProps.style]} contentContainerStyle={{ paddingTop: header ? 0 : insets.top, paddingBottom: bottom }} keyboardShouldPersistTaps="handled">
      {head}
      {body}
    </ScrollView>
  );
}
