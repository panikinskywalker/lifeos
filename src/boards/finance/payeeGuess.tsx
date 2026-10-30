import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { messageItem, sourceLabel } from '@core/filing/messages';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Icon, Text, useToast } from '@ui/kit';
import { PAYEE_WHO, confirmPayee, rejectPayee, whoAskOf } from '@modules/finance/filing/payee';

/**
 * Who paid on the payment's own page (NR-People-WhoIs): a new sender shows
 * "+₹147 from priya.s@okicici" with the coral "Who is this?", which opens To
 * check where it's answered once; a guess ("We think JOHN D is John Doe") is
 * Yes, which links and teaches, or Not them, which keeps a separate payee.
 */

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

export function PayeeGuess({ entity }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const v = useLive(
    (o) => {
      const f = o.filings.toCheck().find((x) => x.kind === PAYEE_WHO && x.entityId === entity.id);
      const ask = f ? whoAskOf(f) : null;
      const msg = f?.sourceRef ? messageItem(o, f.sourceRef) : null;
      const guesses = o.links.forEntity(entity.id).filter((r) => r.direction === 'out' && (r.relation.confidence ?? 1) < 1 && r.relation.meta.guess);
      return { ask, source: msg ? sourceLabel(o, msg) : null, guesses };
    },
    [entity.id],
  );
  const d = entity.data as { amount?: number; kind?: string; date?: string };
  const day = d.date ? format(new Date(`${d.date}T00:00:00`), 'EEE d MMM') : null;
  const money = d.amount != null ? `${d.kind === 'income' ? '+' : '−'}${os.format.currency(d.amount)}` : null;
  if (!v.ask && !v.guesses.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {v.ask ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`Who is ${v.ask.vpa}? Answer in To check`} onPress={() => router.push('/check' as never)} style={({ pressed }) => ({ padding: 14, borderRadius: 24, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.85 : 1 })}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 48 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="user" size={18} color={t.c.fg.primary} />
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="rowTitle" numberOfLines={1}>
                {[money, d.kind === 'income' ? 'from' : 'to', v.ask.vpa].filter(Boolean).join(' ')}
              </Text>
              <Text variant="caption" color="secondary" numberOfLines={1}>
                {[day, v.source].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <View style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(255,92,71,0.18)', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: '600', color: t.c.alert.coralText }}>Who is this?</Text>
            </View>
          </View>
        </Pressable>
      ) : null}
      {v.guesses.map((g) => {
        const said = g.relation.meta.as as string | undefined;
        return (
          <View key={g.relation.id} style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 44 }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="people" size={18} color={t.c.fg.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text variant="rowTitle" numberOfLines={2}>
                  {said ? `We think ${said} is ${g.other.title}` : String(g.relation.meta.guess).replace(/[“”]/g, '')}
                </Text>
                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {[money, day, 'name on the UPI'].filter(Boolean).join(' · ')}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pill title={`Yes, ${firstName(g.other.title)}`} icon="check" lime onPress={() => { confirmPayee(os, g.relation.id); toast.show({ message: `Linked to ${g.other.title} · next time it’s automatic`, icon: 'check' }); }} />
              <Pill title="Not them" icon="x" onPress={() => { rejectPayee(os, g.relation.id); toast.show({ message: 'Kept as a separate payee', icon: 'people' }); }} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** 44-high pill: lime (Yes) or raised (Not them). */
function Pill({ title, icon, lime, onPress }: { title: string; icon: string; lime?: boolean; onPress: () => void }) {
  const t = useTheme();
  const fg = lime ? t.c.accent.mustardInk : t.c.fg.primary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ flex: 1, height: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: lime ? t.c.accent.mustard : t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
      <Icon name={icon} size={18} color={fg} />
      <Text numberOfLines={1} style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: fg, flexShrink: 1 }}>
        {title}
      </Text>
    </Pressable>
  );
}
