import { View } from 'react-native';
import type { ObjectRecord } from '@core/domain/types';
import type { LifeOSContext } from '@core/registry/context';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Icon, Text, useToast } from '@ui/kit';
import { confirmPayee, rejectPayee } from '@modules/finance/filing/payee';

/** On a payment whose payee was a guess ("Priya S?"): Yes links and teaches; Not them keeps a separate payee. */
export function PayeeGuess({ entity }: { entity: ObjectRecord<any>; ctx: LifeOSContext }) {
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const guesses = useLive((o) => o.links.forEntity(entity.id).filter((r) => r.direction === 'out' && (r.relation.confidence ?? 1) < 1 && r.relation.meta.guess), [entity.id]);
  if (!guesses.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {guesses.map((g) => (
        <View key={g.relation.id} style={{ backgroundColor: t.c.accent.mustardSoft, borderRadius: 18, padding: 12, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="people" size={16} color={t.c.accent.gold} />
            <Text variant="label" style={{ flex: 1 }}>{String(g.relation.meta.guess)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title={`Yes, ${g.other.title}`} size="sm" icon="check" onPress={() => { confirmPayee(os, g.relation.id); toast.show({ message: `Linked to ${g.other.title} — next time it’s automatic`, icon: 'check' }); }} style={{ flex: 1 }} />
            <Button title="Not them" size="sm" variant="secondary" icon="x" onPress={() => { rejectPayee(os, g.relation.id); toast.show({ message: 'Kept as a separate payee', icon: 'people' }); }} style={{ flex: 1 }} />
          </View>
        </View>
      ))}
    </View>
  );
}
