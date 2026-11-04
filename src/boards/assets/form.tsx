import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addYears, format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { RecordFormProps } from '@core/registry/types';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Icon, IconButton, PickerSheet, Text, useToast } from '@ui/kit';
import { ASSET_CATEGORIES, CLOTHES_STATES, clothesSpaces, clothesStateOf, FUELS, VEHICLE_SERVICE, type AssetData, type ClothesState } from '@modules/assets';
import { Caps, DateBox, Input, Labelled, LetterBadge, NumberInput, TagChip } from './parts';

/**
 * The Asset form (NR-Assets-Form), used by New and Edit: category first, so it
 * shows only its Fields. Warranty and service for most things; registration,
 * odometer, fuel and service by months or km for a vehicle; state and space
 * for clothing, and Add clothes fast (one line becomes many Assets).
 */

/** A 40-high pill to pick with; `small` is 36. */
function Pick({ label, selected, onPress, small, lime, leading, icon }: { label: string; selected?: boolean; onPress: () => void; small?: boolean; lime?: boolean; leading?: React.ReactNode; icon?: string }) {
  const t = useTheme();
  const fg = selected ? (lime ? t.c.accent.mustardInk : t.c.bg.ground) : t.c.fg.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} accessibilityLabel={label} hitSlop={small ? 4 : 2} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: small ? 36 : 40, paddingHorizontal: 14, paddingLeft: leading ? 6 : 14, borderRadius: 999, backgroundColor: selected ? (lime ? t.c.accent.mustard : t.c.fg.primary) : t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
      {leading}
      {icon ? <Icon name={icon} size={14} color={selected ? fg : t.tints.upkeep.ink} /> : null}
      <Text numberOfLines={1} style={{ fontSize: small ? 13 : 14, lineHeight: 18, fontWeight: '600', color: fg, flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

/** "Where" and "Kept in": the label and a chip in one box. */
function PickRow({ label, children, card }: { label: string; children: React.ReactNode; card?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: card ? 44 : 56, paddingHorizontal: card ? 4 : 18, borderRadius: 20, backgroundColor: card ? undefined : t.c.bg.tile, borderWidth: card ? 0 : 1.5, borderColor: t.c.line }}>
      <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', width: 64 }}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}>{children}</View>
    </View>
  );
}

const KEEP_PLURAL = /(jeans|shorts|trousers|pants|pyjamas|leggings|socks|tights|chinos|joggers|slippers|shoes|sneakers|sandals|sunglasses)$/i;
const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const single = (s: string) => (KEEP_PLURAL.test(s) ? s : /(ss|x|ch|sh)es$/i.test(s) ? s.slice(0, -2) : /[^s]s$/i.test(s) ? s.slice(0, -1) : s);

/** "6 shirts, 3 jeans, turf kit" → Shirt ×6, Jeans ×3, Turf kit. */
export function parseClothes(text: string): Array<{ name: string; count: number }> {
  return text
    .split(/,|\n|\band\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = /^(\d+)\s*(?:x\s*)?(.+)$/i.exec(s);
      return { name: titleCase(m ? single(m[2]!) : s), count: m ? Math.min(99, Number(m[1])) : 1 };
    })
    .filter((x) => x.count > 0);
}

