import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Button, Icon, Text, useToast } from '@ui/kit';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { dishAsk, quantityWords, shopLabel, type StockState } from '@modules/inventory';

/**
 * Home's parts, a first pass from the kit (NR-KitRecords, NR-People-Parts'
 * pills and chips) until the NR-Home-Parts artboard exists: the stock pill
 * in its states and two sizes, the space tile, the "why" line, the source
 * chip, the section head and the slot for what needs the brain.
 */

const INK = '#0B0B0D';
/** Noir has no mustard block; the yellow block stands in for "use soon" until NR-Home-Parts. */
const USE_SOON = blocks.yellow;

export function stateColors(state: StockState, dark: boolean, accentText: string) {
  switch (state) {
    case 'fresh':
      return { bg: dark ? 'rgba(215,245,92,0.14)' : 'rgba(117,91,0,0.10)', fg: dark ? blocks.lime : accentText, border: 'transparent' };
    case 'use soon':
      return { bg: dark ? 'rgba(246,226,127,0.20)' : 'rgba(242,107,43,0.14)', fg: dark ? USE_SOON : '#8A3A10', border: 'transparent' };
    default:
      return { bg: 'transparent', fg: dark ? 'rgba(245,245,247,0.42)' : 'rgba(0,0,0,0.38)', border: dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)' };
  }
}

/**
 * The stock pill: coloured by state (lime fresh · yellow use soon · faded and
 * dashed probably gone), a "×2" badge, and a small "~" when the state rests
 * on LifeOS's guess. `lg` on a space page (40 high), `sm` in strips and cards (32).
 */
export function StockPill({ title, state, quantity = 1, guess, size = 'lg', onPress, onLongPress, label }: { title: string; state: StockState; quantity?: number; guess?: boolean; size?: 'lg' | 'sm'; onPress?: () => void; onLongPress?: () => void; label?: string }) {
  const t = useTheme();
  const c = stateColors(state, t.dark, t.c.accent.gold);
  const h = size === 'lg' ? 40 : 32;
  const q = quantityWords(quantity);
  const body = (
    <>
      <Text numberOfLines={1} style={{ fontSize: size === 'lg' ? 15 : 13, lineHeight: size === 'lg' ? 20 : 17, fontWeight: '600', color: c.fg, flexShrink: 1 }}>{title}</Text>
      {guess && state !== 'fresh' ? <Text style={{ fontSize: 12, lineHeight: 15, fontWeight: '700', color: c.fg, opacity: 0.8 }}>~</Text> : null}
      {q ? (
        <View style={{ minWidth: 22, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: state === 'probably gone' ? 'transparent' : 'rgba(0,0,0,0.28)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '700', color: c.fg }}>{q}</Text>
        </View>
      ) : null}
    </>
  );
  const style = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, height: h, maxWidth: '100%' as const, paddingHorizontal: size === 'lg' ? 14 : 12, borderRadius: 999, backgroundColor: c.bg, borderWidth: state === 'probably gone' ? 1 : 0, borderStyle: 'dashed' as const, borderColor: c.border };
  const a11y = label ?? [title, q, state, guess && state !== 'fresh' ? 'LifeOS’s guess' : null].filter(Boolean).join(', ');
  if (!onPress && !onLongPress) return <View accessibilityLabel={a11y} style={style}>{body}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} accessibilityHint={onLongPress ? 'Tap: used up. Long-press: more' : undefined} onPress={onPress} onLongPress={onLongPress} delayLongPress={350} style={({ pressed }) => [style, { opacity: pressed ? 0.7 : 1 }]}>
      {body}
    </Pressable>
  );
}

/** A plain pill (the shopping list, add-several preview): 32 high, raised, optional "suggested" ring. */
export function PlainPill({ title, sub, suggested, onPress, onLongPress, icon }: { title: string; sub?: string | null; suggested?: boolean; onPress?: () => void; onLongPress?: () => void; icon?: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[title, sub, suggested ? 'suggested by LifeOS' : null].filter(Boolean).join(', ')} onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderStyle: suggested ? 'dashed' : 'solid', borderColor: suggested ? t.c.accent.mustard : 'transparent', opacity: pressed ? 0.75 : 1 })}>
      {icon ? <Icon name={icon} size={14} color={t.c.fg.secondary} /> : null}
      <View style={{ flexShrink: 1 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, lineHeight: 18, fontWeight: '600', color: t.c.fg.primary }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: 11, lineHeight: 14, color: t.c.fg.secondary }}>{sub}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Pills that wrap (a space's cloud). */
export function PillCloud({ children, gap = 8 }: { children: React.ReactNode; gap?: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>{children}</View>;
}

/** The "why" line on a guess: 12/600, secondary; yellow when it is urgent. */
export function Why({ children, urgent }: { children: string; urgent?: boolean }) {
  const t = useTheme();
  return <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: urgent ? (t.dark ? USE_SOON : '#8A3A10') : t.c.fg.secondary }}>{children}</Text>;
}

/** The source chip: Blinkit · Zepto · Instamart · receipt · you. */
export function SourceChip({ source, shop }: { source?: string; shop?: string }) {
  const t = useTheme();
  const label = source === 'order' && shop ? shopLabel(shop) : source === 'receipt' ? 'Receipt' : 'You';
  return (
    <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.c.bg.dim, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: t.c.fg.secondary }}>{label}</Text>
    </View>
  );
}

