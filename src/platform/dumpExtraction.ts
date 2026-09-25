import type { LifeOSContext } from '@core/registry/context';
import type { DumpSource } from '@core/repo/dumpRepo';
import { extractPending } from '@core/dumps/extract';
import { buildAgentFromSettings } from './agentProvider';

/**
 * Brain-dump extraction on the phone (M4.1): saving a dump never waits for
 * it. Extraction runs right after a save, on every app foreground, from the
 * OS background task, and again a little later after a failure (offline, a
 * rate limit), using the small model chain; the parser handles everyday
 * sentences with no key at all.
 */
let running: Promise<void> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
const RETRY_MS = [60_000, 5 * 60_000, 15 * 60_000];
let failures = 0;

export function saveDump(os: LifeOSContext, body: string, source: DumpSource = 'typed') {
  const d = os.dumps.add({ body, source });
  void runDumpExtraction(os);
  return d;
}

export function runDumpExtraction(os: LifeOSContext): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      if (!os.dumps.pending().length) return;
      const agent = await buildAgentFromSettings(os).catch(() => null);
      const results = await extractPending(os, agent?.small ?? null);
      const failed = results.some((r) => r.status === 'failed');
      failures = failed ? failures + 1 : 0;
      if (retry) clearTimeout(retry);
      retry = failed && failures <= RETRY_MS.length ? setTimeout(() => void runDumpExtraction(os), RETRY_MS[failures - 1]) : null;
    } catch (e) {
      console.warn('[dumps] extraction failed', (e as Error).message);
    } finally {
      running = null;
    }
  })();
  return running;
}
