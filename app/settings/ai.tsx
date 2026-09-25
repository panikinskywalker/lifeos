import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PROVIDER_PRESETS, type ProviderConfig, type ProviderKind } from '@core/ai/providers';
import { providerTokensThisMonth, usageSummary } from '@core/ai/routing';
import { useLive, useSettings } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, Chip, ChipRow, FilterChip, IconButton, NumberField, ProgressBar, Screen, Section, Sparkline, StatTrio, SwitchField, Text, TextField, useToast } from '@ui/kit';
import { getProviderKey, setProviderKey } from '../../src/platform/boot';

const ALL: ProviderKind[] = ['groq', 'gemini', 'openrouter', 'ollama', 'claude', 'custom'];
const SMART = [
  { id: 'claude-sonnet-5', label: 'Sonnet 5' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
];
const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
const label = (id: string) => PROVIDER_PRESETS[id as ProviderKind]?.label ?? id;

/**
 * You › Agent (SCOPE v2 A10/B5): how Talk picks a model — on the phone
 * first, then your provider chain in order — with each provider's key,
 * model, monthly cap and usage, plus Claude for harder asks.
 */
export default function AiSettingsRoute() {
  const router = useRouter();
  const t = useTheme();
  const s = useSettings();
  const usage = useLive((o) => usageSummary(o), []);
  // Every known provider appears once: the chain first (in its order), then the rest switched off.
  const chain: ProviderConfig[] = [...s.aiChain, ...ALL.filter((kind) => !s.aiChain.some((c) => c.kind === kind)).map((kind) => ({ kind, enabled: false }))];
  const save = (next: ProviderConfig[]) => s.set('aiChain', next);
  const update = (kind: ProviderKind, patch: Partial<ProviderConfig>) => save(chain.map((c) => (c.kind === kind ? { ...c, ...patch } : c)));
  const move = (kind: ProviderKind, dir: -1 | 1) => {
    const i = chain.findIndex((c) => c.kind === kind);
    const j = i + dir;
    if (j < 0 || j >= chain.length) return;
    const next = [...chain];
    [next[i], next[j]] = [next[j]!, next[i]!];
    save(next);
  };
  const on = chain.filter((c) => c.enabled !== false);
  return (
    <Screen title="Agent" subtitle="On the phone first, then your providers" onBack={() => (router.canGoBack() ? router.back() : router.replace('/you'))}>
      <Card icon="sparkle" iconTone="accent" title="How Talk answers">
        <Text variant="body" color="secondary">
          Everyday sentences — “did laundry”, “spent 450 on lunch”, “Priya paid me back 2,600”, “remind me to …” — are understood on the phone: no network, no cost. Anything else goes to the first provider below that has a key; if it’s rate-limited, down or at its cap, the next one is tried.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <Chip label="On the phone" icon="check" tone="ok" small />
          {on.map((c) => (
            <Chip key={c.kind} label={label(c.kind)} small />
          ))}
        </View>
      </Card>

      <Section title="Providers" meta="in order">
        <View style={{ gap: 12 }}>
          {chain.map((c, i) => (
            <ProviderCard key={c.kind} cfg={c} first={i === 0} last={i === chain.length - 1} onChange={(p) => update(c.kind, p)} onMove={(d) => move(c.kind, d)} cap={s.aiMonthlyCaps[c.kind]} onCap={(v) => s.set('aiMonthlyCaps', { ...s.aiMonthlyCaps, [c.kind]: v ?? 0 })} />
          ))}
        </View>
      </Section>

      <Card icon="trend" tint="memory" title="Harder asks">
        <SwitchField label="Use Claude for plans and multi-step asks" hint="Needs a Claude key. Everyday messages still go through the chain above." value={s.aiRouting} onChange={(v) => s.set('aiRouting', v)} />
        {s.aiRouting ? (
          <ChipRow>
            {SMART.map((m) => (
              <FilterChip key={m.id} label={m.label} selected={s.aiModel === m.id} onPress={() => s.set('aiModel', m.id)} />
            ))}
          </ChipRow>
        ) : null}
      </Card>

      <Card icon="chart" tint="memory" title="Usage this month" meta={`${usage.calls} call${usage.calls === 1 ? '' : 's'}`}>
        <StatTrio stats={[{ label: 'Tokens in', value: k(usage.input) }, { label: 'Tokens out', value: k(usage.output) }, { label: 'Calls', value: String(usage.calls) }]} />
        {usage.daily.some((d) => d.tokens > 0) ? <Sparkline values={usage.daily.map((d) => d.tokens)} color={t.tints.memory.ink} accessibilityLabel="Tokens per day, last 14 days" /> : null}
        {usage.byProvider.map((p) => (
          <View key={p.provider} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="label">{label(p.provider)}</Text>
            <Text variant="label" color="secondary">
              {p.calls} calls · {k(p.input + p.output)} tokens
            </Text>
          </View>
        ))}
        {usage.calls === 0 ? <Text variant="caption" color="secondary">Nothing yet this month — everything so far was handled on the phone.</Text> : null}
      </Card>
    </Screen>
  );
}

function ProviderCard({ cfg, first, last, onChange, onMove, cap, onCap }: { cfg: ProviderConfig; first: boolean; last: boolean; onChange: (p: Partial<ProviderConfig>) => void; onMove: (d: -1 | 1) => void; cap?: number; onCap: (v: number | undefined) => void }) {
  const t = useTheme();
  const toast = useToast();
  const preset = PROVIDER_PRESETS[cfg.kind];
  const [key, setKey] = useState('');
  const [stored, setStored] = useState<string | null>(null);
  const used = useLive((o) => providerTokensThisMonth(o, cfg.kind), [cfg.kind]);
  useEffect(() => {
    if (preset.needsKey) getProviderKey(cfg.kind).then((v) => { setKey(v ?? ''); setStored(v ?? null); });
  }, [cfg.kind, preset.needsKey]);
  const enabled = cfg.enabled !== false;
  const ready = enabled && (!preset.needsKey || !!stored) && !!(cfg.baseUrl || preset.baseUrl);
  const saveKey = async () => {
    const v = key.trim() || null;
    await setProviderKey(cfg.kind, v);
    setStored(v);
    toast.show({ message: v ? `${preset.label} key saved on this phone` : `${preset.label} key removed`, icon: 'check' });
  };
  return (
    <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.tile, padding: 16, gap: 12, opacity: enabled ? 1 : 0.75 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading">{preset.label}</Text>
          <Text variant="caption" color={ready ? t.c.ok.sageText : 'secondary'}>
            {!enabled ? 'Off' : ready ? 'Ready' : preset.needsKey ? 'Needs a key' : 'Needs an address'}
          </Text>
        </View>
        <IconButton icon="chevron-up" accessibilityLabel={`Move ${preset.label} up`} size={36} disabled={first} onPress={() => onMove(-1)} />
        <IconButton icon="chevron-down" accessibilityLabel={`Move ${preset.label} down`} size={36} disabled={last} onPress={() => onMove(1)} />
      </View>
      <SwitchField label="Use this provider" hint={preset.note} value={enabled} onChange={(v) => onChange({ enabled: v })} />
      {enabled ? (
        <>
          {preset.needsKey ? (
            <View style={{ gap: 8 }}>
              <TextField label="API key" value={key} onChange={setKey} placeholder="Paste your key" autoCapitalize="none" autoCorrect={false} secureTextEntry />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title={key.trim() === (stored ?? '') && stored ? 'Saved' : 'Save key'} icon="check" size="sm" disabled={key.trim() === (stored ?? '')} onPress={() => void saveKey()} style={{ flex: 1 }} />
                {preset.keyUrl ? <Button title="Get a key" icon="link" size="sm" variant="secondary" onPress={() => void Linking.openURL(preset.keyUrl!)} style={{ flex: 1 }} /> : null}
              </View>
            </View>
          ) : null}
          <TextField label="Model" value={cfg.model ?? ''} onChange={(v) => onChange({ model: v.trim() || undefined })} placeholder={preset.defaultModel || 'model id'} autoCapitalize="none" autoCorrect={false} />
          {cfg.kind === 'ollama' || cfg.kind === 'custom' ? <TextField label="Address" value={cfg.baseUrl ?? ''} onChange={(v) => onChange({ baseUrl: v.trim() || undefined })} placeholder={preset.baseUrl || 'http://…/v1'} autoCapitalize="none" autoCorrect={false} hint={cfg.kind === 'ollama' ? 'Your Mac’s Tailscale address, port 11434, ending in /v1' : undefined} /> : null}
          <NumberField label="Monthly token cap" value={cap || undefined} onChange={(v) => onCap(v)} placeholder="No cap" hint="Stops using this provider for the month once reached" />
          {cap ? <ProgressBar value={used / cap} color={used >= cap ? t.c.alert.coral : t.c.accent.gold} accessibilityLabel={`${k(used)} of ${k(cap)} tokens used`} /> : null}
          <Text variant="caption" color="secondary">
            {k(used)} tokens this month{cap ? ` of ${k(cap)}` : ''}
          </Text>
        </>
      ) : null}
    </View>
  );
}
