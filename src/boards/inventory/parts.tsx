import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import type { LifeOSContext } from '@core/registry/context';
import { Icon, Text, useToast } from '@ui/kit';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { blocks } from '@ui/theme/tokens';
import { dayWords, dishAsk, isoDay, productKey, quantityWords, shopLabel, stockState, type StockData, type StockState } from '@modules/inventory';

const NOT_TONIGHT = 'inventory.notTonight';

/**
 * Home's parts, as drawn across the NR-Home-* artboards: the stock pill in its
 * states and two sizes, the space tile, the "why" line, the source chip, the
 * section head, and the card and button shapes the screens share.
 */

const INK = '#0B0B0D';
/** "Use soon" on the artboards: the yellow block. */
const USE_SOON = blocks.yellow;

export function stateColors(state: StockState, dark: boolean, accentText: string) {
  switch (state) {
    case 'fresh':
      return { bg: dark ? 'rgba(215,245,92,0.14)' : 'rgba(117,91,0,0.10)', fg: dark ? blocks.lime : accentText, border: 'transparent' };
    case 'use soon':
      return { bg: dark ? 'rgba(246,226,127,0.20)' : 'rgba(242,107,43,0.14)', fg: dark ? USE_SOON : '#8A3A10', border: 'transparent' };
    default:
      return { bg: 'transparent', fg: dark ? 'rgba(245,245,247,0.62)' : 'rgba(0,0,0,0.38)', border: dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)' };
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
        <View style={{ minWidth: 22, height: 20, paddingHorizontal: 6, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.28)', alignItems: 'center', justifyContent: 'center' }}>
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

/** A plain pill (the shopping list, add-several preview): 44 high, raised; a suggestion has a dashed lime ring and a sparkle. */
export function PlainPill({ title, sub, suggested, onPress, onLongPress, icon }: { title: string; sub?: string | null; suggested?: boolean; onPress?: () => void; onLongPress?: () => void; icon?: string }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[title, sub, suggested ? 'suggested by LifeOS' : null].filter(Boolean).join(', ')} onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, borderWidth: 1, borderStyle: suggested ? 'dashed' : 'solid', borderColor: suggested ? t.c.accent.mustard : 'transparent', opacity: pressed ? 0.75 : 1 })}>
      {icon ? <Icon name={icon} size={14} color={suggested ? t.c.accent.mustard : t.c.fg.secondary} /> : null}
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
export function SourceChip({ source, shop, label }: { source?: string; shop?: string; label?: string }) {
  const t = useTheme();
  const name = label ?? (source === 'order' && shop ? shopLabel(shop) : source === 'receipt' ? 'Receipt' : 'You');
  return (
    <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', color: t.c.fg.secondary }}>{name}</Text>
    </View>
  );
}

/** A section's head: 17/600 title, a 13 line, an action on the right (as People's). */
export function SectionHead({ title, sub, action, onAction, plain }: { title: string; sub?: string | null; action?: string; onAction?: () => void; /** No chevron on the action. */ plain?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingTop: 6, paddingHorizontal: 4 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text accessibilityRole="header" style={{ fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.2, color: t.c.fg.primary }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{sub}</Text> : null}
      </View>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.secondary }}>{action}</Text>
          {plain ? null : <Icon name="chevron-right" size={14} color={t.c.fg.secondary} />}
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

/** The space tile: icon disc, count, name, state hints ("2 use soon · 1 low"). `wide` is the full-width row Clothes gets. */
export function SpaceTile({ name, icon, count, hints, wide, onPress }: { name: string; icon: string; count: number; hints: string | null; wide?: boolean; onPress: () => void }) {
  const t = useTheme();
  const disc = (
    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={18} color={t.c.fg.primary} />
    </View>
  );
  const number = <Text style={{ fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary }}>{count}</Text>;
  const words = (
    <View style={wide ? { flex: 1, minWidth: 0 } : undefined}>
      <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>{name}</Text>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: hints ? '600' : '400', color: hints ? (t.dark ? USE_SOON : '#8A3A10') : t.c.fg.secondary }}>{hints ?? 'all good'}</Text>
    </View>
  );
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={[name, `${count} things`, hints ?? 'all good'].join(', ')} onPress={onPress} style={({ pressed }) => [{ padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.85 : 1 }, wide ? { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 76 } : { flexBasis: '46%', flexGrow: 1, minHeight: 112, justifyContent: 'space-between', gap: 10 }]}>
      {wide ? (
        <>
          {disc}
          {words}
          {number}
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            {disc}
            {number}
          </View>
          {words}
        </>
      )}
    </Pressable>
  );
}

