import React from 'react';
import { View } from 'react-native';
import type { IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { Button } from './Button';
import { IconBox } from './IconBox';
import { Surface } from './Surface';
import { Text } from './Text';

/**
 * Noir empty state: a centred 56 disc, 17/600 title, one 13/400 line, one
 * quiet secondary action. Sits in a card (padding 18) unless `bare`.
 */
export function EmptyState({ icon, tint, title, line, action, actionIcon = 'plus', onAction, bare }: { icon: IconName | (string & {}); tint?: TintKey; title?: string; line: string; action?: string; actionIcon?: IconName; onAction?: () => void; bare?: boolean }) {
  const t = useTheme();
  const body = (
    <View style={{ alignItems: 'center', paddingVertical: 16, paddingHorizontal: 8, gap: 10 }}>
      <IconBox icon={icon} tint={tint} size={56} />
      {title ? (
        <Text variant="heading" style={{ textAlign: 'center' }}>
          {title}
        </Text>
      ) : null}
      <Text variant="caption" color="secondary" style={{ textAlign: 'center', maxWidth: 260 }}>
        {line}
      </Text>
      {action ? <Button title={action} icon={actionIcon} onPress={onAction} variant="secondary" size="sm" style={{ alignSelf: 'center', height: 44, marginTop: 2 }} /> : null}
    </View>
  );
  if (bare) return body;
  return (
    <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.tile, padding: 18 }}>
      <Surface kind="tile">{body}</Surface>
    </View>
  );
}
