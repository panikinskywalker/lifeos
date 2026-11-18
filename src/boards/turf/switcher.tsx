import React from 'react';
import { Pressable, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Icon, useToast } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';

/**
 * Turf · Noir shared pieces (TF-Pieces): the copy / share pair every due and
 * match text uses. The section switcher is the bottom bar inside Turf now
 * (docs/MODEL.md, The bar inside a board; `bar` in ./index).
 */

/** Copy puts the text on the clipboard (with a toast); Share opens the sheet. */
export function useCopyShare() {
  const toast = useToast();
  return {
    copy: async (text: string, what = 'Copied') => {
      await Clipboard.setStringAsync(text);
      toast.show({ message: what, icon: 'check' });
    },
    share: (text: string) => void Share.share({ message: text }).catch(() => {}),
  };
}

/** The copy · share pair: two round 40 buttons. */
export function CopyShare({ text, what }: { text: string | null | undefined; what?: string }) {
  const t = useTheme();
  const { copy, share } = useCopyShare();
  if (!text) return null;
  const btn = (icon: string, label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
      <Icon name={icon} size={18} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {btn('file', 'Copy', () => void copy(text, what))}
      {btn('share', 'Share', () => share(text))}
    </View>
  );
}
