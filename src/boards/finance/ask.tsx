import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LifeOSContext } from '@core/registry/context';
import type { ObjectRecord } from '@core/domain/types';
import { Assistant, type AssistantTurn } from '@core/ai/assistant';
import { classifyFailure } from '@core/ai/limits';
import { maskPeople, unmask } from '@core/ai/privacy';
import { peopleNames } from '@modules/finance/filing/moneyIn';
import { ASK_AGENT_MODEL, MoneyAgentChat } from '@modules/finance/askAgent';
import { ManagedError } from '@core/ai/managedAgent';
import { useLive, useOS } from '@ui/hooks';
import { useTheme } from '@ui/theme/ThemeProvider';
import { ChipRow, Icon, IconButton, LineChart, ScreenHeader, Text, TrackColumns, useToast } from '@ui/kit';
import { ReplyCardView } from '@ui/components/ReplyCard';
import { ASK_PROMPT, askOnPhone, answerQuery, chipsFor, compare, dropView, keepView, moneyViews, oddFine, oddThings, oneIsWrong, runQuery, starters, type AskAnswer, type AskBlock, type BlockKind, type MoneyQuery } from '@modules/finance/ask';
import type { TransactionData } from '@modules/finance/types';
import { Caps, Hairline, IconDisc, Rows, SectionHead, TxRow, catColor, day, kindWord, relDay, shortMoney } from './parts';

/** The tools a typed question may use: Money's read-only ones (MODEL: only payee, amount, date, category leave). */
// Who owes whom names people, so it stays on the phone (askOnPhone answers it); the rest go through the privacy gate.
const ASK_TOOLS = new Set(['money_query', 'money_show', 'net_worth', 'portfolio', 'subscriptions_run_rate']);
const ASKED_KEY = 'finance.askQueued';

interface AgentTurn {
  texts: Array<{ id: string; text: string }>;
  steps: string[];
  shows: AskAnswer[];
  changes: Array<{ label: string; undo?: () => void; undone?: boolean }>;
  confirm?: { label: string; resolve: (ok: boolean) => void };
  done?: boolean;
}

interface Item {
  id: string;
  question: string;
  answer?: AskAnswer;
  busy?: boolean;
  waiting?: boolean;
  /** Ask Money's agent at work on this question (docs/MODEL.md, Ask Money is an agent). */
  agent?: AgentTurn;
}

/* ------------------------------------------------------------------ */
/* Blocks: the closed set, worked out live from a money query            */
/* ------------------------------------------------------------------ */

const openProof = (router: ReturnType<typeof useRouter>, q: MoneyQuery, title: string) => router.push({ pathname: '/module/finance/proof', params: { q: JSON.stringify(q), title } } as never);

