import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { senders, setSenderTrusted } from '@core/ingest/ingest';
import { BANK_NAMES } from '@core/ingest/bankSms';
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
        {!list.length ? <EmptyState icon="comment" line="No senders yet — they appear as bank messages are read." /> : null}
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
      </View>
    </Screen>
  );
}
