import React, { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LifeOSContext } from '@core/registry/context';
import { useLive } from '@ui/hooks';
import type { TripData } from '@modules/travel';
import { Anim, bgImage, MONO } from './kit';
import { C, DotMatrix, tripRoutes } from './shell';
import { Ico } from './search';

/**
 * The copilot by voice (JP-Listen): "Ask about Japan", the listening wave,
 * what you said as it is heard, then the question goes to the copilot. The
 * phone's own speech recogniser (Android's, through an intent, as the centre
 * box does; the browser's on the web) does the hearing; where there is none,
 * the screen says so and you type instead.
 */

interface WebRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
type RecCtor = new () => WebRecognition;
const webRec = (): RecCtor | null => {
  if (Platform.OS !== 'web') return null;
  const W = globalThis as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return W.SpeechRecognition ?? W.webkitSpeechRecognition ?? null;
};

/** Whether this phone or browser can hear (Android's recogniser, or the browser's). */
export const canHear = () => Platform.OS === 'android' || !!webRec();

/** Hear one thing said: what was heard, or null when cancelled or there is no recogniser. */
export async function hear(prompt = 'Ask about the trip'): Promise<string | null> {
  if (Platform.OS === 'android') {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      const res = await IntentLauncher.startActivityAsync('android.speech.action.RECOGNIZE_SPEECH', {
        extra: { 'android.speech.extra.LANGUAGE_MODEL': 'free_form', 'android.speech.extra.PROMPT': prompt, 'android.speech.extra.LANGUAGE': 'en-IN', 'android.speech.extra.MAX_RESULTS': 1 },
      });
      const extra = (res.extra ?? {}) as Record<string, unknown>;
      const results = extra['android.speech.extra.RESULTS'];
      const first = Array.isArray(results) ? results[0] : typeof results === 'string' ? results : null;
      return typeof first === 'string' && first.trim() ? first.trim() : null;
    } catch {
      return null;
    }
  }
  const Rec = webRec();
  if (!Rec) return null;
  return new Promise((resolve) => {
    const r = new Rec();
    r.lang = 'en-IN';
    r.interimResults = false;
    r.continuous = false;
    let done = false;
    const end = (v: string | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    r.onresult = (e) => end(e.results?.[0]?.[0]?.transcript ?? null);
    r.onerror = () => end(null);
    r.onend = () => end(null);
    r.start();
  });
}

/** The listening wave: five dashed lines drifting, as the artboard draws it. */
function Wave({ live }: { live: boolean }) {
  const [off, setOff] = useState(0);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setOff((x) => (x - 2) % 48), 50);
    return () => clearInterval(t);
  }, [live]);
  const lines = [
    { d: 'M -10 93 C 88 65, 158 110, 217 85 S 315 65, 360 83', c: C.lime, w: 2.4, o: 0.95 },
    { d: 'M -10 97 C 88 62, 158 118, 217 86 S 315 62, 360 87', c: '#6CC6FF', w: 2.1, o: 0.83 },
    { d: 'M -10 101 C 88 59, 158 126, 217 88 S 315 59, 360 91', c: '#C9A7F5', w: 1.8, o: 0.71 },
    { d: 'M -10 105 C 88 56, 158 134, 217 90 S 315 56, 360 95', c: '#F4A8CE', w: 1.5, o: 0.59 },
    { d: 'M -10 109 C 88 53, 158 143, 217 92 S 315 53, 360 99', c: C.white, w: 1.2, o: 0.47 },
  ];
  return (
    <Svg width="100%" height={150} viewBox="0 0 350 150" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {lines.map((l, i) => <Path key={i} d={l.d} fill="none" stroke={l.c} strokeWidth={l.w} strokeLinecap="round" opacity={l.o} strokeDasharray="14 10" strokeDashoffset={off - i * 6} />)}
    </Svg>
  );
}

type Phase = 'listening' | 'heard' | 'typing' | 'none';

