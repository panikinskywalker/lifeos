import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useRouter } from 'expo-router';
import { clearSamples, samples, SKIPPED, type Sample } from '@core/filing/samples';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, EmptyState, Screen, Section, Text, useToast } from '@ui/kit';
import { collectTextSamples, exportMessageSamples, exportParserDataset } from '../../src/platform/parserDataset';

/** What a module is called on screen, where its code id differs. */
const NAMES: Record<string, string> = { finance: 'Money', inventory: 'Home', crm: 'People', games: 'Turf' };
const SHOWN = 5;

function groupsOf(all: Sample[]) {
  const by = new Map<string, Sample[]>();
  for (const s of all) by.set(s.module ?? '', [...(by.get(s.module ?? '') ?? []), s]);
  const rank = (k: string) => (k === '' ? 0 : k === SKIPPED ? 2 : 1);
  return [...by].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));
}

const groupName = (k: string) => (k === '' ? 'Not read yet' : k === SKIPPED ? 'Read and skipped' : (NAMES[k] ?? k.charAt(0).toUpperCase() + k.slice(1)));

/** You › Data sources › Message samples (docs/MODEL.md layer 4): one masked example of each kind of message, to send for better parsers. */
export default function MessageSamplesScreen() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const all = useLive((o) => samples(o), []);
  const [busy, setBusy] = useState<'add' | 'send' | 'full' | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const fail = (e: Error) => toast.show({ message: e.message, icon: 'info' });
  const unread = all.filter((s) => !s.module).length;
  return (
    <Screen title="Message samples" subtitle={all.length ? `${all.length} examples · ${unread} not read yet` : 'Examples for better parsers'} onBack={() => router.back()}>
      <View style={{ gap: 16 }}>
        <Text variant="caption" color="secondary">
          One example of each kind of message from banks, shops and services. Account and card digits, reference numbers, balances and UPI ids are hidden before it is kept. Amounts, shops and people’s names stay. One-time codes and texts from people are left out. Nothing leaves the phone until you export it, and you choose where it goes.
        </Text>
        <Button
          title={busy === 'add' ? 'Reading your texts…' : 'Add my last 12 months of texts'}
          icon="refresh"
          variant="secondary"
          disabled={!!busy}
          onPress={() => {
            setBusy('add');
            collectTextSamples(os)
              .then((n) => toast.show({ message: n ? `${n} new examples` : 'No new kinds of message', icon: 'check' }))
              .catch(fail)
              .finally(() => setBusy(null));
          }}
        />
        <Button
          title={busy === 'send' ? 'Preparing the file…' : 'Export samples'}
          icon="share"
          disabled={!!busy || !all.length}
          onPress={() => {
            setBusy('send');
            exportMessageSamples(os)
              .then((n) => toast.show({ message: `${n} examples in the file`, icon: 'check' }))
              .catch(fail)
              .finally(() => setBusy(null));
          }}
        />
        {!all.length ? <EmptyState icon="comment" line="No examples yet. They collect as messages come in, or add your last 12 months of texts." /> : null}
        {groupsOf(all).map(([key, rows]) => (
          <Section key={key} title={groupName(key)} meta={String(rows.length)} action={rows.length > SHOWN ? (open[key] ? 'Show fewer' : 'Show all') : undefined} onAction={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}>
            {rows.slice(0, open[key] ? rows.length : SHOWN).map((s) => (
              <View key={s.id} style={{ backgroundColor: t.c.bg.container, borderRadius: 20, padding: 14, gap: 6 }}>
                <Text variant="caption" color="secondary" numberOfLines={1}>
                  {`${s.sender} · ${s.source === 'email' ? 'mail' : s.source === 'notification' ? 'notification' : 'text'}${s.seen > 1 ? ` · seen ${s.seen} times` : ''}`}
                </Text>
                <Text variant="body" selectable numberOfLines={6}>
                  {s.title ? `${s.title}\n${s.text}` : s.text}
                </Text>
              </View>
            ))}
          </Section>
        ))}
        <Section title="Help fix the parser">
          <Text variant="caption" color="secondary">
            One file with the last 12 months of texts from banks, shops and services, word for word and not masked, with what LifeOS read in each and what it filed. One-time codes and texts from people’s numbers are left out. It includes amounts, account endings and payee names, so only send it where you mean to.
          </Text>
          <Button
            title={busy === 'full' ? 'Preparing the file…' : 'Export texts for the parser'}
            icon="share"
            variant="secondary"
            disabled={!!busy}
            onPress={() => {
              setBusy('full');
              exportParserDataset(os)
                .then((r) => toast.show({ message: `${r.included} texts in the file`, icon: 'check' }))
                .catch(fail)
                .finally(() => setBusy(null));
            }}
          />
        </Section>
        {all.length ? (
          <Button
            title="Clear the samples"
            icon="trash"
            variant="secondary"
            onPress={() =>
              Alert.alert('Clear the samples?', 'They collect again as new messages come in.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear', style: 'destructive', onPress: () => clearSamples(os) },
              ])
            }
          />
        ) : null}
      </View>
    </Screen>
  );
}
