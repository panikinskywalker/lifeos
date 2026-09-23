import React from 'react';
import { View } from 'react-native';
import type { IconName } from '../icons';
import type { TintKey } from '../theme/tokens';
import { Button } from './Button';
import { IconBox } from './IconBox';
import { Text } from './Text';

/** Illustration-free teaching empty state: icon-box, one line, one button. */
export function EmptyState({ icon, tint, line, action, onAction }: { icon: IconName | (string & {}); tint?: TintKey; line: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 14 }}>
      <IconBox icon={icon} tint={tint} size={48} />
      <Text variant="body" color="secondary" style={{ textAlign: 'center', maxWidth: 280 }}>
        {line}
      </Text>
      {action ? <Button title={action} onPress={onAction} variant="secondary" small style={{ alignSelf: 'center' }} /> : null}
    </View>
  );
}