export function AssetForm({ id, initial, onSaved, linkTo }: RecordFormProps) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const existing = useMemo(() => (id ? os.records.get<AssetData>(id) : null), [id, os]);
  const [name, setName] = useState(existing?.title ?? (initial?.title as string | undefined) ?? '');
  const [d, setD] = useState<AssetData>(() => {
    const { title: _title, ...rest } = (initial ?? {}) as Record<string, unknown>;
    void _title;
    return { category: 'device', ...(existing?.data ?? {}), ...rest } as AssetData;
  });
  const set = <K extends keyof AssetData>(k: K, v: AssetData[K] | undefined) => setD((x) => ({ ...x, [k]: v }));
  const [picker, setPicker] = useState<'place' | 'space' | null>(null);
  const [fast, setFast] = useState('');
  const [vendorText, setVendorText] = useState(() => (existing?.data.vendorId ? os.records.get(existing.data.vendorId)?.title ?? '' : ''));

  const hasOrg = os.registry.objects.has('org');
  const spaces = useLive((o) => (o.registry.objects.has('space') ? o.records.query('space', {}, { limit: 100 }) : []), []);
  const places = useLive((o) => (o.registry.objects.has('place') ? o.records.query('place', {}, { limit: 500 }) : []), []);
  const vendors = useLive(
    (o) => {
      const q = vendorText.trim().toLowerCase();
      if (!hasOrg || !q) return [];
      return o.records
        .query('org', {}, { limit: 2000 })
        .filter((r) => r.title.toLowerCase().includes(q))
        .sort((a, b) => Number(b.title.toLowerCase().startsWith(q)) - Number(a.title.toLowerCase().startsWith(q)) || a.title.localeCompare(b.title))
        .slice(0, 3);
    },
    [vendorText],
  );
  const placeTitle = places.find((p) => p.id === d.placeId)?.title ?? d.location;
  const defaultSpace = useLive((o) => clothesSpaces(o)[0]?.id, []);
  const spaceId = d.spaceId ?? (d.category === 'clothing' ? defaultSpace : undefined);
  const spaceTitle = spaces.find((s) => s.id === spaceId)?.title;

  const vehicle = d.category === 'vehicle';
  const clothing = d.category === 'clothing';
  const close = () => (router.canGoBack() ? router.back() : router.replace('/module/assets/index' as never));

  const save = () => {
    const title = name.trim();
    if (!title) {
      toast.show({ message: 'Add a name first', icon: 'info' });
      return;
    }
    try {
      // A vendor typed and not picked: yours if the name matches, else a new Organisation (Asset has no typed vendor).
      const typed = vendorText.trim();
      const orgs = hasOrg && typed && !d.vendorId ? os.records.query('org', {}, { limit: 2000 }) : [];
      const vendorId = d.vendorId ?? (hasOrg && typed ? (orgs.find((o) => o.title.toLowerCase() === typed.toLowerCase()) ?? os.records.create({ object: 'org', title: typed, data: { kind: 'other' } }, 'user')).id : undefined);
      const data = Object.fromEntries(Object.entries({ ...d, spaceId, vendorId }).filter(([, v]) => v !== undefined && v !== '')) as unknown as AssetData;
      const saved = (id ? os.records.update<AssetData>(id, { title, data }, 'user') : os.records.create<AssetData>({ object: 'asset', title, data, status: 'owned' }, 'user')) as unknown as ObjectRecord;
      if (linkTo && !id) os.links.link(saved.id, linkTo.id, linkTo.kind);
      if (onSaved) onSaved(saved);
      else if (id) close();
      else router.replace(`/entity/asset/${saved.id}` as never);
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    }
  };

  const parsed = parseClothes(fast);
  const total = parsed.reduce((n, p) => n + p.count, 0);
  const addFast = () => {
    const made = parsed.flatMap((p) => Array.from({ length: p.count }, (_, i) => os.records.create<AssetData>({ object: 'asset', title: p.count > 1 ? `${p.name} ${i + 1}` : p.name, data: { category: 'clothing', state: 'clean', ...(spaceId ? { spaceId } : {}) }, status: 'owned' }, 'user')));
    close();
    toast.show({ message: `Added ${made.length} ${made.length === 1 ? 'piece' : 'clothes'}`, icon: 'shirt', undo: () => made.forEach((m) => os.records.delete(m.id)) });
  };

  const warrantyFrom = (years: number) => (d.purchaseDate ? format(addYears(new Date(`${d.purchaseDate.slice(0, 10)}T12:00:00`), years), 'yyyy-MM-dd') : undefined);
  const newVendor = vendorText.trim();
  const exact = vendors.some((v) => v.title.toLowerCase() === newVendor.toLowerCase());
  const rupee = <Text color="secondary" style={{ fontSize: 16, fontWeight: '600' }}>₹</Text>;

  return (
    <View style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 40, gap: 22 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <IconButton icon="x" filled accessibilityLabel="Close" onPress={close} />
          <Text variant="title" numberOfLines={1} accessibilityRole="header" style={{ flex: 1 }}>{id ? 'Edit Asset' : 'New Asset'}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Save" hitSlop={4} onPress={save} style={({ pressed }) => ({ height: 40, paddingHorizontal: 16, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
            <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: t.c.accent.mustardInk }}>Save</Text>
          </Pressable>
        </View>

        <View style={{ gap: 10 }}>
          <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', paddingHorizontal: 4 }}>Category first: the form shows only its Fields</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ASSET_CATEGORIES.map((c) => <Pick key={c.value} label={c.label} icon={c.icon} selected={d.category === c.value} onPress={() => set('category', c.value)} />)}
          </View>
        </View>

        {clothing && !id ? (
          <View style={{ gap: 10 }}>
            <Caps style={{ paddingHorizontal: 4 }}>ADD CLOTHES FAST</Caps>
            <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14 }}>
              <Labelled label="Type what you have">
                <Input label="Type what you have" raised multiline value={fast} onChange={setFast} placeholder="6 shirts, 3 jeans, turf kit" />
              </Labelled>
              {parsed.length ? (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {parsed.map((p, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, height: 40, paddingLeft: 12, paddingRight: p.count > 1 ? 6 : 14, borderRadius: 999, backgroundColor: t.c.accent.mustard }}>
                        <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.accent.mustardInk }}>{p.name}</Text>
                        {p.count > 1 ? (
                          <View style={{ minWidth: 26, height: 26, paddingHorizontal: 7, borderRadius: 13, backgroundColor: t.c.accent.mustardInk, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '700', color: t.c.accent.mustard }}>{`×${p.count}`}</Text>
                          </View>
                        ) : null}
                      </View>
                    ))}
                  </View>
                  <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{`${total} ${total === 1 ? 'piece' : 'clothes'}, all clean${spaceTitle ? `, kept in ${spaceTitle}` : ''}. Each is its own Asset: rename them later.`}</Text>
                  <Button title={`Add ${total} ${total === 1 ? 'piece' : 'clothes'}`} block onPress={addFast} />
                </>
              ) : null}
            </View>
          </View>
        ) : null}

        <Labelled label="Name">
          <Input label="Name" value={name} onChange={setName} placeholder={vehicle ? 'Hyundai Creta' : clothing ? 'White oxford shirt' : 'MacBook Pro 14"'} autoCapitalize="words" autoFocus={!id && !clothing && !name} />
        </Labelled>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Labelled label="Bought on" style={{ flex: 1 }}>
            <DateBox label="Bought on" value={d.purchaseDate} onChange={(v) => set('purchaseDate', v)} />
          </Labelled>
          <Labelled label="Price" style={{ flex: 1 }}>
            <NumberInput label="Price in rupees" value={d.purchasePrice} onChange={(v) => set('purchasePrice', v)} leading={rupee} />
          </Labelled>
        </View>

        <Labelled label="Current value" note="what it’s worth now">
          <NumberInput label="Current value in rupees" value={d.currentValue} onChange={(v) => set('currentValue', v)} leading={rupee} />
        </Labelled>

        {hasOrg ? (
          <View style={{ gap: 8 }}>
            <Labelled label="Vendor">
              <Input
                label="Vendor"
                value={vendorText}
                onChange={(s) => {
                  setVendorText(s);
                  set('vendorId', undefined);
                }}
                placeholder="Croma, Indiranagar"
                autoCapitalize="words"
              />
            </Labelled>
            {newVendor ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {vendors.map((v) => (
                  <Pick
                    key={v.id}
                    label={`${v.title} · Organisation`}
                    selected={d.vendorId === v.id}
                    leading={<LetterBadge title={v.title} size={28} />}
                    onPress={() => {
                      set('vendorId', v.id);
                      setVendorText(v.title);
                    }}
                  />
                ))}
              </View>
            ) : null}
            {newVendor && !d.vendorId && !exact ? <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, paddingHorizontal: 4 }}>{`Saving makes ${newVendor} an Organisation you can open.`}</Text> : null}
          </View>
        ) : null}

        {vehicle ? (
          <VehicleCard d={d} set={set} />
        ) : clothing ? (
          <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14 }}>
            <View style={{ gap: 8 }}>
              <Text color="secondary" style={{ fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}>State</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {CLOTHES_STATES.map((s) => <Pick key={s.value} small lime label={s.label} selected={clothesStateOf(d) === s.value} onPress={() => set('state', s.value as ClothesState)} />)}
              </View>
            </View>
            {spaces.length ? (
              <PickRow card label="Kept in">
                {spaceTitle ? <TagChip label={spaceTitle} icon="shirt" onPress={() => setPicker('space')} /> : <TagChip label="Pick a space in Home" dashed onPress={() => setPicker('space')} />}
              </PickRow>
            ) : null}
          </View>
        ) : (
          <>
            <View style={{ gap: 8 }}>
              <Labelled label="Warranty until">
                <DateBox label="Warranty until" value={d.warrantyUntil} onChange={(v) => set('warrantyUntil', v)} icon="shield" iconColor={t.tints.upkeep.ink} />
              </Labelled>
              {d.purchaseDate ? (
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Text color="secondary" style={{ fontSize: 12, fontWeight: '600', paddingHorizontal: 4 }}>From bought on</Text>
                  {[1, 2].map((y) => <Pick key={y} small label={y === 1 ? '1 year' : '2 years'} selected={d.warrantyUntil?.slice(0, 10) === warrantyFrom(y)} onPress={() => set('warrantyUntil', warrantyFrom(y))} />)}
                </View>
              ) : null}
              <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, paddingHorizontal: 4 }}>You’ll hear about it 30 days before it ends.</Text>
            </View>
            <Labelled label="Service every">
              <NumberInput label="Service every, in months" value={d.serviceEveryMonths} onChange={(v) => set('serviceEveryMonths', v)} placeholder="Leave empty if it needs none" trailing={<Text color="secondary" style={{ fontSize: 14, fontWeight: '600' }}>months</Text>} />
            </Labelled>
          </>
        )}

        <View style={{ gap: 12 }}>
          <Caps style={{ paddingHorizontal: 4 }}>DETAILS</Caps>
          {clothing ? null : (
            <Labelled label="Serial / model">
              <Input label="Serial or model" mono value={d.serial ?? ''} onChange={(s) => set('serial', s)} autoCapitalize="characters" />
            </Labelled>
          )}
          <PickRow label="Where">
            {placeTitle ? <TagChip label={placeTitle} icon="location" iconColor={t.tints.travel.ink} onPress={() => setPicker('place')} /> : <TagChip label="Pick a place" dashed onPress={() => setPicker('place')} />}
          </PickRow>
          {!clothing && !vehicle && spaces.length ? (
            <PickRow label="Kept in">
              {spaceTitle ? <TagChip label={spaceTitle} icon="home" onPress={() => setPicker('space')} /> : <TagChip label="Pick a space in Home" dashed onPress={() => setPicker('space')} />}
            </PickRow>
          ) : null}
          <Labelled label="Notes">
            <Input label="Notes" multiline value={d.notes ?? ''} onChange={(s) => set('notes', s)} />
          </Labelled>
        </View>
      </ScrollView>

      <PickerSheet
        visible={picker === 'place'}
        onClose={() => setPicker(null)}
        title="Where"
        items={places.map((p) => ({ id: p.id, title: p.title, icon: 'location' }))}
        selected={d.placeId ? [d.placeId] : []}
        onSelect={(pid) => {
          setD((x) => ({ ...x, placeId: pid, location: undefined }));
          setPicker(null);
        }}
        onCreate={(q) => {
          setD((x) => ({ ...x, placeId: undefined, location: q }));
          setPicker(null);
        }}
      />
      <PickerSheet
        visible={picker === 'space'}
        onClose={() => setPicker(null)}
        title="Kept in"
        items={spaces.map((s) => ({ id: s.id, title: s.title, icon: 'home' }))}
        selected={spaceId ? [spaceId] : []}
        onSelect={(sid) => {
          set('spaceId', sid);
          setPicker(null);
        }}
      />
    </View>
  );
}

