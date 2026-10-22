import React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import { Button } from './Button';
import { Chip } from './Chip';
import { Surface } from './Surface';
import { Text } from './Text';

export interface TrioStat {
  label: string;
  value: string;
  unit?: string;
  /** Small line under the value ("+840 this month", "Exp 12 Sep"). */
  caption?: string;
  tone?: 'alert' | 'ok';
  onPress?: () => void;
}

/**
 * Stitch stat trio: up to three metrics side by side in one tile, each an
 * UPPERCASE micro label, a tabular value with its unit, and a caption.
 */
export function StatTrio({ stats }: { stats: TrioStat[] }) {
  const t = useTheme();
  const tone = (s: TrioStat) => (s.tone === 'alert' ? t.c.alert.coralText : s.tone === 'ok' ? t.c.ok.sageText : t.c.fg.primary);
  return (
    // Noir metrics row: three quiet numbers in one card — 11/600 caps label (tertiary), 22/700 value.
    <View style={{ flexDirection: 'row', backgroundColor: t.c.bg.tile, borderRadius: t.dark ? t.radius.card : t.radius.tile, padding: t.dark ? 16 : 4, gap: t.dark ? 12 : 4 }}>
      {stats.slice(0, 3).map((s) => {
        const body = (
          <View style={{ padding: t.dark ? 0 : 12, gap: 4, backgroundColor: t.dark ? 'transparent' : t.c.bg.tileRaised, borderRadius: t.radius.card, flex: 1 }}>
            <Text variant="labelCaps" color="tertiary" numberOfLines={1} style={{ textTransform: 'uppercase' }}>
              {s.label}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
              <Text variant="stat" color={tone(s)} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize: s.value.length + (s.unit?.length ?? 0) > 8 ? 17 : 22, lineHeight: 26, letterSpacing: -0.5, flexShrink: 1 }}>
                {s.value}
              </Text>
              {s.unit ? (
                <Text variant="label" color="secondary">
                  {s.unit}
                </Text>
              ) : null}
            </View>
            {s.caption ? (
              <Text variant="caption" color={s.tone === 'alert' ? t.c.alert.coralText : 'secondary'} numberOfLines={1} style={{ fontSize: 12 }}>
                {s.caption}
              </Text>
            ) : null}
          </View>
        );
        return s.onPress ? (
          <Pressable key={s.label} accessibilityRole="button" accessibilityLabel={`${s.label}: ${s.value}${s.unit ? ` ${s.unit}` : ''}`} onPress={s.onPress} style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.8 : 1 })}>
            {body}
          </Pressable>
        ) : (
          <View key={s.label} style={{ flex: 1 }} accessible accessibilityLabel={`${s.label}: ${s.value}${s.unit ? ` ${s.unit}` : ''}`}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

/**
 * Stitch "Attention required": coral eyebrow with an URGENT pill, the thing
 * and when, an estimate on the right, then a primary and a secondary action.
 */
export function AttentionCard({ eyebrow = 'Attention required', urgent, title, meta, estimate, estimateLabel = 'Estimated', primary, secondary }: { eyebrow?: string; urgent?: boolean; title: string; meta?: string; estimate?: string; estimateLabel?: string; primary?: { label: string; icon?: IconName; onPress: () => void }; secondary?: { label: string; icon?: IconName; onPress: () => void } }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.tile, padding: 16, gap: 12 }}>
      <Surface kind="tile">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="alert" size={16} color={t.c.alert.coralText} />
          <Text variant="labelCaps" color={t.c.alert.coralText} style={{ flex: 1, textTransform: 'uppercase' }} numberOfLines={1}>
            {eyebrow}
          </Text>
          {urgent ? <Chip label="Urgent" tone="alert" caps small /> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: t.c.bg.tileRaised, borderRadius: t.radius.card, padding: 12 }}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text variant="rowTitle">{title}</Text>
            {meta ? (
              <Text variant="caption" color={t.c.alert.coralText}>
                {meta}
              </Text>
            ) : null}
          </View>
          {estimate ? (
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>
                {estimateLabel}
              </Text>
              <Text variant="rowTitle" style={{ fontVariant: ['tabular-nums'] }}>
                {estimate}
              </Text>
            </View>
          ) : null}
        </View>
        {primary || secondary ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {primary ? <Button title={primary.label} icon={primary.icon} size="sm" onPress={primary.onPress} style={{ flex: 1 }} /> : null}
            {secondary ? <Button title={secondary.label} icon={secondary.icon} size="sm" variant="secondary" onPress={secondary.onPress} style={{ flex: 1 }} /> : null}
          </View>
        ) : null}
      </Surface>
    </View>
  );
}

/** Stitch quick actions: a horizontal row of "+ Log fuel", "+ Record service"… pills, bleeding to the screen edge. */
export function QuickActions({ actions, gutter = 20 }: { actions: Array<{ label: string; icon?: IconName; onPress: () => void }>; gutter?: number }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text variant="labelCaps" color="secondary" style={{ textTransform: 'uppercase', paddingHorizontal: 4 }}>
        Quick actions
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -gutter }} contentContainerStyle={{ paddingHorizontal: gutter, gap: 8 }}>
        {actions.map((a) => (
          <Pressable key={a.label} accessibilityRole="button" accessibilityLabel={a.label} onPress={a.onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 14, borderRadius: t.radius.chip, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.75 : 1 })}>
            <Icon name={a.icon ?? 'plus'} size={16} color={t.c.fg.primary} />
            <Text variant="label">{a.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

export interface TimelineLane {
  label: string;
  color: string;
  /** Segments as [start, end] fractions of the span (0–1). */
  segments: Array<[number, number]>;
}

/**
 * Stitch day timeline (the "stage timeline"): lanes of rounded segments over
 * a time span, dotted guides, tick labels underneath. Used for a day or a
 * week at a glance (sleep stages, when chores got done).
 */
export function DayTimeline({ lanes, ticks, accessibilityLabel }: { lanes: TimelineLane[]; ticks: string[]; accessibilityLabel?: string }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.c.bg.tileRaised, borderRadius: t.radius.card, padding: 12, gap: 8 }} accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      <View style={{ gap: 8 }}>
        {ticks.length > 1 ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, flexDirection: 'row', justifyContent: 'space-between' }}>
            {ticks.map((_, i) => (
              <View key={i} style={{ width: 1, borderLeftWidth: 1, borderStyle: 'dashed', borderColor: t.c.rail }} />
            ))}
          </View>
        ) : null}
        {lanes.map((l) => (
          <View key={l.label} style={{ height: 14, flexDirection: 'row' }} accessibilityLabel={l.label}>
            {l.segments.map(([a, b], i) => (
              <View key={i} style={{ position: 'absolute', left: `${Math.max(0, a) * 100}%`, width: `${Math.max(0.01, Math.min(1, b) - Math.max(0, a)) * 100}%`, top: 0, bottom: 0, borderRadius: 4, backgroundColor: l.color, minWidth: 4 }} />
            ))}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {ticks.map((tk, i) => (
          <Text key={i} variant="labelMicro" color="secondary">
            {tk}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 4 }}>
        {lanes.map((l) => (
          <View key={l.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: l.color }} />
            <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>
              {l.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
