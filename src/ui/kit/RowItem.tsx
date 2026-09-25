import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { Chip, type ChipTone } from './Chip';
import { IconBox, type IconBoxTone } from './IconBox';
import { Surface } from './Surface';
import { Text } from './Text';

/** Canvas checkbox: 24, radius 7, 2px tertiary border; ticked = sage with an ink check. */
export function Checkbox({ checked, onChange, accessibilityLabel }: { checked: boolean; onChange?: (next: boolean) => void; accessibilityLabel: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked }} aria-checked={checked} hitSlop={12} onPress={() => onChange?.(!checked)} style={{ width: 24, height: 24, borderRadius: t.radius.checkbox, borderWidth: 2, borderColor: checked ? t.c.ok.sage : t.c.fg.tertiary, backgroundColor: checked ? t.c.ok.sage : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {checked ? <Icon name="check" size={16} strokeWidth={3} color={t.c.ok.sageInk} /> : null}
    </Pressable>
  );
}

export type ValueTone = 'default' | 'secondary' | 'alert' | 'ok';

export interface RowItemProps {
  title: string;
  subtitle?: string | null;
  icon?: IconName | (string & {});
  tint?: TintKey;
  iconTone?: IconBoxTone;
  /** Small tag chip before the subtitle (a transaction's category). */
  tag?: { label: string; tint?: TintKey; tone?: ChipTone };
  /** Trailing value (amount, date) and a second line under it (in 3 d, 4 d late). */
  value?: string | null;
  valueTone?: ValueTone;
  /** Money reads 15/800; other values 14/700. */
  strong?: boolean;
  meta?: string | null;
  metaTone?: ValueTone;
  /** Trailing checkbox (a checklist). */
  checked?: boolean;
  onToggle?: (next: boolean) => void;
  /** Trailing round check button: the "done" action for a cycle. */
  onDone?: () => void;
  /** Label the done action as a pill ("Done"), used when an item is due or late. */
  doneLabel?: string;
  /** Anything else trailing (a switch). */
  trailing?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  destructive?: boolean;
  /** @deprecated rows are separate cards now; ignored. */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Canvas row: its own card (tile colour, radius 16, padding 12), 36 icon-box,
 * title 15/700 and a 13/600 caption, trailing value column, then one action —
 * done button, checkbox, Done pill or chevron. Stack rows 8 apart.
 */
export function RowItem({ title, subtitle, icon, tint, iconTone, tag, value, valueTone = 'default', strong, meta, metaTone = 'secondary', checked, onToggle, onDone, doneLabel, trailing, chevron, onPress, onLongPress, destructive, style }: RowItemProps) {
  const t = useTheme();
  const tone = (v: ValueTone) => ({ default: t.c.fg.primary, secondary: t.c.fg.secondary, alert: t.c.alert.coralText, ok: t.tints.health.ink })[v];
  const done = checked === true;
  const showChevron = chevron ?? (!!onPress && checked === undefined && !onDone && !trailing);
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress && !onLongPress}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 60, borderRadius: t.radius.card, backgroundColor: pressed ? t.c.bg.pressed : t.c.bg.tile }, style]}
    >
      <Surface kind="tile">
        {icon ? <IconBox icon={icon} tint={tint} tone={iconTone} size={36} /> : null}
        <View style={{ flex: 1, minWidth: 0, gap: tag ? 4 : 3 }}>
          <Text variant="rowTitle" numberOfLines={1} color={destructive ? t.c.alert.coralText : done ? 'secondary' : undefined} style={done ? { textDecorationLine: 'line-through' } : undefined}>
            {title}
          </Text>
          {tag ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Chip label={tag.label} tint={tag.tint} tone={tag.tone} small />
              {subtitle ? (
                <Text variant="caption" color="secondary" numberOfLines={1} style={{ flexShrink: 1, fontSize: 12 }}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          ) : subtitle ? (
            <Text variant="caption" color="secondary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {value || meta ? (
          <View style={{ alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
            {value ? (
              <Text variant="rowTitle" color={tone(valueTone)} numberOfLines={1} style={{ fontVariant: ['tabular-nums'], fontSize: strong ? 15 : 14, fontWeight: strong ? '700' : '600' }}>
                {value}
              </Text>
            ) : null}
            {meta ? (
              <Text variant="label" color={tone(metaTone)} numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
                {meta}
              </Text>
            ) : null}
          </View>
        ) : null}
        {trailing}
        {checked !== undefined ? <Checkbox checked={checked} onChange={onToggle} accessibilityLabel={`Done: ${title}`} /> : null}
        {onDone ? (
          doneLabel ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${doneLabel}: ${title}`} hitSlop={6} onPress={onDone} style={({ pressed }) => ({ height: 36, paddingLeft: 10, paddingRight: 12, borderRadius: t.radius.chip, backgroundColor: t.c.bg.pill, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.75 : 1 })}>
              <Icon name="check" size={16} color={t.c.fg.primary} />
              <Text variant="label">{doneLabel}</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel={`Done: ${title}`} hitSlop={6} onPress={onDone} style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
              <Icon name="check" size={18} color={t.c.fg.primary} />
            </Pressable>
          )
        ) : null}
        {showChevron ? <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} /> : null}
      </Surface>
    </Pressable>
  );
}

/** A column of RowItems, 8 apart. */
export function RowList({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap: 8 }, style]}>{children}</View>;
}