/** One block of an answer or a kept view: number, bars, line, calendar or list, from its query. */
export function QueryBlock({ block, compact }: { block: AskBlock; compact?: boolean }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const f = useLive((o) => runQuery(o, block.query), [JSON.stringify(block.query)]);
  const money = (n: number) => os.format.currency(Math.round(n));
  const short = (n: number) => shortMoney(os, n);
  const time = block.query.by === 'day' || block.query.by === 'week' || block.query.by === 'month';
  const card = { padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 10 } as const;
  const seeAll = f.rows.length ? (
    <Pressable accessibilityRole="button" accessibilityLabel="See the payments" onPress={() => openProof(router, block.query, block.title)} style={({ pressed }) => ({ minHeight: 44, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '600' }}>See the payments</Text>
      <Icon name="chevron-right" size={14} color={t.c.fg.primary} />
    </Pressable>
  ) : null;

  if (block.kind === 'bars' && time && f.groups.length) {
    return (
      <View style={{ gap: 10 }}>
        <TrackColumns label={block.title} period={f.label} value={short(f.total)} values={f.groups.map((g) => g.value)} labels={f.groups.map((g) => g.label)} axis={short} />
        {compact ? null : seeAll}
      </View>
    );
  }
  if (block.kind === 'line' && f.groups.length > 1) {
    return (
      <View style={card}>
        <Caps>{block.title.toUpperCase()}</Caps>
        <Text style={{ fontSize: 28, lineHeight: 32, fontWeight: '700', letterSpacing: -0.8 }}>{money(f.total)}</Text>
        <LineChart labels={f.groups.map((g) => g.label)} series={[{ label: block.title, color: t.c.accent.gold, values: f.groups.map((g) => g.value) }]} formatY={short} accessibilityLabel={block.title} />
        {compact ? null : seeAll}
      </View>
    );
  }
  if (block.kind === 'number') {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`${block.title}, ${money(f.total)}`} onPress={() => f.rows.length && openProof(router, block.query, block.title)} style={card}>
        <Caps>{block.title.toUpperCase()}</Caps>
        <Text style={{ fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8 }}>{money(f.total)}</Text>
        <Text color="secondary" style={{ fontSize: 14, lineHeight: 20 }}>{f.rows.length ? `${f.rows.length} payment${f.rows.length === 1 ? '' : 's'} · ${f.label}` : f.label}</Text>
      </Pressable>
    );
  }
  if (block.kind === 'calendar' || block.query.measure === 'bills') {
    return <BillsCalendar title={block.title} bills={f.bills} total={f.total} />;
  }
  if (block.kind === 'bars' && f.groups.length) {
    const sum = f.groups.reduce((n, g) => n + Math.max(0, g.value), 0) || 1;
    const color = (key: string, i: number) => (block.query.by === 'category' ? catColor(key, t) : t.c.chart[i % t.c.chart.length]!);
    return (
      <View style={card}>
        <View accessibilityElementsHidden style={{ flexDirection: 'row', gap: 3, height: 10 }}>
          {f.groups.slice(0, 8).map((g, i) => (
            <View key={g.key} style={{ flex: Math.max(1, Math.round((g.value / sum) * 100)), borderRadius: 5, backgroundColor: color(g.key, i) }} />
          ))}
        </View>
        <View>
          {f.groups.slice(0, compact ? 4 : 8).map((g, i) => (
            <Pressable key={g.key} accessibilityRole="button" accessibilityLabel={`${g.label}, ${money(g.value)}`} onPress={() => openProof(router, block.query.by === 'category' ? { ...block.query, only: [g.key], by: undefined } : { ...block.query, payee: g.label, by: undefined }, g.label)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color(g.key, i) }} />
              <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '500' }}>{g.label}</Text>
              <Text color="secondary" style={{ fontSize: 13, lineHeight: 17 }}>{Math.round((g.value / sum) * 100)}%</Text>
              <Text style={{ width: 84, textAlign: 'right', fontSize: 15, lineHeight: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{money(g.value)}</Text>
            </Pressable>
          ))}
        </View>
        {compact ? null : seeAll}
      </View>
    );
  }
  // A list: the payments behind it.
  if (!f.rows.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <Rows gap={4}>
        {f.rows.slice(0, compact ? 3 : 6).map((x) => (
          <TxRow key={x.id} tx={x} minHeight={52} line={[kindWord(x.data), relDay(x.data.date)].join(' · ')} />
        ))}
      </Rows>
      {compact ? null : seeAll}
    </View>
  );
}

/** Bills on a month's calendar (NR-Money-Ask-Views): dots on the days, the list under it. */
function BillsCalendar({ title, bills, total }: { title: string; bills: ReturnType<typeof runQuery>['bills']; total: number }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const due = new Set(bills.filter((b) => day(b.due).getMonth() === now.getMonth()).map((b) => day(b.due).getDate()));
  const cells = [...Array(lead).fill(0), ...Array.from({ length: days }, (_, i) => i + 1)];
  return (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Caps style={{ flex: 1 }}>{title.toUpperCase()}</Caps>
        <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700' }}>{os.format.currency(Math.round(total))}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={`h${i}`} color="secondary" style={{ width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, lineHeight: 18, fontWeight: '600' }}>{d}</Text>
        ))}
        {cells.map((d, i) => (
          <View key={`c${i}`} style={{ width: `${100 / 7}%`, height: 34, alignItems: 'center', justifyContent: 'center' }}>
            {d ? (
              <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: due.has(d) ? t.c.accent.mustard : d === now.getDate() ? t.c.bg.tileRaised : 'transparent' }}>
                <Text style={{ fontSize: 12, lineHeight: 16, fontWeight: due.has(d) ? '700' : '500', color: due.has(d) ? t.c.accent.mustardInk : d < now.getDate() ? t.c.fg.tertiary : t.c.fg.primary }}>{d}</Text>
              </View>
            ) : null}
          </View>
        ))}
      </View>
      {bills.map((b, i) => (
        <React.Fragment key={b.key}>
          {i ? <Hairline /> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`${b.title}, ${os.format.currency(b.amount)}`} onPress={() => router.push(`/entity/${b.object}/${b.id}` as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
            <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: b.late ? t.c.alert.coralText : t.c.fg.primary }}>{`${day(b.due).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })} · ${b.title}`}</Text>
            <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{os.format.currency(b.amount)}</Text>
          </Pressable>
        </React.Fragment>
      ))}
      {!bills.length ? <Text color="secondary" style={{ fontSize: 14, lineHeight: 20 }}>Nothing due before payday.</Text> : null}
    </View>
  );
}

