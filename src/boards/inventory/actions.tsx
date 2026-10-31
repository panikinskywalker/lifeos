import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { ActionSheet, Button, Sheet, Text, useToast } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { addFromLine, halfLeft, moveTo, parseStockLine, quantityWords, spaces, stillGood, undoAll, undoStock, useOne, type StockData, type StockUndo } from '@modules/inventory';
import { PillCloud, PlainPill } from './parts';

/**
 * What a pill does, shared by every Home screen: tap = used up (one), with
 * Undo; long-press = Half left · Still good · Move · Open. And the sheet that
 * adds several things from one line.
 */

export function usePillActions(ctx: LifeOSContext) {
  const toast = useToast();
  const router = useRouter();
  const [menuFor, setMenuFor] = useState<ObjectRecord<StockData> | null>(null);
  const [moving, setMoving] = useState<ObjectRecord<StockData> | null>(null);

  const done = (u: StockUndo | null, message: string, icon: 'check' | 'undo' = 'check') => {
    if (u) toast.show({ message, icon, undo: () => undoStock(ctx, u) });
  };
  const tap = (s: ObjectRecord<StockData>) => {
    const u = useOne(ctx, s.id);
    const left = ctx.records.get<StockData>(s.id)?.data.quantity ?? 0;
    done(u, left > 0 ? `${s.title}: one used, ${quantityWords(left) || '1'} left` : `${s.title} used up`);
  };
  const open = (s: ObjectRecord<StockData>) => router.push(`/entity/stock/${s.id}` as never);

  const sheets = (
    <>
      <ActionSheet
        visible={!!menuFor}
        onClose={() => setMenuFor(null)}
        title={menuFor?.title}
        actions={
          menuFor
            ? [
                { label: 'Half left', icon: 'minus', onPress: () => done(halfLeft(ctx, menuFor.id), `${menuFor.title}: half left`) },
                { label: 'Still good', icon: 'check', onPress: () => done(stillGood(ctx, menuFor.id), `${menuFor.title}: still good`) },
                { label: 'Move to…', icon: 'arrow-right', onPress: () => setMoving(menuFor) },
                { label: 'Used up', icon: 'check-circle', onPress: () => tap(menuFor) },
                { label: 'Open', icon: 'chevron-right', onPress: () => open(menuFor) },
              ]
            : []
        }
      />
      <ActionSheet
        visible={!!moving}
        onClose={() => setMoving(null)}
        title={moving ? `Move ${moving.title} to` : undefined}
        actions={
          moving
            ? spaces(ctx)
                .filter((sp) => sp.id !== moving.data.spaceId && sp.data.holds !== 'clothes')
                .map((sp) => ({ label: sp.title, icon: sp.data.icon ?? 'box', onPress: () => done(moveTo(ctx, moving.id, sp.id), `${moving.title} → ${sp.title}`) }))
            : []
        }
      />
    </>
  );
  return { tap, menu: (s: ObjectRecord<StockData>) => setMenuFor(s), open, sheets };
}

/** Add several at once: type "eggs, butter, 2 milk", see the pills, save. */
export function AddSheet({ ctx, visible, onClose, spaceId }: { ctx: LifeOSContext; visible: boolean; onClose: () => void; spaceId?: string }) {
  const t = useTheme();
  const toast = useToast();
  const [line, setLine] = useState('');
  const things = parseStockLine(line);
  const save = () => {
    if (!things.length) return;
    const us = addFromLine(ctx, line, { spaceId });
    setLine('');
    onClose();
    toast.show({ message: `Added ${us.length} ${us.length === 1 ? 'thing' : 'things'}`, icon: 'check', undo: () => undoAll(ctx, us) });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title="Add to Home" footer={<Button title={things.length ? `Add ${things.length}` : 'Add'} onPress={save} disabled={!things.length} block />}>
      <View style={{ gap: 14 }}>
        <TextInput
          value={line}
          onChangeText={setLine}
          placeholder="eggs, butter, 2 milk"
          placeholderTextColor={t.c.fg.tertiary}
          selectionColor={t.c.accent.mustard}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="What to add, separated by commas"
          style={{ minHeight: 52, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 17 }}
        />
        {things.length ? (
          <PillCloud>
            {things.map((x, i) => (
              <PlainPill key={i} title={[x.name, quantityWords(x.quantity)].filter(Boolean).join(' ')} sub={x.size} />
            ))}
          </PillCloud>
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>Separate with commas. Each goes to the space its name suggests{spaceId ? '' : ' (milk to the Fridge, atta to the Kitchen)'}; you can move it after.</Text>
        )}
      </View>
    </Sheet>
  );
}
