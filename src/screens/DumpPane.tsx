import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format, isToday, isYesterday } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import type { Dump, Extraction } from '@core/repo/dumpRepo';
import { NO_PROVIDER, undoExtraction } from '@core/dumps/extract';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Chip, Icon, IconButton, Text, useToast } from '@ui/kit';
import type { IconName } from '@ui/icons';
import { runDumpExtraction } from '../platform/dumpExtraction';

const KIND_ICON: Record<string, IconName> = { delivery: 'box', account: 'bank', link: 'link', place: 'location', org: 'briefcase', person: 'user', fact: 'sparkle', task: 'check-circle', transaction: 'rupee', asset: 'box', vehicle: 'car', cycle: 'repeat', routine: 'repeat', reminder: 'bell', subscription: 'card', note: 'file', trip: 'plane', event: 'calendar' };
export const kindIcon = (k: string): IconName => KIND_ICON[k] ?? 'file';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const KIND_WORD: Record<string, [string, string?]> = { person: ['person', 'people'], fact: ['fact'], task: ['task'], transaction: ['expense'], cycle: ['update'], entity: ['record'], link: ['link'], event: ['event'], place: ['place'], org: ['organisation'], trip: ['trip'] };

/** "extracted: 1 person · 2 facts · 1 task" */
export function extractedSummary(xs: Extraction[]): string {
  const live = xs.filter((x) => !x.undone);
  const counts = new Map<string, number>();
  for (const x of live) counts.set(x.kind, (counts.get(x.kind) ?? 0) + 1);
  return [...counts].map(([k, n]) => plural(n, KIND_WORD[k]?.[0] ?? k, KIND_WORD[k]?.[1])).join(' · ');
}

export function dumpWhen(at: number): string {
  return isToday(at) ? `Today ${format(at, 'HH:mm')}` : isYesterday(at) ? `Yesterday ${format(at, 'HH:mm')}` : format(at, 'EEE d MMM, HH:mm');
}

/** "in a minute" / "around 2:30 pm" / "tomorrow around 9:10 am". */
export function waitText(at: number): string {
  const ms = at - Date.now();
  if (ms < 90_000) return 'in a minute';
  if (ms < 60 * 60_000) return `in about ${Math.round(ms / 60_000)} min`;
  const t = format(at, 'h:mm a');
  return isToday(at) ? `around ${t}` : `tomorrow around ${t}`;
}

export function dumpStatusLine(d: Dump, xs: Extraction[]): string {
  const filedSoFar = extractedSummary(xs);
  if (d.status === 'pending' && d.error === NO_PROVIDER) return `${filedSoFar ? `Filed ${filedSoFar} · ` : 'Saved · '}add a free key in You › Agent to file the rest`;
  if (d.status === 'pending' && d.retryAt && d.retryAt > Date.now()) return `Waiting to file · ${d.error ?? 'provider busy'} · ${waitText(d.retryAt)}${filedSoFar ? ` · filed so far: ${filedSoFar}` : ''}`;
  if (d.status === 'pending') return filedSoFar ? `Filed ${filedSoFar} · filing the rest…` : 'Reading it…';
  if (d.status === 'failed') return d.attempts >= 5 ? 'Couldn’t read it — kept as is' : 'Couldn’t read it yet — will retry';
  const s = extractedSummary(xs);
  return s ? `Extracted: ${s}` : 'Nothing to file — kept as is';
}

/** One dump: when, the text, and what came out of it (tap to open, Undo per item). */
export function DumpCard({ dump: d, os, onOpen, full }: { dump: Dump; os: LifeOSContext; onOpen?: () => void; full?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const xs = useLive((o) => o.dumps.extractions(d.id), [d.id]);
  const shown = full ? xs : xs.slice(0, 4);
  const undo = (x: Extraction) => {
    if (undoExtraction(os, x.id)) toast.show({ message: `Undone · ${x.label}`, icon: 'undo' });
    else toast.show({ message: 'This one can’t be undone from here — open the record to change it', icon: 'info' });
  };
  const open = (x: Extraction) => {
    if (x.undone) return;
    if (x.factId && !x.entityId) return router.push('/memory');
    const e = x.entityId ? os.records.get(x.entityId) : undefined;
    if (e) router.push(`/entity/${e.object}/${e.id}` as never);
  };
  const busy = d.status === 'pending';
  return (
    <View style={{ backgroundColor: t.c.bg.container, borderRadius: 24, padding: 14, gap: 10 }}>
      <Pressable accessibilityRole={onOpen ? 'button' : undefined} disabled={!onOpen} onPress={onOpen} style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={d.source === 'voice' ? 'mic' : d.source === 'share' ? 'share' : 'brain'} size={13} color={t.c.fg.secondary} />
          <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase', flex: 1 }}>
            {dumpWhen(d.createdAt)}
          </Text>
          {onOpen ? <Icon name="chevron-right" size={14} color={t.c.fg.tertiary} /> : null}
        </View>
        <Text variant="body" selectable={!!full} numberOfLines={full ? undefined : 4} style={{ lineHeight: 22 }}>
          {d.body}
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={busy && d.error === NO_PROVIDER ? 'key' : busy && d.retryAt ? 'clock' : busy ? 'hourglass' : d.status === 'failed' ? 'alert' : 'check'} size={13} color={d.status === 'failed' ? t.c.alert.coral : busy ? t.c.fg.secondary : t.c.ok.sageText} />
        <Text variant="caption" color="secondary" style={{ flex: 1 }}>
          {dumpStatusLine(d, xs)}
        </Text>
        {d.status === 'pending' && d.error === NO_PROVIDER ? <Chip label="Add key" icon="key" small onPress={() => router.push('/settings/ai')} /> : null}
        {d.status === 'failed' ? <Chip label="Retry" icon="refresh" small onPress={() => { os.dumps.setStatus(d.id, 'pending'); void runDumpExtraction(os); }} /> : null}
      </View>
      {shown.length ? (
        <View style={{ backgroundColor: t.c.bg.tileRaised, borderRadius: 16, paddingVertical: 4 }}>
          {shown.map((x) => (
            <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 12, paddingRight: 4, minHeight: 44, opacity: x.undone ? 0.5 : 1 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${x.label}`} disabled={x.undone} onPress={() => open(x)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
                <Icon name={kindIcon(x.kind)} size={16} color={t.tints.memory.ink} />
                <Text variant="label" numberOfLines={2} style={{ flex: 1, textDecorationLine: x.undone ? 'line-through' : 'none' }}>
                  {x.label}
                </Text>
              </Pressable>
              {x.undone ? (
                <Text variant="caption" color="secondary" style={{ paddingRight: 10 }}>Undone</Text>
              ) : (
                <IconButton icon="undo" size={36} accessibilityLabel={`Undo ${x.label}`} onPress={() => undo(x)} />
              )}
            </View>
          ))}
          {xs.length > shown.length ? (
            <Pressable accessibilityRole="button" onPress={onOpen} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
              <Text variant="caption" color="secondary">+{xs.length - shown.length} more</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
