import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

export interface TimelineEntry {
  id: string;
  icon: IconName | (string & {});
  title: string;
  body?: string | null;
  /** "23 Sep, 9:40 am · agent" */
  meta: string;
  /** Who did it — the agent and automations get their own colour. */
  actor?: 'user' | 'assistant' | 'automation' | 'system';
  onPress?: () => void;
}

/** Vertical history: icon on a thin rail, title, optional body, when/who. */
export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: 4 }}>
      {entries.map((e, i) => {
        const color = e.actor === 'assistant' ? t.tints.memory.ink : e.actor === 'automation' ? t.tints.tasks.ink : t.c.fg.secondary;
        return (
          <Pressable key={e.id} disabled={!e.onPress} onPress={e.onPress} style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16 }}>
            <View style={{ alignItems: 'center', width: 24, paddingTop: 12 }}>
              <Icon name={e.icon} size={18} color={color} />
              {i < entries.length - 1 ? <View style={{ width: 2, flex: 1, borderRadius: 1, backgroundColor: t.c.line, marginTop: 6 }} /> : null}
            </View>
            <View style={{ flex: 1, paddingVertical: 10, gap: 2 }}>
              <Text variant="body">{e.title}</Text>
              {e.body ? (
                <Text variant="caption" color="secondary" numberOfLines={3}>
                  {e.body}
                </Text>
              ) : null}
              <Text variant="caption" color="tertiary">
                {e.meta}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
