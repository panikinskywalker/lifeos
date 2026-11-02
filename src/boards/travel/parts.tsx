import React from 'react';
import { Pressable, View } from 'react-native';
import type { LifeOSContext } from '@core/registry/context';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { Icon, ProgressBar, RowItem, StatTrio, Text } from '@ui/kit';
import { daysToStart, tripDays, tripPhase, type Booking, type TripData, type TripSpend } from '@modules/travel';

/**
 * Travel's parts, a first pass from the v3 Noir kit (NR-KitComponents rows
 * and metrics, NR-KitCharts' bar, NR-People-Parts' pills) until the
 * NR-Travel-Parts artboard (docs/design/TRAVEL-BRIEF.md): dates and the
 * countdown, spend vs budget, a booking row, the packing pill.
 */

export const TINT = 'travel' as const;
const INK = '#0B0B0D';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const parts = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return { day: d.getDate(), month: MONTHS[d.getMonth()]!, weekday: WEEKDAYS[d.getDay()]!, year: d.getFullYear() };
};

/** "Fri 18 Dec". */
export const dayLabel = (iso: string) => {
  const p = parts(iso);
  return `${p.weekday} ${p.day} ${p.month}`;
};

/** "18–22 Dec", "28 Dec – 2 Jan", "Fri 18 Dec" for one day; "No dates yet". */
export function datesLabel(d: Pick<TripData, 'startDate' | 'endDate'>): string {
  if (!d.startDate) return 'No dates yet';
  if (!d.endDate || d.endDate === d.startDate) return dayLabel(d.startDate);
  const a = parts(d.startDate);
  const b = parts(d.endDate);
  return a.month === b.month && a.year === b.year ? `${a.day}–${b.day} ${b.month}` : `${a.day} ${a.month} – ${b.day} ${b.month}`;
}

/** "in 2 days", "tomorrow", "day 2 of 4", "back 3 days ago". */
export function whenLabel(d: Pick<TripData, 'startDate' | 'endDate'>, now = Date.now()): string | null {
  const phase = tripPhase(d, now);
  const until = daysToStart(d, now);
  if (phase === 'undated' || until == null) return null;
  if (phase === 'upcoming') return until === 1 ? 'tomorrow' : `in ${until} days`;
  if (phase === 'away') {
    const days = tripDays(d);
    return days ? `day ${1 - until} of ${days}` : 'away now';
  }
  const end = daysToStart({ startDate: d.endDate ?? d.startDate }, now)!;
  return end === -1 ? 'back yesterday' : `back ${-end} days ago`;
}

/** Spend vs budget: three numbers and the bar (coral when over). */
export function SpendBlock({ s, ctx }: { s: TripSpend; ctx: LifeOSContext }) {
  const t = useTheme();
  const money = (n: number) => ctx.format.currency(Math.round(n));
  return (
    <View style={{ gap: 10 }}>
      <StatTrio
        stats={[
          { label: 'Spent', value: money(s.spent), caption: `${s.count} ${s.count === 1 ? 'expense' : 'expenses'}` },
          s.budget != null ? { label: s.over ? 'Over' : 'Left', value: money(Math.abs(s.left!)), caption: `of ${money(s.budget)}`, tone: s.over ? 'alert' : 'ok' } : { label: 'Budget', value: 'None', caption: 'not set' },
          { label: s.leftPerDay != null ? 'Per day left' : 'Per day', value: s.leftPerDay != null ? money(s.leftPerDay) : s.perDay != null ? money(s.perDay) : money(0) },
        ]}
      />
      {s.budget ? <ProgressBar value={Math.min(1, s.spent / s.budget)} color={s.over ? t.c.alert.coral : blocks.lime} accessibilityLabel={`${money(s.spent)} of ${money(s.budget)} spent`} /> : null}
    </View>
  );
}

const time = (at: number) => new Date(at).toTimeString().slice(0, 5);
const dayOf = (at: number) => {
  const d = new Date(at);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** A flight (route, number, PNR) or a stay (nights) as a row. */
export function BookingRow({ b, onPress }: { b: Booking; onPress?: () => void }) {
  if (b.kind === 'flight') {
    return <RowItem icon="plane" tint={TINT} title={b.title.replace(/^Flight /, '')} subtitle={[b.flightNo ?? b.airline, b.pnr ? `PNR ${b.pnr}` : null].filter(Boolean).join(' · ') || null} value={time(b.startAt)} meta={dayOf(b.startAt)} onPress={onPress} />;
  }
  const nights = b.endAt ? Math.max(1, Math.round((b.endAt - b.startAt) / 86_400_000)) : null;
  return <RowItem icon="bed.double" tint={TINT} title={b.title.replace(/^Stay · /, '')} subtitle={b.location} value={nights ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : null} meta={dayOf(b.startAt)} onPress={onPress} />;
}

export type PillState = 'in' | 'suggested' | 'out' | 'away';

/**
 * The packing pill: in the bag (lime, a bag icon), suggested and not yet in
 * (dashed lime), out (raised), away (faded: in the wash, packed for another trip).
 */
export function PackPill({ title, state, note, mark, onPress }: { title: string; state: PillState; note?: string | null; mark?: string | null; onPress?: () => void }) {
  const t = useTheme();
  const lime = t.dark ? blocks.lime : t.c.accent.gold;
  const c =
    state === 'in'
      ? { bg: t.dark ? blocks.lime : t.c.accent.mustard, fg: t.dark ? INK : t.c.accent.mustardInk, border: 'transparent', dashed: false }
      : state === 'suggested'
        ? { bg: 'transparent', fg: lime, border: lime, dashed: true }
        : state === 'away'
          ? { bg: 'transparent', fg: t.c.fg.tertiary, border: t.c.line, dashed: true }
          : { bg: t.c.bg.tileRaised, fg: t.c.fg.primary, border: 'transparent', dashed: false };
  const label = [title, state === 'in' ? 'in the bag' : state === 'suggested' ? 'suggested' : null, note, mark].filter(Boolean).join(', ');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: state === 'in', disabled: state === 'away' }} disabled={state === 'away' || !onPress} onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: c.bg, borderWidth: c.border === 'transparent' ? 0 : 1, borderStyle: c.dashed ? 'dashed' : 'solid', borderColor: c.border, opacity: pressed ? 0.75 : 1 })}>
      {state === 'in' ? <Icon name="bag" size={14} color={c.fg} /> : null}
      <View style={{ flexShrink: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: c.fg }}>{title}{mark ? ` ${mark}` : ''}</Text>
        {note ? <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, color: c.fg, opacity: 0.8 }}>{note}</Text> : null}
      </View>
    </Pressable>
  );
}

export function PillCloud({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

/** A small line under a section ("from your clean clothes · 4 days, beach"). */
export function Hint({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontSize: 13, lineHeight: 18, color: t.c.fg.secondary, paddingHorizontal: 4 }}>{children}</Text>;
}
