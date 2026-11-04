import React, { useState, type ReactNode } from 'react';
import { Platform, Pressable, TextInput, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { DAY, describeCycle, nextAfterDone } from '@core/cycles/schedule';
import { logDone, undoLoggedDone, upkeep, type UpkeepItem } from '@core/cycles/upkeep';
import { useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { fontForWeight } from '@ui/theme/tokens';
import { Button, FilterChip, Icon, Sheet, SwitchField, Text, TextField, useToast } from '@ui/kit';
import { ASSET_CATEGORIES, type AssetData } from '@modules/assets';

/**
 * The Assets board's parts (NR-Assets-*): discs, pills, cards, the input box,
 * and what a Cycle says on these screens: its short name, its pill, what a
 * tap on it does (the cost sheet of NR-Assets-Asset, Noted, Snooze).
 */

/** The board's quick actions, and Quick add on its home. */
export const QUICK_ADD = [
  { id: 'assets.add', label: 'Asset', icon: 'box', route: '/entity/asset/new' },
  { id: 'assets.addVehicle', label: 'Vehicle', icon: 'car', route: '/entity/asset/new?category=vehicle' },
  { id: 'assets.addClothes', label: 'Clothes', icon: 'shirt', route: '/entity/asset/new?category=clothing' },
];

export const kmText = (n: number) => Math.abs(Math.round(n)).toLocaleString('en-IN');

/** ₹15.8 L and ₹1.2 Cr from a lakh up in rupees; below that, or in another currency, the amount in full. */
export function compact(os: LifeOSContext, n: number): string {
  if (os.format.defaultCurrency() !== 'INR') return os.format.currency(Math.round(n));
  if (n >= 1e7) return `₹${(n / 1e7).toFixed(1)} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return os.format.currency(Math.round(n));
}

export const CATEGORY_PLURAL: Record<string, string> = { vehicle: 'Vehicles', device: 'Devices', appliance: 'Appliances', clothing: 'Clothing', furniture: 'Furniture', jewellery: 'Jewellery', property: 'Property', other: 'Other' };
export const worthOf = (d: AssetData) => d.currentValue ?? d.purchasePrice ?? 0;
export const categoryIcon = (v?: string) => ASSET_CATEGORIES.find((c) => c.value === v)?.icon ?? 'box';
/** The dashed outline of something to add. */
export const useDash = () => {
  const t = useTheme();
  return t.dark ? '#F5F5F738' : t.c.line;
};

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/** 11/600 +0.9 section label. */
export function Caps({ children, tone = 'secondary', style }: { children: ReactNode; tone?: 'secondary' | 'tertiary' | (string & {}); style?: StyleProp<TextStyle> }) {
  return (
    <Text numberOfLines={1} color={tone} style={[{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9 }, style]}>
      {children}
    </Text>
  );
}

/** Label on the left, a small note on the right. */
export function CapsHead({ label, right, tone }: { label: string; right?: string | null; tone?: 'secondary' | 'tertiary' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingHorizontal: 4, gap: 8 }}>
      <Caps tone={tone} style={{ flex: 1 }}>
        {label}
      </Caps>
      {right ? (
        <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '600' }}>
          {right}
        </Text>
      ) : null}
    </View>
  );
}

/** A round disc with one icon. */
export function Disc({ icon, size = 40, iconSize = 18, color, bg, radius, outline }: { icon: string; size?: number; iconSize?: number; color?: string; bg?: string; radius?: number; outline?: boolean }) {
  const t = useTheme();
  const dash = useDash();
  return (
    <View style={{ width: size, height: size, borderRadius: radius ?? size / 2, backgroundColor: outline ? 'transparent' : bg ?? t.c.bg.tileRaised, borderWidth: outline ? 1.5 : 0, borderColor: dash, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon name={icon} size={iconSize} color={color ?? t.tints.upkeep.ink} />
    </View>
  );
}

export function Hairline() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line }} />;
}

/** The row group: 24 radius, rows split by hairlines. */
export function Group({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[{ paddingVertical: 8, paddingHorizontal: 14, borderRadius: 24, backgroundColor: t.c.bg.tile }, style]}>
      {rows.map((c, i) => (
        <React.Fragment key={i}>
          {i ? <Hairline /> : null}
          {c}
        </React.Fragment>
      ))}
    </View>
  );
}

/** The big card: 28 radius, 18 padding. */
export function BigCard({ children, gap = 12, border }: { children: ReactNode; gap?: number; border?: string }) {
  const t = useTheme();
  return <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap, borderWidth: border ? 1 : 0, borderColor: border }}>{children}</View>;
}

export type Tone = 'alert' | 'lime' | 'quiet' | 'plain';

export function usePillColors(tone: Tone) {
  const t = useTheme();
  return { alert: { bg: t.c.alert.coralFill, fg: t.c.alert.coralText }, lime: { bg: t.c.ok.sageFill, fg: t.c.ok.sageText }, quiet: { bg: t.c.bg.tileRaised, fg: t.c.fg.secondary }, plain: { bg: t.c.bg.tileRaised, fg: t.c.fg.primary } }[tone];
}

/** A status pill: 26 in a row, 28 on a card head. */
export function Pill({ label, tone = 'quiet', height = 26 }: { label: string; tone?: Tone; height?: number }) {
  const c = usePillColors(tone);
  return (
    <View style={{ height, paddingHorizontal: height > 26 ? 11 : 10, borderRadius: 999, backgroundColor: c.bg, justifyContent: 'center', flexShrink: 1, alignSelf: 'center' }}>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: c.fg }}>
        {label}
      </Text>
    </View>
  );
}

/** A 32-high chip at the top of a page or in the details. */
export function TagChip({ label, icon, iconColor, tone = 'plain', dot, leading, onPress, dashed }: { label: string; icon?: string; iconColor?: string; tone?: Tone; dot?: string; leading?: ReactNode; onPress?: () => void; dashed?: boolean }) {
  const t = useTheme();
  const c = usePillColors(tone);
  const dash = useDash();
  return (
    <Pressable disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined} accessibilityLabel={label} hitSlop={6} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, maxWidth: '100%', paddingHorizontal: 12, borderRadius: 999, backgroundColor: dashed ? 'transparent' : c.bg, borderWidth: dashed ? 1.5 : 0, borderStyle: 'dashed', borderColor: dash, opacity: pressed ? 0.75 : 1 })}>
      {dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} /> : null}
      {leading}
      {icon ? <Icon name={icon} size={14} color={iconColor ?? t.tints.upkeep.ink} /> : null}
      <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: dashed ? t.c.fg.secondary : c.fg, flexShrink: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A vendor's letter on a mint square. */
export function LetterBadge({ title, size = 20 }: { title: string; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size > 20 ? 8 : 6, backgroundColor: t.blocks.mint, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size > 20 ? 11 : 10, lineHeight: 13, fontWeight: '800', color: t.c.fg.onAccent }}>{title.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

/** A 46-high pill button: lime as the main one, charcoal with a lime icon otherwise. */
export function Action({ title, icon, primary, onPress, style }: { title: string; icon: string; primary?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const fg = primary ? t.c.accent.mustardInk : t.c.fg.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [{ flex: 1, height: 46, borderRadius: 999, backgroundColor: primary ? t.c.accent.mustard : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 }, style]}>
      <Icon name={icon} size={16} color={primary ? fg : t.c.accent.gold} />
      <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: fg }}>{title}</Text>
    </Pressable>
  );
}

/** Serviced · Renewed · Noted in a row: 40 high, with a lime tick (44 to the finger). */
export function DoneButton({ label, onPress }: { label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={4} onPress={onPress} style={({ pressed }) => ({ height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0, opacity: pressed ? 0.8 : 1 })}>
      <Icon name="check" size={15} strokeWidth={2.2} color={t.c.accent.gold} />
      <Text variant="label">{label}</Text>
    </Pressable>
  );
}

/** A 10-high bar, filled to `value` (0 to 1). */
export function Bar({ value, color, label }: { value: number; color: string; label: string }) {
  const t = useTheme();
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${label}, ${pct} percent`} style={{ height: 10, borderRadius: 5, backgroundColor: t.c.bg.dim, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 5, backgroundColor: color }} />
    </View>
  );
}

