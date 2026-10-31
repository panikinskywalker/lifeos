import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { format } from 'date-fns';
import { brainSettings, exportBrain, setBrainSettings, type Learned, type SentEntry } from '@core/brain';
import { BRAIN_MODELS } from '@core/ai/brainModel';
import { PROVIDER_PRESETS } from '@core/ai/providers';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, ChipRow, Screen, FilterChip, IconButton, NumberField, ProgressBar, Section, SwitchField, Text, TextField, useToast } from '@ui/kit';
import { getProviderKey, setProviderKey } from '../../src/platform/keys';
import { runBrainPass } from '../../src/platform/brain';

const k = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
const NOTES: Record<string, string> = { 'nothing new': 'Nothing new since the last pass, so Claude was not asked', 'no key': 'No Claude key: filed in LifeOS’s own words', 'over budget': 'Over today’s budget: filed in LifeOS’s own words', error: 'Claude didn’t answer: filed in LifeOS’s own words', off: 'The brain is off' };

/**
 * You › Agent › Brain (docs/MODEL.md layer 8): the Claude key, the model, the
 * daily budget, the Sent to Claude log and what it has learned. A first pass
 * from the kit until NR-Brain-Agent (docs/design/BRAIN-BRIEF.md).
 */
export default function BrainSettingsRoute() {
  const router = useRouter();
  const os = useOS();
  const t = useTheme();
  const toast = useToast();
  const s = useLive((o) => brainSettings(o), []);
  const used = useLive((o) => o.brain.sent.tokensToday(Date.now()), []);
  const sent = useLive((o) => o.brain.sent.recent(20), []);
  const learned = useLive((o) => o.brain.learned.all({ limit: 200 }), []);
  const skills = useLive((o) => o.brain.skills.all(), []);
  const [key, setKey] = useState('');
  const [stored, setStored] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    getProviderKey('claude').then((v) => {
      setKey(v ?? '');
      setStored(v ?? null);
    });
  }, []);
  const saveKey = async () => {
    const v = key.trim() || null;
    await setProviderKey('claude', v);
    setStored(v);
    toast.show({ message: v ? 'Claude key saved on this phone' : 'Claude key removed', icon: 'check' });
  };
  const runNow = async () => {
    setRunning(true);
    try {
      const r = await runBrainPass(os, 'manual', 'you pressed Run a pass now');
      toast.show({ message: r.filed.length ? `${r.filed.length} nudge${r.filed.length === 1 ? '' : 's'} in To check${r.note ? ` · ${NOTES[r.note]}` : ''}` : r.note ? NOTES[r.note]! : 'Nothing new', icon: 'sparkle' });
    } finally {
      setRunning(false);
    }
  };
  const copy = async () => {
    await Clipboard.setStringAsync(exportBrain(os));
    toast.show({ message: 'Skills and what it learned copied as Markdown', icon: 'check' });
  };

  return (
    <Screen title="Brain" subtitle="Claude, the budget, what left and what it learned" onBack={() => (router.canGoBack() ? router.back() : router.replace('/settings/ai' as never))}>
      <Card icon="brain" tint="memory" title="LifeOS comes to you first">
        <Text variant="body" color="secondary">
          Twice a day LifeOS looks through Home, Upkeep, People and Turf for what needs you, sends Claude the short list (records only, never a message, mail or photo) and files what it says in To check and the Morning brief. It never sends, pays or orders on its own.
        </Text>
        <SwitchField label="Morning and evening passes" hint={`From ${s.morning} and from ${s.evening}, when Android lets the app run, and when you open it`} value={s.on} onChange={(on) => setBrainSettings(os, { on })} />
        <Button title={running ? 'Running…' : 'Run a pass now'} icon="refresh" size="sm" variant="secondary" disabled={running || !s.on} onPress={() => void runNow()} />
      </Card>

      <Card icon="key" tint="memory" title="Claude" meta={stored ? 'Key saved' : 'No key'}>
        <TextField label="API key" value={key} onChange={setKey} placeholder="sk-ant-…" autoCapitalize="none" autoCorrect={false} secureTextEntry hint="The same key as Claude under Providers; kept in the phone’s secure store" />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={key.trim() === (stored ?? '') && stored ? 'Saved' : 'Save key'} icon="check" size="sm" disabled={key.trim() === (stored ?? '')} onPress={() => void saveKey()} style={{ flex: 1 }} />
          <Button title="Get a key" icon="link" size="sm" variant="secondary" onPress={() => void Linking.openURL(PROVIDER_PRESETS.claude.keyUrl!)} style={{ flex: 1 }} />
        </View>
        <ChipRow>
          {BRAIN_MODELS.map((m) => (
            <FilterChip key={m.id} label={m.label} selected={s.model === m.id} onPress={() => setBrainSettings(os, { model: m.id })} />
          ))}
        </ChipRow>
      </Card>

      <Card icon="gauge" tint="memory" title="Daily budget" meta={`${k(used)} of ${k(s.budget)} today`}>
        <ProgressBar value={Math.min(1, used / Math.max(1, s.budget))} color={used >= s.budget ? t.c.alert.coral : t.c.accent.mustard} accessibilityLabel={`${k(used)} of ${k(s.budget)} tokens used today`} />
        <NumberField label="Tokens a day" value={s.budget} onChange={(v) => v && setBrainSettings(os, { budget: v })} hint="Checked before each pass; over it, nudges are filed in LifeOS’s own words. Cached tokens count a tenth." />
      </Card>

      <Section title="Sent to Claude" meta={sent.length ? `last ${sent.length}` : undefined}>
        {sent.length ? sent.map((e) => <SentRow key={e.id} e={e} />) : <Text variant="caption" color="secondary">Nothing has left the phone yet.</Text>}
      </Section>

      <Section title="What it has learned" action="Copy as Markdown" onAction={() => void copy()}>
        {learned.length ? learned.map((l) => <LearnedRow key={l.key} l={l} onForget={() => os.brain.learned.forget(l.key)} />) : <Text variant="caption" color="secondary">Nothing yet. Answers are kept here so the same question never costs a call twice.</Text>}
      </Section>

      <Section title="Skills" meta={`${skills.length}`}>
        {skills.map((x) => (
          <View key={x.id} style={{ backgroundColor: t.c.bg.tile, borderRadius: 16, padding: 14, gap: 4 }}>
            <Text variant="label">{`${x.module} / ${x.name}`}</Text>
            <Text variant="caption" color="secondary">{x.body}</Text>
            <Text variant="labelMicro" color="tertiary" style={{ textTransform: 'uppercase' }}>{x.source === 'code' ? 'Built in' : x.source === 'claude' ? 'Learned from Claude' : 'Yours'}</Text>
          </View>
        ))}
      </Section>
    </Screen>
  );
}

