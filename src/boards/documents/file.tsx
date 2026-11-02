import React from 'react';
import { View } from 'react-native';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { Button, Card, RowItem, Text, useToast } from '@ui/kit';
import { markFiled, openFile, type DocumentData } from '@modules/documents';

/**
 * A Document's file (R7c): where it lives on the phone (folder, size, last
 * changed), Open in the phone's own viewer, and for a new one, Filed. A
 * missing file says so; the record and what you added stay.
 */

const size = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function DocumentFile({ entity, ctx }: { entity: ObjectRecord<DocumentData>; ctx: LifeOSContext }) {
  const toast = useToast();
  const f = entity.data.file;
  if (!f) return null;
  const missing = entity.status === 'missing';
  const folder = ctx.settings.get<Array<{ uri: string; name: string }>>('documents.folders', []).find((x) => x.uri === f.folder)?.name;
  const where = [folder, f.path].filter(Boolean).join(' / ');
  const open = () => void openFile(ctx, entity).then((ok) => ok || toast.show({ message: 'Files open on the phone', icon: 'info' })).catch(() => toast.show({ message: 'No app on the phone opens this file', icon: 'info' }));
  return (
    <Card>
      <View style={{ gap: 10 }}>
        <RowItem icon="file" tint="documents" title={f.name} subtitle={missing ? 'Not in the folder any more: moved out of your folders or deleted' : [where || null, size(f.size), ctx.format.date(f.modified, 'short')].filter(Boolean).join(' · ')} chevron={false} />
        {missing ? null : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Open" icon="share" onPress={open} />
            {entity.status === 'new' ? <Button title="Filed" icon="check" variant="secondary" onPress={() => markFiled(ctx, entity.id)} /> : null}
          </View>
        )}
        {entity.data.textRead && !entity.data.text && !missing ? <Text color="tertiary" style={{ fontSize: 12 }}>No text inside (a scan), so search finds it by its name.</Text> : null}
      </View>
    </Card>
  );
}
