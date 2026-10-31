import type { LifeOSContext } from '@core/registry/context';
import { brainSettings, passDue, runPass, type BrainModel, type PassName, type PassResult } from '@core/brain';
import { createClaudeBrain } from '@core/ai/brainModel';
import { getProviderKey } from './keys';
import { syncReminderNotifications } from './notifySync';

/**
 * The brain on the phone (docs/MODEL.md layer 8): Claude reached with the key
 * saved under You › Agent (the same SecureStore entry as the Claude provider),
 * and the morning and evening passes run from the background task and when
 * the app opens. One pass at a time.
 */

export async function brainModel(os: LifeOSContext): Promise<BrainModel | null> {
  const apiKey = await getProviderKey('claude').catch(() => null);
  return apiKey ? createClaudeBrain({ apiKey, model: brainSettings(os).model }) : null;
}

let running: Promise<PassResult> | null = null;

export function runBrainPass(os: LifeOSContext, pass: PassName, why?: string): Promise<PassResult> {
  if (running) return running;
  running = (async () => {
    try {
      const r = await runPass(os, { pass, model: await brainModel(os), why });
      // A nudge waiting for quiet hours to end is part of the notification plan.
      if (r.notified) await syncReminderNotifications(os);
      return r;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** The scheduled pass, if one is due now. */
export async function maybeRunBrain(os: LifeOSContext): Promise<PassResult | null> {
  const due = passDue(os);
  return due ? runBrainPass(os, due, `${due} pass`) : null;
}