/** A vehicle's Fields, in place of warranty and service. */
function VehicleCard({ d, set }: { d: AssetData; set: <K extends keyof AssetData>(k: K, v: AssetData[K] | undefined) => void }) {
  const t = useTheme();
  const unit = (s: string) => <Text color="secondary" style={{ fontSize: 13, fontWeight: '600' }}>{s}</Text>;
  return (
    <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 14 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Labelled label="Registration" style={{ flex: 1 }}>
          <Input label="Registration" raised mono value={d.plate ?? ''} onChange={(s) => set('plate', s)} placeholder="KA 05 MZ 1234" autoCapitalize="characters" />
        </Labelled>
        <Labelled label="Odometer" style={{ flex: 1 }}>
          <NumberInput label="Odometer in kilometres" raised value={d.odometerKm} onChange={(v) => set('odometerKm', v)} trailing={unit('km')} />
        </Labelled>
      </View>
      <View style={{ gap: 8 }}>
        <Text color="secondary" style={{ fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}>Fuel</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {FUELS.map((f) => <Pick key={f.value} small label={f.label} selected={d.fuel === f.value} onPress={() => set('fuel', d.fuel === f.value ? undefined : f.value)} />)}
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text color="secondary" style={{ fontSize: 13, fontWeight: '600', paddingHorizontal: 4 }}>Service every</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <NumberInput label="Months" raised value={d.serviceEveryMonths} onChange={(v) => set('serviceEveryMonths', v)} placeholder={String(VEHICLE_SERVICE.months)} trailing={unit('months')} />
          </View>
          <Text color="secondary" style={{ fontSize: 13, fontWeight: '600' }}>or</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <NumberInput label="Kilometres" raised value={d.serviceEveryKm} onChange={(v) => set('serviceEveryKm', v)} placeholder={VEHICLE_SERVICE.km.toLocaleString('en-IN')} trailing={unit('km')} />
          </View>
        </View>
        <Text color="secondary" style={{ fontSize: 12, paddingHorizontal: 4 }}>Whichever comes first.</Text>
      </View>
    </View>
  );
}
