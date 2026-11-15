import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { senders, setSenderTrusted } from '@core/filing/messages';
import { BANK_NAMES } from '@modules/finance/filing/bankSms';
import { rereadTexts, undoReread } from '@modules/finance/filing/reread';
import { useLive, useOS } from '@ui/hooks';
import { Button, EmptyState, RowList, Screen, Section, SwitchField, Text, useToast } from '@ui/kit';
import { importSmsHistory } from '../../src/platform/sources';

/** You › Data sources › SMS: which senders to trust (banks and cards are ticked for you; untick any). */
export default function SmsSendersScreen() {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const list = useLive((o) => senders(o), []);
  const trusted = list.filter((s) => s.trusted);
  const other = list.filter((s) => !s.trusted);
  return (
    <Screen title="SMS senders" subtitle="Only ticked senders are read as money" onBack={() => router.back()}>
      <View style={{ gap: 16 }}>
        {!list.length ? <EmptyState icon="comment" line="No senders yet. They appear as bank messages are read." /> : null}
        {trusted.length ? (
          <Section title="Read as money">
            <RowList>
              {trusted.map((s) => (
                <SwitchField key={s.address} label={`${s.address}${s.bank ? ` · ${BANK_NAMES[s.bank]}` : ''}`} hint={`${s.count} message${s.count === 1 ? '' : 's'}${s.sample ? ` · “${s.sample.slice(0, 60)}…”` : ''}`} value onChange={() => setSenderTrusted(os, s.address, false)} />
              ))}
            </RowList>
          </Section>
        ) : null}
        {other.length ? (
          <Section title="Ignored">
            <RowList>
              {other.slice(0, 60).map((s) => (
                <SwitchField key={s.address} label={s.address} hint={s.sample ? `“${s.sample.slice(0, 60)}…”` : undefined} value={false} onChange={() => setSenderTrusted(os, s.address, true)} />
              ))}
            </RowList>
          </Section>
        ) : null}
        <Text variant="caption" color="secondary">
          Messages are kept word for word either way; ticking a sender later re-reads it on the next history import.
        </Text>
        <Button
          title="Read SMS history again"
          icon="refresh"
          variant="secondary"
          onPress={() =>
            void importSmsHistory(os).then((n) => {
              if (n) router.push('/settings/sms-review' as never);
              else toast.show({ message: 'Nothing new to review', icon: 'check' });
            })
          }
        />
        <Section title="Read my texts again">
          <Text variant="caption" color="secondary">
            Files the texts LifeOS still has (the last 60 days) again with today’s rules. Payments it filed itself are replaced; any you edited, split or linked by hand stay as they are. Undo puts the old ones back.
          </Text>
          <Button
            title="Read my texts again"
            icon="refresh"
            variant="secondary"
            onPress={() => {
              const r = rereadTexts(os);
              toast.show({ message: `${r.read} texts read again · ${r.removed.length} payments replaced, ${r.kept} you changed kept`, icon: 'check', undo: () => void undoReread(os) });
            }}
          />
        </Section>
      </View>
    </Screen>
  );
}