/** Nothing owned yet (NR-Assets-List · Empty). */
export function NothingYet() {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ paddingVertical: 28, paddingHorizontal: 22, borderRadius: 28, backgroundColor: t.c.bg.tile, alignItems: 'center', gap: 14 }}>
      <Disc icon="box" size={64} iconSize={28} />
      <Text style={{ fontSize: 20, lineHeight: 25, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center' }}>Nothing here yet</Text>
      <Text color="secondary" style={{ fontSize: 14, lineHeight: 20, maxWidth: 280, textAlign: 'center' }}>
        Add the car, the laptop, the fridge. LifeOS keeps the warranty and the service dates, and speaks up only when one needs you.
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
        <Action title="Add an Asset" icon="plus" primary onPress={() => router.push('/entity/asset/new' as never)} />
        <Action title="Add clothes" icon="shirt" onPress={() => router.push('/entity/asset/new?category=clothing' as never)} />
      </View>
      <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, textAlign: 'center' }}>
        Or tell Dump: “bought a Daikin AC, ₹32,000, 1 year warranty”
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

/** 13/600 label above a control. */
export function Labelled({ label, note, children, style }: { label: string; note?: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: 8, minWidth: 0 }, style]}>
      <Text color="secondary" numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', paddingHorizontal: 4 }}>
        {label}
        {note ? <Text color="secondary" style={{ fontSize: 13, fontWeight: '500' }}>{` · ${note}`}</Text> : null}
      </Text>
      {children}
    </View>
  );
}

