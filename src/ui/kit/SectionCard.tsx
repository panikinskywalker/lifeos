import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { IconBox, type IconBoxTone } from './IconBox';
import { Surface } from './Surface';
import { Text } from './Text';

function HeaderAction({ action, onAction }: { action: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={12} onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Text variant="label" color="secondary" style={{ fontSize: 13, lineHeight: 17 }}>
        {action}
      </Text>
      <Icon name="chevron-right" size={16} color={t.c.fg.secondary} />
    </Pressable>
  );
}

/** Noir section header (padding 6 4 0): a 17/600 title, optional 13/400 meta, a grey "See all ›" action; content 8 apart. */
export function Section({ title, meta, action, onAction, children, style }: { title: string; meta?: string; action?: string; onAction?: () => void; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 8 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
        <Text variant="heading" style={{ flex: 1 }} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {meta ? (
          <Text variant="caption" color="secondary" style={{ fontVariant: ['tabular-nums'] }}>
            {meta}
          </Text>
        ) : null}
        {action ? <HeaderAction action={action} onAction={onAction} /> : null}
      </View>
      {children}
    </View>
  );
}

/** List group (Transactions by day): an 11/600 caps label (+0.9, tertiary) with a total on the right, rows 8 apart. */
export function ListGroup({ title, meta, children, style }: { title: string; meta?: string | null; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 8 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
        <Text variant="labelCaps" color="tertiary" style={{ flex: 1, textTransform: 'uppercase' }} accessibilityRole="header">
          {title}
        </Text>
        {meta ? (
          <Text variant="labelCaps" color="tertiary" style={{ letterSpacing: 0, fontVariant: ['tabular-nums'] }}>
            {meta}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * Noir card (#1A1A1E, radius 28, padding 16) with an optional header row —
 * 28 disc, tile title, meta — as the kit's widgets.
 */
export function Card({ icon, tint, iconTone, title, meta, children, flush, style }: { icon?: IconName | (string & {}); tint?: TintKey; iconTone?: IconBoxTone; title?: string; meta?: string; children: React.ReactNode; flush?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.tile, padding: flush ? 0 : 16, paddingVertical: flush ? 4 : 16, gap: 10, overflow: 'hidden' }, style]}>
      <Surface kind="tile">
        {title || icon ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: flush ? 16 : 0, paddingTop: flush ? 12 : 0 }}>
            {icon ? <IconBox icon={icon} tint={tint} tone={iconTone} size={28} /> : null}
            <Text variant="tileTitle" style={{ flex: 1 }} numberOfLines={1}>
              {title ?? ''}
            </Text>
            {meta ? (
              <Text variant="caption" color="secondary" style={{ fontSize: 12 }}>
                {meta}
              </Text>
            ) : null}
          </View>
        ) : null}
        {children}
      </Surface>
    </View>
  );
}
