import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { formatDistanceToNow } from 'date-fns';
import { runSource } from '@core/filing/sources';
import { sourceState } from '@core/sources/deviceData';
import { allPlayers, isTurfKey, SETTING_LAST, SETTING_ME, SETTING_REV, TURF_DEFAULT_URL, TURF_KEY, TURF_URL, type SyncResult } from '@modules/games';
import { useLive, useOS } from '@ui/hooks';
import { Button, Screen, Section, Text, TextField, useToast } from '@ui/kit';

const STEPS = [
  'On Turf web, signed in as organiser: Settings › Connected phones › Add a phone. Name it “LifeOS · S22”.',
  'Copy the key it shows (it starts with tw_ and is shown once).',
  'Paste it here with Turf web’s address, then tap Sync now. The first sync brings everything; after that only what changed.',
];

/**
 * You › Data sources › Turf web (R9c): the address, this phone's key (kept in
 * the phone's secure store, never shown again), which player is you (set in
 * Turf web, shown here), and the last sync.
 */
export default function TurfSettings() {
  const os = useOS();
  const router = useRouter();
  const toast = useToast();
  const [url, setUrl] = useState(os.settings.get<string>(TURF_URL, '') || TURF_DEFAULT_URL);
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const me = useLive((o) => {
    const id = o.settings.get<string | null>(SETTING_ME, null);
    return id && o.registry.objects.has('player') ? allPlayers(o).find((p) => p.data.sourceKey === `turf:players:${id}`)?.data.name ?? null : null;
  }, []);
  const state = useLive((o) => ({ src: sourceState(o, 'turf'), last: o.settings.get<(SyncResult & { at: number }) | null>(SETTING_LAST, null) }), []);

  useEffect(() => {
    void os.device?.secrets?.get(TURF_KEY).then((k) => setHasKey(!!k));
  }, [os]);

  const save = async () => {
    os.settings.set(TURF_URL, url.trim());
    if (key.trim()) {
      if (!isTurfKey(key)) return toast.show({ message: 'That isn’t a Turf web key — it starts with tw_', icon: 'info' });
      await os.device?.secrets?.set(TURF_KEY, key.trim());
      setKey('');
      setHasKey(true);
    }
    toast.show({ message: 'Saved', icon: 'check' });
  };
  const forget = async () => {
    await os.device?.secrets?.set(TURF_KEY, null);
    setHasKey(false);
    toast.show({ message: 'Key removed from this phone', icon: 'trash' });
  };
  const sync = async (fromStart = false) => {
    const src = os.registry.sources.get('turf');
    if (!src) return;
    setBusy(true);
    try {
      if (fromStart) os.settings.set(SETTING_REV, 0);
      await runSource(os, src);
      const r = os.settings.get<SyncResult | null>(SETTING_LAST, null);
      toast.show({ message: r ? `Synced: ${r.created} new, ${r.updated} changed` : 'Synced', icon: 'check' });
    } catch (e) {
      toast.show({ message: (e as Error).message, icon: 'info' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Turf web" subtitle="Your football, synced from the web app" onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings/sources' as never))}>
      <Section title="Connection">
        <View style={{ gap: 12 }}>
          <TextField label="Address" value={url} onChange={setUrl} placeholder={TURF_DEFAULT_URL} keyboardType="url" autoCapitalize="none" autoCorrect={false} />
          <TextField
            label={hasKey ? 'Key (saved on this phone)' : 'Key'}
            value={key}
            onChange={setKey}
            placeholder={hasKey ? 'Paste a new one to replace it' : 'tw_… from Turf web › Settings › Connected phones'}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            hint="Kept in the phone’s secure store, never in backups. Don’t paste it into chats."
          />
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Button title="Save" icon="check" size="sm" onPress={() => void save()} />
            <Button title={busy ? 'Syncing…' : 'Sync now'} icon="refresh" size="sm" variant="secondary" disabled={busy || !url.trim() || !hasKey} onPress={() => void sync()} />
            {hasKey ? <Button title="Remove key" icon="trash" size="sm" variant="ghost" onPress={() => void forget()} /> : null}
          </View>
          <Text variant="caption" color={state.src.error ? 'alert' : 'secondary'}>
            {state.src.error
              ? state.src.error
              : state.last
                ? `Last sync ${formatDistanceToNow(state.last.at, { addSuffix: true })} (change ${state.last.rev}): ${state.last.created} new, ${state.last.updated} changed, ${state.last.archived} archived, ${state.last.payments} payment entries · ${state.last.peopleMatched} players matched to People, ${state.last.peopleCreated} added`
                : 'Not synced yet.'}
          </Text>
          {state.last ? <Button title="Sync everything again" icon="refresh" size="sm" variant="ghost" disabled={busy || !hasKey} onPress={() => void sync(true)} /> : null}
        </View>
      </Section>

      <Section title="Which player is you">
        <View style={{ gap: 8 }}>
          <Text variant="rowTitle">{me ?? 'Not set'}</Text>
          <Text variant="caption" color="secondary">
            Set in Turf web › Settings › Who you are, so both phones agree. It decides who owes whom: on a game you fronted, open shares are owed to you; on someone else’s, your open share is owed by you.
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
            Read-only for now: LifeOS syncs matches, players, venues, RSVPs and every payment entry. Changes made in LifeOS reach Turf web in the next step. Nothing is imported as a Transaction, because your bank texts already file those.
          </Text>
        </View>
      </Section>
    </Screen>
  );
}