/** A section's head: 17/600 title, a 13 line, an action on the right (as People's). */
export function SectionHead({ title, sub, action, onAction }: { title: string; sub?: string | null; action?: string; onAction?: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{sub}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>{action}</Text>
          <Icon name="chevron-right" size={14} color={t.c.fg.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** A card (24 radius) on the tile colour. */
export function Card({ children, gap = 12, pad = 16 }: { children: React.ReactNode; gap?: number; pad?: number }) {
  const t = useTheme();
  return <View style={{ padding: pad, borderRadius: 24, backgroundColor: t.c.bg.tile, gap }}>{children}</View>;
}

/** The space tile: icon disc, name, count, state hints ("2 use soon · 1 low"). */
export function SpaceTile({ name, icon, count, hints, onPress }: { name: string; icon: string; count: number; hints: string | null; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[name, `${count} things`, hints].filter(Boolean).join(', ')} onPress={onPress} style={({ pressed }) => ({ flexBasis: '46%', flexGrow: 1, minHeight: 112, padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile, justifyContent: 'space-between', opacity: pressed ? 0.85 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={18} color={t.c.fg.primary} />
        </View>
        <Text style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary }}>{count}</Text>
      </View>
      <View style={{ gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>{name}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: hints ? '600' : '400', color: hints ? (t.dark ? USE_SOON : '#8A3A10') : t.c.fg.tertiary }}>{hints ?? 'all good'}</Text>
      </View>
    </Pressable>
  );
}

/**
 * A slot for what needs the brain (layer 8): Cook tonight, the fridge photo.
 * Drawn so the place is held, clearly not working yet; no model is called.
 */
export function BrainSlot({ title, line, icon = 'brain' }: { title: string; line: string; icon?: string }) {
  const t = useTheme();
  return (
    <View accessibilityLabel={`${title}. ${line}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.line, backgroundColor: 'transparent' }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.dim, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={18} color={t.c.fg.tertiary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.secondary }}>{title}</Text>
        <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>{line}</Text>
      </View>
      <View style={{ height: 22, paddingHorizontal: 8, borderRadius: 999, backgroundColor: t.c.bg.dim, justifyContent: 'center' }}>
        <Text style={{ fontSize: 10, lineHeight: 13, fontWeight: '700', letterSpacing: 0.6, color: t.c.fg.tertiary }}>SOON</Text>
      </View>
    </View>
  );
}

/** Empty states: a 56 raised disc, 17/600 title, 13 line, then actions (as People's). */
export function HomeEmpty({ icon = 'home', title, line, children }: { icon?: string; title: string; line: string; children?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, alignItems: 'center', gap: 10 }}>
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
        <Icon name={icon} size={26} color={t.c.accent.mustard} />
      </View>
      <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', color: t.c.fg.primary, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary, textAlign: 'center', maxWidth: 280 }}>{line}</Text>
      {children ? <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 4 }}>{children}</View> : null}
    </View>
  );
}

export { INK };

/**
 * Cook tonight (layer 8): the dish Claude suggested at the last pass, or from
 * the last fridge photo, for what is fresh and what to use soon, kept in the
 * learned store under the key made from those things (so the same fridge
 * never costs a second call). Another idea forgets it and runs a pass now;
 * with no dish yet, Ask now does the same.
 */
export function CookTonight() {
  const t = useTheme();
  const os = useOS();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const d = useLive((o) => {
    const ask = dishAsk(o);
    return { ask, dish: ask ? o.brain.learned.get<string>(ask.key) : undefined };
  }, []);
  const ask = async (forget: boolean) => {
    if (forget && d.ask) os.brain.learned.forget(d.ask.key);
    if (!os.device?.brain) return toast.show({ message: 'A new idea comes with the next pass', icon: 'refresh' });
    setAsking(true);
    try {
      const r = await os.device.brain.pass('you asked Cook tonight for an idea');
      const filled = d.ask && os.brain.learned.has(dishAsk(os)?.key ?? '');
      if (!filled) toast.show({ message: r.note === 'no key' ? 'Add your Claude key in You › Agent › Brain' : r.note === 'over budget' ? 'Today’s budget for Claude is used up' : 'No idea this time; try again later', icon: 'info' });
    } finally {
      setAsking(false);
    }
  };
  if (!d.ask) return <BrainSlot title="Cook tonight" line="Fewer than three things in the Fridge and Kitchen to cook from." icon="food" />;
  if (!d.dish)
    return (
      <View style={{ padding: 16, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.line, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="food" size={18} color={t.c.fg.tertiary} />
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>Cook tonight: a dish from what’s fresh and what to use soon, at the brain’s next pass.</Text>
        </View>
        <Button title={asking ? 'Asking…' : 'Ask now'} icon="refresh" size="sm" variant="secondary" disabled={asking} onPress={() => void ask(false)} />
      </View>
    );
  const [name, uses] = d.dish.split(/:\s*/, 2);
  return (
    <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="food" size={18} color={t.c.accent.mustard} />
        <Text style={{ flex: 1, fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.tertiary }}>COOK TONIGHT</Text>
      </View>
      <Text style={{ fontSize: 20, lineHeight: 25, fontWeight: '700', color: t.c.fg.primary }}>{name}</Text>
      {uses ? <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{uses}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button title={asking ? 'Asking…' : 'Another idea'} icon="refresh" size="sm" variant="secondary" disabled={asking} onPress={() => void ask(true)} />
      </View>
    </View>
  );
}

/** Snap the fridge's way in (Home and the Fridge): opens the camera screen. Nothing leaves until you take the photo. */
export function SnapFridge() {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Snap the fridge" onPress={() => router.push('/module/inventory/snap' as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.75 : 1 })}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="camera" size={18} color={t.c.accent.mustard} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>Snap the fridge</Text>
        <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.tertiary }}>One photo, compared with the pills. It goes to Claude only when you take it.</Text>
      </View>
      <Icon name="chevron-right" size={18} color={t.c.fg.tertiary} />
    </Pressable>
  );
}
