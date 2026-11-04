import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { Icon, Sheet, Text, useToast } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { addFromLine, guessSpaceName, halfLeft, moveTo, parseStockLine, quantityWords, spaces, stillGood, stockState, undoAll, undoStock, useByWords, useOne, type SpaceData, type StockData, type StockUndo } from '@modules/inventory';
import { PillButton, PillCloud, PlainPill, StateChip } from './parts';

/**
 * What a pill does, shared by every Home screen: tap = used up (one), with
 * Undo; hold = the sheet on NR-Home-States (Half left · Still good · Move to…
 * · Used up · Open, its state in the head). And the sheet that adds several
 * things from one line (NR-Home-Form).
 */

/** A sheet's row: 52 high, a lime icon, 16/500. */
function HoldRow({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, paddingHorizontal: 4, opacity: pressed ? 0.7 : 1 })}>
      <Icon name={icon} size={20} color={t.c.accent.mustard} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '500', color: t.c.fg.primary }}>{label}</Text>
    </Pressable>
  );
}

/** The head's chip: "use by tomorrow ~", "2 d past ~", "fresh". */
function stateChip(d: StockData) {
  const st = stockState(d);
  const mark = st.estimated && st.state !== 'fresh' ? ' ~' : '';
  if (st.state === 'use soon') return <StateChip label={`${useByWords(st.daysLeft)}${mark}`} tone="soon" />;
  if (st.state === 'probably gone') return <StateChip label={`${useByWords(st.daysLeft)}${mark}`} tone="gone" />;
  return st.state === 'fresh' ? <StateChip label="fresh" tone="fresh" /> : null;
}

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
  /** Close the sheet first, so the next one (or the page) doesn't open under it. */
  const after = (run: () => void) => () => {
    setMenuFor(null);
    setMoving(null);
    setTimeout(run, 160);
  };

  const sheets = (
    <>
      <Sheet visible={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.title} right={menuFor ? stateChip(menuFor.data) : undefined}>
        {menuFor ? (
          <View style={{ gap: 4 }}>
            <HoldRow icon="minus" label="Half left" onPress={after(() => done(halfLeft(ctx, menuFor.id), `${menuFor.title}: half left`))} />
            <HoldRow icon="check" label="Still good" onPress={after(() => done(stillGood(ctx, menuFor.id), `${menuFor.title}: still good`))} />
            <HoldRow icon="arrow-right" label="Move to…" onPress={after(() => setMoving(menuFor))} />
            <HoldRow icon="check-circle" label="Used up" onPress={after(() => tap(menuFor))} />
            <HoldRow icon="chevron-right" label="Open" onPress={after(() => open(menuFor))} />
          </View>
        ) : null}
      </Sheet>
      <Sheet visible={!!moving} onClose={() => setMoving(null)} title={moving ? `Move ${moving.title} to` : undefined}>
        {moving ? (
          <View style={{ gap: 4 }}>
            {spaces(ctx)
              .filter((sp) => sp.id !== moving.data.spaceId && sp.data.holds !== 'clothes')
              .map((sp: ObjectRecord<SpaceData>) => (
                <HoldRow key={sp.id} icon={sp.data.icon ?? 'box'} label={sp.title} onPress={after(() => done(moveTo(ctx, moving.id, sp.id), `${moving.title} → ${sp.title}`))} />
              ))}
          </View>
        ) : null}
      </Sheet>
    </>
  );
  return { tap, menu: (s: ObjectRecord<StockData>) => setMenuFor(s), move: (s: ObjectRecord<StockData>) => setMoving(s), open, sheets };
}

/** Add several at once: type "eggs, butter, 2 milk", see the pills and where each goes, save. */
export function AddSheet({ ctx, visible, onClose, spaceId }: { ctx: LifeOSContext; visible: boolean; onClose: () => void; spaceId?: string }) {
  const t = useTheme();
  const toast = useToast();
  const [line, setLine] = useState('');
  const things = parseStockLine(line);
  const here = spaceId ? ctx.records.get<SpaceData>(spaceId)?.title : null;
  const save = () => {
    if (!things.length) return;
    const us = addFromLine(ctx, line, { spaceId });
    setLine('');
    onClose();
    toast.show({ message: `Added ${us.length} ${us.length === 1 ? 'thing' : 'things'}`, icon: 'check', undo: () => undoAll(ctx, us) });
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={here ? `Add to ${here}` : 'Add to Home'} footer={<PillButton title={things.length ? `Add ${things.length}` : 'Add'} height={52} onPress={save} disabled={!things.length} />}>
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
          style={{ minHeight: 52, paddingHorizontal: 18, borderRadius: 16, borderWidth: 1.5, borderColor: t.c.fg.primary, backgroundColor: t.c.bg.tileRaised, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 17 }}
        />
        {things.length ? (
          <PillCloud>
            {things.map((x, i) => (
              <PlainPill key={i} title={[x.name, quantityWords(x.quantity)].filter(Boolean).join(' ')} sub={[x.size, `to ${here ?? guessSpaceName(x.name)}`].filter(Boolean).join(' · ')} />
            ))}
          </PillCloud>
        ) : null}
        <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{here ? 'Separate with commas. You can move each one after.' : 'Separate with commas. Each goes to the space its name suggests; you can move it after.'}</Text>
      </View>
    </Sheet>
  );
}
