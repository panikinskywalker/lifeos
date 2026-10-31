import React, { useState } from 'react';
import { Linking, Platform, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fonts } from '@ui/theme/tokens';
import { Button, IconButton, Screen, Text, useToast } from '@ui/kit';
import { BLINKIT_APP, addToList, listText, setOnList, shoppingList, undoStock, type ListEntry } from '@modules/inventory';
import { Card, HomeEmpty, PillCloud, PlainPill, SectionHead } from './parts';

/**
 * The shopping list (HOME-BRIEF screen 4; a first pass until NR-Home-List):
 * what you put on it, then LifeOS's suggestions (dashed, marked), grouped by
 * where you usually buy each. The last step is yours: Copy list, Open Blinkit
 * or Zepto. LifeOS never orders. What comes in leaves the list on its own
 * (a purchase clears "on the list").
 */

/** The shops' apps (Android packages) and their sites as the fallback. */
const SHOPS = [
  { name: 'Blinkit', pkg: BLINKIT_APP, web: 'https://blinkit.com' },
  { name: 'Zepto', pkg: 'com.zeptoconsumerapp', web: 'https://www.zeptonow.com' },
] as const;

/** Open the shop's app; its site when the app isn't there (or on the web). */
export async function openShop(shop: (typeof SHOPS)[number]): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      IntentLauncher.openApplication(shop.pkg);
      return;
    } catch {
      /* not installed: the site */
    }
  }
  await Linking.openURL(shop.web).catch(() => undefined);
}
export const BLINKIT = SHOPS[0];

export function ShoppingList({ ctx }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const t = useTheme();
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const list = useLive((os) => shoppingList(os), []);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/module/inventory/index' as never));

  const add = () => {
    const name = typed.trim();
    if (!name) return;
    const u = addToList(ctx, name);
    setTyped('');
    if (u) toast.show({ message: `${name} on the list`, icon: 'check', undo: () => undoStock(ctx, u) });
  };
  const take = (e: ListEntry) => {
    if (e.suggested) {
      // A suggestion you keep becomes yours.
      const u = setOnList(ctx, e.stock.id, true);
      if (u) toast.show({ message: `${e.stock.title} on the list`, icon: 'check', undo: () => undoStock(ctx, u) });
      return;
    }
    const u = setOnList(ctx, e.stock.id, false);
    if (u) toast.show({ message: `${e.stock.title} off the list`, icon: 'check', undo: () => undoStock(ctx, u) });
  };
  const copy = async () => {
    await Clipboard.setStringAsync(listText(list));
    toast.show({ message: `Copied ${list.length} ${list.length === 1 ? 'thing' : 'things'}`, icon: 'check' });
  };

  const byShop = new Map<string, ListEntry[]>();
  for (const e of list) byShop.set(e.shop, [...(byShop.get(e.shop) ?? []), e]);
  const yours = list.filter((e) => !e.suggested).length;

  return (
    <Screen title="Shopping list" subtitle={list.length ? `${yours} yours · ${list.length - yours} suggested` : null} onBack={back} contentStyle={{ gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          value={typed}
          onChangeText={setTyped}
          onSubmitEditing={add}
          placeholder="Add to the list"
          placeholderTextColor={t.c.fg.tertiary}
          selectionColor={t.c.accent.mustard}
          returnKeyType="done"
          accessibilityLabel="Add to the list"
          style={{ flex: 1, minHeight: 48, paddingHorizontal: 18, borderRadius: 16, backgroundColor: t.c.bg.tileRaised, color: t.c.fg.primary, fontFamily: fonts[500], fontSize: 16 }}
        />
        <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel="Add" onPress={add} />
      </View>

      {list.length ? (
        [...byShop.entries()].map(([shop, entries]) => (
          <View key={shop} style={{ gap: 10 }}>
            <SectionHead title={shop} sub={shop === 'Offline' ? 'Not from an order yet' : 'Where you last ordered these'} />
            <Card>
              <PillCloud>
                {entries.map((e) => (
                  <PlainPill key={e.stock.id} title={[e.stock.title, e.stock.data.size].filter(Boolean).join(' ')} sub={e.suggested ? `suggested · ${e.why}` : e.why} suggested={e.suggested} icon={e.suggested ? 'sparkle' : undefined} onPress={() => take(e)} onLongPress={() => router.push(`/entity/stock/${e.stock.id}` as never)} />
                ))}
              </PillCloud>
            </Card>
          </View>
        ))
      ) : (
        <HomeEmpty icon="cart" title="Nothing to buy" line="Things running low show up here on their own, marked as LifeOS's suggestions. Add anything else above." />
      )}

      {list.length ? (
        <>
          <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>Tap a suggestion to keep it, tap yours to take it off. LifeOS never orders: copy the list and open the app.</Text>
          <Button title="Copy list" icon="list" onPress={copy} block />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {SHOPS.map((s) => (
              <Button key={s.name} title={`Open ${s.name}`} variant="secondary" style={{ flex: 1 }} onPress={() => void openShop(s)} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