function SentRow({ e }: { e: SentEntry }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={{ backgroundColor: t.c.bg.tile, borderRadius: 16, padding: 14, gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Text variant="label" style={{ flex: 1 }}>{`${format(e.at, 'EEE d MMM, h:mm a')} · ${e.why}`}</Text>
        <Text variant="caption" color={e.outcome === 'ok' ? 'secondary' : t.c.alert.coral}>{e.outcome === 'ok' ? `${e.records} record${e.records === 1 ? '' : 's'}` : 'Failed'}</Text>
      </View>
      <Text variant="caption" color="secondary">{`${e.model} · ${k(e.input)} in · ${k(e.output)} out · ${k(e.cacheRead)} from cache`}</Text>
      {e.error ? <Text variant="caption" color={t.c.alert.coral}>{e.error}</Text> : null}
      {open ? e.lines.map((l, i) => <Text key={i} variant="caption" color="tertiary">{l}</Text>) : null}
    </Pressable>
  );
}

function LearnedRow({ l, onForget }: { l: Learned; onForget: () => void }) {
  const t = useTheme();
  const v = Array.isArray(l.value) ? (l.value as string[]).join(' · ') : typeof l.value === 'string' ? l.value : JSON.stringify(l.value);
  const what = l.kind === 'not-this' ? 'Not this' : l.kind === 'fact' ? 'Fact' : 'Answer';
  return (
    <View style={{ backgroundColor: t.c.bg.tile, borderRadius: 16, paddingLeft: 14, paddingVertical: 8, paddingRight: 4, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="label" numberOfLines={3}>{v}</Text>
        <Text variant="caption" color="tertiary" numberOfLines={1}>{`${what} · ${l.module} · ${l.key}`}</Text>
      </View>
      <IconButton icon="x" size={36} accessibilityLabel={`Forget ${v}`} onPress={onForget} />
    </View>
  );
}
