import type { LifeOSContext } from '../registry/context';
import { UsageCapError } from './routing';

/**
 * Remembered provider limits (M4.1c): when a provider says "try again in 7
 * hours" (Groq's daily tokens), is out of quota, or hit your monthly cap, the
 * app writes down until when — so it stops spending calls on it and the
 * filing queue knows when to wake up. Stored in settings, survives restarts.
 */
export interface ProviderRest {
  until: number;
  reason: string;
}

export interface LimitStore {
  get(provider: string): ProviderRest | undefined;
  set(provider: string, rest: ProviderRest): void;
}

const KEY = 'ai.limits';

export function providerLimits(os: Pick<LifeOSContext, 'settings'>, now: () => number = Date.now): LimitStore & { all(): Record<string, ProviderRest>; earliest(): number | null; clear(provider?: string): void } {
  const read = () => {
    const all = os.settings.get<Record<string, ProviderRest>>(KEY, {});
    const t = now();
    return Object.fromEntries(Object.entries(all).filter(([, r]) => r.until > t));
  };
  return {
    get: (p) => read()[p],
    set: (p, rest) => os.settings.set(KEY, { ...read(), [p]: rest }),
    all: read,
    earliest: () => {
      const u = Object.values(read()).map((r) => r.until);
      return u.length ? Math.min(...u) : null;
    },
    clear: (p) => os.settings.set(KEY, p ? Object.fromEntries(Object.entries(read()).filter(([k]) => k !== p)) : {}),
  };
}

/** Start of next month (monthly caps reset then). */
export function nextMonth(from = new Date()): number {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1).getTime();
}

export type Failure = { kind: 'wait'; until: number; reason: string } | { kind: 'fail'; reason: string };

/**
 * Is this a reason to wait (limits, overload, no connection) or a real
 * failure (the model's output was unusable)? Waiting never counts toward
 * giving up on a dump.
 */
export function classifyFailure(e: unknown, now = Date.now()): Failure {
  const err = e as { name?: string; message?: string; status?: number; retryAfterMs?: number; provider?: string };
  const msg = String(err?.message ?? e);
  const who = err?.provider ?? /^(\w+)[ :]/.exec(msg)?.[1] ?? 'The model';
  const name = who.charAt(0).toUpperCase() + who.slice(1);
  if (e instanceof UsageCapError) return { kind: 'wait', until: nextMonth(new Date(now)), reason: `${name} reached the monthly cap you set` };
  const status = err?.status ?? Number(/\b(4\d\d|5\d\d)\b/.exec(msg)?.[1] ?? NaN);
  const after = err?.retryAfterMs;
  if (status === 429 || /rate.?limit|quota|too many requests|tokens per (day|minute)/i.test(msg)) {
    const daily = /per day|TPD|RPD|daily/i.test(msg);
    return { kind: 'wait', until: now + (after ?? (daily ? 60 * 60_000 : 2 * 60_000)), reason: daily ? `${name}'s free daily limit is used up` : `${name}'s free tier is busy` };
  }
  if (status === 503 || status === 529 || status === 502 || status === 504 || /overloaded|high demand|unavailable/i.test(msg)) return { kind: 'wait', until: now + (after ?? 60_000), reason: `${name} is overloaded right now` };
  if (status === 0 || status === 408 || /network|fetch|timed? ?out|offline|ENOTFOUND|ECONNRE/i.test(msg)) return { kind: 'wait', until: now + 60_000, reason: 'No connection' };
  if (status === 401 || status === 403) return { kind: 'wait', until: now + 6 * 60 * 60_000, reason: `${name} rejected the API key — check You › Agent` };
  return { kind: 'fail', reason: msg.slice(0, 200) };
}