/** The 11/600 tracked label on a card ("COOK TONIGHT", "LIFE"). */
export function Eyebrow({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={{ fontSize: 11, lineHeight: 14, fontWeight: '600', letterSpacing: 0.9, color: t.c.fg.secondary }}>{children.toUpperCase()}</Text>;
}

/** The 12/16 quiet line under a block. */
export function Note({ children, center }: { children: React.ReactNode; center?: boolean }) {
  const t = useTheme();
  return <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary, paddingHorizontal: 4, textAlign: center ? 'center' : 'left' }}>{children}</Text>;
}

/** The hairline between rows on a card. */
export function Hairline() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.c.line }} />;
}

/**
 * The artboards' round-ended button: lime with ink, or raised with a lime icon
 * (`raised`). 46 high inside cards; pass `height` for the 52 and 48 ones.
 */
export function PillButton({ title, icon, trailing, raised, height = 46, disabled, onPress, style }: { title: string; icon?: string; /** The icon after the words (Open Blinkit). */ trailing?: boolean; raised?: boolean; height?: number; disabled?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const fg = raised ? t.c.fg.primary : t.c.accent.mustardInk;
  const iconColor = raised ? t.c.accent.mustard : t.c.accent.mustardInk;
  const glyph = icon ? <Icon name={icon} size={17} color={iconColor} /> : null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [{ height, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, backgroundColor: raised ? t.c.bg.tileRaised : t.c.accent.mustard, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }, style]}>
      {trailing ? null : glyph}
      <Text numberOfLines={1} style={{ fontSize: height > 48 ? 16 : 15, lineHeight: 20, fontWeight: '600', color: fg }}>{title}</Text>
      {trailing ? glyph : null}
    </Pressable>
  );
}

/** A 40-high button on a row (Used up · It's there · Correct it). Lime, raised, or plain lime text. */
export function RowButton({ title, kind = 'raised', onPress }: { title: string; kind?: 'lime' | 'raised' | 'text'; onPress: () => void }) {
  const t = useTheme();
  const fg = kind === 'lime' ? t.c.accent.mustardInk : kind === 'text' ? t.c.accent.gold : t.c.fg.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} hitSlop={2} onPress={onPress} style={({ pressed }) => ({ height: 40, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: kind === 'lime' ? t.c.accent.mustard : kind === 'raised' ? t.c.bg.tileRaised : 'transparent', opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: kind === 'raised' ? '600' : '700', color: fg }}>{title}</Text>
    </Pressable>
  );
}

/** A small tag: 28 high, 12/600 (fresh · running low · "use by tomorrow ~"). */
export function StateChip({ label, tone }: { label: string; tone: 'fresh' | 'soon' | 'gone' | 'low' }) {
  const t = useTheme();
  const c = tone === 'low' ? { bg: t.c.alert.coralFill, fg: t.c.alert.coralText, border: 'transparent' } : stateColors(tone === 'fresh' ? 'fresh' : tone === 'soon' ? 'use soon' : 'probably gone', t.dark, t.c.accent.gold);
  return (
    <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: c.bg, borderWidth: tone === 'gone' ? 1 : 0, borderStyle: 'dashed', borderColor: c.border, justifyContent: 'center' }}>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: c.fg }}>{label}</Text>
    </View>
  );
}

/** The dashed mark that says whose number it is ("~ LifeOS's guess · 30 d", "You said · 30 d"). */
export function GuessChip({ label }: { label: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: t.dark ? 'rgba(255,255,255,0.18)' : t.c.line, justifyContent: 'center' }}>
      <Text numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.fg.secondary }}>{label}</Text>
    </View>
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
        <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary }}>{line}</Text>
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

