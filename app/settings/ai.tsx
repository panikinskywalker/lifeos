import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import { PROVIDER_PRESETS, type ProviderConfig, type ProviderKind } from '@core/ai/providers';
import { listModels, pickModel } from '@core/ai/openaiCompat';
import { isLocalProvider } from '@core/ai/provider';
import { normalizeOllamaUrl, testOllama, type MacCheck } from '@core/ai/ollama';
import { providerTokensThisMonth, providerTokensToday, usageSummary } from '@core/ai/routing';
import { providerLimits } from '@core/ai/limits';
import { brainSettings } from '@core/brain';
import { format } from 'date-fns';
import { useOS, useLive, useSettings } from '@ui/hooks';
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
 * You › Agent (SCOPE v2 A10/B5, R12): how Talk picks a model: on the phone
 * first, then your Mac, then the cloud providers in order, with each cloud
 * provider's key, model, monthly cap and usage, plus Claude for harder asks.
 */
export default function AiSettingsRoute() {
  const router = useRouter();
  const t = useTheme();
  const s = useSettings();
  const usage = useLive((o) => usageSummary(o), []);
  const brainOn = useLive((o) => brainSettings(o).on, []);
  // Every known provider appears once: the chain first (in its order), then the rest switched off.
  const chain: ProviderConfig[] = [...s.aiChain, ...ALL.filter((kind) => !s.aiChain.some((c) => c.kind === kind)).map((kind) => ({ kind, enabled: false }))];
  const save = (next: ProviderConfig[]) => s.set('aiChain', next);
  const update = (kind: ProviderKind, patch: Partial<ProviderConfig>) => save(chain.map((c) => (c.kind === kind ? { ...c, ...patch } : c)));
  // The Mac is not in the cloud order: it always goes first (MODEL.md layer 7).
  const mac = chain.find((c) => isLocalProvider(c.kind))!;
  const cloud = chain.filter((c) => !isLocalProvider(c.kind));
  const move = (kind: ProviderKind, dir: -1 | 1) => {
    const i = cloud.findIndex((c) => c.kind === kind);
    const j = i + dir;
    if (j < 0 || j >= cloud.length) return;
    const next = [...cloud];
    [next[i], next[j]] = [next[j]!, next[i]!];
    save([mac, ...next]);
  };
  const macOn = mac.enabled !== false && !!mac.baseUrl;
  const on = cloud.filter((c) => c.enabled !== false);
  return (
    <Screen title="Agent" subtitle="On the phone first, then your Mac, then the cloud" onBack={() => (router.canGoBack() ? router.back() : router.replace('/you'))}>
      <Card icon="sparkle" iconTone="accent" title="How Talk answers">
        <Text variant="body" color="secondary">
          Everyday sentences (“did laundry”, “spent 450 on lunch”, “Priya paid me back 2,600”, “remind me to …”) are understood on the phone: no network, no cost. Anything else goes to your Mac when it is on; the cloud providers below are tried, in order, only when the Mac can’t answer or gets it wrong. Their caps and budgets count the cloud only.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <Chip label="On the phone" icon="check" tone="ok" small />
          {macOn ? <Chip label="Your Mac" icon="check" tone="ok" small /> : null}
          {on.map((c) => (
            <Chip key={c.kind} label={label(c.kind)} small />
          ))}
        </View>
      </Card>

      <Card icon="brain" tint="memory" title="Brain" meta={brainOn ? 'Morning and evening' : 'Off'}>
        <Text variant="body" color="secondary">
          What LifeOS brings you on its own: Claude judges what the code noticed, twice a day. The key, the daily budget, what was sent and what it has learned.
        </Text>
        <Button title="Open Brain" icon="chevron-right" size="sm" variant="secondary" onPress={() => router.push('/settings/brain' as never)} />
      </Card>

      <Section title="Your Mac" meta="first">
        <MacCard cfg={mac} onChange={(p) => update(mac.kind, p)} />
      </Section>

      <Section title="Cloud" meta="when the Mac can’t, in order">
        <View style={{ gap: 12 }}>
          {cloud.map((c, i) => (
            <ProviderCard key={c.kind} cfg={c} first={i === 0} last={i === cloud.length - 1} onChange={(p) => update(c.kind, p)} onMove={(d) => move(c.kind, d)} cap={s.aiMonthlyCaps[c.kind]} onCap={(v) => s.set('aiMonthlyCaps', { ...s.aiMonthlyCaps, [c.kind]: v ?? 0 })} />
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
              {p.calls} calls · {k(p.input + p.output)} tokens{isLocalProvider(p.provider) ? ' · free' : ''}
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
  const today = useLive((o) => providerTokensToday(o, cfg.kind), [cfg.kind]);
  const os = useOS();
  const rest = useLive((o) => providerLimits(o).get(cfg.kind), [cfg.kind]);
  const [models, setModels] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const loadModels = async () => {
    setLoading(true);
    try {
      const list = await listModels(cfg.baseUrl || preset.baseUrl, stored ?? undefined);
      setModels(list);
      if (!list.length) toast.show({ message: `${preset.label} returned no chat models`, icon: 'info' });
    } catch (e) {
      toast.show({ message: `Couldn’t load models: ${(e as Error).message.slice(0, 80)}`, icon: 'alert' });
    } finally {
      setLoading(false);
    }
  };
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
          <TextField label="Model" value={cfg.model ?? ''} onChange={(v) => onChange({ model: v.trim() || undefined })} placeholder={preset.defaultModel || 'model id'} autoCapitalize="none" autoCorrect={false} hint="If this model is retired, the agent switches to one the provider still offers" />
          {cfg.kind !== 'claude' && ready ? (
            models ? (
              <ChipRow>
                {[...models].sort((a, b) => (a === pickModel(models) ? -1 : b === pickModel(models) ? 1 : a.localeCompare(b))).slice(0, 14).map((m) => (
                  <FilterChip key={m} label={m === pickModel(models) ? `${m} · suggested` : m} selected={(cfg.model || preset.defaultModel) === m} onPress={() => onChange({ model: m })} />
                ))}
              </ChipRow>
            ) : (
              <Button title={loading ? 'Loading…' : 'Show available models'} icon="search" size="sm" variant="secondary" disabled={loading} onPress={() => void loadModels()} />
            )
          ) : null}
          {cfg.kind === 'custom' ? <TextField label="Address" value={cfg.baseUrl ?? ''} onChange={(v) => onChange({ baseUrl: v.trim() || undefined })} placeholder="http://…/v1" autoCapitalize="none" autoCorrect={false} /> : null}
          <NumberField label="Monthly token cap" value={cap || undefined} onChange={(v) => onCap(v)} placeholder="No cap" hint="Stops using this provider for the month once reached" />
          {cap ? <ProgressBar value={used / cap} color={used >= cap ? t.c.alert.coral : t.c.accent.gold} accessibilityLabel={`${k(used)} of ${k(cap)} tokens used`} /> : null}
          <Text variant="caption" color="secondary">
            {k(used)} tokens this month{cap ? ` of ${k(cap)}` : ''}
          </Text>
          <Text variant="caption" color="secondary">
            Today: {k(today)} tokens{preset.freeDailyTokens ? ` of about ${k(preset.freeDailyTokens)} free` : ''}
          </Text>
          {preset.freeDailyTokens ? <ProgressBar value={Math.min(1, today / preset.freeDailyTokens)} color={today >= 0.8 * preset.freeDailyTokens ? t.c.alert.coral : t.tints.memory.ink} height={6} accessibilityLabel={`${k(today)} of about ${k(preset.freeDailyTokens)} free tokens used today`} /> : null}
          {rest ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text variant="caption" color={t.c.accent.gold} style={{ flex: 1 }}>
                Resting until {format(rest.until, 'h:mm a')} · {rest.reason}. Waiting things file after that.
              </Text>
              <Chip label="Try now" icon="refresh" small onPress={() => { providerLimits(os).clear(cfg.kind); toast.show({ message: `${preset.label} will be tried again`, icon: 'refresh' }); }} />
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/** Your Mac (R12): Ollama over Tailscale, tried before any cloud provider; free, so no cap. */
function MacCard({ cfg, onChange }: { cfg: ProviderConfig; onChange: (p: Partial<ProviderConfig>) => void }) {
  const t = useTheme();
  const preset = PROVIDER_PRESETS.ollama;
  const used = useLive((o) => providerTokensThisMonth(o, 'ollama'), []);
  const [check, setCheck] = useState<MacCheck | null>(null);
  const [testing, setTesting] = useState(false);
  const enabled = cfg.enabled !== false;
  const model = cfg.model || preset.defaultModel;
  const ready = enabled && !!cfg.baseUrl;
  const test = async () => {
    setTesting(true);
    setCheck(null);
    try {
      setCheck(await testOllama(cfg.baseUrl ?? '', model));
    } finally {
      setTesting(false);
    }
  };
  return (
    <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.tile, padding: 16, gap: 12, opacity: enabled ? 1 : 0.75 }}>
      <View style={{ gap: 2 }}>
        <Text variant="heading">{preset.label}</Text>
        <Text variant="caption" color={ready ? t.c.ok.sageText : 'secondary'}>
          {!enabled ? 'Off' : ready ? `Tried first · ${model}` : 'Needs an address'}
        </Text>
      </View>
      <SwitchField label="Use the Mac" hint={preset.note} value={enabled} onChange={(v) => onChange({ enabled: v })} />
      {enabled ? (
        <>
          <TextField label="Address" value={cfg.baseUrl ?? ''} onChange={(v) => onChange({ baseUrl: v.trim() || undefined })} placeholder="100.x.y.z or your-mac.tailnet.ts.net" autoCapitalize="none" autoCorrect={false} hint={cfg.baseUrl ? `Calls ${normalizeOllamaUrl(cfg.baseUrl)}` : 'The Mac’s Tailscale IP or name; port 11434 is assumed'} />
          <TextField label="Model" value={cfg.model ?? ''} onChange={(v) => onChange({ model: v.trim() || undefined })} placeholder={preset.defaultModel} autoCapitalize="none" autoCorrect={false} hint={`Pulled on the Mac with: ollama pull ${model}`} />
          <Button title={testing ? 'Testing…' : 'Test the Mac'} icon="signal" size="sm" variant="secondary" disabled={testing || !cfg.baseUrl} onPress={() => void test()} />
          {check ? (
            <View style={{ gap: 4 }}>
              {check.lines.map((l, i) => (
                <Text key={i} variant="caption" color={i === check.lines.length - 1 ? (check.ok ? t.c.ok.sageText : t.c.alert.coral) : 'secondary'}>
                  {l}
                </Text>
              ))}
            </View>
          ) : null}
          <Text variant="caption" color="secondary">
            {k(used)} tokens this month · free, no cap
          </Text>
        </>
      ) : null}
    </View>
  );
}
