import React from 'react';
import { Pressable, View } from 'react-native';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { Surface } from './Surface';
import { Text } from './Text';

export interface WeekDay {
  key: string;
  /** "Mon" */
  weekday: string;
  /** 21 */
  date: number;
  today?: boolean;
  /** Dues that day, drawn as small pills with an icon. */
  dues: Array<{ id: string; icon: IconName; tint?: TintKey; overdue?: boolean; label: string }>;
}

/**
 * Canvas week strip (Upkeep › This week): seven columns in a tile; today's date
 * in a mustard disc on a nested background; dues as 22-high pills in their tint.
 */
export function WeekStrip({ days, selected, onSelect }: { days: WeekDay[]; selected?: string; onSelect?: (key: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.tile, padding: 12 }}>
      <Surface kind="tile">
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {days.map((d) => {
            const sel = selected ? selected === d.key : !!d.today;
            return (
              <Pressable
                key={d.key}
                accessibilityRole="button"
                accessibilityLabel={`${d.weekday} ${d.date}, ${d.dues.length ? d.dues.map((x) => x.label).join(', ') : 'nothing due'}`}
                accessibilityState={{ selected: sel }}
                onPress={() => onSelect?.(d.key)}
                style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingTop: 6, paddingBottom: 8, paddingHorizontal: 3, borderRadius: 12, backgroundColor: sel ? t.c.bg.tileRaised : 'transparent' }}
              >
                <Text variant="nav" color="secondary">
                  {d.weekday}
                </Text>
                <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: d.today ? t.c.accent.mustard : 'transparent' }}>
                  <Text variant="tileTitle" color={d.today ? t.c.accent.mustardInk : undefined} style={{ fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                    {d.date}
                  </Text>
                </View>
                <View style={{ alignSelf: 'stretch', gap: 4 }}>
                  {d.dues.slice(0, 3).map((x) => (
                    <View key={x.id} style={{ height: 22, borderRadius: t.radius.bar, alignItems: 'center', justifyContent: 'center', backgroundColor: x.overdue ? t.c.alert.coralFill : x.tint ? t.tints[x.tint].fill : t.c.bg.tileRaised }}>
                      <Icon name={x.icon} size={12} color={x.overdue ? t.c.alert.coralText : x.tint ? t.tints[x.tint].ink : t.c.fg.secondary} />
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </Surface>
    </View>
  );
}
