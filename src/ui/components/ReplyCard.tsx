import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import type { ReplyCard as Card } from '@core/ai/cards';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { Button, Chip, IconBox, ProgressBar, Text } from '../kit';

/**
 * Talk reply cards (Stitch agent thread): what the agent did or found, as a
 * nested slab in a tile — record, cycle, list, number or chart — tappable to
 * open, with Undo for anything it changed.
 */
export function ReplyCardView({ card, label, onOpen, onUndo }: { card?: Card; label: string; onOpen?: (entityId: string, type?: string) => void; onUndo?: () => void }) {
  const t = useTheme();
  const [undone, setUndone] = useState(false);
  const undo = onUndo && !undone ? () => { onUndo(); setUndone(true); } : undefined;
  return (
    <View style={{ backgroundColor: t.c.bg.container, borderRadius: 24, borderTopLeftRadius: 8, padding: 14, gap: 10, marginRight: 24, opacity: undone ? 0.55 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={undone ? 'undo' : 'check'} size={14} color={undone ? t.c.fg.secondary : t.c.ok.sageText} />
        <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase', flex: 1 }} numberOfLines={1}>
          {undone ? `Undone · ${label}` : label}
        </Text>
      </View>
      {card ? <CardBody card={card} onOpen={undone ? undefined : onOpen} /> : null}
      {undo ? (
        <View style={{ flexDirection: 'row' }}>
          <Chip label="Undo" icon="undo" small onPress={undo} />
        </View>
      ) : null}
    </View>
  );
}

function Slab({ children, onPress, label }: { children: React.ReactNode; onPress?: () => void; label?: string }) {
  const t = useTheme();
  const style = { backgroundColor: t.c.bg.tileRaised, borderRadius: 16, padding: 12, gap: 8 };
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.8 : 1 }]}>
      {children}
    </Pressable>
  ) : (
    <View style={style}>{children}</View>
  );
}

function CardBody({ card, onOpen }: { card: Card; onOpen?: (entityId: string, type?: string) => void }) {
  const t = useTheme();
  switch (card.kind) {
    case 'record':
      return (
        <Slab onPress={onOpen ? () => onOpen(card.entityId, card.type) : undefined} label={`Open ${card.title}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconBox icon={(card.icon as IconName) ?? 'file'} tone="plain" size={32} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="rowTitle" numberOfLines={1}>{card.title}</Text>
              {card.subtitle ? <Text variant="caption" color="secondary" numberOfLines={1}>{card.subtitle}</Text> : null}
            </View>
            {onOpen ? <Icon name="chevron-right" size={16} color={t.c.fg.tertiary} /> : null}
          </View>
        </Slab>
      );
    case 'cycle':
      return (
        <Slab onPress={onOpen ? () => onOpen(card.entityId) : undefined} label={`Open ${card.title}`}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <IconBox icon="repeat" tint="upkeep" size={32} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="rowTitle" numberOfLines={1}>{card.title}</Text>
              <Text variant="caption" color="secondary" numberOfLines={2}>{card.due}</Text>
            </View>
            {onOpen ? <Icon name="chevron-right" size={16} color={t.c.fg.tertiary} /> : null}
          </View>
        </Slab>
      );
    case 'list':
      return (
        <Slab>
          <Text variant="labelCaps" color="secondary" style={{ textTransform: 'uppercase' }}>{card.title}</Text>
          {card.items.slice(0, 8).map((it, i) => (
            <Pressable key={i} disabled={!it.entityId || !onOpen} accessibilityRole={it.entityId && onOpen ? 'button' : undefined} onPress={() => it.entityId && onOpen?.(it.entityId, it.type)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.tints.memory.ink }} />
              <Text variant="body" style={{ flex: 1 }} numberOfLines={2}>{it.title}</Text>
              {it.value ? <Text variant="label" style={{ fontVariant: ['tabular-nums'] }}>{it.value}</Text> : null}
            </Pressable>
          ))}
        </Slab>
      );
    case 'number':
      return (
        <Slab>
          <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>{card.label}</Text>
          <Text variant="stat">{card.value}</Text>
          {card.caption ? <Text variant="caption" color="secondary">{card.caption}</Text> : null}
        </Slab>
      );
    case 'chart': {
      const max = Math.max(...card.bars.map((b) => b.value), 1);
      return (
        <Slab>
          <Text variant="labelCaps" color="secondary" style={{ textTransform: 'uppercase' }}>{card.title}</Text>
          {card.bars.slice(0, 8).map((b, i) => (
            <View key={b.label} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text variant="label">{b.label}</Text>
                <Text variant="label" color="secondary">{b.display ?? String(b.value)}</Text>
              </View>
              <ProgressBar value={b.value / max} color={t.c.chart[i % t.c.chart.length]} height={6} accessibilityLabel={`${b.label} ${b.display ?? b.value}`} />
            </View>
          ))}
        </Slab>
      );
    }
  }
}

/** Money & people: the agent waits for this before acting (HANDOFF). */
export function ConfirmCard({ summary, onAnswer }: { summary: string; onAnswer: (ok: boolean) => void }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.c.bg.tile, borderRadius: 24, borderTopLeftRadius: 8, padding: 14, gap: 12, marginRight: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="alert" size={14} color={t.c.accent.gold} />
        <Text variant="labelMicro" color={t.c.accent.gold} style={{ textTransform: 'uppercase' }}>Needs your OK</Text>
      </View>
      <View style={{ backgroundColor: t.c.bg.tileRaised, borderRadius: 16, padding: 12 }}>
        <Text variant="rowTitle">{summary}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Confirm" icon="check" size="sm" onPress={() => onAnswer(true)} style={{ flex: 1 }} />
        <Button title="Not now" icon="x" size="sm" variant="secondary" onPress={() => onAnswer(false)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
