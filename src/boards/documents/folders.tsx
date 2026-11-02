import React, { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { useLive } from '@ui/hooks';
import { Button, EmptyState, RowItem, RowList, Screen, Section, Text, useToast } from '@ui/kit';
import { addFolder, folders, markFiled, openFile, removeFolder, rescan, type DocumentData, type ScanResult } from '@modules/documents';

/**
 * Your folders (R7c; a first pass from the kit): the folders you picked on the
 * phone, how many files each has and when it was last read, Add folder,
 * Rescan now, and what is new in them for you to look at. Nothing is copied.
 */

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function scanLine(r: ScanResult): string {
  const parts = [r.added ? `${r.added} new` : '', r.found ? `${r.found} moved` : '', r.missing ? `${r.missing} missing` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Nothing new';
}

export function YourFolders({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const list = useLive((os) => folders(os), []);
  const fresh = useLive((os) => os.records.query<DocumentData>('document', { filter: { and: [{ field: 'status', op: 'eq', value: 'new' }] }, sort: [{ field: 'updatedAt', dir: 'desc' }] }, { limit: 200 }), []);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/documents' as never));
  const onPhone = !!ctx.device?.folders;

  const run = async (work: () => Promise<string>) => {
    setBusy(true);
    try {
      toast.show({ message: await work(), icon: 'check' });
    } catch (e) {
      toast.show({ message: `Couldn’t read the folder: ${(e as Error).message}`, icon: 'info' });
    } finally {
      setBusy(false);
    }
  };
  const add = () => run(async () => ((await addFolder(ctx)) ? 'Folder added' : 'No folder added'));
  const scan = () => run(async () => scanLine(await rescan(ctx)));
  const open = (d: ObjectRecord<DocumentData>) => void openFile(ctx, d).catch(() => toast.show({ message: 'No app on the phone opens this file', icon: 'info' }));

  return (
    <Screen title="Your folders" subtitle={list.length ? `${plural(list.length, 'folder')} · nothing copied` : 'Nothing copied'} onBack={back}>
      {!onPhone ? (
        <EmptyState icon="folder" tint="documents" line="Folders are read on the phone. Open LifeOS on your Android phone to pick them." />
      ) : (
        <View style={{ gap: 18 }}>
          <Text color="secondary" style={{ paddingHorizontal: 4 }}>
            Pick the folders where your papers already are (Documents, Download, a Scans folder). Every file in them shows up here; LifeOS keeps a pointer, never a copy, and reads PDFs’ text on the phone for search.
          </Text>
          <Section title="Folders" meta={list.length ? String(list.length) : undefined}>
            {list.length ? (
              <RowList>
                {list.map((f) => (
                  <RowItem
                    key={f.uri}
                    icon="folder"
                    tint="documents"
                    title={f.name}
                    subtitle={f.error ?? [f.files != null ? plural(f.files, 'file') : null, f.scannedAt ? `read ${ctx.format.date(f.scannedAt, 'relative').toLowerCase()}` : null].filter(Boolean).join(' · ')}
                    meta={f.error ? 'Add again' : undefined}
                    metaTone={f.error ? 'alert' : undefined}
                    chevron={false}
                    onLongPress={() => {
                      removeFolder(ctx, f.uri);
                      toast.show({ message: `${f.name} removed · the files are untouched`, icon: 'check' });
                    }}
                  />
                ))}
              </RowList>
            ) : (
              <EmptyState icon="folder" tint="documents" line="No folders yet." bare />
            )}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Add folder" icon="plus" onPress={add} loading={busy} />
              {list.length ? <Button title="Rescan now" icon="refresh" variant="secondary" onPress={scan} disabled={busy} /> : null}
            </View>
            {list.length ? <Text color="tertiary" style={{ paddingHorizontal: 4, fontSize: 12 }}>Hold a folder to stop reading it. Its new files leave LifeOS; the ones you filed stay, marked missing.</Text> : null}
          </Section>
          {fresh.length ? (
            <Section title="New in your folders" meta={String(fresh.length)}>
              <RowList>
                {fresh.slice(0, 60).map((d) => (
                  <RowItem
                    key={d.id}
                    icon="file"
                    tint="documents"
                    title={d.title}
                    subtitle={[d.data.file?.path || null, d.data.kind !== 'other' ? d.data.kind : null].filter(Boolean).join(' · ') || d.data.file?.name}
                    onPress={() => router.push(`/entity/document/${d.id}`)}
                    onLongPress={() => open(d)}
                    doneLabel="Filed"
                    onDone={() => markFiled(ctx, d.id)}
                  />
                ))}
              </RowList>
            </Section>
          ) : null}
        </View>
      )}
    </Screen>
  );
}
