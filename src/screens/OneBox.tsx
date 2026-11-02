import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Assistant, READ_ONLY_TOOLS, type AssistantTurn } from '@core/ai/assistant';
import { classifyInput } from '@core/ai/route';
import { classifyFailure } from '@core/ai/limits';
import { localAnswer } from '@core/ai/localAnswer';
import { parseMessage } from '@core/ai/parser';
import type { DumpSource } from '@core/repo/dumpRepo';
import { noteUnreadInvoice, stockFromInvoice, undoStocked } from '@modules/inventory';
import { useLive, useOS, useSettings } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { Button, Chip, EmptyState, Icon, IconButton, ScreenHeader, Text, useBottomBarInset, useToast } from '@ui/kit';
import { ReplyCardView } from '@ui/components/ReplyCard';
import { buildAgentFromSettings, type AgentProviders } from '../platform/agentProvider';
import { runFiling, saveDump } from '../platform/filing';
import { listen } from '../platform/voice';
import { DumpCard, waitText } from './DumpPane';
import { ToCheckBell } from './ToCheckBell';

/** Provider failures in plain words. */
export function friendlyError(msg: string): string {
  const who = /^(\w+)[ :]/.exec(msg)?.[1];
  const name = who && !/^(chain|network|request)$/i.test(who) ? who.charAt(0).toUpperCase() + who.slice(1) : 'The model';
  if (/\b401\b|authentication|invalid x-api-key|API key is invalid|no API key/i.test(msg)) return `${name} rejected the API key. Check it in You › Agent.`;
  if (/\b413\b|request too large|tokens per minute|\bTPM\b/i.test(msg)) return `That was more than ${name}’s free tier takes in a minute. Try again shortly, or add a Gemini key in You › Agent so it can switch.`;
  if (/\b429\b|rate.?limit|too many requests/i.test(msg)) return `${name}’s free tier is busy for the next minute. Try again shortly, or add a second provider in You › Agent.`;
  if (/\bcap\b|monthly/i.test(msg) && /usage|cap/i.test(msg)) return `${name} hit the monthly cap you set in You › Agent.`;
  if (/\b529\b|overloaded/i.test(msg)) return `${name} is busy right now. Try again in a moment.`;
  if (/network|fetch|Failed to fetch|timed? ?out/i.test(msg)) return `Couldn’t reach ${name} — are you online?`;
  return `Something went wrong: ${msg.slice(0, 160)}`;
}

interface Answer {
  id: string;
  at: number;
  question: string;
  turns: AssistantTurn[];
  busy: boolean;
  error?: string;
}

export interface Shared {
  text?: string;
  file?: { uri: string; name: string; mime: string };
}

/**
 * The centre tab (docs/GRAPH.md §5): one box. Say or type anything —
 * statements are kept word for word and filed into the graph in the
 * background (see the bell), questions are answered from everything it
 * knows. It never stops to ask.
 */
