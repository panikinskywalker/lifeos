import React, { createContext, useContext, useState } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { IconName } from '../icons';
import { OnBlock, useTheme } from '../theme/ThemeProvider';
import type { TintKey } from '../theme/tokens';
import { IconBox, type IconBoxTone } from './IconBox';
import { Surface } from './Surface';
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
  /** Module tint for the header icon-box; with `filled` the whole tile takes the tint. */
  tint?: TintKey;
  /** Header icon-box tone instead of a tint (alert for Overdue, accent for reminders). */
  iconTone?: IconBoxTone;
  filled?: boolean;
  icon?: IconName | (string & {});
  label?: string;
  /** Noir colour-block header: the label as an 11/600 caps line, no disc ("SPENT · SEP"). */
  caps?: boolean;
  /** Right side of the header: a count, a date, or a node (a small chip). */
  meta?: React.ReactNode;
  /** Tile body — a stat, a short list, a chart. */
  children?: React.ReactNode;
  /** Stats sit at the bottom (default); lists read better from the top. */
  bodyAlign?: 'top' | 'bottom';
  /** Pinned to the bottom (e.g. a StackedBar). */
  footer?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Noir tile (NR-KitComponents · Tiles): a dark widget (#1A1A1E, radius 28,
 * padding 16), or with `filled` a colour block in the module's colour with
 * everything on it ground-black. Header = 28 disc + tile title (15/600) +
 * meta; body; optional footer. Inside a BentoGrid it fills its cell;
 * standalone it sizes to content (1×1 keeps a square).
 */
export function Tile({ size = '1x1', tint, iconTone, filled, icon, label, caps, meta, children, bodyAlign = 'bottom', footer, onPress, accessibilityLabel, style }: TileProps) {
  const t = useTheme();
  const cell = useContext(CellContext);
  const tone = tint ? t.tints[tint] : null;
  // Noir: a filled tile is a colour block (the module's colour); light keeps the soft tint.
  const block = filled && tone ? (t.dark ? tone.ink : tone.fill) : null;
  const bg = block ?? t.c.bg.tile;
  const sizing: ViewStyle = cell ? { flex: 1 } : TILE_SPAN[size].cols === 1 && TILE_SPAN[size].rows === 1 ? { aspectRatio: 1 } : {};
  const inner = (
    <Surface kind="tile">
      {icon || label || meta ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {icon && !caps ? <IconBox icon={icon} tint={tint} tone={filled && tone ? 'overlay' : iconTone} size={28} /> : null}
          {label ? (
            <Text variant={caps ? 'labelCaps' : 'tileTitle'} numberOfLines={1} style={[{ flex: 1 }, caps ? { textTransform: 'uppercase' } : null]}>
              {label}
            </Text>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {typeof meta === 'string' ? (
            <Text variant="caption" color="secondary" numberOfLines={1} style={{ fontVariant: ['tabular-nums'] }}>
              {meta}
            </Text>
          ) : (
            meta ?? null
          )}
        </View>
      ) : null}
      <View style={{ flex: cell ? 1 : undefined, justifyContent: bodyAlign === 'top' ? 'flex-start' : 'flex-end', minHeight: 0, gap: 4 }}>{children}</View>
      {footer ? <View>{footer}</View> : null}
    </Surface>
  );
  const body = block && t.dark ? <OnBlock>{inner}</OnBlock> : inner;
  const base: StyleProp<ViewStyle> = [{ backgroundColor: bg, borderRadius: t.radius.tile, padding: 16, gap: 12, overflow: 'hidden', justifyContent: 'space-between' }, sizing, style];
  if (!onPress) return <View style={base}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.85 }]}>
      {body}
    </Pressable>
  );
}

/**
 * Big tabular number and a caption (Noir: 700, −1.5 tracking). Sizes: 'hero'
 * 44 (number card), 'count' 40 (a tile's single number), default 30 (a tile),
 * 'small' 22 (metrics row).
 */
export function Stat({ value, unit, caption, tone, color, size = 'default', large }: { value: string; unit?: string; caption?: string; tone?: 'alert' | 'ok'; color?: string; size?: 'hero' | 'count' | 'default' | 'small'; /** @deprecated size="hero" */ large?: boolean }) {
  const t = useTheme();
  const c = color ?? (tone === 'alert' ? t.c.alert.coral : t.c.fg.primary);
  const fontSize = { hero: 44, count: 40, default: 30, small: 22 }[large ? 'hero' : size];
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
        <Text variant="stat" color={c} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontSize, lineHeight: Math.round(fontSize * 1.05) }}>
          {value}
        </Text>
        {unit ? (
          <Text variant="label" color="secondary">
            {unit}
          </Text>
        ) : null}
      </View>
      {caption ? (
        <Text variant="caption" color={tone === 'ok' ? t.c.ok.sageText : 'secondary'} numberOfLines={2}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** A Tile whose body is a single Stat. */
export function StatTile({ value, unit, caption, tone, statSize, ...tile }: Omit<TileProps, 'children'> & { value: string; unit?: string; caption?: string; tone?: 'alert' | 'ok'; statSize?: 'hero' | 'count' | 'default' }) {
  const t = useTheme();
  // Light: the tint's ink on its soft fill. Noir: a colour block, where the number is black (OnBlock).
  const color = !t.dark && tile.filled && tile.tint && tone !== 'alert' ? t.tints[tile.tint].ink : undefined;
  return (
    <Tile {...tile}>
      <Stat value={value} unit={unit} caption={caption} tone={tone} color={color} size={statSize ?? (tile.size === '2x2' ? 'hero' : 'default')} />
    </Tile>
  );
}
