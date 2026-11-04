import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format, isToday, isYesterday } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import type { Filing } from '@core/repo/filingRepo';
import { undoFiling } from '@core/filing/dumps';
import { messageItem, sourceLabel } from '@core/filing/messages';
import { NUDGE_KINDS } from '@core/brain';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import type { TintKey } from '@ui/theme/tokens';
import { ChipRow, EmptyState, FilterChip, Icon, IconButton, Screen, Surface, Text, useToast } from '@ui/kit';
import { kindIcon } from '../src/screens/DumpPane';
import { Disc, Hairline, lilacInk, passDay, Pill } from '../src/screens/brainParts';
import { NUDGE_CARDS } from '../src/screens/NudgeCard';

type Tab = 'all' | 'brain' | 'filed';

/** What a filed row's disc is tinted by. */
const KIND_TINT: Record<string, TintKey> = { transaction: 'finance', person: 'people', link: 'people', task: 'tasks', event: 'tasks', cycle: 'upkeep', asset: 'upkeep', place: 'travel', trip: 'travel' };

const isNudge = (x: Filing) => NUDGE_KINDS.includes(x.kind);

/** "From yesterday's dump", "From HDFC SMS". */
function fromWords(os: LifeOSContext, x: Filing): string {
  const dump = x.dumpId ? os.dumps.get(x.dumpId) : null;
  if (dump) {
    const at = dump.createdAt;
    return isToday(at) ? 'From today’s dump' : isYesterday(at) ? 'From yesterday’s dump' : `From a dump on ${format(at, 'd MMM')}`;
  }
  const msg = x.sourceRef ? messageItem(os, x.sourceRef) : null;
  const label = msg ? sourceLabel(os, msg) : x.source;
  return label.startsWith('SMS from') ? label : `From ${label}`;
}

/**
 * To check (docs/MODEL.md layer 7 and 8; NR-Brain-ToCheck): the brain's nudges
 * by pass, then what filing was not sure about, already saved. Tick it, open it
 * to edit, or cancel, which reverses exactly that one write. A board's own cards
 * (Turf's SMS questions, People's who-is) keep their own insides.
 */
