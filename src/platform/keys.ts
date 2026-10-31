import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/* ------------------------------------------------------------------ */
/* API key storage — SecureStore on device, localStorage on web         */
/* ------------------------------------------------------------------ */

const LEGACY_KEY = 'lifeos.anthropic.apiKey';
/** Claude keeps its original key name so keys saved before the provider chain still work. */
const keyName = (provider: string) => (provider === 'claude' ? LEGACY_KEY : `lifeos.ai.key.${provider}`);

/** API key for one provider kind ('groq' | 'gemini' | 'claude' | …) — SecureStore on device, localStorage on web. */
export async function getProviderKey(provider: string): Promise<string | null> {
  const k = keyName(provider);
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(k);
}
export async function setProviderKey(provider: string, key: string | null): Promise<void> {
  const k = keyName(provider);
  if (Platform.OS === 'web') {
    try {
      if (key) globalThis.localStorage?.setItem(k, key);
      else globalThis.localStorage?.removeItem(k);
    } catch {
      /* ignore */
    }
    return;
  }
  if (key) await SecureStore.setItemAsync(k, key);
  else await SecureStore.deleteItemAsync(k);
}
