import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Assistant, type AssistantTurn } from '@core/ai/assistant';
import { createClaudeProvider } from '@core/ai/provider';
import type { AiToolDef } from '@core/registry/types';
import { useOS, useSettings } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { AgentCard, ChatBubble, Chip, Composer, EmptyState, Icon, IconButton, Screen, ScreenHeader, Text, useBottomBarInset } from '@ui/kit';
import { getApiKey } from '../../src/platform/boot';

const SUGGESTIONS = ['How much did I spend this month?', 'Spent 450 on lunch at Blue Tokai', 'What\'s due today?', 'Add a task: renew car insurance, due next Friday', 'Which subscriptions renew this week?', 'Remind me every Monday at 9am to review budgets', 'Who haven\'t I talked to in a while?'];

export default function TalkTab() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const barInset = useBottomBarInset();
  const model = useSettings((s) => s.aiModel);
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const assistant = useRef<Assistant | null>(null);

  useEffect(() => {
    getApiKey().then(setKey);
  }, []);

  useEffect(() => {
    if (!key) return;
    assistant.current = new Assistant(os, {
      provider: createClaudeProvider({ apiKey: key, model }),
      onTurn: (turn) => setTurns((ts) => [...ts, turn]),
      confirm: (tool: AiToolDef, input) =>
        new Promise((resolve) => {
          if (Platform.OS === 'web') return resolve(true);
          const summary = describeMutation(tool, input);
          Alert.alert('Assistant wants to…', summary, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Allow', onPress: () => resolve(true) },
          ]);
        }),
    });
  }, [key, model, os]);

  const send = async (msg?: string) => {
    const m = (msg ?? text).trim();
    if (!m || !assistant.current || busy) return;
    setText('');
    setBusy(true);
    try {
      await assistant.current.send(m);
    } catch (e) {
      setTurns((ts) => [...ts, { id: String(Date.now()), role: 'assistant', text: `Something went wrong: ${(e as Error).message}`, createdAt: Date.now() }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  }, [turns.length, busy]);

  if (key === undefined) return <View style={{ flex: 1, backgroundColor: t.c.bg.ground }} />;
  if (!key)
    return (
      <Screen tab title="Talk" subtitle="Tell me what happened">
        <EmptyState icon="mic" tint="memory" title="Add your Claude key" line="Say what happened in plain words and the agent files it. It runs on your own API key; only what each answer needs leaves your phone." action="Add API key" actionIcon="key" onAction={() => router.push('/settings/ai')} />
      </Screen>
    );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: 8 }}>
        <ScreenHeader
          title="Talk"
          subtitle="Tell me what happened"
          right={
            <IconButton
              icon="history"
              accessibilityLabel="New conversation"
              filled
              onPress={() => {
                setTurns([]);
                assistant.current?.reset();
                assistant.current = new Assistant(os, { provider: createClaudeProvider({ apiKey: key, model }), onTurn: (turn) => setTurns((ts) => [...ts, turn]) });
              }}
            />
          }
        />
      </View>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: t.layout.gutter, paddingVertical: 12, gap: 12 }} keyboardShouldPersistTaps="handled">
        {turns.length === 0 ? (
          <View style={{ gap: 10 }}>
            <Text variant="label" color="secondary">
              Try saying
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {SUGGESTIONS.map((s) => (
                <Chip key={s} label={s} onPress={() => void send(s)} />
              ))}
            </View>
          </View>
        ) : null}
        {turns.map((turn) => (
          <Turn key={turn.id} turn={turn} />
        ))}
        {busy ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icon name="sparkle" size={14} color={t.tints.memory.ink} />
            <Text variant="caption" color="secondary">
              Thinking…
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: t.layout.gutter, paddingBottom: barInset + 32, paddingTop: 8 }}>
        <Composer value={text} onChange={setText} onSend={() => void send()} disabled={busy} />
      </View>
    </KeyboardAvoidingView>
  );
}

/** A turn in the thread: your words as a bubble; the agent's as a card; what it filed as a record card. */
function Turn({ turn }: { turn: AssistantTurn }) {
  const t = useTheme();
  const router = useRouter();
  if (turn.role === 'user') return <ChatBubble text={turn.text} />;
  if (turn.role === 'tool') {
    const res = turn.toolResult as { id?: string; type?: string; title?: string } | undefined;
    const target = res && typeof res === 'object' && res.id && res.type ? res : null;
    return <AgentCard kind="record" icon="check" tint="upkeep" title={turn.text} filedUnder={target?.title ?? undefined} onPress={target ? () => router.push(`/entity/${target.type}/${target.id}`) : undefined} />;
  }
  return (
    <View style={{ backgroundColor: t.c.bg.tile, borderRadius: t.radius.card, padding: 14, marginRight: 28 }}>
      <Text variant="body" selectable style={{ lineHeight: 21 }}>
        {turn.text}
      </Text>
    </View>
  );
}

function describeMutation(tool: AiToolDef, input: unknown): string {
  const i = input as Record<string, unknown>;
  switch (tool.name) {
    case 'create_entity':
      return `Create ${i.type}: ${JSON.stringify(i.data)}`;
    case 'update_entity':
      return `Update record ${i.id}: ${JSON.stringify({ ...(i.data as object), status: i.status, title: i.title })}`;
    case 'delete_entity':
      return `Delete record ${i.id}`;
    case 'create_reminder':
      return `Reminder "${i.title}" at ${i.dueAt}${i.rrule ? ` (${i.rrule})` : ''}`;
    case 'create_automation':
      return `Automation "${i.name}"`;
    case 'link_entities':
      return `Link two records as "${i.kind}"`;
    default:
      return `${tool.name}: ${JSON.stringify(input).slice(0, 200)}`;
  }
}