/** The Noir input: 56 high, radius 20, hairline at rest, white on focus. `raised` is the one inside a card. */
export function Input({ value, onChange, placeholder, leading, trailing, numeric, mono, multiline, raised, autoFocus, label, autoCapitalize }: { value: string; onChange: (s: string) => void; placeholder?: string; leading?: ReactNode; trailing?: ReactNode; numeric?: boolean; mono?: boolean; multiline?: boolean; raised?: boolean; autoFocus?: boolean; label: string; autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters' }) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: multiline ? 'flex-start' : 'center', gap: 8, minHeight: raised ? 52 : 56, paddingHorizontal: raised ? 14 : 18, paddingVertical: multiline ? 14 : 0, borderRadius: raised ? 18 : 20, backgroundColor: raised ? t.c.bg.tileRaised : t.c.bg.tile, borderWidth: raised && !focus ? 0 : 1.5, borderColor: focus ? t.c.fg.primary : t.c.line }}>
      {leading}
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={t.c.fg.tertiary}
        selectionColor={t.c.accent.mustard}
        cursorColor={t.c.accent.mustard}
        keyboardType={numeric ? 'number-pad' : 'default'}
        multiline={multiline}
        autoFocus={autoFocus}
        autoCapitalize={autoCapitalize}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{ flex: 1, minWidth: 0, color: t.c.fg.primary, fontSize: mono ? 15 : 16, lineHeight: 22, fontFamily: mono ? t.type.mono.fontFamily : fontForWeight(500), paddingVertical: multiline ? 0 : 12, textAlignVertical: multiline ? 'top' : 'center' }}
      />
      {trailing}
    </View>
  );
}

