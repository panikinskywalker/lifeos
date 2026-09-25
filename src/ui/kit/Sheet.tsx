import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from './Button';
import { Surface } from './Surface';
import { Text } from './Text';

/**
 * Canvas sheet: ground colour, radius 24 top, 40×4 grabber, 20/800 title on
 * the left with a round close button, 28% scrim, no shadow. RN Modal so it
 * behaves the same on Android and web.
 */
export function Sheet({ visible, onClose, title, right, children, full, scroll = true, footer }: { visible: boolean; onClose: () => void; title?: string; right?: React.ReactNode; children: React.ReactNode; full?: boolean; scroll?: boolean; footer?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.c.bg.scrim }} onPress={onClose} />
        <View style={{ backgroundColor: t.c.bg.ground, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet, maxHeight: full ? undefined : '88%', flex: full ? 1 : undefined, marginTop: full ? insets.top + 12 : 0, paddingBottom: Math.max(insets.bottom, 20) }}>
          <Surface kind="ground">
            <View style={{ alignItems: 'center', paddingTop: 12 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.c.line }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.layout.gutter, paddingTop: 16, paddingBottom: 16, gap: 12 }}>
              <Text variant="heading" style={{ flex: 1, fontSize: 20, lineHeight: 26 }} numberOfLines={1} accessibilityRole="header">
                {title ?? ''}
              </Text>
              {right}
              <IconButton icon="x" onPress={onClose} accessibilityLabel="Close" filled size={36} />
            </View>
            {scroll ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: t.layout.gutter, paddingBottom: 8, gap: 16 }}>
                {children}
              </ScrollView>
            ) : (
              <View style={{ flex: full ? 1 : undefined, paddingHorizontal: t.layout.gutter, gap: 16 }}>{children}</View>
            )}
            {footer ? <View style={{ paddingHorizontal: t.layout.gutter, paddingTop: 12 }}>{footer}</View> : null}
          </Surface>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
