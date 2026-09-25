import React from 'react';
import type { IconName } from '../icons';
import { RowItem, RowList } from './RowItem';
import { Sheet } from './Sheet';

export interface SheetAction {
  label: string;
  icon?: IconName | (string & {});
  destructive?: boolean;
  onPress: () => void;
}

/** A Sheet listing actions as rows. The sheet closes before the action runs. */
export function ActionSheet({ visible, onClose, title, actions }: { visible: boolean; onClose: () => void; title?: string; actions: SheetAction[] }) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <RowList>
        {actions.map((a) => (
          <RowItem
            key={a.label}
            title={a.label}
            icon={a.icon}
            iconTone={a.destructive ? 'alert' : 'plain'}
            destructive={a.destructive}
            chevron={false}
            onPress={() => {
              onClose();
              setTimeout(a.onPress, 160);
            }}
          />
        ))}
      </RowList>
    </Sheet>
  );
}
