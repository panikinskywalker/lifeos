import { Platform } from 'react-native';

/**
 * Speak instead of type (M3): Android's own speech recogniser through an
 * intent — no extra native module, works in Expo Go and the APK. Resolves to
 * what was heard, or null when cancelled / unavailable. Web: the browser's
 * SpeechRecognition where it exists.
 */
export async function listen(prompt = 'What happened?'): Promise<string | null> {
  if (Platform.OS === 'android') {
    try {
      const IntentLauncher = await import('expo-intent-launcher');
      const res = await IntentLauncher.startActivityAsync('android.speech.action.RECOGNIZE_SPEECH', {
        extra: {
          'android.speech.extra.LANGUAGE_MODEL': 'free_form',
          'android.speech.extra.PROMPT': prompt,
          'android.speech.extra.LANGUAGE': 'en-IN',
          'android.speech.extra.MAX_RESULTS': 1,
        },
      });
      const extra = (res.extra ?? {}) as Record<string, unknown>;
      const results = extra['android.speech.extra.RESULTS'];
      const first = Array.isArray(results) ? results[0] : typeof results === 'string' ? results : null;
      return typeof first === 'string' && first.trim() ? first.trim() : null;
    } catch {
      return null;
    }
  }
  if (Platform.OS === 'web') {
    const W = globalThis as unknown as { SpeechRecognition?: new () => WebRecognition; webkitSpeechRecognition?: new () => WebRecognition };
    const Rec = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Rec) return null;
    return new Promise((resolve) => {
      const r = new Rec();
      r.lang = 'en-IN';
      r.interimResults = false;
      r.onresult = (e) => resolve(e.results?.[0]?.[0]?.transcript ?? null);
      r.onerror = () => resolve(null);
      r.onend = () => resolve(null);
      r.start();
    });
  }
  return null;
}

interface WebRecognition {
  lang: string;
  interimResults: boolean;
  onresult: (e: { results?: Array<Array<{ transcript: string }>> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
}
