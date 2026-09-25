import React from 'react';
import { Pressable, TextInput, View, type TextStyle } from 'react-native';
import { Icon } from '../icons';
import { useTheme } from '../theme/ThemeProvider';

/** Canvas composer: 50-high field, a mic button in the tile colour, a mustard send button. */
export function Composer({ value, onChange, onSend, onMic, placeholder = 'What happened?', disabled }: { value: string; onChange: (v: string) => void; onSend: () => void; onMic?: () => void; placeholder?: string; disabled?: boolean }) {
  const t = useTheme();
  const canSend = !!value.trim() && !disabled;
  const square = { width: 50, height: 50, borderRadius: t.radius.card, alignItems: 'center' as const, justifyContent: 'center' as const };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
      <TextInput
        accessibilityLabel="Tell your agent what happened"
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.c.fg.tertiary}
        selectionColor={t.c.accent.mustard}
        multiline
        onSubmitEditing={canSend ? onSend : undefined}
        submitBehavior="submit"
        returnKeyType="send"
        style={[t.type.body as TextStyle, { flex: 1, minHeight: 50, maxHeight: 120, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, color: t.c.fg.primary }]}
      />
      {onMic ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Speak" onPress={onMic} style={({ pressed }) => [square, { backgroundColor: t.c.bg.tile, opacity: pressed ? 0.75 : 1 }]}>
          <Icon name="mic" size={22} color={t.c.fg.primary} />
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Send" accessibilityState={{ disabled: !canSend }} disabled={!canSend} onPress={onSend} style={({ pressed }) => [square, { backgroundColor: t.c.accent.mustard, opacity: !canSend ? 0.45 : pressed ? 0.8 : 1 }]}>
        <Icon name="arrow-up" size={22} color={t.c.accent.mustardInk} />
      </Pressable>
    </View>
  );
}