export default function ToCheckScreen() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('all');
  const items = useLive((o) => o.filings.toCheck(), []);
  const passes = useLive((o) => {
    const said = new Set(o.brain.sent.recent(200).filter((e) => e.outcome === 'ok').map((e) => e.at));
    const out: Array<{ key: string; at: number; claude: boolean; items: Array<{ x: Filing; urgent: boolean }> }> = [];
    for (const x of o.filings.toCheck()) {
      if (!isNudge(x)) continue;
      const n = o.brain.nudges.forFiling(x.id);
      const key = x.sourceRef ?? x.id;
      let g = out.find((y) => y.key === key);
      if (!g) out.push((g = { key, at: n?.createdAt ?? x.createdAt, claude: !!n && said.has(n.createdAt), items: [] }));
      g.items.push({ x, urgent: !!n?.urgent });
    }
    for (const g of out) g.items.sort((a, b) => Number(b.urgent) - Number(a.urgent));
    return out.sort((a, b) => b.at - a.at);
  }, []);
  // A board's own To check cards (Turf's SMS questions and submissions), by filing kind.
  const boardCards = Object.assign({}, ...[...os.registry.boards.values()].map((b) => b.checkCards ?? {})) as Record<string, React.ComponentType<{ filing: Filing }>>;

  const brainCount = passes.reduce((n, g) => n + g.items.length, 0);
  const urgent = passes.reduce((n, g) => n + g.items.filter((i) => i.urgent).length, 0);
  const filed = items.filter((x) => !isNudge(x));
  const rows = filed.filter((x) => !boardCards[x.kind]);
  const cards = filed.filter((x) => boardCards[x.kind]);

  const tick = (ids: string[]) => os.filings.setChecked(ids);
  const cancel = (x: Filing) => {
    if (undoFiling(os, x.id)) toast.show({ message: `Cancelled · ${x.label}`, icon: 'undo' });
    else toast.show({ message: 'This one can’t be cancelled from here: open it to change it', icon: 'info' });
  };
  const edit = (x: Filing) => {
    const e = x.entityId ? os.records.get(x.entityId) : undefined;
    if (e) router.push(`/entity/${e.object}/${e.id}${x.kind === 'link' || x.flag ? '' : '/edit'}` as never);
    else if (x.factId) router.push('/memory');
    os.filings.setChecked(x.id);
  };

  return (
    <Screen
      title="To check"
      subtitle={items.length ? `${items.length} waiting${urgent ? ` · ${urgent} urgent` : ''}` : 'All caught up'}
      onBack={() => router.back()}
      right={items.length ? <IconButton icon="check" filled accessibilityLabel="Tick all" onPress={() => tick(items.map((x) => x.id))} /> : undefined}
      contentStyle={{ gap: 14 }}
    >
      {!items.length ? (
        <EmptyState icon="check-circle" tint="memory" line="Everything you’ve said has been filed and looked at. New things show up here, already saved: tick them, fix them or cancel them." />
      ) : (
        <>
          <ChipRow>
            <FilterChip label={`All ${items.length}`} selected={tab === 'all'} onPress={() => setTab('all')} />
            <FilterChip label={`From the brain ${brainCount}`} selected={tab === 'brain'} onPress={() => setTab('brain')} />
            <FilterChip label={`Filed ${filed.length}`} selected={tab === 'filed'} onPress={() => setTab('filed')} />
          </ChipRow>

          {tab !== 'filed'
            ? passes.map((g, i) => (
                <React.Fragment key={g.key}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingTop: i ? 14 : 8 }}>
                    <Text variant="heading" accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1 }}>
                      {passDay(g.at)}
                    </Text>
                    <Text variant="caption" color="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                      · From the brain
                    </Text>
                    <View style={{ marginLeft: 'auto' }}>{g.claude ? <Pill label="Claude" icon="sparkle" color={lilacInk(t)} fill={`${lilacInk(t)}24`} /> : <Pill label="LifeOS" icon="grid" color={t.c.fg.secondary} fill={t.c.bg.dim} />}</View>
                  </View>
                  {g.items.map(({ x }) => React.createElement(NUDGE_CARDS[x.kind]!, { key: x.id, filing: x }))}
                </React.Fragment>
              ))
            : null}

          {tab !== 'brain' && filed.length ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4, paddingTop: 14 }}>
                <Text variant="heading" accessibilityRole="header">
                  Filed, not sure
                </Text>
                <Text variant="caption" color="secondary">
                  · dumps and SMS
                </Text>
              </View>
              {rows.length ? (
                <Surface kind="tile">
                  <View style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, gap: 8 }}>
                    {rows.map((x, i) => (
                      <React.Fragment key={x.id}>
                        {i ? <Hairline /> : null}
                        <FiledRow x={x} from={fromWords(os, x)} onTick={() => tick([x.id])} onEdit={() => edit(x)} onCancel={() => cancel(x)} onSource={x.dumpId ? () => router.push(`/dump/${x.dumpId}` as never) : undefined} />
                      </React.Fragment>
                    ))}
                  </View>
                </Surface>
              ) : null}
              {cards.map((x) => {
                const msg = !x.dumpId && x.sourceRef ? messageItem(os, x.sourceRef) : null;
                return (
                  <Surface key={x.id} kind="tile">
                    <View style={{ padding: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile, gap: 8 }}>
                      <Text variant="caption" color="secondary">
                        {fromWords(os, x)}
                      </Text>
                      {msg?.text ? (
                        <Text variant="caption" color="secondary" numberOfLines={2}>
                          “{msg.text.trim()}”
                        </Text>
                      ) : null}
                      {React.createElement(boardCards[x.kind]!, { filing: x })}
                    </View>
                  </Surface>
                );
              })}
              <Text variant="caption" color="tertiary" style={{ paddingHorizontal: 4 }}>
                Untouched ones are approved after 15 days
              </Text>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function FiledRow({ x, from, onTick, onEdit, onCancel, onSource }: { x: Filing; from: string; onTick: () => void; onEdit: () => void; onCancel: () => void; onSource?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
        <Disc icon={kindIcon(x.kind)} color={t.tints[KIND_TINT[x.kind] ?? 'memory'].ink} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${x.label}`} onPress={onEdit}>
            <Text variant="rowTitle" numberOfLines={3}>
              {x.label}
            </Text>
          </Pressable>
          <Pressable accessibilityRole={onSource ? 'link' : undefined} disabled={!onSource} onPress={onSource}>
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {from}
            </Text>
          </Pressable>
        </View>
        <IconButton icon="check" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} accessibilityLabel={`Looks right: ${x.label}`} onPress={onTick} />
        <IconButton icon="x" filled accessibilityLabel={`Cancel ${x.label}`} onPress={onCancel} />
      </View>
      {x.flag ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 50, paddingBottom: 6 }}>
          <Icon name="alert" size={12} color={t.c.accent.gold} />
          <Text variant="caption" color={t.c.accent.gold} style={{ flex: 1 }}>
            {x.flag}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
