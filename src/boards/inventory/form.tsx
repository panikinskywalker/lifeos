import React, { useMemo, useState } from 'react';
import { ScrollView, TextInput, View, type TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ObjectRecord } from '@core/domain/types';
import type { RecordFormProps } from '@core/registry/types';
import { useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { DateField, FilterChip, IconButton, Text, Toggle, useToast } from '@ui/kit';
import { buy, estimatedLife, guessSpaceName, isoDay, SHOPS, spaceNamed, spaces, STOCK_SOURCES, type StockData } from '@modules/inventory';
import { Eyebrow, GuessChip, Hairline, Note, PillButton, PillCloud, RowButton } from './parts';

/**
 * Add or edit one thing (NR-Home-Form, the board's form override for Stock):
 * name, size, quantity, space, bought on, keeps for (with LifeOS's guess shown;
 * a number you type is yours from then on), where from, on the list, notes.
 * How long one lasts you is learned, not typed. New goes through a purchase,
 * so a thing you already have gains it and the rate learns from it.
 */

const INPUT: TextStyle = { fontSize: 16, lineHeight: 21, fontFamily: fontForWeight(500) };

function Label({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', paddingHorizontal: 4, color: t.c.fg.secondary }}>{children}</Text>;
}

/** The input box: 56 high, radius 20, a hairline at rest, white on focus. */
function Field({ value, onChange, label, placeholder, numeric, leading, trailing, autoFocus, multiline }: { value: string; onChange: (s: string) => void; label: string; placeholder?: string; numeric?: boolean; leading?: string; trailing?: React.ReactNode; autoFocus?: boolean; multiline?: boolean }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 8, minHeight: multiline ? 104 : 56, paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.c.bg.tile, borderWidth: focused ? 1.5 : 1, borderColor: focused ? t.c.fg.primary : t.c.line }}>
      {leading ? <Text style={{ ...INPUT, color: t.c.fg.secondary }}>{leading}</Text> : null}
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.c.fg.tertiary}
        selectionColor={t.c.accent.mustard}
        cursorColor={t.c.accent.mustard}
        keyboardType={numeric ? 'numeric' : 'default'}
        autoFocus={autoFocus}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[INPUT, trailing ? { minWidth: 48 } : { flex: 1, minWidth: 0 }, { color: t.c.fg.primary, paddingVertical: multiline ? 16 : 14, textAlignVertical: multiline ? 'top' : 'center' }]}
      />
      {trailing}
    </View>
  );
}

