import { Platform } from 'react-native';
import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

/**
 * LifeOS device data (Android development/sideloaded build only). In Expo Go
 * or on the web the native module is missing and everything here reports
 * "not available" instead of throwing.
 */

export interface RawSms { from: string; body: string; at: number }
export interface RawNotification { package: string; title: string; text: string; at: number; key?: string }
export interface UsageDay {
  day: string;
  totalMs: number;
  pickups: number;
  firstUse: number | null;
  lastUse: number | null;
  apps: Array<{ package: string; label: string; ms: number; launches: number }>;
}
export interface HealthDay {
  day: string;
  steps?: number;
  sleepMin?: number;
  sleepStart?: number;
  sleepEnd?: number;
  heartRateAvg?: number;
  restingHr?: number;
  weightKg?: number;
  workouts?: Array<{ id: string; type: number; title: string | null; start: number; minutes: number }>;
}
export interface MailHeaderRaw { uid: number; from: string; fromName: string; subject: string; date: number }
export interface CallEntry { number: string; name: string | null; at: number; seconds: number; type: 'incoming' | 'outgoing' | 'missed' | 'other' }

interface Native {
  readSms(sinceMs: number, limit: number): Promise<RawSms[]>;
  drain(queue: 'sms' | 'notifications'): Array<Record<string, unknown>>;
  setNotificationAllowlist(packages: string[]): void;
  notificationAccess(): boolean;
  openNotificationAccessSettings(): void;
  usageAccess(): boolean;
  openUsageAccessSettings(): void;
  queryUsage(startMs: number, endMs: number): Promise<UsageDay[]>;
  healthStatus(): 'available' | 'needs_update' | 'unavailable';
  healthGranted(): Promise<string[]>;
  requestHealthPermissions(): Promise<string[]>;
  readHealth(startMs: number, endMs: number): Promise<HealthDay[]>;
  openHealthConnect(): void;
  readCallLog(sinceMs: number, limit: number): Promise<CallEntry[]>;
  mailCheck(email: string, password: string): Promise<'ok'>;
  mailHeaders(email: string, password: string, sinceMs: number, afterUid: number, uidValidity: number, max: number): Promise<{ uidValidity: number; total: number; headers: MailHeaderRaw[] }>;
  mailBodies(email: string, password: string, uids: number[]): Promise<Array<{ uid: number; text: string }>>;
  addListener(event: 'onSms' | 'onNotification', fn: (e: Record<string, unknown>) => void): EventSubscription;
}

const native = Platform.OS === 'android' ? requireOptionalNativeModule<Native>('LifeosDevice') : null;

/** False in Expo Go / web: the sources screen then says a development build is needed. */
export const deviceAvailable = !!native;

export const Device = native;
