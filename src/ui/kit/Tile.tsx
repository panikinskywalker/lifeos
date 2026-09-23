import React, { createContext, useContext, useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IconName } from '../icons';
import { useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { IconBox } from './IconBox';
import { packBento, TILE_SPAN, type TileSize } from './layout';
import { Text } from './Text';

export type { TileSize } from './layout';

/** Size a tile gets from the BentoGrid it sits in; null when used standalone. */
const CellContext = createContext<{ width: number; height: number } | null>(null);

/**
 * Two-column bento grid with square cells and a 12 px gap. Children are
 * Tiles; each child's `size` prop decides its span. Tiles pack densely.
 */
export function BentoGrid({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const items = React.Children.toArray(children).filter(React.isValidElement) as Array<React.ReactElement<{ size?: TileSize }>>;
  const { placements, height } = packBento(items.map((c) => c.props.size ?? '1x1'), width, t.layout.gridGap);
  return (
    <View style={[{ height: width ? height : undefined }, style]} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      {width
        ? items.map((child, i) => {
            const p = placements[i]!;
            return (
              <View key={child.key ?? i} style={{ position: 'absolute', left: p.x, top: p.y, width: p.width, height: p.height }}>
                <CellContext.Provider value={{ width: p.width, height: p.height }}>{child}</CellContext.Provider>
              </View>
            );
          })
        : null}
    </View>
  );
}

export interface TileProps {
  size?: TileSize;
  /** Module tint for the icon-box; with `filled` the whole tile takes the tint. */
  tint?: TintKey;
  filled?: boolean;
  icon?: IconName | (string & {});
  label?: string;
  /** Right side of the header row: a count, a date, "3 due". */
  meta?: string;
  /** Tile body — a stat, a short list, a chart. */
  children?: React.ReactNode;
  /** Pinned to the bottom (e.g. a StackedBar). */
  footer?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Bento cell. Header row = icon-box + label + meta; body; optional footer.
 * Inside a BentoGrid it fills its cell; standalone it sizes to content
 * (1×1 keeps a square aspect ratio).
 */
export function Tile({ size = '1x1', tint, filled, icon, label, meta, children, footer, onPress, accessibilityLabel, style }: TileProps) {
  const t = useTheme();
  const cell = useContext(CellContext);
  const tone = tint ? t.tints[tint] : null;
  const bg = filled && tone ? tone.fill : t.c.bg.tile;
  const ink = filled && tone ? tone.ink : t.c.fg.secondary;
  const sizing: ViewStyle = cell ? { flex: 1 } : TILE_SPAN[size].cols === 1 && TILE_SPAN[size].rows === 1 ? { aspectRatio: 1 } : TILE_SPAN[size].rows === 2 ? { minHeight: 320 } : { minHeight: 150 };
  const body = (
    <>
      {icon || label || meta ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {icon ? <IconBox icon={icon} tint={tint} inverse={!!(filled && tone)} /> : null}
          {label ? (
            <Text variant="label" color={ink} numberOfLines={1} style={{ flex: 1 }}>
              {label}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {meta ? (
            <Text variant="caption" color={ink} numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
              {meta}
            </Text>
          ) : null}
        </View>
      ) : null}
      <View style={{ flex: 1, justifyContent: 'flex-end', minHeight: 0 }}>{children}</View>
      {footer ? <View>{footer}</View> : null}
    </>
  );
  const base: StyleProp<ViewStyle> = [{ backgroundColor: bg, borderRadius: t.radius.tile, padding: 16, gap: 12, overflow: 'hidden' }, sizing, style];
  if (!onPress) return <View style={base}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} style={({ pressed }) => [base, pressed && { transform: [{ scale: 0.98 }], opacity: 0.92 }]}>
      {body}
    </Pressable>
  );
}

/** Big tabular number with a unit and a caption. Used inside tiles and headers. */
export function Stat({ value, unit, caption, tone, color, large }: { value: string; unit?: string; caption?: string; tone?: 'alert' | 'ok'; color?: string; large?: boolean }) {
  const t = useTheme();
  const c = color ?? (tone === 'alert' ? t.c.alert.coral : t.c.fg.primary);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
        <Text variant={large ? 'display' : 'stat'} color={c} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {value}
        </Text>
        {unit ? (
          <Text variant="label" color="secondary">
            {unit}
          </Text>
        ) : null}
      </View>
      {caption ? (
        <Text variant="caption" color={tone === 'ok' ? t.c.ok.sage : 'secondary'} numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** A Tile whose body is a single Stat. */
export function StatTile({ value, unit, caption, tone, ...tile }: Omit<TileProps, 'children'> & { value: string; unit?: string; caption?: string; tone?: 'alert' | 'ok' }) {
  const t = useTheme();
  const color = tile.filled && tile.tint && tone !== 'alert' ? t.tints[tile.tint].ink : undefined;
  return (
    <Tile {...tile}>
      <Stat value={value} unit={unit} caption={caption} tone={tone} color={color} large={tile.size === '2x2'} />
    </Tile>
  );
}
