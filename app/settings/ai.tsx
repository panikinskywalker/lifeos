import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSettings } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, Chip, IconButton, Input, Screen, Text } from '@ui/components/primitives';
import { getApiKey, setApiKey } from '../../src/platform/boot';

const MODELS = ['claude-sonnet-5', 'claude-opus-5-5', 'claude-haiku-4-5'];

export default function AiSettingsRoute() {
  const router = useRouter();
  const t = useTheme();
  const s = useSettings();
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { getApiKey().then((k) => setKey(k ?? '')); }, []);
  return (
    <Screen title="Assistant" right={<IconButton icon="xmark" bg onPress={() => router.back()} />}>
      <View style={{ gap: 14 }}>
        <Card style={{ gap: 10 }}>
          <Text variant="headline">Anthropic API key</Text>
          <Text variant="footnote" color="secondary">Stored in the device keychain (SecureStore). Calls go straight from your phone to api.anthropic.com — there is no LifeOS server.</Text>
          <Input value={key} onChangeText={(v) => { setKey(v); setSaved(false); }} placeholder="sk-ant-…" autoCapitalize="none" autoCorrect={false} secureTextEntry />
          <Button title={saved ? 'Saved' : 'Save key'} onPress={async () => { await setApiKey(key.trim() || null); setSaved(true); }} color={t.colors.accents.indigo} />
        </Card>
        <Card style={{ gap: 10 }}>
          <Text variant="headline">Model</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {MODELS.map((m) => <Chip key={m} label={m} selected={s.aiModel === m} color={t.colors.accents.indigo} onPress={() => s.set('aiModel', m)} />)}
          </View>
          <Input value={s.aiModel} onChangeText={(v) => s.set('aiModel', v)} placeholder="Custom model id" autoCapitalize="none" />
        </Card>
        <Card style={{ gap: 6 }}>
          <Text variant="headline">What it can do</Text>
          <Text variant="footnote" color="secondary">Search and query any record · aggregate spend, tasks, habits · create, update, link and tag records (asks first) · set reminders · build automation rules. Every change goes through the same validation, timeline and automation as the UI.</Text>
        </Card>
      </View>
    </Screen>
  );
}
