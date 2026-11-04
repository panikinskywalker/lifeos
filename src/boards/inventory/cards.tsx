import React from 'react';
import { Pressable, View } from 'react-native';
import type { LifeOSContext } from '@core/registry/context';
import type { Filing } from '@core/repo/filingRepo';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Icon, Text, useToast } from '@ui/kit';
import { useRouter } from 'expo-router';
import { orderAskOf, shopLabel, stockedNoteOf, stockState, undoStock, undoStocked, type SpaceData, type StockData, type StockUndo } from '@modules/inventory';
import { BLINKIT, openShop } from './list';
import { PillCloud, stateColors } from './parts';

/**
 * Groceries coming in, as To check cards (NR-Home-Incoming): *Blinkit
 * delivered* asks for the invoice (Open Blinkit · Skip); *Stocked from an order*
 * is done, each pill removable, with Undo; *Couldn't read this invoice* offers
 * adding by hand.
 */

function Shell({ icon, iconColor, title, line, children }: { icon: string; iconColor?: string; title: string; line?: string | null; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={18} color={iconColor ?? t.c.accent.mustard} />
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{title}</Text>
          {line ? <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{line}</Text> : null}
        </View>
      </View>
      {children}
    </View>
  );
}

/** "Blinkit · ₹437 · just delivered. Share the invoice and I'll stock the fridge." Open Blinkit · Skip. */
export function OrderCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const t = useTheme();
  const ask = orderAskOf(filing);
  if (!ask) return null;
  const heard = ask.said === 'delivered' ? 'From the delivery notification' : 'From the bank’s SMS';
  return (
    <Shell icon="cart" title={filing.label} line={`${filing.flag ?? ''}. In Blinkit: the order › Download invoice › Share › LifeOS.`}>
      <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary }}>{filing.entityId ? `${heard} · the order is logged in Money either way` : heard}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Open Blinkit" size="sm" style={{ flex: 1 }} onPress={() => void openShop(BLINKIT)} />
        <Button title="Skip" size="sm" variant="secondary" style={{ paddingHorizontal: 22 }} onPress={() => os.filings.setChecked(filing.id)} />
      </View>
    </Shell>
  );
}

/** "Couldn't read this invoice": a scan or a locked PDF. Add by hand · OK. */
export function UnreadCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  return (
    <Shell icon="alert" iconColor={t.c.alert.coralText} title={filing.label} line={filing.flag}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Add by hand" size="sm" style={{ flex: 1 }} onPress={() => { os.filings.setChecked(filing.id); router.push('/module/inventory/index?add=1' as never); }} />
        <Button title="OK" size="sm" variant="secondary" style={{ paddingHorizontal: 22 }} onPress={() => os.filings.setChecked(filing.id)} />
      </View>
    </Shell>
  );
}

/** "9 things from Blinkit · Fridge 5 · Kitchen 3 · Bathroom 1": the pills, each removable, Undo, Looks right. */
export function StockedCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const note = stockedNoteOf(filing);
  const d = useLive((o) => {
    const things = (note?.undo ?? []).flatMap((u) => {
      const s = o.records.get<StockData>(u.id);
      return s ? [{ u, s }] : [];
    });
    const amount = filing.entityId ? o.records.get<{ amount?: number }>(filing.entityId)?.data.amount : undefined;
    return { things, amount };
  }, [filing.id, filing.before]);
  if (!note) return null;
  const remove = (u: StockUndo, title: string) => {
    const rest = note.undo.filter((x) => x.id !== u.id);
    if (!rest.length) return void undoStocked(os, filing.id);
    undoStock(os, u);
    os.filings.update(filing.id, { label: stockedLabel(os, note.shop, rest), before: { ...note, undo: rest } as unknown as Record<string, unknown> });
    toast.show({ message: `${title} taken out`, icon: 'undo' });
  };
  return (
    <Shell icon="check" title={filing.label} line={`Stocked from the invoice${d.amount != null ? `, ${os.format.currency(d.amount)}` : ''}. Each went to the space its name suggests.`}>
      <PillCloud gap={6}>
        {d.things.map(({ u, s }) => {
          const c = stateColors(stockState(s.data).state, t.dark, t.c.accent.gold);
          return (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, maxWidth: '100%', paddingLeft: 12, paddingRight: 4, borderRadius: 999, backgroundColor: c.bg, borderWidth: c.border === 'transparent' ? 0 : 1, borderStyle: 'dashed', borderColor: c.border }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, lineHeight: 17, fontWeight: '600', color: c.fg }}>{[s.title, s.data.size].filter(Boolean).join(' ')}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${s.title}`} hitSlop={8} onPress={() => remove(u, s.title)} style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="x" size={14} color={c.fg} />
              </Pressable>
            </View>
          );
        })}
      </PillCloud>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Looks right" size="sm" style={{ flex: 1 }} onPress={() => os.filings.setChecked(filing.id)} />
        <Button
          title="Undo"
          size="sm"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => {
            undoStocked(os, filing.id);
            toast.show({ message: 'Order taken back out of Home', icon: 'undo' });
          }}
        />
      </View>
    </Shell>
  );
}

/** The card's head again once a pill has left: "8 things from Blinkit · Fridge 5 · Kitchen 3". */
function stockedLabel(os: LifeOSContext, shop: string, undo: StockUndo[]): string {
  const by = new Map<string, number>();
  for (const u of undo) {
    const sp = os.records.get<StockData>(u.id)?.data.spaceId;
    const name = (sp && os.records.get<SpaceData>(sp)?.title) || 'Home';
    by.set(name, (by.get(name) ?? 0) + 1);
  }
  return [`${undo.length} ${undo.length === 1 ? 'thing' : 'things'} from ${shopLabel(shop)}`, ...[...by.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`)].join(' · ');
}
