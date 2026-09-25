import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '@ui/hooks';
import { Button, Card, ChipRow, FilterChip, Screen, Text, TextField, useToast } from '@ui/kit';
import { getApiKey, setApiKey } from '../../src/platform/boot';

const MODELS = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
];

/** You › Agent & API key: the Anthropic key (SecureStore) and the model Talk uses. */
export default function AiSettingsRoute() {
  const router = useRouter();
  const toast = useToast();
  const s = useSettings();
  const [key, setKey] = useState('');
  const [stored, setStored] = useState<string | null>(null);
  useEffect(() => {
    getApiKey().then((k) => {
      setKey(k ?? '');
      setStored(k ?? null);
    });
  }, []);
  const dirty = key.trim() !== (stored ?? '');
  const save = async () => {
    const k = key.trim() || null;
    await setApiKey(k);
    setStored(k);
    toast.show({ message: k ? 'API key saved on this phone' : 'API key removed', icon: 'check' });
  };
  return (
    <Screen title="Agent & API key" subtitle={stored ? 'Key saved · Talk is on' : 'No key yet · Talk is off'} onBack={() => (router.canGoBack() ? router.back() : router.replace('/you'))}>
      <Card icon="lock" iconTone="accent" title="Anthropic API key">
        <Text variant="caption" color="secondary">
          Create one at console.anthropic.com › API Keys. It is stored in this phone’s keychain (SecureStore); requests go straight from the phone to api.anthropic.com — there is no LifeOS server.
        </Text>
        <TextField value={key} onChange={setKey} placeholder="sk-ant-…" autoCapitalize="none" autoCorrect={false} secureTextEntry />
        <Button title={dirty ? 'Save key' : stored ? 'Saved' : 'Save key'} icon="check" block disabled={!dirty} onPress={() => void save()} />
      </Card>

      <Card icon="sparkle" iconTone="accent" title="Model" meta={s.aiModel}>
        <ChipRow>
          {MODELS.map((m) => (
            <FilterChip key={m.id} label={m.label} selected={s.aiModel === m.id} onPress={() => s.set('aiModel', m.id)} />
          ))}
        </ChipRow>
        <TextField label="Custom model id" value={s.aiModel} onChange={(v) => s.set('aiModel', v)} placeholder="claude-…" autoCapitalize="none" autoCorrect={false} />
      </Card>

      <Card icon="info" title="What it can do">
        <View style={{ gap: 6 }}>
          <Text variant="caption" color="secondary">
            Search and query any record · add up spend, tasks and habits · create, update, link and tag records (asks first) · set reminders · build automation rules.
          </Text>
          <Text variant="caption" color="secondary">
            Every change goes through the same checks, timeline and automations as the app.
          </Text>
        </View>
      </Card>
    </Screen>
  );
}
