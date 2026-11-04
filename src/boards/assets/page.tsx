import React, { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { format } from 'date-fns';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import type { RecordControls } from '@core/registry/types';
import { DAY, describeCycle } from '@core/cycles/schedule';
import type { UpkeepItem } from '@core/cycles/upkeep';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { gradients } from '@ui/theme/tokens';
import { ActionSheet, Icon, IconButton, PickerSheet, ScreenHeader, Segmented, Text, useToast } from '@ui/kit';
import { CyclesSection, MeterSheet } from '@ui/components/cycles';
import { assetType, categoryLabel, CLOTHES_STATES, clothesStateOf, FUELS, setClothesState, type AssetData, type ClothesState } from '@modules/assets';
import { KIND_OPTIONS, type DocumentData } from '@modules/documents';
import { Action, Bar, BigCard, CapsHead, Caps, categoryIcon, compact, Disc, doneWord, dueLine, Group, Hairline, isInsurance, isService, isWarranty, kmText, LetterBadge, needsLook, Pill, TagChip, useCycleActions, useDash, type Due } from './parts';

/**
 * An Asset's whole page (NR-Assets-Asset, NR-Assets-Vehicle): a vehicle gets
 * its km, next service, the thing to renew, odometer chart and log; anything
 * else its photo, numbers, service, warranty, details, papers and spends;
 * clothing its state and space. The record page adds Links below.
 */

const useItems = (entity: ObjectRecord<AssetData>): UpkeepItem[] => {
  const os = useOS();
  const def = os.registry.objects.get(entity.object);
  const record = entity as unknown as ObjectRecord;
  return useLive((o) => o.cycles.forEntity(entity.id).map((cycle) => ({ cycle, entity: record, def, status: o.cycles.status(cycle) })), [entity.id, entity.version]);
};

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const day = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).getTime() : null);

export function AssetPage({ entity, ctx, controls }: { entity: ObjectRecord<AssetData>; ctx: LifeOSContext; controls?: RecordControls }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const vehicle = entity.data.category === 'vehicle';
  const clothing = entity.data.category === 'clothing';
  return (
    <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, gap: 18 }}>
      <ScreenHeader
        title={entity.title}
        subtitle={`Asset · ${categoryLabel(entity.data.category)}`}
        onBack={controls?.back}
        right={
          <>
            <IconButton icon="edit" filled accessibilityLabel="Edit" onPress={controls?.edit} />
            <IconButton icon="more" filled accessibilityLabel="More" onPress={controls?.more} />
          </>
        }
      />
      <Chips entity={entity} />
      {vehicle ? <VehicleBody entity={entity} ctx={ctx} /> : clothing ? <ClothingBody entity={entity} ctx={ctx} controls={controls} /> : <ThingBody entity={entity} ctx={ctx} controls={controls} />}
    </View>
  );
}

/** Category, registration, fuel, status (tap to mark it sold or lost), the module. */
function Chips({ entity }: { entity: ObjectRecord<AssetData> }) {
  const t = useTheme();
  const os = useOS();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const d = entity.data;
  const status = entity.status ?? 'owned';
  const statuses = assetType.statuses ?? [];
  const set = (s: string) => {
    const prev = entity.status ?? null;
    os.records.setStatus(entity.id, s);
    toast.show({ message: `${entity.title}: ${statuses.find((x) => x.value === s)?.label.toLowerCase()}`, icon: 'check', undo: () => void os.records.setStatus(entity.id, prev) });
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <TagChip label={categoryLabel(d.category)} icon={categoryIcon(d.category)} />
      {d.plate ? (
        <View style={{ height: 32, paddingHorizontal: 12, borderRadius: 8, backgroundColor: t.c.fg.primary, justifyContent: 'center' }}>
          <Text style={{ fontFamily: t.type.mono.fontFamily, fontSize: 13, lineHeight: 17, letterSpacing: 0.5, color: t.c.bg.ground }}>{d.plate}</Text>
        </View>
      ) : null}
      {d.fuel ? <TagChip label={FUELS.find((f) => f.value === d.fuel)?.label ?? d.fuel} tone="quiet" /> : null}
      <TagChip label={statuses.find((s) => s.value === status)?.label ?? status} tone={status === 'owned' ? 'lime' : 'quiet'} onPress={() => setMenu(true)} />
      {d.category === 'vehicle' ? null : <TagChip label="Assets" tone="quiet" dot={gradients.upkeep[0]} />}
      <ActionSheet visible={menu} onClose={() => setMenu(false)} title="Status" actions={statuses.filter((s) => s.value !== status).map((s) => ({ label: s.label, icon: s.value === 'owned' ? 'check' : s.value === 'sold' ? 'tag' : 'x', onPress: () => (setMenu(false), set(s.value)) }))} />
    </View>
  );
}

