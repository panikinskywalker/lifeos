import React, { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Assistant, type AssistantTurn } from '@core/ai/assistant';
import { createClaudeProvider } from '@core/ai/provider';
import type { AiToolDef } from '@core/registry/types';
import { useOS, useSettings } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Card, Chip, Icon, IconButton, Input, Text } from '@ui/components/primitives';
import { useBottomBarInset } from '@ui/kit';
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

  if (key === undefined) return <View style={{ flex: 1, backgroundColor: t.colors.background }} />;
  if (!key)
    return (
      <View style={{ flex: 1, backgroundColor: t.colors.background, paddingTop: insets.top + 8, paddingHorizontal: 16 }}>
        <Text variant="largeTitle" style={{ marginBottom: 12 }}>
          Talk
        </Text>
        <Card style={{ gap: 12 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.colors.accents.indigo + '1A', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkles" size={28} color={t.colors.accents.indigo} />
          </View>
          <Text variant="title3">Your data, in conversation</Text>
          <Text color="secondary">
            Ask questions ("how much did I spend on food in August?"), log things in plain language ("paid 1200 for petrol"), and set up automations. It runs on Claude with your own API key; only the data needed for each answer leaves your phone.
          </Text>
          <Button title="Add API key" icon="key" onPress={() => router.push('/settings/ai')} color={t.colors.accents.indigo} />
        </Card>
      </View>
    );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.colors.background }} keyboardVerticalOffset={0}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="largeTitle" style={{ flex: 1 }}>
          Talk
        </Text>
        <IconButton icon="square.and.pencil" bg onPress={() => { setTurns([]); assistant.current?.reset(); assistant.current = new Assistant(os, { provider: createClaudeProvider({ apiKey: key, model }), onTurn: (turn) => setTurns((ts) => [...ts, turn]) }); }} />
      </View>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {turns.length === 0 ? (
          <View style={{ gap: 8 }}>
            <Text color="secondary" variant="subhead">
              Try asking
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {SUGGESTIONS.map((s) => (
                <Chip key={s} label={s} onPress={() => void send(s)} />
              ))}
            </View>
          </View>
        ) : null}
        {turns.map((turn) => (
          <Bubble key={turn.id} turn={turn} />
        ))}
        {busy ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
            <Icon name="sparkles" size={14} color={t.colors.accents.indigo} />
            <Text variant="footnote" color="secondary">
              Thinking…
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingBottom: barInset + 24, paddingTop: 8, backgroundColor: t.colors.background }}>
        <Input value={text} onChangeText={setText} placeholder="Ask or tell LifeOS anything…" onSubmitEditing={() => void send()} returnKeyType="send" blurOnSubmit={false} multiline right={<IconButton icon="arrow.up.circle.fill" size={28} color={text.trim() ? t.colors.accents.indigo : t.colors.textTertiary} onPress={() => void send()} />} style={{ maxHeight: 120 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

function Bubble({ turn }: { turn: AssistantTurn }) {
  const t = useTheme();
  const router = useRouter();
  if (turn.role === 'tool') {
    const res = turn.toolResult as { id?: string; type?: string; title?: string } | undefined;
    const clickable = res && typeof res === 'object' && res.id && res.type;
    return (
      <Pressable onPress={clickable ? () => router.push(`/entity/${res!.type}/${res!.id}`) : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 }}>
        <Icon name="checkmark.circle" size={14} color={t.colors.accents.indigo} />
        <Text variant="footnote" color="secondary">
          {turn.text}
          {clickable ? ' →' : ''}
        </Text>
      </Pressable>
    );
  }
  const user = turn.role === 'user';
  return (
    <View style={{ alignSelf: user ? 'flex-end' : 'flex-start', maxWidth: '88%', backgroundColor: user ? t.colors.tint : t.colors.card, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, borderBottomRightRadius: user ? 4 : 18, borderBottomLeftRadius: user ? 18 : 4 }}>
      <Text color={user ? '#fff' : undefined} selectable>
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
