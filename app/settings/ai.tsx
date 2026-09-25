import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { usageSummary } from '@core/ai/routing';
import { useLive, useSettings } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, ChipRow, FilterChip, Screen, Sparkline, StatTrio, SwitchField, Text, TextField, useToast } from '@ui/kit';
import { getApiKey, setApiKey } from '../../src/platform/boot';

const SMART = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
];
const FAST = [
  { id: 'claude-haiku-4-5', label: 'Haiku 4.5' },
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
];
const MODEL_NAME: Record<string, string> = { 'claude-sonnet-5': 'Sonnet 5', 'claude-opus-5-5': 'Opus 5.5', 'claude-haiku-4-5': 'Haiku 4.5' };
const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

/** You › Agent & API key: the Anthropic key (SecureStore), models and routing, usage this month. */
export default function AiSettingsRoute() {
  const router = useRouter();
  const t = useTheme();
  const toast = useToast();
  const s = useSettings();
  const [key, setKey] = useState('');
  const [stored, setStored] = useState<string | null>(null);
  const usage = useLive((o) => usageSummary(o), []);
  useEffect(() => {
    getApiKey().then((v) => {
      setKey(v ?? '');
      setStored(v ?? null);
    });
  }, []);
  const dirty = key.trim() !== (stored ?? '');
  const save = async () => {
    const v = key.trim() || null;
    await setApiKey(v);
    setStored(v);
    toast.show({ message: v ? 'API key saved on this phone' : 'API key removed', icon: 'check' });
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

      <Card icon="sparkle" iconTone="accent" title="Models">
        <SwitchField label="Smart routing" hint="Everyday messages use the fast model; plans, several requests at once, or a failed step go to the smart one." value={s.aiRouting} onChange={(v) => s.set('aiRouting', v)} />
        <Text variant="labelCaps" color="secondary" style={{ textTransform: 'uppercase' }}>
          {s.aiRouting ? 'Harder questions' : 'Every message'}
        </Text>
        <ChipRow>
          {SMART.map((m) => (
            <FilterChip key={m.id} label={m.label} selected={s.aiModel === m.id} onPress={() => s.set('aiModel', m.id)} />
          ))}
        </ChipRow>
        {s.aiRouting ? (
          <>
            <Text variant="labelCaps" color="secondary" style={{ textTransform: 'uppercase' }}>
              Everyday & memory
            </Text>
            <ChipRow>
              {FAST.map((m) => (
                <FilterChip key={m.id} label={m.label} selected={s.aiFastModel === m.id} onPress={() => s.set('aiFastModel', m.id)} />
              ))}
            </ChipRow>
          </>
        ) : null}
        <TextField label="Custom smart model id" value={s.aiModel} onChange={(v) => s.set('aiModel', v)} placeholder="claude-…" autoCapitalize="none" autoCorrect={false} />
      </Card>

      <Card icon="chart" tint="memory" title="Usage this month" meta={`${usage.calls} call${usage.calls === 1 ? '' : 's'}`}>
        <StatTrio
          stats={[
            { label: 'Tokens in', value: k(usage.input) },
            { label: 'Tokens out', value: k(usage.output) },
            { label: 'Calls', value: String(usage.calls) },
          ]}
        />
        {usage.daily.some((d) => d.tokens > 0) ? <Sparkline values={usage.daily.map((d) => d.tokens)} color={t.tints.memory.ink} accessibilityLabel="Tokens per day, last 14 days" /> : null}
        <View style={{ gap: 6 }}>
          {usage.byModel.map((m) => (
            <View key={m.model} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text variant="label">{MODEL_NAME[m.model] ?? m.model}</Text>
              <Text variant="label" color="secondary">
                {m.calls} calls · {k(m.input + m.output)} tokens
              </Text>
            </View>
          ))}
          {usage.calls === 0 ? (
            <Text variant="caption" color="secondary">
              Nothing yet this month. Costs are billed by Anthropic to your API account.
            </Text>
          ) : null}
        </View>
      </Card>

      <Card icon="info" title="What it can do">
        <Text variant="caption" color="secondary">
          Log what you did (“did the car service, 6,400 at Hyundai”), mark chores done, split and settle money, remember things you tell it, plan trips, answer questions from your records. Money and people ask first; everything else can be undone.
        </Text>
      </Card>
    </Screen>
  );
}
