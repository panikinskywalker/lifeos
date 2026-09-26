import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Extraction } from '@core/repo/dumpRepo';
import { undoExtraction } from '@core/dumps/extract';
import { ingestItem, sourceLabel } from '@core/ingest/ingest';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, EmptyState, Icon, IconButton, Screen, Text, useToast } from '@ui/kit';
import { dumpWhen, kindIcon } from '../src/screens/DumpPane';

/**
 * To check (docs/GRAPH.md §3.5): everything the agent filed from what you
 * said, already saved, waiting for a glance. Guesses first. Tick it, open it
 * to edit, or cancel — which reverses exactly that one write.
 */
export default function ToCheckScreen() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const items = useLive((o) => o.dumps.toCheck(), []);
  // Group by what was said, keeping the list order (flagged first, newest first).
  // By what it came from: a dump, or one SMS / notification / other source item.
  const groups: Array<{ key: string; dumpId: string | null; source: string; sourceRef: string | null; items: Extraction[] }> = [];
  for (const x of items) {
    const key = x.dumpId ?? `${x.source}:${x.sourceRef ?? x.id}`;
    const g = groups.find((y) => y.key === key);
    if (g) g.items.push(x);
    else groups.push({ key, dumpId: x.dumpId, source: x.source, sourceRef: x.sourceRef, items: [x] });
  }
  const tick = (ids: string[]) => os.dumps.setChecked(ids);
  const cancel = (x: Extraction) => {
    if (undoExtraction(os, x.id)) toast.show({ message: `Cancelled · ${x.label}`, icon: 'undo' });
    else toast.show({ message: 'This one can’t be cancelled from here — open it to change it', icon: 'info' });
  };
  const edit = (x: Extraction) => {
    const e = x.entityId ? os.entities.get(x.entityId) : undefined;
    if (e) router.push(`/entity/${e.type}/${e.id}${x.kind === 'link' || x.flag ? '' : '/edit'}` as never);
    else if (x.factId) router.push('/memory');
    os.dumps.setChecked(x.id);
  };

  return (
    <Screen title="To check" subtitle={items.length ? `${items.length} filed · already saved · untouched ones are approved after 15 days` : 'All caught up'} onBack={() => router.back()} right={items.length ? <Button title="Tick all" icon="check" size="sm" variant="secondary" onPress={() => tick(items.map((x) => x.id))} /> : undefined}>
      {!items.length ? (
        <EmptyState icon="check-circle" tint="memory" line="Everything you’ve said has been filed and looked at. New things show up here, already saved — tick them, fix them or cancel them." />
      ) : (
        <View style={{ gap: 14 }}>
          {groups.map((g) => {
            const dump = g.dumpId ? os.dumps.get(g.dumpId) : null;
            const msg = !g.dumpId && g.sourceRef ? ingestItem(os, g.sourceRef) : null;
            const when = dump?.createdAt ?? msg?.receivedAt ?? g.items[0]!.createdAt;
            const head = dump ? `${dumpWhen(when)}${dump.subjectId ? ` · on ${os.entities.get(dump.subjectId)?.title ?? 'a record'}` : ''}` : `${dumpWhen(when)} · ${msg ? sourceLabel(msg) : g.source}`;
            const quote = dump?.body ?? msg?.text ?? null;
            return (
              <View key={g.key} style={{ backgroundColor: t.c.bg.container, borderRadius: 24, padding: 14, gap: 10 }}>
                <Pressable accessibilityRole="button" disabled={!dump} onPress={() => dump && router.push(`/dump/${dump.id}` as never)} style={{ gap: 4 }}>
                  <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>
                    {head}
                  </Text>
                  {quote ? (
                    <Text variant="caption" color="secondary" numberOfLines={2}>
                      “{quote.trim()}”
                    </Text>
                  ) : null}
                </Pressable>
                <View style={{ backgroundColor: t.c.bg.tileRaised, borderRadius: 16, paddingVertical: 4 }}>
                  {g.items.map((x) => (
                    <View key={x.id} style={{ paddingLeft: 12, paddingRight: 4, paddingVertical: 4, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
                        <Icon name={kindIcon(x.kind)} size={16} color={x.flag ? t.c.accent.gold : t.tints.memory.ink} />
                        <View style={{ flex: 1 }}>
                          <Text variant="label" numberOfLines={3}>
                            {x.label}
                          </Text>
                          <Text variant="caption" color="tertiary">
                            {approvesIn(x.createdAt)}
                          </Text>
                        </View>
                        <IconButton icon="check" size={36} accessibilityLabel={`Looks right: ${x.label}`} onPress={() => tick([x.id])} />
                        <IconButton icon="edit" size={36} accessibilityLabel={`Edit ${x.label}`} onPress={() => edit(x)} />
                        <IconButton icon="x" size={36} accessibilityLabel={`Cancel ${x.label}`} onPress={() => cancel(x)} />
                      </View>
                      {x.flag ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 24, paddingBottom: 6 }}>
                          <Icon name="alert" size={12} color={t.c.accent.gold} />
                          <Text variant="caption" color={t.c.accent.gold} style={{ flex: 1 }}>
                            {x.flag}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

/** "approved in 12 days" — To check's auto-approve window is 15 days. */
function approvesIn(createdAt: number): string {
  const left = Math.ceil((createdAt + 15 * 86_400_000 - Date.now()) / 86_400_000);
  return left <= 1 ? 'Approved tomorrow if untouched' : `Approved in ${left} days if untouched`;
}
