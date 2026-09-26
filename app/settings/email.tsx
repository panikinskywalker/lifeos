import { useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, EmptyState, Icon, Screen, Section, Text, TextField, useToast } from '@ui/kit';
import { addMailAccount, mailAccounts, mailAvailable, removeMailAccount, syncMail } from '../../src/platform/email';

const STEPS = [
  'Turn on 2-Step Verification for the Google account (Security › 2-Step Verification), if it isn’t already.',
  'Open App passwords (the button below), name it “LifeOS” and tap Create.',
  'Copy the 16-letter password Google shows and paste it here with the email address.',
];

/**
 * You › Data sources › Gmail (M4.2b): connect any number of Gmail accounts
 * with an app password — read-only, receipts / bookings / shipping / bank
 * alerts only. Each account shows when it last synced and what it filed;
 * removing one forgets its password (what it filed stays, labelled).
 */
export default function EmailSettings() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const accounts = useLive((o) => mailAccounts(o), []);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      await addMailAccount(os, email, pw);
      toast.show({ message: `${email.trim().toLowerCase()} connected — reading the last 90 days`, icon: 'check' });
      setEmail('');
      setPw('');
      setAdding(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = (addr: string) => {
    const go = () => void removeMailAccount(os, addr).then(() => toast.show({ message: `${addr} removed`, icon: 'trash' }));
    if (Platform.OS === 'web') return go();
    Alert.alert(`Remove ${addr}?`, 'LifeOS stops reading it and forgets its app password. What it already filed stays, still labelled with this address.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: go }]);
  };
  const sync = async (addr: string) => {
    setSyncing(addr);
    await syncMail(os, addr);
    setSyncing(null);
    const a = mailAccounts(os).find((x) => x.email === addr);
    toast.show({ message: a?.error ?? `${addr} synced`, icon: a?.error ? 'alert' : 'check' });
  };
  const showForm = adding || !accounts.length;

  return (
    <Screen title="Gmail" subtitle="Receipts, tickets, bookings, shipping" onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings/sources' as never))}>
      {!mailAvailable ? <EmptyState icon="inbox" line="Gmail needs the new app build (it reads mail on the phone itself)." /> : null}
      {accounts.length ? (
        <Section title="Connected">
          <View style={{ gap: 10 }}>
            {accounts.map((a) => (
              <View key={a.email} style={{ backgroundColor: t.c.bg.container, borderRadius: 20, padding: 14, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Icon name="inbox" size={18} color={a.error ? t.c.alert.coralText : t.c.ok.sageText} />
                  <Text variant="rowTitle" style={{ flex: 1 }} numberOfLines={1}>
                    {a.email}
                  </Text>
                </View>
                <Text variant="caption" color={a.error ? 'alert' : 'secondary'}>
                  {a.error ?? `${a.lastSync ? `Synced ${formatDistanceToNow(a.lastSync, { addSuffix: true })}` : 'Reading the last 90 days…'} · ${a.filed} filed or matched`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title={syncing === a.email ? 'Syncing…' : 'Sync now'} size="sm" variant="secondary" icon="refresh" disabled={!!syncing || !mailAvailable} onPress={() => void sync(a.email)} />
                  <Button title="Remove" size="sm" variant="ghost" icon="trash" onPress={() => remove(a.email)} />
                </View>
              </View>
            ))}
          </View>
        </Section>
      ) : null}

      {showForm ? (
        <Section title={accounts.length ? 'Add another account' : 'Add a Gmail account'}>
          <View style={{ gap: 12 }}>
            {STEPS.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                <Text variant="label" color="secondary">
                  {i + 1}.
                </Text>
                <Text variant="caption" color="secondary" style={{ flex: 1 }}>
                  {s}
                </Text>
              </View>
            ))}
            <Button title="Open App passwords" variant="secondary" icon="link" onPress={() => void Linking.openURL('https://myaccount.google.com/apppasswords')} />
            <TextField label="Gmail address" value={email} onChange={setEmail} placeholder="you@gmail.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" />
            <TextField label="App password" value={pw} onChange={setPw} placeholder="abcd efgh ijkl mnop" autoCapitalize="none" autoCorrect={false} secureTextEntry hint="Not your Google password — the 16-letter one you just made. Stored only on this phone, in its secure store." error={error ?? undefined} />
            <Button title={busy ? 'Checking with Google…' : 'Connect'} icon="check" disabled={busy || !email.trim() || !pw.trim() || !mailAvailable} onPress={() => void add()} />
            <Text variant="caption" color="tertiary">
              Read-only: LifeOS never sends, deletes or marks anything. It downloads only receipts, bookings, shipping updates and bank alerts, and every record they create names the address it came from.
            </Text>
          </View>
        </Section>
      ) : (
        <Button title="Add another Gmail account" variant="secondary" icon="plus" onPress={() => setAdding(true)} />
      )}
    </Screen>
  );
}