/** Anything wrong (NR-Money-Ask-Odd): charged twice, a new fee, a bill that went up or down. */
function OddCards() {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const o = useLive((x) => oddThings(x), []);
  const money = (n: number) => os.format.currency(n);
  const shortDay = (d: string) => day(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const fine = (key: string, message: string) => toast.show({ message, icon: 'check', undo: oddFine(os, key) });
  const shell = (caps: string, color: string, title: string, line: string | null, body: React.ReactNode, answers: React.ReactNode) => (
    <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="alert" size={16} color={color} />
        <Caps color={color}>{caps}</Caps>
      </View>
      <Text style={{ fontSize: 17, lineHeight: 22, fontWeight: '700', letterSpacing: -0.2 }}>{title}</Text>
      {line ? <Text color="secondary" style={{ fontSize: 14, lineHeight: 20 }}>{line}</Text> : null}
      {body}
      <View style={{ flexDirection: 'row', gap: 8 }}>{answers}</View>
    </View>
  );
  const btn = (title: string, lime: boolean, onPress: () => void) => (
    <Pressable key={title} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 48, borderRadius: 999, backgroundColor: lime ? t.c.accent.mustard : t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
      <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: lime ? t.c.accent.mustardInk : t.c.fg.primary }}>{title}</Text>
    </Pressable>
  );
  return (
    <View style={{ gap: 12 }}>
      {o.twice.map((x) => {
        const a = x.txs[0]!;
        return (
          <React.Fragment key={x.key}>
            {shell('CHARGED TWICE?', t.c.alert.coralText, `${a.data.merchant ?? a.title}, ${money(a.data.amount)}, twice on ${shortDay(x.txs[x.txs.length - 1]!.data.date)}`, null, (
              <View>
                {x.txs.map((tx, i) => (
                  <React.Fragment key={tx.id}>
                    {i ? <Hairline /> : null}
                    <TxRow tx={tx as ObjectRecord<TransactionData>} minHeight={52} line={relDay(tx.data.date)} />
                  </React.Fragment>
                ))}
              </View>
            ), [btn('Both are real', true, () => fine(x.key, 'Both kept · won’t ask again')), btn('One is wrong', false, () => toast.show({ message: 'The later one is gone', icon: 'trash', undo: oneIsWrong(os, x.txs) }))])}
          </React.Fragment>
        );
      })}
      {o.fees.map((x) => (
        <React.Fragment key={x.key}>
          {shell('A NEW FEE', t.c.accent.gold, `${x.tx.data.merchant ?? x.tx.title} took ${money(x.tx.data.amount)} on ${shortDay(x.tx.data.date)}`, 'You have not paid this before. It is filed under Fees & Charges.', null, [btn('That is fine', true, () => fine(x.key, 'Noted · won’t ask again')), btn('See it', false, () => router.push(`/entity/transaction/${x.tx.id}` as never))])}
        </React.Fragment>
      ))}
      {o.prices.map((x) => (
        <React.Fragment key={x.key}>
          {shell(x.to > x.from ? 'A BILL WENT UP' : 'A BILL WENT DOWN', t.c.accent.gold, `${x.sub.data.name} went from ${money(x.from)} to ${money(x.to)}`, `From ${shortDay(x.since)}.`, null, [btn('Keep it', true, () => fine(x.key, 'Kept')), btn('See it', false, () => router.push(`/entity/subscription/${x.sub.id}` as never))])}
        </React.Fragment>
      ))}
    </View>
  );
}

