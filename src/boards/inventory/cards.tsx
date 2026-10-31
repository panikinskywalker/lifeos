import React from 'react';
import { View } from 'react-native';
import type { Filing } from '@core/repo/filingRepo';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Icon, Text, useToast } from '@ui/kit';
import { useRouter } from 'expo-router';
import { orderAskOf, stockedNoteOf, stockState, undoStocked, type StockData } from '@modules/inventory';
import { BLINKIT, openShop } from './list';
import { PillCloud, StockPill } from './parts';

/**
 * Groceries coming in, as To check cards (HOME-BRIEF screen 6; a first pass
 * in Noir until NR-Home-Incoming): *Blinkit delivered* asks for the invoice
 * (Open Blinkit · Skip); *Stocked from an order* is done, with Undo.
 */

function Shell({ icon, title, line, children }: { icon: string; title: string; line?: string | null; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={18} color={t.c.accent.mustard} />
        </View>
        <View style={{ flex: 1, gap: 2, minWidth: 0 }}>
          <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>{title}</Text>
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
  const ask = orderAskOf(filing);
  if (!ask) return null;
  return (
    <Shell icon="cart" title={filing.label} line={`${filing.flag ?? ''}. In Blinkit: the order › Download invoice › Share › LifeOS.`}>
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
  const router = useRouter();
  return (
    <Shell icon="alert" title={filing.label} line={filing.flag}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title="Add by hand" size="sm" style={{ flex: 1 }} onPress={() => { os.filings.setChecked(filing.id); router.push('/module/inventory/index' as never); }} />
        <Button title="OK" size="sm" variant="secondary" style={{ paddingHorizontal: 22 }} onPress={() => os.filings.setChecked(filing.id)} />
      </View>
    </Shell>
  );
}

/** "9 things from Blinkit · Fridge 5 · Kitchen 3 · Bathroom 1": the pills, Undo, OK. */
export function StockedCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const toast = useToast();
  const note = stockedNoteOf(filing);
  const things = useLive((o) => (note ? note.undo.map((u) => o.records.get<StockData>(u.id)).filter((s): s is NonNullable<typeof s> => !!s) : []), [filing.id]);
  if (!note) return null;
  return (
    <Shell icon="check" title={filing.label} line="Stocked from the invoice. Each went to the space its name suggests.">
      <PillCloud>
        {things.map((s) => (
          <StockPill key={s.id} title={s.title} state={stockState(s.data).state} quantity={s.data.quantity} size="sm" />
        ))}
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
