import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { ActionSheet, Icon, IconButton, Screen, Text, useToast } from '@ui/kit';
import { CLOTHES_STATES, clothesByState, clothesStateLabel, clothesStateOf, nextClothesState, setClothesState, type AssetData, type ClothesState } from '@modules/assets';
import { HomeEmpty, Note, PillButton, PillCloud, SectionHead } from './parts';

/**
 * The Clothes space (R7a; NR-Home-Clothes): clothing Assets kept here, as
 * pills in clean · in the wash · packed, under the line that says why. Tap cycles clean → in the wash →
 * clean (a packed one comes back clean); hold for every state or the page.
 * Clothes are Assets (the assets module), reached through the Link *kept in*.
 */

const INK = '#0B0B0D';

/** The clothes pill: lime clean, the yellow block in the wash, dashed packed. */
export function ClothesPill({ title, state, onPress, onLongPress }: { title: string; state: ClothesState; onPress?: () => void; onLongPress?: () => void }) {
  const t = useTheme();
  const c =
    state === 'clean'
      ? { bg: t.dark ? 'rgba(215,245,92,0.14)' : 'rgba(117,91,0,0.10)', fg: t.dark ? blocks.lime : t.c.accent.gold, border: 'transparent' }
      : state === 'wash'
        ? { bg: t.dark ? blocks.yellow : 'rgba(242,107,43,0.14)', fg: t.dark ? INK : '#8A3A10', border: 'transparent' }
        : { bg: 'transparent', fg: t.c.fg.secondary, border: t.dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.24)' };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${clothesStateLabel(state).toLowerCase()}`}
      accessibilityHint="Tap: clean or in the wash. Long-press: more"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, maxWidth: '100%', paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.bg, borderWidth: state === 'packed' ? 1 : 0, borderStyle: 'dashed', borderColor: c.border, opacity: pressed ? 0.7 : 1 })}
    >
      {state === 'wash' ? <Icon name="drop" size={14} color={c.fg} /> : state === 'packed' ? <Icon name="bag" size={14} color={c.fg} /> : null}
      <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: c.fg, flexShrink: 1 }}>{title}</Text>
    </Pressable>
  );
}

export function ClothesSpace({ ctx, space, onBack }: { ctx: LifeOSContext; space: { id: string; title: string }; onBack: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const t = useTheme();
  const [menu, setMenu] = useState<ObjectRecord<AssetData> | null>(null);
  const by = useLive((os) => clothesByState(os, space.id), [space.id]);
  const all = by.clean.length + by.wash.length + by.packed.length;

  const set = (a: ObjectRecord<AssetData>, s: ClothesState) => {
    const undo = setClothesState(ctx, a.id, s);
    toast.show({ message: `${a.title}: ${clothesStateLabel(s).toLowerCase()}`, icon: s === 'wash' ? 'drop' : s === 'packed' ? 'bag' : 'shirt', undo });
  };
  const add = () => router.push({ pathname: '/entity/[type]/new', params: { type: 'asset', category: 'clothing', spaceId: space.id } } as never);
  const subtitle = [`${all} ${all === 1 ? 'thing' : 'things'}`, by.wash.length ? `${by.wash.length} in the wash` : null, by.packed.length ? `${by.packed.length} packed` : null].filter(Boolean).join(' · ');
  const right = <IconButton icon="plus" filled={t.c.accent.mustard} color={t.c.fg.onAccent} accessibilityLabel={`Add to ${space.title}`} onPress={add} />;

  return (
    <Screen title={space.title} subtitle={subtitle} onBack={onBack} right={right} contentStyle={{ gap: 18 }}>
      {all ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20, backgroundColor: t.c.bg.tile }}>
            <Icon name="shirt" size={16} color={t.c.fg.secondary} />
            <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>Clothes are Assets: they don’t run out, so they’re clean, in the wash or packed.</Text>
          </View>
          {CLOTHES_STATES.map(({ value, label }) =>
            by[value].length ? (
              <View key={value} style={{ gap: 10 }}>
                <SectionHead title={label} sub={value === 'packed' ? 'For a trip; tap when it’s back' : null} />
                <PillCloud>
                  {by[value].map((a) => (
                    <ClothesPill key={a.id} title={a.title} state={value} onPress={() => set(a, nextClothesState(clothesStateOf(a.data)))} onLongPress={() => setMenu(a)} />
                  ))}
                </PillCloud>
              </View>
            ) : null,
          )}
          <Note>Tap: clean or in the wash · hold for packed, or to open it.</Note>
        </>
      ) : (
        <HomeEmpty icon="shirt" title={`Nothing in ${space.title.toLowerCase()} yet`} line="Clothes are Assets: add a shirt, your jeans, the turf kit. They don't run out, so they're clean, in the wash or packed.">
          <PillButton title="Add clothes" height={44} onPress={add} />
        </HomeEmpty>
      )}
      <ActionSheet
        visible={!!menu}
        onClose={() => setMenu(null)}
        title={menu?.title}
        actions={
          menu
            ? [
                ...CLOTHES_STATES.filter((s) => s.value !== clothesStateOf(menu.data)).map((s) => ({ label: s.label, icon: s.value === 'wash' ? 'drop' : s.value === 'packed' ? 'bag' : 'shirt', onPress: () => set(menu, s.value) })),
                { label: 'Open', icon: 'arrow-right', onPress: () => router.push(`/entity/asset/${menu.id}` as never) },
              ]
            : []
        }
      />
    </Screen>
  );
}
