import { create } from 'zustand';
import type { LocaleSettings } from '@core/format';
import { DEFAULT_LOCALE } from '@core/format';

/**
 * App-level settings mirrored from the SQLite `settings` table into a zustand
 * store so React re-renders on change. `hydrate` is called at boot.
 */
export interface AppSettings {
  appearance: 'system' | 'light' | 'dark';
  locale: LocaleSettings;
  homeDashboardId: string | null;
  /** Smart tier (Sonnet): plans, multi-request messages, tool errors. */
  aiModel: string;
  /** Fast tier (Haiku): everyday messages and fact mining. */
  aiFastModel: string;
  /** Route between the two; off = always aiModel. */
  aiRouting: boolean;
  aiEnabled: boolean;
  hapticsEnabled: boolean;
  onboarded: boolean;
  set: <K extends keyof Omit<AppSettings, 'set' | 'hydrate'>>(key: K, value: AppSettings[K]) => void;
  hydrate: (values: Partial<AppSettings>) => void;
}

let persist: ((key: string, value: unknown) => void) | null = null;
export function bindSettingsPersistence(fn: (key: string, value: unknown) => void) {
  persist = fn;
}

export const useSettings = create<AppSettings>((set) => ({
  appearance: 'system',
  locale: DEFAULT_LOCALE,
  homeDashboardId: null,
  aiModel: 'claude-sonnet-5',
  aiFastModel: 'claude-haiku-4-5',
  aiRouting: true,
  aiEnabled: true,
  hapticsEnabled: true,
  onboarded: false,
  set: (key, value) => {
    set({ [key]: value } as Partial<AppSettings>);
    persist?.(key, value);
  },
  hydrate: (values) => set(values),
}));
