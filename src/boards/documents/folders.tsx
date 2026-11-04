import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { Icon, Screen, Text, useToast } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import { addFolder, folders, markFiled, openFile, removeFolder, rescan, TEXT_PER_SCAN, type DocumentData, type ScanResult } from '@modules/documents';
import { ActionPill, Block, Card, Disc, EmptyCard, FreshRow, Head, Lined, plural, type Doc } from './parts';

/**
 * Your folders (NR-Documents-Folders, its first states in NR-Documents-Empty):
 * the folders you picked on the phone, how many files each has and when it was
 * last read, Add folder, Rescan now, what is new in them for you to look at,
 * and what stays on the phone. Nothing is copied.
 */

const INTRO = 'Pick the folders where your papers already are (Documents, Download, a Scans folder). Every file in them shows up here; LifeOS keeps a pointer, never a copy, and reads PDFs’ text on the phone for search.';

const STAYS = [
  { icon: 'folder', lead: 'Your files.', rest: 'They stay where they are. Android remembers each folder you picked; subfolders count, five deep.' },
  { icon: 'file', lead: 'The text inside a PDF.', rest: `Read on the phone, ${TEXT_PER_SCAN} files a rescan, for search only. It never leaves the phone.` },
  { icon: 'phone', lead: 'Backups.', rest: 'They keep your Documents (kind, expiry, links), not the files.' },
  { icon: 'share', lead: 'A file shared into LifeOS.', rest: 'It is only lent for a moment, so it is not kept. Save it into one of your folders.' },
];

function scanLine(r: ScanResult): string {
  const parts = [r.added ? `${r.added} new` : '', r.found ? `${r.found} moved` : '', r.missing ? `${r.missing} missing` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Nothing new';
}

/** A grey bar where a line is about to be. */
function Bone({ w, h = 10 }: { w: number | `${number}%`; h?: number }) {
  const t = useTheme();
  return <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: t.c.bg.tileRaised }} />;
}

function BoneRow({ a, b }: { a: `${number}%`; b: `${number}%` }) {
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 }}>
      <Disc icon="file" color="transparent" />
      <View style={{ flex: 1, gap: 8 }}><Bone w={a} h={12} /><Bone w={b} /></View>
    </View>
  );
}

export function YourFolders({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const list = useLive((os) => folders(os), []);
  const fresh = useLive((os) => os.records.query<DocumentData>('document', { filter: { and: [{ field: 'status', op: 'eq', value: 'new' }] }, sort: [{ field: 'updatedAt', dir: 'desc' }] }, { limit: 200 }), []);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/documents' as never));
  const onPhone = !!ctx.device?.folders;
  const reading = busy && list.some((f) => f.scannedAt == null && !f.error);

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
  const again = (uri: string) => run(async () => {
    removeFolder(ctx, uri);
    return (await addFolder(ctx)) ? 'Folder added' : 'No folder added';
  });
  const open = (d: Doc) => void openFile(ctx, d).catch(() => toast.show({ message: 'No app on the phone opens this file', icon: 'info' }));
  const intro = <Text color="secondary" style={{ fontSize: 15, lineHeight: 22, paddingHorizontal: 4 }}>{INTRO}</Text>;

  return (
    <Screen title="Your folders" subtitle={list.length ? `${plural(list.length, 'folder')} · nothing copied` : 'Nothing copied'} onBack={back} contentStyle={{ gap: 22 }}>
      {intro}
      {!onPhone ? (
        <EmptyCard icon="phone" line="Folders are read on the phone. Open LifeOS on your Android phone to pick them." />
      ) : (
        <>
          <View style={{ gap: 10 }}>
            {list.length ? <Head title="Folders" meta={String(list.length)} /> : null}
            {list.length ? (
              <Card>
                <Lined>
                  {[
                    ...list.map((f) => (
                      <Pressable
                        key={f.uri}
                        accessibilityRole="button"
                        accessibilityHint="Hold to stop reading this folder"
                        delayLongPress={350}
                        onLongPress={() => {
                          removeFolder(ctx, f.uri);
                          toast.show({ message: `${f.name} removed · the files are untouched`, icon: 'check' });
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56 }}
                      >
                        {f.error ? <Disc icon="folder" color={t.c.alert.coralText} bg={t.c.alert.coralFill} /> : <Disc icon="folder" color={t.tints.documents.ink} />}
                        <View style={{ flex: 1, minWidth: 0, gap: f.scannedAt == null && !f.error ? 8 : 2 }}>
                          <Text variant="rowTitle" numberOfLines={1}>{f.name}</Text>
                          {f.error ? <Text variant="caption" color="secondary">{f.error}</Text> : f.scannedAt == null ? <Bone w={120} /> : <Text variant="caption" color="secondary" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>{[f.files != null ? plural(f.files, 'file') : null, `read ${ctx.format.date(f.scannedAt, 'relative').toLowerCase()}`].filter(Boolean).join(' · ')}</Text>}
                        </View>
                        {f.error ? (
                          <Pressable accessibilityRole="button" accessibilityLabel={`Add ${f.name} again`} hitSlop={14} disabled={busy} onPress={() => void again(f.uri)}>
                            <Text color={t.c.alert.coralText} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>Add again</Text>
                          </Pressable>
                        ) : null}
                      </Pressable>
                    )),
                    ...(reading ? [<BoneRow key="b1" a="70%" b="40%" />, <BoneRow key="b2" a="55%" b="30%" />] : []),
                  ]}
                </Lined>
              </Card>
            ) : (
              <EmptyCard icon="folder" title="No folders yet." />
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <ActionPill title="Add folder" icon={busy ? 'refresh' : 'plus'} primary busy={busy} disabled={busy} onPress={add} />
              {list.length ? <ActionPill title="Rescan now" icon="refresh" disabled={busy} onPress={scan} /> : null}
            </View>
            {list.length ? <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, paddingHorizontal: 4 }}>Hold a folder to stop reading it. Its new files leave LifeOS; the ones you filed stay, marked missing.</Text> : null}
          </View>

          {fresh.length ? (
            <View style={{ gap: 10 }}>
              <Head title="New in your folders" sub="Tap to look; hold to open the file" meta={String(fresh.length)} />
              <Card>
                <Lined>
                  {fresh.slice(0, 60).map((d) => (
                    <FreshRow key={d.id} d={d} sub={[d.data.file?.path || null, d.data.kind !== 'other' ? d.data.kind : null].filter(Boolean).join(' · ') || d.data.file?.name || 'not filed yet'} onFiled={() => markFiled(ctx, d.id)} onHold={() => open(d)} />
                  ))}
                </Lined>
              </Card>
            </View>
          ) : null}
        </>
      )}

      <Block title="What stays on the phone">
        <Card pad={16} gap={14}>
          <Lined>
            {STAYS.map((s) => (
              <View key={s.lead} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                <Icon name={s.icon} size={18} color={t.tints.documents.ink} />
                <Text style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
                  <Text style={{ fontSize: 14, lineHeight: 20, fontWeight: '600' }}>{s.lead}</Text>
                  <Text color="secondary" style={{ fontSize: 14, lineHeight: 20 }}>{` ${s.rest}`}</Text>
                </Text>
              </View>
            ))}
          </Lined>
        </Card>
      </Block>
    </Screen>
  );
}
