import type { LifeOSContext } from '@core/registry/context';
import type { DumpSource } from '@core/repo/dumpRepo';
import { filePending } from '@core/filing/dumps';
import { answerQueued } from '@core/ai/questionQueue';
import { pruneIfDue } from '@core/sources/retention';
import { budgetLow, providerLimits } from '@core/ai/limits';
import { providerTokensToday } from '@core/ai/routing';
import { PROVIDER_PRESETS } from '@core/ai/providers';
import { buildAgentFromSettings } from './agentProvider';

/**
 * Brain-dump extraction on the phone (M4.1): saving a dump never waits for
 * it. Filing runs right after a save, on every app foreground, from the
 * OS background task, and again a little later after a failure (offline, a
 * rate limit), using the main model chain; the parser handles everyday
 * sentences with no key at all.
 */
let running: Promise<void> | null = null;
let wake: ReturnType<typeof setTimeout> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000];
let failures = 0;

/** Keep what was said and file it in the background; `subjectId` = said on that record's page. */
export function saveDump(os: LifeOSContext, body: string, source: DumpSource = 'typed', subjectId?: string) {
  const d = os.dumps.add({ body, source, subjectId });
  void runFiling(os);
  return d;
}

/**
 * The filing queue (M4.1c): answers queued questions and files what's due,
 * then sleeps until the earliest waiting item is due (a rate limit lifting, a daily quota
 * resetting). Also runs on every app foreground and from the background task.
 */
export function runFiling(os: LifeOSContext): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      // Once a day, logged: To check auto-approve and dumps cleared (15 days), the 60-day clean-up (MODEL layer 6, R15).
      pruneIfDue(os);
      const dumpsDue = os.dumps.pending().length > 0;
      const questionsDue = os.questions.due().length > 0;
      if (dumpsDue || questionsDue) {
        const agent = await buildAgentFromSettings(os).catch(() => null);
        // Questions first: someone is waiting on those. Then filing (a tool loop: the main chain).
        if (questionsDue) await answerQueued(os, agent?.main, { smart: agent?.smart });
        const first = agent?.active[0]?.kind;
        const low = first ? budgetLow(providerTokensToday(os, first), PROVIDER_PRESETS[first].freeDailyTokens, !!providerLimits(os).get(first)) : false;
        const results = dumpsDue ? await filePending(os, agent?.main ?? null, { newestFirst: low }) : [];
        const failed = results.some((r) => r.status === 'failed');
        failures = failed ? failures + 1 : 0;
        if (retry) clearTimeout(retry);
        retry = failed && failures <= RETRY_MS.length ? setTimeout(() => void runFiling(os), RETRY_MS[failures - 1]) : null;
      }
      scheduleWake(os);
    } catch (e) {
      console.warn('[dumps] extraction failed', (e as Error).message);
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Wake up when the earliest waiting dump is due (capped, so a long wait is re-checked now and then). */
function scheduleWake(os: LifeOSContext) {
  if (wake) clearTimeout(wake);
  wake = null;
  const times = [os.dumps.nextWake(), os.questions.nextWake()].filter((t): t is number => t != null);
  if (!times.length) return;
  const at = Math.min(...times);
  const ms = Math.min(Math.max(at - Date.now(), 1_000) + 500, 30 * 60_000);
  wake = setTimeout(() => void runFiling(os), ms);
}
