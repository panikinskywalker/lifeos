import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { blocks } from '../theme/tokens';
import { Text } from './Text';

/** The Noir kit's letter disc and section head (NR-Money-*, Splitwise): shared by Money and the Splitwise board. */

const DISC_COLORS = [blocks.yellow, blocks.mint, blocks.lilac, blocks.sky, blocks.pink, '#FF9F5A', '#FF8A6A', '#6FD3C8'];

/** A merchant's or person's colour: fixed per name or id. */
export function discColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return DISC_COLORS[h % DISC_COLORS.length]!;
}

/** A disc with the first letter (40 in a row, 56 on a record, 32 or 28 in a chip). */
export function Disc({ name, colorKey, size = 40 }: { name: string; colorKey?: string; size?: number }) {
  const letter = name.trim().match(/\p{L}|\p{N}/u)?.[0]?.toUpperCase() ?? '?';
  const fontSize = size >= 56 ? 22 : size >= 40 ? 15 : size >= 32 ? 12 : 11;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: discColor(colorKey ?? name), alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text style={{ fontSize, lineHeight: fontSize + 4, fontWeight: '700', color: '#0B0B0D' }}>{letter}</Text>
    </View>
  );
}

/** Section head: 17/600 title, a 13/400 line under it, an optional link on the right. */
export function SectionHead({ title, sub, action, chevron, lime, onAction }: { title: string; sub?: string | null; action?: string; chevron?: boolean; lime?: boolean; onAction?: () => void }) {
  const t = useTheme();
  const tone = lime ? t.c.accent.gold : t.c.fg.secondary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="heading" accessibilityRole="header">{title}</Text>
        {sub ? <Text variant="caption" color="secondary" numberOfLines={1}>{sub}</Text> : null}
      </View>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={14} onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: tone }}>{action}</Text>
          {chevron ? <Icon name="chevron-right" size={14} color={tone} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}
