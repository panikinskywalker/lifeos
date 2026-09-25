import { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { Assistant, type AssistantTurn } from '@core/ai/assistant';
import type { Fact } from '@core/repo/factRepo';
import { useOS, useSettings } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ChatBubble, Chip, Composer, Icon, IconButton, ScreenHeader, Text, useBottomBarInset, useToast } from '@ui/kit';
import { ConfirmCard, ReplyCardView } from '@ui/components/ReplyCard';
import { buildAgentFromSettings, type AgentProviders } from '../../src/platform/agentProvider';
import { listen } from '../../src/platform/voice';

/** PRODUCT §7 — the sentences Talk must handle, as starting points. */
const PROMPTS = ['Did the car service today, 6,400 at Hyundai', 'Recharged Jio 719 for 84 days', 'Did laundry', 'Dinner was 3,600, split with Arjun and Priya', 'Who owes me money?', 'What’s overdue?', 'Remember the landlord is Suresh, rent due on the 5th', 'How much did I spend on food this month?'];

/** Claude API failures in plain words. */
function friendlyError(msg: string): string {
  const who = /^(\w+)[ :]/.exec(msg)?.[1];
  const name = who && !/^(chain|network|request)$/i.test(who) ? who.charAt(0).toUpperCase() + who.slice(1) : 'The model';
  if (/\b401\b|authentication|invalid x-api-key|API key is invalid|no API key/i.test(msg)) return `${name} rejected the API key. Check it in You › Agent.`;
  if (/\b413\b|request too large|tokens per minute|\bTPM\b/i.test(msg)) return `That was more than ${name}’s free tier takes in a minute. Try again shortly, or add a Gemini key in You › Agent so Talk can switch.`;
  if (/\b429\b|rate.?limit|too many requests/i.test(msg)) return `${name}’s free tier is busy for the next minute. Try again shortly, or add a second provider in You › Agent so Talk can switch.`;
  if (/\bcap\b|monthly/i.test(msg) && /usage|cap/i.test(msg)) return `${name} hit the monthly cap you set in You › Agent.`;
  if (/\b529\b|overloaded/i.test(msg)) return `${name} is busy right now. Try again in a moment.`;
  if (/credit|billing|\b402\b/i.test(msg)) return 'Your Anthropic account is out of credit. Top up at console.anthropic.com › Billing.';
  if (/network|fetch|Failed to fetch|timed? ?out/i.test(msg)) return `Couldn’t reach ${name} — are you online?`;
  return `Something went wrong: ${msg.slice(0, 160)}`;
}

type Item =
  | { kind: 'turn'; id: string; turn: AssistantTurn }
  | { kind: 'facts'; id: string; facts: Fact[] }
  | { kind: 'confirm'; id: string; summary: string; answer?: boolean; resolve: (ok: boolean) => void };

/**
 * Talk (M3, Stitch agent thread): say what happened; the agent files it.
 * Replies come as cards you can open or undo; money and people wait for an
 * inline OK. Voice uses the phone's speech recogniser.
 */