/** Digits only, shown with Indian commas; empty is undefined. */
export function NumberInput({ value, onChange, ...rest }: { value: number | undefined; onChange: (n: number | undefined) => void; placeholder?: string; leading?: ReactNode; trailing?: ReactNode; raised?: boolean; autoFocus?: boolean; label: string }) {
  return (
    <Input
      {...rest}
      numeric
      value={value == null ? '' : value.toLocaleString('en-IN')}
      onChange={(s) => {
        const d = s.replace(/[^\d]/g, '');
        onChange(d ? Number(d) : undefined);
      }}
    />
  );
}

/** A date in the same box: the phone's picker, or a typed day on the web. */
export function DateBox({ label, value, onChange, icon = 'calendar', iconColor, placeholder = 'Not set', raised }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void; icon?: string; iconColor?: string; placeholder?: string; raised?: boolean }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const iso = value?.slice(0, 10);
  const date = iso ? new Date(`${iso}T12:00:00`) : null;
  const valid = date && !Number.isNaN(date.getTime()) ? date : null;
  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${valid ? format(valid, 'd MMMM yyyy') : placeholder}`} onPress={() => (setDraft(iso ?? ''), setOpen(true))} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: raised ? 52 : 56, paddingHorizontal: 14, borderRadius: raised ? 18 : 20, backgroundColor: raised ? t.c.bg.tileRaised : t.c.bg.tile, borderWidth: raised ? 0 : 1.5, borderColor: t.c.line, opacity: pressed ? 0.8 : 1 })}>
        <Icon name={icon} size={16} color={iconColor ?? t.c.fg.secondary} />
        <Text numberOfLines={1} color={valid ? 'primary' : 'tertiary'} style={{ flex: 1, fontSize: 16, lineHeight: 22, fontWeight: '500' }}>
          {valid ? format(valid, 'd MMM yyyy') : placeholder}
        </Text>
      </Pressable>
      {open && Platform.OS === 'web' ? (
        <Sheet visible onClose={() => setOpen(false)} title={label}>
          <TextField
            value={draft}
            placeholder="YYYY-MM-DD"
            onChange={(s) => {
              setDraft(s);
              if (!s) onChange(undefined);
              else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) onChange(s);
            }}
          />
        </Sheet>
      ) : open ? (
        <DateTimePicker
          value={valid ?? new Date()}
          mode="date"
          themeVariant={t.dark ? 'dark' : 'light'}
          accentColor={t.c.accent.mustard}
          onChange={(ev, d) => {
            setOpen(false);
            if (ev.type === 'set' && d) onChange(format(d, 'yyyy-MM-dd'));
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* What a Cycle says here                                              */
/* ------------------------------------------------------------------ */

export type Due = Pick<UpkeepItem, 'cycle' | 'status'>;

export const isService = (i: Due) => i.cycle.template === 'asset.service';
export const isWarranty = (i: Due) => i.cycle.template === 'asset.warranty';
export const isInsurance = (i: Due) => i.cycle.template === 'vehicle.insurance' || /insurance/i.test(i.cycle.name);

/** "Service", "Warranty", "Insurance", else the Cycle's own name. */
export const shortName = (i: Due) => (isService(i) ? 'Service' : isWarranty(i) ? 'Warranty' : isInsurance(i) ? 'Insurance' : i.cycle.name);
/** What you tap when it's done. */
export const doneWord = (i: Due) => (isService(i) ? 'Serviced' : isWarranty(i) ? 'Noted' : 'Renewed');

/** Due this month, or close to it by km: not later, not snoozed, not a warranty that has already ended. */
export function needsLook(i: Due): boolean {
  const { bucket, state, daysLeft } = i.status;
  return bucket !== 'later' && state !== 'snoozed' && state !== 'unscheduled' && !(isWarranty(i) && (daysLeft ?? 0) < 0);
}

/** A service close by km whose date is still far: it shows the km left, not days. */
export const byKm = (i: Due) => i.status.meterLeft != null && i.status.meterLeft > 0 && (i.status.daysLeft == null || i.status.daysLeft > 31);

/** The asset Cycles that need a look, most urgent first (nothing on a thing you sold). */
export function needsALook(os: LifeOSContext, now = Date.now()): UpkeepItem[] {
  return upkeep(os, 'All', now).items.filter((i) => i.entity.object === 'asset' && i.entity.status !== 'sold' && i.entity.status !== 'lost' && needsLook(i));
}

const toneOf = (i: Due): Tone => {
  const { daysLeft: d, meterLeft: m } = i.status;
  if ((d != null && d < 0) || (m != null && m <= 0)) return 'alert';
  if (isWarranty(i)) return d != null && d <= 7 ? 'alert' : 'quiet';
  if (isService(i)) return byKm(i) ? 'quiet' : 'lime';
  return d != null && d <= 14 ? 'alert' : 'lime';
};

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/** The line under a row's title: "ends in 9 days · Thu 12 Nov", "in 10 days · every 6 months", "ends in 21 days · anything to claim?". */
export function whenPill(i: Due): { label: string; tone: Tone } {
  const { daysLeft: d, meterLeft: m } = i.status;
  const date = i.cycle.nextDueAt ? format(i.cycle.nextDueAt, 'EEE d MMM') : null;
  const tone = toneOf(i);
  if (m != null && m <= 0) return { label: `${kmText(m)} km over`, tone };
  if (d == null) return { label: 'by km', tone };
  if (d < 0) return { label: [`${days(-d)} late`, date].filter(Boolean).join(' · '), tone };
  const when = d === 0 ? 'today' : `in ${days(d)}`;
  if (isWarranty(i)) return { label: `ends ${when} · anything to claim?`, tone };
  if (isService(i)) return { label: `${when} · ${describeCycle(i.cycle)}`, tone };
  return { label: [`ends ${when}`, date].filter(Boolean).join(' · '), tone };
}

/** The short pill on a list row: "insurance 9 d", "service 10 d", "warranty 21 d". */
export function listPill(i: Due): { label: string; tone: Tone } {
  const { daysLeft: d, meterLeft: m } = i.status;
  const name = shortName(i).toLowerCase();
  const tone = toneOf(i);
  if (m != null && m <= 0) return { label: `${name} ${kmText(m)} km over`, tone };
  if (byKm(i)) return { label: `${name} ${kmText(m!)} km`, tone };
  if (d != null && d < 0) return { label: `${name} ${-d} d late`, tone };
  return { label: d === 0 ? `${name} today` : `${name} ${d} d`, tone };
}

/** "Due in 9 days · Thu 12 Nov". */
export function dueLine(i: Due): string {
  const d = i.status.daysLeft;
  const date = i.cycle.nextDueAt ? ` · ${format(i.cycle.nextDueAt, 'EEE d MMM')}` : '';
  if (i.status.meterLeft != null && i.status.meterLeft <= 0) return `${kmText(i.status.meterLeft)} km over${date}`;
  if (d == null) return i.status.meterLeft != null ? `${kmText(i.status.meterLeft)} km to go` : 'Not scheduled';
  if (d < 0) return `${days(-d)} overdue${date}`;
  return d === 0 ? `Due today${date}` : `Due in ${days(d)}${date}`;
}

/**
 * Serviced / Renewed open the cost sheet; Noted (a warranty is a heads-up, not
 * a job) quiets it until the day it ends; Snooze is 3 days. Each with Undo.
 */
export function useCycleActions() {
  const os = useOS();
  const toast = useToast();
  const [costFor, setCostFor] = useState<{ cycle: UpkeepItem['cycle']; entity: ObjectRecord } | null>(null);
  const quiet = (i: Due, until: number, message: string, icon: 'check' | 'clock') => {
    const prev = i.cycle.snoozedUntil;
    os.cycles.snooze(i.cycle.id, until);
    toast.show({ message, icon, undo: () => void os.cycles.update(i.cycle.id, { snoozedUntil: prev }) });
  };
  return {
    done: (i: Due, entity: ObjectRecord) => {
      if (isWarranty(i)) quiet(i, i.cycle.nextDueAt ?? Date.now() + 30 * DAY, `${entity.title}: warranty noted`, 'check');
      else setCostFor({ cycle: i.cycle, entity });
    },
    snooze: (i: Due) => quiet(i, Date.now() + 3 * DAY, 'Snoozed 3 days', 'clock'),
    sheet: costFor ? <DoneSheet cycle={costFor.cycle} entity={costFor.entity} onClose={() => setCostFor(null)} /> : null,
  };
}

/**
 * NR-Assets-Asset · After Serviced: the cost, the day, Save; the toast with
 * Undo. A km Cycle also asks the odometer; a note says where (the log shows
 * it); a cost can be filed as an expense, as before.
 */
function DoneSheet({ cycle, entity, onClose }: { cycle: UpkeepItem['cycle']; entity: ObjectRecord; onClose: () => void }) {
  const os = useOS();
  const toast = useToast();
  const word = doneWord({ cycle, status: os.cycles.status(cycle) });
  const [cost, setCost] = useState<number | undefined>(cycle.costEstimate ?? undefined);
  const [day, setDay] = useState<'today' | 'yesterday' | 'pick'>('today');
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const [meter, setMeter] = useState<number | undefined>(undefined);
  const [note, setNote] = useState('');
  const [asExpense, setAsExpense] = useState(true);
  const hasFinance = os.registry.objects.has('transaction');
  const at = day === 'today' ? Date.now() : day === 'yesterday' ? Date.now() - DAY : picked ? new Date(`${picked}T12:00:00`).getTime() : Date.now();
  const next = nextAfterDone(cycle, at, meter ?? null, cycle.nextDueAt).nextDueAt;
  const save = () => {
    const d = logDone(os, cycle.id, { cost: cost ?? null, note: note.trim() || null, meter: meter ?? null, at, asExpense: hasFinance && asExpense });
    onClose();
    toast.show({ message: [`${entity.title} ${word.toLowerCase()}`, cost ? os.format.currency(cost) : null].filter(Boolean).join(' · '), icon: 'check', undo: () => undoLoggedDone(os, d) });
  };
  return (
    <Sheet visible onClose={onClose} title={`${word} · ${entity.title}`} footer={<Button title="Save" block onPress={save} />}>
      {next ? (
        <Text variant="caption" color="secondary" style={{ marginTop: -14 }}>
          {`Next one moves to ${format(next, 'MMM yyyy')}`}
        </Text>
      ) : null}
      <Labelled label="Cost">
        <NumberInput label="Cost in rupees" raised value={cost} onChange={setCost} leading={<Text color="secondary" style={{ fontSize: 16, fontWeight: '600' }}>₹</Text>} />
      </Labelled>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <FilterChip label="Today" selected={day === 'today'} onPress={() => setDay('today')} />
        <FilterChip label="Yesterday" selected={day === 'yesterday'} onPress={() => setDay('yesterday')} />
        <FilterChip label="Pick a date" selected={day === 'pick'} onPress={() => setDay('pick')} />
      </View>
      {day === 'pick' ? <DateBox label="When" raised value={picked} onChange={setPicked} /> : null}
      {cycle.meter ? (
        <Labelled label="Odometer">
          <NumberInput label="Odometer in kilometres" raised value={meter} onChange={setMeter} trailing={<Text color="secondary" style={{ fontSize: 13, fontWeight: '600' }}>km</Text>} />
        </Labelled>
      ) : null}
      <Labelled label="Note">
        <Input label="Note" raised value={note} onChange={setNote} placeholder="Where, who, anything to remember" />
      </Labelled>
      {hasFinance && cost ? <SwitchField icon="receipt" label="Also add as an expense" value={asExpense} onChange={setAsExpense} /> : null}
    </Sheet>
  );
}
