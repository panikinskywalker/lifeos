import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Filing } from '@core/repo/filingRepo';
import { answerNudge, NUDGE_KINDS, type CardVerb, type Nudge } from '@core/brain';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { tintForModule } from '@ui/theme/moduleTint';
import { Button, Icon, Text, useToast, type IconName } from '@ui/kit';

const KIND_ICON: Record<Nudge['kind'], IconName> = { 'running out': 'cart', 'going off': 'hourglass', due: 'repeat', 'coming up': 'calendar' };
const SHAPE_WORDS: Record<Nudge['shape'], string> = { done: 'Done, undo?', check: 'Is this right?', ask: 'Shall I?' };

/**
 * A nudge in To check (docs/MODEL.md layer 8), in its three shapes with the
 * same verbs everywhere: done, undo? (Keep · Undo) · is this right? (Right ·
 * Not this) · shall I? (the module's verb · Not this · Later). The line opens
 * its record. A first pass from the kit until NR-Brain-ToCheck.
 */
export function NudgeCard({ filing }: { filing: Filing }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const n = useLive((o) => o.brain.nudges.forFiling(filing.id), [filing.id]);
  if (!n) return null;
  const moduleName = os.registry.modules.get(n.module)?.name ?? 'Upkeep';
  const open = (to: string) => (to.startsWith('/') ? router.push(to as never) : void Linking.openURL(to).catch(() => toast.show({ message: 'Couldn’t open that app', icon: 'info' })));
  const where = n.route ?? (n.recordId && os.records.get(n.recordId) ? `/entity/${os.records.get(n.recordId)!.object}/${n.recordId}` : null);
  const say = (verb: CardVerb) => {
    const r = answerNudge(os, n.id, verb);
    if (r?.open) open(r.open);
    const words = { yes: 'Done', no: 'Got it, not this one again', later: 'Later', undo: 'Undone' }[verb];
    toast.show({ message: `${words} · ${n.title}`, icon: verb === 'undo' ? 'undo' : 'check' });
  };
  const buttons: Array<[string, CardVerb, 'primary' | 'secondary' | 'ghost']> =
    n.shape === 'done' ? [['Keep', 'later', 'primary'], ['Undo', 'undo', 'secondary']] : n.shape === 'check' ? [[n.yes ?? 'Right', 'yes', 'primary'], ['Not this', 'no', 'secondary']] : [[n.yes ?? 'Yes', 'yes', 'primary'], ['Not this', 'no', 'secondary'], ['Later', 'later', 'ghost']];
  return (
    <View style={{ padding: 10, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={KIND_ICON[n.kind]} size={14} color={n.urgent ? t.c.alert.coral : t.tints[tintForModule(n.module)].ink} />
        <Text variant="labelMicro" color="tertiary" style={{ flex: 1, textTransform: 'uppercase' }} numberOfLines={1}>
          {`${n.kind} · ${moduleName} · ${SHAPE_WORDS[n.shape]}`}
        </Text>
      </View>
      <Pressable accessibilityRole={where ? 'link' : undefined} disabled={!where} onPress={() => where && router.push(where as never)}>
        <Text variant="label" numberOfLines={3}>
          {n.line}
        </Text>
      </Pressable>
      {n.state === 'open' ? (
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {buttons.map(([label, verb, variant]) => (
            <Button key={verb} title={label} size="sm" variant={variant} onPress={() => say(verb)} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** To check's cards for the three nudge filing kinds. */
export const NUDGE_CARDS = Object.fromEntries(NUDGE_KINDS.map((k) => [k, NudgeCard]));