export function OneBox({ share, centerPress }: { share?: Shared | null; centerPress: MutableRefObject<(() => void) | null> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const barInset = useBottomBarInset();
  const chain = useSettings((s) => s.aiChain);
  const routing = useSettings((s) => s.aiRouting);
  const [agent, setAgent] = useState<AgentProviders | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [source, setSource] = useState<DumpSource>('typed');
  const [file, setFile] = useState<Shared['file'] | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const dumps = useLive((o) => o.dumps.recent({ limit: 30 }), []);
  const queued = useLive((o) => o.questions.list(20), []);

  const [focusTick, setFocusTick] = useState(0);
  const navigation = useNavigation();
  useEffect(() => navigation.addListener('focus' as never, () => setFocusTick((n) => n + 1)), [navigation]);
  useEffect(() => {
    let alive = true;
    buildAgentFromSettings(os).then((a) => alive && setAgent(a));
    void runFiling(os);
    return () => {
      alive = false;
    };
  }, [os, chain, routing, focusTick]);
  useEffect(() => {
    if (share?.text) {
      setText(share.text);
      setSource('share');
    }
    if (share?.file) setFile(share.file);
  }, [share]);

  // Questions: read-only tools (filing goes through dumps), never a confirm card.
  const assistant = useMemo(
    () =>
      agent === undefined
        ? null
        : new Assistant(os, { provider: agent?.main ?? null, smartProvider: agent?.smart, metered: true, toolFilter: (tool) => READ_ONLY_TOOLS.has(tool.name), confirm: async () => true }),
    [agent, os],
  );

  /** No model free: answer from the phone now, queue the full answer. */
  const queueQuestion = (question: string, until?: number | null) => {
    os.questions.add(question, until ?? null);
    void runFiling(os);
  };
  const ask = async (question: string) => {
    if (!assistant) return;
    // No key and not something the parser answers ("who owes me money"): phone answer + queue.
    if (!agent && !parseMessage(os, question)) return queueQuestion(question);
    const id = `a${Date.now()}`;
    setAnswers((xs) => [{ id, at: Date.now(), question, turns: [], busy: true }, ...xs]);
    const patch = (p: Partial<Answer> | ((a: Answer) => Partial<Answer>)) => setAnswers((xs) => xs.map((a) => (a.id === id ? { ...a, ...(typeof p === 'function' ? p(a) : p) } : a)));
    try {
      const turns = await assistant.send(question);
      patch({ turns: turns.filter((x) => x.role !== 'user'), busy: false });
    } catch (e) {
      const f = classifyFailure(e);
      if (f.kind === 'wait') {
        // Every provider is resting or offline: the phone's answer now, the full one when a model is free.
        setAnswers((xs) => xs.filter((a) => a.id !== id));
        return queueQuestion(question, f.until);
      }
      patch({ busy: false, error: friendlyError((e as Error).message) });
    }
  };

  const submit = (said?: string, from?: DumpSource) => {
    let body = (said ?? text).trim();
    if (!body && !file) return;
    const src = from ?? source;
    setText('');
    setSource('typed');
    if (file) {
      setFile(null);
      return void (async () => {
        // An order's invoice (Blinkit) stocks Home; a PDF with no readable text says so in To check.
        const readPdf = os.device?.pdfText;
        if (readPdf && (/pdf/i.test(file.mime) || /\.pdf$/i.test(file.name))) {
          const pdf = await readPdf(file.uri).catch(() => null);
          if (!pdf) {
            noteUnreadInvoice(os, file.name);
            return toast.show({ message: 'Couldn’t read this invoice: see To check', icon: 'alert' });
          }
          const stocked = stockFromInvoice(os, pdf);
          if (stocked) return toast.show({ message: stocked.label, icon: 'check', undo: () => undoStocked(os, stocked.filingId) });
        }
        // Anything else is attached to the right record by the agent.
        void ask(`${body || 'I shared this — attach it where it belongs.'}\n[Shared file: ${file.name}${file.mime ? ` (${file.mime})` : ''} — uri ${file.uri}. Use attach_file to put it on the right record.]`);
      })();
    }
    if (classifyInput(body) === 'ask') return void ask(body);
    saveDump(os, body, src);
  };

  const speak = async (andSend: boolean) => {
    const heard = await listen();
    if (!heard) return toast.show({ message: Platform.OS === 'web' ? 'Voice isn’t available in this browser' : 'Didn’t catch that', icon: 'mic' });
    if (andSend) return submit(heard, 'voice');
    setText((x) => (x.trim() ? `${x.trimEnd()} ${heard}` : heard));
    if (!text.trim()) setSource('voice');
  };
  // The raised brain while here: listen and go.
  centerPress.current = () => void speak(true);

  const feed = useMemo(() => {
    const items: Array<{ at: number; key: string; node: 'dump' | 'answer' | 'queued'; id: string }> = [
      ...dumps.map((d) => ({ at: d.createdAt, key: `d${d.id}`, node: 'dump' as const, id: d.id })),
      ...answers.map((a) => ({ at: a.at, key: a.id, node: 'answer' as const, id: a.id })),
      ...queued.map((q) => ({ at: q.createdAt, key: `q${q.id}`, node: 'queued' as const, id: q.id })),
    ];
    return items.sort((a, b) => b.at - a.at);
  }, [dumps, answers, queued]);

  const kind = text.trim() ? classifyInput(text) : null;
  const open = (id: string, type?: string) => {
    const ty = type ?? os.records.get(id)?.object;
    if (ty) router.push(`/entity/${ty}/${id}` as never);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: 8 }}>
        <ScreenHeader title="Dump" subtitle="Tell me anything, or ask." right={<ToCheckBell />} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: t.layout.gutter, paddingTop: 8, paddingBottom: barInset + 32, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: t.c.bg.container, borderRadius: 24, padding: 14, gap: 12 }}>
          <TextInput
            accessibilityLabel="Tell me anything, or ask"
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (!v) setSource('typed');
            }}
            placeholder="Met Kendal today, her birthday is 8 Sept… flew to Canada with her… when did I last see Karan?"
            placeholderTextColor={t.c.fg.tertiary}
            multiline
            textAlignVertical="top"
            style={{ minHeight: 120, maxHeight: 320, color: t.c.fg.primary, fontSize: 17, lineHeight: 24, fontFamily: t.type.body.fontFamily, padding: 4 }}
          />
          {file ? (
            <View style={{ flexDirection: 'row' }}>
              <Chip label={`Attached: ${file.name}`} icon="paperclip" onPress={() => setFile(null)} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <IconButton icon="mic" accessibilityLabel="Speak" filled onPress={() => void speak(false)} />
            <Text variant="caption" color="secondary" style={{ flex: 1 }} numberOfLines={1}>
              {file ? 'Will attach it to the right record' : kind === 'ask' ? 'Looks like a question — I’ll answer' : kind === 'tell' ? 'I’ll file this' : source === 'share' ? 'Shared into LifeOS' : 'Type or talk'}
            </Text>
            <Button title={kind === 'ask' ? 'Ask' : 'Go'} icon={kind === 'ask' ? 'search' : 'brain'} size="sm" onPress={() => submit()} disabled={!text.trim() && !file} />
          </View>
        </View>
        {agent === null ? <Chip icon="key" tone="accent" small label="Everyday things work offline · add a free key for the rest" onPress={() => router.push('/settings/ai')} /> : null}

        {!feed.length ? (
          <EmptyState icon="brain" tint="memory" line="Say what happened, who you met, what you bought, what you need to do — it keeps every word and files it, linked. Ask anything about your life the same way." bare />
        ) : null}
        {feed.map((f) => {
          if (f.node === 'dump') {
            const d = dumps.find((x) => x.id === f.id);
            return d ? <DumpCard key={f.key} dump={d} os={os} onOpen={() => router.push(`/dump/${d.id}` as never)} /> : null;
          }
          if (f.node === 'queued') {
            const q = queued.find((x) => x.id === f.id);
            return q ? <QueuedAnswer key={f.key} q={q} onOpen={open} /> : null;
          }
          const a = answers.find((x) => x.id === f.id)!;
          const text = a.turns.filter((x) => x.role === 'assistant').map((x) => x.text).join('\n\n');
          return (
            <View key={f.key} style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
                <Icon name="search" size={13} color={t.c.fg.secondary} />
                <Text variant="caption" color="secondary" style={{ flex: 1 }} numberOfLines={2}>
                  {a.question.split('\n[Shared file')[0]}
                </Text>
              </View>
              <View style={{ backgroundColor: t.c.bg.container, borderRadius: 24, borderTopLeftRadius: 8, padding: 14, gap: 10 }}>
                {a.busy ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="sparkle" size={14} color={t.c.accent.gold} />
                    <Text variant="caption" color="secondary">Looking…</Text>
                  </View>
                ) : (
                  <Text variant="body" selectable style={{ lineHeight: 22 }}>
                    {a.error ?? (text || 'Nothing on that yet.')}
                  </Text>
                )}
              </View>
              {a.turns.filter((x) => x.role === 'tool' && x.card && !x.isError && !(x.card.kind === 'list' && !x.card.items.length) && !(x.card.kind === 'chart' && !x.card.bars.length)).map((x) => (
                <ReplyCardView key={x.id} label={x.text} card={x.card} onOpen={open} onNew={(ty) => router.push(`/entity/${ty}/new` as never)} />
              ))}
            </View>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A question asked while no model was free: the phone's answer until the full one lands. */
function QueuedAnswer({ q, onOpen }: { q: import('@core/repo/questionRepo').QueuedQuestion; onOpen: (id: string, type?: string) => void }) {
  const t = useTheme();
  const os = useOS();
  const local = useMemo(() => (q.status === 'answered' ? null : localAnswer(os, q.text)), [os, q.status, q.text]);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
        <Icon name="search" size={13} color={t.c.fg.secondary} />
        <Text variant="caption" color="secondary" style={{ flex: 1 }} numberOfLines={2}>
          {q.text}
        </Text>
      </View>
      <View style={{ backgroundColor: t.c.bg.container, borderRadius: 24, borderTopLeftRadius: 8, padding: 14, gap: 10 }}>
        {q.status === 'answered' ? (
          <Text variant="body" selectable style={{ lineHeight: 22 }}>{q.answer}</Text>
        ) : (
          <>
            <Text variant="body" selectable style={{ lineHeight: 22 }}>{local!.text}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name={q.status === 'failed' ? 'alert' : 'clock'} size={12} color={t.c.fg.secondary} />
              <Text variant="caption" color="secondary" style={{ flex: 1 }}>
                {q.status === 'failed' ? 'Couldn’t get a full answer — this is what the phone knows' : `From the phone · full answer ${q.retryAt ? waitText(q.retryAt) : 'when a model is free'}`}
              </Text>
            </View>
          </>
        )}
      </View>
      {local?.cards.map((c, i) => <ReplyCardView key={`${q.id}${i}`} label="On the phone" card={c} onOpen={onOpen} />)}
    </View>
  );
}
