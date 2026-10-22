import React from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { Chip, type ChipTone } from './Chip';
import { IconBox, type IconBoxTone } from './IconBox';
import { Surface, useControlFill, useSurface } from './Surface';
import { Text } from './Text';

/** Noir tick: a 26 circle, 1.5px outline at 22%; ticked = lime with a ground check. */
export function Checkbox({ checked, onChange, accessibilityLabel }: { checked: boolean; onChange?: (next: boolean) => void; accessibilityLabel: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={accessibilityLabel} accessibilityState={{ checked }} aria-checked={checked} hitSlop={12} onPress={() => onChange?.(!checked)} style={{ width: 26, height: 26, borderRadius: 13, borderWidth: checked ? 0 : 1.5, borderColor: t.dark ? '#F5F5F738' : t.c.fg.tertiary, backgroundColor: checked ? t.c.ok.sage : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
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
 * Noir row (NR-KitComponents · Row items): its own card (radius 24, padding
 * 12 16 12 12, gap 14), a 40 disc, title 16/600 over a 13/400 "where", the
 * value 16/700 and a pill or line under it, then one action — done button,
 * tick, Done pill or chevron. Stack rows 8 apart.
 */
export function RowItem({ title, subtitle, icon, tint, iconTone, tag, value, valueTone = 'default', strong, meta, metaTone = 'secondary', checked, onToggle, onDone, doneLabel, trailing, chevron, onPress, onLongPress, destructive, style }: RowItemProps) {
  const t = useTheme();
  const tone = (v: ValueTone) => ({ default: t.c.fg.primary, secondary: t.c.fg.secondary, alert: t.c.alert.coralText, ok: t.tints.health.ink })[v];
  const done = checked === true;
  // On the ground a row is a tile; inside a tile it is a nested slab one level lighter (Stitch).
  const fill = useSurface() === 'tile' ? t.c.bg.tileRaised : t.c.bg.tile;
  const control = useControlFill();
  const showChevron = chevron ?? (!!onPress && checked === undefined && !onDone && !trailing);
  const [pressed, setPressed] = React.useState(false);
  const interactive = !!onPress || !!onLongPress;
  // Trailing controls (done, checkbox, switch) sit beside the pressable body, never inside it — no nested buttons.
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 16, minHeight: 64, borderRadius: t.radius.card, backgroundColor: pressed ? t.c.bg.pressed : fill }, style]}>
      <Surface kind="tile">
        <Pressable
          accessibilityRole={onPress ? 'button' : undefined}
          disabled={!interactive}
          onPress={onPress}
          onLongPress={onLongPress}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingLeft: 12, alignSelf: 'stretch' }}
        >
          {icon ? <IconBox icon={icon} tint={tint} tone={iconTone} size={t.layout.iconBox} /> : null}
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
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
                <Text variant="rowTitle" color={tone(valueTone)} numberOfLines={1} style={{ fontVariant: ['tabular-nums'], fontWeight: '700' }}>
                  {value}
                </Text>
              ) : null}
              {meta ? (
                <Text variant="label" color={tone(metaTone)} numberOfLines={1} style={{ fontVariant: ['tabular-nums'], fontSize: 13, lineHeight: 17 }}>
                  {meta}
                </Text>
              ) : null}
            </View>
          ) : null}
          {showChevron ? <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} /> : null}
        </Pressable>
        {trailing}
        {checked !== undefined ? <Checkbox checked={checked} onChange={onToggle} accessibilityLabel={`Done: ${title}`} /> : null}
        {onDone ? (
          doneLabel ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${doneLabel}: ${title}`} hitSlop={6} onPress={onDone} style={({ pressed: p }) => ({ height: 36, paddingLeft: 10, paddingRight: 12, borderRadius: t.radius.chip, backgroundColor: t.dark ? control : t.c.bg.pill, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: p ? 0.75 : 1 })}>
              <Icon name="check" size={16} color={t.c.fg.primary} />
              <Text variant="label">{doneLabel}</Text>
            </Pressable>
          ) : (
            <Pressable accessibilityRole="button" accessibilityLabel={`Done: ${title}`} hitSlop={6} onPress={onDone} style={({ pressed: p }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: t.dark ? control : t.c.bg.pill, alignItems: 'center', justifyContent: 'center', opacity: p ? 0.75 : 1 })}>
              <Icon name="check" size={18} color={t.c.fg.primary} />
            </Pressable>
          )
        ) : null}
      </Surface>
    </View>
  );
}

/** A column of RowItems, 8 apart. */
export function RowList({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap: 8 }, style]}>{children}</View>;
}
