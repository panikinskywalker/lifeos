import React from 'react';
import { Pressable, View } from 'react-native';
import { format } from 'date-fns';
import type { DayItem } from '@core/dashboard/day';
import { Icon, Text } from '@ui/kit';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';

/** Today's parts (NR-Today): what the kit has no piece for. */

/** "noon", "8:10 am", "7 pm". */
export function clock(at: number): string {
  const d = new Date(at);
  if (d.getHours() === 12 && d.getMinutes() === 0) return 'noon';
  return format(at, d.getMinutes() ? 'h:mm a' : 'h a').toLowerCase();
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const word = (n: number) => WORDS[n] ?? String(n);

/** The day in a sentence, as [words, bright]: "You have 3 things today. One by noon, two whenever." */
export function daySentence(items: DayItem[]): Array<[string, boolean]> {
  if (!items.length) return [['Nothing ', true], ['on today.', false]];
  const left = items.filter((i) => !i.done);
  if (!left.length) return [['All done ', true], ['for today.', false]];
  const late = left.filter((i) => i.late).length;
  const timed = left.filter((i) => !i.late && !i.allDay);
  const free = left.length - late - timed.length;
  const bits: Array<[string, boolean]> = [];
  if (late) bits.push([`${word(late)} late`, true]);
  if (timed.length) bits.push([`${word(timed.length)} by ${clock(timed[timed.length - 1]!.at)}`, true]);
  if (free) bits.push([`${word(free)} whenever`, false]);
  const out: Array<[string, boolean]> = [['You have ', false], [`${left.length} thing${left.length === 1 ? '' : 's'} `, true], ['today. ', false]];
  bits.forEach(([words, bright], k) => {
    if (k) out.push([', ', false]);
    out.push([k ? words : words[0]!.toUpperCase() + words.slice(1), bright]);
  });
  out.push(['.', false]);
  return out;
}

const TICKS = 24;

/** The day as a row of ticks: 6 am to 6 pm (the whole day if something falls outside), the next thing tallest. */
export function DayStrip({ items, now }: { items: DayItem[]; now: number }) {
  const t = useTheme();
  const hourOf = (at: number) => (at - new Date(at).setHours(0, 0, 0, 0)) / 3_600_000;
  const timed = items.filter((i) => !i.allDay);
  const wide = timed.some((i) => hourOf(i.at) < 6 || hourOf(i.at) >= 18);
  const [from, to] = wide ? [0, 24] : [6, 18];
  const tickOf = (at: number) => Math.max(0, Math.min(TICKS - 1, Math.floor(((hourOf(at) - from) / (to - from)) * TICKS)));
  const next = timed.find((i) => !i.done && i.at >= now);
  const marks = new Map(timed.map((i) => [tickOf(i.at), i]));
  const labels = wide ? ['12 am', '6', '12 pm', '6', '12 am'] : ['6 am', '9', '12 pm', '3', '6 pm'];
  return (
    <View accessibilityRole="image" accessibilityLabel={`The day: ${timed.length} timed thing${timed.length === 1 ? '' : 's'}`} style={{ gap: 8 }}>
      <View style={{ height: 40, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 5 }}>
        {Array.from({ length: TICKS }, (_, k) => {
          const mark = marks.get(k);
          const tall = !!next && tickOf(next.at) === k;
          return <View key={k} style={{ width: 2.5, borderRadius: 1.25, height: tall ? 40 : mark ? 23 : 6, backgroundColor: mark ? t.c.accent.mustard : t.c.fg.primary, opacity: mark ? (mark.done ? 0.4 : 1) : 0.22 }} />;
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {labels.map((l, k) => (
          <Text key={k} variant="labelMicro" color="tertiary" style={{ fontSize: 10, lineHeight: 13 }}>
            {l}
          </Text>
        ))}
      </View>
    </View>
  );
}

const FACES = [blocks.pink, blocks.mint, blocks.lilac, blocks.sky, blocks.yellow];

/** A person's initial on their colour, fixed per record id. */
export function Face({ id, name, size = 32 }: { id: string; name: string; size?: number }) {
  const t = useTheme();
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: FACES[h % FACES.length], alignItems: 'center', justifyContent: 'center' }}>
      <Text variant="labelMicro" color={t.c.bg.ground} style={{ fontWeight: '700' }}>
        {name.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

/** Section header with its line under the title (NR-Today · Upkeep), a grey "See all ›" on the right. */
export function SectionHead({ title, line, action, onAction }: { title: string; line?: string; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="heading" accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
        {line ? (
          <Text variant="caption" color="secondary" numberOfLines={1}>
            {line}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={12} onPress={onAction} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text variant="label" color="secondary" style={{ fontSize: 13, lineHeight: 17 }}>
            {action}
          </Text>
          <Icon name="chevron-right" size={16} color={t.c.fg.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** The metrics row (NR-Today): 11/600 caps labels over 22/700 numbers, three across, wrapping, in one card. */
export function MetricsGrid({ stats }: { stats: Array<{ label: string; value: string; unit?: string }> }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, backgroundColor: t.c.bg.tile, borderRadius: t.radius.card, padding: 16 }}>
      {stats.map((s) => (
        <View key={s.label} accessible accessibilityLabel={`${s.label}: ${s.value}${s.unit ? ` ${s.unit}` : ''}`} style={{ width: '33.33%', paddingRight: 8, gap: 4 }}>
          <Text variant="labelCaps" color="tertiary" numberOfLines={1} style={{ textTransform: 'uppercase' }}>
            {s.label}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text variant="stat" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: 22, lineHeight: 26, letterSpacing: -0.5, flexShrink: 1 }}>
              {s.value}
            </Text>
            {s.unit ? (
              <Text variant="caption" color="tertiary" numberOfLines={1}>
                {s.unit}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