/** An answer: the sentence, its block, where it was worked out, the follow-ups and Keep. */
function AnswerView({ a, onFollow }: { a: AskAnswer; onFollow: (item: { question: string; answer: AskAnswer }) => void }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const block = a.block;
  const query = block && 'query' in block ? block : null;
  const f = useLive((o) => (query ? runQuery(o, query.query) : null), [query ? JSON.stringify(query.query) : '']);
  const chips = query && f ? chipsFor(query.query, f) : [];
  const keep = () => {
    if (!query) return;
    keepView(os, { title: query.title, kind: query.kind, query: query.query });
    toast.show({ message: `Kept on Money home · ${query.title}`, icon: 'check' });
  };
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 17, lineHeight: 24, fontWeight: '500', letterSpacing: -0.1, paddingHorizontal: 4 }}>{a.text}</Text>
      {query ? <QueryBlock block={query} /> : null}
      {block?.kind === 'odd' ? <OddCards /> : null}
      {block?.kind === 'card' ? <ReplyCardView card={block.card} label="" onOpen={(id, type) => router.push(`/entity/${type ?? 'transaction'}/${id}` as never)} /> : null}
      {a.source === 'phone' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
          <Icon name="check" size={14} color={t.c.accent.gold} />
          <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500' }}>Worked out on the phone. Nothing left it.</Text>
        </View>
      ) : (
        <Pressable accessibilityRole="link" accessibilityLabel="See what left the phone" onPress={() => router.push('/settings/brain' as never)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, minHeight: 24 }}>
          <Icon name="cloud" size={14} color={t.c.fg.secondary} />
          <Text color="secondary" style={{ flex: 1, fontSize: 12, lineHeight: 16, fontWeight: '500' }}>{a.sent == null ? 'Claude saw rounded totals by category and shop; people as placeholders, no account digits' : `The model saw ${a.sent} payment${a.sent === 1 ? '' : 's'}: payee, amount, date, category`}</Text>
          <Icon name="chevron-right" size={14} color={t.c.fg.secondary} />
        </Pressable>
      )}
      {chips.length || query ? (
        <ChipRow>
          {chips.map((c) => (
            <Pressable key={c.label} accessibilityRole="button" accessibilityLabel={c.label} onPress={() => onFollow({ question: c.label, answer: 'compare' in c ? compare(os, c.compare) : answerQuery(os, c.query, c.kind, c.title) })} style={{ height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '600' }}>{c.label}</Text>
            </Pressable>
          ))}
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Keep on Money home" onPress={keep} style={{ height: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.accent.mustard, justifyContent: 'center' }}>
              <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700', color: t.c.accent.mustardInk }}>Keep on Money home</Text>
            </Pressable>
          ) : null}
        </ChipRow>
      ) : null}
    </View>
  );
}

/** The model's answer from its turns: the money_show call (sentence, block, query), and how many payments it saw. Placeholders become names again here. */
function fromTurns(os: LifeOSContext, turns: AssistantTurn[]): AskAnswer {
  const sent = turns.filter((x) => x.toolName === 'money_query').reduce((n, x) => n + (((x.toolResult as { payments?: unknown[]; due?: unknown[] } | undefined)?.payments?.length ?? 0) + ((x.toolResult as { due?: unknown[] } | undefined)?.due?.length ?? 0)), 0);
  const show = [...turns].reverse().find((x) => x.toolName === 'money_show' && !x.isError);
  if (show) {
    const i = show.toolInput as { sentence: string; block: BlockKind; title: string; query: MoneyQuery };
    const query = i.query?.payee ? { ...i.query, payee: unmask(os, i.query.payee) } : i.query;
    return { text: unmask(os, i.sentence), block: { kind: i.block, title: unmask(os, i.title), query }, source: 'model', sent };
  }
  const text = unmask(os, turns.filter((x) => x.role === 'assistant').map((x) => x.text).join('\n\n').trim());
  return { text: text || 'I could not work that out.', source: 'model', sent };
}