export function StockForm({ id, initial, onSaved, linkTo }: RecordFormProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const existing = useMemo(() => (id ? os.records.get<StockData>(id) : null), [id, os]);
  const was = (existing?.data ?? initial ?? {}) as Partial<StockData>;
  const [name, setName] = useState(existing?.title ?? String(initial?.title ?? ''));
  const [size, setSize] = useState(was.size ?? '');
  const [quantity, setQuantity] = useState(was.quantity ?? 1);
  const [spaceId, setSpaceId] = useState(was.spaceId);
  const [boughtOn, setBoughtOn] = useState<string | undefined>(was.boughtOn ?? isoDay(Date.now()));
  /** What you typed for how long it keeps; null: untouched, LifeOS's guess or what was there stands. */
  const [keeps, setKeeps] = useState<string | null>(null);
  const [source, setSource] = useState<string>(was.source ?? 'you');
  const [shop, setShop] = useState(was.shop);
  const [price, setPrice] = useState(was.price != null ? String(was.price) : '');
  const [onList, setOnList] = useState(!!was.onList);
  const [notes, setNotes] = useState(was.notes ?? '');

  const choices = spaces(os).filter((s) => s.data.holds !== 'clothes');
  // New, with no space picked: the one its name suggests, until you pick.
  const space = spaceId ?? (name.trim() ? spaceNamed(os, guessSpaceName(name))?.id : undefined);
  const guess = name.trim() ? estimatedLife(name) : null;
  const yours = was.lifeBy === 'yours';
  const shownLife = keeps ?? (existing ? (was.lifeDays != null ? String(was.lifeDays) : '') : guess != null ? String(guess) : '');
  const whose = keeps !== null || !shownLife ? null : yours ? 'You said' : '~ LifeOS’s guess';

  const close = () => (router.canGoBack() ? router.back() : router.replace('/module/inventory/index' as never));
  const save = () => {
    const title = name.trim();
    if (!title) return toast.show({ message: 'Add a name first', icon: 'info' });
    const days = Number(keeps);
    const life: Partial<StockData> = keeps === null ? {} : keeps.trim() && days > 0 ? { lifeDays: Math.round(days), lifeBy: 'yours' } : { lifeDays: undefined, lifeBy: 'yours' };
    const money = price.trim() ? Number(price) : undefined;
    const from = { source: source as StockData['source'], shop: source === 'order' ? shop : undefined, price: Number.isFinite(money) ? money : undefined };
    const rest = { ...life, onList: onList || undefined, notes: notes.trim() || undefined };
    try {
      let saved: ObjectRecord;
      if (id) {
        saved = os.records.update<StockData>(id, { title, data: { size: size.trim() || undefined, quantity, usedUpOn: quantity > 0 ? undefined : (was.usedUpOn ?? isoDay(Date.now())), spaceId: space, boughtOn, ...from, ...rest } }, 'user') as unknown as ObjectRecord;
      } else {
        const at = boughtOn && boughtOn !== isoDay(Date.now()) ? new Date(`${boughtOn}T12:00:00`).getTime() : Date.now();
        const bought = buy(os, { name: title, size: size.trim() || undefined, quantity, spaceId: space, at, ...from });
        saved = os.records.update<StockData>(bought.id, { data: rest }, 'user') as unknown as ObjectRecord;
        if (linkTo) os.links.link(saved.id, linkTo.id, linkTo.kind);
      }
      if (onSaved) onSaved(saved);
      else if (id) close();
      else router.replace(`/entity/stock/${saved.id}` as never);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };

  const step = (by: number) => setQuantity((q) => Math.max(id ? 0 : 1, Number.isInteger(q) ? q + by : by > 0 ? Math.ceil(q) : Math.floor(q)));
  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 4, paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 32, gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
          <IconButton icon="x" accessibilityLabel="Close" filled onPress={close} />
          <Text numberOfLines={1} accessibilityRole="header" style={{ flex: 1, fontSize: 22, lineHeight: 25, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary }}>{id && existing ? `Edit ${existing.title}` : 'Add a thing'}</Text>
          <RowButton title="Save" kind="lime" onPress={save} />
        </View>

        <View style={{ gap: 8 }}>
          <Label>Name</Label>
          <Field label="Name" value={name} onChange={setName} placeholder="Amul butter" autoFocus={!id} />
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <Label>Size</Label>
            <Field label="Size" value={size} onChange={setSize} placeholder="100 g" />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <Label>Quantity</Label>
            <View style={{ minHeight: 56, paddingHorizontal: 6, borderRadius: 20, borderWidth: 1, borderColor: t.c.line, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <IconButton icon="minus" accessibilityLabel="One less" filled onPress={() => step(-1)} />
              <Text style={{ fontSize: 18, lineHeight: 22, fontWeight: '700', color: t.c.fg.primary, fontVariant: ['tabular-nums'] }}>{String(quantity).replace('.5', '½').replace(/^0½/, '½')}</Text>
              <IconButton icon="plus" accessibilityLabel="One more" filled onPress={() => step(1)} />
            </View>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <Label>Space</Label>
          <PillCloud>
            {choices.map((s) => (
              <FilterChip key={s.id} label={s.title} selected={space === s.id} onPress={() => setSpaceId(s.id)} />
            ))}
          </PillCloud>
        </View>

        <DateField label="Bought on" value={boughtOn} onChange={(v) => setBoughtOn(typeof v === 'string' ? v : undefined)} quick={false} />

        <View style={{ gap: 8 }}>
          <Label>Keeps for</Label>
          <Field
            label="Keeps for, days"
            numeric
            value={shownLife}
            onChange={setKeeps}
            trailing={
              <>
                <Text style={{ flex: 1, fontSize: 15, lineHeight: 20, color: t.c.fg.secondary }}>days</Text>
                {whose ? <GuessChip label={whose} /> : null}
              </>
            }
          />
          <Note>{`${guess != null && !yours ? `LifeOS guessed ${guess} days for ${name.trim().toLowerCase()}. ` : ''}Change it and yours is kept every time you buy it. Empty if it doesn’t go off.`}</Note>
        </View>

        <Hairline />
        <View style={{ paddingHorizontal: 4 }}>
          <Eyebrow>Where from</Eyebrow>
        </View>

        <View style={{ gap: 8 }}>
          <Label>Came from</Label>
          <PillCloud>
            {STOCK_SOURCES.map((o) => (
              <FilterChip key={o.value} label={o.label} selected={source === o.value} onPress={() => setSource(o.value)} />
            ))}
          </PillCloud>
        </View>

        {source === 'order' ? (
          <View style={{ gap: 8 }}>
            <Label>Shop</Label>
            <PillCloud>
              {SHOPS.map((o) => (
                <FilterChip key={o.value} label={o.label} selected={shop === o.value} onPress={() => setShop(o.value)} />
              ))}
            </PillCloud>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Label>Price</Label>
          <Field label="Price" numeric leading="₹" value={price} onChange={setPrice} />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 18, borderRadius: 20, borderWidth: 1, borderColor: t.c.line, backgroundColor: t.c.bg.tile }}>
          <Text style={{ ...INPUT, flex: 1, color: t.c.fg.primary }}>On the list</Text>
          <Toggle value={onList} onChange={setOnList} accessibilityLabel="On the list" />
        </View>

        <View style={{ gap: 8 }}>
          <Label>Notes</Label>
          <Field label="Notes" multiline value={notes} onChange={setNotes} placeholder="The Amul one, not the loose one" />
        </View>

        <Note>How long one lasts you is learned, not typed: it shows on the page once you’ve bought it twice.</Note>
        <PillButton title="Save" height={52} onPress={save} />
      </ScrollView>
    </View>
  );
}
