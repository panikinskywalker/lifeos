import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import { runSource } from '@core/filing/sources';
import { sourceState } from '@core/sources/deviceData';
import { allPlayers, SETTING_ME, TURF_TOKEN, TURF_URL, type PullResult } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { Button, Screen, Section, SelectField, Text, TextField, useToast } from '@ui/kit';

const STEPS = [
  'In Turf Ledger’s hosting settings (OpenAI Sites), add a secret named LIFEOS_TOKEN: a long random string, at least 32 characters.',
  'Deploy the Turf Ledger version that has the LifeOS endpoint (the lifeos-endpoint branch).',
  'Paste the site’s address and the same token here, then tap Pull now.',
];

/**
 * You › Data sources › Turf Ledger (R9a): the address, the token (kept in the
 * phone's secure store, never shown again), which player is you (it decides
 * who owes whom), and the last pull.
 */
export default function TurfSettings() {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const [url, setUrl] = useState(os.settings.get<string>(TURF_URL, ''));
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [busy, setBusy] = useState(false);
  const players = useLive((o) => (o.registry.objects.has('player') ? allPlayers(o) : []), []);
  const me = useLive((o) => o.settings.get<string | null>(SETTING_ME, null), []);
  const state = useLive((o) => ({ src: sourceState(o, 'turf'), last: o.settings.get<(PullResult & { at: number }) | null>('turf.lastPull', null) }), []);

  useEffect(() => {
    void os.device?.secrets?.get(TURF_TOKEN).then((t) => setHasToken(!!t));
  }, [os]);

  const save = async () => {
    os.settings.set(TURF_URL, url.trim());
    if (token.trim()) {
      if (token.trim().length < 32) return toast.show({ message: 'The token should be at least 32 characters', icon: 'info' });
      await os.device?.secrets?.set(TURF_TOKEN, token.trim());
      setToken('');
      setHasToken(true);
    }
    toast.show({ message: 'Saved', icon: 'check' });
  };
  const forget = async () => {
    await os.device?.secrets?.set(TURF_TOKEN, null);
    setHasToken(false);
    toast.show({ message: 'Token removed from this phone', icon: 'trash' });
  };
  const pull = async () => {
    const src = os.registry.sources.get('turf');
    if (!src) return;
    setBusy(true);
    try {
      await runSource(os, src);
      const r = os.settings.get<PullResult | null>('turf.lastPull', null);
      toast.show({ message: r ? `Pulled: ${r.created} new, ${r.updated} changed` : 'Pulled', icon: 'check' });
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    } finally {
      setBusy(false);
    }
  };

  const meOptions = players.map((p) => ({ value: (p.data.sourceKey ?? '').replace('turf:players:', ''), label: p.data.name })).filter((o) => o.value);

  return (
    <Screen title="Turf Ledger" subtitle="Your football, read from the web app" onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings/sources' as never))}>
      <Section title="Connection">
        <View style={{ gap: 12 }}>
          <TextField label="Address" value={url} onChange={setUrl} placeholder="turf-ledger.chatgpt.site" keyboardType="url" autoCapitalize="none" autoCorrect={false} />
          <TextField
            label={hasToken ? 'Token (saved on this phone)' : 'Token'}
            value={token}
            onChange={setToken}
            placeholder={hasToken ? 'Paste a new one to replace it' : 'The LIFEOS_TOKEN you set in Turf Ledger'}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            hint="Kept in the phone’s secure store, never in backups. Don’t paste it into chats."
          />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button title="Save" icon="check" size="sm" onPress={() => void save()} />
            <Button title={busy ? 'Pulling…' : 'Pull now'} icon="refresh" size="sm" variant="secondary" disabled={busy || !url.trim() || !hasToken} onPress={() => void pull()} />
            {hasToken ? <Button title="Remove token" icon="trash" size="sm" variant="ghost" onPress={() => void forget()} /> : null}
          </View>
          <Text variant="caption" color={state.src.error ? 'alert' : 'secondary'}>
            {state.src.error
              ? state.src.error
              : state.last
                ? `Last pull ${formatDistanceToNow(state.last.at, { addSuffix: true })}: ${state.last.created} new, ${state.last.updated} changed, ${state.last.archived} archived · ${state.last.peopleMatched} players matched to People, ${state.last.peopleCreated} added`
                : 'Not pulled yet.'}
          </Text>
        </View>
      </Section>

      <Section title="Which player is you">
        <View style={{ gap: 8 }}>
          {meOptions.length ? (
            <SelectField options={meOptions} value={me ?? undefined} onChange={(v) => os.settings.set(SETTING_ME, v ?? null)} />
          ) : (
            <Text variant="caption" color="secondary">
              Your players appear here after the first pull.
            </Text>
          )}
          <Text variant="caption" color="secondary">
            Decides who owes whom: on a game you fronted, unpaid shares are owed to you; on someone else’s, your unpaid share is owed by you. Applied on the next pull.
          </Text>
        </View>
      </Section>

      <Section title="Setting it up">
        <View style={{ gap: 10 }}>
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
          <Text variant="caption" color="tertiary">
            Read-only for now: LifeOS reads matches, players, venues and who paid. Changes made in LifeOS reach Turf Ledger in the next step (R9b). Nothing is imported as a payment, because your bank texts already file those.
          </Text>
        </View>
      </Section>
    </Screen>
  );
}
