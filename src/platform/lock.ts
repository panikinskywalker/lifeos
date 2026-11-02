import { Platform } from 'react-native';
import type { LifeOSContext } from '@core/registry/context';

type LocalAuth = typeof import('expo-local-authentication');
let cached: LocalAuth | null | undefined;

/** expo-local-authentication, or null where it can't run (web, or an app build from before it was added). */
function auth(): LocalAuth | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web') return (cached = null);
  try {
    cached = require('expo-local-authentication') as LocalAuth;
  } catch {
    cached = null;
  }
  return cached;
}

export interface LockPrefs {
  on: boolean;
  /** Lock again after this many minutes away (0 = every time you leave). */
  afterMin: number;
}

export function lockPrefs(os: LifeOSContext): LockPrefs {
  return { on: false, afterMin: 1, ...os.settings.get<Partial<LockPrefs>>('lock', {}) };
}

export function setLockPrefs(os: LifeOSContext, patch: Partial<LockPrefs>) {
  os.settings.set('lock', { ...lockPrefs(os), ...patch });
}

/** Can this phone lock the app? "needs-build" when the app itself predates the lock. */
export async function lockAvailability(): Promise<'ok' | 'needs-build' | 'no-lock-set'> {
  const a = auth();
  if (!a) return 'needs-build';
  try {
    const level = await a.getEnrolledLevelAsync();
    return level === a.SecurityLevel.NONE ? 'no-lock-set' : 'ok';
  } catch {
    return 'needs-build';
  }
}

/**
 * Ask for fingerprint / face, falling back to the phone's PIN or pattern.
 * Nothing to check against (no screen lock set, or no way to ask) opens:
 * the lock never locks you out of your own data.
 */
export async function unlock(reason = 'Unlock LifeOS'): Promise<boolean> {
  const a = auth();
  if (!a) return true;
  if ((await lockAvailability()) === 'no-lock-set') return true;
  try {
    const r = await a.authenticateAsync({ promptMessage: reason, disableDeviceFallback: false, cancelLabel: 'Cancel' });
    return r.success;
  } catch {
    return false;
  }
}
