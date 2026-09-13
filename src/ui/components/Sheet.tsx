import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { Text, IconButton } from './primitives';

/**
 * Bottom sheet modal. Deliberately built on RN Modal (no native sheet lib) so
 * it behaves identically on iOS, Android and web.
 */
export function Sheet({ visible, onClose, title, children, right, full, scroll = true }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode; right?: React.ReactNode; full?: boolean; scroll?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const body = (
    <View style={{ backgroundColor: t.colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: full ? '100%' : '90%', flex: full ? 1 : undefined, paddingBottom: insets.bottom, marginTop: full ? insets.top + 8 : 0 }}>
      <View style={{ alignItems: 'center', paddingTop: 8 }}>
        <View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: t.colors.fill }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}>
        <IconButton icon="xmark" onPress={onClose} bg color={t.colors.textSecondary} />
        <Text variant="headline" style={{ flex: 1, textAlign: 'center' }} numberOfLines={1}>
          {title ?? ''}
        </Text>
        <View style={{ minWidth: 32, alignItems: 'flex-end' }}>{right}</View>
      </View>
      {scroll ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{children}</View>
      )}
    </View>
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: t.colors.overlay }} onPress={onClose} />
        {body}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Simple action list sheet. */
export function ActionSheet({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title?: string; actions: Array<{ label: string; icon?: string; destructive?: boolean; onPress: () => void }> }) {
  const t = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        {actions.map((a) => (
          <Pressable
            key={a.label}
            onPress={() => {
              onClose();
              setTimeout(a.onPress, 150);
            }}
            style={({ pressed }) => ({ backgroundColor: pressed ? t.colors.fillSecondary : t.colors.card, borderRadius: t.radius.md, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 })}
          >
            <Text variant="body" color={a.destructive ? t.colors.danger : undefined}>
              {a.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}
