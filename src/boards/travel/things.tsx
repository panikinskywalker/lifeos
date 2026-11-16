import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text as RNText, TextInput, View, type TextInputProps } from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Line as SvgLine, Path, Polygon, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useToast } from '@ui/kit';
import { addThing, eventsOf, filterThings, happeningMark, happeningOn, nightsOf, onRouteSuggestions, OUTING_KINDS, setThingStatus, stopSpan, thingsAt, thingStatus, type OutingData, type OutingKind, type StopData, type ThingFilter, type ThingStatus, type TripData } from '@modules/travel';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Text, type IconName } from '@ui/kit';
import { datesLabel, Row, RowCard, SectionHead } from './parts';
import { openLink as openUrl } from './jp/planparts';
import { JP_SERIF, MONO } from './jp/kit';

/**
 * Things to do and events on the route (the trip template; JP-Place): a
 * stop's things with All · Planned · Want to · Ideas · Free, each with its
 * kind, status, how busy and the quietest time, Google Maps, Planned / Want
 * to / Remove; the events on the stop's dates and Claude's suggestions for
 * them. Also the Noir pieces the plan's sheets share (the sheet, its fields,
 * the icons).
 */

/* ------------------------------------------------------------------ */
/* Noir pieces (JP-Parts)                                               */
/* ------------------------------------------------------------------ */

export const N = { ink: '#0B0B0D', white: '#F5F5F7', tile: '#1A1A1E', raised: '#26262B', bar: '#303036', lime: '#D7F55C', limeSoft: 'rgba(215,245,92,0.16)', amber: '#F6B547', amberSoft: 'rgba(246,181,71,0.16)', mid: 'rgba(245,245,247,0.62)', low: 'rgba(245,245,247,0.42)', line: 'rgba(255,255,255,0.08)' } as const;