/** What a dish needs, as Claude said it, matched to what is at home. */
function dishParts(os: LifeOSContext, uses: string | undefined, now: number) {
  const home = os.records.query<StockData>('stock', {}, { limit: 5000 }).filter((s) => s.data.quantity > 0);
  return (uses ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((word) => {
      const k = productKey(word);
      const s = k ? home.find((h) => productKey(h.title).includes(k)) : undefined;
      return { word, s, state: s ? stockState(s.data, now) : null };
    });
}

/**
 * Cook tonight (layer 8; NR-Home-Home): the dish Claude suggested at the last
 * pass, or from the last fridge photo, for what is fresh and what to use soon,
 * kept in the learned store under the key made from those things (so the same
 * fridge never costs a second call). Its things as pills, the ones going off
 * marked. Another idea forgets it and runs a pass now; with no dish yet, Ask
 * now does the same. Not tonight hides the card until tomorrow.
 */
export function CookTonight() {
  const t = useTheme();
  const os = useOS();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const today = isoDay(Date.now());
  const [hidden, setHidden] = useState(() => os.settings.get<string | null>(NOT_TONIGHT, null) === today);
  const d = useLive((o) => {
    const ask = dishAsk(o);
    const dish = ask ? o.brain.learned.get<string>(ask.key) : undefined;
    if (!ask || !dish) return { ask, dish };
    const at = o.brain.learned.all({ kinds: ['answer'], limit: 200 }).find((x) => x.key === ask.key)?.updatedAt;
    const [name, uses] = dish.split(/:\s*/, 2);
    return { ask, dish, at, name: name!, parts: dishParts(o, uses, Date.now()) };
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
  const notTonight = () => {
    os.settings.set(NOT_TONIGHT, today);
    setHidden(true);
    toast.show({
      message: 'Not tonight',
      icon: 'check',
      undo: () => {
        os.settings.set(NOT_TONIGHT, null);
        setHidden(false);
      },
    });
  };
  if (hidden) return null;
  if (!d.ask) return <BrainSlot title="Cook tonight" line="Fewer than three things in the Fridge and Kitchen to cook from." icon="food" />;
  if (!d.dish)
    return (
      <View style={{ padding: 16, borderRadius: 24, borderWidth: 1, borderStyle: 'dashed', borderColor: t.c.line, gap: 10, marginTop: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Icon name="food" size={18} color={t.c.accent.mustard} />
          <Text style={{ flex: 1, fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>Cook tonight: a dish from what’s fresh and what to use soon, at the brain’s next pass.</Text>
        </View>
        <PillButton title={asking ? 'Asking…' : 'Ask now'} icon="refresh" raised disabled={asking} onPress={() => void ask(false)} />
      </View>
    );
  const off = (d.parts ?? []).filter((p) => p.state?.state === 'use soon').map((p) => p.word.toLowerCase());
  return (
    <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 12, marginTop: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Icon name="food" size={18} color={t.c.accent.mustard} />
        <View style={{ flex: 1 }}>
          <Eyebrow>Cook tonight</Eyebrow>
        </View>
        {d.at ? <Text style={{ fontSize: 12, lineHeight: 16, color: t.c.fg.secondary }}>{`${dayWords(isoDay(d.at))} · ${os.format.time(d.at).toLowerCase()}`}</Text> : null}
      </View>
      <Text style={{ fontSize: 24, lineHeight: 29, fontWeight: '700', letterSpacing: -0.5, color: t.c.fg.primary }}>{d.name}</Text>
      {off.length ? <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>{`Uses the ${off.join(' and ')} before ${off.length === 1 ? 'it goes' : 'they go'} off.`}</Text> : null}
      {d.parts?.length ? (
        <PillCloud gap={6}>
          {d.parts.map((p) => (p.s && p.state ? <StockPill key={p.word} title={p.s.title} state={p.state.state} quantity={p.s.data.quantity} guess={p.state.estimated} size="sm" /> : <SmallPill key={p.word} title={p.word.charAt(0).toUpperCase() + p.word.slice(1)} />))}
        </PillCloud>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <PillButton title={asking ? 'Asking…' : 'Another idea'} icon="refresh" raised disabled={asking} style={{ flex: 1 }} onPress={() => void ask(true)} />
        <Pressable accessibilityRole="button" accessibilityLabel="Not tonight" onPress={notTonight} style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 999, borderWidth: 1, borderColor: t.c.line, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: t.c.fg.primary }}>Not tonight</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A 32-high pill with no state: something a dish uses that isn't on Home. */
function SmallPill({ title }: { title: string }) {
  const t = useTheme();
  return (
    <View style={{ height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center' }}>
      <Text numberOfLines={1} style={{ fontSize: 13, lineHeight: 17, fontWeight: '600', color: t.c.fg.primary }}>{title}</Text>
    </View>
  );
}

/** Snap the fridge's card (the Fridge, NR-Home-Space): opens the camera screen. Nothing leaves until you take the photo. */
export function SnapFridge() {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="camera" size={18} color={t.c.accent.mustard} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 16, lineHeight: 21, fontWeight: '600', color: t.c.fg.primary }}>Snap the fridge</Text>
          <Text style={{ fontSize: 13, lineHeight: 17, color: t.c.fg.secondary }}>A photo, checked against these pills</Text>
        </View>
      </View>
      <PillButton title="Snap the fridge" icon="camera" onPress={() => router.push('/module/inventory/snap' as never)} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Icon name="shield" size={14} color={t.c.fg.secondary} style={{ marginTop: 1 }} />
        <Text style={{ flex: 1, fontSize: 12, lineHeight: 16, color: t.c.fg.secondary }}>The photo goes to Claude only when you press this, and isn’t kept there. It shows in You › Agent › Brain › Sent to Claude.</Text>
      </View>
    </View>
  );
}
