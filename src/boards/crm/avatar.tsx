import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Text } from '@ui/kit';
import { blocks } from '@ui/theme/tokens';

/**
 * A person's disc (NR-KitRecords · People strip): their photo, or their
 * initial on a colour block. Ink on a block is ground-black.
 */

/** The strip's colours in its order: yellow, pink, sky, mint, lilac, salmon (salmon is the artboard's own, not a token). */
const DISCS = [blocks.yellow, blocks.pink, blocks.sky, blocks.mint, blocks.lilac, '#FFB1A1'];

export function discColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return DISCS[h % DISCS.length]!;
}

export function Avatar({ id, name, photo, size = 56, ring, dot, style }: { id: string; name: string; photo?: string | null; size?: number; ring?: string; dot?: string; style?: StyleProp<ViewStyle> }) {
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  // The lime ring: 2px of ground, then 2px of lime (box-shadow 0 0 0 2px #0B0B0D, 0 0 0 4px #D7F55C). "transparent" keeps the footprint so a strip lines up.
  const ringed = ring ? { borderWidth: 2, borderColor: ring, padding: 2, borderRadius: size / 2 + 4 } : null;
  return (
    <View style={[{ position: 'relative' }, style]}>
      <View style={ringed}>
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: discColor(id), alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {photo ? (
            <Image source={{ uri: photo }} style={{ width: size, height: size }} contentFit="cover" accessibilityIgnoresInvertColors />
          ) : (
            <Text style={{ fontSize: Math.round(size * 0.36), lineHeight: Math.round(size * 0.46), fontWeight: '700', color: '#0B0B0D' }}>{initial}</Text>
          )}
        </View>
      </View>
      {dot ? <View style={{ position: 'absolute', right: ring ? 2 : -2, bottom: ring ? 2 : -2, width: 16, height: 16, borderRadius: 8, backgroundColor: dot, borderWidth: 2, borderColor: '#0B0B0D' }} /> : null}
    </View>
  );
}