const G: Record<string, React.ReactNode> = {
  back: [<Path key="a" d="m12 19-7-7 7-7" />, <Path key="b" d="M19 12H5" />],
  fwd: [<Path key="a" d="m12 5 7 7-7 7" />, <Path key="b" d="M5 12h14" />],
  x: [<Path key="a" d="M18 6 6 18" />, <Path key="b" d="m6 6 12 12" />],
  plus: [<Path key="a" d="M5 12h14" />, <Path key="b" d="M12 5v14" />],
  check: <Path d="M20 6 9 17l-5-5" />,
  chevron: <Path d="m9 18 6-6-6-6" />,
  down: <Path d="m6 9 6 6 6-6" />,
  pencil: <Path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />,
  trash: [<Path key="a" d="M3 6h18" />, <Path key="b" d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />, <Path key="c" d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />],
  calendar: [<Path key="a" d="M8 2v4" />, <Path key="b" d="M16 2v4" />, <Rect key="c" width="18" height="18" x="3" y="4" rx="2" />, <Path key="d" d="M3 10h18" />],
  bed: [<Path key="a" d="M2 4v16" />, <Path key="b" d="M2 8h18a2 2 0 0 1 2 2v10" />, <Path key="c" d="M2 17h20" />, <Path key="d" d="M6 8v9" />],
  pin: [<Path key="a" d="M20 10c0 4.99-5.23 9.81-7.35 11.5a1 1 0 0 1-1.3 0C9.23 19.81 4 14.99 4 10a8 8 0 0 1 16 0Z" />, <Circle key="b" cx="12" cy="10" r="3" />],
  star: <Path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />,
  sparkle: <Path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />,
  nav: <Polygon points="3 11 22 2 13 21 11 13 3 11" />,
  external: [<Path key="a" d="M15 3h6v6" />, <Path key="b" d="M10 14 21 3" />, <Path key="c" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3" />],
  map: [<Path key="a" d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />, <Path key="b" d="M15 5.764v15" />, <Path key="c" d="M9 3.236v15" />],
  train: [<Path key="a" d="M8 3.1V7a4 4 0 0 0 8 0V3.1" />, <Path key="b" d="m9 15-1-1" />, <Path key="c" d="m15 15 1-1" />, <Path key="d" d="M9 19c-2.8 0-5-2.2-5-5v-4a8 8 0 0 1 16 0v4c0 2.8-2.2 5-5 5Z" />, <Path key="e" d="m8 19-2 3" />, <Path key="f" d="m16 19 2 3" />],
  bus: [<Path key="a" d="M8 6v6" />, <Path key="b" d="M15 6v6" />, <Path key="c" d="M2 12h19.6" />, <Path key="d" d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3" />, <Circle key="e" cx="7" cy="18" r="2" />, <Path key="f" d="M9 18h5" />, <Circle key="g" cx="16" cy="18" r="2" />],
  plane: <Path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />,
  swap: [<Path key="a" d="M8 3 4 7l4 4" />, <Path key="b" d="M4 7h16" />, <Path key="c" d="m16 21 4-4-4-4" />, <Path key="d" d="M20 17H4" />],
  sun: [<Circle key="a" cx="12" cy="12" r="4" />, ...['M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'].map((d) => <Path key={d} d={d} />)],
  snow: [<SvgLine key="a" x1="2" x2="22" y1="12" y2="12" />, <SvgLine key="b" x1="12" x2="12" y1="2" y2="22" />, <Path key="c" d="m20 16-4-4 4-4" />, <Path key="d" d="m4 8 4 4-4 4" />, <Path key="e" d="m16 4-4 4-4-4" />, <Path key="f" d="m8 20 4-4 4 4" />],
  cloud: <Path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />,
  rain: [<Path key="a" d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />, <Path key="b" d="M16 14v6" />, <Path key="c" d="M8 14v6" />, <Path key="d" d="M12 16v6" />],
  eat: [<Path key="a" d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2" />, <Path key="b" d="M7 2v20" />, <Path key="c" d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" />],
  route: [<Circle key="a" cx="6" cy="19" r="3" />, <Path key="b" d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" />, <Circle key="c" cx="18" cy="5" r="3" />],
  waves: [<Path key="a" d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />, <Path key="b" d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />, <Path key="c" d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1" />],
  bag: [<Path key="a" d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />, <Path key="b" d="M3 6h18" />, <Path key="c" d="M16 10a4 4 0 0 1-8 0" />],
  clock: [<Circle key="a" cx="12" cy="12" r="10" />, <Path key="b" d="M12 6v6l4 2" />],
  yen: [<Path key="a" d="M12 9.5V21" />, <Path key="b" d="m6 3 6 7 6-7" />, <Path key="c" d="M6 15h12" />, <Path key="d" d="M6 11h12" />],
  wallet: [<Path key="a" d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1" />, <Path key="b" d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />],
  ticket: [<Path key="a" d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />, <Path key="b" d="M13 5v2" />, <Path key="c" d="M13 17v2" />, <Path key="d" d="M13 11v2" />],
  phone: <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />,
  message: <Path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  file: [<Path key="a" d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />, <Path key="b" d="M14 2v4a2 2 0 0 0 2 2h4" />, <Path key="c" d="M10 9H8" />, <Path key="d" d="M16 13H8" />, <Path key="e" d="M16 17H8" />],
  expand: [<Path key="a" d="M15 3h6v6" />, <Path key="b" d="M9 21H3v-6" />, <Path key="c" d="M21 3l-7 7" />, <Path key="d" d="M3 21l7-7" />],
  copy: [<Rect key="a" width="14" height="14" x="8" y="8" rx="2" ry="2" />, <Path key="b" d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />],
  car: [<Path key="a" d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />, <Circle key="b" cx="7" cy="17" r="2" />, <Path key="c" d="M9 17h6" />, <Circle key="d" cx="17" cy="17" r="2" />],
};
export type GlyphName = keyof typeof G | 'eye';

/** An inline icon as the artboards draw it (24 grid, 2 stroke, round). */
export function Glyph({ name, size = 16, color = N.white, width = 2 }: { name: GlyphName; size?: number; color?: string; width?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
      {G[name] ?? G.pin}
    </Svg>
  );
}

/** A rounded chip: 28 high on raised, an icon and a short label. */
export function Chip({ icon, label, onPress, color = N.mid, bg = N.raised, iconColor, height = 28, a11y }: { icon?: GlyphName; label: string; onPress?: () => void; color?: string; bg?: string; iconColor?: string; height?: number; a11y?: string }) {
  const body = (
    <>
      {icon ? <Glyph name={icon} size={13} color={iconColor ?? color} /> : null}
      <RNText numberOfLines={1} style={{ color, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{label}</RNText>
    </>
  );
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, flexShrink: 0, gap: 5, height, paddingHorizontal: 11, backgroundColor: bg, borderRadius: 999 };
  return onPress ? (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress} style={({ pressed }) => [style, { opacity: pressed ? 0.75 : 1 }]}>
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

/** A section title (17/600) with its quiet line, as the cards draw it. */
export function CardHead({ title, sub, right }: { title: string; sub?: string | null; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
        <RNText numberOfLines={1} style={{ color: N.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{title}</RNText>
        {sub ? <RNText numberOfLines={1} style={{ color: N.mid, fontSize: 13, lineHeight: 17, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_500Medium' }}>{sub}</RNText> : null}
      </View>
      {right}
    </View>
  );
}

/** The pill buttons of the artboards: lime primary, raised secondary, outlined. */
export function PillButton({ label, icon, onPress, kind = 'raised', height = 50, grow = true, a11y, iconColor }: { label?: string; icon?: GlyphName; onPress?: () => void; kind?: 'lime' | 'raised' | 'outline' | 'ink' | 'paper'; height?: number; grow?: boolean; a11y?: string; iconColor?: string }) {
  const bg = kind === 'lime' ? N.lime : kind === 'raised' ? N.raised : kind === 'ink' ? N.ink : kind === 'paper' ? 'rgba(11,11,13,0.14)' : 'transparent';
  const fg = kind === 'lime' || kind === 'paper' ? N.ink : N.white;
  const ic = iconColor ?? (kind === 'lime' || kind === 'paper' ? N.ink : N.lime);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y ?? label} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexGrow: grow ? 1 : 0, flexShrink: grow ? 1 : 0, flexBasis: grow ? 0 : undefined, gap: 8, height, width: label ? undefined : height, minWidth: 0, paddingHorizontal: label ? (kind === 'outline' ? 18 : 20) : 0, backgroundColor: bg, borderWidth: kind === 'outline' ? 1.5 : 0, borderColor: 'rgba(245,245,247,0.28)', borderRadius: 999, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      {icon ? <Glyph name={icon} size={label ? 17 : 20} color={ic} /> : null}
      {label ? <RNText numberOfLines={1} style={{ color: fg, fontSize: height >= 50 ? 16 : height >= 46 ? 15 : 13, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{label}</RNText> : null}
    </Pressable>
  );
}

/** The sheet of the artboards (JP-Edit): #1A1A1E, radius 32, a grabber, a mono eyebrow over a 20/700 title and a round close. */
export function JPSheet({ visible, onClose, eyebrow, title, children, footer }: { visible: boolean; onClose: () => void; eyebrow?: string; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }} />
        <View style={{ maxHeight: '92%', backgroundColor: N.tile, borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 20) + 8, boxShadow: '0 -12px 32px rgba(0,0,0,0.5)' }}>
          <View style={{ alignSelf: 'center', width: 36, height: 5, backgroundColor: 'rgba(245,245,247,0.25)', borderRadius: 3 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 14 }}>
            <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
              {eyebrow ? <RNText style={{ color: N.mid, fontSize: 10, letterSpacing: 1.5, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{eyebrow}</RNText> : null}
              <RNText numberOfLines={1} style={{ color: N.white, fontSize: 20, lineHeight: 24, fontFamily: 'PlusJakartaSans_700Bold' }}>{title}</RNText>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: N.raised, alignItems: 'center', justifyContent: 'center' }}>
              <Glyph name="x" size={16} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 14 }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A field's caps label (11/600, 0.9 tracking, 42%). */
export function FieldLabel({ children }: { children: string }) {
  return <RNText style={{ color: N.low, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}>{children.toUpperCase()}</RNText>;
}

/** A labelled text box: 50 high, raised, radius 16 (84 for long text). */
export function FieldInput({ label, value, onChange, long, half, ...rest }: { label: string; value: string; onChange: (v: string) => void; long?: boolean; half?: boolean } & Omit<TextInputProps, 'value' | 'onChange'>) {
  return (
    <View style={[{ gap: 6, minWidth: 0 }, half ? { flexGrow: 1, flexShrink: 1, flexBasis: 0 } : null]}>
      <FieldLabel>{label}</FieldLabel>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={N.low}
        multiline={long}
        style={[{ color: N.white, fontSize: 15, fontFamily: long ? 'PlusJakartaSans_400Regular' : 'PlusJakartaSans_500Medium', backgroundColor: N.raised, borderRadius: 16, paddingHorizontal: 16 }, long ? { minHeight: 84, paddingTop: 14, paddingBottom: 14, lineHeight: 21, textAlignVertical: 'top' } : { height: 50 }]}
        {...rest}
      />
    </View>
  );
}

/** A segmented pick (raised track, white thumb). */
export function SegPick<T extends string>({ options, value, onChange, height = 36, track = N.raised }: { options: Array<{ value: T; label: string }>; value: T; onChange: (v: T) => void; height?: number; track?: string }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 4, backgroundColor: track, borderRadius: 999 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={o.label} onPress={() => onChange(o.value)} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? N.white : 'transparent' }}>
            <RNText numberOfLines={1} style={{ color: on ? N.ink : N.mid, fontSize: 14, lineHeight: 18, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{o.label}</RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The crowd meter: five rising bars, lit up to how busy it gets. */
export function CrowdMeter({ n }: { n: number }) {
  return (
    <View accessibilityLabel={`How busy: ${n} of 5`} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 18 }}>
      {[1, 2, 3, 4, 5].map((i) => <View key={i} style={{ width: 5, height: 3 + i * 3, borderRadius: 2, backgroundColor: i <= n ? N.lime : N.bar }} />)}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Things to do                                                         */
/* ------------------------------------------------------------------ */

const STATUS_WORD: Record<ThingStatus, string> = { idea: 'Idea', want: 'Want to', planned: 'Planned', done: 'Done' };
const KIND_LOOK: Record<string, { bg: string; icon: GlyphName }> = { eat: { bg: '#F26B2B', icon: 'eat' }, do: { bg: '#5FD08A', icon: 'route' }, see: { bg: '#A9C4FF', icon: 'pin' }, relax: { bg: '#6CC6FF', icon: 'waves' }, shop: { bg: '#E08BC8', icon: 'bag' }, event: { bg: '#F2C94C', icon: 'calendar' } };
/** "quietest before 8:00", but "Quiet in winter" as it is. */
const quietWords = (q: string) => (/\b(quiet|busy|crowd|best)/i.test(q) ? q : `quietest ${q.replace(/^\w/, (c) => c.toLowerCase())}`);
const kindLabel = (k: OutingKind) => OUTING_KINDS.find((x) => x.value === k)?.label ?? 'See';

export function StatusPill({ s }: { s: ThingStatus }) {
  const [bg, fg] = s === 'planned' ? [N.limeSoft, N.lime] : s === 'want' ? [N.amberSoft, N.amber] : [N.raised, N.mid];
  return <Chip label={STATUS_WORD[s]} bg={bg} color={fg} height={26} />;
}

/** A thing's row (JP-Place): kind tile, name, kind · cost · note, status, the crowd and quietest time; open, its actions. */
function ThingRow({ x, open, onToggle, onStatus, onRemove, onMaps, cost, first }: { x: ObjectRecord<OutingData>; open: boolean; onToggle: () => void; onStatus: (s: ThingStatus) => void; onRemove: () => void; onMaps: () => void; cost: (n: number) => string; first: boolean }) {
  const look = KIND_LOOK[x.data.kind] ?? KIND_LOOK.see!;
  const s = thingStatus(x);
  const sub = [kindLabel(x.data.kind), x.data.cost === 0 ? 'free' : x.data.cost ? `${cost(x.data.cost)} each` : null, x.data.notes?.split('\n')[0]].filter(Boolean).join(' · ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${x.title}, ${STATUS_WORD[s]}`} accessibilityState={{ expanded: open }} onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderTopWidth: first ? 1 : 1, borderTopColor: N.line }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: look.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Glyph name={look.icon} size={16} color={N.ink} />
      </View>
      <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
            <RNText style={{ color: N.white, fontSize: 15, lineHeight: 20, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{x.title}</RNText>
            <RNText numberOfLines={open ? undefined : 2} style={{ color: N.mid, fontSize: 12, lineHeight: 16, fontFamily: 'PlusJakartaSans_400Regular' }}>{sub}</RNText>
          </View>
          <StatusPill s={s} />
        </View>
        {x.data.crowd || x.data.quietest ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, minWidth: 0 }}>
            {x.data.crowd ? <CrowdMeter n={x.data.crowd} /> : null}
            {x.data.quietest ? <RNText numberOfLines={1} style={{ flexShrink: 1, color: N.mid, fontSize: 12, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{quietWords(x.data.quietest)}</RNText> : null}
          </View>
        ) : null}
        {open ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -16 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
            <Chip icon="external" label="Open in Google Maps" height={32} onPress={onMaps} />
            {(x.data.book ?? []).map((b) => <Chip key={b.url} icon="external" label={b.label} height={32} onPress={() => openUrl(b.url)} />)}
            {(['planned', 'want', 'idea'] as ThingStatus[]).filter((k) => k !== s).map((k) => <Chip key={k} icon={k === 'planned' ? 'check' : k === 'want' ? 'star' : 'sparkle'} label={STATUS_WORD[k]} height={32} onPress={() => onStatus(k)} />)}
            {s !== 'done' && s === 'planned' ? <Chip icon="check" label="Done" height={32} onPress={() => onStatus('done')} /> : null}
            <Chip icon="x" label="Remove" height={32} onPress={onRemove} />
          </ScrollView>
        ) : null}
      </View>
    </Pressable>
  );
}

/** A stop's things to do (JP-Place): the card with its filters, rows that open to their actions, and Add. */
export function ThingsSection({ stop, ctx, cost, stops }: { stop: ObjectRecord<StopData>; ctx: LifeOSContext; cost: (n: number) => string; stops?: ObjectRecord<StopData>[] }) {
  const toast = useToast();
  const [filter, setFilter] = useState<ThingFilter>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const all = useLive((os) => thingsAt(os, os.records.get<StopData>(stop.id) ?? stop), [stop.id]);
  const shown = filterThings(all, filter);
  const count = (f: ThingFilter) => filterThings(all, f).length;
  const set = (x: ObjectRecord<OutingData>, s: ThingStatus) => toast.show({ message: `${x.title}: ${STATUS_WORD[s].toLowerCase()}`, icon: 'check', undo: setThingStatus(ctx, x.id, s) });
  const remove = (x: ObjectRecord<OutingData>) => {
    ctx.records.delete(x.id, 'user');
    toast.show({ message: `${x.title} removed`, icon: 'trash', undo: () => ctx.records.restore(x.id, 'user') });
  };
  const maps = (x: ObjectRecord<OutingData>) => openUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${x.title} ${stop.title}`)}`);
  const planned = count('planned');
  const FILTERS: Array<[ThingFilter, string]> = [['all', 'All'], ['planned', `Planned · ${planned}`], ['want', `Want to · ${count('want')}`], ['idea', `Ideas · ${count('idea')}`], ['free', `Free · ${count('free')}`]];
  return (
    <View style={{ gap: 10, padding: 16, backgroundColor: N.tile, borderRadius: 28, overflow: 'hidden' }}>
      <CardHead title="Things to do" sub={`${all.length} here${planned ? ` · ${planned} planned` : ''}`} right={<Chip icon="plus" label="Add" onPress={() => setAdding(true)} a11y="Add a thing to do" />} />
      {all.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
          {FILTERS.map(([f, label]) => {
            const on = f === filter;
            return (
              <Pressable key={f} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setFilter(f)} style={{ height: 34, paddingHorizontal: 16, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? N.white : N.raised }}>
                <RNText numberOfLines={1} style={{ color: on ? N.ink : N.white, fontSize: 14, lineHeight: 18, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{label}</RNText>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View>
        {shown.map((x, i) => <ThingRow key={x.id} x={x} first={i === 0} open={openId === x.id} onToggle={() => setOpenId((o) => (o === x.id ? null : x.id))} onStatus={(s) => set(x, s)} onRemove={() => remove(x)} onMaps={() => maps(x)} cost={cost} />)}
        {!all.length ? <RNText style={{ color: N.mid, fontSize: 13, lineHeight: 18, paddingTop: 4, fontFamily: 'PlusJakartaSans_500Medium' }}>Nothing yet. Add what you’d like to see, eat or do here.</RNText> : !shown.length ? <RNText style={{ color: N.mid, fontSize: 13, paddingTop: 4, fontFamily: 'PlusJakartaSans_500Medium' }}>None in this filter.</RNText> : null}
      </View>
      <AddThingSheet visible={adding} onClose={() => setAdding(false)} ctx={ctx} tripId={stop.data.tripId!} stops={stops ?? [stop]} stopId={stop.id} />
    </View>
  );
}

/** Add a thing to do: what, its kind, at which stop. */
export function AddThingSheet({ visible, onClose, ctx, tripId, stops, stopId }: { visible: boolean; onClose: () => void; ctx: LifeOSContext; tripId: string; stops: ObjectRecord<StopData>[]; stopId?: string | null }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<OutingKind>('see');
  const [at, setAt] = useState<string | null>(stopId ?? null);
  const where = at ?? stopId ?? stops[0]?.id ?? null;
  const save = () => {
    if (!title.trim()) return;
    const x = addThing(ctx, tripId, title, { kind, stopId: where ?? undefined });
    toast.show({ message: `${x.title} added`, icon: 'check', undo: () => ctx.records.delete(x.id, 'user') });
    setTitle('');
    onClose();
  };
  return (
    <JPSheet
      visible={visible}
      onClose={onClose}
      eyebrow="ADD A THING TO DO"
      title={title.trim() || 'Something to see, eat or do'}
      footer={
        <>
          <PillButton label="Cancel" onPress={onClose} />
          <PillButton label="Add" icon="check" kind="lime" onPress={save} />
        </>
      }
    >
      <FieldInput label="What" value={title} onChange={setTitle} placeholder="A walk, a dish, a temple" returnKeyType="done" onSubmitEditing={save} autoFocus />
      <View style={{ gap: 6 }}>
        <FieldLabel>Kind</FieldLabel>
        <SegPick options={OUTING_KINDS.filter((k) => k.value !== 'event').map((k) => ({ value: k.value as OutingKind, label: k.label }))} value={kind} onChange={setKind} />
      </View>
      {stops.length > 1 ? (
        <View style={{ gap: 8 }}>
          <FieldLabel>At</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}>
            {stops.map((s) => <Chip key={s.id} label={s.title} height={34} bg={s.id === where ? N.white : N.raised} color={s.id === where ? N.ink : N.white} onPress={() => setAt(s.id)} />)}
          </ScrollView>
        </View>
      ) : null}
    </JPSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Events on the stop's dates                                           */
/* ------------------------------------------------------------------ */

const shortDates = (from?: string, to?: string) => {
  if (!from) return '';
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const d = (x: string) => Number(x.slice(8, 10));
  const m = (x: string) => M[Number(x.slice(5, 7)) - 1];
  if (!to || to === from) return `${d(from)} ${m(from)}`;
  return m(from) === m(to) ? `${d(from)}–${d(to)} ${m(to)}` : `${d(from)} ${m(from)}–${d(to)} ${m(to)}`;
};

/** An event card (JP-Place): its character on the stop's colour, what it is, its dates. */
function EventCard({ title, sub, mark, color, dates, japan, onPress, dashed, action }: { title: string; sub: string; mark: string; color: string; dates: string; japan: boolean; onPress?: () => void; dashed?: boolean; action?: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: dashed ? 'transparent' : N.tile, borderRadius: 24, borderWidth: dashed ? 1.5 : 0, borderStyle: 'dashed', borderColor: 'rgba(215,245,92,0.35)' }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: color, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {japan ? <RNText style={{ color: N.ink, fontSize: 18, fontFamily: JP_SERIF, fontWeight: '800' }}>{mark}</RNText> : <Glyph name="calendar" size={18} color={N.ink} />}
      </View>
      <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
        <RNText numberOfLines={1} style={{ color: N.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{title}</RNText>
        <RNText numberOfLines={1} style={{ color: N.mid, fontSize: 13, lineHeight: 17, fontFamily: 'PlusJakartaSans_500Medium' }}>{sub}</RNText>
      </View>
      {action ?? (dates ? <RNText numberOfLines={1} style={{ flexShrink: 0, color: N.mid, fontSize: 10, letterSpacing: 0.5, fontVariant: ['tabular-nums'], fontFamily: MONO }}>{dates}</RNText> : null)}
    </Pressable>
  );
}

/** A stop's events on its dates, and Claude's suggestions for them, offered to add. */
export function StopEvents({ stop, ctx, color, japan }: { stop: ObjectRecord<StopData>; ctx: LifeOSContext; color?: string; japan?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const d = useLive((os) => {
    const trip = stop.data.tripId ? os.records.get<TripData>(stop.data.tripId) : null;
    if (!trip) return null;
    const span = stopSpan(nightsOf(os, trip), stop.id);
    const events = eventsOf(os, trip).filter((e) => e.data.stopId === stop.id || (!e.data.stopId && span && e.data.day && e.data.day < span.to && (e.data.until ?? e.data.day) >= span.from));
    return { trip, span, events, suggested: span ? onRouteSuggestions(os, stop, span) : [] };
  }, [stop.id]);
  if (!d || (!d.events.length && !d.suggested.length)) return null;
  const c = color ?? '#C99A6E';
  return (
    <View style={{ gap: 8 }}>
      {d.events.map((e) => (
        <EventCard key={e.id} title={e.title} sub={['on your dates', e.data.notes?.split('\n').filter(Boolean).pop()].filter(Boolean).join(' · ')} mark={happeningMark(e)} color={c} japan={!!japan} dates={shortDates(e.data.day, e.data.until)} onPress={() => router.push(`/entity/outing/${e.id}` as never)} />
      ))}
      {d.suggested.map((s) => (
        <EventCard
          key={s.title}
          dashed
          title={s.title}
          sub={['suggested by Claude', s.line].filter(Boolean).join(' · ')}
          mark={happeningMark({ data: { kind: 'event', happening: s.happening, day: s.day } })}
          color={c}
          japan={!!japan}
          dates={shortDates(s.day, s.until)}
          action={
            <Chip
              icon="plus"
              label="Add"
              color={N.lime}
              bg={N.limeSoft}
              onPress={() => {
                const x = addThing(ctx, d.trip.id, s.title, { kind: 'event', stopId: stop.id, day: s.day, until: s.until, happening: s.happening, sure: s.sure, notes: s.line, suggested: true });
                toast.show({ message: `${s.title} added`, icon: 'check', undo: () => ctx.records.delete(x.id, 'user') });
              }}
            />
          }
        />
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The trip page and a day's page (kept as they are)                    */
/* ------------------------------------------------------------------ */

const HAPPEN_ICON: Record<string, IconName> = { festival: 'sparkle', seasonal: 'leaf', closure: 'lock', crowds: 'people', holiday: 'calendar', weather: 'snow' };
const SURE_WORD: Record<string, string> = { official: 'official', past: 'past pattern', predicted: 'predicted' };

function OldStatusPill({ s }: { s: ThingStatus }) {
  const t = useTheme();
  const c = s === 'planned' ? ['rgba(215,245,92,0.16)', '#D7F55C'] : s === 'want' ? ['rgba(246,226,127,0.16)', '#F6E27F'] : [t.c.bg.tileRaised, t.c.fg.secondary];
  return (
    <View style={{ height: 22, paddingHorizontal: 9, borderRadius: 999, backgroundColor: c[0], justifyContent: 'center' }}>
      <Text style={{ fontSize: 11, fontWeight: '600', color: c[1] }}>{STATUS_WORD[s]}</Text>
    </View>
  );
}

function EventRow({ e, onPress }: { e: ObjectRecord<OutingData>; onPress?: () => void }) {
  const t = useTheme();
  return (
    <Row
      minHeight={58}
      lines={2}
      lead={<View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}><Icon name={HAPPEN_ICON[e.data.happening ?? 'seasonal'] ?? 'calendar'} size={16} color={e.data.happening === 'closure' || e.data.happening === 'weather' ? '#F6E27F' : '#D7F55C'} /></View>}
      title={e.title}
      sub={[e.data.day ? datesLabel({ startDate: e.data.day, endDate: e.data.until && e.data.until !== e.data.day ? e.data.until : undefined }) : null, e.data.happening, e.data.sure ? SURE_WORD[e.data.sure] : null].filter(Boolean).join(' · ')}
      onPress={onPress}
    />
  );
}

/** On your route (trip page): the events on the trip's dates, festivals and what to be aware of. */
export function OnRouteCard({ tripId }: { tripId: string }) {
  const router = useRouter();
  const [all, setAll] = useState(false);
  const events = useLive((os) => {
    const trip = os.records.get<TripData>(tripId);
    return trip ? eventsOf(os, trip) : [];
  }, [tripId]);
  if (!events.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="On your route" sub={`what’s on while you’re there · ${events.length}`} action={events.length > 5 ? (all ? 'Less' : 'All') : undefined} onAction={() => setAll((x) => !x)} />
      <RowCard>{(all ? events : events.slice(0, 5)).map((e) => <EventRow key={e.id} e={e} onPress={() => router.push(`/entity/outing/${e.id}` as never)} />)}</RowCard>
    </View>
  );
}

/** Happening today, on a day's page: the events covering it and the things planned for it. */
export function HappeningToday({ trip, day, stopId }: { trip: ObjectRecord<TripData>; day: string; stopId: string | null }) {
  const router = useRouter();
  const h = useLive((os) => happeningOn(os, trip, day, stopId), [trip.id, day, stopId]);
  if (!h.events.length && !h.planned.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Happening today" sub="on your route" />
      <RowCard>
        {h.events.map((e) => <EventRow key={e.id} e={e} onPress={() => router.push(`/entity/outing/${e.id}` as never)} />)}
        {h.planned.map((x) => <Row key={x.id} lines={2} title={x.title} sub={[STATUS_WORD[thingStatus(x)], x.data.notes?.split('\n')[0]].filter(Boolean).join(' · ')} trailing={<OldStatusPill s={thingStatus(x)} />} onPress={() => router.push(`/entity/outing/${x.id}` as never)} />)}
      </RowCard>
    </View>
  );
}