export function ListenScreen({ params }: { ctx: LifeOSContext; params: Record<string, string> }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const trip = useLive((os) => {
    const x = os.records.get<TripData>(params.trip ?? '');
    return x?.object === 'trip' ? x : null;
  }, [params.trip]);
  const [phase, setPhase] = useState<Phase>(canHear() ? 'listening' : 'none');
  const [heard, setHeard] = useState('');
  const [interim, setInterim] = useState('');
  const [typed, setTyped] = useState('');
  const rec = useRef<WebRecognition | null>(null);
  const close = () => (router.canGoBack() ? router.back() : router.replace(trip ? tripRoutes.overview(trip.id) : tripRoutes.travel));
  const ask = (q: string) => {
    if (!trip || !q.trim()) return;
    router.replace(tripRoutes.copilot(trip.id, q.trim()));
  };

  const start = () => {
    setHeard('');
    setInterim('');
    const Rec = webRec();
    if (Rec) {
      const r = new Rec();
      r.lang = 'en-IN';
      r.interimResults = true;
      r.continuous = false;
      let final = '';
      r.onresult = (e) => {
        let fin = '';
        let mid = '';
        for (let i = 0; i < e.results.length; i++) {
          const res = e.results[i]!;
          if (res.isFinal) fin += res[0]?.transcript ?? '';
          else mid += res[0]?.transcript ?? '';
        }
        final = fin;
        setHeard(fin);
        setInterim(mid);
      };
      r.onerror = () => setPhase('typing');
      r.onend = () => {
        rec.current = null;
        if (/^\s*cancel\.?\s*$/i.test(final)) return close();
        if (final.trim()) {
          setPhase('heard');
          setTimeout(() => ask(final), 600);
        } else setPhase('typing');
      };
      rec.current = r;
      setPhase('listening');
      r.start();
      return;
    }
    if (Platform.OS === 'android') {
      setPhase('listening');
      hear(`Ask about ${trip?.data.destination ?? 'the trip'}`).then((v) => {
        if (v && !/^\s*cancel\.?\s*$/i.test(v)) {
          setHeard(v);
          setPhase('heard');
          setTimeout(() => ask(v), 600);
        } else if (v) close();
        else setPhase('typing');
      });
      return;
    }
    setPhase('none');
  };

  useEffect(() => {
    if (trip && canHear()) start();
    return () => rec.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id]);

  const stop = () => {
    if (rec.current) rec.current.stop();
    else if (phase === 'listening') setPhase('typing');
    else start();
  };

  if (!trip) {
    return (
      <View style={{ flex: 1, backgroundColor: C.ink, padding: 20, paddingTop: insets.top + 20 }}>
        <Text style={{ color: C.mid, fontSize: 15, fontFamily: 'PlusJakartaSans_500Medium' }}>That trip isn’t here any more.</Text>
      </View>
    );
  }
  const place = trip.data.destination || trip.title;
  const said = heard || interim;
  const step = phase === 'heard' ? 2 : 1;
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 20, paddingBottom: insets.bottom + 28, gap: 12 }}>
        <Anim k="jr" delay={50} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ flexGrow: 1, color: C.mid, fontSize: 10, letterSpacing: 1.5, fontVariant: ['tabular-nums'], fontFamily: MONO }}>TRIP COPILOT · {place.toUpperCase()}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center' }}>
            <Ico name="x" size={16} />
          </Pressable>
        </Anim>
        <Anim k="jr" delay={110} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <Text style={{ color: C.white, fontSize: 34, lineHeight: 38, letterSpacing: -1.5, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Ask about {place}</Text>
          <Anim k="jblink" style={{ width: 3, height: 30, backgroundColor: C.lime, borderRadius: 2 }} />
        </Anim>
        <Anim k="jr" delay={170}>
          <View style={[bgImage('radial-gradient(120% 90% at 70% 100%, #1E2A3A 0%, #1A1A1E 60%)'), { height: 150, borderRadius: 26, overflow: 'hidden', backgroundColor: C.tile }]}>
            <Wave live={phase === 'listening'} />
            <View style={{ position: 'absolute', top: 14, left: 16 }}>
              <Text style={{ color: C.white, fontSize: 18, fontFamily: 'PlusJakartaSans_700Bold' }}>{phase === 'listening' ? 'Listening' : phase === 'heard' ? 'Heard you' : phase === 'none' ? 'No voice here' : 'Type it instead'}</Text>
            </View>
          </View>
        </Anim>

        {phase === 'typing' || phase === 'none' ? (
          <Anim k="jr" delay={230} style={{ gap: 10 }}>
            <Text style={{ color: C.mid, fontSize: 15, lineHeight: 21, fontFamily: 'PlusJakartaSans_500Medium' }}>
              {phase === 'none' ? 'This phone or browser has no speech recogniser LifeOS can use. Type your question and the copilot reads the trip the same way.' : 'Didn’t catch that. Type it, or tap the ball to try again.'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                autoFocus
                value={typed}
                onChangeText={setTyped}
                onSubmitEditing={() => ask(typed)}
                returnKeyType="send"
                placeholder="Ask about the trip…"
                placeholderTextColor={C.low}
                selectionColor={C.lime}
                style={[{ flexGrow: 1, flexShrink: 1, height: 52, paddingHorizontal: 18, borderRadius: 999, backgroundColor: C.tile, borderWidth: 1, borderColor: C.line, color: C.white, fontSize: 16, fontFamily: 'PlusJakartaSans_500Medium' }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
              />
              <Pressable accessibilityRole="button" accessibilityLabel="Send" onPress={() => ask(typed)} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' }}>
                <Ico name="send" size={21} color={C.ink} />
              </Pressable>
            </View>
          </Anim>
        ) : (
          <Anim k="jr" delay={230}>
            <Text style={{ color: C.white, fontSize: 24, lineHeight: 31, letterSpacing: -0.4, fontFamily: 'PlusJakartaSans_600SemiBold' }}>
              {heard}
              {said ? null : <Text style={{ color: 'rgba(245,245,247,0.5)' }}>Say what you want to know about the trip…</Text>}
              {interim ? <Text style={{ color: 'rgba(245,245,247,0.5)' }}>{heard ? ' ' : ''}{interim}…</Text> : null}
            </Text>
          </Anim>
        )}

        {phase === 'listening' || phase === 'heard' ? (
          <Anim k="jr" delay={290} style={{ gap: 10 }}>
            <View style={[bgImage('linear-gradient(120deg,#7FD0C8,#F6E27F,#F4A8CE,#C9A7F5)'), { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 10, minHeight: 120, padding: 16, borderRadius: 26, overflow: 'hidden', backgroundColor: '#F6E27F' }]}>
              <View style={{ gap: 5 }}>
                <DotMatrix text={phase === 'heard' ? 'READING' : 'LISTENING'} pitch={3.4} color={C.ink} dim={0.07} />
                <DotMatrix text={phase === 'heard' ? 'THE TRIP' : 'NOW'} pitch={3.4} color={C.ink} dim={0.07} />
              </View>
              <View style={{ alignItems: 'flex-end', justifyContent: 'space-between', alignSelf: 'stretch', gap: 10 }}>
                <Text style={{ color: 'rgba(11,11,13,0.62)', fontSize: 10, letterSpacing: 0.5, fontFamily: MONO }}>STEP {step} OF 2</Text>
                <Anim k="jspin" style={{ width: 40, height: 40 }}>
                  <Svg width={40} height={40} viewBox="0 0 40 40">
                    {Array.from({ length: 12 }, (_, i) => {
                      const a = (i / 12) * Math.PI * 2;
                      return <Path key={i} d={`M ${20 + 16 * Math.cos(a)} ${20 + 16 * Math.sin(a)} m -2.4 0 a 2.4 2.4 0 1 0 4.8 0 a 2.4 2.4 0 1 0 -4.8 0`} fill={C.ink} opacity={0.15 + i * 0.07} />;
                    })}
                  </Svg>
                </Anim>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(215,245,92,0.16)' }}>
                <Ico name="check" size={13} color={C.lime} />
                <Text style={{ color: C.lime, fontSize: 12, lineHeight: 16, fontFamily: 'PlusJakartaSans_600SemiBold' }}>Trip data</Text>
              </View>
              {['Booking.com', 'Gmail'].map((x) => (
                <View key={x} accessible accessibilityLabel={`${x}, not connected`} style={{ height: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: C.raised, justifyContent: 'center' }}>
                  <Text style={{ color: C.mid, fontSize: 12, lineHeight: 16, fontFamily: 'PlusJakartaSans_600SemiBold' }}>{x}</Text>
                </View>
              ))}
            </View>
          </Anim>
        ) : null}

        <Anim k="jr" delay={350} style={{ alignItems: 'center', gap: 10, paddingTop: 6 }}>
          <Pressable accessibilityRole="button" accessibilityLabel={phase === 'listening' ? 'Stop listening' : 'Listen again'} onPress={stop} disabled={phase === 'none'}>
            <Anim k="jbreathe" style={[bgImage('radial-gradient(circle at 35% 30%, #F4FFC8 0%, #D7F55C 30%, #4FA8C0 75%, #1E4A5A 100%)'), { width: 84, height: 84, borderRadius: 42, backgroundColor: C.lime, opacity: phase === 'none' ? 0.35 : 1, boxShadow: '0 0 0 4px rgba(215,245,92,0.12), 0 0 30px rgba(215,245,92,0.45), inset 0 -6px 14px rgba(0,0,0,0.3)' }]}>
              <View style={[bgImage('conic-gradient(from 40deg, transparent, rgba(255,255,255,0.55), transparent 40%, rgba(255,255,255,0.3), transparent 75%)'), { position: 'absolute', top: '18%', right: '18%', bottom: '18%', left: '18%', borderRadius: 999 }]} />
            </Anim>
          </Pressable>
          <Text style={{ color: C.mid, fontSize: 13, fontFamily: 'PlusJakartaSans_600SemiBold', textAlign: 'center' }}>
            {phase === 'listening' ? 'Tap to stop · say “cancel” to throw it away' : phase === 'heard' ? 'Asking the copilot…' : phase === 'none' ? 'Voice needs Android’s recogniser or a browser that hears' : 'Tap to listen again'}
          </Text>
        </Anim>
      </ScrollView>
    </View>
  );
}
