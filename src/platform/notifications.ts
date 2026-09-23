import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

type NotificationsModule = typeof import('expo-notifications');
let cached: NotificationsModule | null | undefined;

/**
 * expo-notifications, or null where it can't run: on web, and in Expo Go
 * (Expo Go dropped it in SDK 53 and importing it there throws at load, which
 * took the whole app down). A development or release build gets the real module.
 */
export function notifications(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return (cached = null);
  try {
    cached = require('expo-notifications') as NotificationsModule;
  } catch (e) {
    console.warn('notifications unavailable', e);
    cached = null;
  }
  return cached;
}