export default function TalkTab() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const barInset = useBottomBarInset();
  const params = useLocalSearchParams<{ share?: string; file?: string; fileName?: string; mime?: string }>();
  const smartModel = useSettings((s) => s.aiModel);
  const routing = useSettings((s) => s.aiRouting);
  const chain = useSettings((s) => s.aiChain);
  const [agent, setAgent] = useState<AgentProviders | null | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [thinking, setThinking] = useState('Thinking…');
  const [session, setSession] = useState(0);
  const scroll = useRef<ScrollView>(null);

  // Rebuild the provider chain when settings change or Talk comes back into focus (a key may have been added).
  const [focusTick, setFocusTick] = useState(0);
  useEffect(() => {
    let alive = true;
    buildAgentFromSettings(os, {
      onFallback: (from, to) => alive && setNotice(`${from} unavailable — using ${to}`),
      onModelChanged: (p, model) => alive && setNotice(`${p}: its model was retired — now using ${model}`),
      onCooldown: (p, until) => alive && setNotice(`${p} is rate-limited until ${new Date(until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`),
    }).then((a) => alive && setAgent(a));
    return () => {
      alive = false;
    };
  }, [os, chain, routing, smartModel, focusTick]);
  const [shared, setShared] = useState<{ uri: string; name: string; mime: string } | null>(null);
  useEffect(() => {
    if (params.share) setText(String(params.share));
    if (params.file) setShared({ uri: String(params.file), name: String(params.fileName ?? 'shared file'), mime: String(params.mime ?? '') });
  }, [params.share, params.file]); // eslint-disable-line react-hooks/exhaustive-deps

  const assistant = useMemo(() => {
    if (agent === undefined) return null;
    const add = (it: Item) => setItems((xs) => [...xs, it]);
    return new Assistant(os, {
      provider: agent?.main ?? null,
      smartProvider: agent?.smart,
      factProvider: agent?.small,
      metered: true,
      onTurn: (turn) => {
        add({ kind: 'turn', id: turn.id, turn });
        if (turn.card?.kind === 'new') router.push(`/entity/${turn.card.type}/new` as never);
      },
      onFacts: (facts) => add({ kind: 'facts', id: `f${Date.now()}`, facts }),
      onRoute: (r) => setThinking(r.tier === 'smart' ? `Thinking harder (${r.reason})…` : 'Thinking…'),
      confirm: (_tool, _input, summary) =>
        new Promise<boolean>((resolve) => {
          const id = `c${Date.now()}`;
          add({ kind: 'confirm', id, summary, resolve: (ok) => { setItems((xs) => xs.map((x) => (x.id === id && x.kind === 'confirm' ? { ...x, answer: ok } : x))); resolve(ok); } });
        }),
    });
  }, [agent, os, session]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (msg?: string) => {
    let m = (msg ?? text).trim();
    if (!m && shared) m = 'I shared this — file it where it belongs.';
    if (!m || !assistant || busy) return;
    if (shared) {
      m += `\n[Shared file: ${shared.name}${shared.mime ? ` (${shared.mime})` : ''} — uri ${shared.uri}. Use attach_file to put it on the right record.]`;
      setShared(null);
    }
    setText('');
    setBusy(true);
    try {
      await assistant.send(m);
    } catch (e) {
      const turn: AssistantTurn = { id: String(Date.now()), role: 'assistant', text: friendlyError((e as Error).message), createdAt: Date.now() };
      setItems((xs) => [...xs, { kind: 'turn', id: turn.id, turn }]);
    } finally {
      setBusy(false);
      setThinking('Thinking…');
    }
  };
  const speak = async () => {
    const heard = await listen();
    if (heard) void send(heard);
    else toast.show({ message: Platform.OS === 'web' ? 'Voice isn’t available in this browser' : 'Didn’t catch that', icon: 'mic' });
  };

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
  }, [items.length, busy]);

  // Tapping the raised mic while already on Talk starts listening.
  const navigation = useNavigation();
  const speakRef = useRef(speak);
  speakRef.current = speak;
  useEffect(() => {
    const off = navigation.addListener('tabPress' as never, () => {
      if (navigation.isFocused()) void speakRef.current();
    });
    const offFocus = navigation.addListener('focus' as never, () => setFocusTick((n) => n + 1));
    return () => {
      off();
      offFocus();
    };
  }, [navigation]);

  if (agent === undefined) return <View style={{ flex: 1, backgroundColor: t.c.bg.ground }} />;

  const open = (id: string, type?: string) => {
    const ty = type ?? os.entities.get(id)?.type;
    if (ty) router.push(`/entity/${ty}/${id}` as never);
  };
  const pendingConfirm = items.some((x) => x.kind === 'confirm' && x.answer === undefined);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: 8 }}>
        <ScreenHeader
          title="Talk"
          subtitle={agent ? `On the phone first · then ${agent.active.map((c) => c.kind === 'claude' ? 'Claude' : c.kind.charAt(0).toUpperCase() + c.kind.slice(1)).join(' → ')}` : 'On the phone · no model yet'}
          right={
            <IconButton
              icon="plus"
              accessibilityLabel="New conversation"
              filled
              onPress={() => {
                setItems([]);
                setSession((n) => n + 1);
              }}
            />
          }
        />
      </View>
      {!agent ? (
        <View style={{ marginHorizontal: t.layout.gutter, marginBottom: 4 }}>
          <Chip icon="key" tone="accent" small label="Offline for everyday things · add a free key for more" onPress={() => router.push('/settings/ai')} />
        </View>
      ) : notice ? (
        <View style={{ marginHorizontal: t.layout.gutter, marginBottom: 4 }}>
          <Chip icon="info" tone="muted" small label={notice} onPress={() => setNotice(null)} />
        </View>
      ) : null}
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: t.layout.gutter, paddingVertical: 12, gap: 14 }} keyboardShouldPersistTaps="handled">
        {items.length === 0 ? (
          <View style={{ gap: 12 }}>
            <View style={{ backgroundColor: t.c.bg.container, borderRadius: 24, padding: 18, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.c.accent.mustard }} />
                <Text variant="labelCaps" style={{ textTransform: 'uppercase' }}>LifeOS agent</Text>
              </View>
              <Text variant="heading">Say it like you’d text a friend.</Text>
              <Text variant="body" color="secondary">
                “Did the car service, 6,400 at Hyundai” files the service, the expense and the next due date. Money and people wait for your OK; everything else has Undo.
              </Text>
            </View>
            <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase', paddingHorizontal: 4 }}>Try</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {PROMPTS.map((p) => (
                <Chip key={p} label={p} onPress={() => void send(p)} />
              ))}
            </View>
          </View>
        ) : null}
        {items.map((it) => {
          if (it.kind === 'facts')
            return (
              <Chip key={it.id} icon="sparkle" tone="muted" small label={`Remembered: ${it.facts.map((f) => f.text).join(' · ')}`} onPress={() => router.push('/memory')} />
            );
          if (it.kind === 'confirm')
            return it.answer === undefined ? (
              <ConfirmCard key={it.id} summary={it.summary} onAnswer={it.resolve} />
            ) : (
              <Text key={it.id} variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>
                {it.answer ? '✓ Confirmed' : '✕ Not now'} · {it.summary}
              </Text>
            );
          const turn = it.turn;
          if (turn.role === 'user') return <ChatBubble key={it.id} text={turn.text} />;
          if (turn.role === 'tool') {
            if (turn.isError) return turn.toolName === 'resolve_entity' ? null : (
              <Text key={it.id} variant="caption" color="secondary" style={{ paddingHorizontal: 4 }}>
                Couldn’t {turn.text.toLowerCase()}
              </Text>
            );
            if (!turn.card && !turn.undo) return null; // lookups: the answer says what they found
            return <ReplyCardView key={it.id} label={turn.text} card={turn.card} onOpen={open} onNew={(ty) => router.push(`/entity/${ty}/new` as never)} onUndo={turn.undo} />;
          }
          return (
            <View key={it.id} style={{ gap: 6, marginRight: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.c.accent.mustard }} />
                <Text variant="labelMicro" color="secondary" style={{ textTransform: 'uppercase' }}>LifeOS · {format(turn.createdAt, 'HH:mm')}</Text>
              </View>
              <View style={{ backgroundColor: t.c.bg.container, borderRadius: 24, borderTopLeftRadius: 8, padding: 14 }}>
                <Text variant="body" selectable style={{ lineHeight: 22 }}>
                  {turn.text}
                </Text>
              </View>
            </View>
          );
        })}
        {busy && !pendingConfirm ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
            <Icon name="sparkle" size={14} color={t.c.accent.gold} />
            <Text variant="caption" color="secondary">
              {thinking}
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: t.layout.gutter, paddingBottom: barInset + 32, paddingTop: 8 }}>
        {shared ? (
          <View style={{ flexDirection: 'row', marginBottom: 8 }}>
            <Chip label={`Attached: ${shared.name}`} icon="paperclip" onPress={() => setShared(null)} />
          </View>
        ) : null}
        <Composer value={text} onChange={setText} onSend={() => void send()} onMic={() => void speak()} disabled={busy} />
      </View>
    </KeyboardAvoidingView>
  );
}
