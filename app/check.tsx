import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Extraction } from '@core/repo/dumpRepo';
import { undoExtraction } from '@core/dumps/extract';
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
  const groups: Array<{ dumpId: string; items: Extraction[] }> = [];
  for (const x of items) {
    const g = groups.find((y) => y.dumpId === x.dumpId);
    if (g) g.items.push(x);
    else groups.push({ dumpId: x.dumpId, items: [x] });
  }
  const tick = (ids: string[]) => os.dumps.setChecked(ids);
  const cancel = (x: Extraction) => {
    if (undoExtraction(os, x.id)) toast.show({ message: `Cancelled · ${x.label}`, icon: 'undo' });
    else toast.show({ message: 'This one can’t be cancelled from here — open it to change it', icon: 'info' });
  };
  const edit = (x: Extraction) => {
    const e = x.entityId ? os.entities.get(x.entityId) : undefined;
    if (e) router.push(`/entity/${e.type}/${e.id}${x.kind === 'link' ? '' : '/edit'}` as never);
    else if (x.factId) router.push('/memory');
    os.dumps.setChecked(x.id);
  };

  return (
    <Screen title="To check" subtitle={items.length ? `${items.length} filed from what you said` : 'All caught up'} onBack={() => router.back()} right={items.length ? <Button title="Tick all" icon="check" size="sm" variant="secondary" onPress={() => tick(items.map((x) => x.id))} /> : undefined}>
      {!items.length ? (
        <EmptyState icon="check-circle" tint="memory" line="Everything you’ve said has been filed and looked at. New things show up here, already saved — tick them, fix them or cancel them." />
      ) : (
        <View style={{ gap: 14 }}>
          {groups.map((g) => {
            const dump = os.dumps.get(g.dumpId);
            return (
              <View key={g.dumpId} style={{ backgroundColor: t.c.bg.container, borderRadius: 24, padding: 14, gap: 10 }}>
                <Pressable accessibilityRole="button" onPress={() => router.push(`/dump/${g.dumpId}` as never)} style={{ gap: 4 }}>
                  <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>
                    {dump ? `${dumpWhen(dump.createdAt)}${dump.subjectId ? ` · on ${os.entities.get(dump.subjectId)?.title ?? 'a record'}` : ''}` : 'Filed'}
                  </Text>
                  {dump ? (
                    <Text variant="caption" color="secondary" numberOfLines={2}>
                      “{dump.body.trim()}”
                    </Text>
                  ) : null}
                </Pressable>
                <View style={{ backgroundColor: t.c.bg.tileRaised, borderRadius: 16, paddingVertical: 4 }}>
                  {g.items.map((x) => (
                    <View key={x.id} style={{ paddingLeft: 12, paddingRight: 4, paddingVertical: 4, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
                        <Icon name={kindIcon(x.kind)} size={16} color={x.flag ? t.c.accent.gold : t.tints.memory.ink} />
                        <Text variant="label" numberOfLines={3} style={{ flex: 1 }}>
                          {x.label}
                        </Text>
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
