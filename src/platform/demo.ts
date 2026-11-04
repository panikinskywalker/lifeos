import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * The demo switch (You › Demo, docs/MODEL.md layer 5): on, LifeOS opens a
 * separate database full of sample data, fresh each time it is turned on; off,
 * your own database, never touched by the demo. While it is on nothing is read
 * from the phone, nothing is sent to Turf web or Notion, and no notification
 * is scheduled. The flag lives outside both databases.
 */

const KEY = 'lifeos.demo';
type Flag = 'fresh' | 'on' | null;

function read(): Flag {
  try {
    const v = Platform.OS === 'web' ? globalThis.localStorage?.getItem(KEY) : SecureStore.getItem(KEY);
    return v === 'fresh' || v === 'on' ? v : null;
  } catch {
    return null;
  }
}

function write(flag: Flag) {
  if (Platform.OS === 'web') {
    if (flag) globalThis.localStorage?.setItem(KEY, flag);
    else globalThis.localStorage?.removeItem(KEY);
  } else if (flag) SecureStore.setItem(KEY, flag);
  else void SecureStore.deleteItemAsync(KEY);
}

/** Read once: the database that is open never changes until the app restarts. */
const flag = read();

export const isDemo = () => flag !== null;
/** Just turned on: the sample database starts over, so its dates are today's. */
export const demoIsFresh = () => flag === 'fresh';
export const markDemoOpened = () => write('on');

/** Turn the demo on or off and restart into the other database; `fallback` if the app can't restart itself. */
export function setDemoMode(on: boolean, fallback: () => void) {
  write(on ? 'fresh' : null);
  if (Platform.OS === 'web') return globalThis.location?.reload();
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-updates') as typeof import('expo-updates')).reloadAsync().catch(fallback);
  } catch {
    fallback();
  }
}
