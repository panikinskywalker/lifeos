import React from 'react';
import { View } from 'react-native';
import type { LifeOSContext } from '@core/registry/context';
import { Icon, Text, useToast } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import { markFiled, openFile } from '@modules/documents';
import { ActionPill, Card, dayWords, Disc, fileSize, fileWhere, type Doc } from './parts';

/**
 * A Document's file (NR-Documents-FileCard): where it lives on the phone
 * (folder, size, last changed), Open in the phone's own viewer, and for a new
 * one, Filed. A scan says search finds it by its name. A missing file says so;
 * the record and what you added stay.
 */
export function DocumentFile({ entity, ctx }: { entity: Doc; ctx: LifeOSContext }) {
  const t = useTheme();
  const toast = useToast();
  const f = entity.data.file;
  if (!f) return null;
  const missing = entity.status === 'missing';
  const scan = entity.data.textRead && !entity.data.text;
  const open = () => void openFile(ctx, entity).then((ok) => ok || toast.show({ message: 'Files open on the phone', icon: 'info' })).catch(() => toast.show({ message: 'No app on the phone opens this file', icon: 'info' }));
  return (
    <Card pad={16} gap={12}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        {missing ? <Disc icon="folder" color={t.c.alert.coralText} bg={t.c.alert.coralFill} /> : <Disc icon="file" color={t.tints.documents.ink} />}
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="rowTitle" numberOfLines={1}>{f.name}</Text>
          <Text variant="caption" color="secondary" numberOfLines={missing ? undefined : 1} style={{ fontVariant: ['tabular-nums'] }}>{missing ? 'Not in the folder any more: moved out of your folders or deleted' : [fileWhere(ctx, f) || null, fileSize(f.size), dayWords(f.modified)].filter(Boolean).join(' · ')}</Text>
        </View>
      </View>
      {missing ? null : (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ActionPill title="Open" icon="share" primary onPress={open} />
            {entity.status === 'new' ? <ActionPill title="Filed" icon="check" onPress={() => markFiled(ctx, entity.id)} /> : null}
          </View>
          {scan ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icon name="file" size={14} color={t.c.fg.secondary} />
              <Text color="secondary" style={{ flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '500' }}>No text inside (a scan), so search finds it by its name.</Text>
            </View>
          ) : (
            <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>Opens in the phone’s own viewer. The file stays in your folder.</Text>
          )}
        </>
      )}
    </Card>
  );
}
