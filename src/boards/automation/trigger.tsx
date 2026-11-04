import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { MANUAL_TRIGGER, type RuleTrigger } from '@core/automation/engine';
import type { TriggerDef } from '@core/registry/types';
import type { LifeOSContext } from '@core/registry/context';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Screen, Text } from '@ui/kit';
import { Caps, Disc, Dot, LILAC, SearchBox, Sub, TRIGGER_COPY, TopBar, moduleWord, useModuleColor } from './parts';

const RECORD = ['core.entity.created', 'core.entity.updated', 'core.entity.status', 'core.tag.applied', 'core.entity.deleted'];

/** Pick a trigger (NR-Automations-Trigger): over the editor, so what you have typed stays. Only triggers that exist are listed. */
export function TriggerPicker({ ctx, visible, name, value, onPick, onClose }: { ctx: LifeOSContext; visible: boolean; name: string; value: RuleTrigger; onPick: (id: string) => void; onClose: () => void }) {
  const t = useTheme();
  const color = useModuleColor();
  const [q, setQ] = useState('');
  const lineOf = (x: TriggerDef) => {
    const line = TRIGGER_COPY[x.id]?.line ?? x.description ?? '';
    return x.module === 'core' ? line : [moduleWord(ctx, x.module), line].filter(Boolean).join(' · ');
  };
  const labelOf = (x: TriggerDef) => TRIGGER_COPY[x.id]?.label ?? x.label;
  const needle = q.trim().toLowerCase();
  const all = [...ctx.registry.triggers.values()].filter((x) => !needle || `${labelOf(x)} ${lineOf(x)}`.toLowerCase().includes(needle));
  const groups: Array<{ title: string; items: TriggerDef[]; color?: string }> = [
    { title: 'From your modules', items: all.filter((x) => x.module !== 'core') },
    { title: 'Any record · pick an Object after', items: RECORD.flatMap((id) => all.filter((x) => x.id === id)), color: t.c.fg.primary },
    { title: 'Cycles and time', items: all.filter((x) => x.module === 'core' && !RECORD.includes(x.id) && x.id !== MANUAL_TRIGGER), color: t.tints.upkeep.ink },
    { title: 'You start it', items: all.filter((x) => x.id === MANUAL_TRIGGER) },
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Screen contentStyle={{ gap: 20 }}>
        <TopBar caption={`${name || 'New automation'} · When`} title="Pick a trigger" onBack={onClose} />
        <SearchBox value={q} onChange={setQ} placeholder="Record, reminder, time" />
        {groups.filter((g) => g.items.length).map((g) => (
          <View key={g.title} style={{ gap: 10 }}>
            <Caps style={{ paddingHorizontal: 4 }}>{g.title}</Caps>
            <View style={{ padding: 8, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 4 }}>
              {g.items.map((x) => {
                const sel = value.id === x.id;
                const manual = x.id === MANUAL_TRIGGER;
                const own = x.module !== 'core';
                return (
                  <Pressable key={x.id} accessibilityRole="button" accessibilityState={{ selected: sel }} onPress={() => onPick(x.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: own ? 64 : 60, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 18, backgroundColor: sel ? t.c.bg.tileRaised : pressed ? t.c.bg.pressed : 'transparent' })}>
                    <Disc icon={TRIGGER_COPY[x.id]?.icon ?? ctx.registry.modules.get(x.module)?.icon ?? 'bolt'} color={manual ? t.c.fg.onAccent : own ? color(x.module) : g.color ?? t.c.fg.primary} bg={manual ? LILAC : sel ? t.c.bg.ground : undefined} iconSize={manual ? 16 : 18} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600' }}>{labelOf(x)}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {own ? <Dot color={color(x.module)} /> : null}
                        <View style={{ flex: 1, minWidth: 0 }}><Sub lines={2}>{lineOf(x)}</Sub></View>
                      </View>
                    </View>
                    {sel ? (
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name="check" size={14} color={t.c.accent.mustardInk} />
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </Screen>
    </Modal>
  );
}