/** Money › Ask (NR-Money-Ask*): Start here, your views, then the thread and the ask box. */
export function AskScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const t = useTheme();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const assistant = useRef<Assistant | null>(null);
  const chat = useRef<MoneyAgentChat | null>(null);
  const [text, setText] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const start = useLive((o) => starters(o), []);
  const views = useLive((o) => moneyViews(o), []);
  const empty = useLive((o) => o.records.count('transaction') === 0, []);
  const later = useLive((o) => {
    const mine = new Set(o.settings.get<string[]>(ASKED_KEY, []));
    return o.questions.list(30).filter((q) => mine.has(q.id));
  }, []);

  const put = (id: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const push = (item: Item) => {
    setItems((xs) => [...xs, item]);
    setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
  };

  const ask = async (question: string, starter = false) => {
    const q = question.trim();
    if (!q) return;
    setText('');
    const id = `q${Date.now()}`;
    // A starter you tap is answered on the phone at once. Anything you type goes to Ask Money's agent when
    // there is a Claude key (Claude Sonnet 5.5 with web search, tools answered here), never to the phone's fixed answers.
    const key = starter ? null : await ctx.device?.claudeKey?.().catch(() => null);
    if (key) return askAgent(id, q, key);
    const phone = askOnPhone(ctx, q);
    if (phone) return push({ id, question: q, answer: phone });
    push({ id, question: q, busy: true });
    const agent = await ctx.device?.agent?.().catch(() => null);
    if (!agent) return put(id, { busy: false, answer: { text: 'This one needs a model, and none is set up here. Add a free key in You › Agent (OpenRouter’s free models work), then ask again.', source: 'phone' } });
    assistant.current ??= new Assistant(ctx, { provider: agent.main, smartProvider: agent.smart, parser: false, metered: true, contextBudget: 0, selectTools: false, extraSystem: ASK_PROMPT, toolFilter: (tool) => ASK_TOOLS.has(tool.name), confirm: async () => true, maxToolRounds: 5 });
    try {
      // Through the privacy gate: people's names in your question go as placeholders.
      const masked = maskPeople(ctx, q, peopleNames(ctx));
      const turns = await assistant.current.send(masked);
      const answer = fromTurns(ctx, turns);
      put(id, { busy: false, answer });
      ctx.brain.sent.add({ at: Date.now(), pass: 'ask', why: masked, model: agent.main.model ?? agent.main.id, lines: [`Money · a summary of ${answer.sent ?? 0} payments: rounded amounts, dates, categories; people as placeholders`], records: answer.sent ?? 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, outcome: 'ok', error: null });
    } catch (e) {
      const f = classifyFailure(e);
      if (f.kind === 'wait') {
        const queued = ctx.questions.add(q, f.until ?? null);
        ctx.settings.set(ASKED_KEY, [...ctx.settings.get<string[]>(ASKED_KEY, []), queued.id]);
        return put(id, { busy: false, waiting: true, answer: { text: 'This one needs a model, and none is free right now. I will answer here when one is.', source: 'phone' } });
      }
      put(id, { busy: false, answer: { text: `That didn’t work: ${(e as Error).message.slice(0, 120)}`, source: 'phone' } });
    }
  };

  const askAgent = async (id: string, q: string, apiKey: string) => {
    const turn = (fn: (a: AgentTurn) => AgentTurn) => setItems((xs) => xs.map((x) => (x.id === id && x.agent ? { ...x, agent: fn(x.agent) } : x)));
    push({ id, question: q, agent: { texts: [], steps: [], shows: [], changes: [] } });
    chat.current ??= new MoneyAgentChat(ctx, { apiKey });
    const masked = maskPeople(ctx, q, peopleNames(ctx));
    try {
      const end = await chat.current.ask(masked, {
        text: (tid, text) => turn((a) => ({ ...a, texts: [...a.texts.filter((x) => x.id !== tid), { id: tid, text }] })),
        step: (label) => turn((a) => (a.steps.includes(label) ? a : { ...a, steps: [...a.steps, label] })),
        show: (sh) => turn((a) => ({ ...a, shows: [...a.shows, { ...answerQuery(ctx, sh.query, sh.block as BlockKind, sh.title), text: sh.sentence, source: 'model' }] })),
        change: (c) => turn((a) => ({ ...a, changes: [...a.changes, c] })),
        confirm: (label) => new Promise<boolean>((resolve) => turn((a) => ({ ...a, confirm: { label, resolve: (ok) => { turn((b) => ({ ...b, confirm: undefined })); resolve(ok); } } }))),
      });
      turn((a) => ({ ...a, done: true, texts: end === 'budget' ? [...a.texts, { id: 'budget', text: 'This conversation reached its spend cap. Start a new one from Money home.' }] : a.texts }));
      ctx.brain.sent.add({ at: Date.now(), pass: 'ask', why: masked, model: ASK_AGENT_MODEL, lines: ['Money agent · rounded amounts, dates, categories and shops; people as placeholders, no account digits'], records: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, outcome: 'ok', error: null });
    } catch (e) {
      const status = e instanceof ManagedError ? e.status : 0;
      const msg = status === 401 || status === 403 ? 'Your Claude key in You › Agent did not work for Ask Money. It needs Claude Managed Agents, a beta, on for your account.' : `That didn’t work: ${(e as Error).message.slice(0, 140)}`;
      turn((a) => ({ ...a, done: true, texts: [...a.texts, { id: 'error', text: msg }] }));
    }
  };

  const bubble = (q: string) => (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingLeft: 44 }}>
      <View style={{ paddingVertical: 11, paddingHorizontal: 15, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 6, backgroundColor: t.c.bg.tileRaised }}>
        <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '500' }}>{q}</Text>
      </View>
    </View>
  );

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: t.c.bg.ground }}>
      <ScrollView ref={scroll} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: 24, gap: 18 }} keyboardShouldPersistTaps="handled">
        <ScreenHeader title="Ask Money" subtitle="Your money guru · it cannot move money" onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/finance/index' as never))} />

        {empty ? (
          <View style={{ padding: 20, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 12 }}>
            <Text style={{ fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3 }}>Nothing to answer from yet</Text>
            <Text color="secondary" style={{ fontSize: 14, lineHeight: 20 }}>Once bank texts are filing your payments, you can ask anything here.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Turn on SMS in Data sources" onPress={() => router.push('/settings/sources' as never)} style={{ height: 48, borderRadius: 999, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.accent.mustardInk }}>Turn on SMS in Data sources</Text>
            </Pressable>
          </View>
        ) : null}

        {!items.length && !empty ? (
          <>
            <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 6 }}>
              <Caps>START HERE</Caps>
              {start.map((s, i) => (
                <React.Fragment key={s.question}>
                  {i ? <Hairline /> : null}
                  <Pressable accessibilityRole="button" accessibilityLabel={`${s.question}, ${s.line}`} onPress={() => void ask(s.question, true)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}>
                    <IconDisc icon={s.icon} />
                    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                      <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{s.question}</Text>
                      <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: s.lime ? '600' : '400', color: s.lime ? t.c.accent.gold : t.c.fg.secondary }}>{s.line}</Text>
                    </View>
                    <Icon name="chevron-right" size={16} color={t.c.fg.secondary} />
                  </Pressable>
                </React.Fragment>
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
              <Icon name="check" size={14} color={t.c.accent.gold} />
              <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500' }}>These run on the phone. Nothing leaves it.</Text>
            </View>
          </>
        ) : null}

        {!items.length && views.length ? (
          <View style={{ gap: 10 }}>
            <SectionHead title="Your views" sub="Kept on Money home, always up to date" />
            <View style={{ paddingVertical: 4, paddingHorizontal: 16, borderRadius: 24, backgroundColor: t.c.bg.tile }}>
              {views.map((v, i) => (
                <React.Fragment key={v.id}>
                  {i ? <Hairline /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${v.title}`} onPress={() => push({ id: `v${Date.now()}`, question: v.title, answer: answerQuery(ctx, v.query, v.kind, v.title) })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
                      <Icon name={v.kind === 'calendar' ? 'calendar' : 'chart'} size={18} color={t.tints.finance.ink} />
                      <Text numberOfLines={1} style={{ flex: 1, fontSize: 15, lineHeight: 20, fontWeight: '600' }}>{v.title}</Text>
                    </Pressable>
                    <IconButton icon="x" accessibilityLabel={`Remove ${v.title} from Money home`} onPress={() => toast.show({ message: `Removed · ${v.title}`, icon: 'trash', undo: dropView(ctx, v.id) })} />
                  </View>
                </React.Fragment>
              ))}
            </View>
          </View>
        ) : null}

        {later.length && !items.length ? (
          <View style={{ gap: 10 }}>
            <SectionHead title="Asked while no model was free" />
            {later.slice(0, 5).map((q) => (
              <View key={q.id} style={{ gap: 8 }}>
                {bubble(q.text)}
                <Text color={q.answer ? undefined : 'secondary'} style={{ fontSize: 15, lineHeight: 22, paddingHorizontal: 4 }}>{q.answer ?? 'Waiting. You can leave this screen.'}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {items.map((x) => (
          <View key={x.id} style={{ gap: 12 }}>
            {bubble(x.question)}
            {x.agent ? <AgentTurnView a={x.agent} onFollow={(f) => push({ id: `f${Date.now()}`, ...f })} /> : x.busy ? <Text color="secondary" style={{ fontSize: 15, lineHeight: 22, paddingHorizontal: 4 }}>Working it out…</Text> : x.answer ? <AnswerView a={x.answer} onFollow={(f) => push({ id: `f${Date.now()}`, ...f })} /> : null}
            {x.waiting ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>
                <Icon name="clock" size={14} color={t.c.fg.secondary} />
                <Text color="secondary" style={{ fontSize: 12, lineHeight: 16, fontWeight: '500' }}>Waiting. You can leave this screen.</Text>
              </View>
            ) : null}
          </View>
        ))}

        {!items.length && !empty ? <Text color="secondary" style={{ fontSize: 13, lineHeight: 18, paddingHorizontal: 4 }}>A question you type goes to Ask Money's agent (Claude Sonnet with web search, on your Claude key) or else the model in You › Agent: rounded amounts, dates and categories, with people as placeholders. Never your texts. It can change categories, keep cards on Money home and, after asking, set limits; each change has Undo.</Text> : null}
      </ScrollView>

      <View style={{ paddingHorizontal: t.layout.gutter, paddingTop: 12, paddingBottom: insets.bottom + 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingVertical: 6, paddingRight: 6, paddingLeft: 18, borderRadius: 999, backgroundColor: t.c.bg.tile }}>
          <TextInput value={text} onChangeText={setText} onSubmitEditing={() => void ask(text)} placeholder={items.length ? 'Ask a follow-up' : 'Ask about your money'} placeholderTextColor={t.c.fg.secondary} returnKeyType="send" accessibilityLabel="Ask a question" style={{ flex: 1, minWidth: 0, color: t.c.fg.primary, fontSize: 15 }} />
          <IconButton icon="arrow-up" accessibilityLabel="Ask" filled={t.c.accent.mustard} color={t.c.accent.mustardInk} onPress={() => void ask(text)} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** The agent's turn: what it did, what it said, what it showed, what it changed (with Undo), and what it asks first. */
function AgentTurnView({ a, onFollow }: { a: AgentTurn; onFollow: (item: { question: string; answer: AskAnswer }) => void }) {
  const t = useTheme();
  return (
    <View style={{ gap: 12 }}>
      {a.steps.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
          <Icon name="sparkle" size={14} color={t.c.accent.gold} />
          <Text color="secondary" numberOfLines={2} style={{ flex: 1, fontSize: 13, lineHeight: 17, fontWeight: '500' }}>{a.steps.join(' · ')}</Text>
        </View>
      ) : null}
      {a.texts.map((x) => (
        <Prose key={x.id} text={x.text} />
      ))}
      {a.shows.map((sh, i) => (
        <AnswerView key={i} a={sh} onFollow={onFollow} />
      ))}
      {a.changes.map((c, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 16, paddingRight: 8, borderRadius: 20, backgroundColor: t.c.bg.tile }}>
          <Icon name={c.undone ? 'x' : 'check'} size={16} color={c.undone ? t.c.fg.secondary : t.c.accent.gold} />
          <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '600', color: c.undone ? t.c.fg.secondary : t.c.fg.primary }}>{c.undone ? `Undone · ${c.label}` : c.label}</Text>
          {c.undo && !c.undone ? <UndoButton onPress={() => { c.undo!(); c.undone = true; }} /> : null}
        </View>
      ))}
      {a.confirm ? (
        <View style={{ padding: 16, borderRadius: 24, backgroundColor: t.c.bg.tile, gap: 12 }}>
          <Text style={{ fontSize: 15, lineHeight: 21, fontWeight: '600' }}>{a.confirm.label}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Yes, do it" onPress={() => a.confirm!.resolve(true)} style={{ flex: 1, height: 44, borderRadius: 999, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700', color: t.c.accent.mustardInk }}>Yes, do it</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={() => a.confirm!.resolve(false)} style={{ flex: 1, height: 44, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '700' }}>Not now</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      {!a.done && !a.confirm ? <Text color="secondary" style={{ fontSize: 15, lineHeight: 22, paddingHorizontal: 4 }}>{a.texts.length || a.shows.length ? 'Still working…' : 'Thinking…'}</Text> : null}
    </View>
  );
}

/** The agent's words: paragraphs, bullet lines and **bold**, drawn as the app's text (no raw symbols). */
function Prose({ text }: { text: string }) {
  const t = useTheme();
  const inline = (line: string) => line.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => (part.startsWith('**') && part.endsWith('**') ? <Text key={i} style={{ fontSize: 15, lineHeight: 22, fontWeight: '700' }}>{part.slice(2, -2)}</Text> : part.replace(/\*/g, '')));
  const blocks = text.replace(/^#+\s*/gm, '').split(/\n{2,}/);
  return (
    <View style={{ gap: 10, paddingHorizontal: 4 }}>
      {blocks.map((b, i) => {
        const lines = b.split('\n').filter((l) => l.trim());
        const bullet = (l: string) => /^\s*([-*•]|\d+\.)\s+/.test(l);
        if (!lines.some(bullet)) return <Text key={i} style={{ fontSize: 15, lineHeight: 22 }}>{inline(lines.join(' '))}</Text>;
        return (
          <View key={i} style={{ gap: 6 }}>
            {lines.map((l, j) =>
              bullet(l) ? (
                <View key={j} style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.c.accent.mustard, marginTop: 8 }} />
                  <Text style={{ flex: 1, fontSize: 15, lineHeight: 22 }}>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''))}</Text>
                </View>
              ) : (
                <Text key={j} style={{ fontSize: 15, lineHeight: 22, fontWeight: /:\s*$/.test(l) ? '700' : '400' }}>{inline(l)}</Text>
              ),
            )}
          </View>
        );
      })}
    </View>
  );
}

function UndoButton({ onPress }: { onPress: () => void }) {
  const t = useTheme();
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Undo" onPress={() => { onPress(); setDone(true); }} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, lineHeight: 17, fontWeight: '700' }}>Undo</Text>
    </Pressable>
  );
}

/** The payments behind a figure (NR-Money-Ask-Proof): the total, the payments that add up to it. */
export function ProofScreen({ params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const os = useOS();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const q = (() => {
    try {
      return JSON.parse(params.q ?? '') as MoneyQuery;
    } catch {
      return { measure: 'spent', period: 'month' } as MoneyQuery;
    }
  })();
  const title = params.title || 'Spent';
  const f = useLive((o) => runQuery(o, q), [params.q]);
  const money = (n: number) => os.format.currency(Math.round(n));
  const spendParams = { period: q.period, ...(q.only?.length === 1 ? { category: q.only[0] } : {}), ...(q.measure === 'came_in' ? { kind: 'income' } : {}) };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.c.bg.ground }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: t.layout.gutter, paddingBottom: insets.bottom + 32, gap: 18 }}>
      <ScreenHeader title="The payments behind it" subtitle={`${title} · ${f.label}`} onBack={() => (router.canGoBack() ? router.back() : router.replace('/module/finance/ask' as never))} />
      <View style={{ padding: 18, borderRadius: 28, backgroundColor: t.c.bg.tile, gap: 6 }}>
        <Caps>{title.toUpperCase()}</Caps>
        <Text style={{ fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8 }}>{money(f.total)}</Text>
        <Text color="secondary" style={{ fontSize: 14, lineHeight: 20 }}>{f.rows.length ? `These ${f.rows.length} payment${f.rows.length === 1 ? '' : 's'} add up to it.` : 'No payments behind it.'}</Text>
      </View>
      {f.rows.length ? (
        <Rows gap={4}>
          {f.rows.map((x) => (
            <View key={x.id}>
              <TxRow tx={x} minHeight={52} line={[day(x.data.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }), kindWord(x.data)].join(' · ')} />
            </View>
          ))}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52 }}>
            <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600' }}>Total</Text>
            <Text style={{ fontSize: 18, lineHeight: 23, fontWeight: '700', color: t.c.accent.gold }}>{money(f.total)}</Text>
          </View>
        </Rows>
      ) : null}
      <Text color="secondary" style={{ fontSize: 13, lineHeight: 18, paddingHorizontal: 4 }}>Tap a payment to fix its category or amount. The answer changes with it.</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to the answer" onPress={() => router.back()} style={{ flex: 1, minHeight: 48, borderRadius: 999, backgroundColor: t.c.bg.tileRaised, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700' }}>Back to the answer</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Open in Spend" onPress={() => router.push({ pathname: '/spend', params: spendParams } as never)} style={{ flex: 1, minHeight: 48, borderRadius: 999, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 14, lineHeight: 18, fontWeight: '700', color: t.c.accent.mustardInk }}>Open in Spend</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/** Your views on Money home: each kept view, live, opening the Ask screen. */
export function YourViews() {
  const router = useRouter();
  const views = useLive((o) => moneyViews(o), []);
  if (!views.length) return null;
  return (
    <View style={{ gap: 10 }}>
      <SectionHead title="Your views" sub="Kept from Ask Money, always up to date" action="Ask" chevron onAction={() => router.push('/module/finance/ask' as never)} />
      {views.map((v) => (
        <View key={v.id} style={{ gap: 6 }}>
          {v.kind === 'bars' && (v.query.by === 'week' || v.query.by === 'day' || v.query.by === 'month') ? null : <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', paddingHorizontal: 4 }}>{v.title}</Text>}
          <QueryBlock block={{ kind: v.kind, title: v.title, query: v.query }} compact />
        </View>
      ))}
    </View>
  );
}

/** The ask box on top of Money home: opens Ask Money. */
export function AskBox() {
  const t = useTheme();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Ask about your money" onPress={() => router.push('/module/finance/ask' as never)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingLeft: 18, paddingRight: 6, borderRadius: 999, backgroundColor: t.c.bg.tile, opacity: pressed ? 0.85 : 1 })}>
      <Icon name="sparkle" size={16} color={t.c.accent.gold} />
      <Text color="secondary" style={{ flex: 1, fontSize: 15, lineHeight: 20 }}>Ask about your money</Text>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.c.accent.mustard, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="arrow-up" size={16} color={t.c.accent.mustardInk} />
      </View>
    </Pressable>
  );
}

