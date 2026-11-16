import React from 'react';
import { Linking, Text, View } from 'react-native';
import type { ObjectRecord } from '@core/domain/types';
import { stopMark, type StopData } from '@modules/travel';
import { JP_SERIF } from './kit';

/**
 * The plan's small shared pieces (a leaf: it imports no screen): the line's
 * colours, a stop's disc, opening a link. Plan re-exports them for the
 * screens that import them from there.
 */

/** The line's colours on Noir (JP-Parts). */
export const STOP_HEX: Record<string, string> = { green: '#5FD08A', teal: '#4CC9D4', indigo: '#8C9DFF', persimmon: '#FF9A4D', wood: '#C99A6E', plum: '#E08BC8', crimson: '#FF6B7A', gold: '#F2C94C', sky: '#6CC6FF', slate: '#9FB0C8' };
export const stopHex = (s: Pick<ObjectRecord<StopData>, 'data'>) => STOP_HEX[s.data.color ?? 'slate'] ?? STOP_HEX.slate!;

/** Open a link outside the app; nothing when there is none. */
export const openLink = (url?: string | null) => (url ? Linking.openURL(url).catch(() => undefined) : undefined);

/** A stop's disc: its mark on its colour (dashed for an idea). */
export function StopDisc({ stop, look, size = 40 }: { stop: Pick<ObjectRecord<StopData>, 'title' | 'data'>; look?: string; size?: number }) {
  const c = stopHex(stop);
  const idea = stop.data.kind === 'idea';
  const serif = look === 'japan' && !!stop.data.localName;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: idea ? 'transparent' : c, borderWidth: idea ? 1.5 : 0, borderStyle: 'dashed', borderColor: idea ? 'rgba(245,245,247,0.3)' : c, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Text style={{ fontSize: size * (serif ? 0.45 : 0.4), color: idea ? 'rgba(245,245,247,0.62)' : '#0B0B0D', fontFamily: serif ? JP_SERIF : 'PlusJakartaSans_800ExtraBold', fontWeight: serif ? '800' : undefined }}>{stopMark(stop, look)}</Text>
    </View>
  );
}
