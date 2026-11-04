import { useRef } from 'react';
import { Animated, Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Filing } from '@core/repo/filingRepo';
import { answerNudge, NUDGE_KINDS, urgentWhen, type CardVerb, type Nudge } from '@core/brain';
import { wishKey } from '@modules/crm';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Icon, Surface, Text, useToast, type IconName } from '@ui/kit';
import { Disc, Dot, moduleInk, moduleWord, Pill } from './brainParts';

const KIND_ICON: Record<Nudge['kind'], IconName> = { 'running out': 'cart', 'going off': 'hourglass', due: 'repeat', 'coming up': 'calendar' };
const SHAPE_WORDS: Record<Nudge['shape'], string> = { done: 'Done, undo?', check: 'Is this right?', ask: 'Shall I?' };
const YES_ICON: Record<string, IconName> = { Call: 'phone', 'Send wish': 'send' };

/** The toast after a Yes: what opened and what is left to you. */
function yesWords(open: string | undefined, title: string): { message: string; icon: IconName } {
  const name = title.trim().split(/\s+/)[0] ?? title;
  if (open?.startsWith('tel:')) return { message: `Call: the dialler opens with ${name}`, icon: 'phone' };
  if (open?.includes('wa.me')) return { message: `In WhatsApp: press Send to ${name}`, icon: 'send' };
  return { message: `Done · ${title}`, icon: 'check' };
}

/**
 * A nudge in To check (docs/MODEL.md layer 8; NR-Brain-ToCheck), in its three
 * shapes with the same verbs everywhere: done, undo? (Keep · Undo) · is this
 * right? (Right · Not this) · shall I? (the module's verb · Not this · Later).
 * The line opens its record; Not this slides the card out, with Undo on the toast.
 */
export function NudgeCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const slide = useRef(new Animated.Value(0)).current;
  const n = useLive((o) => o.brain.nudges.forFiling(filing.id), [filing.id]);
  if (!n) return null;
  const rec = n.recordId ? os.records.get(n.recordId) : undefined;
  const open = (to: string) => (to.startsWith('/') ? router.push(to as never) : void Linking.openURL(to).catch(() => toast.show({ message: 'Couldn’t open that app', icon: 'info' })));
  const where = n.route ?? (rec ? `/entity/${rec.object}/${rec.id}` : null);
  const wish = n.yes === 'Send wish' && rec ? os.brain.learned.get<string>(wishKey(rec as never, n.createdAt) ?? '') : undefined;
  const undoNo = () => {
    os.brain.learned.forget(`not-this:${n.key}`);
    os.brain.nudges.update(n.id, { state: 'open' });
    if (n.filingId) os.filings.setChecked(n.filingId, false);
  };
  const say = (verb: CardVerb) => {
    const r = answerNudge(os, n.id, verb);
    if (r?.open) open(r.open);
    if (verb === 'no') toast.show({ message: 'Got it, not this one again', icon: 'check', undo: undoNo });
    else if (verb === 'later') toast.show(n.shape === 'done' ? { message: `Kept · ${n.title}`, icon: 'check' } : { message: `Later · ${n.line}`, icon: 'clock' });
    else if (verb === 'undo') toast.show({ message: `Undone · ${n.title}`, icon: 'undo' });
    else toast.show(yesWords(r?.open, n.title));
  };
  const notThis = () => Animated.timing(slide, { toValue: 1, duration: 180, useNativeDriver: true }).start(() => say('no'));
  const buttons: Array<{ label: string; verb: CardVerb; variant: 'primary' | 'secondary' | 'ghost'; icon?: IconName }> =
    n.shape === 'done'
      ? [{ label: 'Keep', verb: 'later', variant: 'primary' }, { label: 'Undo', verb: 'undo', variant: 'secondary', icon: 'undo' }]
      : n.shape === 'check'
        ? [{ label: n.yes ?? 'Right', verb: 'yes', variant: 'primary' }, { label: 'Not this', verb: 'no', variant: 'secondary' }]
        : [{ label: n.yes ?? 'Yes', verb: 'yes', variant: 'primary', icon: YES_ICON[n.yes ?? ''] }, { label: 'Not this', verb: 'no', variant: 'secondary' }, { label: 'Later', verb: 'later', variant: 'ghost' }];
  const ink = moduleInk(t, n.module);
  return (
    <Surface kind="tile">
      <Animated.View
        accessibilityLabel={n.urgent ? 'Urgent nudge' : undefined}
        style={{
          padding: 16,
          gap: 12,
          borderRadius: t.radius.card,
          backgroundColor: t.c.bg.tile,
          borderWidth: n.urgent ? 1 : 0,
          borderColor: `${t.c.alert.coral}66`,
          opacity: slide.interpolate({ inputRange: [0, 1], outputRange: [1, 0.42] }),
          transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 56] }) }],
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Disc icon={KIND_ICON[n.kind]} color={n.urgent ? t.c.alert.coralText : ink} />
          <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Dot color={ink} />
              <Text variant="labelCaps" color="secondary" numberOfLines={1} style={{ flex: 1, textTransform: 'uppercase' }}>
                {`${n.kind} · ${moduleWord(os, n.module)}`}
              </Text>
            </View>
            <Text variant="labelMicro" color="secondary" style={{ fontFamily: t.type.caption.fontFamily }}>
              {SHAPE_WORDS[n.shape]}
            </Text>
          </View>
          {n.urgent ? <Pill label={`Urgent · ${urgentWhen(n.line).toLowerCase()}`} color={t.c.alert.coralText} fill={t.c.alert.coralFill} /> : n.shape === 'done' ? <Pill label="Done by LifeOS" icon="check" color={t.c.ok.sageText} fill={t.c.ok.sageFill} /> : null}
        </View>

        <Pressable accessibilityRole={where ? 'link' : undefined} disabled={!where} onPress={() => where && router.push(where as never)} style={{ gap: 4 }}>
          <Text variant="heading" numberOfLines={3} style={{ lineHeight: 23, letterSpacing: 0 }}>
            {n.line}
          </Text>
          {!wish && n.title !== n.line ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text variant="caption" color="secondary" numberOfLines={1} style={{ flexShrink: 1 }}>
                {n.title}
              </Text>
              {where ? <Icon name="chevron-right" size={14} color={t.c.fg.secondary} /> : null}
            </View>
          ) : null}
        </Pressable>

        {wish ? (
          <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 18, borderBottomLeftRadius: 6, backgroundColor: t.c.bg.tileRaised }}>
            <Text variant="body" style={{ fontWeight: '500' }}>
              {wish}
            </Text>
          </View>
        ) : null}

        {n.state === 'open' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {buttons.map((b) => (
              <Button key={b.verb} title={b.label} size="sm" variant={b.variant} icon={b.icon} style={{ paddingHorizontal: b.variant === 'ghost' ? 16 : 18 }} onPress={() => (b.verb === 'no' ? notThis() : say(b.verb))} />
            ))}
          </View>
        ) : null}
      </Animated.View>
    </Surface>
  );
}

/** To check's cards for the three nudge filing kinds. */
export const NUDGE_CARDS = Object.fromEntries(NUDGE_KINDS.map((k) => [k, NudgeCard]));