/** Three numbers in one card. */
function Trio({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, flexDirection: 'row', gap: 12 }}>{children}</View>;
}

function Stat({ label, value, unit, valueColor, sub, subColor, onPress, a11y }: { label: string; value: string; unit?: string; valueColor?: string; sub?: string | null; subColor?: string; onPress?: () => void; a11y?: string }) {
  const body = (
    <>
      <Caps>{label}</Caps>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} color={valueColor} style={{ flexShrink: 1, fontSize: 20, lineHeight: 24, fontWeight: '700', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{value}</Text>
        {unit ? <Text color="secondary" style={{ fontSize: 12 }}>{unit}</Text> : null}
      </View>
      {sub ? <Text numberOfLines={1} color={subColor ?? 'secondary'} style={{ fontSize: 12, lineHeight: 16, fontWeight: subColor ? '600' : undefined }}>{sub}</Text> : null}
    </>
  );
  const style = { flex: 1, minWidth: 0, gap: 4, minHeight: 44 };
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]}>
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

/** A card's head: a 36 disc, the title, what's on the right. */
function CardHead({ icon, title, right, quiet }: { icon: string; title: string; right?: ReactNode; quiet?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Disc icon={icon} size={36} iconSize={17} color={quiet ? t.c.fg.secondary : undefined} />
      <Text numberOfLines={1} color={quiet ? 'secondary' : 'primary'} accessibilityRole="header" style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '600' }}>{title}</Text>
      {right}
    </View>
  );
}

/** Warranty: a bar from bought on to the end, or a quiet card once it's over; `row` is the vehicle's one-line version when over. */
function Warranty({ entity, row }: { entity: ObjectRecord<AssetData>; row?: boolean }) {
  const t = useTheme();
  const end = day(entity.data.warrantyUntil);
  if (!end) return null;
  const start = day(entity.data.purchaseDate);
  const now = Date.now();
  const left = Math.round((end - now) / DAY);
  const bought = start ? ` · bought ${format(start, 'd MMM yyyy')}` : '';
  if (left < 0 && row) {
    return (
      <View style={{ paddingVertical: 16, paddingHorizontal: 18, borderRadius: 24, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Disc icon="check" size={36} iconSize={16} color={t.c.fg.secondary} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text color="secondary" style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>Warranty</Text>
          <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{`Out of warranty · ended ${format(end, 'd MMM yyyy')}`}</Text>
        </View>
      </View>
    );
  }
  if (left < 0) {
    return (
      <BigCard>
        <CardHead icon="check" title="Warranty" quiet right={<Text color="secondary" style={{ fontSize: 12, fontWeight: '600' }}>{`ended ${format(end, 'd MMM yyyy')}`}</Text>} />
        <Text variant="caption" color="secondary">{`Out of warranty${bought}`}</Text>
        <View accessible accessibilityRole="image" accessibilityLabel="Warranty over" style={{ height: 10, borderRadius: 5, backgroundColor: t.c.bg.pressed }} />
      </BigCard>
    );
  }
  const soon = left <= 30;
  return (
    <BigCard>
      <CardHead icon="shield" title="Warranty" right={<Pill label={`${left} day${left === 1 ? '' : 's'} left`} tone={soon ? 'alert' : 'plain'} height={28} />} />
      <Text variant="caption" color="secondary">{`Until ${format(end, 'EEE d MMM yyyy')}${bought}`}</Text>
      {start && end > start ? (
        <>
          <Bar value={(now - start) / (end - start)} color={soon ? t.c.alert.coral : t.tints.upkeep.ink} label="Warranty used" />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Caps>{format(start, 'MMM yyyy').toUpperCase()}</Caps>
            <Caps>TODAY</Caps>
            <Caps>{format(end, 'MMM yyyy').toUpperCase()}</Caps>
          </View>
        </>
      ) : null}
    </BigCard>
  );
}

/** Service by months: when, what it usually costs, Serviced and Snooze; unscheduled until one is logged. */
function ServiceCard({ item, ctx, onDone, onSnooze }: { item: UpkeepItem; ctx: LifeOSContext; onDone: () => void; onSnooze: () => void }) {
  const c = item.cycle;
  if (item.status.state === 'unscheduled') return <NotScheduled item={item} title="Service" onDone={onDone} />;
  const d = item.status.daysLeft;
  const late = d != null && d < 0;
  const line = [sentence(describeCycle(c)), c.lastDoneAt ? `last ${format(c.lastDoneAt, 'EEE d MMM yyyy')}` : null, c.nextDueAt ? `due ${format(c.nextDueAt, 'EEE d MMM')}` : null, c.costEstimate ? `about ${ctx.format.currency(c.costEstimate)}` : null].filter(Boolean).join(' · ');
  const when = d == null ? 'scheduled' : late ? `${-d} day${d === -1 ? '' : 's'} late` : d === 0 ? 'today' : d > 60 ? `in ${Math.round(d / 30)} months` : `in ${d} day${d === 1 ? '' : 's'}`;
  return (
    <BigCard>
      <CardHead icon="wrench" title="Service" right={<Pill label={when} tone={late ? 'alert' : needsLook(item) ? 'lime' : 'plain'} height={28} />} />
      <Text color="secondary" style={{ fontSize: 13, lineHeight: 18 }}>{line}</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Action title="Serviced" icon="check" primary onPress={onDone} />
        {needsLook(item) ? <Action title="Snooze" icon="clock" onPress={onSnooze} /> : null}
      </View>
    </BigCard>
  );
}

function NotScheduled({ item, title, onDone }: { item: UpkeepItem; title: string; onDone: () => void }) {
  return (
    <BigCard>
      <CardHead icon="wrench" title={title} right={<Pill label="not scheduled" height={28} />} />
      <Text color="secondary" style={{ fontSize: 13, lineHeight: 18 }}>{`${sentence(describeCycle(item.cycle))}. No service logged yet: record the last one to start the countdown.`}</Text>
      <Action title="Record the last service" icon="wrench" onPress={onDone} style={{ flex: 0 }} />
    </BigCard>
  );
}

/* ------------------------------------------------------------------ */
/* Details, papers, spends                                             */
/* ------------------------------------------------------------------ */

function DetailLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 8 }}>
      <Text color="secondary" style={{ width: 84, fontSize: 13 }}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row' }}>{children}</View>
    </View>
  );
}

