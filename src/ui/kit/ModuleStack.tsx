import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { Text } from './Text';

export interface StackItem {
  key: string;
  title: string;
  /** Shown on every strip (right) and under the title on the open card. */
  line?: string;
  icon: IconName | (string & {});
  tint: TintKey;
  onPress: () => void;
}

const CARD = 170;
const STRIP = 54;

/** A 160° module gradient behind a card (NR-KitComponents · Module stack). */
function Gradient({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0.33" y1="0" x2="0.67" y2="1">
          <Stop offset="0" stopColor={from} />
          <Stop offset="1" stopColor={to} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

/**
 * Noir module stack (Browse): each module a gradient card, 28 corners, the
 * cards overlapping so each shows a 54 strip with its name, the last one open
 * with its line; a soft shadow lifts each over the one before.
 */
export function ModuleStack({ items }: { items: StackItem[] }) {
  const t = useTheme();
  return (
    <View style={{ height: items.length ? CARD + (items.length - 1) * STRIP : 0 }}>
      {items.map((it, i) => {
        const open = i === items.length - 1;
        const [from, to] = t.gradients[it.tint];
        return (
          <Pressable
            key={it.key}
            accessibilityRole="button"
            accessibilityLabel={it.line ? `${it.title}, ${it.line}` : it.title}
            onPress={it.onPress}
            style={({ pressed }) => ({ position: 'absolute', left: 0, right: 0, top: i * STRIP, height: CARD, borderRadius: t.radius.tile, overflow: 'hidden', padding: 16, opacity: pressed ? 0.9 : 1, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 24, shadowOffset: { width: 0, height: -8 }, elevation: 6 + i })}
          >
            <Gradient id={`stack-${it.key}`} from={from} to={to} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="tileTitle" color="#F5F5F7" numberOfLines={1}>
                  {it.title}
                </Text>
                {open && it.line ? (
                  <Text variant="caption" color="#F5F5F79E" numberOfLines={1} style={{ fontWeight: '500' }}>
                    {it.line}
                  </Text>
                ) : null}
              </View>
              {!open && it.line ? (
                <Text variant="caption" color="#F5F5F79E" numberOfLines={1}>
                  {it.line}
                </Text>
              ) : null}
              <Icon name={it.icon} size={20} color="#F5F5F7" />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
