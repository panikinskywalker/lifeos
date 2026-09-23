import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from './Button';
import { Text } from './Text';

/**
 * Bottom sheet on RN Modal (same behaviour on Android and web). Raised
 * surface, 20 px top corners, grabber, title row with close, scrim tap closes.
 */
export function Sheet({ visible, onClose, title, right, children, full, scroll = true, footer }: { visible: boolean; onClose: () => void; title?: string; right?: React.ReactNode; children: React.ReactNode; full?: boolean; scroll?: boolean; footer?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.c.bg.scrim }} onPress={onClose} />
        <View style={{ backgroundColor: t.c.bg.tileRaised, borderTopLeftRadius: t.radius.tile, borderTopRightRadius: t.radius.tile, maxHeight: full ? undefined : '88%', flex: full ? 1 : undefined, marginTop: full ? insets.top + 12 : 0, paddingBottom: Math.max(insets.bottom, 12) }}>
          <View style={{ alignItems: 'center', paddingTop: 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: t.c.line }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8, gap: 8, minHeight: 56 }}>
            <IconButton icon="x" onPress={onClose} accessibilityLabel="Close" filled />
            <Text variant="heading" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1} accessibilityRole="header">
              {title ?? ''}
            </Text>
            <View style={{ minWidth: 40, alignItems: 'flex-end' }}>{right}</View>
          </View>
          {scroll ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: t.layout.gutter, paddingBottom: 16, gap: 16 }}>
              {children}
            </ScrollView>
          ) : (
            <View style={{ flex: full ? 1 : undefined, paddingHorizontal: t.layout.gutter }}>{children}</View>
          )}
          {footer ? <View style={{ paddingHorizontal: t.layout.gutter, paddingTop: 8 }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