/** Where, Kept in (a Space in Home; pick one here), Vendor, Serial, Notes. `pickSpace` is off when the page shows the space itself. */
function Details({ entity, pickSpace }: { entity: ObjectRecord<AssetData>; pickSpace: boolean }) {
  const t = useTheme();
  const os = useOS();
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const d = entity.data;
  const r = useLive((o) => ({ place: d.placeId ? o.records.get(d.placeId) : null, space: d.spaceId ? o.records.get(d.spaceId) : null, vendor: d.vendorId ? o.records.get(d.vendorId) : null, spaces: o.registry.objects.has('space') ? o.records.query('space', {}, { limit: 100 }) : [] }), [d.placeId, d.spaceId, d.vendorId]);
  const where = r.place?.title ?? d.location;
  const showSpace = pickSpace && r.spaces.length > 0;
  if (!where && !r.vendor && !d.serial && !d.notes && !showSpace && !r.space) return null;
  const lines = [
    where ? <DetailLine key="where" label="Where"><TagChip label={where} icon="location" iconColor={t.tints.travel.ink} onPress={r.place ? () => router.push(`/entity/place/${r.place!.id}` as never) : undefined} /></DetailLine> : null,
    showSpace || r.space ? (
      <DetailLine key="space" label="Kept in">
        {r.space ? <TagChip label={r.space.title} icon="home" onPress={() => router.push({ pathname: '/module/[id]/[page]', params: { id: 'inventory', page: 'space', space: r.space!.id } } as never)} /> : <TagChip label="Pick a space in Home" dashed onPress={() => setPicking(true)} />}
      </DetailLine>
    ) : null,
    r.vendor ? <DetailLine key="vendor" label="Vendor"><TagChip label={r.vendor.title} leading={<LetterBadge title={r.vendor.title} />} onPress={() => router.push(`/entity/org/${r.vendor!.id}` as never)} /></DetailLine> : null,
    d.serial ? <DetailLine key="serial" label="Serial"><Text selectable style={{ fontFamily: t.type.mono.fontFamily, fontSize: 14, lineHeight: 19 }}>{d.serial}</Text></DetailLine> : null,
    d.notes ? <DetailLine key="notes" label="Notes"><Text style={{ flex: 1, fontSize: 14, lineHeight: 19 }}>{d.notes}</Text></DetailLine> : null,
  ].filter(Boolean);
  return (
    <View style={{ gap: 10 }}>
      <CapsHead label="DETAILS" />
      <View style={{ paddingVertical: 6, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
        {lines.map((l, i) => (
          <React.Fragment key={i}>
            {i ? <Hairline /> : null}
            {l}
          </React.Fragment>
        ))}
      </View>
      <PickerSheet
        visible={picking}
        onClose={() => setPicking(false)}
        title="Kept in"
        items={r.spaces.map((s) => ({ id: s.id, title: s.title, icon: 'home' }))}
        onSelect={(id) => {
          os.records.update<AssetData>(entity.id, { data: { ...entity.data, spaceId: id } }, 'user');
          setPicking(false);
        }}
      />
    </View>
  );
}

/** What's linked to this Asset: papers (Documents) and spends. */
function useLinked(entity: ObjectRecord<AssetData>) {
  return useLive(
    (o) => {
      const linked = o.links.forEntity(entity.id, 'asset');
      const papers = linked.filter((l) => l.other.object === 'document').map((l) => o.records.get<DocumentData>(l.other.id)).filter((x): x is ObjectRecord<DocumentData> => !!x);
      const spends = linked
        .filter((l) => l.other.object === 'transaction')
        .map((l) => o.records.get<{ amount: number; kind: string; date?: string; accountId?: string }>(l.other.id))
        .filter((x): x is ObjectRecord<{ amount: number; kind: string; date?: string; accountId?: string }> => !!x && x.data.kind === 'expense')
        .sort((a, b) => (b.data.date ?? '').localeCompare(a.data.date ?? ''))
        .map((x) => ({ x, account: x.data.accountId ? o.records.get(x.data.accountId)?.title : null }));
      return { papers, spends };
    },
    [entity.id],
  );
}

function Papers({ entity }: { entity: ObjectRecord<AssetData> }) {
  const t = useTheme();
  const router = useRouter();
  const { papers } = useLinked(entity);
  if (!papers.length) return null;
  const kind = (v?: string) => KIND_OPTIONS.find((k) => k.value === v)?.label.split(' / ')[0] ?? null;
  return (
    <View style={{ gap: 10 }}>
      <CapsHead label={`PAPERS · ${papers.length}`} right="Documents" />
      <Group>
        {papers.map((p) => {
          const f = p.data.file;
          const ext = f?.name.includes('.') ? f.name.split('.').pop()!.toUpperCase() : null;
          return (
            <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={p.title} onPress={() => router.push(`/entity/document/${p.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, opacity: pressed ? 0.7 : 1 })}>
              <Disc icon={p.data.kind === 'receipt' ? 'receipt' : 'file'} radius={12} color={t.tints.documents.ink} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{p.title}</Text>
                <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{[kind(p.data.kind), ext, f?.path || null].filter(Boolean).join(' · ')}</Text>
              </View>
            </Pressable>
          );
        })}
      </Group>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingHorizontal: 4 }}>
        <Icon name="lock" size={13} color={t.c.fg.secondary} style={{ marginTop: 2 }} />
        <Text color="secondary" style={{ flex: 1, fontSize: 12, lineHeight: 16 }}>They open from your own folders. LifeOS keeps no copy, and nothing leaves the phone.</Text>
      </View>
    </View>
  );
}

function Spends({ entity, ctx }: { entity: ObjectRecord<AssetData>; ctx: LifeOSContext }) {
  const router = useRouter();
  const { spends } = useLinked(entity);
  if (!spends.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <CapsHead label={`SPENDS · ${spends.length}`} right={ctx.format.currency(spends.reduce((n, s) => n + s.x.data.amount, 0))} />
      <Group>
        {spends.map(({ x, account }) => (
          <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={x.title} onPress={() => router.push(`/entity/transaction/${x.id}` as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, opacity: pressed ? 0.7 : 1 })}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{x.title}</Text>
              <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{[x.data.date ? format(new Date(`${x.data.date.slice(0, 10)}T12:00:00`), 'EEE d MMM yyyy') : null, account].filter(Boolean).join(' · ')}</Text>
            </View>
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{ctx.format.currency(x.data.amount)}</Text>
          </Pressable>
        ))}
      </Group>
    </View>
  );
}

/** Every Cycle on it, to add or change one: folded, under the page's own cards. */
function AllCycles({ entity, count }: { entity: ObjectRecord<AssetData>; count: number }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 12 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Cycles, ${count}`} onPress={() => setOpen(!open)} style={({ pressed }) => ({ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, opacity: pressed ? 0.85 : 1 })}>
        <Disc icon="repeat" size={36} iconSize={17} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{count ? `Cycles · ${count}` : 'Cycles'}</Text>
          <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>Add or change what recurs</Text>
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={t.c.fg.tertiary} />
      </Pressable>
      {open ? <CyclesSection entity={entity as unknown as ObjectRecord} /> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* A device, an appliance, furniture…                                  */
/* ------------------------------------------------------------------ */

function ThingBody({ entity, ctx, controls }: { entity: ObjectRecord<AssetData>; ctx: LifeOSContext; controls?: RecordControls }) {
  const items = useItems(entity);
  const actions = useCycleActions();
  const d = entity.data;
  const service = items.find(isService) ?? null;
  const bought = day(d.purchaseDate);
  const cycleWords = items.map((i) => (isService(i) ? 'service' : isWarranty(i) ? 'warranty' : i.cycle.name.toLowerCase())).sort().join(', ');
  return (
    <>
      <PhotoSlot entity={entity} onPress={controls?.cover} />
      <Trio>
        <Stat label="PAID" value={d.purchasePrice != null ? compact(ctx, d.purchasePrice) : '–'} sub={d.currentValue != null ? `worth ${compact(ctx, d.currentValue)}` : null} />
        <Stat label="BOUGHT" value={bought ? format(bought, 'MMM yyyy') : '–'} sub={bought ? format(bought, 'EEE d MMM') : null} />
        <Stat label="CYCLES" value={String(items.length)} sub={cycleWords || null} />
      </Trio>
      {service ? <ServiceCard item={service} ctx={ctx} onDone={() => actions.done(service, entity as unknown as ObjectRecord)} onSnooze={() => actions.snooze(service)} /> : null}
      <Warranty entity={entity} />
      <Details entity={entity} pickSpace />
      <Papers entity={entity} />
      <Spends entity={entity} ctx={ctx} />
      <AddPaperOrSpend entity={entity} />
      <AllCycles entity={entity} count={items.length} />
      {actions.sheet}
    </>
  );
}

/** A photo, kept on the phone: the record's cover. */
function PhotoSlot({ entity, onPress }: { entity: ObjectRecord<AssetData>; onPress?: () => void }) {
  const dash = useDash();
  const t = useTheme();
  const cover = useLive((o) => o.attachments.cover(entity.id), [entity.id]);
  if (cover?.uri) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel="Change the photo" onPress={onPress}>
        <Image source={{ uri: cover.uri }} style={{ height: 150, borderRadius: 24 }} contentFit="cover" accessibilityIgnoresInvertColors />
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Add a photo" onPress={onPress} style={({ pressed }) => ({ height: 150, borderRadius: 24, borderWidth: 1.5, borderStyle: 'dashed', borderColor: dash, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.7 : 1 })}>
      <Icon name="camera" size={24} color={t.c.fg.secondary} />
      <Text color="secondary" style={{ fontSize: 14, lineHeight: 18, fontWeight: '600' }}>Add a photo</Text>
      <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500' }}>kept on the phone</Text>
    </Pressable>
  );
}

function AddPaperOrSpend({ entity }: { entity: ObjectRecord<AssetData> }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <Action title="Add receipt" icon="receipt" onPress={() => router.push({ pathname: '/entity/[type]/new', params: { type: 'document', kind: 'receipt', assetId: entity.id, title: `${entity.title} receipt` } } as never)} />
      <Action title="Add expense" icon="rupee" onPress={() => router.push({ pathname: '/entity/[type]/new', params: { type: 'transaction', linkId: entity.id, linkKind: 'asset' } } as never)} />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Clothing                                                            */
/* ------------------------------------------------------------------ */

function ClothingBody({ entity, ctx, controls }: { entity: ObjectRecord<AssetData>; ctx: LifeOSContext; controls?: RecordControls }) {
  const os = useOS();
  const toast = useToast();
  const items = useItems(entity);
  const state = clothesStateOf(entity.data);
  const set = (s: ClothesState) => {
    if (s === state) return;
    const undo = setClothesState(os, entity.id, s);
    toast.show({ message: `${entity.title}: ${CLOTHES_STATES.find((x) => x.value === s)!.label.toLowerCase()}`, icon: 'shirt', undo });
  };
  const bought = day(entity.data.purchaseDate);
  return (
    <>
      <PhotoSlot entity={entity} onPress={controls?.cover} />
      <BigCard>
        <CardHead icon="shirt" title="State" />
        <Segmented<ClothesState> options={CLOTHES_STATES} value={state} onChange={set} />
      </BigCard>
      {entity.data.purchasePrice != null || bought ? (
        <Trio>
          <Stat label="PAID" value={entity.data.purchasePrice != null ? compact(ctx, entity.data.purchasePrice) : '–'} />
          <Stat label="BOUGHT" value={bought ? format(bought, 'MMM yyyy') : '–'} sub={bought ? format(bought, 'EEE d MMM') : null} />
        </Trio>
      ) : null}
      <Details entity={entity} pickSpace />
      <Spends entity={entity} ctx={ctx} />
      <AllCycles entity={entity} count={items.length} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* A vehicle                                                           */
/* ------------------------------------------------------------------ */

function VehicleBody({ entity, ctx }: { entity: ObjectRecord<AssetData>; ctx: LifeOSContext }) {
  const t = useTheme();
  const router = useRouter();
  const items = useItems(entity);
  const actions = useCycleActions();
  const [meter, setMeter] = useState(false);
  const now = Date.now();
  const year = new Date(now).getFullYear();
  const readings = useLive((o) => o.cycles.readings(entity.id, 'odometer', 200), [entity.id]);
  const spend = useLive((o) => o.records.aggregate('transaction', { filter: { and: [{ field: 'relation.asset', op: 'relatedTo', value: entity.id }, { field: 'data.kind', op: 'eq', value: 'expense' }, { field: 'data.date', op: 'gte', value: `${year}-01-01` }] } }, { sum: ['data.amount'], count: true }), [entity.id]);
  const log = useLive((o) => o.records.timeline.forEntity(entity.id, 200).filter((e) => e.kind === 'cycle.done'), [entity.id]);

  const latest = readings[0]?.value ?? entity.data.odometerKm ?? null;
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const before = readings.find((r) => r.readAt < monthStart)?.value ?? null;
  const thisMonth = latest != null && before != null && latest > before ? latest - before : null;
  const rate = kmPerMonth(readings, now);
  const service = items.find(isService) ?? null;
  const insurance = items.find(isInsurance) ?? null;
  const others = items.filter((i) => i !== service && needsLook(i)).sort((a, b) => (a.status.daysLeft ?? 999) - (b.status.daysLeft ?? 999));
  const serviceDue = service && (service.status.state === 'overdue' || service.status.state === 'soon' || service.status.state === 'today') ? service : null;
  const urgent = others[0] ?? serviceDue;
  const grid: Array<{ label: string; icon: string; onPress: () => void }> = [
    { label: 'Log odometer', icon: 'gauge', onPress: () => setMeter(true) },
    ...(service ? [{ label: 'Record service', icon: 'wrench', onPress: () => actions.done(service, entity as unknown as ObjectRecord) }] : []),
    { label: 'Add expense', icon: 'receipt', onPress: () => router.push({ pathname: '/entity/[type]/new', params: { type: 'transaction', linkId: entity.id, linkKind: 'asset' } } as never) },
    { label: 'Add document', icon: 'file', onPress: () => router.push({ pathname: '/entity/[type]/new', params: { type: 'document', assetId: entity.id, title: `${entity.title} paper` } } as never) },
  ];
  const left = insurance?.status.daysLeft;
  return (
    <>
      <Trio>
        <Stat label="ODOMETER" value={latest != null ? kmText(latest) : '–'} unit={latest != null ? 'km' : undefined} sub={thisMonth ? `+${kmText(thisMonth)} this month` : latest == null ? 'Tap to log' : readings[0] ? `read ${format(readings[0].readAt, 'd MMM')}` : null} subColor={thisMonth || latest == null ? t.c.accent.gold : undefined} a11y={latest != null ? `Odometer ${kmText(latest)} km, log a reading` : 'Odometer, tap to log'} onPress={() => setMeter(true)} />
        {insurance ? <Stat label="INSURANCE" value={left != null ? String(Math.max(0, left)) : '–'} unit="days" valueColor={left != null && left <= 30 ? t.c.alert.coralText : undefined} sub={insurance.cycle.nextDueAt ? `Exp ${format(insurance.cycle.nextDueAt, 'd MMM')}` : null} /> : <Stat label="CYCLES" value={String(items.length)} sub="tracked" />}
        <Stat label={`${year} SPEND`} value={compact(ctx, spend['sum_data.amount'] ?? 0)} sub={`YTD · ${spend.count}`} onPress={() => router.push('/entity/transaction' as never)} />
      </Trio>

      {service ? <NextService item={service} latest={latest} rate={rate} onDone={() => actions.done(service, entity as unknown as ObjectRecord)} /> : null}

      {urgent ? (
        <BigCard gap={14} border={t.c.alert.coralText + '59'}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Disc icon={isService(urgent) ? 'wrench' : 'shield'} size={36} iconSize={17} bg={t.c.alert.coralFill} color={t.c.alert.coralText} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 21, fontWeight: '600' }}>{urgent.cycle.name}</Text>
              {urgent.cycle.notes || urgent.cycle.costEstimate ? <Text numberOfLines={1} variant="caption" color="secondary">{[urgent.cycle.notes, urgent.cycle.costEstimate ? `about ${ctx.format.currency(urgent.cycle.costEstimate)}` : null].filter(Boolean).join(' · ')}</Text> : null}
            </View>
          </View>
          <Text color={t.c.alert.coralText} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{dueLine(urgent)}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Action title={doneWord(urgent)} icon="check" primary onPress={() => actions.done(urgent, entity as unknown as ObjectRecord)} />
            <Action title="Snooze" icon="clock" onPress={() => actions.snooze(urgent)} />
          </View>
        </BigCard>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {grid.map((g) => (
          <Pressable key={g.label} accessibilityRole="button" accessibilityLabel={g.label} onPress={g.onPress} style={({ pressed }) => ({ flexBasis: '47%', flexGrow: 1, maxWidth: '48.9%', height: 52, borderRadius: 18, backgroundColor: t.c.bg.tile, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, opacity: pressed ? 0.8 : 1 })}>
            <Icon name={g.icon} size={17} color={t.c.accent.gold} />
            <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>{g.label}</Text>
          </Pressable>
        ))}
      </View>

      <OdometerCard readings={readings} rate={rate} now={now} />

      {log.length ? (
        <View style={{ gap: 10 }}>
          <CapsHead label={`SERVICE AND UPKEEP LOG · ${log.length}`} />
          <Group>
            {log.slice(0, 8).map((e) => (
              <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60 }}>
                <Disc icon="check" size={36} iconSize={16} color={t.c.accent.gold} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{e.title.replace(/ done$/, '')}</Text>
                  <Text numberOfLines={1} color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{[format(e.occurredAt, 'EEE d MMM yyyy'), e.meta.meter ? `${kmText(Number(e.meta.meter))} km` : null, e.body].filter(Boolean).join(' · ')}</Text>
                </View>
                {e.meta.cost ? <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{ctx.format.currency(Number(e.meta.cost))}</Text> : null}
              </View>
            ))}
          </Group>
        </View>
      ) : null}

      <Warranty entity={entity} row />
      <Details entity={entity} pickSpace={false} />
      <Papers entity={entity} />
      <AllCycles entity={entity} count={items.length} />

      <MeterSheet visible={meter} onClose={() => setMeter(false)} entity={entity as unknown as ObjectRecord} meter={{ meter: 'odometer', label: 'Odometer', unit: 'km' }} />
      {actions.sheet}
    </>
  );
}

type Reading = { value: number; readAt: number };

/** Km a month over the readings of the last 6 months; null until they span about three weeks. */
function kmPerMonth(readings: Reading[], now: number): number | null {
  const recent = readings.filter((r) => r.readAt >= now - 183 * DAY);
  const a = recent[recent.length - 1];
  const b = recent[0];
  if (!a || !b || b.readAt - a.readAt < 20 * DAY || b.value <= a.value) return null;
  return Math.round(((b.value - a.value) / (b.readAt - a.readAt)) * 30.4 * DAY);
}

/** "around late December". */
function roughly(at: number): string {
  const d = new Date(at).getDate();
  return `${d <= 10 ? 'early' : d <= 20 ? 'mid' : 'late'} ${format(at, 'MMMM')}`;
}

/** Next service on both clocks, km and months: whichever ends first is the lime one. */
function NextService({ item, latest, rate, onDone }: { item: UpkeepItem; latest: number | null; rate: number | null; onDone: () => void }) {
  const t = useTheme();
  const c = item.cycle;
  if (item.status.state === 'unscheduled') return <NotScheduled item={item} title="Service cadence" onDone={onDone} />;
  const now = Date.now();
  const { meterLeft, daysLeft } = item.status;
  const kmAt = meterLeft != null && meterLeft > 0 && rate ? now + (meterLeft / rate) * 30.4 * DAY : null;
  const timeBar = c.nextDueAt && c.lastDoneAt && c.nextDueAt > c.lastDoneAt ? { used: Math.max(0, Math.round((now - c.lastDoneAt) / DAY)), of: Math.round((c.nextDueAt - c.lastDoneAt) / DAY) } : null;
  const kmBar = c.nextDueMeter != null && c.meterEvery && latest != null ? { used: Math.max(0, c.meterEvery - (c.nextDueMeter - latest)), of: c.meterEvery } : null;
  const kmFirst = kmBar && timeBar ? (kmAt != null && c.nextDueAt ? kmAt < c.nextDueAt : kmBar.used / kmBar.of > timeBar.used / timeBar.of) : !!kmBar;
  const over = (meterLeft != null && meterLeft <= 0) || (daysLeft != null && daysLeft < 0);
  const chip = meterLeft != null && meterLeft <= 0 ? `${kmText(meterLeft)} km over` : daysLeft != null && daysLeft < 0 ? `${-daysLeft} day${daysLeft === -1 ? '' : 's'} late` : kmFirst && meterLeft != null ? `${kmText(meterLeft)} km to go` : daysLeft === 0 ? 'today' : daysLeft != null ? `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : 'scheduled';
  const atKm = c.nextDueMeter != null ? `${kmText(c.nextDueMeter)} km` : null;
  const atDate = c.nextDueAt ? format(c.nextDueAt, 'd MMM') : null;
  const headline = atKm && atDate ? `Due at ${atKm} or ${atDate}, whichever first` : atKm ? `Due at ${atKm}` : `Due ${atDate}`;
  const last = c.lastDoneAt ? ` · last ${format(c.lastDoneAt, 'EEE d MMM yyyy')}${c.lastMeter != null ? ` at ${kmText(c.lastMeter)} km` : ''}` : '';
  const pace = rate && kmAt && timeBar ? ` At +${kmText(rate)} km a month the ${kmFirst ? `km run out first, around ${roughly(kmAt)}` : 'date comes first'}.` : '';
  const timeColor = !kmFirst && kmBar ? t.c.accent.mustard : t.tints.upkeep.ink;
  return (
    <BigCard gap={14}>
      <CardHead icon="wrench" title="Next service" right={<Pill label={chip} tone={over ? 'alert' : 'plain'} height={28} />} />
      <Text style={{ fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3 }}>{headline}</Text>
      {timeBar ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Caps tone={!kmFirst && kmBar ? t.c.accent.gold : 'secondary'}>{!kmFirst && kmBar ? 'TIME · ENDS FIRST' : 'TIME'}</Caps>
            <Caps>{`${timeBar.used} OF ${timeBar.of} DAYS`}</Caps>
          </View>
          <Bar value={timeBar.used / timeBar.of} color={timeColor} label="Time since last service" />
        </View>
      ) : null}
      {kmBar ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
            <Caps tone={kmFirst ? t.c.accent.gold : 'secondary'}>{kmFirst && timeBar ? 'DISTANCE · ENDS FIRST' : 'DISTANCE'}</Caps>
            <Caps>{`${kmText(kmBar.used)} OF ${kmText(kmBar.of)} KM`}</Caps>
          </View>
          <Bar value={kmBar.used / kmBar.of} color={meterLeft != null && meterLeft <= 0 ? t.c.alert.coral : kmFirst ? t.c.accent.mustard : t.tints.upkeep.ink} label="Distance since last service" />
        </View>
      ) : null}
      <Text color="secondary" style={{ fontSize: 13, lineHeight: 18 }}>{`${sentence(describeCycle(c))}${last}.${pace}`}</Text>
    </BigCard>
  );
}

/** Readings by month for the last 6, once there are two: a line, the newest lime. */
function OdometerCard({ readings, rate, now }: { readings: Reading[]; rate: number | null; now: number }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const base = new Date(now);
  const months = Array.from({ length: 6 }, (_, i) => {
    const s = new Date(base.getFullYear(), base.getMonth() - 5 + i, 1).getTime();
    const e = new Date(base.getFullYear(), base.getMonth() - 4 + i, 1).getTime();
    return { label: format(s, 'MMM'), value: readings.find((r) => r.readAt >= s && r.readAt < e)?.value ?? null };
  });
  const seen = months.filter((m) => m.value != null);
  if (seen.length < 2) return null;
  const values = seen.map((m) => m.value!);
  const lo = Math.min(...values);
  const span = Math.max(1, Math.max(...values) - lo);
  const x = (i: number) => 10 + (i * (w - 20)) / 5;
  const y = (v: number) => 104 - ((v - lo) / span) * 86;
  const pts = months.flatMap((m, i) => (m.value != null ? [{ x: x(i), y: y(m.value) }] : []));
  const end = pts[pts.length - 1]!;
  return (
    <BigCard>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="tileTitle" accessibilityRole="header">Odometer</Text>
          <Text color="secondary" style={{ fontSize: 13, lineHeight: 17, fontWeight: '500' }}>readings, last 6 months</Text>
        </View>
        {rate ? <Pill label={`+${kmText(rate)} / month`} tone="lime" height={28} /> : null}
      </View>
      <View accessible accessibilityRole="image" accessibilityLabel={`Odometer readings: ${seen.map((m) => `${m.label} ${kmText(m.value!)}`).join(', ')} km`} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w ? (
          <Svg width={w} height={112}>
            <Line x1={0} x2={w} y1={110} y2={110} stroke={t.c.line} strokeWidth={1} />
            <Line x1={0} x2={w} y1={60} y2={60} stroke={t.c.line} strokeWidth={1} strokeDasharray="3 3" />
            <Line x1={0} x2={w} y1={10} y2={10} stroke={t.c.line} strokeWidth={1} strokeDasharray="3 3" />
            <Polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={t.tints.upkeep.ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {pts.slice(0, -1).map((p, i) => <Circle key={i} cx={p.x} cy={p.y} r={4} fill={t.c.bg.tile} stroke={t.tints.upkeep.ink} strokeWidth={2} />)}
            <Circle cx={end.x} cy={end.y} r={6} fill={t.c.accent.mustard} />
          </Svg>
        ) : <View style={{ height: 112 }} />}
        <Text color={t.c.accent.gold} style={{ position: 'absolute', top: -8, right: 0, fontSize: 11, lineHeight: 14, fontWeight: '700' }}>{kmText(values[values.length - 1]!)}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
          {months.map((m, i) => <Text key={m.label} color={i === 5 ? t.c.accent.gold : 'secondary'} style={{ fontSize: 11, lineHeight: 14, fontWeight: i === 5 ? '700' : '600' }}>{m.label}</Text>)}
        </View>
      </View>
      <Text color="secondary" style={{ fontSize: 12, lineHeight: 16 }}>{`Read ${format(readings[0]!.readAt, 'd MMM')} · you type the readings; nothing is read from the car.`}</Text>
    </BigCard>
  );
}
