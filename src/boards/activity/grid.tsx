import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import type { TrackerSummary } from '@core/activity/trackers';
import { useTheme } from '@ui/theme/ThemeProvider';
import { monoFonts } from '@ui/theme/tokens';
import { Icon, Text } from '@ui/kit';

const MONO = monoFonts[700];

/**
 * A tracker's colour (the A1 to A4 artboards on *Links · Noir*): the tint a
 * tracker stores, drawn in the Noir module colours (Events lilac, Body lime,
 * Money orange, People pink, Notes violet, Trips coral, Things sky, Places
 * yellow). Stored tints stay as they are.
 */
const TRACKER_COLOR: Record<string, string> = {
  tasks: '#C9A7F5',
  health: '#D7F55C',
  finance: '#F26B2B',
  people: '#F4A8CE',
  memory: '#B48CF2',
  travel: '#FF8A6A',
  upkeep: '#A9C4FF',
  documents: '#F6E27F',
};
export const TRACKER_TINTS = Object.keys(TRACKER_COLOR);
export const trackerColor = (tint: string) => TRACKER_COLOR[tint] ?? TRACKER_COLOR.tasks!;
/** The colour at 16%: a day that didn't count, a tick not yet done. */
export const faint = (hex: string) => `${hex}29`;

/** The tracker's icon in a disc with a ring of its colour. */
export function TrackerDisc({ icon, color, size = 32 }: { icon: string; color: string; size?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: color, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon as never} size={size <= 30 ? 14 : 16} color={color} />
    </View>
  );
}

/** Today's tick: filled when today counted, faint when not yet. */
export function TodayTick({ done, color }: { done: boolean; color: string }) {
  const t = useTheme();
  return (
    <View accessibilityLabel={done ? 'Done today' : 'Not yet today'} style={{ width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? color : faint(color) }}>
      <Icon name="check" size={16} color={done ? t.c.bg.ground : color} />
    </View>
  );
}

const GAP = 4;
const MIN_CELL = 14;

/**
 * Days as a GitHub-style grid that fills its width: as many whole weeks as
 * fit (newest on the right), a column per week, Monday on top. A day that
 * counted is the tracker's colour, others a faint shade, days to come barely
 * there. `months` puts the month names over it; `onDay` makes a day tappable
 * (the tracker page), `selected` rings that day.
 */
