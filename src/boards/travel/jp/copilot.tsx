// own-glyphs: this screen draws the trip template's inline icons (JP-Parts), not the kit's icon set.
import React, { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import { useToast } from '@ui/kit';
import { makeBill } from '@modules/finance';
import { applyChanges, askCopilot, changeLine, clearCopilotChat, copilotChat, rateFor, saveCopilotChat, type Change, type CopilotAnswer, type SavedTurn, type TripData } from '@modules/travel';
import { Anim, MONO } from './kit';
import { C, tripRoutes } from './shell';
import { Ico, type IcoName } from './search';
import { canHear, hear } from './listen';

/**
 * The trip copilot (JP-Copilot): ask about the trip and Claude answers from
 * its records, through the app's brain with your key (budget and Sent to
 * Claude as every call). When it proposes changes (a thing to do, a to-do, a
 * note, an expense, a tick, a check-in time) they wait in Proposed changes
 * until Save to the trip, which has an Undo. When a question needs current
 * facts it looks them up on the web first (Claude's web search and page
 * reading) and lists the pages under the answer. The chat is kept on this
 * phone per trip, so it is there next time; New chat clears it. Booking.com and
 * Gmail are not connected to LifeOS: they show as the design's labelled slots only.
 */

interface Turn {
  q: string;
  at: number;
  state: 'thinking' | 'done' | 'error';
  answer?: CopilotAnswer;
  keys?: Map<string, string>;
  error?: string;
  sources?: Array<{ url: string; title: string }>;
  saved?: 'saved' | 'discarded';
}

const toSaved = (t: Turn): SavedTurn => ({ q: t.q, at: t.at, answer: t.answer, error: t.error, sources: t.sources, keys: t.keys ? [...t.keys] : undefined, saved: t.saved === 'saved' ? 'saved' : t.saved === 'discarded' ? 'dismissed' : undefined });
const fromSaved = (t: SavedTurn): Turn => ({ q: t.q, at: t.at, state: t.answer ? 'done' : 'error', answer: t.answer, error: t.error, sources: t.sources, keys: t.keys ? new Map(t.keys) : undefined, saved: t.saved === 'saved' ? 'saved' : t.saved === 'dismissed' ? 'discarded' : undefined });
const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const F = { semi: 'PlusJakartaSans_600SemiBold', bold: 'PlusJakartaSans_700Bold', med: 'PlusJakartaSans_500Medium', reg: 'PlusJakartaSans_400Regular' };
const SUGGEST = ['What now?', 'What’s on while we’re there?', 'Anything closed on our dates?', 'Split a receipt photo', 'Who owes whom?', 'Cheaper transport', 'What’s most urgent?'];

function Disc({ size = 28 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Ico name="sparkle" size={size / 2} color={C.ink} />
    </View>
  );
}

function ToolPill({ icon, label, on, note, onPress }: { icon: IcoName; label: string; on?: boolean; note?: string; onPress?: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={note ? `${label}, ${note}` : label} onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 30, paddingHorizontal: 11, borderRadius: 999, flexShrink: 0, backgroundColor: on ? 'rgba(215,245,92,0.16)' : C.raised }}>
      <Ico name={on ? 'check' : icon} size={13} color={on ? C.lime : C.mid} />
      <Text style={{ color: on ? C.lime : C.mid, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'], fontFamily: F.semi }}>{label}</Text>
    </Pressable>
  );
}

/** A source LifeOS cannot reach yet, drawn as the design's labelled slot. */
function Slot({ icon, title, line }: { icon: IcoName; title: string; line: string }) {
  return (
    <View style={{ gap: 4, padding: 14, backgroundColor: C.raised, borderRadius: 22, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 24 }}>
          <Ico name={icon} size={13} color={C.mid} />
          <Text style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: F.semi }}>{title}</Text>
        </View>
        <View style={{ flexGrow: 1 }} />
        <Text style={{ color: C.low, fontSize: 9, letterSpacing: 0.9, fontFamily: MONO }}>NOT CONNECTED</Text>
      </View>
      <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line }}>
        <Text style={{ color: C.mid, fontSize: 13, lineHeight: 18, fontFamily: F.reg }}>{line}</Text>
      </View>
    </View>
  );
}

