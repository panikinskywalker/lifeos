import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from './Button';
import { Surface } from './Surface';
import { Text } from './Text';

/**
 * Noir sheet (NR-KitComponents · Picker sheet): #1A1A1E, radius 32 top, a
 * 40×4 grabber, 17/600 title on the left with a round 40 close button, a soft
 * shadow over a dimmed page. RN Modal so it behaves the same on Android and web.
 */
export function Sheet({ visible, onClose, title, right, children, full, scroll = true, footer }: { visible: boolean; onClose: () => void; title?: string; right?: React.ReactNode; children: React.ReactNode; full?: boolean; scroll?: boolean; footer?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.c.bg.scrim }} onPress={onClose} />
        <View style={{ backgroundColor: t.dark ? t.c.bg.tile : t.c.bg.ground, borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet, maxHeight: full ? undefined : '88%', flex: full ? 1 : undefined, marginTop: full ? insets.top + 12 : 0, paddingBottom: Math.max(insets.bottom, 20), shadowColor: '#000', shadowOpacity: t.dark ? 0.5 : 0, shadowRadius: 40, shadowOffset: { width: 0, height: -10 }, elevation: t.dark ? 24 : 0 }}>
          <Surface kind={t.dark ? 'tile' : 'ground'}>
            <View style={{ alignItems: 'center', paddingTop: 12 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.dark ? '#F5F5F738' : t.c.line }} />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: t.layout.gutter, paddingTop: 14, paddingBottom: 14, gap: 12 }}>
              <Text variant="heading" style={{ flex: 1 }} numberOfLines={1} accessibilityRole="header">
                {title ?? ''}
              </Text>
              {right}
              <IconButton icon="x" onPress={onClose} accessibilityLabel="Close" filled size={40} />
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
