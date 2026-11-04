import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { brainSettings, brief, type Brief, type BriefLine, type Nudge } from '@core/brain';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Text } from '@ui/kit';
import { getProviderKey } from '../platform/keys';
import { Disc, Dot, Hairline, moduleInk, moduleWord, passTime, softInk } from './brainParts';

/** The header's meta: when the brief was written, "Updated 7 pm" after the evening pass. */
export function briefMeta(b: Brief): string | undefined {
  if (!b.pass) return undefined;
  return b.pass.pass === 'morning' ? passTime(b.pass.at) : `Updated ${passTime(b.pass.at)}`;
}

/** "Cook tonight: Palak paneer: spinach, paneer, cream" as its three parts. */
function fillParts(text: string): { slot: string; title: string; detail?: string } {
  const [slot = '', title = '', ...rest] = text.split(': ');
  return { slot, title, detail: rest.join(': ') || undefined };
}

/**
 * The Morning brief on top of Today (docs/MODEL.md layer 8): each line says its
 * category and, when urgent, when (NR-Brief-A-Labels), and opens its record or
 * its To check card. The answered line, New, Cook tonight, "N more" and the
 * quiet days are NR-Brain-Brief's and NR-Brain-States'.
 */
export function MorningBrief() {
  const t = useTheme();
  const router = useRouter();
  const v = useLive((o) => {
    const b = brief(o);
    const said = new Set(o.brain.sent.recent(50).filter((e) => e.outcome === 'ok').map((e) => e.at));
    const rows = b.lines.map((l) => ({ l, n: o.brain.nudges.get(l.id) }));
    const nudges = rows.filter((r): r is { l: BriefLine; n: Nudge } => !!r.n);
    return {
      b,
      nudges,
      fills: rows.filter((r) => !r.n).map((r) => r.l),
      firstDay: !o.settings.get<{ day: string }>('brain.passes', { day: '' }).day,
      settings: brainSettings(o),
      // Every line came from a pass Claude did not answer.
      ownWords: nudges.length > 0 && !nudges.some((r) => said.has(r.n.createdAt)),
      more: Math.max(0, o.filings.toCheckCount() - nudges.filter((r) => r.n.state === 'open').length),
    };
  }, []);
  const [hasKey, setHasKey] = useState(true);
  useFocusEffect(
    useCallback(() => {
      void getProviderKey('claude').then((k) => setHasKey(!!k)).catch(() => undefined);
    }, []),
  );

  const { b, nudges, fills, more } = v;
  if (!b.pass) return v.firstDay && v.settings.on ? <FirstDay morning={v.settings.morning} /> : null;
  const meta = briefMeta(b);
  return (
    <View accessibilityLabel="Morning brief" style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.tile, padding: 16, gap: 4 }}>
      <View style={{ paddingBottom: 6, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="sun" size={18} color={t.c.accent.mustard} />
          <Text variant="tileTitle" style={{ flex: 1 }} accessibilityRole="header">
            Morning brief
          </Text>
          {meta ? (
            <Text variant="caption" color="secondary">
              {meta}
            </Text>
          ) : null}
        </View>
        {v.ownWords ? (
          <Text variant="labelMicro" color={softInk(t)} style={{ paddingLeft: 26 }}>
            In LifeOS’s own words
          </Text>
        ) : null}
      </View>

      {!nudges.length ? (
        <Text variant="title" style={{ fontWeight: '600', lineHeight: 28, letterSpacing: -0.3, paddingBottom: 8 }}>
          Nothing needs you today.
        </Text>
      ) : null}

      {nudges.map(({ l, n }, i) => (
        <View key={l.id} style={{ gap: 4 }}>
          {i ? <Hairline /> : null}
          <Line line={l} nudge={n} isNew={b.pass?.pass !== 'morning' && n.createdAt === b.pass?.at} />
        </View>
      ))}

      {fills.map((l) => (nudges.length ? <FillSlab key={l.id} line={l} /> : <FillRow key={l.id} line={l} />))}

      {!hasKey && !fills.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8, marginHorizontal: -4, padding: 12, borderRadius: 18, backgroundColor: t.c.bg.tileRaised }}>
          <Text variant="caption" color={softInk(t)} style={{ flex: 1, lineHeight: 18 }}>
            No dish, wish or gift ideas without Claude.
          </Text>
          <Pressable accessibilityRole="link" onPress={() => router.push('/settings/brain' as never)} style={{ minHeight: 44, justifyContent: 'center' }}>
            <Text variant="caption" color={t.c.accent.gold} style={{ fontWeight: '700' }}>
              Add a key
            </Text>
          </Pressable>
        </View>
      ) : null}

      {more ? (
        <Pressable accessibilityRole="link" onPress={() => router.push('/check' as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 44, opacity: pressed ? 0.7 : 1 })}>
          <Text variant="caption" color="secondary" style={{ fontWeight: '600' }}>
            {`${more} more in To check`}
          </Text>
          <Icon name="chevron-right" size={14} color={t.c.fg.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Line({ line: l, nudge: n, isNew }: { line: BriefLine; nudge: Nudge; isNew: boolean }) {
  const t = useTheme();
  const os = useOS();
  const router = useRouter();
  const ink = moduleInk(t, l.module);
  const word = moduleWord(os, l.module);
  const answer = l.answered ? (n.state === 'yes' ? `Done ${passTime(n.updatedAt)}` : 'Later') : null;
  const right = answer ?? l.when ?? (isNew ? 'New' : null);
  const rightInk = answer ? t.c.fg.secondary : l.when ? t.c.alert.coralText : t.c.accent.gold;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[word, right, l.text].filter(Boolean).join(': ')}
      accessibilityHint={l.answered ? 'Opens it; already answered' : 'Opens it'}
      onPress={() => router.push(l.route as never)}
      style={({ pressed }) => ({ gap: 3, minHeight: 44, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Dot color={ink} hollow={l.answered} />
        <Text variant="labelCaps" color={ink} style={{ flex: 1, textTransform: 'uppercase' }}>
          {word}
        </Text>
        {right ? (
          <Text variant="labelCaps" color={rightInk} style={{ fontWeight: '700', letterSpacing: 0, textTransform: 'uppercase' }}>
            {right}
          </Text>
        ) : null}
      </View>
      <Text variant="body" color={l.answered ? 'secondary' : 'primary'} numberOfLines={2} style={l.answered ? { fontWeight: '500' } : undefined}>
        {l.text}
      </Text>
    </Pressable>
  );
}

/** Cook tonight under the lines. */
function FillSlab({ line }: { line: BriefLine }) {
  const t = useTheme();
  const router = useRouter();
  const { slot, title, detail } = fillParts(line.text);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={line.text} onPress={() => router.push(line.route as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginHorizontal: -4, padding: 12, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tile, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="food" size={18} color={t.c.accent.mustard} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="labelCaps" color="secondary" style={{ textTransform: 'uppercase' }}>
          {slot}
        </Text>
        <Text variant="rowTitle" style={{ fontWeight: '700' }}>
          {title}
        </Text>
        {detail ? (
          <Text variant="caption" color="secondary" numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>
      <Icon name="chevron-right" size={16} color={t.c.fg.secondary} />
    </Pressable>
  );
}

/** Cook tonight on a calm day: one short row. */
function FillRow({ line }: { line: BriefLine }) {
  const t = useTheme();
  const router = useRouter();
  const { slot, title } = fillParts(line.text);
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={line.text} onPress={() => router.push(line.route as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, opacity: pressed ? 0.8 : 1 })}>
      <Icon name="food" size={18} color={t.c.accent.mustard} />
      <Text variant="tileTitle" style={{ flex: 1, lineHeight: 20 }} numberOfLines={2}>
        {`${slot}: ${title}`}
      </Text>
      <Icon name="chevron-right" size={16} color={t.c.fg.secondary} />
    </Pressable>
  );
}

/** Before the very first pass; any other day before the morning pass there is no section. */
function FirstDay({ morning }: { morning: string }) {
  const t = useTheme();
  const [h = 7, m = 0] = morning.split(':').map(Number);
  const at = new Date(2000, 0, 1, h, m).getTime();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: t.radius.card, backgroundColor: t.c.bg.tile }}>
      <Disc icon="sun" color={softInk(t)} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="tileTitle" style={{ lineHeight: 20 }}>
          {`Your first Morning brief comes after ${passTime(at)}`}
        </Text>
        <Text variant="caption" color="secondary">
          LifeOS looks through Home, Upkeep, People and Turf, then writes it here.
        </Text>
      </View>
    </View>
  );
}
