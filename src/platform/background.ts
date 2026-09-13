import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import type { LifeOSContext } from '@core/registry/context';

const TASK = 'lifeos-scheduler-tick';
let osRef: LifeOSContext | null = null;

// Task bodies must be defined at module scope.
TaskManager.defineTask(TASK, async () => {
  try {
    if (osRef) await osRef.scheduler.tick();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * The scheduler runs (1) on every app foreground and (2) via the OS
 * background task API roughly every 15+ minutes when the platform allows.
 * Reminders themselves are delivered by local notifications, so they don't
 * depend on this; automations with time triggers do.
 */
export function registerBackgroundTick(os: LifeOSContext) {
  osRef = os;
  if (Platform.OS === 'web') return;
  BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 }).catch((e) => console.warn('background task not available', e?.message));
}
