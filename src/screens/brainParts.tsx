import React, { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { format, isToday, isYesterday } from 'date-fns';
import type { LifeOSContext } from '@core/registry/context';
import { useTheme } from '@ui/theme/ThemeProvider';
import { shortNameForModule, tintForModule } from '@ui/theme/moduleTint';
import { fontForWeight, type Theme, type TintKey } from '@ui/theme/tokens';
import { Icon, Text, type IconName } from '@ui/kit';

/** The pieces the brain's screens share (the NR-Brain-Parts artboard). */

/** "7:02 am", "7 pm". */
export const passTime = (at: number) => format(at, new Date(at).getMinutes() ? 'h:mm a' : 'h a').toLowerCase();

/** "Today 7:02 am", "Yesterday 7:04 pm", "Mon 2 Nov 7 am". */
export const passDay = (at: number) => `${isToday(at) ? 'Today' : isYesterday(at) ? 'Yesterday' : format(at, 'EEE d MMM')} ${passTime(at)}`;

/** Lines the shared module tints would draw alike. */
const LINE_TINT: Record<string, TintKey> = { deliveries: 'documents' };

/** A module's colour on a brain line. Upkeep's peach is NR-Brief-A-Labels' own: the theme has no token for it yet. */
export function moduleInk(t: Theme, module: string): string {
  if (module === 'upkeep') return t.dark ? '#FFB27A' : t.tints.travel.ink;
  return t.tints[LINE_TINT[module] ?? tintForModule(module)].ink;
}

/** A module's word on a brain line: Home, People, Turf, Upkeep. */
export function moduleWord(os: LifeOSContext, module: string): string {
  if (module === 'upkeep') return 'Upkeep';
  if (module === 'games') return 'Turf';
  return shortNameForModule(module, os.registry.modules.get(module)?.name ?? module.charAt(0).toUpperCase() + module.slice(1));
}

/** Body copy on a card, between primary and secondary (78%). */
export const softInk = (t: Theme) => (t.dark ? '#F5F5F7C7' : t.c.fg.secondary);

/** The "whose words" tint: lilac in Noir. */
export const lilacInk = (t: Theme) => t.tints.tasks.ink;

export function Dot({ color, size = 8, hollow }: { color: string; size?: number; hollow?: boolean }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: hollow ? 'transparent' : color, borderWidth: hollow ? 2 : 0, borderColor: color }} />;
}

export function Disc({ icon, color, size = 36, iconSize = 17 }: { icon: IconName; color: string; size?: number; iconSize?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={iconSize} color={color} />
    </View>
  );
}

export function Hairline({ inset = 0, end = 0 }: { inset?: number; end?: number }) {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line, marginLeft: inset, marginRight: end }} />;
}

/** A small status pill: urgent, done, Claude, LifeOS, Built in. */
export function Pill({ label, color, fill, icon, height = 24 }: { label: string; color: string; fill: string; icon?: IconName; height?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height, paddingHorizontal: height < 24 ? 8 : height > 24 ? 11 : 9, borderRadius: 999, backgroundColor: fill }}>
      {icon ? <Icon name={icon} size={height < 24 ? 10 : 12} color={color} /> : null}
      <Text variant="labelMicro" color={color} numberOfLines={1} style={height < 24 ? { fontSize: 11, lineHeight: 14 } : undefined}>
        {label}
      </Text>
    </View>
  );
}

/** An 11/600 caps label with a 13/400 note on the right. */
export function CapsLabel({ label, meta, top = 10 }: { label: string; meta?: string; top?: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 4, paddingTop: top }}>
      <Text variant="labelCaps" color="secondary" accessibilityRole="header" style={{ textTransform: 'uppercase' }}>
        {label}
      </Text>
      {meta ? (
        <Text variant="caption" color="secondary" style={{ marginLeft: 'auto' }}>
          {meta}
        </Text>
      ) : null}
    </View>
  );
}

/** An input on a card: the raised slab with a hairline, white when focused. */
export function SlabInput({ label, value, onChange, height = 56, radius = 20, leading, ...rest }: Omit<TextInputProps, 'value' | 'onChange' | 'onChangeText' | 'style'> & { label: string; value: string; onChange: (v: string) => void; height?: number; radius?: number; leading?: IconName }) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: height, paddingHorizontal: 18, borderRadius: radius, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderColor: focused ? t.c.fg.primary : t.c.line }}>
      {leading ? <Icon name={leading} size={18} color={t.c.fg.secondary} /> : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.c.fg.tertiary}
        selectionColor={t.c.accent.mustard}
        {...rest}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ flex: 1, minHeight: height - 2, fontFamily: fontForWeight(500), fontSize: 16, color: t.c.fg.primary }}
      />
    </View>
  );
}

/** A centred "N more" under a list. */
export function MoreLink({ label, icon = 'chevron-down', onPress, end = 0 }: { label: string; icon?: IconName; onPress: () => void; end?: number }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, marginRight: end, opacity: pressed ? 0.7 : 1 })}>
      <Text variant="label" color={softInk(t)}>
        {label}
      </Text>
      <Icon name={icon} size={14} color={softInk(t)} />
    </Pressable>
  );
}
