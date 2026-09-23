import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { IconButton } from './Button';
import { Chip, type ChipTone } from './Chip';
import { IconBox } from './IconBox';
import { Text } from './Text';

export interface HeaderStat {
  label: string;
  value: string;
  unit?: string;
  tone?: 'alert';
}

/**
 * Top of a Record screen: a band in the module tint running under the status
 * bar, with back/actions, icon-box, title, status chip and up to three key stats.
 */
export function RecordHeader({ tint, icon, title, subtitle, status, stats, onBack, actions }: { tint: TintKey; icon?: IconName | (string & {}); title: string; subtitle?: string | null; status?: { label: string; tone?: ChipTone }; stats?: HeaderStat[]; onBack?: () => void; actions?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tone = t.tints[tint];
  return (
    <View style={{ backgroundColor: tone.fill, paddingTop: insets.top + 4, paddingHorizontal: t.layout.gutter, paddingBottom: 20, borderBottomLeftRadius: t.radius.tile, borderBottomRightRadius: t.radius.tile, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: -8, minHeight: 48 }}>
        {onBack ? <IconButton icon="chevron-left" onPress={onBack} accessibilityLabel="Back" color={tone.ink} /> : null}
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>{actions}</View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {icon ? <IconBox icon={icon} tint={tint} inverse size={44} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" color={tone.ink} numberOfLines={2} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" color={tone.ink} numberOfLines={1} style={{ opacity: 0.8 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {status ? <Chip label={status.label} tone={status.tone ?? 'neutral'} /> : null}
      {stats?.length ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {stats.slice(0, 3).map((s) => (
            <View key={s.label} style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                <Text variant="stat" color={s.tone === 'alert' ? t.c.alert.coral : tone.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {s.value}
                </Text>
                {s.unit ? (
                  <Text variant="caption" color={tone.ink}>
                    {s.unit}
                  </Text>
                ) : null}
              </View>
              <Text variant="caption" color={tone.ink} numberOfLines={1} style={{ opacity: 0.8 }}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
