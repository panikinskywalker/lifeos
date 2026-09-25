import React from 'react';
import { Pressable, View } from 'react-native';
import type { IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface TimelineEntry {
  id: string;
  title: string;
  /** Second line: when, where, details. */
  body?: string | null;
  /** Kept for callers; the canvas draws a dot, not an icon. */
  icon?: IconName | (string & {});
  /** Appended to the second line (who did it). */
  meta?: string;
  /** Trailing amount. */
  value?: string;
  /** Dot colour; defaults by actor (agent lavender, automation sky, you ink). */
  color?: string;
  actor?: 'user' | 'assistant' | 'automation' | 'system';
  onPress?: () => void;
}

/** Canvas timeline: 10px dots on a 2px rail, 15/700 title, 13/600 detail, amount on the right. */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  const t = useTheme();
  return (
    <View>
      {entries.map((e, i) => {
        const dot = e.color ?? (e.actor === 'assistant' ? t.tints.memory.ink : e.actor === 'automation' ? t.tints.tasks.ink : t.c.fg.secondary);
        const last = i === entries.length - 1;
        const second = [e.body, e.meta].filter(Boolean).join(' · ');
        return (
          <Pressable key={e.id} disabled={!e.onPress} onPress={e.onPress} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 12, alignItems: 'center' }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dot, marginTop: 5 }} />
              {!last ? <View style={{ width: 2, flex: 1, backgroundColor: t.c.rail, marginTop: 4, borderRadius: 1 }} /> : null}
            </View>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingBottom: last ? 0 : 16, minWidth: 0 }}>
              <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
                <Text variant="rowTitle">{e.title}</Text>
                {second ? (
                  <Text variant="caption" color="secondary" numberOfLines={3}>
                    {second}
                  </Text>
                ) : null}
              </View>
              {e.value ? (
                <Text variant="tileTitle" style={{ fontVariant: ['tabular-nums'] }}>
                  {e.value}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
