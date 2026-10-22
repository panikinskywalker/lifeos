import React from 'react';
import { Pressable, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Icon, Text, useToast } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';

/**
 * Turf · Noir shared pieces (TF-Pieces): the section switcher — Home · Games ·
 * the lime + (New match) · Players · Venues, a charcoal pill with the current
 * section white — and the copy / share pair every due and match text uses.
 */

export type TurfSection = 'index' | 'games' | 'players' | 'venues';

const SECTIONS: Array<{ key: TurfSection; label: string }> = [
  { key: 'index', label: 'Home' },
  { key: 'games', label: 'Games' },
  { key: 'players', label: 'Players' },
  { key: 'venues', label: 'Venues' },
];

export function Switcher({ active }: { active: TurfSection }) {
  const t = useTheme();
  const router = useRouter();
  const tab = (s: (typeof SECTIONS)[number]) => {
    const on = s.key === active;
    return (
      <Pressable key={s.key} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => !on && router.replace(`/board/turf${s.key === 'index' ? '' : `/${s.key}`}` as never)} style={{ flex: 1, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.c.fg.primary : 'transparent' }}>
        <Text variant="label" color={on ? t.c.bg.ground : 'secondary'} style={{ fontSize: 13, lineHeight: 17, fontWeight: '700' }}>
          {s.label}
        </Text>
      </Pressable>
    );
  };
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4, borderRadius: 999, backgroundColor: t.c.bg.tile }}>
      {SECTIONS.slice(0, 2).map(tab)}
      <Pressable accessibilityRole="button" accessibilityLabel="New match" onPress={() => router.push('/board/turf/match' as never)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="plus" size={20} color={t.c.accent.mustardInk} />
      </Pressable>
      {SECTIONS.slice(2).map(tab)}
    </View>
  );
}

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