export function ActivityGrid({ days, color, accessibilityLabel, cell: fixed, gap = GAP, months, onDay, selected }: { days: TrackerSummary['days']; color: string; accessibilityLabel?: string; cell?: number; gap?: number; months?: boolean; onDay?: (day: string) => void; selected?: string | null }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const weeksAvail = Math.floor(days.length / 7);
  const min = fixed ?? MIN_CELL;
  const cols = w ? Math.max(1, Math.min(weeksAvail, Math.floor((w + gap) / (min + gap)))) : 0;
  const cell = cols ? (fixed ?? (w - (cols - 1) * gap) / cols) : 0;
  const shown = cols ? days.slice(days.length - cols * 7) : [];
  const h = cell * 7 + gap * 6;
  const labels: Array<{ col: number; name: string }> = [];
  if (months)
    for (let c = 0; c < cols; c++) {
      const d = shown[c * 7]?.day;
      const prev = c ? shown[(c - 1) * 7]?.day : null;
      if (d && (!prev || d.slice(5, 7) !== prev.slice(5, 7))) labels.push({ col: c, name: new Date(`${d}T12:00:00`).toLocaleDateString('en-IN', { month: 'short' }) });
    }
  const tap = (x: number, y: number) => {
    if (!onDay || !cell) return;
    const col = Math.floor(x / (cell + gap));
    const row = Math.floor(y / (cell + gap));
    const d = shown[col * 7 + row];
    if (d && d.value != null) onDay(d.day);
  };
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ gap: 6 }}>
      {months && w > 0 ? (
        <View style={{ height: 12 }}>
          {labels.map((l) => (
            <Text key={`${l.col}${l.name}`} style={{ position: 'absolute', left: l.col * (cell + gap), fontFamily: MONO, fontSize: 9, lineHeight: 12, letterSpacing: 0.5, color: t.c.fg.tertiary, textTransform: 'uppercase' }}>
              {l.name}
            </Text>
          ))}
        </View>
      ) : null}
      <Pressable disabled={!onDay} onPress={(e) => tap(e.nativeEvent.locationX, e.nativeEvent.locationY)} style={{ height: w ? h : 7 * (min + gap) }} accessibilityRole={onDay ? 'adjustable' : 'image'} accessibilityLabel={accessibilityLabel} accessibilityHint={onDay ? 'Tap a day for what made it count' : undefined}>
        {w > 0 ? (
          <Svg width={cols * (cell + gap)} height={h}>
            {shown.map((d, i) => {
              const col = Math.floor(i / 7);
              const row = i % 7;
              const sel = selected === d.day;
              return (
                <Rect
                  key={d.day}
                  x={col * (cell + gap)}
                  y={row * (cell + gap)}
                  width={cell}
                  height={cell}
                  rx={cell * 0.28}
                  fill={d.value == null ? (t.dark ? '#FFFFFF' : '#000000') : color}
                  opacity={d.value == null ? 0.04 : d.value ? 1 : 0.16}
                  stroke={sel ? t.c.fg.primary : undefined}
                  strokeWidth={sel ? 2 : 0}
                />
              );
            })}
          </Svg>
        ) : null}
      </Pressable>
    </View>
  );
}

const doneToday = (s: TrackerSummary) => s.days.filter((d) => d.value != null).at(-1)?.value === 1;

/** "3 this week · 11 this month · 4-day streak". */
export const summaryLine = (s: TrackerSummary) => `${s.thisWeek} this week · ${s.thisMonth} this month${s.streak > 1 ? ` · ${s.streak}-day streak` : ''}`;

/** One tracker as on the Activity home (A1): disc, name, today's tick, the grid, this week · month · streak. `card` draws its tile. */
export function ActivityRow({ s, onPress, card = false }: { s: TrackerSummary; onPress?: () => void; card?: boolean }) {
  const t = useTheme();
  const color = trackerColor(s.tracker.tint);
  const today = doneToday(s);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${s.tracker.name}: ${today ? 'done today, ' : ''}${s.thisWeek} days this week, ${s.streak} day streak`}
      onPress={onPress}
      style={({ pressed }) => ({ gap: 12, opacity: pressed ? 0.85 : 1, ...(card ? { padding: 16, borderRadius: 28, backgroundColor: t.c.bg.tile } : {}) })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TrackerDisc icon={s.tracker.icon} color={color} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>
          {s.tracker.name}
        </Text>
        <TodayTick done={today} color={color} />
      </View>
      <ActivityGrid days={s.days} color={color} accessibilityLabel={`${s.tracker.name}, last weeks`} />
      <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{summaryLine(s)}</Text>
    </Pressable>
  );
}

/** The stacked Today tile's row (A4, all of them): small disc, name, this week, a small grid. */
export function ActivityMiniRow({ s, onPress }: { s: TrackerSummary; onPress?: () => void }) {
  const t = useTheme();
  const color = trackerColor(s.tracker.tint);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${s.tracker.name}: ${s.thisWeek} this week`} onPress={onPress} style={({ pressed }) => ({ gap: 8, opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <TrackerDisc icon={s.tracker.icon} color={color} size={28} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.fg.primary }}>
          {s.tracker.name}
        </Text>
        <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>{s.thisWeek} this week</Text>
      </View>
      <ActivityGrid days={s.days} color={color} cell={9} gap={3} accessibilityLabel={`${s.tracker.name}, last weeks`} />
    </Pressable>
  );
}

export { doneToday };
