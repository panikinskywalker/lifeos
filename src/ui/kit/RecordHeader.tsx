import React from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { IconButton } from './Button';
import { Chip } from './Chip';
import { IconBox } from './IconBox';
import { Text } from './Text';

export interface HeaderStat {
  label: string;
  value: string;
  unit?: string;
  tone?: 'alert';
}

/**
 * Canvas record header: the module tint runs under the status bar and ends
 * in 28px bottom corners. Round overlay controls (back · actions), a 48
 * overlay icon-box, 26/800 title, 13/700 subtitle in the module ink, a small
 * status chip, and up to three 20/800 stats with ink labels.
 */
export function RecordHeader({ tint, icon, title, subtitle, status, stats, onBack, actions }: { tint: TintKey; icon?: IconName | (string & {}); title: string; subtitle?: string | null; status?: { label: string; tone?: 'alert' | 'neutral'; onPress?: () => void }; stats?: HeaderStat[]; onBack?: () => void; actions?: React.ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const tone = t.tints[tint];
  return (
    <View style={{ backgroundColor: tone.fill, paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: 22, borderBottomLeftRadius: t.radius.band, borderBottomRightRadius: t.radius.band, gap: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {onBack ? <IconButton icon="chevron-left" onPress={onBack} accessibilityLabel="Back" filled="overlay" /> : null}
        <View style={{ flex: 1 }} />
        {actions}
      </View>
      <View style={{ gap: 10 }}>
        {icon ? <IconBox icon={icon} tint={tint} tone="overlay" size={48} color={t.c.fg.primary} /> : null}
        <View style={{ gap: 4 }}>
          <Text variant="title" numberOfLines={2} accessibilityRole="header" style={{ fontSize: 26, lineHeight: 29 }}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="label" color={tone.ink} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {status ? (
          <View style={{ flexDirection: 'row' }}>
            <Chip label={status.label} small overlay tone={status.tone === 'alert' ? 'alertText' : 'neutral'} icon={status.onPress ? 'chevron-down' : undefined} onPress={status.onPress} />
          </View>
        ) : null}
        {stats?.length ? (
          <View style={{ flexDirection: 'row', gap: 12, paddingTop: 4 }}>
            {stats.slice(0, 3).map((s) => (
              <View key={s.label} style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Text variant="stat" color={s.tone === 'alert' ? t.c.alert.coralText : undefined} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 20, lineHeight: 22 }}>
                  {s.unit ? `${s.value} ${s.unit}` : s.value}
                </Text>
                <Text variant="labelCaps" color={tone.ink} numberOfLines={1} style={{ letterSpacing: 0 }}>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}