function Thinking() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Anim k="jspin" style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.lime, borderTopColor: 'transparent' }} />
      <Text style={{ color: C.mid, fontSize: 15, lineHeight: 22, fontFamily: F.reg }}>Reading the trip, and the web if it needs to…</Text>
    </View>
  );
}

export function CopilotScreen({ ctx, params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const trip = useLive((os) => {
    const x = os.records.get<TripData>(params.trip ?? '');
    return x?.object === 'trip' ? x : null;
  }, [params.trip]);
  const [turns, setTurns] = useState<Turn[]>(() => (params.trip ? copilotChat(ctx, params.trip).map(fromSaved) : []));
  // The chat is kept on the phone per trip (finished turns only).
  useEffect(() => {
    if (!trip) return;
    const done = turns.filter((t) => t.state !== 'thinking');
    saveCopilotChat(ctx, trip.id, done.map(toSaved));
  }, [turns, trip, ctx]);
  const [text, setText] = useState('');
  const asked = useRef<string | null>(null);
  const busy = turns.some((t) => t.state === 'thinking');

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || !trip || busy) return;
    if (/split a receipt/i.test(q)) return router.push(tripRoutes.receipt(trip.id));
    setText('');
    const history = turns.filter((t) => t.answer).map((t) => ({ q: t.q, a: t.answer!.reply }));
    setTurns((ts) => [...ts, { q, at: Date.now(), state: 'thinking' }]);
    const model = (await ctx.device?.brain?.model().catch(() => null)) ?? null;
    const res = await askCopilot(ctx, model, trip, q, history);
    setTurns((ts) => ts.map((t, i) => (i !== ts.length - 1 ? t : res.ok ? { ...t, state: 'done', answer: res.answer, keys: res.keys, sources: res.sources } : { ...t, state: 'error', error: res.note === 'no key' || res.note === 'off' ? 'The copilot needs the brain on, with a Claude key: You › Agent.' : res.note === 'over budget' ? 'Over today’s brain budget. Try tomorrow, or raise it in You › Agent.' : `Couldn’t get an answer${res.error ? `: ${res.error.slice(0, 120)}` : ''}.` })));
  };

  useEffect(() => {
    if (trip && params.ask && asked.current !== params.ask) {
      asked.current = params.ask;
      void send(params.ask);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, params.ask]);

  const save = (i: number) => {
    const t = turns[i];
    if (!trip || !t?.answer || !t.keys) return;
    const parties = ['me', ...(trip.data.personIds ?? [])];
    const r = applyChanges(ctx, trip, t.answer.changes, t.keys, (title, input) =>
      makeBill(ctx, title, { amount: input.amount, currency: input.currency, rate: rateFor(trip, input.currency) ?? undefined, date: input.date, category: input.category, split: { payers: { me: input.amount }, method: 'equal', shares: Object.fromEntries(parties.map((p) => [p, 1])) }, tripId: input.tripId, groupId: input.groupId }).id,
    );
    setTurns((ts) => ts.map((x, k) => (k === i ? { ...x, saved: 'saved' } : x)));
    toast.show({
      message: r.saved ? `Saved ${r.saved} to ${trip.data.destination || 'the trip'}` : 'Nothing to save',
      icon: 'check',
      undo: r.saved
        ? () => {
            r.undo();
            setTurns((ts) => ts.map((x, k) => (k === i ? { ...x, saved: undefined } : x)));
          }
        : undefined,
    });
  };
  const discard = (i: number) => setTurns((ts) => ts.map((x, k) => (k === i ? { ...x, saved: 'discarded' } : x)));
  const close = () => (router.canGoBack() ? router.back() : router.replace(trip ? tripRoutes.overview(trip.id) : tripRoutes.travel));
  const mic = async () => {
    if (!trip) return;
    if (Platform.OS === 'web' || !canHear()) return router.push(tripRoutes.listen(trip.id));
    const v = await hear('Ask about the trip');
    if (v) void send(v);
  };

  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, padding: 20, paddingTop: insets.top + 20 }}>
        <Text style={{ color: C.mid, fontSize: 15, fontFamily: F.med }}>That trip isn’t here any more.</Text>
      </View>
    );
  }
  const place = trip.data.destination || trip.title;
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: 16, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Disc size={36} />
          <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: F.semi }}>Trip copilot</Text>
            <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: F.med }}>{place} · reads the trip, looks things up on the web</Text>
          </View>
          {turns.length && !busy ? (
            <Pressable accessibilityRole="button" accessibilityLabel="New chat" onPress={() => { clearCopilotChat(ctx, trip.id); setTurns([]); }} style={{ height: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: C.white, fontSize: 13, fontFamily: F.semi }}>New chat</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
            <Ico name="x" size={16} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}>
          <ToolPill icon="check" label="Trip data" on />
          <ToolPill icon="globe" label="Web" on onPress={() => toast.show({ message: 'When a question needs current facts (what’s on, hours, closures, trains), the copilot searches the web and lists the pages it used', icon: 'info' })} />
          <ToolPill icon="globe" label="Booking.com" note="not connected" onPress={() => toast.show({ message: 'Booking.com isn’t connected to LifeOS yet', icon: 'info' })} />
          <ToolPill icon="mail" label="Gmail" note="not connected" onPress={() => toast.show({ message: 'Gmail isn’t connected to LifeOS yet', icon: 'info' })} />
          <ToolPill icon="receipt" label="Receipts" onPress={() => router.push(tripRoutes.receipt(trip.id))} />
          <View style={{ width: 14 }} />
        </ScrollView>

        {!turns.length ? (
          <Anim k="jr" delay={80} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Disc />
              <Text style={{ color: C.mid, fontSize: 13, fontFamily: F.bold }}>Trip copilot</Text>
            </View>
            <Text style={{ color: C.white, fontSize: 15, lineHeight: 22, fontFamily: F.reg }}>Ask anything about {place}: what is next, what is still to book, who owes whom, what is on while you are there. I look things up on the web when the trip alone can’t answer. If something should change, I put it in Proposed changes and nothing is saved until you say so.</Text>
          </Anim>
        ) : null}

        {turns.map((t, i) => (
          <View key={i} style={{ gap: 14 }}>
            <View style={{ alignSelf: 'flex-end', maxWidth: '82%', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: C.raised, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderBottomRightRadius: 6, borderBottomLeftRadius: 22 }}>
              <Text style={{ color: C.white, fontSize: 15, lineHeight: 21, fontFamily: F.reg }}>{t.q}</Text>
            </View>
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Disc />
                <Text style={{ color: C.mid, fontSize: 13, fontFamily: F.bold }}>Trip copilot</Text>
              </View>
              {t.state === 'thinking' ? <Thinking /> : null}
              {t.state === 'error' ? <Text style={{ color: '#FF8A7A', fontSize: 15, lineHeight: 22, fontFamily: F.reg }}>{t.error}</Text> : null}
              {t.answer ? <Text style={{ color: C.white, fontSize: 15, lineHeight: 22, fontFamily: F.reg }}>{t.answer.reply}</Text> : null}
              {t.answer && t.sources?.length ? (
                <View style={{ gap: 6 }}>
                  <Text style={{ color: C.low, fontSize: 10, letterSpacing: 1.2, fontFamily: MONO }}>{`FROM THE WEB · ${t.sources.length} ${t.sources.length === 1 ? 'PAGE' : 'PAGES'}`}</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {t.sources.slice(0, 6).map((src) => (
                      <Pressable key={src.url} accessibilityRole="link" accessibilityLabel={`Open ${src.title}`} onPress={() => void Linking.openURL(src.url).catch(() => {})} style={{ maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 999, backgroundColor: C.raised }}>
                        <Ico name="globe" size={12} color={C.mid} />
                        <Text numberOfLines={1} style={{ flexShrink: 1, color: C.white, fontSize: 12, fontFamily: F.semi }}>{host(src.url)}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}
              {t.answer?.needs.includes('booking') ? <Slot icon="globe" title="Booking.com" line="Finds and prices from Booking.com show here once it is connected to LifeOS. Until then I answer from the trip." /> : null}
              {t.answer?.needs.includes('gmail') ? <Slot icon="mail" title="Gmail" line="Mail finds (check-in times, confirmations) show here once your mail is connected to LifeOS." /> : null}
              {t.answer && t.keys && t.answer.changes.length && t.saved !== 'discarded' ? <Proposed ctx={ctx} changes={t.answer.changes} keys={t.keys} saved={t.saved === 'saved'} onSave={() => save(i)} onDiscard={() => discard(i)} /> : null}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20, paddingTop: 6, gap: 12 }}>
        <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}>
          {SUGGEST.map((s) => (
            <Pressable key={s} accessibilityRole="button" disabled={busy} onPress={() => send(s)} style={{ height: 36, paddingHorizontal: 14, borderRadius: 999, backgroundColor: C.raised, justifyContent: 'center', flexShrink: 0, opacity: busy ? 0.5 : 1 }}>
              <Text numberOfLines={1} style={{ color: C.white, fontSize: 13, fontFamily: F.semi }}>{s}</Text>
            </Pressable>
          ))}
          <View style={{ width: 14 }} />
        </ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexGrow: 1, flexShrink: 1, gap: 10, height: 52, paddingHorizontal: 18, backgroundColor: C.tile, borderWidth: 1, borderColor: C.line, borderRadius: 999 }}>
            <Ico name="sparkle" size={18} color={C.low} />
            <TextInput
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => send(text)}
              returnKeyType="send"
              placeholder="Ask about the trip…"
              placeholderTextColor={C.low}
              selectionColor={C.lime}
              accessibilityLabel="Ask about the trip"
              style={[{ flexGrow: 1, flexShrink: 1, minWidth: 0, color: C.white, fontSize: 16, lineHeight: 21, fontFamily: F.med, paddingVertical: 0 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
            />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Speak" onPress={mic} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
            <Ico name="mic" size={21} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={busy || !text.trim()} onPress={() => send(text)} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
            <Ico name="send" size={21} color={C.ink} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Proposed({ ctx, changes, keys, saved, onSave, onDiscard }: { ctx: LifeOSContext; changes: Change[]; keys: Map<string, string>; saved: boolean; onSave: () => void; onDiscard: () => void }) {
  return (
    <View style={{ gap: 10, padding: 14, borderWidth: 1.5, borderColor: saved ? C.line : C.lime, borderRadius: 22 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ico name={saved ? 'check' : 'sparkle'} size={15} color={C.lime} />
        <View style={{ flexGrow: 1, flexShrink: 1, gap: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: C.white, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, fontFamily: F.semi }}>{saved ? 'Saved to the trip' : `Proposed changes · ${changes.length}`}</Text>
          <Text numberOfLines={1} style={{ color: C.mid, fontSize: 13, lineHeight: 17, fontFamily: F.med }}>{saved ? 'Undo is on the note below' : 'Nothing is saved until you confirm'}</Text>
        </View>
      </View>
      {changes.map((c, i) => {
        const l = changeLine(ctx, c, keys);
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 }}>
            <View style={{ width: 14 }}>
              <Text style={{ color: l.sign === '+' ? C.lime : '#FFB547', fontSize: 12, fontFamily: MONO }}>{l.sign}</Text>
            </View>
            <Text numberOfLines={2} style={{ flexGrow: 1, flexShrink: 1, color: C.white, fontSize: 14, fontFamily: F.med }}>{l.text}</Text>
          </View>
        );
      })}
      {saved ? null : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={onSave} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 44, borderRadius: 999, backgroundColor: C.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ico name="check" size={17} color={C.ink} />
            <Text style={{ color: C.ink, fontSize: 15, lineHeight: 20, fontFamily: F.semi }}>Save to the trip</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onDiscard} style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, height: 44, borderRadius: 999, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.white, fontSize: 15, lineHeight: 20, fontFamily: F.semi }}>Discard</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
