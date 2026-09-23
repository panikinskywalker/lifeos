import React from 'react';
import { View } from 'react-native';
import type { IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { RowItem } from './RowItem';
import { Sheet } from './Sheet';

export interface SheetAction {
  label: string;
  icon?: IconName | (string & {});
  destructive?: boolean;
  onPress: () => void;
}

/** A Sheet listing actions as rows. The sheet closes before the action runs. */
export function ActionSheet({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title?: string; actions: SheetAction[] }) {
  const t = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.card, overflow: 'hidden' }}>
        {actions.map((a, i) => (
          <RowItem
            key={a.label}
            title={a.label}
            icon={a.icon}
            destructive={a.destructive}
            chevron={false}
            divider={i < actions.length - 1}
            onPress={() => {
              onClose();
              setTimeout(a.onPress, 160);
            }}
          />
        ))}
      </View>
    </Sheet>
  );
}
